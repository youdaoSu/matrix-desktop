#!/usr/bin/env node
// 矩效 Matrix 自定义安装器：绕过 npm 的不稳定网络，用 node 直连稳定下载
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const CACHE = path.join(ROOT, '.mycache');
const TAR = 'C:\\Windows\\System32\\tar.exe';
const CONCURRENCY = 4;
const FETCH_TIMEOUT = 30000;
const RETRIES = 6;
fs.mkdirSync(CACHE, { recursive: true });

const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));

// 1. 收集待安装包（跳过 optional）
const tasks = [];
for (const [key, val] of Object.entries(lock.packages)) {
  if (!key) continue;
  if (!val.resolved) continue;
  if (val.optional) continue;
  const rel = key.replace(/^node_modules[\\/]/, '');
  const target = path.join(ROOT, 'node_modules', rel);
  const pkgJsonPath = path.join(target, 'package.json');
  let installed = false;
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pj = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      installed = !!pj.name && !!pj.version;
    } catch { installed = false; }
  }
  tasks.push({ key, rel, target, url: val.resolved, bin: val.bin, installed });
}

const total = tasks.length;
const todo = tasks.filter((t) => !t.installed);
console.log(`目标包总数 ${total}，已安装 ${total - todo.length}，待处理 ${todo.length}`);

// 2. 下载（socket 空闲超时，任意阶段无数据即断开重试）
function download(url, dest) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: FETCH_TIMEOUT }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(download(new URL(res.headers.location, url).href, dest));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const socket = res.socket;
      let idleTimer;
      const resetIdle = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => socket.destroy(new Error('数据传输空闲超时')), FETCH_TIMEOUT);
      };
      resetIdle();
      const tmp = dest + '.part';
      const file = fs.createWriteStream(tmp);
      res.pipe(file);
      res.on('data', resetIdle);
      const cleanup = () => clearTimeout(idleTimer);
      file.on('finish', () => { cleanup(); file.close(() => { try { fs.renameSync(tmp, dest); } catch (e) { return reject(e); } resolve(); }); });
      res.on('error', (e) => { cleanup(); reject(e); });
      file.on('error', (e) => { cleanup(); reject(e); });
      socket.on('close', () => cleanup());
      socket.on('error', (e) => { cleanup(); reject(e); });
    });
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
  });
}

async function downloadWithRetry(url, cachePath) {
  for (let a = 1; a <= RETRIES; a++) {
    try {
      await download(url, cachePath);
      return;
    } catch (e) {
      if (a === RETRIES) throw new Error(`${url} 下载失败（重试${RETRIES}次）: ${e.message}`);
      await new Promise((r) => setTimeout(r, 800 * a));
    }
  }
}

// 3. 解压（tar strip 第一层 package/）
function extract(cacheFile, target) {
  fs.mkdirSync(target, { recursive: true });
  execFileSync(TAR, ['-xzf', cacheFile, '-C', target, '--strip-components=1'], { stdio: 'ignore' });
}

// 4. 并发队列
let done = total - todo.length;
let failed = 0;
const failures = [];
const queue = todo.slice();
function bar() {
  const pct = Math.floor((done * 100) / total);
  const filled = Math.floor(pct / 2);
  const bar = '#'.repeat(filled) + '.'.repeat(50 - filled);
  process.stdout.write(`\r  [${bar}] ${done}/${total} (${pct}%) 失败${failed}    `);
}
bar();

async function worker() {
  while (queue.length) {
    const t = queue.shift();
    const cacheFile = path.join(CACHE, t.url.split('/').pop());
    try {
      if (!fs.existsSync(cacheFile) || fs.statSync(cacheFile).size === 0) {
        await downloadWithRetry(t.url, cacheFile);
      }
      extract(cacheFile, t.target);
      done++;
    } catch (e) {
      failed++;
      failures.push({ rel: t.rel, msg: e.message });
      done++;
    }
    bar();
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log('\n');

// 5. 生成 .bin 命令
const BIN_DIR = path.join(ROOT, 'node_modules', '.bin');
fs.mkdirSync(BIN_DIR, { recursive: true });
function writeShim(name, rel, binFile) {
  const cmdPath = path.join(BIN_DIR, name + '.cmd');
  const shPath = path.join(BIN_DIR, name);
  // 从 .bin 到 bin 文件的相对路径（正斜杠）
  const relBin = path.relative(BIN_DIR, path.join(ROOT, 'node_modules', rel, binFile)).replace(/\\/g, '/');
  const cmd = `@echo off\r\nnode "%~dp0\\${relBin}" %*\r\n`;
  const sh = `#!/bin/sh\nbasedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")\nnode "$basedir/${relBin}" "$@"\r\n`;
  fs.writeFileSync(cmdPath, cmd);
  fs.writeFileSync(shPath, sh);
}
let binN = 0;
for (const t of tasks) {
  if (!t.bin) continue;
  const rel = t.rel;
  if (rel.includes('node_modules')) continue; // 只处理顶层包
  let bins = t.bin;
  if (typeof bins === 'string') {
    bins = { [rel.split('/').pop()]: bins };
  }
  for (const [name, file] of Object.entries(bins)) {
    // 只对 JS 类入口用 node 包装；其余直接引用
    const looksJs = /\.(js|mjs|cjs)$/i.test(file) || !path.extname(file);
    if (looksJs) {
      writeShim(name, rel, file);
      binN++;
    }
  }
}
console.log(`已生成 ${binN} 个 .bin 命令`);

if (failures.length) {
  console.log(`\n[警告] ${failures.length} 个包未成功：`);
  failures.slice(0, 20).forEach((f) => console.log('  ' + f.rel + ' : ' + f.msg));
  process.exit(1);
}
console.log('\n[OK] 依赖安装全部完成。');
