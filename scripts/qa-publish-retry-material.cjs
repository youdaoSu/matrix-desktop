// Source-only recovery tests. No real account, profile, picker, or platform.
const assert = require('node:assert/strict');
const { retryPublishMaterial } = require('./qa-load-typescript.cjs').loadTs('client/src/components/workspace/publish-retry-material.ts');
const { createPublishQueue } = require('./qa-load-typescript.cjs').loadTs('client/src/components/workspace/publish-queue.ts');
const account = { id:'qa-owner-account', platform:'wechat', nickname:'QA owner', connectorSessionId:'qa-session' };
const config = { title:'QA preserved title', body:'QA preserved description', topics:['QA'], comment:'', options:{visibility:'仅自己可见'}, covers:[{id:'old-cover',name:'original.jpg',index:1}] };
const media = {id:'new-video',mediaType:'video',files:[{name:'original.mp4',size:10}]};
const cover = {id:'new-cover',mediaType:'image',files:[{name:'original.jpg',size:1}]};
const job = {id:'original-task',batchId:'original-batch',accountId:account.id,platform:account.platform,nickname:account.nickname,title:config.title,files:['original.mp4'],mediaType:'video',config,recoveryId:'old-recovery',stage:'failed',submission:'not_submitted',message:'not submitted',history:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
function fixture(overrides={}) {
  const calls={restore:0,picks:[],notices:[]};
  const deps={account,assertCurrent:()=>{},restore:async()=>{calls.restore++;return {error:'原素材记录不可用，请重新选择素材',code:'PUBLISH_MEDIA_RESELECT_REQUIRED'};},choose:async type=>{calls.picks.push(type);return {selection:type==='video'?media:cover};},notify:message=>calls.notices.push(message),...overrides};
  return {deps,calls};
}
(async()=>{
  let checks=0, f=fixture(), before=JSON.stringify(job);
  const replacement=await retryPublishMaterial(job,f.deps);
  assert.deepEqual(f.calls.picks,['video','image']);assert.equal(f.calls.restore,1);assert.equal(replacement.config.title,config.title);assert.equal(replacement.config.body,config.body);assert.deepEqual(replacement.config.options,config.options);assert.equal(replacement.config.covers[0].index,1);assert.equal(replacement.config.covers[0].id,cover.id);assert.equal(JSON.stringify(job),before);checks+=8;
  f=fixture({restore:async()=>({selection:media,covers:[{id:cover.id,name:'original.jpg',index:1}]})});
  assert.equal((await retryPublishMaterial(job,f.deps)).media.id,media.id);assert.deepEqual(f.calls.picks,[]);checks+=2;
  for(const error of ['登录已失效','该会话不属于当前用户','仅允许远效主窗口恢复素材']) {
    f=fixture({restore:async()=>({error})});await assert.rejects(()=>retryPublishMaterial(job,f.deps),new RegExp(error));assert.deepEqual(f.calls.picks,[]);checks+=2;
  }
  for(const stage of ['unknown','confirmed','submitting']) {
    f=fixture();await assert.rejects(()=>retryPublishMaterial({...job,stage,submission:'uncertain'},f.deps),/不能直接重发/);assert.equal(f.calls.restore,0);assert.deepEqual(f.calls.picks,[]);checks+=3;
  }
  f=fixture({choose:async()=>({})});await assert.rejects(()=>retryPublishMaterial(job,f.deps),/取消选择素材/);assert.equal(JSON.stringify(job),before);checks+=2;
  let selections=0;
  f=fixture({choose:async()=>++selections===1?{selection:media}:{}});await assert.rejects(()=>retryPublishMaterial(job,f.deps),/取消选择封面/);assert.equal(JSON.stringify(job),before);checks+=2;
  f=fixture({choose:async()=>({selection:cover})});await assert.rejects(()=>retryPublishMaterial(job,f.deps),/类型不一致/);checks++;
  let current=true;
  f=fixture({assertCurrent:()=>{if(!current)throw Error('登录用户已切换');},restore:async()=>{current=false;return {error:'missing',code:'PUBLISH_MEDIA_RESELECT_REQUIRED'};}});
  await assert.rejects(()=>retryPublishMaterial(job,f.deps),/登录用户已切换/);assert.deepEqual(f.calls.picks,[]);checks+=2;
  current=true;
  f=fixture({assertCurrent:()=>{if(!current)throw Error('登录用户已切换');},choose:async()=>{current=false;return {selection:media};}});
  await assert.rejects(()=>retryPublishMaterial(job,f.deps),/登录用户已切换/);checks++;
  f=fixture({previous:{account,config,media}});await retryPublishMaterial({...job,recoveryId:undefined},f.deps);assert.equal(f.calls.restore,0);assert.deepEqual(f.calls.picks,[]);checks+=2;
  f=fixture();await retryPublishMaterial({...job,recoveryId:undefined},f.deps);assert.deepEqual(f.calls.picks,['video','image']);checks++;
  // Automatic cover is an explicit same-row choice. Restoring a video must
  // neither validate/reselect a stale cover nor resurrect it from prior handles.
  let skipped;
  f=fixture({restore:async(_id,skip)=>{skipped=skip;return {selection:media,covers:[]};}});
  const automatic=await retryPublishMaterial(job,f.deps,{automaticCover:true});
  assert.equal(skipped,true);assert.deepEqual(automatic.config.covers,[]);assert.equal(automatic.config.title,config.title);assert.equal(automatic.config.body,config.body);assert.deepEqual(automatic.config.topics,config.topics);assert.deepEqual(automatic.config.options,config.options);assert.equal(JSON.stringify(job),before);checks+=7;
  f=fixture();await retryPublishMaterial(job,f.deps,{automaticCover:true});assert.deepEqual(f.calls.picks,['video']);checks++;
  f=fixture({previous:{account,config,media}});assert.deepEqual((await retryPublishMaterial({...job,recoveryId:undefined},f.deps,{automaticCover:true})).config.covers,[]);assert.deepEqual(f.calls.picks,[]);checks+=2;
  f=fixture({restore:async(_id,skip)=>{skipped=skip;return {selection:media,covers:[{id:'must-not-resurrect',name:'stale.jpg',index:1}]};}});
  assert.deepEqual((await retryPublishMaterial({...job,config:{...config,covers:[]}},f.deps)).config.covers,[]);assert.equal(skipped,true);checks+=2;
  f=fixture();await assert.rejects(()=>retryPublishMaterial({...job,mediaType:'image'},f.deps,{automaticCover:true}),/暂不支持图文/);assert.equal(f.calls.restore,0);assert.deepEqual(f.calls.picks,[]);checks+=3;
  for(const platform of ['wechat','bilibili']){
    f=fixture({account:{...account,platform}});await assert.rejects(()=>retryPublishMaterial({...job,mediaType:'image'},f.deps),/暂不支持图文/);assert.equal(f.calls.restore,0);assert.deepEqual(f.calls.picks,[]);checks+=3;
  }
  for(const submission of ['rejected','user_confirmed_absent']){
    f=fixture();const knownFailed=await retryPublishMaterial({...job,submission,receiptId:'retained-original-receipt'},f.deps,{automaticCover:true});assert.deepEqual(knownFailed.config.covers,[]);assert.deepEqual(f.calls.picks,['video']);assert.equal(job.receiptId,undefined);checks+=3;
  }
  // Run the replacement through the actual queue: same row, unrelated rows
  // untouched, and all external work replaced by in-memory fixture functions.
  const unrelated={...job,id:'other-task',accountId:'other-account'};
  const queue=createPublishQueue({current:()=>true,changed:()=>{},sleep:async()=>{},prepare:async request=>({accountId:request.account.id}),upload:async()=>({uploadStarted:true}),cover:async()=>({uploadStarted:true,coverConfirmed:true}),fill:async()=>({filled:['title'],unresolved:[]}),progress:async()=>({ready:true}),inspect:async()=>({nonce:'qa-only',candidates:[{index:0}]}),submit:async entries=>({results:entries.map(entry=>({accountId:entry.accountId,receipt:{id:'qa-receipt',status:'confirmed',message:'QA fixture result'}}))})},[job,unrelated]);
  queue.retry(job.id,replacement);
  for(let n=0;n<500&&queue.running;n++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(queue.running,false);assert.equal(queue.jobs.length,2);assert.equal(queue.jobs.find(item=>item.id===job.id).stage,'confirmed');assert.deepEqual(queue.jobs.find(item=>item.id===unrelated.id),unrelated);checks+=4;
  console.log(JSON.stringify({retryMaterialChecks:checks,realProfileRead:false,realPlatformActions:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
