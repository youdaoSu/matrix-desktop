const base = process.argv[2] || 'http://127.0.0.1:3210';
const runId = Date.now().toString(36);
const page = await fetch(`${base}/app/`);
const csrf = /suda-csrf-token=([^;]+)/.exec(page.headers.get('set-cookie') || '')?.[1];
if (!csrf) throw new Error('CSRF cookie missing');
const baseHeaders = { cookie: `suda-csrf-token=${csrf}`, 'x-suda-csrf-token': csrf };

async function call(method, path, body, token, expected = [200, 201]) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...baseHeaders, ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); } catch { result = text; }
  if (!expected.includes(response.status)) throw new Error(`${method} ${path}: HTTP ${response.status} ${JSON.stringify(result)}`);
  return result?.data;
}

const userLogin = await call('POST', '/api/auth/login', { username: 'demo', password: 'user123456' });
const adminLogin = await call('POST', '/api/admin/login', { username: 'admin', password: 'admin123456' });
const userToken = userLogin.token;
const adminToken = adminLogin.token;
const checks = [];
async function check(name, fn) {
  await fn();
  checks.push(name);
}

await check('注册→登录后改密→阻止不安全找回→新密码登录', async () => {
  const username = `qa_${runId}`;
  const email = `${username}@local.test`;
  await call('POST', '/api/auth/register', { username, password: 'QaPass123!', nickname: 'QA用户', email });
  const initialLogin = await call('POST', '/api/auth/login', { username, password: 'QaPass123!' });
  await call('POST', '/api/users/change-password', { oldPassword: 'QaPass123!', newPassword: 'QaPass456!' }, initialLogin.token);
  await call('POST', '/api/auth/forgot-password', { username, email, newPassword: 'UnsafePass789!' }, undefined, [501]);
  await call('POST', '/api/auth/login', { username, password: 'QaPass456!' });
});

let account;
await check('桌面平台账号新增→详情→修改→健康检查', async () => {
  account = await call('POST', '/api/platform/accounts/desktop', {
    platform: 'douyin', connectorSessionId: `qa-session-${runId}-0001`, nickname: `QA抖音_${runId}`,
    avatarUrl: 'http://p3-pc-sign.douyinpic.com/qa-avatar.jpeg', pageUrl: 'https://creator.douyin.com/',
  }, userToken);
  await call('GET', `/api/platform/accounts/${account.id}/detail`, undefined, userToken);
  await call('PUT', `/api/platform/accounts/${account.id}`, { accountRemark: 'QA已修改' }, userToken);
  await call('POST', `/api/platform/accounts/${account.id}/health-check`, {}, userToken);
});

await check('账号分组新增→修改→移动账号', async () => {
  const group = await call('POST', '/api/platform/groups', { groupName: `QA分组_${runId}`, sortOrder: 99 }, userToken);
  await call('PUT', `/api/platform/groups/${group.id}`, { groupName: `QA分组已修改_${runId}` }, userToken);
  await call('POST', '/api/platform/groups/move-accounts', { accountIds: [account.id], groupId: group.id }, userToken);
  await call('DELETE', `/api/platform/groups/${group.id}`, undefined, userToken);
});

await check('素材新增→详情→修改→删除', async () => {
  const item = await call('POST', '/api/media', { title: `QA素材_${runId}`, assetType: 'image', fileUrl: 'https://example.invalid/qa.png', fileSize: 1234, fileFormat: 'png', category: 'QA' }, userToken);
  await call('GET', `/api/media/${item.id}`, undefined, userToken);
  await call('PUT', `/api/media/${item.id}`, { title: `QA素材已修改_${runId}` }, userToken);
  await call('DELETE', `/api/media/${item.id}`, undefined, userToken);
});

await check('内容草稿新增→修改→阻止伪发布/伪定时→删除', async () => {
  const created = await call('POST', '/api/content/posts', { title: `QA内容_${runId}`, content: '自动验收内容', mediaType: 'text', accountIds: [account.id], status: 'draft' }, userToken);
  const item = created[0];
  await call('GET', `/api/content/posts/${item.id}`, undefined, userToken);
  await call('PUT', `/api/content/posts/${item.id}`, { title: `QA内容已修改_${runId}` }, userToken);
  await call('POST', `/api/content/posts/${item.id}/publish`, {}, userToken, [501]);
  await call('POST', `/api/content/posts/${item.id}/schedule`, { scheduledAt: new Date(Date.now() + 86400000).toISOString() }, userToken, [501]);
  await call('DELETE', `/api/content/posts/${item.id}`, undefined, userToken);
});

await check('未接通的批量评论回复不得伪报成功', async () => {
  await call('POST', '/api/comments/batch-reply', { commentIds: ['00000000-0000-4000-8000-000000000001'], replyContent: 'QA reply', replyAccountId: account.id }, userToken, [501]);
});

await check('自动回复规则新增→测试→开关→修改→删除', async () => {
  const item = await call('POST', '/api/auto-reply/rules', { ruleType: 'keyword', ruleName: `QA规则_${runId}`, platform: 'douyin', accountId: account.id, keywords: ['你好'], matchMode: 'contains', replyContent: '您好', replyType: 'text', priority: 1 }, userToken);
  await call('GET', `/api/auto-reply/rules/${item.id}`, undefined, userToken);
  await call('POST', `/api/auto-reply/rules/${item.id}/test`, { text: '你好呀' }, userToken);
  await call('POST', `/api/auto-reply/rules/${item.id}/toggle`, {}, userToken);
  await call('PUT', `/api/auto-reply/rules/${item.id}`, { ruleName: `QA规则已修改_${runId}` }, userToken);
  await call('DELETE', `/api/auto-reply/rules/${item.id}`, undefined, userToken);
});

await check('消息模板新增→修改→提交→删除', async () => {
  const item = await call('POST', '/api/automation/templates', { templateName: `QA模板_${runId}`, templateType: 'text', platform: 'douyin', content: 'QA消息模板' }, userToken);
  await call('GET', `/api/automation/templates/${item.id}`, undefined, userToken);
  await call('PATCH', `/api/automation/templates/${item.id}`, { templateName: `QA模板已修改_${runId}` }, userToken);
  await call('POST', `/api/automation/templates/${item.id}/submit`, {}, userToken);
  await call('DELETE', `/api/automation/templates/${item.id}`, undefined, userToken);
});

await check('监控任务新增→修改→开关→删除', async () => {
  const item = await call('POST', '/api/automation/monitor-tasks', { taskName: `QA监控_${runId}`, monitorType: 'comment_keyword', monitoredAccountIds: [account.id], keywords: ['测试'], matchMode: 'contains', actionType: 'reply_comment', actionAccountId: account.id, actionContent: '自动回复', actionMediaType: 'text' }, userToken);
  await call('GET', `/api/automation/monitor-tasks/${item.id}`, undefined, userToken);
  await call('PATCH', `/api/automation/monitor-tasks/${item.id}`, { taskName: `QA监控已修改_${runId}` }, userToken);
  await call('POST', `/api/automation/monitor-tasks/${item.id}/toggle`, {}, userToken);
  await call('DELETE', `/api/automation/monitor-tasks/${item.id}`, undefined, userToken);
});

await check('主动私信任务新增→修改→阻止伪启动→删除', async () => {
  const item = await call('POST', '/api/automation/auto-message-tasks', { taskName: `QA私信_${runId}`, senderAccountId: account.id, msgType: 'text', content: 'QA主动私信', frequencyLimitHour: 10, frequencyLimitDay: 20, minIntervalSeconds: 30, maxIntervalSeconds: 60 }, userToken);
  await call('GET', `/api/automation/auto-message-tasks/${item.id}`, undefined, userToken);
  await call('PATCH', `/api/automation/auto-message-tasks/${item.id}`, { taskName: `QA私信已修改_${runId}` }, userToken);
  await call('POST', `/api/automation/auto-message-tasks/${item.id}/start`, {}, userToken, [501]);
  await call('DELETE', `/api/automation/auto-message-tasks/${item.id}`, undefined, userToken);
});

await check('后台套餐新增→修改→删除', async () => {
  const item = await call('POST', '/api/admin/plans', { name: `QA套餐_${runId}`, code: `qa_${runId}`, durationDays: 7, maxAccounts: 2, price: '1.00', status: 'inactive', sortOrder: 999 }, adminToken);
  await call('PUT', `/api/admin/plans/${item.id}`, { name: `QA套餐已修改_${runId}` }, adminToken);
  await call('DELETE', `/api/admin/plans/${item.id}`, undefined, adminToken);
});

await check('后台授权码生成→作废', async () => {
  const plans = await call('GET', '/api/admin/plans', undefined, adminToken);
  const plan = plans.find((item) => item.code === 'monthly') || plans[0];
  const codes = await call('POST', '/api/admin/codes/generate', { planId: plan.id, count: 1, prefix: 'QA', durationDays: 7, maxAccounts: 2, remark: runId }, adminToken);
  await call('POST', `/api/admin/codes/${codes[0].id}/disable`, {}, adminToken);
});

await check('后台公告新增→修改→发布切换→删除', async () => {
  const item = await call('POST', '/api/admin/announcements', { title: `QA公告_${runId}`, content: 'QA公告内容', category: 'system' }, adminToken);
  await call('GET', `/api/admin/announcements/${item.id}`, undefined, adminToken);
  await call('PUT', `/api/admin/announcements/${item.id}`, { title: `QA公告已修改_${runId}` }, adminToken);
  await call('POST', `/api/admin/announcements/${item.id}/publish`, {}, adminToken);
  await call('DELETE', `/api/admin/announcements/${item.id}`, undefined, adminToken);
});

await check('后台敏感词新增→修改→删除', async () => {
  const item = await call('POST', '/api/admin/sensitive-words', { word: `QA敏感词_${runId}`, category: 'qa', level: 'warn' }, adminToken);
  await call('PUT', `/api/admin/sensitive-words/${item.id}`, { level: 'block' }, adminToken);
  await call('DELETE', `/api/admin/sensitive-words/${item.id}`, undefined, adminToken);
});

await check('测试平台账号清理', async () => {
  await call('DELETE', `/api/platform/accounts/${account.id}`, undefined, userToken);
});

console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
