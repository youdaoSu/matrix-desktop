const assert=require('node:assert/strict');
const {createPublishResultChecks}=require('./qa-load-typescript.cjs').loadTs('client/src/components/workspace/publish-result-checks.ts');
const {verifyPublishJob}=require('./qa-load-typescript.cjs').loadTs('client/src/components/workspace/verify-publish-job.ts');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const until=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await tick();}assert.fail('Bounded result-check fixture did not settle');};
function fixture(options={}){
  const f={current:true,jobs:new Map(),calls:[],applied:[],failures:[],releases:new Map()};
  f.add=id=>{const r={id:'receipt-'+id,taskId:id,attemptId:'attempt-'+id,accountId:'account-'+id,platform:'douyin',kind:'publish',status:'unknown',message:'Original uncertain attempt'};f.jobs.set(id,{id,attemptId:r.attemptId,receiptId:r.id,accountId:r.accountId,platform:r.platform,stage:'unknown',submission:'uncertain'});return r;};
  f.checks=createPublishResultChecks({current:()=>f.current,job:id=>f.jobs.get(id),verify:r=>{f.calls.push(r.id);return new Promise(resolve=>f.releases.set(r.id,resolve));},apply:r=>{f.applied.push(r);f.jobs.get(r.taskId).stage=r.status;},failed:(...args)=>f.failures.push(args),...options});
  return f;
}
(async()=>{
  const reviewFixture=(options={})=>{
    const test=fixture({reviewDelaysMs:[1,1,1],...options}),row={...test.add('review'),status:'confirmed',createdAt:new Date().toISOString(),verification:{state:'processing'},checkpoint:'official_accepted'};
    Object.assign(test.jobs.get(row.taskId),{stage:'confirmed',verification:row.verification,config:{comment:'Original approved comment intent'}});
    return {test,row};
  };
  {
    const {test,row}=reviewFixture();
    test.checks.enqueue([row,row]);
    for(let read=1;read<=3;read++){
      await new Promise(resolve=>setTimeout(resolve,5));await until(()=>test.calls.length===read);
      test.releases.get(row.id)({receipt:row});await until(()=>test.applied.length===read);
    }
    for(let i=0;i<10;i++)test.checks.enqueue([row]);await new Promise(resolve=>setTimeout(resolve,10));assert.equal(test.calls.length,3);test.checks.dispose();
  }
  for(const mode of ['approved','new-attempt','logout','disposed','unresolved']){
    const {test,row}=reviewFixture({reviewDelaysMs:[20,20,20]});test.checks.enqueue([row]);assert.equal(test.calls.length,0);
    if(mode==='disposed')test.checks.dispose();else if(mode==='logout')test.current=false;else if(mode==='new-attempt')test.jobs.get(row.taskId).attemptId='new';
    else{await new Promise(resolve=>setTimeout(resolve,25));await until(()=>test.calls.length===1);if(mode==='approved')test.jobs.get(row.taskId).verification={state:'confirmed'};test.releases.get(row.id)({receipt:{...row,verification:{state:mode==='approved'?'confirmed':'processing'},checkpoint:'verification_finished'}});}
    await new Promise(resolve=>setTimeout(resolve,35));assert.equal(test.calls.length,['approved','unresolved'].includes(mode)?1:0);test.checks.dispose();
  }
  for(const mode of ['manual','old','no-intent']){
    const {test,row}=reviewFixture();if(mode==='manual')row.manualVerification=true;if(mode==='old')row.createdAt=new Date(Date.now()-3600000).toISOString();if(mode==='no-intent')test.jobs.get(row.taskId).config.comment='';
    test.checks.enqueue([row]);await new Promise(resolve=>setTimeout(resolve,5));assert.equal(test.calls.length,0);test.checks.dispose();
  }
  console.log(JSON.stringify({boundedModerationChecks:9,maxReviewReads:3,approvalStopsReads:true,unknownStatusesNotRetried:true,originalAttemptAndOwnerRequired:true}));
  let n=0,f=fixture(),a=f.add('one');
  f.checks.enqueue([a,a]);f.checks.enqueue([a]);await until(()=>f.calls.length===1);assert.equal(f.calls.length,1);n++;
  f.releases.get(a.id)({receipt:{...a,status:'failed',message:'Official rejection'}});await until(()=>f.applied.length===1);assert.equal(f.jobs.get(a.taskId).stage,'failed');n++;
  f.checks.enqueue([a]);await tick();assert.equal(f.calls.length,1);assert.equal(f.applied.length,1);n+=2;f.checks.dispose();
  // No retry storm on unknown results, errors, timeouts or later events.
  for(const mode of ['unknown','error','timeout']){
    f=fixture(mode==='timeout'?{timeoutMs:10}:{});a=f.add(mode);f.checks.enqueue([a]);await until(()=>f.releases.has(a.id));
    if(mode==='unknown')f.releases.get(a.id)({receipt:a});else if(mode==='error')f.releases.get(a.id)({error:'Read failed'});
    if(mode==='timeout')await new Promise(resolve=>setTimeout(resolve,25));else await until(()=>f.applied.length+f.failures.length===1);
    for(let i=0;i<10;i++)f.checks.enqueue([a]);await tick();assert.equal(f.calls.length,1);assert.equal(f.applied.length+f.failures.length,1);n+=2;
    if(mode==='timeout'){f.releases.get(a.id)({receipt:{...a,status:'failed'}});await tick();assert.equal(f.applied.length,0);n++;}
    f.checks.dispose();
  }
  // Shared global concurrency, including separately arriving receipt events.
  f=fixture();const rows=['a','b','c','d'].map(f.add);f.checks.enqueue(rows.slice(0,3));f.checks.enqueue(rows.slice(2));await until(()=>f.calls.length===2);assert.equal(f.calls.length,2);n++;
  f.jobs.get('c').stage='failed';f.releases.get(rows[0].id)({receipt:rows[0]});await until(()=>f.calls.length===3);assert.equal(f.calls[2],rows[3].id);assert.ok(!f.calls.includes(rows[2].id));n+=2;
  f.releases.get(rows[1].id)({receipt:rows[1]});f.releases.get(rows[3].id)({receipt:rows[3]});await until(()=>f.applied.length===3);f.checks.dispose();
  // Never apply late foreign/previous-attempt reads or writes after logout.
  for(const mode of ['new-attempt','deleted','logout','disposed','foreign-receipt','foreign-kind']){
    f=fixture();a=f.add(mode);f.checks.enqueue([a]);await until(()=>f.releases.has(a.id));
    if(mode==='new-attempt')f.jobs.get(a.taskId).attemptId='new';if(mode==='deleted')f.jobs.delete(a.taskId);if(mode==='logout')f.current=false;if(mode==='disposed')f.checks.dispose();
    f.releases.get(a.id)({receipt:{...a,status:'failed',...(mode==='foreign-receipt'?{accountId:'foreign'}:{}),...(mode==='foreign-kind'?{kind:'comments'}:{})}});await tick();await tick();
    assert.equal(f.applied.length,0);assert.equal(f.failures.length,mode.startsWith('foreign-')?1:0);n+=2;f.checks.dispose();
  }
  f=fixture();a=f.add('later');f.jobs.get(a.taskId).stage='failed';f.checks.enqueue([a]);await tick();assert.equal(f.calls.length,0);n++;
  f.jobs.get(a.taskId).stage='unknown';f.checks.enqueue([{...a,attemptId:'wrong'},a]);await until(()=>f.calls.length===1);assert.equal(f.calls.length,1);n++;
  f.releases.get(a.id)({receipt:a});await until(()=>f.applied.length===1);f.checks.dispose();
  console.log(JSON.stringify({boundedOneShotResultChecks:n,sharedConcurrency:2,knownFailureNotRechecked:true,lateResultsIgnored:true,automaticUploadsOrPublishes:0,realPlatformActions:false}));
  // Exercise the real routing used by startup recovery, not just a mocked
  // receipt callback: old title-only records need the original body/topics.
  const job={id:'fixture-task',attemptId:'fixture-attempt',receiptId:'fixture-receipt',accountId:'fixture-account',platform:'douyin',stage:'unknown',resultCheckOnly:true,title:'Fixture title',config:{body:'Original description',topics:['Topic'],options:{visibility:'公开'}},lastAttemptAt:'2026-10-28T03:42:51.000Z',createdAt:'2026-10-27T16:12:25.000Z',history:[]};
  const receipt={id:job.receiptId,kind:'publish',taskId:job.id,attemptId:job.attemptId,accountId:job.accountId,platform:job.platform,status:'unknown',manualVerification:true,summary:job.title};
  const reads=[],reader={verifyManualPublish:async input=>{reads.push({kind:'manual',input});return{receipt:{...receipt,status:'confirmed',verification:{state:'processing'}}};},verifyPublishResult:async input=>{reads.push({kind:'receipt',input});return{receipt};}};
  const applied=[],failures=[];
  const recovery=createPublishResultChecks({current:()=>true,job:()=>job,verify:r=>verifyPublishJob(reader,'fixture-only',job,r),apply:r=>applied.push(r),failed:(...args)=>failures.push(args)});
  recovery.enqueue([receipt]);await until(()=>applied.length===1);
  assert.equal(reads[0].kind,'manual');assert.equal(reads[0].input.body,job.config.body);assert.deepEqual(reads[0].input.topics,job.config.topics);assert.equal(reads[0].input.startedAt,job.lastAttemptAt);assert.equal(applied[0].verification.state,'processing');assert.equal(failures.length,0);
  await verifyPublishJob(reader,'fixture-only',job);assert.deepEqual(reads[1],reads[0],'Explicit refresh and startup use the same original caption');
  await verifyPublishJob(reader,'fixture-only',job,{...receipt,manualVerification:false});assert.equal(reads[2].kind,'receipt','An actual submission receipt is never replaced by a manual record');
  await verifyPublishJob(reader,'fixture-only',{...job,stage:'confirmed'},receipt);assert.equal(reads[3].kind,'receipt','Accepted work uses the original receipt to refresh moderation');
  await verifyPublishJob(reader,'fixture-only',{...job,workReference:{workId:'7700000000000000001'}},receipt);assert.equal(reads[4].kind,'receipt');
  for(const patch of [{id:'other'},{taskId:'other'},{attemptId:'other'},{accountId:'other'},{platform:'xiaohongshu'},{kind:'comments'}])assert.throws(()=>verifyPublishJob(reader,'fixture-only',job,{...receipt,...patch}));
  assert.equal(reads.length,5);recovery.enqueue([receipt]);await tick();assert.equal(reads.length,5);recovery.dispose();
  console.log(JSON.stringify({originalCaptionRoutingChecks:18,manualAndAutomaticUnified:true,noPublicationMethodsAvailable:true,realAccountsTouched:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
