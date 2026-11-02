// Synthetic receipts exercise the shared rule and the real queue. No platform calls.
const assert=require('node:assert/strict');
const {normalizePublishAcceptance:normalize,pendingReview}=require('../desktop/publish-acceptance.cjs');
const {createPublishQueue,recoverPublishJobs,canRetryPublishJob,publishOutcomeLabel,publishReviewLabel}=require('./qa-load-typescript.cjs').loadTs('client/src/components/workspace/publish-queue.ts');
const at='2026-10-28T04:00:00.000Z';
const base={id:'fixture-receipt-001',kind:'publish',accountId:'fixture-account-001',platform:'douyin',taskId:'fixture-task-001',attemptId:'fixture-attempt-001',status:'unknown',acceptedAt:at,resultSource:'official_work_list',verification:{state:'processing',message:'审核中',checkedAt:at},evidence:{statusText:'审核中'}};
let checks=0;
for(const platform of ['douyin','xiaohongshu','bilibili','wechat']){
 const accepted=normalize({...base,platform});assert.equal(accepted.status,'confirmed');assert.equal(accepted.verification.state,'processing');assert.equal(accepted.completedAt,at);assert(pendingReview(accepted));checks+=4;
}
for(const state of ['uploading','transcoding','unknown']){const row={...base,acceptedAt:undefined,verification:{state}};assert.equal(normalize(row),row);checks++;}
const comment={...base,kind:'comments'};assert.equal(normalize(comment),comment);checks++;
for(const statusText of ['审核未通过：具体原因','审核失败','审核驳回','稿件退回']){
 const row=normalize({...base,status:'failed',acceptedAt:undefined,verification:{...base.verification,state:'rejected'},evidence:{statusText}});assert.equal(row.status,'confirmed');assert.equal(row.verification.state,'rejected');assert.equal(row.evidence.statusText,statusText);checks+=3;
}
for(const statusText of ['发布失败','上传失败','未通过']){assert.equal(normalize({...base,status:'failed',verification:{state:'rejected'},evidence:{statusText}}).status,'failed');checks++;}
let sends=0,uploads=0,followups=0,drafts=0;
const job={id:base.taskId,attemptId:base.attemptId,receiptId:base.id,batchId:'fixture-batch-001',accountId:base.accountId,platform:'douyin',nickname:'Fixture',title:'Fixture video',files:['fixture.mp4'],config:{title:'Fixture video',body:'Fixture body',topics:[],comment:'Fixture followup',options:{}},createdAt:at,updatedAt:at,stage:'unknown',message:'Waiting',submission:'uncertain',history:[]};
const queue=createPublishQueue({current:()=>true,changed:()=>{},prepare:async()=>{},upload:async()=>uploads++,submit:async()=>sends++,followup:async()=>followups++,completedDraft:()=>drafts++},[job]);
queue.operationReceipt(normalize(base));assert.equal(queue.jobs[0].stage,'confirmed');assert.equal(publishOutcomeLabel(queue.jobs[0]),'发布成功');assert.equal(publishReviewLabel(queue.jobs[0]),'待审核');assert.equal(canRetryPublishJob(queue.jobs[0]),false);checks+=4;
queue.operationReceipt({...base,acceptedAt:undefined,status:'unknown',message:'Late timeout'});assert.equal(queue.jobs[0].stage,'confirmed');checks++;
queue.operationReceipt(normalize({...base,status:'failed',verification:{state:'rejected',message:'需申诉',checkedAt:at},evidence:{statusText:'审核未通过：需申诉'}}));assert.equal(queue.jobs[0].stage,'confirmed');assert.equal(publishReviewLabel(queue.jobs[0]),'审核未通过');assert.equal(canRetryPublishJob(queue.jobs[0]),false);assert.equal(recoverPublishJobs(queue.jobs)[0].verification.state,'rejected');checks+=4;
assert.equal(sends+uploads+followups+drafts,0);checks++;queue.dispose();
const restored=recoverPublishJobs([{...job,acceptedAt:at,verification:base.verification}])[0];assert.equal(restored.stage,'confirmed');assert.equal(restored.verification.state,'processing');checks+=2;
console.log(JSON.stringify({publicationAcceptanceChecks:checks,moderationSeparate:true,uploadAloneNotSuccess:true,noRealPlatformActions:true}));
