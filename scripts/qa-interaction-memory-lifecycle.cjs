// Execute the real provider with a deterministic hook/effect scheduler. This
// lightweight fixture is not a browser/React-renderer or heap-soak acceptance.
const assert=require('node:assert/strict'),path=require('node:path');
const {loadTs}=require('./qa-load-typescript.cjs');
const root=path.resolve(__dirname,'..'),cache=new Map(),slots=[];
let cursor=0,dirty=true,effects=[],value,checks=0,owner='fixture-owner';
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
const hooks={
  createContext:()=>({Provider:'fixture-provider'}),useContext:()=>{},
  useRef(initial){const i=cursor++;return slots[i]||(slots[i]={current:initial});},
  useState(initial){const i=cursor++;if(!slots[i])slots[i]={state:typeof initial==='function'?initial():initial};return [slots[i].state,next=>{slots[i].state=typeof next==='function'?next(slots[i].state):next;dirty=true;}];},
  useMemo(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={deps,value:fn()};return slots[i].value;},
  useCallback(fn,deps){return hooks.useMemo(()=>fn,deps);},
  useEffect(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){const old=slots[i];slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}
};
const a={id:'fixture-a',platform:'douyin',connectorSessionId:'session-a',nativeAccountKey:'key-a'};
const b={...a,id:'fixture-b',connectorSessionId:'session-b'};
const workspace={accounts:[a,b],jobsLocked:false};
const stub=(file,exports)=>cache.set(path.join(root,file),{exports});
stub('client/src/api/index.ts',{getUser:()=>({id:owner}),getAuthToken:()=>owner+'-token'});
stub('client/src/components/workspace/OfficialWorkspace.tsx',{useOfficialWorkspace:()=>workspace});
stub('client/src/components/workspace/WorkspaceUiState.ts',{useWorkspaceIdentity:()=>owner});
const timers=new Map(),events=new EventTarget();let nextTimer=0,held,hold=false,lateError=false;
global.window={setInterval:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearInterval:id=>timers.delete(id),addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),matrixDesktop:{douyinInteractions:async input=>{
  const account=workspace.accounts.find(a=>a.id===input.accountId);
  const result={accountId:account.id,sessionId:account.connectorSessionId,platform:'douyin',kind:input.kind,fromCache:true,records:[{platformId:'101',workId:'201',author:'合成昵称',content:'合成内容'}],works:[],complete:true,progress:{pages:1}};
  if(hold&&input.accountId===a.id&&input.command!=='cache')return new Promise((resolve,reject)=>{held=()=>lateError?reject(Error('late failure')):resolve({...result,nextCursor:'old-session-cursor'});});
  return result;
}}};
const {DouyinInteractionDataProvider:Provider}=loadTs('client/src/components/workspace/DouyinInteractionData.tsx',cache,new Map([['react',hooks]]));
function render(){cursor=0;effects=[];dirty=false;value=Provider({children:null,initialKinds:['comments']}).props.value;for(const effect of effects)effect();}
async function flush(){for(let i=0;i<12;i++){if(dirty)render();await Promise.resolve();}}
async function tick(){for(const fn of [...timers.values()])fn();await flush();}
async function run(){
  await flush();eq(value.entry(a,'comments').rows.length,1);eq(timers.size,1);
  const originalRows=value.entry(b,'comments').rows;
  // A normal rerender must not clear usable cached rows or restart the timer.
  dirty=true;await flush();eq(value.entry(b,'comments').rows,originalRows);eq(timers.size,1);
  hold=true;await tick();assert.ok(held);checks++;
  const rebound={...a,connectorSessionId:'new-session'};workspace.accounts=[rebound,b];dirty=true;await flush();
  eq(value.entry(a,'comments'),undefined);eq(value.entry(b,'comments').rows,originalRows);
  held();await flush();eq(value.entry(a,'comments'),undefined);hold=false;
  await tick();eq(value.entry(rebound,'comments').rows.length,1);
  // Churn leaves exactly the currently bound keys, rather than one cache per
  // historical login. Keep another account's records throughout.
  for(let i=0;i<30;i++){workspace.accounts=[{...a,connectorSessionId:'rotated-'+i},b];dirty=true;await flush();await tick();}
  const cacheRef=slots.find(slot=>slot?.current?.entries instanceof Map);
  eq(cacheRef.current.entries.size,2);eq(cacheRef.current.hydrated.size,2);eq(value.entry(b,'comments').rows,originalRows);
  workspace.accounts=[b];dirty=true;await flush();eq(cacheRef.current.entries.size,1);eq(cacheRef.current.hydrated.size,1);
  // A new owner cannot retain the previous workspace's payload or scheduling
  // state. Rehydrate only from the new owner's synthetic cache response.
  owner='fixture-next-owner';dirty=true;await flush();eq(cacheRef.current.lease,owner);eq(cacheRef.current.entries.size,1);
  workspace.accounts=[a,b];dirty=true;await flush();hold=true;await tick();assert.ok(held);checks++;
  // Main lifecycle cleanup stops the timer and releases all retained rows.
  for(const slot of slots)slot?.cleanup?.();eq(timers.size,0);eq(cacheRef.current.entries.size,0);eq(cacheRef.current.hydrated.size,0);
  dirty=false;lateError=true;held();await Promise.resolve();await Promise.resolve();await Promise.resolve();eq(dirty,false);eq(cacheRef.current.entries.size,0);
  const before=dirty;value.acceptAction(b,{accountId:b.id,sessionId:b.connectorSessionId,receipt:{state:'confirmed'},records:[{platformId:'102',workId:'201',author:'合成',content:'迟到'}]});eq(cacheRef.current.entries.size,0);eq(dirty,before);
  console.log(JSON.stringify({interactionLifecycleChecks:checks,accountRebindCycles:30,realPlatformCalls:0,browserAcceptance:false}));
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{delete global.window;});
