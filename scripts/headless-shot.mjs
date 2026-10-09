#!/usr/bin/env node
// 无头浏览器：从入口 HTML 加载 SPA，写登录态，再用客户端路由导航并截图
// 用法: node scripts/headless-shot.mjs <入口html> <目标路由(相对basename)> <输出png>
// 例:   node scripts/headless-shot.mjs /client/index.html /analytics/flow shot.png
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ORIGIN = 'http://localhost:8080';
const entry = process.argv[2] || '/client/index.html';
const target = process.argv[3] || '/';
const out = process.argv[4] || 'shot.png';
const size = (process.argv[5] || '1600x1000').split('x').map(Number);
const [W, H] = size;

const userDir = join(tmpdir(), 'edge-headless-' + Date.now());
mkdirSync(userDir, { recursive: true });
const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--remote-debugging-port=9222',
  `--user-data-dir=${userDir}`,
  '--no-first-run', '--no-default-browser-check',
  'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWs() {
  for (let i = 0; i < 30; i++) {
    try {
      const list = await (await fetch('http://localhost:9222/json')).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error('CDP 不可用');
}
const ws = new WebSocket(await getWs());
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const errs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
    errs.push(m.params.args.map((a) => a.value || a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown')
    errs.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
function send(method, params = {}) {
  const myId = ++id;
  return new Promise((resolve) => { pending.set(myId, resolve); ws.send(JSON.stringify({ id: myId, method, params })); });
}
async function navigate(url) {
  await send('Page.enable');
  await send('Page.navigate', { url });
  await sleep(2800);
}
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

// 1. 加载入口 HTML（同源）
await navigate(ORIGIN + entry);
// 2. 登录并写登录态
const loginExpr = `
  (async () => {
    const r = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'demo', password: 'user123456' })
    });
    const j = await r.json();
    localStorage.setItem('matrix_token', j.data.token);
    localStorage.setItem('matrix_user', JSON.stringify(j.data.user));
    return { vip: j.data.user.vipStatus, basename: window.__BASENAME__ };
  })()
`;
const lr = await send('Runtime.evaluate', { expression: loginExpr, awaitPromise: true, returnByValue: true });
console.log('登录结果:', JSON.stringify(lr.result?.result?.value));

// 3. 重新加载入口（带登录态，进入系统首页）
await navigate(ORIGIN + entry);
await sleep(2000);
// 4. 客户端路由导航（pushState + popstate，不请求服务器）
const navExpr = `
  (() => {
    let b = window.__BASENAME__ || '';
    if (b === '/') b = '';
    const t = '${target === '/' ? '/' : target}';
    const url = t === '/' ? (b || '/') : b + t;
    window.history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
    return location.pathname;
  })()
`;
const nr = await send('Runtime.evaluate', { expression: navExpr, returnByValue: true });
console.log('客户端导航到:', nr.result?.result?.value);
await sleep(6000); // 等待图表渲染

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log('截图已保存:', out);
console.log('运行时错误:', errs.length ? errs.slice(0, 6) : '无');
ws.close(); edge.kill(); process.exit(0);
