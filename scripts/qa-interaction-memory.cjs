// Small, offline fixtures: no Electron process, user profile, or platform calls.
const assert = require('node:assert/strict');
const { loadTs } = require('./qa-load-typescript.cjs');
const base = 'client/src/components/workspace/';
const memory = loadTs(base + 'interaction-memory.ts');
let checks = 0;
const eq = (a,b) => { assert.deepEqual(a,b); checks++; };

async function run() {
  for (const rows of [[],[{}],[{text:'中文 😀\n"',optional:undefined},{text:'\ud800'}],Array.from({length:12000},(_,i)=>({id:String(i),text:'合成评论'+i}))]) {
    eq(memory.interactionRowsBytes(rows),Buffer.byteLength(JSON.stringify(rows)));
  }
  assert.throws(()=>memory.interactionRowsBytes(Array(50001).fill({})),/容量/); checks++;
  const entries = new Map(Array.from({length:4},(_,i)=>[String(i),{bytes:memory.interactionEntryBytes}]));
  memory.assertInteractionBudget(entries,'0',memory.interactionEntryBytes); checks++;
  assert.throws(()=>memory.assertInteractionBudget(entries,'new',2),/内存预算/); checks++;
  eq(entries.size,4);
  const valid=new Set(['kept']);
  const keys=new Set(['kept','removed']);memory.retainInteractionKeys(keys,valid);eq([...keys],['kept']);
  const retained={rows:[1],cursor:'opaque-next-page'}, map=new Map([['kept',retained],['old-session',{}]]);
  memory.retainInteractionKeys(map,valid);eq(map.size,1);eq(map.get('kept'),retained);

  const {enqueueImagePreview:enqueue}=loadTs(base+'image-preview-queue.ts');
  const drain=()=>new Promise(resolve=>setImmediate(resolve));
  const releases=[];let active=0,peak=0,canceledRuns=0,completed=0;
  for(let i=0;i<2;i++)enqueue(()=>{active++;peak=Math.max(peak,active);return new Promise(resolve=>releases.push(()=>{active--;resolve();}));});
  await drain();eq(active,2);
  const controllers=[];
  for(let i=0;i<256;i++){const c=new AbortController();controllers.push(c);eq(enqueue(async()=>{canceledRuns++;},c.signal),true);}
  eq(enqueue(async()=>{}),false);
  // Both admitted previews remain unresolved. Abort must reclaim queued
  // closures/capacity immediately, without waiting for those IPC requests.
  for(const c of controllers)c.abort();
  for(let i=0;i<256;i++)eq(enqueue(async()=>{completed++;}),true);
  eq(enqueue(async()=>{}),false);eq(canceledRuns,0);
  releases.forEach(release=>release());await drain();await drain();eq(completed,256);eq(peak,2);eq(canceledRuns,0);
  enqueue(()=>{throw Error('synthetic synchronous rejection');});
  enqueue(async()=>{throw Error('synthetic async rejection');});
  enqueue(async()=>{completed++;});await drain();eq(completed,257);
  const aborted=new AbortController();aborted.abort();eq(enqueue(async()=>{canceledRuns++;},aborted.signal),false);
  const early=new AbortController();enqueue(async()=>{canceledRuns++;},early.signal);early.abort();await drain();eq(canceledRuns,0);
  let attached=0;
  const c=new AbortController(),add=c.signal.addEventListener.bind(c.signal),remove=c.signal.removeEventListener.bind(c.signal);
  c.signal.addEventListener=(...args)=>{attached++;return add(...args);};c.signal.removeEventListener=(...args)=>{attached--;return remove(...args);};
  enqueue(async()=>{},c.signal);await drain();eq(attached,0);
  console.log(JSON.stringify({interactionMemoryChecks:checks,realPlatformCalls:0,queueCancellationWhileIpcPending:true,serializedBytesMatchUtf8:true}));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
