import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  HttpException,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard, type JwtPayload } from './jwt-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ActivateCodeDto } from './dto/activate-code.dto';
import { CompletePasswordRecoveryDto, RequestPasswordRecoveryDto } from './dto/password-recovery.dto';
import { PasswordRecoveryService } from './password-recovery.service';
import { success } from '@server/common/utils/response';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly recovery: PasswordRecoveryService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const user = await this.authService.register(dto);
    return success(user, '注册成功');
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = req.ip || (req.socket?.remoteAddress as string | undefined);
    const result = await this.authService.login(dto, ip);
    return success(result, '登录成功');
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request) {
    const { userId } = (req as unknown as { user: JwtPayload }).user;
    await this.authService.logout(userId);
    return success(null, '退出成功');
  }

  @Post('activate')
  @UseGuards(JwtAuthGuard)
  async activate(@Body() dto: ActivateCodeDto, @Req() req: Request) {
    const { userId } = (req as unknown as { user: JwtPayload }).user;
    const user = await this.authService.activateCode(userId, dto);
    return success(user, '激活成功');
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: CompletePasswordRecoveryDto) {
    return success(await this.recovery.complete(dto), '密码重置成功');
  }

  @Get('password-recovery/status')
  async recoveryStatus() { return success(await this.recovery.status()); }

  @Post('password-recovery/request')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestPasswordRecovery(@Body() dto: RequestPasswordRecoveryDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try { return success(await this.recovery.request(dto, req.socket?.remoteAddress || req.ip || 'unknown'), '请求已受理'); }
    catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429) {
        const details=error.getResponse() as { retryAfterSeconds?: number };
        res.setHeader('Retry-After', String(Math.max(1, Math.min(3600, details.retryAfterSeconds || 60))));
      }
      throw error;
    }
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Req() req: Request) {
    const { userId } = (req as unknown as { user: JwtPayload }).user;
    const user = await this.authService.getMe(userId);
    return success(user);
  }
}
