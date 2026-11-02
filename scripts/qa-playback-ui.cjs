const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'..');
async function test(){
 const assert=require('node:assert/strict'),React=require('react'),{createRoot}=require('react-dom/client'),{loadTs}=require('./qa-load-typescript.cjs');
 const cache=new Map(),overrides=new Map(),stub=(f,exports)=>cache.set(path.join(root,f),{exports});
 const account={id:'qa-a',platform:'douyin',nickname:'QA account',connectorSessionId:'qa-session',nativeAccountKey:'123'};
 let owner='qa-owner',accounts=[account],entries={},refreshes=0,checks=0;
 stub('client/src/components/workspace/OfficialWorkspace.tsx',{useOfficialWorkspace:()=>({accounts,jobsLocked:false})});
 stub('client/src/components/workspace/WorkspaceUiState.tsx',{useWorkspaceIdentity:()=>owner});
 stub('client/src/components/workspace/DouyinInteractionData.tsx',{useDouyinInteractionData:()=>({entry:a=>entries[a.id],refresh:()=>{refreshes++;}})});
 stub('client/src/components/ui/button.tsx',{Button:({variant,size,children,...props})=>React.createElement('button',props,children)});
 overrides.set('react-router-dom',{Link:({to,children,...props})=>React.createElement('a',{href:to,...props},children)});
 const Page=loadTs('client/src/pages/user/PlaybackVelocityPage.tsx',cache,overrides).default,component=createRoot(document.getElementById('root'));
 const pause=()=>new Promise(r=>setTimeout(r,30)),render=async()=>{component.render(React.createElement(Page));await pause();await pause();};
 const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},rows=()=>[...document.querySelectorAll('[data-playback-row]')],button=s=>[...document.querySelectorAll('button')].find(n=>n.textContent===s);
 const now=Date.now(),sample=(id,extra={})=>({platformId:String(id),title:'QA '+id,ownerUid:'987654321',playbackAccountKey:'123',playCount:120,playObservedAt:new Date(now).toISOString(),playCountSource:'douyin-creator-play-count-v1',playbackHistory:[{at:new Date(now-300000).toISOString(),count:20}],...extra});
 try{
  await render();eq(rows().length,0);eq(refreshes,0);
  entries={'qa-a':{works:[sample(1),sample(2,{playCount:0,playbackHistory:[{at:new Date(now-300000).toISOString(),count:0}]}),sample(3,{playCount:undefined}),sample(4,{playbackHistory:[]}),sample(5,{playCount:10}),sample(6,{playbackAccountKey:'foreign'})]}};await render();eq(rows().length,6);
  eq(rows()[0].querySelectorAll('td')[1].textContent,'100');eq(rows()[0].querySelectorAll('td')[2].textContent,'1,200');eq(rows()[1].querySelectorAll('td')[2].textContent,'0');eq(rows()[2].querySelectorAll('td')[0].textContent,'—');assert.match(rows()[3].textContent,/等待第二次采样/);assert.match(rows()[4].textContent,/计数回落/);eq(rows()[5].querySelectorAll('td')[0].textContent,'—');checks+=2;
  let select=document.querySelector('select');select.value='qa-a';select.dispatchEvent(new Event('change',{bubbles:true}));await pause();button('刷新所选账号作品').click();await pause();eq(refreshes,1);
  entries={'qa-a':{works:Array.from({length:121},(_,i)=>sample(i+1))}};await render();eq(rows().length,50);button('下一页').click();await pause();eq(rows().length,50);eq(rows()[0].querySelector('strong').textContent,'QA 51');button('下一页').click();await pause();eq(rows().length,21);eq(button('下一页').disabled,true);
  entries={'qa-a':{works:[sample(1)]}};await render();eq(rows().length,1);assert.match(document.body.innerText,/第 1\/1 页/);checks++;
  // An owner change remounts filters and never retains the other owner's rows.
  owner='qa-owner-b';accounts=[];entries={};await render();eq(rows().length,0);eq(document.querySelector('select').value,'');assert.ok(!document.body.innerText.includes('QA account'));checks++;
  return {playbackUiChecks:checks,realReact:true,pagingAndOwnerIsolation:true,zeroAndUnknownDistinct:true,platformActions:0};
 }finally{component.unmount();}
}
module.exports={test};
if(require.main===module||process.versions.electron&&process.type!=='renderer'){
 if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const r=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename],{cwd:root,encoding:'utf8',windowsHide:true,env,timeout:60000});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exitCode=r.status??1;}
 else{const {app,BrowserWindow,session}=require('electron'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-playback-ui-'));app.setPath('userData',profile);app.disableHardwareAcceleration();const timer=setTimeout(()=>app.exit(1),45000);app.whenReady().then(async()=>{let win;try{session.defaultSession.webRequest.onBeforeRequest((r,done)=>done({cancel:!r.url.startsWith('data:')}));win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:true,contextIsolation:false,sandbox:false,backgroundThrottling:false}});await win.loadURL('data:text/html,<div id="root"></div>');console.log(JSON.stringify(await win.webContents.executeJavaScript('require('+JSON.stringify(__filename)+').test()')));}catch(e){console.error(e);process.exitCode=1;}finally{clearTimeout(timer);win?.destroy();app.exit(process.exitCode||0);}});}
}
