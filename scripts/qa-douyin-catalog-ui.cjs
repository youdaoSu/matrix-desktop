// Actual React work rail, synthetic provider only, disposable Electron profile.
const path=require('node:path'),root=path.resolve(__dirname,'..');
async function run(){
 const assert=require('node:assert/strict'),React=require('react'),{createRoot}=require('react-dom/client'),{loadTs}=require('./qa-load-typescript.cjs'),cache=new Map();
 let checks=0,selected='',refreshes=0,locked=false;
 const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},stub=(file,exports)=>cache.set(path.join(root,file),{exports});
 const account={id:'a',platform:'douyin',connectorSessionId:'s',nativeAccountKey:'fixture'};
 const work=n=>({platformId:String(8000000000000000000n+BigInt(n)),title:'Fixture work '+n,publishedAt:new Date(1792512000000-n*1000).toISOString(),pinned:n<3,pinnedOrder:n-1});
 let entry={rows:[],works:Array.from({length:13},(_,i)=>work(i+1)),complete:false,progress:{worksCatalogComplete:false},phase:'获取中'};
 stub('client/src/components/workspace/OfficialWorkspace.tsx',{useOfficialWorkspace:()=>({jobsLocked:locked})});
 stub('client/src/components/workspace/DouyinInteractionData.tsx',{useDouyinInteractionData:()=>({entry:()=>entry,refresh:()=>{refreshes++;}})});
 stub('client/src/components/workspace/WorkspaceUiState.ts',{uiPage:()=>true,uiText:()=>true,useWorkspacePreference:(_key,value)=>React.useState(value)});
 const {DouyinCommentWorkRail}=loadTs('client/src/components/workspace/DouyinCommentMonitor.tsx',cache),component=createRoot(document.getElementById('root'));
 const pause=()=>new Promise(resolve=>setTimeout(resolve,20)),render=async()=>{component.render(React.createElement(DouyinCommentWorkRail,{account,selected,onSelect:id=>{selected=id;}}));await pause();};
 const header=()=>document.querySelector('.matrix-interaction-posts header'),buttons=()=>[...document.querySelectorAll('[data-interaction-post-id]')];
 try{
  await render();eq(header().textContent.includes('13 · 目录读取中'),true);eq(buttons().length,13);eq(header().querySelector('span').title.includes('并非账号作品总数'),true);
  entry={...entry,progress:{worksCatalogComplete:false,catalogReadError:'QA目录暂停，已核验作品继续同步'}};await render();eq(header().textContent.includes('目录暂停'),true);eq(header().querySelector('span').title,'QA目录暂停，已核验作品继续同步');
  entry={...entry,works:Array.from({length:119},(_,i)=>work(i+1)),progress:{worksCatalogComplete:true}};await render();
  eq(header().querySelector('span').textContent,'119');eq(header().textContent.includes('目录读取中'),false);eq(entry.complete,false);eq(header().querySelector('span').title.includes('评论继续独立同步'),true);eq(buttons().length,20);eq(document.querySelector('footer span').textContent,'1/6');
  eq(buttons()[0].dataset.interactionPostId,work(1).platformId);eq(buttons()[1].dataset.interactionPostId,work(2).platformId);
  buttons()[0].click();eq(selected,work(1).platformId);
  for(let i=0;i<5;i++){[...document.querySelectorAll('footer button')].find(b=>b.textContent==='下一页').click();await pause();}
  eq(document.querySelector('footer span').textContent,'6/6');eq(buttons().length,19);eq(buttons().at(-1).dataset.interactionPostId,work(119).platformId);
  locked=true;await render();eq([...header().querySelectorAll('button')].find(b=>b.textContent==='刷新作品').disabled,true);
  locked=false;await render();[...header().querySelectorAll('button')].find(b=>b.textContent==='刷新作品').click();await pause();eq(refreshes,1);eq(document.querySelector('footer span').textContent,'1/6');
  return{catalogReactChecks:checks,all119Navigable:true,pinnedOrderPreserved:true,catalogAndCommentCompletionSeparated:true,refreshRetainsJobLock:true,realPlatformRequests:0,realUserProfileTouched:false};
 }finally{component.unmount();}
}
module.exports={run};
if(!process.versions.electron){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const result=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:40000});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status??1);
}else if(process.type!=='renderer'){
 const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),os=require('node:os');
 app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-catalog-ui-')));app.commandLine.appendSwitch('mute-audio');
 app.whenReady().then(async()=>{let win;try{
  win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false}});
  win.webContents.session.webRequest.onBeforeRequest((request,done)=>done({cancel:request.url!=='https://catalog.fixture.test/app'}));
  win.webContents.session.protocol.handle('https',()=>new Response('<div id="root"></div>',{headers:{'content-type':'text/html'}}));
  await win.loadURL('https://catalog.fixture.test/app');
  console.log(JSON.stringify(await win.webContents.executeJavaScript(`(async()=>{const catalog=await require(${JSON.stringify(__filename)}).run();const fixture=require(${JSON.stringify(path.join(__dirname,'qa-douyin-priority-ui.cjs'))});const priority=await fixture.runDouyinPriorityUiTests();const slots=await fixture.runDouyinForegroundSlotTests();return {...catalog,...priority,...slots};})()`)));
 }catch(error){console.error(error);process.exitCode=1;}finally{win?.destroy();app.exit(process.exitCode||0);}});
}
