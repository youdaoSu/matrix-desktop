// Real Electron guest/upload plumbing, synthetic official document only. No platform submissions.
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
const [port, base] = process.argv.slice(2);
if (base !== 'http://127.0.0.1:3291') throw Error('Disposable QA database required');
const sockets = [], targets = () => fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
const html = '<meta charset="utf-8"><span class="user-name">QA昵称已补全</span><input type=file accept="image/png" multiple><input placeholder="标题"><textarea placeholder="简介"></textarea><progress value=35 max=100></progress><div role=status></div><button onclick="window.posted=true">发布</button>';
async function connect(url) {
  const socket = new WebSocket(url); sockets.push(socket); await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let seq = 0; const pending = new Map();
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; const timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timed out')); }, 20000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
  socket.addEventListener('message', event => { const message = JSON.parse(event.data), request = pending.get(message.id); if (request) { clearTimeout(request.timer); pending.delete(message.id); message.error ? request.reject(Error(message.error.message)) : request.resolve(message.result); } if (message.method === 'Fetch.requestPaused') void call('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }], body: Buffer.from(html).toString('base64') }); });
  return { call, async evaluate(expression) { const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description); return result.result.value; } };
}
async function wait(fn, label) { const deadline = Date.now() + 45000; while (Date.now() < deadline) { if (await fn()) return; await new Promise(r => setTimeout(r, 200)); } throw Error(label); }
try {
  const main = await connect((await targets()).find(t => t.type === 'page' && t.url.startsWith(base)).webSocketDebuggerUrl);
  // Two old, explicitly pre-submit failures exist only in the disposable user.
  // Keep one upload running and verify a different row can enqueue a retry.
  await main.call('Page.navigate',{url:base+'/app/#/admin/dashboard'});
  await wait(()=>main.evaluate("location.hash==='#/admin/dashboard'&&!document.querySelector('.matrix-shell')"),'Provider not unmounted');
  await main.evaluate("(()=>{const file=document.createElement('input');file.type='file';file.id='qa-retry-seed';document.body.append(file);return true})()");
  const seedObject=await main.call('Runtime.evaluate',{expression:"document.querySelector('#qa-retry-seed')",returnByValue:false});
  await main.call('DOM.setFileInputFiles',{objectId:seedObject.result.objectId,files:[path.resolve('desktop/assets/icon.png')]});
  await main.call('Runtime.releaseObject',{objectId:seedObject.result.objectId});
  await main.evaluate(`(async()=>{const token=localStorage.getItem('matrix_token')||sessionStorage.getItem('matrix_token');const csrf=decodeURIComponent(document.cookie.split('; ').find(x=>x.startsWith('suda-csrf-token='))?.slice(16)||'');const r=await fetch('/api/platform/accounts?pageSize=100',{headers:{Authorization:'Bearer '+token,'x-suda-csrf-token':csrf}});const accounts=(await r.json()).data.items;const selected=await window.matrixDesktop.importMedia([...document.querySelector('#qa-retry-seed').files],'image');if(selected.error)throw Error(selected.error);const saved=await window.matrixDesktop.rememberPublishMedia({accessToken:token,selectionId:selected.selection.id,covers:[]});if(saved.error)throw Error(saved.error);const owner=JSON.parse(localStorage.getItem('matrix_user')||sessionStorage.getItem('matrix_user'));const now=new Date().toISOString();const rows=['xiaohongshu','douyin'].map((platform,i)=>{const account=accounts.find(a=>a.nickname==='QA '+platform);if(!account)throw Error('Retry fixture account missing');return {id:'qa-independent-'+i,batchId:'qa-independent-old-'+i,accountId:account.id,nickname:account.nickname,platform,config:{title:'QA独立重发'+i,body:'QA synthetic only',topics:[],comment:'',options:{}},mediaType:'image',title:'QA独立重发'+i,files:['icon.png'],stage:'failed',submission:'not_submitted',message:'QA明确未提交',createdAt:now,updatedAt:now,history:[],...saved}});localStorage.setItem('matrix-publish-progress:'+owner.id,JSON.stringify(rows));return true})()`);
  await main.call('Page.navigate', { url: base + '/app/#/dashboard' });
  await wait(() => main.evaluate("location.hash==='#/dashboard' && !document.querySelector('.matrix-publish-editor')"), 'Fresh editor navigation missing');
  await main.evaluate("location.hash='#/publish/create';true");
  await wait(() => main.evaluate("!!document.querySelector('.matrix-platform-config-tabs > button:not([disabled])')"), 'Accounts missing');
  // Routes now preserve editor state; explicitly start a fresh fixture instead
  // of accidentally deselecting the account retained by qa-publish-flow.
  await main.evaluate("window.confirm=()=>true;[...document.querySelectorAll('.matrix-publish-footer button')].find(b=>b.innerText==='新建发布').click();true");
  await main.evaluate("[...document.querySelectorAll('.matrix-sync-fields [role=checkbox]')].filter(b=>b.getAttribute('aria-checked')!=='true').forEach(b=>b.click());true");
  await main.evaluate("document.querySelector('.matrix-platform-config-tabs > button').click();true");
  await main.evaluate("[...document.querySelectorAll('[data-publish-account]')].find(e=>e.innerText.includes('QA昵称已补全')).querySelector('[role=checkbox]').click();true");
  await main.evaluate("[...document.querySelectorAll('[role=dialog] button')].find(e=>e.innerText==='确定').click();true");
  await main.evaluate("(()=>{const el=document.querySelector('#publish-title');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'QA后台导航测试');el.dispatchEvent(new Event('input',{bubbles:true}));const file=document.createElement('input');file.type='file';file.id='qa-native-drop';document.body.append(file);return true})()");
  const { root } = await main.call('DOM.getDocument'), { nodeId } = await main.call('DOM.querySelector', { nodeId: root.nodeId, selector: '#qa-native-drop' });
  await main.call('DOM.setFileInputFiles', { nodeId, files: [path.resolve('desktop/assets/icon.png')] });
  await main.evaluate("(()=>{const data=new DataTransfer();data.items.add(document.querySelector('#qa-native-drop').files[0]);document.querySelector('.matrix-dropzone').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));return true})()");
  await wait(() => main.evaluate("document.querySelector('.matrix-dropzone').innerText.includes('icon.png')"), 'Import missing');
  const before = new Set((await targets()).map(target => target.id));
  await main.evaluate("[...document.querySelectorAll('button')].find(el=>/^一键发布（/.test(el.innerText)).click();true");
  let guest;
  try { await wait(async () => { guest = (await targets()).find(target => target.type === 'webview' && !before.has(target.id)); return !!guest; }, 'Background guest missing'); }
  catch (error) { console.error(await main.evaluate('document.body.innerText')); throw error; }
  const view = await connect(guest.webSocketDebuggerUrl);
  await view.call('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await view.call('Network.setCookie', { name: 'access-token-creator.xiaohongshu.com', value: 'qa-synthetic-only', domain: '.xiaohongshu.com', path: '/', secure: true });
  await view.call('Page.navigate', { url: 'https://creator.xiaohongshu.com/publish/publish?target=image' });
  await wait(() => main.evaluate("document.querySelector('[data-publish-progress]')?.innerText.includes('35%')"), 'Live progress not received');
  assert.equal(await view.evaluate("document.querySelector('input[type=file]').files[0]?.name"), 'icon.png');
  assert.equal(await view.evaluate("document.querySelector('input[placeholder=标题]').value"), 'QA后台导航测试');
  assert.equal(await main.evaluate("[...document.querySelectorAll('[data-publish-job=qa-independent-0] .matrix-task-status button')].find(b=>b.innerText==='重发').disabled"),false);
  await main.evaluate("[...document.querySelectorAll('[data-publish-job=qa-independent-0] .matrix-task-status button')].find(b=>b.innerText==='重发').click();true");
  await wait(()=>main.evaluate("document.querySelector('[data-publish-job=qa-independent-0] .matrix-task-status').innerText.includes('已排队')"),'Independent retry not enqueued');
  assert.equal(await main.evaluate("document.querySelectorAll('[data-publish-job]').length"),3);
  assert.equal(await main.evaluate("[...document.querySelectorAll('[data-publish-job=qa-independent-1] .matrix-task-status button')].find(b=>b.innerText==='重发').disabled"),false);
  assert.equal(await view.evaluate("document.querySelector('input[type=file]').files[0]?.name"),'icon.png');
  const navigate = async route => { await main.evaluate(`location.hash=${JSON.stringify('#' + route)};true`); await wait(() => main.evaluate(`location.hash===${JSON.stringify('#' + route)} && !document.querySelector('.matrix-publish-editor')`), 'Route did not change'); };
  for (const route of ['/accounts', '/engage/comments', '/docs/overview', '/settings/profile']) {
    await navigate(route); assert.ok((await targets()).some(target => target.id === guest.id));
    assert.equal(await view.evaluate("document.querySelector('input[type=file]').files[0]?.name"), 'icon.png');
  }
  await view.evaluate("document.querySelector('progress').value=72;true");
  await navigate('/publish/tasks'); await wait(() => main.evaluate("document.querySelector('[data-publish-progress]')?.innerText.includes('72%')"), 'Progress stopped after navigation');
  await main.evaluate("location.hash='#/publish/create';true");
  await wait(()=>main.evaluate("!!document.querySelector('#publish-title')"),'Editor did not return');
  assert.equal(await main.evaluate("document.querySelector('#publish-title').value"),'QA后台导航测试');
  assert.equal(await main.evaluate("document.querySelector('.matrix-dropzone').innerText.includes('icon.png')"),true);
  assert.ok((await targets()).some(target=>target.id===guest.id));
  await navigate('/publish/tasks');
  const snap = await main.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync('logs/qa-background-publish-progress.png', Buffer.from(snap.data, 'base64'));
  await main.evaluate("[...document.querySelectorAll('.matrix-task-footer button')].find(b=>b.innerText==='停止后续任务').click();true");
  await wait(()=>main.evaluate("![...document.querySelectorAll('.matrix-task-footer button')].find(b=>b.innerText==='停止后续任务') || [...document.querySelectorAll('.matrix-task-footer button')].find(b=>b.innerText==='停止后续任务').disabled"),'Stop not applied');
  await view.evaluate("document.querySelector('[role=status]').textContent='上传失败：QA 模拟断网';true");
  // Stopping is explicit user intent; only the running/pending attempts stop.
  assert.equal(await main.evaluate("document.querySelector('[data-publish-job=qa-independent-1] .matrix-task-status').innerText.includes('发布失败')"),true);
  // Re-open the old fixtures in the next task-record QA; no posts occurred.
  assert.equal(await view.evaluate('!!window.posted'),false);
  console.log(JSON.stringify({backgroundNavigationChecks:23,independentRetryUiChecks:5,syntheticOfficialPage:true,actualPlatformActions:false}));
} finally { for (const socket of sockets) socket.close(); }
