import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  ConflictException,
  NotImplementedException,
} from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, desc, sql, and } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { appUsers, activationCodes, vipPlans, operationLogs } from '@server/database/schema';
import type { AppUser } from '@shared/api.interface';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ActivateCodeDto } from './dto/activate-code.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { signToken } from './jwt-auth.guard';

function mapUser(row: typeof appUsers.$inferSelect & { vipPlanName?: string }): AppUser {
  return {
    id: row.id,
    username: row.username,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    nickname: row.nickname ?? undefined,
    avatarUrl: row.avatarUrl ?? undefined,
    vipPlanId: row.vipPlanId ?? undefined,
    vipPlanName: row.vipPlanName,
    vipExpiresAt: row.vipExpiresAt ? row.vipExpiresAt.toISOString() : undefined,
    vipStatus: row.vipStatus as AppUser['vipStatus'],
    maxAccounts: row.maxAccounts,
    status: row.status as AppUser['status'],
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async register(dto: RegisterDto): Promise<AppUser> {
    const existing = await this.db
      .select()
      .from(appUsers)
      .where(eq(appUsers.username, dto.username))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException('用户名已存在');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const result = await this.db
      .insert(appUsers)
      .values({
        username: dto.username,
        passwordHash,
        nickname: dto.nickname || dto.username,
        email: dto.email,
        phone: dto.phone,
      })
      .returning();

    const user = result[0];

    await this.db.insert(operationLogs).values({
      operatorType: 'user',
      operatorId: user.id,
      operatorName: user.username,
      action: 'register',
      targetType: 'user',
      targetId: user.id,
      detail: '用户注册',
    });

    return mapUser(user);
  }

  async login(dto: LoginDto, ip?: string): Promise<{ token: string; user: AppUser }> {
    const users = await this.db
      .select()
      .from(appUsers)
      .where(eq(appUsers.username, dto.username))
      .limit(1);

    if (users.length === 0) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const user = users[0];

    if (user.status === 'disabled') {
      throw new UnauthorizedException('账号已被停用');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const now = new Date();
    await this.db
      .update(appUsers)
      .set({ lastLoginAt: now, lastLoginIp: ip })
      .where(eq(appUsers.id, user.id));

    await this.db.insert(operationLogs).values({
      operatorType: 'user',
      operatorId: user.id,
      operatorName: user.username,
      action: 'login',
      targetType: 'user',
      targetId: user.id,
      detail: '用户登录',
      ipAddress: ip,
    });

    const token = signToken({
      userId: user.id,
      role: 'user',
      username: user.username,
    });

    // 查套餐名
    let vipPlanName: string | undefined;
    if (user.vipPlanId) {
      const plans = await this.db
        .select({ name: vipPlans.name })
        .from(vipPlans)
        .where(eq(vipPlans.id, user.vipPlanId))
        .limit(1);
      if (plans.length > 0) vipPlanName = plans[0].name;
    }

    return {
      token,
      user: mapUser({ ...user, vipPlanName }),
    };
  }

  async logout(userId: string): Promise<void> {
    // JWT 是无状态的，这里仅记录操作日志
    await this.db.insert(operationLogs).values({
      operatorType: 'user',
      operatorId: userId,
      action: 'logout',
      targetType: 'user',
      targetId: userId,
      detail: '用户退出登录',
    });
  }

  async activateCode(userId: string, dto: ActivateCodeDto): Promise<AppUser> {
    const users = await this.db
      .select()
      .from(appUsers)
      .where(eq(appUsers.id, userId))
      .limit(1);
    if (users.length === 0) {
      throw new NotFoundException('用户不存在');
    }
    const user = users[0];

    const codeUpper = dto.code.toUpperCase().trim();
    const codes = await this.db
      .select()
      .from(activationCodes)
      .where(eq(activationCodes.code, codeUpper))
      .limit(1);

    if (codes.length === 0) {
      throw new BadRequestException('激活码不存在');
    }

    const code = codes[0];
    if (code.status === 'used') {
      throw new BadRequestException('激活码已被使用');
    }
    if (code.status === 'disabled') {
      throw new BadRequestException('激活码已作废');
    }

    const plans = await this.db
      .select()
      .from(vipPlans)
      .where(eq(vipPlans.id, code.planId))
      .limit(1);
    if (plans.length === 0) {
      throw new BadRequestException('关联套餐不存在');
    }
    const plan = plans[0];

    const now = new Date();
    const currentExpiry = user.vipExpiresAt && user.vipStatus === 'active'
      ? new Date(user.vipExpiresAt.getTime() > now.getTime() ? user.vipExpiresAt : now)
      : now;
    const newExpiry = new Date(currentExpiry.getTime() + code.durationDays * 24 * 60 * 60 * 1000);

    const updated = await this.db.transaction(async (tx) => {
      await tx
        .update(activationCodes)
        .set({
          status: 'used',
          userId: user.id,
          activatedAt: now,
        })
        .where(eq(activationCodes.id, code.id));

      const result = await tx
        .update(appUsers)
        .set({
          vipPlanId: plan.id,
          vipExpiresAt: newExpiry,
          vipStatus: 'active',
          maxAccounts: code.maxAccounts,
        })
        .where(eq(appUsers.id, user.id))
        .returning();
      return result[0];
    });

    await this.db.insert(operationLogs).values({
      operatorType: 'user',
      operatorId: user.id,
      operatorName: user.username,
      action: 'activate_vip',
      targetType: 'activation_code',
      targetId: code.id,
      detail: `激活授权码 ${code.code}，开通${plan.name}套餐${code.durationDays}天`,
    });

    return mapUser({ ...updated, vipPlanName: plan.name });
  }

  async forgotPassword(_dto: ForgotPasswordDto): Promise<void> {
    throw new NotImplementedException('安全邮箱验证码服务尚未配置，请登录后修改密码或联系管理员重置');
  }

  async getMe(userId: string): Promise<AppUser> {
    const result = await this.db
      .select({
        user: appUsers,
        planName: vipPlans.name,
      })
      .from(appUsers)
      .leftJoin(vipPlans, eq(appUsers.vipPlanId, vipPlans.id))
      .where(eq(appUsers.id, userId))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundException('用户不存在');
    }

    const { user, planName } = result[0];
    return mapUser({ ...user, vipPlanName: planName ?? undefined });
  }

  async getLoginLogs(userId: string, page: number, pageSize: number): Promise<{
    items: Array<typeof operationLogs.$inferSelect>;
    total: number;
    page: number;
    pageSize: number;
  }> {
    const offset = (page - 1) * pageSize;

    const whereCondition = and(
      eq(operationLogs.operatorType, 'user'),
      eq(operationLogs.action, 'login'),
      eq(operationLogs.operatorId, userId),
    );

    const [countResult, items] = await Promise.all([
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(operationLogs)
        .where(whereCondition),
      this.db
        .select()
        .from(operationLogs)
        .where(whereCondition)
        .orderBy(desc(operationLogs.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    return {
      items,
      total: Number(countResult[0]?.count ?? 0),
      page,
      pageSize,
    };
  }
}
