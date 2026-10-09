import {
  Controller,
  Get,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { VipService } from './vip.service';
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
    return success(status);
  }
}
