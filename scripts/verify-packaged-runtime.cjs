// Execute only Electron's Node-mode version probe, never the application UI.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
function verify(executable, expected, spawn = require('node:child_process').spawnSync) {
  assert(/^\d+\.\d+\.\d+$/.test(expected), 'Expected a pinned Electron version');
  const result = spawn(executable, ['-e', 'console.log(process.versions.electron)'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', windowsHide: true, timeout: 10000,
  });
  assert.equal(result.status, 0, result.error?.message || result.stderr || 'Runtime probe failed');
  assert.equal(result.stdout.trim(), expected, 'Packaged Electron differs from the declared version');
  return { passed: true, electron: expected, applicationStarted: false };
}
module.exports = { verify };
if (require.main === module) {
  const executable = process.argv[2], pkg = require('../package.json');
  assert(executable && path.isAbsolute(executable) && fs.statSync(executable).isFile(), 'Absolute packaged executable required');
  assert.equal(pkg.build.electronVersion, pkg.devDependencies.electron);
  console.log(JSON.stringify(verify(executable, pkg.build.electronVersion)));
}
