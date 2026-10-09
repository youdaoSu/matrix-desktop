import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  IsString,
  IsNotEmpty,
  MinLength,
  IsOptional,
  IsInt,
  IsPositive,
  IsEnum,
  Max,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AdminService } from './admin.service';
import { AdminJwtAuthGuard, type JwtPayload } from '../auth/jwt-auth.guard';
import { success, paginated } from '@server/common/utils/response';

class AdminLoginDto {
  @IsString()
  @IsNotEmpty({ message: '用户名不能为空' })
  username!: string;

  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(6, { message: '密码长度不能少于6位' })
  password!: string;
}

class AdminChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: '原密码不能为空' })
  oldPassword!: string;

  @IsString()
  @IsNotEmpty({ message: '新密码不能为空' })
  @MinLength(6, { message: '密码长度不能少于6位' })
  newPassword!: string;
}

class ActivateVipDto {
  @IsString()
  @IsNotEmpty({ message: '套餐ID不能为空' })
  planId!: string;

  @IsInt()
  @IsPositive({ message: '时长必须为正整数' })
  @Type(() => Number)
  durationDays!: number;

  @IsInt()
  @IsPositive({ message: '最大账号数必须为正整数' })
  @Type(() => Number)
  maxAccounts!: number;
}

class ExtendVipDto {
  @IsInt()
  @IsPositive({ message: '延长天数必须为正整数' })
  @Type(() => Number)
  days!: number;
}

class GenerateCodesDto {
  @IsString()
  @IsNotEmpty({ message: '套餐ID不能为空' })
  planId!: string;

  @IsInt()
  @IsPositive({ message: '生成数量必须为正整数' })
  @Max(10000, { message: '单次生成数量不能超过10000' })
  @Type(() => Number)
  count!: number;

  @IsOptional()
  @IsString()
  prefix?: string;

  @IsInt()
  @IsPositive({ message: '时长必须为正整数' })
  @Type(() => Number)
  durationDays!: number;

  @IsInt()
  @IsPositive({ message: '最大账号数必须为正整数' })
  @Type(() => Number)
  maxAccounts!: number;

  @IsOptional()
  @IsString()
  remark?: string;
}

class CreatePlanDto {
  @IsString()
  @IsNotEmpty({ message: '套餐名称不能为空' })
  name!: string;

  @IsString()
  @IsNotEmpty({ message: '套餐编码不能为空' })
  code!: string;

  @IsInt()
  @IsPositive({ message: '时长必须为正整数' })
  @Type(() => Number)
  durationDays!: number;

  @IsInt()
  @IsPositive({ message: '最大账号数必须为正整数' })
  @Type(() => Number)
  maxAccounts!: number;

  @IsString()
  @IsNotEmpty({ message: '价格不能为空' })
  price!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  sortOrder?: number;
}

class UpdatePlanDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  durationDays?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  maxAccounts?: number;

  @IsOptional()
  @IsString()
  price?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  sortOrder?: number;
}

@Controller('api/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  private getAdminUser(req: Request): JwtPayload {
    return (req as unknown as { user: JwtPayload }).user;
  }

  // ==================== Admin Auth ====================

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    const ip = req.ip || (req.socket?.remoteAddress as string | undefined);
    const result = await this.adminService.adminLogin(dto.username, dto.password, ip);
    return success(result, '登录成功');
  }

  @Get('me')
  @UseGuards(AdminJwtAuthGuard)
  async getMe(@Req() req: Request) {
    const { userId } = this.getAdminUser(req);
    const admin = await this.adminService.getAdminMe(userId);
    return success(admin);
  }

  @Post('change-password')
  @UseGuards(AdminJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(@Body() dto: AdminChangePasswordDto, @Req() req: Request) {
    const { userId } = this.getAdminUser(req);
    await this.adminService.adminChangePassword(userId, dto.oldPassword, dto.newPassword);
    return success(null, '密码修改成功');
  }

  // ==================== Dashboard ====================

  @Get('dashboard/stats')
  @UseGuards(AdminJwtAuthGuard)
  async getDashboardStats() {
    const stats = await this.adminService.getDashboardStats();
    return success(stats);
  }

  // ==================== User Management ====================

  @Get('users')
  @UseGuards(AdminJwtAuthGuard)
  async getUsers(
    @Query('page') pageStr?: string,
    @Query('pageSize') pageSizeStr?: string,
    @Query('keyword') keyword?: string,
  ) {
    const page = pageStr ? parseInt(pageStr, 10) : 1;
    const pageSize = pageSizeStr ? parseInt(pageSizeStr, 10) : 20;
    const result = await this.adminService.getUserList(page, pageSize, keyword);
    return paginated(result.items, result.total, result.page, result.pageSize);
  }

  @Get('users/:id')
  @UseGuards(AdminJwtAuthGuard)
  async getUserDetail(@Param('id') id: string) {
    const user = await this.adminService.getUserDetail(id);
    return success(user);
  }

  @Post('users/:id/activate-vip')
  @UseGuards(AdminJwtAuthGuard)
  async activateVip(@Param('id') id: string, @Body() dto: ActivateVipDto, @Req() req: Request) {
    const { userId, username } = this.getAdminUser(req);
    const user = await this.adminService.activateUserVip(
      userId,
      username || 'admin',
      id,
      dto.planId,
      dto.durationDays,
      dto.maxAccounts,
    );
    return success(user, 'VIP开通成功');
  }

  @Post('users/:id/extend-vip')
  @UseGuards(AdminJwtAuthGuard)
  async extendVip(@Param('id') id: string, @Body() dto: ExtendVipDto, @Req() req: Request) {
    const { userId, username } = this.getAdminUser(req);
    const user = await this.adminService.extendUserVip(userId, username || 'admin', id, dto.days);
    return success(user, 'VIP延长成功');
  }

  @Post('users/:id/toggle-status')
  @UseGuards(AdminJwtAuthGuard)
  async toggleStatus(@Param('id') id: string, @Req() req: Request) {
    const { userId, username } = this.getAdminUser(req);
    const user = await this.adminService.toggleUserStatus(userId, username || 'admin', id);
    return success(user, '状态更新成功');
  }

  @Post('users/:id/reset-password')
  @UseGuards(AdminJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Param('id') id: string, @Req() req: Request) {
    const { userId, username } = this.getAdminUser(req);
    const temporaryPassword = await this.adminService.resetUserPassword(userId, username || 'admin', id);
    return success({ temporaryPassword }, '密码重置成功');
  }

  @Get('users/:id/accounts')
  @UseGuards(AdminJwtAuthGuard)
  async getUserAccounts(@Param('id') id: string) {
    const accounts = await this.adminService.getUserAccounts(id);
    return success(accounts);
  }

  // ==================== Activation Codes ====================

  @Get('codes')
  @UseGuards(AdminJwtAuthGuard)
  async getCodes(
    @Query('page') pageStr?: string,
    @Query('pageSize') pageSizeStr?: string,
    @Query('status') status?: string,
    @Query('planId') planId?: string,
    @Query('batchNo') batchNo?: string,
    @Query('keyword') keyword?: string,
  ) {
    const page = pageStr ? parseInt(pageStr, 10) : 1;
    const pageSize = pageSizeStr ? parseInt(pageSizeStr, 10) : 20;
    const result = await this.adminService.getCodeList(page, pageSize, {
      status,
      planId,
      batchNo,
      keyword,
    });
    return paginated(result.items, result.total, result.page, result.pageSize);
  }

  @Post('codes/generate')
  @UseGuards(AdminJwtAuthGuard)
  async generateCodes(@Body() dto: GenerateCodesDto, @Req() req: Request) {
    const { userId, username } = this.getAdminUser(req);
    const codes = await this.adminService.generateCodes(
      userId,
      username || 'admin',
      dto.planId,
      dto.count,
      dto.prefix || '',
      dto.durationDays,
      dto.maxAccounts,
      dto.remark,
    );
    return success(codes, '生成成功');
  }

  @Post('codes/:id/disable')
  @UseGuards(AdminJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async disableCode(@Param('id') id: string, @Req() req: Request) {
    const { userId, username } = this.getAdminUser(req);
    await this.adminService.disableCode(userId, username || 'admin', id);
    return success(null, '作废成功');
  }

  @Get('codes/export')
  @UseGuards(AdminJwtAuthGuard)
  async exportCodes() {
    const codes = await this.adminService.exportCodes();
    return success(codes);
  }

  // ==================== Vip Plans ====================

  @Get('plans')
  @UseGuards(AdminJwtAuthGuard)
  async getPlans() {
    const plans = await this.adminService.getPlans();
    return success(plans);
  }

  @Post('plans')
  @UseGuards(AdminJwtAuthGuard)
  async createPlan(@Body() dto: CreatePlanDto, @Req() req: Request) {
    const { userId, username } = this.getAdminUser(req);
    const plan = await this.adminService.createPlan(userId, username || 'admin', dto);
    return success(plan, '创建成功');
  }

  @Put('plans/:id')
  @UseGuards(AdminJwtAuthGuard)
  async updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto, @Req() req: Request) {
    const { userId, username } = this.getAdminUser(req);
    const plan = await this.adminService.updatePlan(userId, username || 'admin', id, dto);
    return success(plan, '更新成功');
  }

  @Delete('plans/:id')
  @UseGuards(AdminJwtAuthGuard)
  async deletePlan(@Param('id') id: string, @Req() req: Request) {
    const { userId, username } = this.getAdminUser(req);
    await this.adminService.deletePlan(userId, username || 'admin', id);
    return success(null, '删除成功');
  }

  // ==================== Operation Logs ====================

  @Get('logs')
  @UseGuards(AdminJwtAuthGuard)
  async getLogs(
    @Query('page') pageStr?: string,
    @Query('pageSize') pageSizeStr?: string,
    @Query('operatorType') operatorType?: string,
    @Query('action') action?: string,
    @Query('keyword') keyword?: string,
  ) {
    const page = pageStr ? parseInt(pageStr, 10) : 1;
    const pageSize = pageSizeStr ? parseInt(pageSizeStr, 10) : 20;
    const result = await this.adminService.getLogs(page, pageSize, {
      operatorType,
      action,
      keyword,
    });
    return paginated(result.items, result.total, result.page, result.pageSize);
  }

  // ==================== Settings ====================

  @Get('settings')
  @UseGuards(AdminJwtAuthGuard)
  async getSettings() {
    const settings = await this.adminService.getAllSettings();
    return success(settings);
  }

  @Put('settings/:key')
  @UseGuards(AdminJwtAuthGuard)
  async updateSetting(
    @Param('key') key: string,
    @Body() body: { value: string },
    @Req() req: Request,
  ) {
    const { userId, username } = this.getAdminUser(req);
    const setting = await this.adminService.updateSetting(
      userId,
      username || 'admin',
      key,
      body.value,
    );
    return success(setting, '更新成功');
  }

  @Post('settings/test-connection')
  @UseGuards(AdminJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async testConnection() {
    const result = await this.adminService.testConnection();
    return success(result);
  }

  // ==================== Announcements ====================

  @Get('announcements')
  @UseGuards(AdminJwtAuthGuard)
  async getAnnouncements(
    @Query('page') pageStr?: string,
    @Query('pageSize') pageSizeStr?: string,
    @Query('keyword') keyword?: string,
    @Query('category') category?: string,
    @Query('isPublished') isPublished?: string,
  ) {
    const page = pageStr ? parseInt(pageStr, 10) : 1;
    const pageSize = pageSizeStr ? parseInt(pageSizeStr, 10) : 20;
    const result = await this.adminService.getAnnouncementList(page, pageSize, {
      keyword,
      category,
      isPublished: isPublished !== undefined ? isPublished === 'true' : undefined,
    });
    return paginated(result.items, result.total, result.page, result.pageSize);
  }

  @Get('announcements/:id')
  @UseGuards(AdminJwtAuthGuard)
  async getAnnouncementDetail(@Param('id') id: string) {
    const announcement = await this.adminService.getAnnouncementDetail(id);
    return success(announcement);
  }

  @Post('announcements')
  @UseGuards(AdminJwtAuthGuard)
  async createAnnouncement(
    @Body() body: { title: string; content: string; summary?: string; category?: string; sortOrder?: number },
    @Req() req: Request,
  ) {
    const { userId, username } = this.getAdminUser(req);
    const announcement = await this.adminService.createAnnouncement(
      userId,
      username || 'admin',
      body,
    );
    return success(announcement, '创建成功');
  }

  @Put('announcements/:id')
  @UseGuards(AdminJwtAuthGuard)
  async updateAnnouncement(
    @Param('id') id: string,
    @Body() body: { title?: string; content?: string; summary?: string; category?: string; isPublished?: boolean; sortOrder?: number },
    @Req() req: Request,
  ) {
    const { userId, username } = this.getAdminUser(req);
    const announcement = await this.adminService.updateAnnouncement(
      userId,
      username || 'admin',
      id,
      body,
    );
    return success(announcement, '更新成功');
  }

  @Delete('announcements/:id')
  @UseGuards(AdminJwtAuthGuard)
  async deleteAnnouncement(@Param('id') id: string, @Req() req: Request) {
    const { userId, username } = this.getAdminUser(req);
    await this.adminService.deleteAnnouncement(userId, username || 'admin', id);
    return success(null, '删除成功');
  }

  @Post('announcements/:id/publish')
  @UseGuards(AdminJwtAuthGuard)
  async toggleAnnouncementPublish(@Param('id') id: string, @Req() req: Request) {
    const { userId, username } = this.getAdminUser(req);
    const announcement = await this.adminService.toggleAnnouncementPublish(
      userId,
      username || 'admin',
      id,
    );
    return success(announcement, announcement.isPublished ? '发布成功' : '已下线');
  }

  // ==================== Sensitive Words ====================

  @Get('sensitive-words')
  @UseGuards(AdminJwtAuthGuard)
  async getSensitiveWords(
    @Query('page') pageStr?: string,
    @Query('pageSize') pageSizeStr?: string,
    @Query('keyword') keyword?: string,
    @Query('category') category?: string,
  ) {
    const page = pageStr ? parseInt(pageStr, 10) : 1;
    const pageSize = pageSizeStr ? parseInt(pageSizeStr, 10) : 20;
    const result = await this.adminService.getSensitiveWordList(page, pageSize, {
      keyword,
      category,
    });
    return paginated(result.items, result.total, result.page, result.pageSize);
  }

  @Post('sensitive-words')
  @UseGuards(AdminJwtAuthGuard)
  async createSensitiveWord(
    @Body() body: { word: string; category?: string; level?: string },
    @Req() req: Request,
  ) {
    const { userId, username } = this.getAdminUser(req);
    const word = await this.adminService.createSensitiveWord(userId, username || 'admin', body);
    return success(word, '创建成功');
  }

  @Post('sensitive-words/batch-import')
  @UseGuards(AdminJwtAuthGuard)
  async batchImportSensitiveWords(
    @Body() body: { words: string[]; category?: string; level?: 'warn' | 'block' },
    @Req() req: Request,
  ) {
    const { userId, username } = this.getAdminUser(req);
    const result = await this.adminService.batchImportSensitiveWords(
      userId,
      username || 'admin',
      body.words,
      body.category,
      body.level,
    );
    return success(result, '导入完成');
  }

  @Get('sensitive-words/export')
  @UseGuards(AdminJwtAuthGuard)
  async exportSensitiveWords() {
    const words = await this.adminService.exportSensitiveWords();
    return success(words);
  }

  @Put('sensitive-words/:id')
  @UseGuards(AdminJwtAuthGuard)
  async updateSensitiveWord(
    @Param('id') id: string,
    @Body() body: { word?: string; category?: string; level?: string; isEnabled?: boolean },
    @Req() req: Request,
  ) {
    const { userId, username } = this.getAdminUser(req);
    const word = await this.adminService.updateSensitiveWord(
      userId,
      username || 'admin',
      id,
      body,
    );
    return success(word, '更新成功');
  }

  @Delete('sensitive-words/:id')
  @UseGuards(AdminJwtAuthGuard)
  async deleteSensitiveWord(@Param('id') id: string, @Req() req: Request) {
    const { userId, username } = this.getAdminUser(req);
    await this.adminService.deleteSensitiveWord(userId, username || 'admin', id);
    return success(null, '删除成功');
  }

  // ==================== Overview ====================

  @Get('overview')
  @UseGuards(AdminJwtAuthGuard)
  async getOverview() {
    const overview = await this.adminService.getOverview();
    return success(overview);
  }
}
