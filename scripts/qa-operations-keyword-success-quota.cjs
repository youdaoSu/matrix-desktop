// Real encrypted stores and task claims, synthetic recipients/clock, no network.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {cipher}=require('../desktop/account-operations-crypto.cjs');
const {configureEncryptedWorkspace}=require('../desktop/vendor/hengyuan-interactions/src/workspace-data.cjs');
const {OperationsStudio}=require('../desktop/account-operations-studio.cjs');
const {InteractionStore}=require('../desktop/vendor/hengyuan-interactions/src/interaction-store.cjs');
const {OutreachStore}=require('../desktop/vendor/hengyuan-interactions/src/outreach.cjs');
const {KeywordRoutes,validateRule,validateKeywordBusiness}=require('../desktop/account-operations-keyword-routes.cjs');
const {accountQuota}=require('../desktop/account-operations-keyword-quota.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
async function scenario(body){
 const directory=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'yx-success-quota-')),key=crypto.randomBytes(32);
 const unregister=configureEncryptedWorkspace({directory,codecFor:name=>cipher(key,'quota/'+name)});let engine;
 try{
  let now=Date.now()+1000,sequence=0,outcome='sent';const sends=[];
  const accounts=['primary','sender A','sender B'].map((name,i)=>({id:crypto.randomUUID(),name,platform:'douyin',binding:'synthetic-'+i})),[primary,a,b]=accounts;
  const studio=new OperationsStudio({directory});studio.configure(accounts);studio.saveTeams([{id:primary.id,role:'primary'},{id:a.id,role:'member',primaryAccountId:primary.id},{id:b.id,role:'member',primaryAccountId:primary.id}]);
  const bindings=new Map(accounts.map((account,i)=>[account.id,{platform:'douyin',identity:String(100+i),establishedAt:new Date(now-1000).toISOString()}]));
  const store=new InteractionStore(directory,{...cipher(key,'messages'),now:()=>now,getAccount:id=>studio.getAccount(id)});
  const tasks=new OutreachStore({studio,interactions:store,getBinding:id=>bindings.get(id),now:()=>now});
  const make=()=>new KeywordRoutes({directory,studio,store,tasks,now:()=>now,canSchedule:()=>true,canUseSender:()=>true,stop(){},start:async(taskId,authority)=>{
   eq(engine.authorized(authority,[taskId]),true);const task=tasks.beginSend(taskId);sends.push({accountId:task.accountId,recipientId:task.recipientId,at:now});
   if(outcome==='sent')tasks.finishSend(taskId,{status:'sent',receipt:'synthetic:'+taskId});
   else if(outcome==='unknown')tasks.finishSend(taskId,{status:'unknown'});
   else tasks.finishSend(taskId,{status:'failed',failure:{outcome:'not-sent',scope:outcome==='account-failed'?'account':'task',code:'synthetic-reject',detail:'Synthetic rejection',stage:'commit',evidence:'platform-rejection:fixture'}});
  }});
  engine=make();const rule=engine.save({name:'Success quota',primaryAccountId:primary.id,senderAccountIds:[a.id,b.id],workIds:[],keywords:['request'],match:'contains',replyText:'Synthetic reply',delaySeconds:15,hourlyLimit:1,dailyLimit:4,quotaMode:'per-account-success',windowMinutes:60,queueHours:48,senderLimits:[{accountId:a.id,limit:1},{accountId:b.id,limit:2}]});
  const arm=()=>engine.arm({id:rule.id,revision:rule.revision,acknowledgeAutomatic:true,acknowledgeEligibleRelationship:true});arm();now++;
  const comment=(extra={})=>store.ingest({accountId:primary.id,channel:'comment',externalId:'7123456789012345678/'+(++sequence),threadId:'7123456789012345678',senderId:String(200+sequence),senderName:'Synthetic requester',text:'request',receivedAt:new Date(now).toISOString(),profileUrl:'https://www.douyin.com/user/MS4wSynthetic'+sequence,isOwn:false,isGroup:false,historical:false,...extra});
  await body({get engine(){return engine;},store,tasks,comment,sends,a,b,primary,rule,bindings,arm,now:()=>now,advance:ms=>{now+=ms;},outcome:value=>{outcome=value;},restart:()=>{engine.close();engine=make();},quotas:()=>engine.snapshot().rules[0].quotas});
 }finally{engine?.close();unregister();key.fill(0);assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('yx-success-quota-'));fs.rmSync(directory,{recursive:true,force:true});}
}
(async()=>{
 await scenario(async f=>{
  const first=f.engine.observe(f.comment());f.outcome('unknown');f.advance(15001);await f.engine.tick();
  const task=f.tasks.get(first.taskId);eq(task.status,'unknown');eq(f.quotas()[0].reserved,1);
  f.tasks.confirmObserved(first.taskId,{claimedAt:task.claimedAt,receipt:'platform:delayed-original'});
  eq(f.engine.reconcileObservedTask(first.taskId),true);eq(f.engine.reconcileObservedTask(first.taskId),false);
  eq(f.quotas()[0].success,1);eq(f.quotas()[0].reserved,0);eq(f.sends.length,1);eq(f.engine.snapshot().rules[0].armed,false);
  f.restart();eq(f.engine.snapshot().hits.find(h=>h.id===first.id).status,'sent');eq(f.sends.length,1);
 });
 await scenario(async f=>{
  const hits=Array.from({length:6},()=>f.engine.observe(f.comment()));eq(hits.every(h=>h.status==='queued'),true);
  for(let i=0;i<6;i++){f.advance(15001);await f.engine.tick();}
  eq(f.sends.map(s=>s.accountId),[f.a.id,f.b.id,f.b.id]);eq(f.quotas().map(q=>[q.success,q.remaining]),[[1,0],[2,0]]);
  const before=fs.readFileSync(f.engine.file);await f.engine.tick();eq(fs.readFileSync(f.engine.file),before);
  f.advance(f.sends[0].at+3600000-1-f.now());await f.engine.tick();eq(f.sends.length,3);
  f.advance(1);await f.engine.tick();eq(f.sends.length,4);eq(f.sends[3].accountId,f.a.id);
  eq(new Set(f.sends.map(s=>s.recipientId)).size,4);eq(f.engine.snapshot().rules[0].armed,true);
  eq(validateKeywordBusiness(f.engine.exportBusinessState()).rules[0].senderLimits,f.rule.senderLimits);
 });
 await scenario(async f=>{
  const first=f.engine.observe(f.comment());f.outcome('failed');f.advance(15001);await f.engine.tick();
  eq(f.tasks.get(first.taskId).status,'failed');eq(f.quotas()[0].success,0);eq(f.quotas()[0].reserved,0);eq(f.engine.snapshot().rules[0].armed,true);
  f.outcome('sent');f.engine.observe(f.comment());f.advance(15001);await f.engine.tick();eq(f.sends.length,2);
  eq(f.engine.observe(f.store.getMessage(first.messageId)),null);
 });
 await scenario(async f=>{
  const first=f.engine.observe(f.comment()),second=f.engine.observe(f.comment());f.outcome('unknown');f.advance(15001);await f.engine.tick();
  eq(f.quotas()[0].reserved,1);eq(f.quotas()[0].success,0);eq(f.engine.snapshot().rules[0].armed,false);
  f.advance(86400001);f.restart();eq(f.quotas()[0].reserved,1);eq(f.quotas()[0].nextAt,null);eq(f.sends.length,1);
  f.tasks.resolve(first.taskId,{sent:false});eq(f.quotas()[0].reserved,0);eq(f.quotas()[0].remaining,1);
  f.outcome('sent');f.arm();await f.engine.tick();eq(f.tasks.get(second.taskId).status,'sent');eq(f.sends.length,2);
  eq(f.tasks.get(first.taskId).status,'failed');
 });
 await scenario(async f=>{
  const first=f.engine.observe(f.comment());f.outcome('unknown');f.advance(15001);await f.engine.tick();
  f.advance(3600001);f.tasks.resolve(first.taskId,{sent:true});eq(f.quotas()[0].success,1);eq(f.quotas()[0].reserved,0);eq(f.quotas()[0].remaining,0);
  f.restart();eq(f.quotas()[0].success,1);eq(f.engine.snapshot().rules[0].armed,false);
 });
 await scenario(async f=>{
  const first=f.engine.observe(f.comment());f.advance(15001);await f.engine.tick();
  const waiting=f.engine.observe(f.comment());f.restart();eq(f.tasks.get(waiting.taskId).status,'review');eq(f.engine.snapshot().rules[0].armed,false);
  f.arm();await f.engine.tick();eq(f.sends.length,1);f.advance(15001);await f.engine.tick();eq(f.sends.length,2);eq(f.tasks.get(waiting.taskId).status,'sent');eq(f.tasks.get(first.taskId).status,'sent');
 });
 await scenario(async f=>{
  const hit=f.engine.observe(f.comment());f.restart();f.bindings.set(f.a.id,{...f.bindings.get(f.a.id),establishedAt:new Date(f.now()).toISOString()});f.arm();f.advance(15001);await f.engine.tick();eq(f.sends.length,0);eq(f.tasks.get(hit.taskId).status,'review');
 });
 await scenario(async f=>{
  const hit=f.engine.observe(f.comment());f.advance(48*3600000+1);await f.engine.tick();eq(f.tasks.get(hit.taskId).status,'cancelled');eq(f.sends.length,0);
  eq(f.engine.observe(f.comment({historical:true})),null);eq(f.engine.observe(f.comment({receivedAt:new Date(f.now()-600001).toISOString()})),null);
 });
 await scenario(async f=>{
  f.engine.observe(f.comment());f.outcome('account-failed');f.advance(15001);await f.engine.tick();eq(f.engine.snapshot().rules[0].armed,false);eq(f.quotas()[0].success,0);
 });
 await scenario(async f=>{
  f.engine.save({...f.rule,windowMinutes:1});const r=f.engine.rule(f.rule.id);
  f.engine.arm({id:r.id,revision:r.revision,acknowledgeAutomatic:true,acknowledgeEligibleRelationship:true});f.advance(1);
  f.store.updatePolicy({...f.store.getPolicy(),hourlyLimit:1});
  const hits=Array.from({length:4},()=>f.engine.observe(f.comment()));
  for(let i=0;i<4;i++){f.advance(15001);await f.engine.tick();}
  eq(f.sends.length,2);eq(f.engine.snapshot().rules[0].armed,true);eq(f.tasks.get(hits[2].taskId).status,'review');
  eq(f.engine.snapshot().hits.find(h=>h.id===hits[2].id).detail.includes('全局发送时段'),true);
  f.advance(3600000);await f.engine.tick();eq(f.sends.length,3);eq(f.engine.snapshot().rules[0].armed,true);
 });
 await scenario(async f=>{
  const rule={...f.rule,dailyLimit:1,senderLimits:[{accountId:f.a.id,limit:1},{accountId:f.b.id,limit:1}]};
  const hits=[{id:'one',accountId:f.a.id,taskId:'task',status:'sent'}],tasks=new Map([['task',{status:'sent',claimedAt:'claimed',receipt:'proof',updatedAt:new Date(f.now()).toISOString()}]]);
  const q=at=>accountQuota({rule,accountId:f.a.id,hits,tasks,now:at});eq(q(f.now()+3600000).remaining,0);eq(q(f.now()+86400000-1).remaining,0);eq(q(f.now()+86400000).remaining,1);
  assert.throws(()=>validateRule({...f.rule,senderLimits:[f.rule.senderLimits[0],f.rule.senderLimits[0]]}));checks++;
  assert.throws(()=>validateRule({...f.rule,queueHours:1}));checks++;
  const paused={id:'paused',accountId:f.a.id,taskId:'waiting',status:'paused',resumePending:true};
  const pausedTasks=new Map([['waiting',{status:'review'}]]);
  eq(accountQuota({rule,accountId:f.a.id,hits:[paused],tasks:pausedTasks,now:f.now()}).queued,0);
  eq(accountQuota({rule,accountId:f.a.id,hits:[{...paused,status:'queued'}],tasks:pausedTasks,now:f.now()}).queued,1);
 });
 console.log(JSON.stringify({successQuotaChecks:checks,perAccount:true,onlyConfirmedSuccessConsumes:true,unknownReservedAcrossRestart:true,queueResumesAtBoundary:true,noRealPlatformActions:true}));
})().catch(error=>{console.error(error);process.exitCode=1;});
