const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {OwnFanBatchPlan}=require('../desktop/own-fan-batch-plan.cjs');
const {OwnFanWelcomeLedger}=require('../desktop/own-fan-welcome-ledger.cjs');
const fan=i=>({id:'MS4wFan_'+i,uid:String(9000+i),name:'Synthetic '+i,profileUrl:'https://www.douyin.com/user/MS4wFan_'+i,firstSeenAt:'2026-01-01T00:00:00.000Z'});
const input={accountId:randomUUID(),binding:JSON.stringify({identity:'101'}),text:'welcome',offset:0,scanLimit:500,scanAll:true,followOnFailure:true,batchSize:2,intervalSeconds:5,batchGapSeconds:30};
(async()=>{
 let saved=null,rows=null,wall=1700000000000,clock=0,ledgerState=null;
 const targets=Array.from({length:1001},(_,i)=>fan(i)),tasks=new Map();
 const ledger=new OwnFanWelcomeLedger({load:()=>ledgerState,save:value=>{ledgerState=structuredClone(value);},now:()=>wall});
 let sends=0,recoveries=0;
 const options={load:()=>saved,save:value=>{saved=structuredClone(value);},saveRoster:value=>{rows=structuredClone(value);},loadRoster:()=>structuredClone(rows),now:()=>wall,mono:()=>clock,canRun:()=>true,
 scan:async()=>({binding:input.binding,recipients:targets,scanned:1001,excluded:0,unknown:0,nextOffset:1001,sourceTotal:1001,sourceComplete:true}),
 check:async()=> 'eligible',createTask:(p,f)=>{const task={id:randomUUID(),accountId:p.accountId,primaryAccountId:p.accountId,origin:'own-fan',status:'review',recipientId:f.id,replyText:p.text};tasks.set(task.id,task);return task;},getTask:id=>structuredClone(tasks.get(id)),stopTask(){},cancelTask(){},
 recordSent:(p,f,t)=>ledger.sent(p,f,t),
 sendTask:async id=>{const t=tasks.get(id);sends++;if(t.recipientId===fan(0).id&&!t.followupOf||t.recipientId===fan(1).id){t.status='failed';t.failure={outcome:'not-sent',scope:'task',code:'task-error',stage:'preflight'};}else{t.status='sent';t.receipt='platform:synthetic-'+id;}},
 recoverTask:async(p,f,t)=>{recoveries++;ledger.claim(p,f,t);if(f.id===fan(1).id){ledger.result(p,f,t.id,{state:'friend-required'});return{state:'friend-required'};}ledger.result(p,f,t.id,{state:'followed',changed:true});const next={...t,id:randomUUID(),followupOf:t.id,status:'review'};delete next.failure;tasks.set(next.id,next);return{task:next};}
 };
 let plan=new OwnFanBatchPlan(options);const preview=await plan.preview(input);
 assert.equal(preview.recipientCount,1001);assert.equal(preview.recipients.length,50);
 assert.equal(plan.previewPage({token:preview.token,offset:1000}).items[0].uid,fan(1000).uid);
 assert.throws(()=>plan.previewPage({token:'stale',offset:0}));
 plan.start({token:preview.token,acknowledge:true});assert.equal(saved.version,2);assert(!('recipients' in saved.plan));assert.equal(rows.recipients.length,1001);
 await plan.tick();assert.equal(sends,1);assert.equal(recoveries,0);
 clock+=4999;wall+=4999;await plan.tick();assert.equal(recoveries,0);
 clock++;wall++;await plan.tick();assert.equal(recoveries,1);assert.equal(sends,1);assert.equal(plan.snapshot().followed,1);
 clock+=5000;wall+=5000;await plan.tick();assert.equal(sends,2);assert.equal(plan.snapshot().sent,1);
 clock+=5000;wall+=5000;await plan.tick();assert.equal(sends,3);
 clock+=5000;wall+=5000;await plan.tick();assert.equal(plan.snapshot().friendRequired,1);assert.equal(plan.snapshot().cursor,2);
 const before=sends;clock+=29999;wall+=29999;await plan.tick();assert.equal(sends,before);
 clock++;wall++;await plan.tick();assert.equal(sends,before+1);
 assert.equal(new OwnFanWelcomeLedger({load:()=>ledgerState,save(){}}).get({...input,text:'different',accountId:randomUUID()},fan(0)).state,'sent');
 assert.equal(ledger.get(input,fan(1)).state,'friend-required');
 assert.throws(()=>ledger.get(input,{...fan(0),id:'MS4wDifferent'}));
 plan=new OwnFanBatchPlan(options);assert.equal(plan.snapshot().status,'paused');assert.equal(plan.snapshot().cursor,3);await plan.tick();assert.equal(sends,before+1);
 const source={...tasks.values().next().value,status:'unknown',failure:{outcome:'unknown',scope:'account',stage:'receipt'}};
 assert.throws(()=>ledger.claim(input,fan(4),source));
 let broken=false;const denied=new OwnFanWelcomeLedger({save(){broken=true;throw Error('disk full');}});
 const safe={id:randomUUID(),accountId:input.accountId,origin:'own-fan',status:'failed',recipientId:fan(4).id,failure:{outcome:'not-sent',scope:'task',stage:'preflight',code:'task-error'}};
 assert.throws(()=>denied.claim(input,fan(4),safe),/disk full/);assert(broken);assert.equal(denied.get(input,fan(4)),null);
 let rosterFailureSends=0;const bad=new OwnFanBatchPlan({...options,load:()=>null,saveRoster(){throw Error('roster disk full');},sendTask:async()=>{rosterFailureSends++;}});
 const b=await bad.preview(input);assert.throws(()=>bad.start({token:b.token,acknowledge:true}),/roster disk full/);await bad.tick();assert.equal(rosterFailureSends,0);
 console.log(JSON.stringify({passed:true,allFollowers:1001,boundedPreview:50,constantSizeCursorPersistence:true,linkedRetryOnlyOnce:true,friendRequestPermanentlyExcluded:true,restartPaused:true,intervalAndBatchGap:true,unknownNotRetried:true,failedStorageNeverSends:true,realPlatformActions:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});
