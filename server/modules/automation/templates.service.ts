import { Injectable, Inject, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { messageTemplates } from '@server/database/schema';
import { eq, and, like, desc, count } from 'drizzle-orm';
import type { MessageTemplate, PlatformType } from '@shared/api.interface';

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async getTemplates(
    userId: string,
    params: {
      templateType?: string;
      platform?: string;
      auditStatus?: string;
      page: number;
      pageSize: number;
    },
  ): Promise<{ items: MessageTemplate[]; total: number; page: number; pageSize: number }> {
    const { templateType, platform, auditStatus, page, pageSize } = params;
    const conditions = [eq(messageTemplates.userId, userId)];
    if (templateType) conditions.push(eq(messageTemplates.templateType, templateType));
    if (platform) conditions.push(eq(messageTemplates.platform, platform));
    if (auditStatus) conditions.push(eq(messageTemplates.auditStatus, auditStatus));

    const where = and(...conditions);
    const offset = (page - 1) * pageSize;

    const [itemsResult, countResult] = await Promise.all([
      this.db
        .select()
        .from(messageTemplates)
        .where(where)
        .orderBy(desc(messageTemplates.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db.select({ count: count() }).from(messageTemplates).where(where),
    ]);

    const items: MessageTemplate[] = itemsResult.map((row) => this.toDto(row));
    const total = Number(countResult[0]?.count ?? 0);

    return { items, total, page, pageSize };
  }

  async getTemplate(userId: string, id: string): Promise<MessageTemplate> {
    const template = await this.findById(userId, id);
    if (!template) throw new NotFoundException('模板不存在');
    return this.toDto(template);
  }

  async createTemplate(
    userId: string,
    dto: {
      templateName: string;
      templateType: 'text' | 'image' | 'article' | 'link';
      platform?: PlatformType;
      title?: string;
      content?: string;
      mediaUrl?: string;
      linkUrl?: string;
    },
  ): Promise<MessageTemplate> {
    if (!dto.templateName?.trim()) throw new BadRequestException('模板名称不能为空');

    const inserted = await this.db
      .insert(messageTemplates)
      .values({
        userId,
        templateName: dto.templateName,
        templateType: dto.templateType ?? 'text',
        platform: dto.platform,
        title: dto.title,
        content: dto.content,
        mediaUrl: dto.mediaUrl,
        linkUrl: dto.linkUrl,
      })
      .returning();

    return this.toDto(inserted[0]);
  }

  async updateTemplate(
    userId: string,
    id: string,
    dto: {
      templateName?: string;
      templateType?: 'text' | 'image' | 'article' | 'link';
      platform?: PlatformType;
      title?: string;
      content?: string;
      mediaUrl?: string;
      linkUrl?: string;
      isEnabled?: boolean;
    },
  ): Promise<MessageTemplate> {
    const template = await this.findById(userId, id);
    if (!template) throw new NotFoundException('模板不存在');
    if (template.auditStatus === 'pending_review') {
      throw new ConflictException('审核中的模板无法编辑');
    }

    const patch: Partial<typeof messageTemplates.$inferInsert> = {};
    if (dto.templateName !== undefined) patch.templateName = dto.templateName;
    if (dto.templateType !== undefined) patch.templateType = dto.templateType;
    if (dto.platform !== undefined) patch.platform = dto.platform;
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.content !== undefined) patch.content = dto.content;
    if (dto.mediaUrl !== undefined) patch.mediaUrl = dto.mediaUrl;
    if (dto.linkUrl !== undefined) patch.linkUrl = dto.linkUrl;
    if (dto.isEnabled !== undefined) patch.isEnabled = dto.isEnabled;

    if (Object.keys(patch).length === 0) return this.toDto(template);

    if (template.auditStatus === 'approved') {
      patch.auditStatus = 'draft';
    }

    const updated = await this.db
      .update(messageTemplates)
      .set(patch)
      .where(eq(messageTemplates.id, id))
      .returning();

    return this.toDto(updated[0]);
  }

  async deleteTemplate(userId: string, id: string): Promise<void> {
    const template = await this.findById(userId, id);
    if (!template) throw new NotFoundException('模板不存在');
    await this.db.delete(messageTemplates).where(eq(messageTemplates.id, id));
  }

  async submitTemplate(userId: string, id: string): Promise<MessageTemplate> {
    const template = await this.findById(userId, id);
    if (!template) throw new NotFoundException('模板不存在');
    if (!['draft', 'rejected'].includes(template.auditStatus)) {
      throw new ConflictException('当前状态不支持提交审核');
    }

    const updated = await this.db
      .update(messageTemplates)
      .set({ auditStatus: 'pending_review' })
      .where(eq(messageTemplates.id, id))
      .returning();

    return this.toDto(updated[0]);
  }

  private async findById(userId: string, id: string) {
    const result = await this.db
      .select()
      .from(messageTemplates)
      .where(and(eq(messageTemplates.id, id), eq(messageTemplates.userId, userId)));
    return result[0] ?? null;
  }

  private toDto(row: typeof messageTemplates.$inferSelect): MessageTemplate {
    return {
      id: row.id,
      templateType: row.templateType as 'text' | 'image' | 'article' | 'link',
      templateName: row.templateName,
      platform: (row.platform as PlatformType) ?? undefined,
      title: row.title ?? undefined,
      content: row.content ?? undefined,
      mediaUrl: row.mediaUrl ?? undefined,
      linkUrl: row.linkUrl ?? undefined,
      auditStatus: this.normalizeAuditStatus(row.auditStatus),
      platformTemplateId: row.platformTemplateId ?? undefined,
      isEnabled: row.isEnabled,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private normalizeAuditStatus(status: string): 'draft' | 'pending' | 'approved' | 'rejected' {
    switch (status) {
      case 'pending_review':
        return 'pending';
      case 'approved':
        return 'approved';
      case 'rejected':
        return 'rejected';
      default:
        return 'draft';
    }
  }
}
