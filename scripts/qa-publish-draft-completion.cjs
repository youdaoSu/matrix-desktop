// Real queue with inert upload/submission dependencies; no profiles or services.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createPublishQueue,recoverPublishJobs}=require('./qa-load-typescript.cjs').loadTs('client/src/components/workspace/publish-queue.ts');
const pause=()=>new Promise(resolve=>setImmediate(resolve));
const done=async queue=>{for(let i=0;i<1500&&queue.running;i++)await pause();assert.equal(queue.running,false);};
const at=new Date().toISOString();
const origin=(overrides={})=>({id:'qa-draft',ownerId:'qa-owner',updatedAt:at,revisionId:randomUUID(),retain:false,accountIds:['account-a'],...overrides});
const request=(account='account-a',draft=origin())=>({account:{id:account,nickname:'QA',platform:'xiaohongshu',connectorSessionId:'qa-session'},config:{title:'QA original',body:'QA',topics:[],comment:'',options:{}},media:{id:'qa-session-media',mediaType:'image',files:[{name:'qa.png',size:1,modified:1}]},draft});
const receipt=(job,status='confirmed')=>({id:'qa-receipt-'+job.id+'-'+job.attemptId,kind:'publish',taskId:job.id,attemptId:job.attemptId,accountId:job.accountId,platform:job.platform,status,message:'QA '+status,createdAt:at});
function fixture(options={}){
 const plans=new Map(),state={current:true,completed:[],reads:0,submitCount:0};
 const deps={current:()=>state.current,changed:()=>{},sleep:pause,prepare:async item=>({accountId:item.account.id,platform:item.account.platform}),upload:async()=>({uploadStarted:true}),fill:async()=>({filled:['title','body'],unresolved:[]}),progress:async()=>({ready:true}),inspect:async input=>{const nonce=randomUUID();plans.set(nonce,input);return{nonce,candidates:[{index:0}]};},submit:async entries=>{state.submitCount++;return{results:entries.map(entry=>{const p=plans.get(entry.nonce),job={id:p.taskId,attemptId:p.attemptId,accountId:p.accountId,platform:p.platform};return{accountId:p.accountId,receipt:receipt(job)};})};},followup:async()=>{},completedDraft:ref=>state.completed.push(structuredClone(ref)),...options};
 const queue=createPublishQueue(deps);return{queue,deps,state};
}
(async()=>{
 let checks=0,f=fixture();f.queue.start([request()]);await done(f.queue);
 assert.equal(f.state.completed.length,1,'All original targets succeeded but the linked draft was never completed');checks++;
 assert.equal(f.state.completed[0].revisionId,f.queue.jobs[0].draftPublication.revisionId);checks++;
 assert.equal(f.queue.jobs[0].draftCleanupComplete,true);f.queue.operationReceipt(receipt(f.queue.jobs[0]));assert.equal(f.state.completed.length,1);checks+=2;
 const matrix=()=>{const shared=origin({accountIds:['account-a','account-b'],rowIds:['row-one','row-two']});return shared.rowIds.map(rowId=>shared.accountIds.map(account=>request(account,{...shared,rowId})));};
 f=fixture();let secondRowSawCompletion;
 const prepare=f.deps.prepare;let prepared=0;
 f.deps.prepare=async item=>{if(++prepared===3)secondRowSawCompletion=f.state.completed.length;return prepare(item);};
 let atCompletion;f.deps.completedDraft=ref=>{atCompletion=f.queue.jobs.map(job=>[job.updatedAt,JSON.stringify(job.history)]);f.state.completed.push(ref);};
 f.queue.startMany(matrix());await done(f.queue);assert.equal(secondRowSawCompletion,0);assert.equal(f.state.completed.length,1);assert.equal(f.queue.jobs.length,4);assert.ok(f.queue.jobs.every(job=>job.draftPublication.targetCount===4&&job.draftCleanupComplete));assert.deepEqual(f.queue.jobs.map(job=>[job.updatedAt,JSON.stringify(job.history)]),atCompletion);checks+=5;
 const delayed=()=>{const f=fixture(),submit=f.deps.submit;f.deps.submit=async entries=>{const result=await submit(entries);if(f.state.submitCount===2)for(const item of result.results)if(item.accountId==='account-b')item.receipt.status='unknown';return result;};return f;};
 f=delayed();f.queue.startMany(matrix());await done(f.queue);assert.equal(f.state.completed.length,0);const last=f.queue.jobs.find(job=>job.stage==='unknown');assert.ok(last);f.queue.operationReceipt(receipt(last));assert.equal(f.state.completed.length,1);f.queue.operationReceipt(receipt(last));assert.equal(f.state.completed.length,1);checks+=4;
 // Deleting a task row cannot shrink the immutable original target count.
 f=delayed();f.queue.startMany(matrix());await done(f.queue);const pending=f.queue.jobs.find(job=>job.stage==='unknown');f.queue.remove(f.queue.jobs.find(job=>job.stage==='confirmed').id);f.queue.operationReceipt(receipt(pending));assert.equal(f.state.completed.length,0);checks++;
 const failedLast=()=>{const f=fixture(),submit=f.deps.submit;f.deps.submit=async entries=>{const result=await submit(entries);if(f.state.submitCount===2)for(const item of result.results)if(item.accountId==='account-b')item.receipt.status='failed';return result;};return f;};
 f=failedLast();f.queue.startMany(matrix());await done(f.queue);const failed=f.queue.jobs.find(job=>job.stage==='failed'),unrelated=f.queue.jobs.filter(job=>job.id!==failed.id).map(job=>[job.id,job.attemptId,job.receiptId,job.updatedAt,JSON.stringify(job.history)]);
 assert.equal(f.state.completed.length,0);f.queue.retry(failed.id);await done(f.queue);assert.equal(f.state.completed.length,1);assert.equal(f.queue.jobs.length,4);assert.deepEqual(f.queue.jobs.filter(job=>job.id!==failed.id).map(job=>[job.id,job.attemptId,job.receiptId,job.updatedAt,JSON.stringify(job.history)]),unrelated);checks+=4;
 for(const change of ['config','media']){
   f=failedLast();f.queue.startMany(matrix());await done(f.queue);const job=f.queue.jobs.find(job=>job.stage==='failed'),replacement=structuredClone(f.queue.retryRequest(job.id));
   if(change==='config')replacement.config.title='QA changed intent';else replacement.media.id='different-same-basename-selection';
   f.queue.retry(job.id,replacement);await done(f.queue);assert.equal(f.state.completed.length,0);assert.equal(f.queue.jobs.find(row=>row.id===job.id).draftPublication,undefined);checks+=2;
 }
 // Recovered display state alone never authorizes clearing any draft.
 f=delayed();f.queue.startMany(matrix());await done(f.queue);const source=f.queue.jobs,restored=fixture();restored.queue=createPublishQueue(restored.deps,recoverPublishJobs(source));
 assert.equal(restored.state.completed.length,0);const unknown=restored.queue.jobs.find(job=>job.stage==='unknown');restored.queue.operationReceipt(receipt(unknown));assert.equal(restored.state.completed.length,0);checks+=2;
 for(const job of restored.queue.jobs.filter(job=>job.id!==unknown.id))restored.queue.operationReceipt(receipt(job));assert.equal(restored.state.completed.length,1);checks++;
 const settled=fixture();settled.queue=createPublishQueue(settled.deps,recoverPublishJobs(restored.queue.jobs));for(const job of settled.queue.jobs)settled.queue.operationReceipt(receipt(job));assert.equal(settled.state.completed.length,0,'Already-processed publications cannot retroactively clear drafts after restart');checks++;
 f=delayed();f.queue.startMany(matrix());await done(f.queue);const owned=f.queue.jobs.find(job=>job.stage==='unknown');
 for(const bad of [{attemptId:'previous-attempt'},{accountId:'foreign-account'},{platform:'douyin'},{kind:'comments'}]){f.queue.operationReceipt({...receipt(owned),...bad});assert.equal(f.state.completed.length,0);checks++;}
 f.state.current=false;f.queue.operationReceipt(receipt(owned));assert.equal(f.state.completed.length,0);checks++;
 f=fixture();let attempts=0;f.deps.completedDraft=ref=>{if(++attempts===1)throw Error('QA local storage failure');f.state.completed.push(ref);};f.queue.start([request()]);await done(f.queue);assert.equal(f.queue.jobs[0].stage,'confirmed');assert.equal(f.queue.jobs[0].draftCleanupComplete,undefined);assert.match(f.queue.jobs[0].draftCleanupWarning,/发布成功结果未改动/);f.queue.operationReceipt(receipt(f.queue.jobs[0]));assert.equal(f.state.completed.length,1);assert.equal(f.queue.jobs[0].draftCleanupComplete,true);assert.equal(f.queue.jobs[0].draftCleanupWarning,undefined);checks+=6;
 for(const patch of [{retain:true},{retain:undefined},{ownerId:''},{revisionId:'not-a-revision'},{accountIds:['account-a','account-b']},{accountIds:['account-a','account-a']},{rowId:'orphan'},{rowIds:['missing-row'],rowId:'another-row'},{rowIds:['dup','dup'],rowId:'dup'}]){
   f=fixture();f.queue.start([request('account-a',origin(patch))]);await done(f.queue);assert.equal(f.queue.jobs[0].stage,'confirmed');assert.equal(f.state.completed.length,0);checks+=2;
 }
 f=fixture();const submitWithoutProof=f.deps.submit;f.deps.submit=async entries=>{const result=await submitWithoutProof(entries);delete result.results[0].receipt.attemptId;return result;};f.queue.start([request()]);await done(f.queue);assert.equal(f.queue.jobs[0].stage,'confirmed');assert.equal(f.state.completed.length,0,'Legacy/incomplete receipt is display evidence, not cleanup authority');checks+=2;
 // A changed origin in one member must not borrow another revision's success.
 f=delayed();f.queue.startMany(matrix());await done(f.queue);const revised=recoverPublishJobs(f.queue.jobs);revised[0].draftPublication.revisionId=randomUUID();const mismatch=fixture();mismatch.queue=createPublishQueue(mismatch.deps,revised);for(const job of mismatch.queue.jobs)mismatch.queue.operationReceipt(receipt(job));assert.equal(mismatch.state.completed.length,0);checks++;
 const badRecovery=recoverPublishJobs([{...revised[0],draftPublication:{...revised[0].draftPublication,targetCount:0}}]);assert.equal(badRecovery[0].draftPublication,undefined);checks++;
 f=failedLast();f.deps.remember=async()=>({recoveryId:'qa-known-original-recovery'});f.queue.startMany(matrix());await done(f.queue);const retrySeed=recoverPublishJobs(f.queue.jobs),failedSeed=retrySeed.find(job=>job.stage==='failed'),publicationId=failedSeed.draftPublication.publicationId;
 const resumed=fixture();resumed.queue=createPublishQueue(resumed.deps,retrySeed);const original=request(failedSeed.accountId);original.media.id='new-handle-from-owned-original-restore';original.originalRecoveryId=failedSeed.recoveryId;resumed.queue.retry(failedSeed.id,original);await done(resumed.queue);assert.equal(resumed.queue.jobs.find(job=>job.id===failedSeed.id).draftPublication.publicationId,publicationId);assert.equal(resumed.state.completed.length,0);checks+=2;
 for(const job of resumed.queue.jobs.filter(job=>job.id!==failedSeed.id))resumed.queue.operationReceipt(receipt(job));assert.equal(resumed.state.completed.length,1);checks++;
 console.log(JSON.stringify({publishDraftCompletionChecks:checks,actualQueue:true,realDraftsOrPlatformActions:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
