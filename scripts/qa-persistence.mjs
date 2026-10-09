const mode = process.argv[2];
const base = process.argv[3] || 'http://127.0.0.1:3210';
const marker = 'QA-重启持久化';

const page = await fetch(`${base}/app/`);
const csrf = /suda-csrf-token=([^;]+)/.exec(page.headers.get('set-cookie') || '')?.[1];
if (!csrf) throw new Error('CSRF cookie missing');
const common = { cookie: `suda-csrf-token=${csrf}`, 'x-suda-csrf-token': csrf, 'content-type': 'application/json' };

async function request(method, path, body, token) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...common, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(result)}`);
  return result.data;
}

const login = await request('POST', '/api/auth/login', { username: 'demo', password: 'user123456' });
const token = login.token;
const groups = await request('GET', '/api/platform/groups', undefined, token);
const existing = groups.find((group) => group.groupName === marker || group.name === marker);

if (mode === 'create') {
  if (!existing) await request('POST', '/api/platform/groups', { groupName: marker, sortOrder: 999 }, token);
  console.log(JSON.stringify({ created: true, marker }));
} else if (mode === 'verify') {
  if (!existing) throw new Error('重启后未找到持久化测试数据');
  await request('DELETE', `/api/platform/groups/${existing.id}`, undefined, token);
  console.log(JSON.stringify({ persisted: true, cleaned: true, marker }));
} else {
  throw new Error('Usage: node scripts/qa-persistence.mjs create|verify [base]');
}
