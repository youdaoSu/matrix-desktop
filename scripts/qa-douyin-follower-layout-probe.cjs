// Synthetic guarded layout captures only; never attaches a real user profile.
const path=require('node:path'),root=path.resolve(__dirname,'..');
if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const result=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename,...process.argv.slice(2)],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:60000});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status??1);}
else{
 const fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict'),{app,BrowserWindow,session,nativeImage}=require('electron');
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-follower-layout-probe-qa-'));app.setPath('userData',path.join(folder,'profile'));app.on('window-all-closed',()=>{});
 app.whenReady().then(async()=>{let checks=0,win;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};let moduleRoot=root;
  if(process.argv[2]){eq(process.argv[2],'--packaged');moduleRoot=path.join(root,'release-next/win-unpacked/resources/app.asar');eq(require('node:crypto').createHash('sha256').update(require('original-fs').readFileSync(moduleRoot)).digest('hex'),process.argv[3]);}
  const {createFollowerLayoutProbe}=require(path.join(moduleRoot,'desktop/douyin-follower-layout-probe.cjs')),clock=Date.parse('2026-10-23T21:00:00Z'),directory=path.join(folder,'logs'),accountSession={};let calls=0,guards=0;
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
  const mock={isDestroyed:()=>false,isVisible:()=>false,webContents:{session:accountSession,getURL:()=> 'https://www.douyin.com/user/self',capturePage:async(rect,opts)=>{calls++;eq(rect,undefined);eq(opts,{stayHidden:true,stayAwake:false});return{isEmpty:()=>false,getSize:()=>({width:1,height:1}),toPNG:()=>bytes};}}};
  const input={window:mock,accountSession,ownUid:'100',assertCurrent:async()=>{guards++;}},make=extra=>createFollowerLayoutProbe({directory,version:'2.10.0-rc.167',now:()=>clock,...extra});
  try{
   eq((await make({version:'2.10.0-rc.166'}).capture(input)).saved,false);eq((await make({now:()=>Date.parse('2026-10-24T03:00:00Z')}).capture(input)).saved,false);eq(calls,0);
   const probe=make();eq((await probe.capture({...input,accountSession:{}})).saved,false);eq((await probe.capture({...input,ownUid:'0'})).saved,false);eq((await probe.capture({...input,window:{...mock,isVisible:()=>true}})).saved,false);eq((await probe.capture({...input,window:{...mock,webContents:{...mock.webContents,getURL:()=> 'https://www.douyin.com/user/other'}}})).saved,false);eq(calls,0);
   for(let n=1;n<=3;n++){const result=await probe.capture(input);eq(result.saved,true);eq(result.slot,n);eq(fs.readFileSync(path.join(directory,'douyin-follower-layout-rc167-'+String(n).padStart(2,'0')+'.png')),bytes);}
   eq((await probe.capture(input)).saved,false);eq(probe.snapshot(),{enabled:true,attempts:3,saved:3});eq(guards,6);
   const before=fs.readdirSync(directory);eq((await make().capture(input)).saved,false);eq(fs.readdirSync(directory),before);
   const shared=path.join(folder,'shared');fs.mkdirSync(shared);fs.writeFileSync(path.join(shared,'douyin-follower-layout-rc167-01.png'),'KEEP_EXISTING');const nextRelease=make({directory:shared,version:'2.10.0-rc.168'});eq((await nextRelease.capture(input)).slot,2);eq((await nextRelease.capture(input)).slot,3);eq((await nextRelease.capture(input)).saved,false);eq(fs.readFileSync(path.join(shared,'douyin-follower-layout-rc167-01.png'),'utf8'),'KEEP_EXISTING');eq(fs.readdirSync(shared).length,3);
   const denied=make({directory:path.join(folder,'denied')});eq((await denied.capture({...input,assertCurrent:async()=>{throw Error('PRIVATE_AUTH');}})).saved,false);eq(fs.existsSync(path.join(folder,'denied')),false);
   let complete;const late=make({directory:path.join(folder,'late'),timeoutMs:5});eq((await late.capture({...input,window:{...mock,webContents:{...mock.webContents,capturePage:()=>new Promise(resolve=>complete=resolve)}}})).saved,false);complete({isEmpty:()=>false,getSize:()=>({width:1,height:1}),toPNG:()=>bytes});await new Promise(resolve=>setTimeout(resolve,10));eq(fs.existsSync(path.join(folder,'late')),false);
   const s=session.fromPartition('qa-follower-layout');s.protocol.handle('https',request=>{eq(request.url,'https://www.douyin.com/user/self');return new Response('<html><body style="margin:0;background:rgb(12,34,56)">Synthetic follower panel</body></html>',{headers:{'content-type':'text/html'}});});
   win=new BrowserWindow({show:false,width:220,height:160,webPreferences:{session:s,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});await win.loadURL('https://www.douyin.com/user/self');eq(win.isVisible(),false);
   const actual=make({directory:path.join(folder,'native')});const result=await actual.capture({window:win,accountSession:s,ownUid:'100',assertCurrent:async()=>{eq(win.webContents.getURL(),'https://www.douyin.com/user/self');}});eq(result.saved,true);eq(win.isVisible(),false);
   const image=nativeImage.createFromPath(path.join(folder,'native/douyin-follower-layout-rc167-01.png'));eq(image.isEmpty(),false);assert(image.getSize().width>0);checks++;
   console.log(JSON.stringify({followerLayoutProbeChecks:checks,actualHiddenCapture:true,stayHiddenAndNoWakeExplicit:true,versionAndDeadlineGated:true,maximumThree:true,oldFilesNeverOverwritten:true,lateCaptureCannotWrite:true,realProfileTouched:false,realPlatformRequests:0,inputsSent:0}));
  }finally{if(win&&!win.isDestroyed())win.destroy();}
 }).then(()=>app.exit(0)).catch(error=>{console.error(error);app.exit(1);});
}
