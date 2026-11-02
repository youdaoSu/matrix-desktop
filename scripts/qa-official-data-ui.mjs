// Disposable database/profile only. Seeded display fixtures are not platform data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const [port, base, disposableProfile] = process.argv.slice(2);
if (disposableProfile) {
  const profile = fs.realpathSync(disposableProfile), origin = new URL(base);
  assert.ok(profile.startsWith(fs.realpathSync(os.tmpdir()) + path.sep) && /^matrix-packaged-qa-/.test(path.basename(profile)));
  assert.equal(origin.origin, base); assert.equal(origin.hostname, '127.0.0.1'); assert.equal(origin.protocol, 'http:');
  assert.equal(origin.port, /^SERVER_PORT=(\d+)$/m.exec(fs.readFileSync(path.join(profile, '.env.local'), 'utf8'))?.[1]);
} else if (base !== 'http://127.0.0.1:3291') throw Error('Isolated QA origin required');
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
const socket = new WebSocket(targets.find(target => target.type === 'page' && target.url.startsWith(base)).webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let sequence = 0, checks = 0; const pending = new Map(), markReadRequests = [];
socket.addEventListener('message', event => { const message = JSON.parse(event.data), item = pending.get(message.id); if (item) { clearTimeout(item.timer); pending.delete(message.id); message.error ? item.reject(Error(message.error.message)) : item.resolve(message.result); } });
socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.method === 'Network.requestWillBeSent' && /\/api\/messages\/sessions\/[^/]+\/read(?:\?|$)/.test(message.params.request.url)) markReadRequests.push(message.params.request.method); });
const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => reject(Error(method + ' timeout')), 20000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description); return r.result.value; };
const pause = () => new Promise(resolve => setTimeout(resolve, 150));
const wait = async expression => { for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; await pause(); } throw Error('Not ready: ' + expression); };
const expect = async (expression, value) => { assert.deepEqual(await evaluate(expression), value, expression); checks++; };
const click = async label => { await evaluate(`(()=>{const el=[...document.querySelectorAll('button')].find(el=>el.getClientRects().length&&el.innerText.trim()===${JSON.stringify(label)});if(!el||el.disabled)throw Error('Button unavailable: '+${JSON.stringify(label)});el.click();return true})()`); await pause(); };
const capture = async name => { await new Promise(resolve => setTimeout(resolve, 1200)); const result = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`logs/qa-official-${name}.png`, Buffer.from(result.data, 'base64')); };
const fixtureAccounts = new Map(); let fixtureApi;
try {
  if (disposableProfile) {
    // Fresh package profiles intentionally have no bound real accounts. Supply
    // owned database fixtures for display only; no platform authentication.
    const csrf = /suda-csrf-token=([^;]+)/.exec((await fetch(base + '/app/')).headers.get('set-cookie') || '')?.[1]; assert.ok(csrf);
    let token;
    fixtureApi = async (method, route, body) => {
      const response = await fetch(base + route, {method, headers: {'content-type': 'application/json', cookie: 'suda-csrf-token=' + csrf, 'x-suda-csrf-token': csrf, ...(token ? {authorization: 'Bearer ' + token} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
      assert.ok([200,201].includes(response.status), 'Disposable fixture API ' + route + ': ' + response.status); return (await response.json()).data;
    };
    token = (await fixtureApi('POST', '/api/auth/login', {username: 'demo', password: 'user123456'})).token; assert.ok(token);
    for (const platform of ['bilibili','wechat','douyin','xiaohongshu']) fixtureAccounts.set(platform, await fixtureApi('POST', '/api/platform/accounts/desktop', {platform, connectorSessionId: randomUUID(), nickname: 'QA snapshot ' + platform}));
    await evaluate("window.dispatchEvent(new Event('matrix:accounts-updated'));true");
  }
  await call('Network.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1580, height: 1240, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: base + '/app/#/publish/create' });
  await wait("!!document.querySelector('.matrix-platform-config-tabs > button:not([disabled])')");
  await click('选择账号'); await wait("document.querySelectorAll('[data-publish-account]').length>=4");
  await evaluate(`document.querySelector(${JSON.stringify(disposableProfile ? `[data-publish-account="${fixtureAccounts.get('xiaohongshu').id}"] [role=checkbox]:not([disabled])` : '[data-publish-account] [role=checkbox]:not([disabled])')}).click();true`); await pause(); await click('确定');
  await click('选择官方合集'); await click('读取当前候选项');
  await expect("document.querySelector('[role=dialog]').innerText.includes('请先打开该账号')", true);
  await expect("document.querySelector('[role=dialog]').innerText.includes('不发布作品')", true);
  await capture('options-empty');
  await call('Page.navigate', { url: base + '/app/#/engage/comments-agg' });
  await wait("document.querySelector('[aria-label=选择评论账号]')?.options.length>1");
  await evaluate(`(async()=>{const user=JSON.parse(localStorage.getItem('matrix_user')||sessionStorage.getItem('matrix_user'));const select=document.querySelector('[aria-label=选择评论账号]');const id=[...select.options].find(option=>option.textContent.includes('抖音'))?.value;if(!id)throw Error('Disposable Douyin fixture account missing');for(const kind of ['comments','messages','followers'])localStorage.setItem('matrix-interaction-v1:'+encodeURIComponent(user.id)+':'+encodeURIComponent(id)+':'+kind,JSON.stringify({source:'https://creator.douyin.com/qa-fixture',capturedAt:new Date().toISOString(),records:[{id:'fixture',platformId:'qa-only-1',author:'QA 页面样本（非真实平台数据）',content:kind==='followers'?'':'QA 已授权隔离测试内容',note:'QA 备注',handled:false,...(kind==='messages'?{unreadState:'unread',unreadCount:3}:{})},...(kind==='messages'?[{id:'unknown',platformId:'qa-only-unknown',author:'QA 未读未知样本',content:'未知不能当作已读',note:'',handled:false}]:[])]}));sessionStorage.setItem('qa-interaction-account',id);return true})()`);
  for (const [kind, label, route] of [['comments','评论','comments-agg'], ['messages','私信会话','messages-agg'], ['followers','粉丝','followers']]) {
    await call('Page.navigate', { url: base + '/app/#/engage/' + route });
    await wait("!!document.querySelector('.matrix-interaction-tools')");
    await evaluate("document.querySelectorAll('.matrix-interaction-tools').forEach(node=>{if(node.querySelector('.matrix-official-interaction'))node.open=true});true");
    await wait(`document.querySelector('[aria-label="选择${label}账号"]')?.options.length>1`);
    await evaluate(`(()=>{const select=document.querySelector('[aria-label="选择${label}账号"]');select.value=sessionStorage.getItem('qa-interaction-account');select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`); await pause();
    await expect("document.body.innerText.includes('QA 页面样本')", true);
    await expect(`document.querySelector('[aria-label="官方${label}管理"]').innerText.includes('不是全量同步')`, true);
    if (kind === 'messages') {
      await expect("document.querySelector('[data-snapshot-unread=unread]').innerText.includes('平台未读 3')", true);
      await expect("document.querySelector('[data-snapshot-unread=unknown]').innerText.includes('未读状态未获取')", true);
      await evaluate("document.querySelector('[aria-label=仅显示已获取未读标记的快照]').click();true"); await pause();
      await expect("document.querySelectorAll('[data-snapshot-unread]').length", 1);
      await expect("document.querySelector('[data-snapshot-unread=unread]')!==null", true);
      await evaluate("document.querySelector('[aria-label=仅显示已获取未读标记的快照]').click();true"); await pause();
    }
    await click('读取当前可见记录'); await expect("document.body.innerText.includes('请先打开该账号')", true);
    await expect("document.body.innerText.includes('QA 页面样本')", true);
    await evaluate(`document.querySelector('[aria-label="官方${label}管理"] article input[type=checkbox]').click();true`); await pause();
    await click('保存本地快照'); await expect("document.body.innerText.includes('当前快照及备注已保存')", true);
    if (kind === 'messages') {
      await expect("document.querySelector('[data-snapshot-unread=unread]').innerText.includes('平台未读 3')", true);
      await expect("Object.keys(localStorage).filter(k=>k.startsWith('matrix-interaction-v1:')&&k.endsWith(':messages')).every(k=>JSON.parse(localStorage.getItem(k)).records[0].unreadCount===3)", true);
    }
    await capture(kind);
    await click('清除本地快照'); await expect("document.querySelector('[role=dialog]').innerText.includes('不会删除平台')", true); await click('取消');
    await expect("document.body.innerText.includes('QA 页面样本')", true);
    await click('清除本地快照'); await click('确认清除本地快照'); await expect("document.body.innerText.includes('QA 页面样本')", false);
    await expect(`Object.keys(localStorage).some(k=>k.startsWith('matrix-interaction-v1:')&&k.endsWith(':${kind}'))`, false);
  }
  await evaluate("sessionStorage.removeItem('qa-interaction-account');true");
  assert.equal(markReadRequests.length, 0); checks++;
  console.log(JSON.stringify({ officialDataUiAssertions: checks, screenshots: 4, appMarkReadRequests: markReadRequests.length, localActionsKeepUnread: true, livePlatformUnreadVerified: false, livePlatformWrites: false }));
} finally {
  for (const account of fixtureAccounts.values()) await fixtureApi('DELETE', '/api/platform/accounts/' + account.id);
  await call('Emulation.clearDeviceMetricsOverride').catch(() => {}); socket.close();
}
