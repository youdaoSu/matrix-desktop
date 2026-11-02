// Actual loader with in-memory HTTP responses; no application/backend starts.
const assert = require('node:assert/strict'), path = require('node:path');
const {loadTs} = require('./qa-load-typescript.cjs');
const cache = new Map(), root = path.resolve(__dirname, '..');
let owner = 'qa-owner', token = 'qa-token', calls = [], handler;
cache.set(path.join(root, 'client/src/api/index.ts'), {exports: {getUser: () => owner ? {id: owner} : null, getAuthToken: () => token, axiosForBackend: {get: (...args) => {calls.push(args); return handler(...args);}}}});
const {loadPublishAccounts: load} = loadTs('client/src/components/workspace/publish-preferences.ts', cache);
const result = (items, total = items.length) => ({data: {data: {items, total}}});
(async () => {
  let checks = 0;
  handler = async (_url, {params}) => result(Array.from({length: params.page === 1 ? 100 : 2}, (_, i) => ({id: params.page === 2 ? 'id-' + (i + (calls.length<=2?99:100)) : 'id-' + i})), 102);
  const accounts = await load(); assert.equal(accounts.length, 102,'An overlapping snapshot must not silently omit an account'); assert.deepEqual(calls.map(call => call[1].params.page), [1, 2, 1, 2]); assert.ok(calls.every(call => call[1].signal instanceof AbortSignal)); checks += 3;
  calls=[];handler=async(_url,{params})=>result(Array.from({length:params.page===1?100:2},(_,i)=>({id:'id-'+(params.page===1?i:i+99)})),102);
  await assert.rejects(load(),/账号列表.*变化|分页.*不一致/);assert.deepEqual(calls.map(call=>call[1].params.page),[1,2,1,2]);checks+=2;
  calls=[];handler=async(_url,{params})=>result(Array.from({length:params.page===1?100:1},(_,i)=>({id:'id-'+(params.page===1?i:i+100)})),params.page===1?102:101);
  await assert.rejects(load(),/账号列表.*变化|分页.*不一致/);assert.equal(calls.length,4);checks+=2;
  for(const items of [[null],[{id:''}],[{id:23}],[{nickname:'missing id'}],Array.from({length:101},(_,i)=>({id:'id-'+i}))]){handler=async()=>result(items);await assert.rejects(load(),/响应不完整/);checks++;}
  handler=async()=>result([{id:'extra'}],0);await assert.rejects(load(),/响应不完整|分页.*不一致|账号列表.*变化/);checks++;
  for (const change of [() => owner = 'qa-other', () => token = 'qa-new-token']) {
    owner = 'qa-owner'; token = 'qa-token'; calls = [];
    handler = async () => {change(); return result(Array.from({length: 100}, (_, i) => ({id: 'old-' + i})), 101);};
    await assert.rejects(load(), /登录用户已变化/); assert.equal(calls.length, 1); checks += 2;
  }
  owner = 'qa-owner'; token = 'qa-token'; calls = [];
  const cancelled = new AbortController(); cancelled.abort(); await assert.rejects(load({signal: cancelled.signal}), /取消或超时/); assert.equal(calls.length, 0); checks += 2;
  const during = new AbortController(); let pendingSignal;
  handler = (_url, options) => {pendingSignal = options.signal; return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('raw adapter cancellation')), {once: true}));};
  const pending = load({signal: during.signal}); during.abort(); await assert.rejects(pending, /取消或超时/); assert.equal(pendingSignal.aborted, true); checks += 2;
  const originalTimer = global.setTimeout; let expire;
  try {
    global.setTimeout = (fn, ms, ...args) => {if (ms === 20000) expire = fn; return originalTimer(fn, ms, ...args);};
    const timeout = load(); assert.equal(typeof expire, 'function'); expire(); await assert.rejects(timeout, /取消或超时/); checks += 2;
  } finally {global.setTimeout = originalTimer;}
  // Abort must end the renderer's wait even if a defective HTTP adapter ignores
  // AbortSignal. Returning a timeout is not permission to start a second read.
  try {
    global.setTimeout=(fn,ms,...args)=>{if(ms===20000)expire=fn;return originalTimer(fn,ms,...args);};
    handler=()=>new Promise(()=>{});const stuck=load();expire();
    await Promise.race([assert.rejects(stuck,/取消或超时/),new Promise((_,reject)=>originalTimer(()=>reject(Error('Uncooperative account adapter held the whole load')),50))]);checks++;
  } finally {global.setTimeout=originalTimer;}
  let sharedDeadlineTimers=0;calls=[];
  try {
    global.setTimeout=(fn,ms,...args)=>{if(ms===20000){expire=fn;sharedDeadlineTimers++;}return originalTimer(fn,ms,...args);};
    handler=async(_url,{params})=>{
      if(calls.length===3){expire();return new Promise(()=>{});}
      return result(Array.from({length:params.page===1?100:2},(_,i)=>({id:'retry-'+(params.page===1?i:i+99)})),102);
    };
    await assert.rejects(load(),/取消或超时/);assert.equal(sharedDeadlineTimers,1);assert.equal(calls.length,3);assert.equal(calls[2][1].signal.aborted,true);checks+=4;
  } finally {global.setTimeout=originalTimer;}
  for (const total of [undefined, -1, 1.2, '2', NaN]) {handler = async () => ({data: {data: {items: [], total}}}); await assert.rejects(load(), /响应不完整/); checks++;}
  handler = async () => result([]); assert.deepEqual(await load(), []); checks++;
  handler=async()=>result([{id:'incomplete'}],2);await assert.rejects(load(),/分页不完整/);checks++;
  owner = ''; calls = []; await assert.rejects(load(), /先登录/); assert.equal(calls.length, 0); checks += 2;
  console.log(JSON.stringify({accountListLifecycleChecks: checks,realLoader:true,ownerAndTokenChangesStopPagination:true,cancellationAndWholeLoadDeadline:true,malformedResponsesRejected:true,servicesStarted:false,realPlatformActions:false}));
})().catch(error => {console.error(error); process.exitCode = 1;});
