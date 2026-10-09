import { Injectable, Inject, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { mediaAssets } from '@server/database/schema';
import { eq, and, desc, count, inArray, like, or, sql } from 'drizzle-orm';
import type { MediaAsset, MediaAssetType } from '@shared/api.interface';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async getAssets(
    userId: string,
    params: {
      assetType?: string;
      category?: string;
      keyword?: string;
      page: number;
      pageSize: number;
    },
  ): Promise<{ items: MediaAsset[]; total: number; page: number; pageSize: number }> {
    const { assetType, category, keyword, page, pageSize } = params;
    const conditions = [eq(mediaAssets.userId, userId)];
    if (assetType) conditions.push(eq(mediaAssets.assetType, assetType));
    if (category) conditions.push(eq(mediaAssets.category, category));
    if (keyword) {
      conditions.push(
        or(
          like(mediaAssets.title, `%${keyword}%`),
          like(mediaAssets.description, `%${keyword}%`),
        ),
      );
    }

    const where = and(...conditions);
    const offset = (page - 1) * pageSize;

    const [itemsResult, countResult] = await Promise.all([
      this.db
        .select()
        .from(mediaAssets)
        .where(where)
        .orderBy(desc(mediaAssets.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db.select({ count: count() }).from(mediaAssets).where(where),
    ]);

    const items: MediaAsset[] = itemsResult.map((row) => this.toDto(row));
    const total = Number(countResult[0]?.count ?? 0);

    return { items, total, page, pageSize };
  }

  async getAsset(userId: string, id: string): Promise<MediaAsset> {
    const asset = await this.findById(userId, id);
    if (!asset) {
      throw new NotFoundException('素材不存在');
    }
    return this.toDto(asset);
  }

  async createAsset(
    userId: string,
    data: {
      title: string;
      assetType: MediaAssetType;
      fileUrl: string;
      fileSize: number;
      fileFormat?: string;
      category?: string;
      tags?: string[];
      description?: string;
    },
  ): Promise<MediaAsset> {
    if (!data.title || !data.fileUrl) {
      throw new BadRequestException('标题和文件URL不能为空');
    }

    const inserted = await this.db
      .insert(mediaAssets)
      .values({
        userId,
        title: data.title,
        assetType: data.assetType,
        fileUrl: data.fileUrl,
        fileSize: data.fileSize,
        fileFormat: data.fileFormat,
        category: data.category,
        tags: data.tags ?? [],
        description: data.description,
      })
      .returning();

    return this.toDto(inserted[0]);
  }

  async updateAsset(
    userId: string,
    id: string,
    data: {
      title?: string;
      assetType?: MediaAssetType;
      fileUrl?: string;
      fileSize?: number;
      fileFormat?: string;
      category?: string;
      tags?: string[];
      description?: string;
    },
  ): Promise<MediaAsset> {
    const asset = await this.findById(userId, id);
    if (!asset) {
      throw new NotFoundException('素材不存在');
    }

    const patch: Partial<typeof mediaAssets.$inferInsert> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.assetType !== undefined) patch.assetType = data.assetType;
    if (data.fileUrl !== undefined) patch.fileUrl = data.fileUrl;
    if (data.fileSize !== undefined) patch.fileSize = data.fileSize;
    if (data.fileFormat !== undefined) patch.fileFormat = data.fileFormat;
    if (data.category !== undefined) patch.category = data.category;
    if (data.tags !== undefined) patch.tags = data.tags;
    if (data.description !== undefined) patch.description = data.description;

    if (Object.keys(patch).length === 0) {
      return this.toDto(asset);
    }

    const updated = await this.db
      .update(mediaAssets)
      .set(patch)
      .where(eq(mediaAssets.id, id))
      .returning();

    return this.toDto(updated[0]);
  }

  async deleteAsset(userId: string, id: string): Promise<void> {
    const asset = await this.findById(userId, id);
    if (!asset) {
      throw new NotFoundException('素材不存在');
    }
    if (asset.userId !== userId) {
      throw new ForbiddenException('无权操作此素材');
    }
    await this.db.delete(mediaAssets).where(eq(mediaAssets.id, id));
  }

  async batchDelete(userId: string, ids: string[]): Promise<{ deleted: number }> {
    if (!ids || ids.length === 0) {
      throw new BadRequestException('请选择要删除的素材');
    }
    const deleted = await this.db
      .delete(mediaAssets)
      .where(and(eq(mediaAssets.userId, userId), inArray(mediaAssets.id, ids)))
      .returning({ id: mediaAssets.id });
    return { deleted: deleted.length };
  }

  async getCategories(userId: string): Promise<string[]> {
    const result = await this.db
      .selectDistinct({ category: mediaAssets.category })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.userId, userId), sql`${mediaAssets.category} IS NOT NULL`))
      .orderBy(mediaAssets.category);

    return result.map((row: { category: string | null }) => row.category).filter((c): c is string => !!c);
  }

  private async findById(userId: string, id: string) {
    const result = await this.db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, id), eq(mediaAssets.userId, userId)));
    return result[0] ?? null;
  }

  private toDto(row: typeof mediaAssets.$inferSelect): MediaAsset {
    return {
      id: row.id,
      userId: row.userId,
      assetType: row.assetType as MediaAssetType,
      title: row.title,
      fileUrl: row.fileUrl,
      fileSize: Number(row.fileSize),
      fileFormat: row.fileFormat ?? undefined,
      width: row.width ?? undefined,
      height: row.height ?? undefined,
      duration: row.duration ?? undefined,
      category: row.category ?? undefined,
      tags: row.tags ?? [],
      description: row.description ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
