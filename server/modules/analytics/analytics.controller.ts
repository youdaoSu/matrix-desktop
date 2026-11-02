import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller('api/analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  async getOverview(@Req() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    const result = await this.analyticsService.getOverview(userId);
    return { code: 0, message: 'success', data: result };
  }

  @Get('follower-trend')
  async getFollowerTrend(
    @Req() req: AuthenticatedRequest,
    @Query('days') days = '30',
  ) {
    const userId = req.user.userId;
    const result = await this.analyticsService.getFollowerTrend(userId, parseInt(days, 10));
    return { code: 0, message: 'success', data: result };
  }

  @Get('account-data-audit')
  async getAccountDataAudit(@Req() req:AuthenticatedRequest) {
    const data=await this.analyticsService.getAccountDataAudit(req.user.userId);
    return {code:0,message:'success',data};
  }

  @Get('engagement-trend')
  async getEngagementTrend(
    @Req() req: AuthenticatedRequest,
    @Query('days') days = '30',
  ) {
    const userId = req.user.userId;
    const result = await this.analyticsService.getEngagementTrend(userId, parseInt(days, 10));
    return { code: 0, message: 'success', data: result };
  }

  @Get('account-comparison')
  async getAccountComparison(@Req() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    const result = await this.analyticsService.getAccountComparison(userId);
    return { code: 0, message: 'success', data: result };
  }

  @Get('content-ranking')
  async getContentRanking(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit = '20',
  ) {
    const userId = req.user.userId;
    const result = await this.analyticsService.getContentRanking(userId, parseInt(limit, 10));
    return { code: 0, message: 'success', data: result };
  }

  @Get('efficiency')
  async getEfficiency(@Req() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    const result = await this.analyticsService.getEfficiency(userId);
    return { code: 0, message: 'success', data: result };
  }
}
