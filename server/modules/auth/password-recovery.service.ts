import { BadRequestException, HttpException, Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { appUsers, operationLogs, passwordRecoveryChallenges as challenges } from '@server/database/schema';
import { RecoveryMailer } from './recovery-mailer.service';
import type { CompletePasswordRecoveryDto, RequestPasswordRecoveryDto } from './dto/password-recovery.dto';

const INVALID = '验证码无效、已使用或已过期，请重新获取';
const TTL = 10 * 60 * 1000;
const COOLDOWN = 60;

@Injectable()
export class PasswordRecoveryService implements OnModuleInit {
  private readonly logger = new Logger(PasswordRecoveryService.name);
  private readonly pepper = (() => {
    const configured = process.env.MATRIX_RECOVERY_SECRET || process.env.JWT_SECRET;
    // Never use a weak/missing deployment key as an offline OTP dictionary key.
    return configured && Buffer.byteLength(configured) >= 32 ? configured : randomBytes(32).toString('hex');
  })();
  private readonly deliveries = new Set<Promise<void>>();

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase, private readonly mailer: RecoveryMailer) {}

  async onModuleInit() {
    // Additive migration only. Old users/tokens start at version zero.
    await this.db.execute(sql`ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS auth_version integer NOT NULL DEFAULT 0`);
    await this.db.execute(sql`CREATE TABLE IF NOT EXISTS public.password_recovery_challenges (
      id uuid PRIMARY KEY, user_id uuid, account_key varchar(64) NOT NULL,
      target_key varchar(64) NOT NULL, ip_key varchar(64) NOT NULL,
      code_hash varchar(64) NOT NULL, auth_version integer NOT NULL DEFAULT 0,
      attempts integer NOT NULL DEFAULT 0, send_state varchar(12) NOT NULL DEFAULT 'pending',
      created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at timestamptz(3) NOT NULL, consumed_at timestamptz(3)
    )`);
    await this.db.execute(sql`CREATE INDEX IF NOT EXISTS idx_recovery_account_time ON public.password_recovery_challenges(account_key, created_at)`);
    await this.db.execute(sql`CREATE INDEX IF NOT EXISTS idx_recovery_ip_time ON public.password_recovery_challenges(ip_key, created_at)`);
    await this.db.execute(sql`CREATE INDEX IF NOT EXISTS idx_recovery_expiry ON public.password_recovery_challenges(expires_at)`);
    // The SDK uses per-request roles; existing installations need explicit
    // grants for this newly created table, not a grant on unrelated user data.
    await this.db.execute(sql`DO $grant$
      DECLARE role_name text;
      BEGIN
        FOREACH role_name IN ARRAY ARRAY['anon_', 'authenticated_', 'service_role_'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.password_recovery_challenges TO %I', role_name);
          END IF;
        END LOOP;
      END
    $grant$`);
  }

  private hash(kind: string, value: string) { return createHmac('sha256', this.pepper).update(kind + '\0' + value).digest('hex'); }
  private target(username: string, email: string) { return this.hash('target', JSON.stringify([username, email.toLowerCase().trim()])); }

  async status() {
    const configured = this.mailer.configured();
    const available = configured && await this.mailer.ready();
    return { emailAvailable: Boolean(available), configured, cooldownSeconds: COOLDOWN, expiresInSeconds: TTL / 1000,
      message: !configured ? '尚未配置邮件发送服务，请联系管理员配置 SMTP' : !available ? '邮件服务暂时不可用，请稍后重试或联系管理员' : '验证码只发送到账号原来绑定的邮箱' };
  }

  async request(dto: RequestPasswordRecoveryDto, ip: string) {
    await this.mailer.requireReady();
    const username = dto.username.trim(), email = dto.email.toLowerCase().trim();
    if (!username || /[\r\n]/.test(username + email)) throw new BadRequestException('请输入有效的用户名和已绑定邮箱');
    const accountKey = this.hash('account', username.toLowerCase());
    const targetKey = this.target(username, email), ipKey = this.hash('ip', ip);
    const id = randomUUID(), code = String(randomInt(0, 1000000)).padStart(6, '0');
    let now = new Date();
    const result = await this.db.transaction(async tx => {
      // A stable lock order makes simultaneous resends share the same limits.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${ipKey}), 3101)`);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${accountKey}), 3102)`);
      now = new Date();
      const [count] = await tx.select({ count: sql<number>`count(*)::int`, firstAt: sql<string | null>`min(created_at)` }).from(challenges)
        .where(and(eq(challenges.accountKey, accountKey), gt(challenges.createdAt, new Date(now.getTime() - 3600000))));
      const [ipCount] = await tx.select({ count: sql<number>`count(*)::int`, firstAt: sql<string | null>`min(created_at)` }).from(challenges)
        .where(and(eq(challenges.ipKey, ipKey), gt(challenges.createdAt, new Date(now.getTime() - 3600000))));
      const [recent] = await tx.select({ createdAt: challenges.createdAt }).from(challenges)
        .where(and(eq(challenges.accountKey, accountKey), gt(challenges.createdAt, new Date(now.getTime() - COOLDOWN * 1000)))).limit(1);
      if (recent || count.count >= 5 || ipCount.count >= 10) {
        const until = Math.max(now.getTime() + 1000, recent ? recent.createdAt.getTime() + COOLDOWN * 1000 : 0,
          count.count >= 5 && count.firstAt ? new Date(count.firstAt).getTime() + 3600000 : 0,
          ipCount.count >= 10 && ipCount.firstAt ? new Date(ipCount.firstAt).getTime() + 3600000 : 0);
        return { limited: true as const, retryAfterSeconds: Math.ceil((until - now.getTime()) / 1000) };
      }
      await tx.execute(sql`DELETE FROM public.password_recovery_challenges WHERE id IN
        (SELECT id FROM public.password_recovery_challenges WHERE expires_at < CURRENT_TIMESTAMP - interval '1 day' ORDER BY expires_at LIMIT 200)`);
      const [user] = await tx.select({ id: appUsers.id, email: appUsers.email, status: appUsers.status, version: appUsers.authVersion })
        .from(appUsers).where(eq(appUsers.username, username)).limit(1);
      const matched = user?.status === 'active' && user.email?.toLowerCase().trim() === email;
      await tx.update(challenges).set({ consumedAt: now }).where(and(eq(challenges.targetKey, targetKey), isNull(challenges.consumedAt)));
      await tx.insert(challenges).values({ id, userId: matched ? user.id : null, accountKey, targetKey, ipKey,
        codeHash: this.hash('code', id + ':' + code), authVersion: matched ? user.version : 0,
        sendState: matched ? 'pending' : 'noop', createdAt: now, expiresAt: new Date(now.getTime() + TTL) });
      return { limited: false as const, recipient: matched ? user.email! : undefined };
    });
    if (result.limited) throw new HttpException({ message: '请求过于频繁，账号或当前网络已达到发送上限，请等待倒计时后重试', retryAfterSeconds: result.retryAfterSeconds }, 429);
    if (result.recipient) {
      // Respond independently of account existence or SMTP delivery timing.
      // No test endpoint exposes codes; delivery goes only to the stored email.
      this.track(this.deliver(id, result.recipient, code));
    }
    return { requestId: id, cooldownSeconds: COOLDOWN, expiresInSeconds: TTL / 1000,
      message: '请求已受理。如果用户名与已绑定邮箱匹配，你会收到验证码；只有最近一次申请有效。未收到时请检查垃圾邮件，稍后重试或联系管理员。' };
  }

  private track(work: Promise<void>) {
    const safe = work.catch(() => { this.logger.warn('密码恢复邮件处理未完成，请检查邮件服务；未记录验证码或邮箱'); });
    this.deliveries.add(safe); void safe.finally(() => this.deliveries.delete(safe));
  }

  private async deliver(id: string, recipient: string, code: string) {
    try {
      await this.mailer.sendCode(recipient, code);
      await this.db.update(challenges).set({ sendState: 'sent' }).where(and(eq(challenges.id, id), isNull(challenges.consumedAt)));
    } catch {
      await this.db.update(challenges).set({ sendState: 'failed' }).where(eq(challenges.id, id));
      this.logger.warn('密码恢复邮件发送失败，请检查 SMTP；未记录验证码、邮箱或授权码');
    }
  }

  async complete(dto: CompletePasswordRecoveryDto) {
    if (dto.newPassword !== dto.confirmPassword) throw new BadRequestException('两次输入的新密码不一致');
    if (dto.newPassword.length < 10 || !dto.newPassword.trim() || Buffer.byteLength(dto.newPassword, 'utf8') > 72) throw new BadRequestException('新密码至少10位，UTF-8编码后不能超过72字节');
    const now = new Date();
    const result = await this.db.transaction(async tx => {
      const [candidate] = await tx.select({ accountKey: challenges.accountKey }).from(challenges).where(eq(challenges.id, dto.requestId)).limit(1);
      if (!candidate) return { ok: false as const };
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${candidate.accountKey}), 3102)`);
      const [challenge] = await tx.select().from(challenges).where(eq(challenges.id, dto.requestId)).limit(1).for('update');
      if (!challenge || challenge.consumedAt || challenge.expiresAt.getTime() <= Date.now() || challenge.attempts >= 5) return { ok: false as const };
      const expected = Buffer.from(challenge.codeHash, 'hex'), provided = Buffer.from(this.hash('code', dto.requestId + ':' + dto.code), 'hex');
      if (expected.length !== provided.length || !timingSafeEqual(expected, provided) || challenge.sendState !== 'sent' || !challenge.userId) {
        const attempts = challenge.attempts + 1;
        await tx.update(challenges).set({ attempts, ...(attempts >= 5 ? { consumedAt: now } : {}) }).where(eq(challenges.id, challenge.id));
        return { ok: false as const };
      }
      const [user] = await tx.select().from(appUsers).where(eq(appUsers.id, challenge.userId)).limit(1).for('update');
      if (!user || user.status !== 'active' || !user.email || user.authVersion !== challenge.authVersion || this.target(user.username, user.email) !== challenge.targetKey) return { ok: false as const };
      if (await bcrypt.compare(dto.newPassword, user.passwordHash)) return { ok: false as const, samePassword: true };
      const passwordHash = await bcrypt.hash(dto.newPassword, 12);
      await tx.update(appUsers).set({ passwordHash, authVersion: sql`${appUsers.authVersion} + 1`, updatedAt: now }).where(eq(appUsers.id, user.id));
      await tx.update(challenges).set({ consumedAt: now }).where(and(eq(challenges.userId, user.id), isNull(challenges.consumedAt)));
      await tx.insert(operationLogs).values({ operatorType: 'user', operatorId: user.id, operatorName: user.username,
        action: 'reset_password_email', targetType: 'user', targetId: user.id, detail: '通过邮箱验证码重置远效密码；旧登录失效，业务数据与平台会话不变' });
      return { ok: true as const, email: user.email };
    });
    if (!result.ok) throw new BadRequestException('samePassword' in result && result.samePassword ? '新密码不能与原密码相同' : INVALID);
    this.track(this.mailer.sendChanged(result.email));
    return { reset: true, message: '密码已重置，请使用新密码重新登录。原有绑定、草稿和任务记录不变。' };
  }
}
