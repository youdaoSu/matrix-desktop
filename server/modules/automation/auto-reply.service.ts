import { Injectable, Inject, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { autoReplyRules } from '@server/database/schema';
import { eq, and, desc, count, inArray } from 'drizzle-orm';
import type { AutoReplyRule } from '@shared/api.interface';

@Injectable()
export class AutoReplyService {
  private readonly logger = new Logger(AutoReplyService.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async getRules(
    userId: string,
    params: {
      ruleType?: string;
      platform?: string;
      isEnabled?: boolean;
      page: number;
      pageSize: number;
    },
  ): Promise<{ items: AutoReplyRule[]; total: number; page: number; pageSize: number }> {
    const { ruleType, platform, isEnabled, page, pageSize } = params;
    const conditions = [eq(autoReplyRules.userId, userId)];
    if (ruleType) conditions.push(eq(autoReplyRules.ruleType, ruleType));
    if (platform) conditions.push(eq(autoReplyRules.platform, platform));
    if (isEnabled !== undefined) conditions.push(eq(autoReplyRules.isEnabled, isEnabled));

    const where = and(...conditions);
    const offset = (page - 1) * pageSize;

    const [itemsResult, countResult] = await Promise.all([
      this.db
        .select()
        .from(autoReplyRules)
        .where(where)
        .orderBy(autoReplyRules.priority, desc(autoReplyRules.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db.select({ count: count() }).from(autoReplyRules).where(where),
    ]);

    const items: AutoReplyRule[] = itemsResult.map((row) => this.toDto(row));
    const total = Number(countResult[0]?.count ?? 0);

    return { items, total, page, pageSize };
  }

  async getRule(userId: string, id: string): Promise<AutoReplyRule> {
    const result = await this.db
      .select()
      .from(autoReplyRules)
      .where(and(eq(autoReplyRules.id, id), eq(autoReplyRules.userId, userId)));
    if (result.length === 0) throw new NotFoundException('规则不存在');
    return this.toDto(result[0]);
  }

  async createRule(
    userId: string,
    data: {
      ruleType: string;
      ruleName: string;
      platform?: string;
      accountId?: string;
      keywords?: string[];
      matchMode?: string;
      replyContent?: string;
      replyType?: string;
      replyMediaUrl?: string;
      priority?: number;
    },
  ): Promise<AutoReplyRule> {
    if (!data.ruleType || !data.ruleName) {
      throw new BadRequestException('规则类型和名称不能为空');
    }

    const inserted = await this.db
      .insert(autoReplyRules)
      .values({
        userId,
        ruleType: data.ruleType,
        ruleName: data.ruleName,
        platform: data.platform,
        accountId: data.accountId,
        keywords: data.keywords ?? [],
        matchMode: data.matchMode ?? 'exact',
        replyContent: data.replyContent,
        replyType: data.replyType ?? 'text',
        replyMediaUrl: data.replyMediaUrl,
        priority: data.priority ?? 0,
      })
      .returning();

    return this.toDto(inserted[0]);
  }

  async updateRule(
    userId: string,
    id: string,
    data: {
      ruleName?: string;
      keywords?: string[];
      matchMode?: string;
      replyContent?: string;
      replyType?: string;
      replyMediaUrl?: string;
      priority?: number;
      isEnabled?: boolean;
    },
  ): Promise<AutoReplyRule> {
    const existing = await this.db
      .select()
      .from(autoReplyRules)
      .where(and(eq(autoReplyRules.id, id), eq(autoReplyRules.userId, userId)));
    if (existing.length === 0) throw new NotFoundException('规则不存在');

    const patch: Partial<typeof autoReplyRules.$inferInsert> = {};
    if (data.ruleName !== undefined) patch.ruleName = data.ruleName;
    if (data.keywords !== undefined) patch.keywords = data.keywords;
    if (data.matchMode !== undefined) patch.matchMode = data.matchMode;
    if (data.replyContent !== undefined) patch.replyContent = data.replyContent;
    if (data.replyType !== undefined) patch.replyType = data.replyType;
    if (data.replyMediaUrl !== undefined) patch.replyMediaUrl = data.replyMediaUrl;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.isEnabled !== undefined) patch.isEnabled = data.isEnabled;

    if (Object.keys(patch).length === 0) return this.toDto(existing[0]);

    const updated = await this.db
      .update(autoReplyRules)
      .set(patch)
      .where(eq(autoReplyRules.id, id))
      .returning();
    return this.toDto(updated[0]);
  }

  async deleteRule(userId: string, id: string): Promise<void> {
    const existing = await this.db
      .select()
      .from(autoReplyRules)
      .where(and(eq(autoReplyRules.id, id), eq(autoReplyRules.userId, userId)));
    if (existing.length === 0) throw new NotFoundException('规则不存在');
    await this.db.delete(autoReplyRules).where(eq(autoReplyRules.id, id));
  }

  async toggleRule(userId: string, id: string): Promise<AutoReplyRule> {
    const existing = await this.db
      .select()
      .from(autoReplyRules)
      .where(and(eq(autoReplyRules.id, id), eq(autoReplyRules.userId, userId)));
    if (existing.length === 0) throw new NotFoundException('规则不存在');

    const newStatus = !existing[0].isEnabled;
    const updated = await this.db
      .update(autoReplyRules)
      .set({ isEnabled: newStatus })
      .where(eq(autoReplyRules.id, id))
      .returning();
    return this.toDto(updated[0]);
  }

  async testRule(
    userId: string,
    id: string,
    testText: string,
  ): Promise<{ hit: boolean; replyContent?: string; replyType?: string; hitKeyword?: string }> {
    const existing = await this.db
      .select()
      .from(autoReplyRules)
      .where(and(eq(autoReplyRules.id, id), eq(autoReplyRules.userId, userId)));
    if (existing.length === 0) throw new NotFoundException('规则不存在');

    const rule = existing[0];
    const text = testText.trim();

    if (rule.ruleType === 'welcome') {
      return {
        hit: true,
        replyContent: rule.replyContent ?? '',
        replyType: rule.replyType,
        hitKeyword: 'welcome',
      };
    }

    if (rule.ruleType === 'offline' || rule.ruleType === 'timeout') {
      return {
        hit: true,
        replyContent: rule.replyContent ?? '',
        replyType: rule.replyType,
      };
    }

    // keyword rule
    const keywords = rule.keywords ?? [];
    if (keywords.length === 0) {
      return { hit: false };
    }

    let hit = false;
    let hitKeyword: string | undefined;

    for (const kw of keywords) {
      if (rule.matchMode === 'exact' && text === kw) {
        hit = true;
        hitKeyword = kw;
        break;
      }
      if (rule.matchMode === 'contains' && text.includes(kw)) {
        hit = true;
        hitKeyword = kw;
        break;
      }
      if (rule.matchMode === 'fuzzy') {
        // simple fuzzy: check if all chars appear in order
        let idx = 0;
        for (const ch of kw) {
          idx = text.indexOf(ch, idx);
          if (idx === -1) break;
          idx += 1;
        }
        if (idx !== -1) {
          hit = true;
          hitKeyword = kw;
          break;
        }
      }
    }

    return {
      hit,
      replyContent: hit ? rule.replyContent ?? '' : undefined,
      replyType: hit ? rule.replyType : undefined,
      hitKeyword,
    };
  }

  private toDto(row: typeof autoReplyRules.$inferSelect): AutoReplyRule {
    return {
      id: row.id,
      ruleType: row.ruleType as AutoReplyRule['ruleType'],
      ruleName: row.ruleName,
      platform: (row.platform as AutoReplyRule['platform']) ?? undefined,
      accountId: row.accountId ?? undefined,
      keywords: row.keywords ?? undefined,
      matchMode: row.matchMode as AutoReplyRule['matchMode'],
      replyContent: row.replyContent ?? undefined,
      replyType: row.replyType as AutoReplyRule['replyType'],
      replyMediaUrl: row.replyMediaUrl ?? undefined,
      priority: row.priority,
      isEnabled: row.isEnabled,
      hitCount: row.hitCount,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
