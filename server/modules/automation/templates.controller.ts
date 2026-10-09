import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { TemplatesService } from './templates.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller('api/automation/templates')
@UseGuards(JwtAuthGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  async getTemplates(
    @Req() req: AuthenticatedRequest,
    @Query('templateType') templateType?: string,
    @Query('platform') platform?: string,
    @Query('auditStatus') auditStatus?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const userId = req.user.userId;
    const result = await this.templatesService.getTemplates(userId, {
      templateType,
      platform,
      auditStatus,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
    });
    return { code: 0, message: 'success', data: result };
  }

  @Get(':id')
  async getTemplate(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    const result = await this.templatesService.getTemplate(userId, id);
    return { code: 0, message: 'success', data: result };
  }

  @Post()
  async createTemplate(
    @Req() req: AuthenticatedRequest,
    @Body() body: {
      templateName: string;
      templateType: 'text' | 'image' | 'article' | 'link';
      platform?: 'douyin' | 'xiaohongshu' | 'wechat' | 'bilibili';
      title?: string;
      content?: string;
      mediaUrl?: string;
      linkUrl?: string;
    },
  ) {
    const userId = req.user.userId;
    const result = await this.templatesService.createTemplate(userId, body);
    return { code: 0, message: 'success', data: result };
  }

  @Patch(':id')
  async updateTemplate(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: {
      templateName?: string;
      templateType?: 'text' | 'image' | 'article' | 'link';
      platform?: 'douyin' | 'xiaohongshu' | 'wechat' | 'bilibili';
      title?: string;
      content?: string;
      mediaUrl?: string;
      linkUrl?: string;
      isEnabled?: boolean;
    },
  ) {
    const userId = req.user.userId;
    const result = await this.templatesService.updateTemplate(userId, id, body);
    return { code: 0, message: 'success', data: result };
  }

  @Delete(':id')
  async deleteTemplate(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    await this.templatesService.deleteTemplate(userId, id);
    return { code: 0, message: 'success', data: null };
  }

  @Post(':id/submit')
  async submitTemplate(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    const result = await this.templatesService.submitTemplate(userId, id);
    return { code: 0, message: 'success', data: result };
  }
}
