// Pure handler fixtures. No real profile, network, publication or credential read.
const assert=require('node:assert/strict');
const {registerPageActions}=require('../desktop/page-actions.cjs');
const urls={douyin:'https://creator.douyin.com/creator-micro/content/manage',xiaohongshu:'https://creator.xiaohongshu.com/new/note-manager',bilibili:'https://member.bilibili.com/platform/upload-manager/article',wechat:'https://channels.weixin.qq.com/platform/post/list'};
function fixture(platform='douyin'){
  const f={platform,handlers:{},writes:[],reads:0,destroyed:0,nativeClosed:0,nativeOpened:0,ownerChecks:0,authorized:true,authenticated:true,nickname:'QA owner',sessionId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',outcome:{matched:true,evidence:{title:'QA work',visibility:'仅自己可见'}}};
  f.original={id:'qa-receipt',accountId:'qa-account',platform,nickname:'QA owner',kind:'publish',taskId:'qa-task',attemptId:'qa-attempt',expectedTitle:'QA work',status:'unknown',message:'waiting',createdAt:new Date().toISOString(),visibility:'仅自己可见'};
  f.latest=f.original;
  const makeGuest=()=>{let currentUrl=urls[f.platform];return{id:22,getURL:()=>currentUrl,isDestroyed:()=>false,loadURL:async url=>{f.reads++;assert.ok(url===urls[f.platform]||f.platform==='douyin'&&url==='https://creator.douyin.com/creator-micro/home'||f.platform==='xiaohongshu'&&url==='https://creator.xiaohongshu.com/new/home');currentUrl=url;},executeJavaScriptInIsolatedWorld:async(_world,scripts)=>{assert.ok(scripts[0].code.includes('function publishResult'));return typeof f.outcome==='function'?f.outcome():f.outcome;}};};
  const guest=makeGuest();
  registerPageActions({ipcMain:{handle:(name,handler)=>f.handlers[name]=handler},getWindow:()=>({webContents:{id:11}}),
    authenticate:async(_token,id)=>{if(!f.authorized)throw Error('unauthorized');return{userId:'qa-owner',account:id?{platform:f.platform,connectorSessionId:f.sessionId,...f.account}:undefined};},
    session:{fromPartition:()=>({})},journal:{list:()=>[f.latest],write:record=>{f.writes.push(record);f.latest={...record};}},
    createResultWindow:()=>({webContents:makeGuest(),isDestroyed:()=>false,destroy:()=>f.destroyed++}),
    createEdgeResultContext:async(_event,input)=>{f.nativeOpened++;assert.equal(input.accountId,f.original.accountId);if(f.nativeError)throw Error(f.nativeError);return{guest,close:()=>f.nativeClosed++,verifyOwner:async()=>{f.ownerChecks++;return{nickname:f.nickname};}};},
    inspectPlatformSession:async(_platform,_session,page)=>{f.ownerChecks++;const key=f.profileKeys?.length?f.profileKeys.shift():f.key;return{authenticated:f.authenticated,profile:{nickname:page.getURL()==='https://creator.douyin.com/creator-micro/home'?f.homeNickname??f.nickname:f.nickname,...(key?{ownIdentity:{key}}:{})}};},sleep:async()=>{}});
  f.verify=(input={},sender=11)=>f.handlers['matrix:verify-publish-result']({sender:{id:sender}},{accessToken:'qa-only',receiptId:f.original.id,...input});
  return f;
}
(async()=>{
 let checks=0;
 for(const platform of Object.keys(urls)){
  const f=fixture(platform),result=await f.verify();
  assert.equal(result.receipt.status,'confirmed');assert.equal(result.receipt.id,f.original.id);assert.equal(result.receipt.attemptId,f.original.attemptId);assert.equal(f.writes[0].ownerId,'qa-owner');assert.equal(result.receipt.verification.state,'confirmed');assert.equal(f.writes.length,1);checks+=6;
  if(platform==='wechat'){assert.equal(f.reads,0);assert.equal(f.destroyed,0);assert.equal(f.nativeOpened,1);assert.equal(f.nativeClosed,1);checks+=4;}
  else{assert.equal(f.reads,['douyin','xiaohongshu'].includes(platform)?2:1);assert.equal(f.destroyed,['douyin','xiaohongshu'].includes(platform)?2:1);assert.equal(f.nativeOpened,0);checks+=3;}
  assert.equal(f.ownerChecks,2);checks++;
  const before=f.reads+f.nativeOpened;await f.verify();assert.equal(f.reads+f.nativeOpened,before);checks++;
 }
 for(const reason of ['not_found','processing','ambiguous','time_mismatch','visibility_mismatch','missing_time','page_not_ready','not_published','status_unresolved']){
  const f=fixture();f.outcome={matched:false,reason};const result=await f.verify();
  assert.equal(result.receipt.status,'unknown');assert.equal(result.receipt.verification.state,reason);assert.ok(result.receipt.verification.message);assert.equal(f.writes.length,1);assert.equal(result.receipt.id,f.original.id);checks+=5;
 }
 for(const [mutate,state] of [[f=>f.nickname='another owner','identity_mismatch'],[f=>f.nickname='','identity_pending'],[f=>f.authenticated=false,'login_required']]){
  const f=fixture();mutate(f);const result=await f.verify();assert.equal(result.receipt.status,'unknown');assert.equal(result.receipt.verification.state,state);assert.equal(f.destroyed,2);checks+=3;
 }
 for(const error of ['请先在当前视频号完成官方登录','读取视频号作品列表超时']){
  const f=fixture('wechat');f.nativeError=error;const result=await f.verify();assert.equal(result.receipt.status,'unknown');assert.equal(result.receipt.verification.state,error.includes('超时')?'timeout':'login_required');assert.equal(f.reads,0);checks+=3;
 }
 for(const mutate of [f=>f.authorized=false,f=>f.platform='xiaohongshu',f=>f.sessionId='invalid']){
  const f=fixture();mutate(f);assert.ok((await f.verify()).error);assert.equal(f.writes.length,0);assert.equal(f.reads,0);checks+=3;
 }
 let f=fixture();assert.ok((await f.verify({receiptId:'foreign'})).error);assert.ok((await f.verify({},99)).error);assert.equal(f.reads,0);checks+=3;
 f=fixture();f.outcome={reason:'processing',pendingReview:true,evidence:{title:'QA work',statusText:'等待平台审核'}};let pending=await f.verify();assert.equal(pending.receipt.status,'confirmed');assert.ok(pending.receipt.acceptedAt);assert.equal(pending.receipt.verification.state,'processing');assert.equal(pending.receipt.resultSource,'official_work_list');assert.equal(f.ownerChecks,2);checks+=5;
 f.outcome={reason:'not_found'};const again=await f.verify();assert.equal(again.receipt.acceptedAt,pending.receipt.acceptedAt);assert.equal(again.receipt.verification.state,'processing');assert.match(again.receipt.verification.message,/最近读取.*未找到/);assert.equal(again.receipt.evidence.statusText,'等待平台审核');checks+=4;
 f.outcome={matched:false,rejected:true,message:'审核未通过：实际原因',evidence:{statusText:'审核未通过：实际原因'}};const rejection=await f.verify();assert.equal(rejection.receipt.status,'confirmed');assert.equal(rejection.receipt.verification.state,'rejected');checks+=2;
 f=fixture();f.outcome={reason:'processing',pendingReview:true,evidence:{title:'QA work',statusText:'审核中'}};f.nickname='a different owner';assert.equal((await f.verify()).receipt.verification.state,'identity_mismatch');assert.equal(f.latest.acceptedAt,undefined);checks+=2;
 f=fixture('other');const unsupported=await f.verify();assert.equal(unsupported.receipt.verification.state,'unsupported');assert.equal(unsupported.receipt.status,'unknown');assert.equal(f.reads,0);checks+=3;
 f=fixture();f.outcome={matched:false,rejected:true,message:'审核未通过：缺少内容说明',evidence:{title:'QA work',statusText:'审核未通过：缺少内容说明',timePrecision:'second'}};const rejected=await f.verify();assert.equal(rejected.receipt.status,'confirmed');assert.equal(rejected.receipt.verification.state,'rejected');assert.equal(rejected.receipt.verification.message,'审核未通过：缺少内容说明');assert.equal(rejected.receipt.evidence.timePrecision,'second');checks+=4;
 f=fixture('bilibili');f.outcome={matched:true,evidence:{title:'QA work',workId:'BV1s54y1d72u',workUrl:'https://www.bilibili.com/video/BV1s54y1d72u',workReferenceSource:'official_title_link'}};const linked=await f.verify();assert.equal(linked.receipt.evidence.workId,'BV1s54y1d72u');assert.equal(f.writes[0].evidence.workUrl,'https://www.bilibili.com/video/BV1s54y1d72u');assert.equal(f.ownerChecks,2);checks+=3;
 f=fixture();f.outcome=async()=>{f.latest={...f.original,status:'confirmed',message:'a newer success'};return{matched:false,reason:'not_found'};};assert.equal((await f.verify()).receipt.status,'confirmed');assert.equal(f.writes.length,0);checks+=2;
 f=fixture();let resolveRead;f.outcome=()=>new Promise(resolve=>resolveRead=resolve);const one=f.verify(),two=f.verify();for(let i=0;i<50&&!resolveRead;i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(resolveRead);resolveRead({matched:true,evidence:{title:'QA work'}});const both=await Promise.all([one,two]);assert.ok(both.every(r=>r.receipt.status==='confirmed'));assert.equal(f.reads,2);assert.equal(f.writes.length,1);assert.equal(f.destroyed,2);checks+=5;
 f=fixture();f.outcome=()=>{f.sessionId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';return{matched:true};};assert.ok((await f.verify()).error);assert.equal(f.writes.length,0);assert.equal(f.destroyed,2);checks+=3;
 f=fixture();f.nickname='';f.homeNickname='QA owner';assert.equal((await f.verify()).receipt.status,'confirmed');assert.equal(f.reads,2);assert.equal(f.destroyed,2);checks+=3;
 f=fixture();f.nickname='';f.homeNickname='another owner';assert.equal((await f.verify()).receipt.verification.state,'identity_mismatch');assert.equal(f.writes[0].status,'unknown');checks+=2;
 f=fixture();f.nickname='Renamed owner';f.key='same-known-handle';f.account={nickname:f.nickname,nativeAccountKey:f.key,verifiedNicknames:['QA owner',f.nickname]};assert.equal((await f.verify()).receipt.status,'confirmed');checks++;
 f=fixture();f.nickname='Renamed owner';f.key='other-handle';f.account={nickname:f.nickname,nativeAccountKey:'same-known-handle',verifiedNicknames:['QA owner',f.nickname]};assert.equal((await f.verify()).receipt.verification.state,'identity_mismatch');checks++;
 f=fixture();f.original.sessionId='different-original-session';assert.equal((await f.verify()).receipt.verification.state,'identity_mismatch');checks++;
 f=fixture();f.original.nativeAccountKey='stable-original-id';f.key='stable-original-id';f.nickname='Completely renamed';f.account={nickname:f.nickname,nativeAccountKey:f.key};assert.equal((await f.verify()).receipt.status,'confirmed','Same platform ID must survive a name change');checks++;
 f=fixture();f.original.nativeAccountKey='stable-original-id';f.key='different-id';f.account={nickname:'QA owner',nativeAccountKey:f.key};assert.equal((await f.verify()).receipt.verification.state,'identity_mismatch','Same nickname cannot bypass another ID');checks++;
 f=fixture();f.original.nativeAccountKey='stable-original-id';const missingId=await f.verify();assert.equal(missingId.receipt.verification.state,'identity_pending','A missing ID is pending, not proof of a different owner');assert.equal(missingId.receipt.status,'unknown','Missing ID cannot fall back to matching nickname');checks+=2;
 f=fixture();f.original.nickname='@QA owner1';f.key='known-id';f.account={nickname:'QA owner',nativeAccountKey:f.key};f.original.identityReview={source:'user_confirmed_rename',accountId:f.original.accountId,sessionId:f.sessionId,nativeAccountKey:f.key,originalNickname:f.original.nickname,currentNickname:'Even older renamed display'};assert.equal((await f.verify()).receipt.status,'confirmed','An explicitly reconciled old record is thereafter keyed by ID, not its display name');checks++;
 f=fixture('bilibili');f.outcome={reason:'status_unresolved',diagnostic:{statusLabels:['官方新状态','Cookie: QA-secret'],html:'never-retain-html'}};const diagnostic=await f.verify();assert.match(diagnostic.receipt.verification.message,/官网可见状态：官方新状态/);assert.ok(!JSON.stringify(diagnostic).includes('QA-secret'));assert.ok(!JSON.stringify(diagnostic).includes('never-retain-html'));assert.equal(diagnostic.receipt.status,'unknown');checks+=4;
 for(const [input,match]of [[{observedVisibility:'公开'},/官网读取到的可见范围：公开/],[{observedVisibility:'unreadable'},/未读到可核验的官网可见范围标记/],[{observedVisibility:'unreadable',permissionLabelUnassociated:true},/未能与本条作品安全关联/]]){
  f=fixture('bilibili');f.outcome={reason:'visibility_mismatch',diagnostic:input};const value=await f.verify();assert.equal(value.receipt.status,'unknown');assert.match(value.receipt.verification.message,match);checks+=2;
 }
 f=fixture('bilibili');f.outcome={reason:'visibility_mismatch',diagnostic:{observedVisibility:'password: QA-scope-secret',permissionLabelUnassociated:'URL https://example.invalid/?token=QA-secret'}};assert.ok(!JSON.stringify(await f.verify()).includes('QA-'));checks++;
 f=fixture('xiaohongshu');f.original.manualVerification=true;f.original.clicked=false;f.original.expectedWorkId='abcdef0123456789abcdef01';f.outcome={matched:true,evidence:{workId:'abcdef0123456789abcdef02',title:'QA work'}};let manual=await f.verify();assert.equal(manual.receipt.status,'unknown');assert.equal(manual.receipt.verification.state,'ambiguous');assert.equal(manual.receipt.clicked,false);checks+=3;
 f=fixture('xiaohongshu');f.original.manualVerification=true;f.original.clicked=false;f.original.expectedWorkId='abcdef0123456789abcdef01';f.outcome={matched:true,evidence:{workId:f.original.expectedWorkId,title:'QA work'}};manual=await f.verify();assert.equal(manual.receipt.status,'confirmed');assert.equal(manual.receipt.manualVerification,true);assert.equal(manual.receipt.clicked,false);checks+=3;
 f=fixture('xiaohongshu');f.original.nativeAccountKey='stable-original-id';f.key='stable-original-id';f.profileKeys=[undefined,'stable-original-id'];const delayed=await f.verify();assert.equal(delayed.receipt.status,'confirmed');assert.equal(f.ownerChecks,3);checks+=2;
 f=fixture('xiaohongshu');f.original.manualVerification=true;f.original.expectedWorkId='abcdef0123456789abcdef01';f.outcome={rejected:true,message:'A different work failed',evidence:{workId:'abcdef0123456789abcdef02'}};const otherRejection=await f.verify();assert.equal(otherRejection.receipt.status,'unknown');assert.equal(otherRejection.receipt.verification.state,'ambiguous');checks+=2;
 f=fixture();f.key='stable-original-id';f.account={nativeAccountKey:f.key};f.original.nativeAccountKey=f.key;f.outcome=()=>{f.account.nativeAccountKey='rebound-id';return{matched:true,evidence:{title:'QA work'}};};const rebound=await f.verify();assert.ok(rebound.error);assert.equal(f.writes.length,0);checks+=2;
 f=fixture();f.key='stable-original-id';f.original.nativeAccountKey=f.key;f.profileKeys=[f.key,undefined];const lostId=await f.verify();assert.equal(lostId.receipt.status,'unknown');assert.equal(lostId.receipt.verification.state,'identity_pending');checks+=2;
 console.log(JSON.stringify({nativeResultOwnershipAndPersistenceChecks:checks,fourPlatformsCovered:true,unknownDoesNotEnableRetry:true,deduplicatedRefresh:true,actualPostsOrExternalActions:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
