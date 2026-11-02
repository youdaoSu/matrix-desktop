// Real Chromium DOM/focus/scoped input events, synthetic official markup. No
// downloaded code execution, live account, platform API or publication.
const path=require('node:path'),root=path.resolve(__dirname,'..');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
if(!process.versions.electron){
 const {spawnSync}=require('node:child_process'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const r=spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename],{cwd:root,windowsHide:true,encoding:'utf8',timeout:45000,env});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status===0&&r.stdout?.includes('"bilibiliRenderedTagChecks"')?0:r.status||1);
}else{
 const {app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');
 const {syncBilibiliTags}=require('../desktop/bilibili-tags.cjs'),{createOperationBudget}=require('../desktop/operation-budget.cjs');
 app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-bili-tags-qa-')));app.commandLine.appendSwitch('mute-audio');app.disableHardwareAcceleration();
 app.whenReady().then(async()=>{
  let win,html='',checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},reject=async(task,pattern)=>{await assert.rejects(task,pattern);checks++;};
  const style='<style>body{padding:20px}.tag-container{padding:20px;border:1px solid}input{width:320px;height:32px}.label-item-v2-content{display:inline-block;margin:4px}.overlay{position:fixed;inset:0;background:#eee;z-index:9999}</style>';
  const field=tags=>`<div id="tag-container" class="tag-container"><h2>标签</h2><div class="tag-input-wrp"><div class="tag-pre-wrp">${tags.map(tag=>`<div class="label-item-v2-container"><p class="label-item-v2-content">${tag}</p></div>`).join('')}</div><input type="text" maxlength="20" placeholder="按回车键Enter创建标签"></div></div>`;
  try{
   const local=session.fromPartition('qa-bili-tags-only');await local.protocol.handle('https',()=>new Response(html,{headers:{'content-type':'text/html;charset=utf-8'}}));
   win=new BrowserWindow({show:false,width:1000,height:700,webPreferences:{session:local,contextIsolation:true,sandbox:true}});win.webContents.setAudioMuted(true);
   const js=code=>win.webContents.executeJavaScript(code);
   const load=async({tags=['原有活动标签'],delay=20,closed=false,extra='',rejectTag=false,form=false,pathName='/platform/upload/video/frame'}={})=>{
    html='<meta charset=utf-8>'+style+'<div id="host"></div><p id="notice" role="alert"></p><button id="publish" onclick="window.published++">立即投稿</button>'+extra+`<script>window.enterCount=0;window.trusted=[];window.published=0;const root=${closed?'document.querySelector("#host").attachShadow({mode:"closed"})':'document.querySelector("#host")'};root.innerHTML=${JSON.stringify((closed?style:'')+(form?'<form>':'')+field(tags)+(form?'</form>':''))};window.qaRoot=root;const input=root.querySelector('input');input.addEventListener('focus',()=>queueMicrotask(()=>{input.value=''}));input.addEventListener('keydown',e=>{e.stopPropagation();if(e.key!=='Enter')return;window.enterCount++;window.trusted.push(e.isTrusted);const value=input.value;setTimeout(()=>{${rejectTag?"document.querySelector('#notice').textContent='标签不符合平台要求，添加失败';":"const chip=document.createElement('p');chip.className='label-item-v2-content';chip.textContent=value;root.querySelector('.tag-pre-wrp').append(chip);"}input.value=''},${delay});});document.addEventListener('keydown',e=>{if(e.key==='Enter')window.published++});</script>`;
    await win.loadURL('https://member.bilibili.com'+pathName);
   };
   const sync=(tags,options)=>syncBilibiliTags(win.webContents,tags,createOperationBudget(10000),options);
   await load();let started=Date.now(),result=await sync(['原有活动标签','新标签']);eq(result.matched,true);eq(result.selected,['原有活动标签','新标签']);eq(await js('window.enterCount'),1);eq(await js('window.trusted'),[false]);eq(await js('window.published'),0);eq(Date.now()-started<2000,true);
   await sync(['新标签']);eq(await js('window.enterCount'),1);
   await reject(sync(['字'.repeat(21)]),/20字/);eq(await js('window.enterCount'),1);
   await reject(sync(Array.from({length:11},(_,i)=>'标签'+i)),/10个/);
   await load({tags:Array.from({length:10},(_,i)=>'已有'+i)});await reject(sync(['另一个标签']),/位置不足/);eq(await js('window.enterCount'),0);
   await load({extra:field([])});await reject(sync(['不应填写']),/唯一识别/);eq(await js('window.enterCount'),0);
   await load({extra:'<div class="overlay">官方弹窗</div>'});await reject(sync(['被遮挡']),/遮挡/);eq(await js('window.enterCount'),0);
   await load();await js('qaRoot.querySelector("input").value="本人未完成的标签"');await reject(sync(['不要覆盖']),/已有未确认内容/);eq(await js('qaRoot.querySelector("input").value'),'本人未完成的标签');eq(await js('window.enterCount'),0);
   await reject(sync(['原有活动标签']),/未确认内容/);eq(await js('window.enterCount'),0);
   await load({closed:true});result=await sync(['关闭组件内标签']);eq(result.matched,true);eq(await js('window.enterCount'),1);eq(await js('window.trusted'),[false]);eq(await js('window.published'),0);
   await load({form:true});await reject(sync(['不能误发']),/可提交表单/);eq(await js('window.enterCount'),0);eq(await js('window.published'),0);
   await load({rejectTag:true});await reject(sync(['平台拒绝']),/不符合平台要求/);eq(await js('window.enterCount'),1);
   await load({delay:800});await reject(sync(['限时结果'],{waitMs:100}),/不重复按回车/);eq(await js('window.enterCount'),1);await reject(sync(['限时结果'],{waitMs:100}),/不重复按回车/);eq(await js('window.enterCount'),1);await reject(sync(['原有活动标签']),/仍在校验/);eq(await js('window.enterCount'),1);await new Promise(resolve=>setTimeout(resolve,900));result=await sync(['限时结果']);eq(result.matched,true);eq(await js('window.enterCount'),1);
   await load();await js('qaRoot.querySelector("input").maxLength=2');await reject(sync(['实际控件三字']),/官方输入框2字/);eq(await js('window.enterCount'),0);
   await load();await reject(sync(['账号变更'],{assertCurrent:async()=>{throw Error('QA绑定已变化');}}),/绑定已变化/);eq(await js('window.enterCount'),0);
   // Losing focus to the document between prepare and confirm is not a user
   // choosing another input. Recover only that empty focus, never overwrite it.
   await load();let focusChecks=0;result=await sync(['恢复原标签焦点'],{assertCurrent:async()=>{if(++focusChecks===2)await js('qaRoot.querySelector("input").blur()');}});eq(result.matched,true);eq(await js('window.enterCount'),1);eq(await js('window.published'),0);
   await load({extra:'<input id="other-field" type="text">'});focusChecks=0;await reject(sync(['不要抢焦点'],{assertCurrent:async()=>{if(++focusChecks===2)await js('document.getElementById("other-field").focus()');}}),/焦点/);eq(await js('window.enterCount'),0);eq(await js('document.activeElement.id'),'other-field');
   await load();focusChecks=0;await reject(sync(['保留本人修改'],{assertCurrent:async()=>{if(++focusChecks===2)await js('qaRoot.querySelector("input").value="本人修改";qaRoot.querySelector("input").blur()');}}),/内容已经变化/);eq(await js('window.enterCount'),0);eq(await js('qaRoot.querySelector("input").value'),'本人修改');
   await load();focusChecks=0;await reject(sync(['保留遮挡'],{assertCurrent:async()=>{if(++focusChecks===2)await js('qaRoot.querySelector("input").blur();document.body.insertAdjacentHTML("beforeend",\'<div class="overlay">官方弹窗</div>\')');}}),/遮挡/);eq(await js('window.enterCount'),0);
   await load({pathName:'/platform/home'});await reject(sync(['不在投稿页']),/不是B站官方投稿页/);eq(await js('window.enterCount'),0);
   // A slow official validation may outlive the old six-second deadline.
   // Its completion is accepted immediately; the Enter event is never replayed.
   await load({delay:6500});result=await sync(['迟到的官网校验']);eq(result.matched,true);eq(await js('window.enterCount'),1);eq(await js('window.published'),0);
   // A delegated public input handler inside the actual tag widget must receive
   // one Enter; unrelated document handlers must still receive none.
   await load();await js('const original=qaRoot.querySelector("input"),copy=original.cloneNode(true);original.replaceWith(copy);window.documentKeys=0;document.addEventListener("keydown",()=>documentKeys++);qaRoot.querySelector("#tag-container").addEventListener("keydown",e=>{if(e.target!==copy||e.key!=="Enter")return;window.enterCount++;const p=document.createElement("p");p.className="label-item-v2-content";p.textContent=copy.value;qaRoot.querySelector(".tag-pre-wrp").append(p);copy.value=""})');
   result=await sync(['区域委托标签']);eq(result.matched,true);eq(await js('window.enterCount'),1);eq(await js('window.documentKeys'),0);eq(await js('window.published'),0);
   // Complete production sync handler: generic text/declaration + staged tags.
   // A fresh fixture window keeps the real CDP lease keyed to this guest facade.
   const previousWindow=win;win=new BrowserWindow({show:false,width:1000,height:700,webPreferences:{session:local,contextIsolation:true,sandbox:true}});win.webContents.setAudioMuted(true);previousWindow.destroy();
   const handlers={},account={id:'qa-owned-bili',platform:'bilibili',connectorSessionId:'a'.repeat(16),nativeAccountKey:'12345'};let authCalls=0,rebind=false;
   const guest={id:22,hostWebContents:{id:11},session:local,debugger:win.webContents.debugger,isDestroyed:()=>win.isDestroyed(),getURL:()=>win.webContents.getURL()};
   require('../desktop/personal-assist.cjs').registerPersonalAssist({ipcMain:{handle:(key,handler)=>handlers[key]=handler},getWindow:()=>({webContents:{id:11}}),webContents:{fromId:id=>id===22?guest:undefined},session:{fromPartition:()=>local},platforms:{bilibili:{domain:'bilibili.com'}},inspectPlatformSession:async()=>({authenticated:true}),authenticate:async()=>{authCalls++;return{userId:'qa-owner',account:{...account,...(rebind&&authCalls>=3?{connectorSessionId:'b'.repeat(16)}:{})}};}});
   const formMarkup='<input placeholder="标题"><textarea placeholder="简介" maxlength="2000"></textarea><select aria-label="创作声明"><option>内容无需标注</option></select>';
   await load({extra:formMarkup});
   const payload={accessToken:'qa-only',accountId:account.id,platform:'bilibili',sessionId:account.connectorSessionId,webContentsId:22,command:'fill',form:{title:'QA投稿',body:'字'.repeat(2000),topics:['一'.repeat(20),'二'.repeat(20)],options:{},extras:{创作声明:'内容无需标注'}}};
   result=await handlers['matrix:sync-publish-form']({sender:{id:11}},payload);
   eq(result.error,undefined);eq(result.filled.includes('tags'),true);eq(result.unresolved.some(message=>message.startsWith('tags：')),false);eq(await js('window.enterCount'),2);eq(await js('window.trusted'),[false,false]);eq(await js('document.querySelector("textarea").value.length'),2000);eq(await js('window.published'),0);
   await load({extra:formMarkup});authCalls=0;rebind=true;result=await handlers['matrix:sync-publish-form']({sender:{id:11}},payload);eq(result.unresolved.some(message=>message.includes('绑定已变化')),true);eq(await js('window.enterCount'),0);eq(await js('window.published'),0);
   console.log(JSON.stringify({bilibiliRenderedTagChecks:checks,scopedInputKeydownAndClosedComponents:true,globalTrustedKeysSent:0,selectedChipsRequired:true,preservesExistingAndMissionTags:true,uncertainEnterNeverRepeated:true,nativeMaxlengthHonored:true,noHtmlFormSubmitOrPublish:true,realPlatformNetwork:false}));
  }catch(error){console.error(error);process.exitCode=1;}finally{win?.destroy();app.exit(process.exitCode||0);}
 });
}
