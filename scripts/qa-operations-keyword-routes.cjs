// Actual encrypted stores and batch controller; the sender is an inert fixture.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {cipher}=require('../desktop/account-operations-crypto.cjs');
const {configureEncryptedWorkspace}=require('../desktop/vendor/hengyuan-interactions/src/workspace-data.cjs');
const {OperationsStudio}=require('../desktop/account-operations-studio.cjs');
const {InteractionStore}=require('../desktop/vendor/hengyuan-interactions/src/interaction-store.cjs');
const {OutreachStore}=require('../desktop/vendor/hengyuan-interactions/src/outreach.cjs');
const {OutreachBatchController}=require('../desktop/vendor/hengyuan-interactions/src/outreach-batch.cjs');
const {KeywordRoutes}=require('../desktop/account-operations-keyword-routes.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},reject=fn=>{assert.throws(fn);checks++;};
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yuanxiao-keyword-')),key=crypto.randomBytes(32);
 const unregister=configureEncryptedWorkspace({directory,codecFor:name=>cipher(key,'keyword/'+name)});
 let now=Date.now()+1000,engine,allowed=true,paused=false,failSend=false,revokedDuringSend=false,dispatches=[];
 try{
  const accounts=['主号','客服甲','客服乙'].map((name,i)=>({id:crypto.randomUUID(),name,platform:'douyin',binding:'synthetic-'+i})),[primary,a,b]=accounts;
  const studio=new OperationsStudio({directory});studio.configure(accounts);studio.saveTeams([{id:primary.id,role:'primary'},{id:a.id,role:'member',primaryAccountId:primary.id},{id:b.id,role:'member',primaryAccountId:primary.id}]);
  const bindings=new Map(accounts.map((a,i)=>[a.id,{platform:'douyin',identity:String(i+100),establishedAt:new Date(now-1000).toISOString()}]));
  const store=new InteractionStore(directory,{...cipher(key,'incoming'),now:()=>now,getAccount:id=>studio.getAccount(id)});
  const tasks=new OutreachStore({studio,interactions:store,getBinding:id=>bindings.get(id),now:()=>now});
  const manager={busyAccounts:new Set(),checkingCount:0,cancelBatchOperation:async()=>{},send:async(taskId,{batchId})=>{
   eq(batch.isAuthorized(taskId,batchId),true);
   if(revokedDuringSend){allowed=false;eq(batch.isAuthorized(taskId,batchId),false);throw Error('synthetic authorization revoked');}
   const task=tasks.beginSend(taskId);dispatches.push(task.accountId);
   return tasks.finishSend(taskId,failSend?{status:'unknown',error:'synthetic uncertainty'}:{status:'sent',receipt:'platform:synthetic-'+taskId});
  }};
  const batch=new OutreachBatchController({tasks,manager,now:()=>now,wait:async()=>{},authorizeAutomatic:(grant,ids)=>engine.authorized(grant,ids)});
  const options={directory,studio,store,tasks,now:()=>now,canSchedule:()=>!paused&&!batch.active&&!batch.hasPendingPreview,canUseSender:()=>allowed,start:async(taskId,authority)=>{batch.startAutomatic({taskId,authority});await batch.idle();},stop:()=>batch.stop()};
  engine=new KeywordRoutes(options);
  const input={name:'合成资料请求',primaryAccountId:primary.id,senderAccountIds:[a.id,b.id],workIds:['7123456789012345678'],keywords:['求','已关注'],match:'contains',replyText:'隔离测试资料答复',delaySeconds:15,hourlyLimit:5,dailyLimit:20};
  reject(()=>engine.save({...input,senderAccountIds:[a.id,a.id]}));reject(()=>engine.save({...input,delaySeconds:1}));reject(()=>engine.save({...input,keywords:[]}));
  const rule=engine.save(input),arm=()=>engine.arm({id:rule.id,revision:rule.revision,acknowledgeAutomatic:true,acknowledgeEligibleRelationship:true});
  reject(()=>engine.arm({id:rule.id,revision:rule.revision}));allowed=false;reject(arm);allowed=true;arm();
  const priorPlan=engine.monitorPlan()[0];arm();const freshPlan=engine.monitorPlan()[0];eq(priorPlan.generation!==freshPlan.generation,true);eq(engine.monitorResult({...priorPlan,status:'paused',detail:'旧轮次错误',at:new Date(now).toISOString()}),false);eq(engine.snapshot().rules[0].armed,true);eq(engine.monitorResult({...freshPlan,status:'ready',detail:'合成读取完成',at:new Date(now).toISOString()}),true);eq(engine.snapshot().monitors[0].lastReadAt,new Date(now).toISOString());
  let sequence=0;const comment=(extra={})=>store.ingest({accountId:primary.id,channel:'comment',externalId:'7123456789012345678/'+(++sequence),threadId:'7123456789012345678',senderId:String(200+sequence),senderName:'合成咨询者',text:'求资料',receivedAt:new Date(now).toISOString(),profileUrl:'https://www.douyin.com/user/MS4wSynthetic'+sequence,isOwn:false,isGroup:false,historical:false,...extra});
  eq(engine.observe(comment()),null);now++;
  for(const extra of [{historical:true},{isOwn:true},{isGroup:true},{text:'普通评论'},{threadId:'7123456789012345679'},{receivedAt:new Date(now+100).toISOString()}])eq(engine.observe(comment(extra)),null);
  store.saveRule({name:'原有私信回复互斥',platform:'douyin',accountIds:[primary.id],channel:'comment',deliveryChannel:'dm',match:'contains',keywords:['互斥'],replyText:'合成原有回复',cooldownMinutes:0});now++;const collision=comment({text:'求资料 互斥'});eq(store.hasPrivateTarget({platform:'douyin',senderId:collision.senderId}),true);eq(engine.observe(collision),null);
  const first=comment(),h1=engine.observe(first);eq(h1.status,'queued');eq(h1.accountId,a.id);eq(dispatches.length,0);
  eq(engine.observe(first),null);eq(engine.observe({...first,text:'伪造修改'}),null);
  now++;eq(engine.observe(comment({senderId:first.senderId})),null);
  const h2=engine.observe(comment()),h3=engine.observe(comment());eq([h1.accountId,h2.accountId,h3.accountId],[a.id,b.id,a.id]);
  await engine.tick();eq(dispatches.length,0);now+=15001;await engine.tick();eq(dispatches,[a.id]);
  eq(batch.snapshot().executionKind,'keyword-rule');eq(engine.snapshot().hits.find(h=>h.id===h1.id).status,'sent');
  await engine.tick();eq(dispatches.length,1);now+=15001;await engine.tick();now+=15001;await engine.tick();eq(dispatches,[a.id,b.id,a.id]);
  const saved=batch.exportState(),restored=new OutreachBatchController({tasks,manager,loadState:()=>saved});eq(restored.snapshot().executionKind,'keyword-rule');eq(restored.isAuthorized(h3.taskId,saved.batch.id),false);
  reject(()=>batch.startAutomatic({taskId:h3.taskId,authority:{}}));
  now++;const h4=engine.observe(comment());batch.preview({ids:[h4.taskId]});now+=15001;await engine.tick();eq(dispatches.length,3);batch.invalidatePreview();
  failSend=true;await engine.tick();eq(dispatches.length,4);eq(engine.snapshot().rules[0].armed,false);eq(tasks.get(h4.taskId).status,'unknown');
  now+=15001;await engine.tick();eq(dispatches.length,4);failSend=false;arm();now++;
  eq(engine.observe(comment({senderId:tasks.get(h4.taskId).recipientId})),null);
  const h5=engine.observe(comment());eq(h5.accountId,a.id);
  eq(engine.observe(comment()),null);eq(engine.snapshot().rules[0].armed,true);eq(engine.snapshot().hits.find(h=>h.id===h5.id).status,'queued');
  const restarted=new KeywordRoutes(options);eq(restarted.snapshot().rules[0].armed,false);eq(restarted.snapshot().hits.find(h=>h.id===h5.id).status,'paused');
  engine=restarted;now+=15001;await engine.tick();eq(dispatches.length,4);
  // Advance past rolling-hour quota, then revoke permission at the final gate.
  now+=3600001;arm();now++;const h6=engine.observe(comment());revokedDuringSend=true;now+=15001;await engine.tick();
  eq(dispatches.length,4);eq(engine.snapshot().rules[0].armed,false);eq(tasks.get(h6.taskId).accountId,b.id);eq(tasks.get(h6.taskId).claimedAt,undefined);
  eq(store.getExternalAttempts().length,4);eq(fs.readFileSync(path.join(directory,'keyword-routes.json')).subarray(0,4).toString(),'YXOP');
  allowed=true;revokedDuringSend=false;const dailyRule=engine.save({...input,name:'合成24小时上限',hourlyLimit:1,dailyLimit:1});engine.arm({id:dailyRule.id,revision:dailyRule.revision,acknowledgeAutomatic:true,acknowledgeEligibleRelationship:true});now++;eq(engine.observe(comment()).status,'queued');now+=3600001;eq(engine.observe(comment()),null);eq(engine.snapshot().rules.find(r=>r.id===dailyRule.id).armed,true);
  const scoped=engine.save({...input,name:'合成第二范围',workIds:['7123456789012345679']});engine.arm({id:scoped.id,revision:scoped.revision,acknowledgeAutomatic:true,acknowledgeEligibleRelationship:true});eq(engine.monitorPlan().length,1);eq(engine.monitorPlan()[0].workIds,['7123456789012345678','7123456789012345679']);const any=engine.save({...input,name:'合成全部作品',workIds:[]});engine.arm({id:any.id,revision:any.revision,acknowledgeAutomatic:true,acknowledgeEligibleRelationship:true});eq(engine.monitorPlan()[0].workIds,[]);eq(engine.monitorResult({...engine.monitorPlan()[0],status:'paused',detail:'合成官网读取失败',at:new Date(now).toISOString()}),true);eq(engine.snapshot().rules.some(r=>r.armed),false);eq(engine.snapshot().monitors[0].status,'paused');
  now+=86400001;engine.arm({id:dailyRule.id,revision:dailyRule.revision,acknowledgeAutomatic:true,acknowledgeEligibleRelationship:true});now++;const beforeDelete=engine.observe(comment());eq(beforeDelete.status,'queued');reject(()=>engine.remove({id:dailyRule.id,revision:99}));eq(engine.snapshot().rules.find(r=>r.id===dailyRule.id).armed,true);engine.remove({id:dailyRule.id,revision:dailyRule.revision});eq(engine.snapshot().rules.some(r=>r.id===dailyRule.id),false);eq(engine.snapshot().hits.find(h=>h.id===beforeDelete.id).status,'paused');eq(tasks.get(beforeDelete.taskId).status,'review');eq(engine.monitorPlan(),[]);now+=15001;await engine.tick();eq(dispatches.length,4);
  console.log(JSON.stringify({keywordRoutesChecks:checks,fixedAssignments:true,rollingLimits:true,historyNeverTriggers:true,restartNeverReplays:true,manualPreviewTakesPriority:true,revokedAuthorityStopsClaim:true,oldPrivateReplyPreventsDuplicate:true,staleMonitorGenerationRejected:true,ruleDeletionKeepsEvidenceAndStopsQueue:true,realPlatformCalls:0}));
 }finally{engine?.close();unregister();key.fill(0);assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('yuanxiao-keyword-'));fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
