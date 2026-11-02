// Real encrypted local stores; synthetic clock, accounts and inert sender only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {cipher}=require('../desktop/account-operations-crypto.cjs');
const {configureEncryptedWorkspace}=require('../desktop/vendor/hengyuan-interactions/src/workspace-data.cjs');
const {OperationsStudio}=require('../desktop/account-operations-studio.cjs');
const {InteractionStore}=require('../desktop/vendor/hengyuan-interactions/src/interaction-store.cjs');
const {OutreachStore}=require('../desktop/vendor/hengyuan-interactions/src/outreach.cjs');
const {KeywordRoutes}=require('../desktop/account-operations-keyword-routes.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
async function scenario(body, limits={hourlyLimit:1,dailyLimit:3}){
 const directory=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'yuanxiao-keyword-rate-')),key=crypto.randomBytes(32);
 const unregister=configureEncryptedWorkspace({directory,codecFor:name=>cipher(key,'dispatch-rate/'+name)});let engine;
 try{
  let now=Date.now()+1000,sequence=0;const sends=[];
  const accounts=['主号','成员甲','成员乙'].map((name,i)=>({id:crypto.randomUUID(),name,platform:'douyin',binding:'synthetic-'+i})),[primary,a,b]=accounts;
  const studio=new OperationsStudio({directory});studio.configure(accounts);studio.saveTeams([{id:primary.id,role:'primary'},{id:a.id,role:'member',primaryAccountId:primary.id},{id:b.id,role:'member',primaryAccountId:primary.id}]);
  const bindings=new Map(accounts.map((account,i)=>[account.id,{platform:'douyin',identity:String(100+i),establishedAt:new Date(now-1000).toISOString()}]));
  const store=new InteractionStore(directory,{...cipher(key,'messages'),now:()=>now,getAccount:id=>studio.getAccount(id)});
  const tasks=new OutreachStore({studio,interactions:store,getBinding:id=>bindings.get(id),now:()=>now});
  engine=new KeywordRoutes({directory,studio,store,tasks,now:()=>now,canSchedule:()=>true,canUseSender:()=>true,stop(){},start:async(taskId,authority)=>{
   eq(engine.authorized(authority,[taskId]),true);const task=tasks.beginSend(taskId);sends.push({accountId:task.accountId,recipientId:task.recipientId});tasks.finishSend(taskId,{status:'sent',receipt:'synthetic:'+taskId});
  }});
  const rule=engine.save({name:'排队有效期',primaryAccountId:primary.id,senderAccountIds:[a.id,b.id],workIds:[],keywords:['求'],match:'contains',replyText:'合成回复',delaySeconds:15,...limits});
  engine.arm({id:rule.id,revision:rule.revision,acknowledgeAutomatic:true,acknowledgeEligibleRelationship:true});now++;
  const comment=(extra={})=>store.ingest({accountId:primary.id,channel:'comment',externalId:'7123456789012345678/'+(++sequence),threadId:'7123456789012345678',senderId:String(200+sequence),senderName:'合成咨询者',text:'求资料',receivedAt:new Date(now).toISOString(),profileUrl:'https://www.douyin.com/user/MS4wSynthetic'+sequence,isOwn:false,isGroup:false,historical:false,...extra});
  await body({engine,store,tasks,comment,sends,a,b,primary,rule,now:()=>now,advance:ms=>{now+=ms;}});
 }finally{engine?.close();unregister();key.fill(0);assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('yuanxiao-keyword-rate-'));fs.rmSync(directory,{recursive:true,force:true});}
}
(async()=>{
 for(const windowMs of [3600000,86400000])await scenario(async f=>{
  const createdAt=f.now(),first=f.engine.observe(f.comment());f.advance(590000);await f.engine.tick();eq(f.sends.length,1);
  const sentAt=f.now();f.advance(createdAt+windowMs+1-f.now());const second=f.engine.observe(f.comment());eq(second.status,'queued');f.advance(15001);
  await f.engine.tick();eq(f.sends.length,1);eq(f.tasks.get(second.taskId).status,'review');eq(f.store.getExternalAttempts().length,1);eq(f.engine.snapshot().rules[0].armed,true);
  eq(f.engine.snapshot().hits.find(h=>h.id===second.id).detail.includes('上限'),true);
  const before=fs.readFileSync(f.engine.file);await f.engine.tick();eq(fs.readFileSync(f.engine.file),before);
  f.advance(sentAt+windowMs-1-f.now());await f.engine.tick();eq(f.sends.length,1);
  f.advance(1);await f.engine.tick();eq(f.sends.length,2);eq(f.tasks.get(first.taskId).status,'sent');eq(f.tasks.get(second.taskId).status,'sent');eq(f.sends[1].accountId,f.b.id);
 },{hourlyLimit:1,dailyLimit:windowMs===86400000?1:3});
 await scenario(async f=>{
  const createdAt=f.now();f.engine.observe(f.comment());f.advance(590000);await f.engine.tick();f.advance(createdAt+3600001-f.now());const waiting=f.engine.observe(f.comment());
  const other=f.engine.save({...f.rule,id:undefined,revision:undefined,name:'独立规则',keywords:['独立'],hourlyLimit:20,dailyLimit:20});
  f.engine.arm({id:other.id,revision:other.revision,acknowledgeAutomatic:true,acknowledgeEligibleRelationship:true});f.advance(1);
  const independent=f.engine.observe(f.comment({text:'独立资料'}));f.advance(15001);await f.engine.tick();
  eq(f.sends.length,2);eq(f.tasks.get(independent.taskId).status,'sent');eq(f.tasks.get(waiting.taskId).status,'review');
  f.advance(600001);await f.engine.tick();eq(f.tasks.get(waiting.taskId).status,'cancelled');eq(f.sends.length,2);eq(f.engine.snapshot().rules.every(r=>r.armed),true);
 });
 await scenario(async f=>{
  const createdAt=f.now(),first=f.engine.observe(f.comment());
  f.engine.start=async(taskId,authority)=>{eq(f.engine.authorized(authority,[taskId]),true);f.tasks.beginSend(taskId);throw Error('Synthetic uncertain attempt');};
  f.advance(590000);await f.engine.tick();eq(f.tasks.get(first.taskId).status,'sending');eq(f.engine.snapshot().rules[0].armed,false);
  f.advance(createdAt+3600001-f.now());f.engine.arm({id:f.rule.id,revision:f.rule.revision,acknowledgeAutomatic:true,acknowledgeEligibleRelationship:true});f.advance(1);
  const next=f.engine.observe(f.comment());f.advance(15001);await f.engine.tick();eq(f.tasks.get(next.taskId).status,'review');eq(f.store.getExternalAttempts().length,1);eq(f.engine.snapshot().rules[0].armed,true);
 });
 await scenario(async f=>{
  const createdAt=f.now();f.engine.observe(f.comment());f.advance(590000);await f.engine.tick();const sentAt=f.now();f.engine.close();
  f.advance(createdAt+3600001-f.now());let resumed;
  try{
   resumed=new KeywordRoutes({directory:path.dirname(f.engine.file),studio:f.engine.studio,store:f.store,tasks:f.tasks,now:f.now,canSchedule:()=>true,canUseSender:()=>true,stop(){},start:async(taskId,authority)=>{
    eq(resumed.authorized(authority,[taskId]),true);const task=f.tasks.beginSend(taskId);f.sends.push({accountId:task.accountId,recipientId:task.recipientId});f.tasks.finishSend(taskId,{status:'sent',receipt:'synthetic:'+taskId});
   }});
   eq(resumed.snapshot().rules[0].armed,false);resumed.arm({id:f.rule.id,revision:f.rule.revision,acknowledgeAutomatic:true,acknowledgeEligibleRelationship:true});f.advance(1);
   const next=resumed.observe(f.comment());f.advance(15001);await resumed.tick();eq(f.sends.length,1);eq(f.tasks.get(next.taskId).status,'review');
   f.advance(sentAt+3600000-f.now());await resumed.tick();eq(f.sends.length,2);eq(f.tasks.get(next.taskId).status,'sent');
  }finally{resumed?.close();}
 });
 console.log(JSON.stringify({dispatchWindowChecks:checks,hourAndDayAttemptTimesEnforced:true,boundaries:true,otherRulesContinue:true,expiredQueueCancelled:true,repeatedWaitDoesNotWrite:true,uncertainAttemptsCount:true,reopenedLedgerRetainsQuota:true,platformActions:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});
