// Real encrypted local stores; synthetic clock, accounts and inert sender only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {cipher}=require('../desktop/account-operations-crypto.cjs');
const {configureEncryptedWorkspace}=require('../desktop/vendor/hengyuan-interactions/src/workspace-data.cjs');
const {OperationsStudio}=require('../desktop/account-operations-studio.cjs');
const {InteractionStore}=require('../desktop/vendor/hengyuan-interactions/src/interaction-store.cjs');
const {OutreachStore}=require('../desktop/vendor/hengyuan-interactions/src/outreach.cjs');
const {KeywordRoutes}=require('../desktop/account-operations-keyword-routes.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
async function scenario(body){
 const directory=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'yuanxiao-keyword-expiry-')),key=crypto.randomBytes(32);
 const unregister=configureEncryptedWorkspace({directory,codecFor:name=>cipher(key,'expiry/'+name)});let engine;
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
  const rule=engine.save({name:'排队有效期',primaryAccountId:primary.id,senderAccountIds:[a.id,b.id],workIds:[],keywords:['求'],match:'contains',replyText:'合成回复',delaySeconds:15,hourlyLimit:20,dailyLimit:20});
  engine.arm({id:rule.id,revision:rule.revision,acknowledgeAutomatic:true,acknowledgeEligibleRelationship:true});now++;
  const comment=(extra={})=>store.ingest({accountId:primary.id,channel:'comment',externalId:'7123456789012345678/'+(++sequence),threadId:'7123456789012345678',senderId:String(200+sequence),senderName:'合成咨询者',text:'求资料',receivedAt:new Date(now).toISOString(),profileUrl:'https://www.douyin.com/user/MS4wSynthetic'+sequence,isOwn:false,isGroup:false,historical:false,...extra});
  await body({engine,store,tasks,comment,sends,a,b,rule,advance:ms=>{now+=ms;}});
 }finally{engine?.close();unregister();key.fill(0);assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('yuanxiao-keyword-expiry-'));fs.rmSync(directory,{recursive:true,force:true});}
}
(async()=>{
 await scenario(async f=>{
  const old=f.engine.observe(f.comment());f.advance(600001);const fresh=f.engine.observe(f.comment());f.advance(15001);
  await f.engine.tick();eq(f.sends.length,0);eq(f.engine.snapshot().rules[0].armed,true);eq(f.tasks.get(old.taskId).status,'cancelled');eq(f.tasks.get(old.taskId).claimedAt,undefined);eq(f.engine.snapshot().hits.find(h=>h.id===old.id).status,'paused');
  await f.engine.tick();eq(f.sends,[{accountId:f.b.id,recipientId:fresh.recipientId}]);eq(f.tasks.get(fresh.taskId).status,'sent');eq(f.store.getExternalAttempts().length,1);
  eq(f.engine.observe(f.comment({senderId:old.recipientId})),null);const next=f.engine.observe(f.comment());eq(next.accountId,f.a.id);await f.engine.tick();eq(f.sends.length,1);f.advance(15001);await f.engine.tick();eq(f.sends.length,2);
 });
 await scenario(async f=>{
  const cancelled=f.engine.observe(f.comment());f.tasks.cancel(cancelled.taskId);const fresh=f.engine.observe(f.comment());f.advance(15001);await f.engine.tick();
  eq(f.engine.snapshot().rules[0].armed,true);eq(f.engine.snapshot().hits.find(h=>h.id===cancelled.id).status,'paused');eq(f.sends.length,0);eq(f.store.getExternalAttempts().length,0);
  await f.engine.tick();eq(f.sends,[{accountId:f.b.id,recipientId:fresh.recipientId}]);eq(f.engine.observe(f.comment({senderId:cancelled.recipientId})),null);
 });
 await scenario(async f=>{const hit=f.engine.observe(f.comment());f.advance(600000);await f.engine.tick();eq(f.tasks.get(hit.taskId).status,'sent');eq(f.sends.length,1);});
 await scenario(async f=>{
  const hit=f.engine.observe(f.comment());f.tasks.beginSend(hit.taskId);f.advance(600001);await f.engine.tick();eq(f.tasks.get(hit.taskId).status,'sending');eq(f.sends.length,0);eq(f.engine.snapshot().rules[0].armed,false);eq(f.store.getExternalAttempts().length,1);
 });
 await scenario(async f=>{
  const hit=f.engine.observe(f.comment()),get=f.store.getMessage.bind(f.store);f.store.getMessage=id=>({...get(id),text:'changed proof'});f.advance(600001);await f.engine.tick();eq(f.tasks.get(hit.taskId).status,'review');eq(f.sends.length,0);eq(f.engine.snapshot().rules[0].armed,false);
 });
 await scenario(async f=>{
  const hit=f.engine.observe(f.comment());f.advance(600001);const commit=f.engine.commit.bind(f.engine);let failed=false;
  f.engine.commit=value=>{if(!failed&&value.hits.find(h=>h.id===hit.id)?.detail.includes('有效期')){failed=true;throw Error('Synthetic hit write interruption');}return commit(value);};
  await assert.rejects(()=>f.engine.tick(),/Synthetic/);checks++;eq(f.tasks.get(hit.taskId).status,'cancelled');eq(f.engine.snapshot().hits.find(h=>h.id===hit.id).status,'queued');
  await f.engine.tick();eq(f.engine.snapshot().hits.find(h=>h.id===hit.id).status,'paused');eq(f.engine.snapshot().rules[0].armed,true);eq(f.sends.length,0);eq(f.store.getExternalAttempts().length,0);
 });
 console.log(JSON.stringify({keywordExpiryChecks:checks,expiredUnsentCancelled:true,newRecipientsContinue:true,attemptedAndChangedProofStillPause:true,interruptedLocalFinalizationRecoverable:true,platformActions:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});
