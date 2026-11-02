// Real WebView2 + real Matrix IPC handlers, synthetic local pages and new profiles.
// The QA-only document handler is not compiled into the shipped MatrixEdgeHost.exe.
const { app, BrowserWindow } = require('electron');
require('./qa-console-pipe.cjs').guardQaConsolePipes({ exit: code => app.exit(code) });
require('../desktop/audio-policy.cjs').registerSilentAudio({ app });
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { registerEdgeEmbed, createEdgeTransport } = require('../desktop/edge-embed.cjs');
const { registerPersonalAssist } = require('../desktop/personal-assist.cjs');
const { registerPageActions } = require('../desktop/page-actions.cjs');
const { runOfficialDOM, withOfficialDOM } = require('../desktop/official-dom.cjs');
const { resolveWechatUpload } = require('../desktop/wechat-upload.cjs');
const { publishForm } = require('../desktop/publish-form.cjs');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-edge-publish-qa-'));
app.setPath('userData', path.join(profile, 'electron')); app.disableHardwareAcceleration();
const fixtureFolder = path.join(profile, 'fixtures'), sdk = path.resolve('.desktop-deps/webview2-1.0.3912.50');
fs.mkdirSync(fixtureFolder);
const helper = path.join(profile, 'MatrixEdgeHost.Qa.exe');
const compile = spawnSync(path.join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'), ['/nologo','/target:winexe','/platform:x64','/define:MATRIX_EDGE_QA', '/out:' + helper, '/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:System.Web.Extensions.dll','/r:' + path.join(sdk,'lib/net462/Microsoft.Web.WebView2.Core.dll'),'/r:' + path.join(sdk,'lib/net462/Microsoft.Web.WebView2.WinForms.dll'),path.resolve('desktop/edge-host/MatrixEdgeHost.cs')], { windowsHide:true, encoding:'utf8' });
if (compile.status !== 0) { console.error(compile.stdout || compile.stderr); app.exit(1); }
for (const file of ['Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll']) fs.copyFileSync(path.resolve('.desktop-runtime/edge-host',file),path.join(profile,file));
fs.writeFileSync(path.join(fixtureFolder,'home.html'), '<meta charset=utf-8><div class=finder-nickname>QA 本人视频号</div><div hidden data-svg-padding="'+ 'x'.repeat(1200000) +'"></div><div id=home-probe></div><script>document.querySelector("#home-probe").attachShadow({mode:"closed"}).innerHTML="<span>QA closed component</span>"</script><button onclick="location.href=\'/platform/post/create\'">发表视频</button>');
const editorFixture = `<meta charset=utf-8>
<style>body{font:14px sans-serif}input,select,button{display:block;margin:10px}img{width:80px;height:80px}.input-editor{height:80px;width:500px}#crop{display:none}#cover{width:100px;height:110px;display:none}.ant-upload{width:500px;height:80px}</style>
<div class=finder-nickname>QA 本人视频号</div><div class="ant-upload ant-upload-btn" role=button id=upload-surface>上传时长8小时内，大小不超过20GB，格式为MP4/H.264格式<input id=media type=file accept="video/mp4" style="display:none"></div><input id=unused-video-library type=file accept="video/mp4" style="display:none">
<input placeholder="填写短标题有机会获得更多流量"><div contenteditable=true class=input-editor data-placeholder=添加描述></div>
<select aria-label=可见范围><option>公开</option><option>仅自己可见</option></select>
<div class="vertical-cover-wrap img-popover-wrap" id=cover><div class=vertical-img-wrap><img class="vertical-img-size cover-img-vertical" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=="><span>编辑</span></div><div class=tips-wrap><div class=cover-tips>个人主页和分享卡片(3:4)</div></div></div>
<button id=other-edit onclick="window.unrelatedEdits=(window.unrelatedEdits||0)+1">编辑</button>
<div class="finder-common-dialog edit-cover-dialog" id=crop>编辑封面<div><input id=cover-file type=file accept=image/png></div><button id=save>确定</button></div>
<div role=status id=result></div><button id=publish disabled>发表</button>
<script>window.submitCount=0;window.uploadEntryClicks=0;document.querySelector('#upload-surface').onclick=event=>{if(event.target===media)return;window.uploadEntryClicks++;media.click()};media.onchange=()=>{if(!window.uploadEntryClicks)return;document.querySelector('#publish').disabled=false;cover.style.display='block'};cover.onclick=()=>crop.style.display='block';document.querySelector('#cover-file').onchange=event=>document.querySelector('#cover img').src=URL.createObjectURL(event.target.files[0]);save.onclick=()=>crop.style.display='none';publish.onclick=()=>{window.submitCount++;result.textContent=document.querySelector('select').value==='仅自己可见'?'发表成功':'发布失败：私密范围未确认'};</script>`;
fs.writeFileSync(path.join(fixtureFolder,'editor.html'),editorFixture);
const video = path.join(profile,'qa-only.mp4'), cover = path.join(profile,'qa-cover.png'); fs.writeFileSync(video,'Synthetic native file-handoff fixture, not a valid platform video.'); fs.writeFileSync(cover,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'));
app.whenReady().then(async()=>{
  let win, bridge, layoutTransport, nativeChild, checks=0;
  const handlers=new Map(), records=[], sessionId=randomUUID(), accountId=randomUUID(), ownerId=randomUUID();let authActive=true,qaNow=Date.now();
  const ipcMain={handle:(name,fn)=>handlers.set(name,fn)};
  const auth=async(token,id)=>{if(!authActive||token!=='qa-owner'||id&&id!==accountId)throw Error('wrong owner/account');return {userId:ownerId,account:id?{id,platform:'wechat',connectorSessionId:sessionId,nickname:'QA 本人视频号'}:undefined};};
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const call=async(name,input={})=>handlers.get('matrix:'+name)({sender:win.webContents},{accessToken:'qa-owner',...input});
  const wait=async(fn,label)=>{for(let i=0;i<100;i++){try{const result=await fn();if(result)return result;}catch{}await pause(100);}throw Error(label);};
  try {
    const shipped = fs.readFileSync(path.resolve('.desktop-runtime/edge-host/MatrixEdgeHost.exe'));
    assert.equal(shipped.includes(Buffer.from('MATRIX_EDGE_QA_FIXTURES','utf16le')),false);checks++;
    assert.equal(fs.readFileSync(helper).includes(Buffer.from('MATRIX_EDGE_QA_FIXTURES','utf16le')),true);checks++;
    win=new BrowserWindow({show:false,width:1280,height:850,webPreferences:{sandbox:true,contextIsolation:true}});await win.loadURL('data:text/html,Matrix%20isolated%20native%20publish%20QA');
    process.env.MATRIX_EDGE_QA_FIXTURES=fixtureFolder;
    bridge=registerEdgeEmbed({ipcMain,getWindow:()=>win,authenticate:auth,userData:path.join(profile,'matrix'),helperPath:helper,now:()=>qaNow,spawnHost:(...args)=>{nativeChild=spawn(...args);return nativeChild;}});
    const opened=await call('edge-open',{platform:'wechat',sessionId,accountId});assert.equal(opened.embedded,true);checks++;
    const guestId=opened.guestId;
    layoutTransport=createEdgeTransport(nativeChild);
    const initialHidden=await layoutTransport.request('qa-layout');
    assert.equal(initialHidden.visible,false);assert.ok(initialHidden.width>=1280&&initialHidden.height>=850,'New hidden native page must have a usable initial layout');checks+=2;
    await call('edge-control',{guestId,command:'bounds',x:0,y:0,width:1280,height:850,visible:false});
    await call('edge-control',{guestId,command:'navigate',url:'https://channels.weixin.qq.com/platform/home'});
    const input={platform:'wechat',sessionId,accountId,edgeGuestId:guestId,webContentsId:0,accessToken:'qa-owner',taskId:randomUUID(),attemptId:randomUUID()};
    const ctx=await wait(()=>bridge.resolveContext({sender:win.webContents},input),'Owned native profile unavailable');checks++;
    const completedHomeNavigations=new Map();
    layoutTransport.on(event=>{if(event.event==='status'&&event.navigationComplete&&event.navigationRequestId)completedHomeNavigations.set(event.navigationRequestId,event);});
    const homeNavigation=await call('edge-control',{guestId,command:'navigate',url:'https://channels.weixin.qq.com/platform/home'});
    assert.match(homeNavigation.navigationRequestId,/^[a-f0-9-]{36}$/);checks++;
    await wait(()=>completedHomeNavigations.get(homeNavigation.navigationRequestId),'Matching native home navigation did not complete');
    assert.equal(completedHomeNavigations.get(homeNavigation.navigationRequestId).navigationComplete,true);checks++;
    assert.equal((await layoutTransport.request('qa-layout')).audioMuted,true);checks++;
    // Run this BEFORE showing either parent/native fixture. Older tests first
    // showed and hid the native child, concealing its initial hidden lifecycle.
    await wait(async()=>{const result=await call('edge-publish-entry',{...input,mediaType:'video'});return result.opened;},'Never-shown publisher editor');
    await ctx.guest.debugger.sendCommand('Runtime.evaluate',{expression:"window.qaOriginalMediaChange=media.onchange;media.onchange=event=>{if(document.hidden){window.qaPendingPreview=true;return;}window.qaOriginalMediaChange(event)};document.addEventListener('visibilitychange',()=>{if(!document.hidden&&window.qaPendingPreview){window.qaPendingPreview=false;window.qaOriginalMediaChange()}})",returnByValue:true});
    await withOfficialDOM(ctx.guest,'qa-never-shown-upload',async context=>{
      const target=await resolveWechatUpload(ctx.guest,context);
      await context.send('DOM.setFileInputFiles',{...target,files:[video]});
    });
    await pause(800);
    const neverShown=await runOfficialDOM(ctx.guest,publishForm,['progress',{platform:'wechat'}],'qa-never-shown-progress');
    assert.equal((await layoutTransport.request('qa-layout')).visible,false,'The real creator fixture must never be shown for media preparation');
    assert.equal(neverShown.observation.probe.documentVisible,true,'Realize only the blank controller before official navigation');
    assert.equal(neverShown.mediaReady,true);assert.equal(neverShown.coverReady,true);
    assert.equal((await ctx.guest.debugger.sendCommand('Runtime.evaluate',{expression:'window.submitCount',returnByValue:true})).result.value,0);checks+=5;
    await call('edge-control',{guestId,command:'navigate',url:'https://channels.weixin.qq.com/platform/home'});
    await wait(()=>bridge.resolveContext({sender:win.webContents},input),'Return from never-shown synthetic editor');
    win.setPosition(-20000,-20000);win.showInactive();
    await call('edge-control',{guestId,command:'bounds',x:100,y:100,width:900,height:600,visible:true});
    await wait(async()=>{const s=await layoutTransport.request('qa-layout');return s.visible&&s.width>500;},'Native fixture not visible at initial bounds');checks++;
    win.minimize();await pause(200);
    await call('edge-control',{guestId,command:'bounds',x:100,y:100,width:900,height:600,visible:true});
    const minimized=await layoutTransport.request('qa-layout');assert.equal(minimized.visible,false);assert.equal(minimized.parentMinimized,true);checks+=2;
    assert.ok(minimized.width>=900&&minimized.height>=600,'Minimizing Matrix must not collapse the retained editor viewport');checks++;
    assert.ok(await ctx.guest.executeJavaScriptInIsolatedWorld(1100,[{code:'innerWidth>500&&innerHeight>400'}]),'Official responsive controls require a usable hidden viewport');checks++;
    win.restore();
    // No new renderer bounds command: its CSS fingerprint did not change.
    await wait(async()=>{const s=await layoutTransport.request('qa-layout');return s.visible&&s.width>500&&s.height>300&&!s.parentMinimized;},'Native bounds stayed hidden/clipped after restore without CSS layout change');checks++;
    await wait(async()=>{const s=await layoutTransport.request('qa-layout');return s.topSibling;},'Native child remained underneath Electron after restore');checks++;
    win.webContents.focus();
    await wait(async()=>{const s=await layoutTransport.request('qa-layout');return s.topSibling;},'Native child did not recover parent-local input layer');checks++;
    assert.equal((await layoutTransport.request('qa-layout')).audioMuted,true);checks++;
    await call('edge-control',{guestId,command:'bounds',x:0,y:0,width:1280,height:850,visible:false});win.hide();
    win.minimize();await pause(1200);
    const backgroundMinimized=await layoutTransport.request('qa-layout');
    assert.equal(backgroundMinimized.visible,false);assert.ok(backgroundMinimized.width>=1280&&backgroundMinimized.height>=850);checks+=2;
    assert.ok(await ctx.guest.executeJavaScriptInIsolatedWorld(1100,[{code:'innerWidth>500&&innerHeight>400'}]));checks++;
    assert.equal(backgroundMinimized.audioMuted,true);checks++;
    win.restore();win.hide();
    // Match the real renderer's 70% native zoom, not only a 100% fixture.
    assert.equal((await call('edge-control',{guestId,command:'zoom',zoom:.7})).error,undefined);checks++;
    // Real React effect cleanup used to send a hide-only 1px bounds request
    // during status/error changes. It must not collapse a retained publisher.
    await call('edge-control',{guestId,command:'bounds',x:0,y:0,width:1,height:1,visible:false});
    const cleanupHidden=await layoutTransport.request('qa-layout');
    assert.ok(cleanupHidden.width>=1280&&cleanupHidden.height>=850,'Hide-only cleanup collapsed the retained publisher viewport');checks++;
    assert.ok(await ctx.guest.executeJavaScriptInIsolatedWorld(1100,[{code:'innerWidth>500&&innerHeight>400'}]),'Hidden cleanup must retain usable official DOM hit geometry');checks++;
    assert.equal(cleanupHidden.visible,false);checks++;
    await call('edge-control',{guestId,command:'bounds',x:0,y:0,width:960,height:640,visible:false});
    for(const tiny of [0,1]){
      await call('edge-control',{guestId,command:'bounds',x:0,y:0,width:tiny,height:tiny,visible:tiny===1});
      const retained=await layoutTransport.request('qa-layout');
      assert.equal(retained.width,960);assert.equal(retained.height,640);assert.equal(retained.visible,false);checks+=3;
    }
    await call('edge-control',{guestId,command:'bounds',x:0,y:0,width:1280,height:850,visible:false});
    const topology=await ctx.guest.debugger.sendCommand('DOM.getDocument',{depth:-1,pierce:true});
    assert.ok(JSON.stringify(topology).length<10000);assert.equal(JSON.stringify(topology).includes('data-svg-padding'),false);checks+=2;
    assert.equal(await runOfficialDOM(ctx.guest,roots=>roots.some(root=>root.textContent==='QA closed component'),[],'qa-native-compact-root'),true);checks++;
    assert.ok((await call('edge-publish-entry',{...input,mediaType:'image'})).error);checks++;
    assert.ok((await call('edge-control',{guestId,command:'dom',method:'Network.getAllCookies'})).error);checks++;
    await assert.rejects(ctx.guest.debugger.sendCommand('Network.getAllCookies'));await assert.rejects(ctx.guest.debugger.sendCommand('Storage.getCookies'));checks+=2;
    await assert.rejects(bridge.resolveContext({sender:win.webContents},{...input,accountId:randomUUID()}));await assert.rejects(bridge.resolveContext({sender:win.webContents},{...input,accessToken:'other-owner'}));await assert.rejects(bridge.resolveContext({sender:win.webContents},{...input,sessionId:randomUUID()}));checks+=3;
    await wait(async()=>{const result=await call('edge-publish-entry',{...input,mediaType:'video'});return result.opened;},'Native publish entry unavailable');checks++;
    assert.equal((await layoutTransport.request('qa-layout')).audioMuted,true);checks++;
    const js=async expression=>ctx.guest.executeJavaScriptInIsolatedWorld(1100,[{code:expression}]);
    const mainJs=async expression=>{
      const result=await ctx.guest.debugger.sendCommand('Runtime.evaluate',{expression,returnByValue:true});
      if(result.exceptionDetails)throw Error('Isolated native fixture script failed: '+result.exceptionDetails.text);
      return result.result?.value;
    };
    // Real editor layouts often omit the homepage profile card. Only this same
    // native guest's freshly verified identity may authorize the editor.
    await mainJs("document.querySelector('.finder-nickname').remove()");
    assert.equal((await call('edge-publish-entry',{...input,mediaType:'video'})).opened,true);assert.equal(await mainJs('window.submitCount'),0);checks+=2;
    assert.ok(await js('innerWidth>500&&innerHeight>400'));checks++;
    registerPersonalAssist({ipcMain,dialog:{showOpenDialog:async()=>{throw Error('Unselected files must not be requested');}},webContents:{fromId:()=>undefined},session:{fromPartition:()=>undefined},getWindow:()=>win,platforms:{wechat:{domain:'weixin.qq.com'}},inspectPlatformSession:async()=>{throw Error('Native Edge must not use Electron cookies');},authenticate:auth,resolveEdgeContext:bridge.resolveContext,evidenceStore:require('../desktop/publish-evidence.cjs').createPublishEvidenceStore(path.join(profile,'evidence'))});
    registerPageActions({ipcMain,dialog:{showMessageBox:async()=>({response:1})},webContents:{fromId:()=>undefined},session:{fromPartition:()=>undefined},getWindow:()=>win,platforms:{wechat:{domain:'weixin.qq.com',label:'QA 视频号'}},inspectPlatformSession:async()=>{throw Error('Native Edge must not use Electron session');},authenticate:auth,resolveEdgeContext:bridge.resolveContext,createEdgeResultContext:bridge.createResultContext,journal:{write:r=>records.push({...r}),list:()=>[...new Map(records.map(r=>[r.id,r])).values()]},sleep:ms=>pause(Math.min(ms,50))});
    const selection=(await call('import-media',{mediaType:'video',paths:[video]})).selection;assert.ok(selection?.id);checks++;
    await mainJs("{const duplicate=document.querySelector('#upload-surface').cloneNode(true);duplicate.id='duplicate-upload-surface';document.body.append(duplicate)}");
    const ambiguousUpload=await call('upload-media',{...input,mediaType:'video',selectionId:selection.id});
    assert.equal(ambiguousUpload.uploadStarted,false);assert.match(ambiguousUpload.error,/不唯一/);assert.equal(await mainJs('window.uploadEntryClicks'),0);assert.equal((await layoutTransport.request('qa-layout')).fileChooserIntercepted,false);checks+=4;
    await mainJs("document.querySelector('#duplicate-upload-surface').remove();document.body.insertAdjacentHTML('beforeend','<div id=upload-overlay style=\"position:fixed;inset:0;z-index:999;background:white\"></div>')");
    const blockedUpload=await call('upload-media',{...input,mediaType:'video',selectionId:selection.id});
    assert.equal(blockedUpload.uploadStarted,false);assert.match(blockedUpload.error,/被遮挡/);assert.equal(await mainJs('window.uploadEntryClicks'),0);assert.equal((await layoutTransport.request('qa-layout')).fileChooserIntercepted,false);checks+=4;
    await mainJs("document.querySelector('#upload-overlay').remove()");
    // One selected video is valid even if its official input allows multiple.
    await mainJs("document.querySelector('#media').multiple=true");
    const upload=await call('upload-media',{...input,mediaType:'video',selectionId:selection.id});assert.equal(upload.uploadStarted,true,upload.error);checks++;
    assert.equal((await layoutTransport.request('qa-layout')).fileChooserIntercepted,false);checks++;
    assert.equal(await js('document.querySelector("#media").files[0].name'),'qa-only.mp4');checks++;
    assert.equal(await js('document.querySelector("#media").files.length'),1);assert.equal(await js('document.querySelector("#media").multiple'),true);checks+=2;
    assert.equal(await mainJs('window.uploadEntryClicks'),1);assert.equal(await mainJs('document.querySelector("#unused-video-library").files.length'),0);checks+=2;
    const duplicateVideo=await call('upload-media',{...input,mediaType:'video',selectionId:selection.id});
    assert.equal(duplicateVideo.uploadStarted,false);assert.match(duplicateVideo.error,/已有素材/);assert.equal(await mainJs('window.uploadEntryClicks'),1);checks+=3;
    // A creator may generate video frames/covers on animation frames after
    // handoff. A hidden native publisher must not silently freeze that work.
    await mainJs('window.qaFrameCount=0;function qaMediaFrame(){if(++window.qaFrameCount<10)requestAnimationFrame(qaMediaFrame)}requestAnimationFrame(qaMediaFrame)');
    await pause(1200);
    const frameProbe=await mainJs('({frames:window.qaFrameCount,visibility:document.visibilityState,focused:document.hasFocus()})');
    console.log(JSON.stringify({hiddenNativeFrameProbe:frameProbe}));
    assert.equal(frameProbe.frames,10,'Hidden native publisher must advance animation-frame media work');checks++;
    // Also exercise a WS_VISIBLE parent with a hidden child, not only a parent
    // that was hidden from creation. Keep the disposable window off screen and
    // inactive so this diagnostic cannot cover or steal focus from the real app.
    win.setPosition(-20000,-20000);win.showInactive();
    await call('edge-control',{guestId,command:'bounds',x:0,y:0,width:1280,height:850,visible:false});
    await pause(1200);
    await mainJs('window.qaFrameCount=0;requestAnimationFrame(qaMediaFrame)');
    await pause(1200);
    const visibleParentProbe=await mainJs('({frames:window.qaFrameCount,visibility:document.visibilityState,focused:document.hasFocus()})');
    console.log(JSON.stringify({inactiveParentHiddenNativeFrameProbe:visibleParentProbe}));
    win.hide();
    assert.equal(visibleParentProbe.frames,10,'A hidden native publisher must advance media work after its parent becomes visible');checks++;
    const form={title:'QA完整标题超过十六字也必须保留1826',body:'QA native form only',topics:[],options:{visibility:'仅自己可见'}};
    const filled=await call('sync-publish-form',{...input,command:'fill',form});assert.ok(!filled.error,filled.error);assert.deepEqual(filled.unresolved,[]);assert.ok(filled.filled.includes('visibility'));checks+=3;
    assert.equal(await js('document.querySelector("select").value'),'仅自己可见');checks++;
    assert.equal(await js('document.querySelector("input[placeholder]").value'),'');checks++;
    assert.equal(await js('document.querySelector(".input-editor").innerText'),form.title+'\n'+form.body);checks++;
    assert.ok((await call('inspect-page-action',{...input,kind:'publish',expectedTitle:'Different task',expectedVisibility:'仅自己可见'})).error);checks++;
    await mainJs("document.body.insertAdjacentHTML('beforeend','<div id=media-processing>正在处理文件...</div>')");
    const processing=await call('sync-publish-form',{...input,command:'progress'});
    assert.equal(processing.processing,true);assert.equal(processing.coverReady,false);assert.equal(processing.ready,false);checks+=3;
    assert.equal(processing.observation.state,'processing');assert.deepEqual(processing.observation.busySignals,['media_notice']);assert.equal(processing.observationStored,true);checks+=3;
    await mainJs("document.querySelector('#media-processing').textContent='生成中'");
    assert.equal((await call('sync-publish-form',{...input,command:'progress'})).coverReady,false);checks++;
    await mainJs("document.querySelector('#media-processing').remove()");
    const loadedCover=await mainJs("document.querySelector('#cover img').src");
    await mainJs("document.querySelector('#cover').style.display='none'");
    const missingPreview=await call('sync-publish-form',{...input,command:'progress'});
    assert.equal(missingPreview.ready,false,'Missing preview must not authorize submission');assert.equal(missingPreview.coverReady,false);assert.equal(missingPreview.processing,false,'An attached file is not proof of official processing');checks+=3;
    assert.equal(missingPreview.observation.state,'waiting_preview');assert.equal(missingPreview.observation.attachedVideoInputs,1);assert.equal(missingPreview.observation.coverContainers,0);assert.equal(missingPreview.observation.enabledSubmitButtons,1);checks+=4;
    const savedEvidence=await call('read-publish-evidence',{taskId:input.taskId,attemptId:input.attemptId});
    assert.ok(savedEvidence.items.some(item=>item.observation.state==='waiting_preview'));assert.ok(!JSON.stringify(savedEvidence).includes('qa-owner'));checks+=2;
    assert.ok((await call('read-publish-evidence',{taskId:input.taskId,attemptId:input.attemptId,accessToken:'another-user'})).error);checks++;
    await mainJs("document.querySelector('#cover').style.display='block';document.querySelector('#cover img').removeAttribute('src')");
    assert.equal((await call('sync-publish-form',{...input,command:'progress'})).coverReady,false);checks++;
    await mainJs("document.querySelector('#cover img').src="+JSON.stringify(loadedCover));
    await wait(async()=>(await call('sync-publish-form',{...input,command:'progress'})).coverReady,'Decoded official cover preview');checks++;
    await mainJs("document.body.insertAdjacentHTML('beforeend','<label id=late-processing>正在处理文件...</label>')");
    assert.equal((await call('sync-publish-form',{...input,command:'progress'})).processing,true);checks++;
    await mainJs("document.querySelector('#late-processing').remove()");
    await mainJs("document.querySelector('.input-editor').textContent='正在上传 用户文案不能充当系统进度';document.querySelector('.input-editor').classList.add('upload-description')");
    assert.equal((await call('sync-publish-form',{...input,command:'progress'})).processing,false);checks++;
    await call('sync-publish-form',{...input,command:'fill',form});
    const coverSelection=(await call('import-media',{mediaType:'image',paths:[cover]})).selection;
    assert.match((await call('upload-media',{...input,mediaType:'image',selectionId:coverSelection.id})).error,/当前一键发布仅适配视频，暂不支持图文/);checks++;
    // Real creator dialogs open through an opacity transition. Click dispatch
    // is not evidence that their file input is already rendered and usable.
    await mainJs("document.querySelector('#crop').style.opacity='0';document.querySelector('#crop').style.transition='opacity .35s linear';document.querySelector('#cover').onclick=()=>{document.querySelector('#crop').style.display='block';requestAnimationFrame(()=>{document.querySelector('#crop').style.opacity='1'})}");
    const animatedCover=await call('upload-media',{...input,mediaType:'image',selectionId:coverSelection.id,coverIndex:1});
    await pause(600);
    console.log(JSON.stringify({nativeCoverOpeningTransition:{confirmed:animatedCover.coverConfirmed===true,error:animatedCover.error||'',opacity:await mainJs('getComputedStyle(document.querySelector("#crop")).opacity')}}));
    assert.equal(animatedCover.coverConfirmed,true,animatedCover.error);assert.equal(await mainJs('window.submitCount'),0);checks+=2;
    await mainJs("document.querySelector('#crop').style.transition='';document.querySelector('#crop').style.opacity='';document.querySelector('#cover').onclick=()=>document.querySelector('#crop').style.display='block'");
    await mainJs("window.delayedCoverOpenClicks=0;document.querySelector('#cover').onclick=()=>{window.delayedCoverOpenClicks++;setTimeout(()=>{document.querySelector('#crop').style.display='block'},350)}");
    const delayedCover=await call('upload-media',{...input,mediaType:'image',selectionId:coverSelection.id,coverIndex:1});
    assert.equal(delayedCover.coverConfirmed,true,delayedCover.error);assert.equal(await mainJs('window.delayedCoverOpenClicks'),1,'Wait for the opened dialog without clicking the cover twice');checks+=2;
    await mainJs("document.querySelector('#cover').onclick=()=>document.querySelector('#crop').style.display='block'");
    await mainJs("(()=>{const copy=document.querySelector('#cover').cloneNode(true);copy.id='duplicate-cover';document.body.append(copy)})()");
    const ambiguousCover=await call('upload-media',{...input,mediaType:'image',selectionId:coverSelection.id,coverIndex:1});
    assert.match(ambiguousCover.error,/入口不唯一/);assert.notEqual(ambiguousCover.uploadStarted,true);checks+=2;
    assert.equal(await mainJs('getComputedStyle(document.querySelector("#crop")).display'),'none');checks++;
    await mainJs("document.querySelector('#duplicate-cover').remove()");
    // Observed Edit text belongs to the outer vertical cover, not its inner
    // image wrapper. A sibling overlay can be the actual clickable surface.
    await mainJs("document.querySelector('#cover').style.position='relative';document.querySelector('#cover .vertical-img-wrap span').remove();document.querySelector('#cover').onclick=null;const layer=document.createElement('div');layer.id='cover-edit-layer';layer.style='position:absolute;top:0;left:0;width:100px;height:110px;z-index:2';layer.textContent='删除';layer.onclick=()=>{window.unknownCoverClicks=(window.unknownCoverClicks||0)+1};document.querySelector('#cover').append(layer)");
    const unknownLayer=await call('upload-media',{...input,mediaType:'image',selectionId:coverSelection.id,coverIndex:1});
    assert.match(unknownLayer.error,/遮挡/);assert.equal(unknownLayer.uploadStarted,false);assert.equal(await mainJs('window.unknownCoverClicks||0'),0);checks+=3;
    await mainJs("document.querySelector('#cover-edit-layer').innerHTML='<span>编辑</span>';document.querySelector('#cover-edit-layer').onclick=()=>document.querySelector('#crop').style.display='block'");
    await mainJs("const duplicate=document.querySelector('#cover-edit-layer').cloneNode(true);duplicate.id='duplicate-edit-layer';document.querySelector('#cover').append(duplicate)");
    const duplicateEdit=await call('upload-media',{...input,mediaType:'image',selectionId:coverSelection.id,coverIndex:1});
    assert.match(duplicateEdit.error,/不唯一/);assert.equal(duplicateEdit.uploadStarted,false);checks+=2;
    await mainJs("document.querySelector('#duplicate-edit-layer').remove();document.body.insertAdjacentHTML('beforeend','<div id=external-edit style=\"position:fixed;inset:0;z-index:999;background:white\">编辑</div>')");
    const outsideEdit=await call('upload-media',{...input,mediaType:'image',selectionId:coverSelection.id,coverIndex:1});
    assert.match(outsideEdit.error,/遮挡/);assert.equal(outsideEdit.uploadStarted,false);checks+=2;
    // The official Edit text may be pointer-transparent over the known image,
    // with the actual listener on their common, verified cover surface.
    await mainJs("document.querySelector('#external-edit').remove();document.querySelector('#cover-edit-layer').remove();document.querySelector('#cover img').style='width:80px;height:100px';document.querySelector('#cover').insertAdjacentHTML('beforeend','<span id=transparent-cover-edit style=\"position:absolute;left:5px;top:60px;width:50px;height:20px;pointer-events:none\">编辑</span>');document.querySelector('#cover').onclick=event=>{window.lastCoverClickTrusted=event.isTrusted;if(event.isTrusted&&event.target.matches('img.vertical-img-size.cover-img-vertical'))document.querySelector('#crop').style.display='block'}");
    const transparentEdit=await call('upload-media',{...input,mediaType:'image',selectionId:coverSelection.id,coverIndex:1});
    assert.equal(transparentEdit.coverConfirmed,true,transparentEdit.error);assert.equal(await mainJs('window.lastCoverClickTrusted'),true);assert.equal(await mainJs('window.unknownCoverClicks||0'),0);assert.equal(await mainJs('window.unrelatedEdits||0'),0);checks+=4;
    await mainJs("document.querySelector('#transparent-cover-edit').remove();document.querySelector('#cover').onclick=null;const restoredLayer=document.createElement('div');restoredLayer.id='cover-edit-layer';restoredLayer.style='position:absolute;top:0;left:0;width:100px;height:110px;z-index:2';restoredLayer.innerHTML='<span>编辑</span>';restoredLayer.onclick=()=>document.querySelector('#crop').style.display='block';document.querySelector('#cover').append(restoredLayer);document.body.insertAdjacentHTML('beforeend','<div id=external-edit style=\"position:fixed;inset:0;z-index:999;background:white\">编辑</div>')");
    await mainJs("document.querySelector('#external-edit').remove();document.querySelector('#cover-edit-layer span').style.pointerEvents='none'");
    const coverResult=await call('upload-media',{...input,mediaType:'image',selectionId:coverSelection.id,coverIndex:1});assert.equal(coverResult.coverConfirmed,true,coverResult.error);checks++;
    await mainJs("document.querySelector('#cover-edit-layer').textContent='';document.head.insertAdjacentHTML('beforeend','<style>#cover-edit-layer::after{content:\"编辑\"}</style>')");
    const cssEdit=await call('upload-media',{...input,mediaType:'image',selectionId:coverSelection.id,coverIndex:1});
    assert.equal(cssEdit.coverConfirmed,true,cssEdit.error);checks++;
    await mainJs("document.querySelector('#cover-edit-layer').remove();document.head.insertAdjacentHTML('beforeend','<style>#cover::after{content:\"编辑\";position:absolute;inset:0}</style>');document.querySelector('#cover').onclick=()=>document.querySelector('#crop').style.display='block'");
    const outerPseudoEdit=await call('upload-media',{...input,mediaType:'image',selectionId:coverSelection.id,coverIndex:1});
    assert.equal(outerPseudoEdit.coverConfirmed,true,outerPseudoEdit.error);checks++;
    // The editor's known image can be directly under the vertical cover rather
    // than inside the older vertical-img-wrap. Do not wait forever for that
    // optional wrapper or accept a second known image as an unambiguous cover.
    await mainJs("document.querySelector('#cover .vertical-img-wrap').replaceWith(...document.querySelector('#cover .vertical-img-wrap').childNodes)");
    const directImageProgress=await call('sync-publish-form',{...input,command:'progress'});
    assert.equal(directImageProgress.coverReady,true,'A decoded unique official cover does not require an optional image wrapper');checks++;
    const directImageCover=await call('upload-media',{...input,mediaType:'image',selectionId:coverSelection.id,coverIndex:1});
    assert.equal(directImageCover.coverConfirmed,true,directImageCover.error);checks++;
    await mainJs("{const duplicateImage=document.querySelector('#cover img').cloneNode();duplicateImage.id='duplicate-cover-image';document.querySelector('#cover').append(duplicateImage)}");
    assert.equal((await call('sync-publish-form',{...input,command:'progress'})).coverReady,false);checks++;
    const duplicateDirectImage=await call('upload-media',{...input,mediaType:'image',selectionId:coverSelection.id,coverIndex:1});
    assert.notEqual(duplicateDirectImage.uploadStarted,true);assert.equal(await mainJs('getComputedStyle(document.querySelector("#crop")).display'),'none');checks+=2;
    await mainJs("document.querySelector('#duplicate-cover-image').remove()");
    // The observed owner sidebar must provide fresh proof after the old home
    // identity expires; a different sidebar owner must still block the action.
    await mainJs("document.body.insertAdjacentHTML('beforeend','<div class=\"common-menu-item account-info default\" title=\"账号信息\" id=sidebar-owner><img class=avatar><span>QA 本人视频号</span><div class=\"common-dialog changeAccount-dialog\" style=\"display:none\">切换账号：其他视频号</div></div>')");
    qaNow+=600001;
    assert.equal((await bridge.resolveContext({sender:win.webContents},input)).nickname,'QA 本人视频号');checks++;
    await mainJs("document.querySelector('#sidebar-owner span').textContent='Another owner'");
    await assert.rejects(bridge.resolveContext({sender:win.webContents},input),/昵称与绑定账号不一致/);checks++;
    assert.equal(await mainJs('window.submitCount'),0);checks++;
    await mainJs("document.querySelector('#sidebar-owner span').textContent='QA 本人视频号'");
    assert.equal(await mainJs('window.unrelatedEdits||0'),0);checks++;
    await mainJs("document.querySelector('.input-editor').textContent='Other first line\\n'+"+JSON.stringify(form.title));
    assert.ok((await call('inspect-page-action',{...input,kind:'publish',expectedTitle:form.title,expectedVisibility:'仅自己可见'})).error);checks++;
    assert.deepEqual((await call('sync-publish-form',{...input,command:'fill',form})).unresolved,[]);checks++;
    const progress=await call('sync-publish-form',{...input,command:'progress'});assert.equal(progress.ready,true,progress.error);checks++;
    await mainJs("document.querySelector('#publish').classList.add('weui-desktop-btn_disabled')");
    assert.equal((await call('sync-publish-form',{...input,command:'progress'})).ready,false);checks++;
    assert.equal((await call('sync-publish-form',{...input,command:'progress'})).coverReady,true);checks++;
    assert.ok((await call('inspect-page-action',{...input,kind:'publish',expectedTitle:form.title,expectedVisibility:'仅自己可见'})).error);checks++;
    assert.equal(await mainJs('window.submitCount'),0);checks++;
    await mainJs("document.querySelector('#publish').classList.remove('weui-desktop-btn_disabled')");
    await mainJs("document.body.insertAdjacentHTML('beforeend','<div class=qa-cover><div class=qa-preview><span>封面预览</span></div></div><div><textarea>公开可见 never-export-editor-value</textarea></div>')");
    const described=await call('sync-publish-form',{...input,command:'describe'});
    assert.ok(described.coverControls.some(c=>c.text==='封面预览'&&c.parents.some(p=>p.className==='qa-preview')));checks++;
    assert.ok(!JSON.stringify(described).includes('never-export-editor-value'));checks++;
    await mainJs("document.body.insertAdjacentHTML('beforeend','<div class=qa-cover-surface style=\"width:100px;height:100px\">never-export-aggregate-cover-text</div>')");
    const coverStructure=await call('sync-publish-form',{...input,command:'describe'});
    assert.ok(coverStructure.coverControls.some(c=>c.className==='qa-cover-surface'&&c.text===''));checks++;
    assert.ok(!JSON.stringify(coverStructure).includes('never-export-aggregate-cover-text'));checks++;
    assert.equal(await mainJs('window.submitCount'),0);checks++;
    await mainJs("document.querySelector('.qa-cover-surface').remove()");
    await mainJs("document.querySelector('.qa-cover').remove()");
    const planned=await call('inspect-page-action',{...input,kind:'publish',expectedTitle:form.title,expectedVisibility:'仅自己可见'});assert.ok(planned.nonce,planned.error);checks++;
    // The website's main-world global cannot replace the saved isolated-world nonce.
    await ctx.guest.debugger.sendCommand('Runtime.evaluate',{expression:'window.__matrixPageAction={nonce:"fake",used:false}'});
    const result=await call('submit-page-action',{...input,nonce:planned.nonce,index:0});assert.equal(result.receipt?.status,'confirmed',result.error);assert.equal(result.receipt?.visibility,'仅自己可见');assert.equal(await mainJs('window.submitCount'),1);checks+=3;
    const repeated=await call('submit-page-action',{...input,nonce:planned.nonce,index:0});assert.ok(repeated.error);assert.equal(await mainJs('window.submitCount'),1);checks+=2;
    const nextPlan=await call('inspect-page-action',{...input,kind:'publish',expectedTitle:form.title,expectedVisibility:'仅自己可见'});assert.ok(nextPlan.nonce,nextPlan.error);checks++;
    await js('document.querySelector("select").value="公开"');
    assert.ok((await call('submit-page-action',{...input,nonce:nextPlan.nonce,index:0})).error);assert.equal(await mainJs('window.submitCount'),1);checks+=2;
    assert.ok(records.some(row=>row.status==='submitting'));assert.ok(records.some(row=>row.status==='confirmed'));checks+=2;
    assert.ok(!JSON.stringify(records).includes(profile));checks++;
    authActive=false;assert.ok((await call('sync-publish-form',{...input,command:'progress'})).error);assert.ok((await call('inspect-page-action',{...input,kind:'publish'})).error);checks+=2;authActive=true;
    await js('document.querySelector("select").value="仅自己可见"');
    const navigationPlan=await call('inspect-page-action',{...input,kind:'publish',expectedTitle:form.title,expectedVisibility:'仅自己可见'});assert.ok(navigationPlan.nonce,navigationPlan.error);checks++;
    await mainJs('document.querySelector("#publish").onclick=()=>{window.submitCount++;location.href="/platform/home"}');
    const uncertain=await call('submit-page-action',{...input,nonce:navigationPlan.nonce,index:0});assert.ok(uncertain.mayHaveSubmitted||uncertain.receipt?.status==='unknown');checks++;
    assert.ok((await call('submit-page-action',{...input,nonce:navigationPlan.nonce,index:0})).error);checks++;
    // The older control fixture intentionally uses invalid media. Separately
    // generate a real silent clip, then make hidden WebView2 decode a frame and
    // derive its cover from that frame. This proves local media work, NOT any
    // undocumented platform upload/transcoding or a successful official post.
    const generator=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}});
    let clip;
    try {
      await generator.loadURL('data:text/html,<canvas width=160 height=120></canvas>');
      clip=await generator.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
        const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),stream=canvas.captureStream(10),chunks=[];
        const mime='video/webm;codecs=vp8';if(!MediaRecorder.isTypeSupported(mime)){reject(Error('QA WebM encoder unavailable'));return;}
        const recorder=new MediaRecorder(stream,{mimeType:mime});let frame=0;
        const draw=()=>{ctx.fillStyle=frame++%2?'#e98532':'#2065d1';ctx.fillRect(0,0,160,120);};draw();
        const timer=setInterval(draw,80);recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
        recorder.onerror=()=>{clearInterval(timer);stream.getTracks().forEach(track=>track.stop());reject(Error('QA media generation failed'))};
        recorder.onstop=async()=>{clearInterval(timer);stream.getTracks().forEach(track=>track.stop());const bytes=new Uint8Array(await new Blob(chunks,{type:mime}).arrayBuffer());resolve(Array.from(bytes));};
        recorder.start();setTimeout(()=>recorder.stop(),1200);
      })`);
    } finally {generator.destroy();}
    assert.ok(clip.length>100,'Generated QA clip must contain encoded video');checks++;
    const realClip=path.join(profile,'qa-valid-silent.webm');fs.writeFileSync(realClip,Buffer.from(clip));
    fs.writeFileSync(path.join(fixtureFolder,'editor.html'),`<meta charset=utf-8><div class=finder-nickname>QA 本人视频号</div>
      <div class="ant-upload ant-upload-btn" role=button id=valid-upload style="width:400px;height:60px">上传时长8小时内，大小不超过20GB，格式为MP4/H.264格式<input id=real-media type=file accept="video/*" style="display:none"></div><input type=file accept="video/*" style="display:none"><textarea placeholder=描述></textarea>
      <div class=media-full-screen-wrap><video id=decoded muted preload=auto style="width:160px;height:120px"></video></div>
      <div class="vertical-cover-wrap img-popover-wrap"><img id=frame-cover class="vertical-img-size cover-img-vertical" style="width:80px;height:100px"></div>
      <button id=publish disabled>发表</button><script>window.submitCount=0;publish.onclick=()=>window.submitCount++;document.querySelector('#valid-upload').onclick=event=>{const input=document.querySelector('#real-media');if(event.target!==input)input.click()};
      document.querySelector('#real-media').onchange=event=>{decoded.src=URL.createObjectURL(event.target.files[0]);decoded.load()};
      decoded.onloadeddata=()=>{const frame=document.createElement('canvas');frame.width=decoded.videoWidth;frame.height=decoded.videoHeight;frame.getContext('2d').drawImage(decoded,0,0);document.querySelector('#frame-cover').src=frame.toDataURL('image/png');document.querySelector('#publish').disabled=false};</script>`);
    await call('edge-control',{guestId,command:'navigate',url:'https://channels.weixin.qq.com/platform/post/create'});
    await wait(async()=>await mainJs('!!document.querySelector("#real-media")'),'Fresh media-decode fixture');
    const validSelection=(await call('import-media',{mediaType:'video',paths:[realClip]})).selection;
    const validHandoff=await call('upload-media',{...input,mediaType:'video',selectionId:validSelection.id});
    assert.equal(validHandoff.uploadStarted,true,validHandoff.error);checks++;
    const decodedReady=await wait(async()=>{const result=await call('sync-publish-form',{...input,command:'progress'});return result.ready&&result.observation.decodedMedia===1&&result;},'Hidden native media must decode a real frame and generated cover');
    assert.equal(decodedReady.observation.mediaElements,1);assert.equal(decodedReady.observation.decodedCoverImages,1);assert.equal(decodedReady.observation.state,'submit_ready');assert.equal(decodedReady.processing,false);checks+=4;
    assert.equal((await layoutTransport.request('qa-layout')).audioMuted,true);assert.equal(await mainJs('window.submitCount'),0);checks+=2;
    // Decode proof from the unique primary player permits text filling even
    // when the separate cover widget is not ready. It never permits submit.
    await mainJs("document.querySelector('#frame-cover').parentElement.style.display='none'");
    const decodedBeforeCover=await call('sync-publish-form',{...input,command:'progress'});
    assert.equal(decodedBeforeCover.mediaReady,true,'A decoded official primary player must not wait for its separate cover before text filling');assert.equal(decodedBeforeCover.coverReady,false);assert.equal(decodedBeforeCover.ready,false);checks+=3;
    await mainJs("document.querySelector('.media-full-screen-wrap').className='unrelated-tutorial-player'");
    assert.equal((await call('sync-publish-form',{...input,command:'progress'})).mediaReady,false,'An unrelated decoded video is not primary upload proof');checks++;
    await mainJs("document.querySelector('.unrelated-tutorial-player').className='media-full-screen-wrap';document.body.insertAdjacentHTML('beforeend','<div role=status id=busy-media>正在转码</div>')");
    assert.equal((await call('sync-publish-form',{...input,command:'progress'})).mediaReady,false,'Live processing must still block filling');checks++;
    await mainJs("document.querySelector('#busy-media').remove();document.querySelector('#frame-cover').parentElement.style.display=''");
    // The same end-to-end path must work inside nested CLOSED components in
    // real WebView2. Fixtures retain a QA-only reference for assertions; shipped
    // code obtains only scoped component handles through official-dom.cjs.
    const [closedMarkup,closedScript]=editorFixture.split('<script>');
    fs.writeFileSync(path.join(fixtureFolder,'editor.html'),`<meta charset=utf-8><x-qa-shell style="display:block"></x-qa-shell><script>
      const outer=document.querySelector('x-qa-shell').attachShadow({mode:'closed'});outer.innerHTML='<x-qa-editor style="display:block"></x-qa-editor>';
      window.qaRoot=outer.querySelector('x-qa-editor').attachShadow({mode:'closed'});window.qaRoot.innerHTML=${JSON.stringify(closedMarkup)};
      (function(document){const media=document.querySelector('#media'),cover=document.querySelector('#cover'),crop=document.querySelector('#crop'),save=document.querySelector('#save'),publish=document.querySelector('#publish'),result=document.querySelector('#result');
      ${closedScript.replace('</script>','')}
      })(window.qaRoot);</script>`);
    await call('edge-control',{guestId,command:'navigate',url:'https://channels.weixin.qq.com/platform/post/create'});
    await wait(async()=>await mainJs('!!window.qaRoot?.querySelector("#media")'),'Closed component native fixture');
    await mainJs("{const mask=document.createElement('div');mask.id='closed-mask';mask.style='position:fixed;inset:0;z-index:999;background:white';window.qaRoot.append(mask)}");
    const shadowBlockedUpload=await call('upload-media',{...input,mediaType:'video',selectionId:selection.id});
    assert.equal(shadowBlockedUpload.uploadStarted,false);assert.match(shadowBlockedUpload.error,/遮挡/);assert.equal(await mainJs('window.uploadEntryClicks'),0);checks+=3;
    await mainJs("window.qaRoot.querySelector('#closed-mask').remove()");
    // Deterministically finish rendering AFTER the first real native probe.
    // This exercises the production caller's bounded pre-handoff retry, not a
    // fixed sleep. No chooser may be intercepted or clicked while still hidden.
    await mainJs("window.qaRoot.querySelector('#upload-surface').style.opacity='0'");
    const originalSend=ctx.guest.debugger.sendCommand;let nativeReadinessProbes=0,nativeChooserArms=0,lateEditorObserved=false;
    ctx.guest.debugger.sendCommand=async(method,parameters)=>{
      if(method==='Page.setInterceptFileChooserDialog'&&parameters.enabled)nativeChooserArms++;
      const probe=method==='Runtime.callFunctionOn'&&parameters.arguments?.[0]?.value?.probe===true;
      if(probe)nativeReadinessProbes++;
      const result=await originalSend(method,parameters);
      if(probe&&nativeReadinessProbes===1){
        assert.ok(result.exceptionDetails,'Hidden native upload entry must report pending readiness');assert.equal(nativeChooserArms,0);assert.equal(await mainJs('window.uploadEntryClicks'),0);checks+=3;
        await originalSend('Runtime.evaluate',{expression:"window.qaRoot.querySelector('#upload-surface').style.opacity='1'"});lateEditorObserved=true;
      }
      return result;
    };
    let shadowHandoff;
    try {shadowHandoff=await call('upload-media',{...input,mediaType:'video',selectionId:selection.id});}
    finally {ctx.guest.debugger.sendCommand=originalSend;}
    assert.equal(lateEditorObserved,true);assert.ok(nativeReadinessProbes>=2);assert.equal(nativeChooserArms,1);checks+=3;
    assert.equal(shadowHandoff.uploadStarted,true,shadowHandoff.error);assert.equal(await mainJs('window.qaRoot.querySelector("#media").files[0].name'),'qa-only.mp4');assert.equal(await mainJs('window.uploadEntryClicks'),1);assert.equal((await layoutTransport.request('qa-layout')).fileChooserIntercepted,false);checks+=4;
    // The real editor can place its own account identity inside the same
    // authored components as the form. Fresh visible proof must be read there,
    // not replaced by stale homepage proof or an extended identity timeout.
    qaNow+=600001;
    assert.equal((await bridge.resolveContext({sender:win.webContents},input)).nickname,'QA 本人视频号','Fresh closed-component owner must renew the editor proof');checks++;
    await mainJs("window.qaRoot.querySelector('.finder-nickname').textContent='Another component owner'");
    await assert.rejects(bridge.resolveContext({sender:win.webContents},input),/昵称与绑定账号不一致/);assert.equal(await mainJs('window.submitCount'),0);checks+=2;
    await mainJs("window.qaRoot.querySelector('.finder-nickname').textContent='QA 本人视频号'");
    assert.deepEqual((await call('sync-publish-form',{...input,command:'fill',form})).unresolved,[]);checks++;
    const shadowCover=await call('upload-media',{...input,mediaType:'image',selectionId:coverSelection.id,coverIndex:1});
    assert.equal(shadowCover.coverConfirmed,true,shadowCover.error);checks++;
    const shadowPlan=await call('inspect-page-action',{...input,kind:'publish',expectedTitle:form.title,expectedVisibility:'仅自己可见'});
    assert.ok(shadowPlan.nonce,shadowPlan.error);checks++;
    await mainJs("{const mask=document.createElement('div');mask.id='closed-mask';mask.style='position:fixed;inset:0;z-index:999;background:white';window.qaRoot.append(mask)}");
    const shadowReceiptsBefore=records.length;
    const shadowBlockedSubmit=await call('submit-page-action',{...input,nonce:shadowPlan.nonce,index:0});
    assert.match(shadowBlockedSubmit.error,/遮挡/);assert.equal(shadowBlockedSubmit.mayHaveSubmitted,false);assert.equal(records.length,shadowReceiptsBefore);assert.equal(await mainJs('window.submitCount'),0);checks+=4;
    await mainJs("window.qaRoot.querySelector('#closed-mask').remove()");
    const shadowNextPlan=await call('inspect-page-action',{...input,kind:'publish',expectedTitle:form.title,expectedVisibility:'仅自己可见'});
    assert.ok(shadowNextPlan.nonce,shadowNextPlan.error);checks++;
    const shadowSubmit=await call('submit-page-action',{...input,nonce:shadowNextPlan.nonce,index:0});
    assert.equal(shadowSubmit.receipt?.status,'confirmed',shadowSubmit.error);assert.equal(shadowSubmit.receipt?.visibility,'仅自己可见');assert.equal(await mainJs('window.submitCount'),1);checks+=3;
    const shadowDuplicate=await call('submit-page-action',{...input,nonce:shadowNextPlan.nonce,index:0});
    assert.ok(shadowDuplicate.error);assert.equal(await mainJs('window.submitCount'),1);assert.equal((await layoutTransport.request('qa-layout')).audioMuted,true);checks+=3;
    // Actual native read-only result controller, same fixture account profile,
    // with the owner's nickname and result inside closed authored components.
    const originalEditorUrl=ctx.guest.getURL(),nativeGuestsBefore=bridge.count();
    const resultTime=new Date().toISOString(),displayTime=new Date(Date.parse(resultTime)+8*3600000).toISOString().slice(0,16).replace('T',' ');
    const listFixture=nickname=>'<meta charset=utf-8><div id=result-root></div><script>const r=document.querySelector("#result-root").attachShadow({mode:"closed"});r.innerHTML='+JSON.stringify('<h1>视频管理</h1><div class=work-row><span>QA native list work QA body</span><div>'+displayTime+'</div><span>评论管理</span><span>可见权限</span></div>')+';setTimeout(()=>{const n=document.createElement("div");n.className="finder-nickname";n.textContent='+JSON.stringify(nickname)+';r.prepend(n)},900)</script>';
    fs.writeFileSync(path.join(fixtureFolder,'list.html'),listFixture('QA 本人视频号'));
    const listRecord={id:randomUUID(),accountId,platform:'wechat',nickname:'QA 本人视频号',kind:'publish',taskId:randomUUID(),attemptId:randomUUID(),expectedTitle:'QA native list work',summary:'QA native list work\nQA body',status:'unknown',message:'pending',visibility:'公开',createdAt:resultTime};
    records.push(listRecord);
    const nativeVerified=await call('verify-publish-result',{receiptId:listRecord.id});
    assert.equal(nativeVerified.receipt?.status,'confirmed',JSON.stringify(nativeVerified));assert.equal(nativeVerified.receipt?.id,listRecord.id);assert.equal(nativeVerified.receipt?.taskId,listRecord.taskId);assert.equal(nativeVerified.receipt?.verification.state,'confirmed');
    assert.equal(bridge.count(),nativeGuestsBefore,'The hidden result controller must be closed');assert.equal(ctx.guest.getURL(),originalEditorUrl,'Read-only verification must not navigate the original editor');assert.equal(await mainJs('window.submitCount'),1);checks+=7;
    fs.writeFileSync(path.join(fixtureFolder,'list.html'),listFixture('Another list owner'));
    const foreignList={...listRecord,id:randomUUID(),taskId:randomUUID()};records.push(foreignList);
    const wrongOwnerResult=await call('verify-publish-result',{receiptId:foreignList.id});
    assert.equal(wrongOwnerResult.receipt?.status,'unknown');assert.equal(wrongOwnerResult.receipt?.verification.state,'identity_mismatch');assert.equal(bridge.count(),nativeGuestsBefore);assert.equal(await mainJs('window.submitCount'),1);checks+=4;
    // Match the actual compact list: no rendered nickname there at all.
    fs.writeFileSync(path.join(fixtureFolder,'list.html'),listFixture('').replace('n.className="finder-nickname"','n.className="no-owner"'));
    const compactRecord={...listRecord,id:randomUUID(),taskId:randomUUID()};records.push(compactRecord);
    const compactResult=await call('verify-publish-result',{receiptId:compactRecord.id});
    assert.equal(compactResult.receipt?.status,'confirmed',JSON.stringify(compactResult));assert.equal(compactResult.receipt?.verification.state,'confirmed');assert.equal(bridge.count(),nativeGuestsBefore);assert.equal(ctx.guest.getURL(),originalEditorUrl);assert.equal(await mainJs('window.submitCount'),1);checks+=5;
    console.log(JSON.stringify({nativeEdgePublishFixtureChecks:checks,realWebView2:true,realNativeFileHandoff:true,lateEditorReadinessWaitedBeforeChooser:true,closedNestedComponentPipeline:true,realSilentClipDecodedInHiddenWebView2:true,coverGeneratedFromDecodedFrame:true,formAndCoverApplied:true,privateSubmissionGuard:true,duplicateSubmissionBlocked:true,websiteCannotReplaceIsolatedNonce:true,navigationDoesNotFabricateSuccess:true,expiredAppAuthorizationBlocked:true,qaHooksExcludedFromProduction:true,realPlatformUploadsOrPosts:false,userDataUntouched:true}));
  } catch(error) { console.error({completedChecks:checks},error);process.exitCode=1; }
  finally {bridge?.close();win?.destroy();delete process.env.MATRIX_EDGE_QA_FIXTURES;app.exit(process.exitCode||0);}
});
