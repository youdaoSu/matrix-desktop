import { Injectable, Inject, Logger, NotFoundException, BadRequestException, NotImplementedException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { messageSessions, messageItems, quickReplies } from '@server/database/schema';
import { eq, and, like, desc, count, sql, inArray, or, gte } from 'drizzle-orm';
import type { MessageSession, MessageItem, QuickReply, PlatformType } from '@shared/api.interface';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async getSessions(
    userId: string,
    params: {
      platform?: string;
      accountId?: string;
      unreadOnly?: boolean;
      keyword?: string;
      page: number;
      pageSize: number;
    },
  ): Promise<{ items: MessageSession[]; total: number; page: number; pageSize: number }> {
    const { platform, accountId, unreadOnly, keyword, page, pageSize } = params;
    const conditions = [eq(messageSessions.userId, userId)];
    if (platform) conditions.push(eq(messageSessions.platform, platform));
    if (accountId) conditions.push(eq(messageSessions.accountId, accountId));
    if (unreadOnly) conditions.push(sql`${messageSessions.unreadCount} > 0`);
    if (keyword) {
      conditions.push(
        or(
          like(messageSessions.userNickname, `%${keyword}%`),
          like(messageSessions.lastMessage, `%${keyword}%`),
        ),
      );
    }

    const where = and(...conditions);
    const offset = (page - 1) * pageSize;

    const [itemsResult, countResult] = await Promise.all([
      this.db
        .select()
        .from(messageSessions)
        .where(where)
        .orderBy(desc(messageSessions.isPinned), desc(messageSessions.lastMessageAt))
        .limit(pageSize)
        .offset(offset),
      this.db.select({ count: count() }).from(messageSessions).where(where),
    ]);

    const items: MessageSession[] = itemsResult.map((row) => this.toSessionDto(row));
    const total = Number(countResult[0]?.count ?? 0);

    return { items, total, page, pageSize };
  }

  async getMessages(
    userId: string,
    sessionId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: MessageItem[]; total: number; page: number; pageSize: number }> {
    const session = await this.findSessionById(userId, sessionId);
    if (!session) {
      throw new NotFoundException('会话不存在');
    }

    const where = eq(messageItems.sessionId, sessionId);
    const offset = (page - 1) * pageSize;

    const [itemsResult, countResult] = await Promise.all([
      this.db
        .select()
        .from(messageItems)
        .where(where)
        .orderBy(desc(messageItems.sentAt))
        .limit(pageSize)
        .offset(offset),
      this.db.select({ count: count() }).from(messageItems).where(where),
    ]);

    const items: MessageItem[] = itemsResult.map((row) => this.toMessageDto(row));
    const total = Number(countResult[0]?.count ?? 0);

    return { items, total, page, pageSize };
  }

  async sendMessage(
    userId: string,
    sessionId: string,
    data: {
      content?: string;
      msgType: 'text' | 'image' | 'video';
      mediaUrl?: string;
      sendAccountId?: string;
    },
  ): Promise<MessageItem> {
    const session = await this.findSessionById(userId, sessionId);
    if (!session) {
      throw new NotFoundException('会话不存在');
    }

    throw new NotImplementedException('平台私信发送接口尚未获批，消息未发送，也不会生成虚假发送记录');

    /* istanbul ignore next -- retained data mapping for the future approved connector */
    const now = new Date();
    const inserted = await this.db
      .insert(messageItems)
      .values({
        sessionId,
        userId,
        accountId: data.sendAccountId ?? session.accountId,
        platform: session.platform,
        direction: 'outbound',
        msgType: data.msgType,
        content: data.content,
        mediaUrl: data.mediaUrl,
        isRead: false,
        sentAt: now,
        senderAccountId: data.sendAccountId ?? null,
        failReason: null,
      })
      .returning();

    await this.db
      .update(messageSessions)
      .set({
        lastMessage: data.content || (data.mediaUrl ? '[媒体消息]' : ''),
        lastMessageAt: now,
      })
      .where(eq(messageSessions.id, sessionId));

    return this.toMessageDto(inserted[0]);
  }

  async markAsRead(userId: string, sessionId: string): Promise<void> {
    const session = await this.findSessionById(userId, sessionId);
    if (!session) {
      throw new NotFoundException('会话不存在');
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(messageItems)
        .set({ isRead: true })
        .where(and(eq(messageItems.sessionId, sessionId), eq(messageItems.direction, 'inbound')));

      await tx
        .update(messageSessions)
        .set({ unreadCount: 0 })
        .where(eq(messageSessions.id, sessionId));
    });
  }

  async togglePin(userId: string, sessionId: string): Promise<{ isPinned: boolean }> {
    const session = await this.findSessionById(userId, sessionId);
    if (!session) {
      throw new NotFoundException('会话不存在');
    }

    const newPinned = !session.isPinned;
    await this.db
      .update(messageSessions)
      .set({ isPinned: newPinned })
      .where(eq(messageSessions.id, sessionId));

    return { isPinned: newPinned };
  }

  async getQuickReplies(userId: string): Promise<QuickReply[]> {
    const result = await this.db
      .select()
      .from(quickReplies)
      .where(eq(quickReplies.userId, userId))
      .orderBy(quickReplies.sortOrder, quickReplies.createdAt);

    return result.map((row) => this.toQuickReplyDto(row));
  }

  async createQuickReply(
    userId: string,
    data: {
      category?: string;
      title: string;
      content: string;
      sortOrder?: number;
    },
  ): Promise<QuickReply> {
    if (!data.title || !data.content) {
      throw new BadRequestException('标题和内容不能为空');
    }

    const inserted = await this.db
      .insert(quickReplies)
      .values({
        userId,
        category: data.category || 'default',
        title: data.title,
        content: data.content,
        sortOrder: data.sortOrder ?? 0,
      })
      .returning();

    return this.toQuickReplyDto(inserted[0]);
  }

  async updateQuickReply(
    userId: string,
    id: string,
    data: {
      category?: string;
      title?: string;
      content?: string;
      sortOrder?: number;
    },
  ): Promise<QuickReply> {
    const qr = await this.findQuickReplyById(userId, id);
    if (!qr) {
      throw new NotFoundException('快捷回复不存在');
    }

    const patch: Partial<typeof quickReplies.$inferInsert> = {};
    if (data.category !== undefined) patch.category = data.category;
    if (data.title !== undefined) patch.title = data.title;
    if (data.content !== undefined) patch.content = data.content;
    if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;

    if (Object.keys(patch).length === 0) {
      return this.toQuickReplyDto(qr);
    }

    const updated = await this.db
      .update(quickReplies)
      .set(patch)
      .where(eq(quickReplies.id, id))
      .returning();

    return this.toQuickReplyDto(updated[0]);
  }

  async deleteQuickReply(userId: string, id: string): Promise<void> {
    const qr = await this.findQuickReplyById(userId, id);
    if (!qr) {
      throw new NotFoundException('快捷回复不存在');
    }
    await this.db.delete(quickReplies).where(eq(quickReplies.id, id));
  }

  async getStats(userId: string): Promise<{
    unreadCount: number;
    todayMessages: number;
    sessionCount: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [unreadResult, todayResult, sessionResult] = await Promise.all([
      this.db
        .select({ total: sql<number>`COALESCE(SUM(${messageSessions.unreadCount}), 0)`.as('total') })
        .from(messageSessions)
        .where(eq(messageSessions.userId, userId)),
      this.db
        .select({ count: count() })
        .from(messageItems)
        .where(and(eq(messageItems.userId, userId), gte(messageItems.sentAt, today))),
      this.db.select({ count: count() }).from(messageSessions).where(eq(messageSessions.userId, userId)),
    ]);

    return {
      unreadCount: Number(unreadResult[0]?.total ?? 0),
      todayMessages: Number(todayResult[0]?.count ?? 0),
      sessionCount: Number(sessionResult[0]?.count ?? 0),
    };
  }

  private async findSessionById(userId: string, sessionId: string) {
    const result = await this.db
      .select()
      .from(messageSessions)
      .where(and(eq(messageSessions.id, sessionId), eq(messageSessions.userId, userId)));
    return result[0] ?? null;
  }

  private async findQuickReplyById(userId: string, id: string) {
    const result = await this.db
      .select()
      .from(quickReplies)
      .where(and(eq(quickReplies.id, id), eq(quickReplies.userId, userId)));
    return result[0] ?? null;
  }

  private toSessionDto(row: typeof messageSessions.$inferSelect): MessageSession {
    return {
      id: row.id,
      platform: row.platform as PlatformType,
      accountId: row.accountId,
      sessionPlatformId: row.sessionPlatformId,
      userNickname: row.userNickname ?? undefined,
      userAvatarUrl: row.userAvatarUrl ?? undefined,
      lastMessage: row.lastMessage ?? undefined,
      lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : undefined,
      unreadCount: row.unreadCount,
      isPinned: row.isPinned,
      status: row.status,
    };
  }

  private toMessageDto(row: typeof messageItems.$inferSelect): MessageItem {
    return {
      id: row.id,
      sessionId: row.sessionId,
      direction: row.direction as 'inbound' | 'outbound',
      msgType: row.msgType as 'text' | 'image' | 'video',
      content: row.content ?? undefined,
      mediaUrl: row.mediaUrl ?? undefined,
      senderAccountId: row.senderAccountId ?? undefined,
      isRead: row.isRead,
      sentAt: row.sentAt.toISOString(),
      failReason: (row.failReason as import('@shared/api.interface').SendFailReason) ?? undefined,
    };
  }

  private toQuickReplyDto(row: typeof quickReplies.$inferSelect): QuickReply {
    return {
      id: row.id,
      category: row.category,
      title: row.title,
      content: row.content,
      sortOrder: row.sortOrder,
    };
  }
}
