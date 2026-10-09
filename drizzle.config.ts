import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

// 本地建表配置：npx drizzle-kit push
// 连接串从 .env.local 读取（SUDA_DATABASE_URL）
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/database/schema.ts',
  dbCredentials: {
    url: process.env.SUDA_DATABASE_URL || '',
  },
  verbose: true,
  strict: false,
});
