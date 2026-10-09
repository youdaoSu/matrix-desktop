import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AutoMessageService } from './auto-message.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller('api/automation/auto-message-tasks')
@UseGuards(JwtAuthGuard)
export class AutoMessageController {
  constructor(private readonly autoMessageService: AutoMessageService) {}

  @Get()
  async getTasks(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const userId = req.user.userId;
    const result = await this.autoMessageService.getTasks(userId, {
      status,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
    });
    return { code: 0, message: 'success', data: result };
  }

  @Get(':id')
  async getTask(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    const result = await this.autoMessageService.getTask(userId, id);
    return { code: 0, message: 'success', data: result };
  }

  @Get(':id/items')
  async getTaskItems(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const userId = req.user.userId;
    const result = await this.autoMessageService.getTaskItems(userId, id, {
      status,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
    });
    return { code: 0, message: 'success', data: result };
  }

  @Post()
  async createTask(
    @Req() req: AuthenticatedRequest,
    @Body() body: {
      taskName: string;
      senderAccountId: string;
      msgType: 'text' | 'image' | 'link' | 'article';
      content?: string;
      mediaUrl?: string;
      linkTitle?: string;
      linkUrl?: string;
      frequencyLimitHour?: number;
      frequencyLimitDay?: number;
      minIntervalSeconds?: number;
      maxIntervalSeconds?: number;
    },
  ) {
    const userId = req.user.userId;
    const result = await this.autoMessageService.createTask(userId, body);
    return { code: 0, message: 'success', data: result };
  }

  @Patch(':id')
  async updateTask(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: {
      taskName?: string;
      senderAccountId?: string;
      msgType?: 'text' | 'image' | 'link' | 'article';
      content?: string;
      mediaUrl?: string;
      linkTitle?: string;
      linkUrl?: string;
      frequencyLimitHour?: number;
      frequencyLimitDay?: number;
      minIntervalSeconds?: number;
      maxIntervalSeconds?: number;
    },
  ) {
    const userId = req.user.userId;
    const result = await this.autoMessageService.updateTask(userId, id, body);
    return { code: 0, message: 'success', data: result };
  }

  @Post(':id/start')
  async startTask(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    const result = await this.autoMessageService.startTask(userId, id);
    return { code: 0, message: 'success', data: result };
  }

  @Post(':id/pause')
  async pauseTask(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    const result = await this.autoMessageService.pauseTask(userId, id);
    return { code: 0, message: 'success', data: result };
  }

  @Post(':id/stop')
  async stopTask(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    const result = await this.autoMessageService.stopTask(userId, id);
    return { code: 0, message: 'success', data: result };
  }

  @Delete(':id')
  async deleteTask(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    await this.autoMessageService.deleteTask(userId, id);
    return { code: 0, message: 'success', data: null };
  }

  @Post(':id/retry-failed')
  async retryFailed(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    const result = await this.autoMessageService.retryFailed(userId, id);
    return { code: 0, message: 'success', data: result };
  }
}
