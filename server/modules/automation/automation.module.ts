import { Module } from '@nestjs/common';
import { MonitorController } from './monitor.controller';
import { MonitorService } from './monitor.service';
import { AutoMessageController } from './auto-message.controller';
import { AutoMessageService } from './auto-message.service';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { AutoReplyController } from './auto-reply.controller';
import { AutoReplyService } from './auto-reply.service';
import { PersonalTasksController } from './personal-tasks.controller';
import { PersonalTasksService } from './personal-tasks.service';

@Module({
  controllers: [MonitorController, AutoMessageController, TemplatesController, AutoReplyController, PersonalTasksController],
  providers: [MonitorService, AutoMessageService, TemplatesService, AutoReplyService, PersonalTasksService],
  exports: [MonitorService, AutoMessageService, TemplatesService, AutoReplyService],
})
export class AutomationModule {}
