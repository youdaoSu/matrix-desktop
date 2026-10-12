// Native file drag/drop -> account configs -> official-form handoff. Synthetic guest only.
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
const [port, base] = process.argv.slice(2);
if (base !== 'http://127.0.0.1:3291') throw Error('Disposable QA database required');
const sockets = [];
async function connect(url) {
  const socket = new WebSocket(url); sockets.push(socket);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let seq = 0; const requests = new Map();
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; const timer = setTimeout(() => { requests.delete(id); reject(Error('Timed out: ' + method)); }, 20000); requests.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data), request = requests.get(message.id);
    if (request) { clearTimeout(request.timer); requests.delete(message.id); message.error ? request.reject(Error(message.error.message)) : request.resolve(message.result); }
    if (message.method === 'Fetch.requestPaused') void call('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }], body: Buffer.from('<meta charset="utf-8"><header><span class="user-name">QA xiaohongshu</span></header><input type=file accept="image/png,image/jpeg" multiple><input placeholder="标题"><textarea placeholder="简介"></textarea><select aria-label="可见范围"><option>公开</option><option>仅自己可见</option></select><button onclick="window.submitted=true">发布</button>').toString('base64') });
  });
  return { call, async evaluate(expression) { const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || 'Evaluate failed'); return result.result.value; } };
}
const targets = () => fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
async function wait(fn, message) { const end = Date.now() + 30000; while (Date.now() < end) { if (await fn()) return; await new Promise(r => setTimeout(r, 150)); } throw Error(message); }
try {
  const main = await connect((await targets()).find(t => t.type === 'page' && t.url.startsWith(base)).webSocketDebuggerUrl);
  await main.call('Page.navigate', { url: base + '/app/#/publish/create' });
  await wait(() => main.evaluate("!!document.querySelector('.matrix-platform-config-tabs > button:not([disabled])')"), 'Publish accounts missing');
  const click = label => main.evaluate(`[...document.querySelectorAll('button,[role=option]')].find(e=>e.getClientRects().length&&e.innerText.trim()===${JSON.stringify(label)}).click();true`);
  const fill = (selector, value) => main.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await fill('#publish-title', 'QA拖拽作品'); await fill('#publish-content', 'QA作品简介'); await fill('#publish-topics', '#健身，日常'); await fill('#publish-comment', 'QA追评文案');
  await main.evaluate("document.querySelector('#publish-media-type').click();true"); await click('图文');
  await click('选择账号');
  await main.evaluate("[...document.querySelectorAll('[data-publish-account]')].find(e=>e.innerText.includes('QA昵称已补全')).querySelector('[role=checkbox]').click();true");
  await click('确定');
  await click('同步至右侧');
  assert.equal(await main.evaluate("document.querySelector('[aria-label=\"QA昵称已补全-标题\"]').value"), 'QA拖拽作品');
  assert.equal(await main.evaluate("document.querySelector('[aria-label=\"QA昵称已补全-追评\"]').value"), 'QA追评文案');
  await fill('[aria-label="QA昵称已补全-标题"]', 'QA独立标题');
  await main.evaluate("[...document.querySelectorAll('.matrix-sync-fields label')].find(e=>e.innerText==='标题').querySelector('[role=checkbox]').click();true");
  await click('同步至右侧');
  assert.equal(await main.evaluate("document.querySelector('[aria-label=\"QA昵称已补全-标题\"]').value"), 'QA独立标题');
  await main.evaluate("const upload=document.createElement('input');upload.type='file';upload.id='qa-drop-file';upload.hidden=true;document.body.append(upload);true");
  const { root } = await main.call('DOM.getDocument');
  const { nodeId } = await main.call('DOM.querySelector', { nodeId: root.nodeId, selector: '#qa-drop-file' });
  await main.call('DOM.setFileInputFiles', { nodeId, files: [path.resolve('desktop/assets/icon.png')] });
  await main.evaluate("(()=>{const data=new DataTransfer();data.items.add(document.querySelector('#qa-drop-file').files[0]);document.querySelector('.matrix-dropzone').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));return true})()");
  await wait(() => main.evaluate("document.querySelector('.matrix-dropzone').innerText.includes('icon.png')"), 'Native dropped file was not imported');
  assert.equal(await main.evaluate("document.querySelector('.matrix-dropzone').innerText.includes('已导入本机素材')"), true);
  await main.evaluate("document.querySelector('.matrix-publish-footer details').open=true;true");
  await click('为所选账号准备发布');
  let guest;
  await wait(async () => { guest = (await targets()).find(t => t.type === 'webview'); return !!guest; }, 'Guest missing');
  const view = await connect(guest.webSocketDebuggerUrl);
  await view.call('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await view.call('Network.enable');
  await view.call('Network.setCookie', { name: 'access-token-creator.xiaohongshu.com', value: 'qa-synthetic-only', domain: '.xiaohongshu.com', path: '/', secure: true });
  await view.call('Page.navigate', { url: 'https://creator.xiaohongshu.com/publish/publish?target=image' });
  await wait(() => view.evaluate("!!document.querySelector('textarea')"), 'Synthetic official form missing');
  await click('上传并同步到官方表单');
  await wait(() => main.evaluate("document.querySelector('.matrix-platform-account-form').innerText.includes('文案已同步')"), 'Upload/form sync not completed');
  assert.equal(await view.evaluate("document.querySelector('input[type=file]').files[0].name"), 'icon.png');
  assert.equal(await view.evaluate("document.querySelector('input[placeholder=标题]').value"), 'QA独立标题');
  assert.equal(await view.evaluate("document.querySelector('textarea').value"), 'QA作品简介\n#健身 #日常');
  assert.equal(await view.evaluate('!!window.submitted'), false);
  await main.evaluate("document.querySelector('.matrix-workspace-tabs > button').click();true");
  const shot = await main.call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync('logs/qa-publish-flow.png', Buffer.from(shot.data, 'base64'));
  console.log(JSON.stringify({ nativeDropAndPublishFlowChecks: 8, isolatedDatabase: true, syntheticOfficialForm: true, actualPlatformUploadsOrPosts: false }));
} finally { for (const socket of sockets) socket.close(); }
