// Real React routing/account lifecycle; synthetic IPC and disposable renderer.
const path=require('node:path'),root=path.resolve(__dirname,'..');
async function run(nativeGuest=false){
 const assert=require('node:assert/strict'),React=require('react'),{createRoot}=require('react-dom/client'),{loadTs}=require('./qa-load-typescript.cjs'),cache=new Map();
 let owner='qa-owner',token='qa-token',selected='a',visible=true,request=0,checks=0,releaseA,holdA=true;
 const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
 let accounts=['a','b','c','d','e'].map((id,i)=>({id,platform:'douyin',nickname:'QA '+id,connectorSessionId:`0000000${i}-bbbb-cccc-dddd-eeeeeeeeeeee`,nativeAccountKey:'qa-'+id}));
 cache.set(path.join(root,'client/src/api/index.ts'),{exports:{getUser:()=>({id:owner}),getAuthToken:()=>token}});
 const {DouyinFollowerSessions,DouyinFollowerControls}=loadTs('client/src/components/workspace/DouyinFollowerSessions.tsx',cache),component=createRoot(document.getElementById('root'));
 const calls=[],modes=new Map(),guestIds=new WeakMap();let sequence=100;
 const cursor=id=>`0000000${accounts.findIndex(a=>a.id===id)}-1111-2222-3333-444444444444`;
 window.matrixDesktop={preparePlatformLogin:async(platform,sessionId)=>({platform,sessionId,partition:`persist:matrix-douyin-${sessionId}`}),syncDouyinFollowers:async input=>{
  calls.push({...input});const account=accounts.find(a=>a.id===input.accountId),base={accountId:account.id,sessionId:account.connectorSessionId};
  if(input.command==='prepare')return {...base,ready:true};
  if(input.command==='start'&&input.accountId==='a'&&holdA)await new Promise(resolve=>{releaseA=resolve;});
  if(input.command==='pause')return {...base,cursor:cursor(account.id),status:'paused',complete:false};
  const complete=modes.get(account.id)==='complete';
  return {...base,cursor:cursor(account.id),loaded:70,avatars:70,status:complete?'complete':'running',complete,retryAfterMs:1500};
 }};
 const settle=(ms=20)=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async fn=>{for(let n=0;n<250&&!fn();n++)await settle();assert(fn(),'Session fixture timeout');};
 const guest=id=>document.querySelector(`[data-follower-source-account="${id}"] webview`);
 const per=id=>calls.filter(call=>call.accountId===id);
 const button=name=>[...document.querySelectorAll('button')].find(node=>node.textContent===name);
 const observed=new WeakSet(),observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes){if(node.nodeType!==1)continue;for(const view of [...(node.tagName==='WEBVIEW'?[node]:[]),...node.querySelectorAll('webview')])if(!observed.has(view)){observed.add(view);if(nativeGuest)view.addEventListener('dom-ready',()=>guestIds.set(view,view.getWebContentsId()),{once:true});else{const id=++sequence;guestIds.set(view,id);view.getWebContentsId=()=>id;view.setAudioMuted=()=>{};view.dispatchEvent(new Event('dom-ready'));}}}});
 observer.observe(document.getElementById('root'),{subtree:true,childList:true});
 const render=()=>component.render(React.createElement(DouyinFollowerSessions,{accounts},visible?React.createElement(DouyinFollowerControls,{account:accounts.find(a=>a.id===selected),request}):React.createElement('p',null,'Another module')));
 try{
  render();await wait(()=>!!releaseA);const a=guest('a'),parent=a.parentElement,aId=guestIds.get(a);
  // Selection changes during START; its late cursor must still be saved+paused.
  selected='b';render();await wait(()=>per('b').some(c=>c.command==='start'));holdA=false;releaseA();releaseA=undefined;
  await wait(()=>per('a').some(c=>c.command==='pause'));eq(guest('a'),a);eq(a.isConnected,true);eq(a.parentElement,parent);eq(a.closest('section').getAttribute('aria-hidden'),'true');
  selected='a';render();await wait(()=>per('a').some(c=>c.command==='resume'));eq(per('a').filter(c=>c.command==='start').length,1);eq(per('a').find(c=>c.command==='resume').cursor,cursor('a'));eq(per('a').filter(c=>c.command==='resume').every(c=>c.webContentsId===aId),true);
  await wait(()=>per('b').some(c=>c.command==='pause'));const before=per('a').length;
  // A route's controller is removed, not the persistent official guest.
  visible=false;render();await wait(()=>per('a').filter(c=>c.command==='pause').length>=2);const pausedCalls=per('a').length;await settle(1700);eq(per('a').length,pausedCalls);eq(guest('a'),a);eq(a.parentElement,parent);eq(pausedCalls>before,true);
  visible=true;render();await wait(()=>per('a').filter(c=>c.command==='resume').length>=2);eq(guest('a'),a);eq(per('a').filter(c=>c.command==='start').length,1);
  // Ordinary refresh while running must not reset it.
  request++;render();await settle(60);eq(per('a').filter(c=>c.command==='start').length,1);eq(guest('a'),a);
  // Only explicit top recheck replaces the lease (not the same native guest).
  button('暂停粉丝同步').click();await wait(()=>button('从顶部重新核验'));const manualPauseCalls=per('a').length;visible=false;render();await settle();visible=true;render();await settle(80);eq(per('a').length,manualPauseCalls);eq(!!button('继续粉丝同步'),true);button('从顶部重新核验').click();await wait(()=>per('a').filter(c=>c.command==='start').length===2);eq(guest('a'),a);
  // Four unfinished guests are bounded; fifth must not evict A or restart it.
  for(const id of ['c','d']){selected=id;request=0;render();await wait(()=>per(id).some(c=>c.command==='start'));}
  selected='e';render();await wait(()=>document.body.textContent.includes('已有4个账号'));eq(guest('e'),null);eq(guest('a'),a);eq(per('a').filter(c=>c.command==='start').length,2);
  // Completion retires only that guest; coming back uses completed cache.
  modes.set('b','complete');selected='b';render();await wait(()=>!guest('b')&&document.body.textContent.includes('本轮 70 位'));const bStarts=per('b').filter(c=>c.command==='start').length;
  visible=false;render();await settle();visible=true;render();await settle(80);eq(guest('b'),null);eq(per('b').filter(c=>c.command==='start').length,bStarts);
  request++;render();await settle(80);eq(guest('b'),null);eq(per('b').filter(c=>c.command==='start').length,bStarts);
  // Binding changes must remove old page/lease, not re-use another session.
  accounts=accounts.map(account=>account.id==='a'?{...account,connectorSessionId:'99999999-bbbb-cccc-dddd-eeeeeeeeeeee'}:account);selected='a';render();await wait(()=>guest('a')&&guest('a')!==a);eq(a.isConnected,false);eq(guest('a').getAttribute('partition'),'persist:matrix-douyin-99999999-bbbb-cccc-dddd-eeeeeeeeeeee');
  // Owner/token transitions cannot retain an old account page.
  const prior=[...document.querySelectorAll('webview')];owner='another-owner';token='another-token';visible=false;render();await wait(()=>document.querySelectorAll('webview').length===0);eq(prior.every(view=>!view.isConnected),true);
  return {followerSessionChecks:checks,actualReact:true,actualSandboxedNativeGuest:nativeGuest,routeAndAccountGuestRetained:true,pauseWhileAway:true,sameGuestSameCursorResume:true,lateStartCursorSaved:true,refreshNotReset:true,explicitRecheckOnly:true,completedNoRescan:true,maxFourUnfinishedGuests:true,bindingAndOwnerIsolation:true,realPlatformRequests:0,realProfileTouched:false};
 }finally{observer.disconnect();component.unmount();window.matrixDesktop=undefined;}
}
module.exports={run};
if(process.type==='renderer')module.exports={run};
else if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const r=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename,...process.argv.slice(2)],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:60000});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status??1);}
else{const {app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),os=require('node:os');app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-follower-sessions-qa-')));app.whenReady().then(async()=>{let win;try{
 const nativeGuest=process.argv.includes('--native');let deniedRequests=0;
 if(nativeGuest)for(const id of ['00000000','00000001','00000002','00000003','00000004','99999999']){
  const source=session.fromPartition('persist:matrix-douyin-'+id+'-bbbb-cccc-dddd-eeeeeeeeeeee');
  source.webRequest.onBeforeRequest((details,done)=>{const allowed=details.url==='https://www.douyin.com/user/self';if(!allowed)deniedRequests++;done({cancel:!allowed});});
  source.protocol.handle('https',()=>new Response('<h1>Offline synthetic own follower page</h1>',{headers:{'content-type':'text/html'}}));
 }
 win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false,webviewTag:nativeGuest}});
 win.webContents.on('will-attach-webview',(_event,prefs)=>{prefs.nodeIntegration=false;prefs.contextIsolation=true;prefs.sandbox=true;});
 const origin='https://follower-sessions.fixture.test/';win.webContents.session.webRequest.onBeforeRequest((r,done)=>done({cancel:r.url!==origin}));win.webContents.session.protocol.handle('https',()=>new Response('<div id="root"></div>',{headers:{'content-type':'text/html'}}));await win.loadURL(origin);
 const result=await win.webContents.executeJavaScript(`require(${JSON.stringify(__filename)}).run(${nativeGuest})`);require('node:assert/strict').equal(deniedRequests,0);console.log(JSON.stringify({...result,unexpectedGuestRequests:deniedRequests}));
 }catch(error){console.error(error.stack||error);process.exitCode=1;}finally{win?.destroy();app.exit(process.exitCode||0);}});}
