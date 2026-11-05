const assert = require('node:assert/strict');
const {publishJobTiming}=require('./qa-load-typescript.cjs').loadTs('client/src/components/workspace/publish-timing.ts');
const { createPublishQueue, recoverPublishJobs, activePublishStages, canRetryPublishJob, publishOutcomeLabel } = require('./qa-load-typescript.cjs').loadTs('client/src/components/workspace/publish-queue.ts');
const item = id => ({ account: { id, nickname: 'QA ' + id, platform: 'xiaohongshu', connectorSessionId: 'qa-session-' + id }, config: { title: '标题', body: '正文', topics: [], comment: '', options: {} }, media: { id: 'opaque-handle', mediaType: 'image', files: [{ name: 'fixture.png', size: 1 }] } });
const tick = () => new Promise(resolve => setImmediate(resolve));
async function done(queue) { for (let i = 0; i < 1000 && queue.running; i++) await tick(); assert.equal(queue.running, false); }
function fixture(overrides = {}) {
  const calls = { uploads: 0, submits: 0, followups: 0, snapshots: [] };
  const deps = {
    current: () => true, changed: jobs => calls.snapshots.push(jobs), sleep: tick,
    prepare: async request => ({ accountId: request.account.id }),
    upload: async () => { calls.uploads++; return { uploadStarted: true }; },
    fill: async () => ({ filled: ['title', 'body'], unresolved: [] }),
    progress: async () => ({ ready: true }),
    inspect: async () => ({ nonce: 'fixture', candidates: [{ index: 0 }] }),
    submit: async entries => { calls.submits++; return { results: entries.map(entry => ({ accountId: entry.accountId, receipt: { id: entry.accountId, status: 'confirmed', message: '发布成功' } })) }; },
    followup: async () => { calls.followups++; }, ...overrides,
  };
  return { calls, deps, queue: createPublishQueue(deps) };
}
(async () => {
  let checks = 0;
  {
    const realTimer=global.setTimeout,limits=[];
    global.setTimeout=(fn,ms,...args)=>{limits.push(ms);return realTimer(fn,ms,...args);};
    const q=fixture();try{const request=item('slow-bili-tag');request.account.platform='bilibili';request.media.mediaType='video';request.media.files[0].name='fixture.mp4';request.config.extras={'创作声明':'内容无需标注'};q.queue.start([request]);await done(q.queue);assert.equal(limits.includes(95000),true);assert.equal(q.queue.jobs[0].stage,'confirmed');checks+=2;}finally{global.setTimeout=realTimer;q.queue.dispose();}
  }
  {
    const review=fixture({submit:async entries=>({results:entries.map(entry=>({accountId:entry.accountId,receipt:{id:'review-followup',kind:'publish',accountId:entry.accountId,platform:'bilibili',taskId:entry.taskId,attemptId:entry.attemptId,status:'confirmed',message:'Accepted',verification:{state:'processing',message:'Review pending',checkedAt:new Date().toISOString()}}}))})});
    const originalSubmit=review.deps.submit;review.deps.submit=async(...args)=>{review.calls.submits++;return originalSubmit(...args);};
    review.deps.followup=async()=>{review.calls.followups++;return{status:'confirmed',message:'Original comment confirmed',commentId:'fixture-only'};};
    const request=item('moderation-comment');request.account.platform='bilibili';request.config.comment='Original configured comment';request.config.extras={'创作声明':'内容无需标注'};request.media.mediaType='video';request.media.files[0].name='fixture.mp4';review.queue.start([request]);await done(review.queue);
    const job=review.queue.jobs[0];assert.equal(job.stage,'confirmed');assert.equal(review.calls.followups,0);assert.match(job.followup.message,/审核/);
    const approved={id:job.receiptId,kind:'publish',accountId:job.accountId,platform:job.platform,taskId:job.id,attemptId:job.attemptId,status:'confirmed',message:'Approved',verification:{state:'confirmed',message:'Approved',checkedAt:new Date().toISOString()}};
    review.queue.operationReceipt(approved);for(let i=0;i<20&&review.queue.followupsRunning;i++)await tick();
    assert.equal(review.calls.followups,1);assert.equal(review.queue.jobs[0].followup.status,'confirmed');review.queue.operationReceipt(approved);await tick();assert.equal(review.calls.followups,1);assert.equal(review.calls.uploads,1);assert.equal(review.calls.submits,1);checks+=8;review.queue.dispose();
  }
  let f = fixture(); const request = item('a'); f.queue.start([request]); request.config.title = 'changed after enqueue';
  assert.throws(() => f.queue.start([item('b')])); await done(f.queue);
  assert.equal(f.queue.jobs[0].title, '标题'); assert.equal(f.queue.jobs[0].stage, 'confirmed'); assert.equal(f.calls.uploads, 1); assert.equal(f.calls.submits, 1); checks += 5;
  assert.ok(f.queue.jobs[0].history.some(step=>step.stage==='submitting'));assert.ok(!f.queue.jobs[0].history.some(step=>step.stage==='confirming'));checks+=2;
  const pending={stage:'unknown',verification:{state:'processing',message:'审核中',checkedAt:new Date().toISOString()}};
  assert.equal(publishOutcomeLabel(pending),'平台处理中，结果待核对');assert.equal(publishOutcomeLabel({...pending,acceptedAt:new Date().toISOString()}),'投稿成功，等待审核');assert.equal(publishOutcomeLabel({...pending,verification:{...pending.verification,state:'not_found'}}),'核对已结束，结果未确认');checks+=3;
  const acceptance=fixture({submit:async entries=>({results:entries.map(entry=>({accountId:entry.accountId,receipt:{id:'qa-accepted',kind:'publish',accountId:entry.accountId,taskId:entry.taskId,attemptId:entry.attemptId,status:'unknown',acceptedAt:new Date().toISOString(),message:'等待审核',verification:pending.verification}}))})});acceptance.queue.start([item('qa-accepted')]);await done(acceptance.queue);const acceptedJob=acceptance.queue.jobs[0];assert.equal(publishOutcomeLabel(acceptedJob),'投稿成功，等待审核');assert.equal(canRetryPublishJob(acceptedJob),false);acceptance.queue.verificationFailed(acceptedJob.id,acceptedJob.attemptId,'读取超时');assert.equal(publishOutcomeLabel(acceptance.queue.jobs[0]),'投稿成功，等待审核');assert.equal(recoverPublishJobs(acceptance.queue.jobs)[0].acceptedAt,acceptedJob.acceptedAt);checks+=4;
  assert.ok(!JSON.stringify(f.queue.jobs).includes('opaque-handle')); assert.equal(f.queue.jobs[0].uploadPercent, undefined); checks += 2;
  f = fixture({ progress: async () => ({ ready: true, uploadPercent: 100 }) }); f.queue.start([item('a')]); await done(f.queue); assert.ok(f.calls.snapshots.some(jobs => jobs[0].uploadPercent === 100)); checks++;
  f = fixture({ fill: async () => ({ filled: ['title'], unresolved: ['封面'] }) }); const batch = f.queue.start([item('a'), item('b')]); await done(f.queue);
  assert.ok(f.queue.jobs.every(job => job.stage === 'attention')); assert.equal(f.calls.submits, 0); assert.throws(() => f.queue.start([item('a')]));
  f.queue.resume(batch); await done(f.queue); assert.equal(f.calls.uploads, 2); assert.ok(f.queue.jobs.every(job => job.stage === 'confirmed')); checks += 5;
  f = fixture({ inspect: async () => ({ error: 'Required field missing' }) }); f.queue.start([item('a'), item('b')]); await done(f.queue); assert.ok(f.queue.jobs.every(job => job.stage === 'attention')); assert.ok(!f.queue.jobs.some(job => activePublishStages.includes(job.stage))); checks += 2;
  f = fixture({ submit: async () => ({ results: [{ accountId: 'a', receipt: { id: 'receipt', status: 'unknown', message: 'pending verification' } }], remaining: ['b'] }) }); const unknownBatch = f.queue.start([item('a'), item('b')]); await done(f.queue);
  assert.equal(f.queue.jobs[0].stage, 'unknown'); assert.equal(f.queue.jobs[1].stage, 'attention');
  f.deps.submit = async entries => { assert.deepEqual(entries.map(e => e.accountId), ['b']); return { results: [{ accountId: 'b', receipt: { status: 'confirmed', message: 'success' } }] }; };
  f.queue.resume(unknownBatch); await done(f.queue); assert.equal(f.queue.jobs[0].stage, 'unknown'); assert.equal(f.queue.jobs[1].stage, 'confirmed'); checks += 5;
  f = fixture({ submit: async () => { throw Error('IPC lost'); } }); f.queue.start([item('a')]); await done(f.queue); assert.equal(f.queue.jobs[0].stage, 'unknown'); assert.equal(f.queue.canResume(f.queue.jobs[0].batchId), false); checks += 2;
  let resolvePrepare; f = fixture({ prepare: () => new Promise(resolve => { resolvePrepare = resolve; }) }); f.queue.start([item('a'), item('b')]); f.queue.stop(); resolvePrepare({ accountId: 'a' }); await done(f.queue);
  assert.equal(f.calls.uploads, 0); assert.ok(f.queue.jobs.every(job => job.stage === 'cancelled')); checks += 2;
  let current = true; f = fixture({ current: () => current, upload: async () => { current = false; return { uploadStarted: true }; } }); f.queue.start([item('a')]); await done(f.queue); assert.equal(f.calls.submits, 0); assert.equal(f.queue.jobs[0].stage, 'cancelled'); checks += 2;
  f = fixture(); const follow = item('a'); follow.config.comment = 'followup'; f.queue.start([follow]); await done(f.queue); assert.equal(f.calls.followups, 1); checks++;
  f = fixture({ submit: async () => ({ cancelled: true }) }); const cancelBatch = f.queue.start([item('a')]); await done(f.queue); assert.equal(f.queue.jobs[0].stage, 'attention'); f.queue.discard(cancelBatch); assert.equal(f.queue.canResume(cancelBatch), false); assert.equal(f.queue.jobs[0].stage, 'cancelled'); checks += 3;
  const recovery = recoverPublishJobs([{ ...f.queue.jobs[0], stage: 'submitting' }, null, { id: 'invalid' }]); assert.equal(recovery.length, 1); assert.equal(recovery[0].stage, 'interrupted'); assert.deepEqual(recoverPublishJobs({}), []); checks += 3;
  f = fixture(); f.queue.startMany([[item('a'), item('b')], [item('a')]]); await done(f.queue); assert.equal(f.calls.uploads, 3); assert.equal(f.calls.submits, 2); assert.ok(f.queue.jobs.every(job => job.stage === 'confirmed')); checks += 3;
  for (const mediaType of ['video', 'image']) {
    const requestFor = (id, platform, work) => {
      const request = item(id);
      request.account.platform = platform;
      request.media = { id: work, mediaType, files: [{ name: work + (mediaType === 'video' ? '.mp4' : '.jpg'), size: 10 }] };
      return request;
    };
    let releaseSlow;
    const prepared = [], uploaded = [], submitted = [];
    const slow = new Promise(resolve => { releaseSlow = resolve; });
    f = fixture({
      prepare: async request => { prepared.push(request.account.id); if (request.account.id === 'slow') await slow; return { accountId: request.account.id }; },
      upload: async (input, media) => { uploaded.push([input.accountId,media.mediaType,media.id]); return { uploadStarted: true }; },
      submit: async entries => {
        const ids = entries.map(entry => entry.accountId);
        submitted.push(ids);
        return { results: ids.map(id => ({ accountId:id, receipt:{id,status:id==='slow'?'unknown':'confirmed',message:'fixture'} })) };
      },
    });
    f.queue.startMany([[requestFor('slow','xiaohongshu','work-one'),requestFor('same','xiaohongshu','work-one'),requestFor('fast','douyin','work-one')],[requestFor('fast','douyin','work-two')]]);
    for (let i=0;i<100&&!submitted.length;i++) await tick();
    assert.deepEqual(prepared,['slow','fast']);
    assert.deepEqual(submitted,[['fast']]);
    assert.deepEqual(uploaded,[['fast',mediaType,'work-one']]);
    releaseSlow();
    await done(f.queue);
    assert.deepEqual(submitted,[['fast'],['slow','same']]);
    assert.deepEqual(uploaded,[['fast',mediaType,'work-one'],['slow',mediaType,'work-one'],['same',mediaType,'work-one']]);
    assert.deepEqual(f.queue.jobs.map(job=>job.stage),['unknown','confirmed','confirmed','cancelled']);
    checks+=6;
  }
  f = fixture({ submit: async entries => ({ results: [{ accountId: entries[0].accountId, receipt: { status: 'failed', message: '发布失败' } }] }) }); f.queue.startMany([[item('a')], [item('a')]]); await done(f.queue); assert.equal(f.calls.uploads, 1); assert.equal(f.queue.jobs[1].stage, 'cancelled');
  const failedId = f.queue.jobs[0].id; f.deps.submit = async entries => ({ results: entries.map(entry => ({ accountId: entry.accountId, receipt: { id: 'success', status: 'confirmed', message: '发布成功' } })) });
  f.queue.retry(failedId); await done(f.queue); assert.equal(f.queue.jobs.length, 2); assert.equal(f.queue.jobs[0].stage, 'confirmed'); assert.equal(f.queue.jobs[0].id, failedId); assert.equal(f.queue.jobs[0].attempts[0].stage, 'failed'); checks += 6;
  const job = f.queue.jobs[0], receipt = { id: 'comment', taskId: job.id,attemptId:job.attemptId, accountId: job.accountId, platform: job.platform, kind: 'comments', status: 'failed', message: '追评失败' };
  f.queue.operationReceipt({...receipt,attemptId:'old-attempt',status:'confirmed'});assert.equal(f.queue.jobs[0].followup,undefined);checks++;
  f.queue.operationReceipt(receipt); assert.equal(f.queue.jobs[0].stage, 'confirmed'); assert.equal(f.queue.jobs[0].followup.status, 'failed');
  f.queue.operationReceipt({ ...receipt, id: 'withdraw', kind: 'withdraw', status: 'confirmed', message: '已下架' }); assert.equal(f.queue.jobs[0].stage, 'confirmed'); assert.equal(f.queue.jobs[0].followup.status, 'failed'); assert.equal(f.queue.jobs[0].withdrawal.status, 'confirmed'); checks += 5;
  f.queue.operationReceipt({ ...receipt, accountId: 'foreign', status: 'confirmed' }); assert.equal(f.queue.jobs[0].followup.status, 'failed');
  f.queue.remove(job.id); assert.ok(!f.queue.jobs.some(item => item.id === job.id)); assert.equal(f.calls.uploads, 2); checks += 3;
  f = fixture({ fill: async () => ({ filled: ['title'], unresolved: ['音乐：QA 指定曲目（请在官方表单选择并核对）'] }) });
  const advanced = item('advanced'); advanced.config.extras = { 音乐: 'QA 指定曲目' }; advanced.config.covers = [{ id: 'cover-handle', name: 'QA-cover.png', index: 1 }]; advanced.config.schedule = { mode: 'official', at: '2099-01-01T12:00' };
  f.queue.start([advanced]); advanced.config.extras.音乐 = 'later edit'; await done(f.queue);
  assert.equal(f.queue.jobs[0].stage, 'attention'); assert.equal(f.calls.submits, 0); assert.equal(f.queue.jobs[0].config.extras.音乐, 'QA 指定曲目');
  assert.ok(f.queue.jobs[0].message.includes('QA-cover.png')); assert.ok(f.queue.jobs[0].message.includes('2099-01-01T12:00')); assert.ok(f.queue.jobs[0].message.includes('QA 指定曲目')); checks += 6;
  let attempts = 0;
  f = fixture({ upload: async () => ++attempts < 3 ? { error: 'Could not find node with given id', uploadStarted: false } : { uploadStarted: true } });
  f.queue.start([item('recovered')]); await done(f.queue);
  assert.equal(attempts, 3); assert.equal(f.queue.jobs[0].stage, 'confirmed'); assert.equal(f.queue.jobs[0].autoRetries, 2); checks += 3;
  attempts = 0;
  let loadingMediaPolls=0;
  f = fixture({ progress: async () => ({ mediaReady: ++loadingMediaPolls>2, processing:loadingMediaPolls<=2, ready: attempts>0 }), fill: async () => {assert.ok(loadingMediaPolls>2);attempts++;return { filled:['title','body','visibility'],unresolved:[] };}, inspect: async input => { assert.equal(input.expectedVisibility,'仅自己可见');return {nonce:'private',candidates:[{index:0}]}; } });
  const privateLoading=item('loading-private');privateLoading.config.options.visibility='仅自己可见';f.queue.start([privateLoading]);await done(f.queue);
  assert.equal(attempts,1);assert.equal(f.calls.uploads,1);assert.equal(f.calls.submits,1);assert.equal(f.queue.jobs[0].stage,'confirmed');checks += 5;
  attempts=0;
  f=fixture({fill:async()=>{attempts++;return{unresolved:['title：未唯一识别官方控件','visibility：请在官方表单选择并确认 仅自己可见']};}});
  f.queue.start([privateLoading]);await done(f.queue);
  assert.equal(attempts,1);assert.equal(f.calls.submits,0);assert.equal(f.queue.jobs[0].stage,'attention');assert.match(f.queue.jobs[0].message,/标题：未唯一识别官方控件/);assert.match(f.queue.jobs[0].message,/可见范围/);checks+=5;
  attempts = 0;
  f = fixture({ upload: async () => { attempts++; return { error: 'Could not find node with given id', uploadStarted: false }; } });
  f.queue.start([item('failed-before-submit')]); await done(f.queue);
  assert.equal(attempts, 3); assert.equal(f.queue.jobs[0].stage, 'failed'); assert.equal(f.queue.jobs[0].submission, 'not_submitted'); assert.ok(canRetryPublishJob(f.queue.jobs[0])); assert.equal(f.calls.submits, 0); checks += 5;
  const priorFailure = f.queue.jobs[0]; f.deps.upload = async () => ({ uploadStarted: true }); f.queue.retry(priorFailure.id); await done(f.queue);
  assert.equal(f.queue.jobs.length, 1); assert.equal(f.queue.jobs[0].stage, 'confirmed'); assert.equal(f.queue.jobs[0].id, priorFailure.id); checks += 3;
  attempts = 0;
  f = fixture({ fill: async () => ++attempts < 3 ? { error: 'Execution context was destroyed' } : { filled: ['title','body'], unresolved: [] } });
  f.queue.start([item('fill-recover')]); await done(f.queue);
  assert.equal(f.calls.uploads, 1); assert.equal(attempts, 3); assert.equal(f.queue.jobs[0].stage, 'confirmed'); checks += 3;
  attempts = 0;
  f = fixture({ upload: async () => { attempts++; return { error: '需本人完成验证码', uploadStarted: false }; } }); f.queue.start([item('verify')]); await done(f.queue);
  assert.equal(attempts, 1); assert.equal(f.queue.jobs[0].stage, 'attention'); assert.equal(canRetryPublishJob(f.queue.jobs[0]), false); checks += 3;
  attempts = 0;
  f = fixture({ upload: async () => { attempts++; return { uploadStarted: true, error: 'Execution context was destroyed after handoff' }; } }); f.queue.start([item('handoff')]); await done(f.queue);
  assert.equal(attempts, 1); assert.equal(f.queue.jobs[0].stage, 'attention'); assert.equal(f.calls.submits, 0); checks += 3;
  f = fixture({ submit: async () => ({ error: 'IPC interruption after submit' }) }); f.queue.start([item('unknown')]); await done(f.queue);
  assert.equal(f.queue.jobs[0].stage, 'unknown'); assert.equal(canRetryPublishJob(f.queue.jobs[0]), false); assert.throws(() => f.queue.retry(f.queue.jobs[0].id)); assert.equal(f.calls.uploads, 1); checks += 4;
  const old = { ...priorFailure, submission: undefined, stage: 'attention', message: 'Could not find node with given id', history: [{ stage: 'uploading', message: 'upload', at: new Date().toISOString() }] };
  const migrated = recoverPublishJobs([old, { ...old, id: 'possibly-submitted', history: [...old.history, { stage:'confirming', message:'confirm', at:new Date().toISOString() }] }]);
  assert.equal(migrated[0].stage, 'failed'); assert.ok(canRetryPublishJob(migrated[0])); assert.equal(migrated[1].stage, 'attention'); assert.equal(canRetryPublishJob(migrated[1]), false); checks += 4;
  const orphaned = recoverPublishJobs([{...old,submission:'not_submitted',message:'封面已交付，等待裁剪确认超时'},{...old,id:'uncertain-orphan',submission:'uncertain',message:'等待官方结果'},{...old,id:'confirmed-history',submission:'not_submitted',history:[...old.history,{stage:'confirming'}]}]);
  assert.equal(orphaned[0].stage,'failed');assert.equal(orphaned[0].id,old.id);assert.equal(canRetryPublishJob(orphaned[0]),true);assert.equal(canRetryPublishJob(orphaned[1]),false);assert.equal(canRetryPublishJob(orphaned[2]),false);checks+=5;
  for(const stage of ['cancelled','interrupted']){assert.equal(canRetryPublishJob({...old,stage,submission:'not_submitted'}),true);assert.equal(canRetryPublishJob({...old,stage,submission:'uncertain'}),false);checks+=2;}
  assert.equal(canRetryPublishJob({...old,stage:'cancelled',submission:'not_submitted',history:[{stage:'submitting'}]}),false);assert.equal(canRetryPublishJob({...old,stage:'interrupted',submission:'not_submitted',receiptId:'uncertain-receipt'}),false);checks+=2;
  f = fixture({ remember: async () => ({ recoveryId:'local-source', thumbnail:'data:image/jpeg;base64,AA==' }) }); const thumbItem = item('preview'); thumbItem.account.avatarUrl = 'https://example.com/avatar.jpg'; f.queue.start([thumbItem]); await done(f.queue);
  assert.equal(f.queue.jobs[0].recoveryId, 'local-source'); assert.equal(f.queue.jobs[0].thumbnail,'data:image/jpeg;base64,AA=='); assert.equal(f.queue.jobs[0].avatarUrl,'https://example.com/avatar.jpg'); assert.ok(!JSON.stringify(f.queue.jobs).includes('/test/')); checks += 4;
  f = fixture({ submit: async () => ({ results: [] }) }); f.queue.start([item('missing-receipt')]); await done(f.queue);
  assert.equal(f.queue.jobs[0].stage,'unknown'); assert.equal(f.queue.canResume(f.queue.jobs[0].batchId),false); assert.equal(canRetryPublishJob(f.queue.jobs[0]),false); checks += 3;
  // User-requested retries have independent pending groups and row locks.
  const retrySeed = ['a','b','c'].map((id,index)=>({ id:'old-'+id,batchId:'old-batch-'+id,accountId:id,nickname:'QA '+id,platform:'xiaohongshu',title:'Old '+id,files:['fixture.png'],stage:'failed',submission:'not_submitted',message:'old failure',createdAt:new Date(1700000000000+index).toISOString(),updatedAt:new Date().toISOString(),history:[] }));
  f=fixture();f.queue=createPublishQueue(f.deps,retrySeed);
  const nativePublish={id:'native-receipt',kind:'publish',taskId:'old-a',accountId:'a',platform:'xiaohongshu',status:'unknown',message:'官方提交后需核对'};
  f.queue.operationReceipt(nativePublish);assert.equal(f.queue.jobs[0].stage,'unknown');assert.equal(canRetryPublishJob(f.queue.jobs[0]),false);assert.deepEqual(f.queue.jobs[1],retrySeed[1]);checks += 3;
  f.queue.operationReceipt({...nativePublish,accountId:'foreign',status:'confirmed'});assert.equal(f.queue.jobs[0].stage,'unknown');checks++;
  f.queue.operationReceipt({...nativePublish,status:'confirmed',message:'官方明确成功',completedAt:'2026-10-13T08:14:20.421Z'});assert.equal(f.queue.jobs[0].stage,'confirmed');assert.equal(f.queue.jobs[0].submission,'confirmed');assert.equal(f.queue.jobs[0].completedAt,'2026-10-13T08:14:20.421Z');checks += 3;
  f.queue.operationReceipt(nativePublish);assert.equal(f.queue.jobs[0].stage,'confirmed');checks++;
  let releaseFirst;
  f = fixture({ prepare: request => request.account.id==='a' ? new Promise(resolve=>{releaseFirst=resolve}) : Promise.resolve({accountId:request.account.id}), upload:async input=>input.accountId==='a'?{uploadStarted:false,error:'上传失败：QA'}:{uploadStarted:true} });
  f.queue = createPublishQueue(f.deps,retrySeed);
  f.queue.retry('old-a',item('a')); assert.equal(f.queue.running,true);
  f.queue.retry('old-b',item('b')); f.queue.retry('old-c',item('c'));
  assert.equal(f.queue.activeRetry('old-b').stage,'queued'); assert.throws(()=>f.queue.retry('old-a',item('a'))); assert.equal(f.queue.jobs.length,3); checks += 4;
  assert.deepEqual(f.queue.jobs.map(job=>job.id),retrySeed.map(job=>job.id)); assert.ok(f.queue.jobs.every((job,index)=>job.createdAt===retrySeed[index].createdAt && job.attemptNumber===2)); checks += 2;
  const currentAttempt=f.queue.jobs[0].attemptId;
  f.queue.operationReceipt({...nativePublish,attemptId:'previous-attempt',status:'failed'}); assert.equal(f.queue.jobs[0].attemptId,currentAttempt); assert.notEqual(f.queue.jobs[0].stage,'failed');
  f.queue.operationReceipt({...nativePublish,status:'confirmed'}); assert.notEqual(f.queue.jobs[0].stage,'confirmed');
  f.queue.submittedProgress({batchId:'old-batch-a',accountId:'a',status:'confirmed',message:'stale'}); assert.notEqual(f.queue.jobs[0].stage,'confirmed');checks += 4;
  releaseFirst({accountId:'a'}); await done(f.queue);
  assert.equal(f.queue.jobs.find(j=>j.id==='old-a').stage,'failed'); assert.equal(f.queue.jobs.find(j=>j.id==='old-b').stage,'confirmed'); assert.equal(f.queue.jobs.find(j=>j.id==='old-c').stage,'confirmed'); assert.equal(f.queue.jobs.length,3); checks += 4;
  f.queue.operationReceipt({...nativePublish,attemptId:currentAttempt,status:'confirmed'}); assert.equal(f.queue.jobs[0].stage,'confirmed');checks++;
  let activeUploads=0,maxUploads=0,releaseUpload;
  f = fixture({upload:async()=>{activeUploads++;maxUploads=Math.max(maxUploads,activeUploads);await new Promise(resolve=>{releaseUpload=()=>{activeUploads--;resolve()}});return {uploadStarted:true}}});
  f.queue=createPublishQueue(f.deps,[retrySeed[0],{...retrySeed[1],accountId:'a'}]);
  f.queue.retry('old-a',item('a')); for(let i=0;i<10&&!releaseUpload;i++)await tick();
  f.queue.retry('old-b',item('a')); assert.equal(f.queue.activeRetry('old-b').stage,'queued'); const firstUpload=releaseUpload;releaseUpload=undefined;firstUpload();
  for(let i=0;i<50&&!releaseUpload;i++)await tick();assert.ok(releaseUpload);releaseUpload();await done(f.queue);assert.equal(maxUploads,1);assert.ok(f.queue.jobs.every(j=>j.stage==='confirmed')); assert.equal(f.queue.jobs.length,2); checks += 5;
  // Stalled IPC must release the queue, without replay or late-state writes.
  for (const stage of ['preparing','uploading','filling']) {
    let release;
    const key={preparing:'prepare',uploading:'upload',filling:'fill'}[stage];
    f=fixture({[key]:()=>new Promise(resolve=>{release=resolve}),preparationTimeoutMs:{[stage]:5}});
    f.queue.start([item('stalled-'+stage)]);
    for(let i=0;i<20&&!release;i++)await tick();
    await new Promise(resolve=>setTimeout(resolve,15));await done(f.queue);
    const snapshot=JSON.stringify(f.queue.jobs);
    assert.equal(f.queue.jobs[0].stage,'failed');assert.equal(f.calls.submits,0);
    release(key==='prepare'?{accountId:'stalled-'+stage}:key==='upload'?{uploadStarted:true}:{filled:['title','body'],unresolved:[]});
    await tick();assert.equal(JSON.stringify(f.queue.jobs),snapshot);checks+=3;
  }
  let latePrepare, abortedSignal;
  f=fixture({prepare:(_request,signal)=>{abortedSignal=signal;return new Promise(resolve=>{latePrepare=resolve});}});
  f.queue.start([item('stop-stalled')]);f.queue.stop();await done(f.queue);
  assert.equal(abortedSignal.aborted,true);assert.equal(f.queue.jobs[0].stage,'cancelled');assert.equal(f.calls.uploads,0);
  latePrepare({accountId:'stop-stalled'});await tick();assert.equal(f.calls.uploads,0);checks+=4;
  let firstNever;
  f=fixture({prepare:request=>request.account.id==='a'?new Promise(resolve=>{firstNever=resolve}):Promise.resolve({accountId:request.account.id}),preparationTimeoutMs:{preparing:5}});
  f.queue=createPublishQueue(f.deps,retrySeed);f.queue.retry('old-a',item('a'));f.queue.retry('old-b',item('b'));
  await new Promise(resolve=>setTimeout(resolve,20));await done(f.queue);
  assert.equal(f.queue.jobs[0].stage,'failed');assert.equal(f.queue.jobs[1].stage,'confirmed');firstNever({accountId:'a'});await tick();assert.equal(f.queue.jobs[0].stage,'failed');checks+=3;
  f=fixture({progress:async()=>({ready:false,processing:false}),fill:async()=>({unresolved:['title：未唯一识别官方控件']})});f.queue.start([item('stagnant')]);await done(f.queue);
  assert.equal(f.queue.jobs[0].stage,'failed');assert.match(f.queue.jobs[0].message,/连续无进展/);assert.equal(f.calls.submits,0);checks+=3;
  f=fixture({progress:async()=>{await new Promise(r=>setTimeout(r,2));return{ready:false,processing:true}},preparationTimeoutMs:{uploadingTotal:5}});f.queue.start([item('processing-forever')]);await new Promise(r=>setTimeout(r,20));await done(f.queue);
  assert.equal(f.queue.jobs[0].stage,'failed');assert.match(f.queue.jobs[0].message,/超时/);assert.equal(f.calls.submits,0);assert.ok(canRetryPublishJob(f.queue.jobs[0]));checks+=4;
  let unmeteredMediaPolls=0;
  f=fixture({progress:async()=>({ready:++unmeteredMediaPolls>4,processing:unmeteredMediaPolls<=4})});
  f.queue.start([item('unmetered-media-stage')]);await done(f.queue);
  assert.ok(f.calls.snapshots.some(rows=>rows[0].executionStage==='uploading'&&/官方正在上传或处理素材/.test(rows[0].message)),'Unmetered processing stays in the upload step, not the fill step');
  assert.equal(f.calls.uploads,1);assert.equal(f.calls.submits,1);checks+=3;
  let reviewCalls=0;
  f=fixture({progress:async()=>{if(++reviewCalls>2)await new Promise(r=>setTimeout(r,2));return{ready:reviewCalls<=2,processing:reviewCalls>2}},preparationTimeoutMs:{reviewingTotal:5}});f.queue.start([item('review-forever')]);await new Promise(r=>setTimeout(r,20));await done(f.queue);
  assert.equal(f.queue.jobs[0].stage,'failed');assert.equal(f.queue.jobs[0].submission,'not_submitted');assert.equal(f.calls.submits,0);checks+=3;
  f=fixture({cover:async()=>({error:'封面编辑入口被菜单或弹窗遮挡，未点击其他控件',uploadStarted:false})});const blockedCover=item('blocked-cover');blockedCover.config.covers=[{id:'qa-cover',name:'cover.png',index:1}];f.queue.start([blockedCover]);await done(f.queue);
  assert.equal(f.queue.jobs[0].stage,'failed');assert.equal(canRetryPublishJob(f.queue.jobs[0]),true);assert.equal(f.calls.submits,0);checks+=3;
  assert.equal(f.queue.jobs[0].executionStage,'cover');checks++;
  f=fixture({fill:async()=>({error:'填写控件返回失败'})});f.queue.start([item('phase-fill-failure')]);await done(f.queue);assert.equal(f.queue.jobs[0].executionStage,'filling');assert.equal(f.queue.jobs[0].submission,'not_submitted');checks+=2;
  f=fixture({submit:async()=>({results:[{accountId:'preclick',error:'提交按钮被弹窗遮挡',mayHaveSubmitted:false}]})});f.queue.start([item('preclick')]);await done(f.queue);
  assert.equal(f.queue.jobs[0].stage,'failed');assert.equal(f.queue.jobs[0].submission,'not_submitted');assert.equal(canRetryPublishJob(f.queue.jobs[0]),true);checks+=3;
  f=fixture({submit:async entries=>({results:entries.map(entry=>({accountId:entry.accountId,receipt:{id:'preclick-proof',status:'failed',clicked:false,message:'尚未提交，可重发：提交按钮被弹窗遮挡'}}))})});f.queue.start([item('preclick-proof')]);await done(f.queue);
  assert.equal(f.queue.jobs[0].submission,'not_submitted');assert.ok(canRetryPublishJob(f.queue.jobs[0]));checks+=2;
  f.queue.operationReceipt({id:'preclick-proof-2',kind:'publish',taskId:f.queue.jobs[0].id,accountId:'preclick-proof',platform:'xiaohongshu',attemptId:f.queue.jobs[0].attemptId,status:'failed',clicked:false,message:'before click'});assert.equal(f.queue.jobs[0].submission,'not_submitted');checks++;
  f=fixture({prepare:async()=>{throw Error('请先在当前账号完成官方登录')}});const loginPending=item('login-pending');f.queue.start([loginPending]);await done(f.queue);
  assert.equal(f.queue.jobs[0].stage,'attention');assert.equal(f.queue.jobs[0].executionStage,'preparing');assert.ok(canRetryPublishJob(f.queue.jobs[0]));assert.equal(f.calls.uploads,0);checks+=4;
  f.deps.prepare=async()=>({accountId:'login-pending'});f.queue.retry(f.queue.jobs[0].id,loginPending);await done(f.queue);assert.equal(f.queue.jobs.length,1);assert.equal(f.queue.jobs[0].stage,'confirmed');checks+=2;
  let homeNavigations=0;
  f=fixture({prepare:async()=>{if(++homeNavigations===1)throw Error('视频号官方首页导航超时，尚未上传或提交；请检查网络及官方登录状态');return{accountId:'home-navigation'};}});
  f.queue.start([item('home-navigation')]);await done(f.queue);
  assert.equal(homeNavigations,2);assert.equal(f.calls.uploads,1);assert.equal(f.calls.submits,1);assert.equal(f.queue.jobs.length,1);assert.equal(f.queue.jobs[0].autoRetries,1);checks+=5;
  homeNavigations=0;
  f=fixture({prepare:async()=>{homeNavigations++;throw Error('视频号官方首页导航超时，尚未上传或提交；请检查网络及官方登录状态');}});
  f.queue.start([item('home-navigation-failed')]);await done(f.queue);
  assert.equal(homeNavigations,3);assert.equal(f.calls.uploads,0);assert.equal(f.calls.submits,0);assert.equal(f.queue.running,false);checks+=4;
  assert.equal(canRetryPublishJob({...f.queue.jobs[0],stage:'attention',executionStage:'preparing',submission:'uncertain',receiptId:undefined}),false);assert.equal(canRetryPublishJob({...f.queue.jobs[0],stage:'attention',executionStage:'uploading',submission:'not_submitted',receiptId:undefined}),false);checks+=2;
  const corruptDiagnostic=recoverPublishJobs([{...f.queue.jobs[0],diagnostic:{at:'bad',controls:'not-an-array'}}]);assert.equal(corruptDiagnostic[0].diagnostic,undefined);checks++;
  const boundedDiagnostic=recoverPublishJobs([{...f.queue.jobs[0],diagnostic:{at:new Date().toISOString(),controls:[{},...Array(100).fill('x'.repeat(2000))]}}]);assert.equal(boundedDiagnostic[0].diagnostic.controls.length,35);assert.equal(boundedDiagnostic[0].diagnostic.controls[0].length,700);checks+=2;
  let coverSaved=false, coverCalls=0;
  const requiredCover=item('required-cover');requiredCover.config.covers=[{id:'qa-cover',name:'cover.png',index:1}];
  f=fixture({progress:async()=>({ready:coverSaved,coverReady:true,editorReady:true,processing:false}),cover:async()=>{coverSaved=true;coverCalls++;return{uploadStarted:true,coverConfirmed:true}}});
  f.queue.start([requiredCover]);await done(f.queue);
  assert.equal(f.queue.jobs[0].stage,'confirmed');assert.equal(coverCalls,1);assert.equal(f.calls.uploads,1);assert.equal(f.calls.submits,1);checks+=4;
  assert.ok(f.calls.snapshots.some(rows=>rows[0].message.includes('确认官方封面编辑器就绪')));checks++;
  // Follow the observed Channels transition, including 100% upload followed
  // by processing/generating cover. Neither state authorizes an early cover.
  let mediaPolls=0, afterCoverPolls=0, channelsCoverSaved=false;
  const channelsTrace=[];
  const channelsRequest=item('channels-processing');channelsRequest.account.platform='wechat';channelsRequest.media={id:'qa-channels-video',mediaType:'video',files:[{name:'qa.mp4',size:100}]};channelsRequest.config.covers=[{id:'qa-cover',name:'cover.png',index:1}];
  f=fixture({
    progress:async()=>{
      if (!channelsCoverSaved) { mediaPolls++;return{uploadPercent:100,ready:false,coverReady:mediaPolls>35,editorReady:true,processing:mediaPolls<=35}; }
      afterCoverPolls++;return{uploadPercent:100,ready:true,coverReady:afterCoverPolls>5,editorReady:true,processing:afterCoverPolls<=5};
    },
    cover:async()=>{assert.ok(mediaPolls>35);channelsTrace.push('cover');channelsCoverSaved=true;return{uploadStarted:true,coverConfirmed:true};},
    inspect:async()=>{assert.ok(afterCoverPolls>5);channelsTrace.push('inspect');return{nonce:'qa',candidates:[{index:0}]};},
    submit:async entries=>{channelsTrace.push('submit');return{results:entries.map(entry=>({accountId:entry.accountId,receipt:{id:'channels-fixture',status:'confirmed',message:'发布成功'}}))};},
  });
  f.queue.start([channelsRequest]);await done(f.queue);
  assert.equal(f.queue.jobs[0].stage,'confirmed');assert.deepEqual(channelsTrace,['cover','inspect','submit']);
  assert.equal(f.calls.uploads,1);assert.equal(f.queue.jobs.length,1);assert.equal(f.queue.jobs[0].autoRetries,0);checks+=7;
  // RC45 live attempt 14: the initial editable form can look idle before the
  // upload handler exposes processing. Filling must invalidate that snapshot.
  let delayedProcessing=false, delayedPolls=0, delayedCoverSaved=false, delayedCoverCalls=0;
  const delayedRequest=item('channels-delayed-processing');delayedRequest.account.platform='wechat';delayedRequest.media=structuredClone(channelsRequest.media);delayedRequest.config.covers=[{id:'qa-cover',name:'cover.png',index:1}];
  f=fixture({
    progress:async()=>{
      if(!delayedProcessing)return{ready:true,coverReady:true,editorReady:true,processing:false};
      delayedPolls++;return{ready:delayedCoverSaved,coverReady:delayedPolls===1||delayedPolls>35,editorReady:true,processing:delayedPolls>1&&delayedPolls<=35};
    },
    fill:async()=>{delayedProcessing=true;return{unresolved:[]};},
    cover:async()=>{assert.ok(delayedPolls>35,'Do not reuse readiness observed before fill/upload processing');delayedCoverCalls++;delayedCoverSaved=true;return{uploadStarted:true,coverConfirmed:true};},
  });
  f.queue.start([delayedRequest]);await done(f.queue);
  assert.equal(f.queue.jobs[0].stage,'confirmed');assert.equal(delayedCoverCalls,1);assert.equal(f.calls.uploads,1);assert.equal(f.calls.submits,1);checks+=4;
  // A usable submit button cannot bypass a still-missing requested cover.
  let previewPolls=0;
  f=fixture({
    progress:async()=>({ready:true,coverReady:++previewPolls>5,editorReady:true,processing:false}),
    cover:async()=>{assert.ok(previewPolls>5);return{uploadStarted:true,coverConfirmed:true};},
  });
  f.queue.start([delayedRequest]);await done(f.queue);
  assert.equal(f.queue.jobs[0].stage,'confirmed');assert.equal(f.calls.uploads,1);assert.equal(f.calls.submits,1);checks+=3;
  // A cover IPC that finishes after its deadline cannot submit the failed row
  // or hold an independently requested retry for a different account.
  let releaseLateCover;
  f=fixture({cover:input=>input.accountId==='a'?new Promise(resolve=>{releaseLateCover=resolve}):Promise.resolve({uploadStarted:true,coverConfirmed:true}),preparationTimeoutMs:{cover:5}});
  f.queue=createPublishQueue(f.deps,retrySeed);
  const lateCoverRequest=item('a');lateCoverRequest.config.covers=[{id:'qa-cover',name:'cover.png',index:1}];
  f.queue.retry('old-a',lateCoverRequest);f.queue.retry('old-b',item('b'));
  await new Promise(resolve=>setTimeout(resolve,20));await done(f.queue);
  assert.equal(f.queue.jobs[0].stage,'failed');assert.equal(f.queue.jobs[0].submission,'not_submitted');assert.equal(f.queue.jobs[0].executionStage,'cover');
  assert.equal(f.queue.jobs[1].stage,'confirmed');assert.equal(f.calls.submits,1);assert.equal(f.queue.jobs.length,3);
  const beforeLateCover=JSON.stringify(f.queue.jobs);releaseLateCover({uploadStarted:true,coverConfirmed:true});await tick();
  assert.equal(JSON.stringify(f.queue.jobs),beforeLateCover);assert.equal(f.calls.submits,1);checks+=8;
  f=fixture({progress:async()=>({ready:false,coverReady:true,editorReady:true,processing:false}),cover:async()=>({uploadStarted:true,coverConfirmed:true})});
  f.queue.start([requiredCover]);await done(f.queue);
  assert.equal(f.queue.jobs[0].stage,'failed');assert.equal(f.calls.submits,0);assert.equal(f.queue.jobs[0].submission,'not_submitted');checks+=3;
  f=fixture({progress:async()=>({ready:false,coverReady:true,editorReady:true,processing:false})});f.queue.start([item('no-cover-no-bypass')]);await done(f.queue);
  assert.equal(f.queue.jobs[0].stage,'failed');assert.equal(f.calls.submits,0);checks+=2;
  let describeCalls=0;
  f=fixture({cover:async()=>({error:'未唯一识别对应封面编辑入口',uploadStarted:false}),describe:async()=>{describeCalls++;return{controls:[{tag:'TEXTAREA',role:null,className:'description',label:'简介',value:'never-persist-input'}],coverControls:[{tag:'SPAN',role:null,className:'cover-label',label:'',text:'封面预览',parents:[{tag:'DIV',role:null,className:'cover-card',label:''}]}],cookie:'never-persist-cookie'}}});
  f.queue.start([requiredCover]);await done(f.queue);
  assert.equal(describeCalls,1);assert.ok(f.queue.jobs[0].diagnostic.controls.some(line=>line.includes('cover-card')));assert.ok(!JSON.stringify(f.queue.jobs[0].diagnostic).includes('never-persist'));assert.equal(f.calls.submits,0);checks+=4;
  f.deps.cover=async()=>({uploadStarted:true,coverConfirmed:true});f.queue.retry(f.queue.jobs[0].id,requiredCover);await done(f.queue);assert.equal(f.queue.jobs[0].diagnostic,undefined);assert.equal(f.queue.jobs[0].stage,'confirmed');checks+=2;
  f=fixture({cover:async()=>({error:'未唯一识别对应封面编辑入口',uploadStarted:false}),describe:async()=>new Promise(()=>{}),preparationTimeoutMs:{diagnostic:5}});
  f.queue.start([requiredCover]);await new Promise(r=>setTimeout(r,20));await done(f.queue);
  assert.equal(f.queue.jobs[0].stage,'failed');assert.match(f.queue.jobs[0].message,/未唯一识别对应封面/);assert.equal(f.queue.jobs[0].diagnostic,undefined);checks+=3;
  // Observations distinguish missing evidence from actual platform processing.
  const doneWithTimers=async queue=>{const deadline=Date.now()+2000;while(queue.running&&Date.now()<deadline)await new Promise(r=>setTimeout(r,5));assert.equal(queue.running,false);};
  const observedWaiting={version:1,state:'waiting_preview',busySignals:[],editorReady:true,attachedVideoInputs:1,mediaElements:0,decodedMedia:0,coverContainers:0,coverImages:0,decodedCoverImages:0,enabledSubmitButtons:1};
  let observedInputs=[], observedPolls=0, observedCovers=0;
  const unprovenRequest=item('observed-missing-cover');unprovenRequest.account.platform='wechat';unprovenRequest.media=structuredClone(channelsRequest.media);unprovenRequest.config.covers=[{id:'qa-cover',name:'cover.png',index:1}];
  f=fixture({
    sleep:()=>new Promise(resolve=>setTimeout(resolve,2)),
    prepare:async request=>({accountId:request.account.id,taskId:'stale-task-id',attemptId:'stale-attempt-id'}),
    progress:async input=>{observedInputs.push(input);observedPolls++;return{ready:false,coverReady:false,processing:false,observation:{...observedWaiting,enabledSubmitButtons:observedPolls%2},observationStored:true};},
    cover:async()=>{observedCovers++;return{uploadStarted:true,coverConfirmed:true};},preparationTimeoutMs:{observationIdle:8},
  });
  f.queue.start([unprovenRequest]);await doneWithTimers(f.queue);
  const observedJob=f.queue.jobs[0];
  assert.equal(observedJob.stage,'failed');assert.equal(observedJob.submission,'not_submitted');assert.equal(f.calls.uploads,1);assert.equal(observedCovers,0);assert.equal(f.calls.submits,0);checks+=5;
  assert.match(observedJob.message,/未观察到官方处理信号/);assert.match(observedJob.message,/素材不会自动重传/);assert.equal(observedJob.mediaObservation.value.state,'waiting_preview');assert.equal(observedJob.mediaObservation.stored,true);checks+=4;
  assert.ok(observedInputs.every(input=>input.taskId===observedJob.id&&input.attemptId===observedJob.attemptId));assert.ok(observedPolls<20,'Changing candidate counts must not reset an unproven-state deadline');checks+=2;
  const recoveredObserved=recoverPublishJobs([{...observedJob,mediaObservation:{...observedJob.mediaObservation,value:{...observedWaiting,cookie:'never-persist-cookie'}}}])[0];
  assert.ok(!JSON.stringify(recoveredObserved.mediaObservation).includes('never-persist'));assert.equal(recoveredObserved.submission,'not_submitted');checks+=2;
  assert.equal(recoverPublishJobs([{...observedJob,mediaObservation:{at:'bad',value:observedWaiting}}])[0].mediaObservation,undefined);checks++;
  const releaseObserved=f.deps.prepare;f.deps.prepare=async()=>{throw Error('请先在当前账号完成官方登录');};
  f.queue.retry(observedJob.id,unprovenRequest);await done(f.queue);assert.equal(f.queue.jobs.length,1);assert.equal(f.queue.jobs[0].id,observedJob.id);assert.equal(f.queue.jobs[0].mediaObservation,undefined);checks+=3;f.deps.prepare=releaseObserved;
  // Genuine processing notices may exceed the short recognition budget. They
  // remain bounded by the total media budget and still require fresh readiness.
  let actualProcessingPolls=0;
  f=fixture({sleep:()=>new Promise(resolve=>setTimeout(resolve,2)),progress:async()=>{
    const busy=++actualProcessingPolls<8;
    return{ready:!busy,coverReady:!busy,processing:busy,observation:{...observedWaiting,state:busy?'processing':'submit_ready',busySignals:busy?['media_notice']:[],coverContainers:busy?0:1,coverImages:busy?0:1,decodedCoverImages:busy?0:1}};
  },cover:async()=>({uploadStarted:true,coverConfirmed:true}),preparationTimeoutMs:{observationIdle:1,uploadingTotal:500}});
  f.queue.start([unprovenRequest]);await doneWithTimers(f.queue);
  assert.equal(f.queue.jobs[0].stage,'confirmed');assert.equal(f.calls.uploads,1);assert.equal(f.calls.submits,1);assert.ok(actualProcessingPolls>=8);checks+=4;
  // Strictly ordered execution: 100% is not completion while processing; a
  // disabled publish button before filling must not deadlock media readiness.
  const ordered=[],orderedRequest=item('ordered');orderedRequest.config.covers=[{id:'qa-cover',name:'cover.png',index:1}];
  let guardedPolls=0,guardedFill=0;
  f=fixture({progress:async()=>({ready:true,mediaReady:true,processing:false,uploadPercent:++guardedPolls<4?42:100}),fill:async()=>{guardedFill++;assert.ok(guardedPolls>=5);return{unresolved:[]};}});
  f.queue.start([item('contradictory-progress')]);await done(f.queue);assert.equal(guardedFill,1);assert.equal(f.calls.uploads,1);assert.equal(f.calls.submits,1);checks+=3;
  let busyFactPolls=0;
  f=fixture({progress:async()=>({ready:true,mediaReady:true,processing:false,observation:{...observedWaiting,editorReady:true,state:++busyFactPolls<4?'processing':'submit_ready',busySignals:busyFactPolls<4?['upload_notice']:[]}}),fill:async()=>{assert.ok(busyFactPolls>=5);return{unresolved:[]};}});
  f.queue.start([item('contradictory-busy-facts')]);await done(f.queue);assert.equal(f.calls.uploads,1);assert.equal(f.calls.submits,1);checks+=2;
  let pendingLoginPolls=0;
  f=fixture({progress:async()=>++pendingLoginPolls<3?{error:'官方发布页账号状态尚未就绪，尚不能确认账号会话；素材不会自动重传'}:{ready:true,mediaReady:true}});
  f.queue.start([item('navigating-upload')]);await done(f.queue);assert.equal(f.queue.jobs[0].stage,'confirmed');assert.equal(f.calls.uploads,1);assert.equal(f.calls.submits,1);checks+=3;
  for(const error of ['当前发布页要求本人验证，请在该账号官网页完成后继续；素材不会自动重传','请先登录当前平台账号','当前发布页提示账号状态异常，请先处理官方提示；素材不会自动重传']){
    let blockedPolls=0,blockedFills=0;f=fixture({progress:async()=>{blockedPolls++;return{error};},fill:async()=>{blockedFills++;return{unresolved:[]};}});
    f.queue.start([item('blocked-upload')]);await done(f.queue);assert.equal(blockedPolls,1);assert.equal(blockedFills,0);assert.equal(f.calls.uploads,1);assert.equal(f.calls.submits,0);checks+=4;
  }
  let orderedPoll=0,orderedFilled=false,orderedCover=false;
  f=fixture({
    prepare:async request=>{ordered.push('prepare');return{accountId:request.account.id};},
    upload:async()=>{ordered.push('upload');return{uploadStarted:true};},
    progress:async()=>{orderedPoll++;ordered.push('progress');return{uploadPercent:orderedPoll===1?25:orderedPoll===2?100:undefined,processing:orderedPoll<=2,mediaReady:orderedPoll>3,coverReady:orderedPoll>3,ready:orderedFilled&&orderedCover};},
    fill:async()=>{assert.ok(orderedPoll>=5);assert.ok(f.queue.jobs[0].completedSteps.includes('uploading'));assert.equal(f.queue.jobs[0].stage,'filling');ordered.push('fill');orderedFilled=true;return{unresolved:[]};},
    cover:async()=>{assert.ok(orderedFilled);assert.ok(f.queue.jobs[0].completedSteps.includes('filling'));ordered.push('cover');orderedCover=true;return{uploadStarted:true,coverConfirmed:true};},
    inspect:async()=>{assert.ok(orderedCover);assert.ok(f.queue.jobs[0].completedSteps.includes('cover'));ordered.push('inspect');return{nonce:'qa-order',candidates:[{index:0}]};},
    submit:async entries=>{assert.ok(f.queue.jobs[0].completedSteps.includes('reviewing'));ordered.push('submit');return{results:entries.map(entry=>({accountId:entry.accountId,receipt:{status:'confirmed',id:'qa-order',message:'发布成功',clicked:true}}))};},
  });
  f.queue.start([orderedRequest]);await done(f.queue);
  assert.deepEqual(ordered.filter(step=>step!=='progress'),['prepare','upload','fill','cover','inspect','submit']);assert.equal(f.queue.jobs[0].stage,'confirmed');assert.deepEqual(f.queue.jobs[0].completedSteps,['preparing','uploading','filling','cover','reviewing','submitting']);checks+=3;
  assert.ok(f.calls.snapshots.some(rows=>rows[0].stage==='uploading'&&rows[0].uploadPercent===100&&!rows[0].completedSteps.includes('uploading')));checks++;
  assert.ok(f.calls.snapshots.some(rows=>rows[0].stage==='uploading'&&rows[0].uploadPercent===undefined&&/未提供百分比/.test(rows[0].message)),'A vanished official percentage must not leave a stale percentage displayed');checks++;
  let stoppedCovers=0,stoppedInspects=0;
  f=fixture({fill:async()=>({unresolved:['title：未唯一识别官方控件']}),cover:async()=>{stoppedCovers++;},inspect:async()=>{stoppedInspects++;}});
  f.queue.start([orderedRequest]);await done(f.queue);
  assert.equal(stoppedCovers,0);assert.equal(stoppedInspects,0);assert.equal(f.calls.submits,0);assert.deepEqual(f.queue.jobs[0].completedSteps,['preparing','uploading']);assert.match(f.queue.jobs[0].message,/填写作品信息.*标题：未唯一识别官方控件/);checks+=5;
  f=fixture({progress:async()=>({ready:true,mediaReady:true,coverReady:true,validationErrors:['请选择作品分类']})});f.queue.start([item('official-required-field')]);await done(f.queue);
  assert.equal(f.queue.jobs[0].stage,'failed');assert.match(f.queue.jobs[0].message,/请选择作品分类/);assert.equal(f.calls.submits,0);checks+=3;
  const reviewFilled=new Set();
  f=fixture({fill:async input=>{reviewFilled.add(input.accountId);return{unresolved:[]};},progress:async input=>reviewFilled.has(input.accountId)&&input.accountId==='review-bad'?{error:'分区选项已失效，请重新选择分区'}:{ready:true}});
  f.queue.start([item('review-bad'),item('review-good')]);await done(f.queue);
  assert.equal(f.queue.jobs.find(job=>job.accountId==='review-bad').stage,'failed');assert.match(f.queue.jobs.find(job=>job.accountId==='review-bad').message,/检查发布表单.*分区选项已失效/);
  assert.equal(f.queue.jobs.find(job=>job.accountId==='review-good').stage,'confirmed','A pre-submit check error for one account must not label a different account as failed');assert.equal(f.calls.submits,1);checks+=4;
  f=fixture({inspect:async()=>({nonce:'qa-no-button',candidates:[]})});f.queue.start([item('no-submit-control')]);await done(f.queue);
  assert.match(f.queue.jobs[0].message,/未识别到.*发布按钮/);assert.ok(!f.queue.jobs[0].message.includes('多个'));assert.equal(f.calls.submits,0);checks+=3;
  let coverWaiting=false;
  f=fixture({fill:async()=>{coverWaiting=true;return{unresolved:[]};},progress:async()=>coverWaiting?{processing:true,coverReady:false}:{ready:true},preparationTimeoutMs:{reviewingTotal:1}});
  f.queue.start([orderedRequest]);await done(f.queue);
  assert.equal(f.queue.jobs[0].executionStage,'cover');assert.match(f.queue.jobs[0].message,/处理作品封面/);assert.equal(f.calls.submits,0);checks+=3;
  // A long, changing upload must not lose actual execution timing when the
  // bounded 40-entry progress history rolls over.
  let timingPolls=0;
  f=fixture({progress:async()=>({uploadPercent:++timingPolls<65?timingPolls:100,processing:timingPolls<65,mediaReady:timingPolls>=65,ready:timingPolls>=65})});
  f.queue.start([item('timed-upload')]);await done(f.queue);
  const timed=f.queue.jobs[0],firstStart=f.calls.snapshots.find(rows=>rows[0].stage==='preparing')[0].executionStartedAt;
  assert.equal(timed.stage,'confirmed');assert.equal(timed.history.length,40);assert.equal(timed.history.some(step=>step.stage==='preparing'),false);
  assert.ok(firstStart);assert.equal(timed.executionStartedAt,firstStart);assert.ok(timed.completedAt);
  assert.equal(publishJobTiming(timed).includesQueue,false);assert.ok(Number.isFinite(publishJobTiming(timed).duration));
  const restored=recoverPublishJobs([timed])[0];assert.equal(restored.executionStartedAt,firstStart);assert.equal(publishJobTiming(restored).duration,publishJobTiming(timed).duration);
  assert.equal(publishJobTiming({...timed,executionStartedAt:undefined}).includesQueue,true);
  const ended=timed.completedAt;f.queue.operationReceipt({id:timed.receiptId,kind:'publish',taskId:timed.id,attemptId:timed.attemptId,accountId:timed.accountId,platform:timed.platform,status:'confirmed',message:'Confirmed again'});
  assert.equal(f.queue.jobs[0].completedAt,ended);assert.equal(f.calls.submits,1);checks+=13;
  let unchangedPolls=0;
  f=fixture({progress:async()=>++unchangedPolls<=40?{uploadPercent:42,processing:true,mediaReady:false,ready:false}:{uploadPercent:100,processing:false,mediaReady:true,ready:true}});
  f.queue.start([item('unchanged-upload')]);await done(f.queue);
  assert.equal(f.calls.snapshots.filter(rows=>rows[0].stage==='uploading'&&rows[0].uploadPercent===42).length,1,'Repeated identical progress must not rewrite/render the entire task list');
  assert.ok(unchangedPolls>=43,'Deduplicating UI changes must not skip official readiness checks');assert.equal(f.queue.jobs[0].stage,'confirmed');assert.equal(f.calls.uploads,1);assert.equal(f.calls.submits,1);checks+=5;
  // Resuming a manually repaired field must not silently skip a requested
  // cover that this attempt never confirmed.
  f=fixture({fill:async()=>({unresolved:['title：未唯一识别官方控件']}),cover:async()=>({uploadStarted:true,coverConfirmed:true})});
  const skippedCoverBatch=f.queue.start([orderedRequest]);await done(f.queue);
  f.queue.resume(skippedCoverBatch);await done(f.queue);
  assert.equal(f.calls.submits,0,'Manual resume cannot bypass an unfinished requested cover');checks++;

  // Follow up a known, same-session handoff without another prepare/upload.
  let phaseReady=false,phasePrepares=0,phaseFills=0,phaseCovers=0;
  f=fixture({prepare:async request=>{phasePrepares++;return{accountId:request.account.id};},
    progress:async()=>phaseReady?{ready:true,mediaReady:true,coverReady:true}:{error:'页面观测失败'},
    fill:async()=>{phaseFills++;return{unresolved:[]};},cover:async()=>{phaseCovers++;return{uploadStarted:true,coverConfirmed:true};}});
  f.queue.start([orderedRequest]);await done(f.queue);
  const continuedId=f.queue.jobs[0].id,continuedAttempt=f.queue.jobs[0].attemptId;
  assert.equal(f.queue.jobs[0].mediaHandoff.state,'confirmed');assert.equal(f.queue.canContinuePreparation(continuedId),true);checks+=2;
  assert.throws(()=>f.queue.start([orderedRequest]),/待处理/,'A new task must not overwrite this account\'s retained editor');checks++;
  phaseReady=true;f.queue.continuePreparation(continuedId);await done(f.queue);
  assert.equal(f.calls.uploads,1);assert.equal(phasePrepares,1);assert.equal(phaseFills,1);assert.equal(phaseCovers,1);
  assert.equal(f.calls.submits,1);assert.equal(f.queue.jobs.length,1);assert.equal(f.queue.jobs[0].attemptId,continuedAttempt);assert.equal(f.queue.jobs[0].stage,'confirmed');
  assert.equal(f.queue.canContinuePreparation(continuedId),false);assert.throws(()=>f.queue.continuePreparation(continuedId));checks+=10;

  // A cover that is already confirmed must not be sent again while repairing
  // the second cover. Other rows and their receipts stay untouched.
  const twoCovers=item('two-covers');twoCovers.account.platform='douyin';twoCovers.config.covers=[{id:'qa-cover-1',name:'one.png',index:1},{id:'qa-cover-2',name:'two.png',index:2}];
  const coveredIndices=[];let secondCoverReady=false;
  f=fixture({cover:async(_input,cover)=>{coveredIndices.push(cover.index);return cover.index===2&&!secondCoverReady?{error:'封面编辑入口被菜单遮挡',uploadStarted:false}:{uploadStarted:true,coverConfirmed:true};}});
  f.queue.start([twoCovers]);await done(f.queue);const retainedCoverJob=f.queue.jobs[0];
  const resumedSnapshots=f.calls.snapshots.length;
  secondCoverReady=true;f.queue.continuePreparation(retainedCoverJob.id);await done(f.queue);
  assert.deepEqual(coveredIndices,[1,2,2]);assert.equal(f.calls.uploads,1);assert.equal(f.calls.submits,1);assert.equal(f.queue.jobs[0].stage,'confirmed');checks+=4;
  assert.equal(f.calls.snapshots.slice(resumedSnapshots).some(snapshot=>snapshot[0].executionStage==='uploading'),false,'Rechecking retained media must not regress the reached cover phase to Uploading');checks++;
  const restartedPhaseQueue=createPublishQueue(f.deps,recoverPublishJobs([{...retainedCoverJob,stage:'failed',submission:'not_submitted'}]));
  assert.equal(restartedPhaseQueue.canContinuePreparation(retainedCoverJob.id),false,'Persisted display history cannot authorize a retained guest');
  assert.throws(()=>restartedPhaseQueue.continuePreparation(retainedCoverJob.id));checks+=2;

  // Explicitly stop requesting a custom cover, keep this exact live upload,
  // filled fields and attempt, and never touch another record.
  let autoCoverCalls=0;
  f=fixture({cover:async()=>{autoCoverCalls++;return{error:'封面编辑入口被菜单遮挡',uploadStarted:false};}});
  const autoCoverVideo={...orderedRequest,media:{...orderedRequest.media,mediaType:'video',files:[{name:'auto-cover.mp4',size:100}]}};
  f.queue.start([autoCoverVideo,item('auto-other')]);await done(f.queue);
  const autoJob=f.queue.jobs[0],autoAttempt=autoJob.attemptId,autoOther=JSON.stringify(f.queue.jobs[1]);
  assert.equal(f.queue.canContinuePreparation(autoJob.id),true);
  f.queue.continuePreparation(autoJob.id,{automaticCover:true});await done(f.queue);
  assert.equal(f.queue.jobs[0].stage,'confirmed');assert.equal(f.queue.jobs[0].attemptId,autoAttempt);assert.equal(f.calls.uploads,2);assert.equal(autoCoverCalls,1);assert.deepEqual(f.queue.jobs[0].config.covers,[]);assert.equal(f.queue.jobs[0].config.title,orderedRequest.config.title);assert.equal(f.queue.jobs[0].config.body,orderedRequest.config.body);assert.equal(JSON.stringify(f.queue.jobs[1]),autoOther);checks+=9;
  assert.throws(()=>f.queue.continuePreparation(autoJob.id,{automaticCover:true}));checks++;
  f=fixture({cover:async()=>{throw Error('Automatic mode must not open a cover editor');}});
  const autoRequest={...autoCoverVideo,config:{...orderedRequest.config,covers:[]}};
  f.queue.start([autoRequest]);await done(f.queue);assert.equal(f.queue.jobs[0].stage,'confirmed');assert.equal(f.queue.jobs[0].completedSteps.includes('cover'),false);assert.equal(f.calls.uploads,1);checks+=3;

  // A timeout during the file handoff is not proof that the file was rejected.
  // It must not offer same-session continuation as a confirmed handoff.
  f=fixture({upload:async()=>({uploadStarted:true,handoffUncertain:true,error:'交付结果未确认'})});f.queue.start([item('uncertain-handoff')]);await done(f.queue);
  assert.equal(f.queue.jobs[0].mediaHandoff.state,'uncertain');assert.equal(f.queue.canContinuePreparation(f.queue.jobs[0].id),false);assert.equal(f.calls.submits,0);checks+=3;
  let coverConfirmationReady=false;
  f=fixture({cover:async()=>({uploadStarted:true,coverConfirmed:coverConfirmationReady})});f.queue.start([orderedRequest]);await done(f.queue);
  assert.equal(f.queue.canContinuePreparation(f.queue.jobs[0].id),false,'An uncertain cover handoff cannot be replayed');checks++;
  const uncertainCoverBatch=f.queue.jobs[0].batchId;f.queue.resume(uncertainCoverBatch);await done(f.queue);assert.equal(f.calls.submits,0);checks++;

  let freshFillCalls=0;
  f=fixture({fill:async()=>{freshFillCalls++;return{error:'填写控件返回失败'};}});f.queue.start([item('lost-preview')]);await done(f.queue);
  assert.ok(f.queue.jobs[0].completedSteps.includes('uploading'));
  f.deps.progress=async()=>({ready:false,mediaReady:false,processing:false});f.deps.fill=async()=>{freshFillCalls++;return{unresolved:[]};};
  f.queue.continuePreparation(f.queue.jobs[0].id);await done(f.queue);
  assert.equal(freshFillCalls,1,'Continuation must recheck media before writing into a changed/empty editor');assert.equal(f.calls.uploads,1);assert.equal(f.calls.submits,0);checks+=4;

  let followedAccountReady=false;
  f=fixture({progress:async input=>input.accountId==='follow-one'&&!followedAccountReady?{error:'页面观测失败'}:{ready:true}});
  f.queue.start([item('follow-one'),item('leave-two')]);await done(f.queue);
  const otherRow=JSON.stringify(f.queue.jobs[1]);followedAccountReady=true;f.queue.continuePreparation(f.queue.jobs[0].id);await done(f.queue);
  assert.equal(JSON.stringify(f.queue.jobs[1]),otherRow,'Continuing one row cannot rewrite another account or receipt');assert.equal(f.calls.uploads,2);assert.equal(f.calls.submits,2);checks+=3;

  // A real new milestone earns a fresh recognition interval, not an unlimited
  // extension from a blinking button or repeatedly missing preview.
  const realNow=Date.now;let fakeNow=realNow(),milestonePoll=0;
  try {
    Date.now=()=>fakeNow;
    f=fixture({sleep:async()=>{fakeNow+=6000;await tick();},progress:async()=>{
      const poll=++milestonePoll,ready=poll>=4;
      return{ready,mediaReady:ready,coverReady:ready,processing:false,observation:{...observedWaiting,state:ready?'submit_ready':'waiting_preview',coverContainers:poll>=2?1:0,coverImages:poll>=2?1:0,decodedCoverImages:ready?1:0}};
    },preparationTimeoutMs:{observationIdle:10000}});
    f.queue.start([item('milestone-progress')]);await done(f.queue);
    assert.equal(f.queue.jobs[0].stage,'confirmed');assert.equal(f.calls.uploads,1);assert.equal(f.calls.submits,1);checks+=3;
  } finally { Date.now=realNow; }

  // A receipt from a previous attempt may arrive after its failure event has
  // allowed an independent retry to be queued into this same row.
  let releaseOldSubmission,submitSequence=0;
  f=fixture({submit:async entries=>{
    if(++submitSequence===1)return new Promise(resolve=>{releaseOldSubmission=()=>resolve({results:[{accountId:entries[0].accountId,receipt:{id:'qa-old-late-receipt',status:'confirmed',message:'old result'}}]});});
    return{results:entries.map(entry=>({accountId:entry.accountId,receipt:{id:'qa-current-receipt',status:'confirmed',message:'发布成功'}}))};
  }});
  const lateBatch=f.queue.start([item('late-receipt')]);for(let i=0;i<50&&!releaseOldSubmission;i++)await tick();assert.ok(releaseOldSubmission);
  const lateId=f.queue.jobs[0].id;
  f.queue.submittedProgress({batchId:lateBatch,accountId:'late-receipt',status:'failed',message:'old explicit rejection'});
  assert.equal(f.queue.isSubmissionPending(lateId),true);assert.throws(()=>f.queue.retry(lateId),/回执仍在返回/);assert.throws(()=>f.queue.remove(lateId),/运行中/);
  const oldAttempt=f.queue.jobs[0].attemptId;releaseOldSubmission();await done(f.queue);
  assert.equal(f.queue.jobs[0].attemptId,oldAttempt);assert.equal(f.queue.jobs[0].receiptId,'qa-old-late-receipt');assert.equal(f.calls.uploads,1);assert.equal(f.queue.jobs.length,1);assert.equal(f.queue.isSubmissionPending(lateId),false);checks+=8;
  f=fixture({submit:async entries=>({results:entries.map(entry=>({accountId:entry.accountId,receipt:{id:'qa-mismatched-receipt',taskId:'different-task',attemptId:'different-attempt',status:'confirmed',message:'wrong result'}}))})});
  f.queue.start([item('mismatched-receipt')]);await done(f.queue);
  assert.equal(f.queue.jobs[0].stage,'unknown');assert.equal(f.queue.jobs[0].submission,'uncertain');assert.equal(f.queue.jobs[0].receiptId,undefined);assert.equal(canRetryPublishJob(f.queue.jobs[0]),false);checks+=4;
  let resolveConfirmed;
  f=fixture({submit:async entries=>new Promise(resolve=>{resolveConfirmed=()=>resolve({results:entries.map(entry=>({accountId:entry.accountId,receipt:{id:'qa-late-unknown',status:'unknown',message:'late incomplete result'}}))});})});
  f.queue.start([item('already-confirmed')]);for(let i=0;i<50&&!resolveConfirmed;i++)await tick();
  const confirmedJob=f.queue.jobs[0];
  f.queue.operationReceipt({id:'qa-official-success',kind:'publish',taskId:confirmedJob.id,attemptId:confirmedJob.attemptId,accountId:confirmedJob.accountId,platform:confirmedJob.platform,status:'confirmed',message:'发布成功'});
  resolveConfirmed();await done(f.queue);assert.equal(f.queue.jobs[0].stage,'confirmed');assert.equal(f.queue.jobs[0].receiptId,'qa-official-success');assert.equal(f.calls.uploads,1);checks+=3;
  let resolveBareProgress;
  f=fixture({submit:async entries=>new Promise(resolve=>{resolveBareProgress=()=>resolve({results:entries.map(entry=>({accountId:entry.accountId,receipt:{id:'qa-structured-unknown',status:'unknown',message:'no final evidence'}}))});})});
  const bareBatch=f.queue.start([item('bare-progress')]);for(let i=0;i<50&&!resolveBareProgress;i++)await tick();
  f.queue.submittedProgress({batchId:bareBatch,accountId:'bare-progress',status:'confirmed',message:'发布成功'});
  assert.notEqual(f.queue.jobs[0].stage,'confirmed','A status-only progress event is not the final linked receipt');
  resolveBareProgress();await done(f.queue);assert.equal(f.queue.jobs[0].stage,'unknown');assert.equal(canRetryPublishJob(f.queue.jobs[0]),false);checks+=3;

  const verifiedJob=f.queue.jobs[0],verification={state:'not_found',message:'本次加载列表未找到，不能认定失败',checkedAt:new Date().toISOString()};
  const beforeVerificationCount=f.queue.jobs.length;
  f.queue.operationReceipt({id:verifiedJob.receiptId,kind:'publish',taskId:verifiedJob.id,attemptId:verifiedJob.attemptId,accountId:verifiedJob.accountId,platform:verifiedJob.platform,status:'unknown',message:verifiedJob.message,verification});
  assert.deepEqual(f.queue.jobs[0].verification,verification);assert.equal(f.queue.jobs[0].stage,'unknown');assert.equal(canRetryPublishJob(f.queue.jobs[0]),false);assert.equal(f.queue.jobs.length,beforeVerificationCount);checks+=4;
  const checkBefore=JSON.stringify(f.queue.jobs[0]);
  f.queue.operationReceipt({id:verifiedJob.receiptId,kind:'publish',taskId:verifiedJob.id,attemptId:'another-attempt',accountId:verifiedJob.accountId,platform:verifiedJob.platform,status:'confirmed',message:'foreign attempt',verification:{...verification,state:'confirmed'}});
  assert.equal(JSON.stringify(f.queue.jobs[0]),checkBefore);checks++;
  assert.equal(recoverPublishJobs([{...f.queue.jobs[0],verification:{...verification,state:'forged-state'}}])[0].verification,undefined);checks++;
  for(const value of [{...verification,state:'status_unresolved'},{...verification,state:'rejected',message:'官方作品状态：审核未通过：'+'具体原因'.repeat(100)}]){
    const restored=recoverPublishJobs([{...f.queue.jobs[0],verification:value}])[0];assert.deepEqual(restored.verification,value,'A valid official check must survive restart');assert.equal(restored.stage,'unknown');assert.equal(canRetryPublishJob(restored),false);checks+=3;
  }
  assert.equal(recoverPublishJobs([{...f.queue.jobs[0],verification:{...verification,message:'x'.repeat(1001)}}])[0].verification,undefined);checks++;
  const untouchedJob={...verifiedJob,id:'another-untouched-task',accountId:'another-owner-account'};
  f.queue=createPublishQueue(f.deps,[f.queue.jobs[0],untouchedJob]);
  const absentReceipt={id:verifiedJob.receiptId,kind:'publish',taskId:verifiedJob.id,attemptId:verifiedJob.attemptId,accountId:verifiedJob.accountId,platform:verifiedJob.platform,status:'failed',message:'本人核实未发布，非官方失败回执',resultSource:'user_confirmed_not_published',verification:{...verification,state:'not_published'}};
  f.queue.operationReceipt(absentReceipt);
  assert.equal(f.queue.jobs[0].submission,'user_confirmed_absent');assert.equal(canRetryPublishJob(f.queue.jobs[0]),true);assert.deepEqual(f.queue.jobs[1],untouchedJob);assert.equal(f.queue.running,false);checks+=4;
  const restoredAbsent=recoverPublishJobs(f.queue.jobs);assert.equal(restoredAbsent[0].submission,'user_confirmed_absent');assert.equal(restoredAbsent[0].stage,'failed');assert.equal(canRetryPublishJob(restoredAbsent[0]),true);assert.equal(canRetryPublishJob({...restoredAbsent[0],stage:'unknown'}),false);checks+=4;
  for(const submission of ['not_submitted','rejected','user_confirmed_absent']){
    const isolated=createPublishQueue(f.deps,[{...restoredAbsent[0],submission}]);const before=JSON.stringify(isolated.jobs[0]);
    for(const status of ['unknown','submitting']){isolated.operationReceipt({...absentReceipt,status,message:'Late pending snapshot'});assert.equal(JSON.stringify(isolated.jobs[0]),before);assert.equal(canRetryPublishJob(isolated.jobs[0]),true);checks+=2;}
    isolated.operationReceipt({...absentReceipt,status:'confirmed',message:'Fresh official success'});assert.equal(isolated.jobs[0].stage,'confirmed');assert.equal(canRetryPublishJob(isolated.jobs[0]),false);checks+=2;isolated.dispose();
  }
  f.queue.operationReceipt({id:verifiedJob.receiptId,kind:'publish',taskId:verifiedJob.id,attemptId:verifiedJob.attemptId,accountId:verifiedJob.accountId,platform:verifiedJob.platform,status:'confirmed',message:'发布成功',verification:{...verification,state:'confirmed'}});
  assert.equal(f.queue.jobs[0].stage,'confirmed');assert.equal(f.queue.jobs[0].verification.state,'confirmed');assert.equal(f.queue.jobs.length,beforeVerificationCount+1);checks+=3;
  let absentBatchSubmits=0;
  f=fixture({submit:async entries=>{absentBatchSubmits++;return{results:entries.map(entry=>({accountId:entry.accountId,receipt:{...absentReceipt,id:'batch-absent',taskId:undefined,attemptId:undefined,accountId:entry.accountId}}))};}});
  f.queue.start([item('batch-absent')]);await done(f.queue);assert.equal(f.queue.jobs[0].submission,'user_confirmed_absent');assert.equal(absentBatchSubmits,1);checks+=2;
  // A late transport response cannot undo the exact same attempt that an
  // independent official result read already confirmed.
  let lateSubmit;f=fixture({submit:entries=>new Promise(resolve=>lateSubmit=()=>resolve({results:[{accountId:entries[0].accountId,receipt:{id:'qa-late-unknown',taskId:entries[0].taskId,attemptId:entries[0].attemptId,accountId:entries[0].accountId,platform:'xiaohongshu',status:'unknown',message:'old transport pending'}}]}))});
  f.queue.start([item('qa-work-reference')]);for(let i=0;i<100&&!lateSubmit;i++)await tick();assert.ok(lateSubmit);checks++;
  const refJob=f.queue.jobs[0],reference={workId:'abcdef0123456789abcdef01',workUrl:'https://www.xiaohongshu.com/explore/abcdef0123456789abcdef01',workReferenceSource:'official_title_link'};
  const refReceipt={id:'qa-exact-work-receipt',kind:'publish',taskId:refJob.id,attemptId:refJob.attemptId,accountId:refJob.accountId,platform:refJob.platform,status:'confirmed',message:'发布成功',evidence:reference};
  f.queue.operationReceipt(refReceipt);lateSubmit();await done(f.queue);assert.equal(f.queue.jobs[0].stage,'confirmed');assert.equal(f.queue.jobs[0].receiptId,'qa-exact-work-receipt');assert.deepEqual(f.queue.jobs[0].workReference,reference);checks+=3;
  assert.deepEqual(recoverPublishJobs(f.queue.jobs)[0].workReference,reference);checks++;
  const priorCount=f.calls.snapshots.length;f.queue.operationReceipt({...refReceipt,evidence:undefined});assert.deepEqual(f.queue.jobs[0].workReference,reference);assert.equal(f.calls.snapshots.length,priorCount);checks+=2;
  f.queue.operationReceipt({...refReceipt,evidence:{...reference,workId:'abcdef0123456789abcdef02',workUrl:'https://www.xiaohongshu.com/explore/abcdef0123456789abcdef02'}});assert.equal(f.queue.jobs[0].stage,'confirmed');assert.equal(f.queue.jobs[0].workReferenceConflict,true);assert.equal(f.queue.jobs[0].followup.status,'unknown');assert.deepEqual(f.queue.jobs[0].workReference,reference);checks+=4;
  assert.equal(recoverPublishJobs([{...f.queue.jobs[0],workReference:{...reference,workUrl:'https://evil.invalid'}}])[0].workReference,undefined);checks++;
  for(const mode of ['unknown','error','throw','empty','cancelled','remaining','foreign']){
    let finish,reject,submitCalls=0;f=fixture({submit:()=>{submitCalls++;return new Promise((resolve,fail)=>{finish=resolve;reject=fail;});}});f.queue.start([item('qa-known-failed-'+mode)]);await untilSubmit();
    async function untilSubmit(){for(let i=0;i<100&&!finish;i++)await tick();assert.ok(finish);}
    const live=f.queue.jobs[0],failedReceipt={id:'known-failure-'+mode,kind:'publish',taskId:live.id,attemptId:live.attemptId,accountId:live.accountId,platform:live.platform,status:'failed',message:'Official definite rejection',clicked:true};
    f.queue.operationReceipt(failedReceipt);assert.equal(f.queue.jobs[0].stage,'failed');assert.equal(f.queue.isSubmissionPending(live.id),true);checks+=2;
    if(mode==='throw')reject(Error('Late transport error'));else finish(mode==='error'?{error:'Late error'}:mode==='empty'?{}:mode==='cancelled'?{cancelled:true}:mode==='remaining'?{remaining:[live.accountId]}:{results:[{accountId:live.accountId,receipt:{...failedReceipt,status:'unknown',...(mode==='foreign'?{attemptId:'foreign'}:{})}}]});
    await done(f.queue);assert.equal(f.queue.jobs[0].stage,'failed');assert.equal(f.queue.jobs[0].submission,'rejected');assert.equal(canRetryPublishJob(f.queue.jobs[0]),true);assert.equal(f.queue.isSubmissionPending(live.id),false);assert.equal(f.calls.uploads,1);assert.equal(submitCalls,1);checks+=6;f.queue.dispose();
  }
  for(const [message,label] of [['标签校验未完成','待完成标签'],['提交按钮被弹窗遮挡','待处理页面遮挡'],['需要滑块验证','待官网验证'],['请补全封面','待补全作品信息'],['官网账号ID未读到','待处理']]){assert.equal(publishOutcomeLabel({stage:'attention',message}),label);checks++;}
  console.log(JSON.stringify({ backgroundQueueChecks: checks, externalPlatformActions: false }));
  const draftCompletion=require('node:child_process').spawnSync(process.execPath,[require('node:path').join(__dirname,'qa-publish-draft-completion.cjs')],{encoding:'utf8',windowsHide:true,timeout:30000});
  if(draftCompletion.stdout)process.stdout.write(draftCompletion.stdout);if(draftCompletion.stderr)process.stderr.write(draftCompletion.stderr);assert.equal(draftCompletion.status,0,'Cross-target draft completion regression failed');
})().catch(error => { console.error(error); process.exitCode = 1; });
