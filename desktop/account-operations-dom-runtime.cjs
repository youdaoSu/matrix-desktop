'use strict';
// Imported DOM managers execute only through the private, account-bound native
// browser bridge. The existing worker remains the ONLY send scheduler.
const {createBrowserProxy}=require('./account-operations-browser-proxy.cjs');
const {InteractionManager}=require('./vendor/hengyuan-interactions/src/interaction-manager.cjs');
const {prepareWelcomeRecipient}=require('./vendor/hengyuan-interactions/src/welcome-recipient.cjs');
const {prepareXhsRecipient}=require('./vendor/hengyuan-interactions/src/xhs-recipient.cjs');
function createDomRuntime({directory,studio,store,call,verifyComment=async()=>{throw Error('原生评论重新核验尚未接通');},changed=()=>{},now=Date.now,paused=()=>false,canBatch=()=>true,beforeClaim=()=>{},Manager=InteractionManager,prepareWelcome=prepareWelcomeRecipient,prepareXhsWelcome=prepareXhsRecipient}){
 let closed=false,lastTick=0,ticking=null,outreachHooks;
 const fail=message=>{throw Error(message);};
 const account=id=>studio.getAccount(id);
 function intent(context){
  if(context.outreachId){if(!outreachHooks)fail('协作发送后台尚未接通');return outreachHooks.intent(context);}
  if(!context.replyId)return null;
  const r=store.getReply(context.replyId);if(r.accountId!==context.accountId)fail('持久回复与当前页面账号不一致');
  return{replyId:r.id,...(r.claimId?{claimId:r.claimId}:{})};
 }
 const proxy=createBrowserProxy({call,getAccount:id=>{try{return account(id);}catch{return null;}},getIntent:intent});
 const adaptedStore=new Proxy(store,{get(target,key){
  if(key==='beginSend')return id=>{const deadline=proxy.currentOperation()?.intentExpiresAt;if(!Number.isSafeInteger(deadline)||deadline<=now())fail('本条发送准备已过期，尚未领取或提交');beforeClaim(target.getReply(id).accountId);return target.beginSend(id);};
  if(key==='ingest')return event=>{
   const a=account(event.accountId);
   // Native DY DM/comments already provide their own exact IDs and baselines.
   // A dependency DM page must never create a second DOM copy of those events.
   if(a.platform==='douyin'&&['dm','comment'].includes(event.channel))return{id:'native-owned:'+event.externalId};
   return target.ingest(event);
  };
  const value=target[key];return typeof value==='function'?value.bind(target):value;
 }});
 function prepareAdapter(prepare){return async options=>{
  if(manager.control.firstConversations?.[options.account.id]!==true)fail('自动欢迎或评论私信尚未获准建立首个单聊；请在官网连接面板明确开启，未填写或发送');
  const result=await proxy.withOperation('prepare-recipient',()=>prepare(options),{accountId:options.account.id});
  if(!result||typeof result.run!=='function')fail('官方单聊准备回执无效');const run=result.run.bind(result);
  return{...result,run:(op,...args)=>proxy.withOperation(op,()=>run(op,...args),{accountId:options.account.id})};
 };}
 const manager=new Manager({dataDir:directory,studio:studio.managerView(),interactions:adaptedStore,createWindow:proxy.createWindow,changed,prepareWelcome:prepareAdapter(prepareWelcome),prepareXhsWelcome:prepareAdapter(prepareXhsWelcome)});
 if(manager.control.firstConversations===undefined)manager.control.firstConversations={};
 if(!manager.control.firstConversations||typeof manager.control.firstConversations!=='object'||Array.isArray(manager.control.firstConversations)||Object.values(manager.control.firstConversations).some(v=>typeof v!=='boolean'))fail('首个单聊授权设置损坏，未扩大原规则的发送范围');
 manager.start=()=>{};manager.scheduleQueuedReply=()=>null;
 // Never restore monitoring merely because old encrypted control bits exist.
 for(const value of Object.values(manager.control.channels||{}))value.monitorEnabled=false;
 manager.saveControl();
 const execute=manager.execute.bind(manager);manager.execute=(c,op,payload)=>proxy.withOperation(op,()=>execute(c,op,payload),{accountId:c.accountId});
 const runPage=manager.runPage.bind(manager);manager.runPage=async(c,op,payload,beforeExecute)=>{
  if(!c.nativeComment)return runPage(c,op,payload,beforeExecute);if(op!=='scan')fail('原生评论来源仅允许重新核验，不执行页面写入');const context=proxy.currentOperation(),reply=context?.replyId&&store.getReply(context.replyId);if(!reply||reply.accountId!==c.accountId||reply.channel!=='comment'||reply.deliveryChannel!=='dm')fail('原生评论证明缺少对应的冻结回复');const message=store.getMessage(reply.messageId),generation=c.generation;manager.assertCurrent(c,generation);beforeExecute?.();const proof=await verifyComment({accountId:c.accountId,message});manager.assertCurrent(c,generation);if(proof?.ownUid!==c.identity||proof.record?.platformUserId!==message.senderId||proof.record.workId!==message.threadId||proof.record.content!==message.text||proof.record.displayTime!==message.receivedAt||proof.record.authorProfileUrl!==message.profileUrl)fail('本轮原生评论证明与原账号、原评论或作者主页不一致');return{ok:true,ready:true,identity:proof.ownUid,threadId:message.threadId,invalidRows:0,messages:[{...message}]};
 };
 const pin=manager.pinIdentity.bind(manager);manager.pinIdentity=(connection,identity)=>{
  const expected=connection.win.state?.expectedIdentity;
  if(!expected||identity!==expected)fail('官网本人账号与当前绑定不一致，连接未启用');return pin(connection,identity);
 };
 const failConnection=manager.failConnection.bind(manager);manager.failConnection=(c,error,...args)=>{
  if(error?.code==='MATRIX_UI_PRIORITY'){c.detail='当前窗口操作优先，后台只读检查暂时让步';return;}
  return failConnection(c,error,...args);
 };
 function supported(input,{dependency=false}={}){
  const a=account(input.accountId);if(!['dm','comment','follow'].includes(input.channel))fail('运营连接渠道无效');
  if(a.platform==='douyin'&&input.channel==='comment')fail('抖音评论继续使用现有原生管理链路，尚未接入评论转新单聊验证');
  if(a.platform==='douyin'&&input.channel==='dm'&&!dependency)fail('抖音私信继续使用原生收发；官网私信页仅用于新关注的单聊准备');
  return a;
 }
 const firstConversationAllowed=id=>manager.control.firstConversations?.[id]===true;
 function replyRoute(reply){const a=account(reply.accountId);return a.platform==='xiaohongshu'||reply.channel==='follow'||reply.channel==='comment'&&reply.deliveryChannel==='dm'&&firstConversationAllowed(a.id);}
 async function reconcile(id){const r=store.getReply(id);if(!r.claimId)return{matched:0,settled:0};return proxy.finalizeIntent({accountId:r.accountId,replyId:r.id,claimId:r.claimId});}
 async function sendReply(id,authorization){
  if(closed||paused())fail('当前窗口操作优先或服务已停止，未开始发送');const before=store.getReply(id);if(!replyRoute(before))fail('此回复应使用原生发送链路');
  let nativeSource;
  if(before.channel==='comment'&&before.deliveryChannel==='dm'){
   const dm=manager.connections.get(manager.key(before.accountId,'dm'));if(!firstConversationAllowed(before.accountId)||!dm||dm.status!=='ready'||dm.win.isDestroyed()||!dm.identity)fail('评论转首个单聊需先明确授权并核对同账号官网私信连接；未发送');
   nativeSource={key:manager.key(before.accountId,'comment'),accountId:before.accountId,channel:'comment',win:dm.win,identity:dm.identity,status:'ready',generation:0,busy:false,nativeComment:true,visitedThreads:new Set(),cursor:0,startedAt:now()};if(manager.connections.has(nativeSource.key))fail('原评论渠道正在处理其他操作，未覆盖旧页面');manager.connections.set(nativeSource.key,nativeSource);
  }
  try{return await proxy.withOperation('prepare',()=>authorization?manager.sendBatchReply(id,authorization):manager.sendReply(id),{accountId:before.accountId,replyId:id,intentExpiresAt:now()+60000});}
  finally{
   try{await reconcile(id);}catch{/* Unknown/draft pages remain retained. */}
   if(nativeSource&&manager.connections.get(nativeSource.key)===nativeSource)manager.connections.delete(nativeSource.key);
  }
 }
 function canOperation(context){
  const a=account(context.accountId);if(closed)fail('互动服务已停止');
  if(context.outreachId){if(!outreachHooks)fail('协作发送后台尚未接通');return outreachHooks.canOperation(context);}
  if(!context.replyId) {if(context.write)fail('页面写入缺少持久回复');return{allowed:true};}
  const r=store.getReply(context.replyId),domKind=a.platform==='xiaohongshu'||r.channel==='follow'||r.channel==='comment'&&r.deliveryChannel==='dm';if(r.accountId!==a.id||!domKind||context.claimId&&context.claimId!==r.claimId)fail('页面操作的原账号、回复或领取凭据已变化');
  if(context.operation==='finalize'){
   const receipt=r.receipt,platformProof=typeof receipt==='string'?/^platform:\S+$/.test(receipt):receipt?.kind==='platform-ack'&&Boolean(receipt.messageId);
   const rejection=typeof receipt==='string'&&/^platform-rejection:\S+$/.test(receipt);
   return{settled:r.status==='sent'&&(platformProof||Boolean(r.resolvedAt))||r.status==='failed'&&(rejection||Boolean(r.resolvedAt))};
  }
  if(context.operation==='receipt'&&r.status==='sending'&&context.claimId===r.claimId)return{allowed:true};
  if(context.inspection===true&&!context.write&&['scan','probe','probeComposer','selectThread','inspect-welcome','profile-identity','recipient-entry','recipient-navigation','idlePageProbe'].includes(context.operation)&&['unknown','failed','sent','skipped','cancelled'].includes(r.status))return{allowed:true};
  if(paused()&&!r.claimId)fail('当前窗口操作优先，未开始新的页面操作');
  if(store.getPolicy().paused||!['queued','sending'].includes(r.status)||!canBatch(r.id))fail('回复已暂停、取消、结束或批次已停止，未执行页面操作');
  if(context.write){if(!Number.isSafeInteger(context.intentExpiresAt)||context.intentExpiresAt<=now())fail('本条发送确认已过期，未继续提交');if(r.channel==='comment'&&r.deliveryChannel==='dm'&&!firstConversationAllowed(r.accountId))fail('评论首个单聊授权已撤回，未继续提交');if(!r.claimId||context.claimId!==r.claimId)fail('发送领取凭据不一致');store.assertCanCommit(r.id);}
  return{allowed:true};
 }
 async function command(name,args={}){
  if(closed)fail('账号运营连接已停止');
  if(name==='first-chat'){account(args.accountId);if(typeof args.allowed!=='boolean'||args.allowed&&args.acknowledgeEligibleRelationship!==true)fail('请明确确认仅为真实来源和平台允许的关系准备首个单聊');manager.control.firstConversations[args.accountId]=args.allowed;manager.saveControl();return{allowed:args.allowed};}
  if(name==='reply-profile'||name==='reply-chat'){const r=store.getReply(args.id),result=await proxy.withOperation('inspect-welcome',()=>name==='reply-profile'?manager.openWelcomeProfile({id:args.id}):manager.openWelcomeChat({id:args.id}),{accountId:r.accountId,replyId:r.id,inspection:true});await proxy.settleAccount(r.accountId);return result;}
  if(name==='open'){supported(args,{dependency:args.channel==='dm'});const result=manager.open({accountId:args.accountId,channel:args.channel,background:args.background!==false});await proxy.settleAccount(args.accountId);return result;}
  if(name==='check'){supported(args,{dependency:args.channel==='dm'});return manager.connect({accountId:args.accountId,channel:args.channel,background:true});}
  if(name==='monitor'){supported(args);if(args.enabled&&args.acknowledgeOfficialRead!==true)fail('官网监听可能更新通知或会话已读状态，请先确认知悉');return manager.setMonitoring({accountId:args.accountId,channel:args.channel,enabled:args.enabled});}
  if(name==='mode'){supported(args,{dependency:args.channel==='dm'});return manager.setMode(args);}
  if(name==='release-idle')return manager.releaseIdleConnections(args);
  fail('不支持的官网互动连接操作');
 }
 async function tick(){if(closed||paused()||ticking||now()-lastTick<5000||!Object.values(manager.control.channels).some(c=>c.monitorEnabled))return;lastTick=now();ticking=Promise.resolve().then(()=>manager.tick()).finally(()=>{ticking=null;});return ticking;}
 function snapshot(){
  if(!manager.connections.size)return{connections:studio.activeAccounts().flatMap(a=>['dm','comment','follow'].map(channel=>({accountId:a.id,channel,status:'closed',detail:'尚未打开官网连接；登录问题请到账号管理处理',mode:store.getMode(a.id,channel),monitorEnabled:false,eventValidated:false,background:true,identityBound:Boolean(manager.control.bindings[a.id]),lastSuccessfulAt:null,firstConversationAllowed:firstConversationAllowed(a.id)}))),resources:{residentCount:0,visibleCount:0,hiddenCount:0,monitoringCount:0,busyCount:0,idleHiddenCount:0}};
  const summary=manager.resourceSummary(),physical=proxy.snapshot().filter(w=>!w.destroyed),real=[...manager.connections.values()].filter(c=>!c.nativeComment&&!c.win.isDestroyed());return{connections:manager.snapshot().filter(row=>!manager.connections.get(manager.key(row.accountId,row.channel))?.nativeComment).map(({profile,...row})=>({...row,firstConversationAllowed:firstConversationAllowed(row.accountId)})),resources:{...summary,residentCount:physical.length,visibleCount:physical.filter(w=>w.visible).length,hiddenCount:physical.filter(w=>!w.visible).length,busyCount:new Set([...real.filter(c=>c.busy).map(c=>c.win.id),...(outreachHooks?.busyWindowIds?.()||[])]).size}};
 }
 function closeAccount(id){manager.closeAccount(id);}
 function close(){closed=true;manager.shutdown();proxy.close();}
 function registerNativeIdentity(id,identity,verifiedAt){const a=account(id);if(a.platform!=='douyin'||typeof identity!=='string'||!/^[1-9]\d{0,63}$/.test(identity))fail('原生目录本人身份无效');const at=verifiedAt===undefined?new Date(now()).toISOString():verifiedAt;if(typeof at!=='string'||!Number.isFinite(Date.parse(at))||Date.parse(at)>now()||now()-Date.parse(at)>60000)fail('原生目录本人核验时间无效或已过期');const old=manager.control.bindings[id];if(old&&(old.platform!==a.platform||old.identity!==identity))fail('原生目录本人身份与运营绑定不一致，未更换身份');if(!old){manager.control.bindings[id]={platform:a.platform,identity,establishedAt:at};manager.saveControl();}return structuredClone(manager.control.bindings[id]);}
 return{manager,proxy,command,replyRoute,firstConversationAllowed,sendReply,reconcile,canOperation,tick,snapshot,closeAccount,close,receive:proxy.receive,registerNativeIdentity,attachOutreach(hooks){if(outreachHooks||!hooks||typeof hooks.intent!=='function'||typeof hooks.canOperation!=='function')fail('协作后台桥接无效或已注册');outreachHooks=hooks;}};
}
module.exports={createDomRuntime};
