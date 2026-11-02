// UI-only checks against disposable source/packaged QA profiles. Never operates real accounts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const port = process.argv[2] || '9391';
if (!['9391', '9392'].includes(port)) throw Error('Logo offline QA requires a disposable profile');
const target = (await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json())).find(t => t.type === 'page' && t.url.includes('/app/'));
assert.ok(target, 'Disposable Matrix view missing');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let seq = 0, checks = 0; const pending = new Map();
socket.addEventListener('message', event => { const result = JSON.parse(event.data), item = pending.get(result.id); if (item) { clearTimeout(item.timer); pending.delete(result.id); result.error ? item.reject(Error(result.error.message)) : item.resolve(result.result); } });
const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timeout')); }, 20000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => { const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw Error('Logo UI evaluation failed'); return result.result.value; };
async function wait(expression) { for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 150)); } throw Error('Logo surface not ready'); }
const core = ['bilibili', 'douyin', 'wechat', 'xiaohongshu'];
async function verify(selector, allPlatforms = true) {
  const data = await evaluate(`(()=>{const roots=[...document.querySelectorAll(${JSON.stringify(selector)})];return roots.map(root=>{const image=root.querySelector('img'),rect=root.getBoundingClientRect();return{platform:root.dataset.platformLogo,loaded:!!image&&image.complete&&image.naturalWidth>0,bundled:!!image&&/^data:image\\/(?:png|x-icon);base64,/.test(image.src),width:rect.width,height:rect.height,unrelatedSvg:!!root.querySelector('svg')};});})()`);
  if (allPlatforms) { assert.deepEqual([...new Set(data.map(i => i.platform))].sort(), core); checks++; }
  assert.ok(data.every(i => i.loaded && i.bundled && !i.unrelatedSvg && i.width > 0 && i.height > 0)); checks++;
  return data;
}
try {
  await call('Page.navigate', { url: new URL(target.url).origin + '/app/#/dashboard' });
  await wait("document.querySelectorAll('.matrix-home-platforms [data-platform-logo] img').length===4&&[...document.querySelectorAll('.matrix-home-platforms [data-platform-logo] img')].every(i=>i.complete&&i.naturalWidth>0)");
  await verify('.matrix-home-platforms [data-platform-logo]');
  await call('Network.enable');
  await call('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  assert.equal(await evaluate("(async()=>{const sources=[...document.querySelectorAll('.matrix-home-platforms [data-platform-logo] img')].map(i=>i.src);return(await Promise.all(sources.map(async src=>{const image=new Image();image.src=src;await image.decode();return image.naturalWidth>0;}))).every(Boolean);})()"), true); checks++;
  await call('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await evaluate("location.hash='#/accounts';true"); await wait("!!document.querySelector('[data-account-management]')");
  await evaluate("[...document.querySelectorAll('[data-account-management] button')].find(b=>b.innerText==='添加账号').click();true");
  await wait("document.querySelectorAll('.matrix-media-platform-grid [data-platform-logo] img').length===28&&[...document.querySelectorAll('.matrix-media-platform-grid [data-platform-logo] img')].every(i=>i.complete&&i.naturalWidth>0)");
  assert.equal(await evaluate("document.querySelectorAll('[data-bind-provider]').length"), 29); checks++;
  const allLogoInfo = await evaluate("[...document.querySelectorAll('.matrix-media-platform-grid [data-platform-logo] img')].map(i=>({loaded:i.complete&&i.naturalWidth>0,bundled:i.src.startsWith('data:image/')}))");
  assert.ok(allLogoInfo.every(i=>i.loaded&&i.bundled)); checks++;
  await call('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  assert.equal(await evaluate("(async()=>{const sources=[...document.querySelectorAll('.matrix-media-platform-grid [data-platform-logo] img')].map(i=>i.src);return(await Promise.all(sources.map(async src=>{const image=new Image();image.src=src;await image.decode();return image.naturalWidth>0;}))).every(Boolean);})()"), true); checks++;
  await call('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await new Promise(resolve => setTimeout(resolve, 500)); // Finish the dialog's visual entrance before capturing.
  const shot = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`logs/qa-platform-logos-${port}.png`, Buffer.from(shot.data, 'base64'));
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await wait("!document.querySelector('[role=dialog]')");
  const badges = await verify('.matrix-account-platform-badge [data-platform-logo]', false);
  if (badges.length) { assert.equal(await evaluate("[...document.querySelectorAll('.matrix-account-platform-badge')].every(b=>{const logo=b.querySelector('[data-platform-logo]'),r=b.getBoundingClientRect(),l=logo?.getBoundingClientRect();return l&&l.width<=r.width&&l.height<=r.height})"), true); checks++; }
  await evaluate("location.hash='#/publish/create';true"); await wait("!!document.querySelector('.matrix-publish-editor')");
  await evaluate("[...document.querySelectorAll('.matrix-page-content button')].find(b=>b.innerText==='选择账号').click();true");
  await wait("!!document.querySelector('.matrix-publish-picker')");
  const picker = await verify('.matrix-publish-picker [data-platform-logo]', false);
  if (badges.length) { assert.ok(picker.length >= badges.length); checks++; }
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await wait("!document.querySelector('[role=dialog]')");
  console.log(JSON.stringify({ platformLogoUiChecks: checks, providerCards: 29, officialBrandLogos: 28, customProviderHasNoFixedBrand: true, logosDecodeOffline: true, accountAvatarBadges: badges.length, networkCredentialsUsed: false, platformActions: false }));
} catch (error) {
  const state = await evaluate("[...document.querySelectorAll('.matrix-media-platform-grid [data-platform-logo]')].map(root=>({platform:root.dataset.platformLogo,imagePresent:!!root.querySelector('img'),loaded:!!root.querySelector('img')?.naturalWidth}))").catch(() => []);
  console.error(JSON.stringify({ failedLogoSurface: state }));
  const shot = await call('Page.captureScreenshot', { format: 'png' }).catch(() => undefined); if (shot) fs.writeFileSync(`logs/qa-platform-logos-${port}-failure.png`, Buffer.from(shot.data, 'base64'));
  throw error;
} finally {
  await call('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }).catch(() => {}); socket.close();
}
