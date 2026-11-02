const http = require('node:http');

// An unrelated HTTP 200, login page, redirect or old Matrix instance is not this
// child. The fresh random nonce is passed privately to this child at spawn and
// returned only on /app after it has actually bound; never persisted or logged.
function waitForOwnedServer(url, child, nonce, { timeoutMs = 30000, requestMs = 1500, retryMs = 150 } = {}) {
  let endpoint; try { endpoint = new URL(url); } catch { return Promise.reject(Error('内置服务身份核验参数不正确')); }
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || endpoint.pathname !== '/app/' || endpoint.search || endpoint.hash || endpoint.username || endpoint.password || !/^[a-f0-9]{64}$/.test(nonce) || typeof child?.once !== 'function' || typeof child?.removeListener !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000 || !Number.isFinite(requestMs) || requestMs < 1 || requestMs > 5000 || !Number.isFinite(retryMs) || retryMs < 1 || retryMs > 1000) return Promise.reject(Error('内置服务身份核验参数不正确'));
  return new Promise((resolve, reject) => {
    let settled = false, request, retry, mismatched = false;
    const cleanup = () => { clearTimeout(deadline); clearTimeout(retry); child.removeListener('error', onError); child.removeListener('exit', onExit); request?.destroy(); };
    const finish = error => { if (settled) return; settled = true; cleanup(); error ? reject(error) : resolve(); };
    const onError = () => finish(Error('无法启动内置服务进程，未连接其他本机服务；请检查安装文件和本机日志'));
    const onExit = code => finish(Error(`内置服务在就绪前退出（${Number.isInteger(code) ? code : '未知代码'}），未连接其他本机服务；请查看本机服务日志`));
    const deadline = setTimeout(() => finish(Error(mismatched ? '本机端口响应身份不符，未连接该服务；请关闭其他远效窗口后重试' : '内置服务启动超时，未连接未经核实的本机服务；请查看本机服务日志')), timeoutMs);
    const schedule = () => { if (!settled) retry = setTimeout(probe, retryMs); };
    const probe = () => {
      if (settled) return;
      let retried = false;
      const again = () => { if (retried) return; retried = true; schedule(); };
      request = http.get(endpoint, response => {
        const valid = response.statusCode === 200 && response.headers['x-matrix-startup'] === nonce;
        // Headers are sufficient. Never accumulate streaming responses from a
        // foreign listener across retries or leave old sockets behind.
        response.destroy();
        if (valid) { if (child.exitCode !== null || child.killed) return onExit(child.exitCode); finish(); }
        else { mismatched ||= response.statusCode < 500; again(); }
      });
      request.setTimeout(requestMs, () => request.destroy());
      request.once('error', again);
    };
    child.once('error', onError); child.once('exit', onExit);
    if (child.exitCode !== null || child.killed) return onExit(child.exitCode);
    probe();
  });
}
module.exports = { waitForOwnedServer };
