const net = require('node:net');
const path = require('node:path');
const { createHash } = require('node:crypto');

// The OS holds the Windows named pipe or the Mac loopback port until the
// owner closes it or exits. Every Mac profile shares the same service ports.
function startupLeaseEndpoint(scope, platform = process.platform) {
  if (typeof scope !== 'string' || !path.isAbsolute(scope) || scope.length > 4096) throw Error('本机启动范围不正确');
  if (platform === 'darwin') return { host: '127.0.0.1', port: 35453 };
  const digest = createHash('sha256').update(path.resolve(scope).toLowerCase()).digest('hex').slice(0, 40);
  return `\\\\.\\pipe\\matrix-startup-v1-${digest}`;
}
async function withStartupLease(scope, action, { timeoutMs = 60000, signal, retryMs = 100 } = {}) {
  if (!['win32', 'darwin'].includes(process.platform)) throw Error('当前内置服务启动锁仅支持 Windows 和 macOS');
  if (typeof action !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120000 || !Number.isFinite(retryMs) || retryMs < 10 || retryMs > 1000) throw Error('本机启动等待参数不正确');
  const endpoint = startupLeaseEndpoint(scope), deadline = Date.now() + timeoutMs;
  const check = () => {
    if (signal?.aborted) throw Error('本机服务启动已取消，未接管其他实例');
    if (Date.now() >= deadline) throw Error('其他远效实例正在初始化，等待超时；未停止或接管其他实例，请稍后重试');
  };
  const acquire = () => new Promise((resolve, reject) => {
    const server = net.createServer(socket => socket.destroy()), controller = new AbortController();
    let settled = false;
    const abort = () => finish(Error('本机服务启动已取消，未接管其他实例'));
    const timer = setTimeout(() => finish(Error('其他远效实例正在初始化，等待超时；未停止或接管其他实例，请稍后重试')), Math.max(1, deadline - Date.now()));
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const finish = error => {
      if (settled) return; settled = true; cleanup();
      if (error) { controller.abort(); reject(error); }
      else resolve({ release: () => new Promise(done => { server.close(() => { controller.abort(); done(); }); }) });
    };
    signal?.addEventListener('abort', abort, { once: true });
    server.once('error', error => { finish(error); });
    server.once('listening', () => { if (settled) controller.abort(); else finish(); });
    if (signal?.aborted) return abort();
    try { server.listen({ ...(typeof endpoint === 'string' ? { path: endpoint } : endpoint), exclusive: true, signal: controller.signal }); } catch (error) { finish(error); }
  });
  let lease;
  while (!lease) {
    check();
    try { lease = await acquire(); }
    catch (error) {
      if (error.code !== 'EADDRINUSE') {
        if (error.code) throw Error('无法取得本机服务启动锁，已停止初始化；未修改其他实例');
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, Math.min(retryMs, Math.max(1, deadline - Date.now()))));
    }
  }
  try { check(); return await action(); }
  finally { await lease.release(); }
}
async function selectStartupPort(first, end, preferred, canListen) {
  if (!Number.isInteger(first) || !Number.isInteger(end) || first < 1 || end > 65536 || first >= end || end - first > 1000 || typeof canListen !== 'function') throw Error('本机端口范围不正确');
  const start = Number.isInteger(preferred) && preferred >= first && preferred < end ? preferred : first;
  for (let offset = 0; offset < end - first; offset++) {
    const port = first + (start - first + offset) % (end - first);
    if (await canListen(port)) return port;
  }
  return null;
}
module.exports = { startupLeaseEndpoint, withStartupLease, selectStartupPort };
