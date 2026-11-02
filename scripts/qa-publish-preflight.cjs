// Pure/SSR/mocked main-process checks only. No app services, accounts or posts.
const assert = require('node:assert/strict'), path = require('node:path'), os = require('node:os');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const { loadTs } = require('./qa-load-typescript.cjs');
const { collectPublishPreflight: inspect, checkPublishMedia, publishPreflightMessage } = loadTs('shared/publish-preflight.ts');
const { validatePublishConfig } = loadTs('shared/publish-config.ts');
const { PublishValidationErrors } = loadTs('client/src/components/workspace/PublishValidationErrors.tsx');
const { PublishStepProgress, PublishTaskStageNote } = loadTs('client/src/components/workspace/PublishStepProgress.tsx');
const { createPublishQueue } = loadTs('client/src/components/workspace/publish-queue.ts');
const target = (id = 'qa-account') => ({ account: { id, nickname: 'QA 同名', platform: 'xiaohongshu', connectorSessionId: 'qa-session' }, config: { title: 'QA标题', body: 'QA简介', topics: [], comment: '', options: {} }, media: { id: 'opaque-qa', mediaType: 'image', files: [{ name: 'qa.png', size: 100 }] } });
(async () => {
  assert.deepEqual(inspect([target()]), []);
  const invalid = target();invalid.config.title=' ';invalid.config.body='只有简介';invalid.config.schedule={mode:'local',at:'2000-01-01'};invalid.media=undefined;
  const issues = inspect([{...invalid,item:1}]);
  assert.deepEqual(issues.map(issue=>issue.field), ['title','schedule','media']);
  assert.match(publishPreflightMessage(issues[0]), /第2篇.*小红书.*QA 同名.*标题/);
  assert.equal(validatePublishConfig({...invalid.config,schedule:undefined}),null,'Incomplete text drafts remain saveable; publishing admission is stricter');
  const html = renderToStaticMarkup(React.createElement(PublishValidationErrors,{issues}));
  assert.match(html,/role="alert"/);assert.match(html,/尚未创建发布任务/);assert.match(html,/data-preflight-field="title"/);assert.ok(!html.includes('opaque-qa'));
  assert.equal(renderToStaticMarkup(React.createElement(PublishValidationErrors,{issues:[]})), '');
  const text=target();text.config.title='x'.repeat(21);text.config.body='x'.repeat(1001);text.config.topics=['x'.repeat(41)];text.config.comment='x'.repeat(2001);
  assert.deepEqual(inspect([text]).map(issue=>issue.field),['body','topics','comment']);
  text.config.title='x'.repeat(501);assert.ok(inspect([text]).some(issue=>issue.field==='title'));
  const wechat=target();wechat.account.platform='wechat';wechat.media={id:'qa-video',mediaType:'video',files:[{name:'qa.mp4',size:100}]};wechat.config.title='原主标题';wechat.config.extras={短标题:'字'.repeat(17)};
  assert.ok(inspect([wechat]).some(issue=>issue.field==='extras.短标题'));wechat.config.extras={};assert.deepEqual(inspect([wechat]),[]);
  const bili=target();bili.account.platform='bilibili';bili.media=structuredClone(wechat.media);bili.config.options.originality='转载';assert.ok(inspect([bili]).some(issue=>issue.field==='extras.转载来源'));
  bili.config.extras={转载来源:'本人已授权来源'};assert.ok(inspect([bili]).some(issue=>issue.field==='extras.创作声明'));
  bili.config.extras.创作声明='随便选择';assert.ok(inspect([bili]).some(issue=>issue.field==='extras.创作声明'));
  bili.config.extras.创作声明='内容无需标注';assert.deepEqual(inspect([bili]),[]);
  for(const length of [250,251,1001,1999,2000]){const longBili=structuredClone(bili);longBili.config.body='字'.repeat(length);longBili.config.topics=['独立标签'];assert.deepEqual(inspect([longBili]),[],`Official Bili description supports${length}, tagsareseparate`);}
  const overBili=structuredClone(bili);overBili.config.body='字'.repeat(2001);assert.ok(inspect([overBili]).some(issue=>issue.field==='body'&&issue.message.includes('2000')));assert.equal(overBili.config.body.length,2001,'Do not truncate rejected text');
  for(const topics of [Array.from({length:11},(_,i)=>'标签'+i),['字'.repeat(21)]]){const invalidTags=structuredClone(bili);invalidTags.config.topics=topics;assert.ok(inspect([invalidTags]).some(issue=>issue.field==='topics'&&issue.message.includes('B站')));assert.deepEqual(invalidTags.config.topics,topics);}
  const missingDeclaration=structuredClone(bili);delete missingDeclaration.config.extras.创作声明;
  const declarationQueue=createPublishQueue({current:()=>true,changed:()=>{throw Error('Invalid declaration may not create a task');},prepare:async()=>{throw Error('Invalid declaration may not open an official page');}});
  assert.throws(()=>declarationQueue.start([missingDeclaration]),/创作声明/);assert.equal(declarationQueue.jobs.length,0);
  for(const platform of ['wechat','bilibili']) {
    const unsupported={...structuredClone(platform==='wechat'?wechat:bili),media:target().media};
    assert.match(inspect([unsupported]).find(issue=>issue.field==='media').message,/当前一键发布仅适配视频/);
    assert.throws(()=>declarationQueue.start([unsupported]),/暂不支持图文/);assert.equal(declarationQueue.jobs.length,0);
  }
  assert.deepEqual(inspect([{...target(),account:{...target().account,platform:'douyin'}}]),[]);
  const account=target();account.account.connectorSessionId=undefined;assert.ok(inspect([account]).some(issue=>issue.field==='account'));
  const media=target();media.media.files[0].size=0;assert.ok(inspect([media]).some(issue=>issue.field==='media'));
  media.media.files[0]={name:'wrong.exe',size:1};assert.ok(inspect([media]).some(issue=>issue.field==='media'));
  const cover=target();cover.config.covers=[{id:'same',name:'one.png',index:1},{id:'other',name:'two.png',index:1}];assert.ok(inspect([cover]).some(issue=>issue.field==='covers'));
  let preparations=0,uploads=0,emits=0;
  const queue=createPublishQueue({current:()=>true,changed:()=>emits++,prepare:async()=>{preparations++;},upload:async()=>{uploads++;}});
  assert.throws(()=>queue.startMany([[target()],[invalid]]),/标题/);
  assert.equal(queue.jobs.length,0);assert.equal(preparations,0);assert.equal(uploads,0);assert.equal(emits,0);assert.equal(queue.running,false);
  let checks=0;
  assert.deepEqual(await checkPublishMedia([target(),target('another')],async()=>{checks++;return{valid:true};},()=>true),[]);assert.equal(checks,1,'Shared media/cover handles are checked once, not once per account');
  const failed=await checkPublishMedia([target(),{...target('another'),item:2}],async()=>({error:'原素材已移动或修改，请重新选择'}),()=>true);
  assert.equal(failed.length,2);assert.equal(failed[1].item,2);assert.match(failed[0].message,/移动或修改/);
  let current=true;
  await assert.rejects(checkPublishMedia([target()],async()=>{current=false;return{valid:true};},()=>current),/登录用户已变化/);
  let late;
  const timeout=await checkPublishMedia([target()],()=>new Promise(resolve=>{late=resolve}),()=>true,5);assert.match(timeout[0].message,/校验超时/);late({valid:true});assert.equal(queue.jobs.length,0);
  const controller=new AbortController();
  const cancelCheck=checkPublishMedia([target()],()=>new Promise(()=>{}),()=>true,20,{signal:controller.signal});
  controller.abort();await assert.rejects(cancelCheck,/已取消发布前检查/);
  let boundedChecks=0,elapsed=0;
  const many=Array.from({length:12},(_,index)=>({...target(`deadline-${index}`),media:{...target().media,id:`qa-selection-${index}`}}));
  // Move the monotonic clock to the deadline during the first batch. Do not
  // rely on sub-millisecond timer scheduling to prove the next batch is blocked.
  const originalNow=Object.getOwnPropertyDescriptor(performance,'now');
  Object.defineProperty(performance,'now',{value:()=>elapsed,configurable:true});
  let overall;
  try { overall=await checkPublishMedia(many,()=>{boundedChecks++;elapsed=1;return new Promise(()=>{});},()=>true,20,{totalTimeoutMs:1}); }
  finally { if(originalNow)Object.defineProperty(performance,'now',originalNow);else delete performance.now; }
  assert.equal(overall.length,12);assert.ok(boundedChecks<=4,'The whole preflight deadline must stop starting more groups, not wait 15 seconds per group batch');
  const checkProgress=[];
  await checkPublishMedia([target(),{...target('other-media'),media:{...target().media,id:'qa-other-media'}}],async()=>({valid:true}),()=>true,20,{onProgress:progress=>checkProgress.push(progress)});
  assert.deepEqual(checkProgress,[{done:0,total:2},{done:2,total:2}]);
  const calls={}, {registerPersonalAssist}=require('../desktop/personal-assist.cjs');let modified=1,chooseAllowed=false;
  const emptyFiles=new Set();
  registerPersonalAssist({ipcMain:{handle:(name,handler)=>{calls[name]=handler;}},getWindow:()=>({webContents:{id:11}}),platforms:{wechat:{domain:'weixin.qq.com'},bilibili:{domain:'bilibili.com'}},authenticate:async token=>{if(token!=='qa-token')throw Error('请先登录远效');return{userId:'qa-only-owner'};},statFile:file=>({isFile:()=>true,size:emptyFiles.has(path.basename(file))?0:1024,mtimeMs:modified}),dialog:{showOpenDialog:()=>{assert.equal(chooseAllowed,true,'Validation must not open a chooser');return{filePaths:[path.join(os.tmpdir(),'chosen-cover.png')]};}},webContents:{fromId:()=>{throw Error('Validation must not touch a browser');}}});
  const event={sender:{id:11}},importFile=(name,type)=>calls['matrix:import-media'](event,{mediaType:type,paths:[path.join(os.tmpdir(),name)]});
  for(const platform of ['wechat','bilibili']) {
    const upload=changes=>calls['matrix:upload-media'](event,{platform,mediaType:'image',...changes});
    assert.match((await upload({})).error,/暂不支持图文.*未交付任何素材/);
    // A video cover is a separate image operation and must reach normal guards,
    // not be rejected as an unsupported gallery (no real browser here).
    assert.match((await upload({coverIndex:1})).error,/Validation must not touch a browser/);
  }
  const selected=(await importFile('qa-only.mp4','video')).selection;
  const validate=(patch={},sender=event)=>calls['matrix:validate-publish-media'](sender,{accessToken:'qa-token',selectionId:selected.id,covers:[],...patch});
  assert.equal((await validate()).valid,true);
  assert.ok((await validate({}, {sender:{id:22}})).error);
  assert.ok((await validate({accessToken:'expired'})).error);
  assert.ok((await validate({selectionId:'not-present'})).error);
  const image=(await importFile('qa-only-cover.png','image')).selection;
  assert.equal((await validate({covers:[{id:image.id,index:1}]})).valid,true);
  emptyFiles.add('empty-image.png');assert.match((await importFile('empty-image.png','image')).error,/素材为空/);
  emptyFiles.add('qa-only-cover.png');assert.match((await validate({covers:[{id:image.id,index:1}]})).error,/封面1.*素材为空/);emptyFiles.clear();
  assert.match((await validate({covers:[{id:selected.id,index:1}]})).error,/单张图片/);
  modified++;assert.match((await validate()).error,/已移动或修改/);
  const retained=(await importFile('batch-first.mp4','video')).selection;
  for(let i=0;i<40;i++)await importFile(`batch-${i}.mp4`,'video');
  assert.equal((await validate({selectionId:retained.id})).valid,true,'A normal batch of more than 32 files must retain its first selection');
  chooseAllowed=true;
  const chosen=(await calls['matrix:choose-media'](event,{mediaType:'image'})).selection;
  chooseAllowed=false;
  assert.equal((await validate({selectionId:retained.id,covers:[{id:chosen.id,index:1}]})).valid,true,'Choosing a cover must not invalidate the first media in a normal batch');
  const job={stage:'failed',executionStage:'filling',completedSteps:['preparing','uploading'],attemptId:'qa-attempt',history:[],message:'标题输入框未识别',config:target().config};
  const steps=renderToStaticMarkup(React.createElement(PublishStepProgress,{job}));
  assert.match(steps,/data-publish-step="uploading" data-step-state="已完成"/);assert.match(steps,/data-publish-step="filling" data-step-state="停在此步"/);assert.match(steps,/data-publish-step="submitting" data-step-state="未开始"/);
  assert.equal(renderToStaticMarkup(React.createElement(PublishStepProgress,{job:{...job,completedSteps:undefined}})),'');
  const stageNote=patch=>renderToStaticMarkup(React.createElement(PublishTaskStageNote,{job:{...job,...patch}}));
  assert.match(stageNote({stage:'uploading',message:'素材上传100%，官方仍在转码 / 生成封面，尚未进入下一步'}),/仍在转码/);
  assert.match(stageNote({stage:'attention',message:'填写作品信息：请在官方页面选择作品分类'}),/请选择|选择作品分类/);
  assert.match(stageNote({stage:'unknown'}),/勿重复提交/);
  assert.equal(stageNote({stage:'confirmed'}),'');
  console.log(JSON.stringify({publishPreflight:'passed',allErrorsCollected:true,noInvalidTasksOrNavigation:true,localFilesCheckedWithoutUpload:true,mediaCheckDeadlineAndOwnerGuard:true,completionTicksEvidenceOnly:true,servicesStarted:false,realPlatformActions:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
