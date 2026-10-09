import { Injectable, Inject, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { announcements, notifications } from '@server/database/schema';
import { eq, and, desc, count, inArray } from 'drizzle-orm';
import type { Announcement, Notification, NotificationType } from '@shared/api.interface';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async getPublishedAnnouncements(limit = 20): Promise<Announcement[]> {
    const rows = await this.db
      .select()
      .from(announcements)
      .where(eq(announcements.isPublished, true))
      .orderBy(desc(announcements.sortOrder), desc(announcements.createdAt))
      .limit(Math.min(100, Math.max(1, limit)));
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      summary: row.summary ?? undefined,
      category: row.category as Announcement['category'],
      isPublished: row.isPublished,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async getNotifications(
    userId: string,
    params: {
      type?: string;
      isRead?: boolean;
      page: number;
      pageSize: number;
    },
  ): Promise<{ items: Notification[]; total: number; page: number; pageSize: number }> {
    const { type, isRead, page, pageSize } = params;
    const conditions = [eq(notifications.userId, userId)];
    if (type) conditions.push(eq(notifications.type, type));
    if (isRead !== undefined) conditions.push(eq(notifications.isRead, isRead));

    const where = and(...conditions);
    const offset = (page - 1) * pageSize;

    const [itemsResult, countResult] = await Promise.all([
      this.db
        .select()
        .from(notifications)
        .where(where)
        .orderBy(desc(notifications.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db.select({ count: count() }).from(notifications).where(where),
    ]);

    const items: Notification[] = itemsResult.map((row) => this.toDto(row));
    const total = Number(countResult[0]?.count ?? 0);

    return { items, total, page, pageSize };
  }

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const result = await this.db
      .select({ count: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return { count: Number(result[0]?.count ?? 0) };
  }

  async markAsRead(userId: string, id: string): Promise<Notification> {
    const notification = await this.findById(userId, id);
    if (!notification) {
      throw new NotFoundException('通知不存在');
    }
    if (notification.userId !== userId) {
      throw new ForbiddenException('无权操作此通知');
    }

    const updated = await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .returning();

    return this.toDto(updated[0]);
  }

  async markAllAsRead(userId: string): Promise<{ updated: number }> {
    const updated = await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
      .returning({ id: notifications.id });
    return { updated: updated.length };
  }

  async deleteNotification(userId: string, id: string): Promise<void> {
    const notification = await this.findById(userId, id);
    if (!notification) {
      throw new NotFoundException('通知不存在');
    }
    if (notification.userId !== userId) {
      throw new ForbiddenException('无权操作此通知');
    }

    await this.db.delete(notifications).where(eq(notifications.id, id));
  }

  async clearRead(userId: string): Promise<{ deleted: number }> {
    const deleted = await this.db
      .delete(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, true)))
      .returning({ id: notifications.id });
    return { deleted: deleted.length };
  }

  async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    content?: string,
    relatedType?: string,
    relatedId?: string,
  ): Promise<Notification> {
    const inserted = await this.db
      .insert(notifications)
      .values({
        userId,
        type,
        title,
        content,
        relatedType,
        relatedId: relatedId ?? null,
      })
      .returning();
    return this.toDto(inserted[0]);
  }

  private async findById(userId: string, id: string) {
    const result = await this.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
    return result[0] ?? null;
  }

  private toDto(row: typeof notifications.$inferSelect): Notification {
    return {
      id: row.id,
      userId: row.userId,
      type: row.type as NotificationType,
      title: row.title,
      content: row.content ?? undefined,
      isRead: row.isRead,
      relatedType: row.relatedType ?? undefined,
      relatedId: row.relatedId ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
