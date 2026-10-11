import { Injectable, Inject, Logger, NotFoundException, BadRequestException, NotImplementedException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { contentPosts, platformAccounts } from '@server/database/schema';
import { eq, and, like, desc, count, sql, inArray, gte, lt, or } from 'drizzle-orm';
import type { ContentPost, PlatformType } from '@shared/api.interface';

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async getPosts(
    userId: string,
    params: {
      status?: string;
      platform?: string;
      accountId?: string;
      keyword?: string;
      page: number;
      pageSize: number;
    },
  ): Promise<{ items: ContentPost[]; total: number; page: number; pageSize: number }> {
    const { status, platform, accountId, keyword, page, pageSize } = params;
    const conditions = [eq(contentPosts.userId, userId)];
    if (status) conditions.push(eq(contentPosts.status, status));
    if (platform) conditions.push(eq(contentPosts.platform, platform));
    if (accountId) conditions.push(eq(contentPosts.accountId, accountId));
    if (keyword) {
      conditions.push(
        or(
          like(contentPosts.title, `%${keyword}%`),
          like(contentPosts.content, `%${keyword}%`),
        ),
      );
    }

    const where = and(...conditions);
    const offset = (page - 1) * pageSize;

    const [itemsResult, countResult] = await Promise.all([
      this.db
        .select({
          post: contentPosts,
          accountNickname: platformAccounts.nickname,
        })
        .from(contentPosts)
        .leftJoin(platformAccounts, eq(contentPosts.accountId, platformAccounts.id))
        .where(where)
        .orderBy(desc(contentPosts.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db.select({ count: count() }).from(contentPosts).where(where),
    ]);

    const items: ContentPost[] = itemsResult.map((row) => this.toPostDto(row.post, row.accountNickname ?? undefined));
    const total = Number(countResult[0]?.count ?? 0);

    return { items, total, page, pageSize };
  }

  async getPost(userId: string, id: string): Promise<ContentPost> {
    const result = await this.db
      .select({
        post: contentPosts,
        accountNickname: platformAccounts.nickname,
      })
      .from(contentPosts)
      .leftJoin(platformAccounts, eq(contentPosts.accountId, platformAccounts.id))
      .where(and(eq(contentPosts.id, id), eq(contentPosts.userId, userId)));

    if (result.length === 0) {
      throw new NotFoundException('内容不存在');
    }

    return this.toPostDto(result[0].post, result[0].accountNickname ?? undefined);
  }

  async createPost(
    userId: string,
    data: {
      title?: string;
      content?: string;
      coverUrl?: string;
      tags?: string[];
      mediaType: 'text' | 'image' | 'video';
      mediaUrls?: string[];
      accountIds: string[];
      status?: string;
    },
  ): Promise<ContentPost[]> {
    if (!Array.isArray(data.accountIds) || data.accountIds.length === 0 || data.accountIds.length > 100 || data.accountIds.some(id => typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id))) {
      throw new BadRequestException('请选择至少一个账号');
    }
    if (!['text', 'image', 'video'].includes(data.mediaType)) throw new BadRequestException('内容类型不正确');
    if ((data.title !== undefined && (typeof data.title !== 'string' || data.title.length > 500)) ||
        (data.content !== undefined && (typeof data.content !== 'string' || data.content.length > 20000))) throw new BadRequestException('标题或正文过长或格式不正确');

    // Validate accounts belong to user
    const accounts = await this.db
      .select()
      .from(platformAccounts)
      .where(and(eq(platformAccounts.userId, userId), inArray(platformAccounts.id, data.accountIds)));

    if (accounts.length !== new Set(data.accountIds).size) {
      throw new BadRequestException('账号不存在或无权限');
    }

    const status = data.status || 'draft';
    if (status !== 'draft') {
      throw new NotImplementedException('平台发布接口尚未获批，内容只能保存为草稿，不能伪造发布成功');
    }
    const values = accounts.map((acc) => ({
      userId,
      accountId: acc.id,
      platform: acc.platform,
      title: data.title,
      content: data.content,
      coverUrl: data.coverUrl,
      tags: data.tags,
      mediaType: data.mediaType,
      mediaUrls: data.mediaUrls,
      status,
      publishedAt: undefined,
    }));

    const inserted = await this.db.insert(contentPosts).values(values).returning();

    const result: ContentPost[] = [];
    for (const row of inserted) {
      const acc = accounts.find((a) => a.id === row.accountId);
      result.push(this.toPostDto(row, acc?.nickname));
    }

    return result;
  }

  async updatePost(
    userId: string,
    id: string,
    data: {
      title?: string;
      content?: string;
      coverUrl?: string;
      tags?: string[];
      mediaType?: 'text' | 'image' | 'video';
      mediaUrls?: string[];
    },
  ): Promise<ContentPost> {
    const post = await this.findPostById(userId, id);
    if (!post) {
      throw new NotFoundException('内容不存在');
    }

    const patch: Partial<typeof contentPosts.$inferInsert> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.content !== undefined) patch.content = data.content;
    if (data.coverUrl !== undefined) patch.coverUrl = data.coverUrl;
    if (data.tags !== undefined) patch.tags = data.tags;
    if (data.mediaType !== undefined) patch.mediaType = data.mediaType;
    if (data.mediaUrls !== undefined) patch.mediaUrls = data.mediaUrls;

    if (Object.keys(patch).length === 0) {
      return this.toPostDto(post);
    }

    const updated = await this.db
      .update(contentPosts)
      .set(patch)
      .where(eq(contentPosts.id, id))
      .returning();

    return this.toPostDto(updated[0]);
  }

  async deletePost(userId: string, id: string): Promise<void> {
    const post = await this.findPostById(userId, id);
    if (!post) {
      throw new NotFoundException('内容不存在');
    }
    await this.db.delete(contentPosts).where(eq(contentPosts.id, id));
  }

  async publishPost(userId: string, id: string): Promise<ContentPost> {
    const post = await this.findPostById(userId, id);
    if (!post) {
      throw new NotFoundException('内容不存在');
    }

    throw new NotImplementedException('尚未取得对应平台的内容发布权限，未向平台发送，也不会标记为发布成功');
  }

  async schedulePost(userId: string, id: string, scheduledAt: string): Promise<ContentPost> {
    const post = await this.findPostById(userId, id);
    if (!post) {
      throw new NotFoundException('内容不存在');
    }

    const scheduleDate = new Date(scheduledAt);
    if (isNaN(scheduleDate.getTime())) {
      throw new BadRequestException('无效的定时时间');
    }

    throw new NotImplementedException(`平台定时发布执行器尚未接通，未创建 ${scheduleDate.toISOString()} 的发布任务`);
  }

  async cancelSchedule(userId: string, id: string): Promise<ContentPost> {
    const post = await this.findPostById(userId, id);
    if (!post) {
      throw new NotFoundException('内容不存在');
    }

    const updated = await this.db
      .update(contentPosts)
      .set({
        status: 'draft',
        scheduledAt: null,
      })
      .where(eq(contentPosts.id, id))
      .returning();

    return this.toPostDto(updated[0]);
  }

  async getStats(userId: string): Promise<{
    total: number;
    statusStats: { status: string; count: number }[];
    todayPublished: number;
  }> {
    const allPosts = await this.db
      .select({
        status: contentPosts.status,
        publishedAt: contentPosts.publishedAt,
      })
      .from(contentPosts)
      .where(eq(contentPosts.userId, userId));

    const statusMap = new Map<string, number>();
    let todayPublished = 0;
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    for (const post of allPosts) {
      statusMap.set(post.status, (statusMap.get(post.status) ?? 0) + 1);
      if (post.publishedAt && post.publishedAt.toISOString().split('T')[0] === todayStr) {
        todayPublished++;
      }
    }

    const statusStats = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }));

    return {
      total: allPosts.length,
      statusStats,
      todayPublished,
    };
  }

  async getDrafts(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: ContentPost[]; total: number; page: number; pageSize: number }> {
    return this.getPosts(userId, { status: 'draft', page, pageSize });
  }

  async getScheduled(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: ContentPost[]; total: number; page: number; pageSize: number }> {
    return this.getPosts(userId, { status: 'scheduled', page, pageSize });
  }

  async getHistory(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: ContentPost[]; total: number; page: number; pageSize: number }> {
    return this.getPosts(userId, { status: 'published', page, pageSize });
  }

  private async findPostById(userId: string, id: string) {
    const result = await this.db
      .select()
      .from(contentPosts)
      .where(and(eq(contentPosts.id, id), eq(contentPosts.userId, userId)));
    return result[0] ?? null;
  }

  private toPostDto(row: typeof contentPosts.$inferSelect, accountNickname?: string): ContentPost {
    return {
      id: row.id,
      platform: row.platform as PlatformType,
      accountId: row.accountId,
      accountNickname,
      title: row.title ?? undefined,
      content: row.content ?? undefined,
      coverUrl: row.coverUrl ?? undefined,
      tags: row.tags ?? undefined,
      mediaType: row.mediaType as 'text' | 'image' | 'video',
      mediaUrls: row.mediaUrls ?? undefined,
      status: row.status as 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'reviewing',
      scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : undefined,
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : undefined,
      failReason: row.failReason ?? undefined,
      autoFollowUp: row.autoFollowUp ?? false,
      followUpDelaySeconds: row.followUpDelaySeconds ?? 0,
      followUpStatus: (row.followUpStatus ?? 'none') as ContentPost['followUpStatus'],
      playCount: row.playCount,
      likeCount: row.likeCount,
      commentCount: row.commentCount,
      shareCount: row.shareCount,
      collectCount: row.collectCount,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
