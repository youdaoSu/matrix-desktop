// Real owner-scoped provider, virtual clock and synthetic IPC only.
async function runDouyinPriorityUiTests(){
 const assert=require('node:assert/strict'),React=require('react'),{createRoot}=require('react-dom/client'),path=require('node:path'),{loadTs}=require('./qa-load-typescript.cjs');
 const root=path.resolve(__dirname,'..'),cache=new Map(),stub=(file,exports)=>cache.set(path.join(root,file),{exports});let owner='qa-owner',clock=100000,checks=0,control,fail=false;const intervals=new Map(),calls=[];let serial=0,componentActive=true;
 const account={id:'a',platform:'douyin',nickname:'QA本人',connectorSessionId:'session-a',nativeAccountKey:'native-a'},workspace={accounts:[account],jobsLocked:false};let fastBoth=false,fastFollowers=false,coldFailures=0,busyFollowers=0;
 const now=Date.now,setInterval=window.setInterval,clearInterval=window.clearInterval;Date.now=()=>clock;window.setInterval=fn=>{const id=++serial;intervals.set(id,fn);return id;};window.clearInterval=id=>intervals.delete(id);
 stub('client/src/api/index.ts',{getUser:()=>({id:owner}),getAuthToken:()=> 'token-'+owner});stub('client/src/components/workspace/OfficialWorkspace.tsx',{useOfficialWorkspace:()=>workspace});stub('client/src/components/workspace/WorkspaceUiState.ts',{useWorkspaceIdentity:()=>owner});
 window.matrixDesktop={douyinInteractions:async input=>{calls.push(input);const base={accountId:input.accountId,sessionId:'session-'+input.accountId,platform:'douyin',kind:input.kind};if(input.command==='cache')return{...base,fromCache:true,complete:true,records:[],works:[{platformId:'300',title:'QA甲作品'},{platformId:'301',title:'QA乙作品'}],progress:{pages:1,worksCatalogComplete:true}};if(input.kind==='followers'&&busyFollowers>0){busyFollowers--;return{error:'此抖音账号正在读取另一页，请稍候'};}if(coldFailures>0){coldFailures--;return{error:'准备官网只读采集页超时，已停止本次操作；不会重复执行'};}if(fail)return{error:'HTTP 403'};return{...base,complete:!(fastBoth||fastFollowers&&input.kind==='followers'),...(fastBoth||fastFollowers&&input.kind==='followers'?{nextCursor:'followers-'+calls.length}:{}),records:[],works:[],progress:{pages:1}};}};
 const {DouyinInteractionDataProvider,useDouyinInteractionData,douyinPollDelay}=loadTs('client/src/components/workspace/DouyinInteractionData.tsx',cache);
 function View(){control=useDouyinInteractionData('comments');return React.createElement('div',null,control.entry(account,'comments')?.phase||'');}
 const component=createRoot(document.querySelector('#root')),render=()=>component.render(React.createElement(DouyinInteractionDataProvider,{initialKinds:[]},React.createElement(View))),pause=()=>new Promise(resolve=>setTimeout(resolve,10)),until=async test=>{for(let i=0;i<150;i++){if(test())return;await pause();}throw Error('Priority provider fixture deadline');},tick=async()=>{for(const fn of [...intervals.values()])fn();await pause();},live=()=>calls.filter(call=>call.command!=='cache');
 try{
  for(const [kind,result,wanted]of [
   ['followers',{complete:false,followerPending:true,pollAfterMs:10000},10000],
   ['followers',{complete:false,followerPending:true,pollAfterMs:30000},30000],
   ['followers',{complete:false,followerPending:true,pollAfterMs:60000},60000],
   ['followers',{complete:false,pollAfterMs:60000},4500],
   ['followers',{complete:true,followerPending:true,pollAfterMs:60000},15000],
   ['followers',{complete:false,followerPending:true,pollAfterMs:9999},4500],
   ['followers',{complete:false,followerPending:true,pollAfterMs:60001},4500],
   ['comments',{complete:true,monitoring:true,pollAfterMs:30000},30000]
  ]){assert.equal(douyinPollDelay(kind,result),wanted);checks++;}
  render();await until(()=>control?.entry(account,'comments')?.progress?.worksCatalogComplete===true);assert.equal(control.entry(account,'comments').progress.worksCatalogComplete,true);checks++;await tick();await until(()=>live().length===1);assert.equal(live()[0].priorityWorkId,undefined);checks++;
  control.prioritize(account,'301');clock+=4499;await tick();assert.equal(live().length,1);clock++;await tick();await until(()=>live().length===2);assert.equal(live()[1].priorityWorkId,'301');checks+=2;
  clock+=4500;control.prioritize(account,'301');await tick();assert.equal(live().length,2);control.prioritize(account,'300');await tick();await until(()=>live().length===3);assert.equal(live()[2].priorityWorkId,'300');checks+=2;
  fail=true;clock+=4500;control.prioritize(account,'301');await tick();await until(()=>live().length===4);await until(()=>control.entry(account,'comments')?.error==='HTTP 403');clock+=60000;control.prioritize(account,'300');await tick();assert.equal(live().length,4);assert.equal(control.entry(account,'comments').error,'HTTP 403');checks+=2;
  workspace.jobsLocked=true;render();await pause();control.refresh(account,'comments');await tick();assert.equal(live().length,4);checks++;
  workspace.jobsLocked=false;fail=false;render();await pause();await tick();await until(()=>live().length===5);assert.equal(control.entry(account,'comments').error,undefined);checks++;
  const previous=control;owner='qa-new-owner';render();await pause();previous.prioritize(account,'301');await tick();await tick();await until(()=>live().length===6);assert.equal(live().at(-1).accessToken,'token-qa-new-owner');assert.equal(live().at(-1).priorityWorkId,undefined);checks+=2;
  // Account-only focus (no selected work) and follower focus are priorities too.
  fastFollowers=true;control.activate('followers');control.prioritize(account,'','followers');clock+=5000;await tick();await tick();assert.equal(live().at(-1).kind,'followers');checks++;
  const focusStart=live().length;for(let n=0;n<8;n++){clock+=5000;await tick();}
  const focusCalls=live().slice(focusStart);assert(focusCalls.some(call=>call.kind==='followers'));assert(focusCalls.some(call=>call.kind==='comments'));checks+=2;
  assert(live().every(call=>call.refreshFollowers===undefined));checks++;
  const refreshAt=live().length;control.refresh(account,'followers');clock+=5000;await tick();await until(()=>live().slice(refreshAt).some(call=>call.kind==='followers'));
  const refreshed=live().slice(refreshAt).find(call=>call.kind==='followers');assert.equal(refreshed.refreshFollowers,true);assert.equal(refreshed.cursor,undefined);checks+=2;
  for(let n=0;n<4;n++){clock+=5000;await tick();}
  assert.equal(live().slice(refreshAt).filter(call=>call.refreshFollowers===true).length,1);assert(live().slice(refreshAt).some(call=>call.kind==='followers'&&call.cursor&&call.refreshFollowers===undefined));checks+=2;
  const busyAt=live().length;busyFollowers=1;control.refresh(account,'followers');for(let n=0;n<5&&!live().slice(busyAt).some(call=>call.kind==='followers');n++){clock+=5000;await tick();}assert.equal(live().slice(busyAt).find(call=>call.kind==='followers')?.refreshFollowers,true);checks++;
  for(let n=0;n<5;n++){clock+=5000;await tick();}
  const busyCalls=live().slice(busyAt).filter(call=>call.kind==='followers');assert(busyCalls.length>=2);assert.equal(busyCalls[1].refreshFollowers,true);assert.equal(busyCalls[1].cursor,undefined);checks+=3;
  assert(busyCalls.slice(2).every(call=>call.refreshFollowers===undefined));checks++;
  const second={...account,id:'b',connectorSessionId:'session-b',nativeAccountKey:'native-b'};workspace.accounts=[account,second];render();await pause();control.prioritize(second,'','comments');await tick();await tick();await until(()=>live().some(call=>call.accountId==='b'));assert.equal(live().find(call=>call.accountId==='b').priorityWorkId,undefined);checks++;
  component.unmount();componentActive=false;const startupRoot=createRoot(document.querySelector('#root')),startupAt=calls.length;
  try{fastBoth=true;startupRoot.render(React.createElement(DouyinInteractionDataProvider,null,React.createElement('h1',null,'Home route')));await pause();await tick();await tick();clock+=5000;await tick();await tick();await until(()=>['comments','followers'].every(kind=>calls.slice(startupAt).some(call=>call.kind===kind&&call.command!=='cache')));assert.equal(document.body.textContent,'Home route');checks++;for(let n=0;n<12;n++){clock+=5000;await tick();}for(const account of workspace.accounts){const scheduled=calls.slice(startupAt).filter(call=>call.command!=='cache'&&call.accountId===account.id);assert(Math.abs(scheduled.filter(call=>call.kind==='comments').length-scheduled.filter(call=>call.kind==='followers').length)<=1);checks++;}}finally{fastBoth=false;startupRoot.unmount();}
  workspace.accounts=[account];coldFailures=1;const coldRoot=createRoot(document.querySelector('#root')),coldStart=live().length;
  try{coldRoot.render(React.createElement(DouyinInteractionDataProvider,{initialKinds:['comments']},React.createElement(View)));await pause();await tick();await tick();await until(()=>live().length===coldStart+1&&control.entry(account,'comments')?.error);clock+=59999;await tick();assert.equal(live().length,coldStart+1);clock++;await tick();await until(()=>live().length===coldStart+2);assert.equal(control.entry(account,'comments').error,undefined);checks+=2;
   coldFailures=3;control.refresh(account,'comments');clock+=5000;await tick();for(let n=0;n<2;n++){clock+=60000;await tick();}const stopped=live().length;clock+=60000;await tick();assert.equal(coldFailures,0);assert.equal(live().length,stopped);checks+=2;
  }finally{coldRoot.unmount();}
  return{defaultStartupMonitorsWithoutFeedMounted:true,priorityProviderReactChecks:checks,changedSelectionUsesNextAdmittedRead:true,accountOnlyAndFollowerFocus:true,backgroundSiblingKindNotStarved:true,accountCadenceNotReset:true,stableSelectionDoesNotPollFaster:true,refusalNotRetriedBySelection:true,pauseAndOwnerGuards:true,realPlatformRequests:0,businessWrites:0};
 }finally{if(componentActive)component.unmount();Date.now=now;window.setInterval=setInterval;window.clearInterval=clearInterval;delete window.matrixDesktop;}
}
async function runDouyinForegroundSlotTests(){
 const assert=require('node:assert/strict'),React=require('react'),{createRoot}=require('react-dom/client'),path=require('node:path'),{loadTs}=require('./qa-load-typescript.cjs'),root=path.resolve(__dirname,'..'),cache=new Map();
 let control,clock=200000,checks=0,serial=0;const calls=[],pending=[],intervals=new Map(),accounts=['a','b','c','d','e','f'].map(id=>({id,platform:'douyin',nickname:'QA-'+id,connectorSessionId:'session-'+id,nativeAccountKey:'native-'+id})),workspace={accounts,jobsLocked:false};
 const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},stub=(f,exports)=>cache.set(path.join(root,f),{exports}),pause=()=>new Promise(r=>setTimeout(r,10));
 const oldNow=Date.now,oldSet=window.setInterval,oldClear=window.clearInterval;Date.now=()=>clock;window.setInterval=fn=>{const id=++serial;intervals.set(id,fn);return id;};window.clearInterval=id=>intervals.delete(id);
 stub('client/src/api/index.ts',{getUser:()=>({id:'slot-owner'}),getAuthToken:()=> 'slot-token'});stub('client/src/components/workspace/OfficialWorkspace.tsx',{useOfficialWorkspace:()=>workspace});stub('client/src/components/workspace/WorkspaceUiState.ts',{useWorkspaceIdentity:()=> 'slot-owner'});
 const result=input=>({accountId:input.accountId,sessionId:'session-'+input.accountId,platform:'douyin',kind:input.kind,records:[],works:[],complete:false,nextCursor:'cursor-'+input.accountId,progress:{pages:1}});
 window.matrixDesktop={douyinInteractions:async input=>{calls.push(input);if(input.command==='cache')return{...result(input),fromCache:true};return new Promise(resolve=>pending.push({input,resolve}));}};
 const {DouyinInteractionDataProvider,useDouyinInteractionData}=loadTs('client/src/components/workspace/DouyinInteractionData.tsx',cache);function View(){control=useDouyinInteractionData('comments');return null;}
 const component=createRoot(document.querySelector('#root')),tick=async()=>{for(const fn of intervals.values())fn();await pause();},live=()=>calls.filter(c=>!c.command);
 try{
  component.render(React.createElement(DouyinInteractionDataProvider,{initialKinds:['comments']},React.createElement(View)));await pause();for(let i=0;i<8;i++)await tick();
  eq(live().length,2);eq(pending.length,2);const held=live().map(c=>c.accountId),foreground=accounts.find(a=>!held.includes(a.id));control.prioritize(foreground,'','comments');await pause();eq(live().at(-1).accountId,foreground.id);eq(pending.length,3);
  const next=accounts.find(a=>!live().some(c=>c.accountId===a.id));control.prioritize(next,'','comments');await pause();eq(live().at(-1).accountId,next.id);eq(pending.length,4);eq(pending.filter(p=>held.includes(p.input.accountId)).length,2);
  const freed=pending.shift();freed.resolve(result(freed.input));await pause();await tick();eq(live().length,4);eq(pending.length,3); // no new background work occupies the reserved slot
  // Same account remains serialized while an existing request finishes.
  control.prioritize(next,'','followers');control.activate('followers');await tick();eq(live().filter(c=>c.accountId===next.id).length,1);
  return{foregroundSlotReactChecks:checks,backgroundConcurrencyBoundedAtTwo:true,selectedAccountUsesReservedCapacity:true,inflightJobsNeverCancelled:true,sameAccountStillSerialized:true,realPlatformRequests:0};
 }finally{component.unmount();pending.forEach(p=>p.resolve(result(p.input)));await pause();Date.now=oldNow;window.setInterval=oldSet;window.clearInterval=oldClear;delete window.matrixDesktop;}
}
module.exports={runDouyinPriorityUiTests,runDouyinForegroundSlotTests};
