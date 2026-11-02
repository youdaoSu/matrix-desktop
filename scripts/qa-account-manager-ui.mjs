// Drag, groups, menus and avatars in the disposable account workspace only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
const [port, base] = process.argv.slice(2);
if (base !== 'http://127.0.0.1:3291') throw Error('Disposable UI profile required');
const target = (await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json())).find(t => t.type === 'page' && t.url.startsWith(base));
const socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let sequence = 0, checks = 0; const pending = new Map();
const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => reject(Error(method + ' timed out')), 20000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
socket.addEventListener('message', event => { const m = JSON.parse(event.data), p = pending.get(m.id); if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } });
const evaluate = async expression => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
async function wait(expression, label) { for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 100)); } throw Error(label); }
async function reloadAccountDocument() {
  // A reload ACK is not a document commit. Old account nodes can briefly pass
  // a selector wait and then disappear as the fresh document starts loading.
  await evaluate('window.qaAccountManagerReloadPending=true;true');
  await call('Page.reload');
  await wait("!window.qaAccountManagerReloadPending&&location.hash==='#/accounts'&&!!document.querySelector('.matrix-manager-rail [data-default-group=true]')", 'Fresh account document did not commit');
}
const api = (method, url, body) => evaluate(`(async()=>{const token=localStorage.getItem('matrix_token')||sessionStorage.getItem('matrix_token');const csrf=decodeURIComponent(document.cookie.split('; ').find(v=>v.startsWith('suda-csrf-token='))?.slice(16)||'');const r=await fetch(${JSON.stringify(url)},{method:${JSON.stringify(method)},headers:{Authorization:'Bearer '+token,'x-suda-csrf-token':csrf,'Content-Type':'application/json'},body:${body === undefined ? 'undefined' : JSON.stringify(JSON.stringify(body))}});const data=await r.json();if(!r.ok)throw Error(data.message||'API failed');return data.data;})()`);
const check = (value, label) => { assert.ok(value, label); checks++; };
const setInput = (selector, value) => evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
const menu = async groupId => {
  await wait("!document.querySelector('[role=dialog]')&&getComputedStyle(document.body).pointerEvents!=='none'", 'Prior dialog still blocks pointer input');
  const point = await evaluate(`(()=>{const r=document.querySelector('[data-account-group="${groupId}"] .matrix-manager-group-heading > button:last-child').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  await wait("!!document.querySelector('[role=menu]')", 'Group menu missing');
};
const clickMenu = async text => { await evaluate(`[...document.querySelectorAll('[role=menuitem]')].find(b=>b.innerText.trim()===${JSON.stringify(text)}).click();true`); };
const closeMenu = async () => { await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }); await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' }); await wait("!document.querySelector('[role=menu]')", 'Menu did not close'); };
const drag = async (accountId, groupId, wrongOwner = false) => evaluate(`(()=>{const source=document.querySelector('[data-manager-account="${accountId}"]');const target=document.querySelector('[data-account-group="${groupId}"]');const transfer=new DataTransfer();source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));if(${wrongOwner}){const data=JSON.parse(transfer.getData('application/x-matrix-account-ids'));data.owner='different-owner';transfer.setData('application/x-matrix-account-ids',JSON.stringify(data));}target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer}));target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));source.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:transfer}));return !!transfer.getData('application/x-matrix-account-ids');})()`);
let group, account, defaultGroup, originalGroup, originalColor, statusStorageKey, previousStatusRaw;
try {
  await call('Page.navigate', { url: base + '/app/#/accounts' });
  await wait("location.hash==='#/accounts'", 'Account route did not commit before reload');
  await reloadAccountDocument();
  await wait("!!document.querySelector('.matrix-manager-rail [data-default-group=true]')&&document.querySelectorAll('[data-manager-account]').length>=4", 'Unified account manager missing');
  check(await evaluate("!document.querySelector('.matrix-page-content table')&&!document.querySelector('.matrix-module-sidebar')"), 'No duplicate table or group navigation');
  const accounts = (await api('GET', '/api/platform/accounts?pageSize=100')).items;
  account = accounts.find(a => a.nickname === 'QA douyin'); assert.ok(account); originalGroup = account.groupId;
  defaultGroup = (await api('GET', '/api/platform/groups')).find(g => g.isDefault); originalColor = defaultGroup.color;
  await menu(defaultGroup.id);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[role=menuitem]')].map(b=>b.innerText.trim())"), ['打开所有账号', '设置颜色']); checks++;
  await clickMenu('设置颜色'); await wait("!!document.querySelector('.matrix-group-color-picker')", 'Color picker missing');
  await evaluate("document.querySelector('[aria-label=\"分组颜色#fbeaea\"]').click();true");
  await wait("document.querySelector('[aria-label=\"分组颜色#fbeaea\"]').getAttribute('aria-pressed')==='true'", 'Color selection not ready');
  await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.innerText==='保存').click();true");
  await wait(`document.querySelector('[data-account-group="${defaultGroup.id}"]').style.getPropertyValue('--group-color')==='#fbeaea'`, 'Default group color not persisted'); checks++;
  check(await evaluate(`getComputedStyle(document.querySelector('[data-account-group="${defaultGroup.id}"] .matrix-manager-group-heading')).backgroundColor==='rgb(251, 234, 234)'`), 'Entire group heading receives the selected background');
  check(await evaluate(`!document.querySelector('[data-account-group="${defaultGroup.id}"] .matrix-manager-group-toggle > i')`), 'No color dot substitutes for the colored group bar');
  await evaluate("[...document.querySelectorAll('.matrix-manager-rail footer button')].find(b=>b.innerText.includes('添加分组')).click();true");
  await wait("!!document.querySelector('[aria-label=分组名称]')", 'Group form missing');
  const name = 'QA UI group ' + randomUUID().slice(0, 8); await setInput('[aria-label=分组名称]', name);
  await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.innerText==='保存').click();true");
  await wait(`document.querySelector('.matrix-manager-groups').innerText.includes(${JSON.stringify(name)})`, 'Group not created'); checks++;
  group = (await api('GET', '/api/platform/groups')).find(g => g.groupName === name); assert.ok(group);
  await menu(group.id); assert.deepEqual(await evaluate("[...document.querySelectorAll('[role=menuitem]')].map(b=>b.innerText.trim())"), ['修改名称', '删除', '打开所有账号', '设置颜色']); checks++;
  await closeMenu();
  await menu(group.id); await clickMenu('设置颜色'); await wait("!!document.querySelector('.matrix-group-color-picker')", 'Custom group color form missing');
  await evaluate("document.querySelector('[aria-label=\"分组颜色#eaf0ff\"]').click();true");
  await wait("document.querySelector('[aria-label=\"分组颜色#eaf0ff\"]').getAttribute('aria-pressed')==='true'", 'Blue bar color not selected');
  await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.innerText==='保存').click();true");
  await wait(`getComputedStyle(document.querySelector('[data-account-group="${group.id}"] .matrix-manager-group-heading')).backgroundColor==='rgb(234, 240, 255)'`, 'Custom group blue bar not saved'); checks++;
  check(await evaluate(`getComputedStyle(document.querySelector('[data-account-group="${defaultGroup.id}"] .matrix-manager-group-heading')).backgroundColor==='rgb(251, 234, 234)'`), 'Custom group color does not change the default heading');
  check(await drag(account.id, group.id), 'Account drag carries only scoped account identifiers');
  await wait(`!!document.querySelector('[data-account-group="${group.id}"] [data-manager-account="${account.id}"]')`, 'Native drag did not save account group'); checks++;
  assert.equal((await api('GET', '/api/platform/accounts/' + account.id + '/detail')).groupId, group.id); checks++;
  await drag(account.id, defaultGroup.id, true);
  assert.equal((await api('GET', '/api/platform/accounts/' + account.id + '/detail')).groupId, group.id); checks++;
  check(await evaluate(`document.querySelector('[data-manager-account="${account.id}"] .matrix-account-avatar-fallback')?.innerText==='Q'`), 'Missing avatar uses readable initials, not an empty circle');
  await menu(group.id); await clickMenu('修改名称'); await wait("!!document.querySelector('[aria-label=分组名称]')", 'Rename dialog missing');
  await setInput('[aria-label=分组名称]', name + ' renamed'); await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.innerText==='保存').click();true");
  await wait(`document.querySelector('[data-account-group="${group.id}"]').innerText.includes('renamed')`, 'Rename did not update sidebar'); checks++;
  check((await api('GET', '/api/platform/accounts/' + account.id + '/detail')).groupName.endsWith('renamed'), 'Renaming group updates account metadata');
  await reloadAccountDocument(); await wait(`!!document.querySelector('[data-account-group="${group.id}"] [data-manager-account="${account.id}"]')`, 'Drag assignment not restored after reload'); checks++;
  check(await evaluate(`getComputedStyle(document.querySelector('[data-account-group="${defaultGroup.id}"] .matrix-manager-group-heading')).backgroundColor==='rgb(251, 234, 234)'`), 'Group heading background survives reload');
  check(await evaluate(`getComputedStyle(document.querySelector('[data-account-group="${group.id}"] .matrix-manager-group-heading')).backgroundColor==='rgb(234, 240, 255)'`), 'Custom group blue bar survives reload');
  check(await evaluate(`getComputedStyle(document.querySelector('[data-manager-account="${account.id}"]')).backgroundColor!=='rgb(234, 240, 255)'`), 'Account rows do not inherit the group heading color');
  const colorShot = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync('logs/qa-group-label-colors.png', Buffer.from(colorShot.data, 'base64'));
  await menu(group.id); await clickMenu('删除'); await wait("document.querySelector('[role=dialog]')?.innerText.includes('删除分组')", 'Delete dialog missing');
  check(await evaluate("document.querySelector('[role=dialog]').innerText.includes('账号移回默认分组')"), 'Delete explains account preservation');
  await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.innerText==='确认删除').click();true");
  await wait(`!document.querySelector('[data-account-group="${group.id}"]')&&!!document.querySelector('[data-default-group=true] [data-manager-account="${account.id}"]')`, 'Delete did not move account safely to default'); checks++;
  group = undefined;
  await wait("!document.querySelector('[role=dialog]')&&getComputedStyle(document.body).pointerEvents!=='none'", 'Delete dialog did not close');
  // Exercise the real subscribed avatar, not a mocked React component. The entire
  // browser profile and these QA accounts belong only to the disposable runner.
  const ownerId = await evaluate("JSON.parse(localStorage.getItem('matrix_user')||sessionStorage.getItem('matrix_user')).id");
  statusStorageKey = 'matrix-account-observations:' + ownerId;
  previousStatusRaw = await evaluate(`localStorage.getItem(${JSON.stringify(statusStorageKey)})`);
  const avatar = `[data-manager-account="${account.id}"] .matrix-account-avatar`;
  const setObservedState = async state => {
    const stored = [{ key: account.id + ':' + account.connectorSessionId, state, reason: 'Disposable UI fixture only', checkedAt: Date.now() }];
    await evaluate(`(()=>{const key=${JSON.stringify(statusStorageKey)};localStorage.setItem(key,${JSON.stringify(JSON.stringify(stored))});window.dispatchEvent(new StorageEvent('storage',{key}));return true;})()`);
    await wait(`document.querySelector(${JSON.stringify(avatar)})?.dataset.accountAvailability===${JSON.stringify(state)}`, 'Account status subscription not updated: ' + state); checks++;
  };
  for (const state of ['normal', 'offline', 'abnormal', 'banned', 'unknown']) {
    await setObservedState(state);
    check(await evaluate(`document.querySelector(${JSON.stringify(avatar + ' .matrix-account-session-mark')})?.textContent===${JSON.stringify(state === 'normal' ? '✓' : state === 'unknown' ? '?' : '×')}`), 'Correct account status symbol: ' + state);
    check(await evaluate(`document.querySelector(${JSON.stringify(avatar)})?.classList.contains('is-unavailable')===${state !== 'normal'}`), 'Unavailable avatar appearance: ' + state);
  }
  await setObservedState('offline');
  await call('Page.reload');
  await wait(`document.querySelector(${JSON.stringify(avatar)})?.dataset.accountAvailability==='offline'`, 'Offline observation lost after reload'); checks++;
  check(await evaluate(`!document.querySelector(${JSON.stringify(avatar + ' .is-authorized')})`), 'Persisted offline account cannot show green check');
  await setObservedState('normal');
  await evaluate("window.dispatchEvent(new StorageEvent('storage',{key:'matrix-account-observations:another-owner'}));true");
  check(await evaluate(`document.querySelector(${JSON.stringify(avatar)})?.dataset.accountAvailability==='normal'`), 'Other owner storage events do not alter this account');
  await evaluate(`(()=>{const key=${JSON.stringify(statusStorageKey)},raw=${JSON.stringify(previousStatusRaw)};if(raw===null)localStorage.removeItem(key);else localStorage.setItem(key,raw);window.dispatchEvent(new StorageEvent('storage',{key}));return true;})()`);
  statusStorageKey = undefined;
  const shot = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync('logs/qa-account-manager-source.png', Buffer.from(shot.data, 'base64'));
  await evaluate("location.hash='#/accounts/groups';true"); await wait("location.hash==='#/accounts'&&!!document.querySelector('.matrix-manager-rail')", 'Old group page must redirect to unified manager'); checks++;
  console.log(JSON.stringify({ accountManagerUiChecks: checks, actualHtmlDrag: true, defaultMenuRestricted: true, dataPersistedAcrossReload: true, realUserDataTouched: false, platformActions: false }));
} catch (error) {
  console.error(await evaluate("({route:location.hash,dialog:document.querySelector('[role=dialog]')?.innerText,toasts:[...document.querySelectorAll('[data-sonner-toast]')].map(e=>e.innerText)})"));
  const shot = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync('logs/qa-account-manager-failure.png', Buffer.from(shot.data, 'base64'));
  throw error;
} finally {
  if (statusStorageKey) await evaluate(`(()=>{const key=${JSON.stringify(statusStorageKey)},raw=${JSON.stringify(previousStatusRaw)};if(raw===null)localStorage.removeItem(key);else localStorage.setItem(key,raw);window.dispatchEvent(new StorageEvent('storage',{key}));return true;})()`).catch(() => {});
  if (account && originalGroup) await api('POST', '/api/platform/groups/move-accounts', { accountIds: [account.id], groupId: originalGroup }).catch(() => {});
  if (group) await api('DELETE', '/api/platform/groups/' + group.id).catch(() => {});
  if (defaultGroup) await api('PUT', '/api/platform/groups/' + defaultGroup.id, { color: originalColor }).catch(() => {});
  await evaluate("window.dispatchEvent(new Event('matrix:accounts-updated'));true").catch(() => {});
  socket.close();
}
