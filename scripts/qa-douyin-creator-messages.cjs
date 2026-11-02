// Inert main-process boundaries only. No real guest, cookie, account or network.
const assert = require('node:assert/strict');
const { registerPageActions } = require('../desktop/page-actions.cjs');
let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
function fixture(patch={}) {
  const handlers={},partition={},owner='qa-owner',account={id:'qa-account',platform:'douyin',connectorSessionId:'aaaaaaaaaaaaaaaa',nativeAccountKey:'qa-stable-handle',nickname:'QA first nickname'};
  const {EventEmitter}=require('node:events');let cookieValue='qa-session-not-real';
  if(patch.cookieProof){partition.cookies=new EventEmitter();partition.cookies.get=async()=>[{name:'sessionid',domain:'.douyin.com',path:'/',value:cookieValue}];}
  let url='https://creator.douyin.com/creator-micro/data/following/chat',reads=0,healthCalls=0,sessionReads=0;
  let observed,health=()=>({state:'normal',accountId:account.id,sessionId:account.connectorSessionId,nativeAccountKey:account.nativeAccountKey,nickname:'QA renamed nickname'}),afterRead=()=>{};
  const guest={id:22,hostWebContents:{id:11},session:partition,isDestroyed:()=>false,getURL:()=>url,executeJavaScriptInIsolatedWorld:async()=>{reads++;afterRead();return{records:[{platformId:'qa-summary',author:'QA sender',content:'QA summary'}],source:url,capturedAt:new Date().toISOString()};}};
  registerPageActions({ipcMain:{handle:(name,handler)=>handlers[name]=handler},getWindow:()=>({webContents:{id:11}}),webContents:{fromId:id=>id===22?guest:null},session:{fromPartition:name=>name==='persist:matrix-douyin-'+account.connectorSessionId?partition:{}},platforms:{douyin:{domain:'douyin.com',label:'抖音'}},
    authenticate:async()=>({userId:owner,account:{...account}}),inspectPlatformSession:async()=>{sessionReads++;return{authenticated:true,profile:{nickname:'QA renamed nickname',...(observed?{ownIdentity:{key:observed}}:{})}};},
    inspectAccountHealth:async()=>{healthCalls++;return health(healthCalls);},journal:{list:()=>[],write:()=>{}},...patch});
  const input={accessToken:'qa-only',accountId:account.id,platform:'douyin',sessionId:account.connectorSessionId,webContentsId:22,kind:'messages',command:'read-interactions'};
  return {read:changes=>handlers['matrix:official-data']({sender:{id:11}},{...input,...changes}),get reads(){return reads;},get healthCalls(){return healthCalls;},get sessionReads(){return sessionReads;},account,set url(value){url=value;},set observed(value){observed=value;},set health(value){health=value;},set afterRead(value){afterRead=value;},changeCookie(value){cookieValue=value;partition.cookies.emit('changed',{}, {name:'sessionid',domain:'.douyin.com'},'explicit',false);}};
}
(async()=>{
  let f=fixture(),r=await f.read();assert.ok(r.records,JSON.stringify(r));eq(r.records[0].platformId,'qa-summary');eq(r.accountId,'qa-account');eq(r.sessionId,'aaaaaaaaaaaaaaaa');eq(f.healthCalls,2);eq(f.reads,1);eq(r.error,undefined);
  await f.read();eq(f.healthCalls,3);eq(f.reads,2); // before-read proof cached; after-read proof always fresh
  f=fixture();f.health=()=>({state:'normal',accountId:'qa-account',sessionId:'aaaaaaaaaaaaaaaa',nativeAccountKey:'different-account'});r=await f.read();assert.match(r.error,/同一平台账号ID/);checks++;eq(f.reads,0);
  f=fixture();f.health=n=>({state:'normal',accountId:'qa-account',sessionId:'aaaaaaaaaaaaaaaa',nativeAccountKey:n===1?'qa-stable-handle':'other-after-read'});r=await f.read();assert.match(r.error,/本人账号ID未确认或已变化/);checks++;eq(r.records,undefined);eq(f.reads,1);
  f=fixture();f.afterRead=()=>{f.account.connectorSessionId='bbbbbbbbbbbbbbbb';};r=await f.read();assert.match(r.error,/绑定已变化/);checks++;eq(r.records,undefined);
  f=fixture();f.afterRead=()=>{f.account.nativeAccountKey='other-after-read';};r=await f.read();assert.match(r.error,/绑定已变化/);checks++;eq(r.records,undefined);
  f=fixture();f.url='https://creator.douyin.com/creator-micro/home';r=await f.read();assert.match(r.error,/本人账号ID尚未读到/);checks++;eq(f.reads,0);eq(f.healthCalls,0);
  f=fixture();f.url='https://www.douyin.com/user/self';r=await f.read();assert.match(r.error,/本人账号ID尚未读到/);checks++;eq(f.reads,0);eq(f.healthCalls,0);
  f=fixture();f.url='https://www.douyin.com/user/self';f.observed='qa-stable-handle';r=await f.read();eq(r.error,undefined);eq(r.records.length,1);eq(f.healthCalls,0);eq(f.sessionReads,2);
  f=fixture({inspectAccountHealth:undefined});r=await f.read();assert.match(r.error,/暂时无法安全读取/);checks++;eq(f.reads,0);
  f=fixture();r=await f.read({command:'open-message-list'});assert.match(r.error,/本人账号ID尚未读到/);checks++;eq(f.reads,0);
  f=fixture();f.health=()=>({state:'unknown',message:'QA 官方登录未确认'});r=await f.read();assert.match(r.error,/QA 官方登录未确认/);checks++;eq(r.records,undefined);eq(f.reads,0);
  f=fixture();f.observed='another-account';r=await f.read();assert.match(r.error,/绑定ID不同/);checks++;eq(f.reads,0);
  f=fixture({cookieProof:true});r=await f.read();eq(r.error,undefined);eq(f.healthCalls,1);await f.read();eq(f.healthCalls,1);eq(f.reads,2);eq(JSON.stringify(r).includes('creatorMessageProof'),false);
  f.afterRead=()=>{f.changeCookie('qa-B-not-real');f.changeCookie('qa-session-not-real');};r=await f.read();assert.match(r.error,/登录已变化/);checks++;eq(r.records,undefined);
  f=fixture({cookieProof:true});f.afterRead=()=>f.account.nativeAccountKey='qa-rebound';r=await f.read();assert.match(r.error,/绑定已变化/);checks++;eq(r.records,undefined);
  console.log(JSON.stringify({douyinCreatorMessageBoundaryChecks:checks,stableIdNotNickname:true,unobservableCookieFallbackFreshAfterEverySnapshot:true,observedSessionShortProofAndCookieGenerationGuard:true,foreignOrUnverifiedRowsNotReturned:true,noChatNavigationOrSend:true,realProfilesTouched:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
