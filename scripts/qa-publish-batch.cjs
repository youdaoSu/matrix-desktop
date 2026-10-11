const assert = require('node:assert/strict');
const ts = require('typescript'), fs = require('node:fs'), Module = require('node:module');
const fixture = new Module('publish-config');
fixture._compile(ts.transpileModule(fs.readFileSync(require.resolve('../shared/publish-config.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, 'publish-config.cjs');
const { parseTopics, syncPublishConfig, validatePublishConfig } = fixture.exports;
const common = { title: '标题', body: '简介', topics: ['健身'], comment: '追评', options: {} };
assert.deepEqual(parseTopics('#健身，日常;健身 #运动'), ['健身', '日常', '运动']);
const previous = { ...common, title: '独立标题', options: { category: '生活' } };
const synced = syncPublishConfig(common, previous, ['body', 'topics']);
assert.equal(synced.title, '独立标题'); assert.equal(synced.options.category, '生活'); synced.topics.push('QA'); assert.equal(common.topics.length, 1);
assert.equal(validatePublishConfig(common), null); assert.ok(validatePublishConfig({ ...common, topics: Array(16).fill('话题') }));
const { registerPageActions } = require('../desktop/page-actions.cjs');
const handlers = {}, records = [], clicks = [];
let dialogs = 0, approval = 1, outcome = 'confirmed', authorized = true;
let cancelAfterFirst = false;
const guests = [1, 2].map(id => ({ id: id + 20, hostWebContents: { id: 11 }, session: { id }, isDestroyed: () => false, getURL: () => 'https://creator.douyin.com/creator-micro/content/post/video',
  executeJavaScriptInIsolatedWorld: async (_world, scripts) => {
    if (scripts[0].code.includes(')("inspect",')) return { fields: [{ label: '标题', value: 'QA only' }], candidates: [{ index: 0, label: '发布' }], pageUrl: 'https://creator.douyin.com/qa' };
    if (scripts[0].code.includes(')("submit",')) { clicks.push(id); if (cancelAfterFirst && id === 1) await handlers['matrix:cancel-publish-batch'](event, { batchId: 'cancel-test', accessToken: 'QA only' }); return { clicked: true }; }
    return { status: outcome, message: outcome };
  } }));
registerPageActions({ ipcMain: { handle: (name, fn) => { handlers[name] = fn; } }, dialog: { showMessageBox: async () => { dialogs++; return { response: approval }; } }, webContents: { fromId: id => guests.find(g => g.id === id) }, session: { fromPartition: name => guests[Number(name.slice(-1)) - 1]?.session }, getWindow: () => ({ webContents: { id: 11 } }), platforms: { douyin: { label: '抖音', domain: 'douyin.com' } }, inspectPlatformSession: async () => ({ authenticated: true, profile: { nickname: 'QA creator' } }), authenticate: async (_token, accountId) => { if (!authorized) throw Error('Unauthorized'); return { userId: 'QA', account: { platform: 'douyin', connectorSessionId: 'aaaaaaaaaaaaaaa' + accountId } }; }, journal: { write: r => records.push({ ...r }), list: () => records }, sleep: async () => {} });
const progressEvents = [];
const event = { sender: { id: 11, send: (_channel, progress) => progressEvents.push(progress) } }, inputs = [1, 2].map(id => ({ platform: 'douyin', sessionId: 'aaaaaaaaaaaaaaa' + id, accountId: String(id), webContentsId: id + 20, accessToken: 'QA only', kind: 'publish' }));
const batch = (entries, batchId) => handlers['matrix:submit-publish-batch'](event, { entries, batchId });
const plans = async () => Promise.all(inputs.map(async input => ({ ...input, nonce: (await handlers['matrix:inspect-page-action'](event, input)).nonce, index: 0 })));
(async () => {
  assert.ok((await batch([])).error);
  let entries = await plans(); assert.ok((await batch([entries[0], entries[0]])).error); assert.equal(clicks.length, 0);
  approval = 0; assert.equal((await batch(entries)).cancelled, true); assert.equal(clicks.length, 0);
  approval = 1; const before = dialogs; let result = await batch(entries);
  assert.equal(result.results.length, 2); assert.ok(result.results.every(r => r.receipt.status === 'confirmed')); assert.equal(dialogs - before, 1); assert.deepEqual(clicks, [1, 2]);
  assert.ok((await batch(entries)).error); assert.equal(clicks.length, 2);
  outcome = 'unknown'; entries = await plans(); result = await batch(entries); assert.equal(result.results.length, 1); assert.deepEqual(result.remaining, ['2']); assert.equal(clicks.length, 3);
  authorized = false; assert.ok((await batch(await plans())).error); assert.equal(clicks.length, 3);
  authorized = true; outcome = 'confirmed'; cancelAfterFirst = true;
  result = await batch(await plans(), 'cancel-test'); assert.equal(result.results.length, 1); assert.deepEqual(result.remaining, ['2']); assert.equal(clicks.length, 4); assert.deepEqual(progressEvents.map(event => event.status), ['submitting', 'confirmed']);
  cancelAfterFirst = false; await handlers['matrix:cancel-publish-batch'](event, { batchId: 'pre-cancel', accessToken: 'QA only' }); result = await batch(await plans(), 'pre-cancel'); assert.equal(result.cancelled, true); assert.equal(clicks.length, 4);
  console.log(JSON.stringify({ batchCancellationAndProgressChecks: 6 }));
  console.log(JSON.stringify({ publishConfigAndBatchAssertions: 20, realSubmissions: false }));
})().catch(error => { console.error(error); process.exitCode = 1; });
