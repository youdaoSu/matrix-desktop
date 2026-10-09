import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { MediaAssetType } from '@shared/api.interface';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller('api/media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  async getAssets(
    @Req() req: AuthenticatedRequest,
    @Query('assetType') assetType?: string,
    @Query('category') category?: string,
    @Query('keyword') keyword?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const userId = req.user.userId;
    const result = await this.mediaService.getAssets(userId, {
      assetType,
      category,
      keyword,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
    });
    return { code: 0, message: 'success', data: result };
  }

  @Get('categories')
  async getCategories(@Req() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    const result = await this.mediaService.getCategories(userId);
    return { code: 0, message: 'success', data: result };
  }

  @Get(':id')
  async getAsset(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    const result = await this.mediaService.getAsset(userId, id);
    return { code: 0, message: 'success', data: result };
  }

  @Post()
  async createAsset(
    @Req() req: AuthenticatedRequest,
    @Body() body: {
      title: string;
      assetType: MediaAssetType;
      fileUrl: string;
      fileSize: number;
      fileFormat?: string;
      category?: string;
      tags?: string[];
      description?: string;
    },
  ) {
    const userId = req.user.userId;
    const result = await this.mediaService.createAsset(userId, body);
    return { code: 0, message: 'success', data: result };
  }

  @Put(':id')
  async updateAsset(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: {
      title?: string;
      assetType?: MediaAssetType;
      fileUrl?: string;
      fileSize?: number;
      fileFormat?: string;
      category?: string;
      tags?: string[];
      description?: string;
    },
  ) {
    const userId = req.user.userId;
    const result = await this.mediaService.updateAsset(userId, id, body);
    return { code: 0, message: 'success', data: result };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteAsset(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    await this.mediaService.deleteAsset(userId, id);
    return { code: 0, message: 'success', data: null };
  }

  @Post('batch-delete')
  @HttpCode(HttpStatus.OK)
  async batchDelete(@Req() req: AuthenticatedRequest, @Body() body: { ids: string[] }) {
    const userId = req.user.userId;
    const result = await this.mediaService.batchDelete(userId, body.ids);
    return { code: 0, message: 'success', data: result };
  }
}
