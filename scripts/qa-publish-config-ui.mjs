// UI-only actions in disposable QA profile/database. Never publishes or uploads.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const [port, base] = process.argv.slice(2);
if (base !== 'http://127.0.0.1:3291') throw Error('Isolated QA origin required');
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
const socket = new WebSocket(targets.find(target => target.type === 'page' && target.url.startsWith(base)).webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let sequence = 0, checks = 0, screenshots = 0; const pending = new Map();
socket.addEventListener('message', event => { const message = JSON.parse(event.data), item = pending.get(message.id); if (item) { clearTimeout(item.timer); pending.delete(message.id); message.error ? item.reject(Error(message.error.message)) : item.resolve(message.result); } });
const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => reject(Error(method + ' timeout')), 20000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description); return r.result.value; };
const pause = () => new Promise(resolve => setTimeout(resolve, 150));
const click = async label => { await evaluate(`(()=>{const el=[...document.querySelectorAll('button')].find(el=>el.getClientRects().length&&el.innerText.trim()===${JSON.stringify(label)});if(!el||el.disabled)throw Error('Button unavailable: '+${JSON.stringify(label)});el.click();return true})()`); await pause(); };
const fill = async (selector, value) => { await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing input');Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`); await pause(); };
const wait = async expression => { for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await pause(); } throw Error('Not ready: ' + expression); };
const expect = async (expression, value) => { assert.deepEqual(await evaluate(expression), value, expression); checks++; };
const capture = async (name, full = false) => {
  await new Promise(resolve => setTimeout(resolve, 4500));
  const metrics = await call('Page.getLayoutMetrics');
  const image = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(full ? { clip: { x: 0, y: 0, width: metrics.cssContentSize.width, height: Math.min(6000, metrics.cssContentSize.height), scale: 1 } } : {}) });
  fs.writeFileSync(`logs/qa-config-${name}.png`, Buffer.from(image.data, 'base64')); screenshots++;
};
try {
  await call('Emulation.setDeviceMetricsOverride', { width: 1580, height: 1240, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: base + '/app/#/publish/create' });
  await wait("!!document.querySelector('.matrix-platform-config-tabs > button:not([disabled])')");
  await evaluate("[...document.querySelectorAll('.matrix-workspace-tabs > button')].find(el=>el.getClientRects().length)?.click();true"); await pause();
  await fill('#publish-title', '通用标题'); await fill('#publish-content', '通用简介');
  await click('选择账号');
  await wait("document.querySelectorAll('[data-publish-account]').length>=4");
  await expect("(()=>{const r=document.querySelector('.matrix-publish-picker').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()", true);
  await evaluate("document.querySelector('[data-publish-account] [role=checkbox]:not([disabled])').click();true"); await pause();
  await click('取消'); await expect("document.querySelectorAll('[data-config-account]').length", 0);
  await click('选择账号');
  for (const tab of ['按分组', '按标签', '按平台', '常用列表']) { await click(tab); await capture('picker-' + ['按分组','按标签','按平台','常用列表'].indexOf(tab)); await expect("!!document.querySelector('[role=tab][aria-selected=true]')", true); }
  await click('按标签'); await expect("document.querySelector('.matrix-picker-groups').innerText.includes('QA 发布')", true);
  await click('按平台'); await fill('[aria-label="搜索发布账号"]', 'QA douyin'); await expect("document.querySelectorAll('[data-publish-account]').length", 1);
  await fill('[aria-label="搜索发布账号"]', '');
  await evaluate("[...document.querySelectorAll('[data-publish-account] [role=checkbox]:not([disabled])')].forEach(el=>el.click());true"); await pause();
  await expect("document.querySelectorAll('.matrix-picker-selected li').length", 4);
  await click('保存列表'); await fill('[aria-label="常用列表名称"]', 'QA 四平台列表'); await click('保存');
  await click('常用列表'); await expect("document.querySelector('.matrix-picker-groups').innerText.includes('QA 四平台列表')", true);
  await click('确定'); await expect("document.querySelectorAll('[aria-label=发布平台] [role=tab]').length", 4);
  for (const [platform, label, field] of [['xiaohongshu','小红书','关联群聊'], ['douyin','抖音','音乐'], ['bilibili','B站','转载来源'], ['wechat','视频号','扩展链接']]) {
    await evaluate(`document.querySelector('[aria-label=发布平台] [aria-label=${JSON.stringify(label)}]').click();true`); await pause();
    await expect("document.querySelector('[data-config-platform]').dataset.configPlatform", platform);
    await fill('#account-title', '独立' + platform); await fill(`[aria-label="QA ${platform}-${field}"]`, 'QA 指定配置');
    await capture(platform + '-top');
    await evaluate("document.querySelector('.matrix-publish-accounts').scrollTop=99999;true"); await pause(); await capture(platform + '-bottom');
    await expect("document.querySelector('[aria-label=计划发布时间]')===null", true);
    await evaluate("document.querySelector('.matrix-publish-accounts').scrollTop=0;true");
    await evaluate("(()=>{const style=document.createElement('style');style.id='qa-config-full';style.textContent='.matrix-shell,.matrix-shell>div,.matrix-page-content,.matrix-publish-editor,.matrix-publish-columns,.matrix-publish-columns>section {height:auto!important;max-height:none!important;overflow:visible!important;min-height:0!important}';document.head.append(style);document.querySelectorAll('.matrix-page-content,.matrix-publish-columns>section').forEach(el=>el.scrollTop=0);return true})()");
    await capture(platform + '-full-content', true); await evaluate("document.querySelector('#qa-config-full').remove();true");
  }
  await evaluate("document.querySelector('[aria-label=发布平台] [aria-label=抖音]').click();true"); await pause();
  await expect("document.querySelector('#account-title').value", '独立douyin');
  await expect("document.querySelector('[aria-label=\"QA douyin-音乐\"]').value", 'QA 指定配置');
  await evaluate("document.querySelectorAll('.matrix-platform-config-header [role=switch]')[1].click();true"); await pause();
  await fill('[aria-label="QA douyin-音乐"]', 'QA 记忆曲目');
  await call('Page.reload'); await wait("!!document.querySelector('.matrix-platform-config-tabs > button:not([disabled])')"); await click('选择账号'); await click('常用列表'); await click('加入已选'); await click('确定');
  await evaluate("document.querySelector('[aria-label=发布平台] [aria-label=抖音]').click();true"); await pause();
  await expect("document.querySelector('[aria-label=\"QA douyin-音乐\"]').value", 'QA 记忆曲目');
  await expect("document.querySelector('#account-title').value", '');
  await capture('remembered-options');
  await call('Emulation.setDeviceMetricsOverride', { width: 1100, height: 760, deviceScaleFactor: 1, mobile: false });
  await click('选择账号'); await capture('picker-small-window'); await expect("(()=>{const r=document.querySelector('.matrix-publish-picker').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()", true); await click('取消');
  await evaluate("Object.keys(localStorage).filter(key=>key.startsWith('matrix-publish-preferences:')).forEach(key=>localStorage.removeItem(key));true");
  console.log(JSON.stringify({ publishConfigUiChecks: checks, screenshots, realPlatformActions: false }));
} finally { await call('Emulation.clearDeviceMetricsOverride').catch(() => {}); socket.close(); }
