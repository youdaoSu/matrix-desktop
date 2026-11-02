// Deterministic crash boundary in a disposable worker, encrypted store and IPC.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
if(!isMainThread){
 const flag=new Int32Array(workerData.faultFlag),fds=new Set(),phase=workerData.faultPhase;
 const stop=stage=>{if(phase!==stage||Atomics.compareExchange(flag,0,1,2)!==1)return;parentPort.postMessage({type:'fixture-lock-held',owner:JSON.parse(fs.readFileSync(path.join(workerData.directory,'.interactions.lock'),'utf8'))});Atomics.wait(flag,0,2);};
 const open=fs.openSync,close=fs.closeSync,write=fs.writeFileSync,sync=fs.fsyncSync,rename=fs.renameSync,link=fs.linkSync;
 fs.openSync=function(file,...args){const fd=open.call(fs,file,...args);if(typeof file==='string'&&path.basename(file).startsWith('.interactions-state-v1-'))fds.add(fd);return fd;};
 fs.closeSync=function(fd){fds.delete(fd);return close.call(fs,fd);};
 fs.writeFileSync=function(fd,...args){if(fds.has(fd))stop('state-before-write');return write.call(fs,fd,...args);};
 fs.fsyncSync=function(fd){const result=sync.call(fs,fd);if(fds.has(fd))stop('state-after-fsync');return result;};
 fs.renameSync=function(from,to){const target=path.basename(to)==='interactions.bin'&&path.basename(from).startsWith('.interactions-state-v1-');if(target)stop('state-before-rename');const result=rename.call(fs,from,to);if(target)stop('state-after-rename');return result;};
 fs.linkSync=function(from,to){
  const target=path.basename(to)==='.interactions.lock';
  if(target&&phase==='lock-before-publish'&&Atomics.compareExchange(flag,0,1,2)===1){parentPort.postMessage({type:'fixture-lock-held',owner:JSON.parse(fs.readFileSync(from,'utf8'))});Atomics.wait(flag,0,2);}
  const result=link.call(fs,from,to);if(target)stop('lock-after-publish');return result;
 };
 require(workerData.fixtureEntry);
}else(async()=>{
 const phases=['lock-before-publish','lock-after-publish','state-before-write','state-after-fsync','state-before-rename','state-after-rename'];
 const phase=process.argv[2];
 if(!phase){const {spawnSync}=require('node:child_process'),results=[];for(const item of phases){const child=spawnSync(process.execPath,[__filename,item],{encoding:'utf8',timeout:20000,windowsHide:true});assert.equal(child.status,0,child.stderr+child.stdout);const row=JSON.parse(child.stdout.trim());assert.equal(row.passed,true);results.push(row);}console.log(JSON.stringify({passed:true,phases:results,realPlatformActions:0}));return;}
 assert(phases.includes(phase));
 const {registerAccountOperations}=require('../desktop/account-operations.cjs'),{cipher,hash}=require('../desktop/account-operations-crypto.cjs');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yx-store-recovery-')),owner=crypto.randomUUID(),workspaceId=crypto.randomUUID(),codec=cipher(crypto.randomBytes(32),'fixture-only');
 const account={id:crypto.randomUUID(),platform:'douyin',nickname:'synthetic',connectorSessionId:crypto.randomUUID(),nativeAccountKey:'synthetic'},sender={},handlers=new Map(),workers=[],flag=new Int32Array(new SharedArrayBuffer(4));
 let host,heldResolve,heldReject,checks=0,platformActions=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
 const api=(command,args)=>handlers.get('matrix:account-operations')({sender},{command,args,accountIds:[account.id],accessToken:'fixture',workspaceId});
 const observe=id=>host.observe({userId:owner,account,ownUid:'100',records:[{platformId:id,workId:'777777777777777777',platformUserId:'200',author:'synthetic',content:'synthetic event',displayTime:new Date(Date.now()+50).toISOString()}]});
 const count=async n=>{const deadline=Date.now()+5000;let state;do{state=await api('snapshot');eq(state.error,undefined);if(state.result.totalMessages===n)return state.result;await new Promise(resolve=>setTimeout(resolve,20));}while(Date.now()<deadline);throw Error('Message count did not converge');};
 try{
  host=registerAccountOperations({workerFactory:(file,options)=>{
   const worker=new Worker(__filename,{...options,workerData:{...options.workerData,fixtureEntry:file,faultFlag:flag.buffer,faultPhase:phase}});workers.push(worker);
   worker.on('message',value=>{if(value.type==='fixture-lock-held')heldResolve?.(value.owner);});worker.on('error',error=>heldReject?.(error));return worker;
  },ipcMain:{handle:(name,handler)=>handlers.set(name,handler)},getWindow:()=>({webContents:sender,isDestroyed:()=>false}),authenticate:async(token,id)=>{assert.equal(token,'fixture');return{userId:owner,...(id?{account}:{})};},safeStorage:{isEncryptionAvailable:()=>true,encryptString:codec.protect,decryptString:codec.unprotect},userData:directory,getInbox:()=>{platformActions++;throw Error('No real inbox');},getInteractions:()=>{platformActions++;throw Error('No real platform');}});
  eq((await api('configure')).result,true);observe('888888888888888881');await count(1);
  const archive=path.join(directory,'account-operations',hash(owner),'interactions.bin'),digest=()=>crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  const before=digest(),thread=workers[0].threadId;
  const archiveDir=path.dirname(archive),unknown=path.join(archiveDir,'.interactions-legacy-unknown.tmp'),foreign=path.join(archiveDir,`.interactions-state-v1-${process.pid}-${thread}-${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(unknown,'unknown old bytes');fs.writeFileSync(foreign,'unproven lease');
  let timer;const held=new Promise((resolve,reject)=>{heldResolve=resolve;heldReject=reject;timer=setTimeout(()=>reject(Error('Crash boundary not reached')),5000);});
  Atomics.store(flag,0,1);observe('888888888888888882');let proof;try{proof=await held;}finally{clearTimeout(timer);heldResolve=heldReject=undefined;}
  eq(proof.version,2);eq(proof.pid,process.pid);eq(proof.threadId,thread);
  await workers[0].terminate();
  const committed=phase==='state-after-rename';if(!committed)eq(digest(),before);else{assert.notEqual(digest(),before);checks++;}
  const ownScratch=['state','lock'].map(kind=>path.join(archiveDir,`.interactions-${kind}-v1-${proof.pid}-${proof.threadId}-${proof.leaseId}.tmp`));assert(ownScratch.some(file=>fs.existsSync(file)));checks++;
  const heartbeat=await api('heartbeat');assert.match(heartbeat.error,/重新配置/);checks++;
  eq(workers.length,2);eq((await api('configure')).result,true);eq((await api('heartbeat')).result,true);
  for(const file of ownScratch)eq(fs.existsSync(file),false);eq(fs.readFileSync(unknown,'utf8'),'unknown old bytes');eq(fs.readFileSync(foreign,'utf8'),'unproven lease');
  let state=await count(committed?2:1);eq(state.accounts.length,1);eq(state.counts.sent,0);
  // Recovery preserves accepted data and does not replay the interrupted event.
  observe('888888888888888881');state=await count(committed?2:1);
  observe('888888888888888883');state=await count(committed?3:2);eq(state.counts.sent,0);eq(platformActions,0);
  await host.close();host=undefined;
  eq(fs.existsSync(path.join(path.dirname(archive),'.interactions.lock')),false);
  console.log(JSON.stringify({passed:true,phase,checks,retiredScratchRemoved:true,unknownScratchPreserved:true,actualMainAndEncryptedWorker:true,midTransactionBoundaryRecovery:true,priorArchivePreserved:true,noAutomaticReplay:true,realPlatformActions:0}));
 }finally{Atomics.store(flag,0,0);Atomics.notify(flag,0);await host?.close();for(const worker of workers)await worker.terminate();eq(platformActions,0);assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('yx-store-recovery-'));fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
