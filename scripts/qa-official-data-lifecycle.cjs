// Main-process boundary tests with inert guest and authentication fixtures.
const assert = require('node:assert/strict');
const {registerOfficialData} = require('../desktop/official-data.cjs');
function fixture(options = {}) {
  let action, execute, executeCount = 0, lastNonce, contextCalls = 0;
  const first = {id: 12, getURL: () => 'https://creator.douyin.com/publish', isDestroyed: () => false, executeJavaScriptInIsolatedWorld: async (_world, scripts) => {
    executeCount++; lastNonce = /"nonce":"([^"]+)"/.exec(scripts[0].code)[1]; return execute(lastNonce);
  }};
  const second = {...first, id: 13};
  let contextHandler = async (_event, input) => {contextCalls++; return {guest: input.accountId === 'qa-other' ? second : first, auth: {userId: 'qa-owner'}};};
  registerOfficialData({ipcMain: {handle: (_name, handler) => action = handler}, context: (...args) => contextHandler(...args), readTimeoutMs: 5, ...options});
  return {call: (command, patch = {}) => action({}, {accountId: 'qa-account', field: '音乐', kind: 'messages', command, ...patch}), set execute(handler) {execute = handler;}, set context(handler) {contextHandler = handler;}, get executions() {return executeCount;}, get nonce() {return lastNonce;}, get contexts() {return contextCalls;}};
}
(async () => {
  let checks = 0, f = fixture(), release;
  f.execute = () => new Promise(resolve => release = resolve);
  const timedOut = await f.call('read-interactions'); assert.match(timedOut.error, /读取超过等待上限/); checks++;
  f.execute = async () => ({records: [{platformId: 'qa-visible'}]}); assert.equal((await f.call('read-interactions')).records.length, 1); checks++;
  release({records: [{platformId: 'qa-late'}]}); await new Promise(resolve => setImmediate(resolve)); assert.equal(f.executions, 2); checks++;
  f = fixture(); f.execute = () => new Promise(resolve => release = resolve);
  const failedOptions = await f.call('options'), oldNonce = f.nonce; assert.match(failedOptions.error, /读取超过等待上限/); release({items: [{index: 0, label: 'late'}]}); await new Promise(resolve => setImmediate(resolve));
  assert.ok((await f.call('select-option', {nonce: oldNonce, index: 0})).error); assert.equal(f.executions, 1); checks += 3;
  f = fixture(); f.execute = async nonce => ({nonce, items: [{index: 0, label: 'QA music'}], applied: true});
  const options = await f.call('options'); assert.ok((await f.call('select-option', {nonce: options.nonce, field: '商品', index: 0})).error); assert.equal(f.executions, 1); checks += 2;
  const fresh = await f.call('options'); assert.equal((await f.call('select-option', {nonce: fresh.nonce, index: 0})).applied, true); checks++;
  f = fixture(); f.execute = () => new Promise(resolve => release = resolve);
  let settled = false; const mutation = f.call('open-options').then(result => {settled = true; return result;});
  await new Promise(resolve => setTimeout(resolve, 15)); assert.equal(settled, false, 'A timeout must not unlock a still-pending official click');
  assert.match((await f.call('read-interactions')).error, /仍未结束/); assert.equal(f.executions, 1); checks += 3;
  f.execute = async () => ({records: []}); assert.deepEqual((await f.call('read-interactions', {accountId: 'qa-other'})).records, []); checks++;
  release({opened: true}); assert.equal((await mutation).opened, true); assert.deepEqual((await f.call('read-interactions')).records, []); checks += 2;
  f = fixture(); const before = f.contexts;
  for (const patch of [{command: 'send-message'}, {field: '发布'}, {command: 'read-interactions', kind: 'unknown'}]) assert.ok((await f.call('options', patch)).error);
  assert.equal(f.contexts, before); assert.equal(f.executions, 0); checks += 5;
  const originalNow = Date.now; let now = originalNow();
  try {Date.now = () => now; f.context = async () => {now += 20001; return {guest: {}, auth: {userId: 'qa-owner'}};}; assert.match((await f.call('options')).error, /连接超时.*未执行/); assert.equal(f.executions, 0); checks += 2;}
  finally {Date.now = originalNow;}
  // The total read deadline includes authentication and post-read owner proof,
  // not only DOM evaluation. Late read-only replies cannot acquire a lock or
  // return a snapshot after the caller has already timed out.
  f=fixture({readDeadlineMs:20});let releaseContext;
  f.context=()=>new Promise(resolve=>releaseContext=resolve);
  const slowContext=await f.call('read-interactions');assert.match(slowContext.error,/官方页面连接.*超时/);assert.equal(f.executions,0);checks+=2;
  releaseContext({guest:{id:99},auth:{userId:'qa-owner'}});await new Promise(resolve=>setImmediate(resolve));assert.equal(f.executions,0);checks++;
  let releaseProof;f=fixture({readDeadlineMs:20,verifyRead:()=>new Promise(resolve=>releaseProof=resolve)});f.execute=async()=>({records:[{platformId:'never-return-unverified'}]});
  const slowProof=await f.call('read-interactions');assert.match(slowProof.error,/核验互动记录所属账号ID.*超时/);assert.equal(slowProof.records,undefined);checks+=2;
  releaseProof();await new Promise(resolve=>setImmediate(resolve));
  f=fixture({verifyRead:async()=>{throw Error('本人ID已变化');}});f.execute=async()=>({records:[{platformId:'foreign'}]});const changed=await f.call('read-interactions');assert.match(changed.error,/本人ID已变化/);assert.equal(changed.records,undefined);checks+=2;
  console.log(JSON.stringify({officialDataLifecycleChecks: checks,pureReadsHaveDeadline:true,lateReadCannotCreateSelectablePlan:true,fieldScopedNonce:true,uncertainClicksRetainPerGuestLock:true,otherGuestsIndependent:true,lateAuthenticationCannotTriggerAnAction:true,realPlatformActions:false}));
})().catch(error => {console.error(error); process.exitCode = 1;});
