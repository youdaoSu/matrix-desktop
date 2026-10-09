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
import { AutoReplyService } from './auto-reply.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller('api/auto-reply/rules')
@UseGuards(JwtAuthGuard)
export class AutoReplyController {
  constructor(private readonly autoReplyService: AutoReplyService) {}

  @Get()
  async getRules(
    @Req() req: AuthenticatedRequest,
    @Query('ruleType') ruleType?: string,
    @Query('platform') platform?: string,
    @Query('isEnabled') isEnabled?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const userId = req.user.userId;
    const result = await this.autoReplyService.getRules(userId, {
      ruleType,
      platform,
      isEnabled: isEnabled !== undefined ? isEnabled === 'true' : undefined,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
    });
    return { code: 0, message: 'success', data: result };
  }

  @Get(':id')
  async getRule(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    const result = await this.autoReplyService.getRule(userId, id);
    return { code: 0, message: 'success', data: result };
  }

  @Post()
  async createRule(
    @Req() req: AuthenticatedRequest,
    @Body() body: {
      ruleType: string;
      ruleName: string;
      platform?: string;
      accountId?: string;
      keywords?: string[];
      matchMode?: string;
      replyContent?: string;
      replyType?: string;
      replyMediaUrl?: string;
      priority?: number;
    },
  ) {
    const userId = req.user.userId;
    const result = await this.autoReplyService.createRule(userId, body);
    return { code: 0, message: 'success', data: result };
  }

  @Put(':id')
  async updateRule(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: {
      ruleName?: string;
      keywords?: string[];
      matchMode?: string;
      replyContent?: string;
      replyType?: string;
      replyMediaUrl?: string;
      priority?: number;
      isEnabled?: boolean;
    },
  ) {
    const userId = req.user.userId;
    const result = await this.autoReplyService.updateRule(userId, id, body);
    return { code: 0, message: 'success', data: result };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteRule(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    await this.autoReplyService.deleteRule(userId, id);
    return { code: 0, message: 'success', data: null };
  }

  @Post(':id/toggle')
  async toggleRule(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    const result = await this.autoReplyService.toggleRule(userId, id);
    return { code: 0, message: 'success', data: result };
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  async testRule(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { text: string },
  ) {
    const userId = req.user.userId;
    const result = await this.autoReplyService.testRule(userId, id, body.text);
    return { code: 0, message: 'success', data: result };
  }
}
