const assert = require('node:assert/strict');
const { registerPageActions } = require('../desktop/page-actions.cjs');
const handlers = {}, records = [];
const isolated = {};
let allowed = true, loggedIn = true, identity = 'QA author', dialogResult = 1, clicks = 0, outcome = 'confirmed', failWrite = false;
const guest = { id: 22, hostWebContents: { id: 11 }, session: isolated, isDestroyed: () => false, getURL: () => 'https://creator.douyin.com/creator-micro/content/post/video', executeJavaScriptInIsolatedWorld: async (_world, scripts) => {
  const code = scripts[0].code;
  if (code.endsWith(')') && code.includes(')("inspect",')) return { pageUrl: guest.getURL(), fields: [{ label: '标题', value: 'QA only' }], candidates: [{ index: 0, label: '发布', context: 'QA only' }] };
  if (code.includes(')("submit",')) { clicks++; return { clicked: true }; }
  return { status: outcome, message: outcome === 'confirmed' ? '发布成功' : outcome === 'failed' ? '发布失败' : '结果待核对' };
} };
registerPageActions({ ipcMain: { handle: (name, handler) => { handlers[name] = handler; } }, dialog: { showMessageBox: async () => ({ response: dialogResult }) }, webContents: { fromId: id => id === 22 ? guest : null }, session: { fromPartition: name => name === 'persist:matrix-douyin-aaaaaaaaaaaaaaaa' ? isolated : {} }, getWindow: () => ({ webContents: { id: 11 } }), platforms: { douyin: { domain: 'douyin.com', label: '抖音' } }, inspectPlatformSession: async () => ({ authenticated: loggedIn, profile: { nickname: identity } }), authenticate: async (_token, accountId) => { if (!allowed) throw new Error('Unauthorized'); return { userId: 'qa-user', account: { id: accountId, platform: 'douyin', connectorSessionId: 'aaaaaaaaaaaaaaaa' } }; }, journal: { write: r => { if (failWrite) throw new Error('Disk full'); records.push({ ...r }); }, list: () => records }, sleep: async () => {} });
const event = { sender: { id: 11 } }, input = { platform: 'douyin', accountId: 'qa-account', sessionId: 'aaaaaaaaaaaaaaaa', webContentsId: 22, accessToken: 'qa-only', kind: 'publish' };
const inspect = changes => handlers['matrix:inspect-page-action'](event, { ...input, ...changes });
const submit = (plan, changes) => handlers['matrix:submit-page-action'](event, { ...input, nonce: plan.nonce, index: 0, ...changes });
(async () => {
  let checks = 0;
  assert.ok((await handlers['matrix:inspect-page-action']({ sender: { id: 99 } }, input)).error); checks++;
  allowed = false; assert.ok((await inspect()).error); allowed = true; checks++;
  loggedIn = false; assert.ok((await inspect()).error); loggedIn = true; checks++;
  assert.ok((await inspect({ sessionId: 'other-session-0000' })).error); checks++;
  assert.ok((await inspect({ kind: 'delete' })).error); checks++;
  let plan = await inspect(); assert.ok(plan.nonce); assert.equal(clicks, 0); checks++;
  assert.ok((await submit(plan, { index: 99 })).error); assert.equal(clicks, 0); checks++;
  dialogResult = 0; assert.equal((await submit(plan)).cancelled, true); assert.equal(clicks, 0); checks++;
  dialogResult = 1; identity = 'Changed account'; assert.ok((await submit(plan)).error); assert.equal(clicks, 0); identity = 'QA author'; checks++;
  plan = await inspect(); const result = await submit(plan); assert.equal(result.receipt.status, 'confirmed'); assert.equal(clicks, 1); assert.equal(records[0].status, 'submitting'); assert.equal(records[1].status, 'confirmed'); checks++;
  assert.ok((await submit(plan)).error); assert.equal(clicks, 1); checks++;
  outcome = 'unknown'; plan = await inspect(); assert.equal((await submit(plan)).receipt.status, 'unknown'); checks++;
  outcome = 'failed'; plan = await inspect(); assert.equal((await submit(plan)).receipt.status, 'failed'); checks++;
  plan = await inspect(); const before = clicks; failWrite = true; assert.ok((await submit(plan)).error); assert.equal(clicks, before); failWrite = false; checks++;
  const first = await inspect(), second = await inspect(); assert.ok((await submit(first)).error); assert.ok(second.nonce); checks++;
  allowed = false; assert.ok((await handlers['matrix:list-page-actions'](event, { accessToken: 'invalid' })).error); checks++;
  console.log(JSON.stringify({ pageActionGuards: checks, realPlatformActionsPerformed: false }));
})().catch(error => { console.error(error); process.exitCode = 1; });
