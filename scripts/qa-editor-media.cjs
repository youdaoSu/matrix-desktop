// Disposable Chromium profile + actual native media store/preview/capture IPC.
// Only generated fixtures and loopback requests are allowed; no installed app.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const root = path.resolve(__dirname, '..');
require('./qa-console-pipe.cjs').guardQaConsolePipes();

async function runMediaUiTests() {
  const assert = require('node:assert/strict'), React = require('react');
  const { createRoot } = require('react-dom/client'), { ipcRenderer } = require('electron');
  const { loadTs } = require('./qa-load-typescript.cjs');
  // A locally generated moving portrait video. No camera, microphone or audio.
  const canvas = document.createElement('canvas'); canvas.width = 360; canvas.height = 640;document.body.append(canvas);
  const context = canvas.getContext('2d'), stream = canvas.captureStream(10);
  const recorder = new MediaRecorder(stream, { mimeType:'video/webm;codecs=vp8' }), chunks = [];
  let encodedReady;
  const firstEncodedChunk = new Promise(resolve => { encodedReady = resolve; });
  recorder.ondataavailable = event => { if(event.data.size){chunks.push(event.data);encodedReady();} };
  const stopped = new Promise(resolve => { recorder.onstop = resolve; });
  // Canvas capture may not emit MediaRecorder's start event until its first
  // frame. Paint before awaiting encoded output, avoiding a readiness cycle.
  recorder.start(100);let frame = 0;
  const paint = () => { context.fillStyle = frame++ % 2 ? '#df9660' : '#d79370'; context.fillRect(0,0,360,640); context.fillStyle='#243c54';context.fillRect(30,230,300,370);context.fillStyle='white';context.font='26px sans-serif';context.fillText('Matrix video preview',40,100);context.fillText('Generated QA fixture',40,145);stream.getVideoTracks()[0].requestFrame(); };
  paint(); const paintTimer = setInterval(paint,60);
  let encodeDeadline;
  try{await Promise.race([firstEncodedChunk,new Promise((_,reject)=>{encodeDeadline=setTimeout(()=>reject(Error('Generated canvas recorder produced no encoded video chunk')),5000);})]);await new Promise(resolve=>setTimeout(resolve,1200));}
  finally{clearTimeout(encodeDeadline);recorder.stop();await stopped;clearInterval(paintTimer);stream.getTracks().forEach(track=>track.stop());canvas.remove();}
  await ipcRenderer.invoke('qa:generated-video', Array.from(new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer())));

  let token='qa-media-only', picks=0, calls=[], controlsReceived;
  window.matrixDesktop = {
    importMedia: () => { throw Error('Drag import is outside this generated-video fixture'); },
    chooseMedia: async type => { picks++;return ipcRenderer.invoke('matrix:choose-media',{mediaType:type}); },
    rememberPublishMedia: input => { calls.push('remember');return ipcRenderer.invoke('matrix:remember-publish-media',input); },
    previewPublishMedia: input => ipcRenderer.invoke('matrix:preview-publish-media',input),
    closePublishPreview: previewId => ipcRenderer.invoke('matrix:close-publish-preview',{previewId}),
    capturePublishFrame: input => { calls.push('capture');return ipcRenderer.invoke('matrix:capture-publish-frame',input); },
    validatePublishMedia: input => ipcRenderer.invoke('matrix:validate-publish-media',input),
  };
  const cache=new Map(),overrides=new Map(),toasts=[];
  const stub=(file,exports)=>cache.set(path.join(root,file),{exports});
  stub('client/src/api/index.ts',{getAuthToken:()=>token,getUser:()=>({id:'qa-media-owner'}),axiosForBackend:{get:async()=>({data:{data:{items:[]}}})}});
  overrides.set('sonner',{toast:Object.fromEntries(['success','error','info'].map(kind=>[kind,text=>toasts.push({kind,text})]))});
  overrides.set('react-router-dom',{useLocation:()=>({pathname:'/publish/create',state:null}),useNavigate:()=>()=>{}});
  stub('client/src/components/workspace/OfficialWorkspace.tsx',{platformLabels:{douyin:'抖音'},OfficialActionButton:()=>null,useOfficialWorkspace:()=>({hide:()=>{},publisher:()=>{throw Error('No platform pages in media QA');}})});
  stub('client/src/components/workspace/PublishQueue.tsx',{usePublishQueue:()=>({queue:{running:false,jobs:[],start:(_requests,controls)=>{controlsReceived=controls;return 'qa-batch';}}})});
  const account={id:'qa-account',nickname:'预览测试账号',platform:'douyin',connectorSessionId:'qa-disposable-session'};
  stub('client/src/components/workspace/publish-preferences.ts',{loadPublishAccounts:async()=>[account],readPublishPreferences:()=>({remember:false,configs:{}}),savePublishPreferences:()=>{}});
  stub('client/src/components/workspace/PublishAccountPicker.tsx',{PublishAccountPicker:()=>null,PublishAccountAvatar:()=>null,PublishPlatformIcon:()=>null});
  stub('client/src/components/workspace/OfficialOptionPicker.tsx',{dynamicField:()=>undefined,OfficialOptionPicker:()=>null});
  const drafts=loadTs('client/src/components/workspace/local-publish-drafts.ts',cache,overrides);
  stub('client/src/components/workspace/local-publish-drafts.ts',{...drafts,draftPreferences:()=>({auto:false}),saveLocalDraft:()=>{},removeLocalDraft:()=>{}});
  const style=document.createElement('style');style.textContent=':root{--card:#fff;--foreground:#243347;--muted:#f4f5f8}*{box-sizing:border-box}body{margin:0;font:14px system-ui;color:#243347;background:#f5f6fa}button,input,textarea,select{font:inherit}button,summary{cursor:pointer}input,textarea,select{border:1px solid #dce0e9;border-radius:6px;padding:8px}button{border:1px solid #dce0e9;border-radius:6px;padding:8px 12px;background:white}'+['client/src/workspace.css','client/src/publish-config.css'].map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n');document.head.append(style);
  const {PublishEditorStateProvider,usePublishEditorValue}=loadTs('client/src/components/workspace/PublishEditorState.tsx',cache,overrides);
  const Single=loadTs('client/src/pages/publish/ContentCreateRealPage.tsx',cache,overrides).default;
  const picked=await window.matrixDesktop.chooseMedia('video');assert.ok(picked.selection,picked.error || 'Native fixture selection missing');const media=picked.selection;
  const componentRoot=createRoot(document.getElementById('root'));
  const config={title:'预览测试，不提交平台',body:'简介和话题会在替换素材后保留。',topics:['本地测试'],comment:'',options:{visibility:'private'}};
  function Seed(){usePublishEditorValue('single:media',()=>media);usePublishEditorValue('single:selected',()=>[account.id]);usePublishEditorValue('single:common',()=>config);return React.createElement(Single);}
  componentRoot.render(React.createElement(PublishEditorStateProvider,null,React.createElement(Seed)));
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms||20));
  const until=async(predicate,name)=>{for(let n=0;n<500;n++){if(predicate())return;await sleep();}throw Error('Media UI timeout: '+name+'; '+document.body.innerText.slice(0,1200)+'; '+JSON.stringify(toasts));};
  const button=text=>[...document.querySelectorAll('button')].find(node=>text.test(node.textContent));
  let checks=0;
  try {
    await until(()=>document.querySelector('video')?.readyState>=2 && !button(/^截取当前帧/)?.disabled,'real local video decoded');
    const video=document.querySelector('video');assert.equal(video.videoWidth,360);assert.equal(video.videoHeight,640);assert.equal(video.muted,true);assert.equal(video.controls,true);assert.equal(video.autoplay,false);checks+=5;
    video.muted=false;await until(()=>video.muted,'always silent preview');checks++;
    const firstUrl=video.src,firstPreview=new URL(firstUrl).pathname.split('/')[2];
    video.currentTime=.18;await until(()=>!video.seeking && !button(/^截取当前帧/)?.disabled,'seeking ended');
    button(/^截取当前帧/).click();await until(()=>document.querySelector('.matrix-editor-cover-thumb')?.complete && document.querySelector('.matrix-editor-cover-thumb')?.naturalWidth>0,'actual saved JPEG thumbnail');
    assert.equal(document.querySelector('.matrix-editor-cover-thumb').naturalWidth,360);assert.equal(document.querySelector('.matrix-editor-cover-thumb').naturalHeight,640);assert.ok(toasts.some(item=>/当前帧已保存/.test(item.text)));assert.equal(calls.filter(c=>c==='capture').length,1);assert.equal(document.querySelector('#publish-title').value,config.title);assert.equal(document.querySelector('#publish-content').value,config.body);checks+=6;
    const summary=document.querySelector('[aria-label="分发任务设置"]');summary.click();await until(()=>document.querySelector('details.matrix-distribution-controls')?.open,'task settings opened');
    const batchInput=document.querySelector('[aria-label="分发批次名称"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(batchInput,'视频预览测试批次');batchInput.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('input[name="distribution-initial-state"][value="paused"]').click();await until(()=>button(/^创建暂停任务/),'paused button changes');
    assert.equal(batchInput.value,'视频预览测试批次');assert.equal(document.querySelectorAll('[aria-label="创建任务控制"] input[type=checkbox]:disabled').length,3);checks+=2;
    const rect=document.querySelector('[aria-label="创建任务控制"]').getBoundingClientRect();assert.ok(rect.width>500 && rect.height>200 && rect.left>=0 && rect.right<=innerWidth && rect.top>=0 && rect.bottom<=innerHeight,'Popover must fit in the visible window');checks++;
    summary.focus();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(document.querySelector('details.matrix-distribution-controls').open,false);checks++;
    // Actual page screenshot includes the moving portrait video and cover. No real content.
    await ipcRenderer.invoke('qa:screenshot','preview');
    summary.click();await until(()=>document.querySelector('details.matrix-distribution-controls').open,'task settings reopened');await sleep(60);await ipcRenderer.invoke('qa:screenshot','settings');
    // Replace uses the native selection boundary, preserving title/body/cover/settings.
    summary.click();button(/^重新上传$/).click();await until(()=>picks===2 && document.querySelector('video')?.src!==firstUrl && document.querySelector('video')?.readyState>=2,'replacement preview');
    assert.equal(document.querySelector('#publish-title').value,config.title);assert.equal(document.querySelector('#publish-content').value,config.body);assert.ok(document.querySelector('.matrix-editor-cover-thumb'));checks+=3;
    assert.equal(await ipcRenderer.invoke('qa:preview-status',firstUrl),404,'Previous preview must be revoked only by its ID');checks++;
    // Confirm both source files remain untouched and the generated image stays in own store.
    const native=await ipcRenderer.invoke('qa:assert-fixtures');assert.equal(native.sourceUnchanged,true);assert.equal(native.generatedFrames,1);assert.equal(native.frameSize.width,360);assert.equal(native.frameSize.height,640);checks+=4;
    // Create a paused task through the actual editor admission. Stub queue records
    // only the selected controls, never uploads or publishes a fixture anywhere.
    button(/^创建暂停任务/).click();await until(()=>controlsReceived,'paused editor admission');
    assert.deepEqual(controlsReceived,{batchName:'视频预览测试批次',initialState:'paused'});checks++;
    await until(()=>button(/^移除视频$/) && !button(/^移除视频$/).disabled,'task admission finished and remove enabled');
    button(/^移除视频$/).click();await until(()=>!document.querySelector('[data-preview-selection]'),'remove selection');
    assert.equal(document.querySelector('#publish-title').value,config.title);assert.equal(document.querySelector('#publish-content').value,config.body);assert.equal((await ipcRenderer.invoke('qa:assert-fixtures')).sourceUnchanged,true);checks+=3;
    return {editorMediaChecks:checks,realChromiumVideoDecode:true,realCanvasToNativeJpeg:true,realLocalPreviewServer:true,realFrameThumbnail:true,sourceFilesUnchanged:true,realPlatformActions:false,installedProfileTouched:false,previousPreview:firstPreview.length===43};
  } finally {componentRoot.unmount();style.remove();delete window.matrixDesktop;}
}

if(process.type==='renderer')module.exports={runMediaUiTests};
else if(process.versions.electron){
  const {app,BrowserWindow,ipcMain,nativeImage}=require('electron'),http=require('node:http'),{createHash}=require('node:crypto');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-preview 中文 QA-')),fixturePath=path.join(temporary,'竖屏 video.webm');
  app.setPath('userData',path.join(temporary,'isolated-profile'));app.commandLine.appendSwitch('mute-audio');app.disableHardwareAcceleration();
  app.whenReady().then(async()=>{
    let win,server,preview,initialHash,blockedRequests=0;const allowedPorts=new Set();
    const hash=()=>createHash('sha256').update(fs.readFileSync(fixturePath)).digest('hex');
    const deadline=setTimeout(()=>{console.error('Media UI QA deadline exceeded');app.exit(1);},45000);
    try{
      server=http.createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<meta charset=utf-8><title>Disposable media QA</title><div id=root></div>');});
      await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;allowedPorts.add(String(port));const appUrl=`http://127.0.0.1:${port}`;
      win=new BrowserWindow({show:false,width:1500,height:1060,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false,partition:'qa-media-disposable'}});win.webContents.setAudioMuted(true);
      win.webContents.session.webRequest.onBeforeRequest((request,callback)=>{let allow=false;try{const url=new URL(request.url);allow=url.protocol==='http:' && url.hostname==='127.0.0.1' && allowedPorts.has(url.port) || url.protocol==='blob:';}catch{}if(!allow)blockedRequests++;callback({cancel:!allow});});
      win.webContents.on('console-message',(_e,level,msg)=>{if(level>=2 && !msg.includes('Electron Security Warning'))console.error('Media QA renderer: '+msg);});
      const authenticate=async token=>{if(token!=='qa-media-only')throw Error('Disposable QA token required');return{userId:'qa-media-owner'};};
      const store=require('../desktop/publish-media.cjs').createPublishMediaStore(temporary,nativeImage);
      require('../desktop/personal-assist.cjs').registerPersonalAssist({ipcMain,dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[fixturePath]})},webContents:{},session:{},platforms:{},inspectPlatformSession:async()=>{throw Error('No official pages');},getWindow:()=>win,authenticate,mediaStore:store});
      const wrappedIpc={handle:(name,fn)=>ipcMain.handle(name,async(event,input)=>{const result=await fn(event,input);if(result.files)result.files.forEach(file=>allowedPorts.add(new URL(file.url).port));return result;})};
      preview=require('../desktop/publish-preview.cjs').registerPublishPreview({ipcMain:wrappedIpc,getWindow:()=>win,mediaStore:store,authenticate,getAppUrl:()=>appUrl});
      ipcMain.handle('qa:generated-video',(_event,bytes)=>{if(initialHash || !Array.isArray(bytes) || !bytes.length || bytes.length>2000000)throw Error('Invalid or unencoded fixture video');fs.writeFileSync(fixturePath,Buffer.from(bytes),{flag:'wx'});initialHash=hash();return true;});
      ipcMain.handle('qa:screenshot',async(_event,kind)=>{if(!['preview','settings'].includes(kind))throw Error('Invalid screenshot kind');await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await win.webContents.capturePage();await new Promise(resolve=>setTimeout(resolve,100));fs.writeFileSync(path.join(root,'logs',`qa-publish-editor-media-${kind}.png`),(await win.webContents.capturePage()).toPNG());return true;});
      ipcMain.handle('qa:assert-fixtures',()=>{const frameRoot=path.join(temporary,createHash('sha256').update('qa-media-owner').digest('hex'),'frames');const frames=fs.existsSync(frameRoot)?fs.readdirSync(frameRoot):[];return{sourceUnchanged:hash()===initialHash,generatedFrames:frames.length,frameSize:frames.length?nativeImage.createFromPath(path.join(frameRoot,frames[0])).getSize():{}};});
      ipcMain.handle('qa:preview-status',async(_event,url)=>{const parsed=new URL(url);if(parsed.hostname!=='127.0.0.1' || !allowedPorts.has(parsed.port))throw Error('Not owned preview');const result=await fetch(url,{headers:{Origin:appUrl}});await result.arrayBuffer();return result.status;});
      await win.loadURL(appUrl);const result=await win.webContents.executeJavaScript(`require(${JSON.stringify(__filename)}).runMediaUiTests()`);console.log(JSON.stringify({...result,externalRequests:blockedRequests}));
    }catch(error){console.error(error);process.exitCode=1;}
    finally{clearTimeout(deadline);preview?.close();server?.closeAllConnections();server?.close();win?.destroy();app.exit(process.exitCode||0);}
  });
}else{
  const{spawnSync}=require('node:child_process'),cached=path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe');
  const result=spawnSync(fs.existsSync(cached)?cached:require('electron'),[__filename],{cwd:root,windowsHide:true,encoding:'utf8',timeout:60000});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.error)console.error(result.error.message);process.exitCode=result.status??1;
}
