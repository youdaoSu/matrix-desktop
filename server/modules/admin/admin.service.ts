import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, desc, sql, or, like, gte, lt, inArray, count } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomInt } from 'node:crypto';
import {
  adminUsers,
  appUsers,
  vipPlans,
  activationCodes,
  platformAccounts,
  operationLogs,
  announcements,
  sensitiveWords,
  systemSettings,
  contentPosts,
} from '@server/database/schema';
import type {
  AppUser,
  AdminUser,
  VipPlan,
  ActivationCode,
  OperationLog,
  AdminDashboardStats,
  PlatformAccount,
  Announcement,
  SensitiveWord,
  SystemSetting,
  PlatformType,
} from '@shared/api.interface';
import { signToken } from '../auth/jwt-auth.guard';

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateRandomCode(length: number): string {
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += CODE_CHARS.charAt(randomInt(CODE_CHARS.length));
  }
  return result;
}

function mapAdminUser(row: typeof adminUsers.$inferSelect): AdminUser {
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname ?? undefined,
    role: row.role,
    status: row.status,
    mustChangePwd: row.mustChangePwd,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : undefined,
  };
}

function mapAppUser(row: typeof appUsers.$inferSelect & { vipPlanName?: string }): AppUser {
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

function mapVipPlan(row: typeof vipPlans.$inferSelect): VipPlan {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    durationDays: row.durationDays,
    maxAccounts: row.maxAccounts,
    price: row.price.toString(),
    description: row.description ?? undefined,
    status: row.status,
    sortOrder: row.sortOrder,
  };
}

function mapActivationCode(
  row: typeof activationCodes.$inferSelect & { planName?: string; username?: string },
): ActivationCode {
  return {
    id: row.id,
    code: row.code,
    planId: row.planId,
    planName: row.planName,
    durationDays: row.durationDays,
    maxAccounts: row.maxAccounts,
    status: row.status as ActivationCode['status'],
    userId: row.userId ?? undefined,
    username: row.username,
    activatedAt: row.activatedAt ? row.activatedAt.toISOString() : undefined,
    batchNo: row.batchNo ?? undefined,
    remark: row.remark ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapOperationLog(row: typeof operationLogs.$inferSelect): OperationLog {
  return {
    id: row.id,
    operatorType: row.operatorType as OperationLog['operatorType'],
    operatorName: row.operatorName ?? undefined,
    action: row.action,
    targetType: row.targetType ?? undefined,
    detail: row.detail ?? undefined,
    ipAddress: row.ipAddress ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapPlatformAccount(row: typeof platformAccounts.$inferSelect): PlatformAccount {
  return {
    id: row.id,
    platform: row.platform as PlatformAccount['platform'],
    platformUserId: row.platformUserId ?? undefined,
    nickname: row.nickname ?? undefined,
    avatarUrl: row.avatarUrl ?? undefined,
    accountRemark: row.accountRemark ?? undefined,
    groupName: row.groupName ?? undefined,
    authStatus: row.authStatus as PlatformAccount['authStatus'],
    authExpiresAt: row.authExpiresAt ? row.authExpiresAt.toISOString() : undefined,
    followersCount: row.followersCount,
    followingCount: row.followingCount,
    likesCount: row.likesCount,
    postsCount: row.postsCount,
    healthStatus: row.healthStatus as PlatformAccount['healthStatus'],
    createdAt: row.createdAt.toISOString(),
  };
}

function mapAnnouncement(row: typeof announcements.$inferSelect): Announcement {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    summary: row.summary ?? undefined,
    category: row.category as Announcement['category'],
    isPublished: row.isPublished,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapSensitiveWord(row: typeof sensitiveWords.$inferSelect): SensitiveWord {
  return {
    id: row.id,
    word: row.word,
    category: row.category,
    level: row.level as SensitiveWord['level'],
    isEnabled: row.isEnabled,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapSystemSetting(row: typeof systemSettings.$inferSelect): SystemSetting {
  return {
    id: row.id,
    settingKey: row.settingKey,
    settingValue: row.settingValue ?? undefined,
    settingType: row.settingType as SystemSetting['settingType'],
    description: row.description ?? undefined,
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  // ==================== Admin Auth ====================

  async adminLogin(username: string, password: string, ip?: string): Promise<{ token: string; user: AdminUser }> {
    const admins = await this.db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.username, username))
      .limit(1);

    if (admins.length === 0) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const admin = admins[0];
    if (admin.status !== 'active') {
      throw new UnauthorizedException('账号已被停用');
    }

    const isPasswordValid = await bcrypt.compare(password, admin.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const now = new Date();
    await this.db
      .update(adminUsers)
      .set({ lastLoginAt: now, lastLoginIp: ip })
      .where(eq(adminUsers.id, admin.id));

    await this.db.insert(operationLogs).values({
      operatorType: 'admin',
      operatorId: admin.id,
      operatorName: admin.username,
      action: 'login',
      targetType: 'admin',
      targetId: admin.id,
      detail: '管理员登录',
      ipAddress: ip,
    });

    const token = signToken({
      userId: admin.id,
      role: 'admin',
      username: admin.username,
    });

    return { token, user: mapAdminUser(admin) };
  }

  async getAdminMe(adminId: string): Promise<AdminUser> {
    const admins = await this.db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, adminId))
      .limit(1);

    if (admins.length === 0) {
      throw new NotFoundException('管理员不存在');
    }

    return mapAdminUser(admins[0]);
  }

  async adminChangePassword(adminId: string, oldPassword: string, newPassword: string): Promise<void> {
    const admins = await this.db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, adminId))
      .limit(1);

    if (admins.length === 0) {
      throw new NotFoundException('管理员不存在');
    }

    const admin = admins[0];
    const isOldValid = await bcrypt.compare(oldPassword, admin.passwordHash);
    if (!isOldValid) {
      throw new BadRequestException('原密码错误');
    }

    if (oldPassword === newPassword) {
      throw new BadRequestException('新密码不能与原密码相同');
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await this.db
      .update(adminUsers)
      .set({ passwordHash: newHash, mustChangePwd: false })
      .where(eq(adminUsers.id, adminId));

    await this.db.insert(operationLogs).values({
      operatorType: 'admin',
      operatorId: adminId,
      action: 'change_password',
      targetType: 'admin',
      targetId: adminId,
      detail: '管理员修改密码',
    });
  }

  // ==================== Dashboard Stats ====================

  async getDashboardStats(): Promise<AdminDashboardStats> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const soonThreshold = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsersResult,
      activeVipResult,
      todayNewResult,
      expiringSoonResult,
      totalCodesResult,
      usedCodesResult,
      totalAccountsResult,
    ] = await Promise.all([
      this.db.select({ count: sql<number>`count(*)` }).from(appUsers),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(appUsers)
        .where(and(eq(appUsers.vipStatus, 'active'), gte(appUsers.vipExpiresAt!, now))),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(appUsers)
        .where(and(gte(appUsers.createdAt, todayStart), lt(appUsers.createdAt, todayEnd))),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(appUsers)
        .where(
          and(
            eq(appUsers.vipStatus, 'active'),
            gte(appUsers.vipExpiresAt!, now),
            lt(appUsers.vipExpiresAt!, soonThreshold),
          ),
        ),
      this.db.select({ count: sql<number>`count(*)` }).from(activationCodes),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(activationCodes)
        .where(eq(activationCodes.status, 'used')),
      this.db.select({ count: sql<number>`count(*)` }).from(platformAccounts),
    ]);

    return {
      totalUsers: Number(totalUsersResult[0]?.count ?? 0),
      activeVipUsers: Number(activeVipResult[0]?.count ?? 0),
      todayNewUsers: Number(todayNewResult[0]?.count ?? 0),
      expiringSoon: Number(expiringSoonResult[0]?.count ?? 0),
      totalCodes: Number(totalCodesResult[0]?.count ?? 0),
      usedCodes: Number(usedCodesResult[0]?.count ?? 0),
      totalAccounts: Number(totalAccountsResult[0]?.count ?? 0),
    };
  }

  // ==================== User Management ====================

  async getUserList(
    page: number,
    pageSize: number,
    keyword?: string,
  ): Promise<{ items: AppUser[]; total: number; page: number; pageSize: number }> {
    const offset = (page - 1) * pageSize;

    const whereCondition = keyword
      ? or(
          like(appUsers.username, `%${keyword}%`),
          like(appUsers.nickname, `%${keyword}%`),
          like(appUsers.email, `%${keyword}%`),
          like(appUsers.phone, `%${keyword}%`),
        )
      : undefined;

    const baseQuery = this.db
      .select({
        user: appUsers,
        planName: vipPlans.name,
      })
      .from(appUsers)
      .leftJoin(vipPlans, eq(appUsers.vipPlanId, vipPlans.id))
      .$dynamic();

    const countQuery = this.db
      .select({ count: sql<number>`count(*)` })
      .from(appUsers)
      .$dynamic();

    const filteredQuery = whereCondition
      ? baseQuery.where(whereCondition)
      : baseQuery;

    const filteredCount = whereCondition
      ? countQuery.where(whereCondition)
      : countQuery;

    const [countResult, rows] = await Promise.all([
      filteredCount,
      filteredQuery
        .orderBy(desc(appUsers.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const items = rows.map((row) =>
      mapAppUser({ ...row.user, vipPlanName: row.planName ?? undefined }),
    );

    return {
      items,
      total: Number(countResult[0]?.count ?? 0),
      page,
      pageSize,
    };
  }

  async getUserDetail(userId: string): Promise<AppUser> {
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
    return mapAppUser({ ...user, vipPlanName: planName ?? undefined });
  }

  async activateUserVip(
    adminId: string,
    adminName: string,
    userId: string,
    planId: string,
    durationDays: number,
    maxAccounts: number,
  ): Promise<AppUser> {
    const users = await this.db.select().from(appUsers).where(eq(appUsers.id, userId)).limit(1);
    if (users.length === 0) throw new NotFoundException('用户不存在');

    const plans = await this.db.select().from(vipPlans).where(eq(vipPlans.id, planId)).limit(1);
    if (plans.length === 0) throw new BadRequestException('套餐不存在');

    const user = users[0];
    const plan = plans[0];
    const now = new Date();
    const currentExpiry =
      user.vipExpiresAt && user.vipStatus === 'active' && user.vipExpiresAt.getTime() > now.getTime()
        ? user.vipExpiresAt
        : now;
    const newExpiry = new Date(currentExpiry.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const result = await this.db
      .update(appUsers)
      .set({
        vipPlanId: plan.id,
        vipExpiresAt: newExpiry,
        vipStatus: 'active',
        maxAccounts,
      })
      .where(eq(appUsers.id, userId))
      .returning();

    await this.db.insert(operationLogs).values({
      operatorType: 'admin',
      operatorId: adminId,
      operatorName: adminName,
      action: 'activate_vip',
      targetType: 'user',
      targetId: userId,
      detail: `手动开通VIP：套餐 ${plan.name}，时长 ${durationDays} 天，最多 ${maxAccounts} 个账号`,
    });

    return mapAppUser({ ...result[0], vipPlanName: plan.name });
  }

  async extendUserVip(
    adminId: string,
    adminName: string,
    userId: string,
    days: number,
  ): Promise<AppUser> {
    const users = await this.db
      .select({
        user: appUsers,
        planName: vipPlans.name,
      })
      .from(appUsers)
      .leftJoin(vipPlans, eq(appUsers.vipPlanId, vipPlans.id))
      .where(eq(appUsers.id, userId))
      .limit(1);

    if (users.length === 0) throw new NotFoundException('用户不存在');

    const { user, planName } = users[0];
    const now = new Date();
    const currentExpiry =
      user.vipExpiresAt && user.vipStatus === 'active' && user.vipExpiresAt.getTime() > now.getTime()
        ? user.vipExpiresAt
        : now;
    const newExpiry = new Date(currentExpiry.getTime() + days * 24 * 60 * 60 * 1000);

    const result = await this.db
      .update(appUsers)
      .set({ vipExpiresAt: newExpiry, vipStatus: 'active' })
      .where(eq(appUsers.id, userId))
      .returning();

    await this.db.insert(operationLogs).values({
      operatorType: 'admin',
      operatorId: adminId,
      operatorName: adminName,
      action: 'extend_vip',
      targetType: 'user',
      targetId: userId,
      detail: `延长VIP ${days} 天`,
    });

    return mapAppUser({ ...result[0], vipPlanName: planName ?? undefined });
  }

  async toggleUserStatus(adminId: string, adminName: string, userId: string): Promise<AppUser> {
    const users = await this.db
      .select({
        user: appUsers,
        planName: vipPlans.name,
      })
      .from(appUsers)
      .leftJoin(vipPlans, eq(appUsers.vipPlanId, vipPlans.id))
      .where(eq(appUsers.id, userId))
      .limit(1);

    if (users.length === 0) throw new NotFoundException('用户不存在');

    const { user, planName } = users[0];
    const newStatus = user.status === 'active' ? 'disabled' : 'active';

    const result = await this.db
      .update(appUsers)
      .set({ status: newStatus })
      .where(eq(appUsers.id, userId))
      .returning();

    await this.db.insert(operationLogs).values({
      operatorType: 'admin',
      operatorId: adminId,
      operatorName: adminName,
      action: 'toggle_user_status',
      targetType: 'user',
      targetId: userId,
      detail: `${user.status === 'active' ? '停用' : '启用'}用户`,
    });

    return mapAppUser({ ...result[0], vipPlanName: planName ?? undefined });
  }

  async resetUserPassword(adminId: string, adminName: string, userId: string): Promise<string> {
    const users = await this.db.select().from(appUsers).where(eq(appUsers.id, userId)).limit(1);
    if (users.length === 0) throw new NotFoundException('用户不存在');

    const temporaryPassword = `Mx!${randomBytes(9).toString('base64url')}9a`;
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    await this.db.update(appUsers).set({ passwordHash, authVersion: sql`${appUsers.authVersion} + 1` }).where(eq(appUsers.id, userId));

    await this.db.insert(operationLogs).values({
      operatorType: 'admin',
      operatorId: adminId,
      operatorName: adminName,
      action: 'reset_password',
      targetType: 'user',
      targetId: userId,
      detail: '重置用户密码',
    });
    return temporaryPassword;
  }

  async getUserAccounts(userId: string): Promise<PlatformAccount[]> {
    const accounts = await this.db
      .select()
      .from(platformAccounts)
      .where(eq(platformAccounts.userId, userId))
      .orderBy(desc(platformAccounts.createdAt));

    return accounts.map(mapPlatformAccount);
  }

  // ==================== Activation Codes ====================

  async getCodeList(
    page: number,
    pageSize: number,
    options: {
      status?: string;
      planId?: string;
      batchNo?: string;
      keyword?: string;
    },
  ): Promise<{ items: ActivationCode[]; total: number; page: number; pageSize: number }> {
    const offset = (page - 1) * pageSize;
    const conditions = [];

    if (options.status) conditions.push(eq(activationCodes.status, options.status));
    if (options.planId) conditions.push(eq(activationCodes.planId, options.planId));
    if (options.batchNo) conditions.push(eq(activationCodes.batchNo, options.batchNo));
    if (options.keyword) {
      conditions.push(
        or(
          like(activationCodes.code, `%${options.keyword}%`),
          like(activationCodes.batchNo, `%${options.keyword}%`),
        ),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const baseQuery = this.db
      .select({
        code: activationCodes,
        planName: vipPlans.name,
        username: appUsers.username,
      })
      .from(activationCodes)
      .leftJoin(vipPlans, eq(activationCodes.planId, vipPlans.id))
      .leftJoin(appUsers, eq(activationCodes.userId, appUsers.id))
      .$dynamic();

    const countQuery = this.db
      .select({ count: sql<number>`count(*)` })
      .from(activationCodes)
      .$dynamic();

    const filteredQuery = whereClause ? baseQuery.where(whereClause) : baseQuery;
    const filteredCount = whereClause ? countQuery.where(whereClause) : countQuery;

    const [countResult, rows] = await Promise.all([
      filteredCount,
      filteredQuery
        .orderBy(desc(activationCodes.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const items = rows.map((row) =>
      mapActivationCode({
        ...row.code,
        planName: row.planName ?? undefined,
        username: row.username ?? undefined,
      }),
    );

    return {
      items,
      total: Number(countResult[0]?.count ?? 0),
      page,
      pageSize,
    };
  }

  async generateCodes(
    adminId: string,
    adminName: string,
    planId: string,
    count: number,
    prefix: string,
    durationDays: number,
    maxAccounts: number,
    remark?: string,
  ): Promise<ActivationCode[]> {
    if (count <= 0 || count > 10000) {
      throw new BadRequestException('生成数量必须在 1-10000 之间');
    }

    const plans = await this.db.select().from(vipPlans).where(eq(vipPlans.id, planId)).limit(1);
    if (plans.length === 0) throw new BadRequestException('套餐不存在');

    const batchNo = `BATCH${Date.now()}`;
    const cleanPrefix = prefix ? `${prefix.toUpperCase()}-` : '';

    const generatedCodes = new Set<string>();
    const values: Array<typeof activationCodes.$inferInsert> = [];

    while (values.length < count) {
      const code = cleanPrefix + generateRandomCode(16);
      if (!generatedCodes.has(code)) {
        generatedCodes.add(code);
        values.push({
          code,
          planId,
          durationDays,
          maxAccounts,
          status: 'unused',
          batchNo,
          remark,
        });
      }
    }

    const inserted = await this.db
      .insert(activationCodes)
      .values(values)
      .returning();

    await this.db.insert(operationLogs).values({
      operatorType: 'admin',
      operatorId: adminId,
      operatorName: adminName,
      action: 'generate_codes',
      targetType: 'activation_code',
      detail: `批量生成授权码 ${count} 个，批次 ${batchNo}，套餐 ${plans[0].name}`,
    });

    return inserted.map((row) => mapActivationCode({ ...row, planName: plans[0].name }));
  }

  async disableCode(adminId: string, adminName: string, codeId: string): Promise<void> {
    const codes = await this.db.select().from(activationCodes).where(eq(activationCodes.id, codeId)).limit(1);
    if (codes.length === 0) throw new NotFoundException('授权码不存在');

    const code = codes[0];
    if (code.status === 'used') {
      throw new BadRequestException('已使用的授权码不能作废');
    }
    if (code.status === 'disabled') {
      return;
    }

    await this.db
      .update(activationCodes)
      .set({ status: 'disabled' })
      .where(eq(activationCodes.id, codeId));

    await this.db.insert(operationLogs).values({
      operatorType: 'admin',
      operatorId: adminId,
      operatorName: adminName,
      action: 'disable_code',
      targetType: 'activation_code',
      targetId: codeId,
      detail: `作授权码 ${code.code}`,
    });
  }

  async exportCodes(): Promise<ActivationCode[]> {
    const rows = await this.db
      .select({
        code: activationCodes,
        planName: vipPlans.name,
        username: appUsers.username,
      })
      .from(activationCodes)
      .leftJoin(vipPlans, eq(activationCodes.planId, vipPlans.id))
      .leftJoin(appUsers, eq(activationCodes.userId, appUsers.id))
      .orderBy(desc(activationCodes.createdAt));

    return rows.map((row) =>
      mapActivationCode({
        ...row.code,
        planName: row.planName ?? undefined,
        username: row.username ?? undefined,
      }),
    );
  }

  // ==================== Vip Plans ====================

  async getPlans(): Promise<VipPlan[]> {
    const plans = await this.db
      .select()
      .from(vipPlans)
      .orderBy(desc(vipPlans.sortOrder), desc(vipPlans.createdAt));
    return plans.map(mapVipPlan);
  }

  async createPlan(
    adminId: string,
    adminName: string,
    dto: {
      name: string;
      code: string;
      durationDays: number;
      maxAccounts: number;
      price: string;
      description?: string;
      status?: string;
      sortOrder?: number;
    },
  ): Promise<VipPlan> {
    const existing = await this.db.select().from(vipPlans).where(eq(vipPlans.code, dto.code)).limit(1);
    if (existing.length > 0) {
      throw new ConflictException('套餐编码已存在');
    }

    const result = await this.db
      .insert(vipPlans)
      .values({
        name: dto.name,
        code: dto.code,
        durationDays: dto.durationDays,
        maxAccounts: dto.maxAccounts,
        price: dto.price,
        description: dto.description,
        status: dto.status || 'active',
        sortOrder: dto.sortOrder ?? 0,
      })
      .returning();

    await this.db.insert(operationLogs).values({
      operatorType: 'admin',
      operatorId: adminId,
      operatorName: adminName,
      action: 'create_plan',
      targetType: 'vip_plan',
      targetId: result[0].id,
      detail: `创建套餐 ${dto.name}`,
    });

    return mapVipPlan(result[0]);
  }

  async updatePlan(
    adminId: string,
    adminName: string,
    planId: string,
    dto: Partial<{
      name: string;
      code: string;
      durationDays: number;
      maxAccounts: number;
      price: string;
      description: string;
      status: string;
      sortOrder: number;
    }>,
  ): Promise<VipPlan> {
    const existing = await this.db.select().from(vipPlans).where(eq(vipPlans.id, planId)).limit(1);
    if (existing.length === 0) throw new NotFoundException('套餐不存在');

    const patch: Partial<typeof vipPlans.$inferInsert> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.code !== undefined) patch.code = dto.code;
    if (dto.durationDays !== undefined) patch.durationDays = dto.durationDays;
    if (dto.maxAccounts !== undefined) patch.maxAccounts = dto.maxAccounts;
    if (dto.price !== undefined) patch.price = dto.price;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.status !== undefined) patch.status = dto.status;
    if (dto.sortOrder !== undefined) patch.sortOrder = dto.sortOrder;

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('未提供可更新字段');
    }

    const result = await this.db
      .update(vipPlans)
      .set(patch)
      .where(eq(vipPlans.id, planId))
      .returning();

    await this.db.insert(operationLogs).values({
      operatorType: 'admin',
      operatorId: adminId,
      operatorName: adminName,
      action: 'update_plan',
      targetType: 'vip_plan',
      targetId: planId,
      detail: `更新套餐 ${existing[0].name}`,
    });

    return mapVipPlan(result[0]);
  }

  async deletePlan(adminId: string, adminName: string, planId: string): Promise<void> {
    const existing = await this.db.select().from(vipPlans).where(eq(vipPlans.id, planId)).limit(1);
    if (existing.length === 0) throw new NotFoundException('套餐不存在');

    const codeCount = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(activationCodes)
      .where(eq(activationCodes.planId, planId));

    if (Number(codeCount[0]?.count ?? 0) > 0) {
      throw new BadRequestException('该套餐下存在授权码，不能删除');
    }

    await this.db.delete(vipPlans).where(eq(vipPlans.id, planId));

    await this.db.insert(operationLogs).values({
      operatorType: 'admin',
      operatorId: adminId,
      operatorName: adminName,
      action: 'delete_plan',
      targetType: 'vip_plan',
      targetId: planId,
      detail: `删除套餐 ${existing[0].name}`,
    });
  }

  // ==================== Operation Logs ====================

  async getLogs(
    page: number,
    pageSize: number,
    options: { operatorType?: string; action?: string; keyword?: string },
  ): Promise<{ items: OperationLog[]; total: number; page: number; pageSize: number }> {
    const offset = (page - 1) * pageSize;
    const conditions = [];

    if (options.operatorType) {
      conditions.push(eq(operationLogs.operatorType, options.operatorType));
    }
    if (options.action) {
      conditions.push(eq(operationLogs.action, options.action));
    }
    if (options.keyword) {
      conditions.push(
        or(
          like(operationLogs.operatorName, `%${options.keyword}%`),
          like(operationLogs.action, `%${options.keyword}%`),
          like(operationLogs.detail, `%${options.keyword}%`),
        ),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const countQuery = this.db
      .select({ count: sql<number>`count(*)` })
      .from(operationLogs)
      .$dynamic();

    const listQuery = this.db
      .select()
      .from(operationLogs)
      .$dynamic();

    const filteredCount = whereClause ? countQuery.where(whereClause) : countQuery;
    const filteredList = whereClause ? listQuery.where(whereClause) : listQuery;

    const [countResult, items] = await Promise.all([
      filteredCount,
      filteredList
        .orderBy(desc(operationLogs.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    return {
      items: items.map(mapOperationLog),
      total: Number(countResult[0]?.count ?? 0),
      page,
      pageSize,
    };
  }

  // ==================== Announcements ====================

  async getAnnouncementList(
    page: number,
    pageSize: number,
    options: { keyword?: string; category?: string; isPublished?: boolean },
  ): Promise<{ items: Announcement[]; total: number; page: number; pageSize: number }> {
    const offset = (page - 1) * pageSize;
    const conditions = [];
    if (options.keyword) {
      conditions.push(
        or(
          like(announcements.title, `%${options.keyword}%`),
          like(announcements.content, `%${options.keyword}%`),
        ),
      );
    }
    if (options.category) conditions.push(eq(announcements.category, options.category));
    if (options.isPublished !== undefined) conditions.push(eq(announcements.isPublished, options.isPublished));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult, items] = await Promise.all([
      whereClause
        ? this.db.select({ count: count() }).from(announcements).where(whereClause)
        : this.db.select({ count: count() }).from(announcements),
      (whereClause
        ? this.db.select().from(announcements).where(whereClause)
        : this.db.select().from(announcements)
      )
        .orderBy(desc(announcements.sortOrder), desc(announcements.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    return {
      items: items.map(mapAnnouncement),
      total: Number(countResult[0]?.count ?? 0),
      page,
      pageSize,
    };
  }

  async getAnnouncementDetail(id: string): Promise<Announcement> {
    const result = await this.db.select().from(announcements).where(eq(announcements.id, id));
    if (result.length === 0) throw new NotFoundException('公告不存在');
    return mapAnnouncement(result[0]);
  }

  async createAnnouncement(
    adminId: string,
    adminName: string,
    data: { title: string; content: string; summary?: string; category?: string; sortOrder?: number },
  ): Promise<Announcement> {
    if (!data.title || !data.content) throw new BadRequestException('标题和内容不能为空');
    const inserted = await this.db
      .insert(announcements)
      .values({
        title: data.title,
        content: data.content,
        summary: data.summary,
        category: data.category ?? 'system',
        sortOrder: data.sortOrder ?? 0,
      })
      .returning();

    await this.logOperation(adminId, adminName, 'create_announcement', 'announcement', inserted[0].id, `创建公告: ${data.title}`);
    return mapAnnouncement(inserted[0]);
  }

  async updateAnnouncement(
    adminId: string,
    adminName: string,
    id: string,
    data: { title?: string; content?: string; summary?: string; category?: string; isPublished?: boolean; sortOrder?: number },
  ): Promise<Announcement> {
    const existing = await this.db.select().from(announcements).where(eq(announcements.id, id));
    if (existing.length === 0) throw new NotFoundException('公告不存在');

    const patch: Partial<typeof announcements.$inferInsert> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.content !== undefined) patch.content = data.content;
    if (data.summary !== undefined) patch.summary = data.summary;
    if (data.category !== undefined) patch.category = data.category;
    if (data.isPublished !== undefined) patch.isPublished = data.isPublished;
    if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;

    if (Object.keys(patch).length === 0) return mapAnnouncement(existing[0]);

    const updated = await this.db.update(announcements).set(patch).where(eq(announcements.id, id)).returning();
    await this.logOperation(adminId, adminName, 'update_announcement', 'announcement', id, `更新公告: ${data.title ?? existing[0].title}`);
    return mapAnnouncement(updated[0]);
  }

  async deleteAnnouncement(adminId: string, adminName: string, id: string): Promise<void> {
    const existing = await this.db.select().from(announcements).where(eq(announcements.id, id));
    if (existing.length === 0) throw new NotFoundException('公告不存在');
    await this.db.delete(announcements).where(eq(announcements.id, id));
    await this.logOperation(adminId, adminName, 'delete_announcement', 'announcement', id, `删除公告: ${existing[0].title}`);
  }

  async toggleAnnouncementPublish(adminId: string, adminName: string, id: string): Promise<Announcement> {
    const existing = await this.db.select().from(announcements).where(eq(announcements.id, id));
    if (existing.length === 0) throw new NotFoundException('公告不存在');

    const newStatus = !existing[0].isPublished;
    const updated = await this.db
      .update(announcements)
      .set({ isPublished: newStatus })
      .where(eq(announcements.id, id))
      .returning();

    await this.logOperation(
      adminId,
      adminName,
      newStatus ? 'publish_announcement' : 'unpublish_announcement',
      'announcement',
      id,
      `${newStatus ? '发布' : '下线'}公告: ${existing[0].title}`,
    );
    return mapAnnouncement(updated[0]);
  }

  // ==================== Sensitive Words ====================

  async getSensitiveWordList(
    page: number,
    pageSize: number,
    options: { keyword?: string; category?: string },
  ): Promise<{ items: SensitiveWord[]; total: number; page: number; pageSize: number }> {
    const offset = (page - 1) * pageSize;
    const conditions = [];
    if (options.keyword) conditions.push(like(sensitiveWords.word, `%${options.keyword}%`));
    if (options.category) conditions.push(eq(sensitiveWords.category, options.category));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult, items] = await Promise.all([
      whereClause
        ? this.db.select({ count: count() }).from(sensitiveWords).where(whereClause)
        : this.db.select({ count: count() }).from(sensitiveWords),
      (whereClause
        ? this.db.select().from(sensitiveWords).where(whereClause)
        : this.db.select().from(sensitiveWords)
      )
        .orderBy(desc(sensitiveWords.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    return {
      items: items.map(mapSensitiveWord),
      total: Number(countResult[0]?.count ?? 0),
      page,
      pageSize,
    };
  }

  async createSensitiveWord(
    adminId: string,
    adminName: string,
    data: { word: string; category?: string; level?: string },
  ): Promise<SensitiveWord> {
    if (!data.word) throw new BadRequestException('敏感词不能为空');
    try {
      const inserted = await this.db
        .insert(sensitiveWords)
        .values({
          word: data.word,
          category: data.category ?? 'general',
          level: data.level ?? 'warn',
        })
        .returning();
      await this.logOperation(adminId, adminName, 'create_sensitive_word', 'sensitive_word', inserted[0].id, `新增敏感词: ${data.word}`);
      return mapSensitiveWord(inserted[0]);
    } catch (error) {
      if (this.extractPostgresErrorCode(error) === '23505') {
        throw new ConflictException('该敏感词已存在');
      }
      throw error;
    }
  }

  async updateSensitiveWord(
    adminId: string,
    adminName: string,
    id: string,
    data: { word?: string; category?: string; level?: string; isEnabled?: boolean },
  ): Promise<SensitiveWord> {
    const existing = await this.db.select().from(sensitiveWords).where(eq(sensitiveWords.id, id));
    if (existing.length === 0) throw new NotFoundException('敏感词不存在');

    const patch: Partial<typeof sensitiveWords.$inferInsert> = {};
    if (data.word !== undefined) patch.word = data.word;
    if (data.category !== undefined) patch.category = data.category;
    if (data.level !== undefined) patch.level = data.level;
    if (data.isEnabled !== undefined) patch.isEnabled = data.isEnabled;

    if (Object.keys(patch).length === 0) return mapSensitiveWord(existing[0]);

    try {
      const updated = await this.db.update(sensitiveWords).set(patch).where(eq(sensitiveWords.id, id)).returning();
      await this.logOperation(adminId, adminName, 'update_sensitive_word', 'sensitive_word', id, `更新敏感词: ${data.word ?? existing[0].word}`);
      return mapSensitiveWord(updated[0]);
    } catch (error) {
      if (this.extractPostgresErrorCode(error) === '23505') {
        throw new ConflictException('该敏感词已存在');
      }
      throw error;
    }
  }

  async deleteSensitiveWord(adminId: string, adminName: string, id: string): Promise<void> {
    const existing = await this.db.select().from(sensitiveWords).where(eq(sensitiveWords.id, id));
    if (existing.length === 0) throw new NotFoundException('敏感词不存在');
    await this.db.delete(sensitiveWords).where(eq(sensitiveWords.id, id));
    await this.logOperation(adminId, adminName, 'delete_sensitive_word', 'sensitive_word', id, `删除敏感词: ${existing[0].word}`);
  }

  async batchImportSensitiveWords(
    adminId: string,
    adminName: string,
    words: string[],
    category = 'general',
    level: 'warn' | 'block' = 'warn',
  ): Promise<{ success: number; failed: number; failedWords: string[] }> {
    if (!words || words.length === 0) throw new BadRequestException('敏感词列表不能为空');

    let success = 0;
    const failedWords: string[] = [];

    for (const word of words) {
      const trimmed = word.trim();
      if (!trimmed) continue;
      try {
        await this.db.insert(sensitiveWords).values({ word: trimmed, category, level });
        success += 1;
      } catch (error) {
        if (this.extractPostgresErrorCode(error) === '23505') {
          failedWords.push(trimmed);
        } else {
          throw error;
        }
      }
    }

    await this.logOperation(
      adminId,
      adminName,
      'batch_import_sensitive_words',
      'sensitive_word',
      undefined,
      `批量导入敏感词 ${words.length} 个，成功 ${success} 个，失败 ${failedWords.length} 个`,
    );

    return { success, failed: failedWords.length, failedWords };
  }

  async exportSensitiveWords(): Promise<SensitiveWord[]> {
    const items = await this.db.select().from(sensitiveWords).orderBy(sensitiveWords.category, sensitiveWords.word);
    return items.map(mapSensitiveWord);
  }

  // ==================== System Settings (DB-backed) ====================

  async getAllSettings(): Promise<SystemSetting[]> {
    const items = await this.db.select().from(systemSettings).orderBy(systemSettings.settingKey);
    return items.map(mapSystemSetting);
  }

  async updateSetting(
    adminId: string,
    adminName: string,
    key: string,
    value: string,
  ): Promise<SystemSetting> {
    const existing = await this.db.select().from(systemSettings).where(eq(systemSettings.settingKey, key));

    let result: typeof systemSettings.$inferSelect;
    if (existing.length === 0) {
      const inserted = await this.db
        .insert(systemSettings)
        .values({ settingKey: key, settingValue: value, settingType: 'string' })
        .returning();
      result = inserted[0];
    } else {
      const updated = await this.db
        .update(systemSettings)
        .set({ settingValue: value })
        .where(eq(systemSettings.settingKey, key))
        .returning();
      result = updated[0];
    }

    await this.logOperation(adminId, adminName, 'update_setting', 'system_setting', undefined, `更新配置: ${key}`);
    return mapSystemSetting(result);
  }

  async testConnection(): Promise<{ success: boolean; message: string; latencyMs: number }> {
    // A database ping says nothing about third-party credentials. Do not
    // report platform access until a real provider-specific check exists.
    return { success: false, message: '平台凭证连接测试尚未接入，未验证平台连接', latencyMs: 0 };
  }

  // ==================== Admin Overview ====================

  async getOverview(): Promise<{
    totalUsers: number;
    vipUsers: number;
    totalCodes: number;
    todayNewUsers: number;
    expiringSoon: number;
    platformAccountDistribution: { platform: PlatformType; count: number }[];
    publishTrend: { date: string; count: number }[];
    publishTrendBasis: 'published-at-utc';
    followerGrowthTrend: { date: string; newFollowers: number; lostFollowers: number }[];
    followerGrowthAvailable: false;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const utcToday = new Date();
    utcToday.setUTCHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(utcToday.getTime() - 6 * 24 * 60 * 60 * 1000);
    const in7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const tomorrow = new Date(utcToday.getTime() + 24 * 60 * 60 * 1000);

    const [
      totalUsersResult,
      vipUsersResult,
      totalCodesResult,
      todayNewResult,
      expiringSoonResult,
      platformDistResult,
      publishTrendResult,
    ] = await Promise.all([
      this.db.select({ count: count() }).from(appUsers),
      this.db.select({ count: count() }).from(appUsers).where(eq(appUsers.vipStatus, 'active')),
      this.db.select({ count: count() }).from(activationCodes),
      this.db.select({ count: count() }).from(appUsers).where(gte(appUsers.createdAt, today)),
      this.db
        .select({ count: count() })
        .from(appUsers)
        .where(
          and(
            eq(appUsers.vipStatus, 'active'),
            gte(appUsers.vipExpiresAt, today),
            lt(appUsers.vipExpiresAt, in7Days),
          ),
        ),
      this.db
        .select({ platform: platformAccounts.platform, count: count() })
        .from(platformAccounts)
        .groupBy(platformAccounts.platform),
      this.db
        .select({
          date: sql<string>`to_char(DATE(timezone('UTC', ${contentPosts.publishedAt})), 'YYYY-MM-DD')`,
          count: count(),
        })
        .from(contentPosts)
        .where(and(eq(contentPosts.status, 'published'), gte(contentPosts.publishedAt, sevenDaysAgo), lt(contentPosts.publishedAt, tomorrow)))
        .groupBy(sql`DATE(timezone('UTC', ${contentPosts.publishedAt}))`)
        .orderBy(sql`DATE(timezone('UTC', ${contentPosts.publishedAt}))`),
    ]);

    // Build publish trend for last 7 days
    const publishMap = new Map<string, number>();
    for (const row of publishTrendResult) {
      publishMap.set(row.date, Number(row.count));
    }
    const publishTrend: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(utcToday.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      publishTrend.push({ date: dateStr, count: publishMap.get(dateStr) ?? 0 });
    }

    return {
      totalUsers: Number(totalUsersResult[0]?.count ?? 0),
      vipUsers: Number(vipUsersResult[0]?.count ?? 0),
      totalCodes: Number(totalCodesResult[0]?.count ?? 0),
      todayNewUsers: Number(todayNewResult[0]?.count ?? 0),
      expiringSoon: Number(expiringSoonResult[0]?.count ?? 0),
      platformAccountDistribution: platformDistResult.map((row) => ({
        platform: row.platform as PlatformType,
        count: Number(row.count),
      })),
      publishTrend,
      publishTrendBasis: 'published-at-utc',
      // The cache creation/status fields are not verified follow/unfollow
      // events. An empty series plus explicit availability is not a zero trend.
      followerGrowthTrend: [],
      followerGrowthAvailable: false,
    };
  }

  // ==================== Helpers ====================

  private async logOperation(
    operatorId: string,
    operatorName: string,
    action: string,
    targetType?: string,
    targetId?: string,
    detail?: string,
  ) {
    try {
      await this.db.insert(operationLogs).values({
        operatorType: 'admin',
        operatorId,
        operatorName,
        action,
        targetType,
        targetId: targetId ?? null,
        detail,
      });
    } catch (e) {
      this.logger.warn('Failed to log operation', e);
    }
  }

  private extractPostgresErrorCode(error: unknown): string | undefined {
    let current: unknown = error;
    for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
      const { code, cause } = current as { code?: unknown; cause?: unknown };
      if (typeof code === 'string') return code;
      current = cause;
    }
    return undefined;
  }
}
