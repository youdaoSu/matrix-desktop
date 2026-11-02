// Actual main IPC and disposable Node workers; synthetic encrypted data only.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{Worker}=require('node:worker_threads');
const {registerAccountOperations}=require('../desktop/account-operations.cjs'),{cipher,hash}=require('../desktop/account-operations-crypto.cjs');
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yx-startup-failure-')),owner=crypto.randomUUID(),workspaceId=crypto.randomUUID(),codecKey=crypto.randomBytes(32),codec=cipher(codecKey,'synthetic'),sender={},handlers=new Map();
 let host,worker,mode='unresponsive',platformActions=0,timer,checks=0;
 const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},noPlatform=()=>{platformActions++;throw Error('No platform actions');};
 const sources={unresponsive:"require('node:worker_threads').parentPort.on('message',()=>{});",error:"throw new Error('Synthetic worker startup error');",exit:"require('node:worker_threads').parentPort.close();"};
 try{
  host=registerAccountOperations({ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},getWindow:()=>({webContents:sender,isDestroyed:()=>false}),authenticate:async()=>({userId:owner}),safeStorage:{isEncryptionAvailable:()=>true,encryptString:codec.protect,decryptString:codec.unprotect},userData:directory,getInbox:noPlatform,getInteractions:noPlatform,workerFactory:(file,options)=>worker=mode==='normal'?new Worker(file,options):new Worker(sources[mode],{eval:true})});
  const api=command=>handlers.get('matrix:account-operations')({sender},{command,accessToken:'synthetic',workspaceId,accountIds:[]});
  const started=performance.now();const result=await Promise.race([api('configure'),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Startup failure did not settle in its bounded window')),13000))]);clearTimeout(timer);timer=undefined;
  const elapsed=performance.now()-started;eq(result.error,'互动后台启动超时');eq(worker.threadId,-1);assert(elapsed>=9500&&elapsed<13000);checks++;
  const keyFile=path.join(directory,'account-operations',hash(owner),'key.bin'),durableKey=fs.readFileSync(keyFile);
  for(const next of ['error','exit']){
   mode=next;const at=performance.now(),failed=await api('configure');assert.match(failed.error,/互动后台启动失败/);checks++;assert(performance.now()-at<5000);checks++;eq(worker.threadId,-1);eq(fs.readFileSync(keyFile),durableKey);
  }
  mode='normal';eq((await api('configure')).result,true);eq(fs.readFileSync(keyFile),durableKey);eq((await api('snapshot')).result.totalMessages,0);await host.close();host=undefined;eq(worker.threadId,-1);eq(platformActions,0);
  console.log(JSON.stringify({passed:true,checks,startupFailureMs:elapsed,unresponsiveFixtureWorkerClosed:true,earlyErrorAndExitClosed:true,reconfigurePreservedKey:true,normalReopenedWorkerClosed:true,realPlatformActions:0,actualApplicationTouched:false}));
 }finally{if(timer)clearTimeout(timer);if(worker&&worker.threadId>0)await worker.terminate();await host?.close();codecKey.fill(0);assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('yx-startup-failure-'));fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
