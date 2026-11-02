// Actual workers, synthetic identities: old reads/startups cannot replace a new workspace.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{Worker}=require('node:worker_threads');
const {registerAccountOperations}=require('../desktop/account-operations.cjs'),{cipher,hash}=require('../desktop/account-operations-crypto.cjs');
(async()=>{
 let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
 for(const boundary of ['identity-read','startup','same-owner-startup']){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yx-workspace-order-')),users=[0,1].map(()=>({owner:crypto.randomUUID(),workspaceId:crypto.randomUUID()})),key=crypto.randomBytes(32),codec=cipher(key,'synthetic'),sender={},handlers=new Map(),workers=[],keyHashes=[],sameOwner=boundary==='same-owner-startup';
  if(sameOwner)users[1]={...users[0]};const expectedWorkers=sameOwner?['A','A']:['A','B'];
  let host,hold=false,held=false,release=()=>{},old,actions=0,releaseReady=()=>{},holdReady=boundary!=='identity-read';const gate=new Promise(resolve=>release=resolve),noPlatform=()=>{actions++;throw Error('No platform');};
  try{
   host=registerAccountOperations({ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},getWindow:()=>({webContents:sender,isDestroyed:()=>false}),authenticate:async token=>{const index=['synthetic-a','synthetic-b'].indexOf(token);assert(index>=0);if(index===0&&hold){hold=false;held=true;await gate;}return{userId:users[index].owner};},safeStorage:{isEncryptionAvailable:()=>true,encryptString:codec.protect,decryptString:codec.unprotect},userData:directory,getInbox:noPlatform,getInteractions:noPlatform,workerFactory:(file,options)=>{
    keyHashes.push(crypto.createHash('sha256').update(fs.readFileSync(path.join(directory,'account-operations',options.workerData.owner,'key.bin'))).digest('hex'));workers.push(options.workerData.owner===hash(users[0].owner)?'A':'B');const worker=new Worker(file,options),on=worker.on.bind(worker);
    worker.on=(event,listener)=>on(event,event==='message'?message=>{if(message.type==='ready'&&holdReady){holdReady=false;held=true;releaseReady=()=>listener(message);}else listener(message);}:listener);return worker;
   }});
   const api=(index,command)=>handlers.get('matrix:account-operations')({sender},{command,accessToken:['synthetic-a','synthetic-b'][index],workspaceId:users[index].workspaceId,accountIds:[]});
   if(boundary==='identity-read'){eq((await api(0,'configure')).result,true);hold=true;old=api(0,'snapshot');}else old=api(0,'configure');
   const deadline=Date.now()+5000;while(!held&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));eq(held,true);
   const newer=api(1,'configure');if(boundary!=='identity-read')releaseReady();eq((await newer).result,true);eq(workers,expectedWorkers);release();assert.match((await old).error,boundary!=='identity-read'?/旧配置未采用/:/账号配置已改变/);checks++;
   eq(workers,expectedWorkers);eq((await api(1,'heartbeat')).result,true);assert((await api(1,'snapshot')).result);checks++;
   // Even a later request carrying the obsolete workspace cannot switch it back.
   if(sameOwner){assert((await api(0,'snapshot')).result);checks++;eq(keyHashes[0],keyHashes[1]);}else{assert.match((await api(0,'snapshot')).error,/账号配置已改变/);checks++;}eq(workers,expectedWorkers);eq(actions,0);
   eq((await api(1,'close')).result,true);assert.match((await api(1,'configure')).error,/已结束/);checks++;
  }finally{release();releaseReady();await old;await host?.close();key.fill(0);assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('yx-workspace-order-'));fs.rmSync(directory,{recursive:true,force:true});}
 }
 console.log(JSON.stringify({passed:true,checks,lateReadsAndSupersededStartupRejected:true,sameOwnerStartupPreservesKey:true,newWorkspaceHeartbeatPreserved:true,realPlatformActions:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});
