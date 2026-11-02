// Real React, synthetic IPC, disposable renderer. No real platform/profile.
const path = require('node:path'), root = path.resolve(__dirname, '..');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
async function run() {
  const assert = require('node:assert/strict'), React = require('react'), { createRoot } = require('react-dom/client'), { loadTs } = require('./qa-load-typescript.cjs'), cache = new Map();
  let checks = 0, owner = 'qa-owner', clock = 1792512000000, failNextA = false, lossMode = false, losses = 0, hold, defer = false, selected, kind = 'comments', visible = true, calls = [], counters = new Map(), mount = 0, restoreTest = false;
  const eq = (a, b) => { assert.deepEqual(a, b); checks++; };
  const accounts = ['a', 'b'].map(id => ({ id, platform: 'douyin', nickname: 'QA账号' + id, connectorSessionId: 'session-' + id, nativeAccountKey: 'native-' + id }));
  const workspace = { accounts: [...accounts, { id: 'other-platform', platform: 'bilibili', connectorSessionId: 'other-session' }], jobsLocked: false, accountError: '' };
  const pref = new Map(), intervals = new Map(); let timerId = 0;
  let schedulingTest = false, releaseSlow, activeReads = 0, maxActiveReads = 0,monitorMode=false,importedFollower=false,importedCacheCalls=0,panelFollower=false; const cachedAccounts = [], liveLanes = new Set(), laneCalls = [], releaseOther=[],monitorCalls=[];
  const originalNow = Date.now, originalInterval = window.setInterval, originalClear = window.clearInterval;
  Date.now = () => clock; window.setInterval = fn => { const id = ++timerId; intervals.set(id, fn); return id; }; window.clearInterval = id => intervals.delete(id);
  const stub = (file, exports) => cache.set(path.join(root, file), { exports });
  stub('client/src/api/index.ts', { getUser: () => ({ id: owner }), getAuthToken: () => 'qa-token-' + owner });
  stub('client/src/components/workspace/OfficialWorkspace.tsx', { useOfficialWorkspace: () => workspace });
  stub('client/src/components/workspace/InteractionUi.tsx', { InteractionEmpty: ({ children }) => React.createElement('p', null, children) });
  stub('client/src/components/workspace/WorkspaceUiState.ts', { uiPage: v => Number.isInteger(v), uiText: v => typeof v === 'string', useWorkspaceIdentity: () => owner, useWorkspacePreference: (key, fallback) => { const full = owner + key, [state, set] = React.useState(() => ({ full, value: pref.get(full) ?? fallback })); return [state.full === full ? state.value : pref.get(full) ?? fallback, value => { pref.set(full, value); set({ full, value }); }]; } });
  window.matrixDesktop = { douyinInteractions: async input => {
    if (schedulingTest) {
      const base = { accountId: input.accountId, sessionId: 'session-' + input.accountId, platform: 'douyin', kind: input.kind, records: [{ platformId: '701', platformUserId: '702', author: 'QA缓存' + input.accountId, content: 'QA独立缓存' + input.accountId, workId: '703' }], works: [], complete: true, progress: { pages: 1 } };
      if (input.command === 'cache') { cachedAccounts.push(input.accountId + '/' + input.kind); return { ...base, fromCache: true }; }
      eq(liveLanes.has(input.accountId), false); liveLanes.add(input.accountId); activeReads++; maxActiveReads = Math.max(maxActiveReads, activeReads); laneCalls.push({ id: input.accountId, kind: input.kind, at: clock });
      try {
        if (input.accountId === 'a' && input.kind === 'comments') return await new Promise(resolve => { releaseSlow = () => resolve(base); });
        if(input.kind==='comments') await new Promise(resolve=>releaseOther.push(resolve));
        if (input.accountId === 'c') return { error: 'HTTP 403' };
        return base;
      } finally { activeReads--; liveLanes.delete(input.accountId); }
    }
    if(input.command==='cache'&&input.accountId==='a'&&input.kind==='followers'&&importedFollower){importedCacheCalls++;return {accountId:'a',sessionId:'session-a',kind:'followers',platform:'douyin',fromCache:true,records:[{platformId:'1',platformUserId:'100',author:'QA昵称a',content:'QA官网补充签名'}],works:[],complete:panelFollower,...(panelFollower?{followerPanelSync:{source:'official-open-panel-v1',status:'complete',seen:1,steps:2,reason:'QA explicit website end',updatedAt:new Date(clock).toISOString()}}:{})};}
    if (input.command === 'cache') return { accountId: input.accountId, sessionId: 'session-' + input.accountId, kind: input.kind, platform: 'douyin', fromCache: true, records: restoreTest && input.accountId === 'a' ? [{ platformId: '901', platformUserId: '902', author: 'QA缓存昵称', content: 'QA重启恢复评论', workId: '903' }] : [], works: restoreTest && input.accountId === 'a' ? [{ platformId: '903', title: 'QA重启恢复作品', coverUrl: 'https://p1.byteimg.com/qa-cover.jpg' }] : [], complete: false,...(restoreTest&&input.accountId==='a'?{progress:{worksCatalogComplete:false,catalogReadError:'QA目录作者异常，已核验作品继续同步'}}:{}) };
    eq(Object.keys(input).some(k => !['accessToken', 'accountId', 'kind', 'cursor','forceHistory','refreshLatest'].includes(k)), false); calls.push({ ...input });
    const k = input.accountId + '/' + input.kind, i = counters.get(k) || 0;
    if (restoreTest) return { error: 'HTTP 403；已有缓存保留' };
    const base = { accountId: input.accountId, sessionId: 'session-' + input.accountId, platform: 'douyin', kind: input.kind, source: 'https://www.douyin.com/', capturedAt: new Date(clock).toISOString(), progress: { pages: i + 1, worksFound: 2, worksDone: 0, rootPages: 1, replyPages: 0, followerPages: 1 } };
    if(monitorMode){if(input.accountId==='a')monitorCalls.push(input.cursor);return{...base,records:[],works:[],complete:true,monitoring:true,nextCursor:'monitor-'+input.accountId+'-'+monitorCalls.length};}
    if (defer && input.accountId === 'c') return new Promise(resolve => hold = () => resolve({ ...base, complete: true, records: [{ platformId: '99', platformUserId: '100', author: '不应显示旧用户粉丝', content: '' }] }));
    if (input.accountId === 'a' && input.kind === 'comments' && failNextA) { failNextA = false; return { error: '网络连接失败，当前读取暂停' }; }
    if(lossMode&&input.accountId==='a'&&input.kind==='comments') {
      if(input.cursor){losses++;return {error:'抖音创作者只读采集页已释放，需要重新建立作品目录'};}
      return {...base,records:[],complete:false,nextCursor:'loss-cursor-'+losses};
    }
    counters.set(k, i + 1);
    const row = (id, content) => ({ platformId: String(id), platformUserId: '100', author: 'QA昵称' + input.accountId, content, ...(input.kind === 'comments' ? { workId: '101', workTitle: 'QA作品' } : {}) });
    if (input.kind === 'followers') return { ...base, complete: true, records: [row(1, 'QA粉丝签名')] };
    if (input.accountId === 'b') return { ...base, complete: true, records: [{ ...row(1, 'QA正文b'), platformId: 'qa.encrypted-comment+reference/==', platformUserId: 'qa.encrypted-author+reference/==', referenceKind: 'legacy' }], works: [{ platformId: '103', title: 'QA官网受限作品', readError: '官网当前作品状态暂不支持查看详情数据，未判定为零评论' }, { platformId: '104', title: 'QA可访问作品', readComplete: true }] };
    return i === 0 ? { ...base, complete: false, nextCursor: 'cursor-a-1', works: [{ platformId: '101', title: 'QA作品' }, { platformId: '102', title: 'QA零评论作品' }], records: [], phase: '发现本人作品' } : i === 1 ? { ...base, complete: false, nextCursor: 'cursor-a-2', records: [row(1, 'QA正文a'), { ...row(2, 'QA回复预览'), parentPlatformId: '1' }] } : { ...base, complete: true, records: [{ ...row(2, 'QA完整回复'), parentPlatformId: '1' }, { ...row(3, 'QA下一条回复'), parentPlatformId: '1' }] };
  } };
  const { DouyinInteractionDataProvider, useDouyinInteractionData, interactionStatus, interactionCanRetry, interactionNeedsRescan, isDouyinCommentId,douyinPollDelay } = loadTs('client/src/components/workspace/DouyinInteractionData.tsx', cache);
  let dataHandle;function RefreshHarness(){dataHandle=useDouyinInteractionData(kind);return null;}
  const { DouyinInteractionFeed } = loadTs('client/src/components/workspace/DouyinInteractionFeed.tsx', cache);
  const { DouyinCommentMonitorPanel } = loadTs('client/src/components/workspace/DouyinCommentMonitor.tsx', cache);
  const component = createRoot(document.getElementById('root'));
  const render = () => component.render(React.createElement(DouyinInteractionDataProvider, { key: mount,initialKinds:[] }, visible ? React.createElement(React.Fragment, null, React.createElement(RefreshHarness), React.createElement(DouyinInteractionFeed, { kind, account: selected }), kind === 'comments' ? React.createElement(DouyinCommentMonitorPanel, { account: selected }) : null) : React.createElement('h1', null, 'Another route')));
  const until = async fn => { for (let i = 0; i < 200; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 5)); } throw Error('Douyin feed fixture timeout'); };
  const tick = async (ms = 5000) => { clock += ms; for (const fn of [...intervals.values()]) fn(); await new Promise(r => setTimeout(r, 35)); };
  const body = () => document.querySelector('.matrix-live-records')?.textContent || '';
  const count = () => document.querySelectorAll('.matrix-live-records article').length;
  try {
    for(const value of [undefined,0,4499,60001,NaN,Infinity,'4500',4500.5])eq(douyinPollDelay('comments',{complete:true,monitoring:true,pollAfterMs:value}),15000);for(const value of [4500,7500,15000,60000])eq(douyinPollDelay('comments',{complete:true,monitoring:true,pollAfterMs:value}),value);eq(douyinPollDelay('followers',{complete:true,monitoring:true,pollAfterMs:4500}),15000);eq(douyinPollDelay('comments',{complete:false,monitoring:true,pollAfterMs:60000}),4500);
    // A stalled account must neither block other cached lists nor their live
    // work. Keep the same-account lane, refusal stop, fairness and safety floor.
    schedulingTest = true; workspace.accounts = ['a', 'b', 'c', 'd'].map(id => ({ id, platform: 'douyin', nickname: 'QA账号' + id, connectorSessionId: 'session-' + id, nativeAccountKey: 'native-' + id }));
    render(); await until(() => cachedAccounts.length === 4);await until(()=>body().includes('QA独立缓存c')&&body().includes('QA独立缓存d'));
    eq(body().includes('QA独立缓存c'), true); eq(body().includes('QA独立缓存d'), true); eq(laneCalls.length, 0);
    await tick(0); await until(() => releaseSlow && laneCalls.some(c => c.id === 'b')); await tick(1000); await until(() => laneCalls.some(c => c.id === 'c')); await tick(1000); await until(() => laneCalls.some(c => c.id === 'd'));
    eq(activeReads, 4);eq(maxActiveReads, 4);eq(dataHandle.readings.length,4);eq(new Set(dataHandle.readings).size,4);releaseOther.splice(0).forEach(resolve=>resolve());await until(()=>activeReads===1&&dataHandle.readings.length===1);eq(dataHandle.readings[0],dataHandle.reading);eq(body().includes('QA独立缓存a'), true); eq(body().includes('QA独立缓存c'), true);
    kind = 'followers'; render(); await new Promise(r => setTimeout(r, 20)); await tick(0); await tick(0); eq(laneCalls.some(c => c.id === 'a' && c.kind === 'followers'), false);
    await tick(61000); await tick(0); eq(laneCalls.filter(c => c.id === 'c' && c.kind === 'comments').length, 1);
    for (const id of ['b', 'd']) { const times = laneCalls.filter(c => c.id === id).map(c => c.at); eq(times.every((at, i) => !i || at - times[i - 1] >= 4500), true); }
    releaseSlow(); await new Promise(r => setTimeout(r, 25)); schedulingTest = false; kind = 'comments'; workspace.accounts = accounts; mount++; calls = []; counters.clear(); render(); await until(() => intervals.size > 0); await tick(0);
    eq(isDouyinCommentId('qa.encrypted-comment+reference/==', true), true);
    eq(isDouyinCommentId('qa.encrypted-comment+reference/==', false), false);
    for (const reference of ['-legacy==', '_legacy', '/legacy+', '=old', 'v1:old%2Bref', 'a']) { eq(isDouyinCommentId(reference, true), true); eq(isDouyinCommentId(reference, false), false); }
    eq(interactionNeedsRescan('抖音创作者只读采集页已释放，需要重新建立作品目录'), true);
    eq(interactionCanRetry('抖音创作者只读采集页已释放，需要重新建立作品目录'), true);
    eq(interactionNeedsRescan('抖音创作者官方页面请求返回 HTTP 403'), false);
    eq(interactionCanRetry('抖音创作者官方页面请求返回 HTTP 403'), false);
    for (const invalid of ['https://private.test', '12345678901234567890', '', 'x'.repeat(513), 'cookie=a; b=c', 9007199254740994]) eq(isDouyinCommentId(invalid, true), false);
    render(); await until(() => intervals.size > 0); await tick(0); await until(() => calls.length >= 2); await tick(); await until(() => body().includes('QA正文a'));
    eq(calls.some(r => r.accountId === 'other-platform'), false); eq(count(), 2); // Replies start collapsed, not as unrelated root rows.
    eq(document.querySelector('[aria-label="筛选抖音作品评论"]'), null); // Aggregate is never constrained by a saved single work.
    eq(document.body.textContent.includes('继续 / 重试'), false); eq(document.body.textContent.includes('自动继续分页'), false); eq(!!document.querySelector('webview'), false);
    eq(document.querySelectorAll('[aria-label="抖音作品评论监控"] article').length, 4);
    selected = accounts[1]; render(); await until(() => count() === 1); eq(body().includes('QA正文b'), true); eq(body().includes('QA正文a'), false);
    eq(document.querySelectorAll('[aria-label="账号获取状态"] small').length, 1);
    eq(!!document.querySelector('[aria-label="筛选抖音作品评论"] option[value="102"]'), false);
    eq(document.querySelector('[aria-label="账号获取状态"] small').textContent.includes('部分获取'), true);
    eq(document.querySelector('[aria-label="账号获取状态"] small').title.includes('1个作品无法读取'), true);
    const monitored = [...document.querySelectorAll('[aria-label="抖音作品评论监控"] article')];
    eq(monitored.find(e => e.textContent.includes('QA官网受限作品')).textContent.includes('此作品无法读取'), true);
    eq(monitored.find(e => e.textContent.includes('QA可访问作品')).textContent.includes('本轮读取完成'), true);
    eq(monitored.find(e => e.textContent.includes('QA官网受限作品')).textContent.includes('本轮读取完成'), false);
    failNextA = true; await tick(); await until(() => counters.get('a/comments') === 2 && calls.filter(c => c.accountId === 'a').length >= 3);
    selected = undefined; render(); await until(() => document.querySelector('[title="网络连接失败，当前读取暂停"]')); eq(count(), 2); eq(document.body.textContent.includes('没有权限'), false);
    eq(document.querySelector('[title="网络连接失败，当前读取暂停"]').textContent.includes('部分获取'), true);
    // No control click: background resumes the original page after bounded backoff.
    visible = false; render(); await new Promise(r => setTimeout(r, 20)); await tick(61000); await tick(); await tick();
    visible = true; render(); await until(() => document.querySelector('[aria-label="账号获取状态"]')?.textContent.includes('3条'));eq(count(),2);[...document.querySelectorAll('button')].find(b=>b.textContent.includes('展开回复')).click();await until(()=>count()===4);
    eq(calls.some(c => c.accountId === 'a' && c.cursor === 'cursor-a-2'), true); eq(body().includes('QA完整回复'), true); eq(body().includes('QA回复预览'), false);
    eq(document.querySelectorAll('input[type="checkbox"]').length, 0);
    const at = calls.length; visible = false; render(); await tick(61000); await tick(); eq(calls.length > at, true); visible = true; render(); await until(() => count() === 2);[...document.querySelectorAll('button')].find(b=>b.textContent.includes('展开回复')).click();await until(()=>count()===4);
    lossMode=true;const lossStart=calls.length;
    for(let n=0;n<16&&losses<3;n++)await tick(61000);
    eq(losses,3);eq(count(),4);
    const recoveryCalls=calls.slice(lossStart).filter(c=>c.accountId==='a');eq(recoveryCalls.filter(c=>c.cursor===undefined).length,3);
    const stoppedAt=calls.filter(c=>c.accountId==='a').length;for(let n=0;n<4;n++)await tick(61000);eq(calls.filter(c=>c.accountId==='a').length,stoppedAt);eq(count(),4);lossMode=false;
    dataHandle.refresh(accounts[0],'comments');eq(count(),4);await tick();await until(()=>calls.filter(c=>c.accountId==='a').length>stoppedAt);eq(calls.filter(c=>c.accountId==='a').at(-1).cursor,undefined);eq(body().includes('QA正文a'),true);
    kind = 'followers'; render(); await new Promise(r => setTimeout(r, 20)); for (let n = 0; n < 6 && count() !== 2; n++) await tick(); await until(() => body().includes('QA粉丝签名')); eq(count(), 2); eq(body().includes('QA正文'), false);
    document.querySelector('.matrix-live-records header button').click(); await until(() => document.querySelector('[aria-label="抖音粉丝详情"]')); eq(document.querySelector('[aria-label="抖音粉丝详情"]').textContent.includes('当前同步记录未包含此字段，尚未获取'), true);
    importedFollower=true;
    const detail={owner:'qa-owner',accountId:'a',sessionId:'session-a',nativeAccountKey:'native-a'};
    for(const extra of [{owner:'other-owner'},{sessionId:'other-session'},{nativeAccountKey:'other-key'}]){window.dispatchEvent(new CustomEvent('matrix:followers-cache-updated',{detail:{...detail,...extra}}));await tick(0);eq(importedCacheCalls,0);}
    window.dispatchEvent(new CustomEvent('matrix:followers-cache-updated',{detail}));await tick(0);await until(()=>importedCacheCalls===1);await until(()=>body().includes('QA官网补充签名'));eq(body().includes('QA官网补充签名'),true);importedFollower=false;
    importedFollower=true;panelFollower=true;window.dispatchEvent(new CustomEvent('matrix:followers-cache-updated',{detail}));await tick(0);await until(()=>importedCacheCalls===2);await until(()=>document.body.textContent.includes('官网可访问名单已读完'));
    const legacyReads=calls.filter(call=>call.accountId==='a'&&call.kind==='followers').length;await tick(61000);await tick(61000);eq(calls.filter(call=>call.accountId==='a'&&call.kind==='followers').length,legacyReads);
    dataHandle.refresh(accounts[0],'followers');await tick(61000);await tick(61000);eq(calls.filter(call=>call.accountId==='a'&&call.kind==='followers').length,legacyReads);eq(document.body.textContent.includes('官网可访问名单已读完'),true);importedFollower=false;panelFollower=false;
    eq(interactionStatus('平台码 5，获取失败'), '获取失败'); eq(interactionStatus('没有权限读取评论'), '没有权限'); eq(interactionStatus('请在账号管理恢复登录'), '需要登录');
    eq(interactionStatus('作品评论：平台码5；请先登录'), '需要登录'); eq(interactionStatus('作品评论：平台码5；请完成安全验证'), '需要验证'); eq(interactionStatus('作品评论：平台码5；官网未提供错误说明'), '获取失败');
    eq(interactionCanRetry('网络连接失败，当前读取暂停'), true); eq(interactionCanRetry('平台码 5；网络连接失败'), false); eq(interactionCanRetry('HTTP 403；网络连接失败'), false); eq(interactionCanRetry('HTTP 429；网络连接失败'), false);
    eq(interactionCanRetry('准备官网只读采集页超时，已停止本次操作；不会重复执行'),true);eq(interactionCanRetry('HTTP 403；准备官网只读采集页超时'),false);eq(interactionCanRetry('平台码 -999；准备官网只读采集页超时'),false);
    eq(interactionCanRetry('抖音官方评论尚未读取完成：等待官方分页响应'),true);eq(interactionCanRetry('抖音官方评论尚未读取完成：HTTP 403'),false);
    kind = 'comments'; render(); await until(() => body().includes('QA正文a'));[...document.querySelectorAll('button')].find(b=>b.textContent.includes('展开回复')).click();await until(()=>count()===4);
    workspace.accounts = workspace.accounts.map(a => a.id === 'a' ? { ...a, connectorSessionId: 'replacement-session' } : a); render(); await until(() => !body().includes('QA正文a')); eq(body().includes('QA正文b'), true);
    workspace.accounts = [...accounts, { id: 'c', platform: 'douyin', nickname: 'QA账号c', connectorSessionId: 'session-c', nativeAccountKey: 'native-c' }]; kind = 'followers'; defer = true; render(); for (let n = 0; n < 8 && !hold; n++) await tick(); await until(() => hold);
    owner = 'qa-new-owner'; workspace.accounts = []; render(); hold(); await new Promise(r => setTimeout(r, 35)); eq(body().includes('不应显示旧用户粉丝'), false); eq(body().includes('QA粉丝签名'), false);
    owner = 'qa-owner'; workspace.accounts = accounts; kind = 'comments'; defer = false; restoreTest = true; mount++; render(); await until(() => body().includes('QA重启恢复评论'));
    eq(document.querySelector('[title="QA目录作者异常，已核验作品继续同步"]').textContent.includes('部分获取'),true);
    eq(document.querySelector('[alt="作品封面"]').getAttribute('src'), 'https://p1.byteimg.com/qa-cover.jpg'); eq(document.querySelector('[aria-label="查看作品首页：QA重启恢复作品"]').getAttribute('href'), 'https://creator.douyin.com/creator-micro/work-management/work-detail/903');
    await tick(); eq(body().includes('QA重启恢复评论'), true); eq(document.body.textContent.includes('部分获取'), true);
    visible = false; render(); await tick(31 * 60 * 1000); visible = true; render(); await until(() => body().includes('QA重启恢复评论')); eq(count(), 1);
    eq([...pref.values()].some(v => typeof v === 'string' && /QA正文|QA昵称|QA粉丝/.test(v)), false); eq(JSON.stringify(localStorage).includes('QA正文'), false);
    restoreTest=false;monitorMode=true;mount++;render();await new Promise(resolve=>setTimeout(resolve,25));await tick(0);await tick(0);await until(()=>monitorCalls.length===1);eq(monitorCalls[0],undefined);await tick(16000);await until(()=>monitorCalls.length===2);eq(monitorCalls[1],'monitor-a-1');dataHandle.refresh(accounts[0],'comments');await tick(5000);await until(()=>monitorCalls.length===3);eq(monitorCalls[2],'monitor-a-2');eq(calls.filter(call=>call.accountId==='a').at(-1).refreshLatest,true);eq(calls.filter(call=>call.accountId==='a').at(-1).forceHistory,undefined);
    const statusOnlyRows=dataHandle.entry(accounts[0],'comments').rows,statusOnlyWorks=dataHandle.entry(accounts[0],'comments').works;await tick(16000);await until(()=>monitorCalls.length===4);eq(dataHandle.entry(accounts[0],'comments').rows===statusOnlyRows,true);eq(dataHandle.entry(accounts[0],'comments').works===statusOnlyWorks,true);eq(dataHandle.entry(accounts[0],'comments').progress.pages>0,true);
    return { douyinPagedFeedUiChecks: checks, statusOnlyContentReferencesPreserved:true, compactAccountStatusOnly: true, failedPageRetainsRowsAndCursor: true, sharedMonitorContinuesAcrossRoutes: true, noPersistentGuestOrManualReadControls: true, oldBindingAndOwnerResultsRejected: true, recordBodiesNotInPreferences: true, realPlatformRequests: 0 };
  } finally { component.unmount(); Date.now = originalNow; window.setInterval = originalInterval; window.clearInterval = originalClear; window.matrixDesktop = undefined; }
}
module.exports = { run };
if (process.type === 'renderer') module.exports = { run };
else if (!process.versions.electron) { const { spawnSync } = require('node:child_process'), env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; const r = spawnSync(path.join(root, '.desktop-deps/node_modules/electron/dist/electron.exe'), [__filename], { cwd: root, windowsHide: true, env, encoding: 'utf8', timeout: 40000 }); process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || ''); process.exit(r.status ?? 1); }
else {
  const { app, BrowserWindow } = require('electron'), fs = require('node:fs'), os = require('node:os');
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-douyin-pages-ui-'))); app.commandLine.appendSwitch('mute-audio');
  app.whenReady().then(async () => { let win; try {
    win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false } });
    win.webContents.session.webRequest.onBeforeRequest((r, done) => done({ cancel: r.url !== 'https://douyin-pages.fixture.test/app' }));
    win.webContents.session.protocol.handle('https', request => { if (request.url !== 'https://douyin-pages.fixture.test/app') throw Error('Not the fixture origin'); return new Response('<div id="root"></div>', { headers: { 'content-type': 'text/html' } }); });
    await win.loadURL('https://douyin-pages.fixture.test/app');
    const result = await win.webContents.executeJavaScript(`require(${JSON.stringify(__filename)}).run().catch(e=>{throw Error(String(e)+' '+(e.stack||''))})`); console.log(JSON.stringify(result));
  } catch (e) { console.error(String(e),e?.stack); process.exitCode = 1; } finally { win?.destroy(); app.exit(process.exitCode || 0); } });
}
