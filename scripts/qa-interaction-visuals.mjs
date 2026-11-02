// Read-only UI/geometry regression using the disposable QA database and profile.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const [port, base] = process.argv.slice(2);
if (base !== 'http://127.0.0.1:3291') throw Error('Disposable QA origin required');
const target = (await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json())).find(t => t.type === 'page' && t.url.startsWith(base));
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let sequence = 0, checks = 0, screenshots = 0;
const pending = new Map();
socket.addEventListener('message', event => { const message = JSON.parse(event.data), item = pending.get(message.id); if (item) { clearTimeout(item.timer); pending.delete(message.id); message.error ? item.reject(Error(message.error.message)) : item.resolve(message.result); } });
const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => reject(Error(method + ' timeout')), 20000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => { const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description); return result.result.value; };
const pause = () => new Promise(resolve => setTimeout(resolve, 180));
const wait = async expression => { for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; await pause(); } throw Error('Not ready: ' + expression); };
const expect = async (expression, expected = true) => { assert.deepEqual(await evaluate(expression), expected, expression); checks++; };
const click = async label => { await evaluate(`(()=>{const el=[...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&e.innerText.trim()===${JSON.stringify(label)});if(!el||el.disabled)throw Error('Button unavailable: '+${JSON.stringify(label)});el.click();return true})()`); await pause(); };
const set = async (selector, value) => { await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));return true})()`); await pause(); };
const routes = ['comments', 'comments-agg', 'auto-comment', 'batch-tasks', 'messages', 'messages-agg', 'auto-message', 'followers', 'follower-monitor'];
const route = async view => { await evaluate(`location.hash='#/engage/${view}';true`); await wait(`!!document.querySelector('[data-interaction-view="${view}"]')`); await wait("![...document.querySelectorAll('.matrix-page-content [role=status]')].some(e=>e.getClientRects().length)"); await pause(); };
const capture = async file => {
  await call('Page.bringToFront');
  const size = await evaluate("({width:innerWidth,height:innerHeight,fullHeight:Math.max(innerHeight,document.querySelector('.matrix-main').scrollHeight+60)})");
  // The shell has an inner scroll container; captureBeyondViewport alone would crop its footer.
  await call('Emulation.setDeviceMetricsOverride', { width: size.width, height: Math.min(6000, size.fullHeight), deviceScaleFactor: 1, mobile: false });
  await evaluate("document.querySelector('.matrix-main').scrollTop=0;true"); await pause();
  const result = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(`logs/${file}.png`, Buffer.from(result.data, 'base64')); screenshots++;
  await call('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: false });
};
try {
  await evaluate("location.hash='#/settings/privacy';true"); await wait("!!document.querySelector('[aria-label=maskAccountDetails]')");
  await evaluate("(()=>{const el=document.querySelector('[aria-label=maskAccountDetails]');if(el.checked)el.click();return true})()"); await pause();
  await wait("!document.querySelector('[data-sonner-toast][data-visible=true]')");
  await call('Emulation.setDeviceMetricsOverride', { width: 1712, height: 808, deviceScaleFactor: 1, mobile: false });
  for (const view of routes) {
    await route(view);
    await expect("Math.abs(document.querySelector('.matrix-module-sidebar').getBoundingClientRect().width-114)<1");
    await expect("[...document.querySelectorAll('.matrix-module-sidebar a')].filter(e=>e.getClientRects().length&&e.getAttribute('href').includes('/engage/')).length", 9);
    await expect("document.querySelector('.matrix-main').scrollWidth<=document.querySelector('.matrix-main').clientWidth+1");
    await expect("document.querySelector('.matrix-page-content').innerText.includes('限VIP用户可用')", false);
    if (['auto-comment', 'batch-tasks', 'auto-message', 'follower-monitor'].includes(view)) await expect("!!document.querySelector('.matrix-interaction-table-wrap table')");
    if (['comments', 'messages'].includes(view)) await expect("Math.abs(document.querySelector('.matrix-reply-template-pane').getBoundingClientRect().width-300)<1");
    await capture(`qa-interaction-${view}-full`);
  }
  await route('comments');
  await expect("Math.abs(document.querySelector('.matrix-interaction-accounts').getBoundingClientRect().width-180)<1&&Math.abs(document.querySelector('.matrix-interaction-posts').getBoundingClientRect().width-280)<1");
  await route('comments-agg');
  await wait("document.querySelectorAll('[data-comment-id]').length===2");
  await set('[aria-label="互动开始日期"]', '2099-01-01');
  await expect("document.querySelectorAll('[data-comment-id]').length", 0);
  await set('[aria-label="互动开始日期"]', '');
  await expect("document.querySelectorAll('[data-comment-id]').length", 2);
  await click('已回复'); await wait("document.querySelectorAll('[data-comment-id]').length===0"); checks++;
  await click('所有'); await wait("document.querySelectorAll('[data-comment-id]').length===2"); checks++;
  await set('[aria-label="互动分组筛选"]', 'QA 工作区');
  await expect("document.querySelectorAll('[data-comment-id]').length", 2);
  await set('[aria-label="互动开始日期"]', '2026-10-15'); await set('[aria-label="互动结束日期"]', '2026-10-01');
  await expect("document.querySelector('.matrix-interaction-toolbar [role=alert]')?.innerText.includes('结束日期不能早于开始日期')");
  await route('messages');
  await expect("Math.abs(document.querySelector('.matrix-interaction-accounts').getBoundingClientRect().width-200)<1&&Math.abs(document.querySelector('.matrix-message-sessions').getBoundingClientRect().width-260)<1");
  await wait("document.querySelector('.matrix-message-sessions').innerText.includes('QA isolated conversation')");
  await evaluate("[...document.querySelectorAll('.matrix-message-sessions button')].find(e=>e.innerText.includes('QA isolated conversation')).click();true");
  await wait("document.querySelector('.matrix-message-panel').innerText.includes('QA inbound fixture')"); checks++;
  await route('followers'); await wait("!!document.querySelector('[data-follower-id]')");
  await evaluate("document.querySelector('[data-follower-id]').click();true"); await pause();
  await expect("document.querySelector('.matrix-follower-profile').innerText.includes('QA profile remark')");
  await expect("Math.abs(document.querySelector('.matrix-interaction-accounts').getBoundingClientRect().width-180)<1");
  await route('follower-monitor'); await click('添加监控');
  await expect("document.querySelector('[role=dialog]').innerText.includes('不会创建空跑计划')"); await click('关闭');
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  for (const view of ['comments', 'messages', 'followers', 'batch-tasks']) { await route(view); await expect("document.querySelector('.matrix-main').scrollWidth<=document.querySelector('.matrix-main').clientWidth+1"); await capture(`qa-interaction-${view}-1280`); }
  await evaluate("document.documentElement.classList.add('dark');true"); await capture('qa-interaction-dark');
  await expect("getComputedStyle(document.querySelector('.matrix-interaction-task-page')).backgroundColor!=='rgb(255, 255, 255)'");
  await expect("getComputedStyle(document.querySelector('[aria-label=待办状态筛选]')).backgroundColor!=='rgb(255, 255, 255)'");
  await evaluate("document.documentElement.classList.remove('dark');true");
  console.log(JSON.stringify({ interactionUiAssertions: checks, fullWindowScreenshots: screenshots, realPlatformWrites: false }));
} finally { await call('Emulation.clearDeviceMetricsOverride').catch(() => {}); socket.close(); }
