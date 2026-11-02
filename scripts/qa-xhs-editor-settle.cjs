// Synthetic official-origin editor. No real account, network or publication.
const path=require('node:path'),root=path.resolve(__dirname,'..');
if(!process.versions.electron){
 const{spawnSync}=require('node:child_process'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const result=spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename],{env,cwd:root,windowsHide:true,encoding:'utf8',timeout:30000});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status===0&&result.stdout?.includes('xhsEditorSettleChecks')?0:1);
}else{
 const{app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');
 const{pageAction,settlePublishEditor}=require('../desktop/page-actions.cjs'),{runOfficialDOM}=require('../desktop/official-dom.cjs');
 app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-xhs-settle-')));app.disableHardwareAcceleration();
 app.whenReady().then(async()=>{let win,checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};try{
  const html='<meta charset=utf-8><style>body{padding:20px}input,button,#body{display:block;width:320px;min-height:40px;margin:15px}.overlay{position:fixed;inset:0;background:white;z-index:50}</style><form><input id=title placeholder="填写标题会有更多赞哦" value="QA原任务"><div id=body contenteditable=true>保留正文 #agent</div><button type=button onclick="window.clicks++">发布</button></form><input id=other><div id=suggestions class=overlay hidden>#agent 推荐列表</div><script>window.clicks=0;const editor=document.getElementById("body"),title=document.getElementById("title"),list=document.getElementById("suggestions");editor.onfocus=()=>list.hidden=false;title.onfocus=()=>setTimeout(()=>list.hidden=true,0);</script>';
  const local=session.fromPartition('qa-xhs-editor-settle');await local.protocol.handle('https',()=>new Response(html,{headers:{'content-type':'text/html;charset=utf-8'}}));
  win=new BrowserWindow({show:false,width:1000,height:700,webPreferences:{session:local,contextIsolation:true,sandbox:true}});
  const js=code=>win.webContents.executeJavaScript(code),run=(fn,args)=>runOfficialDOM(win.webContents,fn,args,'qa-xhs-settle',{backgroundFocus:true});
  await win.loadURL('https://creator.xiaohongshu.com/publish/publish');await js('editor.focus()');
  await run(pageAction,['inspect',{kind:'publish',nonce:'before'}]);await assert.rejects(run(pageAction,['validate',{nonce:'before',index:0}]),/遮挡/);checks++;
  eq((await run(settlePublishEditor,[{expectedTitle:'QA原任务'}])).settled,true);eq(await js('list.hidden'),true);eq(await js('editor.textContent'),'保留正文 #agent');eq(await js('title.value'),'QA原任务');eq(await js('window.clicks'),0);
  await run(pageAction,['inspect',{kind:'publish',nonce:'after'}]);eq((await run(pageAction,['validate',{nonce:'after',index:0}])).ready,true);
  await js('document.getElementById("other").focus()');eq((await run(settlePublishEditor,[{expectedTitle:'QA原任务'}])).settled,false);eq(await js('document.activeElement.id'),'other');
  await js('editor.focus()');await assert.rejects(run(settlePublishEditor,[{expectedTitle:'另一条任务'}]),/标题未匹配/);checks++;eq(await js('document.activeElement.id'),'body');
  await js('document.body.insertAdjacentHTML("beforeend",\'<div id="modal" class="overlay" role="dialog">官方确认或验证</div>\')');eq((await run(settlePublishEditor,[{expectedTitle:'QA原任务'}])).settled,false);eq(await js('document.activeElement.id'),'body');
  await run(pageAction,['inspect',{kind:'publish',nonce:'modal'}]);await assert.rejects(run(pageAction,['validate',{nonce:'modal',index:0}]),/遮挡/);checks++;
  await js('document.getElementById("modal").remove();editor.onblur=()=>editor.textContent="官网修改后的正文";void 0');await assert.rejects(run(settlePublishEditor,[{expectedTitle:'QA原任务'}]),/表单发生变化/);checks++;eq(await js('window.clicks'),0);
  // Real candidate menus can close only on an outside click. Losing guest
  // focus to BODY must not strand that menu, or steal another field's focus.
  await win.loadURL('https://creator.xiaohongshu.com/publish/publish');
  await js('title.onfocus=null;list.style.inset="250px 0 0 0";document.addEventListener("click",e=>{if(e.target===title)list.hidden=true});editor.focus();editor.blur();list.hidden=false');
  eq(await js('list.hidden'),false);
  eq((await run(settlePublishEditor,[{expectedTitle:'QA原任务'}])).settled,true);
  eq(await js('list.hidden'),true);eq(await js('editor.textContent'),'保留正文 #agent');eq(await js('window.clicks'),0);
  await run(pageAction,['inspect',{kind:'publish',nonce:'outside-click'}]);eq((await run(pageAction,['validate',{nonce:'outside-click',index:0}])).ready,true);
  await js('editor.focus();title.focus();list.hidden=false');
  eq((await run(settlePublishEditor,[{expectedTitle:'QA原任务'}])).settled,true);eq(await js('list.hidden'),true);
  await js('editor.focus();document.body.insertAdjacentHTML("beforeend",\'<div class="overlay" role="dialog">需要本人验证</div>\')');
  eq((await run(settlePublishEditor,[{expectedTitle:'QA原任务'}])).settled,false);eq(await js('list.hidden'),false);eq(await js('window.clicks'),0);
  // Candidate popovers using a down/up outside directive ignore click alone.
  await win.loadURL('https://creator.xiaohongshu.com/publish/publish');
  await js('title.onfocus=null;list.style.inset="250px 0 0 0";window.events=[];let down=false;document.addEventListener("mousedown",e=>{down=e.target===title;events.push([e.type,e.isTrusted])});document.addEventListener("mouseup",e=>{events.push([e.type,e.isTrusted]);if(down&&e.target===title)list.hidden=true});editor.focus();editor.blur();list.hidden=false;title.click()');
  eq(await js('list.hidden'),false);
  eq((await run(settlePublishEditor,[{expectedTitle:'QA原任务'}])).settled,true);
  eq(await js('list.hidden'),true);eq(await js('events'),[['mousedown',false],['mouseup',false]]);
  eq(await js('editor.textContent'),'保留正文 #agent');eq(await js('title.value'),'QA原任务');eq(await js('window.clicks'),0);
  await run(pageAction,['inspect',{kind:'publish',nonce:'outside-down-up'}]);eq((await run(pageAction,['validate',{nonce:'outside-down-up',index:0}])).ready,true);
  // A newly opened real modal during pointerdown ends the sequence immediately.
  await js('window.nextEvents=[];title.addEventListener("pointerdown",()=>{document.body.insertAdjacentHTML("beforeend",\'<div class="overlay" role="dialog">官方验证</div>\')},{once:true});title.addEventListener("mousedown",()=>nextEvents.push("mousedown"));title.addEventListener("click",()=>nextEvents.push("click"))');
  await assert.rejects(run(settlePublishEditor,[{expectedTitle:'QA原任务'}]),/控件或页面发生变化/);checks++;
  eq(await js('nextEvents'),[]);eq(await js('window.clicks'),0);
  await win.loadURL('https://member.bilibili.com/platform/upload/video/frame');await js('editor.focus()');eq((await run(settlePublishEditor,[{expectedTitle:'QA原任务'}])).settled,false);eq(await js('document.activeElement.id'),'body');
  console.log(JSON.stringify({xhsEditorSettleChecks:checks,realChromium:true,unknownModalPreserved:true,otherInputFocusPreserved:true,bodyAndTitlePreserved:true,publishClicks:0,realPlatformActions:0}));
 }catch(error){console.error(error);process.exitCode=1;}finally{win?.destroy();app.quit();}});
}
