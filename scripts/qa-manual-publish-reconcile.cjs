// Synthetic data only. No account sessions, network, screenshot or publication.
const assert=require('node:assert/strict');
const {registerManualPublishReconciliation}=require('../desktop/publish-manual-reconcile.cjs');
const {loadTs}=require('./qa-load-typescript.cjs');
const {createPublishQueue,canRetryPublishJob,recoverPublishJobs}=loadTs('client/src/components/workspace/publish-queue.ts');
const at='2026-10-26T17:00:00.000Z',clock=Date.parse(at)+60000;
const task={accountId:'fixture-account-0001',taskId:'fixture-task-0001',attemptId:'fixture-attempt-0001',platform:'douyin',expectedTitle:'Fixture video',startedAt:at,visibility:'公开'};
function fixture(){
 const f={handlers:{},rows:[],writes:0,checks:0,authorized:true,account:{id:task.accountId,platform:'douyin',nickname:'Fixture owner',connectorSessionId:'fixture-session-0001',nativeAccountKey:'own-id'},state:'unknown'};
 registerManualPublishReconciliation({ipcMain:{handle:(key,fn)=>f.handlers[key]=fn},getWindow:()=>({webContents:{id:7}}),now:()=>clock,authenticate:async()=>{if(!f.authorized)throw Error('unauthorized');return{userId:'fixture-owner-0001',account:f.account};},journal:{find:(_owner,id)=>f.rows.find(r=>r.id===id),list:()=>f.hiddenList?[]:f.rows,write:row=>{f.writes++;f.rows.push({...row});}},verifyPublishResult:async(_event,input)=>{f.checks++;if(f.gate)await f.gate;const row=f.rows.find(r=>r.id===input.receiptId);return{receipt:{...row,status:f.state}};}});
 f.verify=(patch={},sender=7)=>f.handlers['matrix:verify-manual-publish']({sender:{id:sender}},{accessToken:'fixture-only',...task,...patch});return f;
}
(async()=>{
 let checks=0,f=fixture(),r=await f.verify();
 assert.equal(r.receipt.status,'unknown');assert.equal(r.receipt.clicked,false);assert.equal(r.receipt.manualVerification,true);assert.equal(r.receipt.taskId,task.taskId);assert.equal(r.receipt.createdAt,at);assert.equal(r.receipt.resultSource,'manual_verification_request');assert.equal(f.writes,1);checks+=7;
 const firstId=r.receipt.id;await f.verify();assert.equal(f.writes,1);assert.equal(f.checks,2);f.hiddenList=true;assert.equal((await f.verify()).receipt.id,firstId);assert.equal(f.writes,1);checks+=4;
 for(const patch of [{accountId:'other-account-0001'},{platform:'bilibili'},{taskId:'bad'},{attemptId:'bad'},{expectedTitle:''},{expectedTitle:'x'.repeat(501)},{startedAt:'bad'},{startedAt:new Date(clock+61000).toISOString()},{startedAt:new Date(clock-8*86400000).toISOString()},{visibility:'all'},{expectedWorkId:'javascript:bad'}]){f=fixture();assert.ok((await f.verify(patch)).error);assert.equal(f.writes,0);assert.equal(f.checks,0);checks+=3;}
 f=fixture();assert.ok((await f.verify({},99)).error);assert.equal(f.writes,0);f.authorized=false;assert.ok((await f.verify()).error);assert.equal(f.writes,0);checks+=4;
 for(const patch of [{nativeAccountKey:undefined},{platform:'xiaohongshu'},{connectorSessionId:'bad'}]){f=fixture();Object.assign(f.account,patch);assert.ok((await f.verify()).error);assert.equal(f.writes,0);checks+=2;}
 f=fixture();await f.verify();assert.ok((await f.verify({expectedTitle:'Changed title'})).error);assert.equal(f.writes,1);f.account.connectorSessionId='fixture-session-0002';assert.ok((await f.verify()).error);assert.equal(f.writes,1);checks+=4;
 f=fixture();f.account.platform='xiaohongshu';r=await f.verify({platform:'xiaohongshu',expectedWorkId:'abcdef0123456789abcdef01'});assert.equal(r.receipt.expectedWorkId,'abcdef0123456789abcdef01');checks++;
 f=fixture();let release;f.gate=new Promise(resolve=>release=resolve);const one=f.verify(),two=f.verify();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.writes,1);assert.equal(f.checks,1);release();assert.equal((await one).receipt.id,(await two).receipt.id);checks+=3;
 f=fixture();let finish;f.gate=new Promise(resolve=>finish=resolve);const active=f.verify();await new Promise(resolve=>setImmediate(resolve));assert.ok((await f.verify({expectedTitle:'Different concurrent request'})).error);assert.equal(f.writes,1);assert.equal(f.checks,1);finish();await active;checks+=3;
 const job={id:task.taskId,batchId:'fixture-batch',accountId:task.accountId,platform:'douyin',nickname:'Fixture owner',title:'Fixture video',files:['fixture.mp4'],createdAt:at,updatedAt:at,attemptId:task.attemptId,stage:'failed',message:'Editor absent',submission:'not_submitted',mediaHandoff:{state:'confirmed',at},history:[]};
 job.completedAt=at;
 let uploads=0,submits=0,comments=0,draftRemovals=0;
 const queue=createPublishQueue({current:()=>true,changed:()=>{},sleep:async()=>{},prepare:async()=>{throw Error('No preparation allowed');},upload:async()=>{uploads++;},submit:async()=>{submits++;},followup:async()=>{comments++;},completedDraft:()=>draftRemovals++},[job]);
 assert.equal(canRetryPublishJob(queue.jobs[0]),true);assert.throws(()=>queue.beginManualVerification(task.taskId,'stale'));queue.beginManualVerification(task.taskId,task.attemptId);assert.equal(queue.jobs[0].stage,'unknown');assert.equal(canRetryPublishJob(queue.jobs[0]),false);assert.equal(queue.hasRetainedPreparation(task.taskId),false);assert.equal(canRetryPublishJob(recoverPublishJobs(queue.jobs)[0]),false);checks+=6;
 assert.equal(queue.jobs[0].completedAt,undefined);checks++;
 const receipt={id:'fixture-manual-receipt',kind:'publish',platform:'douyin',taskId:task.taskId,attemptId:task.attemptId,accountId:task.accountId,status:'confirmed',message:'Official list verified',manualVerification:true,clicked:false,verification:{state:'confirmed',message:'Verified',checkedAt:at},evidence:{workId:'7700000000000000001',workUrl:'https://www.douyin.com/video/7700000000000000001',workReferenceSource:'official_title_link'}};
 queue.operationReceipt({...receipt,attemptId:'stale'});assert.equal(queue.jobs[0].stage,'unknown');queue.operationReceipt({...receipt,id:'old-automation-error',manualVerification:false,status:'failed'});assert.equal(queue.jobs[0].stage,'unknown');assert.equal(canRetryPublishJob(queue.jobs[0]),false);checks+=2;
 queue.operationReceipt(receipt);assert.equal(queue.jobs[0].stage,'confirmed');assert.equal(queue.jobs[0].submission,'confirmed');assert.equal(queue.jobs[0].workReference.workId,receipt.evidence.workId);queue.operationReceipt({...receipt,status:'unknown'});assert.equal(queue.jobs[0].stage,'confirmed');assert.equal(uploads+submits+comments+draftRemovals,0);checks+=5;queue.dispose();
 for(const leaveBeforeFill of [false,true]){
  let reads=0,autoChecks=0,autoUploads=0,autoSubmits=0;
  let autoQueue;
  autoQueue=createPublishQueue({current:()=>true,changed:()=>{},sleep:()=>new Promise(resolve=>setImmediate(resolve)),prepare:async()=>({accountId:task.accountId}),upload:async()=>{autoUploads++;return{uploadStarted:true};},fill:async()=>({filled:['title','body'],unresolved:[]}),progress:async()=>{reads++;return leaveBeforeFill||reads>2?{error:'请先在当前账号打开官方发布表单'}:{ready:true};},inspect:async()=>{throw Error('No submit inspection expected');},submit:async()=>{autoSubmits++;},followup:async()=>{throw Error('No followup allowed');},verifyManual:async job=>{autoChecks++;autoQueue.operationReceipt({...receipt,taskId:job.id,attemptId:job.attemptId});}});
  autoQueue.start([{account:{id:task.accountId,platform:'douyin',nickname:'Fixture owner',connectorSessionId:'fixture-session-0001'},config:{title:'Fixture video',body:'Fixture body',topics:[],comment:'',options:{}},media:{id:'fixture-media',mediaType:'image',files:[{name:'fixture.png',size:1}]}}]);
  for(let i=0;i<1000&&autoQueue.running;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(autoQueue.running,false);assert.equal(autoUploads,1);assert.equal(autoSubmits,0);assert.equal(autoChecks,leaveBeforeFill?0:1);assert.equal(autoQueue.jobs[0].stage,leaveBeforeFill?'failed':'confirmed');checks+=5;autoQueue.dispose();
 }
 console.log(JSON.stringify({manualReconciliationChecks:checks,uploadCalls:uploads,publishCalls:submits,commentCalls:comments,actualAccountsTouched:false}));
 // An old title-only manual receipt may be enriched once with the unchanged
 // task's exact saved caption. It is not a status mutation or a second attempt.
 f=fixture();await f.verify();const enriched=await f.verify({body:'Original body',topics:['Topic']});assert(!enriched.error);assert.equal(f.rows.at(-1).summary,'Fixture video\nOriginal body\n#Topic');assert.equal(f.rows.at(-1).status,'unknown');assert.equal(f.rows.at(-1).clicked,false);assert.equal(f.rows.at(-1).id,f.rows[0].id);
 f=fixture();await f.verify({body:'Original body',topics:['Topic']});assert.ok((await f.verify({body:'Different body',topics:['Topic']})).error);assert.equal(f.writes,1);
 for(const patch of [{body:{}},{body:'x'.repeat(10001)},{topics:'not-array'},{topics:[{}]},{topics:['x'.repeat(101)]}]){f=fixture();assert.ok((await f.verify(patch)).error);assert.equal(f.writes,0);}
 f=fixture();await f.verify();f.rows[0].status='confirmed';assert.ok((await f.verify({body:'Different body'})).error);assert.equal(f.writes,1);
 console.log(JSON.stringify({manualCaptionChecks:19,oneTimeLegacyEnrichment:true,noStatusMutation:true}));
 // Use the production append-only journal: public projections strip ownerId.
 // A mock that returns the first matching row masked the ownerless enrichment.
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
 const {createJournal}=require('../desktop/page-actions.cjs');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-manual-caption-'));
 try{
  const journal=createJournal(directory),handlers={},owner='fixture-owner-0001';
  registerManualPublishReconciliation({ipcMain:{handle:(name,fn)=>handlers[name]=fn},getWindow:()=>({webContents:{id:7}}),now:()=>clock,
   authenticate:async()=>({userId:owner,account:{id:task.accountId,platform:'douyin',nickname:'Fixture owner',connectorSessionId:'fixture-session-0001',nativeAccountKey:'own-id'}}),journal,
   verifyPublishResult:async(_event,input)=>({receipt:journal.find(owner,input.receiptId)})});
  const invoke=patch=>handlers['matrix:verify-manual-publish']({sender:{id:7}},{accessToken:'fixture-only',...task,...patch});
  const initial=await invoke({}),full=await invoke({body:'Original body',topics:['Topic']});
  assert.equal(full.receipt.summary,'Fixture video\nOriginal body\n#Topic','Production journal must expose enriched caption to verification');
  assert.equal(full.receipt.ownerId,owner);assert.equal(full.receipt.id,initial.receipt.id);assert.equal(full.receipt.status,'unknown');assert.equal(full.receipt.clicked,false);
  assert.equal(journal.list('other-owner').length,0);
  assert.equal((await invoke({body:'Original body',topics:['Topic']})).receipt.summary,full.receipt.summary);
  const rows=fs.readFileSync(path.join(directory,'page-actions.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(rows.length,2);assert(rows.every(row=>row.ownerId===owner));
  console.log(JSON.stringify({durableManualCaptionOwnershipChecks:9,productionJournal:true,realAccountsTouched:false}));
 }finally{assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('matrix-manual-caption-'));fs.unlinkSync(path.join(directory,'page-actions.jsonl'));fs.rmdirSync(directory);}
})().catch(error=>{console.error(error);process.exitCode=1;});
