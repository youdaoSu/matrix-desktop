// Only local rule evaluation/storage runs here. No network, Electron, browser
// credentials or arbitrary commands are available to this worker.
const { parentPort, workerData } = require('node:worker_threads');
const { randomUUID, createHash } = require('node:crypto');
const {performance}=require('node:perf_hooks');
const { InteractionStore } = require('./vendor/hengyuan-interactions/src/interaction-store.cjs');
const { ReplyBatchController } = require('./vendor/hengyuan-interactions/src/reply-batch.cjs');
const { cipher } = require('./account-operations-crypto.cjs');
const {AtomicThreadLock}=require('./account-operations-store-lock.cjs');
const {configureEncryptedWorkspace}=require('./vendor/hengyuan-interactions/src/workspace-data.cjs');
const {OperationsStudio}=require('./account-operations-studio.cjs');
const {createDomRuntime}=require('./account-operations-dom-runtime.cjs');
const {createOutreachRuntime}=require('./account-operations-outreach-runtime.cjs');
const {OperationsArchive}=require('./account-operations-archive.cjs');
const {OperationsContactNotes}=require('./account-operations-contact-notes.cjs');
const {KeywordRoutes}=require('./account-operations-keyword-routes.cjs');
const {ReplyCommentPlans}=require('./account-operations-comment-monitor.cjs');
const accounts = new Map(), startedAt = Date.now(), pending = new Map();
const nextSends=new Map();
// Runtime durations use the monotonic clock; persisted dates remain wall time.
let halted = false, busy = false, closing = false, runtimePaused=false, batchLock = null, lastError = '', lastContactAt = performance.now();
let keywordRoutes;
const crypt = cipher(Buffer.from(workerData.key, 'base64'), workerData.owner);
const workspaceKey=Buffer.from(workerData.key,'base64');
configureEncryptedWorkspace({directory:workerData.directory,codecFor:name=>cipher(workspaceKey,workerData.owner+'/controls/'+name)});
const studio=new OperationsStudio({directory:workerData.directory});
const storeLock=new AtomicThreadLock(workerData.directory,workerData.storeLease||{leaseId:randomUUID()});
const store = new InteractionStore(workerData.directory, { ...crypt, withLock:action=>storeLock.run(action), temporaryFileName:storeLock.scratchName('state'), onValidatedArchive:()=>storeLock.cleanupRetiredScratch(), getAccount(id) { const a=accounts.get(id); if(!a) throw Error('账号已解绑或身份改变，原规则不会迁给其他账号'); return studio.getAccount(id); } });
// A previous process's confirmation never authorizes new platform submissions.
store.shutdown();
const browserPending=new Map(),proofPending=new Map();
function requestBrowser(request){return new Promise((resolve,reject)=>{const id=randomUUID(),timer=setTimeout(()=>{browserPending.delete(id);reject(Object.assign(Error('官网页面操作等待超时，提交结果需核对'),{code:'PAGE_OPERATION_TIMEOUT'}));},Math.min(60000,Math.max(1,request.expiresAt-Date.now()))+1000);browserPending.set(id,{resolve,reject,timer});parentPort.postMessage({type:'browser',id,request});});}
function requestProof(type,args){return new Promise((resolve,reject)=>{const id=randomUUID(),timer=setTimeout(()=>{proofPending.delete(id);reject(Error('原生评论或既有会话核验超时，未将旧缓存当作新证明'));},60000);proofPending.set(id,{resolve,reject,timer,type});parentPort.postMessage({type,id,args});});}
function reserveSendFloor(accountId){if(closing||halted||runtimePaused)throw Error('互动已暂停，未领取新的发送任务');if(performance.now()<(nextSends.get(accountId)||0))throw Error('当前账号正在等待保守发送间隔，未提交');nextSends.set(accountId,performance.now()+4500);}
const dom=createDomRuntime({directory:workerData.directory,studio,store,call:requestBrowser,verifyComment:args=>requestProof('comment-verify',args),paused:()=>closing||halted||runtimePaused,canBatch:id=>!batchLock||batch.isAuthorized(id,batchLock),beforeClaim:reserveSendFloor});
const directoryPending=new Map();
function requestDirectory(args){return new Promise((resolve,reject)=>{const id=randomUUID(),timer=setTimeout(()=>{directoryPending.delete(id);reject(Error('原生目录重新核对超时，未继续发送'));},60000);directoryPending.set(id,{resolve,reject,timer});parentPort.postMessage({type:'directory-request',id,args});});}
const outreach=createOutreachRuntime({directory:workerData.directory,studio,store,dom,refreshDirectory:requestDirectory,beforeClaim:reserveSendFloor,
  authorizeAutomatic:(authority,ids)=>keywordRoutes?.authorized(authority,ids)===true,
  verifyAutomaticSource:async task=>{
    const message=store.getMessage(task.sourceMessageId),proof=await requestProof('comment-verify',{accountId:task.primaryAccountId,message}),r=proof?.record;
    if(!r||proof.ownUid!==task.primaryBinding.identity||r.workId+'/'+r.platformId!==message.externalId||r.workId!==message.threadId||r.platformUserId!==message.senderId||r.content!==message.text||r.displayTime!==message.receivedAt||r.authorProfileUrl!==message.profileUrl||r.authorIdentityAvailable===false)throw Error('原评论或作者身份已变化，自动分配未继续提交');
  },
  canRun:()=>!closing&&!halted&&!runtimePaused&&!busy&&(!batchLock||batchLock.startsWith('outreach:')),
  canWrite:id=>!closing&&!halted&&!runtimePaused&&(!batchLock||batchLock.startsWith('outreach:')&&outreach.batch.isAuthorized(id,batchLock.slice(9))),
  reserve:(id,ids)=>{if(busy||batchLock||closing||halted)throw Error('已有互动任务正在执行，协作批次未开始');batchLock='outreach:'+id;try{return dom.manager.reserveExternalBatch(id,ids);}catch(error){batchLock=null;throw error;}},
  release:id=>{try{dom.manager.releaseExternalBatch(id);}finally{if(batchLock==='outreach:'+id)batchLock=null;}}});
keywordRoutes=new KeywordRoutes({directory:workerData.directory,studio,store,tasks:outreach.tasks,
  canSchedule:()=>!closing&&!halted&&!runtimePaused&&!busy&&!batchLock&&!store.getPolicy().paused&&!outreach.batch.hasPendingPreview,
  canUseSender:id=>{const c=dom.manager.connections.get(dom.manager.key(id,'dm'));return Boolean(dom.firstConversationAllowed(id)&&c?.status==='ready'&&c.identity&&!c.win.isDestroyed());},
  start:async(taskId,authority)=>{outreach.batch.startAutomatic({taskId,authority});await outreach.idle();},stop:()=>outreach.batch.stop('关键词规则已暂停，未继续提交')});
const archive=new OperationsArchive({directory:workerData.directory,studio,store,keywordRoutes,canImport:()=>!closing&&!halted&&!busy&&!batchLock});
const commentPlans=new ReplyCommentPlans({store,accounts,keywords:keywordRoutes});
const contactNotes=new OperationsContactNotes({directory:workerData.directory,studio,store,fans:outreach.fans});
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function requestSend(reply, message) {
  return new Promise((resolve,reject) => { const id=randomUUID(), timer=setTimeout(()=>{pending.delete(id);reject(Error('发送结果等待超时，请核对原会话，勿重复发送'));},60000); pending.set(id,{resolve,reject,timer}); parentPort.postMessage({ type:'send', id, reply, message }); });
}
async function send(id, batchId) {
  if(closing||halted)throw Error('互动已停止，未开始的回复不会发送');
  const current=store.getReply(id);
  if(!['pending','queued'].includes(current.status))throw Error('此回复已处理，不能重复发送；未知结果请先核对');
  if(Date.parse(current.dueAt)>Date.now())throw Error('尚未到规则设置的发送时间，保留待核对状态，请稍后再确认');
  if(performance.now()<(nextSends.get(current.accountId)||0))throw Error('当前账号正在等待保守发送间隔，请稍后核对；未提交');
  if (batchLock && batchId!==batchLock || batchId && !batch.isAuthorized(id,batchId)) throw Error('该账号正在批量核对回复，未取得本条授权');
  if(current.status==='pending')store.approveReply(id);
  let useDom=dom.replyRoute(current);
  if(useDom&&current.channel==='comment'&&current.deliveryChannel==='dm'){
    try{const route=await requestProof('reply-route',{accountId:current.accountId,message:store.getMessage(current.messageId)});if(!route||!['native','dom'].includes(route.route))throw Error('评论私信路由未通过核验');useDom=route.route==='dom';}
    catch(error){if(store.getReply(id).status==='queued')store.failBeforeSend(id,{error:error.message,code:'preflight_failed'});return store.getReply(id);}
  }
  if(useDom){
    await dom.sendReply(id);return store.getReply(id);
  }
  const {reply,message}=store.beginSend(id);
  nextSends.set(reply.accountId,performance.now()+4500);
  try {
    const receipt=await requestSend(reply,message);
    return store.finishSend(id,{status:receipt?.state==='confirmed'&&receipt.messageId?'sent':receipt?.state==='failed'?'failed':'unknown',...(receipt?.state==='confirmed'&&receipt.messageId?{receipt:{kind:'platform-ack',messageId:receipt.messageId,requestId:reply.claimId}}:{}),error:receipt?.message||''});
  } catch(error) { return store.finishSend(id,{status:'unknown',error:'发送结果未确认；请核对原会话，勿重复发送。'}); }
}
const manager = {
  previewBatchReply(id) { const {message}=store.checkBatchReply(id);if(accounts.get(message.accountId)?.platform==='xiaohongshu')return dom.manager.previewBatchReply(id);return this.previewBatchDraft({message}); },
  previewBatchDraft({message,replyText}) { const account=accounts.get(message.accountId);if(account?.platform==='xiaohongshu')return dom.manager.previewBatchDraft({message,replyText}); if(!account||account.platform!=='douyin')throw Error('当前平台发送适配尚未完成，不能批准批次'); return {fingerprint:digest([account.id,account.binding,message.threadId,message.senderId]),binding:{identity:account.binding}}; },
  reserveReplyBatch(id,items) { if(batchLock||busy)throw Error('已有回复正在发送，请稍后');const selected=items.filter(item=>accounts.get(item.accountId||store.getMessage(item.messageId||store.getReply(item.replyId).messageId).accountId)?.platform==='xiaohongshu');if(selected.length)dom.manager.reserveReplyBatch(id,selected);batchLock=id; },
  releaseReplyBatch(id) {if(dom.manager.replyBatchReservations.has(id))dom.manager.releaseReplyBatch(id);if(batchLock===id)batchLock=null; },
  cancelReplyBatchOperation(id) {dom.manager.cancelReplyBatchOperation(id);},
  async sendBatchReply(id,{batchId,fingerprint}) { const reply=store.getReply(id),message=store.getMessage(reply.messageId);let result;if(accounts.get(reply.accountId)?.platform==='xiaohongshu'){if(performance.now()<(nextSends.get(reply.accountId)||0))throw Error('当前账号仍在保守发送间隔内，未提交');await dom.sendReply(id,{batchId,fingerprint});result=store.getReply(id);}else{if(this.previewBatchDraft({message}).fingerprint!==fingerprint)throw Error('批次账号绑定已改变');result=await send(id,batchId);}await new Promise(resolve=>setTimeout(resolve,4500));return result; },
};
const batch = new ReplyBatchController({interactions:store,manager});
dom.manager.replyBatchController=batch;
function configure(list) {
  if(!Array.isArray(list)||list.length>100)throw Error('互动账号列表无效');
  const ids=new Set(list.map(a=>a.id));
  for(const id of accounts.keys())if(!ids.has(id)){batch.stopAccount(id);outreach.closeAccount(id);dom.closeAccount(id);store.cancelAccountUnsent(id);accounts.delete(id);}
  for(const a of list)accounts.set(a.id,{...a,activatedAt:accounts.get(a.id)?.activatedAt||startedAt});
  studio.configure([...accounts.values()]);
}
function prepareIngest(input) {
  if(halted||closing)return;
  const a=accounts.get(input.accountId);if(!a)return;
  // The native source has already verified the real account; the worker cannot
  // convert list changes or nickname matches into follow/message identities.
  const historical=input.historical===true||!Number.isFinite(Date.parse(input.receivedAt))||Date.parse(input.receivedAt)<=Math.max(startedAt,a.activatedAt||0);
  const {knownSender,...event}=input;
  return{event:{...event,historical},knownSender};
}
function ingest(input) {
  const prepared=prepareIngest(input);if(!prepared)return;
  if(prepared.knownSender===true&&input.channel==='dm')store.baselineDmSender(input.accountId,input.senderId);
  const stored=store.ingest(prepared.event);keywordRoutes.observe(stored);
}
function ingestBatch(inputs){
  if(!Array.isArray(inputs)||inputs.length<1||inputs.length>16||inputs.some(row=>!row||row.channel!=='comment')||Buffer.byteLength(JSON.stringify(inputs),'utf8')>512*1024)throw Error('评论批次范围不正确');
  let failures=0;
  const individually=()=>{for(const input of inputs)try{ingest(input);}catch{failures++;}};
  // Keyword assignments use a separate durable store. Preserve their original
  // per-message ordering relative to ordinary replies and contact history.
  if(keywordRoutes.hasArmedRules())individually();
  else{
    const events=inputs.map(prepareIngest).filter(Boolean).map(item=>item.event);
    let stored;
    if(events.length)try{stored=store.ingestMany(events);}catch{individually();}
    if(stored)for(const message of stored)try{keywordRoutes.observe(message);}catch{failures++;}
  }
  // Only local, idempotent ingestion is isolated on a batch validation failure.
  // No platform submission is retried, and no failed RPC is replayed by the host.
  if(failures)throw Error('部分评论未能入库；原来源记录保留，请核对监控状态');
  return true;
}
function snapshot(args={}) {
  if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(key=>!['outreach','replies','inbox'].includes(key)))throw Error('账号运营快照条件无效');
  const outreachView=outreach.snapshot(args.outreach);
  const state=store.snapshotForDisplay(args.replies,args.inbox);
  return {...state,accounts:studio.activeAccounts().map(({binding,...a})=>a),batch:batch.snapshot(),connections:dom.snapshot(),outreach:outreachView,ownFanPlan:outreach.fanPlan.snapshot(),keywordRoutes:keywordRoutes.snapshot(),commentMonitors:commentPlans.snapshot(),halted,error:lastError};
}
async function command(command,args) {
  if(command==='configure'){configure(args);lastContactAt=performance.now();return true;}
  if(command==='heartbeat'){lastContactAt=performance.now();return true;}
  if(command==='runtime'){runtimePaused=args.paused===true;return true;}
  if(command==='snapshot')return snapshot(args);
  if(command==='observe'){ingest(args);return true;}
  if(command==='observe-batch')return ingestBatch(args);
  if(command==='import'){if(!Array.isArray(args)||args.length>50)throw Error('导入消息数量无效');for(const m of args)ingest({...m,historical:true});return true;}
  if(command==='save-rule')return store.saveRule(args);
  if(command==='delete-rule')return store.deleteRule(args.id);
  if(command==='preview-rule')return store.preview(args);
  if(command==='keyword-route-save')return keywordRoutes.save(args);
  if(command==='keyword-route-arm')return keywordRoutes.arm(args);
  if(command==='keyword-route-pause')return keywordRoutes.pause(args.id);
  if(command==='keyword-route-delete')return keywordRoutes.remove(args);
  if(command==='keyword-route-monitor-plan')return closing||halted||store.getPolicy().paused?[]:runtimePaused?null:commentPlans.plans();
  if(command==='keyword-route-monitor-result')return args.status==='reading'&&(closing||halted||runtimePaused||store.getPolicy().paused)?false:commentPlans.report(args);
  if(command==='keyword-route-bind')return dom.registerNativeIdentity(args.accountId,args.identity,args.verifiedAt);
  if(command==='mode') {
    const a=accounts.get(args.accountId);if(!a)throw Error('账号不可用');
    if(a.platform==='xiaohongshu'||args.channel==='follow')return dom.command('mode',args);
    // Explicit activation begins a new event baseline; never replay history.
    a.activatedAt=Date.now();return store.setMode(args);
  }
  if(command==='policy'){if(args.paused){outreach.fanPlan.pause('全局暂停，保留粉丝批次进度');keywordRoutes.pauseAll('全局暂停，自动分配已停止');batch.stop();outreach.batch.stop('全局暂停，未开始的任务停止');}return store.updatePolicy(args);}
  if(command==='cancel')return store.cancelReply(args.id);
  if(command==='resolve'){const result=store.resolveUnknown(args.id,{sent:args.sent});if(dom.replyRoute(result))try{await dom.reconcile(args.id);}catch{/* Keep uncertain pages when native proof cannot be rechecked. */}return result;}
  if(command==='send') {if(busy||batchLock)throw Error('已有回复正在执行');busy=true;try{return await send(args.id);}finally{busy=false;}}
  if(command==='can-commit'){if(halted||closing)throw Error('互动已停止');const r=store.getReply(args.id);if(batchLock&&!batch.isAuthorized(r.id,batchLock))throw Error('批次已停止，未发送');return store.assertCanCommit(args.id);}
  if(command==='can-dom-operation'){if(halted||closing)throw Error('互动已停止');return dom.canOperation(args);}
  if(command==='save-teams'){if(busy||batchLock||['running','waiting'].includes(outreach.fanPlan.snapshot()?.status))throw Error('已有发送或批次正在执行，暂不能修改分工');return studio.saveTeams(args);}
  if(command.startsWith('own-fan-')||command==='directory-sync'||command.startsWith('directory-')||command.startsWith('outreach-'))return outreach.command(command,args);
  if(command==='archive-inspect')return archive.inspect(args.text);
  if(command==='archive-preview')return archive.prepare(args);
  if(command==='archive-confirm')return archive.confirm(args);
  if(command==='archive-list')return archive.list();
  if(command==='archive-history')return archive.history(args);
  if(command==='archive-export')return archive.export();
  if(command==='archive-export-original')return archive.exportOriginal(args);
  if(command==='contact-note-get')return contactNotes.get(args);
  if(command==='contact-note-save')return contactNotes.save(args);
  if(command==='contact-note-remove')return contactNotes.remove(args);
  if(command==='contact-note-list')return contactNotes.list(args);
  if(command.startsWith('connection-')){if(busy||batchLock)throw Error('已有发送或批次正在执行，连接暂不能变更');return dom.command(command.slice('connection-'.length),args);}
  if(command==='reply-open-profile'||command==='reply-open-chat'){if(busy||batchLock)throw Error('已有发送或批次正在执行，暂不能打开处理页面');return dom.command(command==='reply-open-profile'?'reply-profile':'reply-chat',args);}
  if(command==='batch-preview')return batch.preview(args);
  if(command==='batch-start')return batch.start(args);
  if(command==='batch-stop')return batch.stop();
  if(command==='close'){closing=true;keywordRoutes.close();batch.stop();outreach.close();dom.close();store.shutdown();return true;}
  if(command==='drain'){await outreach.fanPlan.idle();await keywordRoutes.idle();await outreach.idle();while(pending.size||browserPending.size||directoryPending.size||proofPending.size||busy||batch.active)await new Promise(resolve=>setTimeout(resolve,25));return true;}
  throw Error('不支持的互动操作');
}
parentPort.on('message', async input => {
  if(input.type==='browser-result'){const p=browserPending.get(input.id);if(p){browserPending.delete(input.id);clearTimeout(p.timer);if(input.error)p.reject(Object.assign(Error(input.error.message),{code:input.error.code}));else p.resolve(input.result);}return;}
  if(input.type==='browser-event'){try{dom.receive(input.event);}catch{lastError='官网页面状态回执无效，原记录保留';}return;}
  if(input.type==='directory-result'){const p=directoryPending.get(input.id);if(p){directoryPending.delete(input.id);clearTimeout(p.timer);input.error?p.reject(Error(input.error)):p.resolve(input.result);}return;}
  if(input.type==='reply-route-result'||input.type==='comment-verify-result'){const p=proofPending.get(input.id);if(p&&input.type===p.type+'-result'){proofPending.delete(input.id);clearTimeout(p.timer);input.error?p.reject(Error(input.error)):p.resolve(input.result);}return;}
  if(input.type==='send-result'){const p=pending.get(input.id);if(p){pending.delete(input.id);clearTimeout(p.timer);p.resolve(input.receipt);}return;}
  try{const result=await command(input.command,input.args||{});parentPort.postMessage({type:'result',id:input.id,result});}
  catch(error){const text=String(error?.message||'互动处理失败');parentPort.postMessage({type:'result',id:input.id,error:/cookie|token|password|https?:|[A-Za-z]:[\\/]/i.test(text)?'互动处理失败；原有记录保留':text.slice(0,500)});}
});
const tick=setInterval(async()=>{
  if(closing||halted||busy||batchLock||runtimePaused)return;
  if(performance.now()-lastContactAt>45000){halted=true;keywordRoutes.close();outreach.close();dom.close();store.shutdown();return;}
  void dom.tick().catch(()=>{lastError='官网互动只读检查未完成，原记录保留';});
  try{await outreach.fanPlan.tick();}catch{lastError='粉丝批次进度保存或核对失败，已暂停，请保留原记录';}
  try{await keywordRoutes.tick();}catch{lastError='关键词分配未完成，原记录保留，请核对任务';}
  if(closing||halted||busy||batchLock||runtimePaused)return;
  busy=true;
  try{const blocked=[...nextSends].filter(([,at])=>at>performance.now()).map(([id])=>id),next=store.nextDueAutoReply(blocked);if(next){store.expireStaleAutoReply(next.id);if(store.getReply(next.id).status==='queued')await send(next.id);}}
  catch(error){lastError=String(error?.message||'自动回复暂停').slice(0,240);}
  finally{busy=false;}
},1000);tick.unref();
parentPort.postMessage({type:'ready'});
