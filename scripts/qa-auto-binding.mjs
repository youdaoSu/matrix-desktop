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
    if (result.method === 'Fetch.requestPaused') await call('Fetch.fulfillRequest', { requestId: result.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }], body: Buffer.from('<meta charset="utf-8"><header><div class="user"><span class="name"></span></div></header><main>本地测试登录后页面，不是平台真实登录</main>').toString('base64') });
  });
  return { call, async evaluate(expression) { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; } };
}
async function wait(fn, message) { const end = Date.now() + 25000; while (Date.now() < end) { if (await fn()) return; await new Promise(r => setTimeout(r, 150)); } throw Error(message); }
try {
  const initial = await targets(), main = await connect(initial.find(t => t.type === 'page' && t.url.startsWith(base)).webSocketDebuggerUrl);
  await main.call('Page.navigate', { url: base + '/app/#/dashboard' });
  await wait(() => main.evaluate("!!document.querySelector('.matrix-topbar nav a')"), 'User workspace not ready');
  await main.evaluate("[...document.querySelectorAll('.matrix-topbar nav a')].find(a=>a.innerText.includes('账号管理')).click();true");
  await wait(() => main.evaluate("!!document.querySelector('[data-account-management]') && !document.querySelector('.matrix-official-deck').hidden"), 'Account management must directly show the unified workspace');
  const oldIds = new Set((await targets()).map(t => t.id));
  await main.evaluate("[...document.querySelectorAll('[data-account-management] button')].find(b=>b.innerText.trim()==='添加账号').click();true");
  await wait(() => main.evaluate("!!document.querySelector('[role=dialog]')"), 'Binding dialog missing');
  await main.evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.querySelector('strong')?.innerText==='小红书').click();true");
  await wait(() => main.evaluate("document.querySelector('[data-bind-provider=xiaohongshu]')?.getAttribute('aria-pressed')==='true'"), 'Selected platform not updated');
  await main.evaluate("document.querySelector('[data-open-bind-provider]').click();true");
  let guest;
  await wait(async () => { guest = (await targets()).find(t => t.type === 'webview' && !oldIds.has(t.id)); return !!guest; }, 'Guest not attached');
  const view = await connect(guest.webSocketDebuggerUrl);
  await view.call('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await view.call('Network.enable');
  await view.call('Network.setCookie', { name: 'access-token-creator.xiaohongshu.com', value: 'fixture-only-not-a-real-token', domain: '.xiaohongshu.com', path: '/', secure: true });
  await view.call('Page.navigate', { url: 'https://creator.xiaohongshu.com/home' });
  await wait(() => main.evaluate("document.querySelector('.matrix-official-deck').innerText.includes('正在读取账号昵称')"), 'Missing nickname must show a waiting message, not bind a placeholder');
  await new Promise(r => setTimeout(r, 2500));
  assert.equal(await main.evaluate("!![...document.querySelectorAll('.matrix-official-browser')].find(b=>!b.hidden)?.querySelector('.matrix-binding-banner')"), true);
  await view.evaluate("document.querySelector('.user .name').textContent='QA_AUTO_XHS';true");
  await wait(() => main.evaluate("document.querySelector('.matrix-account-tab.is-active')?.innerText.includes('QA_AUTO_XHS') && ![...document.querySelectorAll('.matrix-official-browser')].find(b=>!b.hidden)?.querySelector('.matrix-binding-banner')"), 'Recognized creator session was not automatically bound');
  const count = () => main.evaluate("(async()=>{const token=localStorage.getItem('matrix_token')||sessionStorage.getItem('matrix_token');const csrf=decodeURIComponent(document.cookie.split('; ').find(v=>v.startsWith('suda-csrf-token='))?.slice(16)||'');const r=await fetch('/api/platform/accounts?pageSize=100',{headers:{Authorization:'Bearer '+token,'x-suda-csrf-token':csrf}}).then(r=>r.json());return r.data.items.filter(a=>a.nickname==='QA_AUTO_XHS').length})()");
  assert.equal(await count(), 1);
  await new Promise(r => setTimeout(r, 4500));
  assert.equal(await count(), 1);
  assert.equal(await main.evaluate("[...document.querySelectorAll('.matrix-manager-account-open')].filter(b=>b.innerText.includes('QA_AUTO_XHS')).length"), 1);
  const api = (method, url, body) => main.evaluate(`(async()=>{const token=localStorage.getItem('matrix_token')||sessionStorage.getItem('matrix_token');const csrf=decodeURIComponent(document.cookie.split('; ').find(v=>v.startsWith('suda-csrf-token='))?.slice(16)||'');const response=await fetch(${JSON.stringify(url)},{method:${JSON.stringify(method)},headers:{Authorization:'Bearer '+token,'x-suda-csrf-token':csrf,'Content-Type':'application/json'},body:${body ? JSON.stringify(JSON.stringify(body)) : 'undefined'}});const r=await response.json();if(!response.ok)throw Error(JSON.stringify(r));return r.data})()`);
  const before = (await api('GET', '/api/platform/accounts?pageSize=100')).items.find(a => a.nickname === 'QA_AUTO_XHS');
  const group = await api('POST', '/api/platform/groups', { groupName: 'QA自动识别昵称分组' });
  await api('POST', '/api/platform/groups/move-accounts', { accountIds: [before.id], groupId: group.id });
  await api('PUT', '/api/platform/accounts/' + before.id, { accountRemark: 'QA保留我的备注' });
  await api('POST', '/api/platform/accounts/desktop', { platform: before.platform, connectorSessionId: before.connectorSessionId, nickname: '小红书账号' });
  await main.evaluate("document.querySelector('.matrix-account-tab.is-active .matrix-tab-close').click();window.dispatchEvent(new Event('matrix:accounts-updated'));true");
  await wait(() => main.evaluate("[...document.querySelectorAll('.matrix-manager-account-open')].some(b=>b.innerText.includes('小红书账号'))"), 'Legacy placeholder account not shown');
  const previousIds = new Set((await targets()).map(t => t.id));
  await main.evaluate("[...document.querySelectorAll('.matrix-manager-account-open')].find(b=>b.innerText.includes('小红书账号')).click();true");
  let replacement;
  await wait(async () => { replacement = (await targets()).find(t => t.type === 'webview' && !previousIds.has(t.id)); return !!replacement; }, 'Legacy account guest not attached');
  const reopened = await connect(replacement.webSocketDebuggerUrl);
  await reopened.call('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await reopened.call('Page.navigate', { url: 'https://creator.xiaohongshu.com/home' });
  await wait(() => reopened.evaluate("!!document.querySelector('.user .name')"), 'Local profile fixture not ready');
  await reopened.evaluate("document.querySelector('.user .name').textContent='QA昵称已补全';true");
  await wait(() => main.evaluate("[...document.querySelectorAll('.matrix-manager-account-open')].some(b=>b.innerText.includes('QA昵称已补全'))"), 'Legacy nickname not repaired automatically');
  const after = (await api('GET', '/api/platform/accounts?pageSize=100')).items.filter(a => a.connectorSessionId === before.connectorSessionId);
  assert.equal(after.length, 1);
  assert.equal(after[0].id, before.id);
  assert.equal((await api('GET', '/api/platform/accounts/' + before.id + '/detail')).groupId, group.id);
  assert.equal(after[0].groupName, 'QA自动识别昵称分组');
  assert.equal(after[0].accountRemark, 'QA保留我的备注');
  assert.equal(after[0].nickname, 'QA昵称已补全');
  console.log(JSON.stringify({ automaticBindingIntegrationChecks: 12, page: 'local synthetic fixture', realPlatformLoginClaimed: false, realUserDataTouched: false }));
} catch (error) {
  const mainTarget=(await targets()).find(t=>t.type==='page'&&t.url.startsWith(base));
  if(mainTarget){const diagnostic=await connect(mainTarget.webSocketDebuggerUrl);console.error(await diagnostic.evaluate("({route:location.hash,banner:document.querySelector('.matrix-binding-banner')?.innerText,error:document.querySelector('.matrix-browser-error')?.innerText,toasts:[...document.querySelectorAll('[data-sonner-toast]')].map(t=>t.innerText)})"));}
  throw error;
} finally { for (const socket of connections) socket.close(); }
