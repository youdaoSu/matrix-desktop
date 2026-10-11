// Whole-window, bottom-of-scroll and expanded-content captures in the disposable QA app.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const [port, base] = process.argv.slice(2);
if (base !== 'http://127.0.0.1:3291') throw Error('Isolated QA origin required');
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
const socket = new WebSocket(targets.find(target => target.type === 'page' && target.url.startsWith(base)).webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let seq = 0; const pending = new Map();
socket.addEventListener('message', event => { const m = JSON.parse(event.data), p = pending.get(m.id); if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } });
const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; const timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timeout')); }, 15000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => { const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description); return result.result.value; };
const capture = async (name, full = false) => {
  const metrics = await call('Page.getLayoutMetrics');
  const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(full ? { clip: { x: 0, y: 0, width: metrics.cssContentSize.width, height: Math.min(6000, metrics.cssContentSize.height), scale: 1 } } : {}) });
  fs.writeFileSync(`logs/qa-reference-${name}.png`, Buffer.from(shot.data, 'base64'));
};
try {
  await call('Emulation.setDeviceMetricsOverride', { width: 1264, height: 992, deviceScaleFactor: 1.25, mobile: false });
  await evaluate("[...document.querySelectorAll('.matrix-workspace-tabs > button')].find(button=>button.getClientRects().length)?.click();document.querySelector('#qa-native-drop')?.remove();true");
  await new Promise(resolve => setTimeout(resolve, 4500));
  let checks = 0;
  const queueKey = await evaluate("Object.keys(localStorage).find(key=>key.startsWith('matrix-publish-progress:'))");
  assert.ok(queueKey);
  const previousQueue = await evaluate(`localStorage.getItem(${JSON.stringify(queueKey)})`);
  for (const page of ['create', 'batch-video', 'batch-image', 'drafts', 'tasks', 'stats']) {
    await evaluate(`location.hash=${JSON.stringify('#/publish/' + page)};true`);
    await new Promise(resolve => setTimeout(resolve, 650));
    if (page === 'tasks') {
      const fixtureJobs = Array.from({ length: 12 }, (_, index) => {
        const createdAt = new Date(Date.now() - Math.floor(index / 4) * 86400000).toISOString(), stage = index < 8 ? 'confirmed' : index < 10 ? 'failed' : 'unknown';
        return { id: `qa-display-${index}`, batchId: `qa-batch-${Math.floor(index / 4)}`, accountId: `qa-account-${index % 2}`, nickname: `隔离测试账号 ${index % 2 + 1}`, platform: index % 2 ? 'xiaohongshu' : 'douyin', title: `测试作品 ${index + 1}（未实际发布）`, files: [`fixture-${index + 1}.mp4`], mediaType: 'video', stage, createdAt, updatedAt: createdAt, message: '隔离界面测试记录，不代表真实平台操作', config: { title: '测试作品', body: '测试描述', topics: [], comment: '测试追评', options: {} }, followup: { status: index % 2 ? 'failed' : 'pending', message: '独立的追评状态测试' }, history: [{ stage: 'preparing', at: createdAt, message: '测试准备' }, { stage, at: createdAt, message: '测试结果' }] };
      });
      await evaluate(`localStorage.setItem(${JSON.stringify(queueKey)},${JSON.stringify(JSON.stringify(fixtureJobs))});true`);
      await call('Page.reload'); await new Promise(resolve => setTimeout(resolve, 1100));
      assert.equal(await evaluate("document.querySelectorAll('[data-publish-job]').length"),12); checks++;
      await evaluate("(()=>{const el=document.querySelector('select[aria-label=请选择状态]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,'failed');el.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
      await new Promise(resolve => setTimeout(resolve,150));
      assert.equal(await evaluate("document.querySelectorAll('[data-publish-job]').length"),2); checks++;
      await evaluate("(()=>{const el=document.querySelector('select[aria-label=请选择状态]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,'');el.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
      await new Promise(resolve => setTimeout(resolve,150));
    }
    if (page === 'stats') { assert.deepEqual(await evaluate("[...document.querySelectorAll('.matrix-task-metrics strong')].map(el=>el.innerText)"), ['12','8','66.67%','2','4 / 4']); checks++; }
    assert.ok(await evaluate("!!document.querySelector('.matrix-page-content') && document.querySelector('.matrix-page-content').innerText.length > 20")); checks++;
    const footer = await evaluate("(()=>{const e=document.querySelector('.matrix-publish-footer');return !e || e.getBoundingClientRect().bottom<=innerHeight+1})()"); assert.equal(footer, true); checks++;
    await capture(page + '-top');
    await evaluate("document.querySelectorAll('.matrix-publish-columns>section,.matrix-batch-columns>section,.matrix-page-content,.matrix-task-list').forEach(el=>{el.scrollTop=el.scrollHeight});true");
    await capture(page + '-bottom');
    if (page === 'create') {
      assert.ok(await evaluate("document.body.innerText.includes('本机定时') && document.body.innerText.includes('通用封面2')")); checks++;
      await evaluate("(()=>{const style=document.createElement('style');style.id='qa-full-capture';style.textContent='.matrix-shell,.matrix-shell>div,.matrix-page-content,.matrix-publish-editor,.matrix-publish-columns,.matrix-publish-columns>section {height:auto!important;max-height:none!important;overflow:visible!important;min-height:0!important}';document.head.append(style);document.querySelectorAll('.matrix-page-content,.matrix-publish-columns>section').forEach(el=>el.scrollTop=0);return true})()");
      await capture(page + '-full-content', true); await evaluate("document.querySelector('#qa-full-capture').remove();true");
    }
  }
  await evaluate("location.hash='#/publish/tasks';true"); await new Promise(resolve => setTimeout(resolve,250));
  await evaluate("(()=>{const el=document.querySelector('select[aria-label=请选择状态]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,'unknown');el.dispatchEvent(new Event('change',{bubbles:true}));return true})()"); await new Promise(resolve => setTimeout(resolve,150));
  await evaluate("[...document.querySelectorAll('.matrix-task-footer button')].find(el=>el.innerText==='全选').click();true"); await new Promise(resolve => setTimeout(resolve,100));
  assert.equal(await evaluate("[...document.querySelectorAll('.matrix-task-footer button')].find(el=>el.innerText==='批量重发').disabled"),true); checks++;
  await evaluate("window.confirm=()=>true;[...document.querySelectorAll('.matrix-task-footer button')].find(el=>el.innerText==='批量删除').click();true"); await new Promise(resolve => setTimeout(resolve,150));
  assert.equal(await evaluate("document.querySelectorAll('[data-publish-job]').length"),0); checks++;
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(queueKey)})).length`),10); checks++;
  await evaluate("location.hash='#/publish/stats';true"); await new Promise(resolve => setTimeout(resolve,250));
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.matrix-task-metrics strong')].slice(0,3).map(el=>el.innerText)"),['10','8','80.00%']); checks++;
  await evaluate(`localStorage.setItem(${JSON.stringify(queueKey)},${JSON.stringify(previousQueue || '[]')});true`);
  await call('Page.reload');
  console.log(JSON.stringify({ publishVisualChecks: checks, screenshots: 13, wholeWindowAndScrolledBottom: true, isolatedDataOnly: true }));
} finally { await call('Emulation.clearDeviceMetricsOverride').catch(() => {}); socket.close(); }
