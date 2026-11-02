const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { guardQaConsolePipes } = require('./qa-console-pipe.cjs');
let checks = 0;
const stdout = new EventEmitter(), stderr = new EventEmitter(), exits = [];
const dispose = guardQaConsolePipes({ stdout, stderr, exit: code => exits.push(code) });
assert.equal(stdout.listenerCount('error'), 1); checks++;
stdout.emit('error', Object.assign(new Error('closed stdout'), { code: 'EPIPE' }));
assert.deepEqual(exits, [1]); checks++;
stderr.emit('error', Object.assign(new Error('closed stderr'), { code: 'EPIPE' }));
assert.deepEqual(exits, [1]); checks++;
assert.throws(() => stdout.emit('error', Object.assign(new Error('real fault'), { code: 'EIO' })), /real fault/); checks++;
dispose(); assert.equal(stdout.listenerCount('error'), 0); assert.equal(stderr.listenerCount('error'), 0); checks += 2;
async function closedReaderTest(mode) {
  const root = path.resolve(__dirname, '..');
  const child = spawn(path.join(root, '.desktop-deps/node_modules/electron/dist/electron.exe'), [path.join(__dirname, 'qa-console-pipe-fixture.cjs'), ...(mode === 'stderr' ? ['--qa-stderr'] : [])], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let ready = false, remaining = '';
  child.stdout.on('data', chunk => {
    remaining += chunk.toString();
    if (!ready && remaining.includes('fixture-ready')) { ready = true; child[mode].destroy(); }
  });
  if (mode === 'stdout') child.stderr.resume();
  else child.stderr.on('data', () => {});
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(Error('Disposable QA did not exit after its pipe closed')); }, 15000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code, signal) => { clearTimeout(timeout); resolve({ code, signal }); });
  });
  assert.equal(ready, true); assert.equal(result.code, 1); assert.equal(result.signal, null); checks += 3;
}
(async () => {
  await closedReaderTest('stdout');
  await closedReaderTest('stderr');
  console.log(JSON.stringify({ qaConsolePipeChecks: checks, realElectronClosedPipes: 2, noWindowFixture: true, brokenPipeExitsAsFailure: true, installedAppOrUserDataTouched: false }));
})().catch(error => { console.error(error); process.exitCode = 1; });
