import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller('api/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('announcements')
  async getAnnouncements(@Query('limit') limit = '20') {
    const result = await this.notificationsService.getPublishedAnnouncements(parseInt(limit, 10));
    return { code: 0, message: 'success', data: result };
  }

  @Get()
  async getNotifications(
    @Req() req: AuthenticatedRequest,
    @Query('type') type?: string,
    @Query('isRead') isRead?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const userId = req.user.userId;
    const result = await this.notificationsService.getNotifications(userId, {
      type,
      isRead: isRead !== undefined ? isRead === 'true' : undefined,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
    });
    return { code: 0, message: 'success', data: result };
  }

  @Get('unread-count')
  async getUnreadCount(@Req() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    const result = await this.notificationsService.getUnreadCount(userId);
    return { code: 0, message: 'success', data: result };
  }

  @Post(':id/read')
  async markAsRead(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    const result = await this.notificationsService.markAsRead(userId, id);
    return { code: 0, message: 'success', data: result };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllAsRead(@Req() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    const result = await this.notificationsService.markAllAsRead(userId);
    return { code: 0, message: 'success', data: result };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteNotification(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    await this.notificationsService.deleteNotification(userId, id);
    return { code: 0, message: 'success', data: null };
  }

  @Delete('clear')
  @HttpCode(HttpStatus.OK)
  async clearRead(@Req() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    const result = await this.notificationsService.clearRead(userId);
    return { code: 0, message: 'success', data: result };
  }
}
