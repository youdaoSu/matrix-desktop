const { createTransport } = require('./douyin-inbox-transport.cjs');
const { boundArchive } = require('./douyin-inbox-cache.cjs');
const { createEngine } = require('./douyin-inbox-engine.cjs');
function initializationFailure(error,stage){
  if(!['transport','archive','engine'].includes(stage)||!['TypeError','RangeError','SyntaxError'].includes(error?.name))return;
  // Do not expose exception messages, absolute paths, account IDs or URLs.
  const frames=typeof error.stack==='string'?error.stack.split('\n').slice(1,12):[];
  const source=frames.map(line=>/[/\\](douyin-inbox(?:-(?:transport|codec|store|cache|engine|index))?\.cjs):(\d{1,6}):\d{1,6}\)?$/.exec(line.trim())).find(Boolean);
  const code=['ERR_INVALID_ARG_TYPE','ERR_INVALID_ARG_VALUE','ERR_INVALID_URL','ERR_INVALID_CHAR','ERR_HTTP_INVALID_HEADER_VALUE','ERR_INVALID_PROTOCOL'].includes(error.code)?error.code:undefined;
  const argument=typeof error.message==='string'?/The "(url|input|options|options\.agent|agent|signal|listener|headers|timeout)" (?:argument|property)/.exec(error.message)?.[1]:undefined;
  return `私信初始化程序异常（阶段：${stage}；${error.name}${code?'；代码：'+code:''}${argument?'；参数：'+argument:''}${source?'；位置：'+source[1]+':'+source[2]:''}），本地存档保留`;
}
function registerDouyinInbox({ ipcMain, getWindow, authenticate, session, safeStorage, userData, transportFactory = createTransport, imageLoader = require('./douyin-inbox-media.cjs').loadImage, displayImageCache,diagnostics,historyPaused=()=>false,onMessage=()=>{} }) {
  const connections = new Map(), starts = new Map(), closing = new Map();
  let closed = false;
  const assertOpen = () => { if (closed) throw Error('抖音聊天读取已结束'); };
  const imageDisk=displayImageCache||require('./douyin-display-image-cache.cjs').createSecureDisplayImageCache({directory:require('node:path').join(userData,'douyin-inbox-images'),safeStorage});
  const identity = value => JSON.stringify([value.userId, value.account.id, value.account.connectorSessionId, value.account.nativeAccountKey]);
  const shutdown = key => {
    const e=connections.get(key);if(!e)return closing.get(key);
    e.stopped=true;connections.delete(key);
    const drain=Promise.all([closing.get(key),e.engine?.close()]).then(()=>{});closing.set(key,drain);
    void drain.finally(()=>{if(closing.get(key)===drain)closing.delete(key);});return drain;
  };
  const timer = setInterval(() => { for (const [k, e] of connections) if (Date.now() - e.heartbeat > 30000) shutdown(k); }, 5000); timer.unref?.();
  const safeError = (e,stage) => initializationFailure(e,stage) || (typeof e?.message === 'string' && e.message.length <= 240 && /[\u4e00-\u9fff]/.test(e.message) && !/(?:cookie|token|sessionid|authorization|password|https?:)/i.test(e.message) ? e.message : '抖音聊天接入失败，原有存档保留；请检查网络或账号管理中的官方登录');
  ipcMain.handle('matrix:douyin-inbox', async (event, input) => {
    let sendStarted = false;
    try {
      assertOpen();
      const win = getWindow(); if (!win || win.isDestroyed() || event.sender !== win.webContents) throw Error('只允许远效主窗口读取聊天');
      if (!input || typeof input !== 'object' || Object.keys(input).some(k => !['command', 'accessToken', 'accountId', 'threadId', 'before', 'messageId', 'text', 'requestId'].includes(k)) || !['watch', 'resume', 'stop', 'messages', 'arm', 'attachment', 'send'].includes(input.command) || input.command !== 'send' && (input.text !== undefined || input.requestId !== undefined)) throw Error('不支持的抖音聊天操作');
      const auth = await authenticate(input.accessToken, input.accountId), account = auth.account;
      // Authentication may finish after normal lifecycle close. Never let that
      // late result create an owner index, collector, socket or send operation.
      assertOpen();
      if (account.platform !== 'douyin' || !/^[a-f0-9-]{16,80}$/i.test(account.connectorSessionId || '') || !account.nativeAccountKey) throw Error('请选择已绑定的抖音账号；需要登录请到账号管理');
      const key = `${auth.userId}/${account.id}`, binding = identity(auth);
      if (connections.get(key)?.binding !== binding) shutdown(key);
      if (input.command === 'stop') { shutdown(key); return { stopped: true }; }
      let entry = connections.get(key);
      if (input.command === 'resume' && entry?.error) { shutdown(key); entry = undefined; }
      if (entry?.error && !entry.refreshing && Date.now() - entry.failedAt > 60000) { shutdown(key); entry = undefined; }
      if (!entry) {
        if (!starts.has(key)) {
          const creating = (async () => {
            const item = { binding, token: input.accessToken, heartbeat: Date.now(), stopped: false, refreshing: true }; connections.set(key, item);
            // A stopped engine may still be finishing an atomic disk write.
            // Publish this cancellable entry before waiting, but do not reopen
            // the archive until every preceding writer has drained.
            await closing.get(key);assertOpen();
            if(item.stopped||connections.get(key)!==item)throw Error('抖音聊天当前用户连接已结束');
            const assertCurrent = async () => {
              if (closed || item.stopped || connections.get(key) !== item || Date.now() - item.heartbeat > 30000) throw Error('抖音聊天当前用户连接已结束');
              const next = await authenticate(item.token, account.id);
              assertOpen();
              if (item.stopped || connections.get(key) !== item || Date.now() - item.heartbeat > 30000) throw Error('抖音聊天当前用户连接已结束');
              if (identity(next) !== binding) { item.stopped = true; item.engine?.close(); throw Error('抖音绑定身份已改变，旧聊天连接已停止'); }
            };
            const options = { userData, safeStorage, binding, userId: auth.userId, accountId: account.id };
            const report=({stage,error})=>{try{diagnostics?.record(binding,{kind:'messages',stage,code:require('./douyin-sync-diagnostics.cjs').classifySyncFailure(error)});}catch{}};
            const observe=({stage,code,stats})=>{try{diagnostics?.record(binding,{kind:'messages',stage,code,stats});}catch{}};
            try {
              const cached = boundArchive(options);
              if (cached) {item.ownUid=cached.ownUid;item.engine = createEngine({ transport: { ownUid: cached.ownUid, close() {} }, store: cached.store, assertCurrent });}
            } catch (e) { report({stage:'cache',error:e});item.error = safeError(e); item.failedAt = Date.now(); item.refreshing = false; return item; }
            const initialize = async () => {
              let transport,stage='transport';
              try {
                transport = await transportFactory({ accountSession: session.fromPartition(`persist:matrix-douyin-${account.connectorSessionId}`), publicHandle: account.nativeAccountKey, assertCurrent, onInvalidated() { item.stopped = true; item.engine?.close(); item.error = '抖音官方登录已变化，将自动重新核验后接入'; item.failedAt = Date.now() - 55000; } });
                await assertCurrent();
                stage='archive';const { store } = boundArchive({ ...options, ownUid: transport.ownUid });
                stage='engine';
                await item.engine?.close();await assertCurrent();item.ownUid=transport.ownUid; item.engine = createEngine({ transport, store, assertCurrent,onFailure:report,onObservation:observe,paused:historyPaused,onMessage:message=>onMessage({userId:auth.userId,account,ownUid:transport.ownUid,message}) }); item.error = ''; item.engine.start();
              } catch (e) { report({stage:'initialize',error:e});transport?.close(); item.error = safeError(e,stage); item.failedAt = Date.now(); }
              finally { item.refreshing = false; }
            };
            // Cached UI reads do not wait for an HTTP timeout. Only the first
            // ever connection must obtain a fresh exact owner before returning.
            if (item.engine) void initialize(); else await initialize();
            return item;
          })();
          starts.set(key, creating); const finished = () => { if (starts.get(key) === creating) starts.delete(key); }; void creating.then(finished, finished);
        }
        entry = await starts.get(key);
      }
      assertOpen();
      if (connections.get(key) !== entry || entry.binding !== binding) throw Error('抖音账号已切换，未返回旧账号内容');
      entry.token = input.accessToken; entry.heartbeat = Date.now();
      if (entry.error && !entry.engine) return { accountId: account.id, sessionId: account.connectorSessionId, error: entry.error };
      if (input.command === 'send') {
        if (typeof input.threadId !== 'string' || input.threadId.length > 160 || input.before !== undefined || input.messageId !== undefined) throw Error('私信发送会话参数无效');
        sendStarted = true;
        const receipt = await entry.engine.sendText(input.threadId, input.text, input.requestId);
        const fresh = await authenticate(input.accessToken, account.id);
        if (identity(fresh) !== binding || connections.get(key) !== entry || entry.stopped) return { error: '账号已变化，发送结果未确认；请核对原会话，勿重复发送' };
        return { accountId: account.id, sessionId: account.connectorSessionId, receipt };
      }
      if (input.command === 'attachment') {
        if(typeof input.threadId!=='string'||input.threadId.length>160||typeof input.messageId!=='string'||!/^[1-9]\d{0,18}$/.test(input.messageId)||input.before!==undefined)throw Error('图片消息编号无效');
        const descriptor=entry.engine.attachment(input.threadId,input.messageId);
        const guard=async()=>{const fresh=await authenticate(input.accessToken,account.id);if(identity(fresh)!==binding||connections.get(key)!==entry||entry.stopped)throw Error('账号已变化，图片结果已丢弃');if(entry.engine.attachment(input.threadId,input.messageId).fingerprint!==descriptor.fingerprint)throw Error('消息已变化，图片结果已丢弃');};
        const mediaKey=input.threadId+'/'+input.messageId+'/'+descriptor.fingerprint;
        const imageScope=JSON.stringify([binding,entry.ownUid]);let cacheWarning;
        entry.images ||= new Map();entry.imageBytes ||= 0;
        if(entry.images.has(mediaKey)){await guard();return {accountId:account.id,sessionId:account.connectorSessionId,attachment:entry.images.get(mediaKey)};}
        try{const saved=await (imageDisk.getAsync||imageDisk.get).call(imageDisk,imageScope,descriptor.fingerprint,guard);if(saved){await guard();return {accountId:account.id,sessionId:account.connectorSessionId,attachment:saved};}}catch{cacheWarning='本机图片缓存无法读取，原文件保留；本次仅临时预览';}
        if((entry.imageReads||0)>=2)throw Error('图片预览队列繁忙，请稍后重试');
        entry.imageReads=(entry.imageReads||0)+1;
        try{let attachment=await imageLoader(descriptor,guard);await guard();attachment=require('./douyin-display-image-cache.cjs').imageValue(attachment);if(!cacheWarning)try{await (imageDisk.putAsync||imageDisk.put).call(imageDisk,imageScope,descriptor.fingerprint,attachment,guard);}catch{cacheWarning='图片已读取，但本机加密缓存未保存；原有文件保留';}await guard();if(cacheWarning)attachment={...attachment,cacheWarning};while(entry.imageBytes+attachment.bytes>32*1024*1024&&entry.images.size){const oldest=entry.images.keys().next().value;entry.imageBytes-=entry.images.get(oldest).bytes;entry.images.delete(oldest);}entry.images.set(mediaKey,attachment);entry.imageBytes+=attachment.bytes;return {accountId:account.id,sessionId:account.connectorSessionId,attachment};}finally{entry.imageReads--;}
      }
      if (input.command === 'resume' && !entry.refreshing && !entry.error) entry.engine.resume();
      if (input.command === 'watch' && !entry.refreshing && !entry.error) entry.engine.poll?.();
      if (input.command === 'arm') entry.engine.arm();
      let messages;
      if (input.command === 'messages') {
        if (typeof input.threadId !== 'string' || input.threadId.length > 160 || input.before !== undefined && (typeof input.before !== 'string' || !/^\d{1,19}$/.test(input.before))) throw Error('抖音本机聊天分页参数无效');
        messages = entry.engine.messages(input.threadId, input.before);
      }
      const result = { accountId: account.id, sessionId: account.connectorSessionId, error: input.command === 'messages' ? undefined : entry.error || undefined, status: entry.engine.status(), threads: input.command === 'messages' ? undefined : entry.engine.threads(), ...messages };
      if(input.command==='watch')result.reviewedReceipts=entry.engine.reviewedReceipts?.();
      const after = await authenticate(input.accessToken, account.id);
      if (identity(after) !== binding || connections.get(key) !== entry || entry.stopped) throw Error(entry.stopped && entry.error || '抖音账号连接已变化，未返回旧账号消息');
      return result;
    } catch (e) { return { error: sendStarted ? '发送结果未确认：' + safeError(e) + '；请核对原会话，勿重复发送' : safeError(e) }; }
  });
  let closeTask;
  return {
    operationsRoute(userId,accountId,binding,peer){
      if(typeof peer!=='string'||!/^[1-9]\d{0,18}$/.test(peer))throw Error('评论私信接收人编号无效');
      const view=this.operationsView(userId,accountId,binding),targets=view.threads().filter(t=>t.type===1&&t.peer===peer);if(targets.length>1)throw Error('同账号存在多个无法唯一核对的单聊，未选择其他会话');return{route:targets.length===1?'native':'dom',ownUid:view.ownUid};
    },
    operationsView(userId,accountId,binding) {
      const key=`${userId}/${accountId}`,entry=connections.get(key);
      let expected;
      try{const parts=JSON.parse(binding);if(!Array.isArray(parts)||parts.length!==5||parts[0]!==userId||parts[1]!==accountId||parts[2]!=='douyin')throw Error();expected=JSON.stringify([parts[0],parts[1],parts[3],parts[4]]);}catch{throw Error('互动账号绑定范围无效，未发送');}
      // Operations use a currently verified native connection, never a caller
      // supplied recipient or a cached archive masquerading as a live session.
      const check=()=>{if(closed||!entry||entry.stopped||entry.refreshing||entry.error||connections.get(key)!==entry||entry.binding!==expected||!entry.engine||Date.now()-entry.heartbeat>30000)throw Error('同账号私信连接尚未就绪，未发送');};
      check();return {ownUid:entry.ownUid,reviewedProofs(){check();return entry.engine.reviewedProofs?.()||[];},contactEvidence(fans){check();return entry.engine.contactEvidence(fans);},threads(){check();return entry.engine.threads();},messages(threadId){check();const t=entry.engine.threads().find(t=>t.id===threadId&&t.type===1);if(!t)throw Error('请选择当前账号的已有单聊');return entry.engine.messages(threadId).messages.filter(m=>m.contentKind==='text').map(m=>({...m,type:1}));},async send(threadId,text,requestId,beforeCommit){check();return entry.engine.sendText(threadId,text,requestId,async()=>{check();await beforeCommit();check();});}};
    },
    close() { if(closeTask)return closeTask;closed=true;clearInterval(timer);for(const [key]of connections)shutdown(key);starts.clear();imageDisk.clearMemory?.();closeTask=Promise.all([...closing.values()]).then(()=>{});return closeTask; }
  };
}
module.exports = { registerDouyinInbox, initializationFailure };
