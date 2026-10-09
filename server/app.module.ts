import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { PlatformModule } from '@lark-apaas/fullstack-nestjs-core';

import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { ViewModule } from './modules/view/view.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { VipModule } from './modules/vip/vip.module';
import { AdminModule } from './modules/admin/admin.module';
import { PlatformModule as PlatformAccountsModule } from './modules/platform/platform.module';
import { ContentModule } from './modules/content/content.module';
import { MessagesModule } from './modules/messages/messages.module';
import { CommentsModule } from './modules/comments/comments.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AutomationModule } from './modules/automation/automation.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { MediaModule } from './modules/media/media.module';

@Module({
  imports: [
    PlatformModule.forRoot(
      // 本地开发由 vite 提供静态页面、Nest 仅提供 API，CSRF cookie 无法下发，故 dev 模式关闭；生产环境保持开启
      process.env.NODE_ENV === 'development' ? { enableCsrf: false } : {},
    ),
    AuthModule,
    UsersModule,
    VipModule,
    AdminModule,
    PlatformAccountsModule,
    ContentModule,
    MessagesModule,
    CommentsModule,
    AnalyticsModule,
    AutomationModule,
    NotificationsModule,
    MediaModule,

    ViewModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
