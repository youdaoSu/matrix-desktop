const path = require('node:path'), root = path.resolve(__dirname, '..');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
async function run() {
  const assert = require('node:assert/strict'), React = require('react'), { createRoot } = require('react-dom/client'), { loadTs } = require('./qa-load-typescript.cjs'), cache = new Map();
  const stub = (file, exports) => cache.set(path.join(root, file), { exports });
  let owner = 'qa-owner', checks = 0, accountId, historyComplete = false, push = 'connected', pushError, pushVerifiedAt, requestLog = [], hold, deferred = false, revision = 1, gap = false, media = '', imageFails=false, sendState='failed', stickerLabel=false,cardCover='',visibility='';
  const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zy8QAAAAASUVORK5CYII=';
  const OriginalObserver=window.IntersectionObserver;window.IntersectionObserver=class{constructor(fn){this.fn=fn;}observe(){this.fn([{isIntersecting:true}]);}disconnect(){}};
  const intervals = new Map(), originalSetInterval = window.setInterval, originalClearInterval = window.clearInterval;
  window.setInterval = (fn, ms) => { const id = originalSetInterval(fn, ms); if (ms === 5000) intervals.set(id, fn); return id; };
  window.clearInterval = id => { intervals.delete(id); originalClearInterval(id); };
  const poll = async () => { for (const fn of intervals.values()) await fn(); await new Promise(r => setTimeout(r, 30)); };
  const eq = (a, b) => { assert.deepEqual(a, b); checks++; };
  const accounts = [{ id: 'qa-a', platform: 'douyin', nickname: 'QA甲', connectorSessionId: 'qa-session-a' }, { id: 'qa-b', platform: 'douyin', nickname: 'QA乙', connectorSessionId: 'qa-session-b' }, { id: 'qa-c', platform: 'bilibili', nickname: 'QA不同平台', connectorSessionId: 'qa-session-c' }];
  const accountTimes={'qa-a':'2026-10-22T01:00:00Z','qa-b':'2026-10-23T01:00:00Z'};
  const preferences = new Map();
  stub('client/src/api/index.ts', { getUser: () => ({ id: owner }), getAuthToken: () => 'token-' + owner });
  stub('client/src/components/ui/button.tsx', { Button: ({ children, size, variant, ...props }) => React.createElement('button', props, children) });
  stub('client/src/components/workspace/WorkspaceUiState.ts', { useWorkspaceIdentity: () => owner, uiText: x => typeof x === 'string' ? x : '', useWorkspacePreference: (key, fallback) => { const full = owner + key, [state, set] = React.useState(() => ({ key: full, value: preferences.get(full) || fallback })); return [state.key === full ? state.value : preferences.get(full) || fallback, value => { preferences.set(full, value); set({ key: full, value }); }]; } });
  window.matrixDesktop = { douyinInbox: async input => {
    requestLog.push(input); assert.ok(['watch', 'resume', 'stop', 'messages', 'arm','attachment','send'].includes(input.command));
    if(input.command==='send')return {accountId:input.accountId,sessionId:accounts.find(a=>a.id===input.accountId).connectorSessionId,receipt:{state:sendState,requestId:input.requestId,message:sendState==='failed'?'QA 对方隐私设置禁止接收（平台码 42）':sendState==='unknown'?'QA 发送结果未确认，请核对原会话，勿重复发送':'QA 平台已确认发送',...(sendState==='confirmed'?{messageId:'999'}:{})}};
    if(input.command==='attachment')return imageFails?{error:'图片读取返回 HTTP 404'}:{accountId:input.accountId,sessionId:accounts.find(a=>a.id===input.accountId).connectorSessionId,attachment:{dataUrl:pixel,bytes:68}};
    const account = accounts.find(a => a.id === input.accountId), result = { accountId: account.id, sessionId: account.connectorSessionId, status: { revision, phase: 'QA同步阶段', busy: false, threadCount: 1, messageCount: 150, completedThreads: historyComplete ? 1 : 0, historyComplete, push, pushError, pushCount: 0, pushVerifiedAt, unread: 4, verificationMarker: input.command === 'arm' ? 'QA受控外部标记' : undefined }, threads: [{ id: 'thread-' + account.id, name: 'QA会话-' + account.id, messageRevision: revision, unread: 4, complete: historyComplete, count: 150, lastMessage: 'QA会话摘要',lastAt:accountTimes[account.id] }] };
    if (input.command === 'messages') { result.messages = [{ id: input.before ? '1' : '51', threadId: input.threadId, sender: 'qa-peer', direction: 'inbound', text: input.before ? 'QA更早历史' : 'QA已接入消息', at: '2026-10-21T00:00:00Z' }]; result.before = input.before ? undefined : '51'; }
    if (input.command === 'messages' && gap) { const mid = input.before === '151' ? '151' : input.before === '51' ? '51' : '201'; result.messages = [{ id: mid, threadId: input.threadId, sender: 'qa-peer', direction: 'inbound', text: mid === '201' ? 'QA最新消息' : mid === '151' ? 'QA桥接历史' : 'QA已接入消息', at: '2026-10-21T00:00:00Z' }]; result.before = mid === '201' ? '151' : mid === '151' ? '51' : '1'; }
    if (input.command === 'messages' && media && !input.before) result.messages[0] = { ...result.messages[0], contentKind: 'image', mediaUrl: media, text: '[图片]' };
    if(input.command==='messages'&&media&&stickerLabel&&!input.before)result.messages[0]={...result.messages[0],contentKind:'emoji',text:'比心',textIsMediaLabel:true};
    if(input.command==='messages'&&cardCover&&!input.before)result.messages[0]={...result.messages[0],contentKind:'card',text:'QA作品卡片标题',cardCoverUrl:cardCover,linkUrl:'https://www.douyin.com/video/7676793092176410191',version:String(revision)};
    if(input.command==='messages'&&visibility&&!input.before){
      const base=result.messages[0];result.messages=[{...base,status:visibility==='hidden'?1:0},...[52,53,54,55].map((id,i)=>({...base,id:String(id),index:String(id),status:visibility==='show'?i+1:1,contentKind:'system',text:i<2?'消息当前不可见':i===2?'消息已撤回':'消息已删除',at:i<2?'2026-10-21T12:00:00Z':i===2?'2026-10-21T00:01:00Z':'2026-10-21T00:02:00Z'}))];
    }
    if (deferred && input.command === 'messages') return new Promise(resolve => hold = () => resolve(result));
    return result;
  } };
  const { DouyinInboxProvider, DouyinInboxView, useDouyinInboxCache, inboxAccountStatus, inboxParties, inboxTextParts, safeNoticeLink, isVisibleInboxMessage } = loadTs('client/src/components/workspace/DouyinInbox.tsx', cache), component = createRoot(document.getElementById('root'));
  for(const status of [0,3,4,undefined])eq(isVisibleInboxMessage({status}),true);for(const status of [1,2])eq(isVisibleInboxMessage({status}),false);
  for(const messageType of [50000,50001,50002,50017,60001,70001])eq(isVisibleInboxMessage({status:0,messageType}),false);
  for(const messageType of [7,1001,49999,undefined])eq(isVisibleInboxMessage({status:0,messageType}),true);
  const notice={text:'QA成员加入群聊',contentKind:'system',mentions:[{start:0,length:4,linkUrl:'https://www.douyin.com/user/MS4wQA_user'}]};
  eq(safeNoticeLink(notice.mentions[0].linkUrl),notice.mentions[0].linkUrl);
  for(const bad of ['javascript:alert(1)','aweme://action','https://evil.test/','https://www.douyin.com/video/1?read=1'])eq(safeNoticeLink(bad),undefined);
  eq(inboxTextParts(notice)[1].type,'a');eq(inboxTextParts({...notice,mentions:[{start:0,length:4,linkUrl:'javascript:alert(1)'}]})[1].type,'span');
  eq(inboxTextParts({...notice,contentKind:'text'})[1].type,'span');
  let mount = 0, contextRenders = 0;
  function Probe(){ useDouyinInboxCache(); contextRenders++; return null; }
  const render = (remount = false) => { if (remount) mount++; component.render(React.createElement(DouyinInboxProvider, { accounts, key: mount }, React.createElement(React.Fragment, null, React.createElement(Probe), React.createElement(DouyinInboxView, { accounts, accountId })))); };
  const until = async fn => { for (let n = 0; n < 200; n++) { if (fn()) return; await new Promise(r => setTimeout(r, 10)); } throw Error('Inbox UI fixture timeout'); };
  const button = name => [...document.querySelectorAll('button')].find(b => b.textContent.includes(name));
  const statuses = () => [...document.querySelectorAll('[aria-label="私信账号获取状态"] [role="status"]')];
  render(); await until(() => document.body.textContent.includes('QA会话-qa-b')); eq(requestLog.some(r => r.accountId === 'qa-c'), false); eq(statuses().length, 2); eq(statuses()[0].title.includes('真实新消息尚未验证'), true); eq(statuses()[0].title.includes('历史尚未全部读取'), true);
  const unchangedRenders=contextRenders;await poll();await poll();eq(contextRenders,unchangedRenders);
  eq(document.querySelector('.matrix-inbox-chat aside button strong').textContent,'QA会话-qa-b');accountTimes['qa-a']='2026-10-24T01:00:00Z';await poll();eq(document.querySelector('.matrix-inbox-chat aside button strong').textContent,'QA会话-qa-a');
  eq(document.body.textContent.includes('聊天历史与新消息'), false); eq(document.querySelector('.matrix-inbox-statuses'), null); eq(button('重新连接 / 继续历史'), undefined); eq(button('验证新消息推送'), undefined); eq(document.querySelectorAll('[role="alert"]').length, 0);
  button('QA会话-qa-a').click(); await until(() => document.body.textContent.includes('QA已接入消息')); eq(document.body.textContent.includes('官方未读 4'), true); eq(requestLog.filter(r => r.command === 'messages').every(r => r.threadId === 'thread-qa-a'), true);
  visibility='show';revision++;await poll();await until(()=>document.body.textContent.includes('消息已撤回'));
  eq(document.querySelectorAll('.matrix-inbox-bubbles article').length,3);eq(document.querySelectorAll('.matrix-inbox-timeline-entry').length,3);eq(document.querySelectorAll('.matrix-inbox-time-separator').length,1);eq(document.body.textContent.includes('消息当前不可见'),false);eq(document.body.textContent.includes('消息已删除'),true);
  const visibilityReads=()=>requestLog.filter(r=>r.command==='messages').length;
  visibility='hidden';revision++;await poll();await until(()=>document.querySelectorAll('.matrix-inbox-bubbles article').length===0);
  eq(document.querySelectorAll('.matrix-inbox-time-separator').length,0);eq(!!button('加载更早消息'),true);eq(document.querySelectorAll('.matrix-inbox-timeline-entry').length,0);
  const hiddenReadCount=visibilityReads();await poll();eq(visibilityReads(),hiddenReadCount);
  visibility='normal';revision++;await poll();await until(()=>document.body.textContent.includes('QA已接入消息'));visibility='';
  button('加载更早消息').click(); await until(() => document.body.textContent.includes('QA更早历史')); eq(document.body.textContent.includes('QA已接入消息'), true); eq(document.querySelectorAll('.matrix-inbox-bubbles article').length, 2);
  const readCount = () => requestLog.filter(r => r.command === 'messages').length, unchanged = readCount(); await poll(); await poll(); eq(readCount(), unchanged);
  revision++; gap = true; await poll(); await until(() => document.body.textContent.includes('QA最新消息'));
  eq(document.body.textContent.includes('QA更早历史'), true); eq(document.body.textContent.includes('QA桥接历史'), true); eq(document.querySelectorAll('.matrix-inbox-bubbles article').length, 4); eq(button('加载更早消息'), undefined);
  eq(requestLog.some(r => r.before === '151'), true); gap = false;
  media = 'https://p1.byteimg.com/qa-image.jpg'; revision++; await poll(); await until(() => document.querySelector('.matrix-inbox-picture')?.naturalWidth>0); eq(button('加载图片'),undefined);eq(document.querySelector('.matrix-inbox-picture').getAttribute('src'),pixel);eq(document.body.textContent.includes('QA会话-qa-a'),true);eq(document.querySelector('.matrix-inbox-picture').naturalWidth,1);
  stickerLabel=true;revision++;await poll();await until(()=>document.querySelector('.matrix-inbox-picture')?.naturalWidth>0);eq(document.querySelector('.matrix-inbox-bubbles').textContent.includes('比心'),false);
  imageFails=true;media='https://p1.byteimg.com/failed-sticker';revision++;await poll();await until(()=>button('重试图片预览'));eq(document.querySelector('.matrix-inbox-bubbles').textContent.includes('比心'),true);eq(document.querySelector('.matrix-inbox-bubbles').textContent.split('比心').length-1,1);
  imageFails=false;button('重试图片预览').click();await until(()=>document.querySelector('.matrix-inbox-picture')?.naturalWidth>0);eq(document.querySelector('.matrix-inbox-bubbles').textContent.includes('比心'),false);stickerLabel=false;
  imageFails=true;media = 'https://p1.byteimg.com/qa-changed-image.jpg'; revision++; await poll(); await until(() => button('重试图片预览')); eq(document.querySelectorAll('.matrix-inbox-picture').length, 0);eq(document.body.textContent.includes('HTTP 404'),true);eq(document.body.textContent.includes('已过期'),false);
  imageFails=false;button('重试图片预览').click();await until(()=>document.querySelector('.matrix-inbox-picture'));eq(document.querySelector('.matrix-inbox-picture').getAttribute('src'),pixel);
  media = ''; revision++; await poll(); await until(() => !document.querySelector('.matrix-inbox-picture')); eq(document.querySelectorAll('.matrix-inbox-picture').length, 0);
  const beforeCover=requestLog.filter(r=>r.command==='attachment').length;cardCover='https://p1.byteimg.com/card-cover';revision++;await poll();await until(()=>document.querySelector('.matrix-inbox-card-cover')?.naturalWidth>0);eq(document.querySelector('.matrix-inbox-card-cover').getAttribute('src'),pixel);eq(requestLog.filter(r=>r.command==='attachment').length,beforeCover+1);eq(document.querySelector('.matrix-inbox-bubbles').textContent.split('QA作品卡片标题').length-1,1);eq(document.querySelector('.matrix-inbox-bubbles a').getAttribute('href'),'https://www.douyin.com/video/7676793092176410191');
  imageFails=true;cardCover='https://p1.byteimg.com/failed-cover';revision++;await poll();await until(()=>button('重试图片预览'));eq(document.querySelector('.matrix-inbox-card-cover'),null);eq(document.querySelector('.matrix-inbox-bubbles').textContent.includes('HTTP 404'),true);eq(document.querySelector('.matrix-inbox-bubbles').textContent.includes('QA作品卡片标题'),true);
  imageFails=false;button('重试图片预览').click();await until(()=>document.querySelector('.matrix-inbox-card-cover')?.naturalWidth>0);eq(document.querySelector('.matrix-inbox-card-cover').getAttribute('src'),pixel);cardCover='';revision++;await poll();await until(()=>!document.querySelector('.matrix-inbox-card-cover'));eq(document.querySelector('.matrix-inbox-card-cover'),null);
  const person={id:'self',nickname:'QA本人',avatarUrl:'https://p1.byteimg.com/own.png'},group={id:'group',type:2,name:'QA群',peer:'wrong-peer'},privateThread={id:'dm',type:1,name:'QA对方',peer:'peer'};
  eq(inboxParties({sender:'member',senderName:'QA群成员',direction:'inbound'},group,person,'self').sender,'QA群成员');eq(inboxParties({sender:'member',direction:'inbound'},group,person,'self').sender,'昵称待同步');eq(inboxParties({sender:'member',direction:'inbound'},group,person,'self').receiver,'QA群（群聊）');
  eq(inboxParties({sender:'self',direction:'outbound'},privateThread,person,'self').receiver,'QA对方');eq(inboxParties({sender:'peer',direction:'inbound'},privateThread,person,'self').sender,'QA对方');eq(inboxParties({sender:'peer',direction:'inbound'},privateThread,person,'self').receiver,'QA本人（自己）');eq(document.querySelectorAll('[aria-label="消息收发双方"]').length>0,true);
  eq(requestLog.some(r => ['arm', 'resume'].includes(r.command)), false); eq(document.body.textContent.includes('已验证收到新消息'), false);
  const draft=value=>{const el=document.querySelector('[aria-label="私信回复正文"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));};
  eq(requestLog.filter(r=>r.command==='send').length,0);draft('QA reply one');await until(()=>!button('发送').disabled);button('发送').click();button('发送').click();await until(()=>document.body.textContent.includes('平台码 42'));eq(requestLog.filter(r=>r.command==='send').length,1);eq(document.querySelector('[aria-label="私信回复正文"]').value,'QA reply one');
  sendState='unknown';draft('QA reply two');await until(()=>!button('发送').disabled);button('发送').click();await until(()=>button('我已核对原会话'));eq(button('发送').disabled,true);eq(document.querySelector('[aria-label="私信回复正文"]').disabled,true);const sends=requestLog.filter(r=>r.command==='send').length;await poll();eq(requestLog.filter(r=>r.command==='send').length,sends);button('我已核对原会话').click();await until(()=>!document.querySelector('[aria-label="私信回复正文"]').disabled);
  sendState='confirmed';draft('QA reply three');await until(()=>!button('发送').disabled);button('发送').click();await until(()=>document.body.textContent.includes('QA 平台已确认发送'));eq(document.querySelector('[aria-label="私信回复正文"]').value,'');eq(requestLog.filter(r=>r.command==='send').every(r=>r.threadId==='thread-qa-a'&&r.accountId==='qa-a'),true);eq(new Set(requestLog.filter(r=>r.command==='send').map(r=>r.requestId)).size,3);
  accountId = 'qa-b'; render(); await until(() => !document.body.textContent.includes('QA会话-qa-a')); eq(document.querySelectorAll('.matrix-inbox-bubbles article').length, 0); eq(document.body.textContent.includes('QA会话-qa-b'), true);
  historyComplete = true; push = 'verification-required'; pushError = '抖音推送握手返回 HTTP 403'; render(true); await until(() => document.body.textContent.includes('新消息获取失败')); eq(document.body.textContent.includes('HTTP 403'), false); eq(statuses()[0].title.includes('HTTP 403'), true); eq(statuses()[0].title.includes('本轮可访问历史已到末页'), true); eq(document.body.textContent.includes('已验证收到新消息'), false);
  push = 'connected'; pushError = undefined; render(true); await until(() => statuses()[0]?.textContent.includes('已连接')); eq(statuses()[0].title.includes('HTTP 403'), false);
    eq(inboxAccountStatus({ error: '平台码 5' }).label, '获取失败'); eq(inboxAccountStatus({ error: '没有权限' }).label, '没有权限'); eq(inboxAccountStatus({ error: '缺少可用官方会话' }).label, '需要登录');
    eq(inboxAccountStatus({status:{error:'陌生人HTTP403',partialFailure:true}}).label,'部分来源失败，继续同步');eq(inboxAccountStatus({error:'当前绑定已变化',status:{error:'陌生人HTTP403',partialFailure:true}}).label,'获取失败');
  accountId = undefined; render(); await until(() => document.body.textContent.includes('QA已接入消息'));
  deferred = true; button('QA会话-qa-b').click(); await until(() => hold); owner = 'qa-other-owner'; render(); hold(); await until(() => !document.body.textContent.includes('QA已接入消息')); eq(document.querySelectorAll('.matrix-inbox-bubbles article').length, 0);
  eq([...preferences.values()].some(v => /QA已接入消息|QA reply/.test(String(v))), false); eq(requestLog.some(r => /read|enter/i.test(r.command)), false);eq(requestLog.filter(r=>r.command==='send').length,3);
  component.unmount(); window.matrixDesktop = undefined;
  window.setInterval = originalSetInterval; window.clearInterval = originalClearInterval;
  window.IntersectionObserver=OriginalObserver;
  return { checks, realReact: true, syntheticOnly: true, compactPerAccountStatus: true, diagnosticsInHoverOnly: true, manualDiagnosticControlsRemoved: true, crossOwnerLateMessagesBlocked: true, platformSelectionIsolated: true, noMessageBodiesInPreferences: true, realPlatformRequests: 0 };
}
module.exports = { run };
if (process.type === 'renderer') module.exports = { run };
else if (!process.versions.electron) { const { spawnSync } = require('node:child_process'), env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; const result = spawnSync(path.join(root, '.desktop-deps/node_modules/electron/dist/electron.exe'), [__filename], { cwd: root, windowsHide: true, env, encoding: 'utf8', timeout: 40000 }); process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || ''); process.exit(result.status ?? 1); }
else {
  const { app, BrowserWindow } = require('electron'), fs = require('node:fs'), os = require('node:os'); app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-inbox-ui-'))); app.commandLine.appendSwitch('mute-audio');
  app.whenReady().then(async () => { let win; const timer = setTimeout(() => { console.error('Offline inbox UI fixture deadline exceeded'); app.exit(1); }, 30000); try { win = new BrowserWindow({ show: false, width: 1300, height: 1000, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false } }); win.webContents.session.webRequest.onBeforeRequest((r, done) => done({ cancel: !r.url.startsWith('data:') })); await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<div id="root"></div>')); await win.webContents.insertCSS(fs.readFileSync(path.join(root, 'client/src/workspace.css'), 'utf8')); console.log(JSON.stringify(await win.webContents.executeJavaScript(`require(${JSON.stringify(__filename)}).run()`))); } catch (e) { console.error(e); process.exitCode = 1; } finally { clearTimeout(timer); win?.destroy(); app.exit(process.exitCode || 0); } });
}
