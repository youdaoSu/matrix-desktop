import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, Res, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { Response } from 'express';
import { PlatformService } from './platform.service';
import type { PlatformType } from '@shared/api.interface';
import { JwtAuthGuard, PublicRoute } from '../auth/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller('api/platform')
@UseGuards(JwtAuthGuard)
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get('accounts')
  async getAccounts(
    @Req() req: AuthenticatedRequest,
    @Query('platform') platform?: string,
    @Query('groupName') groupName?: string,
    @Query('authStatus') authStatus?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const userId = req.user.userId;
    const result = await this.platformService.getAccounts(userId, {
      platform,
      groupName,
      authStatus,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
    });
    return { code: 0, message: 'success', data: result };
  }

  @Post('accounts')
  async addAccount(@Req() req: AuthenticatedRequest, @Body() body: {
    platform: PlatformType;
    nickname?: string;
    accountRemark?: string;
    groupName?: string;
  }) {
    const userId = req.user.userId;
    const result = await this.platformService.addAccount(userId, body);
    return { code: 0, message: 'success', data: result };
  }

  @Put('accounts/:id')
  async updateAccount(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { accountRemark?: string; groupName?: string },
  ) {
    const userId = req.user.userId;
    const result = await this.platformService.updateAccount(userId, id, body);
    return { code: 0, message: 'success', data: result };
  }

  @Post('accounts/desktop')
  async addDesktopAccount(
    @Req() req: AuthenticatedRequest,
    @Body() body: {
      platform: PlatformType;
      connectorSessionId: string;
      nickname: string;
      avatarUrl?: string;
      pageUrl?: string;
      nativeAccountKey?:string;
      groupId?: string;
    },
  ) {
    const result = await this.platformService.addDesktopAccount(req.user.userId, body);
    return { code: 0, message: 'success', data: result };
  }

  @Delete('accounts/:id')
  @HttpCode(HttpStatus.OK)
  async deleteAccount(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    await this.platformService.deleteAccount(userId, id);
    return { code: 0, message: 'success', data: null };
  }

  @Post('accounts/:id/desktop-observation')
  async desktopObservation(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:{sessionId:string;nickname:string;avatarUrl?:string;nativeAccountKey?:string;observedAt?:number;metrics?:{followersCount?:number;followingCount?:number;likesCount?:number};metricEvidence?:import('@shared/account-metrics').AccountMetricEvidence;metricsError?:string}){
    return {code:0,data:await this.platformService.syncDesktopObservation(req.user.userId,id,body)};
  }

  @Post('accounts/:id/reauthorize')
  async reauthorizeAccount(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    const result = await this.platformService.reauthorizeAccount(userId, id);
    return { code: 0, message: 'success', data: result };
  }

  @Get('accounts/:id/detail')
  async getAccountDetail(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    const result = await this.platformService.getAccountDetail(userId, id);
    return { code: 0, message: 'success', data: result };
  }

  // Authorization hot path: do not run dashboard aggregates for an IPC guard.
  // JwtAuthGuard still checks the current user status/authVersion on EVERY read.
  @Get('accounts/:id/desktop-context')
  async getDesktopContext(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const account = await this.platformService.getDesktopAccount(req.user.userId, id);
    return { code: 0, data: { userId: req.user.userId, account } };
  }

  @Post('accounts/:id/health-check')
  async healthCheck(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    const result = await this.platformService.healthCheck(userId, id);
    return { code: 0, message: 'success', data: result };
  }

  @Get('groups')
  async getGroups(@Req() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    const result = await this.platformService.getAccountGroups(userId);
    return { code: 0, message: 'success', data: result };
  }

  @Post('groups')
  async createGroup(
    @Req() req: AuthenticatedRequest,
    @Body() body: { groupName: string; sortOrder?: number },
  ) {
    const userId = req.user.userId;
    const result = await this.platformService.createGroup(userId, body.groupName, body.sortOrder);
    return { code: 0, message: 'success', data: result };
  }

  @Put('groups/:id')
  async updateGroup(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { groupName?: string; sortOrder?: number; color?: string },
  ) {
    const userId = req.user.userId;
    const result = await this.platformService.updateGroup(userId, id, body);
    return { code: 0, message: 'success', data: result };
  }

  @Delete('groups/:id')
  @HttpCode(HttpStatus.OK)
  async deleteGroup(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    await this.platformService.deleteGroup(userId, id);
    return { code: 0, message: 'success', data: null };
  }

  @Post('groups/move-accounts')
  @HttpCode(HttpStatus.OK)
  async moveAccountsToGroup(
    @Req() req: AuthenticatedRequest,
    @Body() body: { accountIds: string[]; groupId: string },
  ) {
    const userId = req.user.userId;
    const result = await this.platformService.moveAccountsToGroup(
      userId,
      body.accountIds,
      body.groupId,
    );
    return { code: 0, message: 'success', data: result };
  }

  @Get('followers')
  async getFollowers(
    @Req() req: AuthenticatedRequest,
    @Query('platform') platform?: string,
    @Query('accountId') accountId?: string,
    @Query('keyword') keyword?: string,
    @Query('tag') tag?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const userId = req.user.userId;
    const result = await this.platformService.getFollowers(userId, {
      platform,
      accountId,
      keyword,
      tag,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
    });
    return { code: 0, message: 'success', data: result };
  }

  @Get('followers/stats')
  async getFollowerStats(
    @Req() req: AuthenticatedRequest,
    @Query('period') period = 'day',
    @Query('days') days = '7',
  ) {
    const userId = req.user.userId;
    const result = await this.platformService.getFollowerStats(
      userId,
      period,
      parseInt(days, 10),
    );
    return { code: 0, message: 'success', data: result };
  }

  @Get('followers/export')
  async exportFollowers(
    @Req() req: AuthenticatedRequest,
    @Query('accountId') accountId?: string,
    @Query('platform') platform?: string,
  ) {
    const userId = req.user.userId;
    const result = await this.platformService.exportFollowers(userId, { accountId, platform });
    return { code: 0, message: 'success', data: result };
  }

  @Get('followers/:id')
  async getFollowerDetail(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    const result = await this.platformService.getFollowerDetail(userId, id);
    return { code: 0, message: 'success', data: result };
  }

  @Put('followers/:id')
  async updateFollower(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { remark?: string; tags?: string[] },
  ) {
    const userId = req.user.userId;
    const result = await this.platformService.updateFollower(userId, id, body);
    return { code: 0, message: 'success', data: result };
  }

  @Post('followers/batch-tag')
  @HttpCode(HttpStatus.OK)
  async batchTagFollowers(
    @Req() req: AuthenticatedRequest,
    @Body() body: { followerIds: string[]; tags: string[] },
  ) {
    const userId = req.user.userId;
    const result = await this.platformService.batchTagFollowers(
      userId,
      body.followerIds,
      body.tags,
    );
    return { code: 0, message: 'success', data: result };
  }

  @Post('followers/batch-group')
  @HttpCode(HttpStatus.OK)
  async batchGroupFollowers(
    @Req() req: AuthenticatedRequest,
    @Body() body: { followerIds: string[]; groupName: string },
  ) {
    const userId = req.user.userId;
    const result = await this.platformService.batchGroupFollowers(
      userId,
      body.followerIds,
      body.groupName,
    );
    return { code: 0, message: 'success', data: result };
  }

  @Get('stats')
  async getStats(@Req() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    const result = await this.platformService.getStats(userId);
    return { code: 0, message: 'success', data: result };
  }

  @Post('oauth/:platform')
  async initiateOAuth(@Req() req: AuthenticatedRequest, @Param('platform') platform: string) {
    const userId = req.user.userId;
    const result = await this.platformService.initiateOAuth(userId, platform);
    return { code: 0, message: 'success', data: result };
  }

  @Get('oauth-status')
  async getOAuthStatus() {
    return { code: 0, message: 'success', data: this.platformService.getOAuthStatus() };
  }

  @Get('oauth/callback')
  @PublicRoute()
  async oauthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res() response: Response,
  ) {
    const redirectUrl = await this.platformService.oauthCallback({ code, state, error, errorDescription });
    return response.redirect(302, redirectUrl);
  }
}
