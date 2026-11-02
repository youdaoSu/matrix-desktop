// Actual provider/runner, only inert desktop APIs and in-memory local storage.
async function runPublishSubmitUiTests() {
  const assert=require('node:assert/strict'),React=require('react'),path=require('node:path');
  const {createRoot}=require('react-dom/client'),{loadTs}=require('./qa-load-typescript.cjs');
  const root=path.resolve(__dirname,'..'),cache=new Map(),overrides=new Map(),stub=(file,exports)=>cache.set(path.join(root,file),{exports});
  const previousStorage=Object.getOwnPropertyDescriptor(window,'localStorage'),previousDesktop=window.matrixDesktop,values=new Map();
  Object.defineProperty(window,'localStorage',{value:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)},configurable:true});
  let owner='qa-submit-owner',token='qa-submit-token',deps,runner,verifications=[],submissions=0,checks=0,readTrace,retain=true,notifyProgress,journal=[],journalReads=0;const draftRemovals=[];
  const at=new Date().toISOString(),job=id=>({id:'qa-job-'+id,accountId:'qa-account-'+id,nickname:'QA '+id,platform:'xiaohongshu',title:'QA private title '+id,batchId:'qa-original',attemptId:'qa-attempt-'+id,stage:'unknown',message:'QA unknown',history:[],files:[],createdAt:at,updatedAt:at});
  const a=job('a'),b=job('b');values.set('matrix-publish-progress:'+owner,JSON.stringify([a,b]));
  const receipt=(item,status='unknown')=>({id:'qa-receipt-'+item.id,kind:'publish',taskId:item.id,attemptId:item.attemptId,accountId:item.accountId,platform:item.platform,status,message:'QA '+status,createdAt:at,clicked:status!=='failed'});
  stub('client/src/api/index.ts',{getAuthToken:()=>token,getUser:()=>({id:owner}),axiosForBackend:{post:()=>{throw Error('No follow-up may be sent');}}});
  stub('client/src/contexts/AppPreferences.ts',{readAppPreferences:()=>({publishAlerts:false})});
  const wrap=({children})=>children;
  stub('client/src/components/workspace/PublishEditorState.tsx',{PublishEditorStateProvider:wrap});
  stub('client/src/components/workspace/OfficialWorkspace.tsx',{OfficialWorkspaceProvider:wrap,useOfficialWorkspace:()=>({lockJobs:()=>{}})});
  const actual=loadTs('client/src/components/workspace/publish-queue.ts',cache,overrides);
  stub('client/src/components/workspace/publish-queue.ts',{...actual,createPublishQueue:(dependencies,initial)=>{deps=dependencies;runner=actual.createPublishQueue(dependencies,initial);return runner;}});
  stub('client/src/components/workspace/local-publish-drafts.ts',{draftPreferences:()=>({retain}),removeLocalDraft:(...args)=>draftRemovals.push(args)});
  let useQueue;
  const Probe=()=>{const {jobs}=useQueue();return React.createElement('p',{'data-qa-live-queue':true},jobs.map(item=>item.id+':'+item.stage).join('|'));};
  overrides.set('react-router-dom',{useNavigate:()=>()=>{},Outlet:()=>React.createElement(Probe)});
  overrides.set('sonner',{toast:{info:()=>{},success:()=>{},error:()=>{}}});
  window.matrixDesktop={listPageActions:async()=>{journalReads++;return{items:journal};},onPublishProgress:fn=>{notifyProgress=fn;return()=>{notifyProgress=undefined;};},submitPublishBatch:async(_entries,id)=>{submissions++;return{results:[{accountId:id==='qa-other'?b.accountId:a.accountId,receipt:receipt(id==='qa-other'?b:a,id==='qa-other'?'failed':'unknown')}]};},verifyPublishResult:request=>new Promise(resolve=>verifications.push({request,resolve})),readPublishTrace:input=>readTrace(input)};
  const {WorkspaceSession,usePublishQueue}=loadTs('client/src/components/workspace/PublishQueue.tsx',cache,overrides);useQueue=usePublishQueue;
  const {PublishTrace}=loadTs('client/src/components/workspace/PublishTrace.tsx',cache,overrides),component=createRoot(document.getElementById('root'));
  const pause=()=>new Promise(resolve=>setTimeout(resolve,10)),until=async fn=>{for(let i=0;i<150;i++){if(fn())return;await pause();}throw Error('Submit provider UI timeout '+document.body.innerText);};
  try{
    component.render(React.createElement(WorkspaceSession));await until(()=>document.querySelector('[data-qa-live-queue]'));
    const revision=crypto.randomUUID(),reference={ownerId:owner,id:'qa-draft',updatedAt:at,revisionId:revision,retain:false};retain=false;
    deps.completedDraft(reference);assert.deepEqual(draftRemovals,[['qa-draft',at,revision]]);checks++;
    deps.completedDraft({...reference,ownerId:'foreign-owner'});retain=true;deps.completedDraft(reference);retain=undefined;deps.completedDraft(reference);assert.equal(draftRemovals.length,1);retain=true;checks++;
    const first=await Promise.race([deps.submit([], 'qa-pending'),new Promise((_resolve,reject)=>setTimeout(()=>reject(Error('Submission response is blocked by work-list verification')),200))]);
    // The real runner applies this returned submission receipt before the
    // deferred automatic check; calling deps.submit alone does not do that.
    runner.operationReceipt(first.results[0].receipt);
    assert.equal(first.results[0].receipt.status,'unknown');await until(()=>verifications.length===1);assert.equal(runner.jobs[0].stage,'unknown');checks+=2;
    const other=await deps.submit([],'qa-other');assert.equal(other.results[0].receipt.status,'failed');assert.equal(submissions,2);assert.equal(verifications.length,1);checks+=3;
    verifications[0].resolve({receipt:receipt(a,'confirmed')});await until(()=>runner.jobs[0].stage==='confirmed');assert.equal(runner.jobs[1].stage,'unknown');assert.equal(first.results[0].receipt.status,'unknown','A background result must not mutate the already-returned response object');checks+=2;
    // One batch item completes while another has not returned. A progress
    // notification triggers an owned journal read, never a fabricated success.
    const readsBefore=journalReads;
    notifyProgress({batchId:b.batchId,accountId:b.accountId,status:'confirmed',message:'Status only'});await pause();assert.equal(runner.jobs[1].stage,'unknown');assert.equal(journalReads,readsBefore+1);
    journal=[receipt(b,'confirmed')];notifyProgress({batchId:b.batchId,accountId:b.accountId,status:'confirmed',message:'Result ready'});await until(()=>runner.jobs[1].stage==='confirmed');assert.equal(submissions,2);assert.equal(journalReads,readsBefore+2);assert.ok(runner.jobs[1].completedAt);checks+=5;journal=[];
    // Restore only these QA rows, then check owner change while a new read waits.
    component.render(null);await until(()=>!document.querySelector('[data-qa-live-queue]'));values.set('matrix-publish-progress:'+owner,JSON.stringify([a,b]));component.render(React.createElement(WorkspaceSession));await until(()=>document.querySelector('[data-qa-live-queue]'));const previousRunner=runner;
    const late=await deps.submit([],'qa-late-owner');runner.operationReceipt(late.results[0].receipt);await until(()=>verifications.length===2);const oldCompletion=deps.completedDraft;owner='qa-other-owner';token='qa-other-token';component.render(React.createElement(WorkspaceSession));await until(()=>runner!==previousRunner&&document.querySelector('[data-qa-live-queue]'));verifications[1].resolve({receipt:receipt(a,'confirmed')});await pause();assert.equal(previousRunner.jobs[0].stage,'unknown');assert.ok(!document.body.textContent.includes(a.id));retain=false;oldCompletion(reference);assert.equal(draftRemovals.length,1);retain=true;checks+=3;
    readTrace=async()=>({status:'unknown',resultSource:'official_acceptance_notice',outcomeObservation:{startedAt:at,deadlineAt:at,checks:26,lastReason:'processing',elapsedMs:26000}});
    component.render(React.createElement(PublishTrace,{job:{...a,receiptId:'qa-trace'}}));await until(()=>document.querySelector('[data-publish-outcome-observation]'));assert.match(document.body.textContent,/26 次.*26秒/);assert.match(document.body.textContent,/最终状态：结果未确认/);assert.ok(!document.body.textContent.includes('最终状态：unknown'));checks+=3;
    readTrace=async()=>({status:'unknown',resultSource:'official_acceptance_notice'});component.render(React.createElement(PublishTrace,{job:{...a,receiptId:'qa-pending-review',acceptedAt:at,verification:{state:'processing',message:'审核中',checkedAt:at}}}));await until(()=>document.body.textContent.includes('当前状态：投稿成功，等待审核'));assert.match(document.body.textContent,/平台已接收投稿/);assert.ok(!document.body.textContent.includes('最终状态：发布失败'));checks+=2;
    readTrace=async()=>({status:'failed',resultSource:'official_work_list',evidence:{statusText:'审核未通过：QA具体原因',timePrecision:'second',publishedAt:at}});
    component.render(React.createElement(PublishTrace,{job:{...a,receiptId:'qa-rejected-trace',stage:'failed'}}));await until(()=>document.querySelector('[data-official-work-status]'));assert.match(document.body.textContent,/QA具体原因/);assert.match(document.body.textContent,/官网时间精度：秒级/);assert.match(document.body.textContent,/最终状态：发布失败/);checks+=3;
    readTrace=async()=>({status:'confirmed',resultSource:'official_work_list',evidence:{workId:'BV1s54y1d72u',workUrl:'https://www.bilibili.com/video/BV1s54y1d72u',workReferenceSource:'official_title_link'}});
    component.render(React.createElement(PublishTrace,{job:{...a,receiptId:'qa-work-reference',stage:'confirmed'}}));await until(()=>document.querySelector('[data-official-work-reference]'));assert.match(document.body.textContent,/BV1s54y1d72u/);assert.match(document.body.textContent,/不是本次提交的服务器回执/);assert.match(document.querySelector('[data-official-work-visibility]').textContent,/未读取到独立权限标识/);assert.equal(document.querySelectorAll('[data-official-work-reference] a').length,0);checks+=4;
    let release;readTrace=()=>new Promise(resolve=>release=resolve);component.render(React.createElement(PublishTrace,{job:{...a,receiptId:'qa-old-owner-trace'}}));await until(()=>release);owner='qa-final-owner';token='qa-final-token';readTrace=async()=>({status:'unknown',resultSource:'unknown'});component.render(React.createElement(PublishTrace,{job:{...b,receiptId:'qa-new-owner-trace'}}));await pause();release({status:'confirmed',resultSource:'official_success_notice',evidence:{notice:'QA forbidden old-owner evidence'}});await pause();assert.ok(!document.body.textContent.includes('QA forbidden old-owner evidence'));checks++;
    return{publishSubmitProviderReactChecks:checks,actualProviderAndQueue:true,receiptReturnedBeforeSlowVerification:true,otherAccountsRemainUsable:true,backgroundResultAppliedToOriginalAttemptOnly:true,ownerChangeBlocksLateUpdates:true,actualTraceShowsObservationDiagnostics:true,realDesktopOrPlatformActions:false};
  }finally{component.unmount();for(const item of verifications)item.resolve({error:'QA cleanup'});window.matrixDesktop=previousDesktop;if(previousStorage)Object.defineProperty(window,'localStorage',previousStorage);else delete window.localStorage;}
}
module.exports={runPublishSubmitUiTests};
