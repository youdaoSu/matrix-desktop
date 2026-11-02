import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, desc, sql, and } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { appUsers, vipPlans, operationLogs } from '@server/database/schema';
import type { AppUser, OperationLog } from '@shared/api.interface';

function mapUser(row: typeof appUsers.$inferSelect & { vipPlanName?: string }): AppUser {
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

interface UpdateProfileDto {
  nickname?: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
}

interface ChangePasswordDto {
  oldPassword: string;
  newPassword: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async getProfile(userId: string): Promise<AppUser> {
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
    return mapUser({ ...user, vipPlanName: planName ?? undefined });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<AppUser> {
    const patch: Partial<typeof appUsers.$inferInsert> = {};
    if (dto.nickname !== undefined) patch.nickname = dto.nickname;
    if (dto.email !== undefined) patch.email = dto.email;
    if (dto.phone !== undefined) patch.phone = dto.phone;
    if (dto.avatarUrl !== undefined) patch.avatarUrl = dto.avatarUrl;

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('未提供可更新字段');
    }

    const result = await this.db
      .update(appUsers)
      .set(patch)
      .where(eq(appUsers.id, userId))
      .returning();

    if (result.length === 0) {
      throw new NotFoundException('用户不存在');
    }

    await this.db.insert(operationLogs).values({
      operatorType: 'user',
      operatorId: userId,
      action: 'update_profile',
      targetType: 'user',
      targetId: userId,
      detail: '更新个人资料',
    });

    return mapUser(result[0]);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    await this.db.transaction(async tx => {
      const [user] = await tx.select().from(appUsers).where(eq(appUsers.id, userId)).limit(1).for('update');
      if (!user) throw new NotFoundException('用户不存在');
      if (!await bcrypt.compare(dto.oldPassword, user.passwordHash)) throw new BadRequestException('原密码错误');
      if (dto.oldPassword === dto.newPassword) throw new BadRequestException('新密码不能与原密码相同');
      const passwordHash = await bcrypt.hash(dto.newPassword, 10);
      await tx.update(appUsers).set({ passwordHash, authVersion: sql`${appUsers.authVersion} + 1` }).where(eq(appUsers.id, userId));
      await tx.insert(operationLogs).values({ operatorType: 'user', operatorId: userId, action: 'change_password', targetType: 'user', targetId: userId, detail: '修改密码；旧登录已失效' });
    });
  }

  async getLoginLogs(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: OperationLog[]; total: number; page: number; pageSize: number }> {
    const offset = (page - 1) * pageSize;

    const whereCondition = and(
      eq(operationLogs.operatorType, 'user'),
      eq(operationLogs.action, 'login'),
      eq(operationLogs.operatorId, userId),
    );

    const [countResult, items] = await Promise.all([
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(operationLogs)
        .where(whereCondition),
      this.db
        .select()
        .from(operationLogs)
        .where(whereCondition)
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
}
