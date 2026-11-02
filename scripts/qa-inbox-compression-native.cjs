// Actual Electron safeStorage on a fresh synthetic profile. No user data/network.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
if(!process.versions.electron){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const result=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename,...process.argv.slice(2)],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:90000});
 process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');let report;try{report=JSON.parse((result.stdout||'').trim().split(/\r?\n/).at(-1));}catch{}
 process.exitCode=result.status===0&&report?.nativeDpapi&&report?.checks>=8?0:1;
}else{
 const {app,safeStorage}=require('electron'),fixture=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-inbox-compression-'));
 app.setPath('userData',path.join(fixture,'profile'));app.disableHardwareAcceleration();
 const timer=setTimeout(()=>app.exit(1),80000);
 app.whenReady().then(async()=>{
  const selected=process.argv.find(arg=>arg.startsWith('--store-module='))?.slice(15)||path.join(root,'desktop/douyin-inbox-store.cjs');
  const {createStore}=require(selected);let checks=0,measure=false,protections=[];
  const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},directory=path.join(fixture,'archive');
  assert(safeStorage.isEncryptionAvailable());checks++;
  const config={directory,scope:['synthetic-compression'],asyncEngine:true,protect:text=>{const started=performance.now(),bytes=safeStorage.encryptString(text);if(measure)protections.push({ms:performance.now()-started,plainBytes:Buffer.byteLength(text),encryptedBytes:bytes.length});return bytes;},unprotect:bytes=>safeStorage.decryptString(bytes)};
  const store=createStore(config);
  store.commit(next=>{for(let t=0;t<100;t++)next.threads['t'+t]={id:'t'+t,type:2,history:{cursor:'0',pages:1,done:true}};for(let n=0;n<42000;n++){const threadId='t'+(n%100),id=String(n+1);next.messages[threadId+'/'+id]={id,threadId,index:id,version:'1',rawContent:JSON.stringify({text:'Synthetic repeated metadata. '.repeat(14)+n}),sender:String(1000+n%100),messageType:7,status:0};}});
  const before=store.get(),file=path.join(directory,fs.readdirSync(directory).find(name=>name.endsWith('.bin'))),oldBytes=fs.statSync(file).size;
  eq(createStore(config).get().revision,1);let ticks=0,maxGap=0,last=performance.now();
  const heartbeat=setInterval(()=>{const at=performance.now();maxGap=Math.max(maxGap,at-last);last=at;ticks++;},16),started=performance.now();measure=true;
  try{for(let n=0;n<4;n++)await store.commitEngineAsync(next=>{next.frontier.test=[{value:String(n)}];},['frontier']);}finally{clearInterval(heartbeat);measure=false;}
  const elapsed=performance.now()-started,stored=fs.readFileSync(file),reopened=createStore(config).get();
  eq(reopened.frontier.test[0].value,'3');eq(Object.keys(reopened.messages).length,42000);eq(reopened.messages['t99/42000'].rawContent,before.messages['t99/42000'].rawContent);eq(reopened.revision,5);eq(store.get().messages===before.messages,true);eq(stored.includes(Buffer.from('Synthetic repeated metadata.')),false);eq(protections.length,4);
  const compressed=safeStorage.decryptString(stored).startsWith('YXINBOX-GZIP-1\n');if(process.argv.includes('--verify-compressed'))eq(compressed,true);
  console.log(JSON.stringify({checks,nativeDpapi:true,syntheticMessages:42000,legacyFileBytes:oldBytes,currentFileBytes:stored.length,compressed,saveWallMs:elapsed,heartbeatTicks:ticks,maxHeartbeatGapMs:maxGap,protections,realProfileTouched:false,realRequests:0}));
 }).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(timer);if(path.dirname(fs.realpathSync(fixture))!==fs.realpathSync(os.tmpdir()))throw Error('Unexpected fixture boundary');const archive=path.join(fixture,'archive');if(fs.existsSync(archive)){for(const file of fs.readdirSync(archive)){const target=path.join(archive,file);if(!/^[a-f0-9]{64}\.bin$/.test(file)||!fs.lstatSync(target).isFile())throw Error('Unexpected synthetic archive file');fs.unlinkSync(target);}fs.rmdirSync(archive);}app.quit();});
}
