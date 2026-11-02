const debugPort = process.argv[2] || '9333';
const base = process.argv[3] || 'http://127.0.0.1:3210';

async function getTokens() {
  const page = await fetch(`${base}/app/`);
  const csrf = /suda-csrf-token=([^;]+)/.exec(page.headers.get('set-cookie') || '')?.[1];
  const headers = { 'content-type': 'application/json', cookie: `suda-csrf-token=${csrf}`, 'x-suda-csrf-token': csrf };
  const login = async (path, body) => fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) }).then((r) => r.json());
  const user = await login('/api/auth/login', { username: 'demo', password: 'user123456' });
  const admin = await login('/api/admin/login', { username: 'admin', password: 'admin123456' });
  return { user: user.data, admin: admin.data };
}

const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((r) => r.json());
const target = targets.find((item) => item.type === 'page' && item.url.startsWith('http://127.0.0.1'));
if (!target) throw new Error('QA browser target not found');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 1;
const pending = new Map();
let events = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message.result);
    pending.delete(message.id);
  } else if (['Runtime.exceptionThrown', 'Runtime.consoleAPICalled', 'Log.entryAdded'].includes(message.method)) {
    events.push(message);
  }
});
function call(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return result?.result?.value;
}
await call('Runtime.enable');
await call('Log.enable');
await call('Page.enable');
const tokens = await getTokens();
await evaluate(`localStorage.setItem('matrix_token', ${JSON.stringify(tokens.user.token)}); localStorage.setItem('matrix_user', ${JSON.stringify(JSON.stringify(tokens.user.user))}); localStorage.setItem('matrix_admin_token', ${JSON.stringify(tokens.admin.token)}); localStorage.setItem('matrix_admin_user', ${JSON.stringify(JSON.stringify(tokens.admin.user))}); true`);

const routes = [
  '/login', '/register', '/activate', '/forgot-password', '/admin/login',
  '/', '/dashboard', '/accounts', '/accounts/groups',
  '/publish', '/publish/tasks', '/publish/create', '/publish/batch-video', '/publish/batch-image', '/publish/drafts', '/publish/stats',
  '/engage/comments', '/engage/comments-agg', '/engage/auto-comment', '/engage/batch-tasks', '/engage/messages', '/engage/messages-agg', '/engage/auto-message', '/engage/followers', '/engage/follower-monitor',
  '/automation/keywords', '/automation/welcome', '/automation/offline', '/automation/active-messages', '/automation/monitor', '/automation/templates', '/automation/logs',
  '/analytics', '/analytics/account-data', '/analytics/flow', '/analytics/account-monitor', '/analytics/notify-monitor', '/analytics/violation', '/analytics/drafts', '/analytics/data-screen',
  '/settings/profile', '/settings/password', '/settings/vip', '/settings/logins', '/settings/notify', '/settings/theme', '/settings/data',
  '/settings', '/settings/general', '/settings/privacy', '/settings/about',
  '/admin', '/admin/dashboard', '/admin/users', '/admin/codes', '/admin/plans', '/admin/logs', '/admin/settings',
  '/docs', '/docs/overview', '/docs/requirements', '/docs/non-functional', '/docs/roadmap', '/docs/testing', '/docs/platforms',
];
const results = [];
for (const route of routes) {
  events = [];
  await call('Page.navigate', { url: `${base}/app/#${route}` });
  for (let i = 0; i < 30; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (await evaluate("document.readyState === 'complete' && !!document.getElementById('root')")) break;
  }
  await new Promise((resolve) => setTimeout(resolve, 350));
  const state = await evaluate(`({url:location.hash, text:(document.body.innerText||'').trim(), rootChildren:document.getElementById('root')?.childElementCount||0})`);
  const errors = events.filter((event) => {
    if (event.method === 'Runtime.exceptionThrown') return true;
    if (event.method === 'Runtime.consoleAPICalled') return event.params?.type === 'error';
    return event.params?.entry?.source === 'javascript' && event.params?.entry?.level === 'error';
  }).map((event) => event.params?.entry?.text || event.params?.exceptionDetails?.text || event.params?.args?.[0]?.value || event.method);
  const ok = state.rootChildren > 0 && state.text.length > 0 && !state.text.includes('页面暂时无法显示') && errors.length === 0;
  results.push({ route, ok, renderedPath: state.url, textLength: state.text.length, errors });
}
const failed = results.filter((item) => !item.ok);
console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed }, null, 2));
socket.close();
if (failed.length) process.exitCode = 1;
