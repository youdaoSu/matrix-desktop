// Real React feed in a disposable, offline Chromium profile. Never a real DM.
const path = require('node:path');
const root = path.resolve(__dirname, '..');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
async function runLiveInteractionUiTests() {
  const assert = require('node:assert/strict'), React = require('react'), { createRoot } = require('react-dom/client');
  const { loadTs } = require('./qa-load-typescript.cjs'), cache = new Map(), overrides = new Map();
  const stub = (file, exports) => cache.set(path.join(root, file), { exports });
  let owner = 'qa-owner', token = 'qa-token', calls = 0, opened = 0, kind = 'messages', selected = null, checks = 0;
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  const preferences = { retainInteractionSnapshots: true };
  const a = { id: 'qa-a', platform: 'douyin', nickname: 'QA 抖音账号', connectorSessionId: 'qa-session-a', createdAt: '2026-10-19T10:00:00.000Z' };
  const b = { ...a, id: 'qa-b', platform: 'douyin', nickname: 'QA 抖音第二账号', connectorSessionId: 'qa-session-b' };
  const foreign = { ...a, id: 'qa-foreign', platform: 'bilibili', nickname: 'QA 不同平台不可混入', connectorSessionId: 'qa-session-foreign' };
  let accounts = [a, b, foreign], connected = false;
  const page = item => () => ({ accountId: item.id, platform: item.platform, sessionId: item.connectorSessionId, accessToken: token, webContentsId: item.id === a.id ? 20 : 21 });
  const workspace = { jobsLocked: false, interactionPage: id => connected ? page(accounts.find(item => item.id === id)) : undefined, openAccount: async () => { opened++; } };
  stub('client/src/api/index.ts', { getUser: () => ({ id: owner }), getAuthToken: () => token });
  stub('client/src/contexts/AppPreferences.ts', { useAppPreferences: () => preferences });
  stub('client/src/components/workspace/publish-preferences.ts', { loadPublishAccounts: async () => accounts });
  stub('client/src/components/workspace/OfficialWorkspace.tsx', { useOfficialWorkspace: () => workspace, platformLabels: { douyin: '抖音', bilibili: 'B站' } });
  stub('client/src/components/workspace/AccountAvatar.tsx', { AccountAvatar: ({ account }) => React.createElement('span', null, account.nickname) });
  stub('client/src/components/workspace/DouyinMessageSource.tsx', { DouyinMessageSource: () => null });
  stub('client/src/components/workspace/InteractionUi.tsx', { interactionPlatform:value=>['douyin','bilibili'].includes(value)?value:'douyin', InteractionEmpty: ({ children }) => React.createElement('p', null, children), exportInteractionRecords: () => { throw Error('Export requires an explicit user click'); } });
  const data = (input, title = 'QA真实结构样本') => ({ accountId: input.accountId, sessionId: input.sessionId, platform: input.platform, kind: input.kind, source: input.platform === 'douyin' ? 'https://www.douyin.com/qa-list' : 'https://message.bilibili.com/qa-list', capturedAt: new Date().toISOString(), records: [{ platformId: 'qa-record-' + input.accountId, author: title, content: 'QA最近消息预览（隔离样本，不是真实私信）', displayTime:'今天 12:00', unreadState: 'unread', unreadCount: 3 }] });
  let read = async input => data(input);
  window.matrixDesktop = { officialData: async input => { calls++; assert.equal(input.command, 'read-interactions'); return read(input); } };
  const { InteractionLiveFeed } = loadTs('client/src/components/workspace/InteractionLiveFeed.tsx', cache, overrides);
  const component = createRoot(document.getElementById('root'));
  const render = () => component.render(React.createElement(InteractionLiveFeed, { kind, account: selected }));
  const pause = () => new Promise(resolve => setTimeout(resolve, 12));
  const until = async (predicate, label) => { for (let i = 0; i < 200; i++) { if (predicate()) return; await pause(); } throw Error('Live feed timeout: ' + label + '\n' + document.body.innerText); };
  const rowCount = () => document.querySelectorAll('[data-live-record]').length;
  const button = label => [...document.querySelectorAll('button')].find(item => item.textContent === label);
  const refresh = () => window.dispatchEvent(new CustomEvent('matrix:interaction-refresh-request', { detail: { kind } }));
  const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
  render(); await until(() => document.querySelectorAll('[data-live-account]').length === 2, 'accounts');
  await until(() => document.body.textContent.includes('尚未连接本模块'), 'connection status'); eq(calls, 0); eq(opened, 0); eq(rowCount(), 0);
  connected = true; refresh(); await until(() => rowCount() === 2, 'auto feed');
  eq(document.querySelectorAll('[data-live-phase=live]').length, 2); eq(document.body.textContent.includes('平台未读 3'), true); eq(opened, 0); eq(values.size, 2);eq(document.body.textContent.includes('官网时间 今天 12:00'),true);
  // The primary feed is populated, with no manual-snapshot button click.
  read = async input => input.accountId === b.id ? { error: 'QA登录失效；保留上次结果' } : data(input, 'QA新评论者');
  refresh(); await until(() => document.querySelector('[data-live-phase=error]') && document.body.textContent.includes('QA新评论者'), 'partial failure');
  eq(rowCount(), 2); eq(document.body.textContent.includes('QA登录失效'), true); eq(document.body.textContent.includes('平台未读 3'), true);
  selected = a; render(); await until(() => rowCount() === 1, 'account display filter'); eq(document.querySelectorAll('[data-live-account]').length, 2); eq(rowCount(), 1);
  selected = null; render(); await until(() => rowCount() === 2, 'restore filter');
  workspace.jobsLocked = true; render(); await pause(); const before = calls; refresh(); await pause(); eq(calls, before); eq(button('立即刷新官方数据').disabled, true);
  workspace.jobsLocked = false; render(); await pause();
  let release; read = input => input.accountId === a.id ? new Promise(resolve => release = () => resolve(data(input, 'QA已清除的迟到数据'))) : Promise.resolve({ error: 'QA B暂不可用' });
  refresh(); await until(() => release, 'held read');
  values.clear(); window.dispatchEvent(new Event('matrix:interaction-snapshots-cleared')); await until(() => rowCount() === 0, 'clear'); release(); await pause();
  eq(rowCount(), 0); eq(values.size, 0); eq(document.querySelector('input[type=checkbox]').checked, false);
  read = async input => data(input); button('立即刷新官方数据').click(); await until(() => rowCount() === 2, 'resume');
  eq(opened, 0); eq(document.body.textContent.includes('平台未读 3'), true);
  // Cache survives remount, but neither another owner nor a rebound session.
  component.render(null); await pause(); connected = false; render(); await until(() => rowCount() === 2, 'saved snapshot restored'); eq(opened, 0);
  accounts = [a, { ...b, connectorSessionId: 'qa-rebound' }]; window.dispatchEvent(new Event('matrix:accounts-updated')); await until(() => rowCount() === 1, 'rebind excludes old cache'); checks++;
  owner = 'qa-other-owner'; token = 'qa-other-token'; render(); await until(() => rowCount() === 0, 'owner isolation'); eq(values.size, 2);
  connected = true; read = async input => data(input); refresh(); await until(() => rowCount() === 2, 'second owner new read');
  preferences.retainInteractionSnapshots = false; render(); await until(() => rowCount() === 0, 'privacy off'); eq(document.querySelector('input[type=checkbox]').checked, false); eq(values.size, 4);
  button('立即刷新官方数据').click(); await until(() => rowCount() === 2, 'temporary data'); eq(values.size, 4);
  // Final representative display includes a truthful partial error, not fake 0.
  read = async input => input.accountId === b.id ? { error: 'QA此账号官方列表暂不可用；旧结果保留，稍后自动重试' } : data(input);
  refresh(); await until(() => document.querySelector('[data-live-phase=error]'), 'final display');
  eq(opened, 0);
  // Platform collection is independent of the avatar display filter.
  preferences.retainInteractionSnapshots = true; accounts=[a,{...b,platform:'douyin',nickname:'QA 抖音第二账号'}];
  window.dispatchEvent(new Event('matrix:accounts-updated')); selected=a;
  component.render(React.createElement(InteractionLiveFeed,{kind:'messages',platform:'douyin',account:selected,syncPlatform:true}));
  await until(()=>document.querySelectorAll('[data-live-account]').length===2,'same-platform targets');
  const requested=[];read=async input=>{requested.push(input.accountId);return data({...input,platform:'douyin'});};refresh();
  await until(()=>requested.length===2&&document.querySelectorAll('[data-live-phase=live]').length===2,'same-platform collection');
  eq(rowCount(),1);eq(requested.sort(),[a.id,b.id]);
  component.render(React.createElement(InteractionLiveFeed,{kind:'messages',platform:'bilibili',account:selected,syncPlatform:true}));
  await until(()=>document.querySelectorAll('[data-live-account]').length===0,'foreign platform excluded');eq(rowCount(),0);
  component.render(null);await pause();
  const sourceChecks = await require('./qa-douyin-message-source-ui.cjs').runSourceUiTests(document.getElementById('root'));
  const platformChecks = await require('./qa-message-platform-ui.cjs').runMessagePlatformUiTests(document.getElementById('root'));
  const persistenceChecks = await require('./qa-workspace-ui-state.cjs').runWorkspaceUiStateTests(document.getElementById('root'));
  const bilibiliChecks = await require('./qa-bilibili-interactions-ui.cjs').runBilibiliInteractionUiTests(document.getElementById('root'));
  selected=null;render();await until(()=>rowCount()===2,'final live display');
  window.qaLiveCleanup = () => component.unmount();
  return { liveInteractionReactChecks: checks, ...sourceChecks, ...platformChecks, ...persistenceChecks, ...bilibiliChecks, primaryFeedAutoPopulated: true, sourceAndAccountShown: true, localCacheOwnerSessionScoped: true, failureDoesNotEraseEarlierData: true, clearCancelsLateRead: true, publishingPaused: true, platformConversationOpened: false, realPlatformUnreadVerified: false };
}
if (process.type === 'renderer') module.exports = { runLiveInteractionUiTests };
else if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process'), env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(path.join(root, '.desktop-deps/node_modules/electron/dist/electron.exe'), [__filename], { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 40000, env });
  process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || ''); process.exit(result.status ?? 1);
} else {
  const { app, BrowserWindow } = require('electron'), fs = require('node:fs'), os = require('node:os');
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-live-interaction-qa-'))); app.commandLine.appendSwitch('mute-audio');
  app.whenReady().then(async () => {
    let win; const timer = setTimeout(() => app.exit(1), 35000);
    try {
      win = new BrowserWindow({ show: false, width: 1200, height: 950, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false } }); win.webContents.setAudioMuted(true);
      win.webContents.session.webRequest.onBeforeRequest((request, callback) => callback({ cancel: !request.url.startsWith('data:') }));
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<meta charset=utf-8><div id=root></div>'));
      const css = fs.readFileSync(path.join(root, 'client/src/workspace.css'), 'utf8'); await win.webContents.insertCSS(css);
      console.log(JSON.stringify(await win.webContents.executeJavaScript(`require(${JSON.stringify(__filename)}).runLiveInteractionUiTests()`)));
      await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
      fs.writeFileSync(path.join(root, 'logs/qa-interaction-live-feed.png'), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript('window.qaLiveCleanup()');
    } catch (error) { console.error(error); process.exitCode = 1; }
    finally { clearTimeout(timer); win?.destroy(); app.exit(process.exitCode || 0); }
  });
}
