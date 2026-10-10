import { Injectable, Inject, Logger, BadRequestException, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { platformAccounts, appUsers, accountGroups, followerRecords, contentPosts } from '@server/database/schema';
import { eq, and, like, desc, count, sql, inArray, gte, lt, or } from 'drizzle-orm';
import type { PlatformAccount, PlatformType, AccountGroup, FollowerRecord, PlatformAccountDetail } from '@shared/api.interface';
import * as jwt from 'jsonwebtoken';
import * as CryptoJS from 'crypto-js';

type OAuthState = { userId: string; platform: PlatformType; nonce: string };

interface DouyinTokenResponse {
  data?: {
    access_token?: string;
    refresh_token?: string;
    open_id?: string;
    expires_in?: number;
    scope?: string;
    error_code?: number;
    description?: string;
  };
  message?: string;
}

interface DouyinUserResponse {
  data?: {
    open_id?: string;
    union_id?: string;
    nickname?: string;
    avatar?: string;
    error_code?: number | string;
    description?: string;
  };
  err_no?: number;
  err_msg?: string;
}

@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async getAccounts(
    userId: string,
    params: {
      platform?: string;
      groupName?: string;
      authStatus?: string;
      page: number;
      pageSize: number;
    },
  ): Promise<{ items: PlatformAccount[]; total: number; page: number; pageSize: number }> {
    const { platform, groupName, authStatus, page, pageSize } = params;
    const conditions = [eq(platformAccounts.userId, userId)];
    if (platform) conditions.push(eq(platformAccounts.platform, platform));
    if (groupName) conditions.push(eq(platformAccounts.groupName, groupName));
    if (authStatus) conditions.push(eq(platformAccounts.authStatus, authStatus));

    const where = and(...conditions);
    const offset = (page - 1) * pageSize;

    const [itemsResult, countResult] = await Promise.all([
      this.db
        .select()
        .from(platformAccounts)
        .where(where)
        .orderBy(desc(platformAccounts.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db.select({ count: count() }).from(platformAccounts).where(where),
    ]);

    const items: PlatformAccount[] = itemsResult.map((row) => this.toAccountDto(row));
    const total = Number(countResult[0]?.count ?? 0);

    return { items, total, page, pageSize };
  }

  async addAccount(
    _userId: string,
    _data: { platform: PlatformType; nickname?: string; accountRemark?: string; groupName?: string },
  ): Promise<PlatformAccount> {
    throw new BadRequestException('禁止手工创建平台账号，请通过官方 OAuth 或桌面连接器绑定');
  }
  async updateAccount(
    userId: string,
    id: string,
    data: {
      accountRemark?: string;
      groupName?: string;
    },
  ): Promise<PlatformAccount> {
    const account = await this.findAccountById(userId, id);
    if (!account) {
      throw new NotFoundException('账号不存在');
    }

    const patch: Partial<typeof platformAccounts.$inferInsert> = {};
    if (data.accountRemark !== undefined) patch.accountRemark = data.accountRemark;
    if (data.groupName !== undefined) patch.groupName = data.groupName;

    if (Object.keys(patch).length === 0) {
      return this.toAccountDto(account);
    }

    const updated = await this.db
      .update(platformAccounts)
      .set(patch)
      .where(eq(platformAccounts.id, id))
      .returning();

    return this.toAccountDto(updated[0]);
  }

  async addDesktopAccount(
    userId: string,
    data: {
      platform: PlatformType;
      connectorSessionId: string;
      nickname: string;
      avatarUrl?: string;
      pageUrl?: string;
    },
  ): Promise<PlatformAccount> {
    const validPlatforms: PlatformType[] = ['douyin', 'xiaohongshu', 'wechat', 'bilibili'];
    if (!validPlatforms.includes(data.platform)) throw new BadRequestException('不支持的平台');
    if (!/^[a-z0-9-]{16,80}$/i.test(data.connectorSessionId)) {
      throw new BadRequestException('桌面连接器会话标识无效');
    }
    const nickname = data.nickname.trim().slice(0, 200);
    if (!nickname) throw new BadRequestException('未能从平台页面识别账号名称');
    if (data.avatarUrl && !/^https?:\/\//i.test(data.avatarUrl)) {
      throw new BadRequestException('账号头像地址格式无效');
    }

    const [defaultGroup] = await this.db
      .select()
      .from(accountGroups)
      .where(and(eq(accountGroups.userId, userId), eq(accountGroups.isDefault, true)))
      .limit(1);
    const platformUserId = `desktop:${data.connectorSessionId}`;
    const [existing] = await this.db
      .select()
      .from(platformAccounts)
      .where(and(
        eq(platformAccounts.userId, userId),
        eq(platformAccounts.platform, data.platform),
        eq(platformAccounts.platformUserId, platformUserId),
      ))
      .limit(1);
    const values = {
      nickname,
      avatarUrl: data.avatarUrl,
      authStatus: 'authorized',
      healthStatus: 'normal',
      rawData: {
        provider: 'desktop-connector',
        connectorSessionId: data.connectorSessionId,
        pageUrl: data.pageUrl,
        scope: ['本机创作者中心会话'],
      },
      groupId: existing?.groupId ?? defaultGroup?.id ?? null,
      groupName: existing?.groupName ?? defaultGroup?.groupName ?? '默认分组',
      updatedAt: new Date(),
    };
    if (existing) {
      const [updated] = await this.db
        .update(platformAccounts)
        .set(values)
        .where(eq(platformAccounts.id, existing.id))
        .returning();
      return this.toAccountDto(updated);
    }

    await this.ensureAccountCapacity(userId);
    const [inserted] = await this.db
      .insert(platformAccounts)
      .values({
        ...values,
        userId,
        platform: data.platform,
        platformUserId,
      })
      .returning();
    return this.toAccountDto(inserted);
  }

  async deleteAccount(userId: string, id: string): Promise<void> {
    const account = await this.findAccountById(userId, id);
    if (!account) {
      throw new NotFoundException('账号不存在');
    }

    await this.db.delete(platformAccounts).where(eq(platformAccounts.id, id));
  }

  async reauthorizeAccount(_userId: string, _id: string): Promise<PlatformAccount> {
    throw new BadRequestException('请通过官方 OAuth 或桌面连接器重新授权');
  }
  async getAccountDetail(userId: string, id: string): Promise<PlatformAccountDetail> {
    const account = await this.findAccountById(userId, id);
    if (!account) {
      throw new NotFoundException('账号不存在');
    }

    const [postStats, followerCount] = await Promise.all([
      this.db
        .select({
          totalPlay: sql<number>`COALESCE(SUM(${contentPosts.playCount}), 0)`,
          totalLike: sql<number>`COALESCE(SUM(${contentPosts.likeCount}), 0)`,
          totalComment: sql<number>`COALESCE(SUM(${contentPosts.commentCount}), 0)`,
          totalShare: sql<number>`COALESCE(SUM(${contentPosts.shareCount}), 0)`,
        })
        .from(contentPosts)
        .where(eq(contentPosts.accountId, id)),
      this.db
        .select({ count: count() })
        .from(followerRecords)
        .where(eq(followerRecords.accountId, id)),
    ]);

    const base = this.toAccountDto(account);
    const stats = postStats[0];

    const rawData = account.rawData as { scope?: string[] } | null;
    return {
      ...base,
      groupId: account.groupId ?? undefined,
      remark: account.remark ?? undefined,
      tags: account.tags ?? [],
      authScope: rawData?.scope || [],
      bindTime: account.createdAt.toISOString(),
      lastSyncAt: account.updatedAt.toISOString(),
      totalPlayCount: Number(stats?.totalPlay ?? 0),
      totalLikeCount: Number(stats?.totalLike ?? 0),
      totalCommentCount: Number(stats?.totalComment ?? 0),
      totalShareCount: Number(stats?.totalShare ?? 0),
      avgPlayDuration: 0,
      avgCompletionRate: 0,
      weeklyGrowth: 0,
    };
  }

  async healthCheck(
    userId: string,
    id: string,
  ): Promise<{ status: 'healthy' | 'warning' | 'error'; message: string; checkedAt: string }> {
    const account = await this.findAccountById(userId, id);
    if (!account) {
      throw new NotFoundException('账号不存在');
    }
    const checkedAt = new Date().toISOString();
    if (account.authStatus === 'authorized' && account.healthStatus === 'normal') {
      return { status: 'healthy', message: '账号状态正常', checkedAt };
    }
    if (account.authStatus === 'expired') {
      return { status: 'error', message: '授权已过期，请重新授权', checkedAt };
    }
    return { status: 'warning', message: '账号状态异常', checkedAt };
  }

  async getGroups(userId: string): Promise<string[]> {
    const result = await this.db
      .selectDistinct({ groupName: platformAccounts.groupName })
      .from(platformAccounts)
      .where(and(eq(platformAccounts.userId, userId), sql`${platformAccounts.groupName} IS NOT NULL`))
      .orderBy(platformAccounts.groupName);

    return result.map((row: { groupName: string | null }) => row.groupName).filter((g): g is string => !!g);
  }

  async getAccountGroups(userId: string): Promise<AccountGroup[]> {
    const groups = await this.db
      .select()
      .from(accountGroups)
      .where(eq(accountGroups.userId, userId))
      .orderBy(accountGroups.sortOrder, accountGroups.createdAt);

    const counts = await this.db
      .select({ groupId: platformAccounts.groupId, count: count() })
      .from(platformAccounts)
      .where(eq(platformAccounts.userId, userId))
      .groupBy(platformAccounts.groupId);

    const countMap = new Map<string, number>();
    for (const c of counts) {
      if (c.groupId) countMap.set(c.groupId, Number(c.count));
    }

    return groups.map((g) => ({
      id: g.id,
      userId: g.userId,
      groupName: g.groupName,
      sortOrder: g.sortOrder,
      isDefault: g.isDefault,
      accountCount: countMap.get(g.id) ?? 0,
      createdAt: g.createdAt.toISOString(),
    }));
  }

  async createGroup(userId: string, groupName: string, sortOrder?: number): Promise<AccountGroup> {
    if (!groupName || !groupName.trim()) {
      throw new BadRequestException('分组名称不能为空');
    }
    const existing = await this.db
      .select()
      .from(accountGroups)
      .where(and(eq(accountGroups.userId, userId), eq(accountGroups.groupName, groupName)));
    if (existing.length > 0) {
      throw new ConflictException('分组名称已存在');
    }

    const inserted = await this.db
      .insert(accountGroups)
      .values({ userId, groupName, sortOrder: sortOrder ?? 0 })
      .returning();

    return {
      id: inserted[0].id,
      userId: inserted[0].userId,
      groupName: inserted[0].groupName,
      sortOrder: inserted[0].sortOrder,
      isDefault: inserted[0].isDefault,
      accountCount: 0,
      createdAt: inserted[0].createdAt.toISOString(),
    };
  }

  async updateGroup(
    userId: string,
    id: string,
    data: { groupName?: string; sortOrder?: number },
  ): Promise<AccountGroup> {
    const group = await this.db
      .select()
      .from(accountGroups)
      .where(and(eq(accountGroups.id, id), eq(accountGroups.userId, userId)));
    if (group.length === 0) {
      throw new NotFoundException('分组不存在');
    }
    if (group[0].isDefault && data.groupName !== undefined) {
      throw new BadRequestException('默认分组不能修改名称');
    }

    const patch: Partial<typeof accountGroups.$inferInsert> = {};
    if (data.groupName !== undefined) patch.groupName = data.groupName;
    if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;

    if (Object.keys(patch).length === 0) {
      return this.toGroupDto(group[0], 0);
    }

    const updated = await this.db
      .update(accountGroups)
      .set(patch)
      .where(eq(accountGroups.id, id))
      .returning();

    if (data.groupName !== undefined && data.groupName !== group[0].groupName) {
      await this.db
        .update(platformAccounts)
        .set({ groupName: data.groupName })
        .where(and(eq(platformAccounts.userId, userId), eq(platformAccounts.groupId, id)));
    }

    return this.toGroupDto(updated[0], 0);
  }

  async deleteGroup(userId: string, id: string): Promise<void> {
    const group = await this.db
      .select()
      .from(accountGroups)
      .where(and(eq(accountGroups.id, id), eq(accountGroups.userId, userId)));
    if (group.length === 0) {
      throw new NotFoundException('分组不存在');
    }
    if (group[0].isDefault) {
      throw new BadRequestException('默认分组不能删除');
    }

    const defaultGroup = await this.db
      .select()
      .from(accountGroups)
      .where(and(eq(accountGroups.userId, userId), eq(accountGroups.isDefault, true)));

    const defaultGroupId = defaultGroup[0]?.id ?? null;
    await this.db
      .update(platformAccounts)
      .set({ groupId: defaultGroupId, groupName: defaultGroup[0]?.groupName ?? '默认分组' })
      .where(and(eq(platformAccounts.userId, userId), eq(platformAccounts.groupId, id)));

    await this.db.delete(accountGroups).where(eq(accountGroups.id, id));
  }

  async moveAccountsToGroup(
    userId: string,
    accountIds: string[],
    groupId: string,
  ): Promise<{ moved: number }> {
    if (!accountIds || accountIds.length === 0) {
      throw new BadRequestException('请选择要移动的账号');
    }
    const group = await this.db
      .select()
      .from(accountGroups)
      .where(and(eq(accountGroups.id, groupId), eq(accountGroups.userId, userId)));
    if (group.length === 0) {
      throw new NotFoundException('分组不存在');
    }

    const updated = await this.db
      .update(platformAccounts)
      .set({ groupId, groupName: group[0].groupName })
      .where(and(eq(platformAccounts.userId, userId), inArray(platformAccounts.id, accountIds)))
      .returning({ id: platformAccounts.id });

    return { moved: updated.length };
  }

  async getStats(userId: string): Promise<{
    total: number;
    platformStats: { platform: PlatformType; count: number }[];
    authorized: number;
    expired: number;
    pending: number;
  }> {
    const allAccounts = await this.db
      .select({
        platform: platformAccounts.platform,
        authStatus: platformAccounts.authStatus,
      })
      .from(platformAccounts)
      .where(eq(platformAccounts.userId, userId));

    const platformMap = new Map<string, number>();
    let authorized = 0;
    let expired = 0;
    let pending = 0;

    for (const acc of allAccounts) {
      platformMap.set(acc.platform, (platformMap.get(acc.platform) ?? 0) + 1);
      if (acc.authStatus === 'authorized') authorized++;
      else if (acc.authStatus === 'expired') expired++;
      else if (acc.authStatus === 'pending') pending++;
    }

    const platformStats: { platform: PlatformType; count: number }[] = Array.from(platformMap.entries()).map(
      ([platform, c]) => ({ platform: platform as PlatformType, count: c }),
    );

    return {
      total: allAccounts.length,
      platformStats,
      authorized,
      expired,
      pending,
    };
  }

  getOAuthStatus() {
    const missingConfig: string[] = [];
    if (!process.env.DOUYIN_CLIENT_KEY) missingConfig.push('抖音应用 Client Key');
    if (!process.env.DOUYIN_CLIENT_SECRET) missingConfig.push('抖音应用 Client Secret');
    if (!process.env.OAUTH_CALLBACK_URL) missingConfig.push('OAuth 回调地址');
    if (!process.env.OAUTH_STATE_SECRET) missingConfig.push('OAuth 状态校验密钥');
    if (!process.env.TOKEN_ENCRYPTION_KEY) missingConfig.push('账号令牌加密密钥');

    const configured = missingConfig.length === 0;
    const douyinMessage = configured
      ? '可授权'
      : `请先完成配置：${missingConfig.join('、')}`;
    return {
      douyin: {
        available: configured,
        message: douyinMessage,
      },
      xiaohongshu: {
        available: false,
        message: '需小红书开放平台服务商资质及获批接口，当前没有通用创作者 OAuth',
      },
      wechat: {
        available: false,
        message: '需微信视频号对应主体和获批开放能力，当前没有通用创作者 OAuth',
      },
      bilibili: {
        available: false,
        message: '需哔哩哔哩开放平台合作应用及获批接口，当前没有通用创作者 OAuth',
      },
    } satisfies Record<PlatformType, { available: boolean; message: string }>;
  }

  async initiateOAuth(userId: string, platform: string): Promise<{ authUrl: string; message: string }> {
    const validPlatforms: PlatformType[] = ['douyin', 'xiaohongshu', 'wechat', 'bilibili'];
    if (!validPlatforms.includes(platform as PlatformType)) {
      throw new BadRequestException('不支持的平台');
    }
    const status = this.getOAuthStatus()[platform as PlatformType];
    if (!status.available) throw new BadRequestException(status.message);

    const stateSecret = process.env.OAUTH_STATE_SECRET;
    if (!stateSecret) throw new BadRequestException('服务端未配置 OAuth 状态校验密钥');

    const clientKey = process.env.DOUYIN_CLIENT_KEY!;
    const callbackUrl = process.env.OAUTH_CALLBACK_URL!;
    const state = jwt.sign(
      { userId, platform: 'douyin', nonce: CryptoJS.lib.WordArray.random(16).toString() } satisfies OAuthState,
      stateSecret,
      { expiresIn: '10m', issuer: 'matrix-oauth' },
    );
    const scope = process.env.DOUYIN_SCOPES || 'user_info';
    const params = new URLSearchParams({
      client_key: clientKey,
      response_type: 'code',
      scope,
      redirect_uri: callbackUrl,
      state,
    });
    return {
      authUrl: `https://open.douyin.com/platform/oauth/connect/?${params.toString()}`,
      message: '请在抖音官方页面完成授权',
    };
  }

  async oauthCallback(input: {
    code?: string;
    state?: string;
    error?: string;
    errorDescription?: string;
  }): Promise<string> {
    const appUrl = (process.env.APP_PUBLIC_URL || 'http://localhost:8080').replace(/\/$/, '');
    const resultUrl = (status: 'success' | 'error', message: string) =>
      `${appUrl}/accounts?oauth=${status}&message=${encodeURIComponent(message)}`;

    if (input.error) return resultUrl('error', input.errorDescription || input.error);
    if (!input.code || !input.state) return resultUrl('error', '授权回调缺少 code 或 state');

    const stateSecret = process.env.OAUTH_STATE_SECRET;
    if (!stateSecret) return resultUrl('error', '服务端未配置 OAuth 状态校验密钥，请联系管理员');

    let state: OAuthState;
    try {
      state = jwt.verify(input.state, stateSecret, {
        issuer: 'matrix-oauth',
      }) as OAuthState;
    } catch {
      return resultUrl('error', '授权请求已过期或 state 校验失败，请重新发起');
    }

    try {
      if (state.platform !== 'douyin') throw new Error('不支持的授权平台');
      const tokenResponse = await fetch('https://open.douyin.com/oauth/access_token/', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: process.env.DOUYIN_CLIENT_KEY!,
          client_secret: process.env.DOUYIN_CLIENT_SECRET!,
          code: input.code,
          grant_type: 'authorization_code',
        }),
      });
      const token = (await tokenResponse.json()) as DouyinTokenResponse;
      if (!tokenResponse.ok || !token.data?.access_token || !token.data.open_id || token.data.error_code) {
        throw new Error(token.data?.description || token.message || '抖音换取 access_token 失败');
      }

      const userResponse = await fetch('https://open.douyin.com/oauth/userinfo/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ access_token: token.data.access_token, open_id: token.data.open_id }),
      });
      const profile = (await userResponse.json()) as DouyinUserResponse;
      if (!userResponse.ok || !profile.data?.open_id || Number(profile.data.error_code || 0) !== 0 || profile.err_no) {
        throw new Error(profile.data?.description || profile.err_msg || '获取抖音用户信息失败');
      }

      const existing = await this.db
        .select({ id: platformAccounts.id })
        .from(platformAccounts)
        .where(and(
          eq(platformAccounts.userId, state.userId),
          eq(platformAccounts.platform, 'douyin'),
          eq(platformAccounts.platformUserId, profile.data.open_id),
        ))
        .limit(1);
      const expiresAt = new Date(Date.now() + Number(token.data.expires_in || 0) * 1000);
      const values = {
        nickname: profile.data.nickname || '抖音用户',
        avatarUrl: profile.data.avatar,
        authStatus: 'authorized',
        healthStatus: 'normal',
        authExpiresAt: expiresAt,
        accessToken: this.encryptToken(token.data.access_token),
        refreshToken: token.data.refresh_token ? this.encryptToken(token.data.refresh_token) : null,
        rawData: {
          unionId: profile.data.union_id,
          scope: token.data.scope?.split(',').filter(Boolean) || ['user_info'],
          provider: 'douyin',
        },
        updatedAt: new Date(),
      };

      if (existing[0]) {
        await this.db.update(platformAccounts).set(values).where(eq(platformAccounts.id, existing[0].id));
      } else {
        await this.ensureAccountCapacity(state.userId);
        await this.db.insert(platformAccounts).values({
          ...values,
          userId: state.userId,
          platform: 'douyin',
          platformUserId: profile.data.open_id,
          groupName: '默认分组',
        });
      }
      return resultUrl('success', `已绑定抖音账号「${values.nickname}」`);
    } catch (error) {
      this.logger.error('OAuth callback failed', error instanceof Error ? error.stack : String(error));
      return resultUrl('error', error instanceof Error ? error.message : '授权失败');
    }
  }

  private encryptToken(token: string): string {
    const key = process.env.TOKEN_ENCRYPTION_KEY;
    if (!key) throw new BadRequestException('服务端未配置账号令牌加密密钥');
    return CryptoJS.AES.encrypt(token, key).toString();
  }

  private async ensureAccountCapacity(userId: string): Promise<void> {
    const [user] = await this.db.select({ maxAccounts: appUsers.maxAccounts }).from(appUsers).where(eq(appUsers.id, userId));
    if (!user) throw new NotFoundException('用户不存在');
    const [usage] = await this.db.select({ count: count() }).from(platformAccounts).where(eq(platformAccounts.userId, userId));
    if (user.maxAccounts > 0 && Number(usage?.count || 0) >= user.maxAccounts) {
      throw new BadRequestException(`已达到最大账号数量限制（${user.maxAccounts}个）`);
    }
  }

  // ==================== Followers ====================

  async getFollowers(
    userId: string,
    params: {
      platform?: string;
      accountId?: string;
      keyword?: string;
      tag?: string;
      page: number;
      pageSize: number;
    },
  ): Promise<{ items: FollowerRecord[]; total: number; page: number; pageSize: number }> {
    const { platform, accountId, keyword, tag, page, pageSize } = params;
    const conditions = [eq(followerRecords.userId, userId)];
    if (platform) conditions.push(eq(followerRecords.platform, platform));
    if (accountId) conditions.push(eq(followerRecords.accountId, accountId));
    if (keyword) {
      conditions.push(
        or(
          like(followerRecords.nickname, `%${keyword}%`),
          like(followerRecords.followerPlatformId, `%${keyword}%`),
        ),
      );
    }
    if (tag) {
      conditions.push(sql`${followerRecords.tags} @> ARRAY[${tag}]::text[]`);
    }

    const where = and(...conditions);
    const offset = (page - 1) * pageSize;

    const [itemsResult, countResult] = await Promise.all([
      this.db
        .select()
        .from(followerRecords)
        .where(where)
        .orderBy(desc(followerRecords.followedAt))
        .limit(pageSize)
        .offset(offset),
      this.db.select({ count: count() }).from(followerRecords).where(where),
    ]);

    const items: FollowerRecord[] = itemsResult.map((row) => this.toFollowerDto(row));
    const total = Number(countResult[0]?.count ?? 0);

    return { items, total, page, pageSize };
  }

  async getFollowerDetail(userId: string, id: string): Promise<FollowerRecord> {
    const result = await this.db
      .select()
      .from(followerRecords)
      .where(and(eq(followerRecords.id, id), eq(followerRecords.userId, userId)));
    if (result.length === 0) throw new NotFoundException('粉丝记录不存在');
    return this.toFollowerDto(result[0]);
  }

  async updateFollower(
    userId: string,
    id: string,
    data: { remark?: string; tags?: string[] },
  ): Promise<FollowerRecord> {
    const existing = await this.db
      .select()
      .from(followerRecords)
      .where(and(eq(followerRecords.id, id), eq(followerRecords.userId, userId)));
    if (existing.length === 0) throw new NotFoundException('粉丝记录不存在');

    const patch: Partial<typeof followerRecords.$inferInsert> = {};
    if (data.remark !== undefined) patch.remark = data.remark;
    if (data.tags !== undefined) patch.tags = data.tags;

    if (Object.keys(patch).length === 0) return this.toFollowerDto(existing[0]);

    const updated = await this.db
      .update(followerRecords)
      .set(patch)
      .where(eq(followerRecords.id, id))
      .returning();
    return this.toFollowerDto(updated[0]);
  }

  async batchTagFollowers(
    userId: string,
    followerIds: string[],
    tags: string[],
  ): Promise<{ updated: number }> {
    if (!followerIds || followerIds.length === 0) {
      throw new BadRequestException('请选择粉丝');
    }
    const updated = await this.db
      .update(followerRecords)
      .set({
        tags: sql`array_cat(${followerRecords.tags}, ARRAY[${sql.join(tags.map((t) => sql`${t}`), sql`, `)}]::text[])`,
      })
      .where(and(eq(followerRecords.userId, userId), inArray(followerRecords.id, followerIds)))
      .returning({ id: followerRecords.id });
    return { updated: updated.length };
  }

  async batchGroupFollowers(
    userId: string,
    followerIds: string[],
    groupName: string,
  ): Promise<{ updated: number }> {
    if (!followerIds || followerIds.length === 0) {
      throw new BadRequestException('请选择粉丝');
    }
    const updated = await this.db
      .update(followerRecords)
      .set({ groupName })
      .where(and(eq(followerRecords.userId, userId), inArray(followerRecords.id, followerIds)))
      .returning({ id: followerRecords.id });
    return { updated: updated.length };
  }

  async exportFollowers(
    userId: string,
    options: { accountId?: string; platform?: string },
  ): Promise<{ total: number; preview: FollowerRecord[]; downloadUrl: string }> {
    const conditions = [eq(followerRecords.userId, userId)];
    if (options.platform) conditions.push(eq(followerRecords.platform, options.platform));
    if (options.accountId) conditions.push(eq(followerRecords.accountId, options.accountId));

    const where = and(...conditions);
    const [countResult, items] = await Promise.all([
      this.db.select({ count: count() }).from(followerRecords).where(where),
      this.db.select().from(followerRecords).where(where).limit(100),
    ]);

    return {
      total: Number(countResult[0]?.count ?? 0),
      preview: items.map((row) => this.toFollowerDto(row)),
      downloadUrl: '#follower-export-demo',
    };
  }

  async getFollowerStats(
    userId: string,
    period: string,
    days: number,
  ): Promise<{ trend: { date: string; newFollowers: number; lostFollowers: number }[]; total: number; netGrowth: number }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

    const trendResult = await this.db
      .select({
        date: sql<string>`to_char(DATE(${followerRecords.createdAt}), 'YYYY-MM-DD')`,
        newCount: sql<number>`count(*) filter (where ${followerRecords.status} = 'active')`,
        lostCount: sql<number>`count(*) filter (where ${followerRecords.status} != 'active')`,
      })
      .from(followerRecords)
      .where(and(eq(followerRecords.userId, userId), gte(followerRecords.createdAt, startDate)))
      .groupBy(sql`DATE(${followerRecords.createdAt})`)
      .orderBy(sql`DATE(${followerRecords.createdAt})`);

    const trendMap = new Map<string, { newFollowers: number; lostFollowers: number }>();
    for (const row of trendResult) {
      trendMap.set(row.date, { newFollowers: Number(row.newCount), lostFollowers: Number(row.lostCount) });
    }

    const trend: { date: string; newFollowers: number; lostFollowers: number }[] = [];
    let totalNew = 0;
    let totalLost = 0;
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      const entry = trendMap.get(dateStr);
      const newFollowers = entry?.newFollowers ?? 0;
      const lostFollowers = entry?.lostFollowers ?? 0;
      totalNew += newFollowers;
      totalLost += lostFollowers;
      trend.push({ date: dateStr, newFollowers, lostFollowers });
    }

    const totalCountResult = await this.db
      .select({ count: count() })
      .from(followerRecords)
      .where(and(eq(followerRecords.userId, userId), eq(followerRecords.status, 'active')));

    return {
      trend,
      total: Number(totalCountResult[0]?.count ?? 0),
      netGrowth: totalNew - totalLost,
    };
  }

  // ==================== Helpers ====================

  private async findAccountById(userId: string, id: string) {
    const result = await this.db
      .select()
      .from(platformAccounts)
      .where(and(eq(platformAccounts.id, id), eq(platformAccounts.userId, userId)));
    return result[0] ?? null;
  }

  private toGroupDto(row: typeof accountGroups.$inferSelect, accountCount: number): AccountGroup {
    return {
      id: row.id,
      userId: row.userId,
      groupName: row.groupName,
      sortOrder: row.sortOrder,
      isDefault: row.isDefault,
      accountCount,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toFollowerDto(row: typeof followerRecords.$inferSelect): FollowerRecord {
    return {
      id: row.id,
      platform: row.platform as PlatformType,
      accountId: row.accountId,
      followerPlatformId: row.followerPlatformId,
      nickname: row.nickname ?? undefined,
      avatarUrl: row.avatarUrl ?? undefined,
      followedAt: row.followedAt ? row.followedAt.toISOString() : undefined,
      isMutual: row.isMutual,
      isPrivate: false,
      tags: row.tags ?? [],
      remark: row.remark ?? undefined,
      groupName: row.groupName ?? undefined,
      gender: row.gender ?? undefined,
      location: row.location ?? undefined,
      status: row.status,
    };
  }

  private toAccountDto(row: typeof platformAccounts.$inferSelect): PlatformAccount {
    const rawData = row.rawData as { provider?: string; connectorSessionId?: string } | null;
    return {
      id: row.id,
      platform: row.platform as PlatformType,
      platformUserId: row.platformUserId ?? undefined,
      nickname: row.nickname ?? undefined,
      avatarUrl: row.avatarUrl ?? undefined,
      accountRemark: row.accountRemark ?? undefined,
      groupName: row.groupName ?? undefined,
      authStatus: row.authStatus as 'pending' | 'authorized' | 'expired' | 'error',
      authExpiresAt: row.authExpiresAt ? row.authExpiresAt.toISOString() : undefined,
      followersCount: row.followersCount,
      followingCount: row.followingCount,
      likesCount: row.likesCount,
      postsCount: row.postsCount,
      healthStatus: row.healthStatus as 'normal' | 'warning' | 'error',
      createdAt: row.createdAt.toISOString(),
      connectorMode: rawData?.provider === 'desktop-connector' ? 'desktop' : 'oauth',
      connectorSessionId: rawData?.provider === 'desktop-connector' ? rawData.connectorSessionId : undefined,
    };
  }
}
