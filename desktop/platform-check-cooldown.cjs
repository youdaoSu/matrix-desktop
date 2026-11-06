const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const HOUR = 60 * 60 * 1000;
const platforms = new Set(['douyin', 'xiaohongshu', 'wechat', 'bilibili']);

function createPlatformCheckCooldown({ file, now = Date.now }) {
  const until = new Map();
  try {
    const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [platform, at] of Object.entries(stored)) {
      if (platforms.has(platform) && Number.isSafeInteger(at) && at > now() && at <= now() + 24 * HOUR) until.set(platform, at);
    }
  } catch { /* Missing or invalid metadata cannot establish a login state. */ }

  function get(platform) {
    const retryAt = until.get(platform);
    if (!retryAt || retryAt <= now()) return;
    const minutes = Math.ceil((retryAt - now()) / 60000);
    return { rateLimited: true, retryAt, error: `官方访问受限，自动核验已暂停。软件保护间隔剩余约 ${minutes} 分钟，平台实际恢复时间以官网为准。` };
  }

  function limit(platform, retryAfterMs = HOUR) {
    if (!platforms.has(platform)) return;
    const delay = Number.isFinite(retryAfterMs) ? Math.min(24 * HOUR, Math.max(HOUR, retryAfterMs)) : HOUR;
    const current = get(platform);
    if (current && (delay === HOUR || current.retryAt - now() >= delay - 60000)) return current;
    until.set(platform, Math.max(until.get(platform) || 0, now() + delay));
    const temporary = file + '.' + randomUUID() + '.tmp';
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify(Object.fromEntries(until)), { mode: 0o600 });
    fs.renameSync(temporary, file);
    return get(platform);
  }

  function observe(platform, details) {
    if (details.statusCode !== 429) return;
    let url;
    try { url = new URL(details.url); } catch { return; }
    const domains = { douyin: 'douyin.com', xiaohongshu: 'xiaohongshu.com', wechat: 'weixin.qq.com', bilibili: 'bilibili.com' };
    const domain = domains[platform];
    if (!domain || url.protocol !== 'https:' || !(url.hostname === domain || url.hostname.endsWith('.' + domain))) return;
    if (details.resourceType !== 'mainFrame' && !/\/(?:passport|api|aweme)\//.test(url.pathname)) return;
    const header = Object.entries(details.responseHeaders || {}).find(([key]) => key.toLowerCase() === 'retry-after')?.[1];
    const value = Array.isArray(header) ? header[0] : header;
    const requested = /^\d{1,8}$/.test(value || '') ? Number(value) * 1000 : Date.parse(value) - now();
    return limit(platform, requested);
  }

  return { get, limit, observe };
}

module.exports = { createPlatformCheckCooldown };
