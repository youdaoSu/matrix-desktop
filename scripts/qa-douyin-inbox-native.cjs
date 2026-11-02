// Actual Electron preload/IPC, DPAPI and cookie events in a fresh QA profile.
// The network and socket are injected fixtures. No real platform/account access.
const path = require('node:path'), root = path.resolve(__dirname, '..');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process'), env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(path.join(root, '.desktop-deps/node_modules/electron/dist/electron.exe'), [__filename, ...process.argv.slice(2)], { cwd: root, windowsHide: true, env, encoding: 'utf8', timeout: 45000 }); process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || ''); process.exit(result.status ?? 1);
} else {
  const { app, BrowserWindow, ipcMain, session, safeStorage } = require('electron'), fs = require('node:fs'), os = require('node:os'), assert = require('node:assert/strict'), { EventEmitter } = require('node:events');
  let moduleRoot = root;
  if (process.argv[2]) { assert.equal(process.argv[2], '--packaged'); moduleRoot = path.join(root, 'release-next/win-unpacked/resources/app.asar'); assert.match(process.argv[3] || '', /^[a-f0-9]{64}$/); assert.equal(require('node:crypto').createHash('sha256').update(require('original-fs').readFileSync(moduleRoot)).digest('hex'), process.argv[3]); }
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-inbox-native-')); app.setPath('userData', userData); app.commandLine.appendSwitch('mute-audio');
  app.whenReady().then(async () => {
    let win, service, browserReader, checks = 0, networkCalls = 0, socket, sent = [], readClock = 10000, sendCalls = 0;const operationEvents=[];
    const eq = (a, b) => { assert.deepEqual(a, b); checks++; }, c = require(path.join(moduleRoot, 'desktop/douyin-inbox-codec.cjs'));
    const account = { id: '00000000-0000-4000-8000-000000000001', platform: 'douyin', nativeAccountKey: 'qa-native-handle', connectorSessionId: '00000000-0000-4000-8000-000000000002' }, own = '9007199254740993', peer = '9007199254740995', id = `0:1:${own}:${peer}`;
    const message = n => ({ conversationId: id, conversationShortId: '9007199254740999', conversationType: 1, sender: peer, serverMessageId: String(9007199254740000000n + BigInt(n)), messageType: 7, content: JSON.stringify({ text: `QA 隔离消息 ${n}` }), indexInConversationV2: String(n), createTime: '1792512000' });
    class Socket extends EventEmitter { constructor() { super(); socket = this; this.readyState = 1; setImmediate(() => this.emit('open')); } send(bytes) { sent.push(bytes); } terminate() { this.readyState = 3; this.emit('close'); } close() { this.terminate(); } }
    try {
      const isolated = session.fromPartition('persist:matrix-douyin-' + account.connectorSessionId); isolated.webRequest.onBeforeRequest((_r, done) => done({ cancel: true }));
      await isolated.cookies.set({ url: 'https://www.douyin.com/', domain: '.douyin.com', name: 'sessionid', value: 'qa-native-private-cookie', path: '/', secure: true });
      win = new BrowserWindow({ show: false, webPreferences: { preload: path.join(moduleRoot, 'desktop/preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
      const authenticate = async (token, accountId) => { assert.equal(token, 'qa-token'); assert.equal(accountId, account.id); return { userId: 'qa-native-owner', account }; };
      const peerUser = { uid: peer, sec_uid: 'MS4wQaNativePeer', nickname: 'QA 原生联系人昵称', avatar_thumb: { url_list: ['https://image.fixture.test/peer'] } };
      const factory = options => require(path.join(moduleRoot, 'desktop/douyin-inbox-transport.cjs')).createTransport({ ...options, Socket, network: async (url, options) => {
        networkCalls++; const pathname = new URL(url).pathname;
        if (pathname.endsWith('/im/user/info/')) return Buffer.from(JSON.stringify({ status_code: 0, data: [peerUser] }));
        if (pathname.endsWith('/user/follower/list/')) return Buffer.from(JSON.stringify({ status_code: 0, followers: [peerUser], has_more: 0, total: 1, myself_user_id: own }));
        if (pathname.endsWith('/aweme/post/')) return Buffer.from(JSON.stringify({ status_code: 0, aweme_list: [{ aweme_id: '9007199254740000100', author: { uid: own }, desc: 'QA 本人作品' }], has_more: 0, max_cursor: '0' }));
        if (pathname.endsWith('/comment/list/')) return Buffer.from(JSON.stringify({ status_code: 0, comments: [{ cid: '9007199254740000200', aweme_id: '9007199254740000100', text: 'QA 原生评论', user: peerUser }], has_more: 0, cursor: '1' }));
        if (!options.body) return Buffer.from(JSON.stringify(pathname === '/aweme/v1/web/query/user/' ? { status_code: 0, user_uid: own, id: '18446744073709551614' } : { status_code: 0, user: { uid: own, unique_id: account.nativeAccountKey, sec_uid: 'MS4wQaNativeOwn' } }));
        const req = c.decode('Request', options.body);
        if(req.cmd===100){sendCalls++;eq(pathname,'/v1/message/send');eq(req.body.sendMessageBody.conversationId,id);eq(JSON.parse(req.body.sendMessageBody.content).text,'QA explicit native reply');return c.encode('Response',{cmd:100,sequenceId:req.sequenceId,statusCode:0,body:{sendMessageBody:{clientMessageId:req.body.sendMessageBody.clientMessageId,status:0,serverMessageId:'9007199254740800001'}}});}
        assert.ok([203, 301, 2047].includes(req.cmd)); const name = { 203: 'messagesPerUserInitV2Body', 301: 'messagesInConversationBody', 2047: 'getRecentStrangerMessage' }[req.cmd];
        const body = req.cmd === 203 ? { conversations: [{ conversationId: id, conversationShortId: '9007199254740999', conversationType: 1, badgeCount: 4, firstPageParticipants: { participants: [{ userId: peer, secUid: peerUser.sec_uid }] } }], hasMore: false, nextCursor: '0' } : req.cmd === 2047 ? { hasMore: false, nextStrangerVersion: '0', messages: [] } : { messages: [message(1), message(2)], hasMore: false, nextCursor: '0' };
        return c.encode('Response', { cmd: req.cmd, sequenceId: req.sequenceId, statusCode: 0, body: { [name]: body } });
      } });
      service = require(path.join(moduleRoot, 'desktop/douyin-inbox.cjs')).registerDouyinInbox({ ipcMain, getWindow: () => win, authenticate, session, safeStorage, userData, transportFactory: factory,onMessage:event=>operationEvents.push(event),imageLoader:async(descriptor,guard)=>{coverLoads++;eq(descriptor.urls,['https://p1.byteimg.com/qa-shared-cover']);await guard();return{dataUrl:'data:image/png;base64,'+fixturePng.toString('base64'),bytes:fixturePng.length};} });
      let collector, fixtureRequests = 0;
      const websiteData = {
        self: { statusCode: 0, user: { uid: own, uniqueId: account.nativeAccountKey, secUid: 'MS4wQaNativeOwn' } },
        followers: { statusCode: 0, followList: [peerUser], hasMore: false, total: 1 },
        works: { statusCode: 0, awemeList: [{ awemeId: '9007199254740000100', author: { uid: own }, desc: 'QA 本人作品' }], hasMore: false, maxCursor: '0' },
        comments: { statusCode: 0, comments: [{ cid: '9007199254740000200', awemeId: '9007199254740000100', text: 'QA 原生评论', user: peerUser, image_list:[{origin_url:{url_list:['https://p1.byteimg.com/qa-comment']}}] }], hasMore: false, cursor: '1' },
      };
      const { createBrowserReader, endpoints, blockedRequest } = require(path.join(moduleRoot, 'desktop/douyin-browser-reader.cjs'));
      const websiteHtml = '<script>const data=' + JSON.stringify(websiteData) + ',routes=' + JSON.stringify(endpoints) + ';const modules={},factories={};for(const [key,route] of Object.entries(routes)){if(["self","works","comments"].includes(key))continue;modules[key]={read:new Function("data",`return async function(args){const route=${JSON.stringify(route)};return data[${JSON.stringify(key)}];}`)(data)};factories[key]=new Function(`return ${JSON.stringify(route)}`)}const runtime=key=>modules[key];runtime.m=factories;window.webpackChunkdouyin_web=[];window.webpackChunkdouyin_web.push=row=>row[2](runtime);</script><h1>Offline owned profile fixture</h1><div data-e2e="user-post-list"><ul data-e2e="scroll-list"><li><a href="/video/9007199254740000100">QA own work</a></li></ul><div>没有更多作品</div></div>';
      isolated.protocol.handle('https', req => { fixtureRequests++; const u = new URL(req.url), p = u.pathname; assert.ok(['/user/self', endpoints.self, endpoints.works, endpoints.comments].includes(p)); const kind = Object.keys(endpoints).find(k => endpoints[k] === p); if (kind === 'works') { eq(u.searchParams.get('sec_user_id'), 'MS4wQaNativeOwn'); eq(u.searchParams.get('max_cursor'), '0'); } if (kind === 'comments') eq(u.searchParams.get('aweme_id'), '9007199254740000100'); return new Response(p === '/user/self' ? websiteHtml : JSON.stringify(websiteData[kind]), { headers: { 'content-type': p === '/user/self' ? 'text/html; charset=utf-8' : 'application/json' } }); });
      browserReader = createBrowserReader({
        createSession(){throw Error('Must not create a cookie-only reader context');},
        createWindow(s) { eq(s,isolated);collector = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { session: s, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } }); return collector; },
      });
      let imageLoads=0,coverLoads=0;const fixturePng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zy8QAAAAASUVORK5CYII=','base64');
      require(path.join(moduleRoot, 'desktop/douyin-interactions.cjs')).registerDouyinInteractions({ ipcMain, getWindow: () => win, authenticate, session, safeStorage, userData, transportFactory: browserReader.acquire, now: () => readClock,interactionImageLoader:async(descriptor,guard)=>{imageLoads++;eq(descriptor.urls,['https://p1.byteimg.com/qa-comment']);await guard();return{dataUrl:'data:image/png;base64,'+fixturePng.toString('base64'),bytes:fixturePng.length};} });
      await win.loadURL('data:text/html,<h1>Offline private chat fixture</h1>');
      const call = input => win.webContents.executeJavaScript(`window.matrixDesktop.douyinInbox(${JSON.stringify({ command: 'watch', accessToken: 'qa-token', accountId: account.id, ...input })})`);
      let state; for (let n = 0; n < 100; n++) { state = await call({}); if (state.status?.historyComplete) break; await new Promise(r => setTimeout(r, 30)); }
      eq(state.status.historyComplete, true); eq(state.status.messageCount, 2); eq(state.status.unread, 4); eq(state.status.pushVerifiedAt, undefined);
      eq(state.threads[0].name, peerUser.nickname); eq(state.threads[0].avatarUrl, peerUser.avatar_thumb.url_list[0]);
      const sendId=require('node:crypto').randomUUID();eq(sendCalls,0);
      const sendInput={command:'send',threadId:id,text:'QA explicit native reply',requestId:sendId};
      const sentReceipt=await call(sendInput);eq(sentReceipt.receipt?.state,'confirmed');eq(sentReceipt.receipt?.messageId,'9007199254740800001');eq(sendCalls,1);eq((await call(sendInput)).receipt.state,'confirmed');eq(sendCalls,1);eq((await call({command:'watch'})).status.unread,4);
      eq((await call({...sendInput,requestId:require('node:crypto').randomUUID(),threadId:'0:1:111:222'})).receipt,undefined);eq(sendCalls,1);
      const operationsBinding=JSON.stringify(['qa-native-owner',account.id,'douyin',account.connectorSessionId,account.nativeAccountKey]);
      const operationsView=service.operationsView('qa-native-owner',account.id,operationsBinding);eq(operationsView.ownUid,own);eq(operationsView.threads()[0].peer,peer);eq(operationsView.messages(id).length,2);eq(operationEvents.length,0);
      assert.throws(()=>service.operationsView('other-owner',account.id,operationsBinding),/账号/);checks++;
      const interaction = input => win.webContents.executeJavaScript(`window.matrixDesktop.douyinInteractions(${JSON.stringify({ accessToken: 'qa-token', accountId: account.id, ...input })})`);
      const fans = await interaction({ kind: 'followers' }); eq(fans.records.length, 1); eq(fans.records[0].author, peerUser.nickname); eq(fans.complete, true);
      readClock += 5000; const works = await interaction({ kind: 'comments' }); eq(works.progress.worksFound, 1); eq(works.complete, false);
      readClock += 5000; const comments = await interaction({ kind: 'comments', cursor: works.nextCursor }); eq(comments.records[0].content, 'QA 原生评论'); eq(comments.records[0].platformId, '9007199254740000200'); eq(comments.complete, true);
      const imageInput={accessToken:'qa-token',accountId:account.id,kind:'comments',recordId:comments.records[0].platformId,workId:'9007199254740000100',target:'comment-image',imageIndex:0},preview=()=>win.webContents.executeJavaScript(`window.matrixDesktop.douyinInteractionImage(${JSON.stringify(imageInput)})`);
      const picture=await preview();eq(picture.attachment.bytes,fixturePng.length);eq(imageLoads,1);eq((await preview()).attachment.bytes,fixturePng.length);eq(imageLoads,1);const imageFiles=fs.readdirSync(path.join(userData,'douyin-interaction-images'));eq(imageFiles.length,1);eq(fs.readFileSync(path.join(userData,'douyin-interaction-images',imageFiles[0])).includes(Buffer.from(picture.attachment.dataUrl)),false);eq(safeStorage.decryptString(fs.readFileSync(path.join(userData,'douyin-interaction-images',imageFiles[0]))).includes('data:image/png'),true);
      const beforeCache = fixtureRequests, cachedComments = await interaction({ kind: 'comments', command: 'cache' }); eq(cachedComments.fromCache, true); eq(cachedComments.records[0].content, 'QA 原生评论'); eq(cachedComments.works[0].title, works.works[0].title); eq(fixtureRequests, beforeCache);
      const commentFiles = fs.readdirSync(path.join(userData, 'douyin-interactions')); eq(commentFiles.length, 2); eq(commentFiles.some(name => fs.readFileSync(path.join(userData, 'douyin-interactions', name)).includes(Buffer.from('QA 原生评论'))), false);
      eq(collector.webContents.isAudioMuted(), true); eq(collector.isVisible(), false); eq(collector.getBounds().width, 1280);
      // The owned DOM and optional webpack work export can both be absent.
      // Exercise the ordinary same-origin read in the bound QA account session.
      await collector.webContents.executeJavaScript('document.querySelector("[data-e2e=user-post-list]").remove(); window.__matrixOwnedPostInventory=undefined;');
      readClock += 5000; const directWorks = await interaction({ kind: 'comments' }); eq(directWorks.progress.worksFound, 1); eq(directWorks.complete, false);
      // Electron custom protocol fixtures bypass WebRequest. Exercise the real
      // request blocker separately on a fresh default-protocol session; every
      // attempted URL must be cancelled BEFORE any network transport occurs.
      const policySession = session.fromPartition('qa-policy-' + Date.now()); let policyBlocks = 0;
      policySession.webRequest.onBeforeRequest((d, cb) => { const cancel = blockedRequest(d); if (cancel) policyBlocks++; cb({ cancel }); });
      const policyWindow = new BrowserWindow({ show: false, webPreferences: { session: policySession, sandbox: true, contextIsolation: true, nodeIntegration: false } });
      try {
        await policyWindow.loadURL('data:text/html,<h1>Read policy fixture</h1>');
        await policyWindow.webContents.executeJavaScript(`Promise.all([fetch('https://imapi.douyin.com/inbox'),fetch('https://www.douyin.com/mark_read'),fetch('https://www.douyin.com/a',{method:'POST'}),fetch('https://www.douyin.com/aweme/v1/web/notice/list/'),fetch('https://www.douyin.com/aweme/v1/web/notification/read/')].map(p=>p.catch(()=>null)))`);
        eq(policyBlocks, 5); eq(fixtureRequests, 15);
      } finally { policyWindow.destroy(); }
      // A subsequent lighter response omits the unchanged comment's attachment.
      // Both the IPC live reply and durable cache must retain the known image.
      delete websiteData.comments.comments[0].image_list;readClock+=5000;
      const lightComments=await interaction({kind:'comments',cursor:directWorks.nextCursor});eq(lightComments.records[0].images,[{urls:['https://p1.byteimg.com/qa-comment']}]);eq((await interaction({kind:'comments',command:'cache'})).records[0].images,lightComments.records[0].images);
      eq((await interaction({ kind: 'messages' })).records, undefined); eq((await interaction({ kind: 'followers', url: 'https://other.fixture.test' })).records, undefined);
      const read = await call({ command: 'messages', threadId: id }); eq(read.messages.length, 2); eq(read.messages[1].id, '9007199254740000002'); eq(read.status.unread, 4); eq(read.messages[0].rawContent, undefined);
      const files = fs.readdirSync(path.join(userData, 'douyin-inbox')).filter(name => !name.endsWith('.owner.bin')); eq(files.length, 1); const encrypted = fs.readFileSync(path.join(userData, 'douyin-inbox', files[0])); eq(encrypted.includes(Buffer.from('QA 隔离消息')), false); assert.ok(safeStorage.decryptString(encrypted).includes('QA 隔离消息')); checks++;
      const armed = await call({ command: 'arm' }), marker = armed.status.verificationMarker;
      // Reproduce the real receive-stage shape without real contents/profile:
      // unknown encoding on an opaque JSON event must not block later PB chat.
      socket.emit('message', c.encode('Frame', { frameType: 1, payloadType: 'text/json', payloadEncoding: 'qa-opaque-label', payload: Buffer.from('qa-native-opaque-control') }), true);
      for (let n = 0; n < 100; n++) { state = await call({}); if (state.status?.unsupportedEvents === 1) break; await new Promise(r => setTimeout(r, 15)); }
      eq(state.status.unsupportedEvents, 1); eq(state.status.push, 'connected'); eq(state.status.messageCount, 2); eq(state.status.pushVerifiedAt, undefined);
      const preserved = JSON.parse(safeStorage.decryptString(fs.readFileSync(path.join(userData, 'douyin-inbox', files[0]))));
      const event = c.decode('Frame', Buffer.from(preserved.protocolEvents[0].frame, 'base64'));
      eq(event.payloadEncoding, 'qa-opaque-label'); eq(event.payload.toString(), 'qa-native-opaque-control');
      const push = { ...message(3), content: JSON.stringify({ text: marker }) };
      socket.emit('message', c.encode('Frame', { seqid: '9007199254740998', logid: '9007199254740999', service: 1, method: 1, headers: [{ key: 'need_ack', value: '1' }], payloadType: 'pb', payload: c.encode('Response', { cmd: 500, body: { hasNewMessageNotify: { message: push, badgeCount: 5 } } }) }), true);
      for (let n = 0; n < 100; n++) { state = await call({}); if (state.status?.pushVerifiedAt) break; await new Promise(r => setTimeout(r, 15)); }
      eq(state.status.messageCount, 3); assert.ok(state.status.pushVerifiedAt); checks++; eq(state.status.unread, 5);
      eq(operationEvents.length,1);eq(operationEvents[0].message.knownSender,true);eq(operationEvents[0].message.rawContent,undefined);eq(operationEvents[0].message.type,1);eq(operationEvents[0].ownUid,own);
      eq(sent.filter(x => typeof x !== 'string').length, 1); const ack = c.decode('Frame', sent[0]); eq(ack.payload, undefined); eq(ack.logid, '9007199254740999');
      const card={...message(4),messageType:8,content:JSON.stringify({aweme_id:'9007199254740000100',content_title:'QA分享作品',cover_url:{url_list:['https://p1.byteimg.com/qa-shared-cover']}})};
      socket.emit('message',c.encode('Frame',{payloadType:'pb',payload:c.encode('Response',{cmd:500,body:{hasNewMessageNotify:{message:card}}})}),true);
      for(let n=0;n<100;n++){state=await call({});if(state.status?.messageCount===4)break;await new Promise(r=>setTimeout(r,15));}eq(state.status.messageCount,4);
      const coverInput={command:'attachment',threadId:id,messageId:card.serverMessageId};const cover=await call(coverInput);eq(cover.attachment?.bytes,fixturePng.length);eq(coverLoads,1);eq((await call(coverInput)).attachment?.bytes,fixturePng.length);eq(coverLoads,1);
      const coverFiles=fs.readdirSync(path.join(userData,'douyin-inbox-images')).filter(name=>name.endsWith('.bin'));eq(coverFiles.length,1);const coverDisk=fs.readFileSync(path.join(userData,'douyin-inbox-images',coverFiles[0]));eq(coverDisk.includes(Buffer.from(cover.attachment.dataUrl)),false);eq(safeStorage.decryptString(coverDisk).includes('data:image/png'),true);
      eq((await call({ command: 'mark-read' })).status, undefined); eq((await call({ command: 'watch', url: 'https://example.invalid' })).status, undefined);
      await call({ command: 'stop' }); state = await call({}); for (let n = 0; n < 100 && (state.status?.busy || state.status?.unread !== 4); n++) { await new Promise(r => setTimeout(r, 15)); state = await call({}); }
      eq(state.status.messageCount, 4); eq(state.status.unread, 4); // Server snapshot, not cleared by local selection.
      await isolated.cookies.set({ url: 'https://www.douyin.com/', domain: '.douyin.com', name: 'sessionid', value: 'qa-changed-cookie', path: '/', secure: true }); await new Promise(r => setTimeout(r, 40));
      state = await call({}); assert.match(state.error, /登录已变化/); checks++;
      // Real DPAPI archive survives service recreation and a hanging/failed
      // platform connection. Cached messages return BEFORE that request settles.
      service.close(); ipcMain.removeHandler('matrix:douyin-inbox'); let rejectNetwork;
      service = require(path.join(moduleRoot, 'desktop/douyin-inbox.cjs')).registerDouyinInbox({ ipcMain, getWindow: () => win, authenticate, session, safeStorage, userData, transportFactory: () => new Promise((_resolve, reject) => { rejectNetwork = reject; }),imageLoader:async()=>{throw Error('QA cached cover must not request network');} });
      state = await call({}); eq(state.status.messageCount, 4); eq(state.threads.length, 1); eq(typeof rejectNetwork, 'function');
      const offline = await call({ command: 'messages', threadId: id }); eq(offline.messages.length, 4); eq(offline.messages[0].rawContent, undefined);
      eq(offline.messages.find(m=>m.id===card.serverMessageId).contentKind,'card');eq((await call(coverInput)).attachment?.dataUrl,cover.attachment.dataUrl);eq(coverLoads,1);
      rejectNetwork(Error('抖音网络连接失败')); await new Promise(r => setTimeout(r, 20)); state = await call({}); eq(state.error, '抖音网络连接失败'); eq(state.status.messageCount, 4); eq(state.threads.length, 1);
      eq((await call({ command: 'messages', threadId: id })).messages.length, 4);
      const crypto=require('node:crypto'),protocolDirectory=path.join(userData,'qa-encrypted-protocol-events'),archiveOptions={directory:protocolDirectory,key:'d'.repeat(64),protect:text=>safeStorage.encryptString(text),unprotect:bytes=>safeStorage.decryptString(bytes)};
      const protocolArchive=require(path.join(moduleRoot,'desktop/douyin-protocol-archive.cjs')).createProtocolArchive(archiveOptions),protocolBytes=c.encode('Frame',{payloadType:'text/json',payload:Buffer.from('QA_DPAPI_PROTOCOL_EVENT')});
      const protocolEvent={at:Date.now(),cmd:-1,hash:crypto.createHash('sha256').update(protocolBytes).digest('hex'),frame:protocolBytes.toString('base64'),normalized:true};
      eq(protocolArchive.append(protocolEvent),true);eq(protocolArchive.count(),1);const protocolFile=path.join(protocolDirectory,'events-'+archiveOptions.key,'000.bin'),protocolDisk=fs.readFileSync(protocolFile);eq(protocolDisk.includes(Buffer.from(protocolEvent.frame)),false);eq(JSON.parse(safeStorage.decryptString(protocolDisk)).events[0].hash,protocolEvent.hash);eq(require(path.join(moduleRoot,'desktop/douyin-protocol-archive.cjs')).createProtocolArchive(archiveOptions).append(protocolEvent),false);
      console.log(JSON.stringify({ checks, realElectronPreload: true, dpapiEncrypted: true, nativeCookieChangeStopsConnection: true, syntheticPushVerified: true, realIncomingPushVerified: false, networkCalls, realPlatformRequests: 0, syntheticBusinessSends:sendCalls, realBusinessSends: 0, markReadRequests: 0, profile: 'fresh-disposable-only' }));
    } catch (e) { console.error(e); process.exitCode = 1; }
    finally { browserReader?.close(); service?.close(); ipcMain.removeHandler('matrix:douyin-interactions'); win?.destroy(); app.exit(process.exitCode || 0); }
  });
}
