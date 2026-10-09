import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { MonitorService } from './monitor.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller('api/automation/monitor-tasks')
@UseGuards(JwtAuthGuard)
export class MonitorController {
  constructor(private readonly monitorService: MonitorService) {}

  @Get()
  async getMonitorTasks(
    @Req() req: AuthenticatedRequest,
    @Query('monitorType') monitorType?: string,
    @Query('isEnabled') isEnabled?: string,
    @Query('keyword') keyword?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const userId = req.user.userId;
    const result = await this.monitorService.getMonitorTasks(userId, {
      monitorType,
      isEnabled: isEnabled !== undefined ? isEnabled === 'true' : undefined,
      keyword,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
    });
    return { code: 0, message: 'success', data: result };
  }

  @Get('hit-records')
  async getHitRecords(
    @Req() req: AuthenticatedRequest,
    @Query('taskId') taskId?: string,
    @Query('actionStatus') actionStatus?: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const userId = req.user.userId;
    const result = await this.monitorService.getHitRecords(userId, {
      taskId,
      actionStatus,
      startTime,
      endTime,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
    });
    return { code: 0, message: 'success', data: result };
  }

  @Get(':id')
  async getMonitorTask(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    const result = await this.monitorService.getMonitorTask(userId, id);
    return { code: 0, message: 'success', data: result };
  }

  @Post()
  async createMonitorTask(
    @Req() req: AuthenticatedRequest,
    @Body() body: {
      taskName: string;
      monitorType: 'new_follower' | 'message_keyword' | 'comment_keyword';
      monitoredAccountIds: string[];
      keywords: string[];
      matchMode: 'exact' | 'contains' | 'fuzzy';
      actionType: 'reply_message' | 'reply_comment';
      actionAccountId?: string;
      actionContent?: string;
      actionMediaUrl?: string;
      actionMediaType?: 'text' | 'image' | 'link';
      actionDelaySeconds?: number;
      frequencyLimitHour?: number;
      frequencyLimitDay?: number;
      minIntervalSeconds?: number;
      maxIntervalSeconds?: number;
    },
  ) {
    const userId = req.user.userId;
    const result = await this.monitorService.createMonitorTask(userId, body);
    return { code: 0, message: 'success', data: result };
  }

  @Patch(':id')
  async updateMonitorTask(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: {
      taskName?: string;
      monitorType?: 'new_follower' | 'message_keyword' | 'comment_keyword';
      monitoredAccountIds?: string[];
      keywords?: string[];
      matchMode?: 'exact' | 'contains' | 'fuzzy';
      actionType?: 'reply_message' | 'reply_comment';
      actionAccountId?: string;
      actionContent?: string;
      actionMediaUrl?: string;
      actionMediaType?: 'text' | 'image' | 'link';
      actionDelaySeconds?: number;
      frequencyLimitHour?: number;
      frequencyLimitDay?: number;
      minIntervalSeconds?: number;
      maxIntervalSeconds?: number;
    },
  ) {
    const userId = req.user.userId;
    const result = await this.monitorService.updateMonitorTask(userId, id, body);
    return { code: 0, message: 'success', data: result };
  }

  @Delete(':id')
  async deleteMonitorTask(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    await this.monitorService.deleteMonitorTask(userId, id);
    return { code: 0, message: 'success', data: null };
  }

  @Post(':id/toggle')
  async toggleMonitorTask(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    const result = await this.monitorService.toggleMonitorTask(userId, id);
    return { code: 0, message: 'success', data: result };
  }

  @Post(':id/records')
  async createHitRecord(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: {
      monitorType: 'new_follower' | 'message_keyword' | 'comment_keyword';
      triggeredAccountId: string;
      hitKeyword?: string;
      targetUserPlatformId: string;
      targetUserNickname?: string;
      targetUserAvatarUrl?: string;
      sourceContent?: string;
      actionType: 'reply_message' | 'reply_comment';
      actionStatus?: 'pending' | 'success' | 'failed';
      actionFailReason?: string;
    },
  ) {
    const userId = req.user.userId;
    const result = await this.monitorService.createHitRecord(userId, id, body);
    return { code: 0, message: 'success', data: result };
  }
}
