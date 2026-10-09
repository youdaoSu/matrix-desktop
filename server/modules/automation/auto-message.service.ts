import { Injectable, Inject, Logger, NotFoundException, BadRequestException, ConflictException, NotImplementedException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { autoMessageTasks, autoMessageTaskItems } from '@server/database/schema';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import type {
  AutoMessageTask,
  AutoMessageTaskItem,
  AutoMsgTaskStatus,
  AutoMsgItemStatus,
  SendFailReason,
} from '@shared/api.interface';

@Injectable()
export class AutoMessageService {
  private readonly logger = new Logger(AutoMessageService.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async getTasks(
    userId: string,
    params: {
      status?: string;
      page: number;
      pageSize: number;
    },
  ): Promise<{ items: AutoMessageTask[]; total: number; page: number; pageSize: number }> {
    const { status, page, pageSize } = params;
    const conditions = [eq(autoMessageTasks.userId, userId)];
    if (status) conditions.push(eq(autoMessageTasks.status, status));

    const where = and(...conditions);
    const offset = (page - 1) * pageSize;

    const [itemsResult, countResult] = await Promise.all([
      this.db
        .select()
        .from(autoMessageTasks)
        .where(where)
        .orderBy(desc(autoMessageTasks.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db.select({ count: count() }).from(autoMessageTasks).where(where),
    ]);

    const items: AutoMessageTask[] = itemsResult.map((row) => this.toTaskDto(row));
    const total = Number(countResult[0]?.count ?? 0);

    return { items, total, page, pageSize };
  }

  async getTask(userId: string, id: string): Promise<AutoMessageTask> {
    const task = await this.findTaskById(userId, id);
    if (!task) throw new NotFoundException('任务不存在');
    return this.toTaskDto(task);
  }

  async getTaskItems(
    userId: string,
    taskId: string,
    params: {
      status?: string;
      page: number;
      pageSize: number;
    },
  ): Promise<{ items: AutoMessageTaskItem[]; total: number; page: number; pageSize: number }> {
    const task = await this.findTaskById(userId, taskId);
    if (!task) throw new NotFoundException('任务不存在');

    const { status, page, pageSize } = params;
    const conditions = [eq(autoMessageTaskItems.taskId, taskId)];
    if (status) conditions.push(eq(autoMessageTaskItems.status, status));

    const where = and(...conditions);
    const offset = (page - 1) * pageSize;

    const [itemsResult, countResult] = await Promise.all([
      this.db
        .select()
        .from(autoMessageTaskItems)
        .where(where)
        .orderBy(desc(autoMessageTaskItems.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db.select({ count: count() }).from(autoMessageTaskItems).where(where),
    ]);

    const items: AutoMessageTaskItem[] = itemsResult.map((row) => this.toItemDto(row));
    const total = Number(countResult[0]?.count ?? 0);

    return { items, total, page, pageSize };
  }

  async createTask(
    userId: string,
    dto: {
      taskName: string;
      senderAccountId: string;
      msgType: 'text' | 'image' | 'link' | 'article';
      content?: string;
      mediaUrl?: string;
      linkTitle?: string;
      linkUrl?: string;
      frequencyLimitHour?: number;
      frequencyLimitDay?: number;
      minIntervalSeconds?: number;
      maxIntervalSeconds?: number;
    },
  ): Promise<AutoMessageTask> {
    if (!dto.taskName?.trim()) throw new BadRequestException('任务名称不能为空');
    if (!dto.senderAccountId) throw new BadRequestException('请选择发送账号');

    const inserted = await this.db
      .insert(autoMessageTasks)
      .values({
        userId,
        taskName: dto.taskName,
        senderAccountId: dto.senderAccountId,
        msgType: dto.msgType ?? 'text',
        content: dto.content,
        mediaUrl: dto.mediaUrl,
        linkTitle: dto.linkTitle,
        linkUrl: dto.linkUrl,
        frequencyLimitHour: dto.frequencyLimitHour ?? 30,
        frequencyLimitDay: dto.frequencyLimitDay ?? 200,
        minIntervalSeconds: dto.minIntervalSeconds ?? 30,
        maxIntervalSeconds: dto.maxIntervalSeconds ?? 90,
      })
      .returning();

    return this.toTaskDto(inserted[0]);
  }

  async updateTask(
    userId: string,
    id: string,
    dto: {
      taskName?: string;
      senderAccountId?: string;
      msgType?: 'text' | 'image' | 'link' | 'article';
      content?: string;
      mediaUrl?: string;
      linkTitle?: string;
      linkUrl?: string;
      frequencyLimitHour?: number;
      frequencyLimitDay?: number;
      minIntervalSeconds?: number;
      maxIntervalSeconds?: number;
    },
  ): Promise<AutoMessageTask> {
    const task = await this.findTaskById(userId, id);
    if (!task) throw new NotFoundException('任务不存在');
    if (task.status === 'running') {
      throw new ConflictException('运行中的任务无法编辑，请先暂停或停止');
    }

    const patch: Partial<typeof autoMessageTasks.$inferInsert> = {};
    if (dto.taskName !== undefined) patch.taskName = dto.taskName;
    if (dto.senderAccountId !== undefined) patch.senderAccountId = dto.senderAccountId;
    if (dto.msgType !== undefined) patch.msgType = dto.msgType;
    if (dto.content !== undefined) patch.content = dto.content;
    if (dto.mediaUrl !== undefined) patch.mediaUrl = dto.mediaUrl;
    if (dto.linkTitle !== undefined) patch.linkTitle = dto.linkTitle;
    if (dto.linkUrl !== undefined) patch.linkUrl = dto.linkUrl;
    if (dto.frequencyLimitHour !== undefined) patch.frequencyLimitHour = dto.frequencyLimitHour;
    if (dto.frequencyLimitDay !== undefined) patch.frequencyLimitDay = dto.frequencyLimitDay;
    if (dto.minIntervalSeconds !== undefined) patch.minIntervalSeconds = dto.minIntervalSeconds;
    if (dto.maxIntervalSeconds !== undefined) patch.maxIntervalSeconds = dto.maxIntervalSeconds;

    if (Object.keys(patch).length === 0) return this.toTaskDto(task);

    const updated = await this.db
      .update(autoMessageTasks)
      .set(patch)
      .where(eq(autoMessageTasks.id, id))
      .returning();

    return this.toTaskDto(updated[0]);
  }

  async startTask(userId: string, id: string): Promise<AutoMessageTask> {
    const task = await this.findTaskById(userId, id);
    if (!task) throw new NotFoundException('任务不存在');
    if (!['draft', 'paused', 'stopped'].includes(task.status)) {
      throw new ConflictException('当前任务状态不支持启动');
    }

    throw new NotImplementedException('平台主动私信接口尚未获批，任务不会启动或伪造运行状态');

    /* istanbul ignore next -- retained state transition for the future approved connector */
    const now = new Date();
    const updated = await this.db
      .update(autoMessageTasks)
      .set({
        status: 'running',
        startedAt: task.status === 'draft' ? now : task.startedAt,
      })
      .where(eq(autoMessageTasks.id, id))
      .returning();

    return this.toTaskDto(updated[0]);
  }

  async pauseTask(userId: string, id: string): Promise<AutoMessageTask> {
    const task = await this.findTaskById(userId, id);
    if (!task) throw new NotFoundException('任务不存在');
    if (task.status !== 'running') {
      throw new ConflictException('只有运行中的任务才能暂停');
    }

    const updated = await this.db
      .update(autoMessageTasks)
      .set({ status: 'paused' })
      .where(eq(autoMessageTasks.id, id))
      .returning();

    return this.toTaskDto(updated[0]);
  }

  async stopTask(userId: string, id: string): Promise<AutoMessageTask> {
    const task = await this.findTaskById(userId, id);
    if (!task) throw new NotFoundException('任务不存在');
    if (!['running', 'paused'].includes(task.status)) {
      throw new ConflictException('当前任务状态不支持停止');
    }

    const now = new Date();
    const updated = await this.db
      .update(autoMessageTasks)
      .set({ status: 'stopped', completedAt: now })
      .where(eq(autoMessageTasks.id, id))
      .returning();

    return this.toTaskDto(updated[0]);
  }

  async deleteTask(userId: string, id: string): Promise<void> {
    const task = await this.findTaskById(userId, id);
    if (!task) throw new NotFoundException('任务不存在');
    if (task.status === 'running') {
      throw new ConflictException('运行中的任务无法删除，请先停止');
    }
    await this.db.delete(autoMessageTasks).where(eq(autoMessageTasks.id, id));
  }

  async retryFailed(userId: string, id: string): Promise<{ retryCount: number }> {
    const task = await this.findTaskById(userId, id);
    if (!task) throw new NotFoundException('任务不存在');

    const updated = await this.db
      .update(autoMessageTaskItems)
      .set({
        status: 'pending',
        failReason: null,
        sentAt: null,
      })
      .where(
        and(
          eq(autoMessageTaskItems.taskId, id),
          eq(autoMessageTaskItems.status, 'failed'),
        ),
      )
      .returning({ id: autoMessageTaskItems.id });

    const retryCount = updated.length;

    if (retryCount > 0) {
      await this.db
        .update(autoMessageTasks)
        .set({
          failCount: sql`${autoMessageTasks.failCount} - ${retryCount}`,
        })
        .where(eq(autoMessageTasks.id, id));
    }

    return { retryCount };
  }

  private async findTaskById(userId: string, id: string) {
    const result = await this.db
      .select()
      .from(autoMessageTasks)
      .where(and(eq(autoMessageTasks.id, id), eq(autoMessageTasks.userId, userId)));
    return result[0] ?? null;
  }

  private toTaskDto(row: typeof autoMessageTasks.$inferSelect): AutoMessageTask {
    return {
      id: row.id,
      taskName: row.taskName,
      senderAccountId: row.senderAccountId,
      msgType: row.msgType as 'text' | 'image' | 'link' | 'article',
      content: row.content ?? undefined,
      mediaUrl: row.mediaUrl ?? undefined,
      linkTitle: row.linkTitle ?? undefined,
      linkUrl: row.linkUrl ?? undefined,
      totalCount: row.totalCount,
      successCount: row.successCount,
      failCount: row.failCount,
      status: row.status as AutoMsgTaskStatus,
      frequencyLimitHour: row.frequencyLimitHour,
      frequencyLimitDay: row.frequencyLimitDay,
      minIntervalSeconds: row.minIntervalSeconds,
      maxIntervalSeconds: row.maxIntervalSeconds,
      startedAt: row.startedAt ? row.startedAt.toISOString() : undefined,
      completedAt: row.completedAt ? row.completedAt.toISOString() : undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toItemDto(row: typeof autoMessageTaskItems.$inferSelect): AutoMessageTaskItem {
    return {
      id: row.id,
      taskId: row.taskId,
      targetPlatformId: row.targetPlatformId,
      targetNickname: row.targetNickname ?? undefined,
      targetAvatarUrl: row.targetAvatarUrl ?? undefined,
      status: row.status as AutoMsgItemStatus,
      failReason: (row.failReason as SendFailReason) ?? undefined,
      scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : undefined,
      sentAt: row.sentAt ? row.sentAt.toISOString() : undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
