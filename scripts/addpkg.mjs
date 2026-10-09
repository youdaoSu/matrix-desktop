#!/usr/bin/env node
// 补充安装 package.json 声明但 lock 缺失的顶层包
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const TAR = 'C:\\Windows\\System32\\tar.exe';
const CACHE = path.join(ROOT, '.mycache');
fs.mkdirSync(CACHE, { recursive: true });

const EXTRA = [
  { name: 'cross-env', version: '7.0.3' },
  { name: 'drizzle-kit', version: '0.31.11' },
];

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 25000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); return resolve(get(new URL(res.headers.location, url).href));
      }
      let buf = Buffer.alloc(0);
      res.on('data', (d) => (buf = Buffer.concat([buf, d])));
      res.on('end', () => resolve(buf));
    }).on('error', reject);
  });
}

const BIN_DIR = path.join(ROOT, 'node_modules', '.bin');
function writeShim(name, rel, binFile) {
  const relBin = path.relative(BIN_DIR, path.join(ROOT, 'node_modules', rel, binFile)).replace(/\\/g, '/');
  fs.writeFileSync(path.join(BIN_DIR, name + '.cmd'), `@echo off\r\nnode "%~dp0\\${relBin}" %*\r\n`);
  fs.writeFileSync(path.join(BIN_DIR, name), `#!/bin/sh\nbasedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")\nnode "$basedir/${relBin}" "$@"\r\n`);
}

for (const { name, version } of EXTRA) {
  const target = path.join(ROOT, 'node_modules', name);
  const meta = JSON.parse((await get(`https://registry.npmmirror.com/${name}/${version}`)).toString());
  const tarball = meta.dist.tarball;
  const cacheFile = path.join(CACHE, tarball.split('/').pop());
  if (!fs.existsSync(cacheFile) || fs.statSync(cacheFile).size === 0) {
    fs.writeFileSync(cacheFile, await get(tarball));
  }
  fs.mkdirSync(target, { recursive: true });
  execFileSync(TAR, ['-xzf', cacheFile, '-C', target, '--strip-components=1'], { stdio: 'ignore' });
  console.log(`已安装 ${name}@${version}`);

  // 生成 bin
  if (meta.bin) {
    let bins = typeof meta.bin === 'string' ? { [name.split('/').pop()]: meta.bin } : meta.bin;
    for (const [bn, bf] of Object.entries(bins)) {
      const looksJs = /\.(js|mjs|cjs)$/i.test(bf) || !path.extname(bf);
      if (looksJs) { writeShim(bn, name, bf); console.log(`  生成命令: ${bn}`); }
    }
  }
}

// 校验关键依赖是否存在
const need = ['cross-spawn', 'tsx', 'esbuild', '@drizzle-team/brocli', '@esbuild-kit/esm-loader'];
for (const d of need) {
  const ok = fs.existsSync(path.join(ROOT, 'node_modules', d, 'package.json'));
  console.log(`依赖 ${d}: ${ok ? 'OK' : '缺失!'}`);
}
console.log('\n[OK] 补充包安装完成。');
