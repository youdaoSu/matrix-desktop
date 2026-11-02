// Invoked inside the hidden, disposable editor fixture. No services, installed
// profile, official navigation, uploads or messages are used by this test.
async function runPhaseUiTests() {
  const assert=require('node:assert/strict'),path=require('node:path');
  const React=require('react'),{createRoot}=require('react-dom/client');
  const {loadTs}=require('./qa-load-typescript.cjs');
  const root=path.resolve(__dirname,'..'),cache=new Map(),overrides=new Map();
  let context,render=()=>{},mounted=false,ready=false,uploads=0,prepares=0,submits=0,fetchedAccounts,expectedError=false;
  const expectedErrors=[];
  const stub=(file,exports)=>cache.set(path.join(root,file),{exports});
  const wrapper=tag=>({children})=>React.createElement(tag,null,children);
  overrides.set('react',{...React,useContext:()=>context});
  overrides.set('react-router-dom',{useNavigate:()=>()=>{},Outlet:()=>null});
  overrides.set('sonner',{toast:{info:()=>{},success:()=>{},error:message=>{if(expectedError)expectedErrors.push(message);else throw Error(message);}}});
  stub('client/src/api/index.ts',{getAuthToken:()=> 'qa-local',getUser:()=>({id:'qa-owner'}),axiosForBackend:{get:async()=>{if(fetchedAccounts)return{data:{data:{items:fetchedAccounts}}};throw Error('No API call is allowed');}}});
  const refreshAccounts=async()=>{};
  stub('client/src/components/workspace/OfficialWorkspace.tsx',{platformLabels:{wechat:'视频号'},useOfficialWorkspace:()=>({accounts:[],tabs:[],refreshAccounts,hide:()=>{}})});
  stub('client/src/components/ui/button.tsx',{Button:({children,variant,size,asChild,...props})=>React.createElement('button',props,children)});
  stub('client/src/components/ui/dialog.tsx',Object.fromEntries(['Dialog','DialogContent','DialogDescription','DialogFooter','DialogHeader','DialogTitle'].map(name=>[name,()=>null])));
  stub('client/src/components/ui/sheet.tsx',{Sheet:({open,children})=>open?React.createElement('div',null,children):null,SheetContent:wrapper('div'),SheetDescription:wrapper('p'),SheetHeader:wrapper('header'),SheetTitle:wrapper('h2')});
  stub('client/src/components/workspace/PublishTaskAssets.tsx',{PublishTaskAvatar:()=>null,PublishTaskMedia:()=>React.createElement('span',null,'QA local media')});
  const {createPublishQueue}=loadTs('client/src/components/workspace/publish-queue.ts',cache,overrides);
  const queue=createPublishQueue({current:()=>true,changed:()=>{if(mounted)render();},sleep:async()=>{},
    prepare:async request=>{prepares++;return{accountId:request.account.id};},
    upload:async()=>{uploads++;return{uploadStarted:true};},
    progress:async input=>input.accountId==='qa-one'&&!ready?{error:'QA readiness probe failed'}:{ready:true},
    fill:async()=>({unresolved:[]}),inspect:async()=>({nonce:'qa-plan',candidates:[{index:0}]}),
    submit:async entries=>{submits++;return{results:entries.map(entry=>({accountId:entry.accountId,receipt:{id:'qa-receipt-'+entry.accountId,status:'confirmed',message:'发布成功'}}))};},followup:async()=>{}});
  const request=id=>({account:{id,nickname:id,platform:'wechat',connectorSessionId:'qa-session-'+id},config:{title:'QA '+id,body:'QA body',topics:[],comment:'',options:{}},media:{id:'qa-media-'+id,mediaType:'video',files:[{name:id+'.mp4',size:100}]}});
  const pause=()=>new Promise(resolve=>setTimeout(resolve,15));
  const until=async(fn,label)=>{for(let i=0;i<120;i++){if(fn())return;await pause();}throw Error('Phase UI timeout: '+label);};
  queue.start([request('qa-one'),request('qa-two')]);await until(()=>!queue.running,'initial attempt');
  const first=queue.jobs[0],other=JSON.stringify(queue.jobs[1]);
  first.history.unshift({at:'2020-01-01T00:00:00Z',stage:'filling',message:'QA-OLD-ATTEMPT-NOT-CURRENT'});
  const {PublishQueuePanel}=loadTs('client/src/components/workspace/PublishQueue.tsx',cache,overrides);
  const {PublishTaskDetail}=loadTs('client/src/components/workspace/PublishTaskDetail.tsx',cache,overrides);
  const component=createRoot(document.getElementById('root'));
  let activeQueue=queue;
  render=()=>{context={queue:activeQueue,jobs:activeQueue.jobs,stop:()=>activeQueue.stop()};component.render(React.createElement(PublishQueuePanel));};
  try {
    mounted=true;render();await until(()=>document.querySelector('[data-publish-job]'),'real queue panel');
    const row=()=>document.querySelector(`[data-publish-job="${first.id}"]`);
    const continueButton=()=>[...row().querySelectorAll('button')].find(button=>button.textContent==='继续剩余步骤');
    assert.ok(continueButton());assert.equal(continueButton().disabled,false);
    assert.ok(![...row().querySelectorAll('button')].some(button=>/^(重发|重新发送作品)$/.test(button.textContent)));
    assert.ok(!row().textContent.includes('QA-OLD-ATTEMPT-NOT-CURRENT'));
    assert.equal(row().querySelector('.matrix-task-step-progress'),null);
    assert.equal(row().querySelector('.matrix-task-details'),null);
    assert.ok(row().querySelector('[data-execution-stage]'));
    ready=true;continueButton().click();await until(()=>!queue.running&&queue.jobs[0].stage==='confirmed','one-row continuation');
    assert.equal(uploads,2);assert.equal(prepares,2);assert.equal(submits,2);assert.equal(JSON.stringify(queue.jobs[1]),other);
    mounted=false;
    const draftWarning='草稿清理未确认：本机存储空间或配额不足，请到本地草稿箱核对；发布成功结果未改动。';
    const detailJob={...queue.jobs[0],followup:{status:'confirmed',message:'QA追评已发表',commentId:'998877',pinResult:{status:'failed',message:'QA独立置顶权限不足'}},draftCleanupWarning:draftWarning,draftPublication:{ownerId:'qa-owner',id:'qa-draft',updatedAt:'2026-10-19T00:00:00.000Z',revisionId:'00000000-0000-4000-8000-000000000001',publicationId:'00000000-0000-4000-8000-000000000002',retain:false,targetCount:2,rowId:'single'}};
    detailJob.mediaObservation={at:'2026-10-28T00:12:28+08:00',stored:true,value:{version:1,state:'uploading',uploadPercent:42,editorReady:true,busySignals:['progress_bar'],attachedVideoInputs:1,mediaElements:0,decodedMedia:0,coverContainers:0,coverImages:0,decodedCoverImages:0,enabledSubmitButtons:0}};
    component.render(React.createElement(PublishTaskDetail,{job:detailJob,onClose:()=>{},onReturnFocus:()=>{}}));
    await until(()=>document.querySelector('[aria-label="任务素材预览"]'),'real task detail');
    assert.match(document.querySelector('[aria-label="任务素材预览"]').textContent,/本地素材预览.*不代表平台上传完成或发布成功/);
    assert.ok(!document.querySelector('.matrix-detail-timeline').textContent.includes('QA-OLD-ATTEMPT-NOT-CURRENT'));
    assert.match(document.querySelector('[data-media-handoff]').textContent,/素材已交付官方控件.*不等于上传或发布成功/);
    assert.equal(document.querySelector('[aria-label="最近读取的官方上传进度"]').value,42);assert.match(document.querySelector('[data-upload-observation=uploading]').textContent,/最近观测.*不是估算进度/);
    assert.equal(document.querySelector('[data-draft-cleanup-warning]').textContent,draftWarning);assert.equal(detailJob.stage,'confirmed');
    assert.equal(document.querySelector('[data-followup-comment-id]').textContent,'998877');assert.match(document.querySelector('[data-followup-pin-result=failed]').textContent,/QA独立置顶权限不足/);
    const createUrl=URL.createObjectURL,revokeUrl=URL.revokeObjectURL,anchorClick=HTMLAnchorElement.prototype.click;let exported;
    try{
      URL.createObjectURL=blob=>{exported=blob.text();return 'blob:qa-draft-lifecycle';};URL.revokeObjectURL=()=>{};HTMLAnchorElement.prototype.click=function(){};
      [...document.querySelectorAll('button')].find(button=>button.textContent==='导出完整发布溯源').click();await until(()=>!!exported,'local-only trace export');
      const bundle=JSON.parse(await exported);assert.equal(bundle.currentStatus,'confirmed');assert.equal(bundle.draftLifecycle.status,'needs_attention');assert.equal(bundle.draftLifecycle.warning,draftWarning);assert.equal(bundle.draftLifecycle.targetCount,2);assert.match(bundle.draftLifecycle.scope,/不代表一定删除/);assert.equal(bundle.draftLifecycle.ownerId,undefined);
      assert.equal(bundle.postPublishOperations.followup.commentId,'998877');assert.equal(bundle.postPublishOperations.followup.status,'confirmed');assert.equal(bundle.postPublishOperations.followup.pinResult.status,'failed');assert.match(bundle.postPublishOperations.scope,/不应重发作品/);
    }finally{URL.createObjectURL=createUrl;URL.revokeObjectURL=revokeUrl;HTMLAnchorElement.prototype.click=anchorClick;}
    let autoUploads=0,autoFills=0,autoCoverCalls=0;
    activeQueue=createPublishQueue({current:()=>true,changed:()=>{if(mounted)render();},sleep:async()=>{},
      prepare:async request=>({accountId:request.account.id}),upload:async()=>{autoUploads++;return{uploadStarted:true};},
      progress:async()=>({ready:true,mediaReady:true,coverReady:true}),fill:async()=>{autoFills++;return{unresolved:[]};},
      cover:async()=>{autoCoverCalls++;return{error:'封面编辑入口被菜单遮挡',uploadStarted:false};},
      inspect:async()=>({nonce:'qa-auto',candidates:[{index:0}]}),submit:async entries=>({results:entries.map(entry=>({accountId:entry.accountId,receipt:{id:'qa-auto-receipt',status:'confirmed',message:'发布成功'}}))}),followup:async()=>{}});
    const autoRequest=request('qa-auto');autoRequest.config.covers=[{id:'qa-unused-cover',name:'old.jpg',index:1}];
    activeQueue.start([autoRequest,request('qa-auto-other')]);await until(()=>!activeQueue.running,'custom cover stopped');
    const autoId=activeQueue.jobs[0].id,autoAttempt=activeQueue.jobs[0].attemptId,autoOther=JSON.stringify(activeQueue.jobs[1]);
    mounted=true;render();await until(()=>document.querySelector(`[data-publish-job="${autoId}"]`),'auto-cover action row');
    const autoButton=[...document.querySelector(`[data-publish-job="${autoId}"]`).querySelectorAll('button')].find(button=>button.textContent==='使用自动封面继续');
    assert.ok(autoButton);assert.equal(autoButton.disabled,false);autoButton.click();await until(()=>!activeQueue.running&&activeQueue.jobs[0].stage==='confirmed','auto-cover continuation from real UI');
    assert.equal(autoUploads,2);assert.equal(autoFills,2);assert.equal(autoCoverCalls,1);assert.equal(activeQueue.jobs[0].attemptId,autoAttempt);assert.deepEqual(activeQueue.jobs[0].config.covers,[]);assert.equal(activeQueue.jobs.length,2);assert.equal(JSON.stringify(activeQueue.jobs[1]),autoOther);
    // The real row buttons must refresh independently and render diagnostic
    // evidence even when an unknown receipt's id/status have not changed.
    mounted=false;
    const unknownRows=activeQueue.jobs.map((job,index)=>({...job,stage:'unknown',submission:'uncertain',receiptId:'qa-refresh-'+index}));
    activeQueue=createPublishQueue({current:()=>true,changed:()=>{if(mounted)render();},sleep:async()=>{},prepare:async()=>{throw Error('Refresh may not prepare a publish');}},unknownRows);
    const refreshResolvers=new Map();window.matrixDesktop={verifyPublishResult:input=>new Promise(resolve=>refreshResolvers.set(input.receiptId,resolve)),resolvePublishReceipt:async()=>({cancelled:true})};
    mounted=true;render();await until(()=>document.querySelectorAll('button[aria-label^="刷新状态 "]').length===2,'two refresh controls');
    const refreshButtons=()=>[...document.querySelectorAll('button[aria-label^="刷新状态 "]')];
    refreshButtons()[0].click();await until(()=>refreshResolvers.has('qa-refresh-0'),'first refresh pending');
    assert.equal(refreshButtons()[0].disabled,true);assert.equal(refreshButtons()[1].disabled,false);
    refreshButtons()[1].click();await until(()=>refreshResolvers.has('qa-refresh-1'),'second refresh remains independently usable');
    const returned=unknownRows.map(job=>({id:job.receiptId,kind:'publish',taskId:job.id,attemptId:job.attemptId,accountId:job.accountId,platform:job.platform,message:job.message,status:'unknown'}));
    refreshResolvers.get('qa-refresh-0')({receipt:{...returned[0],verification:{state:'not_found',message:'列表未找到，不等于发布失败',checkedAt:new Date().toISOString()}}});
    await until(()=>document.querySelector('[data-result-check=not_found]'),'precise refresh reason on original row');
    assert.equal(activeQueue.jobs[0].stage,'unknown');assert.equal(activeQueue.jobs[1].stage,'unknown');
    const unresolvedRow=document.querySelector(`[data-publish-job="${unknownRows[0].id}"]`);
    assert.match(unresolvedRow.textContent,/核对已结束，结果未确认/);assert.match(unresolvedRow.querySelector('[data-result-next-step]').textContent,/不会无限轮询/);
    const resolutionButton=[...unresolvedRow.querySelectorAll('button')].find(button=>button.textContent==='本人核实未发布');assert.ok(resolutionButton);assert.equal(resolutionButton.closest('details'),null);
    activeQueue.operationReceipt({...returned[0],status:'failed',clicked:true,message:'本条官网明确发布失败',verification:{state:'rejected',message:'明确失败',checkedAt:new Date().toISOString()}});
    await until(()=>[...unresolvedRow.querySelectorAll('button')].some(button=>button.textContent==='重发'),'definite failure immediately exposes retry');
    activeQueue.operationReceipt({...returned[0],status:'unknown',message:'Late unknown'});assert.equal(activeQueue.jobs[0].stage,'failed');assert.equal(autoUploads,2);assert.equal(autoCoverCalls,1);
    refreshResolvers.get('qa-refresh-1')({receipt:{...returned[1],status:'confirmed',message:'发布成功',verification:{state:'confirmed',message:'已在官网确认',checkedAt:new Date().toISOString()}}});
    await until(()=>activeQueue.jobs[1].stage==='confirmed','verified success returns to original row');
    assert.equal(activeQueue.jobs.length,2);assert.equal(autoUploads,2);assert.equal(autoCoverCalls,1);
    // Newly required settings must be independent and propagate to a SAME-row
    // retry. Invalid choices still block before recovery; empty legacy settings
    // use the visible publisher-requested default, not an extra manual step.
    mounted=false;let restores=0,preparedDeclaration;
    const biliRows=unknownRows.map((job,index)=>({...job,id:'qa-bili-required-'+index,platform:'bilibili',stage:'failed',submission:'user_confirmed_absent',config:{...job.config,covers:[],extras:index===0?{创作声明:'未核实选项'}:{}},recoveryId:'qa-recovery-'+index}));
    fetchedAccounts=biliRows.map(job=>({id:job.accountId,nickname:job.nickname,platform:'bilibili',connectorSessionId:'qa-session-'+job.accountId}));
    const untouchedBili=JSON.stringify(biliRows[1]);
    activeQueue=createPublishQueue({current:()=>true,changed:()=>{if(mounted)render();},sleep:async()=>{},
      prepare:async request=>{preparedDeclaration=request.config.extras.创作声明;return{accountId:request.account.id};},
      upload:async()=>({uploadStarted:true}),progress:async()=>({ready:true}),fill:async()=>({unresolved:[]}),inspect:async()=>({nonce:'qa-bili-only',candidates:[{index:0}]}),
      submit:async entries=>({results:entries.map(entry=>({accountId:entry.accountId,receipt:{id:'qa-bili-published',status:'confirmed',message:'fixture success'}}))})},biliRows);
    window.matrixDesktop={restorePublishMedia:async()=>{restores++;return{selection:{id:'qa-restored-only',mediaType:'video',files:[{name:'qa.mp4',size:10}]},covers:[]};}};
    mounted=true;render();await until(()=>document.querySelectorAll('select[aria-label^="重发创作声明 "]').length===2,'two independent required retry settings');
    const declarations=()=>[...document.querySelectorAll('select[aria-label^="重发创作声明 "]')],firstRetry=()=>[...document.querySelector(`[data-publish-job="${biliRows[0].id}"]`).querySelectorAll('button')].find(button=>button.textContent==='重发');
    expectedError=true;firstRetry().click();await until(()=>expectedErrors.length===1,'invalid declaration blocks before media recovery');expectedError=false;
    assert.match(expectedErrors[0],/创作声明/);assert.equal(restores,0);assert.equal(activeQueue.jobs[0].stage,'failed');assert.equal(preparedDeclaration,undefined);
    const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;setter.call(declarations()[0],'含AI生成内容');declarations()[0].dispatchEvent(new Event('change',{bubbles:true}));
    await until(()=>declarations()[0].value==='含AI生成内容','first retry setting updated');assert.equal(declarations()[1].value,'内容无需标注');assert.deepEqual(activeQueue.jobs[0].config.extras,{创作声明:'未核实选项'});
    firstRetry().click();await until(()=>activeQueue.jobs[0].stage==='confirmed','original Bilibili row retried with explicit declaration');
    assert.equal(preparedDeclaration,'含AI生成内容');assert.equal(restores,1);assert.equal(activeQueue.jobs[0].id,biliRows[0].id);assert.equal(activeQueue.jobs[0].config.extras.创作声明,'含AI生成内容');assert.equal(activeQueue.jobs.length,2);assert.equal(JSON.stringify(activeQueue.jobs[1]),untouchedBili);
    const firstCompletedBili=JSON.stringify(activeQueue.jobs[0]);
    const secondRetry=[...document.querySelector(`[data-publish-job="${biliRows[1].id}"]`).querySelectorAll('button')].find(button=>button.textContent==='重发');
    secondRetry.click();await until(()=>activeQueue.jobs[1].stage==='confirmed','legacy empty declaration retries without manual dropdown');
    assert.equal(preparedDeclaration,'内容无需标注');assert.equal(restores,2);assert.equal(activeQueue.jobs.length,2);assert.equal(activeQueue.jobs[1].id,biliRows[1].id);assert.equal(activeQueue.jobs[1].config.extras.创作声明,'内容无需标注');assert.equal(JSON.stringify(activeQueue.jobs[0]),firstCompletedBili);
    // Paused tasks are a real row state, not a retry/extra attempt or an
    // automatic upload. Clicking one row must not start its paused sibling.
    mounted=false;let pausedUploads=0;
    activeQueue=createPublishQueue({current:()=>true,changed:()=>{if(mounted)render();},sleep:async()=>{},prepare:async r=>({accountId:r.account.id}),upload:async()=>{pausedUploads++;return{uploadStarted:true};},fill:async()=>({unresolved:[]}),progress:async()=>({ready:true}),inspect:async()=>({nonce:'qa-paused',candidates:[{index:0}]}),submit:async entries=>({results:entries.map(entry=>({accountId:entry.accountId,receipt:{id:'qa-paused-success',status:'confirmed',message:'fixture success'}}))})});
    const pausedRequests=[request('qa-paused-one'),request('qa-paused-two')];fetchedAccounts=pausedRequests.map(r=>r.account);activeQueue.start(pausedRequests,{batchName:'界面暂停测试',initialState:'paused'});
    const pausedId=activeQueue.jobs[0].id,pausedAttempt=activeQueue.jobs[0].attemptId,pausedSibling=JSON.stringify(activeQueue.jobs[1]);
    mounted=true;render();await until(()=>document.querySelectorAll('button').length && [...document.querySelectorAll('button')].filter(b=>b.textContent==='开始发布').length===2,'two paused row actions');
    assert.equal(pausedUploads,0);assert.equal(activeQueue.running,false);assert.ok([...document.querySelector('[aria-label="批次筛选"]').options].some(option=>option.textContent.includes('界面暂停测试')));
    [...document.querySelector(`[data-publish-job="${pausedId}"]`).querySelectorAll('button')].find(b=>b.textContent==='开始发布').click();await until(()=>activeQueue.jobs[0].stage==='confirmed','real paused row explicitly started');
    assert.equal(pausedUploads,1);assert.equal(activeQueue.jobs[0].id,pausedId);assert.equal(activeQueue.jobs[0].attemptId,pausedAttempt);assert.equal(JSON.stringify(activeQueue.jobs[1]),pausedSibling);
    delete window.matrixDesktop;fetchedAccounts=undefined;
    return {phaseUiChecks:78,definiteFailureImmediatelyRetryable:true,resolutionVisibleOutsideMoreMenu:true,completedUncertainCheckNotShownAsEndlessWaiting:true,recentOfficialUploadProgressVisible:true,currentStageOnlyInList:true,fullHistoryOnlyInDetail:true,realReactQueueAndDetail:true,independentResultRefresh:true,preciseRefreshReasonRendered:true,draftCleanupWarningAndExportIndependentOfPublishSuccess:true,followupAndPinIndependentInDetailAndExport:true,automaticCoverRowAction:true,explicitSameRowRetryDeclaration:true,emptyDeclarationUsesVisibleDefault:true,invalidDeclarationBlocksBeforeRecovery:true,pausedRowExplicitSameRecordStart:true,sameRowNoReupload:true,otherAccountUnchanged:true,oldAttemptNotMixed:true,localPreviewNotPlatformEvidence:true,realPlatformActions:false};
  } finally {mounted=false;component.unmount();}
}
module.exports={runPhaseUiTests};
