DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon_') THEN CREATE ROLE "anon_"; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated_') THEN CREATE ROLE "authenticated_"; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role_') THEN CREATE ROLE "service_role_"; END IF;
END $$;

GRANT CONNECT ON DATABASE matrix_db TO "anon_", "authenticated_", "service_role_";
GRANT USAGE ON SCHEMA public TO "anon_", "authenticated_", "service_role_";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "anon_", "authenticated_", "service_role_";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "anon_", "authenticated_", "service_role_";

INSERT INTO vip_plans (name, code, duration_days, max_accounts, price, description, status, sort_order) VALUES
  ('月卡', 'monthly', 30, 3, 99, '适合个人创作者，3个账号矩阵', 'active', 1),
  ('季卡', 'quarterly', 90, 5, 269, '小团队起步，5个账号', 'active', 2),
  ('半年卡', 'halfyear', 180, 10, 499, '成长型团队，10个账号', 'active', 3),
  ('年卡', 'yearly', 365, 20, 899, '专业矩阵团队，20个账号', 'active', 4),
  ('旗舰版', 'ultimate', 365, 50, 1999, '企业级矩阵，50个账号+优先支持', 'active', 5)
ON CONFLICT (code) DO NOTHING;

INSERT INTO admin_users (username, password_hash, nickname, role, status, must_change_pwd)
VALUES ('admin', '$2b$10$MAWVwPwDKaZMDQ3gITryJeFS5QyToeuhR1e9V9Y3TNyzeuKSrNo9i', '超级管理员', 'admin', 'active', true)
ON CONFLICT (username) DO NOTHING;

INSERT INTO app_users (username, password_hash, nickname, vip_plan_id, vip_expires_at, vip_status, max_accounts, status)
SELECT 'demo', '$2b$10$qYzGaUFsPH4awBTNcQUEuuNId3n6dc9Sb/ztfLSetYCIzl5P/uNOK', '演示账号', id,
       CURRENT_TIMESTAMP + INTERVAL '365 days', 'active', 20, 'active'
FROM vip_plans WHERE code='yearly'
ON CONFLICT (username) DO NOTHING;
