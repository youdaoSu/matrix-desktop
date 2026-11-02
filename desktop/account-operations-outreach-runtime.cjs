'use strict';
const path=require('node:path');
const {read,write}=require('./vendor/hengyuan-interactions/src/workspace-data.cjs');
const {OutreachStore}=require('./vendor/hengyuan-interactions/src/outreach.cjs');
const {OutreachManager}=require('./vendor/hengyuan-interactions/src/outreach-manager.cjs');
const {OutreachBatchController}=require('./vendor/hengyuan-interactions/src/outreach-batch.cjs');
const {FanFollowupStore}=require('./vendor/hengyuan-interactions/src/fan-followup.cjs');
const {OperationsDirectory}=require('./account-operations-directory.cjs');
const {OwnFanBatchPlan}=require('./own-fan-batch-plan.cjs');
function createOutreachRuntime({directory,studio,store,dom,refreshDirectory,reserve,release,canRun,canWrite,beforeClaim=()=>{},authorizeAutomatic=()=>false,verifyAutomaticSource=async()=>{throw Error('自动规则来源核验尚未接通');},now=Date.now}){
 let closed=false,tasks,followup,previewEpoch=0,pendingPreviewAccounts=null;const fail=message=>{throw Error(message);};
 const binding=id=>{studio.getAccount(id);return dom.manager.control.bindings[id]||null;};
 const fans=new OperationsDirectory({studio,getBinding:binding});
 followup=new FanFollowupStore({dataDir:directory,fans,getHistory:()=>({studio:studio.snapshot(),interaction:{...store.snapshot(),externalAttempts:store.getExternalAttempts()}}),now});
 tasks=new OutreachStore({studio,interactions:store,fans,getFollowup:options=>followup.snapshot(options),getBinding:binding,now});
 const begin=tasks.beginSend.bind(tasks);tasks.beginSend=(id,options)=>{const deadline=dom.proxy.currentOperation()?.intentExpiresAt;if(!Number.isSafeInteger(deadline)||deadline<=now())fail('本条协作发送准备已过期，尚未领取或提交');const selected=tasks.get(id);if(selected.origin==='own-fan'&&(!['running','waiting'].includes(fanPlan.plan?.status)||fanPlan.plan?.taskId!==id))fail('本人粉丝任务需从原计划按间隔继续');beforeClaim(selected.accountId);return begin(id,options);};
 const manager=new OutreachManager({studio,tasks,createWindow:dom.proxy.createWindow,now});
 const execute=manager.execute.bind(manager);manager.execute=(page,script,options={})=>dom.proxy.withOperation(options.operationName||'probe',()=>execute(page,script,options),{accountId:page.accountId,outreachId:page.id});
 const run=manager.run.bind(manager);manager.run=(page,op,payload={},options)=>dom.proxy.withOperation(op,()=>run(page,op,payload,options),{accountId:page.accountId,outreachId:page.id,...(payload.recipientId?{recipientId:payload.recipientId}:{})});
 function sync(input){dom.registerNativeIdentity(input.primaryAccountId,input.ownerIdentity,input.nativeDirectoryProof?.verifiedAt);dom.registerNativeIdentity(input.accountId,input.readerIdentity,input.nativeDirectoryProof?.verifiedAt);const page=fans.merge(input),history=followup.snapshot(),ids=new Set(page.items.map(f=>f.id));return{...page,contactRecords:history.records.filter(r=>ids.has(r.fanId)),coverage:history.coverage};}
 async function refreshFor(input){const projected=await refreshDirectory(input);if(projected?.primaryAccountId!==input.primaryAccountId||projected?.accountId!==input.accountId||input.ids?.some(id=>!projected.items?.some(item=>item.id===id)))fail('目录核对账号或联系人与本次选择不一致');return projected;}
 async function refreshTask(task){if(task.sourceKind==='fan-directory'){
  const page=await refreshFor({primaryAccountId:task.primaryAccountId,accountId:task.accountId,ids:[task.sourceFanId],...(task.origin==='own-fan'?{ownFanHistory:true}:{})});
  sync(page);if(task.origin==='own-fan'&&page.contactHistory?.items.find(r=>r.id===task.sourceFanId)?.status!=='eligible')fail('本人私信历史未通过未联系核对，未提交');
 }}
 async function finalize(id){const task=tasks.get(id);return dom.proxy.finalizeIntent({accountId:task.accountId,outreachId:id,claimId:id});}
 const originalSend=manager.send.bind(manager);manager.send=async(id,options)=>{
  const task=tasks.get(id);if(closed||!canRun())fail('互动服务已暂停或另有发送任务，未开始协作发送');await refreshTask(task);
  if(options?.batchId&&batch.snapshot()?.executionKind==='keyword-rule'){await verifyAutomaticSource(task);if(!canRun()||!canWrite(id))fail('自动规则核验后已暂停，未开始发送');}
  return dom.proxy.withOperation('prepare',async()=>{try{return await originalSend(id,options);}finally{try{await finalize(id);}catch{/* Preserve uncertainty until a durable result or manual verification. */}}},{accountId:task.accountId,outreachId:id,intentExpiresAt:now()+60000});
 };
 const file=path.join(directory,'outreach-batch.json'),saved=read(file,true);
 const batch=new OutreachBatchController({tasks,manager,now,authorizeAutomatic,wait:ms=>new Promise(resolve=>setTimeout(resolve,Math.max(ms,4500))),reserve:(id,ids)=>reserve(id,ids),release:id=>release(id),cancelReservation:id=>dom.manager.cancelExternalBatch(id),loadState:()=>saved?.state??null,saveState:state=>write(file,{version:1,state})});manager.batchController=batch;
 const planFile=path.join(directory,'own-fan-plan.json');
 const fanPlan=new OwnFanBatchPlan({load:()=>read(planFile,true),save:value=>write(planFile,value),now,
  canRun:()=>!closed&&canRun()&&!batch.active&&!batch.hasPendingPreview&&!store.getPolicy().paused,
  scan:async input=>{
   const primary=studio.getAccount(input.accountId);if(primary.platform!=='douyin'||primary.role!=='primary')fail('请选择已设置为主账号的抖音账号');
   const records=new Set(followup.snapshot().records.map(r=>r.fanId)),recipients=[];let scanned=0,excluded=0,unknown=0,total=0,fixed;
   for(let offset=input.offset;scanned<input.scanLimit;){
    if(closed||!canRun())fail('核对已暂停');
    const page=await refreshFor({primaryAccountId:primary.id,accountId:primary.id,offset,limit:Math.min(50,input.scanLimit-scanned),ownFanHistory:true});sync(page);
    const b=JSON.stringify(binding(primary.id));if(fixed&&fixed!==b)fail('核对期间账号绑定发生变化');fixed=b;total=page.total;
    if(!page.items.length)break;
    for(const fan of page.items){const proof=page.contactHistory?.items.find(r=>r.id===fan.id&&r.uid===fan.uid);if(records.has(fan.id)||proof?.status==='contacted')excluded++;else if(proof?.status==='eligible')recipients.push(fan);else unknown++;}
    scanned+=page.items.length;offset+=page.items.length;if(offset>=total)break;
   }
   return{binding:fixed,recipients,scanned,excluded,unknown,nextOffset:input.offset+scanned,sourceTotal:total};
  },
  check:async(plan,fan)=>{
   if(JSON.stringify(binding(plan.accountId))!==plan.binding)fail('原账号登录绑定已变化，请结束原计划后重新核对');
   const page=await refreshFor({primaryAccountId:plan.accountId,accountId:plan.accountId,ids:[fan.id],ownFanHistory:true});sync(page);
   if(JSON.stringify(binding(plan.accountId))!==plan.binding||page.items[0]?.uid!==fan.uid)fail('当前粉丝或账号身份已变化');
   if(followup.snapshot({excludeTaskId:plan.taskId||undefined}).records.some(r=>r.fanId===fan.id))return 'contacted';
   return page.contactHistory?.items.find(r=>r.id===fan.id&&r.uid===fan.uid)?.status||'unknown';
  },
  createTask:(plan,fan)=>tasks.create({primaryAccountId:plan.accountId,senderAccountIds:[plan.accountId],sourceKind:'fan-directory',fanIds:[fan.id],channel:'dm',text:plan.text},{ownFans:true})[0],
  getTask:id=>tasks.get(id),cancelTask:id=>tasks.cancel(id),stopTask:()=>{const id=fanPlan.plan?.taskId;if(id&&batch.snapshot()?.taskIds.includes(id))batch.stop('本人粉丝计划暂停，未继续发送');},
  sendTask:async id=>{const preview=batch.preview({ids:[id]});if(preview.readyCount!==1)fail(preview.blocked[0]?.detail||'当前任务不能发送');batch.start({token:preview.token});await batch.idle();}
 });
 function invalidatePreview(){previewEpoch++;pendingPreviewAccounts=null;batch.invalidatePreview();}
 async function preparePreview(ids,finish){
  invalidatePreview();const epoch=previewEpoch;
  try{
   const fixed=ids.map(id=>tasks.get(id));pendingPreviewAccounts=new Set(fixed.flatMap(task=>[task.accountId,task.primaryAccountId]));
   // One bounded native-cache proof per exact source/sender pair, retaining
   // every selected ID. Actual sends still refresh their own target separately.
   const groups=new Map();for(const task of fixed)if(task.sourceKind==='fan-directory'){const key=JSON.stringify([task.primaryAccountId,task.accountId]);if(!groups.has(key))groups.set(key,{primaryAccountId:task.primaryAccountId,accountId:task.accountId,ids:new Set()});groups.get(key).ids.add(task.sourceFanId);}
   for(const group of groups.values()){const result=await refreshFor({primaryAccountId:group.primaryAccountId,accountId:group.accountId,ids:[...group.ids]});if(epoch!==previewEpoch||closed||!canRun())fail('预览已变化或服务已暂停，请重新核对');sync(result);}
   return finish();
  }finally{if(epoch===previewEpoch)pendingPreviewAccounts=null;}
 }
 if(saved?.state&&!batch.snapshot())fail('协作批次摘要损坏，原文件保留；没有自动恢复发送');
 dom.attachOutreach({
  busyWindowIds:()=>[...manager.pages.values()].filter(p=>manager.accountOperations.has(p.accountId)||manager.busyAccounts.has(p.accountId)).map(p=>p.win.id),
  intent(context){const task=tasks.get(context.outreachId);if(task.accountId!==context.accountId)fail('协作页面账号与冻结任务不一致');return{outreachId:task.id,...(store.getExternalAttempt(task.id)?{claimId:task.id}:{})};},
  async canOperation(context){
   if(closed)fail('协作服务已停止');const task=tasks.get(context.outreachId);studio.getAccount(task.accountId);if(task.accountId!==context.accountId||context.claimId&&context.claimId!==task.id)fail('协作原账号、任务或领取凭据已变化');
   const attempt=store.getExternalAttempt(task.id);if(context.operation==='finalize'){const receipt=task.receipt;return{settled:Boolean(attempt)&&(task.status==='sent'&&(typeof receipt==='string'&&/^platform:\S+$/.test(receipt)||Boolean(task.resolvedAt))||task.status==='failed'&&(task.failure?.outcome==='not-sent'&&['commit','receipt'].includes(task.failure.stage)||Boolean(task.resolvedAt)))};}
   if(context.operation==='receipt'&&task.status==='sending'&&context.claimId===task.id&&attempt)return{allowed:true};
   if(!['review','sending'].includes(task.status)||store.getPolicy().paused||!canWrite(task.id))fail('协作任务已结束、暂停或批次已停止，未继续操作');
   if(context.write){if(task.origin==='own-fan'&&(!['running','waiting'].includes(fanPlan.plan?.status)||fanPlan.plan?.taskId!==task.id))fail('本人粉丝计划已暂停或对象已变化');if(!Number.isSafeInteger(context.intentExpiresAt)||context.intentExpiresAt<=now())fail('协作发送确认已过期，未继续提交');if(task.status!=='sending'||!attempt||context.claimId!==task.id)fail('协作发送缺少持久领取记录');await refreshTask(task);if(batch.snapshot()?.executionKind==='keyword-rule'&&batch.active)await verifyAutomaticSource(task);if(!canWrite(task.id))fail('协作批次已停止，未提交');tasks.assertCanCommit(task.id,{recipientId:context.recipientId});}
   return{allowed:true};
  }
 });
 async function command(name,args={}){
  if(name.startsWith('own-fan-')){if(closed)fail('互动已关闭');
   if(name==='own-fan-pause')return fanPlan.pause();if(name==='own-fan-cancel')return fanPlan.cancel();
   if(!canRun())fail('互动暂不可用');
   if(name==='own-fan-preview')return fanPlan.preview(args);if(name==='own-fan-start')return fanPlan.start(args);if(name==='own-fan-resume')return fanPlan.resume();
   fail('不支持的粉丝计划操作');
  }
  if(name==='outreach-stop')fanPlan.pause();
  if(fanPlan.plan&&['running','waiting'].includes(fanPlan.plan.status)&&['outreach-create','outreach-preview','outreach-preview-remaining','outreach-start'].includes(name))fail('本人粉丝计划仍在运行，请先暂停');
  if(name==='directory-sync')return sync(args);
  if(name==='directory-mark-preview')return followup.preview(args);
  if(name==='directory-mark')return followup.mark(args);
  if(name==='outreach-stop'){invalidatePreview();return batch.stop();}
  if(name==='outreach-show'){const task=tasks.get(args.id),result=manager.showTask(args.id);await dom.proxy.settleAccount(task.accountId);return result;}
  if(closed||!canRun())fail('另有发送或服务已暂停，协作操作尚未执行');
  if(name==='outreach-create'){
   if(args.acknowledgeEligibleRelationship!==true||args.channel!=='dm')fail('仅支持已获允许的会话关系，需明确确认；公开评论不通过此目录批量发送');
   const senders=args.senderAccountIds;
   if(!Array.isArray(senders)||!senders.length||senders.length>10||new Set(senders).size!==senders.length)fail('请选择 1 至 10 个不同的已绑定发送账号');
   const primary=studio.getAccount(args.primaryAccountId);
   for(const id of senders){const sender=studio.getAccount(id);if(primary.role!=='primary'||sender.role!=='member'||sender.primaryAccountId!==primary.id||sender.platform!==primary.platform)fail('发送账号必须属于该主号且平台一致');}
   if(args.sourceKind==='fan-directory'){
    if(!Array.isArray(args.fanIds)||!args.fanIds.length||args.fanIds.length>50)fail('一次选择 1 至 50 位明确联系人');
    // Validate every selected reader. A proof from the first account never
    // substitutes for another account's current binding or directory access.
    for(const accountId of senders){const projected=await refreshFor({primaryAccountId:args.primaryAccountId,accountId,ids:args.fanIds});if(closed||!canRun())fail('服务已暂停，未建立协作任务');sync(projected);}
   }
   const {acknowledgeEligibleRelationship,...input}=args;return tasks.create(input);
  }
  if(name==='outreach-preview'){if(!Array.isArray(args.ids)||!args.ids.length||args.ids.length>50){invalidatePreview();fail('一次核对 1 至 50 条固定任务');}return preparePreview(args.ids,()=>batch.preview(args));}
  if(name==='outreach-preview-remaining'){const previous=batch.snapshot();if(!previous||previous.id!==args.batchId||!previous.canContinue){invalidatePreview();fail('原批次已变化或尚未停止，请刷新后核对剩余任务');}return preparePreview(previous.remainingTaskIds,()=>batch.previewRemaining({batchId:args.batchId}));}
  if(name==='outreach-start'){previewEpoch++;pendingPreviewAccounts=null;try{return batch.start(args);}catch(error){batch.invalidatePreview();throw error;}}
  if(name==='outreach-cancel')return tasks.cancel(args.id);
  if(name==='outreach-resolve'){const result=tasks.resolve(args.id,{sent:args.sent});try{await finalize(args.id);}catch{}return result;}
  if(name==='outreach-primary-followups')return tasks.createPrimaryFollowups(args);
  if(name==='outreach-retry-preflight')return tasks.retryPreflight(args);
  fail('不支持的目录或协作操作');
 }
 function closeAccount(id){if(fanPlan.plan?.accountId===id)fanPlan.pause('原账号连接已关闭，保留进度');if(pendingPreviewAccounts?.has(id))invalidatePreview();batch.stopAccount(id);manager.closeAccount(id);fans.closeAccount(id);}
 function close(){fanPlan.pause('互动已关闭，保留进度');closed=true;invalidatePreview();batch.stop('应用已退出，旧批次不会自动续发');manager.shutdown();}
 return{fanPlan,command,sync,tasks,followup,fans,batch,manager,closeAccount,close,idle:()=>batch.idle(),get active(){return batch.active;},snapshot:query=>({...studio.outreachPage(query),batch:batch.snapshot()})};
}
module.exports={createOutreachRuntime};
