const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeLocalJson } = require('../desktop/local-json-store.cjs');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-json-store-qa-'));
const file = path.join(profile, 'workspaces.json');
let checks = 0;
const original = [{ ownerId: 'fixture-a', provider: 'kuaishou', name: 'Original' }];
const updated = [...original, { ownerId: 'fixture-b', provider: 'toutiao', name: 'Second' }];
const exdev = () => { throw Object.assign(Error('isolated EXDEV'), { code: 'EXDEV' }); };
try {
  writeLocalJson(file, original);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), original); checks++;
  writeLocalJson(file, updated, { ...fs, renameSync: exdev });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), updated); checks++;
  assert.deepEqual(JSON.parse(fs.readFileSync(file + '.previous', 'utf8')), original); checks++;
  assert.equal(fs.readdirSync(profile).filter(name => name.endsWith('.tmp')).length, 0); checks++;
  const preserved = fs.readFileSync(file, 'utf8');
  assert.throws(() => writeLocalJson(file, original, { ...fs, renameSync() { throw Object.assign(Error('isolated permission error'), { code: 'EACCES' }); } })); checks++;
  assert.equal(fs.readFileSync(file, 'utf8'), preserved); checks++;
  assert.throws(() => writeLocalJson(file, original, { ...fs, renameSync: exdev, copyFileSync(_from, to) { fs.writeFileSync(to, '[partial'); throw Error('isolated interrupted copy'); } })); checks++;
  assert.equal(fs.readFileSync(file, 'utf8'), preserved); checks++;
  assert.equal(fs.readFileSync(file + '.previous', 'utf8'), preserved); checks++;
  assert.throws(() => writeLocalJson(file, original, { ...fs, renameSync: exdev, copyFileSync(_from, to) { fs.writeFileSync(to, '[]'); } })); checks++;
  assert.equal(fs.readFileSync(file, 'utf8'), preserved); checks++;
  const first = path.join(profile, 'first.json');
  writeLocalJson(first, original, { ...fs, renameSync: exdev });
  assert.deepEqual(JSON.parse(fs.readFileSync(first, 'utf8')), original); checks++;
  const broken = path.join(profile, 'failed-first.json');
  assert.throws(() => writeLocalJson(broken, original, { ...fs, renameSync: exdev, copyFileSync(_from, to) { fs.writeFileSync(to, '[partial'); throw Error('isolated copy error'); } })); checks++;
  assert.deepEqual(JSON.parse(fs.readFileSync(broken, 'utf8')), []); checks++;
  assert.equal(fs.readdirSync(profile).filter(name => name.endsWith('.tmp')).length, 0); checks++;
  assert.throws(() => writeLocalJson(profile, original)); checks++;
  assert.throws(() => writeLocalJson(file, undefined)); checks++;
  assert.equal(fs.readFileSync(file, 'utf8'), preserved); checks++;
  // A failed recovery copy must stop before replacing the existing data.
  const descriptors = new Map(); let copies = 0;
  assert.throws(() => writeLocalJson(file, original, { ...fs, renameSync: exdev,
    openSync(target, ...args) { const descriptor = fs.openSync(target, ...args); descriptors.set(descriptor, target); return descriptor; },
    fsyncSync(descriptor) { if (descriptors.get(descriptor) === file + '.previous') throw Error('isolated backup sync failure'); return fs.fsyncSync(descriptor); },
    copyFileSync(...args) { copies++; return fs.copyFileSync(...args); }
  })); checks++;
  assert.equal(copies, 0); checks++;
  assert.equal(fs.readFileSync(file, 'utf8'), preserved); checks++;
  writeLocalJson(file, original, { ...fs, renameSync: exdev, unlinkSync() { throw Error('isolated temporary cleanup failure'); } });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), original); checks++;
  console.log(JSON.stringify({ localJsonStorageChecks: checks, simulatedWindowsExdev: true, oldRecordsPreservedOnFailure: true, realUserDataTouched: false }));
} finally {
  assert.equal(path.dirname(profile), os.tmpdir());
  assert.ok(path.basename(profile).startsWith('matrix-json-store-qa-'));
  fs.rmSync(profile, { recursive: true, force: true });
}
