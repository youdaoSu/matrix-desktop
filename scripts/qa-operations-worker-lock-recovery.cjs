// Deterministic crash boundary in a disposable worker, encrypted store and IPC.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
if(!isMainThread){
 const flag=new Int32Array(workerData.faultFlag),original=fs.linkSync;
 fs.linkSync=function(from,to){const result=original.call(fs,from,to);if(path.basename(to)==='.interactions.lock'&&Atomics.compareExchange(flag,0,1,2)===1){parentPort.postMessage({type:'fixture-lock-held',owner:JSON.parse(fs.readFileSync(to,'utf8'))});Atomics.wait(flag,0,2);}return result;};
 require(workerData.fixtureEntry);
}else(async()=>{
 const {registerAccountOperations}=require('../desktop/account-operations.cjs'),{cipher,hash}=require('../desktop/account-operations-crypto.cjs');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yx-store-recovery-')),owner=crypto.randomUUID(),workspaceId=crypto.randomUUID(),codec=cipher(crypto.randomBytes(32),'fixture-only');
 const account={id:crypto.randomUUID(),platform:'douyin',nickname:'synthetic',connectorSessionId:crypto.randomUUID(),nativeAccountKey:'synthetic'},sender={},handlers=new Map(),workers=[],flag=new Int32Array(new SharedArrayBuffer(4));
 let host,heldResolve,heldReject,checks=0,platformActions=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
 const api=(command,args)=>handlers.get('matrix:account-operations')({sender},{command,args,accountIds:[account.id],accessToken:'fixture',workspaceId});
 const observe=id=>host.observe({userId:owner,account,ownUid:'100',records:[{platformId:id,workId:'777777777777777777',platformUserId:'200',author:'synthetic',content:'synthetic event',displayTime:new Date(Date.now()+50).toISOString()}]});
 const count=async n=>{const deadline=Date.now()+5000;let state;do{state=await api('snapshot');eq(state.error,undefined);if(state.result.totalMessages===n)return state.result;await new Promise(resolve=>setTimeout(resolve,20));}while(Date.now()<deadline);throw Error('Message count did not converge');};
 try{
  host=registerAccountOperations({workerFactory:(file,options)=>{
   const worker=new Worker(__filename,{...options,workerData:{...options.workerData,fixtureEntry:file,faultFlag:flag.buffer}});workers.push(worker);
   worker.on('message',value=>{if(value.type==='fixture-lock-held')heldResolve?.(value.owner);});worker.on('error',error=>heldReject?.(error));return worker;
  },ipcMain:{handle:(name,handler)=>handlers.set(name,handler)},getWindow:()=>({webContents:sender,isDestroyed:()=>false}),authenticate:async(token,id)=>{assert.equal(token,'fixture');return{userId:owner,...(id?{account}:{})};},safeStorage:{isEncryptionAvailable:()=>true,encryptString:codec.protect,decryptString:codec.unprotect},userData:directory,getInbox:()=>{platformActions++;throw Error('No real inbox');},getInteractions:()=>{platformActions++;throw Error('No real platform');}});
  eq((await api('configure')).result,true);observe('888888888888888881');await count(1);
  const archive=path.join(directory,'account-operations',hash(owner),'interactions.bin'),digest=()=>crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  const before=digest(),thread=workers[0].threadId;
  let timer;const held=new Promise((resolve,reject)=>{heldResolve=resolve;heldReject=reject;timer=setTimeout(()=>reject(Error('Crash boundary not reached')),5000);});
  Atomics.store(flag,0,1);observe('888888888888888882');let proof;try{proof=await held;}finally{clearTimeout(timer);heldResolve=heldReject=undefined;}
  eq(proof.version,2);eq(proof.pid,process.pid);eq(proof.threadId,thread);
  await workers[0].terminate();eq(digest(),before);
  const heartbeat=await api('heartbeat');assert.match(heartbeat.error,/重新配置/);checks++;
  eq(workers.length,2);eq((await api('configure')).result,true);eq((await api('heartbeat')).result,true);
  let state=await count(1);eq(state.accounts.length,1);eq(state.counts.sent,0);
  // Recovery preserves accepted data and does not replay the interrupted event.
  observe('888888888888888883');state=await count(2);eq(state.counts.sent,0);eq(platformActions,0);
  await host.close();host=undefined;
  eq(fs.existsSync(path.join(path.dirname(archive),'.interactions.lock')),false);
  console.log(JSON.stringify({passed:true,checks,actualMainAndEncryptedWorker:true,midTransactionBoundaryRecovery:true,priorArchivePreserved:true,noAutomaticReplay:true,realPlatformActions:0}));
 }finally{Atomics.store(flag,0,0);Atomics.notify(flag,0);await host?.close();for(const worker of workers)await worker.terminate();eq(platformActions,0);assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('yx-store-recovery-'));fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
