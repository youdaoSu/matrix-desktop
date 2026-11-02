// UI-only in packaged/installed profiles; synthetic official documents only in disposable source QA.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const port = process.argv[2] || '9392', requestedBase = process.argv[3];
const targets = () => fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
const target = (await targets()).find(t => t.type === 'page' && t.url.includes('/app/'));
if (!target) throw Error('Matrix diagnostic target missing');
const base = new URL(target.url).origin;
if (requestedBase && requestedBase !== base) throw Error('QA target does not match requested app');
const synthetic = base === 'http://127.0.0.1:3291';
const sockets = [], fixtureErrors = []; let checks = 0;
async function connect(url, fixture = false) {
  const socket = new WebSocket(url); sockets.push(socket);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(Error(method + ' timeout')); }, 20000);
    pending.set(key, { resolve, reject, timer }); socket.send(JSON.stringify({ id: key, method, params }));
  });
  socket.addEventListener('message', event => {
    const m = JSON.parse(event.data), p = pending.get(m.id);
    if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); }
    if (fixture && m.method === 'Fetch.requestPaused') void call('Fetch.fulfillRequest', {
      requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
      body: Buffer.from('<title>QA module-only fixture</title><input id="unsaved" value="initial"><main>Disposable module isolation test, not a real platform login</main>').toString('base64'),
    }).catch(error => { if (!error.message.includes('Invalid InterceptionId')) fixtureErrors.push(error.message); });
  });
  return { call, evaluate: async expression => {
    const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).split('\n')[0]); return r.result?.value;
  } };
}
async function wait(fn, label) { for (let i = 0; i < 150; i++) { if (await fn()) return; await new Promise(r => setTimeout(r, 150)); } throw Error(label); }
function check(value, label) { assert.ok(value, label); checks++; }
try {
  const main = await connect(target.webSocketDebuggerUrl);
  await main.evaluate('window.qaModuleReloadPending=true;true');
  await main.call('Page.navigate', { url: base + '/app/#/dashboard' });
  // A same-document navigation ACK may precede the hash commit. Reload only
  // after reaching the requested route, never the previous accounts document.
  await wait(() => main.evaluate("location.hash==='#/dashboard'&&!!document.querySelector('.matrix-dashboard')"), 'Dashboard navigation did not commit before reload');
  await main.call('Page.reload', { ignoreCache: true });
  await wait(() => main.evaluate("!window.qaModuleReloadPending&&!!document.querySelector('.matrix-dashboard')"), 'Fresh dashboard not ready');
  await main.evaluate(`window.qaWorkspace=()=>{const e=document.querySelector('.matrix-shell')||document.querySelector('main');let f=e?.[Object.keys(e).find(k=>k.startsWith('__reactFiber'))];while(f){const w=f.memoizedProps?.value;if(w?.openAccount&&w?.tabs)return w;f=f.return;}throw Error('Workspace context missing');};true`);
  check(await main.evaluate("document.querySelectorAll('.matrix-home-platforms > a[href=\"#/accounts\"]').length===4"), 'Home platform tiles only navigate to account management');
  check(await main.evaluate("!document.querySelector('.matrix-dashboard').innerText.includes('打开账号操作面板')"), 'No direct browser opener on home');
  check(await main.evaluate("[...document.querySelectorAll('.matrix-workflow-cards > a')].map(a=>a.hash).join(',')==='#/accounts,#/publish/create,#/engage/comments'"), 'Workflow tiles navigate to three feature modules');
  await main.evaluate("qaWorkspace().show('manage');qaWorkspace().bindAccount('douyin');true");
  check(await main.evaluate("qaWorkspace().tabs.length===0&&!qaWorkspace().visible"), 'Provider blocks browser/binding from home');
  const navigate = async route => {
    await main.evaluate(`location.hash=${JSON.stringify('#' + route)};true`);
    const expectedScope = route === '/accounts' || /^\/(publish|engage|automation|analytics)(\/|$)/.test(route) ? route : null;
    await wait(() => main.evaluate(`location.hash===${JSON.stringify('#' + route)}&&!!document.querySelector('.matrix-shell,main')&&qaWorkspace().scope===${JSON.stringify(expectedScope)}`), 'Route change missing: ' + route);
  };
  for (const route of ['/engage/comments', '/engage/messages', '/publish/create', '/docs/overview', '/settings/general']) {
    await navigate(route);
    await main.evaluate("qaWorkspace().bindAccount('douyin');window.dispatchEvent(new Event('matrix:platform-directory'));true");
    check(await main.evaluate("qaWorkspace().tabs.length===0&&document.querySelector('.matrix-additional-workspaces').hidden"), 'Binding/directory blocked outside account management: ' + route);
  }
  await navigate('/accounts');
  await wait(() => main.evaluate("!!document.querySelector('[data-account-management]')"), 'Account list missing');
  check(await main.evaluate("!document.querySelector('.matrix-official-deck').hidden&&!document.querySelector('.matrix-page-content table')"), 'Account management is a single grouped official workspace, not a duplicate list');
  await main.evaluate("window.dispatchEvent(new Event('matrix:platform-directory'));true");
  await wait(() => main.evaluate("!document.querySelector('.matrix-additional-workspaces').hidden"), 'Account directory not available'); checks++;
  await navigate('/dashboard');
  // Route context commits before this sibling's closing effect. Wait for the
  // actual hidden state, not just the hash/scope, then keep the same assertion.
  await wait(() => main.evaluate("document.querySelector('.matrix-additional-workspaces').hidden"), 'Account directory did not close after navigation');
  check(await main.evaluate("document.querySelector('.matrix-additional-workspaces').hidden"), 'Directory hides when leaving account management');
  await navigate('/accounts');
  check(await main.evaluate("document.querySelector('.matrix-additional-workspaces').hidden"), 'Directory does not automatically reopen on return');

  if (synthetic) {
    await main.evaluate("qaWorkspace().refreshAccounts();true");
    await wait(() => main.evaluate("qaWorkspace().accounts.some(a=>a.nickname==='QA douyin')"), 'Disposable bound account missing');
    await main.evaluate("window.qaModuleAccount=qaWorkspace().accounts.find(a=>a.nickname==='QA douyin');true");
    const open = async (route, intent, text) => {
      await navigate(route); const before = new Set((await targets()).map(t => t.id));
      check(await main.evaluate(`qaWorkspace().openAccount(qaModuleAccount,${JSON.stringify(intent)},false,${JSON.stringify(text)})`), 'Open owned account for ' + intent);
      let guest;
      await wait(async () => { guest = (await targets()).find(t => t.type === 'webview' && !before.has(t.id)); return !!guest; }, 'Module guest missing');
      const view = await connect(guest.webSocketDebuggerUrl, true);
      await view.call('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
      await view.call('Page.navigate', { url: 'https://creator.douyin.com/qa-module-' + intent });
      await wait(() => view.evaluate("!!document.querySelector('#unsaved')"), 'Disposable document missing');
      await view.evaluate(`document.querySelector('#unsaved').value=${JSON.stringify(text)};true`);
      return { guest, view, rootId: await main.evaluate("qaWorkspace().activeId") };
    };
    const comment = await open('/engage/comments', 'comments', 'comment state preserved');
    await navigate('/engage/messages');
    check(await main.evaluate("!qaWorkspace().visible&&!qaWorkspace().page(qaModuleAccount.id)"), 'Messages cannot use or display the comment page');
    const message = await open('/engage/messages', 'messages', 'message state preserved');
    check(comment.rootId !== message.rootId, 'Same account gets independent module page roots');
    check(await main.evaluate("document.querySelectorAll('.matrix-workspace-tabs [role=tab]').length===1"), 'Only current module tabs shown');
    check(await main.evaluate("[...document.querySelectorAll('.matrix-official-deck button')].filter(b=>b.getClientRects().length).every(b=>!b.innerText.includes('添加账号'))"), 'No bind controls in interaction browser');
    check(await main.evaluate("!document.querySelector('.matrix-official-browser:not([hidden]) .matrix-personal-upload')&&document.querySelectorAll('.matrix-official-browser:not([hidden]) .matrix-intent-bar button').length===0"), 'Interaction helper has no publishing or cross-module toolbar');
    await navigate('/dashboard');
    check(await main.evaluate("!qaWorkspace().visible&&document.querySelectorAll('.matrix-official-browser:not([hidden])').length===0"), 'Home hides all module browsers');
    check(await main.evaluate("(async()=>{const before=qaWorkspace().tabs.length;const opened=await qaWorkspace().openAccount(qaModuleAccount,'manage');return !opened&&qaWorkspace().tabs.length===before&&!qaWorkspace().visible;})()"), 'Home cannot open even an already bound account');
    check((await targets()).some(t => t.id === comment.guest.id) && (await targets()).some(t => t.id === message.guest.id), 'Switching modules preserves both native guests');
    await navigate('/engage/comments');
    check(await main.evaluate(`qaWorkspace().activeId===${JSON.stringify(comment.rootId)}&&qaWorkspace().visible`), 'Comment selection restored independently');
    check(await comment.view.evaluate("document.querySelector('#unsaved').value==='comment state preserved'"), 'Unsaved official comment form survives module switch');
    check(await main.evaluate("document.querySelector('.matrix-official-browser:not([hidden]) [aria-label=文案辅助内容]').value==='comment state preserved'"), 'Comment helper draft survives module switch');
    await main.evaluate("qaWorkspace().close(qaWorkspace().activeId);true");
    check((await targets()).some(t => t.id === message.guest.id), 'Closing comments leaves private messages intact');
    await navigate('/engage/messages');
    check(await message.view.evaluate("document.querySelector('#unsaved').value==='message state preserved'"), 'Private message form still intact');
    await main.evaluate("qaWorkspace().close(qaWorkspace().activeId);qaWorkspace().hide();true");
    // The real native guest is unlogged in and uses only the disposable QA
    // account/profile. Test the React preview/lock contract, not platform login.
    await navigate('/publish/tasks');
    await main.evaluate("window.qaNativeAccount=qaWorkspace().accounts.find(a=>a.nickname==='QA wechat');true");
    check(await main.evaluate("!!qaNativeAccount"), 'Disposable Wechat account exists');
    check(await main.evaluate("qaWorkspace().openAccount(qaNativeAccount,'publish',false,undefined,undefined,true)"), 'Native background editor can be prepared');
    await wait(()=>main.evaluate("!!document.querySelector('[data-edge-publish-job]')?.getAttribute('data-edge-publish-job')"),'Native background guest not initialized');
    const nativeGuest = await main.evaluate("document.querySelector('[data-edge-publish-job]').getAttribute('data-edge-publish-job')");
    check(await main.evaluate("document.querySelector('[data-edge-publish-job]').hidden"),'Unselected native publisher remains hidden');
    await main.evaluate("window.qaNativeTab=qaWorkspace().tabs.find(t=>t.background&&t.accountId===qaNativeAccount.id).id;qaWorkspace().select(qaNativeTab);true");
    await wait(()=>main.evaluate("!document.querySelector('[data-edge-publish-job]').hidden"),'Selected idle native task page stayed hidden'); checks++;
    check(await main.evaluate("(()=>{const r=document.querySelector('[data-edge-publish-job] .matrix-edge-host').getBoundingClientRect();return r.width>500&&r.height>300&&r.left>=0})()"),'Native task preview has a usable host rectangle');
    await main.evaluate("qaWorkspace().lockJobs(true);true");
    await wait(()=>main.evaluate("document.querySelector('[data-edge-publish-job]').hidden"),'Active native task must not expose editable controls'); checks++;
    await main.evaluate("qaWorkspace().lockJobs(false);true");
    await wait(()=>main.evaluate("!document.querySelector('[data-edge-publish-job]').hidden"),'Idle native preview was not restored'); checks++;
    await navigate('/dashboard');
    check(await main.evaluate("document.querySelector('[data-edge-publish-job]').hidden"),'Leaving tasks hides the native preview');
    check(await main.evaluate(`document.querySelector('[data-edge-publish-job]').getAttribute('data-edge-publish-job')===${JSON.stringify(nativeGuest)}`),'Preview changes do not replace the native session');
    await navigate('/publish/tasks');
    await main.evaluate("qaWorkspace().close(qaNativeTab);qaWorkspace().hide();true");
    await wait(()=>main.evaluate("!document.querySelector('[data-edge-publish-job]')"),'Disposable native guest was not closed'); checks++;
  }
  await navigate('/dashboard');
  await wait(() => main.evaluate("!!document.querySelector('.matrix-dashboard')&&![...document.querySelectorAll('.matrix-dashboard-heading button')].some(b=>b.innerText.includes('刷新')&&b.disabled)"), 'Dashboard overview not loaded');
  const image = await main.call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`logs/qa-module-dashboard-${synthetic ? 'source' : 'installed'}.png`, Buffer.from(image.data, 'base64'));
  assert.deepEqual(fixtureErrors, []);
  console.log(JSON.stringify({ moduleBoundaryChecks: checks, syntheticOfficialDocuments: synthetic, externalSubmissions: false, accountDataChanged: false }));
} catch (error) {
  const view = await connect(target.webSocketDebuggerUrl);
  console.error(await view.evaluate("({route:location.hash,ready:document.readyState,hasShell:!!document.querySelector('.matrix-shell'),hasDashboard:!!document.querySelector('.matrix-dashboard'),reloadPending:!!window.qaModuleReloadPending,hasToken:!!(localStorage.getItem('matrix_token')||sessionStorage.getItem('matrix_token'))})"));
  const shot = await view.call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync('logs/qa-module-boundaries-failure.png', Buffer.from(shot.data, 'base64'));
  throw error;
} finally { for (const socket of sockets) socket.close(); }
