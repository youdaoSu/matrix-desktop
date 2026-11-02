'use strict';
// retiredOwners must come from the host's confirmed worker exit,
// never from a renderer, a file's own contents, or a mere timeout.
const fs=require('node:fs'),path=require('node:path'),{threadId}=require('node:worker_threads');
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
const regular=file=>{const stat=fs.lstatSync(file,{bigint:true});if(!stat.isFile()||stat.isSymbolicLink())throw Error('Unsafe lock file');return stat;};
class AtomicThreadLock{
 #held=false;
 constructor(directory,{leaseId,retiredOwners=[]}){
  if(!path.isAbsolute(directory)||!uuid(leaseId)||!Array.isArray(retiredOwners)||retiredOwners.length>32)throw Error('Invalid lock lease');
  const supplied=fs.lstatSync(directory,{bigint:true});
  if(!supplied.isDirectory()||supplied.isSymbolicLink())throw Error('Unsafe lock directory');
  this.directory=fs.realpathSync(directory);this.directoryStat=fs.lstatSync(this.directory,{bigint:true});
  if(!this.directoryStat.isDirectory()||this.directoryStat.isSymbolicLink()||!same(supplied,this.directoryStat))throw Error('Lock directory changed');
  this.file=path.join(this.directory,'.interactions.lock');this.owner={version:2,pid:process.pid,threadId,leaseId};
  this.retired=new Set(retiredOwners.map(owner=>{if(owner.pid!==process.pid||!Number.isSafeInteger(owner.threadId)||owner.threadId<1||!uuid(owner.leaseId))throw Error('Invalid retired thread proof');return JSON.stringify([owner.pid,owner.threadId,owner.leaseId]);}));
 }
 scratchName(kind,owner=this.owner){
  if(!['state','lock'].includes(kind)||owner.pid!==process.pid||!Number.isSafeInteger(owner.threadId)||owner.threadId<0||!uuid(owner.leaseId))throw Error('Invalid scratch owner');
  return `.interactions-${kind}-v1-${owner.pid}-${owner.threadId}-${owner.leaseId}.tmp`;
 }
 // Called by the store only after validating an existing committed archive,
 // while its lock is held. Never scan unknown/legacy names or replay temp data.
 cleanupRetiredScratch(){
  if(!this.#held)throw Error('Scratch recovery requires the archive lock');
  const selected=[];
  for(const proof of this.retired){
   const [pid,threadId,leaseId]=JSON.parse(proof),owner={pid,threadId,leaseId};
   if(threadId===this.owner.threadId&&leaseId===this.owner.leaseId)throw Error('Active lease cannot be retired');
   for(const kind of ['state','lock']){
    this.assertDirectory();const file=path.join(this.directory,this.scratchName(kind,owner));let stat;
    try{stat=regular(file);}catch(error){if(error.code==='ENOENT')continue;throw error;}
    if(stat.nlink!==1n)throw Error('Scratch has additional links; preserved');selected.push({file,stat});
   }
  }
  for(const {file,stat} of selected){
   this.assertDirectory();const current=regular(file);
   if(!same(current,stat)||current.nlink!==1n)throw Error('Scratch identity changed; preserved');
   fs.unlinkSync(file);
  }
  return selected.length;
 }
 assertDirectory(){const stat=fs.lstatSync(this.directory,{bigint:true});if(!stat.isDirectory()||stat.isSymbolicLink()||!same(stat,this.directoryStat))throw Error('Lock directory changed');}
 removeOwned(file,stat){this.assertDirectory();try{if(!same(regular(file),stat))throw Error('Lock identity changed');fs.unlinkSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}}
 recover(){
  this.assertDirectory();const observed=regular(this.file);if(observed.size>1024n)throw Error('Invalid lock contents');
  let owner;try{owner=JSON.parse(fs.readFileSync(this.file,'utf8'));}catch{throw Error('Incomplete legacy lock preserved');}
  if(!owner||!Number.isSafeInteger(owner.pid)||owner.pid<=0)throw Error('Invalid lock owner');
  let retired=owner.version===2&&owner.pid===process.pid&&this.retired.has(JSON.stringify([owner.pid,owner.threadId,owner.leaseId]));
  if(!retired){try{process.kill(owner.pid,0);}catch(error){if(error.code==='ESRCH')retired=true;}}
  if(!retired)throw Error('Lock still owned; not removed');
  this.removeOwned(this.file,observed);
 }
 run(action){
  if(typeof action!=='function')throw Error('Lock action required');if(this.#held)throw Error('Lock is not reentrant');this.assertDirectory();
  const temporary=path.join(this.directory,this.scratchName('lock'));let fd,stat,linked=false;
  try{
   fd=fs.openSync(temporary,'wx',0o600);stat=fs.fstatSync(fd,{bigint:true});
   fs.writeFileSync(fd,JSON.stringify(this.owner),'utf8');fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
   for(let attempt=0;attempt<2;attempt++){
    this.assertDirectory();try{fs.linkSync(temporary,this.file);linked=true;break;}catch(error){if(error.code!=='EEXIST'||attempt===1)throw error;this.recover();}
   }
   if(!linked)throw Error('Lock not acquired');
   // Exclusive publication happens only after the entire owner record is ready.
   if(!same(regular(this.file),stat))throw Error('Published lock changed');
   this.#held=true;
   const result=action();if(result&&typeof result.then==='function')throw Error('Lock action must be synchronous');return result;
  }finally{
   this.#held=false;
   if(fd!==undefined)fs.closeSync(fd);
   try{if(linked)this.removeOwned(this.file,stat);}finally{if(stat)this.removeOwned(temporary,stat);}
  }
 }
}
module.exports={AtomicThreadLock};
