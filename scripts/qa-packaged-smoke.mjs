// Validate the actual packaged runtime with a fresh, disposable user-data directory.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const output = process.argv[2] || 'release';
if (!['release', 'release-preview', 'release-next'].includes(output)) throw new Error('Unexpected package output directory');
const packageRoot = path.join(root, output, 'win-unpacked');
const executable = path.join(packageRoot, '远效.exe');
if (!fs.existsSync(executable)) throw new Error('Build the desktop package first');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-packaged-qa-'));
const debugPort = 9392;
const desktop = spawn(executable, [`--matrix-user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`,
  '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'], { windowsHide: true, stdio: 'ignore' });
let socket;
let failed = true;
async function wait(fn, label, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(label);
}
async function targets() {
  try { return await fetch(`http://127.0.0.1:${debugPort}/json/list`, { signal: AbortSignal.timeout(3000) }).then(response => response.json()); } catch { return []; }
}
async function run(file, base) {
  const child = spawn(process.execPath, [file, String(debugPort), base, profile], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const code = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`${file} timed out`)); }, 120000);
    child.once('exit', code => { clearTimeout(timeout); resolve(code); });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
  });
  if (code !== 0) throw new Error(output);
  console.log(`${file}: ${output.trim()}`);
}
try {
  let target;
  await wait(async () => { target = (await targets()).find(item => item.type === 'page' && item.url.includes('/app/')); return !!target; }, 'Packaged first-run window did not load');
  const base = new URL(target.url).origin;
  if (!base.startsWith('http://127.0.0.1:')) throw new Error('Package must use its own local service');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id); clearTimeout(task.timer);
    message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, method === 'Page.captureScreenshot' ? 30000 : 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result?.value;
  };
  await wait(() => evaluate("document.body?.innerText.includes('登录') && !!document.querySelector('input')"), 'Package rendered a blank first-run page');
  if (!fs.existsSync(path.join(profile, 'database/PG_VERSION'))) throw new Error('Built-in database did not initialize');
  // Exercise the packaged recovery module, not just the development server.
  // This disposable profile has no SMTP credentials; it must never claim mail was sent.
  const recovery = await evaluate("(async()=>{const csrf=decodeURIComponent(/(?:^|; )suda-csrf-token=([^;]*)/.exec(document.cookie)?.[1]||'');const response=await fetch('/api/auth/password-recovery/status',{headers:{'x-suda-csrf-token':csrf},credentials:'same-origin'});if(!response.ok)throw Error('Packaged recovery readiness unavailable');return response.json();})()");
  assert.equal(recovery.data.emailAvailable, false);
  assert.equal(recovery.data.configured, false);
  await call('Page.navigate', { url: `${base}/app/#/forgot-password` });
  await wait(() => evaluate("!!document.querySelector('#recovery-code') && document.body.innerText.includes('尚未配置')"), 'Packaged recovery page did not show honest SMTP readiness');
  assert.equal(await evaluate("document.querySelector('button[type=submit]').disabled"), true);
  assert.equal(await evaluate("typeof window.matrixDesktop?.openRecoveryMailSettings"), 'function');
  assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b=>b.innerText.includes('配置邮件服务'))"), true);
  console.log(JSON.stringify({ packagedRecoveryChecks: 6, configured: false, realEmailSent: false, settingsEditorOpened: false }));
  await run('scripts/qa-ui-auth.mjs', base);
  await run('scripts/qa-feedback-api.mjs', base);
  await run('scripts/qa-account-observation-api.mjs', base);
  await run('scripts/qa-analytics-availability-api.mjs', base);
  await run('scripts/qa-platform-logos.mjs', base);
  await run('scripts/qa-routes.mjs', base);
  await run('scripts/qa-embedded-auth.mjs', base);
  await run('scripts/qa-platform-directory-ui.mjs', base);
  await run('scripts/qa-module-boundaries.mjs', base);
  await run('scripts/qa-official-data-ui.mjs', base);
  await call('Page.navigate', { url: `${base}/app/#/dashboard` });
  await wait(() => evaluate("!!document.querySelector('.matrix-shell')"), 'Packaged dashboard did not render');
  await call('Page.navigate', { url: `${base}/app/#/accounts` });
  await wait(() => evaluate("location.hash==='#/accounts' && document.querySelector('.matrix-official-deck')?.hidden===false && !!document.querySelector('[data-account-management]')"), 'Packaged unified account manager missing');
  await evaluate("[...document.querySelectorAll('[data-account-management] button')].find(button=>button.getClientRects().length && button.innerText.trim()==='添加账号').click();true");
  await wait(() => evaluate("!!document.querySelector('[role=dialog]')"), 'Packaged binding dialog missing');
  await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(button=>button.querySelector('strong')?.innerText==='抖音').click();true");
  await evaluate("document.querySelector('[data-open-bind-provider]').click();true");
  await wait(() => evaluate("(async()=>{try{return await document.querySelector('webview')?.executeJavaScript(\"document.body.innerText.trim().length > 60\");}catch{return false;}})()"), 'Packaged official guest did not render content');
  // Guest DOM becomes ready before Chromium submits its first visible surface.
  await new Promise(resolve => setTimeout(resolve, 2000));
  await call('Page.bringToFront');
  const screenshot = await call('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync('logs', { recursive: true });
  fs.writeFileSync('logs/qa-packaged-workspace.png', Buffer.from(screenshot.data, 'base64'));
  fs.writeFileSync('logs/qa-packaged-results.json', JSON.stringify({ firstRun: true, embeddedDatabase: true, authenticationChecks: 5, recoveryChecks: 6, realRecoveryEmailSent: false, routes: 64, officialGuestRendered: true }, null, 2));
  console.log('Packaged first-run, built-in database, 5 authentication checks, 64 routes, and official guest rendering passed');
  await evaluate('window.close(); true').catch(() => {});
  await wait(() => desktop.exitCode !== null, 'Package did not shut down cleanly', 20000);
  failed = false;
} finally {
  socket?.close();
  if (desktop.exitCode === null) desktop.kill();
  const dataDir = path.join(profile, 'database');
  if (fs.existsSync(path.join(dataDir, 'postmaster.pid'))) spawnSync(path.join(packageRoot, 'resources/postgres/bin/pg_ctl.exe'), ['-D', dataDir, '-m', 'fast', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
  if (!failed && path.dirname(profile) === os.tmpdir() && path.basename(profile).startsWith('matrix-packaged-qa-')) fs.rmSync(profile, { recursive: true, force: true });
  if (failed) console.error(`Diagnostic profile retained: ${profile}`);
}
