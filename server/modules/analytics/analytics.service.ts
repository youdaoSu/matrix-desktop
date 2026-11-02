import { Injectable, Inject, Logger } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import {
  platformAccounts,
  contentPosts,
  messageSessions,
  messageItems,
  commentItems,
  followerRecords,
} from '@server/database/schema';
import { eq, and, or, isNull, desc, count, sql, gte, sum } from 'drizzle-orm';
import type { PlatformType } from '@shared/api.interface';
import { localInteractionEfficiency } from '@shared/interaction-efficiency';
import { observedFollowers, summarizeFollowerCoverage, auditFollowerCoverage, type FollowerCoverage } from '@shared/account-metrics';
import type { AccountDataAudit, AccountDataAuditRow } from '@shared/account-data-audit';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async getOverview(userId: string): Promise<{
    totalFollowers: number;
    totalPosts: number;
    totalEngagement: number;
    totalMessages: number;
    totalComments: number;
    followerCoverage: FollowerCoverage;
  }> {
    const [accountsResult, postsResult, messagesResult, commentsResult, engagementResult] = await Promise.all([
      this.db
        .select({ id:platformAccounts.id,platform:platformAccounts.platform,followersCount:platformAccounts.followersCount,rawData:platformAccounts.rawData })
        .from(platformAccounts)
        .where(eq(platformAccounts.userId, userId)),
      this.db.select({ count: count() }).from(contentPosts).where(eq(contentPosts.userId, userId)),
      this.db.select({ count: count() }).from(messageItems).where(eq(messageItems.userId, userId)),
      this.db.select({ count: count() }).from(commentItems).where(eq(commentItems.userId, userId)),
      this.db.select({
        likes: sql<number>`COALESCE(SUM(${contentPosts.likeCount}), 0)`.as('likes'),
        comments: sql<number>`COALESCE(SUM(${contentPosts.commentCount}), 0)`.as('comments'),
        shares: sql<number>`COALESCE(SUM(${contentPosts.shareCount}), 0)`.as('shares'),
        collects: sql<number>`COALESCE(SUM(${contentPosts.collectCount}), 0)`.as('collects'),
      }).from(contentPosts).where(eq(contentPosts.userId, userId)),
    ]);

    const followerCoverage=summarizeFollowerCoverage(accountsResult);
    const totalFollowers = followerCoverage.total ?? 0;
    const totalPosts = Number(postsResult[0]?.count ?? 0);
    const totalMessages = Number(messagesResult[0]?.count ?? 0);
    const totalComments = Number(commentsResult[0]?.count ?? 0);

    // Engagement = likes + comments + shares + collects
    const totalEngagement =
      Number(engagementResult[0]?.likes ?? 0) +
      Number(engagementResult[0]?.comments ?? 0) +
      Number(engagementResult[0]?.shares ?? 0) +
      Number(engagementResult[0]?.collects ?? 0);

    return {
      totalFollowers,
      totalPosts,
      totalEngagement,
      totalMessages,
      totalComments,
      followerCoverage,
    };
  }

  async getAccountDataAudit(userId:string):Promise<AccountDataAudit> {
    const accounts=await this.db.select({id:platformAccounts.id,platform:platformAccounts.platform,nickname:platformAccounts.nickname,followersCount:platformAccounts.followersCount,rawData:platformAccounts.rawData})
      .from(platformAccounts).where(eq(platformAccounts.userId,userId));
    const now=Date.now(),audit=auditFollowerCoverage(accounts,now);
    const rows:AccountDataAuditRow[]=accounts.map((account,index)=>{
      const raw=account.rawData as {connectorSessionId?:unknown;metricSnapshot?:{followersSource?:unknown};metricStatus?:{at?:unknown;error?:unknown}}|undefined;
      const sample=audit.samples[index],observed=sample.sample,duplicate=sample.duplicateOf;
      const cached=Number.isSafeInteger(account.followersCount)&&account.followersCount>=0?account.followersCount:undefined;
      const source=raw?.metricSnapshot?.followersSource;
      const attemptedAt=typeof raw?.metricStatus?.at==='string'&&Number.isFinite(Date.parse(raw.metricStatus.at))?new Date(raw.metricStatus.at).toISOString():undefined;
      const error=typeof raw?.metricStatus?.error==='string'&&!/[\u0000-\u001f]|cookie|token|authorization|https?:\/\//i.test(raw.metricStatus.error)?raw.metricStatus.error.slice(0,240):undefined;
      return {accountId:account.id,platform:account.platform as PlatformType,nickname:account.nickname||'未命名账号',
        sessionId:typeof raw?.connectorSessionId==='string'&&/^[a-z0-9-]{16,80}$/i.test(raw.connectorSessionId)?raw.connectorSessionId:undefined,
        followers:observed?.value??null,observedAt:observed?.at,cachedValue:observed?undefined:cached,
        source:observed&&(source==='douyin-self-profile'||source==='douyin-creator-profile'||source==='rendered-own-counter')?source:undefined,
        status:duplicate!==undefined?'duplicate':observed?now-Date.parse(observed.at)>86400000?'stale':'current':cached!==undefined?'legacy':'missing',
        included:sample.included,duplicateOf:duplicate===undefined?undefined:accounts[duplicate].id,lastAttemptAt:attemptedAt,error};
    });
    return {coverage:audit.coverage,rows,capturedAt:new Date(now).toISOString()};
  }

  async getFollowerTrend(userId: string, days = 30): Promise<{ date: string; followers: number; newFollowers: number }[]> {
    const safeDays = Math.min(365, Math.max(1, days || 30));
    const records = await this.db
      .select({ followedAt: followerRecords.followedAt, createdAt: followerRecords.createdAt })
      .from(followerRecords)
      .where(eq(followerRecords.userId, userId));
    if (!records.length) return [];
    const daily = new Map<string, number>();
    for (const record of records) {
      const date = (record.followedAt || record.createdAt).toISOString().slice(0, 10);
      daily.set(date, (daily.get(date) || 0) + 1);
    }
    const today = new Date();
    const firstDay = new Date(today);
    firstDay.setUTCDate(firstDay.getUTCDate() - safeDays + 1);
    const firstKey = firstDay.toISOString().slice(0, 10);
    let cumulative = records.filter((record) => (record.followedAt || record.createdAt).toISOString().slice(0, 10) < firstKey).length;
    const result: { date: string; followers: number; newFollowers: number }[] = [];
    for (let i = safeDays - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const newFollowers = daily.get(dateStr) || 0;
      cumulative += newFollowers;
      result.push({ date: dateStr, followers: cumulative, newFollowers });
    }
    return result;
  }

  async getEngagementTrend(userId: string, days = 30): Promise<{
    date: string;
    likes: number;
    comments: number;
    shares: number;
  }[]> {
    const safeDays = Math.min(365, Math.max(1, days || 30));
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - safeDays + 1);
    since.setUTCHours(0, 0, 0, 0);
    const posts = await this.db
      .select({
        likeCount: contentPosts.likeCount,
        commentCount: contentPosts.commentCount,
        shareCount: contentPosts.shareCount,
        publishedAt: contentPosts.publishedAt,
        createdAt: contentPosts.createdAt,
      })
      .from(contentPosts)
      // Match the same timestamp used for bucketing: scheduled/imported posts
      // may have been created before the range but published within it.
      .where(and(eq(contentPosts.userId, userId), or(gte(contentPosts.publishedAt, since), and(isNull(contentPosts.publishedAt), gte(contentPosts.createdAt, since)))));
    if (!posts.length) return [];
    const daily = new Map<string, { likes: number; comments: number; shares: number }>();
    for (const post of posts) {
      const date = (post.publishedAt || post.createdAt).toISOString().slice(0, 10);
      const current = daily.get(date) || { likes: 0, comments: 0, shares: 0 };
      current.likes += post.likeCount;
      current.comments += post.commentCount;
      current.shares += post.shareCount;
      daily.set(date, current);
    }
    const today = new Date();
    const result: { date: string; likes: number; comments: number; shares: number }[] = [];
    for (let i = safeDays - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      result.push({ date: dateStr, ...(daily.get(dateStr) || { likes: 0, comments: 0, shares: 0 }) });
    }
    return result;
  }

  async getAccountComparison(userId: string): Promise<{
    accountId: string;
    nickname?: string;
    platform: PlatformType;
    followers: number | null;
    followersObservedAt?: string;
    posts: number;
    engagement: number;
  }[]> {
    const accounts = await this.db
      .select({id:platformAccounts.id,nickname:platformAccounts.nickname,platform:platformAccounts.platform,followersCount:platformAccounts.followersCount,rawData:platformAccounts.rawData})
      .from(platformAccounts)
      .where(eq(platformAccounts.userId, userId));

    const result: {
      accountId: string;
      nickname?: string;
      platform: PlatformType;
      followers: number | null;
      followersObservedAt?: string;
      posts: number;
      engagement: number;
    }[] = [];

    // One owner-scoped aggregate, not one round trip per bound account.
    const postsResult = accounts.length ? await this.db
        .select({
          accountId:contentPosts.accountId,
          count: count(),
          likes: sql<number>`COALESCE(SUM(${contentPosts.likeCount}), 0)`.as('likes'),
          comments: sql<number>`COALESCE(SUM(${contentPosts.commentCount}), 0)`.as('comments'),
          shares: sql<number>`COALESCE(SUM(${contentPosts.shareCount}), 0)`.as('shares'),
        })
        .from(contentPosts)
        .where(eq(contentPosts.userId,userId))
        .groupBy(contentPosts.accountId) : [];
    const perAccount=new Map(postsResult.map(row=>[row.accountId,row]));
    for (const acc of accounts) {
      const post=perAccount.get(acc.id),sample=observedFollowers(acc);

      const postCount = Number(post?.count ?? 0);
      const engagement =
        Number(post?.likes ?? 0) +
        Number(post?.comments ?? 0) +
        Number(post?.shares ?? 0);

      result.push({
        accountId: acc.id,
        nickname: acc.nickname ?? undefined,
        platform: acc.platform as PlatformType,
        followers: sample?.value ?? null,
        followersObservedAt:sample?.at,
        posts: postCount,
        engagement,
      });
    }

    return result;
  }

  async getContentRanking(userId: string, limit = 20): Promise<{
    id: string;
    title?: string;
    platform: PlatformType;
    accountId: string;
    accountNickname?: string;
    engagement: number;
    likeCount: number;
    commentCount: number;
    shareCount: number;
    publishedAt?: string;
  }[]> {
    const safeLimit=Number.isFinite(limit)?Math.min(100,Math.max(1,Math.trunc(limit))):20;
    const posts = await this.db
      .select({
        id: contentPosts.id,
        title: contentPosts.title,
        platform: contentPosts.platform,
        accountId: contentPosts.accountId,
        accountNickname: platformAccounts.nickname,
        likeCount: contentPosts.likeCount,
        commentCount: contentPosts.commentCount,
        shareCount: contentPosts.shareCount,
        publishedAt: contentPosts.publishedAt,
        engagement: sql<number>`${contentPosts.likeCount} + ${contentPosts.commentCount} + ${contentPosts.shareCount} + ${contentPosts.collectCount}`.as('engagement'),
      })
      .from(contentPosts)
      .leftJoin(platformAccounts, and(eq(contentPosts.accountId, platformAccounts.id),eq(platformAccounts.userId,userId)))
      .where(eq(contentPosts.userId, userId))
      .orderBy(desc(sql`engagement`))
      .limit(safeLimit);

    return posts.map((p) => ({
      id: p.id,
      title: p.title ?? undefined,
      platform: p.platform as PlatformType,
      accountId: p.accountId,
      accountNickname: p.accountNickname ?? undefined,
      engagement: Number(p.engagement),
      likeCount: p.likeCount,
      commentCount: p.commentCount,
      shareCount: p.shareCount,
      publishedAt: p.publishedAt ? p.publishedAt.toISOString() : undefined,
    }));
  }

  async getEfficiency(userId: string): Promise<ReturnType<typeof localInteractionEfficiency>> {
    const [messagesStats, commentsStats] = await Promise.all([
      this.db
        .select({
          total: count(),
          unread: sql<number>`SUM(CASE WHEN ${messageItems.direction} = 'inbound' AND ${messageItems.isRead} = false THEN 1 ELSE 0 END)`.as('unread'),
        })
        .from(messageItems)
        .where(eq(messageItems.userId, userId)),
      this.db
        .select({
          total: count(),
          replied: sql<number>`SUM(CASE WHEN ${commentItems.isReplied} = true THEN 1 ELSE 0 END)`.as('replied'),
        })
        .from(commentItems)
        .where(eq(commentItems.userId, userId)),
    ]);

    const messageTotal = Number(messagesStats[0]?.total ?? 0);
    const messageUnread = Number(messagesStats[0]?.unread ?? 0);
    const commentTotal = Number(commentsStats[0]?.total ?? 0);
    const commentReplied = Number(commentsStats[0]?.replied ?? 0);

    return localInteractionEfficiency({ messageTotal,messageUnread,commentTotal,commentReplied });
  }
}
