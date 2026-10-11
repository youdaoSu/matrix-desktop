// Isolated full-stack desktop regression. Never runs CRUD against the user's database.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const config = { ...dotenv.parse(fs.readFileSync('.env')), ...dotenv.parse(fs.readFileSync('.env.local')) };
const databaseUrl = new URL(config.SUDA_DATABASE_URL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(databaseUrl.hostname)) throw new Error('QA requires a local PostgreSQL instance');
const name = `matrix_workspace_qa_${Date.now()}`;
const qaUrl = new URL(databaseUrl);
qaUrl.pathname = `/${name}`;
const adminSql = postgres(databaseUrl.toString(), { max: 1 });
let sql;
let created = false;
let server;
let desktop;
let socket;
let failure;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-workspace-qa-'));
const report = { checks: [], officialPages: [], routes: null };
const port = 3291;
const debugPort = 9391;
const base = `http://127.0.0.1:${port}`;
const children = [];
function launch(file, args, env) {
  const child = spawn(file, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  let tail = '';
  child.stdout.on('data', data => { tail = (tail + data).slice(-12000); });
  child.stderr.on('data', data => { tail = (tail + data).slice(-12000); });
  child.on('error', error => { tail = error.message; });
  child.qaTail = () => tail.replaceAll(databaseUrl.password, '[redacted]');
  return child;
}
async function waitUntil(fn, label, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(label);
}
function ensure(condition, label) { if (!condition) throw new Error(label); report.checks.push(label); }
async function runScript(file, args) {
  const child = launch(process.execPath, [file, ...args], process.env);
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${file} timed out`)); }, 120000);
    child.once('exit', code => { clearTimeout(timer); resolve(code); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
  });
  if (result !== 0) throw new Error(`${file}: ${child.qaTail()}`);
  console.log(`${file}: ${child.qaTail().trim()}`);
}
try {
  await adminSql.unsafe(`CREATE DATABASE "${name}"`);
  created = true;
  sql = postgres(qaUrl.toString(), { max: 1 });
  const schema = fs.readFileSync('desktop/database-schema.sql', 'utf8')
    .replace(/^\\.*$/gm, '').replace(/^GRANT[^;]*;/gm, '');
  await sql.unsafe(schema);
  await sql.unsafe('SET search_path TO public');
  const seed = fs.readFileSync('desktop/database-seed.sql', 'utf8');
  await sql.unsafe(seed.slice(seed.indexOf('INSERT INTO vip_plans')));
  await sql.unsafe('GRANT USAGE ON SCHEMA public TO "anon_", "authenticated_", "service_role_"; GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "anon_", "authenticated_", "service_role_"; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "anon_", "authenticated_", "service_role_";');
  const env = { ...process.env, ...config, SUDA_DATABASE_URL: qaUrl.toString(), NODE_ENV: 'production', MATRIX_DESKTOP: '1',
    MIAODA_APP_TYPE: '3', MIAODA_LOCAL_DEV: '1', SERVER_HOST: '127.0.0.1', SERVER_PORT: String(port),
    FORCE_AUTHN_INNERAPI_DOMAIN: base, MIAODA_CACHE_URL: '', JWT_SECRET: randomBytes(48).toString('hex'),
    TOKEN_ENCRYPTION_KEY: randomBytes(48).toString('hex'), OAUTH_STATE_SECRET: randomBytes(48).toString('hex'),
  };
  server = launch(process.execPath, ['dist/server/main.js'], env);
  await waitUntil(async () => {
    if (server.exitCode !== null) throw new Error(`QA server stopped: ${server.qaTail()}`);
    try { return (await fetch(`${base}/app/`)).ok; } catch { return false; }
  }, 'QA server did not start');
  await runScript('scripts/qa-api.mjs', [base]);
  await runScript('scripts/qa-crud.mjs', [base]);
  console.log('API and CRUD tests finished in isolated database');
  const [user] = await sql`SELECT id FROM app_users WHERE username='demo'`;
  for (const platform of ['douyin', 'xiaohongshu', 'wechat', 'bilibili']) {
    const sessionId = randomUUID();
    await sql`INSERT INTO platform_accounts(user_id,platform,platform_user_id,nickname,group_name,auth_status,health_status,raw_data)
      VALUES(${user.id},${platform},${`desktop:${sessionId}`},${`QA ${platform}`},'QA 工作区','authorized','normal',${sql.json({ provider: 'desktop-connector', connectorSessionId: sessionId })})`;
  }
  await runScript('scripts/qa-personal-tasks.mjs', [base]);
  desktop = launch(path.join(root, '.desktop-deps/node_modules/electron/dist/electron.exe'), [
    'desktop/main.cjs', `--remote-debugging-port=${debugPort}`, `--matrix-user-data-dir=${profile}`,
  ], { ...process.env, MATRIX_APP_URL: `${base}/app/#/login` });
  await waitUntil(async () => { try { return (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).ok; } catch { return false; } }, 'QA desktop did not start');
  await runScript('scripts/qa-ui-auth.mjs', [String(debugPort), base]);
  await runScript('scripts/qa-routes.mjs', [String(debugPort), base]);
  const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(response => response.json());
  const target = targets.find(item => item.type === 'page' && item.url.startsWith(base));
  if (!target) throw new Error('QA desktop target missing');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  const pending = new Map();
  let nextId = 0;
  socket.addEventListener('message', event => {
    const result = JSON.parse(event.data);
    if (!pending.has(result.id)) return;
    const { resolve, reject, timer } = pending.get(result.id);
    clearTimeout(timer); pending.delete(result.id);
    result.error ? reject(new Error(result.error.message)) : resolve(result.result);
  });
  function call(method, params = {}) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result?.value;
  }
  async function click(selector, text) {
    const found = await evaluate(`(() => { const target = [...document.querySelectorAll(${JSON.stringify(selector)})].find(item => item.getClientRects().length && item.innerText.includes(${JSON.stringify(text)})); if (!target) return false; target.click(); return true; })()`);
    if (!found) throw new Error(`Button missing: ${text}`);
  }
  async function screenshot(file) {
    const result = await call('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync('logs', { recursive: true });
    fs.writeFileSync(path.join('logs', file), Buffer.from(result.data, 'base64'));
  }
  await call('Runtime.enable');
  await call('Page.enable');
  await call('Page.navigate', { url: `${base}/app/#/dashboard` });
  await waitUntil(() => evaluate("!!document.querySelector('.matrix-shell')"), 'Desktop shell did not render');
  await waitUntil(() => evaluate("document.querySelectorAll('.matrix-home-platforms button').length === 4 && !document.querySelector('.matrix-dashboard')?.innerText.includes('加载中')"), 'Dashboard data did not finish loading');
  await screenshot('qa-workspace-dashboard.png');
  await click('.matrix-topbar nav a', '账号管理');
  await waitUntil(() => evaluate("document.body.innerText.includes('绑定账号')"), 'Account module did not render');
  await click('button', '绑定账号');
  await click('[role=dialog] button', '抖音');
  await waitUntil(() => evaluate("document.querySelectorAll('.matrix-rail-account').length === 4"), 'Account rail did not load fixtures');
  ensure(await evaluate("document.querySelector('.matrix-official-deck').getBoundingClientRect().height > 500"), 'Workspace uses the full content area');
  await screenshot('qa-workspace-empty.png');
  const platforms = [ ['douyin', '抖音'], ['xiaohongshu', '小红书'], ['wechat', '视频号'], ['bilibili', 'B站'] ];
  for (const [platform, label] of platforms) {
    if (report.officialPages.length !== 0) await click('.matrix-add-platforms button', label);
    await waitUntil(() => evaluate(`document.querySelectorAll('webview').length === ${report.officialPages.length + 1}`), `${label} guest not created`);
    await waitUntil(() => evaluate(`(() => { try { return !![...document.querySelectorAll('.matrix-official-browser')].find(item => !item.hidden)?.querySelector('webview')?.getWebContentsId(); } catch { return false; } })()`), `${label} guest not attached`);
    const state = await evaluate(`(() => { const browser = [...document.querySelectorAll('.matrix-official-browser')].find(item => !item.hidden); const view=browser.querySelector('webview'); return {src:view.getAttribute('src'),partition:view.getAttribute('partition'),guestId:view.getWebContentsId(),height:view.getBoundingClientRect().height,width:view.getBoundingClientRect().width}; })()`);
    ensure(state.partition.startsWith(`persist:matrix-${platform}-`), `${label} has its own local session`);
    ensure(state.height > 300 && state.width > 500, `${label} is embedded in the main workspace`);
    const sessionId = state.partition.slice(`persist:matrix-${platform}-`.length);
    const result = await evaluate(`window.matrixDesktop.completePlatformLogin({platform:${JSON.stringify(platform)},sessionId:${JSON.stringify(sessionId)},webContentsId:${state.guestId}})`);
    ensure(Boolean(result?.error), `${label} cannot bind without verified official login`);
    const wrong = await evaluate(`window.matrixDesktop.completePlatformLogin({platform:${JSON.stringify(platform)},sessionId:${JSON.stringify(randomUUID())},webContentsId:${state.guestId}})`);
    ensure(wrong?.error?.includes('会话不一致'), `${label} rejects a mismatched account session`);
    report.officialPages.push({ platform, ...state });
  }
  const guestIds = await evaluate("[...document.querySelectorAll('webview')].map(view=>view.getWebContentsId()).sort((a,b)=>a-b)");
  for (let index = 0; index < platforms.length; index++) {
    const [platform, label] = platforms[index];
    await waitUntil(() => evaluate(`(async () => { const view=document.querySelectorAll('webview')[${index}]; try { return await view.executeJavaScript("document.readyState !== 'loading' && document.body.innerText.trim().length > 60"); } catch { return false; } })()`), `${label} official page did not render readable content`, 45000);
    const loaded = await evaluate(`document.querySelectorAll('webview')[${index}].executeJavaScript("({url:location.href,title:document.title,characters:document.body.innerText.trim().length})")`);
    report.officialPages[index].loaded = loaded;
    ensure(loaded.characters > 60 && loaded.url.startsWith('https://'), `${label} official page renders real content inside the guest`);
  }
  await click('.matrix-workspace-tabs > button', '收起账号页面');
  await click('.matrix-topbar nav a', '一键发布');
  await waitUntil(() => evaluate("location.hash === '#/publish/create' && document.body.innerText.includes('进入官方发布页')"), 'Publishing page missing');
  await click('button', '进入官方发布页');
  ensure(await evaluate("[...document.querySelectorAll('.matrix-intent-bar button.is-active')].some(button=>button.innerText==='发布内容')"), 'Publishing opens the official publishing workflow');
  ensure(JSON.stringify(guestIds) === JSON.stringify(await evaluate("[...document.querySelectorAll('webview')].map(view=>view.getWebContentsId()).sort((a,b)=>a-b)")), 'Module switching preserves all official pages and sessions');
  await click('.matrix-browser-toolbar button', '文案辅助');
  ensure(await evaluate("(() => { const browser=[...document.querySelectorAll('.matrix-official-browser')].find(item=>!item.hidden); browser.querySelector('[aria-label=\"缩小官方页面\"]').click(); return Math.abs(browser.querySelector('webview').getZoomFactor()-0.9)<0.01; })()"), 'Official page zoom changes inside the embedded guest');
  ensure(await evaluate("(() => { const browser=[...document.querySelectorAll('.matrix-official-browser')].find(item=>!item.hidden); browser.querySelector('[aria-label=\"重置页面缩放\"]').click(); return Math.abs(browser.querySelector('webview').getZoomFactor()-1)<0.01; })()"), 'Official page zoom can reset to the default');
  ensure(await evaluate("!![...document.querySelectorAll('.matrix-official-browser')].find(item=>!item.hidden).querySelector('.matrix-draft-helper')"), 'Publishing helper opens beside the official page');
  await screenshot('qa-workspace-embedded.png');
  ensure(await evaluate("!document.body.innerText.includes('官方工作区') && !document.body.innerText.includes('矩效工作台')"), 'Unified interface does not expose two separate workspaces');
  ensure(await evaluate("document.querySelector('.matrix-page-content').getClientRects().length > 0 && document.querySelector('.matrix-official-deck').getClientRects().length > 0"), 'Publishing form stays visible alongside the account panel');
  await evaluate("(() => { [...document.querySelectorAll('.matrix-page-content [role=checkbox]')].slice(0,2).forEach(item=>item.click()); const title=document.querySelector('.matrix-page-content input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(title,'QA multi-account draft'); title.dispatchEvent(new Event('input',{bubbles:true})); return true; })()");
  await click('button', '为所选账号准备发布');
  await waitUntil(() => evaluate("document.querySelectorAll('webview').length === 6"), 'Two selected accounts did not receive separate draft tabs');
  ensure(await evaluate("[...document.querySelectorAll('.matrix-draft-helper textarea')].filter(item=>item.value==='QA multi-account draft').length === 2"), 'Draft text is handed off to each selected account independently');
  const uploadGuard = await evaluate("(() => { const view=[...document.querySelectorAll('.matrix-official-browser')].find(item=>!item.hidden).querySelector('webview'); const partition=view.getAttribute('partition'); const platform=partition.split('-')[1]; return window.matrixDesktop.uploadMedia({platform,sessionId:partition.slice(('persist:matrix-'+platform+'-').length),webContentsId:view.getWebContentsId(),mediaType:'video'}); })()");
  ensure(Boolean(uploadGuard.error) && !uploadGuard.uploadStarted, 'Unprepared official pages cannot upload files or report success');
  await waitUntil(() => evaluate("(async()=>{try{return await [...document.querySelectorAll('.matrix-official-browser')].find(item=>!item.hidden).querySelector('webview').executeJavaScript(\"document.body.innerText.trim().length>60\");}catch{return false;}})()"), 'Prepared account login page did not load', 45000);
  await new Promise(resolve => setTimeout(resolve, 2000));
  await screenshot('qa-personal-publish.png');
  await click('.matrix-workspace-tabs > button', '收起账号页面');
  await click('.matrix-topbar nav a', '粉丝互动');
  await waitUntil(() => evaluate("location.hash === '#/engage/comments'"), 'Comments route did not open');
  await click('button', '官方页面回复');
  ensure(await evaluate("[...document.querySelectorAll('.matrix-intent-bar button.is-active')].some(button=>button.innerText==='评论回复')"), 'Comments open the official reply workflow');
  await click('.matrix-workspace-tabs > button', '收起账号页面');
  await click('.matrix-module-sidebar a', '私信管理');
  await waitUntil(() => evaluate("location.hash === '#/engage/messages'"), 'Messages route did not open');
  await click('button', '官方页面发私信');
  ensure(await evaluate("[...document.querySelectorAll('.matrix-intent-bar button.is-active')].some(button=>button.innerText==='私信消息')"), 'Messages open the official messaging workflow');
  await evaluate("document.documentElement.classList.add('dark'); true");
  await screenshot('qa-workspace-dark.png');
  await evaluate("document.documentElement.classList.remove('dark'); true");
  const count = await evaluate("document.querySelectorAll('webview').length");
  await evaluate("document.querySelector('.matrix-account-tab.is-active .matrix-tab-close').click(); true");
  await waitUntil(() => evaluate(`document.querySelectorAll('webview').length === ${count - 1}`), 'Closing a tab did not release its guest');
  ensure(await evaluate(`document.querySelectorAll('webview').length === ${count - 1}`), 'Closing one tab preserves other account pages');
  await runScript('scripts/qa-personal-tools.mjs', [String(debugPort), base]);
  fs.writeFileSync('logs/qa-workspace-results.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.checks.length, officialPlatforms: report.officialPages.length, isolatedDatabase: true }, null, 2));
} catch (error) {
  failure = error;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  socket?.close();
  for (const child of children.reverse()) {
    if (child.exitCode !== null) continue;
    child.kill();
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
  }
  await sql?.end({ timeout: 2 });
  if (created) {
    await adminSql`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=${name} AND pid<>pg_backend_pid()`;
    await adminSql.unsafe(`DROP DATABASE "${name}"`);
  }
  await adminSql.end({ timeout: 2 });
  // Keep the unique QA profile on failure for diagnosis; successful runs remove only this temp directory.
  if (!failure && path.dirname(profile) === os.tmpdir() && path.basename(profile).startsWith('matrix-workspace-qa-')) fs.rmSync(profile, { recursive: true, force: true });
}
