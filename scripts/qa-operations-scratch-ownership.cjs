// Real encrypted store + confirmed disposable worker exit, no user directories.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {Worker,isMainThread,parentPort,workerData,threadId}=require('node:worker_threads');
const {AtomicThreadLock}=require('../desktop/account-operations-store-lock.cjs');
const {InteractionStore}=require('../desktop/vendor/hengyuan-interactions/src/interaction-store.cjs');
const {cipher}=require('../desktop/account-operations-crypto.cjs');
if(!isMainThread){
 const lock=new AtomicThreadLock(workerData.directory,{leaseId:workerData.leaseId});
 for(const kind of ['state','lock'])fs.writeFileSync(path.join(workerData.directory,lock.scratchName(kind)),'interrupted fixture',{flag:'wx'});
 parentPort.postMessage({pid:process.pid,threadId,leaseId:workerData.leaseId});
}else(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'yx-scratch-ownership-')),directory=path.join(root,'owner');fs.mkdirSync(directory);
 const key=crypto.randomBytes(32),codec=cipher(key,'synthetic'),archive=path.join(directory,'interactions.bin');let worker,checks=0,callbacks=0;
 const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},throws=(fn,re)=>{assert.throws(fn,re);checks++;};
 const create=(retiredOwners=[],extra={})=>{
  const lock=new AtomicThreadLock(directory,{leaseId:crypto.randomUUID(),retiredOwners});
  const store=new InteractionStore(directory,{...codec,getAccount:id=>({id,platform:'douyin',name:'synthetic'}),withLock:action=>lock.run(action),temporaryFileName:lock.scratchName('state'),onValidatedArchive:()=>{callbacks++;return lock.cleanupRetiredScratch();},...extra});return {lock,store};
 };
 try{
  const initial=create();eq(callbacks,0);const logical=initial.store._read();
  const leaseId=crypto.randomUUID();worker=new Worker(__filename,{workerData:{directory,leaseId}});const expectedThread=worker.threadId;
  const exit=new Promise((resolve,reject)=>{worker.once('error',reject);worker.once('exit',code=>{try{eq(code,0);resolve();}catch(error){reject(error);}});});
  const proof=await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});eq(proof,{pid:process.pid,threadId:expectedThread,leaseId});await exit;
  const state=path.join(directory,initial.lock.scratchName('state',proof)),lockFile=path.join(directory,initial.lock.scratchName('lock',proof));
  const unknown=path.join(directory,'.interactions-unidentified.tmp');fs.writeFileSync(unknown,'preserve unknown');
  create();eq(fs.readFileSync(state,'utf8'),'interrupted fixture');eq(fs.readFileSync(lockFile,'utf8'),'interrupted fixture');
  const recovered=create([proof]);eq(fs.existsSync(state),false);eq(fs.existsSync(lockFile),false);eq(recovered.store._read(),logical);eq(fs.readFileSync(unknown,'utf8'),'preserve unknown');
  throws(()=>recovered.lock.cleanupRetiredScratch(),/requires the archive lock/);
  // An existing temporary file is never ours merely because its name matches.
  const ownState=path.join(directory,recovered.lock.scratchName('state'));fs.writeFileSync(ownState,'existing state');let before=fs.readFileSync(archive);
  throws(()=>recovered.lock.run(()=>recovered.store._write(logical)),/EEXIST/);eq(fs.readFileSync(ownState,'utf8'),'existing state');eq(fs.readFileSync(archive),before);fs.unlinkSync(ownState);
  const ownLock=path.join(directory,recovered.lock.scratchName('lock'));fs.writeFileSync(ownLock,'existing lock');throws(()=>recovered.lock.run(()=>0),/EEXIST/);eq(fs.readFileSync(ownLock,'utf8'),'existing lock');fs.unlinkSync(ownLock);
  // Reject aliasing a committed archive through a retired-looking temp name.
  fs.linkSync(archive,state);throws(()=>create([proof]),/additional links/);eq(fs.readFileSync(archive),before);eq(fs.existsSync(state),true);fs.unlinkSync(state);
  fs.writeFileSync(state,'preserve if any candidate is unsafe');fs.mkdirSync(lockFile);throws(()=>create([proof]),/Unsafe lock file/);eq(fs.readFileSync(state,'utf8'),'preserve if any candidate is unsafe');fs.rmdirSync(lockFile);
  const target=path.join(root,'linked-target');fs.mkdirSync(target);fs.symlinkSync(target,lockFile,process.platform==='win32'?'junction':'dir');
  try{throws(()=>create([proof]),/Unsafe lock file/);eq(fs.lstatSync(lockFile).isSymbolicLink(),true);eq(fs.readFileSync(state,'utf8'),'preserve if any candidate is unsafe');}finally{fs.unlinkSync(lockFile);}
  // No cleanup follows failed authentication/validation of committed data.
  const corrupt=Buffer.from(before);corrupt[corrupt.length-1]^=1;fs.writeFileSync(archive,corrupt);const priorCallbacks=callbacks;throws(()=>create([proof]));eq(callbacks,priorCallbacks);eq(fs.readFileSync(state,'utf8'),'preserve if any candidate is unsafe');eq(fs.readFileSync(archive),corrupt);fs.writeFileSync(archive,before);
  const unlink=fs.unlinkSync;try{fs.unlinkSync=function(file){if(file===state)throw Object.assign(Error('synthetic cleanup denied'),{code:'EACCES'});return unlink.call(fs,file);};throws(()=>create([proof]),/synthetic cleanup denied/);eq(fs.readFileSync(archive),before);eq(fs.existsSync(state),true);}finally{fs.unlinkSync=unlink;}
  create([proof]);eq(fs.existsSync(state),false);
  // Missing committed data must not authorize removing the sole temp candidate.
  before=fs.readFileSync(archive);fs.unlinkSync(archive);fs.writeFileSync(state,'uncommitted-only');const absentCallbacks=callbacks;create([proof]);eq(callbacks,absentCallbacks);eq(fs.readFileSync(state,'utf8'),'uncommitted-only');fs.writeFileSync(archive,before);create([proof]);eq(fs.existsSync(state),false);
  for(const name of ['../outside','.interactions-state-v1-1-1-invalid.tmp','arbitrary.tmp'])throws(()=>create([],{temporaryFileName:name}),/临时文件设置/);
  before=fs.readFileSync(archive);throws(()=>create([],{onValidatedArchive:()=>Promise.resolve()}),/同步完成/);eq(fs.readFileSync(archive),before);
  throws(()=>new AtomicThreadLock(directory,{leaseId:'-'.repeat(36)}),/Invalid lock lease/);
  eq(fs.readFileSync(unknown,'utf8'),'preserve unknown');eq(fs.existsSync(path.join(directory,'.interactions.lock')),false);
  console.log(JSON.stringify({passed:true,checks,realExitedWorkerProof:true,encryptedArchiveValidatedBeforeCleanup:true,unknownAndAliasedEntriesPreserved:true,creationFailureDoesNotDeleteExistingFile:true,realPlatformActions:0}));
 }finally{if(worker&&worker.threadId!==-1)await worker.terminate();key.fill(0);assert.equal(path.dirname(fs.realpathSync(root)),fs.realpathSync(os.tmpdir()));assert(path.basename(root).startsWith('yx-scratch-ownership-'));fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
