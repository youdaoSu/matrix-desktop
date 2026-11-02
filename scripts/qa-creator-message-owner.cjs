// Cookie names/values below are synthetic. No browser, live profile or network.
const assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createCreatorMessageOwnerVerifier}=require('../desktop/creator-message-owner.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},reject=async(task,pattern)=>{await assert.rejects(task,pattern);checks++;};
function fixture(){
 const cookies=new EventEmitter(),account={id:'qa-account',platform:'douyin',connectorSessionId:'qa-session',nativeAccountKey:'qa-own-handle'},input={accessToken:'qa-only',accountId:account.id,platform:'douyin',sessionId:account.connectorSessionId};
 let now=100000,healthCalls=0,reads=0,beforeCalls=0,healthHook=async()=>{},getHook=async()=>{},healthKey=account.nativeAccountKey;
 const rows=[{name:'sessionid',domain:'.douyin.com',path:'/',value:'qa-A-not-real',expirationDate:99999999}];
 cookies.get=async filter=>{eq(filter,{});reads++;await getHook();return structuredClone(rows);};
 const session={cookies},ctx={auth:{userId:'qa-owner',account},guest:{session}};
 const verifier=createCreatorMessageOwnerVerifier({now:()=>now,inspectAccountHealth:async()=>{healthCalls++;await healthHook();return{state:'normal',accountId:account.id,sessionId:account.connectorSessionId,nativeAccountKey:healthKey};},fallbackBefore:async()=>{beforeCalls++;}});
 const change=value=>{rows[0].value=value;cookies.emit('changed',{},structuredClone(rows[0]),'explicit',false);};
 return{input,ctx,verifier,rows,cookies,change,get healthCalls(){return healthCalls;},get beforeCalls(){return beforeCalls;},get reads(){return reads;},set now(value){now=value;},set healthHook(value){healthHook=value;},set healthKey(value){healthKey=value;},set getHook(value){getHook=value;},begin:()=>verifier.begin({},input,ctx),verify:lease=>verifier.verify({},input,lease)};
}
(async()=>{
 let f=fixture(),lease=await f.begin();await f.verify(lease);eq(f.healthCalls,1);eq(f.cookies.listenerCount('changed'),1);
 eq([...lease.creatorMessageProof.state.values.values()].every(value=>/^[a-f0-9]{64}$/.test(value)&&!value.includes('qa-A-not-real')),true);
 for(let i=0;i<3;i++){lease=await f.begin();await f.verify(lease);}eq(f.healthCalls,1);eq(f.cookies.listenerCount('changed'),1);
 f.now=145000;lease=await f.begin();await f.verify(lease);eq(f.healthCalls,2);
 f.now=90000;lease=await f.begin();await f.verify(lease);eq(f.healthCalls,3);
 // A->B->A with identical final values still invalidates an in-flight lease.
 f=fixture();lease=await f.begin();f.change('qa-B-not-real');f.change('qa-A-not-real');await reject(f.verify(lease),/登录已变化/);eq(f.healthCalls,1);lease=await f.begin();await f.verify(lease);eq(f.healthCalls,2);
 // A changed snapshot is detected even if a buggy emitter omits its event.
 f=fixture();lease=await f.begin();f.rows[0].value='qa-silent-change';await reject(f.verify(lease),/登录已变化/);
 // Unknown Douyin-domain cookies still invalidate the lease, not just a few
 // historical auth-cookie names. Unrelated-domain analytics do not.
 f=fixture();lease=await f.begin();f.cookies.emit('changed',{}, {name:'new-future-auth',domain:'creator.douyin.com'},'explicit',false);await reject(f.verify(lease),/登录已变化/);
 f=fixture();lease=await f.begin();f.cookies.emit('changed',{}, {name:'unrelated',domain:'example.org'},'explicit',false);await f.verify(lease);eq(f.healthCalls,1);
 // Before any summary is read, a changed lease can be rebased only after a
 // second fresh own-ID verification. Repeated changes still fail boundedly.
 f=fixture();f.healthHook=async()=>f.change('qa-health-changed');lease=await f.begin();await f.verify(lease);eq(f.healthCalls,2);
 f=fixture();f.healthHook=async()=>f.change('qa-health-changed-'+f.healthCalls);await reject(f.begin(),/核验期间官方登录已变化/);eq(f.healthCalls,2);
 // An actual account switch during the first profile load must be rejected by
 // the second OWN-ID check, never accepted merely because the cookie settles.
 f=fixture();f.healthHook=async()=>{if(f.healthCalls===1)f.change('qa-other-person');else f.healthKey='qa-foreign-own-id';};
 await reject(f.begin(),/本人账号ID未确认/);eq(f.healthCalls,2);
 f=fixture();f.healthHook=async()=>{f.ctx.auth.account.nativeAccountKey='qa-binding-changed';};await reject(f.begin(),/绑定身份发生变化/);
 // Ordinary state may change on EVERY own-profile page load. Two OWN-ID
 // observations plus unchanged credentials can establish a NEW pre-read
 // lease. The same unknown state changing AFTER that lease remains unsafe.
 f=fixture();const pageCookie={name:'qa-future-page-state',domain:'.douyin.com',path:'/',value:'qa-page-start'};f.rows.push(pageCookie);
 f.healthHook=async()=>{pageCookie.value='qa-page-'+f.healthCalls;f.cookies.emit('changed',{},structuredClone(pageCookie),'explicit',false);};
 lease=await f.begin();await f.verify(lease);eq(f.healthCalls,2);lease=await f.begin();eq(f.healthCalls,2);pageCookie.value='qa-during-message-read';f.cookies.emit('changed',{},structuredClone(pageCookie),'explicit',false);await reject(f.verify(lease),/登录已变化/);
 f=fixture();f.rows.push({name:'qa-future-page-state',domain:'.douyin.com',value:'qa-old'});f.healthHook=async()=>{const state=f.rows.at(-1);state.value='qa-state-'+f.healthCalls;f.cookies.emit('changed',{},structuredClone(state),'explicit',false);if(f.healthCalls===2)f.healthKey='qa-foreign-owner';};await reject(f.begin(),/本人账号ID未确认/);eq(f.healthCalls,2);
 // A credential A->B->A is NOT page-state churn, even when its final digest
 // matches. A changed credential without an event is rejected as well.
 for(const silent of [false,true]){f=fixture();f.rows.push({name:'uid_tt',domain:'.douyin.com',path:'/',value:'qa-own-user'});f.healthHook=async()=>{if(f.healthCalls===1){const state={name:'qa-page-state',domain:'.douyin.com',value:'qa-page'};f.rows.push(state);f.cookies.emit('changed',{},structuredClone(state),'explicit',false);}else{const uid=f.rows.find(row=>row.name==='uid_tt');uid.value='qa-other-user';if(!silent){f.cookies.emit('changed',{},structuredClone(uid),'explicit',false);uid.value='qa-own-user';f.cookies.emit('changed',{},structuredClone(uid),'explicit',false);}}};await reject(f.begin(),/核验期间官方登录已变化/);eq(f.healthCalls,2);}
 f=fixture();lease=await f.begin();f.now=146000;f.healthHook=async()=>{const state={name:'qa-page-state-after-read',domain:'.douyin.com',value:'qa-page'};f.rows.push(state);f.cookies.emit('changed',{},structuredClone(state),'explicit',false);};await reject(f.verify(lease),/核验期间官方登录已变化/);eq(f.healthCalls,2);
 // Same-value Chromium overwrite pairs and expiry extension must not prevent
 // reading when the fresh own-ID remains the same. No cookie value is returned.
 f=fixture();f.healthHook=async()=>{const old=structuredClone(f.rows[0]);f.cookies.emit('changed',{},old,'overwrite',true);f.rows[0].expirationDate++;f.cookies.emit('changed',{},structuredClone(f.rows[0]),'explicit',false);};lease=await f.begin();await f.verify(lease);eq(f.healthCalls,1);
 f=fixture();lease=await f.begin();f.rows[0].expirationDate++;f.cookies.emit('changed',{},structuredClone(f.rows[0]),'inserted-no-value-change-overwrite',false);await f.verify(lease);eq(f.healthCalls,1);
 for(const encoded of [false,true]){f=fixture();const encode=value=>encoded?encodeURIComponent(value):value;f.rows.push({name:'sid_guard',domain:'.douyin.com',path:'/',value:encode('qa-same-SID|1000|3600|Thu, 01 Jan 2037 00:00:00 GMT')});f.healthHook=async()=>{const guard=f.rows.at(-1);guard.value=encode('qa-same-SID|2000|7200|Fri, 02 Jan 2037 00:00:00 GMT');f.cookies.emit('changed',{},structuredClone(guard),'explicit',false);};lease=await f.begin();await f.verify(lease);eq(f.healthCalls,1);const guard=f.rows.at(-1);guard.value=encode('qa-OTHER-SID|2000|7200|Fri, 02 Jan 2037 00:00:00 GMT');f.cookies.emit('changed',{},structuredClone(guard),'explicit',false);await reject(f.verify(lease),/登录已变化/);}
 f=fixture();f.rows.push({name:'sid_guard',domain:'.douyin.com',value:'qa-unknown-format|v2'});lease=await f.begin();f.rows.at(-1).value='qa-unknown-format|v3';f.cookies.emit('changed',{},structuredClone(f.rows.at(-1)),'explicit',false);await reject(f.verify(lease),/登录已变化/);
 // Device/anti-abuse churn does not identify a different person; unknown new
 // identity cookies, auth-value changes, removals and A->B->A remain rejected.
 for(const name of ['msToken','s_v_web_id','ttwid','tt_webid','tt_webid_v2']){f=fixture();f.healthHook=async()=>{f.rows.push({name,domain:'.douyin.com',path:'/',value:'qa-device-refresh'});f.cookies.emit('changed',{},structuredClone(f.rows.at(-1)),'explicit',false);};lease=await f.begin();await f.verify(lease);eq(f.healthCalls,1);}
 f=fixture();lease=await f.begin();f.cookies.emit('changed',{},structuredClone(f.rows[0]),'expired',true);f.rows.splice(0);await reject(f.verify(lease),/登录已变化/);
 f=fixture();lease=await f.begin();const removed=structuredClone(f.rows[0]);f.cookies.emit('changed',{},removed,'overwrite',true);f.rows.splice(0);await reject(f.verify(lease),/登录已变化/);
 f=fixture();lease=await f.begin();f.rows[0].expirationDate=1;await reject(f.verify(lease),/登录已变化/);
 f=fixture();lease=await f.begin();f.rows[0].httpOnly=true;f.cookies.emit('changed',{},structuredClone(f.rows[0]),'explicit',false);await reject(f.verify(lease),/登录已变化/);
 f=fixture();let changed=false;f.getHook=async()=>{if(!changed){changed=true;f.change('qa-during-cookie-read');}};await reject(f.begin(),/登录正在变化/);
 f=fixture();lease=await f.begin();f.rows.splice(0);await reject(f.verify(lease),/登录已变化/);
 // Expiring the own-profile proof during the read requires a fresh own ID.
 f=fixture();lease=await f.begin();f.now=146000;await f.verify(lease);eq(f.healthCalls,2);
 f=fixture();lease=await f.begin();f.ctx.auth.account={...f.ctx.auth.account,nativeAccountKey:'other-bound-id'};await reject(f.verify(lease),/绑定会话/);
 f=fixture();lease=await f.begin();f.ctx.auth.userId='qa-other-owner';await reject(f.verify(lease),/绑定会话/);
 f=fixture();f.ctx.observedNativeAccountKey='qa-foreign-visible-id';await reject(f.begin(),/网页显示的本人账号ID/);eq(f.reads,0);
 // A cookie observer is optional only when every completed read freshly checks
 // the official OWN profile. Existing context checks remain the before guard.
 f=fixture();f.cookies.on=undefined;lease=await f.begin();await f.verify(lease);lease=await f.begin();await f.verify(lease);eq(f.beforeCalls,2);eq(f.healthCalls,2);
 f=fixture();f.rows[0].name='analytics-only';lease=await f.begin();await f.verify(lease);eq(f.beforeCalls,1);eq(f.healthCalls,1);
 // Concurrent reads coalesce a profile load for the same exact partition.
 f=fixture();let release;f.healthHook=()=>new Promise(resolve=>release=resolve);const a=f.begin(),b=f.begin();for(let i=0;i<20&&!release;i++)await new Promise(r=>setImmediate(r));eq(f.healthCalls,1);release();await Promise.all([a,b]);
 // The proof key includes the actual Session object, not only its string ID.
 f=fixture();let pending=[];f.healthHook=()=>new Promise(resolve=>pending.push(resolve));const first=f.begin();for(let i=0;i<20&&!pending.length;i++)await new Promise(r=>setImmediate(r));
 const otherCookies=new EventEmitter();otherCookies.get=async()=>structuredClone(f.rows);const second=f.verifier.begin({},f.input,{...f.ctx,guest:{session:{cookies:otherCookies}}});for(let i=0;i<20&&pending.length<2;i++)await new Promise(r=>setImmediate(r));eq(f.healthCalls,2);pending.forEach(resolve=>resolve());await Promise.all([first,second]);
 console.log(JSON.stringify({creatorMessageOwnerProofChecks:checks,unchangedSessionReusesShortOwnIdProof:true,cookieAtoBtoARejected:true,unknownFutureCookieChangeInvalidates:true,readAndProofRacesRejected:true,ttlExpiryAndClockRollbackRecheck:true,unobservableCookiesAlwaysFresh:true,noCredentialsReturnedToRenderer:true,realPlatformActions:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
