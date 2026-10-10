// Validate the actual packaged runtime with a fresh, disposable user-data directory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const executable = path.join(root, 'release/win-unpacked/矩效 Matrix.exe');
if (!fs.existsSync(executable)) throw new Error('Build the desktop package first');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-packaged-qa-'));
const debugPort = 9392;
const desktop = spawn(executable, [`--matrix-user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`], { windowsHide: true, stdio: 'ignore' });
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
  try { return await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(response => response.json()); } catch { return []; }
}
async function run(file, base) {
  const child = spawn(process.execPath, [file, String(debugPort), base], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result?.value;
  };
  await wait(() => evaluate("document.body?.innerText.includes('登录') && !!document.querySelector('input')"), 'Package rendered a blank first-run page');
  if (!fs.existsSync(path.join(profile, 'database/PG_VERSION'))) throw new Error('Built-in database did not initialize');
  await run('scripts/qa-ui-auth.mjs', base);
  await run('scripts/qa-routes.mjs', base);
  await run('scripts/qa-embedded-auth.mjs', base);
  await call('Page.navigate', { url: `${base}/app/#/dashboard` });
  await wait(() => evaluate("!!document.querySelector('.matrix-shell')"), 'Packaged dashboard did not render');
  await evaluate("document.querySelectorAll('.matrix-workspace-tabs > button')[1].click(); true");
  await wait(() => evaluate("!!document.querySelector('.matrix-add-platforms button')"), 'Packaged official workspace missing');
  await evaluate("document.querySelector('.matrix-add-platforms button').click(); true");
  await wait(() => evaluate("(async()=>{try{return await document.querySelector('webview')?.executeJavaScript(\"document.body.innerText.trim().length > 60\");}catch{return false;}})()"), 'Packaged official guest did not render content');
  const screenshot = await call('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync('logs', { recursive: true });
  fs.writeFileSync('logs/qa-packaged-workspace.png', Buffer.from(screenshot.data, 'base64'));
  fs.writeFileSync('logs/qa-packaged-results.json', JSON.stringify({ firstRun: true, embeddedDatabase: true, authenticationChecks: 4, routes: 60, officialGuestRendered: true }, null, 2));
  console.log('Packaged first-run, built-in database, 4 authentication checks, 60 routes, and official guest rendering passed');
  await evaluate('window.close(); true').catch(() => {});
  await wait(() => desktop.exitCode !== null, 'Package did not shut down cleanly', 20000);
  failed = false;
} finally {
  socket?.close();
  if (desktop.exitCode === null) desktop.kill();
  const dataDir = path.join(profile, 'database');
  if (fs.existsSync(path.join(dataDir, 'postmaster.pid'))) spawnSync(path.join(root, 'release/win-unpacked/resources/postgres/bin/pg_ctl.exe'), ['-D', dataDir, '-m', 'fast', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
  if (!failed && path.dirname(profile) === os.tmpdir() && path.basename(profile).startsWith('matrix-packaged-qa-')) fs.rmSync(profile, { recursive: true, force: true });
  if (failed) console.error(`Diagnostic profile retained: ${profile}`);
}
