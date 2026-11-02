// Actual provider and navigation controls, disposable offline renderer only.
const path = require('node:path'), root = path.resolve(__dirname, '..');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
async function run() {
  const assert = require('node:assert/strict'), React = require('react'), { createRoot } = require('react-dom/client');
  const { loadTs } = require('./qa-load-typescript.cjs'), cache = new Map(), overrides = new Map();
  let checks = 0, scope = '/accounts', workspace,owner='fixture-owner',prepareOverride,showDeck=false,failPage=0,holdAccounts; const preparations = [],navigations=[],accountPages=[];
  const fixtureAccounts=['douyin','xiaohongshu','bilibili','wechat'].map(platform=>({id:platform,platform,nickname:'QA '+platform,connectorSessionId:'fixture-session-'+platform,nativeAccountKey:'verified-'+platform}));fixtureAccounts.push(...['b','c','d'].map(id=>({id,platform:'douyin',nickname:'QA '+id,connectorSessionId:'fixture-session-'+id,nativeAccountKey:'verified-'+id})));
  const eq = (a, b) => { assert.deepEqual(a, b); checks++; };
  const stub = (file, value) => cache.set(path.join(root, file), { exports: value });
  stub('client/src/api/index.ts', { getAuthToken: () => 'fixture-token', getUser: () => ({ id: owner }), axiosForBackend: { get: async (_url,options) => { const page=options?.params?.page||1,source=owner==='other-owner'?[{id:'foreign',platform:'douyin',nickname:'other owner'}]:fixtureAccounts,items=source.slice((page-1)*100,page*100),total=source.length;accountPages.push(page);if(failPage===page)throw Error('fixture pagination error');if(holdAccounts)await holdAccounts;return { data: { data: { items, total } } }; } } });
  overrides.set('react-router-dom', { useLocation: () => ({ pathname: scope }), useNavigate: () => value=>{scope=value;navigations.push(value);}, Link: ({ children }) => React.createElement('span', null, children) });
  overrides.set('sonner', { toast: { info() {}, error() {}, success() {} } });
  const pass = ({ children }) => children;
  for (const [file, value] of [
    ['DouyinCommentMonitor', { DouyinCommentMonitorProvider: pass }], ['DouyinInbox', { DouyinInboxProvider: pass }],
    ['EdgeOfficialBrowser', { EdgeOfficialBrowser: () => null }], ['AdditionalPlatformWorkspaces', { AdditionalPlatformWorkspaces: () => null }],
    ['AccountManagerSidebar', { AccountManagerSidebar: () => null }], ['StartupInitialization', { StartupInitialization: () => null }],
    ['PageActionPanel', { PageActionPanel: () => null }], ['AccountAvatar', { AccountAvatar: () => null }], ['PlatformLogo', { PlatformLogo: () => null }],
    ['account-observations', { useAccountAvailabilityCounts: () => ({}), recordAccountObservation() {}, recordLoginObservation() {} }],
    ['use-account-inspection', { useAccountInspection() {} }],
  ]) stub('client/src/components/workspace/' + file + (file.includes('account-observations') || file.includes('inspection') ? '.ts' : '.tsx'), value);
  window.matrixDesktop = { isDesktop: true, preparePlatformLogin: async (platform, sessionId) => {
    preparations.push({ platform, sessionId }); if(prepareOverride)return prepareOverride(platform,sessionId);return { platform, sessionId, partition: 'persist:' + sessionId, url: sites.accountSites[platform].manage, ...(platform === 'wechat' ? { engine: 'webview2' } : {}) };
  } };
  const sites = loadTs('shared/account-sites.ts', cache), controls = loadTs('client/src/components/workspace/AccountSiteNavigation.tsx', cache);
  const actual = loadTs('client/src/components/workspace/OfficialWorkspace.tsx', cache, overrides);
  const component = createRoot(document.getElementById('root'));
  function Probe() { workspace = actual.useOfficialWorkspace(); const active = workspace.tabs.find(t => t.id === workspace.activeId); return showDeck?React.createElement(actual.OfficialWorkspaceDeck):active ? React.createElement(controls.AccountSiteNavigation, { platform: active.platform, url: active.initialUrl || active.url, nickname: active.nickname, open: site => workspace.openAccountSite(active.id, site) }) : null; }
  const render = () => component.render(React.createElement(actual.OfficialWorkspaceProvider, null, React.createElement(Probe)));
  const settle = () => new Promise(resolve => setTimeout(resolve, 25));
  try {
    render(); await settle();
    for (const platform of ['douyin', 'xiaohongshu', 'bilibili', 'wechat']) {
      const sessionId = 'fixture-session-' + platform, account = { id: platform, platform, nickname: 'QA ' + platform, connectorSessionId: sessionId };
      eq(await workspace.openAccount(account), true); await settle();
      const rootTab = workspace.tabs.find(t => t.accountId === platform && !t.parentId), before = workspace.tabs.length;
      document.querySelector('[aria-label="账号前后台切换"] button:last-child').click(); await settle();
      const front = workspace.tabs.find(t => t.id === workspace.activeId);
      eq(front.initialUrl, sites.accountSites[platform].front); eq(front.parentId, rootTab.id); eq(front.sessionId, sessionId); eq(front.partition, rootTab.partition); eq(front.scope, '/accounts');
      eq(workspace.tabs.length, before + 1); eq(workspace.tabs.find(t => t.id === rootTab.id).initialUrl, rootTab.initialUrl);
      document.querySelector('[aria-label="账号前后台切换"] button:last-child').click(); await settle(); eq(workspace.tabs.length, before + 1);
      document.querySelector('[aria-label="账号前后台切换"] button:first-child').click(); await settle(); eq(workspace.activeId, rootTab.id);
      workspace.openAccountSite(rootTab.id, 'front'); await settle(); eq(workspace.activeId, front.id);
      eq(sites.accountSiteForUrl(platform, front.initialUrl), 'front'); eq(sites.accountSiteForUrl(platform, rootTab.url), 'manage');
      eq(preparations.filter(p => p.platform === platform).length, 1);
    }
    const before = workspace.tabs.length, accountRoot = workspace.tabs.find(t => !t.parentId);
    scope = '/engage/comments'; render(); await settle(); workspace.openAccountSite(accountRoot.id, 'front'); await settle(); eq(workspace.tabs.length, before); eq(workspace.scope, scope);
    for (const invalid of ['http://www.douyin.com/', 'https://creator.douyin.com.evil.test/', 'https://u:p@www.douyin.com/', 'https://www.douyin.com:444/', 'garbage']) eq(sites.accountSiteForUrl('douyin', invalid), undefined);
    const douyinRoot=workspace.tabs.find(t=>t.accountId==='douyin'&&!t.parentId),oldRootUrl=douyinRoot.initialUrl,profile='https://www.douyin.com/user/MS4wQaFollower';workspace.update(douyinRoot.id,{draftText:'QA unsaved official form'});await settle();
    scope='/engage/followers';render();await settle();const prepareBefore=preparations.length;eq(await workspace.openDouyinProfile('douyin',profile),true);await settle();const opened=workspace.tabs.find(t=>t.initialUrl===profile);eq(opened.accountId,'douyin');eq(opened.partition,douyinRoot.partition);eq(opened.sessionId,douyinRoot.sessionId);eq(opened.scope,'/accounts');eq(scope,'/accounts');eq(workspace.tabs.find(t=>t.id===douyinRoot.id).initialUrl,oldRootUrl);eq(workspace.tabs.find(t=>t.id===douyinRoot.id).draftText,'QA unsaved official form');eq(preparations.length,prepareBefore);
    const profileCount=workspace.tabs.length;eq(await workspace.openDouyinProfile('douyin',profile),true);await settle();eq(workspace.tabs.length,profileCount);eq(workspace.activeId,opened.id);
    eq(await workspace.openDouyinProfile('b',profile),true);await settle();const other=workspace.tabs.find(t=>t.accountId==='b'&&t.initialUrl===profile);eq(other.sessionId,'fixture-session-b');eq(other.partition,'persist:fixture-session-b');eq(other.partition===opened.partition,false);
    const safeCount=workspace.tabs.length;for(const url of ['https://evil.test/user/MS4wQa','https://u:p@www.douyin.com/user/MS4wQa','https://www.douyin.com/user/MS4wQa?token=secret','https://www.douyin.com/video/123','javascript:alert(1)'])eq(await workspace.openDouyinProfile('douyin',url),false);eq(await workspace.openDouyinProfile('unknown',profile),false);eq(workspace.tabs.length,safeCount);
    let release;prepareOverride=(platform,sessionId)=>new Promise(resolve=>release=()=>resolve({platform,sessionId,partition:'persist:'+sessionId,url:sites.accountSites[platform].manage}));const late=workspace.openDouyinProfile('c',profile);await settle();owner='different-owner';release();eq(await late,false);await settle();eq(workspace.tabs.length,safeCount);owner='fixture-owner';
    prepareOverride=(platform,sessionId)=>Promise.resolve({platform,sessionId:'different-session',partition:'persist:different-session',url:sites.accountSites[platform].manage});eq(await workspace.openDouyinProfile('d',profile),false);await settle();eq(workspace.tabs.length,safeCount);prepareOverride=undefined;
    eq(navigations.every(value=>value==='/accounts'),true);
    // The actual account browser button submits only a native guest reference,
    // never a caller URL/UID, and never runs automatically on page entry.
    scope='/accounts';render();await settle();workspace.select(workspace.tabs.find(t=>t.accountId==='douyin'&&t.initialUrl===sites.accountSites.douyin.front).id);showDeck=true;render();await settle();
    const guest=[...document.querySelectorAll('webview')].find(v=>v.getAttribute('src')===sites.accountSites.douyin.front);assert(guest,'Expected the synthetic Douyin front guest');
    let ownUrl='https://www.douyin.com/jingxuan';guest.getWebContentsId=()=>7;guest.getURL=()=>ownUrl;guest.canGoBack=()=>false;guest.canGoForward=()=>false;
    const button=()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='同步已打开粉丝面板');
    for(let n=0;n<40&&(!button()||button().disabled);n++){guest.dispatchEvent(new Event('dom-ready'));guest.dispatchEvent(new Event('did-stop-loading'));await settle();}
    assert(button(),'Expected the capture button on the active own-profile guest');eq(button().disabled,false);
    let captureCalls=[],releaseCapture;const imported=[];const importedListener=e=>imported.push(e.detail);window.addEventListener('matrix:followers-cache-updated',importedListener);
    window.matrixDesktop.readOpenDouyinFollowers=input=>{captureCalls.push(input);return new Promise(resolve=>{releaseCapture=()=>resolve({accountId:'douyin',sessionId:'fixture-session-douyin',loaded:6,avatars:5,complete:false});});};
    eq(captureCalls.length,0);button().click();await settle();eq(captureCalls,[{accessToken:'fixture-token',accountId:'douyin',webContentsId:7}]);eq([...document.querySelectorAll('button')].some(b=>b.textContent.includes('正在同步已加载成员')&&b.disabled),true);
    releaseCapture();await settle();eq(document.body.textContent.includes('已合并 6 位已加载成员，其中 5 位有头像地址；尚非全量'),true);eq(imported,[{owner:'fixture-owner',accountId:'douyin',sessionId:'fixture-session-douyin',nativeAccountKey:'verified-douyin'}]);
    button().click();await settle();owner='changed-owner';releaseCapture();await settle();eq(imported.length,1);owner='fixture-owner';
    window.removeEventListener('matrix:followers-cache-updated',importedListener);
    const syncCalls=[];let phase=0;const syncButton=label=>[...document.querySelectorAll('button')].find(b=>b.textContent===label);
    window.matrixDesktop.syncDouyinFollowers=async input=>{syncCalls.push(input.command);if(input.command==='pause')await new Promise(resolve=>setTimeout(resolve,50));return {accountId:'douyin',sessionId:'fixture-session-douyin',cursor:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',loaded:input.command==='start'?0:24,avatars:input.command==='start'?0:24,complete:phase===1&&input.command==='next',status:phase===1&&input.command==='next'?'complete':input.command==='pause'?'paused':'running',reason:input.command==='pause'?'QA paused safely':'',retryAfterMs:1000};};
    syncButton('自动同步全部粉丝').click();await settle();eq(syncButton('同步已打开粉丝面板').disabled,true);assert(syncButton('暂停自动同步'),'Expected pause control');syncButton('暂停自动同步').click();
    for(let n=0;n<80&&(!syncCalls.includes('pause')||!document.body.textContent.includes('QA paused safely')||!syncButton('继续自动同步'));n++)await settle();eq(syncCalls,['start','pause']);eq(document.body.textContent.includes('QA paused safely'),true);assert(syncButton('继续自动同步'),'Expected resume control');
    phase=1;syncButton('继续自动同步').click();for(let n=0;n<100&&!document.body.textContent.includes('官网可访问名单已从顶部读至明确末页：24 位');n++)await settle();eq(syncCalls,['start','pause','resume','next']);eq(document.body.textContent.includes('官网可访问名单已从顶部读至明确末页：24 位'),true);assert(syncButton('自动同步全部粉丝'),'A new scan must restart at top after completion');
    for(const next of ['https://www.douyin.com/','https://www.douyin.com/user/self?from_tab_name=main']){ownUrl=next;guest.dispatchEvent(new Event('did-navigate'));await settle();eq(!!button(),true);}
    ownUrl='https://www.douyin.com/video/123';guest.dispatchEvent(new Event('did-navigate'));await settle();eq(!!button(),false);
    showDeck=false;render();await settle();fixtureAccounts.push(...Array.from({length:118},(_,i)=>({id:'extra-'+i,platform:'douyin',nickname:'fixture extra '+i,connectorSessionId:'extra-session-'+i,nativeAccountKey:'extra-key-'+i})));accountPages.length=0;await workspace.refreshAccounts();await settle();eq(workspace.accounts.length,125);eq(accountPages,[1,2]);
    failPage=2;await workspace.refreshAccounts();await settle();eq(workspace.accounts.length,125);eq(workspace.accountError.includes('原列表保留'),true);failPage=0;
    let releaseAccounts;holdAccounts=new Promise(resolve=>{releaseAccounts=resolve;});const pending=workspace.refreshAccounts();await settle();owner='other-owner';window.dispatchEvent(new Event('matrix:auth-updated'));await settle();eq(workspace.accounts.length,0);releaseAccounts();await pending;for(let n=0;n<40&&workspace.accounts[0]?.id!=='foreign';n++)await settle();eq(workspace.accounts.map(a=>a.id),['foreign']);owner='fixture-owner';holdAccounts=undefined;window.dispatchEvent(new Event('matrix:auth-updated'));for(let n=0;n<40&&workspace.accounts.length!==125;n++)await settle();eq(workspace.accounts.length,125);
    return { accountSiteChecks: checks, actualProviderAndButtons: true, fourPlatforms: true, sameSessionAndPartition: true, noBackendNavigationOrNewLogin: true, repeatedClicksReusePage: true, moduleIsolation: true, realPlatformRequests: 0 };
  } finally { component.unmount(); window.matrixDesktop = undefined; }
}
module.exports = { run };
if (process.type === 'renderer') module.exports = { run };
else if (!process.versions.electron) { const { spawnSync } = require('node:child_process'), env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; const r = spawnSync(path.join(root, '.desktop-deps/node_modules/electron/dist/electron.exe'), [__filename], { cwd: root, windowsHide: true, env, encoding: 'utf8', timeout: 40000 }); process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || ''); process.exit(r.status ?? 1); }
else { const { app, BrowserWindow } = require('electron'), fs = require('node:fs'), os = require('node:os'); app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-account-sites-'))); app.whenReady().then(async () => { let win; try { win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false } }); const origin = 'https://account-sites.fixture.test/'; win.webContents.session.webRequest.onBeforeRequest((r, done) => done({ cancel: r.url !== origin })); win.webContents.session.protocol.handle('https', () => new Response('<div id="root"></div>', { headers: { 'content-type': 'text/html' } })); await win.loadURL(origin); console.log(JSON.stringify(await win.webContents.executeJavaScript(`require(${JSON.stringify(__filename)}).run()`))); } catch (e) { console.error(e?.stack || String(e)); process.exitCode = 1; } finally { win?.destroy(); app.exit(process.exitCode || 0); } }); }
