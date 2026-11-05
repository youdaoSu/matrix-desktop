const crypto = require('node:crypto');
const c = require('./douyin-inbox-codec.cjs');
const {createMessageIndex}=require('./douyin-inbox-index.cjs');
const key = m => `${m.threadId}/${m.id}`;
const maximum = (a, b) => BigInt(a || '0') >= BigInt(b || '0') ? a || '0' : b || '0';
const displayMessage = (m, context) => {
  const { rawContent, senderSecUid, mediaUrl, linkUrl, contentNote, cardCoverUrl, mentions, textIsMediaLabel, ...safe } = m;
  // Re-project encrypted archives without a network re-fetch or destructive
  // migration. Raw content and attachment keys never leave native.
  return { ...safe, ...(typeof rawContent === 'string' || [1, 2, 3, 4].includes(m.status) ? require('./douyin-inbox-content.cjs').displayContent(rawContent, m.messageType, m.status, context) : { mediaUrl, linkUrl, contentNote, cardCoverUrl, mentions, textIsMediaLabel }) };
};
const mergedMessage = (old,m) => ({ ...old, ...m, mediaUrl: m.mediaUrl, linkUrl: m.linkUrl, contentNote: m.contentNote });
function mergeMessage(state, m) {
  const k = key(m), old = state.messages[k];
  if (!old || BigInt(m.version) >= BigInt(old.version)) {
    const merged = mergedMessage(old,m);
    if (JSON.stringify(old) !== JSON.stringify(merged)) { state.messages[k] = merged; const t = state.threads[m.threadId]; t.messageRevision = (t.messageRevision || 0) + 1; }
  }
  const t = state.threads[m.threadId]; t.latestIndex = maximum(t.latestIndex, m.index);
}
function mergeThread(state, t) {
  const old = state.threads[t.id];
  if (old && (old.shortId !== t.shortId || old.type !== t.type)) throw Error('抖音会话身份发生冲突，已保留原数据');
  state.threads[t.id] = { ...old, ...t, history: old?.history || { cursor: '0', done: false, pages: 0 } };
  if (old && t.nameSource === 'fallback' && old.nameSource && old.nameSource !== 'fallback') { state.threads[t.id].name = old.name; state.threads[t.id].nameSource = old.nameSource; }
}
function createEngine({ transport, store, assertCurrent, changed = () => {}, onFailure = () => {}, onObservation = () => {}, onMessage = () => {}, paused = () => false, delay = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now }) {
  let closed = false, phase = '准备消息通道', error = '', push = 'disconnected', pushError = '', historyError = '', profileError = '', busy = false, stopSocket, reconnect, catchupTimer, fileName = '', controlSequence = 0, marker, verifiedAt, socketCount = 0, pushCount = 0, lastPushAt, threadCache;
  const ownUid = transport.ownUid;
  const report=(stage,failure)=>{try{onFailure({stage,error:failure});}catch{}};
  const observed=(stage,code,stats)=>{try{onObservation({stage,code,...(stats?{stats}:{})});}catch{}};
  let namesTask, priorityThread = '', namesRetryAt = 0, schemaCache, resumeRequested = false;
  const messageIndex=createMessageIndex();
  const display = (m, state, indexed=messageIndex.get(state)) => displayMessage(m, {ownUid, resolveName(uid) {
    const profiles=indexed.people.get(uid)||[],names=[...new Set(profiles.map(p=>p.name).filter(Boolean))];
    // Conflicting identities never borrow a name from another profile.
    if(names.length===1)return names[0];
    return profiles.length?undefined:indexed.peers.get(uid)?.name;
  }});
  const missingNames = new Map();
  const guard = async () => { if (closed) throw Error('抖音消息同步已停止'); await assertCurrent(); if (closed) throw Error('抖音消息同步已停止'); };
  const commit = async(change, keys) => { const check=()=>{if(closed)throw Error('抖音消息同步已停止');};check();if(store.commitEngineAsync)await store.commitEngineAsync(change,keys,check);else if(store.commitEngine)store.commitEngine(change,keys);else store.commit(change);if(!closed)changed(); };
  // Independent from history pagination: saved/current conversations get their
  // names first, and every discovered page can enqueue new participants.
  function refreshNames() {
    if (closed || !transport.people || namesTask || now() < namesRetryAt) return namesTask;
    namesTask = (async () => {
      profileError = '';
      const attempted = new Set();
      while (!closed) {
        const state=store.get();
        const indexed=messageIndex.get(state),resolved=indexed.resolved;
        const ts = resolved.filter(t => t.type === 1 && t.peerSecUid && (!t.profileAt || now() - t.profileAt >= 60 * 60 * 1000));
        const known=new Set(ts.map(t=>`${t.peer}/${t.peerSecUid}`));
        for(const entry of indexed.senderPairs){
          const m=entry.first;
          if(known.size>=5000)break;
          if(m.sender===ownUid||!m.senderSecUid)continue;
          const key=`${m.sender}/${m.senderSecUid}`,cached=state.people?.[key];
          if(known.has(key)||cached&&now()-cached.at<60*60*1000)continue;
          known.add(key);ts.push({id:m.threadId,peer:m.sender,peerSecUid:m.senderSecUid,nameSource:'fallback'});
        }
        ts.sort((a, b) => Number(b.id === priorityThread) - Number(a.id === priorityThread) || Number(a.nameSource !== 'fallback') - Number(b.nameSource !== 'fallback'));
        const peers = [...new Map(ts.map(t => [`${t.peer}/${t.peerSecUid}`, t])).entries()].filter(([key]) => !attempted.has(key) && now() >= (missingNames.get(key) || 0)).slice(0, 50);
        if (!peers.length) return;
        peers.forEach(([key]) => attempted.add(key));
        await guard(); const profiles = await transport.people(peers.map(([, t]) => ({ uid: t.peer, secUid: t.peerSecUid }))); await guard();
        if (!Array.isArray(profiles) || profiles.length > 50) throw Error('抖音联系人资料结构未识别');
        await commit(next => { for (const p of profiles) {
          if (!peers.some(([, t]) => t.peer === p.uid && t.peerSecUid === p.secUid) || typeof p.name !== 'string' || !p.name.trim()) throw Error('抖音联系人资料与当前批次不一致');
          for (const t of Object.values(next.threads)) if (t.peer === p.uid && (t.peerSecUid === p.secUid || !t.peerSecUid&&resolved.some(r=>r.id===t.id&&r.peerSecUid===p.secUid))) { t.peerSecUid=p.secUid; if (t.nameSource !== 'alias') { t.name = c.clean(p.name, 200); t.nameSource = 'profile'; } t.avatarUrl = c.image(p.avatarUrl); t.profileAt = now(); }
          next.people ||= {};const personKey=`${p.uid}/${p.secUid}`;
          if(Object.keys(next.people).length<5000||next.people[personKey])next.people[personKey]={uid:p.uid,secUid:p.secUid,name:c.clean(p.name,200),avatarUrl:c.image(p.avatarUrl),at:now()};
        }
        const profilesByUid=new Map();for(const p of profiles){let ids=profilesByUid.get(p.uid);if(!ids){ids=new Set();profilesByUid.set(p.uid,ids);}ids.add(p.secUid);}
        // Read the current committed index inside the transaction: messages may
        // have arrived while the profile request was in flight. No stale index
        // captured before the request and no scan of every historical message.
        const senders=messageIndex.get(store.get()).sendersByUid,affected=new Set();
        for(const [uid,ids]of profilesByUid)for(const [sec,entry]of senders.get(uid)||[])if(!sec||ids.has(sec))for(const id of entry.threads)affected.add(id);
        for(const id of affected)next.threads[id].messageRevision=(next.threads[id].messageRevision||0)+1;
        },['threads','people']);
        for (const [key, t] of peers) { if (!profiles.some(p => p.uid === t.peer && p.secUid === t.peerSecUid)) missingNames.set(key, now() + 60000); else missingNames.delete(key); }
        await delay(500); await guard();
      }
    })().catch(e => { if (!closed) { profileError = e.message; namesRetryAt = now() + 60000; changed(); } }).finally(() => { namesTask = undefined; if (!closed) changed(); });
    return namesTask;
  }
  function ingest(state, rows, metadata = []) {
    const mapped = rows.map(row => c.message(row, ownUid));
    for (const raw of metadata) mergeThread(state, c.thread(raw, ownUid));
    for (const m of mapped) { if (!state.threads[m.threadId]) mergeThread(state, c.thread({ id: m.threadId, shortId: m.shortId, type: m.type }, ownUid)); mergeMessage(state, m); }
  }
  // History/push echoes must identify the same client request, server message,
  // recipient conversation, sender UID and exact original text.
  async function reconcileMessagePage(rows){
    const outbox=store.get().outbox;
    if(!outbox||!rows?.length)return;
    const found=new Map();
    for(const raw of rows){
      const requestId=raw.ext?.['s:client_message_id']||raw.clientMessageId;
      if(!require('./douyin-inbox-send.cjs').clientId(requestId)||outbox[requestId]?.receipt?.state!=='unknown')continue;
      if(raw.clientMessageId&&raw.clientMessageId!==requestId)continue;
      const m=c.message(raw,ownUid);
      if(m.sender!==ownUid||m.messageType!==7||m.status!==0)continue;
      let text;try{text=JSON.parse(raw.content)?.text;}catch{continue;}
      if(typeof text!=='string')continue;
      const fingerprint=crypto.createHash('sha256').update(JSON.stringify([m.threadId,text])).digest('hex');
      if(outbox[requestId].fingerprint!==fingerprint)continue;
      const prior=found.get(requestId);
      found.set(requestId,prior===undefined||prior?.id===m.id?{id:m.id,threadId:m.threadId}:null);
    }
    if(!found.size)return;
    await guard();
    await commit(next=>{
      for(const [requestId,match] of found){
        const entry=next.outbox[requestId];
        if(!match||entry?.receipt?.state!=='unknown')continue;
        const messageId=match.id;entry.threadId=match.threadId;
        entry.resolvedAt=now();
        entry.receipt={state:'confirmed',requestId,messageId,message:'已在官网会话记录中核对原消息'};
      }
    },['outbox']);
  }
  let reviewingMessage=false,cachedOutbox,pendingMessageReviews=[],reviewed=[];
  function indexOutbox(outbox){
    if(outbox===cachedOutbox)return;
    cachedOutbox=outbox;
    const entries=Object.entries(outbox||{});
    reviewed=entries.map(([,e])=>e).filter(e=>e.resolvedAt).sort((a,b)=>b.resolvedAt-a.resolvedAt).slice(0,50).map(e=>e.receipt);
    pendingMessageReviews=entries.filter(([,e])=>e.threadId&&e.receipt?.state==='unknown'&&(e.reviewCount||0)<3);
  }
  async function reviewPendingMessage(){
    if(closed||reviewingMessage||paused()||error||!transport.read)return;
    const state=store.get();
    const gaps=[60000,240000,600000];
    indexOutbox(state.outbox);
    const due=pendingMessageReviews.find(([,e])=>{
      const gap=gaps[e.reviewCount||0];
      return gap!==undefined&&e.receipt?.state==='unknown'&&state.threads[e.threadId]&&now()>=(e.reviewAt||e.at)+gap;
    });
    if(!due)return;
    reviewingMessage=true;
    try{
      const [requestId,entry]=due;
      await guard();
      await commit(next=>{const e=next.outbox[requestId];e.reviewCount=(e.reviewCount||0)+1;e.reviewAt=now();},['outbox']);
      const page=await read('history',{...state.threads[entry.threadId],cursor:'0',direction:'older'});
      if((page.messages||[]).every(m=>m.conversationId===entry.threadId))await reconcileMessagePage(page.messages);
    }catch{/* Preserve uncertainty and resume only after the reserved delay. */}
    finally{reviewingMessage=false;}
  }
  // A completed receive-only catch-up may contain no messages, or only the
  // exact messages already durably stored. Only its completion marker can be
  // deferred. A crash simply rechecks those GET pages; no push ACK or message
  // persistence is advanced by this optimization.
  function unchangedHistory(state,rows,threadId) {
    const thread=state.threads[threadId];if(!thread)return false;
    for(const raw of rows){
      const m=c.message(raw,ownUid),old=state.messages[key(m)];
      if(m.threadId!==threadId||!old||BigInt(m.index)>BigInt(thread.latestIndex||'0'))return false;
      if(BigInt(m.version)>=BigInt(old.version)&&JSON.stringify(old)!==JSON.stringify(mergedMessage(old,m)))return false;
    }
    return true;
  }
  async function read(kind, args) {
    while (paused() && !closed) { phase = '前台操作进行中，历史拉取暂让出；推送继续接收'; changed(); await delay(1000); }
    await guard(); const result = await transport.read(kind, args); await guard(); await delay(150); await guard(); return result;
  }
  async function discovery(kind) {
    for (let p = 0; p < 500; p++) {
      const state = store.get(), position = state[kind === 'init' ? 'init' : 'strangers']; if (position.done) return;
      phase = kind === 'init' ? '分页获取会话目录' : '分页获取陌生人会话'; changed();
      const page = await read(kind, { cursor: position.cursor });
      if (page.hasMore && page.cursor === position.cursor) throw Error('抖音会话分页游标未前进，当前历史不完整');
      await commit(next => {
        if (kind === 'init') ingest(next, page.messages || [], page.conversations || []);
        else for (const row of page.messages || []) { const t = c.thread({ ...row, conversationType: 1 }, ownUid); mergeThread(next, t); ingest(next, [...(row.messages || []), ...(row.extMessages || [])]); }
        next[kind === 'init' ? 'init' : 'strangers'] = { cursor: page.cursor, done: !page.hasMore };
      },['threads','messages',kind==='init'?'init':'strangers']);
      if(store.get().outbox)await reconcileMessagePage(kind==='init'?page.messages:(page.messages||[]).flatMap(row=>[...(row.messages||[]),...(row.extMessages||[])]));
      void refreshNames();
    }
    throw Error('抖音会话超过本轮分页上限，已保留断点；未声称历史完整');
  }
  let recentAt = 0, pollingRecent = false;
  async function recent() {
    if(pollingRecent || closed || now()-recentAt<15000) return;
    pollingRecent=true;recentAt=now();
    try {
      await commit(next=>{next.init={cursor:'0',done:false};next.strangers={cursor:'0',done:false};for(const t of Object.values(next.threads))t.catchup=t.catchup&&t.catchup!=='0'?t.catchup:t.latestIndex||'0';},['init','strangers','threads']);
      await discovery('init');
      if(!historyError) try {await discovery('strangers');}catch(e){historyError=e.message;}
      await drainHistory('newer');
    } finally {pollingRecent=false;}
  }
  async function history(threadId, direction, maxPages = 2000, pageSeen, deferredCompletions) {
    const original = store.get().threads[threadId]; let cursor = direction === 'newer' ? original.catchup || '0' : original.history.cursor;
    if (direction === 'older' && original.history.done || direction === 'newer' && cursor === '0') return;
    const seen = pageSeen || new Set([cursor]);
    for (let p = 0; p < maxPages; p++) {
      if(direction==='older') await recent();
      phase = direction === 'older' ? `同步会话历史（${Object.values(store.get().threads).filter(t => t.history.done).length}/${Object.keys(store.get().threads).length} 已到末页）` : '补拉断线期间的新消息'; changed();
      const t = store.get().threads[threadId], page = await read('history', { ...t, cursor, direction });
      if ((page.messages || []).some(m => m.conversationId !== threadId)) throw Error('抖音历史响应混入其他会话，已停止');
      await reconcileMessagePage(page.messages);
      if (page.hasMore && (seen.has(page.cursor) || !(page.messages || []).length)) throw Error('抖音历史分页重复或提前返回空页，未标记完整');
      if(direction==='newer'&&!page.hasMore&&deferredCompletions){
        const current=store.get(),latest=current.threads[threadId];
        if(latest&&latest.catchup===cursor&&(latest.latestIndex||'0')===(t.latestIndex||'0')&&unchangedHistory(current,page.messages||[],threadId)){
          deferredCompletions.set(threadId,{cursor,latestIndex:latest.latestIndex||'0'});void refreshNames();return;
        }
      }
      await commit(next => { ingest(next, page.messages || []); const item = next.threads[threadId]; if (direction === 'older') item.history = { cursor: page.cursor, done: !page.hasMore, pages: item.history.pages + 1 }; else item.catchup = page.hasMore ? page.cursor : '0'; },['threads','messages']);
      void refreshNames();
      if (!page.hasMore) return; cursor = page.cursor; seen.add(cursor);
    }
    if(maxPages===1)return;
    throw Error('抖音单会话超过本轮分页上限，断点已保存，未标记完整');
  }
  async function drainHistory(direction) {
    const counts=new Map(),seen=new Map(),completed=new Map();let last='',streak=0,lastFlush=now();
    const matches=(thread,entry)=>thread&&entry&&thread.catchup===entry.cursor&&(thread.latestIndex||'0')===entry.latestIndex;
    const flush=async()=>{
      if(!completed.size||closed)return;
      const entries=[...completed];completed.clear();
      await commit(next=>{for(const [id,entry]of entries)if(matches(next.threads[id],entry))next.threads[id].catchup='0';},['threads']);
      lastFlush=now();
    };
    try{
    while(!closed){
      if(completed.size>=8||completed.size&&now()-lastFlush>=1500)await flush();
      const pending=Object.values(store.get().threads).filter(t=>direction==='older'?!t.history.done:t.catchup&&t.catchup!=='0'&&!matches(t,completed.get(t.id)));
      if(!pending.length)return;
      const preferred=pending.find(t=>t.id===priorityThread);
      const fair=[...pending].sort((a,b)=>(counts.get(a.id)||0)-(counts.get(b.id)||0));
      const target=preferred&&(last!==preferred.id||streak<3||pending.length===1)?preferred:fair.find(t=>t.id!==last)||fair[0];
      const pages=counts.get(target.id)||0;if(pages>=2000)throw Error('抖音单会话超过本轮分页上限，断点已保存，未标记完整');
      const cursor=direction==='older'?target.history.cursor:target.catchup;
      if(!seen.has(target.id))seen.set(target.id,new Set([cursor]));
      await history(target.id,direction,1,seen.get(target.id),direction==='newer'?completed:undefined);
      counts.set(target.id,pages+1);streak=last===target.id?streak+1:1;last=target.id;
    }
    }finally{await flush();}
  }
  async function sync(retryStrangers = false) {
    if(closed)return;
    if(busy){if(retryStrangers)resumeRequested=true;return;}
    busy = true; error = ''; if(retryStrangers)historyError = '';
    try {
      recentAt=now();
      void refreshNames();
      // Capture each previously saved high-water mark BEFORE init/push changes it.
      await commit(next => { next.init = { cursor: '0', done: false }; next.strangers = { cursor: '0', done: false }; for (const t of Object.values(next.threads)) t.catchup = t.catchup && t.catchup !== '0' ? t.catchup : t.latestIndex || '0'; },['init','strangers','threads']);
      await discovery('init');
      // A refused stranger source remains paused until an explicit resume.
      // Its failure must not disable read-only updates of known conversations.
      if(!historyError)try { await discovery('strangers'); } catch (e) { historyError = e.message; }
      void refreshNames();
      // Catch up new messages before draining potentially thousands of older
      // pages. Long history also yields periodically to the receive-only heads.
      await drainHistory('newer');
      await drainHistory('older');
      phase = historyError ? '普通会话已同步，陌生人历史尚未完整' : '本轮可访问历史同步完成';
      observed('history','read-ok',{recordCount:Object.keys(store.get().messages).length,complete:!historyError});
    } catch (e) { error = e.message; phase = '历史同步暂停，已有消息和断点保留';if(!closed)report('history',e); }
    finally { busy = false; if (!closed) { changed(); if(resumeRequested){resumeRequested=false;void sync(true);} } }
  }
  async function onFrame(f, send, progress = () => {}) {
    progress('owner-check'); await guard(); const name = c.header(f, 'cursor_file_name');
    if ([16, 32].includes(f.frameType)) {
      progress('cursor-control');
      if (!name || name.length > 256 || ['__proto__', 'constructor', 'prototype'].includes(name)) throw Error('抖音推送续传文件标识无效'); fileName = name;
      if (f.frameType === 32) { progress('cursor-decode'); const rows = c.cursors(f.payload || Buffer.alloc(0)); progress('cursor-save'); await commit(next => { const map = new Map((next.frontier[name] || []).map(r => [`${r.service}/${r.name}`, r])); rows.forEach(r => map.set(`${r.service}/${r.name}`, r)); next.frontier[name] = [...map.values()]; },['frontier']);await guard(); }
      else { progress('cursor-reply'); const rows = store.get().frontier[name] || []; send(c.encode('Frame', { seqid: String(controlSequence++), logid: String(now()), service: 9000, method: 5, frameType: 32, payloadType: '', headers: [{ key: 'cursor_file_name', value: rows.length ? name : 'FILE_NOT_EXIST' }], payload: c.encodeCursors(rows) })); }
      const ack = c.ack(f); if (ack) send(ack); return;
    }
    progress('payload-dispatch'); if (c.header(f, 'is_ack') === '1') return;
    // Frontier also carries non-chat control/JSON notifications. Preserve the
    // entire normalized frame encrypted instead of claiming it is a chat or
    // terminating every subsequent message just because it is not Response PB.
    let response;
    if (f.payloadType === 'pb' && f.payload?.length) { progress('response-decode'); response = c.decode('Response', f.payload); }
    const body = response?.body || {}; progress('message-decode', { cmd: response?.cmd });
    let message, notify = body.hasNewMessageNotify || body.strangerHasNewMessageNotify;
    if (notify?.message) message = c.message(notify.message, ownUid);
    const knownMessage = [500, 1099].includes(response?.cmd);
    if (knownMessage && !message) throw Error('抖音新消息推送缺少可识别正文');
    let cursor;
    progress('cursor-validate'); if (c.header(f, 'x-msg-qos') === '2') { const n = c.header(f, 'x-msg-cursor_name'), v = c.header(f, 'x-msg-cursor_value'); if (!fileName || !n || Buffer.byteLength(n) > 255 || !/^\d{1,20}$/.test(v || '') || BigInt(v) > 0xffffffffffffffffn) throw Error('抖音推送消息游标无效'); cursor = { service: f.service, name: n, value: v }; }
    const existed = message && !!store.get().messages[key(message)], previousThread = message && store.get().threads[message.threadId];
    const knownSender=message?.direction==='inbound'&&messageIndex.rows(store.get(),message.threadId).some(m=>m.sender===message.sender&&m.direction==='inbound'&&m.id!==message.id);
    const gap = message && !existed && (!previousThread || BigInt(message.index) > BigInt(previousThread.latestIndex || '0') + 1n);
    let opaque;
    if(!message){const encoded=c.encode('Frame',f);opaque={at:now(),cmd:response?.cmd??-1,hash:crypto.createHash('sha256').update(encoded).digest('hex'),frame:encoded.toString('base64'),normalized:true};}
    const overflow=opaque&&(store.get().protocolEvents?.length||0)>=256&&!store.get().protocolEvents.some(event=>event.hash===opaque.hash);
    if(overflow){progress('message-save');if(!store.preserveEvent)throw Error('未识别推送事件达到上限，需要适配后继续，未丢弃事件');store.preserveEvent(opaque);await guard();}
    progress('message-save'); await commit(next => {
      if (message) { if (!next.threads[message.threadId]) mergeThread(next, c.thread({ id: message.threadId, shortId: message.shortId, type: message.type }, ownUid)); const t = next.threads[message.threadId]; if (gap && t.latestIndex && (!t.catchup || t.catchup === '0')) t.catchup = t.latestIndex; mergeMessage(next, message); if (Number.isInteger(notify.badgeCount) && notify.badgeCount >= 0) t.unread = notify.badgeCount; }
      else if(!overflow){next.protocolEvents ||= [];if(!next.protocolEvents.some(event=>event.hash===opaque.hash))next.protocolEvents.push(opaque);}
      if (cursor) { const map = new Map((next.frontier[fileName] || []).map(r => [`${r.service}/${r.name}`, r])); const k = `${cursor.service}/${cursor.name}`, prev = map.get(k); if (!prev || BigInt(prev.value) < BigInt(cursor.value)) map.set(k, cursor); next.frontier[fileName] = [...map.values()]; }
    },message?['threads','messages','frontier']:overflow?['frontier']:['protocolEvents','frontier']);
    progress('post-owner-check'); await guard();
    if(message)await reconcileMessagePage([notify.message]);
    if (message) {
      // Feed only verified live text pushes, after archive persistence and owner
      // revalidation. History discovery cannot create automatic reply tasks.
      if(message.contentKind==='text'&&message.text?.trim())try{onMessage({...display(message,store.get()),type:store.get().threads[message.threadId]?.type,knownSender});}catch{}
      if (!existed) { pushCount++; lastPushAt = new Date(now()).toISOString(); }
      // HTTP catch-up may persist a genuinely new message just before its WS
      // frame arrives. Verify actual socket receipt against the pre-arm IDs,
      // not against the later store snapshot; cached/replayed old IDs still fail.
      if (marker && !marker.existing.has(key(message)) && now() >= marker.at && message.direction === 'inbound' && message.text === marker.text) { verifiedAt = new Date(now()).toISOString(); lastPushAt = verifiedAt; marker = undefined; }
    }
    progress('qos-ack'); const acknowledgement = c.ack(f); if (acknowledgement) send(acknowledgement); changed();
    observed('push',message?'push-message-saved':'push-control-saved',{recordCount:message?1:0});
    if (gap) { clearTimeout(catchupTimer); const catchup = () => { if (closed) return; if (busy) catchupTimer = setTimeout(catchup, 1000); else void sync(); catchupTimer?.unref?.(); }; catchupTimer = setTimeout(catchup, 3000); catchupTimer.unref?.(); }
  }
  async function connect() {
    if (closed) return;
    push = 'connecting'; changed(); const attempt = ++socketCount; let reconnectScheduled = false;
    try {
      stopSocket = await transport.connect({ onFrame, onStatus(value, detail = '') {
        if (closed || attempt !== socketCount) return;
        push = value; if (detail) {pushError = detail;if(value!=='connected'&&value!=='connecting')report('push',detail);}
        if (value === 'connected') { pushError = ''; changed(); observed('push','transport-connected');void sync(); return; }
        changed();
        if (['disconnected', 'connection-error', 'protocol-error', 'overloaded'].includes(value) && !reconnectScheduled) {
          reconnectScheduled = true;
          if (value === 'protocol-error' || value === 'overloaded') { pushError ||= '抖音推送结构或接收队列异常，已暂停确认；未声称推送通过'; changed(); return; }
          reconnect = setTimeout(() => { stopSocket?.(); void connect(); }, Math.min(60000, 3000 * attempt)); reconnect.unref?.();
        }
      } });
    } catch (e) { push = 'connection-error'; pushError = e.message;if(!closed)report('push',e);changed(); }
  }
  let sendTail=Promise.resolve(),pendingSends=0;
  async function sendText(threadId, text, requestId, beforeCommit) {
      await guard();
      const { clientId } = require('./douyin-inbox-send.cjs');
      if (!clientId(requestId) || typeof text !== 'string' || !text.trim() || text.length > 2000 || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(text)) throw Error('私信正文或请求编号无效');
      const state = store.get(), thread = state.threads[threadId];
      if (!thread) throw Error('收件会话不属于当前账号，未发送');
      c.thread(thread, ownUid);
      const fingerprint = crypto.createHash('sha256').update(JSON.stringify([threadId, text])).digest('hex');
      const previous = state.outbox?.[requestId];
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw Error('发送编号已用于其他正文或收件人，未发送');
        return previous.receipt;
      }
      if (!transport.sendText) throw Error('当前仅载入本机缓存，官方发送连接尚未就绪，未发送');
      if (state.lastSendAt && now() - state.lastSendAt < 4000) throw Error('发送过于频繁，请稍候，未发送');
      if (Object.keys(state.outbox || {}).length >= 2000) throw Error('发送回执达到安全容量，未发送；请保留记录并联系维护');
      const pending = { state: 'unknown', requestId, message: '发送请求结果尚未确认，请先核对，勿重复发送' };
      // Durable reservation BEFORE any write. Replays, restarts and lost IPC
      // responses return this same receipt instead of sending a second time.
      await commit(next => { next.outbox ||= {}; next.outbox[requestId] = { fingerprint, threadId, receipt: pending, at: now() }; next.lastSendAt = now(); },['outbox','lastSendAt']);
      let receipt;
      try { await guard(); if(beforeCommit)await beforeCommit();await guard(); receipt = await transport.sendText({ thread, text, requestId }); await guard(); }
      catch (e) { receipt = { ...pending, message: `发送结果未确认：${require('./douyin-inbox-send.cjs').reason(e?.message) || '连接中断或当前账号已变化'}；请核对原会话，勿重复发送` }; }
      if (!['confirmed', 'failed', 'unknown'].includes(receipt?.state) || receipt.requestId !== requestId) receipt = pending;
      try { await commit(next => { const entry=next.outbox[requestId];if(entry.resolvedAt&&receipt.state==='unknown')receipt=entry.receipt;else entry.receipt=receipt; },['outbox']); }
      catch { return { ...pending, message: '发送后回执未能保存，结果未确认；原发送编号已保留，勿重复发送' }; }
      // Do not fabricate an archive message/index or mark the conversation read.
      if (receipt.state === 'confirmed' && transport.read) void (async () => {
        try { const page = await read('history', { ...thread, direction: 'older', cursor: '0' });
          if ((page.messages || []).some(m => m.conversationId !== threadId)) throw Error('最新消息返回其他会话，未采用');
          await guard(); await commit(next => ingest(next, page.messages || []),['threads','messages']);
        } catch { /* A read failure cannot turn an acknowledged send into failure. */ }
      })();
      return receipt;
  }
  return {
    sendText(...args){
      if(pendingSends>=8)return Promise.reject(Error('私信发送队列繁忙，未发送'));
      pendingSends++;const result=sendTail.then(()=>sendText(...args));
      sendTail=result.then(()=>{pendingSends--;},()=>{pendingSends--;});return result;
    },
    attachment(threadId, messageId) { const state=store.get(),m=state.messages[`${threadId}/${messageId}`];if(!state.threads[threadId]||!m)throw Error('图片消息不属于当前会话');return require('./douyin-inbox-media.cjs').imageAttachment(m.rawContent,m.messageType,m.status??0); },
    reviewedReceipts(){indexOutbox(store.get().outbox);return reviewed;},
    reviewedProofs(){
      const state=store.get();indexOutbox(state.outbox);
      return reviewed.flatMap(receipt=>{
        const entry=state.outbox[receipt.requestId],thread=state.threads[entry.threadId];
        return thread?.type===1?[{...receipt,threadId:thread.id,peer:thread.peer,fingerprint:entry.fingerprint}]:[];
      });
    },
    start() { void sync(); void connect(); }, poll() { if(!closed && !busy && !error && now()-recentAt>=15000) void sync();void reviewPendingMessage(); }, resume() { if (!closed) { if (!['connected', 'connecting'].includes(push)) { stopSocket?.(); clearTimeout(reconnect); void connect(); } void sync(true); } },
    close() { closed = true; resumeRequested=false;messageIndex.clear();clearTimeout(reconnect); clearTimeout(catchupTimer);try{stopSocket?.();}catch(e){report('close',e);}try{transport.close();}catch(e){report('close',e);}return store.drain?.(); },
    arm() { if (push !== 'connected') throw Error('请等待抖音推送通道连接成功后再验证'); marker = { text: `远效接收验证-${crypto.randomBytes(3).toString('hex')}`, at: now(), existing: new Set(Object.keys(store.get().messages)) }; verifiedAt = undefined; return marker.text; },
    status() { const state = store.get(), ts = messageIndex.get(state).resolved, done = ts.filter(t => t.history.done && (!t.catchup || t.catchup === '0')).length;
      if(!schemaCache||schemaCache.messages!==state.messages||schemaCache.people!==state.people||schemaCache.threads!==state.threads) {
        const shapes=new Set();
        for(const m of messageIndex.get(state).all.slice(-2000)) if(m.messageType===1001 && m.status===0 && display(m,state).contentNote?.startsWith('提示正文尚未解析')) {shapes.add(require('./douyin-inbox-content.cjs').systemShape(m.rawContent));if(shapes.size===4)break;}
        schemaCache={messages:state.messages,people:state.people,threads:state.threads,shapes:[...shapes]};
      }
      const privateThreads = ts.filter(t => t.type === 1), unresolved = privateThreads.filter(t => t.nameSource === 'fallback' || !t.nameSource && t.name === `用户 ${t.peer}`);
      const profileNames = { total: privateThreads.length, resolved: privateThreads.length - unresolved.length, missingSecUid: unresolved.filter(t => !t.peerSecUid).length };
      return { ownUid, systemSchemas: schemaCache.shapes, revision: state.revision, phase, error: error || historyError, partialFailure:!error&&!!historyError, profileError, profileNames, profileBusy: !!namesTask, busy, threadCount: ts.length, messageCount: messageIndex.get(state).all.length, completedThreads: done, historyComplete: !busy && state.init.done && state.strangers.done && done === ts.length && !error && !historyError, push, pushError, pushCount, lastPushAt, pushVerifiedAt: verifiedAt, verificationMarker: marker?.text, unread: ts.reduce((n, t) => n + (t.unread || 0), 0), unsupportedEvents: (state.protocolEvents?.length || 0)+(store.eventCount?.()||0) };
    },
    contactEvidence(fans) { return require('./fan-contact-evidence.cjs').fanContactEvidence({state:store.get(),indexed:messageIndex.get(store.get()),ownUid,ready:!closed&&!error&&!historyError&&push==='connected'},fans); },
    threads() { const state = store.get(); if (threadCache&&threadCache.messages===state.messages&&threadCache.threads===state.threads&&threadCache.people===state.people) return threadCache.rows; const indexed = messageIndex.get(state); const rows = indexed.resolved.map(t => { const v = indexed.threads.get(t.id); return { id: t.id, name: t.name === `用户 ${t.peer}` ? '昵称待同步' : t.name, peer: t.peer, avatarUrl: t.avatarUrl, type: t.type, unread: t.unread, complete: t.history.done, messageRevision: t.messageRevision || 0, count: v?.visibleCount || 0, lastMessage: v?.lastVisible ? display(v.lastVisible,state,indexed).text : '', lastAt: v?.lastVisible?.at || '' }; }).sort((a, b) => b.lastAt.localeCompare(a.lastAt)); threadCache = { messages:state.messages,threads:state.threads,people:state.people, rows }; return rows; },
    messages(threadId, before) { const state=store.get();if (!state.threads[threadId]) throw Error('会话不属于当前账号'); priorityThread = threadId; void refreshNames(); const indexed=messageIndex.get(state),rows=messageIndex.rows(state,threadId); const end = before ? rows.findIndex(m => m.id === before) : rows.length; if (end < 0) throw Error('本机消息分页锚点不存在'); const {isChatMessageType}=require('./douyin-inbox-visibility.cjs');let start=end,count=0;while(start>0&&count<50){start--;if(isChatMessageType(rows[start].messageType))count++;} return { messages: rows.slice(start, end).filter(m=>isChatMessageType(m.messageType)).map(m=>{
      const profile=indexed.people.get(m.sender)?.find(p=>!m.senderSecUid||p.secUid===m.senderSecUid);
      const privatePeer=indexed.peers.get(m.sender);
      return {...display(m,state,indexed),senderName:profile?.name||privatePeer?.name,senderAvatarUrl:profile?.avatarUrl||privatePeer?.avatarUrl};
    }), before: start > 0 ? rows[start].id : undefined }; },
  };
}
module.exports = { createEngine, mergeMessage, mergeThread };
