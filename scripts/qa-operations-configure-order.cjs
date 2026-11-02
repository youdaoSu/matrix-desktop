// Latest configuration wins across real IPC/worker async boundaries; no platform use.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{Worker}=require('node:worker_threads');
const {registerAccountOperations}=require('../desktop/account-operations.cjs'),{cipher}=require('../desktop/account-operations-crypto.cjs');
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yx-configure-order-')),owner=crypto.randomUUID(),workspaceId=crypto.randomUUID(),key=crypto.randomBytes(32),codec=cipher(key,'synthetic'),sender={},handlers=new Map();
 const accounts=[0,1].map(i=>({id:crypto.randomUUID(),platform:'douyin',nickname:'synthetic-'+i,connectorSessionId:crypto.randomUUID(),nativeAccountKey:'synthetic-'+i}));
 let host,gate,release=()=>{},held=false,hold='',first,platformActions=0,runtimeCalls=0,workerStarts=0,checks=0;const deferred=[],eq=(a,b)=>{assert.deepEqual(a,b);checks++;},noPlatform=()=>{platformActions++;throw Error('No real platform');};
 const prepare=mode=>{held=false;hold=mode;gate=new Promise(resolve=>release=resolve);};
 const waitHeld=async()=>{const until=Date.now()+5000;while(!held&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,10));assert(held,'Synthetic boundary was not reached');checks++;};
 try{
  host=registerAccountOperations({ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},getWindow:()=>({webContents:sender,isDestroyed:()=>false}),authenticate:async(token,id)=>{
   assert.equal(token,'synthetic');if(hold==='owner'&&!id||hold==='account'&&id===accounts[0].id){hold='';held=true;await gate;}return{userId:owner,...(id?{account:accounts.find(a=>a.id===id)}:{})};
  },safeStorage:{isEncryptionAvailable:()=>true,encryptString:codec.protect,decryptString:codec.unprotect},userData:directory,getInbox:noPlatform,getInteractions:noPlatform,workerFactory:(file,options)=>{
   workerStarts++;const worker=new Worker(file,options),post=worker.postMessage.bind(worker);worker.postMessage=input=>{if(input.command==='runtime')runtimeCalls++;if(hold==='worker'&&input.command==='configure'){hold='';held=true;deferred.push(()=>post(input));return;}post(input);};return worker;
  }});
  const api=(command,accountIds=[])=>handlers.get('matrix:account-operations')({sender},{command,accessToken:'synthetic',workspaceId,accountIds});
  const assertSelected=async account=>eq((await api('snapshot')).result.accounts.map(a=>a.accountId),[account.id]);
  for(const boundary of ['account','owner']){
   prepare(boundary);first=api('configure',[accounts[0].id]);await waitHeld();eq((await api('configure',[accounts[1].id])).result,true);await assertSelected(accounts[1]);const starts=workerStarts;
   release();assert.match((await first).error,/旧配置未采用/);checks++;await assertSelected(accounts[1]);eq(workerStarts,starts);eq((await api('heartbeat')).result,true);
  }
  // Invalid input must not supersede an already-valid pending configuration.
  prepare('account');first=api('configure',[accounts[0].id]);await waitHeld();assert.match((await api('configure',['bad'])).error,/账号列表无效/);checks++;release();eq((await first).result,true);await assertSelected(accounts[0]);
  // A newer request can arrive while the first worker command is queued.
  prepare('worker');first=api('configure',[accounts[0].id]);await waitHeld();const newer=api('configure',[accounts[1].id]);
  // Preserve FIFO delivery: release the first posted command before the next
  // event-loop turn dispatches the newly authenticated configuration.
  for(const send of deferred.splice(0))send();hold='';release();assert.match((await first).error,/旧配置未采用/);checks++;eq((await newer).result,true);await assertSelected(accounts[1]);eq((await api('heartbeat')).result,true);
  eq(workerStarts,1);eq(platformActions,0);await host.close();host=undefined;
  console.log(JSON.stringify({passed:true,checks,lateAccountAndOwnerResultsRejected:true,invalidInputDoesNotSupersede:true,workerBoundaryLatestWins:true,workerStarts,runtimeCalls,realPlatformActions:0}));
 }finally{hold='';release();for(const send of deferred.splice(0))send();await first;await host?.close();key.fill(0);assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('yx-configure-order-'));fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
