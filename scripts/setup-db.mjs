#!/usr/bin/env node
// ============================================================================
// 本地数据库初始化：创建数据库 matrix_db + 复合类型（幂等，可重复执行）
// 用法：
//   PG_SUPER_PASSWORD=xxx node scripts/setup-db.mjs
//   或直接 node scripts/setup-db.mjs 后按提示输入密码
// 可选环境变量：PG_HOST(默认localhost) PG_PORT(默认5432) PG_SUPER_USER(默认postgres)
//               PG_DB_NAME(默认matrix_db)
// ============================================================================
import postgres from 'postgres';
import { createInterface } from 'node:readline';

const DB_NAME = process.env.PG_DB_NAME || 'matrix_db';
const HOST = process.env.PG_HOST || 'localhost';
const PORT = Number(process.env.PG_PORT || 5432);
const SUPER_USER = process.env.PG_SUPER_USER || 'postgres';

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    }),
  );
}

async function main() {
  const password = process.env.PG_SUPER_PASSWORD || (await ask('请输入 PostgreSQL 超级用户 postgres 的密码: '));

  // 1. 连接维护库 postgres，创建目标数据库
  const adminSql = postgres({
    host: HOST,
    port: PORT,
    username: SUPER_USER,
    password,
    database: 'postgres',
    max: 1,
    connect_timeout: 10,
  });
  try {
    const exists = await adminSql`SELECT 1 FROM pg_database WHERE datname = ${DB_NAME}`;
    if (exists.length === 0) {
      await adminSql.unsafe(`CREATE DATABASE ${DB_NAME}`);
      console.log(`[OK] 已创建数据库 ${DB_NAME}`);
    } else {
      console.log(`[OK] 数据库 ${DB_NAME} 已存在，跳过创建`);
    }
  } finally {
    await adminSql.end();
  }

  // 2. 连接目标库，创建复合类型（schema 引用，drizzle-kit 不会自动建）
  const dbSql = postgres({
    host: HOST,
    port: PORT,
    username: SUPER_USER,
    password,
    database: DB_NAME,
    max: 1,
  });
  try {
    await dbSql.unsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_profile') THEN
          CREATE TYPE user_profile AS (user_id text);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'file_attachment') THEN
          CREATE TYPE file_attachment AS (bucket_id text, file_path text);
        END IF;
      END $$;
    `);
    console.log('[OK] 已创建复合类型 user_profile / file_attachment');

    // 3. 创建平台数据权限角色（SqlExecutionContextMiddleware 会 SET LOCAL ROLE 到这些角色）
    //    并设置默认授权：之后由 postgres 建表时自动把权限授予这些角色
    await dbSql.unsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon_') THEN CREATE ROLE "anon_"; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated_') THEN CREATE ROLE "authenticated_"; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role_') THEN CREATE ROLE "service_role_"; END IF;
      END $$;
      GRANT CONNECT ON DATABASE ${DB_NAME} TO "anon_","authenticated_","service_role_";
      GRANT USAGE ON SCHEMA public TO "anon_","authenticated_","service_role_";
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "anon_","authenticated_","service_role_";
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "anon_","authenticated_","service_role_";
    `);
    console.log('[OK] 已创建数据权限角色 anon_ / authenticated_ / service_role_');
  } finally {
    await dbSql.end();
  }

  console.log('\n数据库准备完成，下一步将由初始化脚本执行建表(drizzle-kit push)。');
}

main().catch((err) => {
  console.error('\n[错误] 数据库初始化失败:', err.message);
  console.error('请检查：PostgreSQL 服务是否已启动、密码是否正确、端口是否为 5432。');
  process.exit(1);
});
