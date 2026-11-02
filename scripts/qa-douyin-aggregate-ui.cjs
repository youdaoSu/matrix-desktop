// Actual React work rail, synthetic provider only, disposable Electron profile.
const path=require('node:path'),root=path.resolve(__dirname,'..');
async function run(){
 const assert=require('node:assert/strict'),React=require('react'),{createRoot}=require('react-dom/client'),{loadTs}=require('./qa-load-typescript.cjs'),cache=new Map();
 let checks=0,kind='comments',selected=null,filter=()=>true,refreshes=0,sourceProps,locked=false,verification=false,pendingRoster=false,accountBusy=false;const profileOpens=[];
 let followerRow={platformId:'401',platformUserId:'401',author:'QA粉丝',content:'',authorProfileUrl:'https://www.douyin.com/user/MS4wQaFollower',firstObservedAt:'2026-10-24T01:00:00.000Z'};
 const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},stub=(file,exports)=>cache.set(path.join(root,file),{exports});
 const accounts=['a','b'].map(id=>({id,platform:'douyin',nickname:'QA-'+id,connectorSessionId:'session-'+id,nativeAccountKey:'native-'+id}));
 const base=Date.parse('2026-10-23T12:00:00Z');
 const records=new Map(accounts.map((a,index)=>[a.id,Array.from({length:101},(_,n)=>({platformId:String(1000+n),platformUserId:'200',author:a.id+'-'+n,content:'fixture',workId:String(3000+n%3),displayTime:new Date(base-(n*2+(index===0?1:0))*1000).toISOString()})).reverse()]));
 records.get('a').push({platformId:'9000',platformUserId:'200',author:'unknown-time',content:'fixture',workId:'3000'});
 records.get('a').push({platformId:'9001',platformUserId:'200',author:'a-reply',content:'child',workId:'3000',parentPlatformId:'1000',displayTime:'2026-10-23T13:00:00Z'});
 const workspace={accounts,get jobsLocked(){return locked;},openDouyinProfile:async(...args)=>{profileOpens.push(args);return true;}};
 const data={readings:[],prioritize(){},refresh(a,k){eq(k,'followers');eq(a.id,'a');refreshes++;},entry(a){return{rows:kind==='comments'?records.get(a.id):[followerRow,{...followerRow,platformId:'402',platformUserId:'402',author:'QA第二位粉丝'}],works:[],complete:!pendingRoster,followerPending:pendingRoster,waitingForAccount:accountBusy,nextAt:0,error:verification?'需要本人完成页面验证':undefined};}};
 stub('client/src/api/index.ts',{getUser:()=>({id:'qa-owner'}),getAuthToken:()=> 'qa-token'});
 stub('client/src/components/workspace/OfficialWorkspace.tsx',{useOfficialWorkspace:()=>workspace});
 stub('client/src/components/workspace/WorkspaceUiState.ts',{useWorkspaceIdentity:()=> 'qa-owner',uiPage:()=>true,uiText:()=>true,useWorkspacePreference:(key,value)=>{const [state,set]=React.useState({key,value});return [state.key===key?state.value:value,next=>set({key,value:next})];}});
 stub('client/src/components/workspace/DouyinInteractionData.tsx',{useDouyinInteractionData:()=>data,douyinInteractionKey:(a,k)=>a.id+'/'+k,interactionStatus:error=>error?'需要验证':'已同步'});
 stub('client/src/components/workspace/InteractionUi.tsx',{InteractionEmpty:({children})=>React.createElement('p',null,children)});
 // The management refresh now targets its feature-owned auto-pagination
 // source, not the old background follower poll. Its full lifecycle has its
 // own real-React test; here verify the exact selected account/request intent.
 stub('client/src/components/workspace/DouyinFollowerSource.tsx',{DouyinFollowerSource:props=>{sourceProps=props;return React.createElement('div',{'data-qa-source-account':props.account.id});}});
 const {DouyinInteractionFeed}=loadTs('client/src/components/workspace/DouyinInteractionFeed.tsx',cache),component=createRoot(document.getElementById('root'));
 const pause=()=>new Promise(resolve=>setTimeout(resolve,25)),render=async()=>{component.render(React.createElement(DouyinInteractionFeed,{kind,account:selected,matches:filter}));await pause();};
 const authors=()=>[...document.querySelectorAll('.matrix-live-records article strong')].map(e=>e.textContent);
 const next=async()=>{[...document.querySelectorAll('footer button')].find(b=>b.textContent==='下一页').click();await pause();};
 try{
  await render();eq(authors().length,100);eq(authors().slice(0,6),['b-0','a-0','b-1','a-1','b-2','a-2']);eq(authors().includes('a-reply'),false);
  eq(authors().filter(s=>s.startsWith('a-')).length,50);eq(authors().filter(s=>s.startsWith('b-')).length,50);
  await next();eq(authors().slice(0,4),['b-50','a-50','b-51','a-51']);await next();eq(authors(),['b-100','a-100','unknown-time']);
  selected=accounts[0];await render();eq(authors().slice(0,3),['a-0','a-1','a-2']);
  selected=null;filter=id=>id==='b';await render();eq(authors().every(s=>s.startsWith('b-')),true);
  filter=()=>true;kind='followers';selected=accounts[0];verification=true;await render();
  eq(document.querySelector('a[href="#/accounts"]').textContent,'到账号管理完成验证');
  const refresh=()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='验证后重试');eq(refresh().disabled,false);eq(sourceProps.account.id,'a');eq(sourceProps.request,0);refresh().click();await pause();eq(refreshes,0);eq(sourceProps.account.id,'a');eq(sourceProps.request,1);
  locked=true;await render();eq(refresh().disabled,true);
  eq(document.querySelector('[data-slot=avatar]').title,'本条缓存未包含头像地址；等待官网名单成功同步后补齐');
  locked=false;verification=false;pendingRoster=true;await render();eq(document.querySelector('[aria-label="账号获取状态"]').textContent.includes('等待官网名单'),true);
  data.readings=['a/followers'];await render();eq(document.querySelector('[aria-label="账号获取状态"]').textContent.includes('检查官网名单'),true);data.readings=[];accountBusy=true;await render();eq(document.querySelector('[aria-label="账号获取状态"]').textContent.includes('等待账号空闲'),true);accountBusy=false;
  const trigger=()=>document.querySelector('.matrix-live-records article header button'),panel=()=>document.querySelector('[aria-label="抖音粉丝详情"]');trigger().focus();trigger().click();await pause();eq(!!panel(),true);eq(panel().closest('article'),trigger().closest('article'));eq(trigger().getAttribute('aria-controls'),panel().id);eq(panel().textContent.includes('平台暂未提供'),false);eq(panel().textContent.includes('本机首次记录（非关注时间）'),true);eq(document.activeElement.getAttribute('aria-label'),'关闭粉丝详情');
  [...panel().querySelectorAll('button')].find(b=>b.textContent==='查看官方主页').click();await pause();eq(profileOpens,[['a',followerRow.authorProfileUrl]]);eq(panel().querySelector('a[target="_blank"]'),null);
  document.querySelector('[aria-label="关闭粉丝详情"]').click();await pause();eq(panel(),null);eq(document.activeElement,trigger());trigger().click();await pause();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await pause();eq(panel(),null);eq(document.activeElement,trigger());
  trigger().click();await pause();trigger().click();await pause();eq(panel(),null);
  const second=document.querySelectorAll('.matrix-live-records article header button')[1];second.click();await pause();eq(panel().closest('article'),second.closest('article'));eq(panel().querySelector('strong').textContent,'QA第二位粉丝');eq(trigger().getAttribute('aria-expanded'),'false');eq(second.getAttribute('aria-expanded'),'true');eq(document.querySelectorAll('[aria-label="抖音粉丝详情"]').length,1);document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await pause();eq(panel(),null);eq(document.activeElement,second);
  followerRow={...followerRow,content:'QA此前简介',displayTime:'2026-10-20T01:00:00.000Z',followerDetailState:{signature:'cached',followTime:'cached'}};await render();trigger().click();await pause();eq(panel().textContent.includes('QA此前简介（此前同步记录）'),true);eq(panel().textContent.includes('（此前同步记录）'),true);
  selected=accounts[1];await render();eq(panel(),null);
  return {aggregateReactChecks:checks,crossAccountTimeOrderBeforePagination:true,allAccountPagesInterleaved:true,groupAndAccountFiltersPreserved:true,replyAncestryPreserved:true,manualVerificationRecovery:true,noAutomaticChallengeRetry:true,realPlatformRequests:0,realUserDataTouched:false};
 }finally{component.unmount();}
}
module.exports={run};
if(!process.versions.electron){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const result=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:40000});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status??1);
}else if(process.type!=='renderer'){
 const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),os=require('node:os');
 app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-aggregate-ui-')));app.commandLine.appendSwitch('mute-audio');
 app.whenReady().then(async()=>{let win;try{
  win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false}});
  win.webContents.session.webRequest.onBeforeRequest((request,done)=>done({cancel:request.url!=='https://aggregate.fixture.test/app'}));
  win.webContents.session.protocol.handle('https',()=>new Response('<div id="root"></div>',{headers:{'content-type':'text/html'}}));
  await win.loadURL('https://aggregate.fixture.test/app');
  console.log(JSON.stringify(await win.webContents.executeJavaScript(`require(${JSON.stringify(__filename)}).run()`)));
 }catch(error){console.error(error);process.exitCode=1;}finally{win?.destroy();app.exit(process.exitCode||0);}});
}
