import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PersonalTasksService } from './personal-tasks.service';
import type { PersonalTaskInput, PersonalTaskStatus } from '@shared/personal-tasks';

@Controller('api/personal/tasks')
@UseGuards(JwtAuthGuard)
export class PersonalTasksController {
  constructor(private readonly service: PersonalTasksService) {}
  @Get()
  async list(@Req() req: { user: { userId: string } }, @Query() query: { page?: string; pageSize?: string; kind?: string; status?: string; dueOnly?: string }) {
    return { code: 0, data: await this.service.list(req.user.userId, query) };
  }
  @Post()
  async create(@Req() req: { user: { userId: string } }, @Body() input: PersonalTaskInput) {
    return { code: 0, data: await this.service.create(req.user.userId, input) };
  }
  @Patch(':id')
  async update(@Req() req: { user: { userId: string } }, @Param('id') id: string,
    @Body() input: { status?: PersonalTaskStatus; title?: string; content?: string; dueAt?: string | null; note?: string }) {
    return { code: 0, data: await this.service.update(req.user.userId, id, input) };
  }
}
