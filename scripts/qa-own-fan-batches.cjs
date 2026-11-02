const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {OwnFanBatchPlan}=require('../desktop/own-fan-batch-plan.cjs');
const {fanContactEvidence}=require('../desktop/fan-contact-evidence.cjs');
const {createMessageIndex}=require('../desktop/douyin-inbox-index.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const fan=i=>({id:'MS4wFan_'+i,uid:String(9000+i),name:'合成粉丝'+i,profileUrl:'https://www.douyin.com/user/MS4wFan_'+i,firstSeenAt:'2026-01-01T00:00:00.000Z'});
async function scheduler(){
 let wall=1700000000000,clock=0,saved=null,seq=0,calls=0,contacted=new Set(),allow=true,hold,unknown=false;
 const tasks=new Map(),rows=Array.from({length:5},(_,i)=>fan(i));
 const deps={load:()=>saved,save:v=>{saved=structuredClone(v);},now:()=>wall,mono:()=>clock,canRun:()=>allow,
 scan:async()=>({binding:'fixed',recipients:rows,scanned:5,excluded:0,unknown:0,nextOffset:5,sourceTotal:5}),
 check:async(p,f)=>{if(hold)await hold;return contacted.has(f.id)?'contacted':'eligible';},
 createTask:(p,f)=>{const t={id:String(++seq),status:'review',origin:'own-fan',accountId:p.accountId,primaryAccountId:p.accountId,recipientId:f.id,replyText:p.text};tasks.set(t.id,t);return t;},getTask:id=>structuredClone(tasks.get(id)),
 cancelTask:id=>{tasks.get(id).status='cancelled';},stopTask:()=>{},sendTask:async id=>{calls++;const t=tasks.get(id);t.status=unknown?'unknown':'sent';if(!unknown)t.receipt='platform:synthetic-'+id;}};
 let plan=new OwnFanBatchPlan(deps),preview=await plan.preview({accountId:'owner',text:'合成文案',offset:0,scanLimit:5,batchSize:2,intervalSeconds:10,batchGapSeconds:60});
 eq(calls,0);eq(plan.snapshot(),null);assert.throws(()=>plan.start({token:preview.token,acknowledge:false}));checks++;
 plan.start({token:preview.token,acknowledge:true});await plan.tick();eq(calls,1);eq(plan.snapshot().sent,1);
 await plan.tick();eq(calls,1);clock=9999;await plan.tick();eq(calls,1);
 clock=10000;wall+=10000;await plan.tick();eq(calls,2);eq(plan.snapshot().detail,'本批结束，等待后自动读取下一批');
 clock=69999;await plan.tick();eq(calls,2);clock=70000;wall+=60000;contacted.add(rows[2].id);await plan.tick();eq(calls,2);eq(plan.snapshot().skipped,1);
 plan.pause();clock+=20000;wall+=20000;await plan.tick();eq(calls,2);plan.resume();await plan.tick();eq(calls,3);
 // A process restart retains the exact cursor and never silently sends.
 plan=new OwnFanBatchPlan(deps);eq(plan.snapshot().status,'paused');eq(plan.snapshot().cursor,4);await plan.tick();eq(calls,3);plan.resume();await plan.tick();eq(calls,3);clock+=60000;wall+=60000;await plan.tick();eq(calls,4);eq(plan.snapshot().status,'completed');
 assert(!('binding' in plan.snapshot()));checks++;
 // A new plan cannot reuse a start token; pause revokes a delayed proof.
 preview=await plan.preview({accountId:'owner',text:'合成',offset:0,scanLimit:5,batchSize:1,intervalSeconds:5,batchGapSeconds:5});plan.start({token:preview.token,acknowledge:true});assert.throws(()=>plan.start({token:preview.token,acknowledge:true}));checks++;
 let release;hold=new Promise(r=>release=r);const pending=plan.tick();await Promise.resolve();plan.pause();release();await pending;hold=null;eq(calls,4);eq(plan.snapshot().cursor,0);
 plan.resume();unknown=true;await plan.tick();eq(calls,5);eq(plan.snapshot().status,'paused');assert.throws(()=>plan.resume(),/核对/);checks++;clock+=100000;await plan.tick();eq(calls,5);
 plan.cancel();eq(plan.snapshot().status,'cancelled');
 await assert.rejects(()=>plan.preview({accountId:'owner',text:'x',offset:0,scanLimit:501,batchSize:1,intervalSeconds:5,batchGapSeconds:5}));checks++;
 await assert.rejects(()=>plan.preview({accountId:'owner',text:'x',offset:0,scanLimit:5,batchSize:1,intervalSeconds:0,batchGapSeconds:5}));checks++;
 // Global pause cannot consume queue positions.
 preview=await plan.preview({accountId:'owner',text:'x',offset:0,scanLimit:5,batchSize:1,intervalSeconds:5,batchGapSeconds:5});plan.start({token:preview.token,acknowledge:true});allow=false;await plan.tick();eq(calls,5);eq(plan.snapshot().cursor,0);
 // A failed persistence step cannot leave a live invisible sending plan.
 const broken=new OwnFanBatchPlan({...deps,load:()=>null,canRun:()=>true,save:()=>{throw Error('synthetic disk full');}});
 const check=await broken.preview({accountId:'owner',text:'x',offset:0,scanLimit:5,batchSize:1,intervalSeconds:5,batchGapSeconds:5});assert.throws(()=>broken.start({token:check.token,acknowledge:true}),/disk full/);checks++;await broken.tick();eq(calls,5);eq(broken.snapshot().status,'paused');
}
function history(){
 const fans=[fan(0),fan(1),fan(2),fan(3)],state={revision:1,init:{done:true},strangers:{done:true},people:{},threads:{a:{id:'a',type:1,peer:'9000',peerSecUid:fans[0].id,history:{done:true}},b:{id:'b',type:1,peer:'9001',history:{done:true}}},messages:{}};
 // Older media at the front of a 60-message transcript must exclude fan 0.
 for(let i=0;i<60;i++)state.messages['a/'+i]={id:String(i+1),index:String(i+1),threadId:'a',sender:i===0?'101':'9000',direction:i===0?'outbound':'inbound',messageType:i===0?27:7,status:0};
 const index=createMessageIndex();let evidence=fanContactEvidence({state,indexed:index.get(state),ownUid:'101',ready:true},fans);
 eq(evidence.items.map(r=>r.status),['contacted','eligible','eligible','eligible']);
 state.init.done=false;evidence=fanContactEvidence({state,indexed:index.get(state),ownUid:'101',ready:true},fans);eq(evidence.items.map(r=>r.status),['contacted','unknown','unknown','unknown']);
 state.init.done=true;state.threads={...state.threads,c:{id:'c',type:1,peer:'9001',peerSecUid:fan(4).id,history:{done:true}}};state.revision++;
 evidence=fanContactEvidence({state,indexed:index.get(state),ownUid:'101',ready:true},fans);eq(evidence.items[1].status,'unknown');
 eq(fanContactEvidence({state,indexed:index.get(state),ownUid:'101',ready:false},fans).items[2].status,'unknown');
 assert(!JSON.stringify(evidence).includes('messages'));checks++;
}
async function integration(){
 const {cipher}=require('../desktop/account-operations-crypto.cjs'),{configureEncryptedWorkspace}=require('../desktop/vendor/hengyuan-interactions/src/workspace-data.cjs'),{OperationsStudio}=require('../desktop/account-operations-studio.cjs'),{InteractionStore}=require('../desktop/vendor/hengyuan-interactions/src/interaction-store.cjs'),{createDomRuntime}=require('../desktop/account-operations-dom-runtime.cjs'),{createOutreachRuntime}=require('../desktop/account-operations-outreach-runtime.cjs');
 const {validateOutreachRelations,validateOutreachTask}=require('../desktop/vendor/hengyuan-interactions/src/outreach.cjs');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yuanxiao-own-fan-')),key=crypto.randomBytes(32),unregister=configureEncryptedWorkspace({directory,codecFor:name=>cipher(key,'qa-controls/'+name)}),studio=new OperationsStudio({directory}),primary={id:crypto.randomUUID(),name:'隔离主号',platform:'douyin',binding:'native-main'};let runtime,dom;
 try{
  studio.configure([primary]);studio.saveTeams([{id:primary.id,role:'primary'}]);
  const store=new InteractionStore(directory,{...cipher(key,'qa-interactions'),getAccount:id=>studio.getAccount(id)});
  dom=createDomRuntime({directory,studio,store,call:async()=>{throw Error('No real browser allowed');}});dom.registerNativeIdentity(primary.id,'101');
  let status='eligible';
  const refreshDirectory=async args=>{const all=[fan(0),fan(1)],items=args.ids?all.filter(f=>args.ids.includes(f.id)):all.slice(args.offset||0,(args.offset||0)+(args.limit||50));return{primaryAccountId:primary.id,accountId:primary.id,ownerIdentity:'101',readerIdentity:'101',ownerProfileUrl:'https://www.douyin.com/user/MS4wOwner_1',nativeDirectoryProof:{kind:'native-cache-v1',scopeHash:crypto.createHash('sha256').update(primary.binding).digest('hex'),verifiedAt:new Date().toISOString()},items,total:2,complete:true,contactHistory:{items:items.map(f=>({id:f.id,uid:f.uid,status}))}};};
  runtime=createOutreachRuntime({directory,studio,store,dom,refreshDirectory,reserve:()=>{throw Error('No actual send');},release:()=>{},canRun:()=>true,canWrite:()=>true});
  const args={accountId:primary.id,text:'合成问候',offset:0,scanLimit:2,batchSize:1,intervalSeconds:5,batchGapSeconds:60};
  status='unknown';let p=await runtime.command('own-fan-preview',args);eq(p.unknown,2);eq(p.recipients.length,0);assert.throws(()=>runtime.fanPlan.start({token:p.token,acknowledge:true}));checks++;
  status='eligible';p=await runtime.command('own-fan-preview',args);eq(p.recipients.length,2);eq(studio.outreachPage().totalTasks,0);
  runtime.command('own-fan-start',{token:p.token,acknowledge:true});await runtime.fanPlan.tick();
  const task=studio.outreachPage().tasks[0];assert.ok(task,JSON.stringify(runtime.fanPlan.snapshot()));eq(task.origin,'own-fan');eq(task.accountId,primary.id);eq(task.primaryAccountId,primary.id);eq(task.status,'review');
  runtime.tasks.preflight(task.id);checks++;
  const recipientId=fan(0).uid,claim=store.claimExternalAttempt(task,{recipientIdAlias:recipientId});runtime.tasks.update(task.id,{status:'sending',claimedAt:claim.claimedAt});
  validateOutreachRelations(studio.snapshot(),{...store.snapshot(),externalAttempts:store.getExternalAttempts()});checks++;
  runtime.tasks.finishSend(task.id,{status:'sent',receipt:'platform:synthetic-confirmed'});
  validateOutreachRelations(studio.snapshot(),{...store.snapshot(),externalAttempts:store.getExternalAttempts()});checks++;
  eq(new OperationsStudio({directory}).outreachPage().tasks[0].origin,'own-fan');
  assert.throws(()=>validateOutreachTask({...task,accountId:crypto.randomUUID()}));checks++;
  assert.throws(()=>validateOutreachTask({...task,origin:'own-fan',followupOf:crypto.randomUUID()}));checks++;
  assert.throws(()=>runtime.tasks.create({primaryAccountId:primary.id,senderAccountIds:[primary.id],sourceKind:'fan-directory',fanIds:[fan(1).id],channel:'dm',text:'cannot elevate input',origin:'own-fan'}));checks++;
  // Authentication-encrypted local plan survives reopening, but stays paused.
  const {read}=require('../desktop/vendor/hengyuan-interactions/src/workspace-data.cjs');eq(read(path.join(directory,'own-fan-plan.json'),true).plan.status,'paused');
 }finally{runtime?.close();dom?.close();unregister();fs.rmSync(directory,{recursive:true,force:true});}
}
(async()=>{history();await scheduler();await integration();console.log(JSON.stringify({checks,realPlatformSends:0,synthetic:true}));})().catch(e=>{console.error(e);process.exitCode=1;});
