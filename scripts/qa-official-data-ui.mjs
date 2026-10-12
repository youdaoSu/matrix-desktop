// Disposable database/profile only. Seeded display fixtures are not platform data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const [port, base] = process.argv.slice(2);
if (base !== 'http://127.0.0.1:3291') throw Error('Isolated QA origin required');
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
const socket = new WebSocket(targets.find(target => target.type === 'page' && target.url.startsWith(base)).webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let sequence = 0, checks = 0; const pending = new Map();
socket.addEventListener('message', event => { const message = JSON.parse(event.data), item = pending.get(message.id); if (item) { clearTimeout(item.timer); pending.delete(message.id); message.error ? item.reject(Error(message.error.message)) : item.resolve(message.result); } });
const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => reject(Error(method + ' timeout')), 20000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description); return r.result.value; };
const pause = () => new Promise(resolve => setTimeout(resolve, 150));
const wait = async expression => { for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; await pause(); } throw Error('Not ready: ' + expression); };
const expect = async (expression, value) => { assert.deepEqual(await evaluate(expression), value, expression); checks++; };
const click = async label => { await evaluate(`(()=>{const el=[...document.querySelectorAll('button')].find(el=>el.getClientRects().length&&el.innerText.trim()===${JSON.stringify(label)});if(!el||el.disabled)throw Error('Button unavailable: '+${JSON.stringify(label)});el.click();return true})()`); await pause(); };
const capture = async name => { await new Promise(resolve => setTimeout(resolve, 1200)); const result = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`logs/qa-official-${name}.png`, Buffer.from(result.data, 'base64')); };
try {
  await call('Emulation.setDeviceMetricsOverride', { width: 1580, height: 1240, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: base + '/app/#/publish/create' });
  await wait("!!document.querySelector('.matrix-platform-config-tabs > button:not([disabled])')");
  await click('选择账号'); await wait("document.querySelectorAll('[data-publish-account]').length>=4");
  await evaluate("document.querySelector('[data-publish-account] [role=checkbox]:not([disabled])').click();true"); await pause(); await click('确定');
  await click('选择官方合集'); await click('读取当前候选项');
  await expect("document.querySelector('[role=dialog]').innerText.includes('请先打开该账号')", true);
  await expect("document.querySelector('[role=dialog]').innerText.includes('不发布作品')", true);
  await capture('options-empty');
  await call('Page.navigate', { url: base + '/app/#/engage/comments-agg' });
  await wait("document.querySelector('[aria-label=选择评论账号]')?.options.length>1");
  await evaluate(`(async()=>{const user=JSON.parse(localStorage.getItem('matrix_user')||sessionStorage.getItem('matrix_user'));const select=document.querySelector('[aria-label=选择评论账号]');const id=select.options[1].value;for(const kind of ['comments','messages','followers'])localStorage.setItem('matrix-interaction-v1:'+encodeURIComponent(user.id)+':'+encodeURIComponent(id)+':'+kind,JSON.stringify({source:'https://creator.douyin.com/qa-fixture',capturedAt:new Date().toISOString(),records:[{id:'fixture',platformId:'qa-only-1',author:'QA 页面样本（非真实平台数据）',content:kind==='followers'?'':'QA 已授权隔离测试内容',note:'QA 备注',handled:false}]}));sessionStorage.setItem('qa-interaction-account',id);return true})()`);
  for (const [kind, label, route] of [['comments','评论','comments-agg'], ['messages','私信会话','messages-agg'], ['followers','粉丝','followers']]) {
    await call('Page.navigate', { url: base + '/app/#/engage/' + route });
    await wait(`document.querySelector('[aria-label="选择${label}账号"]')?.options.length>1`);
    await evaluate(`(()=>{const select=document.querySelector('[aria-label="选择${label}账号"]');select.value=sessionStorage.getItem('qa-interaction-account');select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`); await pause();
    await expect("document.body.innerText.includes('QA 页面样本')", true);
    await expect(`document.querySelector('[aria-label="官方${label}管理"]').innerText.includes('不是全量同步')`, true);
    await click('读取当前可见记录'); await expect("document.body.innerText.includes('请先打开该账号')", true);
    await expect("document.body.innerText.includes('QA 页面样本')", true);
    await evaluate(`document.querySelector('[aria-label="官方${label}管理"] article input[type=checkbox]').click();true`); await pause();
    await click('保存本地快照'); await expect("document.body.innerText.includes('当前快照及备注已保存')", true);
    await capture(kind);
    await click('清除本地快照'); await expect("document.querySelector('[role=dialog]').innerText.includes('不会删除平台')", true); await click('取消');
    await expect("document.body.innerText.includes('QA 页面样本')", true);
    await click('清除本地快照'); await click('确认清除本地快照'); await expect("document.body.innerText.includes('QA 页面样本')", false);
    await expect(`Object.keys(localStorage).some(k=>k.startsWith('matrix-interaction-v1:')&&k.endsWith(':${kind}'))`, false);
  }
  await evaluate("sessionStorage.removeItem('qa-interaction-account');true");
  console.log(JSON.stringify({ officialDataUiAssertions: checks, screenshots: 4, livePlatformWrites: false }));
} finally { await call('Emulation.clearDeviceMetricsOverride').catch(() => {}); socket.close(); }
