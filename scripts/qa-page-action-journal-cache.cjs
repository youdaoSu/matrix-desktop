const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { performance } = require('node:perf_hooks');
const { createJournal } = require('../desktop/page-actions.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-journal-cache-'));
const file = path.join(directory, 'page-actions.jsonl');
const originalRead = fs.readSync;
let reads = 0, checks = 0;
fs.readSync = function (...args) { reads++; return originalRead.apply(this, args); };
const row = (id, extra = {}) => ({ id, ownerId: 'owner-a', kind: 'publish', status: 'unknown', message: '尚未确认中文头像😀', createdAt: '2026-10-29T00:00:00Z', evidence: { title: '真实记录' }, ...extra });
try {
  const journal = createJournal(directory);
  assert.equal(journal.find('owner-a', 'old'), undefined); checks++;
  const rows = Array.from({ length: 10000 }, (_, i) => row(String(i), { createdAt: new Date(1700000000000 + i * 1000).toISOString(), summary: '模拟历史记录'.repeat(20) }));
  fs.writeFileSync(file, rows.map(JSON.stringify).join('\n') + '\n');
  const start = performance.now();
  assert.equal(journal.list('owner-a').length, 200);
  assert.equal(journal.find('owner-a', '0').id, '0');
  assert.equal(journal.history('owner-a', '0').length, 1); checks += 3;
  const coldMs = performance.now() - start, warmStart = performance.now(), beforeWarm = reads;
  for (let i = 0; i < 100; i++) { journal.list('owner-a'); journal.find('owner-a', '0'); journal.history('owner-a', '0'); }
  const warmMs = performance.now() - warmStart;
  assert.equal(reads, beforeWarm, '300 unchanged queries perform zero journal content reads'); checks++;
  const detached = journal.find('owner-a', '0'); detached.evidence.title = 'must not mutate cache';
  assert.equal(journal.find('owner-a', '0').evidence.title, '真实记录');
  assert.deepEqual(journal.list('foreign-owner'), []); checks += 2;
  journal.write(row('0', { status: 'confirmed' }));
  assert.equal(journal.find('owner-a', '0').status, 'confirmed'); checks++;
  const other = createJournal(directory); other.write(row('0', { status: 'failed' }));
  assert.equal(journal.find('owner-a', '0').status, 'failed'); checks++;
  fs.writeFileSync(file, JSON.stringify(row('new')) + '\n');
  assert.equal(journal.find('owner-a', '0'), undefined); assert.equal(journal.list('owner-a')[0].id, 'new'); checks += 2;
  const replacement = path.join(directory, 'replacement.jsonl');
  fs.writeFileSync(replacement, JSON.stringify(row('alt')) + '\n');
  fs.renameSync(replacement, file);
  assert.equal(journal.list('owner-a')[0].id, 'alt'); checks++;
  // Completion of an interrupted UTF-8 trailing record must invalidate cache.
  const encoded = Buffer.from(JSON.stringify(row('partial')) + '\n'), split = encoded.indexOf(Buffer.from('中')) + 1;
  fs.appendFileSync(file, encoded.subarray(0, split));
  assert.equal(journal.find('owner-a', 'partial'), undefined);
  fs.appendFileSync(file, encoded.subarray(split));
  assert.equal(journal.find('owner-a', 'partial').message, row('partial').message); checks += 2;
  // Every byte boundary around the 64 KiB decoder chunk, including multibyte.
  for (let i = 0; i < 4; i++) {
    fs.writeFileSync(file, ' '.repeat(65536 - i) + JSON.stringify(row('boundary')) + '\ninvalid\nnull\n');
    assert.equal(journal.find('owner-a', 'boundary').message, row('boundary').message); checks++;
  }
  for (let i = 0; i < 100; i++) journal.write(row('history', { message: String(i) }));
  assert.equal(journal.history('owner-a', 'history').length, 80);
  assert.equal(journal.history('owner-a', 'history')[0].message, '20'); checks += 2;
  for (let i = 0; i < 17; i++) journal.find('owner-a', 'evicted-' + i);
  const beforeEviction = reads; journal.find('owner-a', 'evicted-0');
  assert.ok(reads > beforeEviction, 'Query cache is bounded by its LRU limit'); checks++;
  fs.unlinkSync(file); assert.deepEqual(journal.list('owner-a'), []);
  journal.write(row('recreated')); assert.equal(journal.list('owner-a')[0].id, 'recreated'); checks += 2;
  const fileBefore = fs.readFileSync(file);
  journal.find('owner-a', 'recreated'); journal.list('owner-a'); journal.history('owner-a', 'recreated');
  assert.deepEqual(fs.readFileSync(file), fileBefore, 'Reads do not rewrite durable evidence'); checks++;
  console.log(JSON.stringify({ journalCacheChecks: checks, syntheticRecords: rows.length, coldThreeQueriesMs: Math.round(coldMs), warm300QueriesMs: Math.round(warmMs), warmContentReads: 0, realAccountActions: false }));
} finally {
  fs.readSync = originalRead;
  if (path.dirname(fs.realpathSync(directory)) !== fs.realpathSync(os.tmpdir()) || !path.basename(directory).startsWith('matrix-journal-cache-')) throw Error('Unexpected QA cleanup target');
  fs.rmSync(directory, { recursive: true, force: true });
}
