// Disposable Electron safeStorage + actual Node worker. All accounts/traffic
// are synthetic. Optional packaged mode verifies a supplied archive digest.
const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const result=require('node:child_process').spawnSync(require('./qa-operations-paths.cjs').electron,[__filename,...process.argv.slice(2)],{encoding:'utf8',windowsHide:true,env,timeout:90000});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status??1);}
else{
 const {app,BrowserWindow,safeStorage,session}=require('electron'),os=require('node:os'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-ops-native-'));
 app.setPath('userData',temporary);app.disableHardwareAcceleration();app.commandLine.appendSwitch('mute-audio');let moduleRoot=root;
 if(process.argv[2]){assert.equal(process.argv[2],'--packaged');moduleRoot=path.resolve(process.argv[3]);assert.equal(path.basename(moduleRoot),'app.asar');assert.match(process.argv[4]||'',/^[a-f0-9]{64}$/);assert.equal(crypto.createHash('sha256').update(require('original-fs').readFileSync(moduleRoot)).digest('hex'),process.argv[4]);}
 const deadline=setTimeout(()=>{console.error('Isolated native operations fixture timed out');app.exit(1);},75000);
 app.whenReady().then(async()=>{let service,win,timer;try{
  session.defaultSession.webRequest.onBeforeRequest((_request,done)=>done({cancel:true}));win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const handlers=new Map(),userId=crypto.randomUUID(),account={id:crypto.randomUUID(),platform:'douyin',nickname:'原生隔离账号',connectorSessionId:crypto.randomUUID(),nativeAccountKey:'native-qa-account'};let workspaceId=crypto.randomUUID(),sends=0,checks=0;
  const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
  const sender=win.webContents,options={ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},getWindow:()=>win,authenticate:async(token,id)=>{eq(token,'qa-native-token');if(id){eq(id,account.id);return {userId,account};}return {userId};},safeStorage,userData:temporary,getInbox:()=>{sends++;throw Error('This fixture prohibits sends');},getInteractions:()=>{sends++;throw Error('This fixture prohibits writes');}};
  const {registerAccountOperations}=require(path.join(moduleRoot,'desktop/account-operations.cjs'));
  const call=async(command,args,accountIds)=>{const result=await handlers.get('matrix:account-operations')({sender},{command,args,accountIds,accessToken:'qa-native-token',workspaceId});if(result.error)throw Error(result.error);return result.result;};
  service=registerAccountOperations(options);await call('configure',undefined,[account.id]);let state=await call('snapshot');eq(state.accounts.length,1);eq(state.counts.sent,0);
  const intervals=[];let last=performance.now();timer=setInterval(()=>{const now=performance.now();intervals.push(now-last);last=now;},5);
  const a=state.accounts[0];for(let n=0;n<20;n++)await call('save-rule',{name:'原生加密合成规则'+n,platform:'douyin',accountIds:[a.id],channel:'dm',match:'contains',keywords:['原生加密测试'+n],replyText:'仅为隔离测试，不会实发'});
  clearInterval(timer);timer=undefined;state=await call('snapshot');eq(state.rules.length,20);eq(sends,0);assert.ok(intervals.length>0);checks++;
  await service.close();workspaceId=crypto.randomUUID();service=registerAccountOperations(options);await call('configure',undefined,[account.id]);state=await call('snapshot');eq(state.rules.length,20);eq(state.settings.modes.length,0);eq(sends,0);
  const directory=path.join(temporary,'account-operations',crypto.createHash('sha256').update(userId).digest('hex')),file=path.join(directory,'interactions.bin'),keyFile=path.join(directory,'key.bin'),bytes=fs.readFileSync(file),keyBytes=fs.readFileSync(keyFile);
  assert.ok(!bytes.includes(Buffer.from('原生加密合成规则')));assert.ok(!keyBytes.includes(Buffer.from('key')));checks+=2;
  await service.close();const modified=Buffer.from(bytes);modified[modified.length-1]^=1;fs.writeFileSync(file,modified);workspaceId=crypto.randomUUID();service=registerAccountOperations(options);await assert.rejects(()=>call('configure',undefined,[account.id]),/后台|互动|读取/);eq(fs.readFileSync(file),modified);eq(fs.readFileSync(keyFile),keyBytes);eq(sends,0);
  console.log(JSON.stringify({ok:true,checks,electron:process.versions.electron,workerNode:process.versions.node,actualSafeStorage:true,encryptedRestart:true,corruptionPreserved:true,mainIntervalP95Ms:Math.round(intervals.sort((a,b)=>a-b)[Math.floor(intervals.length*.95)]),packaged:moduleRoot!==root,realProfileAccessed:false,realPlatformActions:sends}));
 }catch(error){console.error(error);process.exitCode=1;}finally{clearTimeout(deadline);clearInterval(timer);await service?.close();win?.destroy();app.exit(process.exitCode||0);}});
}
