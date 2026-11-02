// Actual Electron 33 frame/loading behavior. Disposable session and synthetic
// HTTPS only; no real profile, credentials or platform requests.
const path=require('node:path'),root=path.resolve(__dirname,'..');
if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const r=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:15000});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status??1);}
else{
 const {app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');
 app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-frame-readiness-qa-')));app.commandLine.appendSwitch('mute-audio');
 app.whenReady().then(async()=>{let win,release;try{
  const s=session.fromPartition('qa-frame-readiness');
  s.protocol.handle('https',req=>{const u=new URL(req.url);assert.equal(u.origin,'https://frame.fixture.test');if(u.pathname==='/pending')return new Promise(resolve=>{release=()=>resolve(new Response('<p>QA frame done</p>',{headers:{'content-type':'text/html'}}));});assert.equal(u.pathname,'/self');return new Response('<h1>QA loaded own page</h1>',{headers:{'content-type':'text/html'}});});
  win=new BrowserWindow({show:false,webPreferences:{session:s,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});await win.loadURL('https://frame.fixture.test/self');
  await win.webContents.executeJavaScript(`setTimeout(()=>{const frame=document.createElement('iframe');frame.src='/pending';document.body.appendChild(frame);},10);true`);
  for(let n=0;n<100&&!release;n++)await new Promise(resolve=>setTimeout(resolve,10));assert(release);
  let convenienceDone=false;const pending=win.webContents.executeJavaScript('document.querySelector("h1").textContent').then(value=>{convenienceDone=true;return value;});
  const direct=await Promise.race([win.webContents.mainFrame.executeJavaScript('document.querySelector("h1").textContent'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Main frame execution also waits for pending child')),1500))]);
  assert.equal(direct,'QA loaded own page');await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(win.webContents.isLoading(),true);assert.equal(win.webContents.isLoadingMainFrame(),false);assert.equal(convenienceDone,true);
  release();await pending;assert.equal(convenienceDone,true);
  console.log(JSON.stringify({passed:true,electron:process.versions.electron,pendingChildDidNotBlockEitherCall:true,pendingChildHypothesisRejected:true,realPlatformRequests:0,realProfileTouched:false}));
 }catch(error){console.error(error);process.exitCode=1;}finally{release?.();win?.destroy();app.exit(process.exitCode||0);}});
}
