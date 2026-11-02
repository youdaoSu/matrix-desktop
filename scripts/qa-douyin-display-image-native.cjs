// Two normal Electron processes, one fresh QA profile, actual DPAPI and raster
// decoding only. No app backend, user profile, platform account or network.
const path=require('node:path'),root=path.resolve(__dirname,'..');require('./qa-console-pipe.cjs').guardQaConsolePipes();
if(!process.versions.electron){
 const fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-display-native-qa-'));
 try{for(const phase of ['write','read']){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const result=spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename,phase,directory,...process.argv.slice(2)],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:30000});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');assert.equal(result.status,0,'Native image phase failed');assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'qa-'+phase+'.json'),'utf8')).status,'passed');}console.log(JSON.stringify({nativeDisplayCacheProcesses:2,actualDpapiAcrossRestart:true,normalShutdown:true,actualRasterFormats:4,realPlatformRequests:0,realUserDataTouched:false}));}
 finally{assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(directory).startsWith('matrix-display-native-qa-'));fs.rmSync(directory,{recursive:true});}
}else{
 const{app,BrowserWindow,safeStorage}=require('electron'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
 const phase=process.argv[2],directory=fs.realpathSync(process.argv[3]);assert.ok(['write','read'].includes(phase));assert.equal(path.dirname(directory),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(directory).startsWith('matrix-display-native-qa-'));app.setPath('userData',path.join(directory,'chromium'));
 let moduleRoot=root;if(process.argv[4]==='--packaged'){moduleRoot=path.join(root,'release-next/win-unpacked/resources/app.asar');assert.match(process.argv[5]||'',/^[a-f0-9]{64}$/);assert.equal(crypto.createHash('sha256').update(require('original-fs').readFileSync(moduleRoot)).digest('hex'),process.argv[5]);}
 app.whenReady().then(async()=>{let win;try{
  assert.equal(safeStorage.isEncryptionAvailable(),true);const {createSecureDisplayImageCache}=require(path.join(moduleRoot,'desktop/douyin-display-image-cache.cjs')),cache=createSecureDisplayImageCache({directory:path.join(directory,'images'),safeStorage}),fingerprint=format=>crypto.createHash('sha256').update(format).digest('hex');
  win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});win.webContents.session.webRequest.onBeforeRequest((request,done)=>done({cancel:!request.url.startsWith('data:')}));
  await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; script-src \'none\'"><main></main>'));
  let checks=0;
  if(phase==='write'){
   const samples=await win.webContents.executeJavaScript(`(()=>{const c=document.createElement('canvas');c.width=2;c.height=2;const x=c.getContext('2d');x.fillStyle='#ff6600';x.fillRect(0,0,2,2);return{png:c.toDataURL('image/png'),jpeg:c.toDataURL('image/jpeg'),webp:c.toDataURL('image/webp'),gif:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'};})()`);
   for(const [format,dataUrl]of Object.entries(samples)){assert.ok(dataUrl.startsWith('data:image/'+format+';'));const bytes=Buffer.from(dataUrl.split(',')[1],'base64').length;assert.equal((await cache.putAsync('qa-owner-binding',fingerprint(format),{dataUrl,bytes})).stored,true);checks+=2;}
   for(const name of fs.readdirSync(path.join(directory,'images'))){const bytes=fs.readFileSync(path.join(directory,'images',name));assert.equal(bytes.includes(Buffer.from('data:image/')),false);checks++;}
  }else{
   const values=[];for(const format of ['png','jpeg','webp','gif']){const saved=await cache.getAsync('qa-owner-binding',fingerprint(format));assert.ok(saved?.dataUrl.startsWith('data:image/'+format+';'));assert.equal(await cache.getAsync('qa-other-owner',fingerprint(format)),undefined);values.push(saved.dataUrl);checks+=2;}
   const decoded=await win.webContents.executeJavaScript(`Promise.all(${JSON.stringify(values)}.map(src=>new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image.naturalWidth>0&&image.naturalHeight>0);image.onerror=()=>resolve(false);image.src=src;})))`);assert.deepEqual(decoded,[true,true,true,true]);checks+=4;
  }
  fs.writeFileSync(path.join(directory,'qa-'+phase+'.json'),JSON.stringify({status:'passed',phase,checks}));console.log(JSON.stringify({nativeDisplayCachePhase:phase,checks,dpapi:true,externalNetworkBlocked:true,realUserProfileTouched:false}));
 }catch(error){console.error(error);process.exitCode=1;}finally{win?.close();app.quit();}});
}
