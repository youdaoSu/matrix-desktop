const base = process.argv[2] || 'http://127.0.0.1:3210';
const page = await fetch(`${base}/app/`);
const setCookie = page.headers.get('set-cookie') || '';
const csrf = /suda-csrf-token=([^;]+)/.exec(setCookie)?.[1];
if (!csrf) throw new Error('CSRF cookie was not issued');
const common = { cookie: `suda-csrf-token=${csrf}`, 'x-suda-csrf-token': csrf };

async function request(path, options = {}, token) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      ...common,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
  return { status: response.status, body };
}

const userLogin = await request('/api/auth/login', {
  method: 'POST', body: JSON.stringify({ username: 'demo', password: 'user123456' }),
});
const adminLogin = await request('/api/admin/login', {
  method: 'POST', body: JSON.stringify({ username: 'admin', password: 'admin123456' }),
});
const userToken = userLogin.body?.data?.token;
const adminToken = adminLogin.body?.data?.token;
if (!userToken) throw new Error(`User login failed: ${JSON.stringify(userLogin)}`);
if (!adminToken) throw new Error(`Admin login failed: ${JSON.stringify(adminLogin)}`);

const userGets = [
  '/api/auth/me', '/api/vip/plans', '/api/vip/status',
  '/api/platform/accounts?page=1&pageSize=20', '/api/platform/groups', '/api/platform/followers?page=1&pageSize=20',
  '/api/platform/followers/stats', '/api/platform/stats', '/api/platform/oauth-status',
  '/api/comments?page=1&pageSize=20', '/api/comments/stats', '/api/comments/auto-rules', '/api/comments/sensitive-check?content=test',
  '/api/messages/sessions?page=1&pageSize=20', '/api/messages/quick-replies', '/api/messages/stats',
  '/api/automation/templates?page=1&pageSize=20', '/api/automation/monitor-tasks?page=1&pageSize=20',
  '/api/automation/monitor-tasks/hit-records?page=1&pageSize=20', '/api/auto-reply/rules?page=1&pageSize=20',
  '/api/automation/auto-message-tasks?page=1&pageSize=20',
  '/api/analytics/overview', '/api/analytics/follower-trend', '/api/analytics/engagement-trend',
  '/api/analytics/account-comparison', '/api/analytics/content-ranking', '/api/analytics/efficiency',
  '/api/notifications?page=1&pageSize=20', '/api/notifications/unread-count',
  '/api/media?page=1&pageSize=20', '/api/media/categories',
  '/api/users/profile', '/api/users/login-logs?page=1&pageSize=20',
  '/api/content/posts?page=1&pageSize=20', '/api/content/stats', '/api/content/drafts?page=1&pageSize=20',
  '/api/content/scheduled?page=1&pageSize=20', '/api/content/history?page=1&pageSize=20',
];
const adminGets = [
  '/api/admin/me', '/api/admin/dashboard/stats', '/api/admin/users?page=1&pageSize=20',
  '/api/admin/codes?page=1&pageSize=20', '/api/admin/plans', '/api/admin/logs?page=1&pageSize=20',
  '/api/admin/settings', '/api/admin/announcements?page=1&pageSize=20',
  '/api/admin/sensitive-words?page=1&pageSize=20', '/api/admin/overview',
];

const results = [];
for (const path of userGets) {
  const result = await request(path, {}, userToken);
  results.push({ scope: 'user', path, status: result.status, message: result.body?.message });
}
for (const path of adminGets) {
  const result = await request(path, {}, adminToken);
  results.push({ scope: 'admin', path, status: result.status, message: result.body?.message });
}
const failed = results.filter((item) => item.status < 200 || item.status >= 300);
console.log(JSON.stringify({ total: results.length + 2, passed: results.length + 2 - failed.length, failed }, null, 2));
if (failed.length) process.exitCode = 1;
