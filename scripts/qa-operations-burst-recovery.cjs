// Actual main IPC and disposable Node workers; no rules or platform writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{Worker}=require('node:worker_threads');
const {registerAccountOperations}=require('../desktop/account-operations.cjs'),{cipher}=require('../desktop/account-operations-crypto.cjs');
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yx-burst-recovery-')),owner=crypto.randomUUID(),workspaceId=crypto.randomUUID(),codec=cipher(crypto.randomBytes(32),'synthetic-fixture');
 const account={id:crypto.randomUUID(),platform:'douyin',nickname:'synthetic',connectorSessionId:crypto.randomUUID(),nativeAccountKey:'synthetic'},sender={},handlers=new Map(),workers=[];
 let host,checks=0,platformActions=0,observationsCompleted=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
 const api=(command,args,accountIds=[account.id])=>handlers.get('matrix:account-operations')({sender},{command,args,accountIds,accessToken:'fixture',workspaceId});
 const noPlatform=()=>{platformActions++;throw Error('No platform actions in fixture');};
 const records=Array.from({length:200},(_,i)=>({platformId:String(800000000000000000n+BigInt(i)),workId:'777777777777777777',platformUserId:String(3000+i),author:'synthetic',content:'event '+i,displayTime:new Date(Date.now()+1000).toISOString()}));
 try{
  host=registerAccountOperations({workerFactory:(file,options)=>{const worker=new Worker(file,options),ids=new Map(),post=worker.postMessage.bind(worker);worker.postMessage=value=>{if(value.command==='observe'||value.command==='observe-batch')ids.set(value.id,value.command==='observe'?1:value.args.length);return post(value);};worker.on('message',value=>{if(value.type==='result'&&ids.has(value.id)){observationsCompleted+=ids.get(value.id);ids.delete(value.id);}});worker.on('error',error=>console.error('Synthetic worker:',error));workers.push(worker);return worker;},ipcMain:{handle:(name,handler)=>handlers.set(name,handler)},getWindow:()=>({webContents:sender,isDestroyed:()=>false}),authenticate:async(token,id)=>{assert.equal(token,'fixture');return{userId:owner,...(id?{account}:{})};},safeStorage:{isEncryptionAvailable:()=>true,encryptString:codec.protect,decryptString:codec.unprotect},userData:directory,getInbox:noPlatform,getInteractions:noPlatform});
  eq((await api('configure')).result,true);
  const started=performance.now();host.observe({userId:owner,account,ownUid:'100',records});
  eq((await api('snapshot')).error,undefined);eq((await api('heartbeat')).result,true);
  let state;const deadline=Date.now()+15000;
  do{state=await api('snapshot');eq(state.error,undefined);if(state.result.totalMessages===200)break;await new Promise(resolve=>setTimeout(resolve,25));}while(Date.now()<deadline);
  eq(state.result.totalMessages,200);eq(state.result.error,'');eq(state.result.counts.sent,0);
  const burstMs=performance.now()-started;
  // Replaying source observations remains idempotent at the durable store.
  host.observe({userId:owner,account,ownUid:'100',records});
  const replayDeadline=Date.now()+15000;while(observationsCompleted<400&&Date.now()<replayDeadline)await new Promise(resolve=>setTimeout(resolve,25));
  eq(observationsCompleted,400);eq((await api('snapshot')).result.totalMessages,200);
  eq((await api('snapshot')).result.accounts.length,1);
  // Freeze the fixture worker after all writes before simulating its exit.
  // Mid-write termination leaves a separate lock-recovery gap, not covered here.
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Fixture shutdown timed out')),5000);const onMessage=value=>{if(value.type==='result'&&value.id==='fixture-close'){clearTimeout(timer);workers[0].off('message',onMessage);value.error?reject(Error(value.error)):resolve();}};workers[0].on('message',onMessage);workers[0].postMessage({type:'command',id:'fixture-close',command:'close',args:{}});});
  // Only the fixture-created worker is stopped; production is never touched.
  await workers[0].terminate();
  const heartbeat=await api('heartbeat');assert.match(heartbeat.error,/重新配置/);checks++;
  eq(workers.length,2);eq((await api('snapshot')).result.accounts.length,0);
  // Matches AccountOperationsRuntime's next bounded tick after heartbeat error.
  eq((await api('configure')).result,true);eq((await api('heartbeat')).result,true);
  state=await api('snapshot');eq(state.result.accounts.length,1);eq(state.result.totalMessages,200);eq(state.result.counts.sent,0);
  // One invalid source must not discard its valid neighbors in a local batch.
  host.observe({userId:owner,account,ownUid:'100',records:[
   {...records[0],platformId:'800000000000008001',displayTime:new Date(Date.now()+1000).toISOString()},
   {...records[0],platformId:'800000000000008002',displayTime:new Date(Date.now()+1000).toISOString(),content:'x'.repeat(100001)},
   {...records[0],platformId:'800000000000008003',displayTime:new Date(Date.now()+1000).toISOString()}
  ]});
  const isolatedDeadline=Date.now()+5000;while(observationsCompleted<403&&Date.now()<isolatedDeadline)await new Promise(resolve=>setTimeout(resolve,20));
  eq(observationsCompleted,403);state=await api('snapshot');eq(state.result.totalMessages,202);assert.match(state.result.error,/部分新事件/);checks++;eq(state.result.counts.sent,0);
  // Binding removal discards further observations from that binding.
  eq((await api('configure',undefined,[])).result,true);
  host.observe({userId:owner,account,ownUid:'100',records:[{...records[0],platformId:'800000000000009999'}]});
  eq((await api('snapshot')).result.totalMessages,202);eq(platformActions,0);
  console.log(JSON.stringify({passed:true,checks,inputEvents:200,storedEvents:200,burstMs,workerRecovery:true,invalidBatchIsolated:true,supplementalAccepted:2,realPlatformActions:platformActions}));
 }finally{
  await host?.close();eq(platformActions,0);
  assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('yx-burst-recovery-'));
  fs.rmSync(directory,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
