// OS-owned startup leases and loopback HTTP fixtures only. No Matrix profile,
// database, platform page, official posting or installed app is touched.
const assert = require('node:assert/strict'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { fork } = require('node:child_process'), { randomBytes, randomUUID } = require('node:crypto'), { EventEmitter } = require('node:events');
const { startupLeaseEndpoint, withStartupLease, selectStartupPort } = require('../desktop/startup-lease.cjs');
const { waitForOwnedServer } = require('../desktop/startup-readiness.cjs');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const scope = path.join(os.tmpdir(), 'matrix-qa-lease-' + randomUUID()), children = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let checks = 0;
const fakeChild = () => Object.assign(new EventEmitter(), { exitCode: null, killed: false });
const fixture = async handler => { const server = http.createServer(handler); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return { server, url: 'http://127.0.0.1:' + server.address().port + '/app/', close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) }; };
async function childLease(label) {
  const child = fork(path.join(__dirname, 'qa-startup-lease-child.cjs'), [scope], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] }); children.push(child);
  const messages = []; child.on('message', item => messages.push(item));
  const until = async type => { const end = Date.now() + 6000; while (Date.now() < end) { const value = messages.find(m => m.type === type); if (value) return value; if (messages.some(m => m.type === 'failed')) throw Error(label + ': ' + messages.find(m => m.type === 'failed').message); await pause(10); } throw Error(label + ' no ' + type); };
  return { child, messages, until };
}
(async () => {
  for (const invalid of ['', 'relative', null]) { assert.throws(() => startupLeaseEndpoint(invalid)); checks++; }
  assert.deepEqual(startupLeaseEndpoint(scope), startupLeaseEndpoint(scope.toUpperCase())); checks++;
  let active = 0, maximum = 0, count = 0;
  await Promise.all(Array.from({ length: 8 }, () => withStartupLease(scope, async () => { active++; maximum = Math.max(maximum, active); await pause(15); count++; active--; }, { timeoutMs: 3000, retryMs: 10 })));
  assert.equal(maximum, 1); assert.equal(count, 8); checks += 2;
  const first = await childLease('first'); await first.until('acquired');
  const second = await childLease('second'); await pause(150); assert.equal(second.messages.some(m => m.type === 'acquired'), false); checks++;
  first.child.send({ type: 'release' }); await first.until('released'); await second.until('acquired'); checks++;
  // Only this exact newly spawned QA child is killed, proving OS crash release;
  // no PID-file mutation and no enumeration/termination of a user's process.
  second.child.kill(); await new Promise(resolve => second.child.exitCode !== null || second.child.signalCode !== null ? resolve() : second.child.once('exit', resolve));
  await withStartupLease(scope, async () => { checks++; }, { timeoutMs: 1000, retryMs: 10 });
  await assert.rejects(() => withStartupLease(scope, async () => { throw Error('QA action failure'); }), /QA action failure/); checks++;
  await withStartupLease(scope, async () => { checks++; });
  await withStartupLease(scope, async () => {
    let ran = false; await assert.rejects(() => withStartupLease(scope, () => { ran = true; }, { timeoutMs: 50, retryMs: 10 }), /等待超时/); assert.equal(ran, false); checks += 2;
    const controller = new AbortController(); const waiting = withStartupLease(scope, () => { ran = true; }, { timeoutMs: 1000, retryMs: 10, signal: controller.signal }); controller.abort(); await assert.rejects(() => waiting, /取消/); assert.equal(ran, false); checks += 2;
  });
  const aborted = new AbortController(); aborted.abort(); await assert.rejects(() => withStartupLease(scope, () => assert.fail('Pre-aborted action'), { signal: aborted.signal }), /取消/); checks++;
  for (const timeoutMs of [0, Infinity, 120001]) { await assert.rejects(() => withStartupLease(scope, () => {}, { timeoutMs }), /参数/); checks++; }
  let releaseHeld, enteredHeld;const heldController=new AbortController();const heldEntered=new Promise(resolve=>enteredHeld=resolve);
  const holding=withStartupLease(scope,async()=>{enteredHeld();await new Promise(resolve=>releaseHeld=resolve);},{signal:heldController.signal});await heldEntered;heldController.abort();
  await assert.rejects(()=>withStartupLease(scope,()=>assert.fail('Must not enter before held action ends'),{timeoutMs:40,retryMs:10}),/等待超时/);checks++;releaseHeld();await holding;await withStartupLease(scope,async()=>{checks++;});
  const visited=[];assert.equal(await selectStartupPort(3210,3240,3239,async port=>{visited.push(port);return port===3211;}),3211);assert.deepEqual(visited,[3239,3210,3211]);checks+=2;
  for(const value of [NaN,Infinity,0,3240,3210.5]){assert.equal(await selectStartupPort(3210,3240,value,async port=>port===3210),3210);checks++;}
  let probes=0;assert.equal(await selectStartupPort(35432,35452,35432,async()=>{probes++;return false;}),null);assert.equal(probes,20);checks+=2;
  await assert.rejects(()=>selectStartupPort(3210,3240,3210,async()=>{throw Error('QA denied bind');}),/QA denied/);checks++;
  for(const range of [[0,3],[3,3],[4,3],[1,65537],[1,1002]]){await assert.rejects(()=>selectStartupPort(...range,1,async()=>true),/范围/);checks++;}
  const nonce = randomBytes(32).toString('hex'), options = { timeoutMs: 100, requestMs: 25, retryMs: 10 };
  for (const handler of [(_q, r) => r.end('foreign HTTP 200'), (_q, r) => { r.setHeader('X-Matrix-Startup', randomBytes(32).toString('hex')); r.end('old Matrix'); }, (_q, r) => { r.writeHead(302, { Location: '/login' }); r.end(); }]) {
    const f = await fixture(handler), child = fakeChild();
    try { await assert.rejects(() => waitForOwnedServer(f.url, child, nonce, options), /身份不符/); assert.equal(child.listenerCount('exit'), 0); checks += 2; } finally { await f.close(); }
  }
  const good = await fixture((_q, r) => { r.setHeader('X-Matrix-Startup', nonce); r.end('owned ready'); });
  try { const child = fakeChild(); await waitForOwnedServer(good.url, child, nonce, options); assert.equal(child.listenerCount('error'), 0); assert.equal(child.listenerCount('exit'), 0); checks += 2;
    const dead = fakeChild(); dead.exitCode = 1; await assert.rejects(() => waitForOwnedServer(good.url, dead, nonce, options), /就绪前退出/); checks++;
    for (const value of ['not-a-nonce', '', nonce.toUpperCase()]) { await assert.rejects(() => waitForOwnedServer(good.url, fakeChild(), value, options), /参数/); checks++; }
  } finally { await good.close(); }
  const stalled = await fixture(() => {});
  try {
    const child = fakeChild(), waiting = waitForOwnedServer(stalled.url, child, nonce, { timeoutMs: 2000, requestMs: 1000, retryMs: 10 }); await pause(15); child.exitCode = 7; child.emit('exit', 7); await assert.rejects(() => waiting, /就绪前退出（7）/); assert.equal(child.listenerCount('error'), 0); checks += 2;
    const broken = fakeChild(), pending = waitForOwnedServer(stalled.url, broken, nonce, options); broken.emit('error', Error('QA secret must not leak')); await assert.rejects(() => pending, error => /无法启动/.test(error.message) && !error.message.includes('QA secret')); checks++;
    await assert.rejects(() => waitForOwnedServer(stalled.url, fakeChild(), nonce, options), /启动超时/); checks++;
  } finally { await stalled.close(); }
  for (const url of ['not a URL','https://127.0.0.1/app/', 'http://localhost/app/', 'http://127.0.0.1/other', 'http://a:b@127.0.0.1/app/', 'http://127.0.0.1/app/?key=secret']) { await assert.rejects(() => waitForOwnedServer(url, fakeChild(), nonce, options), /参数/); checks++; }
  // Execute the actual main-process lifecycle functions without loading
  // Electron or starting/stopping any real database. Late verified ownership
  // must remain tracked and be stopped if normal quit already began.
  const source=fs.readFileSync(path.join(__dirname,'../desktop/main.cjs'),'utf8'),syntax=ts.createSourceFile('main.cjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const names=['assertStartupActive','stopEmbeddedDatabase','retainOwnedDatabase','watchMainWindowClose','startupWindowClosing','handleStartupFailure'];const declarations=syntax.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.includes(node.name?.text));assert.equal(declarations.length,6);checks++;
  const startupDialogs=[],quitCalls=[];
  const stopCalls=[],lifecycle={app:{isQuitting:false,quit:()=>quitCalls.push(true)},dialog:{showErrorBox:(title,message)=>startupDialogs.push({title,message}),showMessageBox:async(_win,options)=>startupDialogs.push(options)},setImmediate,AbortController,startupAbort:new AbortController(),databaseControl:null,mainWindow:null,closingMainWindows:new WeakSet(),spawnSync:(file,args,options)=>{stopCalls.push({file,args,options});return{status:0};}};
  vm.createContext(lifecycle);vm.runInContext(declarations.map(node=>node.getText(syntax)).join('\n'),lifecycle);
  const owned={pgCtl:'QA-only-pg_ctl.exe',dataDir:path.join(scope,'owned'),port:35432};assert.equal(lifecycle.retainOwnedDatabase(owned),owned);assert.equal(lifecycle.databaseControl,owned);assert.equal(stopCalls.length,0);checks+=3;
  lifecycle.stopEmbeddedDatabase();assert.equal(lifecycle.databaseControl,null);assert.deepEqual([...stopCalls[0].args],['-D',owned.dataDir,'-m','fast','-w','-t','12','stop']);assert.equal(stopCalls[0].options.timeout,15000);checks+=3;
  lifecycle.app.isQuitting=true;assert.throws(()=>lifecycle.retainOwnedDatabase(owned),/取消/);assert.equal(lifecycle.databaseControl,null);assert.equal(stopCalls.length,2);checks+=3;
  lifecycle.app.isQuitting=false;lifecycle.startupAbort.abort();assert.throws(()=>lifecycle.retainOwnedDatabase(owned),/取消/);assert.equal(lifecycle.databaseControl,null);checks+=2;
  lifecycle.spawnSync=()=>({status:1});lifecycle.startupAbort=new AbortController();lifecycle.retainOwnedDatabase(owned);assert.throws(()=>lifecycle.stopEmbeddedDatabase(),/not confirmed/);assert.equal(lifecycle.databaseControl,owned);checks+=2;
  assert.equal(lifecycle.startupWindowClosing(),false);checks++;
  const closingWindow=Object.assign(new EventEmitter(),{webContents:Object.assign(new EventEmitter(),{isDestroyed:()=>false}),isDestroyed:()=>false});lifecycle.mainWindow=closingWindow;lifecycle.watchMainWindowClose(closingWindow);
  assert.equal(lifecycle.startupWindowClosing(),false);closingWindow.emit('close');assert.equal(lifecycle.startupWindowClosing(),true);checks+=2;
  closingWindow.webContents.emit('will-prevent-unload');assert.equal(lifecycle.startupWindowClosing(),false);checks++;
  closingWindow.isDestroyed=()=>true;assert.equal(lifecycle.startupWindowClosing(),true);checks++;
  lifecycle.mainWindow=null;lifecycle.app.isQuitting=true;assert.equal(lifecycle.startupWindowClosing(),true);checks++;
  lifecycle.app.isQuitting=false;closingWindow.isDestroyed=()=>false;lifecycle.mainWindow=closingWindow;
  setImmediate(()=>closingWindow.emit('close'));
  await lifecycle.handleStartupFailure(Error('QA navigation aborted during native close'));
  assert.equal(startupDialogs.length,0);assert.equal(quitCalls.length,1);checks+=2;
  closingWindow.webContents.emit('will-prevent-unload');await lifecycle.handleStartupFailure(Error('QA genuine startup failure'));
  assert.equal(startupDialogs.length,1);assert.match(startupDialogs[0].message,/genuine startup failure/);assert.equal(quitCalls.length,2);checks+=3;
  let pendingDialog;const dialogEntered=new Promise(resolve=>pendingDialog=resolve);
  lifecycle.dialog.showMessageBox=async(_win,options)=>{pendingDialog(options);return new Promise(resolve=>options.signal.addEventListener('abort',()=>resolve({response:0}),{once:true}));};
  const lateClose=lifecycle.handleStartupFailure(Error('QA late native teardown'));const optionsOnClose=await dialogEntered;closingWindow.emit('closed');await lateClose;
  assert.equal(optionsOnClose.signal.aborted,true);assert.equal(quitCalls.length,3);assert.equal(closingWindow.listenerCount('closed'),1);assert.equal(closingWindow.webContents.listenerCount('destroyed'),0);checks+=4; // Only the permanent normal-close cleanup hook remains.
  console.log(JSON.stringify({startupLeaseAndOwnedReadinessChecks: checks,realCrossProcessContention:true,qaChildCrashRelease:true,boundedWaitingAndAbort:true,foreignHttpAndOldNonceNotAccepted:true,databasesOrAppServicesStarted:false,realUserDataTouched:false,officialActions:false}));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill(); });
