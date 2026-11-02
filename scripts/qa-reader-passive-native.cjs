// Real sandboxed Electron; isolated synthetic HTTPS and a disposable profile.
const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict'),root=path.resolve(__dirname,'..');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
if(!process.versions.electron){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-passive-reader-')),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const r=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename,'--fixture-profile',profile,...process.argv.slice(2)],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:60000});
 process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');
 if(r.status===0){assert.equal(path.dirname(fs.realpathSync(profile)),fs.realpathSync(os.tmpdir()));assert(path.basename(profile).startsWith('matrix-passive-reader-'));fs.rmSync(profile,{recursive:true});assert(!fs.existsSync(profile));console.log(JSON.stringify({fixtureProfileRemoved:true}));}
 const proof=(r.stdout||'').split(/\r?\n/).map(line=>{try{return JSON.parse(line);}catch{return null;}}).find(value=>value?.realSandboxedRenderer===true&&value?.nativeActivityMeasured===true);
 if(r.status!==0||!proof?.passed){console.error('Native reader did not provide a successful activity measurement');process.exitCode=r.status||1;}
}else{
 const {app,BrowserWindow,session}=require('electron');assert.equal(process.argv[2],'--fixture-profile');const profile=process.argv[3];
 assert.equal(path.dirname(fs.realpathSync(profile)),fs.realpathSync(os.tmpdir()));assert(path.basename(profile).startsWith('matrix-passive-reader-'));app.setPath('userData',profile);app.commandLine.appendSwitch('mute-audio');app.on('window-all-closed',()=>{});
 let moduleRoot=root;if(process.argv[4]){assert.equal(process.argv[4],'--packaged');moduleRoot=process.argv[5];assert.equal(require('node:crypto').createHash('sha256').update(require('original-fs').readFileSync(moduleRoot)).digest('hex'),process.argv[6]);}
 app.whenReady().then(async()=>{let reader,checks=0,requests=0;const pages=[],pending=[];const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
  try{const {createBrowserReader,endpoints}=require(path.join(moduleRoot,'desktop/douyin-browser-reader.cjs')),source=session.fromPartition('synthetic-passive-reader'),own='9007199254740993';
   source.protocol.handle('https',async req=>{const url=new URL(req.url);assert.equal(url.origin,'https://www.douyin.com');assert.equal(req.method,'GET');
    if(url.pathname==='/user/self')return new Response('<!doctype html><body style="height:3000px"><div id="anchor">saved-row</div><script>window.qaCursor="saved-offset-42";window.qaAnchor=document.getElementById("anchor");window.qaFrames=0;window.qaTimers=0;function frame(){window.qaFrames++;requestAnimationFrame(frame)}requestAnimationFrame(frame);setInterval(()=>window.qaTimers++,25);scrollTo(0,120);</script></body>',{headers:{'content-type':'text/html'}});
    assert.equal(url.pathname,endpoints.self);requests++;if(pending.length)await pending.shift();return Response.json({status_code:0,user:{uid:own,unique_id:'qa-passive',sec_uid:'MS4wQaPassive'}});
   });
   await source.cookies.set({url:'https://www.douyin.com/',name:'sessionid',value:'synthetic-only',secure:true});
   reader=createBrowserReader({timeoutMs:5000,createWindow:s=>{eq(s,source);const win=new BrowserWindow({show:false,webPreferences:{session:s,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});pages.push(win);return win;}});
   const options={accountSession:source,publicHandle:'qa-passive',assertCurrent:async()=>{},suspendIdleIdentity:true};
   let c=await reader.acquire(options);const win=pages[0];eq(c.ownUid,own);eq(win.webContents.getBackgroundThrottling(),true);eq(requests,1);
   const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
   const state=()=>win.webContents.executeJavaScript('({frames:qaFrames,timers:qaTimers,cursor:qaCursor,scroll:scrollY,anchor:qaAnchor===document.getElementById("anchor"),visibility:document.visibilityState})');
   const measurements=[];
   const measure=async(name,ms,active)=>{await wait(150);const before=await state();await wait(ms);const after=await state();const row={name,frames:after.frames-before.frames,timers:after.timers-before.timers,visibility:after.visibility};measurements.push(row);console.log(JSON.stringify({activitySample:row}));
    eq(win.isVisible(),false);eq(after.cursor,'saved-offset-42');eq(after.scroll,120);eq(after.anchor,true);
    if(active){assert(row.frames>=2,'Active collector animation did not resume');assert(row.timers>=2,'Active collector timers did not resume');}
    else{assert(row.frames<=2,'Idle hidden collector still paints');assert(row.timers<=4,'Idle hidden collector timers are not throttled');eq(after.visibility,'hidden');}checks+=2;
   };
   await measure('initial-idle',1200,false);
   let release;pending.push(new Promise(resolve=>{release=resolve;}));const checking=c.verify();
   for(let n=0;requests<2&&n<100;n++)await new Promise(resolve=>setTimeout(resolve,10));eq(requests,2);eq(win.webContents.getBackgroundThrottling(),false);
   await measure('pending-owner-read',500,true);
   release();await checking;eq(win.webContents.getBackgroundThrottling(),true);eq(await win.webContents.executeJavaScript('window.qaCursor'),'saved-offset-42');c.close();eq(win.isDestroyed(),false);
   await measure('read-finished',1200,false);
   c=await reader.acquire({...options,suspendIdleIdentity:false});eq(pages.length,1);eq(win.webContents.getBackgroundThrottling(),false);eq(await win.webContents.executeJavaScript('window.qaCursor'),'saved-offset-42');
   await measure('ordinary-lease',500,true);c.close();eq(win.webContents.getBackgroundThrottling(),true);
   await measure('lease-closed',1200,false);
   console.log(JSON.stringify({passed:true,checks,realSandboxedRenderer:true,nativeActivityMeasured:true,measurements,packaged:moduleRoot!==root,profileAndCursorRetained:true,realPlatformRequests:0,sends:0}));
  }catch(error){console.error(error);process.exitCode=1;}finally{reader?.close();for(const win of pages)if(!win.isDestroyed())win.destroy();app.quit();}
 });
}
