// Real sandboxed Electron execution, synthetic HTTPS transport only.
const path=require('node:path'),root=path.resolve(__dirname,'..');
if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const r=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename,...process.argv.slice(2)],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:60000});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status??1);}
else{
 const {app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');let moduleRoot=root;
 if(process.argv[2]){assert.equal(process.argv[2],'--packaged');moduleRoot=path.join(root,'release-next/win-unpacked/resources/app.asar');assert.equal(require('node:crypto').createHash('sha256').update(require('original-fs').readFileSync(moduleRoot)).digest('hex'),process.argv[3]);}
 app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-reader-liveness-qa-')));app.commandLine.appendSwitch('mute-audio');app.on('window-all-closed',()=>{});
 app.whenReady().then(async()=>{
  const {createBrowserReader,endpoints}=require(path.join(moduleRoot,'desktop/douyin-browser-reader.cjs'));let checks=0,reader,mode='normal';const windows=[],requests=[],source=session.fromPartition('qa-liveness'),own='9007199254740993',options={accountSession:source,publicHandle:'qa-liveness',assertCurrent:async()=>{}};
  const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
  source.protocol.handle('https',req=>{
   const u=new URL(req.url);assert.equal(u.origin,'https://www.douyin.com');requests.push(u.pathname);
   if(u.pathname===endpoints.self)return Response.json({status_code:mode==='self-denied'?-999:0,user:{uid:own,unique_id:'qa-liveness',sec_uid:'MS4wQaLiveness'}});
   if(u.pathname===endpoints.followers)throw Error('A denied website method must not issue a replacement GET');
   assert.equal(u.pathname,'/user/self');
   const body=mode==='body-stalled'?`console.debug=()=>{};const original=window.fetch;window.fetch=function(url,options){if(String(url).includes('/profile/self/'))return Promise.resolve({status:200,text:()=>new Promise(()=>{})});return original(url,options);};`:'';
   return new Response(`<script>window.selfExportCalled=0;window.methodCalls=0;const exports={self:{read:async function(){const path='/aweme/v1/web/user/profile/self/';window.selfExportCalled++;return new Promise(()=>{});}},followers:{read:async function(){const path='/aweme/v1/web/user/follower/list/';window.methodCalls++;return {status_code:-999};}}};const runtime=key=>exports[key];runtime.m={self:function(){const path='/aweme/v1/web/user/profile/self/';},followers:function(){const path='/aweme/v1/web/user/follower/list/';}};window.webpackChunkdouyin_web=[];window.webpackChunkdouyin_web.push=row=>row[2](runtime);${body}</script>`,{headers:{'content-type':'text/html;charset=utf-8'}});
  });
  const make=()=>{reader=createBrowserReader({timeoutMs:mode==='body-stalled'?1000:5000,createWindow:s=>{eq(s,source);const win=new BrowserWindow({show:false,webPreferences:{session:s,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});windows.push(win);return win;}});};
  try{
   await source.cookies.set({url:'https://www.douyin.com/',domain:'.douyin.com',name:'sessionid',value:'QA_ONLY',path:'/',secure:true});
   make();let client=await reader.acquire(options);eq(client.ownUid,own);eq(await windows.at(-1).webContents.executeJavaScript('window.selfExportCalled'),0);eq(requests.filter(p=>p===endpoints.self).length,1);
   const before=requests.length;await assert.rejects(()=>client.readWeb('followers',{cursor:'0',offset:'0',sourceType:'1'}),/粉丝名单.*-999/);checks++;eq(await windows.at(-1).webContents.executeJavaScript('window.methodCalls'),1);eq(requests.slice(before),[endpoints.self]);
   const retained=windows.at(-1);eq(retained.webContents.getBackgroundThrottling(),false);await retained.webContents.executeJavaScript('window.qaCursor="keep"');client.close();eq(retained.webContents.getBackgroundThrottling(),true);eq(retained.isDestroyed(),false);
   client=await reader.acquire(options);eq(windows.at(-1),retained);eq(retained.webContents.getBackgroundThrottling(),false);eq(await retained.webContents.executeJavaScript('window.qaCursor'),'keep');client.close();reader.close();
   mode='self-denied';const deniedStart=requests.length;make();await assert.rejects(()=>reader.acquire(options),/本人资料.*-999/);checks++;eq(requests.slice(deniedStart),['/user/self',endpoints.self]);reader.close();
   mode='body-stalled';make();await assert.rejects(()=>reader.acquire(options),/超时.*读取本人资料响应正文/);checks++;eq(windows.at(-1).isDestroyed(),true);eq(requests.some(p=>/notice|notification|mark_read|message|publish/.test(p)),false);
   console.log(JSON.stringify({readerLivenessNativeChecks:checks,guessedIdentityExportNotInvoked:true,singleOrdinaryIdentityGet:true,platformMinus999NotRetried:true,websiteFollowerRefusalNoReplacementGet:true,actualRendererTimeoutStageReported:true,realPlatformRequests:0,realProfileTouched:false,readReceipts:0}));
  }catch(error){console.error(error);process.exitCode=1;}finally{reader?.close();for(const win of windows)if(!win.isDestroyed())win.destroy();app.exit(process.exitCode||0);}
 });
}
