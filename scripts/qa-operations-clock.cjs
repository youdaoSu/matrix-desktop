// Synthetic clocks affect only this test process and its isolated worker.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict'),{Worker}=require('node:worker_threads');
const {registerAccountOperations}=require('../desktop/account-operations.cjs'),{cipher}=require('../desktop/account-operations-crypto.cjs');
const root=path.resolve(__dirname,'..'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'yx-operations-clock-')),originalNow=Date.now,originalInterval=global.setInterval;
let host,worker,checks=0,sequence=0;const eq=(a,b,message)=>{assert.deepEqual(a,b,message);checks++;},delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 try{
  const handlers=new Map(),key=crypto.randomBytes(32),codec=cipher(key,'fixture'),owner=crypto.randomUUID(),workspaceId=crypto.randomUUID();
  let tick,elapsed=1000,starts=0,exits=0,throttling=true;
  const sender={isDestroyed:()=>false,getBackgroundThrottling:()=>throttling,setBackgroundThrottling:value=>{throttling=value;},send(){}};
  global.setInterval=(fn,ms)=>{eq(ms,5000);tick=fn;return{unref(){}};};
  host=registerAccountOperations({monotonicNow:()=>elapsed,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},getWindow:()=>({webContents:sender,isDestroyed:()=>false}),authenticate:async()=>({userId:owner}),safeStorage:{isEncryptionAvailable:()=>true,encryptString:codec.protect,decryptString:codec.unprotect},userData:path.join(temporary,'host'),getInbox:()=>{throw Error('No real platform');},getInteractions:()=>{throw Error('No real platform');},workerFactory:(file,options)=>{starts++;const child=new Worker(file,options);child.on('exit',()=>{exits++;});return child;}});
  global.setInterval=originalInterval;
  const call=command=>handlers.get('matrix:account-operations')({sender},{command,accessToken:'synthetic',workspaceId,accountIds:[],args:{heartbeatMode:'main-event'}});
  eq((await call('configure')).result,true);eq(starts,1);
  Date.now=()=>originalNow()+3600000;elapsed+=5000;tick();
  await call('heartbeat');eq(starts,1,'A fresh host must survive a forward wall-clock adjustment');eq(exits,0);
  Date.now=()=>originalNow()-3600000;elapsed+=46000;tick();Date.now=originalNow;
  for(let n=0;n<100&&!exits;n++)await delay(20);
  eq(exits,1,'A stale host must expire despite a backward wall-clock adjustment');
  await host.close();host=undefined;key.fill(0);eq(throttling,true);

  const directory=path.join(temporary,'worker');fs.mkdirSync(directory);const clock=new BigInt64Array(new SharedArrayBuffer(16));Atomics.store(clock,0,1000n);
  const wrapper=`const {workerData}=require('node:worker_threads');const original=Date.now;Date.now=()=>original()+Number(Atomics.load(workerData.testClock,1));Object.defineProperty(require('node:perf_hooks').performance,'now',{value:()=>Number(Atomics.load(workerData.testClock,0))});require(workerData.testFile);`;
  worker=new Worker(wrapper,{eval:true,workerData:{directory,key:crypto.randomBytes(32).toString('base64'),owner:crypto.randomUUID(),testClock:clock,testFile:path.join(root,'desktop/account-operations-worker.cjs')}});
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Worker readiness timeout')),10000);worker.once('error',reject);worker.on('message',message=>{if(message.type==='ready'){clearTimeout(timeout);resolve();}});});
  const rpc=(command,args={})=>new Promise((resolve,reject)=>{const id=++sequence,timeout=setTimeout(()=>{worker.off('message',listen);reject(Error('Synthetic RPC timeout'));},10000);const listen=message=>{if(message.type==='result'&&message.id===id){clearTimeout(timeout);worker.off('message',listen);message.error?reject(Error(message.error)):resolve(message.result);}};worker.on('message',listen);worker.postMessage({type:'command',id,command,args});});
  eq(await rpc('configure',[]),true);
  Atomics.store(clock,0,6000n);Atomics.store(clock,1,3600000n);await delay(1200);eq((await rpc('snapshot')).halted,false,'Fresh worker lease ignores wall-clock jumps');
  Atomics.store(clock,0,48000n);Atomics.store(clock,1,-3600000n);await delay(1200);eq((await rpc('snapshot')).halted,true,'Worker independently expires its monotonic lease');
  await rpc('close');await rpc('drain');await worker.terminate();worker=undefined;

  const source=fs.readFileSync(path.join(root,'desktop/account-operations-worker.cjs'),'utf8'),body=source.match(/function reserveSendFloor\(accountId\)\{[^\n]+\}/)?.[0];assert(body);checks++;
  let mono=1000,wall=1000000;const sandbox={performance:{now:()=>mono},Date:{now:()=>wall},nextSends:new Map(),closing:false,halted:false,runtimePaused:false};
  vm.runInNewContext(body+';this.reserve=reserveSendFloor;',sandbox);sandbox.reserve('synthetic');
  wall+=3600000;mono+=1000;assert.throws(()=>sandbox.reserve('synthetic'),/发送间隔/);checks++;
  wall-=7200000;mono+=3500;sandbox.reserve('synthetic');eq(sandbox.nextSends.get('synthetic'),mono+4500);
  console.log(JSON.stringify({passed:true,checks,actualNativeHost:true,actualWorker:true,actualReservationFunction:true,systemClockChanged:false,realPlatformActions:0}));
 }finally{
  Date.now=originalNow;global.setInterval=originalInterval;await host?.close();
  if(worker){worker.postMessage({type:'command',id:++sequence,command:'close',args:{}});await worker.terminate();}
  assert.equal(path.dirname(fs.realpathSync(temporary)),fs.realpathSync(os.tmpdir()));assert(path.basename(temporary).startsWith('yx-operations-clock-'));fs.rmSync(temporary,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
