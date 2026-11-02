// Read-only post-install UI check: no group changes, binding, publishing or platform messages.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const port = process.argv[2] || '9491';
const target = (await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json())).find(t => t.type === 'page' && t.url.startsWith('http://127.0.0.1:3210/app/'));
assert.ok(target, 'Installed Matrix view missing');
const socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let id = 0; const pending = new Map();
socket.addEventListener('message', event => { const message = JSON.parse(event.data), item = pending.get(message.id); if (item) { clearTimeout(item.timer); pending.delete(message.id); message.error ? item.reject(Error(message.error.message)) : item.resolve(message.result); } });
const call = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(Error(method + ' timeout')); }, 15000); pending.set(key, { resolve, reject, timer }); socket.send(JSON.stringify({ id: key, method, params })); });
const evaluate = async expression => { const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw Error('Installed logo evaluation failed'); return result.result.value; };
async function wait(expression) { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 150)); } throw Error('Installed logos not ready'); }
try {
  await evaluate("location.hash='#/accounts';true");
  await wait("document.querySelectorAll('[data-manager-account]').length===5&&[...document.querySelectorAll('[data-manager-account] img')].every(i=>i.complete&&i.naturalWidth>0)");
  const summary = await evaluate("(()=>{const rows=[...document.querySelectorAll('[data-manager-account]')],headings=[...document.querySelectorAll('.matrix-manager-group-heading')];return{accountRows:rows.length,realAvatars:rows.filter(r=>r.querySelector('.matrix-account-avatar > img')?.naturalWidth>0).length,logoBadges:rows.filter(r=>r.querySelector('[data-platform-logo] img')?.naturalWidth>0).length,bundledLogos:rows.every(r=>r.querySelector('[data-platform-logo] img')?.src.startsWith('data:image/')),groupHeadings:headings.length,wholeHeadingBackground:headings.every(e=>e.getBoundingClientRect().width>200&&getComputedStyle(e).backgroundColor!=='rgba(0, 0, 0, 0)'),oldColorDots:document.querySelectorAll('.matrix-manager-group-toggle > i').length}})()");
  assert.equal(summary.realAvatars, 5); assert.equal(summary.logoBadges, 5); assert.equal(summary.bundledLogos, true); assert.equal(summary.wholeHeadingBackground, true); assert.equal(summary.oldColorDots, 0);
  const shot = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync('logs/installed-rc27-logos-group-bars.png', Buffer.from(shot.data, 'base64'));
  await evaluate("[...document.querySelectorAll('[data-account-management] button')].find(b=>b.innerText==='添加账号').click();true");
  await wait("document.querySelectorAll('.matrix-account-bind-platforms [data-platform-logo] img').length===4&&[...document.querySelectorAll('.matrix-account-bind-platforms [data-platform-logo] img')].every(i=>i.complete&&i.naturalWidth>0)");
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  console.log(JSON.stringify({ ...summary, bindingDialogBrandLogos: 4, realDataChanges: false, platformActions: false }));
} finally { socket.close(); }
