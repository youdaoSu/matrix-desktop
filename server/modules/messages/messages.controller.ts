import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller('api/messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('sessions')
  async getSessions(
    @Req() req: AuthenticatedRequest,
    @Query('platform') platform?: string,
    @Query('accountId') accountId?: string,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('keyword') keyword?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const userId = req.user.userId;
    const result = await this.messagesService.getSessions(userId, {
      platform,
      accountId,
      unreadOnly: unreadOnly === 'true',
      keyword,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
    });
    return { code: 0, message: 'success', data: result };
  }

  @Get('sessions/:sessionId/messages')
  async getMessages(
    @Req() req: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const userId = req.user.userId;
    const result = await this.messagesService.getMessages(
      userId,
      sessionId,
      parseInt(page, 10),
      parseInt(pageSize, 10),
    );
    return { code: 0, message: 'success', data: result };
  }

  @Post('sessions/:sessionId/messages')
  async sendMessage(
    @Req() req: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
    @Body() body: {
      content?: string;
      msgType: 'text' | 'image' | 'video';
      mediaUrl?: string;
      sendAccountId?: string;
    },
  ) {
    const userId = req.user.userId;
    const result = await this.messagesService.sendMessage(userId, sessionId, body);
    return { code: 0, message: 'success', data: result };
  }

  @Post('sessions/:sessionId/read')
  async markAsRead(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string) {
    const userId = req.user.userId;
    await this.messagesService.markAsRead(userId, sessionId);
    return { code: 0, message: 'success', data: null };
  }

  @Post('sessions/:sessionId/pin')
  async togglePin(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string) {
    const userId = req.user.userId;
    const result = await this.messagesService.togglePin(userId, sessionId);
    return { code: 0, message: 'success', data: result };
  }

  @Get('quick-replies')
  async getQuickReplies(@Req() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    const result = await this.messagesService.getQuickReplies(userId);
    return { code: 0, message: 'success', data: result };
  }

  @Post('quick-replies')
  async createQuickReply(
    @Req() req: AuthenticatedRequest,
    @Body() body: {
      category?: string;
      title: string;
      content: string;
      sortOrder?: number;
    },
  ) {
    const userId = req.user.userId;
    const result = await this.messagesService.createQuickReply(userId, body);
    return { code: 0, message: 'success', data: result };
  }

  @Put('quick-replies/:id')
  async updateQuickReply(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: {
      category?: string;
      title?: string;
      content?: string;
      sortOrder?: number;
    },
  ) {
    const userId = req.user.userId;
    const result = await this.messagesService.updateQuickReply(userId, id, body);
    return { code: 0, message: 'success', data: result };
  }

  @Delete('quick-replies/:id')
  @HttpCode(HttpStatus.OK)
  async deleteQuickReply(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    await this.messagesService.deleteQuickReply(userId, id);
    return { code: 0, message: 'success', data: null };
  }

  @Get('stats')
  async getStats(@Req() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    const result = await this.messagesService.getStats(userId);
    return { code: 0, message: 'success', data: result };
  }
}
