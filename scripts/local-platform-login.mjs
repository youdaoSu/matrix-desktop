// User-owned installed profile only. Opens an official login workspace; never
// types credentials, binds an unverified identity, uploads media, or submits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import catalog from '../desktop/account-platforms.json' with { type: 'json' };

const command = process.argv[2] || 'check';
const provider = process.argv[3];
const port = Number(process.argv[4] || 9491);
assert.ok(['check', 'open', 'inspect'].includes(command));
assert.ok(Number.isInteger(port) && port > 1024 && port < 65536);
const entry = catalog.find(item => item.id === provider);
if (command !== 'check') assert.ok(['kuaishou', 'toutiao', 'baijiahao', 'weibo'].includes(provider) && entry?.url);
const targets = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) }).then(r => r.json());
const target = targets.find(item => item.type === 'page' && new URL(item.url).hostname === '127.0.0.1' && new URL(item.url).pathname === '/app/');
assert.ok(target, 'Installed Matrix diagnostic page not available');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data), task = pending.get(message.id);
  if (!task) return;
  pending.delete(message.id); clearTimeout(task.timer);
  message.error ? task.reject(Error(message.error.message)) : task.resolve(message.result);
});
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timed out')); }, 15000);
  pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error('Installed page action did not complete');
  return result.result?.value;
};
const click = async expression => {
  const point = await evaluate(`(()=>{const b=(${expression});if(!b||b.disabled)throw Error('Button unavailable');const r=b.getBoundingClientRect();if(!r.width||!r.height)throw Error('Button hidden');return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
};
const wait = async expression => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  console.error(JSON.stringify(await evaluate("({hash:location.hash,dialogs:[...document.querySelectorAll('[role=dialog]')].map(e=>({shown:!!e.getClientRects().length,title:e.querySelector('h2')?.innerText})),workspaceHidden:document.querySelector('.matrix-additional-workspaces')?.hidden,managerVisible:!!document.querySelector('[data-account-management]')?.getClientRects().length})")));
  throw Error('Installed UI did not become ready');
};
try {
  await call('Page.bringToFront');
  await wait("!!document.querySelector('.matrix-shell')");
  assert.equal(await evaluate("!!(localStorage.getItem('matrix_token') || sessionStorage.getItem('matrix_token'))"), true, 'Please log in to Matrix yourself');
  await evaluate("location.hash='#/accounts';true");
  await wait("!!document.querySelector('[data-account-management]')");
  if (command === 'check') {
    await wait("document.querySelectorAll('[data-manager-account]').length>0&&[...document.querySelectorAll('[data-manager-account] img')].every(i=>i.complete&&i.naturalWidth>0)");
    const state = await evaluate(`(()=>{const user=JSON.parse(localStorage.getItem('matrix_user')||sessionStorage.getItem('matrix_user')||'null');const rows=[...document.querySelectorAll('[data-manager-account]')];const jobs=JSON.parse(localStorage.getItem('matrix-publish-progress:'+user.id)||'[]');return {accountRows:rows.length,avatarImages:rows.filter(r=>r.querySelector('.matrix-account-avatar > img')?.naturalWidth>0).length,bundledLogos:rows.filter(r=>r.querySelector('[data-platform-logo] img')?.naturalWidth>0).length,preservedJobs:jobs.length,jobStatuses:jobs.reduce((out,j)=>{out[j.stage]=(out[j.stage]||0)+1;return out;},{}),groupHeadings:document.querySelectorAll('.matrix-manager-group-heading').length}})()`);
    await evaluate("[...document.querySelectorAll('[data-account-management] button')].find(b=>b.getClientRects().length&&b.innerText.trim()==='添加账号').click();true");
    await wait("document.querySelectorAll('[data-bind-provider]').length===29");
    await wait("[...document.querySelectorAll('.matrix-media-platform-grid img')].every(i=>i.complete&&i.naturalWidth>0)");
    const logoCount = await evaluate("document.querySelectorAll('.matrix-media-platform-grid img').length");
    assert.equal(logoCount, 28);
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    console.log(JSON.stringify({ ...state, directoryEntries: 29, offlineBrandLogos: logoCount, uploadsOrSubmissions: 0 }));
  } else {
    // Reuse this Matrix user's own saved workspace rather than creating another
    // browser partition or importing anyone else's cookie/session.
    const workspace = await evaluate(`(async()=>{const accessToken=localStorage.getItem('matrix_token')||sessionStorage.getItem('matrix_token');const result=await window.matrixDesktop.extraPlatformWorkspaces({command:'list',accessToken});if(result.error)throw Error('Workspace list unavailable');const found=result.items.find(i=>i.provider===${JSON.stringify(provider)});return found?{id:found.id,name:found.name}:null;})()`);
    await evaluate(`window.dispatchEvent(new CustomEvent('matrix:platform-directory',{detail:{provider:${JSON.stringify(provider)}}}));true`);
    await wait("!document.querySelector('.matrix-additional-workspaces')?.hidden");
    if (workspace) {
      await evaluate(`[...document.querySelectorAll('.matrix-additional-workspaces aside button')].find(b=>b.querySelector('strong')?.innerText===${JSON.stringify(workspace.name)}).click();true`);
    } else {
      assert.equal(command, 'open', 'No saved official workspace for this provider');
      await wait(`document.querySelector('.matrix-additional-workspaces h2')?.innerText===${JSON.stringify(entry.label)}&&[...document.querySelectorAll('.matrix-additional-workspaces button')].some(b=>b.innerText.trim()==='保存并在远效内打开'&&!b.disabled)`);
      // Wait for the selected-platform render to commit before invoking its
      // handler; the directory may already have been visible for another item.
      await new Promise(resolve => setTimeout(resolve, 250));
      await click("[...document.querySelectorAll('.matrix-additional-workspaces button')].find(b=>b.innerText.trim()==='保存并在远效内打开')");
    }
    await wait(`(()=>{const v=[...document.querySelectorAll('.matrix-additional-workspaces webview')].find(v=>v.getAttribute('partition')?.startsWith('persist:matrix-extra-${provider}-'));try{return !!v&&v.getURL().startsWith('https://');}catch{return false;}})()`);
    if (command === 'open') {
      console.log(JSON.stringify({ officialLoginWorkspaceOpened: provider, reusedWorkspace: Boolean(workspace), automaticallyBound: false, uploadsOrSubmissions: 0 }));
    } else {
      // Return structural evidence only. No field values, login tokens, QR data,
      // private messages, cookies, query parameters, or whole document text.
      const structure = await evaluate(`(async()=>{const v=[...document.querySelectorAll('.matrix-additional-workspaces webview')].find(v=>v.getAttribute('partition')?.startsWith('persist:matrix-extra-${provider}-'));return await v.executeJavaScript(
        ${JSON.stringify(`(()=>{const visible=e=>!!e.getClientRects().length;return {url:location.origin+location.pathname,title:document.title,inputs:[...document.querySelectorAll('input,textarea,[contenteditable=true]')].map(e=>({type:e.type||e.tagName.toLowerCase(),placeholder:e.getAttribute('placeholder'),accept:e.getAttribute('accept'),maximum:e.getAttribute('maxlength'),visible:visible(e)})).slice(0,50),actions:[...document.querySelectorAll('button,[role=button],nav a')].filter(visible).map(e=>(e.innerText||e.getAttribute('aria-label')||'').trim()).filter(t=>t&&t.length<50).slice(0,100)}})()`)}
      );})()`);
      fs.mkdirSync('logs', { recursive: true });
      fs.writeFileSync(`logs/local-${provider}-page-structure.json`, JSON.stringify(structure, null, 2));
      console.log(JSON.stringify({ provider, ...structure, uploadsOrSubmissions: 0 }));
    }
    await call('Page.bringToFront');
  }
} finally { socket.close(); }
