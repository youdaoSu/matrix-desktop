// Isolated test only: synthetic page and synthetic credential, no user profile access.
import assert from 'node:assert/strict';
const [debugPort, base] = process.argv.slice(2);
if (base !== 'http://127.0.0.1:3291') throw new Error('Auto-bind QA requires the disposable workspace database');
const targets = () => fetch(`http://127.0.0.1:${debugPort}/json/list`).then(r => r.json());
const connections = [];
async function connect(url) {
  const socket = new WebSocket(url); connections.push(socket);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(Error(method + ' timed out')); }, 15000);
    pending.set(key, { resolve, reject, timer }); socket.send(JSON.stringify({ id: key, method, params }));
  });
  socket.addEventListener('message', async event => {
    const result = JSON.parse(event.data), item = pending.get(result.id);
    if (item) { clearTimeout(item.timer); pending.delete(result.id); result.error ? item.reject(Error(result.error.message)) : item.resolve(result.result); }
    if (result.method === 'Fetch.requestPaused') await call('Fetch.fulfillRequest', { requestId: result.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }], body: Buffer.from('<meta charset="utf-8"><header><span class="user-name">QA_AUTO_XHS</span></header><main>本地测试登录后页面，不是平台真实登录</main>').toString('base64') });
  });
  return { call, async evaluate(expression) { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; } };
}
async function wait(fn, message) { const end = Date.now() + 25000; while (Date.now() < end) { if (await fn()) return; await new Promise(r => setTimeout(r, 150)); } throw Error(message); }
try {
  const initial = await targets(), main = await connect(initial.find(t => t.type === 'page' && t.url.startsWith(base)).webSocketDebuggerUrl);
  await main.call('Page.navigate', { url: base + '/app/#/dashboard' });
  await wait(() => main.evaluate("!!document.querySelector('.matrix-topbar nav a')"), 'User workspace not ready');
  await main.evaluate("[...document.querySelectorAll('.matrix-topbar nav a')].find(a=>a.innerText.includes('账号管理')).click();true");
  await wait(() => main.evaluate("!!document.querySelector('.matrix-add-platforms') && !document.querySelector('.matrix-official-deck').hidden"), 'Account workspace not shown');
  const oldIds = new Set((await targets()).map(t => t.id));
  await main.evaluate("[...document.querySelectorAll('.matrix-add-platforms button')].find(b=>b.innerText.includes('小红书')).click();true");
  let guest;
  await wait(async () => { guest = (await targets()).find(t => t.type === 'webview' && !oldIds.has(t.id)); return !!guest; }, 'Guest not attached');
  const view = await connect(guest.webSocketDebuggerUrl);
  await view.call('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await view.call('Network.enable');
  await view.call('Network.setCookie', { name: 'access-token-creator.xiaohongshu.com', value: 'fixture-only-not-a-real-token', domain: '.xiaohongshu.com', path: '/', secure: true });
  await view.call('Page.navigate', { url: 'https://creator.xiaohongshu.com/home' });
  await wait(() => main.evaluate("document.querySelector('.matrix-account-tab.is-active')?.innerText.includes('QA_AUTO_XHS') && ![...document.querySelectorAll('.matrix-official-browser')].find(b=>!b.hidden)?.querySelector('.matrix-binding-banner')"), 'Recognized creator session was not automatically bound');
  const count = () => main.evaluate("(async()=>{const token=localStorage.getItem('matrix_token')||sessionStorage.getItem('matrix_token');const csrf=decodeURIComponent(document.cookie.split('; ').find(v=>v.startsWith('suda-csrf-token='))?.slice(16)||'');const r=await fetch('/api/platform/accounts?pageSize=100',{headers:{Authorization:'Bearer '+token,'x-suda-csrf-token':csrf}}).then(r=>r.json());return r.data.items.filter(a=>a.nickname==='QA_AUTO_XHS').length})()");
  assert.equal(await count(), 1);
  await new Promise(r => setTimeout(r, 4500));
  assert.equal(await count(), 1);
  assert.equal(await main.evaluate("[...document.querySelectorAll('.matrix-rail-account')].filter(b=>b.innerText.includes('QA_AUTO_XHS')).length"), 1);
  console.log(JSON.stringify({ automaticBindingIntegrationChecks: 4, page: 'local synthetic fixture', realPlatformLoginClaimed: false, realUserDataTouched: false }));
} finally { for (const socket of connections) socket.close(); }
