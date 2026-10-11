import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, count, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { platformAccounts } from '@server/database/schema';
import { personalTasks } from './personal-tasks.schema';
import type { PersonalTask, PersonalTaskInput, PersonalTaskStatus } from '@shared/personal-tasks';

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const kinds = ['publish', 'comment', 'message', 'review'];
const statuses = ['pending', 'done', 'cancelled'];
@Injectable()
export class PersonalTasksService implements OnModuleInit {
  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  // Additive migration also runs for existing installations; never resets user data.
  async onModuleInit() {
    await this.db.execute(sql`CREATE TABLE IF NOT EXISTS public.personal_tasks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
      account_id uuid REFERENCES public.platform_accounts(id) ON DELETE SET NULL,
      platform varchar(20) NOT NULL, request_id uuid NOT NULL, request_hash varchar(64) NOT NULL,
      kind varchar(20) NOT NULL, title varchar(140) NOT NULL, content text NOT NULL DEFAULT '',
      status varchar(20) NOT NULL DEFAULT 'pending', due_at timestamptz,
      note text NOT NULL DEFAULT '', completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await this.db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_personal_tasks_request_account ON public.personal_tasks(user_id,request_id,account_id)`);
    await this.db.execute(sql`CREATE INDEX IF NOT EXISTS idx_personal_tasks_user_due ON public.personal_tasks(user_id,status,due_at)`);
    // The core SDK switches to its request roles. Unlike first-run seeding,
    // existing installations have no blanket grant covering newly added tables.
    // API authentication and explicit userId ownership checks still gate every operation.
    await this.db.execute(sql`DO $grant$
      DECLARE role_name text;
      BEGIN
        FOREACH role_name IN ARRAY ARRAY['anon_', 'authenticated_', 'service_role_'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.personal_tasks TO %I', role_name);
          END IF;
        END LOOP;
      END
    $grant$`);
  }
  private validId(id: unknown): asserts id is string {
    if (typeof id !== 'string' || !uuidPattern.test(id)) throw new BadRequestException('记录标识不正确');
  }
  private text(value: unknown, max: number, name: string, required = false): string {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new BadRequestException(`${name}不能为空或超出长度限制`);
    return value;
  }
  private date(value: unknown): Date | null {
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new BadRequestException('提醒时间不正确');
    return new Date(value);
  }
  async list(userId: string, query: { page?: string; pageSize?: string; kind?: string; status?: string; dueOnly?: string }) {
    const page = Number(query.page || 1), pageSize = Number(query.pageSize || 20);
    if (!Number.isInteger(page) || page < 1 || page > 1000000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new BadRequestException('分页参数不正确');
    const conditions = [eq(personalTasks.userId, userId)];
    if (query.kind) {
      if (!kinds.includes(query.kind)) throw new BadRequestException('待办类型不正确');
      conditions.push(eq(personalTasks.kind, query.kind));
    }
    if (query.status) {
      if (!statuses.includes(query.status)) throw new BadRequestException('待办状态不正确');
      conditions.push(eq(personalTasks.status, query.status));
    }
    if (query.dueOnly === 'true') conditions.push(eq(personalTasks.status, 'pending'), lte(personalTasks.dueAt, new Date()));
    const where = and(...conditions);
    const [rows, totals] = await Promise.all([
      this.db.select({ task: personalTasks, accountNickname: platformAccounts.nickname }).from(personalTasks)
        .leftJoin(platformAccounts, and(eq(personalTasks.accountId, platformAccounts.id), eq(platformAccounts.userId, userId)))
        .where(where).orderBy(desc(personalTasks.createdAt), desc(personalTasks.id)).limit(pageSize).offset((page - 1) * pageSize),
      this.db.select({ total: count() }).from(personalTasks).where(where),
    ]);
    return { items: rows.map(r => this.dto(r.task, r.accountNickname)), total: Number(totals[0]?.total || 0), page, pageSize };
  }
  async create(userId: string, input: PersonalTaskInput) {
    if (!input || typeof input !== 'object') throw new BadRequestException('待办内容不正确');
    this.validId(input.requestId);
    if (!Array.isArray(input.accountIds) || !input.accountIds.length || input.accountIds.length > 20) throw new BadRequestException('请选择 1 至 20 个自己的账号');
    input.accountIds.forEach(id => this.validId(id));
    if (!kinds.includes(input.kind)) throw new BadRequestException('待办类型不正确');
    const title = this.text(input.title, 140, '标题', true).trim();
    const content = this.text(input.content ?? '', 20000, '文案');
    const dueAt = this.date(input.dueAt);
    const accountIds = [...new Set(input.accountIds)].sort();
    const hash = createHash('sha256').update(JSON.stringify({ accountIds, kind: input.kind, title, content, dueAt })).digest('hex');
    return this.db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${input.requestId}))`);
      const existing = await tx.select().from(personalTasks).where(and(eq(personalTasks.userId, userId), eq(personalTasks.requestId, input.requestId)));
      if (existing.length) {
        if (existing.some(r => r.requestHash !== hash)) throw new ConflictException('这次保存已完成，请刷新后新建待办');
        return existing.map(r => this.dto(r));
      }
      const accounts = await tx.select().from(platformAccounts).where(and(eq(platformAccounts.userId, userId), inArray(platformAccounts.id, accountIds)));
      if (accounts.length !== accountIds.length) throw new BadRequestException('账号不存在或不属于你');
      await tx.insert(personalTasks).values(accounts.map(account => ({ userId, accountId: account.id, platform: account.platform,
        requestId: input.requestId, requestHash: hash, kind: input.kind, title, content, dueAt }))).onConflictDoNothing();
      // Concurrent retries return the same batch rather than duplicate tasks.
      const rows = await tx.select().from(personalTasks).where(and(eq(personalTasks.userId, userId), eq(personalTasks.requestId, input.requestId)));
      if (rows.some(r => r.requestHash !== hash)) throw new ConflictException('重复保存内容不一致，请刷新后重试');
      return rows.map(r => this.dto(r));
    });
  }
  async update(userId: string, id: string, input: { status?: PersonalTaskStatus; title?: string; content?: string; dueAt?: string | null; note?: string }) {
    if (!input || typeof input !== 'object') throw new BadRequestException('待办内容不正确');
    this.validId(id);
    const patch: Partial<typeof personalTasks.$inferInsert> = {};
    if (input.status !== undefined) {
      if (!statuses.includes(input.status)) throw new BadRequestException('待办状态不正确');
      patch.status = input.status;
      patch.completedAt = input.status === 'done' ? new Date() : null;
    }
    if (input.title !== undefined) patch.title = this.text(input.title, 140, '标题', true).trim();
    if (input.content !== undefined) patch.content = this.text(input.content, 20000, '文案');
    if (input.note !== undefined) patch.note = this.text(input.note, 2000, '处理备注');
    if (input.dueAt !== undefined) patch.dueAt = this.date(input.dueAt);
    if (!Object.keys(patch).length) throw new BadRequestException('没有可修改的字段');
    const rows = await this.db.update(personalTasks).set(patch).where(and(eq(personalTasks.id, id), eq(personalTasks.userId, userId))).returning();
    if (!rows.length) throw new NotFoundException('待办不存在');
    return this.dto(rows[0]);
  }
  private dto(row: typeof personalTasks.$inferSelect, nickname?: string | null): PersonalTask {
    return { id: row.id, accountId: row.accountId, accountNickname: nickname || undefined, platform: row.platform as PersonalTask['platform'],
      kind: row.kind as PersonalTask['kind'], title: row.title, content: row.content, status: row.status as PersonalTaskStatus,
      dueAt: row.dueAt?.toISOString() || null, note: row.note, completedAt: row.completedAt?.toISOString() || null, createdAt: row.createdAt.toISOString() };
  }
}
