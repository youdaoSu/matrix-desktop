// Actual hook, controlled visible-profile snapshots/clock. No backend/platform.
async function runAccountProfileRefreshUiTests(){
 const assert=require('node:assert/strict'),path=require('node:path'),React=require('react'),{createRoot}=require('react-dom/client'),{loadTs}=require('./qa-load-typescript.cjs');
 const root=path.resolve(__dirname,'..'),cache=new Map(),overrides=new Map(),posts=[],events=[],observations=[],dataEvents=[];
 let owner='qa-owner',token='qa-token',now=2000000000000,tick,profile,release,failSave=false,foreignSave=false,checks=0;
 const originals={now:Date.now,interval:window.setInterval,clear:window.clearInterval};Date.now=()=>now;window.setInterval=fn=>{tick=fn;return 9191;};window.clearInterval=()=>{};
 const stub=(file,exports)=>cache.set(path.join(root,file),{exports});
 stub('client/src/api/index.ts',{getUser:()=>({id:owner}),getAuthToken:()=>token,axiosForBackend:{post:async(url,body)=>{posts.push({url,body});if(failSave)throw Error('QA storage unavailable');return{data:{data:{id:foreignSave?'other-account':'qa-account',connectorSessionId:'qa-session',nickname:body.nickname,nativeAccountKey:body.nativeAccountKey,avatarUrl:body.avatarUrl,...body.metrics}}};}}});
 stub('client/src/components/workspace/account-observations.ts',{recordLoginObservation:()=>{},recordAccountObservation:(_owner,_id,value)=>observations.push(value)});
 const {useAccountInspection}=loadTs('client/src/components/workspace/use-account-inspection.ts',cache,overrides);
 const own=(avatar,n=10)=>({platform:'douyin',sessionId:'qa-session',nickname:'Same nickname',pageUrl:'https://creator.douyin.com/creator-micro/home',ownIdentity:{source:'official_own_homepage',key:'known-id'},avatarUrl:avatar,metrics:{followersCount:n,followingCount:0,likesCount:0}});
 function Demo(){useAccountInspection({enabled:true,accountId:'qa-account',sessionId:'qa-session',platform:'douyin',nickname:'Same nickname',nativeAccountKey:'known-id',read:()=>typeof profile==='function'?profile():Promise.resolve(profile)});return null;}
 const component=createRoot(document.getElementById('root')),onEvent=e=>events.push(e.detail),onData=e=>dataEvents.push(e.detail);window.addEventListener('matrix:account-profile-updated',onEvent);window.addEventListener('matrix:account-data-updated',onData);
 const pause=()=>new Promise(r=>setTimeout(r,10)),until=async(fn,label)=>{for(let i=0;i<100;i++){if(fn())return;await pause();}throw Error('Profile refresh QA timeout: '+label);};
 try{
  profile=own('https://example.invalid/avatar-one.png');component.render(React.createElement(Demo));await until(()=>posts.length===1,'unchanged nickname must still save initial avatar/metrics');await until(()=>events.length===1,'initial event');
  assert.equal(posts[0].body.metrics.followersCount,10);assert.equal(posts[0].body.metrics.followingCount,0);assert.equal(events[0].account.avatarUrl,profile.avatarUrl);assert.deepEqual(dataEvents,[{ownerId:owner}]);checks+=4;
  now+=10000;tick();await pause();assert.equal(posts.length,1,'Identical recent snapshot must not create redundant writes');checks++;
  profile=own('https://example.invalid/avatar-two.png',11);now+=10000;tick();await until(()=>events.length===2,'avatar and metric refresh');assert.equal(posts[1].body.metrics.followersCount,11);assert.equal(posts[1].body.avatarUrl,profile.avatarUrl);checks+=2;
  now+=60000;tick();await until(()=>posts.length===3,'periodic real observation refresh');checks++;
  profile={...own('https://example.invalid/foreign.png',99),ownIdentity:{source:'official_own_homepage',key:'different-id'}};now+=10000;tick();await until(()=>observations.some(o=>o.state==='abnormal'));assert.equal(posts.length,3);checks++;
  foreignSave=true;profile=own('https://example.invalid/wrong-save.png',12);now+=10000;tick();await until(()=>posts.length===4);await pause();assert.equal(events.length,3,'A foreign save response cannot update this account');checks++;
  foreignSave=false;failSave=true;profile=own('https://example.invalid/retry-save.png',13);now+=10000;tick();await until(()=>posts.length===5);await pause();assert.ok(observations.some(o=>o.state==='unknown'&&o.reason.includes('QA storage unavailable')));checks++;failSave=false;now+=10000;tick();await until(()=>events.length===4,'failed persistence must remain retryable');checks++;
  profile=()=>new Promise(r=>release=r);now+=10000;tick();await until(()=>release,'read pending');owner='other-owner';token='other-token';release(own('https://example.invalid/late.png',30));await pause();assert.equal(posts.length,6);assert.equal(events.length,4);assert.equal(dataEvents.length,4,'Only successful current-owner saves may notify statistics');checks+=3;
  return{accountProfileRefreshReactChecks:checks,unchangedNicknameAvatarAndMetricsRefresh:true,redundantWritesBounded:true,failedSaveRetryable:true,foreignIdentityAndLateOwnerBlocked:true,realPlatformActions:false};
 }finally{component.unmount();window.removeEventListener('matrix:account-profile-updated',onEvent);window.removeEventListener('matrix:account-data-updated',onData);Date.now=originals.now;window.setInterval=originals.interval;window.clearInterval=originals.clear;}
}
module.exports={runAccountProfileRefreshUiTests};
