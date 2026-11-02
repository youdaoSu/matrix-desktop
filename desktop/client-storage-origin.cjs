const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { writeLocalJson } = require('./local-json-store.cjs');

function localClientOrigin(port) {
  const value = Number(port);
  if (!Number.isSafeInteger(value) || value < 3210 || value >= 3240) throw Error('Invalid Matrix client port');
  return `http://127.0.0.1:${value}`;
}
function validateOrigin(value) {
  const url = new URL(value);
  if (value !== localClientOrigin(url.port)) throw Error('Invalid Matrix client origin');
  return value;
}
function prepareClientOrigin(userData, previousPort, selectedPort) {
  if (!path.isAbsolute(userData)) throw Error('Invalid Matrix profile');
  const file = path.join(userData, 'client-storage-origin.json');
  if (fs.existsSync(file)) {
    try {
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw Error('Invalid state file');
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (saved?.version !== 1) throw Error('Unsupported state version');
      return { file, origin: validateOrigin(saved.origin) };
    } catch { throw Error('远效本地状态来源配置异常，未覆盖原数据'); }
  }
  let origin;
  try { origin = localClientOrigin(previousPort); } catch { origin = localClientOrigin(selectedPort); }
  // Persist the authoritative legacy origin BEFORE .env is changed. An aborted
  // migration must not make the next launch read an empty fallback origin.
  writeLocalJson(file, { version: 1, origin });
  return { file, origin };
}

// Only called during startup, before the client or official guests are loaded.
// A synthetic, scriptless document reads this profile's Matrix localStorage.
// Never contact the old listener: it may now belong to an unrelated process.
async function migrateClientStorage(win, state, appUrl, { timeoutMs = 10000 } = {}) {
  const target = new URL(appUrl);
  const sourceOrigin = validateOrigin(state.origin), targetOrigin = validateOrigin(target.origin);
  if (target.pathname !== '/app/' || target.search || target.hash || target.username || target.password) throw Error('Invalid Matrix app document');
  if (sourceOrigin === targetOrigin) return { migrated: false };
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw Error('Invalid migration deadline');
  const contents = win.webContents, protocol = contents.session.protocol;
  const route = '/__matrix_local_state__/' + randomUUID();
  const urls = [sourceOrigin + route, targetOrigin + route];
  const blank = '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; base-uri \'none\'; form-action \'none\'"><title>远效初始化</title>';
  let timer, expired = false, installed = false;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => { expired = true; if (!contents.isDestroyed()) contents.stop(); reject(Error('Storage migration timeout')); }, timeoutMs); });
  const guard = expected => { if (expired || contents.isDestroyed() || contents.getURL() !== expected) throw Error('Storage migration interrupted'); };
  const read = `(() => Object.keys(localStorage).filter(key => /^matrix[-_:]/.test(key)).sort().map(key => [key, localStorage.getItem(key)]))()`;
  try {
    protocol.handle('http', request => urls.includes(request.url)
      ? new Response(blank, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; base-uri 'none'; form-action 'none'" } })
      : Response.error());
    installed = true;
    await Promise.race([(async () => {
      await win.loadURL(urls[0]); guard(urls[0]);
      const snapshot = await contents.executeJavaScript(read); guard(urls[0]);
      if (!Array.isArray(snapshot) || snapshot.some(entry => !Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || !/^matrix[-_:]/.test(entry[0]) || typeof entry[1] !== 'string')) throw Error('Invalid stored state');
      await win.loadURL(urls[1]); guard(urls[1]);
      // Replace ONLY Matrix keys with the authoritative active-origin snapshot.
      // Missing keys represent deletion/logout, not values to resurrect from an
      // older destination. Unrelated keys/cookies/platform partitions are untouched.
      const imported = await contents.executeJavaScript(`((entries) => {
        const ownKeys = () => Object.keys(localStorage).filter(key => /^matrix[-_:]/.test(key));
        const previous = ownKeys().map(key => [key, localStorage.getItem(key)]);
        const replace = values => { ownKeys().forEach(key => localStorage.removeItem(key)); values.forEach(([key, value]) => localStorage.setItem(key, value)); };
        try { replace(entries); }
        catch { try { replace(previous); } catch {} throw Error('Matrix local state copy failed; original source retained'); }
        return ownKeys().length;
      })(${JSON.stringify(snapshot)})`); guard(urls[1]);
      const verified = await contents.executeJavaScript(read); guard(urls[1]);
      if (imported !== snapshot.length || JSON.stringify(verified) !== JSON.stringify(snapshot)) throw Error('Storage verification failed');
      contents.session.flushStorageData();
      // Only origins, never tokens/values, are persisted by the main process.
      writeLocalJson(state.file, { version: 1, origin: targetOrigin });
      state.origin = targetOrigin;
    })(), deadline]);
    return { migrated: true };
  } catch {
    // No raw browser exception or data values in startup dialogs/logs.
    throw Error('远效本地状态迁移未完成，原始数据已保留，本次未打开业务页面；请重新启动后重试。');
  } finally {
    expired = true; clearTimeout(timer);
    if (installed) protocol.unhandle('http');
  }
}
module.exports = { localClientOrigin, prepareClientOrigin, migrateClientStorage };
