import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ContentService } from './content.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller('api/content')
@UseGuards(JwtAuthGuard)
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get('posts')
  async getPosts(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('platform') platform?: string,
    @Query('accountId') accountId?: string,
    @Query('keyword') keyword?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const userId = req.user.userId;
    const result = await this.contentService.getPosts(userId, {
      status,
      platform,
      accountId,
      keyword,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
    });
    return { code: 0, message: 'success', data: result };
  }

  @Get('posts/:id')
  async getPost(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    const result = await this.contentService.getPost(userId, id);
    return { code: 0, message: 'success', data: result };
  }

  @Post('posts')
  async createPost(@Req() req: AuthenticatedRequest, @Body() body: {
    title?: string;
    content?: string;
    coverUrl?: string;
    tags?: string[];
    mediaType: 'text' | 'image' | 'video';
    mediaUrls?: string[];
    accountIds: string[];
    status?: string;
  }) {
    const userId = req.user.userId;
    const result = await this.contentService.createPost(userId, body);
    return { code: 0, message: 'success', data: result };
  }

  @Put('posts/:id')
  async updatePost(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: {
      title?: string;
      content?: string;
      coverUrl?: string;
      tags?: string[];
      mediaType?: 'text' | 'image' | 'video';
      mediaUrls?: string[];
    },
  ) {
    const userId = req.user.userId;
    const result = await this.contentService.updatePost(userId, id, body);
    return { code: 0, message: 'success', data: result };
  }

  @Delete('posts/:id')
  @HttpCode(HttpStatus.OK)
  async deletePost(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    await this.contentService.deletePost(userId, id);
    return { code: 0, message: 'success', data: null };
  }

  @Post('posts/:id/publish')
  async publishPost(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    const result = await this.contentService.publishPost(userId, id);
    return { code: 0, message: 'success', data: result };
  }

  @Post('posts/:id/schedule')
  async schedulePost(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { scheduledAt: string },
  ) {
    const userId = req.user.userId;
    const result = await this.contentService.schedulePost(userId, id, body.scheduledAt);
    return { code: 0, message: 'success', data: result };
  }

  @Post('posts/:id/cancel-schedule')
  async cancelSchedule(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    const result = await this.contentService.cancelSchedule(userId, id);
    return { code: 0, message: 'success', data: result };
  }

  @Get('stats')
  async getStats(@Req() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    const result = await this.contentService.getStats(userId);
    return { code: 0, message: 'success', data: result };
  }

  @Get('drafts')
  async getDrafts(
    @Req() req: AuthenticatedRequest,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const userId = req.user.userId;
    const result = await this.contentService.getDrafts(
      userId,
      parseInt(page, 10),
      parseInt(pageSize, 10),
    );
    return { code: 0, message: 'success', data: result };
  }

  @Get('scheduled')
  async getScheduled(
    @Req() req: AuthenticatedRequest,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const userId = req.user.userId;
    const result = await this.contentService.getScheduled(
      userId,
      parseInt(page, 10),
      parseInt(pageSize, 10),
    );
    return { code: 0, message: 'success', data: result };
  }

  @Get('history')
  async getHistory(
    @Req() req: AuthenticatedRequest,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const userId = req.user.userId;
    const result = await this.contentService.getHistory(
      userId,
      parseInt(page, 10),
      parseInt(pageSize, 10),
    );
    return { code: 0, message: 'success', data: result };
  }
}
