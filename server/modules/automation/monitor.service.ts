import { Injectable, Inject, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { monitorTasks, monitorHitRecords } from '@server/database/schema';
import { eq, and, like, desc, count, sql, gte, lt } from 'drizzle-orm';
import type { MonitorTask, MonitorHitRecord, MonitorType, MonitorActionType } from '@shared/api.interface';

@Injectable()
export class MonitorService {
  private readonly logger = new Logger(MonitorService.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async getMonitorTasks(
    userId: string,
    params: {
      monitorType?: string;
      isEnabled?: boolean;
      keyword?: string;
      page: number;
      pageSize: number;
    },
  ): Promise<{ items: MonitorTask[]; total: number; page: number; pageSize: number }> {
    const { monitorType, isEnabled, keyword, page, pageSize } = params;
    const conditions = [eq(monitorTasks.userId, userId)];
    if (monitorType) conditions.push(eq(monitorTasks.monitorType, monitorType));
    if (isEnabled !== undefined) conditions.push(eq(monitorTasks.isEnabled, isEnabled));
    if (keyword) conditions.push(like(monitorTasks.taskName, `%${keyword}%`));

    const where = and(...conditions);
    const offset = (page - 1) * pageSize;

    const [itemsResult, countResult] = await Promise.all([
      this.db
        .select()
        .from(monitorTasks)
        .where(where)
        .orderBy(desc(monitorTasks.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db.select({ count: count() }).from(monitorTasks).where(where),
    ]);

    const items: MonitorTask[] = itemsResult.map((row) => this.toTaskDto(row));
    const total = Number(countResult[0]?.count ?? 0);

    return { items, total, page, pageSize };
  }

  async getMonitorTask(userId: string, id: string): Promise<MonitorTask> {
    const task = await this.findTaskById(userId, id);
    if (!task) throw new NotFoundException('监控任务不存在');
    return this.toTaskDto(task);
  }

  async createMonitorTask(
    userId: string,
    dto: {
      taskName: string;
      monitorType: MonitorType;
      monitoredAccountIds: string[];
      keywords: string[];
      matchMode: 'exact' | 'contains' | 'fuzzy';
      actionType: MonitorActionType;
      actionAccountId?: string;
      actionContent?: string;
      actionMediaUrl?: string;
      actionMediaType?: 'text' | 'image' | 'link';
      actionDelaySeconds?: number;
      frequencyLimitHour?: number;
      frequencyLimitDay?: number;
      minIntervalSeconds?: number;
      maxIntervalSeconds?: number;
    },
  ): Promise<MonitorTask> {
    if (!dto.taskName?.trim()) throw new BadRequestException('任务名称不能为空');

    const inserted = await this.db
      .insert(monitorTasks)
      .values({
        userId,
        taskName: dto.taskName,
        monitorType: dto.monitorType,
        monitoredAccountIds: dto.monitoredAccountIds ?? [],
        keywords: dto.keywords ?? [],
        matchMode: dto.matchMode ?? 'contains',
        actionType: dto.actionType ?? 'reply_message',
        actionAccountId: dto.actionAccountId,
        actionContent: dto.actionContent,
        actionMediaUrl: dto.actionMediaUrl,
        actionMediaType: dto.actionMediaType,
        actionDelaySeconds: dto.actionDelaySeconds ?? 0,
        frequencyLimitHour: dto.frequencyLimitHour ?? 20,
        frequencyLimitDay: dto.frequencyLimitDay ?? 100,
        minIntervalSeconds: dto.minIntervalSeconds ?? 30,
        maxIntervalSeconds: dto.maxIntervalSeconds ?? 90,
      })
      .returning();

    return this.toTaskDto(inserted[0]);
  }

  async updateMonitorTask(
    userId: string,
    id: string,
    dto: {
      taskName?: string;
      monitorType?: MonitorType;
      monitoredAccountIds?: string[];
      keywords?: string[];
      matchMode?: 'exact' | 'contains' | 'fuzzy';
      actionType?: MonitorActionType;
      actionAccountId?: string;
      actionContent?: string;
      actionMediaUrl?: string;
      actionMediaType?: 'text' | 'image' | 'link';
      actionDelaySeconds?: number;
      frequencyLimitHour?: number;
      frequencyLimitDay?: number;
      minIntervalSeconds?: number;
      maxIntervalSeconds?: number;
    },
  ): Promise<MonitorTask> {
    const task = await this.findTaskById(userId, id);
    if (!task) throw new NotFoundException('监控任务不存在');

    const patch: Partial<typeof monitorTasks.$inferInsert> = {};
    if (dto.taskName !== undefined) patch.taskName = dto.taskName;
    if (dto.monitorType !== undefined) patch.monitorType = dto.monitorType;
    if (dto.monitoredAccountIds !== undefined) patch.monitoredAccountIds = dto.monitoredAccountIds;
    if (dto.keywords !== undefined) patch.keywords = dto.keywords;
    if (dto.matchMode !== undefined) patch.matchMode = dto.matchMode;
    if (dto.actionType !== undefined) patch.actionType = dto.actionType;
    if (dto.actionAccountId !== undefined) patch.actionAccountId = dto.actionAccountId;
    if (dto.actionContent !== undefined) patch.actionContent = dto.actionContent;
    if (dto.actionMediaUrl !== undefined) patch.actionMediaUrl = dto.actionMediaUrl;
    if (dto.actionMediaType !== undefined) patch.actionMediaType = dto.actionMediaType;
    if (dto.actionDelaySeconds !== undefined) patch.actionDelaySeconds = dto.actionDelaySeconds;
    if (dto.frequencyLimitHour !== undefined) patch.frequencyLimitHour = dto.frequencyLimitHour;
    if (dto.frequencyLimitDay !== undefined) patch.frequencyLimitDay = dto.frequencyLimitDay;
    if (dto.minIntervalSeconds !== undefined) patch.minIntervalSeconds = dto.minIntervalSeconds;
    if (dto.maxIntervalSeconds !== undefined) patch.maxIntervalSeconds = dto.maxIntervalSeconds;

    if (Object.keys(patch).length === 0) return this.toTaskDto(task);

    const updated = await this.db
      .update(monitorTasks)
      .set(patch)
      .where(eq(monitorTasks.id, id))
      .returning();

    return this.toTaskDto(updated[0]);
  }

  async deleteMonitorTask(userId: string, id: string): Promise<void> {
    const task = await this.findTaskById(userId, id);
    if (!task) throw new NotFoundException('监控任务不存在');
    await this.db.delete(monitorTasks).where(eq(monitorTasks.id, id));
  }

  async toggleMonitorTask(userId: string, id: string): Promise<MonitorTask> {
    const task = await this.findTaskById(userId, id);
    if (!task) throw new NotFoundException('监控任务不存在');

    const updated = await this.db
      .update(monitorTasks)
      .set({ isEnabled: !task.isEnabled })
      .where(eq(monitorTasks.id, id))
      .returning();

    return this.toTaskDto(updated[0]);
  }

  async getHitRecords(
    userId: string,
    params: {
      taskId?: string;
      actionStatus?: string;
      startTime?: string;
      endTime?: string;
      page: number;
      pageSize: number;
    },
  ): Promise<{ items: MonitorHitRecord[]; total: number; page: number; pageSize: number }> {
    const { taskId, actionStatus, startTime, endTime, page, pageSize } = params;
    const conditions = [eq(monitorHitRecords.userId, userId)];
    if (taskId) conditions.push(eq(monitorHitRecords.taskId, taskId));
    if (actionStatus) conditions.push(eq(monitorHitRecords.actionStatus, actionStatus));
    if (startTime) conditions.push(gte(monitorHitRecords.createdAt, new Date(startTime)));
    if (endTime) conditions.push(lt(monitorHitRecords.createdAt, new Date(endTime)));

    const where = and(...conditions);
    const offset = (page - 1) * pageSize;

    const [itemsResult, countResult] = await Promise.all([
      this.db
        .select()
        .from(monitorHitRecords)
        .where(where)
        .orderBy(desc(monitorHitRecords.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db.select({ count: count() }).from(monitorHitRecords).where(where),
    ]);

    const items: MonitorHitRecord[] = itemsResult.map((row) => this.toHitDto(row));
    const total = Number(countResult[0]?.count ?? 0);

    return { items, total, page, pageSize };
  }

  async createHitRecord(
    userId: string,
    taskId: string,
    dto: {
      monitorType: MonitorType;
      triggeredAccountId: string;
      hitKeyword?: string;
      targetUserPlatformId: string;
      targetUserNickname?: string;
      targetUserAvatarUrl?: string;
      sourceContent?: string;
      actionType: MonitorActionType;
      actionStatus?: 'pending' | 'success' | 'failed';
      actionFailReason?: string;
    },
  ): Promise<MonitorHitRecord> {
    const task = await this.findTaskById(userId, taskId);
    if (!task) throw new NotFoundException('监控任务不存在');

    const inserted = await this.db
      .insert(monitorHitRecords)
      .values({
        userId,
        taskId,
        monitorType: dto.monitorType,
        triggeredAccountId: dto.triggeredAccountId,
        hitKeyword: dto.hitKeyword,
        targetUserPlatformId: dto.targetUserPlatformId,
        targetUserNickname: dto.targetUserNickname,
        targetUserAvatarUrl: dto.targetUserAvatarUrl,
        sourceContent: dto.sourceContent,
        actionType: dto.actionType,
        actionStatus: dto.actionStatus ?? 'pending',
        actionFailReason: dto.actionFailReason,
      })
      .returning();

    await this.db
      .update(monitorTasks)
      .set({ hitCount: sql`${monitorTasks.hitCount} + 1` })
      .where(eq(monitorTasks.id, taskId));

    return this.toHitDto(inserted[0]);
  }

  private async findTaskById(userId: string, id: string) {
    const result = await this.db
      .select()
      .from(monitorTasks)
      .where(and(eq(monitorTasks.id, id), eq(monitorTasks.userId, userId)));
    return result[0] ?? null;
  }

  private toTaskDto(row: typeof monitorTasks.$inferSelect): MonitorTask {
    return {
      id: row.id,
      taskName: row.taskName,
      monitorType: row.monitorType as MonitorType,
      monitoredAccountIds: row.monitoredAccountIds,
      keywords: row.keywords,
      matchMode: row.matchMode as 'exact' | 'contains' | 'fuzzy',
      actionType: row.actionType as MonitorActionType,
      actionAccountId: row.actionAccountId ?? undefined,
      actionContent: row.actionContent ?? undefined,
      actionMediaUrl: row.actionMediaUrl ?? undefined,
      actionMediaType: (row.actionMediaType as 'text' | 'image' | 'link') ?? 'text',
      actionDelaySeconds: row.actionDelaySeconds,
      isEnabled: row.isEnabled,
      hitCount: row.hitCount,
      frequencyLimitHour: row.frequencyLimitHour,
      frequencyLimitDay: row.frequencyLimitDay,
      minIntervalSeconds: row.minIntervalSeconds,
      maxIntervalSeconds: row.maxIntervalSeconds,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toHitDto(row: typeof monitorHitRecords.$inferSelect): MonitorHitRecord {
    return {
      id: row.id,
      taskId: row.taskId,
      monitorType: row.monitorType as MonitorType,
      triggeredAccountId: row.triggeredAccountId,
      hitKeyword: row.hitKeyword ?? undefined,
      targetUserPlatformId: row.targetUserPlatformId,
      targetUserNickname: row.targetUserNickname ?? undefined,
      targetUserAvatarUrl: row.targetUserAvatarUrl ?? undefined,
      sourceContent: row.sourceContent ?? undefined,
      actionType: row.actionType as MonitorActionType,
      actionStatus: row.actionStatus as 'pending' | 'success' | 'failed',
      actionFailReason: row.actionFailReason ?? undefined,
      executedAt: row.executedAt ? row.executedAt.toISOString() : undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
