// Actual sandboxed preload and normal website fetch/XHR, disposable HTTPS handler.
const path=require('node:path'),root=path.resolve(__dirname,'..');require('./qa-console-pipe.cjs').guardQaConsolePipes();
if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const result=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename,...process.argv.slice(2)],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:35000});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status??1);}
else{
 const{app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');
 let moduleRoot=root;if(process.argv[2]){assert.equal(process.argv[2],'--packaged');moduleRoot=path.join(root,'release-next/win-unpacked/resources/app.asar');assert.equal(require('node:crypto').createHash('sha256').update(require('original-fs').readFileSync(moduleRoot)).digest('hex'),process.argv[3]);}
 const {readObservedMetrics,readObservedIdentity}=require(path.join(moduleRoot,'desktop/douyin-profile-preload.cjs'));
 app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-profile-observer-qa-')));app.commandLine.appendSwitch('mute-audio');
 app.whenReady().then(async()=>{
  let win,context,server,checks=0,mode='normal',sourceReads=0,loopbackHits=0;const requests=[];const eq=(actual,wanted)=>{assert.deepEqual(actual,wanted);checks++;};
  const source=session.fromPartition('qa-bound-own-profile-source');await source.cookies.set({url:'https://creator.douyin.com/',domain:'.douyin.com',name:'sessionid',value:'SYNTHETIC_BOUND_COOKIE',secure:true,httpOnly:true});
  const originalBefore=source.webRequest.onBeforeRequest.bind(source.webRequest);let registeredGuard;
  source.webRequest.onBeforeRequest=handler=>{registeredGuard=handler;return originalBefore(handler);};
  const local=source;const prepare=require(path.join(moduleRoot,'desktop/douyin-profile-context.cjs')).createProfileContext({createSession(){throw Error('Fresh profile sessions forbidden');}});context=await prepare({sourceSession:source,assertCurrent:async()=>{}});
  eq(local,context.session);eq((await local.cookies.get({url:'https://creator.douyin.com/'})).length,1);eq(sourceReads,0);
  await local.protocol.handle('https',async request=>{
   const url=new URL(request.url);assert.equal(url.hostname,'creator.douyin.com');eq(request.method,'GET');requests.push(url.pathname);
   if(url.pathname==='/creator-micro/home')return new Response(`<meta charset=utf-8><div id=ready>${mode==='missing-handle'?'<div>QA Owner <span>抖音号：qa-owner</span><p>关注 2 获赞 5</p></div>':''}</div><script>window.siteRequests=0;window.siteRequests++;fetch('/aweme/v1/creator/user/info/').then(r=>r.json()).then(v=>window.siteProfile=v);const xhr=new XMLHttpRequest();xhr.open('GET','/aweme/v1/creator/pc/user/info/');xhr.onload=()=>window.siteXhr=xhr.responseText;xhr.send();</script>`,{headers:{'content-type':'text/html','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:*"}});
   if(!['/aweme/v1/creator/user/info/','/aweme/v1/creator/pc/user/info/'].includes(url.pathname))return new Response('',{status:404});
   if(mode==='denied')return new Response('fixture refusal',{status:403});
   const handle=mode==='foreign'?'qa-other':'qa-owner',count=mode==='zero'?0:13763;
   const profileFields=[['missing-handle','missing-proof'].includes(mode)?'':'"unique_id":"'+handle+'"',mode==='missing-counter'?'':'"follower_count":'+count].filter(Boolean).join(',');
   return new Response(`{"status_code":0,"uid":9007199254740993,"user_profile":{${profileFields}},"privateToken":"FIXTURE_DO_NOT_PROJECT"}`,{headers:{'content-type':'application/json'}});
  });
  const until=async fn=>{for(let i=0;i<200;i++){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Native profile fixture timeout');};
  try{
   win=new BrowserWindow({show:false,webPreferences:{session:local,preload:path.join(moduleRoot,'desktop/douyin-profile-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});win.webContents.setAudioMuted(true);context.attach(win.webContents);
   const load=async()=>{await win.loadURL('https://creator.douyin.com/creator-micro/home');await until(()=>win.webContents.executeJavaScript("window.__matrixOwnProfileObserved?.pending?.size===0&&typeof window.siteXhr==='string'"));};
   await load();const projected=await readObservedMetrics(win.webContents,'qa-owner',async()=>{});eq(projected.metrics.followersCount,13763);eq(projected.ownUid,'9007199254740993');eq(projected.source,'douyin-creator-profile');eq(JSON.stringify(projected).includes('FIXTURE_DO_NOT_PROJECT'),false);
   eq(await readObservedIdentity(win.webContents,'qa-owner',context.check),{key:'qa-owner',source:'douyin-creator-profile'});
   await assert.rejects(()=>readObservedIdentity(win.webContents,'qa-other',context.check),/身份编号与绑定不一致/);checks++;
   eq(await win.webContents.executeJavaScript('window.siteProfile.privateToken'),'FIXTURE_DO_NOT_PROJECT');eq(await win.webContents.executeJavaScript('window.siteRequests'),1);eq(requests.filter(path=>path.includes('/user/info/')).length,2);
   // protocol.handle('https') substitutes Chromium's normal network stack in
   // this fixture. Verify the real native request hook separately over an
   // ordinary disposable loopback server; no certificate override is used.
   server=require('node:http').createServer((_request,response)=>{loopbackHits++;response.end('source-handler-untouched');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const loopback='http://127.0.0.1:'+server.address().port;
   await assert.rejects(()=>win.webContents.executeJavaScript(`fetch(${JSON.stringify(loopback+'/aweme/v1/creator/user/info/')},{method:'POST',body:'synthetic-only'})`));checks++;await assert.rejects(()=>win.webContents.executeJavaScript(`fetch(${JSON.stringify(loopback+'/notification/read')})`));checks++;eq(loopbackHits,0);eq(sourceReads,0);eq(await(await source.fetch(loopback+'/source-fixture')).text(),'source-handler-untouched');eq(sourceReads,0);eq(loopbackHits,1);
   eq(await readObservedMetrics(win.webContents,'foreign-handle',async()=>{}),undefined);
   mode='zero';await load();eq((await readObservedMetrics(win.webContents,'qa-owner',async()=>{})).metrics.followersCount,0);
   mode='denied';await load();const before=requests.length;await assert.rejects(()=>readObservedMetrics(win.webContents,'qa-owner',async()=>{}),/官方拒绝/);checks++;eq(requests.length,before);
   mode='foreign';await load();eq(await readObservedMetrics(win.webContents,'qa-owner',async()=>{}),undefined);
   mode='missing-handle';await load();eq((await readObservedMetrics(win.webContents,'qa-owner',async()=>{})).metrics.followersCount,13763);eq(await readObservedMetrics(win.webContents,'qa-other',async()=>{}),undefined);await win.webContents.executeJavaScript('document.querySelector("#ready").innerHTML="<div>unrelated profile</div>"');eq(await readObservedMetrics(win.webContents,'qa-owner',async()=>{}),undefined);
   mode='missing-proof';await load();eq(await readObservedMetrics(win.webContents,'qa-owner',async()=>{}),undefined);
   mode='missing-counter';await load();const readsBeforeMissing=requests.length;eq(await readObservedMetrics(win.webContents,'qa-owner',async()=>{}),undefined);eq(requests.length,readsBeforeMissing);
   eq((await readObservedIdentity(win.webContents,'qa-owner',context.check)).key,'qa-owner');eq(requests.length,readsBeforeMissing);
   eq(requests.every(path=>['/creator-micro/home','/aweme/v1/creator/user/info/','/aweme/v1/creator/pc/user/info/'].includes(path)),true);
   await source.cookies.set({url:'https://creator.douyin.com/',domain:'.douyin.com',name:'sessionid',value:'SYNTHETIC_CHANGED_COOKIE',secure:true,httpOnly:true});await assert.rejects(()=>readObservedMetrics(win.webContents,'qa-owner',context.check),/登录已变化|已结束/);checks++;eq((await local.cookies.get({url:'https://creator.douyin.com/'}))[0].value,'SYNTHETIC_CHANGED_COOKIE');checks++;
   console.log(JSON.stringify({nativeOwnProfileObserverChecks:checks,actualSandboxedPreload:true,firstInlineFetchAndNormalXhr:true,siteResponsesUnmodified:true,exactInt64Owner:true,denialNoAdditionalRequest:true,nativeHookRejectedLoopbackWritesAndNotices:true,httpsAllowlistUnitVerifiedSeparately:true,exactBoundSessionReused:true,foregroundSessionFetchUnaffected:true,sourceStorageNotCleared:true,tlsOverrides:false,realPlatformRequests:0,readReceipts:0,realUserProfileTouched:false}));
  }finally{if(win&&!win.isDestroyed())win.destroy();context?.close();server?.closeAllConnections();server?.close();}
 }).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>app.exit(process.exitCode||0));
}
