const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),esbuild=require('esbuild');
const root=path.join(__dirname,'..');let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},flush=()=>new Promise(resolve=>setImmediate(resolve));
const compiled=esbuild.transformSync(fs.readFileSync(path.join(root,'client/src/components/workspace/AccountOperationsRuntime.tsx'),'utf8'),{loader:'tsx',format:'cjs'}).code;
function fixture(native=true){
 let now=0,listener,failed=false,closed=0;const calls=[],effects=[],timers=new Map(),exports={};
 const bridge={accountOperations:async()=>{closed++;},...(native?{onAccountOperationsHeartbeat:callback=>{listener=callback;return()=>{listener=undefined;};}}:{})};
 const api={operationsSession:()=>({accessToken:'synthetic',workspaceId:'synthetic-workspace'}),operationsCall:async(...args)=>{calls.push(args);if(failed){failed=false;throw Error('Synthetic expired worker');}return true;}};
 const context={module:{exports},exports,window:{matrixDesktop:bridge},performance:{now:()=>now},setInterval:(callback,ms)=>{eq(ms,15000);timers.set(1,callback);return 1;},clearInterval:id=>timers.delete(id),require:name=>{
  if(name==='react')return{useEffect:fn=>effects.push(fn)};if(name==='@/api')return{getAuthToken:()=> 'synthetic'};if(name==='./WorkspaceUiState')return{useWorkspaceIdentity:()=> 'synthetic-workspace'};if(name==='./account-operations-client')return api;throw Error(name);
 }};
 vm.runInNewContext(compiled,context);context.module.exports.AccountOperationsRuntime({accounts:[]});const cleanup=effects.map(fn=>fn());
 return{calls,timers,advance:value=>{now=value;},emit:scope=>listener?.(scope),listener:()=>listener,fail:()=>{failed=true;},cleanup:()=>cleanup.forEach(fn=>fn?.()),closed:()=>closed};
}
(async()=>{
 const one=fixture();await flush();eq(one.calls[0][0],'configure');eq(one.calls[0][1].heartbeatMode,'main-event');
 one.advance(5000);one.emit('synthetic-workspace');await flush();eq(one.calls.length,1);
 one.advance(15000);one.emit('old-workspace');await flush();eq(one.calls.length,1);one.emit('synthetic-workspace');await flush();eq(one.calls.at(-1)[0],'heartbeat');
 one.timers.get(1)();await flush();eq(one.calls.length,2);
 one.advance(30000);one.fail();one.emit('synthetic-workspace');await flush();eq(one.calls.length,3);
 one.advance(45000);one.timers.get(1)();await flush();eq(one.calls.at(-1)[0],'configure');eq(one.calls.at(-1)[1].heartbeatMode,'main-event');
 const stale=one.listener();one.cleanup();eq(one.timers.size,0);eq(one.listener(),undefined);one.advance(60000);stale('synthetic-workspace');await flush();eq(one.calls.length,4);eq(one.closed(),0);
 const fallback=fixture(false);await flush();eq(fallback.calls[0][1].heartbeatMode,'renderer-timer');fallback.advance(15000);fallback.timers.get(1)();await flush();eq(fallback.calls.at(-1)[0],'heartbeat');fallback.cleanup();eq(fallback.timers.size,0);
 // Execute the real preload in a disposable VM: no Electron or user profile.
 const ipc=new EventEmitter();ipc.invoke=async()=>({});let exposed;
 vm.runInNewContext(fs.readFileSync(path.join(root,'desktop/preload.cjs'),'utf8'),{require:name=>{assert.equal(name,'electron');return{contextBridge:{exposeInMainWorld:(_name,value)=>{exposed=value;}},ipcRenderer:ipc,webUtils:{}};}});
 const received=[];assert.throws(()=>exposed.onAccountOperationsHeartbeat(null),/function/);checks++;const unsubscribe=exposed.onAccountOperationsHeartbeat(value=>received.push(value));
 for(const value of [{workspaceId:'bad'},'',null,'x'.repeat(129),'synthetic-workspace'])ipc.emit('matrix:account-operations-heartbeat',{},value);
 eq(received,['synthetic-workspace']);unsubscribe();unsubscribe();ipc.emit('matrix:account-operations-heartbeat',{},'later');eq(received.length,1);eq(ipc.listenerCount('matrix:account-operations-heartbeat'),0);
 console.log(JSON.stringify({passed:true,checks,actualRuntimeAndPreload:true,coalescedTriggers:true,reconfiguresAfterFailure:true,cleanup:true,realPlatformActions:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});
