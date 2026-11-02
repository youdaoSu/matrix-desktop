// Explicit user-started, bounded traversal of an already open OWN panel.
// Opaque account-scoped cursors; rows committed before the next scroll.
const {randomUUID}=require('node:crypto');
const {createOperationBudget}=require('./operation-budget.cjs');
const SOURCE='official-open-panel-v1';
function registerFollowerPagination({ipcMain,getWindow,authenticate,read,cacheFor,project,failure,diagnostics,now=Date.now,gapMs=1500}){
 const jobs=new Map(),locks=new Set(),inspectionTimes=new Map();let closed=false;
 const scopeOf=auth=>JSON.stringify([auth.userId,auth.account?.id,auth.account?.connectorSessionId,auth.account?.nativeAccountKey]);
 const progress=job=>({source:SOURCE,status:job.status,seen:job.seen.size,steps:job.steps,reason:job.reason||'',updatedAt:new Date(now()).toISOString()});
 // Return the remaining native deadline, not another full delay after IPC,
 // ownership checks and durable writes have already consumed that time.
 const answer=job=>({accountId:job.accountId,sessionId:job.sessionId,cursor:job.id,loaded:job.seen.size,avatars:job.avatars.size,complete:job.status==='complete',status:job.status,reason:job.reason||'',retryAfterMs:Math.max(0,job.nextAt-now())});
 const checkpoint=(job,code)=>{try{diagnostics?.record(job.scope,{kind:'followers',stage:'follower-checkpoint',code,stats:{recordCount:job.seen.size,avatarSources:job.avatars.size,followerPages:job.steps}});}catch{}};
 const persist=(job,rows=[])=>cacheFor(job.scope,'followers').merge({kind:'followers',records:rows,complete:job.status==='complete',capturedAt:new Date(now()).toISOString(),followerPanelSync:progress(job)});
 const pause=(job,reason)=>{job.status='paused';job.reason=reason;persist(job);checkpoint(job,'follower-paused');return answer(job);};
 ipcMain.handle('matrix:douyin-followers-sync',async(event,input)=>{
  const budget=createOperationBudget(30000);let key,locked=false,ended=false,invalidated=false,job,rollback,phase=0;
  try{
   const win=getWindow();if(closed||!win||win.isDestroyed?.()||event.sender!==win.webContents)throw Error('仅允许远效主窗口同步官网粉丝');
   if(!input||Object.keys(input).some(k=>!['accessToken','accountId','webContentsId','command','cursor'].includes(k))||typeof input.accessToken!=='string'||!input.accessToken||typeof input.accountId!=='string'||!input.accountId||!Number.isSafeInteger(input.webContentsId)||input.webContentsId<=0||!['prepare','inspect','start','next','pause','resume'].includes(input.command)||['start','prepare','inspect'].includes(input.command)&&input.cursor!==undefined||!['start','prepare','inspect'].includes(input.command)&&(typeof input.cursor!=='string'||!/^[a-f0-9-]{36}$/.test(input.cursor)))throw Error('官网粉丝自动分页参数无效');
   const auth=await budget.run(()=>authenticate(input.accessToken,input.accountId),'验证官网分页账号',8000),account=auth.account;
   if(!account||account.id!==input.accountId||account.platform!=='douyin'||!/^[a-f0-9-]{16,80}$/i.test(account.connectorSessionId||'')||!account.nativeAccountKey)throw Error('请在账号管理绑定抖音本人账号');
   key=scopeOf(auth);if(locks.has(key))throw Error('此账号的官网分页正在读取，请稍候');locks.add(key);locked=true;
   const guard=async()=>{budget.check();if(ended||closed){invalidated=true;throw Error('官网分页已结束，原名单保留');}let fresh;try{fresh=await budget.run(()=>authenticate(input.accessToken,input.accountId),'复核官网分页账号',8000);}catch(error){invalidated=true;throw error;}if(ended||closed||fresh.account?.platform!=='douyin'||scopeOf(fresh)!==key){invalidated=true;throw Error('账号绑定已变化，官网分页结果丢弃');}};
   const page=options=>budget.run(()=>read({account,webContentsId:input.webContentsId,assertCurrent:guard,pagination:options}),'读取官网粉丝分页',12000);
   if(input.command==='inspect'){
    if([...jobs.values()].some(value=>value.scope===key&&value.status==='running'))throw Error('请先完成或暂停粉丝同步，再单次检测接口响应');
    for(const [scope,stamp]of inspectionTimes)if(now()-stamp>3600000)inspectionTimes.delete(scope);
    if(inspectionTimes.has(key)&&now()-inspectionTimes.get(key)<60000)throw Error('此账号最近已检测接口，请一分钟后再手动检测；不会自动重试');
    if(!inspectionTimes.has(key)&&inspectionTimes.size>=128)throw Error('接口检测达到本轮安全容量，请稍后继续');
    inspectionTimes.set(key,now());
    phase=6;const result=await page({action:'inspect'});await guard();const facts=result.facts;
    if(!facts||!['responseStatus','responseMime','responseEncoding','responseReadError','responseBytes','responseBodyKind'].every(k=>Number.isSafeInteger(facts[k])&&facts[k]>=0&&facts[k]<=2*1024*1024)||!['responseJsonValid','responseRosterShape','responseApiAccepted'].every(k=>typeof facts[k]==='boolean'))throw Error('接口响应检测元数据结构未识别，未采用');
    try{diagnostics?.record(key,{kind:'followers',stage:'follower-api-inspect',code:facts.responseReadError===4?'timeout':facts.responseStatus===0||facts.responseReadError===3?'transport':facts.responseStatus!==200?'http-denied':facts.responseRosterShape?'read-ok':result.platformCode!==undefined&&result.platformCode!==0?'platform-denied':'schema',stats:facts});}catch{}
    return {accountId:account.id,sessionId:account.connectorSessionId,inspection:facts,...(Number.isSafeInteger(result.platformCode)?{platformCode:result.platformCode}:{})};
   }
   if(input.command==='prepare'){
    phase=1;const result=await page({action:'prepare'});await guard();
    const counters={};
    for(const [field,target]of [['follower_count','followerOwnCount'],['mplatform_followers_count','followerMultiPlatformCount']]){
     const value=result.counterEvidence?.[field];if(Number.isSafeInteger(value)&&value>=0&&value<=2147483647)counters[target]=value;
    }
    try{diagnostics?.record(key,{kind:'followers',stage:'follower-auto-prepare',code:result.ready?'read-ok':'page-not-ready',stats:{followerPrepareStage:phase,...(result.ready?counters:{})}});}catch{}
    return {accountId:account.id,sessionId:account.connectorSessionId,ready:result.ready===true,waiting:result.waiting===true,reason:result.reason||'本人粉丝面板已核验'};
   }
   // A live feature-owned guest is retained across account/route switches.
   // Paused jobs keep their lease until explicit reset, binding change or quit;
   // wall-clock idle time alone must not silently discard that exact position.
   for(const [id,value]of jobs)if(input.command==='start'&&value.status==='complete'||typeof read.isAlive==='function'&&!read.isAlive(value.guest))jobs.delete(id);
   if(input.command==='start'){
    for(const [id,value]of jobs)if(value.scope===key)jobs.delete(id);
    if(jobs.size>=4)throw Error('同时同步的官网粉丝账号达到上限，请先暂停其他账号');
    job={id:randomUUID(),scope:key,accountId:account.id,sessionId:account.connectorSessionId,guest:input.webContentsId,seen:new Set(),avatars:new Set(),fingerprints:new Map(),steps:0,stalls:0,status:'running',nextAt:now()+gapMs,lastAt:now()};
    phase=2;const reset=await page({action:'reset',lease:job.id});await guard();
    if(!/^[1-9]\d{0,18}$/.test(reset?.ownerUid||'')||reset?.page?.top!==0)throw Error('官网粉丝面板未能从顶部开始，未判定全量');
    job.ownerUid=reset.ownerUid;job.top=0;job.height=reset.page.height;job.nextAt=now()+gapMs;jobs.set(job.id,job);persist(job);return answer(job);
   }
   job=jobs.get(input.cursor);if(!job||job.scope!==key||job.guest!==input.webContentsId)throw Error('官网分页断点已释放或不属于此账号；已保存名单保留，请从顶部重新核验');
   job.lastAt=now();
   if(input.command==='pause'){await guard();return job.status==='complete'?answer(job):pause(job,'已暂停，已保存成员和当前面板断点保留');}
   if(input.command==='resume'){
    await guard();if(job.status==='complete'||job.status==='running')return answer(job);
    // Resume only this still-live owner/lease. Recheck official restrictions
    // before restoring its exact position; never reset, guess a new panel or
    // discard the members already durably committed by this run.
    phase=3;const resumed=await page({action:'resume',lease:job.id,ownerUid:job.ownerUid,expectedTop:job.top});await guard();
    if(resumed?.ownerUid!==job.ownerUid||!Number.isSafeInteger(resumed?.page?.top)||Math.abs(resumed.page.top-job.top)>2)throw Error('官网分页原断点未能恢复，名单和断点保留，未从顶部重读');
    job.status='running';job.reason='';job.stalls=0;job.pendingChecks=0;job.endProof=undefined;job.nextAt=now()+gapMs;persist(job);checkpoint(job,'follower-resumed');return answer(job);
   }
   if(job.status!=='running')return answer(job);
   if(now()<job.nextAt)return answer(job);
   if(job.steps>=10000||job.seen.size>=50000)return pause(job,'达到本轮安全容量，已有名单保留，尚不能称为全量');
   // Save the first top viewport before considering a bounded full-DOM read.
   // A small already-loaded list can then be verified in one snapshot rather
   // than traversed over hundreds of overlapping steps. Unknown/large counts,
   // virtual gaps and uncorroborated rows never earn a bottom jump.
   const smallList=Number.isSafeInteger(job.loadedCount)&&job.loadedCount>=0&&job.loadedCount<=400;
   const whole=job.steps>0&&smallList&&(job.slow===false||job.fullProbeCount!==job.loadedCount);
   if(whole)job.fullProbeCount=job.loadedCount;
   phase=3;const result=await page({action:'read',lease:job.id,ownerUid:job.ownerUid,expectedTop:job.top,viewportOnly:!whole});await guard();
   const info=result?.page;
   if(result.ownerUid!==job.ownerUid||!Array.isArray(result.followers)||result.followers.length>1000||!info||!['top','height','view'].every(k=>Number.isSafeInteger(info[k])&&info[k]>=0&&info[k]<=100000000)||info.view<40||Math.abs(info.top-job.top)>2||typeof info.end!=='boolean'||typeof info.empty!=='boolean')throw Error('官网粉丝分页位置或归属不一致，断点保留');
   if(info.pending===true){
    if(info.pendingIdentity!==undefined&&typeof info.pendingIdentity!=='boolean')throw Error('官网粉丝卡片等待状态结构未识别，原名单保留');
    if(info.identityCandidateKind!==undefined&&(!Number.isInteger(info.identityCandidateKind)||info.identityCandidateKind<1||info.identityCandidateKind>3))throw Error('官网粉丝卡片种类未识别，原名单保留');
    for(const field of ['identityFailureMask','identityImageFacts'])if(info[field]!==undefined&&(!Number.isInteger(info[field])||info[field]<0||info[field]>63))throw Error('官网粉丝卡片校验信息未识别，原名单保留');
    // A prior full-DOM success is only an optimization, not a promise that
    // later appended offscreen cards are already hydrated. Drop fast mode
    // after an incomplete whole-page probe, so the next read can verify the
    // unchanged viewport and advance normally. Never skip a visible identity,
    // retry a refusal/conflict, or relax the final loaded-count proof.
    if(whole){job.slow=true;job.wholeProbeDeferrals=(job.wholeProbeDeferrals||0)+1;}
    job.pendingChecks=(job.pendingChecks||0)+1;job.nextAt=now()+gapMs;job.reason=info.pendingIdentity?'正在等待官网粉丝卡片提供精确身份；当前滚动位置和已有名单保留，未猜测匹配':'正在等待官网粉丝成员加载，当前滚动位置和已有名单保留；未判定为空或全量';
    if(job.pendingChecks>=20){try{diagnostics?.record(key,{kind:'followers',stage:'follower-auto-page',code:info.pendingIdentity?'schema':'timeout',stats:{followerPrepareStage:phase,recordCount:job.seen.size,followerWholeProbeDeferrals:job.wholeProbeDeferrals||0,followerIdentityCandidateKind:info.identityCandidateKind,followerIdentityFailureMask:info.identityFailureMask,followerIdentityImageFacts:info.identityImageFacts,complete:false}});}catch{}return pause(job,info.pendingIdentity?'等待官网粉丝卡片身份就绪超时，已暂停，已有名单和断点保留，未判定全量':'等待官网粉丝成员加载超时，已暂停，已有名单和断点保留，未判定全量');}
    return answer(job);
   }
   for(const field of ['memberProofRows','missingControlRows','anchoredNameProofRows','linkedAvatarProofRows'])if(info[field]!==undefined&&(!Number.isSafeInteger(info[field])||info[field]<0||info[field]>(field==='anchoredNameProofRows'?2000:1000)))throw Error('官网成员校验计数结构未识别，原名单保留');
   job.memberProofReads=(job.memberProofReads||0)+(info.memberProofRows||0);job.missingControlReads=(job.missingControlReads||0)+(info.missingControlRows||0);
   job.anchoredNameProofReads=(job.anchoredNameProofReads||0)+(info.anchoredNameProofRows||0);
   job.linkedAvatarProofReads=(job.linkedAvatarProofReads||0)+(info.linkedAvatarProofRows||0);
   job.pendingChecks=0;job.reason='';
   if(info.empty&&(job.seen.size||result.followers.length))throw Error('官网空名单提示与已读成员不一致，未标记全量');
   const rows=result.followers.map(project),ids=rows.map(row=>row.platformId);if(new Set(ids).size!==ids.length)throw Error('官网粉丝分页包含重复编号，本页未保存');
   job.loadedCount=Number.isSafeInteger(info.loadedCount)&&info.loadedCount>=0&&info.loadedCount<=50000?info.loadedCount:undefined;
   job.slow=!(whole&&info.fullDom===true&&job.loadedCount<=400&&info.loadedCount===rows.length);
   const changed=[],newIds=[],newAvatars=[],oldFingerprints=new Map();let added=0;
   rollback=()=>{for(const id of newIds)job.seen.delete(id);for(const id of newAvatars)job.avatars.delete(id);for(const [id,value]of oldFingerprints)if(value===undefined)job.fingerprints.delete(id);else job.fingerprints.set(id,value);};
   for(const row of rows){if(!job.seen.has(row.platformId)){job.seen.add(row.platformId);newIds.push(row.platformId);added++;}if(row.avatarUrl&&!job.avatars.has(row.platformId)){job.avatars.add(row.platformId);newAvatars.push(row.platformId);}const bytes=JSON.stringify(row);if(job.fingerprints.get(row.platformId)!==bytes){oldFingerprints.set(row.platformId,job.fingerprints.get(row.platformId));job.fingerprints.set(row.platformId,bytes);changed.push(row);}}
   const commit=()=>{phase=4;persist(job,changed);rollback=undefined;};
   if(job.seen.size>50000)throw Error('官网粉丝分页超过安全容量，原名单保留');
   job.steps++;job.nextAt=now()+gapMs;
   const bottom=info.top+info.view>=info.height-2,end=bottom&&info.end&&(job.seen.size>0||info.empty);
   if(end&&Number.isSafeInteger(info.loadedCount)&&info.loadedCount>job.seen.size){
    job.status='paused';job.reason=`官网已显示末页，但 ${info.loadedCount} 位已加载成员中仅确认 ${job.seen.size} 位，未标记全量；请从顶部重新核验，原名单保留`;commit();
    try{diagnostics?.record(key,{kind:'followers',stage:'follower-auto-page',code:'follower-list-shape',stats:{recordCount:job.seen.size,followerPanelUserListCount:info.loadedCount,followerAnchoredNameProofReads:job.anchoredNameProofReads,complete:false}});}catch{}
    return answer(job);
   }
   const proof=JSON.stringify([info.height,job.seen.size,info.empty]);
   if(end&&job.endProof===proof){job.status='complete';job.reason='已从顶部连续读取至官网明确末页；粉丝指数未作为人数，历史记录未删除';commit();try{diagnostics?.record(key,{kind:'followers',stage:'follower-auto-page',code:'follower-pagination-complete',stats:{recordCount:job.seen.size,avatarSources:job.avatars.size,followerPages:job.steps,followerMemberProofReads:job.memberProofReads,followerMissingControlReads:job.missingControlReads,followerAnchoredNameProofReads:job.anchoredNameProofReads,followerLinkedAvatarProofReads:job.linkedAvatarProofReads,followerWholeProbeDeferrals:job.wholeProbeDeferrals||0,...(Number.isSafeInteger(info.loadedCount)?{followerPanelUserListCount:info.loadedCount}:{}),complete:true}});}catch{}return answer(job);}
   job.endProof=end?proof:undefined;
   if(changed.length)commit();else rollback=undefined;
   try{diagnostics?.record(key,{kind:'followers',stage:'follower-auto-page',code:'read-ok',stats:{recordCount:job.seen.size,avatarSources:job.avatars.size,followerPages:job.steps,followerMemberProofReads:job.memberProofReads,followerMissingControlReads:job.missingControlReads,followerAnchoredNameProofReads:job.anchoredNameProofReads,followerLinkedAvatarProofReads:job.linkedAvatarProofReads,followerWholeProbeDeferrals:job.wholeProbeDeferrals||0,complete:false}});}catch{}
   if(end)return answer(job);
   const unchanged=!added&&info.height===job.height;
   job.height=info.height;
   phase=5;const moved=await page({action:'advance',lease:job.id,ownerUid:job.ownerUid,expectedTop:info.top,fast:!job.slow&&Number.isSafeInteger(info.loadedCount)&&info.loadedCount===job.seen.size});await guard();
   if(!Number.isSafeInteger(moved?.page?.top)||moved.ownerUid!==job.ownerUid)throw Error('官网粉丝滚动位置未核验，已暂停');
   // Already-loaded full DOM may yield every ID on the first read while its
   // conservative coverage check still requires an overlapping traversal.
   // Real scrolling progress is not a stalled network/read just because IDs
   // are unchanged. Only stationary position plus unchanged data can stall.
   job.stalls=unchanged&&moved.page.top===info.top?job.stalls+1:0;
   job.top=moved.page.top;
   // Anchor the minimum interval after the actual scroll/load trigger. The
   // renderer can subtract completed local work without increasing its rate.
   job.nextAt=now()+gapMs;
   if(job.stalls>=8)return pause(job,'官网未继续加载或未给出明确末页，已暂停；断点和已读成员保留，未判定全量');
   return answer(job);
  }catch(error){rollback?.();if(invalidated||closed){if(job)jobs.delete(job.id);return {error:failure(error)};}if(key)try{diagnostics?.record(key,{kind:'followers',stage:phase===1?'follower-auto-prepare':phase===6?'follower-api-inspect':'follower-auto-page',code:require('./douyin-sync-diagnostics.cjs').classifySyncFailure(error),stats:{followerPrepareStage:phase,recordCount:job?.seen.size||0,followerWholeProbeDeferrals:job?.wholeProbeDeferrals||0,complete:false}});}catch{}if(job&&job.scope===key){job.status='paused';job.reason=failure(error);try{persist(job);}catch{}return {...answer(job),error:job.reason};}return {error:failure(error)};}
  finally{ended=true;if(locked)locks.delete(key);}
 });
 return {state(scope){const job=[...jobs.values()].find(value=>value.scope===scope);return job?progress(job):undefined;},close(){closed=true;jobs.clear();locks.clear();inspectionTimes.clear();}};
}
module.exports={registerFollowerPagination,SOURCE};
