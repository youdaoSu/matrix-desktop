#!/usr/bin/env node
// ============================================================================
// 初始数据写入（幂等，可重复执行）
//   - 5 个 VIP 套餐（月卡/季卡/半年卡/年卡/旗舰）
//   - 超级管理员 admin / admin123456
//   - 演示用户 demo / user123456（已开通年卡VIP，登录即可体验）
// 连接串从 SUDA_DATABASE_URL 或 .env.local 读取
// ============================================================================
import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let url = process.env.SUDA_DATABASE_URL;
if (!url) {
  for (const f of ['.env.local', '.env']) {
    try {
      const content = readFileSync(join(root, f), 'utf8');
      const m = content.match(/^SUDA_DATABASE_URL=(.+)$/m);
      if (m) {
        url = m[1].trim();
        break;
      }
    } catch {
      /* 文件不存在，继续 */
    }
  }
}
if (!url) {
  console.error('未找到 SUDA_DATABASE_URL，请先运行「01-一键初始化.bat」生成 .env.local');
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

const PLANS = [
  { code: 'monthly', name: '月卡', days: 30, accounts: 3, price: '99', sort: 1, desc: '适合个人创作者，3个账号矩阵' },
  { code: 'quarterly', name: '季卡', days: 90, accounts: 5, price: '269', sort: 2, desc: '小团队起步，5个账号' },
  { code: 'halfyear', name: '半年卡', days: 180, accounts: 10, price: '499', sort: 3, desc: '成长型团队，10个账号' },
  { code: 'yearly', name: '年卡', days: 365, accounts: 20, price: '899', sort: 4, desc: '专业矩阵团队，20个账号' },
  { code: 'ultimate', name: '旗舰版', days: 365, accounts: 50, price: '1999', sort: 5, desc: '企业级矩阵，50个账号+优先支持' },
];

async function main() {
  // 0. 建表后：把全部表/序列权限授予平台数据角色（幂等，与 setup-db 默认授权互补）
  await sql.unsafe(`
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "anon_","authenticated_","service_role_";
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "anon_","authenticated_","service_role_";
  `);

  // 1. VIP 套餐
  for (const p of PLANS) {
    const exists = await sql`SELECT id FROM vip_plans WHERE code = ${p.code}`;
    if (exists.length === 0) {
      await sql`INSERT INTO vip_plans (name, code, duration_days, max_accounts, price, description, status, sort_order)
                VALUES (${p.name}, ${p.code}, ${p.days}, ${p.accounts}, ${p.price}, ${p.desc}, 'active', ${p.sort})`;
      console.log(`[OK] 新增套餐：${p.name}`);
    } else {
      console.log(`[跳过] 套餐 ${p.name} 已存在`);
    }
  }

  // 2. 超级管理员
  const adminExists = await sql`SELECT id FROM admin_users WHERE username = 'admin'`;
  if (adminExists.length === 0) {
    const hash = bcrypt.hashSync('admin123456', 10);
    await sql`INSERT INTO admin_users (username, password_hash, nickname, role, status, must_change_pwd)
              VALUES ('admin', ${hash}, '超级管理员', 'admin', 'active', true)`;
    console.log('[OK] 新增管理员：admin / admin123456（首次登录建议改密）');
  } else {
    console.log('[跳过] 管理员 admin 已存在');
  }

  // 3. 演示用户（已开通年卡VIP，方便直接体验）
  const demoExists = await sql`SELECT id FROM app_users WHERE username = 'demo'`;
  if (demoExists.length === 0) {
    const hash = bcrypt.hashSync('user123456', 10);
    const plan = await sql`SELECT id FROM vip_plans WHERE code = 'yearly'`;
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await sql`INSERT INTO app_users (username, password_hash, nickname, vip_plan_id, vip_expires_at, vip_status, max_accounts, status)
              VALUES ('demo', ${hash}, '演示账号', ${plan[0].id}, ${expires}, 'active', 20, 'active')`;
    console.log('[OK] 新增演示用户：demo / user123456（已开通年卡VIP）');
  } else {
    console.log('[跳过] 演示用户 demo 已存在');
  }

  console.log('\n初始数据写入完成。');
}

main()
  .catch((err) => {
    console.error('[错误] 初始化数据失败:', err.message);
    process.exit(1);
  })
  .finally(() => sql.end());
