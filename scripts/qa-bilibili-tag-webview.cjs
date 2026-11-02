// Actual embedded guest/host input routing. Synthetic protocol and disposable
// profile only; no platform account, uploads, APIs or publication.
const path=require('node:path'),root=path.resolve(__dirname,'..');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
if(!process.versions.electron){
 const{spawnSync}=require('node:child_process'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const r=spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename],{cwd:root,windowsHide:true,encoding:'utf8',timeout:30000,env});
 process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status===0&&r.stdout?.includes('"bilibiliEmbeddedTagChecks"')?0:r.status||1);
}else{
 const{app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-bili-tag-webview-qa-'));app.setPath('userData',profile);app.commandLine.appendSwitch('mute-audio');
 app.whenReady().then(async()=>{let win,checks=0;try{
  const local=session.fromPartition('qa-bili-tag-webview');let loads=0;
  await local.protocol.handle('https',()=>{loads++;return new Response(`<meta charset=utf-8><style>input{width:300px;height:32px}.label-item-v2-content{display:inline-block;padding:5px}</style><div id=tag-container class=tag-container><div class=tag-input-wrp><div class=tag-pre-wrp><p class=label-item-v2-content>已有活动标签</p></div><input type=text maxlength=20></div></div><script>window.events=[];window.trusted=[];window.mutations=0;const input=document.querySelector('input');document.addEventListener('keydown',()=>events.push('keydown'));input.addEventListener('focus',()=>queueMicrotask(()=>{input.value=''}));input.addEventListener('keydown',e=>{events.push(e.key);trusted.push(e.isTrusted);if(e.key==='Enter'){const value=input.value;setTimeout(()=>{const p=document.createElement('p');p.className='label-item-v2-content';p.textContent=value;document.querySelector('.tag-pre-wrp').append(p);input.value='';mutations++},100)}});</script>`,{headers:{'Content-Type':'text/html; charset=utf-8'}});});
  win=new BrowserWindow({show:false,width:1000,height:700,webPreferences:{session:local,webviewTag:true,contextIsolation:true,sandbox:true}});win.webContents.setAudioMuted(true);
  const attached=new Promise(resolve=>win.webContents.once('did-attach-webview',(_,guest)=>guest.once('did-finish-load',()=>resolve(guest))));
  await win.loadURL('data:text/html,'+encodeURIComponent(`<button id=publish>一键发布</button><button id=other>其他功能</button><section style="position:fixed;left:-20000px;top:0;width:1280px;height:900px"><webview partition="qa-bili-tag-webview" src="https://member.bilibili.com/platform/upload/video/frame" style="width:1280px;height:900px"></webview></section><script>window.qa={keys:0,publishes:0};document.addEventListener('keyup',()=>qa.keys++);document.addEventListener('keydown',()=>qa.keys++);document.querySelector('#publish').onclick=()=>qa.publishes++;</script>`));
  const guest=await attached,js=code=>guest.executeJavaScript(code),host=code=>win.webContents.executeJavaScript(code);
  await host('document.querySelector("#publish").focus()');const focused=await host('document.activeElement.id');assert.equal(focused,'publish');checks++;
  const{syncBilibiliTags}=require('../desktop/bilibili-tags.cjs'),{createOperationBudget}=require('../desktop/operation-budget.cjs');
  // Fail if a regression reintroduces a global CDP keyboard command at all.
  const original=guest.debugger.sendCommand.bind(guest.debugger);let globalKeys=0;
  guest.debugger.sendCommand=async(method,...args)=>{if(method==='Input.dispatchKeyEvent'){globalKeys++;throw Error('Global key forbidden in embedded tag adapter');}if(method==='Emulation.setFocusEmulationEnabled')throw Error('Tag inspection must not induce focus events that clear an unsaved DOM value');return original(method,...args);};
  const topics=['一'.repeat(20),'二'.repeat(20)],result=await syncBilibiliTags(guest,topics,createOperationBudget(10000));
  assert.equal(result.matched,true);assert.deepEqual(result.selected,['已有活动标签',...topics]);assert.deepEqual(await js('events'),['Enter','Enter']);assert.deepEqual(await js('trusted'),[false,false]);assert.equal(await js('mutations'),2);assert.equal(globalKeys,0);checks+=6;
  assert.deepEqual(await host('qa'),{keys:0,publishes:0});assert.equal(await host('document.activeElement.id'),focused);assert.equal(win.isVisible(),false);assert.equal(loads,1);checks+=4;
  await syncBilibiliTags(guest,topics,createOperationBudget(10000));assert.equal(await js('mutations'),2);assert.equal(globalKeys,0);assert.deepEqual(await host('qa'),{keys:0,publishes:0});checks+=3;
  await js('document.querySelector("input").value="本人未完成标签"');await assert.rejects(syncBilibiliTags(guest,['不得覆盖'],createOperationBudget(10000)),/未确认内容/);assert.equal(await js('document.querySelector("input").value'),'本人未完成标签');assert.equal(await js('mutations'),2);assert.deepEqual(await host('qa'),{keys:0,publishes:0});checks+=4;
  console.log(JSON.stringify({bilibiliEmbeddedTagChecks:checks,actualWebviewOffscreen:true,hostPublishButtonInitiallyFocused:true,hostFocusUnchanged:true,hostKeyboardEvents:0,globalCdpKeyEvents:0,hostPublishClicks:0,selectedChipsConfirmed:true,untrustedScopedEventExplicit:true,repeatedReadDoesNotReadd:true,unsavedTagPreserved:true,realPlatformNetwork:false,realUserDataTouched:false}));
 }catch(e){console.error(e);process.exitCode=1;}finally{win?.destroy();app.exit(process.exitCode||0);}});
}
