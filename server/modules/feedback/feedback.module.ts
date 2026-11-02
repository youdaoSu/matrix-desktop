import { Body, Controller, Get, Module, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FeedbackService } from './feedback.service';
@Controller('api/feedback')
@UseGuards(JwtAuthGuard)
export class FeedbackController {
  constructor(private readonly service: FeedbackService) {}
  @Post('publish-errors') submit(@Req() req: {user:{userId:string}}, @Body() body: {report?:unknown}) {return this.service.submit(req.user.userId,body?.report).then(data=>({code:0,data}));}
}
@Controller('api/admin/publish-errors')
@UseGuards(AdminJwtAuthGuard)
export class AdminFeedbackController {
  constructor(private readonly service: FeedbackService) {}
  @Get() list(@Query('page') page='1',@Query('pageSize') pageSize='20'){return this.service.list(Number(page),Number(pageSize)).then(data=>({code:0,data}));}
}
@Module({controllers:[FeedbackController,AdminFeedbackController],providers:[FeedbackService]})
export class FeedbackModule {}
