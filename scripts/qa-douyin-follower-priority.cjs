// Actual provider control flow, fake hooks/IPC/clock, hard VM time limits.
// Never a real profile/page/network. No source instrumentation or loop guard.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),ts=require('typescript'),file=path.join(root,'client/src/components/workspace/DouyinInteractionData.tsx');let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
async function fixture(status,size=1,comments=false){
 let snapshots=0,clock=100000;const effects=[],queued=[],intervals=[],refs=[],events=new Map(),calls=[];
 const accounts=['a','b','c','d'].map(id=>({id,platform:'douyin',connectorSessionId:'session-'+id,nativeAccountKey:'native-'+id,nickname:'QA '+id})),workspace={accounts,jobsLocked:false};
 const rows=Array.from({length:size},(_,i)=>({platformId:String(i+200),platformUserId:String(i+200),author:'QA '+i,content:''}));
 const env={Date:class extends Date{static now(){return clock;}},queueMicrotask:fn=>queued.push(fn),window:{addEventListener(name,fn){events.set(name,fn);},removeEventListener(name){events.delete(name);},setInterval(fn){intervals.push(fn);return intervals.length;},clearInterval(){},matrixDesktop:{async douyinInteractions(input){calls.push(input);const base={platform:'douyin',accountId:input.accountId,sessionId:'session-'+input.accountId,kind:input.kind,works:[],progress:{pages:1},complete:true};if(input.command==='cache')return{...base,fromCache:true,records:input.kind==='followers'?rows:[],...(input.kind==='followers'?{followerPanelSync:{status},complete:status==='complete'}:{})};return{...base,records:[],monitoring:true,nextCursor:'preserved-comment-'+input.accountId};}}}};
 const react={createContext:()=>({Provider:'fixture'}),useCallback:fn=>fn,useContext(){throw Error('No consumer');},useEffect:fn=>effects.push(fn),useRef:value=>{const ref={current:value};refs.push(ref);return ref;},useState:value=>[typeof value==='function'?value():value,()=>{snapshots++;}]};
 const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(root);const normal=m.require.bind(m);
 m.require=id=>id==='react'?react:id==='react/jsx-runtime'?{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}:id==='@/api'?{getUser:()=>({id:'owner'}),getAuthToken:()=> 'token'}:id==='./OfficialWorkspace'?{useOfficialWorkspace:()=>workspace}:id==='./WorkspaceUiState'?{useWorkspaceIdentity:()=> 'lease'}:id==='fixture-env'?env:normal(id);
 m._compile('const {window,queueMicrotask,Date}=require("fixture-env");\n'+ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
 const render=m.exports.DouyinInteractionDataProvider({children:null,initialKinds:comments?['followers','comments']:['followers']}),cleanups=effects.map(fn=>fn()),api=render.props.value;
 const limited=fn=>vm.runInNewContext('fn()',{fn},{timeout:500}),flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();},pump=async()=>{let turns=0;while(queued.length){assert(++turns<30,'microtask storm');limited(queued.shift());}await flush();},tick=async()=>{limited(intervals[0]);await flush();},cache=()=>refs.find(ref=>ref.current?.entries instanceof Map&&ref.current?.hydrated instanceof Set).current;
 await flush();await tick();await tick();
 return{accounts,workspace,api,rows,calls,events,cache,flush,pump,tick,limited,clock:ms=>clock+=ms,snapshots:()=>snapshots,close:()=>cleanups.forEach(fn=>fn?.())};
}
(async()=>{
 for(const status of ['paused','complete','running'])for(const size of [1,10000]){
  const q=await fixture(status,size);eq(q.calls.length,4);const before=q.snapshots(),saved=[...q.cache().entries.values()].map(e=>e.rows);
  for(let n=0;n<80;n++){q.api.prioritize(q.accounts[n%4],'','followers');await q.pump();q.clock(1000);await q.tick();}
  eq(q.calls.length,4);eq(q.snapshots(),before);eq([...q.cache().entries.values()].every(e=>e.nextAt===Infinity),true);eq([...q.cache().entries.values()].every((e,i)=>e.rows===saved[i]&&e.rows.length===size),true);
  // Even a stale/foreign due timestamp cannot re-admit a handed-off lane.
  for(const e of q.cache().entries.values()){e.nextAt=0;e.cursor='preserved-website-cursor';}
  await q.tick();eq(q.snapshots(),before);eq(q.calls.length,4);
  q.api.refresh(q.accounts[1],'followers');await q.pump();eq(q.calls.length,4);eq(q.cache().entries.get('followers/b/session-b/native-b').cursor,'preserved-website-cursor');
  // A native cache event is allowed to hydrate once, never scan the old API.
  q.events.get('matrix:followers-cache-updated')({detail:{owner:'owner',accountId:'b',sessionId:'session-b',nativeAccountKey:'native-b'}});await q.tick();eq(q.calls.length,5);eq(q.calls.at(-1).command,'cache');eq(q.cache().entries.get('followers/b/session-b/native-b').nextAt,Infinity);q.close();
 }
 // Foreground followers must not suppress ordinary comment monitoring.
 const q=await fixture('paused',10000,true);q.api.prioritize(q.accounts[1],'','followers');await q.pump();q.clock(20000);await q.tick();await q.tick();eq(q.calls.some(c=>c.kind==='comments'&&!c.command),true);eq(q.calls.some(c=>c.kind==='followers'&&!c.command),false);
 q.workspace.jobsLocked=true;const count=q.calls.length;await q.tick();eq(q.calls.length,count);q.close();
 console.log(JSON.stringify({followerPrioritySchedulerChecks:checks,actualUninstrumentedProvider:true,hardVmDeadlineMs:500,pausedRunningCompleteCovered:true,tenThousandCachedRows:true,repeatedAccountSelectionDoesNotAdmitOldLane:true,explicitCacheReloadAllowed:true,commentMonitoringPreserved:true,realProfileTouched:false,platformRequests:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});
