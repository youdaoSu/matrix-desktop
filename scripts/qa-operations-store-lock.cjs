const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {AtomicThreadLock}=require('../desktop/account-operations-store-lock.cjs');
if(!isMainThread){
 const original=fs.linkSync;
 fs.linkSync=function(from,to){const result=original.call(fs,from,to);if(to===path.join(workerData.directory,'.interactions.lock')){parentPort.postMessage({owner:JSON.parse(fs.readFileSync(to,'utf8'))});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);}return result;};
 new AtomicThreadLock(workerData.directory,{leaseId:workerData.leaseId}).run(()=>{throw Error('Fault boundary should precede action');});
}else(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yx-atomic-lock-'));let worker,checks=0;
 const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},file=path.join(directory,'.interactions.lock');
 try{
  const lock=new AtomicThreadLock(directory,{leaseId:randomUUID()});eq(lock.run(()=>42),42);eq(fs.existsSync(file),false);
  assert.throws(()=>lock.run(()=>{throw Error('synthetic action failure');}),/synthetic action failure/);checks++;eq(fs.existsSync(file),false);
  fs.writeFileSync(file,JSON.stringify({pid:process.pid,token:randomUUID()}));const before=fs.readFileSync(file);
  assert.throws(()=>lock.run(()=>{throw Error('must not enter');}),/still owned/);checks++;eq(fs.readFileSync(file),before);fs.unlinkSync(file);
  fs.writeFileSync(file,'');assert.throws(()=>lock.run(()=>{}),/Incomplete legacy/);checks++;eq(fs.statSync(file).size,0);fs.unlinkSync(file);
  worker=new Worker(__filename,{workerData:{directory,leaseId:randomUUID()}});const startedThreadId=worker.threadId;
  const observed=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Worker publication timeout')),5000);worker.once('error',error=>{clearTimeout(timer);reject(error);});worker.once('message',value=>{clearTimeout(timer);resolve(value.owner);});});
  eq(observed.threadId,startedThreadId);eq(observed.pid,process.pid);eq(observed.version,2);
  assert.throws(()=>lock.run(()=>{}),/still owned/);checks++;
  await worker.terminate();eq(JSON.parse(fs.readFileSync(file,'utf8')),observed);
  const wrong=new AtomicThreadLock(directory,{leaseId:randomUUID(),retiredOwners:[{...observed,leaseId:randomUUID()}]});assert.throws(()=>wrong.run(()=>{}),/still owned/);checks++;
  const recovered=new AtomicThreadLock(directory,{leaseId:randomUUID(),retiredOwners:[observed]});eq(recovered.run(()=>73),73);eq(fs.existsSync(file),false);
  // Windows userData may legitimately pass through a parent directory junction.
  const original=path.join(directory,'original'),alias=path.join(directory,'alias');fs.mkdirSync(original);fs.mkdirSync(path.join(original,'owner'));
  fs.symlinkSync(original,alias,process.platform==='win32'?'junction':'dir');
  try{
   const throughParent=new AtomicThreadLock(path.join(alias,'owner'),{leaseId:randomUUID()});eq(throughParent.run(()=>91),91);eq(throughParent.directory,fs.realpathSync(path.join(original,'owner')));
   assert.throws(()=>new AtomicThreadLock(alias,{leaseId:randomUUID()}),/Unsafe lock directory/);checks++;
  }finally{assert(fs.lstatSync(alias).isSymbolicLink());fs.unlinkSync(alias);}
  const report={passed:true,checks,confirmedWorkerExitRequired:true,completeOwnerPublishedAtomically:true,activeAndUnidentifiedLocksPreserved:true,realPlatformActions:0};
  console.log(JSON.stringify(report));
 }finally{if(worker)await worker.terminate();assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('yx-atomic-lock-'));fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
