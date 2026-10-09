import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { configureApp } from '@lark-apaas/fullstack-nestjs-core';
import { join } from 'path';
import { __express as hbsExpressEngine } from 'hbs';
import { randomBytes } from 'crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: process.env.NODE_ENV !== 'development',
  });
  await configureApp(app, {
    disableSwagger: true,
  });
  const logger = new Logger('Bootstrap');
  const host = process.env.SERVER_HOST || 'localhost';
  const port = Number(process.env.SERVER_PORT || '3000');

  // In the packaged desktop runtime the catch-all view controller would
  // otherwise answer /assets/*.js with index.html, causing a blank page due
  // to strict module MIME checking.
  app.useStaticAssets(join(process.cwd(), 'dist/client'), { index: false });

  // The Windows desktop build is a self-contained SPA. Serve its raw HTML
  // instead of passing it through the Miaoda platform view renderer, which
  // injects cloud-only scripts and template placeholders.
  if (process.env.MATRIX_DESKTOP === '1') {
    const desktopIndex = join(process.cwd(), 'dist/client/index.html');
    app.use('/app', (req, res) => {
      if (!req.cookies?.['suda-csrf-token']) {
        res.cookie('suda-csrf-token', randomBytes(24).toString('hex'), {
          maxAge: 30 * 24 * 60 * 60 * 1000,
          path: '/',
          httpOnly: false,
          sameSite: 'lax',
        });
      }
      res.sendFile(desktopIndex);
    });
  }

  // 注册视图引擎, 渲染 client 目录下的 html 文件
  app.setBaseViewsDir(join(process.cwd(), 'dist/client'));
  app.setViewEngine('html');
  app.engine('html', hbsExpressEngine);

  await app.listen(port, host);
  logger.log(`Server running on ${host}:${port}`);
  logger.log(`API endpoints ready at http://${host}:${port}/api`);
}

bootstrap();
