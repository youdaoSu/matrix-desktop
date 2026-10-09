import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CommentsService } from './comments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller('api/comments')
@UseGuards(JwtAuthGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  async getComments(
    @Req() req: AuthenticatedRequest,
    @Query('platform') platform?: string,
    @Query('accountId') accountId?: string,
    @Query('postId') postId?: string,
    @Query('isReplied') isReplied?: string,
    @Query('keyword') keyword?: string,
    @Query('isSensitive') isSensitive?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const userId = req.user.userId;
    const result = await this.commentsService.getComments(userId, {
      platform,
      accountId,
      postId,
      isReplied: isReplied !== undefined ? isReplied === 'true' : undefined,
      keyword,
      isSensitive: isSensitive !== undefined ? isSensitive === 'true' : undefined,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
    });
    return { code: 0, message: 'success', data: result };
  }

  @Post(':id/reply')
  async replyComment(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { replyContent: string; replyAccountId?: string },
  ) {
    const userId = req.user.userId;
    const result = await this.commentsService.replyComment(
      userId,
      id,
      body.replyContent,
      body.replyAccountId,
    );
    return { code: 0, message: 'success', data: result };
  }

  @Post(':id/reply-private-message')
  async replyPrivateMessage(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { replyAccountId: string; content: string },
  ) {
    const userId = req.user.userId;
    const result = await this.commentsService.replyPrivateMessage(
      userId,
      id,
      body.replyAccountId,
      body.content,
    );
    return { code: 0, message: 'success', data: result };
  }

  @Post(':id/like')
  async likeComment(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    const result = await this.commentsService.likeComment(userId, id);
    return { code: 0, message: 'success', data: result };
  }

  @Get('stats')
  async getStats(@Req() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    const result = await this.commentsService.getStats(userId);
    return { code: 0, message: 'success', data: result };
  }

  @Get('auto-rules')
  async getAutoRules(
    @Req() req: AuthenticatedRequest,
    @Query('platform') platform?: string,
    @Query('isEnabled') isEnabled?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const userId = req.user.userId;
    const result = await this.commentsService.getAutoRules(userId, {
      platform,
      isEnabled: isEnabled !== undefined ? isEnabled === 'true' : undefined,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
    });
    return { code: 0, message: 'success', data: result };
  }

  @Post('auto-rules')
  async createAutoRule(
    @Req() req: AuthenticatedRequest,
    @Body() body: {
      ruleName: string;
      platform?: string;
      accountId?: string;
      keywords?: string[];
      replyContent?: string;
      replyType?: string;
      priority?: number;
    },
  ) {
    const userId = req.user.userId;
    const result = await this.commentsService.createAutoRule(userId, body);
    return { code: 0, message: 'success', data: result };
  }

  @Put('auto-rules/:id')
  async updateAutoRule(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: {
      ruleName?: string;
      keywords?: string[];
      replyContent?: string;
      replyType?: string;
      priority?: number;
      isEnabled?: boolean;
    },
  ) {
    const userId = req.user.userId;
    const result = await this.commentsService.updateAutoRule(userId, id, body);
    return { code: 0, message: 'success', data: result };
  }

  @Delete('auto-rules/:id')
  @HttpCode(HttpStatus.OK)
  async deleteAutoRule(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    await this.commentsService.deleteAutoRule(userId, id);
    return { code: 0, message: 'success', data: null };
  }

  @Post('batch-reply')
  @HttpCode(HttpStatus.OK)
  async batchReply(
    @Req() req: AuthenticatedRequest,
    @Body() body: { commentIds: string[]; replyContent: string; replyAccountId?: string },
  ) {
    const userId = req.user.userId;
    const result = await this.commentsService.batchReply(
      userId,
      body.commentIds,
      body.replyContent,
      body.replyAccountId,
    );
    return { code: 0, message: 'success', data: result };
  }

  @Post('batch-read')
  @HttpCode(HttpStatus.OK)
  async batchRead(@Req() req: AuthenticatedRequest, @Body() body: { commentIds: string[] }) {
    const userId = req.user.userId;
    const result = await this.commentsService.batchMarkRead(userId, body.commentIds);
    return { code: 0, message: 'success', data: result };
  }

  @Post('batch-tag')
  @HttpCode(HttpStatus.OK)
  async batchTag(
    @Req() req: AuthenticatedRequest,
    @Body() body: { commentIds: string[]; tags: string[] },
  ) {
    const userId = req.user.userId;
    const result = await this.commentsService.batchTag(userId, body.commentIds, body.tags);
    return { code: 0, message: 'success', data: result };
  }

  @Get('sensitive-check')
  async sensitiveCheck(@Query('text') text: string) {
    const result = await this.commentsService.sensitiveCheck(text);
    return { code: 0, message: 'success', data: result };
  }
}
