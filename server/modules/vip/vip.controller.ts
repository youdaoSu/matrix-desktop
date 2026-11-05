import {
  Controller,
  Get,
  UseGuards,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import { VipService, type VipStatusDetail } from './vip.service';
import { accountAuthorityOrigin, readAuthorityAccount } from '@server/common/account-authority';
import { JwtAuthGuard, type JwtPayload } from '../auth/jwt-auth.guard';
import { success } from '@server/common/utils/response';

@Controller('api/vip')
export class VipController {
  constructor(private readonly vipService: VipService) {}

  @Get('plans')
  async getPlans() {
    const plans = await this.vipService.getPlans();
    return success(plans);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  async getStatus(@Req() req: Request) {
    const { userId } = (req as unknown as { user: JwtPayload }).user;
    const status = await this.vipService.getVipStatus(userId);
    const authority = accountAuthorityOrigin();
    if (authority) {
      try {
        const shared = await readAuthorityAccount(authority, '/api/vip/status', req.headers.authorization || '') as VipStatusDetail | undefined;
        if (!shared || !['active', 'inactive', 'expired'].includes(shared.status)) throw new Error('Invalid VIP status');
        return success({ ...shared, currentAccounts: status.currentAccounts });
      } catch {
        throw new ServiceUnavailableException('统一账号服务暂不可用，请稍后重试');
      }
    }
    return success(status);
  }
}
