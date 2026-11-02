// Three launches share only this newly created disposable profile, never the user's profile.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-upgrade-qa-'));
const port = 9394;
const children = [];
let failed = true, current;
await new Promise((resolve, reject) => {
  const probe = net.createServer(); probe.once('error', reject);
  probe.listen(port, '127.0.0.1', () => probe.close(resolve));
});
async function wait(fn, description) {
  const end = Date.now() + 60000;
  while (Date.now() < end) { if (await fn()) return; await new Promise(r => setTimeout(r, 200)); }
  throw new Error(description);
}
async function launch(output) {
  assert.ok(['release', 'release-next'].includes(output));
  const executable = path.join(root, output, 'win-unpacked', '矩效 Matrix.exe');
  assert.ok(fs.existsSync(executable));
  const child = spawn(executable, [`--matrix-user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], { cwd: root, windowsHide: true, stdio: 'ignore' });
  children.push(child);
  let target;
  await wait(async () => {
    if (child.exitCode !== null) throw new Error('Disposable upgrade app exited');
    try { target = (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) }).then(r => r.json())).find(t => t.type === 'page' && t.url.includes('/app/')); return !!target; } catch { return false; }
  }, 'Upgrade app did not load');
  const base = new URL(target.url).origin;
  assert.equal(new URL(base).hostname, '127.0.0.1');
  assert.ok(fs.existsSync(path.join(profile, 'database', 'PG_VERSION')));
  const page = await fetch(`${base}/app/`);
  const csrf = /suda-csrf-token=([^;]+)/.exec(page.headers.get('set-cookie') || '')?.[1];
  assert.ok(csrf);
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  const call = async (method, route, body, token) => {
    const r = await fetch(`${base}${route}`, { method, headers: { cookie: `suda-csrf-token=${csrf}`, 'x-suda-csrf-token': csrf,
      'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = await r.json();
    assert.ok([200, 201].includes(r.status), `${route}: HTTP ${r.status}, ${value.error?.message || value.message || ''}`);
    return value.data;
  };
  current = { child, socket, call };
  return current;
}
async function close() {
  if (!current) return;
  const { child, socket } = current;
  socket.send(JSON.stringify({ id: 1, method: 'Page.close' }));
  await wait(() => child.exitCode !== null, 'Disposable app did not close');
  socket.close(); current = null;
  await wait(async () => { try { await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) }); return false; } catch { return true; } }, 'Debug endpoint did not close');
}
try {
  const marker = `QA_upgrade_${Date.now()}`;
  let app = await launch('release');
  const oldUser = await app.call('POST', '/api/auth/login', { username: 'demo', password: 'user123456' });
  const account = await app.call('POST', '/api/platform/accounts/desktop', { platform: 'douyin', connectorSessionId: randomUUID(), nickname: marker, pageUrl: 'https://creator.douyin.com/' }, oldUser.token);
  const [draft] = await app.call('POST', '/api/content/posts', { title: marker, content: 'preserve old draft', mediaType: 'video', accountIds: [account.id], status: 'draft' }, oldUser.token);
  await close();
  app = await launch('release-next');
  const upgradedUser = await app.call('POST', '/api/auth/login', { username: 'demo', password: 'user123456' });
  assert.equal(upgradedUser.user.id, oldUser.user.id);
  const accounts = await app.call('GET', '/api/platform/accounts?pageSize=100', undefined, upgradedUser.token);
  assert.ok(accounts.items.some(a => a.id === account.id && a.nickname === marker));
  assert.equal((await app.call('GET', `/api/content/posts/${draft.id}`, undefined, upgradedUser.token)).content, 'preserve old draft');
  const [task] = await app.call('POST', '/api/personal/tasks', { requestId: randomUUID(), accountIds: [account.id], kind: 'publish', title: marker, content: 'new manual workflow', dueAt: new Date().toISOString() }, upgradedUser.token);
  assert.equal(task.status, 'pending');
  assert.equal((await app.call('GET', '/api/personal/tasks?dueOnly=true', undefined, upgradedUser.token)).total, 1);
  await close();
  app = await launch('release-next');
  const relaunchedUser = await app.call('POST', '/api/auth/login', { username: 'demo', password: 'user123456' });
  const tasks = await app.call('GET', '/api/personal/tasks', undefined, relaunchedUser.token);
  assert.ok(tasks.items.some(t => t.id === task.id && t.content === 'new manual workflow' && t.status === 'pending'));
  assert.equal((await app.call('GET', `/api/content/posts/${draft.id}`, undefined, relaunchedUser.token)).content, 'preserve old draft');
  await close();
  failed = false;
  console.log(JSON.stringify({ packagedUpgrade: 'passed', launches: 3, preserved: ['user', 'account', 'old draft', 'new task across restart'], additiveMigration: true, realUserDataTouched: false }));
} finally {
  if (current) {
    try { await close(); } catch { current?.socket.close(); }
  }
  for (const child of children) if (child.exitCode === null) child.kill();
  if (!failed && path.dirname(profile) === os.tmpdir() && path.basename(profile).startsWith('matrix-upgrade-qa-')) fs.rmSync(profile, { recursive: true, force: true });
  if (failed) console.error('Upgrade QA retained its disposable profile for diagnosis:', profile);
}
