// Actual React component; disposable renderer, no actual account/network.
const path=require('node:path'),root=path.resolve(__dirname,'..');
async function run(){
 const assert=require('node:assert/strict'),React=require('react'),{createRoot}=require('react-dom/client'),{loadTs}=require('./qa-load-typescript.cjs');
 const cache=new Map();let checks=0,owner='qa-owner',token='qa-token',request=0,completed=false,selected=true,mode='complete',release,prepareRelease,prepared=0,events=[];
 const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
 const account={id:'qa-account',platform:'douyin',connectorSessionId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',nativeAccountKey:'qa-handle',nickname:'QA owner'};
 cache.set(path.join(root,'client/src/api/index.ts'),{exports:{getUser:()=>({id:owner}),getAuthToken:()=>token}});
 const {DouyinFollowerSource}=loadTs('client/src/components/workspace/DouyinFollowerSource.tsx',cache),component=createRoot(document.getElementById('root'));
 const calls=[],cursor='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
 const noteEvent=e=>events.push(e.detail);window.addEventListener('matrix:followers-cache-updated',noteEvent);
 window.matrixDesktop={isDesktop:true,preparePlatformLogin:async(platform,sessionId)=>{prepared++;return{platform,sessionId,partition:mode==='wrong-session'?'persist:wrong':`persist:matrix-douyin-${sessionId}`};},syncDouyinFollowers:async input=>{
  calls.push(input);const base={accountId:account.id,sessionId:account.connectorSessionId};
  if(input.command==='prepare'){if(mode==='hold-prepare')await new Promise(resolve=>{prepareRelease=resolve;});return{...base,ready:true};}
  if(input.command==='inspect')return{...base,inspection:{responseStatus:200,responseMime:3,responseEncoding:0,responseReadError:0,responseBytes:0,responseBodyKind:1,responseJsonValid:false,responseRosterShape:false,responseApiAccepted:false}};
  if(input.command==='pause')return{...base,cursor,status:'paused',reason:'QA paused'};
  if(mode==='verification')return{...base,cursor,loaded:7,avatars:7,status:'paused',complete:false,error:'QA official verification required'};
  if(mode==='elapsed-deadline')return{...base,cursor,loaded:7,avatars:7,status:input.command==='next'?'complete':'running',complete:input.command==='next',retryAfterMs:0};
  if(mode==='defer')await new Promise(resolve=>{release=resolve;});
  return{...base,cursor,loaded:7,avatars:7,status:mode==='complete'?'complete':'running',complete:mode==='complete',retryAfterMs:1500};
 }};
 const render=key=>component.render(React.createElement(DouyinFollowerSource,{key:key||'test',account,request,completed,selected}));
 const settle=()=>new Promise(resolve=>setTimeout(resolve,30));
 const wait=async test=>{for(let n=0;n<100&&!test();n++)await settle();assert(test(),'Synthetic source condition timed out');};
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
 let guestNumber=16;
 const ready=async()=>{await wait(()=>document.querySelector('webview'));const v=document.querySelector('webview'),id=++guestNumber;v.getWebContentsId=()=>id;v.setAudioMuted=()=>{};v.dispatchEvent(new Event('dom-ready'));await settle();return v;};
 try{
  let firstGuest;const fastReady=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes){const candidates=node.nodeType===1?[...(node.tagName==='WEBVIEW'?[node]:[]),...node.querySelectorAll('webview')]:[];for(const guest of candidates)if(guest.isConnected){firstGuest=guest;const id=++guestNumber;guest.getWebContentsId=()=>id;guest.setAudioMuted=()=>{};guest.dispatchEvent(new Event('dom-ready'));}}});fastReady.observe(document.getElementById('root'),{childList:true,subtree:true});
  render();await wait(()=>document.body.textContent.includes('本轮 7 位'));fastReady.disconnect();eq(!!firstGuest,true);
  eq(calls.map(c=>c.command),['prepare','start']);eq(prepared,1);eq(events.length,1);eq(events[0].accountId,account.id);eq(events[0].owner,owner);eq(calls.every(c=>c.webContentsId===17&&c.accessToken===token&&!('url'in c)),true);
  eq(firstGuest.getAttribute('src'),'https://www.douyin.com/user/self');eq(firstGuest.getAttribute('partition'),`persist:matrix-douyin-${account.connectorSessionId}`);
  await wait(()=>!document.querySelector('webview'));eq(calls.some(c=>c.command==='pause'),false);
  const retiredCalls=calls.length;firstGuest.dispatchEvent(new Event('dom-ready'));await settle();eq(calls.length,retiredCalls);eq(document.querySelector('webview'),null);
  const firstStarts=calls.filter(c=>c.command==='start').length;button('查看同步所用官网页面').click();const viewerGuest=await ready();await wait(()=>!document.body.textContent.includes('仅查看，不重新执行'));eq(viewerGuest!==firstGuest,true);eq(calls.filter(c=>c.command==='start').length,firstStarts);eq(calls.at(-1).command,'prepare');
  button('检测接口响应').click();await wait(()=>document.body.textContent.includes('HTTP 200，0 字节；空正文'));eq(calls.filter(c=>c.command==='inspect').length,1);eq(events.length,1);eq(document.body.textContent.includes('本轮 7 位'),true);
  eq(document.querySelector('section').getAttribute('aria-hidden'),'false');button('返回粉丝管理').click();await wait(()=>!document.querySelector('webview'));
  mode='running';button('重新同步全部粉丝').click();const pausedGuest=await ready();await wait(()=>button('暂停粉丝同步'));button('暂停粉丝同步').click();await wait(()=>button('继续粉丝同步'));eq(calls.some(c=>c.command==='pause'),true);eq(document.querySelector('webview'),pausedGuest);
  mode='complete';button('继续粉丝同步').click();await wait(()=>document.body.textContent.includes('本轮 7 位')&&!button('暂停粉丝同步'));eq(calls.some(c=>c.command==='resume'),true);await wait(()=>!document.querySelector('webview'));
  mode='verification';button('重新同步全部粉丝').click();const verifiedGuest=await ready();await wait(()=>document.body.textContent.includes('QA official verification required'));const refusedCalls=calls.length;
  selected=false;render();await settle();selected=true;render();await settle();eq(calls.length,refusedCalls);eq(document.querySelector('webview'),verifiedGuest);eq(button('继续粉丝同步').title.includes('原断点'),true);
  mode='complete';button('继续粉丝同步').click();await wait(()=>!document.querySelector('webview'));eq(calls.slice(refusedCalls).map(call=>call.command),['prepare','resume']);
  // Zero is an elapsed native deadline, not a missing value. No extra whole
  // 1500 ms wait; native tests independently enforce the scroll-rate floor.
  mode='elapsed-deadline';button('重新同步全部粉丝').click();const elapsedStart=performance.now();await ready();await wait(()=>!document.querySelector('webview'));eq(performance.now()-elapsedStart<1200,true);eq(calls.at(-1).command,'next');
  // Refresh during an IPC retains that run, never queues a reset.
  mode='defer';button('重新同步全部粉丝').click();await ready();await wait(()=>!!release);const before=calls.length;request++;render();await settle();eq(calls.length,before);mode='complete';release();release=undefined;await wait(()=>!button('暂停粉丝同步'));eq(calls.slice(before).map(c=>c.command),[]);await wait(()=>!document.querySelector('webview'));
  // Late owner changes cannot publish records or progress.
  mode='defer';button('重新同步全部粉丝').click();await ready();await wait(()=>!!release);const eventCount=events.length;owner='other-owner';release();release=undefined;await settle();eq(events.length,eventCount);owner='qa-owner';
  // A cached complete source stays cheap: no guest until explicit recheck.
  request=0;completed=true;mode='complete';const previousPreparations=prepared;render('cached');await settle();eq(document.querySelector('webview'),null);eq(prepared,previousPreparations);button('重新同步全部粉丝').click();await ready();await wait(()=>document.body.textContent.includes('本轮 7 位'));eq(prepared,previousPreparations+1);
  completed=false;mode='hold-prepare';render('cached-late');await ready();await wait(()=>!!prepareRelease);const startsBeforeCache=calls.filter(call=>call.command==='start').length;completed=true;render('cached-late');await settle();prepareRelease();prepareRelease=undefined;await wait(()=>!document.querySelector('webview'));eq(calls.filter(call=>call.command==='start').length,startsBeforeCache);eq(!!button('重新同步全部粉丝'),true);
  // Incorrect session is terminal and never creates an official guest.
  completed=false;mode='wrong-session';render('wrong');await wait(()=>document.body.textContent.includes('会话不一致'));eq(document.querySelector('webview'),null);
  return{followerSourceUiChecks:checks,actualReact:true,directManagementAutoStart:true,eagerCachedDomReadyNotMissed:true,retiredGuestEventsIgnored:true,pauseResume:true,refreshSerialized:true,lateOwnerDiscarded:true,cachedCompleteNoGuest:true,completedGuestRetired:true,pausedGuestRetained:true,viewerReopensSamePartitionWithoutNewSync:true,realPlatformRequests:0};
 }catch(error){console.error(JSON.stringify({syntheticSourceUiFailure:true,commands:calls.map(call=>call.command),guestPresent:!!document.querySelector('webview'),status:document.body.textContent.slice(0,600),prepared}));throw error;}finally{component.unmount();window.removeEventListener('matrix:followers-cache-updated',noteEvent);window.matrixDesktop=undefined;}
}
module.exports={run};
if(process.type==='renderer')module.exports={run};
else if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const r=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:45000});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status??1);}
else{const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),os=require('node:os');app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-follower-source-qa-')));app.whenReady().then(async()=>{let win;try{win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false}});const origin='https://follower-source.fixture.test/';win.webContents.session.webRequest.onBeforeRequest((r,done)=>done({cancel:r.url!==origin}));win.webContents.session.protocol.handle('https',()=>new Response('<div id="root"></div>',{headers:{'content-type':'text/html'}}));await win.loadURL(origin);console.log(JSON.stringify(await win.webContents.executeJavaScript(`require(${JSON.stringify(__filename)}).run()`)));}catch(error){console.error(error.stack||error);process.exitCode=1;}finally{win?.destroy();app.exit(process.exitCode||0);}});}
