const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { signAsync } = require('@electron/osx-sign');

async function main() {
  const app = process.argv[2];
  assert(process.platform === 'darwin' && path.isAbsolute(app) && app.endsWith('/远效.app'));
  assert(fs.statSync(path.join(app, 'Contents/Info.plist')).isFile());
  const identity = process.env.MATRIX_MAC_SIGN_IDENTITY || '-';
  assert(identity === '-' || /^[0-9a-f]{40}$/i.test(identity));
  if (identity !== '-') {
    const available = execFileSync('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' });
    assert(available.split('\n').some(line => line.trim().split(/\s+/)[1]?.toLowerCase() === identity.toLowerCase()), 'Configured signing identity is unavailable');
  }
  await signAsync({
    app, identity, platform: 'darwin', type: 'development', identityValidation: false,
    gatekeeperAssess: false, optionsForFile: () => ({ hardenedRuntime: false, timestamp: 'none' }),
  });
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  console.log(JSON.stringify({ signed: true, signingKind: identity === '-' ? 'ad-hoc' : 'local-development', notarized: false }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
