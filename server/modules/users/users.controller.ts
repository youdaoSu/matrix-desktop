import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  UseGuards,
  Req,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { UsersService } from './users.service';
import { JwtAuthGuard, type JwtPayload } from '../auth/jwt-auth.guard';
import { success, paginated } from '@server/common/utils/response';
import {
  IsString,
  IsOptional,
  MinLength,
  IsNotEmpty,
} from 'class-validator';

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  nickname?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: '原密码不能为空' })
  oldPassword!: string;

  @IsString()
  @IsNotEmpty({ message: '新密码不能为空' })
  @MinLength(6, { message: '密码长度不能少于6位' })
  newPassword!: string;
}

@Controller('api/users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  async getProfile(@Req() req: Request) {
    const { userId } = (req as unknown as { user: JwtPayload }).user;
    const user = await this.usersService.getProfile(userId);
    return success(user);
  }

  @Put('profile')
  async updateProfile(@Body() dto: UpdateProfileDto, @Req() req: Request) {
    const { userId } = (req as unknown as { user: JwtPayload }).user;
    const user = await this.usersService.updateProfile(userId, dto);
    return success(user, '更新成功');
  }

  @Post('change-password')
  async changePassword(@Body() dto: ChangePasswordDto, @Req() req: Request) {
    const { userId } = (req as unknown as { user: JwtPayload }).user;
    await this.usersService.changePassword(userId, dto);
    return success(null, '密码修改成功');
  }

  @Get('login-logs')
  async getLoginLogs(
    @Req() req: Request,
    @Query('page') pageStr?: string,
    @Query('pageSize') pageSizeStr?: string,
  ) {
    const { userId } = (req as unknown as { user: JwtPayload }).user;
    const page = pageStr ? parseInt(pageStr, 10) : 1;
    const pageSize = pageSizeStr ? parseInt(pageSizeStr, 10) : 20;
    const result = await this.usersService.getLoginLogs(userId, page, pageSize);
    return paginated(result.items, result.total, result.page, result.pageSize);
  }
}
