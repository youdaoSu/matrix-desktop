import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, desc, sql, and, gte } from 'drizzle-orm';
import { vipPlans, appUsers, platformAccounts } from '@server/database/schema';
import type { VipPlan } from '@shared/api.interface';

export interface VipStatusDetail {
  status: string;
  planName?: string;
  planCode?: string;
  expiresAt?: string;
  remainingDays: number;
  maxAccounts: number;
  currentAccounts: number;
  durationDays?: number;
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

@Injectable()
export class VipService {
  private readonly logger = new Logger(VipService.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async getPlans(): Promise<VipPlan[]> {
    const plans = await this.db
      .select()
      .from(vipPlans)
      .where(eq(vipPlans.status, 'active'))
      .orderBy(desc(vipPlans.sortOrder), desc(vipPlans.createdAt));

    return plans.map(mapVipPlan);
  }

  async getVipStatus(userId: string): Promise<VipStatusDetail> {
    const users = await this.db
      .select()
      .from(appUsers)
      .where(eq(appUsers.id, userId))
      .limit(1);

    if (users.length === 0) {
      throw new NotFoundException('用户不存在');
    }

    const user = users[0];

    let planName: string | undefined;
    let planCode: string | undefined;
    let durationDays: number | undefined;

    if (user.vipPlanId) {
      const plans = await this.db
        .select({ name: vipPlans.name, code: vipPlans.code, durationDays: vipPlans.durationDays })
        .from(vipPlans)
        .where(eq(vipPlans.id, user.vipPlanId))
        .limit(1);
      if (plans.length > 0) {
        planName = plans[0].name;
        planCode = plans[0].code;
        durationDays = plans[0].durationDays;
      }
    }

    const accountCountResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(platformAccounts)
      .where(eq(platformAccounts.userId, userId));

    const currentAccounts = Number(accountCountResult[0]?.count ?? 0);

    const now = new Date();
    // Persisted status may lag expiry; report the effective state without
    // mutating the account or treating missing expiry as an expired date.
    const effectiveStatus = user.vipStatus === 'active' && user.vipExpiresAt && user.vipExpiresAt.getTime() <= now.getTime() ? 'expired' : user.vipStatus;
    let remainingDays = 0;
    if (user.vipExpiresAt && effectiveStatus === 'active') {
      const diffMs = user.vipExpiresAt.getTime() - now.getTime();
      remainingDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    return {
      status: effectiveStatus,
      planName,
      planCode,
      expiresAt: user.vipExpiresAt ? user.vipExpiresAt.toISOString() : undefined,
      remainingDays,
      maxAccounts: user.maxAccounts,
      currentAccounts,
      durationDays,
    };
  }
}
