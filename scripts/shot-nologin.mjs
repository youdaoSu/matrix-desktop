#!/usr/bin/env node
// 未登录访问某 URL，看是否被重定向到登录页
// 用法: node scripts/shot-nologin.mjs <url路径> <输出png>
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const path = process.argv[2] || '/dashboard';
const out = process.argv[3] || 'shot-nologin.png';
const userDir = join(tmpdir(), 'edge-nl-' + Date.now());
mkdirSync(userDir, { recursive: true });
const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--remote-debugging-port=9223',
  `--user-data-dir=${userDir}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 30; i++) {
  try {
    const list = await (await fetch('http://localhost:9223/json')).json();
    if (list.find((t) => t.type === 'page')) break;
  } catch {}
  await sleep(500);
}
const list = await (await fetch('http://localhost:9223/json')).json();
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pend = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
};
const send = (method, params = {}) => {
  const myId = ++id;
  return new Promise((res) => { pend.set(myId, res); ws.send(JSON.stringify({ id: myId, method, params })); });
};
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:8080' + path });
await sleep(5000);
const loc = await send('Runtime.evaluate', { expression: 'location.pathname', returnByValue: true });
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log('最终路径:', loc.result.result.value);
console.log('截图:', out);
ws.close(); edge.kill(); process.exit(0);
