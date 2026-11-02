// Disposable disk/IPC fixtures only. Never reads the installed user profile.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createPublishEvidenceStore, sanitizeObservation } = require('../desktop/publish-evidence.cjs');
const { registerPersonalAssist } = require('../desktop/personal-assist.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-publish-evidence-qa-'));
let time = Date.now();
const store = createPublishEvidenceStore(directory, { now: () => time });
const context = { ownerId: randomUUID(), accountId: randomUUID(), taskId: randomUUID(), attemptId: randomUUID(), platform: 'wechat' };
const waiting = { version: 1, state: 'waiting_preview', busySignals: [], editorReady: true, attachedVideoInputs: 1, mediaElements: 0, decodedMedia: 0, coverContainers: 0, coverImages: 0, decodedCoverImages: 0, enabledSubmitButtons: 1 };
const first = store.record(context, { ...waiting, cookie: 'never-persist-cookie', title: 'never-persist-title', filePath: 'never-persist-path' });
assert.equal(first.stored, true);
assert.equal(first.observation.state, 'waiting_preview');
assert.equal(store.list(context.ownerId, context.taskId, context.attemptId).length, 1);
assert.equal(store.list(randomUUID(), context.taskId, context.attemptId).length, 0);
assert.equal(store.list(context.ownerId, randomUUID(), context.attemptId).length, 0);
assert.equal(store.list(context.ownerId, context.taskId, randomUUID()).length, 0);
assert.equal('ownerId' in store.list(context.ownerId, context.taskId, context.attemptId)[0], false);
time += 2000; assert.equal(store.record(context, waiting).at, first.at);
assert.equal(store.list(context.ownerId, context.taskId, context.attemptId).length, 1);
time += 30000; store.record(context, waiting);
assert.equal(store.list(context.ownerId, context.taskId, context.attemptId).length, 2);
const reopened = createPublishEvidenceStore(directory);
assert.equal(reopened.list(context.ownerId, context.taskId, context.attemptId).length, 2);
assert.ok(!fs.readFileSync(path.join(directory, 'publish-observations.json'), 'utf8').includes('never-persist'));
for (const patch of [{ state: 'published' }, { busySignals: ['private-token'] }, { coverImages: -1 }, { decodedMedia: Infinity }, { uploadPercent: 101 }, { uploadPercent: NaN }]) assert.throws(() => sanitizeObservation({ ...waiting, ...patch }));
const probe={componentRoots:2,viewportWidth:1280,viewportHeight:850,documentVisible:false,matchedCovers:1,matchedVideos:1,rejectedCoverReasons:['transparent_ancestor']};
const probed=sanitizeObservation({...waiting,probe:{...probe,cookie:'never-persist-cookie',html:'never-persist-html'}});
assert.deepEqual(probed.probe,probe);assert.ok(!JSON.stringify(probed).includes('never-persist'));
for(const invalid of [{...probe,viewportWidth:Infinity},{...probe,componentRoots:-1},{...probe,rejectedCoverReasons:['never-persist-cookie']},{...probe,documentVisible:'true'}])assert.throws(()=>sanitizeObservation({...waiting,probe:invalid}));
store.record(context,{...waiting,probe});assert.deepEqual(reopened.list(context.ownerId,context.taskId,context.attemptId).at(-1).observation.probe,probe);
assert.throws(() => store.record({ ...context, taskId: '../escape' }, waiting));
assert.throws(() => store.list(context.ownerId, context.taskId, '../escape'));
for (let i = 0; i < 105; i++) { time += 31000; store.record(context, { ...waiting, enabledSubmitButtons: i % 2 }); }
const bounded = reopened.list(context.ownerId, context.taskId, context.attemptId);
assert.equal(bounded.length, 96);
assert.equal(bounded[0].at, first.at);
assert.equal(bounded.at(-1).at, new Date(time).toISOString());
store.record({ ...context, attemptId: randomUUID() }, waiting);
assert.equal(reopened.list(context.ownerId, context.taskId, context.attemptId).length, 96);

(async () => {
  const handlers = new Map(); let currentOwner = context.ownerId, calls = 0;
  registerPersonalAssist({ ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, getWindow: () => ({ webContents: { id: 123 } }),
    evidenceStore: store, authenticate: async token => { calls++; if (token !== 'qa-token') throw Error('expired'); return { userId: currentOwner }; } });
  const read = (patch = {}, sender = 123) => handlers.get('matrix:read-publish-evidence')({ sender: { id: sender } }, { accessToken: 'qa-token', taskId: context.taskId, attemptId: context.attemptId, ...patch });
  assert.ok((await read({}, 999)).error); assert.equal(calls, 0);
  assert.ok((await read({ taskId: '../escape' })).error); assert.equal(calls, 0);
  assert.ok((await read({ accessToken: 'expired' })).error);
  assert.equal((await read()).items.length, 96);
  currentOwner = randomUUID(); assert.deepEqual((await read()).items, []);
  currentOwner = context.ownerId;
  assert.ok(!JSON.stringify(await read()).includes('never-persist'));
  // A malformed evidence file must never become a publish receipt or be reset
  // silently, nor can it prevent normal tasks from preserving their result.
  const broken = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-publish-evidence-corrupt-qa-'));
  fs.writeFileSync(path.join(broken, 'publish-observations.json'), '{incomplete');
  assert.throws(() => createPublishEvidenceStore(broken).record(context, waiting));
  assert.equal(fs.readFileSync(path.join(broken, 'publish-observations.json'), 'utf8'), '{incomplete');
  console.log(JSON.stringify({ publishEvidenceChecks: 'passed', restartDurability: true, ownerAttemptIsolation: true, boundedRetention: true, credentialsAndContentExcluded: true, realPlatformActions: false }));
})().catch(error => { console.error(error); process.exitCode = 1; });
