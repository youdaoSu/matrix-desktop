// Read-only checks against the installed application after a user-approved local upgrade.
// Never exports identity, credentials, cookies, message bodies or platform account IDs.
import assert from 'node:assert/strict';
const port = process.argv[2] || '9491';
let target;
for (let i = 0; i < 200 && !target; i++) {
  try { target = (await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json())).find(t => t.type === 'page' && t.url.startsWith('http://127.0.0.1:3210/app/')); } catch { /* App/database may still be starting. */ }
  if (!target) await new Promise(resolve => setTimeout(resolve, 200));
}
if (!target) throw Error('Installed local Matrix target missing');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let sequence = 0; const pending = new Map(), errors = [];
socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text); const item = pending.get(message.id); if (item) { clearTimeout(item.timer); pending.delete(message.id); message.error ? item.reject(Error(message.error.message)) : item.resolve(message.result); } });
const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => reject(Error(method + ' timeout')), 20000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => { const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) { const reason = String(result.exceptionDetails.exception?.description || result.exceptionDetails.text).split('\n')[0].replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[redacted]'); throw Error('Installed renderer evaluation failed: ' + reason.slice(0, 180)); } return result.result.value; };
const wait = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 200)); } throw Error('Installed view did not become ready'); };
try {
  await call('Runtime.enable');
  await wait("document.readyState==='complete'&&!!document.querySelector('.matrix-shell')");
  const summary = await evaluate(`(async()=>{
    const token=localStorage.getItem('matrix_token')||sessionStorage.getItem('matrix_token');
    if(!token)throw Error('Matrix login required');
    const csrf=decodeURIComponent(document.cookie.split('; ').find(value=>value.startsWith('suda-csrf-token='))?.slice(16)||'');
    const headers={Authorization:'Bearer '+token,'x-suda-csrf-token':csrf};
    const me=await fetch('/api/auth/me',{headers});if(!me.ok)throw Error('Matrix login verification failed (HTTP '+me.status+')');
    const response=await fetch('/api/platform/accounts?page=1&pageSize=100',{headers});if(!response.ok)throw Error('Accounts could not be read');
    const accounts=(await response.json()).data.items;let credentials=0;
    for(const account of accounts){if(!account.connectorSessionId)continue;const result=await window.matrixDesktop.checkPlatformSession(account.platform,account.connectorSessionId);if(result.healthy)credentials++;}
    const settings=await window.matrixDesktop.systemSettings({command:'read'});
    return{version:settings.version,authenticated:true,accounts:accounts.length,platformCounts:accounts.reduce((map,a)=>({...map,[a.platform]:(map[a.platform]||0)+1}),{}),localSessionCredentials:credentials};
  })()`);
  assert.equal(summary.version, '2.10.0-rc.27');
  const routes = ['comments', 'comments-agg', 'auto-comment', 'batch-tasks', 'messages', 'messages-agg', 'auto-message', 'followers', 'follower-monitor'];
  for (const view of routes) {
    await evaluate(`location.hash='#/engage/${view}';true`);
    await wait(`!!document.querySelector('[data-interaction-view="${view}"]')`);
    await wait("![...document.querySelectorAll('.matrix-page-content [role=status]')].some(e=>e.getClientRects().length)");
  }
  assert.deepEqual(errors, []);
  await evaluate("location.hash='#/engage/comments';true");
  console.log(JSON.stringify({ ...summary, installedInteractionViews: routes.length, rendererErrors: errors.length, platformActionsSent: false, note: 'Local credentials retained, not proof of fresh online platform authentication' }));
} finally { socket.close(); }
