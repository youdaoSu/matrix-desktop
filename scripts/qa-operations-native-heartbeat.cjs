const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{Worker}=require('node:worker_threads');
const {registerAccountOperations}=require('../desktop/account-operations.cjs'),{cipher,hash}=require('../desktop/account-operations-crypto.cjs');
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yx-native-heartbeat-')),key=crypto.randomBytes(32),codec=cipher(key,'synthetic'),owner=crypto.randomUUID(),workspaceId=crypto.randomUUID(),handlers=new Map(),messages=[];
 let tick,host,throttling=true,checks=0,workerStarts=0,exited=0,actions=0,elapsed=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
 const sender={isDestroyed:()=>false,getBackgroundThrottling:()=>throttling,setBackgroundThrottling:value=>{throttling=value;},send:(...args)=>messages.push(args)};
 const originalInterval=global.setInterval,originalNow=Date.now;
 try{
  global.setInterval=(fn,ms)=>{eq(ms,5000);tick=fn;return{unref(){}};};
  host=registerAccountOperations({monotonicNow:()=>elapsed,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},getWindow:()=>({webContents:sender,isDestroyed:()=>false}),authenticate:async token=>{assert.equal(token,'synthetic');return{userId:owner};},safeStorage:{isEncryptionAvailable:()=>true,encryptString:codec.protect,decryptString:codec.unprotect},userData:directory,getInbox:()=>{actions++;throw Error('No platform');},getInteractions:()=>{actions++;throw Error('No platform');},workerFactory:(file,options)=>{workerStarts++;const worker=new Worker(file,options);worker.on('exit',()=>{exited++;});return worker;}});
  global.setInterval=originalInterval;
  const call=(command,mode)=>handlers.get('matrix:account-operations')({sender},{command,accessToken:'synthetic',workspaceId,accountIds:[],...(mode?{args:{heartbeatMode:mode}}:{})});
  eq((await call('configure')).result,true);eq(throttling,false);tick();eq(messages.length,0);
  eq((await call('configure','main-event')).result,true);eq(throttling,true);tick();eq(messages,[['matrix:account-operations-heartbeat',workspaceId]]);tick();eq(messages.length,1);
  eq((await call('configure','renderer-timer')).result,true);eq(throttling,false);eq((await call('configure','main-event')).result,true);eq(throttling,true);
  assert.match((await call('configure','invalid')).error,/心跳模式无效/);checks++;eq(throttling,true);eq(workerStarts,1);
  const keyPath=path.join(directory,'account-operations',hash(owner),'key.bin'),protectedKey=fs.readFileSync(keyPath);
  // A notification is not an acknowledgement: silence still expires the host.
  elapsed+=46000;tick();
  const deadline=originalNow()+5000;while(!exited&&originalNow()<deadline)await new Promise(resolve=>setTimeout(resolve,10));eq(exited,1);eq(throttling,true);
  eq((await call('configure','main-event')).result,true);eq(workerStarts,2);eq(throttling,true);eq(fs.readFileSync(keyPath),protectedKey);eq((await call('heartbeat')).result,true);
  await host.close();host=undefined;eq(exited,2);eq(throttling,true);eq(actions,0);
  console.log(JSON.stringify({passed:true,checks,realNativeWorkers:true,notificationsDoNotExtend45SecondLease:true,legacyModeRetained:true,normalRestartPreservesKey:true,realPlatformActions:0}));
 }finally{global.setInterval=originalInterval;Date.now=originalNow;await host?.close();key.fill(0);assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('yx-native-heartbeat-'));fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
