// Real public SDK, isolated child processes and synthetic callbacks only.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const packagedIndex = process.argv.indexOf('--packaged');
const packaged = packagedIndex >= 0;
const packageArgs = packaged ? process.argv.slice(packagedIndex, packagedIndex + 4) : [];

if (process.argv[2] === '--child') {
  (async () => {
    const desktop = process.argv[3] === 'desktop';
    let policy, local;
    if (packaged) {
      assert(process.versions.electron, 'Package fixture needs Electron ASAR resolution');
      const [, archive, expectedHash, runtime] = packageArgs;
      const actual = crypto.createHash('sha256').update(require('original-fs').readFileSync(archive)).digest('hex');
      assert.equal(actual, expectedHash);
      local = createRequire(path.join(archive, 'package.json'));
      policy = require(path.join(runtime, 'common/desktop-log-policy.js'));
    } else {
      local = createRequire(path.join(root, 'package.json'));
      const code = local('typescript').transpileModule(fs.readFileSync(path.join(root, 'server/common/desktop-log-policy.ts'), 'utf8'), {
        compilerOptions: { module: local('typescript').ModuleKind.CommonJS },
      }).outputText;
      policy = {};
      vm.runInNewContext(code, { exports: policy });
    }
    process.env.MATRIX_DESKTOP = desktop ? '1' : '0';
    process.env.OTEL_TRACES_SAMPLER = 'always_on';
    const before = { ...process.env };
    assert.equal(policy.prepareDesktopLogEnvironment(process.env), desktop);
    assert.equal(process.env.OTEL_TRACES_SAMPLER, desktop ? 'always_off' : 'always_on');
    if (!desktop) assert.deepEqual({ ...process.env }, before);
    assert.equal(process.env.NODE_ENV, 'production');
    const { appSdk } = local('@lark-apaas/observable');
    appSdk.start();
    let calls = 0;
    for (let i = 0; i < 100; i++) {
      assert.equal(appSdk.trace('synthetic-query', span => {
        span.setAttribute('db.statement', 'select synthetic_value');
        calls++;
        return i;
      }), i);
    }
    assert.equal(await appSdk.trace('synthetic-async', async () => { calls++; return 42; }), 42);
    const failure = new Error('SYNTHETIC_EXPECTED_FAILURE');
    assert.throws(() => appSdk.trace('synthetic-throw', () => { calls++; throw failure; }), error => error === failure);
    await assert.rejects(appSdk.trace('synthetic-reject', async () => { calls++; throw failure; }), error => error === failure);
    const parent = appSdk.startRootTrace({
      'rpc-persist-apaas-observability-trace': '12345678901234567890123456789012-1234567890123456',
    }, 'synthetic-sampled-parent');
    assert.equal(parent.isRecording(), !desktop);
    parent.end();
    appSdk.log('warn', 'SYNTHETIC_WARNING_RETAINED');
    appSdk.log('error', 'SYNTHETIC_ERROR_RETAINED');
    await appSdk.flush();
    console.log('TRACE_POLICY_RESULT=' + JSON.stringify({ calls, desktop, packaged, errorPropagation: true }));
  })().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const results = [];
  for (const mode of ['hosted', 'desktop']) {
    const executable = packaged ? path.join(root, '.desktop-deps/node_modules/electron/dist/electron.exe') : process.execPath;
    const result = spawnSync(executable, [__filename, '--child', mode, ...packageArgs], {
      cwd: root, windowsHide: true, encoding: 'utf8', timeout: 30000,
      env: { ...process.env, NODE_ENV: 'production', ...(packaged ? { ELECTRON_RUN_AS_NODE: '1' } : {}) },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    const marker = result.stdout.split(/\r?\n/).find(line => line.startsWith('TRACE_POLICY_RESULT='));
    const summary = JSON.parse(marker.slice('TRACE_POLICY_RESULT='.length));
    assert.equal(summary.calls, 103);
    const traces = (result.stdout.match(/force-trace-prefix/g) || []).length;
    assert.equal(traces, mode === 'hosted' ? 104 : 0);
    assert(result.stdout.includes('SYNTHETIC_WARNING_RETAINED'));
    assert(result.stdout.includes('SYNTHETIC_ERROR_RETAINED'));
    results.push({ ...summary, traces, warningAndErrorRetained: true, outputBytes: Buffer.byteLength(result.stdout) });
  }
  console.log(JSON.stringify({ passed: true, actualSdk: true, packaged, results, platformActions: 0, serverOrDatabaseStarted: false }));
}
