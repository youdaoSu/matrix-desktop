import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard, type JwtPayload } from './jwt-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ActivateCodeDto } from './dto/activate-code.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { success } from '@server/common/utils/response';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto);
    return success(null, '密码重置成功');
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Req() req: Request) {
    const { userId } = (req as unknown as { user: JwtPayload }).user;
    const user = await this.authService.getMe(userId);
    return success(user);
  }
}
