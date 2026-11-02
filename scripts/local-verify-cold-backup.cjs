// Read-only verification after installation and before reopening the real app.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const data = 'C:\\Users\\10985\\AppData\\Roaming\\fullstack-nestjs-template';
const backup = path.resolve(process.argv[2] || '');
assert.ok([path.join(data, 'backups'), 'D:\\MatrixUserBackups', 'E:\\远效\\备份'].some(root => path.dirname(backup).toLowerCase() === root.toLowerCase()), 'Unapproved backup parent');
assert.equal(fs.lstatSync(path.dirname(backup)).isSymbolicLink(), false, 'Backup parent must not be a link');
assert.equal(fs.lstatSync(backup).isSymbolicLink(), false, 'Backup must not be a link');
assert.match(path.basename(backup), /^before-update-rc\.\d+-\d{8}-\d{6}$/);
assert.equal(fs.existsSync(path.join(data, 'database', 'postmaster.pid')), false, 'Close Matrix before comparing its cold backup');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const stack = [backup];
let files = 0, bytes = 0;
while (stack.length) {
  const folder = stack.pop();
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    assert.equal(entry.isSymbolicLink(), false, 'Unexpected symlink in cold backup');
    const copy = path.join(folder, entry.name);
    if (entry.isDirectory()) { stack.push(copy); continue; }
    assert.equal(entry.isFile(), true);
    const original = path.join(data, path.relative(backup, copy));
    assert.equal(original.startsWith(data + path.sep), true);
    assert.equal(fs.statSync(original).size, fs.statSync(copy).size, 'User-data size changed during installation');
    assert.equal(hash(original), hash(copy), 'User-data contents changed during installation');
    files++; bytes += fs.statSync(copy).size;
  }
}
assert.ok(files > 0);
console.log(JSON.stringify({ files, bytes, allBackedUpUserDataUnchangedAfterInstall: true, readOnly: true, fileContentsReported: false }));
