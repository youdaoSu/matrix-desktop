const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript'), Module = require('node:module');
const moduleFixture = new Module('queue-fixture');
moduleFixture._compile(ts.transpileModule(fs.readFileSync('client/src/components/workspace/publish-queue.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, 'queue-fixture.cjs');
const { createPublishQueue, recoverPublishJobs, activePublishStages } = moduleFixture.exports;
const item = id => ({ account: { id, nickname: 'QA ' + id, platform: 'xiaohongshu' }, config: { title: '标题', body: '正文', topics: [], comment: '', options: {} }, media: { id: 'opaque-handle', mediaType: 'image', files: [{ name: 'fixture.png', size: 1 }] } });
const tick = () => new Promise(resolve => setImmediate(resolve));
async function done(queue) { for (let i = 0; i < 1000 && queue.running; i++) await tick(); assert.equal(queue.running, false); }
function fixture(overrides = {}) {
  const calls = { uploads: 0, submits: 0, followups: 0, snapshots: [] };
  const deps = {
    current: () => true, changed: jobs => calls.snapshots.push(jobs), sleep: tick,
    prepare: async request => ({ accountId: request.account.id }),
    upload: async () => { calls.uploads++; return { uploadStarted: true }; },
    fill: async () => ({ filled: ['title', 'body'], unresolved: [] }),
    progress: async () => ({ ready: true }),
    inspect: async () => ({ nonce: 'fixture', candidates: [{ index: 0 }] }),
    submit: async entries => { calls.submits++; return { results: entries.map(entry => ({ accountId: entry.accountId, receipt: { id: entry.accountId, status: 'confirmed', message: '发布成功' } })) }; },
    followup: async () => { calls.followups++; }, ...overrides,
  };
  return { calls, deps, queue: createPublishQueue(deps) };
}
(async () => {
  let checks = 0;
  let f = fixture(); const request = item('a'); f.queue.start([request]); request.config.title = 'changed after enqueue';
  assert.throws(() => f.queue.start([item('b')])); await done(f.queue);
  assert.equal(f.queue.jobs[0].title, '标题'); assert.equal(f.queue.jobs[0].stage, 'confirmed'); assert.equal(f.calls.uploads, 1); assert.equal(f.calls.submits, 1); checks += 5;
  assert.ok(!JSON.stringify(f.queue.jobs).includes('opaque-handle')); assert.equal(f.queue.jobs[0].uploadPercent, undefined); checks += 2;
  f = fixture({ progress: async () => ({ ready: true, uploadPercent: 100 }) }); f.queue.start([item('a')]); await done(f.queue); assert.ok(f.calls.snapshots.some(jobs => jobs[0].uploadPercent === 100)); checks++;
  f = fixture({ fill: async () => ({ filled: ['title'], unresolved: ['封面'] }) }); const batch = f.queue.start([item('a'), item('b')]); await done(f.queue);
  assert.ok(f.queue.jobs.every(job => job.stage === 'attention')); assert.equal(f.calls.submits, 0); assert.throws(() => f.queue.start([item('a')]));
  f.queue.resume(batch); await done(f.queue); assert.equal(f.calls.uploads, 2); assert.ok(f.queue.jobs.every(job => job.stage === 'confirmed')); checks += 5;
  f = fixture({ inspect: async () => ({ error: 'Required field missing' }) }); f.queue.start([item('a'), item('b')]); await done(f.queue); assert.ok(f.queue.jobs.every(job => job.stage === 'attention')); assert.ok(!f.queue.jobs.some(job => activePublishStages.includes(job.stage))); checks += 2;
  f = fixture({ submit: async () => ({ results: [{ accountId: 'a', receipt: { id: 'receipt', status: 'unknown', message: 'pending verification' } }], remaining: ['b'] }) }); const unknownBatch = f.queue.start([item('a'), item('b')]); await done(f.queue);
  assert.equal(f.queue.jobs[0].stage, 'unknown'); assert.equal(f.queue.jobs[1].stage, 'attention');
  f.deps.submit = async entries => { assert.deepEqual(entries.map(e => e.accountId), ['b']); return { results: [{ accountId: 'b', receipt: { status: 'confirmed', message: 'success' } }] }; };
  f.queue.resume(unknownBatch); await done(f.queue); assert.equal(f.queue.jobs[0].stage, 'unknown'); assert.equal(f.queue.jobs[1].stage, 'confirmed'); checks += 5;
  f = fixture({ submit: async () => { throw Error('IPC lost'); } }); f.queue.start([item('a')]); await done(f.queue); assert.equal(f.queue.jobs[0].stage, 'unknown'); assert.equal(f.queue.canResume(f.queue.jobs[0].batchId), false); checks += 2;
  let resolvePrepare; f = fixture({ prepare: () => new Promise(resolve => { resolvePrepare = resolve; }) }); f.queue.start([item('a'), item('b')]); f.queue.stop(); resolvePrepare({ accountId: 'a' }); await done(f.queue);
  assert.equal(f.calls.uploads, 0); assert.ok(f.queue.jobs.every(job => job.stage === 'cancelled')); checks += 2;
  let current = true; f = fixture({ current: () => current, upload: async () => { current = false; return { uploadStarted: true }; } }); f.queue.start([item('a')]); await done(f.queue); assert.equal(f.calls.submits, 0); assert.equal(f.queue.jobs[0].stage, 'cancelled'); checks += 2;
  f = fixture(); const follow = item('a'); follow.config.comment = 'followup'; f.queue.start([follow]); await done(f.queue); assert.equal(f.calls.followups, 1); checks++;
  f = fixture({ submit: async () => ({ cancelled: true }) }); const cancelBatch = f.queue.start([item('a')]); await done(f.queue); assert.equal(f.queue.jobs[0].stage, 'attention'); f.queue.discard(cancelBatch); assert.equal(f.queue.canResume(cancelBatch), false); assert.equal(f.queue.jobs[0].stage, 'cancelled'); checks += 3;
  const recovery = recoverPublishJobs([{ ...f.queue.jobs[0], stage: 'submitting' }, null, { id: 'invalid' }]); assert.equal(recovery.length, 1); assert.equal(recovery[0].stage, 'interrupted'); assert.deepEqual(recoverPublishJobs({}), []); checks += 3;
  f = fixture(); f.queue.startMany([[item('a'), item('b')], [item('a')]]); await done(f.queue); assert.equal(f.calls.uploads, 3); assert.equal(f.calls.submits, 2); assert.ok(f.queue.jobs.every(job => job.stage === 'confirmed')); checks += 3;
  f = fixture({ submit: async entries => ({ results: [{ accountId: entries[0].accountId, receipt: { status: 'failed', message: '发布失败' } }] }) }); f.queue.startMany([[item('a')], [item('a')]]); await done(f.queue); assert.equal(f.calls.uploads, 1); assert.equal(f.queue.jobs[1].stage, 'cancelled');
  const failedId = f.queue.jobs[0].id; f.deps.submit = async entries => ({ results: entries.map(entry => ({ accountId: entry.accountId, receipt: { id: 'success', status: 'confirmed', message: '发布成功' } })) });
  f.queue.retry(failedId); await done(f.queue); assert.equal(f.queue.jobs[0].stage, 'failed'); assert.equal(f.queue.jobs.at(-1).stage, 'confirmed'); assert.equal(f.queue.jobs.at(-1).retryOf, failedId); checks += 5;
  const job = f.queue.jobs.at(-1), receipt = { id: 'comment', taskId: job.id, accountId: job.accountId, platform: job.platform, kind: 'comments', status: 'failed', message: '追评失败' };
  f.queue.operationReceipt(receipt); assert.equal(f.queue.jobs.at(-1).stage, 'confirmed'); assert.equal(f.queue.jobs.at(-1).followup.status, 'failed');
  f.queue.operationReceipt({ ...receipt, id: 'withdraw', kind: 'withdraw', status: 'confirmed', message: '已下架' }); assert.equal(f.queue.jobs.at(-1).stage, 'confirmed'); assert.equal(f.queue.jobs.at(-1).followup.status, 'failed'); assert.equal(f.queue.jobs.at(-1).withdrawal.status, 'confirmed'); checks += 5;
  f.queue.operationReceipt({ ...receipt, accountId: 'foreign', status: 'confirmed' }); assert.equal(f.queue.jobs.at(-1).followup.status, 'failed');
  f.queue.remove(job.id); assert.ok(!f.queue.jobs.some(item => item.id === job.id)); assert.equal(f.calls.uploads, 2); checks += 3;
  f = fixture({ fill: async () => ({ filled: ['title'], unresolved: ['音乐：QA 指定曲目（请在官方表单选择并核对）'] }) });
  const advanced = item('advanced'); advanced.config.extras = { 音乐: 'QA 指定曲目' }; advanced.config.covers = [{ id: 'cover-handle', name: 'QA-cover.png', index: 1 }]; advanced.config.schedule = { mode: 'official', at: '2099-01-01T12:00' };
  f.queue.start([advanced]); advanced.config.extras.音乐 = 'later edit'; await done(f.queue);
  assert.equal(f.queue.jobs[0].stage, 'attention'); assert.equal(f.calls.submits, 0); assert.equal(f.queue.jobs[0].config.extras.音乐, 'QA 指定曲目');
  assert.ok(f.queue.jobs[0].message.includes('QA-cover.png')); assert.ok(f.queue.jobs[0].message.includes('2099-01-01T12:00')); assert.ok(f.queue.jobs[0].message.includes('QA 指定曲目')); checks += 6;
  console.log(JSON.stringify({ backgroundQueueChecks: checks, externalPlatformActions: false }));
})().catch(error => { console.error(error); process.exitCode = 1; });
