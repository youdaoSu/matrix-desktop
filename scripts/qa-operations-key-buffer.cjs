// Actual main IPC and optional native Node worker, synthetic encrypted storage only.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{Worker}=require('node:worker_threads');
const {registerAccountOperations}=require('../desktop/account-operations.cjs');
const {cipher,hash}=require('../desktop/account-operations-crypto.cjs');
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yx-key-buffer-')),codecKey=crypto.randomBytes(32),codec=cipher(codecKey,'synthetic'),originalRandom=crypto.randomBytes,originalFrom=Buffer.from,originalUUID=crypto.randomUUID;
 const captured=[];let existingHex,host,checks=0,realPlatformActions=0,workerStarts=0;
 const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},zeroed=()=>captured[captured.length-1].every(byte=>byte===0),noPlatform=()=>{realPlatformActions++;throw Error('No real platform');};
 try{
  crypto.randomBytes=function(size,...args){const bytes=originalRandom.call(this,size,...args);if(size===32&&!args.length)captured.push(bytes);return bytes;};
  Buffer.from=function(value,encoding,...args){const bytes=originalFrom.call(this,value,encoding,...args);if(existingHex&&value===existingHex&&encoding==='hex')captured.push(bytes);return bytes;};
  const make=(name,{failEncryption=false,failWorker=true}={})=>{
   const root=path.join(directory,name),owner=originalUUID(),workspaceId=originalUUID(),sender={},handlers=new Map();
   host=registerAccountOperations({ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},getWindow:()=>({webContents:sender,isDestroyed:()=>false}),authenticate:async()=>({userId:owner}),safeStorage:{isEncryptionAvailable:()=>true,encryptString:value=>{if(failEncryption)throw Error('Synthetic encryption failure');return codec.protect(value);},decryptString:value=>{const plain=codec.unprotect(value);existingHex=JSON.parse(plain).key;return plain;}},userData:root,workerFactory:(file,options)=>{if(failWorker)throw Error('Synthetic worker construction failure');workerStarts++;return new Worker(file,options);},getInbox:noPlatform,getInteractions:noPlatform});
   const api=command=>handlers.get('matrix:account-operations')({sender},{command,accessToken:'synthetic',workspaceId,accountIds:[]});return{api,folder:path.join(root,'account-operations',hash(owner))};
  };
  let fixture=make('worker-failure');
  eq((await fixture.api('configure')).error,'Synthetic worker construction failure');eq(captured.length,1);eq(zeroed(),true);
  const keyFile=path.join(fixture.folder,'key.bin'),durable=fs.readFileSync(keyFile);
  eq((await fixture.api('configure')).error,'Synthetic worker construction failure');eq(captured.length,2);eq(zeroed(),true);eq(fs.readFileSync(keyFile),durable);
  await host.close();host=undefined;
  fixture=make('encryption-failure',{failEncryption:true});eq((await fixture.api('configure')).error,'Synthetic encryption failure');eq(captured.length,3);eq(zeroed(),true);eq(fs.readdirSync(fixture.folder),[]);await host.close();host=undefined;
  fixture=make('preexisting-temporary');fs.mkdirSync(fixture.folder,{recursive:true});const temporaryId=originalUUID(),temporary=path.join(fixture.folder,temporaryId+'.tmp'),sentinel=Buffer.from('synthetic preexisting file');fs.writeFileSync(temporary,sentinel);crypto.randomUUID=()=>temporaryId;
  const collision=await fixture.api('configure');eq(typeof collision.error,'string');crypto.randomUUID=originalUUID;eq(captured.length,4);eq(zeroed(),true);eq(fs.readFileSync(temporary),sentinel);eq(fs.existsSync(path.join(fixture.folder,'key.bin')),false);await host.close();host=undefined;
  fixture=make('normal-worker',{failWorker:false});eq((await fixture.api('configure')).result,true);eq(captured.length,5);eq(zeroed(),true);eq((await fixture.api('snapshot')).result.totalMessages,0);await host.close();host=undefined;eq(workerStarts,1);eq(realPlatformActions,0);
  console.log(JSON.stringify({passed:true,checks,failureCases:4,normalWorkerOpenedAndClosed:true,capturedBuffersCleared:captured.length,preexistingTemporaryPreserved:true,realPlatformActions:0,scope:'Best-effort zeroing of owned mutable key buffers; not a guarantee that JS strings or runtime copies are erased'}));
 }finally{crypto.randomBytes=originalRandom;Buffer.from=originalFrom;crypto.randomUUID=originalUUID;await host?.close();codecKey.fill(0);for(const buffer of captured)buffer.fill(0);assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('yx-key-buffer-'));fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
