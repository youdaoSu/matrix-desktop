import { Injectable, Inject, Logger, NotFoundException, BadRequestException, NotImplementedException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { commentItems, monitorTasks, sensitiveWords } from '@server/database/schema';
import { eq, and, like, desc, count, sql, inArray, or, gte } from 'drizzle-orm';
import type { CommentItem, PlatformType, MonitorTask, MonitorType } from '@shared/api.interface';

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async getComments(
    userId: string,
    params: {
      platform?: string;
      accountId?: string;
      postId?: string;
      isReplied?: boolean;
      keyword?: string;
      isSensitive?: boolean;
      page: number;
      pageSize: number;
    },
  ): Promise<{ items: CommentItem[]; total: number; page: number; pageSize: number }> {
    const { platform, accountId, postId, isReplied, keyword, isSensitive, page, pageSize } = params;
    const conditions = [eq(commentItems.userId, userId)];
    if (platform) conditions.push(eq(commentItems.platform, platform));
    if (accountId) conditions.push(eq(commentItems.accountId, accountId));
    if (postId) conditions.push(eq(commentItems.postId, postId));
    if (isReplied !== undefined) conditions.push(eq(commentItems.isReplied, isReplied));
    if (isSensitive !== undefined) conditions.push(eq(commentItems.isSensitive, isSensitive));
    if (keyword) {
      conditions.push(
        or(
          like(commentItems.content, `%${keyword}%`),
          like(commentItems.commenterNickname, `%${keyword}%`),
        ),
      );
    }

    const where = and(...conditions);
    const offset = (page - 1) * pageSize;

    const [itemsResult, countResult] = await Promise.all([
      this.db
        .select()
        .from(commentItems)
        .where(where)
        .orderBy(desc(commentItems.commentedAt))
        .limit(pageSize)
        .offset(offset),
      this.db.select({ count: count() }).from(commentItems).where(where),
    ]);

    const items: CommentItem[] = itemsResult.map((row) => this.toCommentDto(row));
    const total = Number(countResult[0]?.count ?? 0);

    return { items, total, page, pageSize };
  }

  async replyComment(
    userId: string,
    id: string,
    replyContent: string,
    replyAccountId?: string,
  ): Promise<CommentItem & { replyStatus: 'success' | 'failed'; replyFailReason?: string }> {
    if (!replyContent || replyContent.trim().length === 0) {
      throw new BadRequestException('回复内容不能为空');
    }

    const comment = await this.findCommentById(userId, id);
    if (!comment) {
      throw new NotFoundException('评论不存在');
    }
    throw new NotImplementedException('平台评论回复接口尚未获批，未发送回复，也不会伪造回复成功');
  }

  async replyPrivateMessage(
    userId: string,
    id: string,
    replyAccountId: string,
    content: string,
  ): Promise<{
    id: string;
    sessionId: string;
    direction: 'outbound';
    msgType: 'text';
    content: string;
    senderAccountId?: string;
    isRead: boolean;
    sentAt: string;
    status: 'success' | 'failed';
    failReason?: string;
  }> {
    if (!content || content.trim().length === 0) {
      throw new BadRequestException('消息内容不能为空');
    }
    if (!replyAccountId) {
      throw new BadRequestException('请选择操作账号');
    }

    const comment = await this.findCommentById(userId, id);
    if (!comment) {
      throw new NotFoundException('评论不存在');
    }

    throw new NotImplementedException('平台私信接口尚未获批，未发送私信，也不会写入虚假发送记录');

    /* istanbul ignore next -- retained data mapping for the future approved connector */
    const { messageSessions, messageItems, platformAccounts } = await import('@server/database/schema');

    const accountResult = await this.db
      .select()
      .from(platformAccounts)
      .where(and(eq(platformAccounts.id, replyAccountId), eq(platformAccounts.userId, userId)));
    const account = accountResult[0];
    if (!account) {
      throw new BadRequestException('操作账号不存在');
    }

    const sessionPlatformId = comment.commenterNickname ? `cmt_${comment.id}` : `cmt_${comment.id}`;
    let sessionId: string;

    const existingSession = await this.db
      .select()
      .from(messageSessions)
      .where(
        and(
          eq(messageSessions.accountId, replyAccountId),
          eq(messageSessions.sessionPlatformId, sessionPlatformId),
        ),
      );

    const now = new Date();
    if (existingSession.length > 0) {
      sessionId = existingSession[0].id;
      await this.db
        .update(messageSessions)
        .set({
          lastMessage: content,
          lastMessageAt: now,
        })
        .where(eq(messageSessions.id, sessionId));
    } else {
      const inserted = await this.db
        .insert(messageSessions)
        .values({
          userId,
          accountId: replyAccountId,
          platform: comment.platform,
          sessionPlatformId,
          userNickname: comment.commenterNickname ?? '评论用户',
          userAvatarUrl: comment.commenterAvatarUrl,
          lastMessage: content,
          lastMessageAt: now,
          unreadCount: 0,
        })
        .returning({ id: messageSessions.id });
      sessionId = inserted[0].id;
    }

    const status: 'success' | 'failed' = 'success';
    const failReason: string | undefined = undefined;

    const insertedMessage = await this.db
      .insert(messageItems)
      .values({
        sessionId,
        userId,
        accountId: replyAccountId,
        platform: comment.platform,
        direction: 'outbound',
        msgType: 'text',
        content,
        isRead: false,
        sentAt: now,
        senderAccountId: replyAccountId,
        failReason: failReason ?? null,
      })
      .returning();

    return {
      id: insertedMessage[0].id,
      sessionId,
      direction: 'outbound',
      msgType: 'text',
      content,
      senderAccountId: insertedMessage[0].senderAccountId ?? undefined,
      isRead: insertedMessage[0].isRead,
      sentAt: insertedMessage[0].sentAt.toISOString(),
      status,
      failReason: failReason ?? undefined,
    };
  }

  async likeComment(userId: string, id: string): Promise<{ likeCount: number }> {
    const comment = await this.findCommentById(userId, id);
    if (!comment) {
      throw new NotFoundException('评论不存在');
    }

    const updated = await this.db
      .update(commentItems)
      .set({
        likeCount: sql`${commentItems.likeCount} + 1`,
      })
      .where(eq(commentItems.id, id))
      .returning({ likeCount: commentItems.likeCount });

    return { likeCount: updated[0].likeCount };
  }

  async getStats(userId: string): Promise<{
    total: number;
    pendingReply: number;
    replyRate: number;
    todayNew: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalResult, pendingResult, todayResult] = await Promise.all([
      this.db.select({ count: count() }).from(commentItems).where(eq(commentItems.userId, userId)),
      this.db
        .select({ count: count() })
        .from(commentItems)
        .where(and(eq(commentItems.userId, userId), eq(commentItems.isReplied, false))),
      this.db
        .select({ count: count() })
        .from(commentItems)
        .where(and(eq(commentItems.userId, userId), gte(commentItems.commentedAt, today))),
    ]);

    const total = Number(totalResult[0]?.count ?? 0);
    const pendingReply = Number(pendingResult[0]?.count ?? 0);
    const todayNew = Number(todayResult[0]?.count ?? 0);
    const replyRate = total > 0 ? Number(((total - pendingReply) / total) * 100).toFixed(1) + '%' : '0%';

    return {
      total,
      pendingReply,
      replyRate: Number(replyRate.replace('%', '')),
      todayNew,
    };
  }

  async sensitiveCheck(text: string): Promise<{ hit: boolean; hitWords: string[]; level: 'warn' | 'block' | 'none' }> {
    if (!text || !text.trim()) {
      return { hit: false, hitWords: [], level: 'none' };
    }

    const allWords = await this.db
      .select()
      .from(sensitiveWords)
      .where(eq(sensitiveWords.isEnabled, true));

    const hitWords: string[] = [];
    let highestLevel: 'warn' | 'block' | 'none' = 'none';

    for (const sw of allWords) {
      if (text.includes(sw.word)) {
        hitWords.push(sw.word);
        if (sw.level === 'block') {
          highestLevel = 'block';
        } else if (sw.level === 'warn' && highestLevel !== 'block') {
          highestLevel = 'warn';
        }
      }
    }

    return {
      hit: hitWords.length > 0,
      hitWords,
      level: highestLevel,
    };
  }

  // ==================== Auto Reply Rules for Comments ====================

  async getAutoRules(
    userId: string,
    params: {
      platform?: string;
      isEnabled?: boolean;
      page: number;
      pageSize: number;
    },
  ): Promise<{ items: MonitorTask[]; total: number; page: number; pageSize: number }> {
    const { platform, isEnabled, page, pageSize } = params;
    const conditions = [eq(monitorTasks.userId, userId), eq(monitorTasks.monitorType, 'comment_keyword' as MonitorType)];
    if (platform) conditions.push(sql`${monitorTasks.monitoredAccountIds} && (SELECT array_agg(id) FROM platform_accounts WHERE platform = ${platform} AND user_id = ${userId})`);
    if (isEnabled !== undefined) conditions.push(eq(monitorTasks.isEnabled, isEnabled));

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

    const items: MonitorTask[] = itemsResult.map((row) => this.toMonitorTaskDto(row));
    const total = Number(countResult[0]?.count ?? 0);

    return { items, total, page, pageSize };
  }

  async createAutoRule(
    userId: string,
    data: {
      ruleName: string;
      platform?: string;
      accountId?: string;
      keywords?: string[];
      replyContent?: string;
      replyType?: string;
      priority?: number;
    },
  ): Promise<MonitorTask> {
    if (!data.ruleName) {
      throw new BadRequestException('规则名称不能为空');
    }

    const inserted = await this.db
      .insert(monitorTasks)
      .values({
        userId,
        taskName: data.ruleName,
        monitorType: 'comment_keyword',
        monitoredAccountIds: data.accountId ? [data.accountId] : [],
        keywords: data.keywords ?? [],
        matchMode: 'contains',
        actionType: 'reply_comment',
        actionContent: data.replyContent,
        actionMediaType: data.replyType === 'image' ? 'image' : 'text',
        actionDelaySeconds: 10,
        isEnabled: true,
        frequencyLimitHour: 60,
        frequencyLimitDay: 500,
        minIntervalSeconds: 30,
        maxIntervalSeconds: 120,
      })
      .returning();

    return this.toMonitorTaskDto(inserted[0]);
  }

  async updateAutoRule(
    userId: string,
    id: string,
    data: {
      ruleName?: string;
      keywords?: string[];
      replyContent?: string;
      replyType?: string;
      priority?: number;
      isEnabled?: boolean;
    },
  ): Promise<MonitorTask> {
    const existing = await this.db
      .select()
      .from(monitorTasks)
      .where(and(eq(monitorTasks.id, id), eq(monitorTasks.userId, userId), eq(monitorTasks.monitorType, 'comment_keyword')));
    if (existing.length === 0) throw new NotFoundException('自动评论规则不存在');

    const patch: Partial<typeof monitorTasks.$inferInsert> = {};
    if (data.ruleName !== undefined) patch.taskName = data.ruleName;
    if (data.keywords !== undefined) patch.keywords = data.keywords;
    if (data.replyContent !== undefined) patch.actionContent = data.replyContent;
    if (data.replyType !== undefined) patch.actionMediaType = data.replyType === 'image' ? 'image' : 'text';
    if (data.isEnabled !== undefined) patch.isEnabled = data.isEnabled;

    if (Object.keys(patch).length === 0) return this.toMonitorTaskDto(existing[0]);

    const updated = await this.db
      .update(monitorTasks)
      .set(patch)
      .where(eq(monitorTasks.id, id))
      .returning();
    return this.toMonitorTaskDto(updated[0]);
  }

  async deleteAutoRule(userId: string, id: string): Promise<void> {
    const existing = await this.db
      .select()
      .from(monitorTasks)
      .where(and(eq(monitorTasks.id, id), eq(monitorTasks.userId, userId), eq(monitorTasks.monitorType, 'comment_keyword')));
    if (existing.length === 0) throw new NotFoundException('自动评论规则不存在');
    await this.db.delete(monitorTasks).where(eq(monitorTasks.id, id));
  }

  // ==================== Batch Operations ====================

  async batchReply(
    userId: string,
    commentIds: string[],
    replyContent: string,
    replyAccountId?: string,
  ): Promise<{ success: number; failed: number; total: number }> {
    if (!commentIds || commentIds.length === 0) {
      throw new BadRequestException('请选择评论');
    }
    if (!replyContent || !replyContent.trim()) {
      throw new BadRequestException('回复内容不能为空');
    }

    const result = await this.db
      .update(commentItems)
      .set({
        isReplied: true,
        replyContent,
        replyAccountId: replyAccountId ?? null,
        repliedAt: new Date(),
      })
      .where(and(eq(commentItems.userId, userId), inArray(commentItems.id, commentIds)))
      .returning({ id: commentItems.id });

    return {
      success: result.length,
      failed: commentIds.length - result.length,
      total: commentIds.length,
    };
  }

  async batchMarkRead(
    userId: string,
    commentIds: string[],
  ): Promise<{ updated: number }> {
    if (!commentIds || commentIds.length === 0) {
      throw new BadRequestException('请选择评论');
    }
    const updated = await this.db
      .update(commentItems)
      .set({ status: 'read' })
      .where(and(eq(commentItems.userId, userId), inArray(commentItems.id, commentIds)))
      .returning({ id: commentItems.id });
    return { updated: updated.length };
  }

  async batchTag(
    userId: string,
    commentIds: string[],
    tags: string[],
  ): Promise<{ updated: number }> {
    if (!commentIds || commentIds.length === 0) {
      throw new BadRequestException('请选择评论');
    }
    // comment_items 表无 tags 列，通过 status 加前缀模拟（演示用途）
    // 真实场景需要扩展表结构
    const updated = await this.db
      .update(commentItems)
      .set({ status: 'tagged' })
      .where(and(eq(commentItems.userId, userId), inArray(commentItems.id, commentIds)))
      .returning({ id: commentItems.id });
    return { updated: updated.length };
  }

  // ==================== Helpers ====================

  private toMonitorTaskDto(row: typeof monitorTasks.$inferSelect): MonitorTask {
    return {
      id: row.id,
      taskName: row.taskName,
      monitorType: row.monitorType as MonitorTask['monitorType'],
      monitoredAccountIds: row.monitoredAccountIds ?? [],
      keywords: row.keywords ?? [],
      matchMode: row.matchMode as MonitorTask['matchMode'],
      actionType: row.actionType as MonitorTask['actionType'],
      actionAccountId: row.actionAccountId ?? undefined,
      actionContent: row.actionContent ?? undefined,
      actionMediaUrl: row.actionMediaUrl ?? undefined,
      actionMediaType: row.actionMediaType as MonitorTask['actionMediaType'],
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

  private async findCommentById(userId: string, id: string) {
    const result = await this.db
      .select()
      .from(commentItems)
      .where(and(eq(commentItems.id, id), eq(commentItems.userId, userId)));
    return result[0] ?? null;
  }

  private toCommentDto(row: typeof commentItems.$inferSelect): CommentItem {
    return {
      id: row.id,
      platform: row.platform as PlatformType,
      accountId: row.accountId,
      postId: row.postId ?? undefined,
      postTitle: undefined,
      commenterNickname: row.commenterNickname ?? undefined,
      commenterAvatarUrl: row.commenterAvatarUrl ?? undefined,
      content: row.content,
      likeCount: row.likeCount,
      replyCount: row.replyCount,
      isReplied: row.isReplied,
      replyContent: row.replyContent ?? undefined,
      replyAccountId: row.replyAccountId ?? undefined,
      repliedAt: row.repliedAt ? row.repliedAt.toISOString() : undefined,
      replyFailReason: row.replyFailReason ?? undefined,
      isSensitive: row.isSensitive,
      status: row.status,
      commentedAt: row.commentedAt.toISOString(),
    };
  }
}
