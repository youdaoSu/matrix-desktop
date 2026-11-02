// Hidden, disposable Electron fixture only. Never attach to Matrix or its
// userData/debug ports. Real network is rejected before loading the test page.
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),req=createRequire(path.join(root,'package.json'));
async function renderTests(mode='overview'){
 const assert=require('node:assert/strict'),React=req('react'),{createRoot}=req('react-dom/client'),{loadTs}=req('./scripts/qa-load-typescript.cjs');
 const cache=new Map(),overrides=new Map(),stub=(file,exports)=>cache.set(path.join(root,file),{exports});
 const account={id:'qa-a',platform:'douyin',connectorSessionId:'qa-session-0001',nativeAccountKey:'123',nickname:'测试账号 · 合成数据'};
 let accounts=[account],entries={},rows={},checks=0,externalCalls=0;
 const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
 stub('client/src/components/workspace/OfficialWorkspace.tsx',{useOfficialWorkspace:()=>({accounts}),platformLabels:{douyin:'抖音',bilibili:'B站',xiaohongshu:'小红书',wechat:'视频号'}});
 stub('client/src/components/workspace/DouyinInteractionData.tsx',{useDouyinInteractionCache:()=>({entry:(a,kind)=>entries[a.id+'/'+kind]}),interactionStatus:()=> '获取失败',useDouyinInteractionData:()=>{externalCalls++;throw Error('Overview activated a collector');}});
 stub('client/src/components/workspace/DouyinInbox.tsx',{useDouyinInboxCache:()=>({rows}),inboxAccountStatus:()=>({label:'部分同步'})});
 const Button=({children,asChild,variant,size,...props})=>asChild?children:React.createElement('button',props,children);
 stub('client/src/components/ui/button.tsx',{Button});stub('client/src/components/ui/input.tsx',{Input:props=>React.createElement('input',props)});
 overrides.set('react-router-dom',{Link:({to,children,...props})=>React.createElement('a',{href:to,...props},children)});
 const Page=loadTs('client/src/components/workspace/DesktopRecordOverview.tsx',cache,overrides).default;
 const Features=loadTs('client/src/pages/user/FeatureStatusPage.tsx',cache,overrides).default;
 const container=document.getElementById('root');const mounted=container.__matrixQaRoot||(container.__matrixQaRoot=createRoot(container));let generation=0;
 const pause=()=>new Promise(resolve=>setTimeout(resolve,20)),render=async(component=Page)=>{mounted.render(React.createElement(component,{key:++generation}));await pause();await pause();};
 const values=()=>[...document.querySelectorAll('.matrix-record-metrics strong')].map(node=>node.textContent);
 const previousFetch=global.fetch;global.fetch=()=>{externalCalls++;throw Error('Fixture forbids network');};
 try{
  await render();eq(values(),['—','—','—','—']);
  entries={'qa-a/comments':{rows:[],works:[],error:'QA failure',complete:false}};await render();eq(values(),['—','—','—','—']);assert.match(document.body.innerText,/获取失败/);checks++;
  entries={'qa-a/comments':{rows:[],works:[],baseline:false,complete:false}};await render();eq(values(),['0','0','—','—']);
  const comments={rows:[{platformId:'100'}],works:[{platformId:'111'}],baseline:true,complete:true};
  const followers={rows:[{platformId:'1',avatarUrl:'https://example.invalid/qa.png'},{platformId:'2'},{platformId:'3',avatarUrl:'https://example.invalid/old.png',isCurrentFollower:false}],baseline:true,complete:false};
  entries={'qa-a/comments':comments,'qa-a/followers':followers};
  rows={'qa-a':{accountId:'qa-a',sessionId:'qa-session-0001',status:{ownUid:'999',threadCount:4,messageCount:50}}};await render();eq(values(),['1','1','2','—']);assert.match(document.body.innerText,/非全量证明/);checks++;
  rows['qa-a'].status.ownUid='123';await render();eq(values(),['1','1','2','50']);assert.match(document.body.innerText,/4 \/ 50/);checks++;
  accounts=[account,{...account,id:'qa-b',connectorSessionId:'qa-session-0002'}];entries['qa-b/comments']=comments;entries['qa-b/followers']=followers;await render();eq(values(),['1','1','2','50']);assert.match(document.body.innerText,/重复绑定/);checks++;
  const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL,oldClick=HTMLAnchorElement.prototype.click;let exported;
  URL.createObjectURL=blob=>{exported=blob;return'blob:synthetic-csv';};URL.revokeObjectURL=()=>{};HTMLAnchorElement.prototype.click=function(){eq(this.download,'远效-本机采集统计.csv');};
  [...document.querySelectorAll('button')].find(button=>button.textContent.includes('CSV')).click();await pause();const text=await exported.text();assert.ok(text.includes('测试账号'));assert.ok(!text.includes('qa-session'));assert.ok(!text.includes('example.invalid'));checks+=3;
  URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;HTMLAnchorElement.prototype.click=oldClick;
  accounts=[];entries={};rows={};await render();eq(values(),['—','—','—','—']);assert.ok(!document.body.innerText.includes('测试账号'));checks++;
  if(mode==='features'){
   await render(Features);eq(document.querySelectorAll('.matrix-capability-list article').length,16);
   const operations=[...document.querySelectorAll('.matrix-capability-list article')].find(row=>row.textContent.includes('账号运营与互动规则'));
   assert.ok(operations);assert.match(operations.textContent,/部分实现/);assert.match(operations.textContent,/实机.*验证/);assert.equal(operations.querySelector('a').getAttribute('href'),'/engage/account-operations');checks+=4;
   document.querySelector('.matrix-capability-count.pending').click();await pause();eq(document.querySelectorAll('.matrix-capability-list article').length,1);
   const input=document.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'不存在的功能QA');input.dispatchEvent(new Event('input',{bubbles:true}));await pause();eq(document.querySelectorAll('.matrix-capability-list article').length,0);
   await render(Features);
  }else{
   accounts=[account];entries={'qa-a/comments':comments,'qa-a/followers':followers};rows={'qa-a':{accountId:'qa-a',sessionId:'qa-session-0001',status:{ownUid:'123',threadCount:4,messageCount:50}}};await render();
  }
  eq(externalCalls,0);
  return{desktopRecordUiChecks:checks,mode,realReactComponents:true,syntheticDataOnly:true,networkOrCollectorActions:externalCalls,unknownAndZeroDistinct:true,foreignIdentityHidden:true};
 }finally{global.fetch=previousFetch;}
}
module.exports={renderTests};
if(require.main===module||process.versions.electron&&process.type!=='renderer'){
 if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const result=require('node:child_process').spawnSync(root+'/.desktop-deps/node_modules/electron/dist/electron.exe',[__filename],{encoding:'utf8',windowsHide:true,env,timeout:90000});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status??1);}
 else{
  const {app,BrowserWindow,session}=require('electron'),os=require('node:os');
  app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-rc216-ui-synthetic-')));app.commandLine.appendSwitch('mute-audio');app.disableHardwareAcceleration();
  const timeout=setTimeout(()=>{console.error('Disposable UI fixture exceeded 45 seconds');app.exit(1);},45000);
  app.whenReady().then(async()=>{let win;try{
   session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('data:')}));
   win=new BrowserWindow({show:false,width:1360,height:950,webPreferences:{nodeIntegration:true,contextIsolation:false,sandbox:false,backgroundThrottling:false}});
   const css=fs.readFileSync(root+'/client/src/data-workspace.css','utf8');
   await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<html lang="zh-CN"><head><style>:root{--card:#fff;--border:#e4e8ee;--muted:#f1f4f8;--primary:#2563eb;--muted-foreground:#66758a;--foreground:#152238}*{box-sizing:border-box}body{font:14px "Microsoft YaHei",sans-serif;background:#f5f7fb;color:#152238;margin:0;padding:32px}button,input,select{font:inherit}button{padding:8px 12px;cursor:pointer;border:1px solid #e4e8ee;border-radius:8px;background:white}a{text-decoration:none;color:#2563eb}h1,h2,p{margin:0}input{padding:10px;border:1px solid #e4e8ee;border-radius:8px;width:100%}.matrix-eyebrow{font-size:10px;letter-spacing:.14em;color:#64748b}'+css+'</style></head><body><div id="root"></div></body></html>'));
   for(const mode of ['overview','features']){const result=await win.webContents.executeJavaScript('require('+JSON.stringify(__filename)+').renderTests('+JSON.stringify(mode)+')');console.log(JSON.stringify(result));await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await win.webContents.capturePage();await new Promise(resolve=>setTimeout(resolve,100));const image=await win.webContents.capturePage();fs.mkdirSync(path.join(root,'logs'),{recursive:true});fs.writeFileSync(path.join(root,'logs','rc216-'+mode+'-synthetic-preview.png'),image.toPNG());}
  }catch(error){console.error(error);process.exitCode=1;}finally{clearTimeout(timeout);win?.destroy();app.exit(process.exitCode||0);}});
 }
}
