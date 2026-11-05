'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { InteractionStore } = require('../src/interaction-store.cjs');

const EPOCH = Date.parse('2026-10-12T06:00:00.000Z');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengyuan-interaction-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let now = EPOCH;
  let sequence = 0;
  const one = { id: randomUUID(), name: '小红书账号', platform: 'xiaohongshu' };
  const two = { id: randomUUID(), name: '抖音账号', platform: 'douyin' };
  const accounts = new Map([[one.id, one], [two.id, two]]);
  const options = { now: () => now, getAccount: id => { if (!accounts.has(id)) throw new Error('账号不存在'); return accounts.get(id); } };
  let store = new InteractionStore(path.join(root, 'data'), options);
  return {
    root, one, two, accounts, options,
    get store() { return store; },
    setNow(value) { now = value; },
    reopen() { store = new InteractionStore(store.dataDir, options); return store; },
    rule(overrides = {}) { return store.saveRule({ name: '资料问答', platform: 'all', accountIds: [], channel: 'all', match: 'contains', keywords: ['资料'], replyText: '你好 {nickname}，资料在主页。', enabled: true, priority: 0, cooldownMinutes: 30, delaySeconds: 0, ...overrides }); },
    input(overrides = {}) { return { accountId: one.id, channel: 'dm', externalId: `external-${++sequence}`, threadId: 'thread-1', senderId: 'person-1', senderName: '小雨', text: '我想要资料', receivedAt: new Date(now).toISOString(), isOwn: false, isGroup: false, historical: false, ...overrides }; },
    ingest(overrides = {}) { return store.ingest(this.input(overrides)); },
    reply(message) { return store.snapshot().replies.find(reply => reply.messageId === message.id); },
    auto(accountId = one.id, channel = 'dm') { return store.setMode({ accountId, channel, mode: 'auto' }); },
  };
}
function failWrite(store, action) {
  const original = fs.renameSync;
  fs.renameSync = (from, to) => { if (to === store.filePath) throw new Error('simulated persistence failure'); return original(from, to); };
  try { action(); } finally { fs.renameSync = original; }
}
function send(f, reply, status = 'sent') {
  const claimed = f.store.beginSend(reply.id);
  f.store.finishSend(reply.id, { status, ...(status === 'sent' ? { receipt: { kind: 'test-confirmation', externalId: claimed.message.externalId } } : { error: 'test result' }) });
  return claimed;
}

const PREPARATION_FAILURE = { code: 'WELCOME_PREPARE_TIMEOUT', stage: 'chat-verify', pageReleased: true };
function preparationRetryFixture(t) {
  const f = fixture(t);
  f.rule({ platform: 'douyin', channel: 'follow', trigger: 'follow', match: 'any', keywords: [], cooldownMinutes: 0 });
  f.store.baselineFollowers({ accountId: f.two.id, followerIds: ['old'], observedAt: new Date(EPOCH - 1000).toISOString() });
  f.auto(f.two.id, 'dm'); f.auto(f.two.id, 'follow');
  const message = f.ingest({ accountId: f.two.id, channel: 'follow', threadId: 'follower:new', senderId: 'new', text: '' });
  return { ...f, message, queued: f.reply(message), original: f };
}

test('welcome preparation recovery persists one frozen reply with backoff and never changes dueAt', t => {
  const f = preparationRetryFixture(t), original = f.queued;
  assert.deepEqual(original.preparationRetry, { version: 1, attempts: 0 });
  const first = f.store.deferWelcomePreparation(original.id, PREPARATION_FAILURE);
  assert.equal(first.deferred, true);
  const deferred = f.store.getReply(original.id);
  assert.equal(deferred.id, original.id); assert.equal(deferred.replyText, original.replyText); assert.equal(deferred.dueAt, original.dueAt);
  assert.equal(deferred.status, 'queued'); assert.equal(deferred.claimedAt, undefined);
  assert.equal(deferred.preparationRetry.attempts, 1);
  assert.equal(Date.parse(deferred.preparationRetry.nextAttemptAt), EPOCH + 15000);
  assert.equal(Date.parse(deferred.preparationRetry.deadlineAt), EPOCH + 180000);
  f.original.reopen();
  assert.deepEqual(f.original.store.getReply(original.id), deferred);
  assert.equal(f.store.welcomePreparationRetryStatus(original.id).ready, false);
  assert.throws(() => f.store.deferWelcomePreparation(original.id, PREPARATION_FAILURE), /等待恢复/);
  assert.throws(() => f.store.beginSend(original.id), /等待恢复/);
  f.setNow(EPOCH + 15000);
  assert.equal(f.store.welcomePreparationRetryStatus(original.id).ready, true);
  f.store.beginSend(original.id);
  f.store.finishSend(original.id, { status: 'sent', receipt: 'platform:synthetic-preparation-recovered' });
  assert.equal(f.store.getReply(original.id).status, 'sent');
  assert.throws(() => f.store.deferWelcomePreparation(original.id, PREPARATION_FAILURE), /从未领取/);
  assert.equal(f.store.snapshot().replies.length, 1);
});

test('welcome preparation recovery has two additional attempts and a durable three minute deadline', t => {
  const f = preparationRetryFixture(t), id = f.queued.id;
  f.store.deferWelcomePreparation(id, PREPARATION_FAILURE);
  f.setNow(EPOCH + 15000);
  f.store.deferWelcomePreparation(id, PREPARATION_FAILURE);
  assert.equal(f.store.getReply(id).preparationRetry.attempts, 2);
  assert.equal(Date.parse(f.store.getReply(id).preparationRetry.nextAttemptAt), EPOCH + 60000);
  f.setNow(EPOCH + 60000);
  assert.deepEqual(f.store.deferWelcomePreparation(id, PREPARATION_FAILURE), { deferred: false, exhausted: true });
  assert.equal(f.store.getReply(id).status, 'skipped'); assert.equal(f.store.getReply(id).claimedAt, undefined);
  const late = preparationRetryFixture(t);
  late.store.deferWelcomePreparation(late.queued.id, PREPARATION_FAILURE);
  late.setNow(EPOCH + 180000);
  assert.equal(late.store.welcomePreparationRetryStatus(late.queued.id).expired, true);
  assert.throws(() => late.store.beginSend(late.queued.id), /超过时限/);
  assert.equal(late.store.getReply(late.queued.id).status, 'skipped');
});

test('a clock rollback before the first recovery cannot write invalid retry timestamps', t => {
  const f = preparationRetryFixture(t), before = fs.readFileSync(f.store.filePath, 'utf8');
  f.setNow(EPOCH - 1000);
  assert.throws(() => f.store.deferWelcomePreparation(f.queued.id, PREPARATION_FAILURE), /时钟已回退/);
  assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), before);
  assert.deepEqual(f.store.getReply(f.queued.id), f.queued);
  assert.doesNotThrow(() => f.store.snapshot());
});

test('preparation recovery does not opt in legacy queued records or resurrect old terminal states', t => {
  for (const mode of ['legacy', 'cancelled', 'skipped', 'unknown']) {
    const f = preparationRetryFixture(t), id = f.queued.id;
    if (mode === 'legacy') {
      const state = JSON.parse(fs.readFileSync(f.store.filePath, 'utf8'));
      delete state.replies[0].preparationRetry; fs.writeFileSync(f.store.filePath, JSON.stringify(state));
    } else if (mode === 'cancelled') f.store.cancelReply(id);
    else if (mode === 'skipped') f.store.failBeforeSend(id, { error: 'earlier failure' });
    else { f.store.beginSend(id); f.store.finishSend(id, { status: 'unknown', error: 'earlier uncertain submission' }); }
    const before = f.store.getReply(id);
    assert.throws(() => f.store.deferWelcomePreparation(id, PREPARATION_FAILURE), /从未领取/);
    assert.deepEqual(f.store.getReply(id), before);
  }
});

test('preparation recovery rechecks current rules, pause, mode, and rejects unsupported failure evidence', t => {
  for (const change of ['rule', 'paused', 'dm-off', 'follow-off']) {
    const f = preparationRetryFixture(t), id = f.queued.id;
    if (change === 'rule') f.store.saveRule({ ...f.store.snapshot().rules[0], replyText: 'Changed rule' });
    if (change === 'paused') f.store.updatePolicy({ paused: true });
    if (change === 'dm-off') f.store.setMode({ accountId: f.two.id, channel: 'dm', mode: 'off' });
    if (change === 'follow-off') f.store.setMode({ accountId: f.two.id, channel: 'follow', mode: 'off' });
    const before = f.store.getReply(id);
    assert.throws(() => f.store.deferWelcomePreparation(id, PREPARATION_FAILURE));
    assert.deepEqual(f.store.getReply(id), before);
  }
  for (const failure of [
    { ...PREPARATION_FAILURE, code: 'WELCOME_IDENTITY_CHANGED' },
    { ...PREPARATION_FAILURE, pageReleased: false },
    { code: 'WELCOME_LOAD_FAILED', stage: 'entry', networkCode: 'ERR_ABORTED', pageReleased: true },
    { ...PREPARATION_FAILURE, url: 'https://example.invalid/private' },
  ]) {
    const f = preparationRetryFixture(t);
    assert.throws(() => f.store.deferWelcomePreparation(f.queued.id, failure));
    assert.deepEqual(f.store.getReply(f.queued.id), f.queued);
  }
});

test('unchanged repeated ingestion never rewrites the data file while new messages and reply state changes still persist', t => {
  const f = fixture(t); f.rule();
  let writes = 0; const originalWrite = f.store._write;
  f.store._write = function(state) { writes++; return originalWrite.call(this, state); };
  const input = f.input(), first = f.store.ingest(input), originalFile = fs.readFileSync(f.store.filePath, 'utf8');
  assert.equal(writes, 1);
  for (let index = 0; index < 8; index++) assert.deepEqual(f.store.ingest(input), first);
  assert.equal(writes, 1); assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), originalFile);
  const returned = f.store.ingest(input); returned.senderName = 'caller change';
  assert.equal(f.store.getMessage(first.id).senderName, first.senderName);
  const reply = f.reply(first); f.store.approveReply(reply.id); assert.equal(writes, 2);
  assert.equal(f.store.ingest(input).id, first.id); assert.equal(writes, 2); assert.equal(f.store.getReply(reply.id).status, 'queued');
  f.ingest(); assert.equal(writes, 3); assert.equal(f.store.snapshot().messages.length, 2);
});

test('unchanged profile evidence avoids a rewrite but new evidence persists and conflicting identities still reject', t => {
  const f = fixture(t); let writes = 0; const originalWrite = f.store._write;
  f.store._write = function(state) { writes++; return originalWrite.call(this, state); };
  const input = f.input({ accountId: f.two.id, senderId: '700001' });
  const first = f.store.ingest(input), profileUrl = 'https://www.douyin.com/user/MS4wLjABAAAA_known_profile';
  const enriched = f.store.ingest({ ...input, profileUrl });
  assert.equal(writes, 2); assert.equal(enriched.id, first.id); assert.equal(enriched.profileUrl, profileUrl);
  assert.deepEqual(f.store.ingest({ ...input, profileUrl }), enriched); assert.equal(writes, 2);
  const before = fs.readFileSync(f.store.filePath, 'utf8');
  for (const change of [{ profileUrl: 'https://www.douyin.com/user/MS4wLjABAAAA_conflicting_profile' }, { senderId: '700002' }, { threadId: 'other-thread' }, { isOwn: true }, { isGroup: true }, { receivedAt: new Date(EPOCH - 1000).toISOString() }]) assert.throws(() => f.store.ingest({ ...input, profileUrl, ...change }), /主页证据与已记录身份不一致/);
  assert.equal(writes, 2); assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), before);
  assert.deepEqual(f.reopen().getMessage(first.id), enriched);
});

for (const queued of [false, true]) {
  test(`preflight failure persists its real cause for an unclaimed ${queued ? 'queued' : 'pending'} reply`, t => {
    const f = fixture(t);
    f.rule();
    if (queued) f.auto();
    const reply = f.reply(f.ingest());
    const error = '未找到与该粉丝已核对的单人会话。';
    f.setNow(EPOCH + 12000);
    const result = f.store.failBeforeSend(reply.id, { error, code: 'welcome_conversation_unavailable' });
    assert.equal(result.status, 'skipped');
    assert.equal(result.reasonCode, 'welcome_conversation_unavailable');
    assert.equal(result.reason, `未发送：${error}`);
    assert.equal(result.error, error);
    assert.equal(result.updatedAt, new Date(EPOCH + 12000).toISOString());
    assert.equal(result.finishedAt, result.updatedAt);
    assert.equal(result.claimedAt, undefined);
    assert.equal(result.claimId, undefined);
    assert.equal(result.sentAt, undefined);
    assert.deepEqual(f.reopen().getReply(reply.id), result);
    assert.throws(() => f.store.beginSend(reply.id), /不能重复发送/);
    assert.throws(() => f.store.approveReply(reply.id), /只有待确认/);
  });
}

test('preflight failure cannot overwrite a user cancellation, terminal result, or send claim', t => {
  const f = fixture(t);
  f.rule({ cooldownMinutes: 0 }); f.auto();
  for (const status of ['cancelled', 'sending', 'sent', 'failed', 'unknown', 'skipped']) {
    const reply = f.reply(f.ingest({ senderId: `person-${status}` }));
    if (status === 'cancelled') f.store.cancelReply(reply.id);
    else if (status === 'skipped') f.store.failBeforeSend(reply.id, { error: 'first preflight error' });
    else if (status === 'sending') f.store.beginSend(reply.id);
    else send(f, reply, status);
    const before = f.store.getReply(reply.id);
    assert.throws(() => f.store.failBeforeSend(reply.id, { error: 'late page error' }), /只有尚未领取/);
    assert.deepEqual(f.store.getReply(reply.id), before);
    if (status === 'cancelled') assert.equal(before.reasonCode, 'user_cancelled');
  }
});

test('preflight failure reloads a concurrent claim and refuses claimed metadata even on an unsent status', t => {
  const f = fixture(t);
  f.rule(); f.auto();
  const reply = f.reply(f.ingest());
  const other = new InteractionStore(f.store.dataDir, f.options);
  f.store.beginSend(reply.id);
  const claimed = f.store.getReply(reply.id);
  assert.throws(() => other.failBeforeSend(reply.id, { error: 'stale checker' }), /只有尚未领取/);
  assert.deepEqual(other.getReply(reply.id), claimed);
  for (const field of ['claimedAt', 'claimId']) {
    const state = JSON.parse(fs.readFileSync(f.store.filePath, 'utf8'));
    const stored = state.replies.find(item => item.id === reply.id);
    stored.status = 'queued';
    delete stored.claimedAt; delete stored.claimId;
    stored[field] = claimed[field];
    fs.writeFileSync(f.store.filePath, JSON.stringify(state));
    const before = fs.readFileSync(f.store.filePath, 'utf8');
    assert.throws(() => f.store.failBeforeSend(reply.id, { error: 'inconsistent unclaimed record' }), /只有尚未领取/);
    assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), before);
  }
});

test('preflight errors validate input, preserve long diagnostics, and survive persistence failure safely', t => {
  const f = fixture(t);
  f.rule(); f.auto();
  const reply = f.reply(f.ingest());
  for (const input of [{ error: '' }, { error: 'cause', code: 'user_cancelled' }, { error: 'x'.repeat(4001) }]) {
    assert.throws(() => f.store.failBeforeSend(reply.id, input));
    assert.deepEqual(f.store.getReply(reply.id), reply);
  }
  failWrite(f.store, () => assert.throws(() => f.store.failBeforeSend(reply.id, { error: 'not persisted' }), /simulated/));
  assert.deepEqual(f.store.getReply(reply.id), reply);
  const error = '诊断'.repeat(1800);
  const result = f.store.failBeforeSend(reply.id, { error });
  assert.equal(result.reasonCode, 'preflight_failed');
  assert.equal(result.reason.length, 1000);
  assert.equal(result.error, error);
  assert.deepEqual(f.reopen().getReply(reply.id), result);
});

test('empty state defaults to review and stores private atomic metadata with no network work', t => {
  const f = fixture(t);
  assert.deepEqual(f.store.snapshot(), { rules: [], messages: [], replies: [], settings: { defaultMode: 'review', modes: [], policy: f.store.getPolicy() } });
  assert.equal(f.store.getMode(f.one.id, 'dm'), 'review');
  assert.equal(f.store.getMode({ accountId: f.one.id, channel: 'comment' }), 'review');
  // Windows ACLs do not expose POSIX chmod bits. Production Windows privacy
  // is independently verified by the encrypted-host fixture, not this mode.
  if (process.platform !== 'win32') assert.equal(fs.statSync(f.store.filePath).mode & 0o777, 0o600);
  else assert.equal(fs.statSync(f.store.filePath).isFile(), true);
  assert.deepEqual(fs.readdirSync(f.store.dataDir), ['interactions.json']);
  f.rule();
  const message = f.ingest();
  const reply = f.reply(message);
  assert.equal(reply.status, 'pending');
  assert.equal(reply.replyText, '你好 小雨，资料在主页。');
  assert.throws(() => f.store.beginSend(reply.id), /不能重复发送/);
  const copy = f.store.snapshot();
  copy.replies[0].replyText = 'changed';
  assert.notEqual(f.store.getReply(reply.id).replyText, 'changed');
});

test('contains, exact, all and any have explicit literal matching semantics', t => {
  const f = fixture(t);
  let rule = f.rule({ keywords: ['ABC'] });
  const preview = text => f.store.preview({ accountId: f.one.id, channel: 'dm', text, senderName: '访客' });
  assert.equal(preview('看一下 ａｂｃ').matched, true);
  assert.equal(preview('xyz').matched, false);
  rule = f.rule({ ...rule, match: 'exact' });
  assert.equal(preview('  abc ').matched, true);
  assert.equal(preview('abc please').matched, false);
  rule = f.rule({ ...rule, match: 'all', keywords: ['资料', '价格'] });
  assert.equal(preview('资料多少钱，价格呢').matched, true);
  assert.equal(preview('只有资料').matched, false);
  rule = f.rule({ ...rule, match: 'any', keywords: [] });
  assert.equal(preview('任意新消息').matched, true);
  assert.equal(preview('   ').matched, false);
  assert.equal(rule.revision, 4);
});

test('rule matching respects platform, account, channel and stable priority', t => {
  const f = fixture(t);
  const basic = f.rule({ name: '低优先级', priority: 1 });
  const scoped = f.rule({ name: '特定账号评论', platform: 'xiaohongshu', accountIds: [f.one.id], channel: 'comment', priority: 10 });
  const p = (accountId, channel) => f.store.preview({ accountId, channel, text: '资料' }).rule.id;
  assert.equal(p(f.one.id, 'comment'), scoped.id);
  assert.equal(p(f.one.id, 'dm'), basic.id);
  assert.equal(p(f.two.id, 'comment'), basic.id);
  assert.throws(() => f.rule({ platform: 'douyin', accountIds: [f.one.id] }), /不一致/);
});

test('message identity deduplicates persistently per account and channel, including retries after mode changes', t => {
  const f = fixture(t);
  f.rule();
  const input = f.input({ externalId: 'stable-id' });
  const first = f.store.ingest(input);
  assert.equal(f.store.ingest({ ...input, text: 'duplicate changed text' }).id, first.id);
  assert.equal(f.store.snapshot().messages.length, 1);
  assert.equal(f.store.snapshot().replies.length, 1);
  f.reopen();
  assert.equal(f.store.ingest(input).id, first.id);
  f.store.setMode({ accountId: f.one.id, channel: 'dm', mode: 'off' });
  f.auto();
  assert.equal(f.store.ingest(input).id, first.id);
  assert.equal(f.store.snapshot().replies.length, 1);
  f.ingest({ ...input, accountId: f.two.id });
  f.ingest({ ...input, channel: 'comment' });
  assert.equal(f.store.snapshot().messages.length, 3);
});

test('own, group, historical and disabled-channel messages are stored but never trigger replies', t => {
  const f = fixture(t);
  f.rule(); f.auto();
  for (const flags of [{ isOwn: true }, { isGroup: true }, { historical: true }]) assert.equal(f.reply(f.ingest(flags)), undefined);
  f.store.setMode({ accountId: f.one.id, channel: 'dm', mode: 'off' });
  const off = f.input();
  f.store.ingest(off);
  f.auto();
  f.store.ingest(off);
  assert.equal(f.store.snapshot().messages.length, 4);
  assert.equal(f.store.snapshot().replies.length, 0);
});

test('internal login repair disables all modes atomically while preserving pending work and unrelated accounts', t => {
  const f = fixture(t); f.rule({ cooldownMinutes: 0 });
  const pending = f.reply(f.ingest({ senderId: 'pending-person' }));
  const queued = f.reply(f.ingest({ senderId: 'queued-person' })); f.store.approveReply(queued.id);
  f.auto(f.one.id, 'comment'); f.auto(f.one.id, 'follow'); f.auto(f.two.id, 'dm');
  const peer = f.reply(f.ingest({ accountId: f.two.id, senderId: 'peer-person' }));
  const before = f.store.snapshot(), result = f.store.pauseAccountPreservingPending(f.one.id);
  assert.deepEqual(result, { accountId: f.one.id, modes: 'off', pendingPreserved: true });
  assert.deepEqual(f.store.snapshot().replies, before.replies); assert.deepEqual(f.store.snapshot().messages, before.messages);
  assert.deepEqual(f.store.snapshot().rules, before.rules); assert.deepEqual(f.store.getReply(peer.id), before.replies.find(reply => reply.id === peer.id));
  for (const channel of ['dm', 'comment', 'follow']) assert.equal(f.store.getMode(f.one.id, channel), 'off');
  assert.equal(f.store.getMode(f.two.id, 'dm'), 'auto');
  assert.throws(() => f.store.checkBatchReply(pending.id), /关闭|模式/);
  // A durable reopen must preserve the pause and pending records as well.
  f.reopen(); assert.equal(f.store.getMode(f.one.id, 'dm'), 'off');
  assert.equal(f.store.getReply(pending.id).status, 'pending'); assert.equal(f.store.getReply(queued.id).status, 'queued');
});

test('login repair pause rejects invalid accounts and failed writes without partial mode or task changes', t => {
  const f = fixture(t); f.rule(); f.auto(); f.ingest(); const before = f.store.snapshot();
  assert.throws(() => f.store.pauseAccountPreservingPending(randomUUID()), /账号不存在/);
  failWrite(f.store, () => assert.throws(() => f.store.pauseAccountPreservingPending(f.one.id), /simulated/));
  assert.deepEqual(f.store.snapshot(), before); assert.equal(f.store.getMode(f.one.id, 'dm'), 'auto');
});

test('message and rule validation rejects malformed fields without partial writes', t => {
  const f = fixture(t);
  const invalid = [ { externalId: '' }, { threadId: '' }, { senderId: '' }, { receivedAt: 'yesterday' }, { receivedAt: '2026-02-30T00:00:00Z' }, { receivedAt: new Date(EPOCH + 60001).toISOString() }, { channel: 'group' }, { isOwn: 'false' }, { isGroup: 0 }, { historical: null }, { text: 45 }, { accountId: randomUUID() } ];
  for (const bad of invalid) assert.throws(() => f.ingest(bad));
  for (const bad of [{ name: '' }, { keywords: [] }, { keywords: ['A', 'a'] }, { replyText: '' }, { cooldownMinutes: -1 }, { cooldownMinutes: 1441 }, { delaySeconds: 3601 }, { enabled: 'yes' }, { priority: 1.5 }, { match: 'regex' }]) assert.throws(() => f.rule(bad));
  assert.deepEqual(f.store.snapshot().messages, []);
  assert.deepEqual(f.store.snapshot().rules, []);
});

test('nickname rendering treats scripts, unknown placeholders and dollar signs only as data', t => {
  const f = fixture(t);
  const malicious = '<img src=x onerror="globalThis.executed=true">';
  globalThis.executed = false;
  t.after(() => { delete globalThis.executed; });
  const template = '你好 {nickname} {nickname}; ${process.exit()} <script>globalThis.executed=true</script> {unknown}';
  f.rule({ match: 'any', keywords: [], replyText: template });
  const message = f.ingest({ text: malicious, senderName: '$&<svg/onload=1>' });
  const reply = f.reply(message);
  assert.equal(reply.replyText, '你好 $&<svg/onload=1> $&<svg/onload=1>; ${process.exit()} <script>globalThis.executed=true</script> {unknown}');
  assert.equal(f.store.getMessage(message.id).text, malicious);
  assert.equal(globalThis.executed, false);
  f.store.approveReply(reply.id);
  assert.equal(f.store.beginSend(reply.id).reply.replyText, reply.replyText);
  assert.equal(globalThis.executed, false);
});

test('repeated nickname placeholders remain reloadable after safe text substitution', t => {
  const f = fixture(t);
  f.rule({ replyText: '{nickname}'.repeat(100) });
  const message = f.ingest({ senderName: '名'.repeat(200) });
  assert.equal(f.reply(message).replyText.length, 20000);
  assert.equal(f.reopen().snapshot().replies[0].replyText.length, 20000);
});

test('XHS preview reports expanded overlong variants without consuming the message or changing the rule', t => {
  const f = fixture(t);
  const rule = f.rule({ replyText: 'a'.repeat(980) + '{nickname}', replyVariants: ['b'.repeat(990) + '{nickname}'] });
  const before = fs.readFileSync(f.store.filePath, 'utf8');
  const preview = f.store.preview({ accountId: f.one.id, channel: 'dm', text: '资料', senderName: '名'.repeat(20) });
  assert.equal(preview.matched, true); assert.equal(preview.replyText.length, 1000); assert.equal(preview.contentValid, false);
  assert.equal(preview.contentWarnings.length, 1); assert.equal(preview.contentWarnings[0].variantIndex, 1);
  assert.equal(preview.contentWarnings[0].length, 1010); assert.equal(preview.contentWarnings[0].code, 'reply_too_long');
  assert.match(preview.contentWarnings[0].error, /1,000.*1010/);
  assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), before);
  assert.deepEqual(f.store.snapshot().rules[0], rule);
});

test('XHS generated overlong texts remain visible but never enter review, queue or a send claim', t => {
  for (const mode of ['review', 'auto']) {
    const f = fixture(t); if (mode === 'auto') f.auto();
    f.rule({ replyText: '{nickname}'.repeat(6) });
    const message = f.ingest({ senderName: '名'.repeat(200) });
    const reply = f.reply(message);
    assert.equal(reply.replyText.length, 1200); assert.equal(reply.status, 'skipped');
    assert.equal(reply.reasonCode, 'reply_too_long'); assert.match(reply.error, /1,000.*1200/);
    assert.equal(reply.claimedAt, undefined); assert.equal(reply.claimId, undefined); assert.equal(reply.approvedAt, undefined);
    assert.throws(() => f.store.approveReply(reply.id), /待确认/);
    assert.throws(() => f.store.beginSend(reply.id), /待发送/);
    assert.equal(f.reopen().getReply(reply.id).replyText, reply.replyText);
  }
});

test('XHS overlong welcomes are reported before preparation without changing rule text or enabling retry', t => {
  const f = fixture(t);
  const text = '欢'.repeat(1001);
  const rule = f.rule({ platform: 'xiaohongshu', channel: 'follow', trigger: 'follow', match: 'any', keywords: [], replyText: text });
  f.store.baselineFollowers({ accountId: f.one.id, followerIds: ['old'], observedAt: new Date(EPOCH - 1000).toISOString() });
  f.auto(f.one.id, 'dm'); f.auto(f.one.id, 'follow');
  const event = f.ingest({ channel: 'follow', threadId: 'follower:new', senderId: 'new', text: '' });
  const reply = f.reply(event);
  assert.equal(reply.status, 'skipped'); assert.equal(reply.reasonCode, 'reply_too_long');
  assert.equal(reply.preparationRetry, undefined); assert.equal(reply.replyText, text);
  assert.deepEqual(f.store.snapshot().rules[0], rule);
});

test('XHS manual batch drafts reject overlength before persistence and count UTF-16 exactly', t => {
  const f = fixture(t), message = f.ingest();
  const before = fs.readFileSync(f.store.filePath, 'utf8');
  for (const text of ['a'.repeat(1001), '😀'.repeat(501), ' ' + 'a'.repeat(1000)]) {
    assert.throws(() => f.store.checkManualDraft({ messageId: message.id, replyText: text }), /1,000/);
    assert.throws(() => f.store.createManualBatchReply({ messageId: message.id, replyText: text }), /1,000/);
    assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), before);
  }
  const text = '😀'.repeat(500);
  assert.equal(f.store.checkManualDraft({ messageId: message.id, replyText: text }).replyText, text);
  const reply = f.store.createManualBatchReply({ messageId: message.id, replyText: text });
  f.store.approveReply(reply.id);
  assert.equal(f.store.beginSend(reply.id).reply.replyText, text);
});

test('legacy XHS pending and queued overlong records stay readable but cannot be approved or claimed', t => {
  for (const status of ['pending', 'queued']) {
    const f = fixture(t); f.rule({ replyText: '旧'.repeat(1001) });
    const id = f.reply(f.ingest()).id;
    const state = JSON.parse(fs.readFileSync(f.store.filePath, 'utf8'));
    const prior = state.replies.find(reply => reply.id === id);
    prior.status = status; prior.reasonCode = status === 'pending' ? 'awaiting_review' : 'approved';
    delete prior.finishedAt; delete prior.error;
    if (status === 'queued') prior.approvedAt = new Date(EPOCH).toISOString();
    fs.writeFileSync(f.store.filePath, JSON.stringify(state));
    f.reopen();
    assert.equal(f.store.getReply(id).status, status);
    assert.throws(() => status === 'pending' ? f.store.approveReply(id) : f.store.beginSend(id), /1,000/);
    const blocked = f.store.getReply(id);
    assert.equal(blocked.status, 'cancelled'); assert.equal(blocked.reasonCode, 'reply_too_long');
    assert.equal(blocked.claimedAt, undefined); assert.equal(blocked.replyText, prior.replyText);
  }
});

test('XHS DM length gate does not change Douyin or comment text acceptance', t => {
  const f = fixture(t), text = '文'.repeat(1500);
  f.rule({ replyText: text });
  const dy = f.ingest({ accountId: f.two.id, senderId: 'dy-person' });
  const xhsComment = f.ingest({ channel: 'comment', senderId: 'comment-person' });
  for (const message of [dy, xhsComment]) {
    const reply = f.reply(message); assert.equal(reply.status, 'pending');
    f.store.approveReply(reply.id); assert.equal(f.store.beginSend(reply.id).reply.replyText, text);
  }
  const manual = f.ingest({ accountId: f.two.id, threadId: 'manual-dy', senderId: 'manual-dy-person', historical: true });
  assert.equal(f.store.checkManualDraft({ messageId: manual.id, replyText: 'x'.repeat(2000) }).replyText.length, 2000);
  assert.equal(f.store.preview({ accountId: f.two.id, channel: 'dm', text: '资料' }).contentValid, true);
});

test('review approval can claim exactly once, while confirmation requires a receipt', t => {
  const f = fixture(t);
  f.rule();
  const reply = f.reply(f.ingest());
  assert.equal(f.store.approveReply(reply.id).status, 'queued');
  assert.equal(f.store.approveReply(reply.id).status, 'queued');
  const claimed = f.store.beginSend(reply.id);
  assert.equal(claimed.reply.status, 'sending');
  assert.equal(claimed.message.id, reply.messageId);
  assert.ok(claimed.reply.claimId);
  assert.throws(() => f.store.beginSend(reply.id), /不能重复发送/);
  assert.throws(() => f.store.finishSend(reply.id, { status: 'sent' }), /凭据/);
  assert.equal(f.store.getReply(reply.id).status, 'sending');
  assert.equal(f.store.finishSend(reply.id, { status: 'sent', receipt: { platformMessageId: 'reply-1' } }).status, 'sent');
  assert.throws(() => f.store.finishSend(reply.id, { status: 'sent', receipt: 'again' }), /只有已领取/);
});

test('mode changes revoke old pending and queued replies, including approved review replies', t => {
  const f = fixture(t);
  f.rule();
  const pending = f.reply(f.ingest());
  const approved = f.reply(f.ingest({ senderId: 'second' }));
  f.store.approveReply(approved.id);
  f.auto();
  assert.equal(f.store.getReply(pending.id).status, 'cancelled');
  assert.equal(f.store.getReply(approved.id).status, 'cancelled');
  const auto = f.reply(f.ingest({ senderId: 'third' }));
  assert.equal(auto.status, 'queued');
  f.store.setMode({ accountId: f.one.id, channel: 'dm', mode: 'review' });
  assert.equal(f.store.getReply(auto.id).status, 'cancelled');
  assert.throws(() => f.store.beginSend(auto.id));
});

test('rule edits, disabling and deleting invalidate pending replies and prevent stale text sending', t => {
  const f = fixture(t);
  let rule = f.rule(); f.auto();
  const beforeEdit = f.reply(f.ingest());
  rule = f.rule({ ...rule, replyText: '新的回复' });
  assert.equal(rule.revision, 2);
  assert.equal(f.store.getReply(beforeEdit.id).status, 'cancelled');
  const beforeDisable = f.reply(f.ingest());
  rule = f.rule({ ...rule, enabled: false });
  assert.equal(f.store.getReply(beforeDisable.id).status, 'cancelled');
  assert.equal(f.reply(f.ingest()), undefined);
  rule = f.rule({ ...rule, enabled: true });
  const beforeDelete = f.reply(f.ingest());
  f.store.deleteRule(rule.id);
  assert.equal(f.store.getReply(beforeDelete.id).status, 'cancelled');
  for (const reply of [beforeEdit, beforeDisable, beforeDelete]) assert.throws(() => f.store.beginSend(reply.id));
});

test('a new higher-priority rule invalidates replies from the former matching winner', t => {
  const f = fixture(t);
  f.rule({ priority: 0 }); f.auto();
  const old = f.reply(f.ingest());
  f.rule({ name: '更高优先级', priority: 10, replyText: '新选择' });
  assert.equal(f.store.getReply(old.id).status, 'cancelled');
  assert.equal(f.reply(f.ingest()).replyText, '新选择');
});

test('delay is rechecked at claim time and a premature call keeps its queue entry', t => {
  const f = fixture(t);
  f.rule({ delaySeconds: 30 }); f.auto();
  const reply = f.reply(f.ingest());
  assert.throws(() => f.store.beginSend(reply.id), /尚未到/);
  assert.equal(f.store.getReply(reply.id).status, 'queued');
  f.setNow(EPOCH + 29999);
  assert.throws(() => f.store.beginSend(reply.id), /尚未到/);
  f.setNow(EPOCH + 30000);
  assert.equal(f.store.beginSend(reply.id).reply.status, 'sending');
});

test('automatic sending rejects old incoming messages and messages that age while queued', t => {
  const f = fixture(t);
  f.rule(); f.auto();
  const old = f.reply(f.ingest({ receivedAt: new Date(EPOCH - 600001).toISOString() }));
  assert.equal(old.status, 'skipped');
  assert.equal(old.reasonCode, 'message_too_old');
  const queued = f.reply(f.ingest());
  f.setNow(EPOCH + 600001);
  assert.throws(() => f.store.beginSend(queued.id), /10 分钟/);
  assert.equal(f.store.getReply(queued.id).status, 'skipped');
});

test('stale auto preflight expires only beyond the existing ten minute boundary and persists without claiming', t => {
  const f = fixture(t); f.rule(); f.auto();
  const reply = f.reply(f.ingest()), before = fs.readFileSync(f.store.filePath, 'utf8');
  f.setNow(EPOCH + 600000);
  failWrite(f.store, () => assert.equal(f.store.expireStaleAutoReply(reply.id), false));
  assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), before);
  f.setNow(EPOCH + 600001);
  assert.equal(f.store.expireStaleAutoReply(reply.id), true);
  const expired = f.store.getReply(reply.id);
  assert.equal(expired.status, 'skipped'); assert.equal(expired.reasonCode, 'message_too_old');
  assert.equal(expired.claimId, undefined); assert.equal(expired.claimedAt, undefined);
  assert.equal(expired.replyText, reply.replyText); assert.equal(expired.messageId, reply.messageId);
  f.reopen(); assert.deepEqual(f.store.getReply(reply.id), expired);
  const saved = fs.readFileSync(f.store.filePath, 'utf8');
  assert.equal(f.store.expireStaleAutoReply(reply.id), false);
  assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), saved);
});

for (const protectedState of ['pending', 'review-approved', 'sending', 'unknown', 'cancelled', 'paused', 'mode-off']) {
  test(`stale auto preflight preserves ${protectedState} without a disk rewrite`, t => {
    const f = fixture(t); f.rule();
    if (!['pending', 'review-approved'].includes(protectedState)) f.auto();
    const reply = f.reply(f.ingest());
    if (protectedState === 'review-approved') f.store.approveReply(reply.id);
    if (['sending', 'unknown'].includes(protectedState)) f.store.beginSend(reply.id);
    if (protectedState === 'unknown') f.store.finishSend(reply.id, { status: 'unknown', error: 'uncertain synthetic submission' });
    if (protectedState === 'cancelled') f.store.cancelReply(reply.id);
    // A preserved queued record can predate an external pause/login repair.
    if (protectedState === 'paused') {
      const raw = JSON.parse(fs.readFileSync(f.store.filePath)); raw.settings.policy.paused = true;
      fs.writeFileSync(f.store.filePath, JSON.stringify(raw));
    }
    if (protectedState === 'mode-off') f.store.pauseAccountPreservingPending(f.one.id);
    const before = fs.readFileSync(f.store.filePath, 'utf8'); f.setNow(EPOCH + 600001);
    failWrite(f.store, () => assert.equal(f.store.expireStaleAutoReply(reply.id), false));
    assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), before);
  });
}

test('stale auto preflight propagates persistence failure and never pretends an expiry was saved', t => {
  const f = fixture(t); f.rule(); f.auto(); const reply = f.reply(f.ingest());
  f.setNow(EPOCH + 600001);
  failWrite(f.store, () => assert.throws(() => f.store.expireStaleAutoReply(reply.id), /simulated/));
  assert.equal(f.store.getReply(reply.id).status, 'queued');
  assert.equal(f.store.expireStaleAutoReply(reply.id), true);
});

test('same sender cooldown covers different channels but does not cross accounts', t => {
  const f = fixture(t);
  f.rule({ cooldownMinutes: 30 }); f.auto(); f.auto(f.one.id, 'comment'); f.auto(f.two.id);
  send(f, f.reply(f.ingest()));
  const comment = f.reply(f.ingest({ channel: 'comment' }));
  assert.throws(() => f.store.beginSend(comment.id), /冷却/);
  assert.equal(f.store.getReply(comment.id).status, 'skipped');
  const otherAccount = f.reply(f.ingest({ accountId: f.two.id }));
  assert.equal(send(f, otherAccount).reply.status, 'sending');
  f.setNow(EPOCH + 30 * 60000);
  const later = f.reply(f.ingest());
  assert.equal(f.store.beginSend(later.id).reply.status, 'sending');
});

test('an in-flight or uncertain attempt reserves sender cooldown without retrying', t => {
  const f = fixture(t);
  f.rule({ cooldownMinutes: 1 }); f.auto();
  const first = f.reply(f.ingest());
  f.store.beginSend(first.id);
  const second = f.reply(f.ingest());
  assert.throws(() => f.store.beginSend(second.id), /冷却/);
  f.store.finishSend(first.id, { status: 'unknown', error: 'lost acknowledgement' });
  const third = f.reply(f.ingest());
  assert.throws(() => f.store.beginSend(third.id), /冷却/);
  assert.throws(() => f.store.beginSend(first.id), /不能重复发送/);
});

test('the per-account rolling hour permits 20 claims total, including failed and unknown outcomes', t => {
  const f = fixture(t);
  f.rule({ cooldownMinutes: 0 }); f.auto(); f.auto(f.two.id);
  for (let i = 0; i < 20; i += 1) send(f, f.reply(f.ingest({ senderId: `person-${i}` })), i % 3 === 0 ? 'failed' : i % 3 === 1 ? 'unknown' : 'sent');
  const limited = f.reply(f.ingest({ senderId: 'person-21' }));
  assert.throws(() => f.store.beginSend(limited.id), /20 条/);
  assert.equal(f.store.getReply(limited.id).reasonCode, 'hourly_limit');
  assert.equal(send(f, f.reply(f.ingest({ accountId: f.two.id }))).reply.status, 'sending');
  f.setNow(EPOCH + 60 * 60000);
  assert.equal(f.store.beginSend(f.reply(f.ingest({ senderId: 'later' })).id).reply.status, 'sending');
});

test('simultaneous claim requests return exactly one send authorization', async t => {
  const f = fixture(t);
  f.rule(); f.auto();
  const reply = f.reply(f.ingest());
  const results = await Promise.allSettled(Array.from({ length: 5 }, () => Promise.resolve().then(() => f.store.beginSend(reply.id))));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 4);
  assert.equal(f.store.getReply(reply.id).status, 'sending');
});

test('existing store instances reload under a file lock so they cannot claim the same reply twice', t => {
  const f = fixture(t);
  const other = new InteractionStore(f.store.dataDir, f.options);
  f.rule(); f.auto();
  const reply = f.reply(f.ingest());
  f.store.beginSend(reply.id);
  assert.throws(() => other.beginSend(reply.id), /不能重复发送/);
  assert.equal(other.getReply(reply.id).status, 'sending');
});

test('a restart changes sending to unknown, and manual resolution never requeues it', t => {
  const f = fixture(t);
  f.rule({ cooldownMinutes: 0 }); f.auto();
  const first = f.reply(f.ingest());
  f.store.beginSend(first.id);
  f.reopen();
  assert.equal(f.store.getReply(first.id).status, 'unknown');
  assert.equal(f.store.getReply(first.id).reasonCode, 'restart_during_send');
  assert.throws(() => f.store.beginSend(first.id), /不能重复发送/);
  assert.throws(() => f.store.cancelReply(first.id), /人工核对/);
  assert.equal(f.store.resolveUnknown(first.id, { sent: false }).status, 'failed');
  assert.throws(() => f.store.beginSend(first.id), /不能重复发送/);
  const second = f.reply(f.ingest({ senderId: 'person-2' }));
  send(f, second, 'unknown');
  const resolved = f.store.resolveUnknown(second.id, { sent: true });
  assert.equal(resolved.status, 'sent');
  assert.equal(resolved.receipt.kind, 'manual-confirmation');
  assert.throws(() => f.store.beginSend(second.id), /不能重复发送/);
  assert.throws(() => f.store.resolveUnknown(second.id, { sent: true }), /只有结果不确定/);
});

test('account deletion is rechecked before claim and prevents sending', t => {
  const f = fixture(t);
  f.rule(); f.auto();
  const reply = f.reply(f.ingest());
  f.accounts.delete(f.one.id);
  assert.throws(() => f.store.beginSend(reply.id), /账号不存在/);
  assert.equal(f.store.getReply(reply.id).status, 'cancelled');
});

test('claim revalidates stored response text against the current rule', t => {
  const f = fixture(t);
  f.rule(); f.auto();
  const reply = f.reply(f.ingest());
  const raw = JSON.parse(fs.readFileSync(f.store.filePath));
  raw.replies[0].replyText = 'stale or tampered response';
  fs.writeFileSync(f.store.filePath, JSON.stringify(raw));
  assert.throws(() => f.store.beginSend(reply.id), /规则或匹配/);
  assert.equal(f.store.getReply(reply.id).status, 'cancelled');
});

test('failed metadata commits roll back ingestion, mode changes and claims', t => {
  const f = fixture(t);
  f.rule(); f.auto();
  const before = f.store.snapshot();
  failWrite(f.store, () => assert.throws(() => f.ingest(), /simulated/));
  assert.deepEqual(f.store.snapshot(), before);
  const reply = f.reply(f.ingest());
  failWrite(f.store, () => assert.throws(() => f.store.setMode({ accountId: f.one.id, channel: 'dm', mode: 'off' }), /simulated/));
  assert.equal(f.store.getMode(f.one.id, 'dm'), 'auto');
  assert.equal(f.store.getReply(reply.id).status, 'queued');
  failWrite(f.store, () => assert.throws(() => f.store.beginSend(reply.id), /simulated/));
  assert.equal(f.store.getReply(reply.id).status, 'queued');
  assert.equal(f.store.getReply(reply.id).claimId, undefined);
  assert.deepEqual(fs.readdirSync(f.store.dataDir), ['interactions.json']);
  assert.equal(f.store.beginSend(reply.id).reply.status, 'sending');
});

test('lost persistence of a send result stays claimed and becomes unknown on restart', t => {
  const f = fixture(t);
  f.rule(); f.auto();
  const reply = f.reply(f.ingest());
  f.store.beginSend(reply.id);
  failWrite(f.store, () => assert.throws(() => f.store.finishSend(reply.id, { status: 'sent', receipt: 'observed platform confirmation' }), /simulated/));
  assert.equal(f.store.getReply(reply.id).status, 'sending');
  assert.equal(f.reopen().getReply(reply.id).status, 'unknown');
  assert.throws(() => f.store.beginSend(reply.id), /不能重复发送/);
});

test('shutdown cancels only unsent work; an in-flight send stays uncertain after restart', t => {
  const f = fixture(t);
  f.rule({ cooldownMinutes: 0 }); f.auto();
  const pending = f.reply(f.ingest({ accountId: f.two.id }));
  const queued = f.reply(f.ingest());
  const sending = f.reply(f.ingest({ senderId: 'person-2' }));
  f.store.beginSend(sending.id);
  f.store.shutdown();
  assert.equal(f.store.getReply(pending.id).status, 'cancelled');
  assert.equal(f.store.getReply(queued.id).status, 'cancelled');
  assert.equal(f.store.getReply(sending.id).status, 'sending');
  assert.equal(f.reopen().getReply(sending.id).status, 'unknown');
});

test('receipt validation rejects executable objects without calling their code', t => {
  const f = fixture(t);
  f.rule(); f.auto();
  const reply = f.reply(f.ingest());
  f.store.beginSend(reply.id);
  let calls = 0;
  assert.throws(() => f.store.finishSend(reply.id, { status: 'sent', receipt: { toJSON() { calls += 1; return 'bad'; } } }), /JSON/);
  const getter = {};
  Object.defineProperty(getter, 'proof', { enumerable: true, get() { calls += 1; return 'bad'; } });
  assert.throws(() => f.store.finishSend(reply.id, { status: 'sent', receipt: getter }), /JSON/);
  const inherited = Object.create({ toJSON() { calls += 1; return 'bad'; } });
  inherited.proof = true;
  assert.throws(() => f.store.finishSend(reply.id, { status: 'sent', receipt: inherited }), /JSON/);
  const inheritedArray = [1];
  Object.setPrototypeOf(inheritedArray, { toJSON() { calls += 1; return 'bad'; } });
  assert.throws(() => f.store.finishSend(reply.id, { status: 'sent', receipt: { proof: inheritedArray } }), /JSON/);
  assert.equal(calls, 0);
  assert.equal(f.store.getReply(reply.id).status, 'sending');
});

test('symlinked metadata and corrupt files fail closed without modifying the original', t => {
  const f = fixture(t);
  const outside = path.join(f.root, 'outside.json');
  fs.writeFileSync(outside, '{"private":true}');
  fs.unlinkSync(f.store.filePath);
  fs.symlinkSync(outside, f.store.filePath);
  assert.throws(() => f.store.snapshot(), /普通文件/);
  assert.throws(() => f.rule(), /普通文件/);
  assert.equal(fs.readFileSync(outside, 'utf8'), '{"private":true}');
  fs.unlinkSync(f.store.filePath);
  fs.writeFileSync(f.store.filePath, '{broken');
  assert.throws(() => f.reopen(), /原文件已保留/);
  assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), '{broken');
});

function firstRule(f, overrides = {}) {
  return f.rule({ trigger: 'first-message', channel: 'dm', match: 'any', keywords: [], cooldownMinutes: 0, ...overrides });
}
function followRule(f, overrides = {}) {
  return f.rule({ trigger: 'follow', channel: 'follow', match: 'any', keywords: [], cooldownMinutes: 0, ...overrides });
}
function follow(f, overrides = {}) {
  return f.ingest({ channel: 'follow', threadId: undefined, text: '', ...overrides });
}
function baseline(f, followerIds = [], accountId = f.one.id, observedAt = new Date(EPOCH).toISOString()) {
  return f.store.baselineFollowers({ accountId, followerIds, observedAt });
}

test('validation-local indexes preserve first-event, reply, baseline and external-source constraints', t => {
  const f = fixture(t);
  f.rule({ cooldownMinutes: 0 }); followRule(f); baseline(f);
  const dm = f.ingest({ senderId: 'dm-index-peer' });
  f.setNow(EPOCH + 1000);
  const follower = follow(f, { senderId: 'follow-index-peer' });
  const raw = JSON.parse(fs.readFileSync(f.store.filePath, 'utf8'));
  raw.externalAttempts.push({
    id: randomUUID(), accountId: f.two.id, primaryAccountId: f.one.id,
    platform: dm.platform, channel: 'dm', recipientId: dm.senderId,
    sourceMessageId: dm.id, sourceExternalId: dm.externalId,
    claimedAt: new Date(EPOCH + 1000).toISOString(), taskDigest: 'a'.repeat(64),
  });
  const validated = f.store._validate(raw);
  assert.equal(validated.dmSenders.find(item => item.senderId === dm.senderId).firstMessageId, dm.id);
  assert.equal(validated.followers.find(item => item.senderId === follower.senderId).firstEventId, follower.id);
  assert.equal(validated.externalAttempts[0].sourceMessageId, dm.id);
  assert.deepEqual(f.store._validate(validated), validated);
  assert.equal(Object.hasOwn(validated, 'messageById'), false);
  assert.equal(Object.hasOwn(validated, 'baselineByAccount'), false);

  const invalid = [
    [state => state.messages.push({ ...state.messages[0], externalId: 'another-external-id' }), /重复记录/],
    [state => state.followBaselines.push({ ...state.followBaselines[0] }), /粉丝基线不能重复/],
    [state => { state.dmSenders[0].firstMessageId = randomUUID(); }, /首次事件关联不正确/],
    [state => { state.dmSenders[0].firstMessageId = follower.id; }, /首次事件关联不正确/],
    [state => { state.followers[0].firstEventId = dm.id; }, /首次事件关联不正确/],
    [state => { state.followBaselines = []; }, /首次关注事件缺少有效基线/],
    [state => { state.followBaselines[0].observedAt = follower.receivedAt; }, /首次关注事件缺少有效基线/],
    [state => { state.replies[0].messageId = randomUUID(); }, /回复关联消息不正确/],
    [state => { state.replies[0].accountId = f.two.id; }, /回复关联消息不正确/],
    [state => { state.externalAttempts[0].sourceMessageId = randomUUID(); }, /协作发送记录与真实来源不一致/],
    [state => { state.externalAttempts[0].recipientId = 'other-peer'; }, /协作发送记录与真实来源不一致/],
  ];
  for (const [change, expected] of invalid) {
    const altered = structuredClone(raw); change(altered);
    assert.throws(() => f.store._validate(altered), expected);
    assert.deepEqual(f.store._validate(raw), validated, 'indexes must be rebuilt for each independent validation');
  }
  // Later file reads must not reuse references from an earlier successful read.
  fs.writeFileSync(f.store.filePath, JSON.stringify(raw));
  assert.equal(f.store.getPolicy().paused, false);
  const altered = structuredClone(raw);
  altered.externalAttempts[0].sourceExternalId = 'different-source';
  fs.writeFileSync(f.store.filePath, JSON.stringify(altered));
  assert.throws(() => f.store.getPolicy(), /协作发送记录与真实来源不一致/);
  fs.writeFileSync(f.store.filePath, JSON.stringify(raw));
  assert.equal(f.store.getPolicy().paused, false);
});

test('policy defaults preserve 0.2 limits, review mode and account-wide cooldown', t => {
  const f = fixture(t);
  assert.deepEqual(f.store.getPolicy(), { paused: false, timeZone: 'Asia/Shanghai', sendWindows: [], hourlyLimit: 20, dailyLimit: null, cooldownScope: 'account', listMode: 'off', allowlist: [], blocklist: [], mutedUsers: [] });
  assert.equal(f.store.getMode(f.one.id, 'follow'), 'review');
  const rule = f.rule();
  assert.equal(rule.trigger, 'message');
  assert.deepEqual(rule.replyVariants, []);
  const copy = f.store.getPolicy();
  copy.paused = true;
  assert.equal(f.store.getPolicy().paused, false);
});

test('0.2 metadata migrates without turning existing senders or replies into first events', t => {
  const f = fixture(t);
  const legacyRule = f.rule();
  const known = f.ingest();
  const legacyReply = f.reply(known);
  const raw = JSON.parse(fs.readFileSync(f.store.filePath));
  delete raw.settings.policy;
  delete raw.dmSenders; delete raw.followers; delete raw.followBaselines;
  for (const rule of raw.rules) { delete rule.trigger; delete rule.replyVariants; }
  for (const reply of raw.replies) delete reply.trigger;
  fs.writeFileSync(f.store.filePath, JSON.stringify(raw));
  f.reopen();
  assert.equal(f.store.getPolicy().hourlyLimit, 20);
  assert.equal(f.store.getReply(legacyReply.id).trigger, 'message');
  f.store.approveReply(legacyReply.id);
  assert.equal(send(f, legacyReply).reply.status, 'sending');
  f.store.deleteRule(legacyRule.id);
  firstRule(f);
  assert.equal(f.reply(f.ingest()), undefined);
  assert.equal(f.reply(f.ingest({ senderId: 'actually-new' })).trigger, 'first-message');
  assert.equal(JSON.parse(fs.readFileSync(f.store.filePath)).schemaVersion, 1);
});

test('first-message triggers once per account sender and only for eligible private messages', t => {
  const f = fixture(t);
  firstRule(f);
  for (const flags of [{ isOwn: true }, { isGroup: true }, { text: '   ' }, { channel: 'comment' }]) assert.equal(f.reply(f.ingest(flags)), undefined);
  const input = f.input({ externalId: 'first' });
  const first = f.store.ingest(input);
  assert.equal(f.reply(first).trigger, 'first-message');
  assert.equal(f.store.ingest(input).id, first.id);
  assert.equal(f.reply(f.ingest()), undefined);
  f.reopen();
  assert.equal(f.reply(f.ingest()), undefined);
  assert.equal(f.reply(f.ingest({ accountId: f.two.id })).trigger, 'first-message');
  assert.equal(f.store.snapshot().replies.length, 2);
});

test('off, paused, unmatched and historical first messages cannot be replayed later as new', t => {
  const f = fixture(t);
  firstRule(f, { match: 'contains', keywords: ['资料'] });
  f.store.setMode({ accountId: f.one.id, channel: 'dm', mode: 'off' });
  assert.equal(f.reply(f.ingest({ senderId: 'off-user' })), undefined);
  f.auto();
  assert.equal(f.reply(f.ingest({ senderId: 'off-user' })), undefined);
  f.store.updatePolicy({ paused: true });
  assert.equal(f.reply(f.ingest({ senderId: 'paused-user' })), undefined);
  f.store.updatePolicy({ paused: false });
  assert.equal(f.reply(f.ingest({ senderId: 'paused-user' })), undefined);
  assert.equal(f.reply(f.ingest({ senderId: 'unmatched-user', text: '你好' })), undefined);
  assert.equal(f.reply(f.ingest({ senderId: 'unmatched-user' })), undefined);
  f.ingest({ senderId: 'known-user', historical: true });
  assert.equal(f.reply(f.ingest({ senderId: 'known-user' })), undefined);
  assert.equal(f.store.snapshot().replies.length, 0);
});

test('late historical private messages revoke an unsent first welcome without creating another', t => {
  const f = fixture(t);
  firstRule(f); f.auto();
  const reply = f.reply(f.ingest());
  assert.equal(reply.status, 'queued');
  f.ingest({ historical: true, receivedAt: new Date(EPOCH - 1000).toISOString() });
  assert.equal(f.store.getReply(reply.id).status, 'cancelled');
  assert.throws(() => f.store.beginSend(reply.id));
  assert.equal(f.reply(f.ingest()), undefined);
});

test('first-event previews use stable sender identity and do not consume the event', t => {
  const f = fixture(t);
  firstRule(f);
  const input = { accountId: f.one.id, channel: 'dm', text: '你好', senderId: 'new-person', senderName: '小明' };
  assert.equal(f.store.preview({ ...input, senderId: undefined }).matched, false);
  assert.equal(f.store.preview(input).matched, true);
  assert.equal(f.store.preview(input).matched, true);
  assert.ok(f.reply(f.ingest({ senderId: input.senderId })));
  assert.equal(f.store.preview(input).matched, false);
  followRule(f);
  const follower = { ...input, channel: 'follow', text: '', senderId: 'new-follower' };
  assert.equal(f.store.preview(follower).matched, false);
  baseline(f);
  assert.equal(f.store.preview(follower).matched, true);
});

test('follow observations fail closed before baseline and register every loaded old follower', t => {
  const f = fixture(t);
  followRule(f); f.auto(f.one.id, 'follow');
  const before = follow(f, { senderId: 'observed-before-baseline' });
  assert.equal(before.historical, true);
  assert.equal(f.reply(before), undefined);
  const result = baseline(f, ['old-a', 'old-b']);
  assert.equal(result.followerCount, 3);
  assert.deepEqual(baseline(f, ['old-a', 'old-b']), result);
  f.setNow(EPOCH + 1000);
  for (const senderId of ['old-a', 'old-b', 'observed-before-baseline']) assert.equal(f.reply(follow(f, { senderId })), undefined);
  const newFollower = follow(f, { senderId: 'new-follower' });
  assert.equal(newFollower.historical, false);
  assert.equal(newFollower.threadId, 'follower:new-follower');
  assert.equal(newFollower.externalIdSource, 'platform-event-id');
  assert.equal(f.reply(newFollower).trigger, 'follow');
  assert.equal(f.reply(newFollower).status, 'queued');
});

test('follow requires stable event identity and keeps a logical follower queue target', t => {
  const f = fixture(t);
  followRule(f); baseline(f); f.setNow(EPOCH + 1000);
  for (const bad of [{ externalId: '' }, { senderId: '' }, { receivedAt: undefined }, { externalIdSource: 'scrape-time' }, { threadId: 'real-conversation-id' }]) assert.throws(() => follow(f, bad));
  const observed = follow(f, { externalId: 'user-raw-time:100:2026-10-12T06:00:01Z', senderId: '100', externalIdSource: 'follower-id-and-time' });
  assert.equal(observed.threadId, 'follower:100');
  assert.equal(f.reopen().getMessage(observed.id).externalIdSource, 'follower-id-and-time');
  assert.throws(() => f.store.baselineFollowers({ accountId: f.one.id, observedAt: new Date(EPOCH).toISOString() }), /粉丝编号/);
});

test('follow events at or before baseline are historical and cannot be made new later', t => {
  const f = fixture(t);
  followRule(f); baseline(f);
  for (const [index, receivedAt] of [EPOCH - 1, EPOCH].entries()) {
    const message = follow(f, { senderId: `old-${index}`, receivedAt: new Date(receivedAt).toISOString() });
    assert.equal(message.historical, true);
    assert.equal(f.reply(message), undefined);
  }
  f.setNow(EPOCH + 1000);
  assert.equal(f.reply(follow(f, { senderId: 'old-0' })), undefined);
  assert.equal(f.reply(follow(f, { senderId: 'explicit-history', historical: true })), undefined);
  assert.equal(f.reply(follow(f, { senderId: 'explicit-history' })), undefined);
});

test('welcome is reserved once per account follower despite event-ID changes, unknown result and restart', t => {
  const f = fixture(t);
  followRule(f); f.auto(f.one.id, 'follow'); f.auto(f.two.id, 'follow');
  baseline(f); baseline(f, [], f.two.id); f.setNow(EPOCH + 1000);
  const first = follow(f, { externalId: 'stable-follow' });
  const reply = f.reply(first);
  assert.equal(follow(f, { externalId: 'stable-follow' }).id, first.id);
  assert.equal(f.reply(follow(f, { externalId: 'changed-notification-id' })), undefined);
  assert.equal(f.store.getReply(reply.id).status, 'queued');
  send(f, reply, 'unknown');
  f.reopen();
  f.store.setMode({ accountId: f.one.id, channel: 'follow', mode: 'off' });
  f.auto(f.one.id, 'follow');
  assert.equal(f.reply(follow(f)), undefined);
  assert.equal(f.store.snapshot().replies.filter(item => item.accountId === f.one.id).length, 1);
  assert.equal(f.reply(follow(f, { accountId: f.two.id })).trigger, 'follow');
  assert.throws(() => f.store.beginSend(reply.id), /不能重复发送/);
});

test('advancing a follower baseline revokes stale welcomes and never forgets older known identities', t => {
  const f = fixture(t);
  followRule(f); baseline(f, ['old']); f.setNow(EPOCH + 1000);
  const reply = f.reply(follow(f, { senderId: 'just-seen' }));
  const newer = baseline(f, ['loaded-old'], f.one.id, new Date(EPOCH + 1000).toISOString());
  assert.equal(newer.followerCount, 3);
  assert.equal(f.store.getReply(reply.id).status, 'cancelled');
  const older = baseline(f, [], f.one.id, new Date(EPOCH).toISOString());
  assert.equal(older.observedAt, newer.observedAt);
  f.setNow(EPOCH + 2000);
  for (const senderId of ['old', 'just-seen', 'loaded-old']) assert.equal(f.reply(follow(f, { senderId })), undefined);
});

test('ordinary message rules never reply to follow events and trigger/channel combinations are validated', t => {
  const f = fixture(t);
  f.rule({ match: 'any', keywords: [], priority: 100 }); baseline(f); f.setNow(EPOCH + 1000);
  assert.equal(f.reply(follow(f)), undefined);
  for (const bad of [{ trigger: 'unknown' }, { trigger: 'first-message', channel: 'comment' }, { trigger: 'first-message', channel: 'all' }, { trigger: 'follow', channel: 'dm' }, { trigger: 'message', channel: 'follow' }]) assert.throws(() => f.rule(bad));
  const welcome = f.store.saveRule({ name: '欢迎', trigger: 'follow', replyText: '谢谢关注' });
  assert.equal(welcome.channel, 'follow');
  assert.equal(welcome.match, 'any');
  assert.equal(f.reply(follow(f, { senderId: 'different-follower' })).ruleId, welcome.id);
});

test('global pause revokes every unsent channel and does not create or resurrect replies', t => {
  const f = fixture(t);
  f.rule({ match: 'any', keywords: [], cooldownMinutes: 0 }); followRule(f);
  f.auto(); f.auto(f.one.id, 'follow'); baseline(f); f.setNow(EPOCH + 1000);
  const queued = f.reply(f.ingest());
  const pending = f.reply(f.ingest({ channel: 'comment' }));
  const welcome = f.reply(follow(f));
  const sending = f.reply(f.ingest({ senderId: 'sending-user' }));
  f.store.beginSend(sending.id);
  const updated = f.store.updatePolicy({ paused: true });
  assert.equal(updated.paused, true);
  for (const reply of [queued, pending, welcome]) {
    assert.equal(f.store.getReply(reply.id).status, 'cancelled');
    assert.equal(f.store.getReply(reply.id).reasonCode, 'global_paused');
    assert.throws(() => f.store.beginSend(reply.id));
  }
  assert.equal(f.store.getReply(sending.id).status, 'sending');
  const input = f.input({ senderId: 'during-pause' });
  const observed = f.store.ingest(input);
  assert.equal(f.reply(observed), undefined);
  f.store.updatePolicy({ paused: false });
  assert.equal(f.store.ingest(input).id, observed.id);
  assert.equal(f.reply(observed), undefined);
  assert.equal(f.store.getReply(queued.id).status, 'cancelled');
});

test('claim reloads and rechecks global policy even if a queued record predates a policy change', t => {
  const f = fixture(t);
  f.rule(); f.auto();
  const reply = f.reply(f.ingest());
  const raw = JSON.parse(fs.readFileSync(f.store.filePath));
  raw.settings.policy.paused = true;
  fs.writeFileSync(f.store.filePath, JSON.stringify(raw));
  assert.throws(() => f.store.beginSend(reply.id), /全局暂停/);
  assert.equal(f.store.getReply(reply.id).status, 'cancelled');
  assert.equal(f.store.getReply(reply.id).claimId, undefined);
  assert.equal(f.reply(f.ingest({ senderId: 'new-after-pause' })), undefined);
});

test('Shanghai sending windows use inclusive start, exclusive end and support midnight crossing', t => {
  const cases = [
    ['2026-10-12T00:59:59Z', { start: '09:00', end: '18:00' }, false],
    ['2026-10-12T01:00:00Z', { start: '09:00', end: '18:00' }, true],
    ['2026-10-12T10:00:00Z', { start: '09:00', end: '18:00' }, false],
    ['2026-10-12T14:00:00Z', { start: '22:00', end: '06:00' }, true],
    ['2026-10-12T21:59:59Z', { start: '22:00', end: '06:00' }, true],
    ['2026-10-12T22:00:00Z', { start: '22:00', end: '06:00' }, false],
    ['2026-10-12T15:59:59Z', { start: '00:00', end: '24:00' }, true],
  ];
  for (const [now, window, allowed] of cases) {
    const f = fixture(t);
    f.setNow(Date.parse(now)); f.rule(); f.auto();
    f.store.updatePolicy({ sendWindows: [window] });
    const reply = f.reply(f.ingest());
    if (allowed) assert.equal(f.store.beginSend(reply.id).reply.status, 'sending');
    else {
      assert.throws(() => f.store.beginSend(reply.id), /发送时段/);
      assert.equal(f.store.getReply(reply.id).reasonCode, 'outside_send_window');
    }
  }
});

test('policy changes revoke queued work outside the new window and block approved review sends too', t => {
  const f = fixture(t);
  f.rule();
  const approved = f.reply(f.ingest());
  f.store.approveReply(approved.id);
  f.store.updatePolicy({ sendWindows: [{ start: '21:00', end: '22:00' }] });
  assert.equal(f.store.getReply(approved.id).status, 'cancelled');
  const later = f.reply(f.ingest({ senderId: 'new' }));
  f.store.approveReply(later.id);
  assert.throws(() => f.store.beginSend(later.id), /发送时段/);
  f.store.updatePolicy({ sendWindows: [] });
  assert.equal(f.store.getReply(later.id).status, 'skipped');
});

test('hourly policy quota counts all channels and ambiguous attempts while keeping accounts isolated', t => {
  const f = fixture(t);
  f.rule({ cooldownMinutes: 0 }); followRule(f);
  f.auto(); f.auto(f.one.id, 'comment'); f.auto(f.one.id, 'follow'); f.auto(f.two.id);
  baseline(f); f.setNow(EPOCH + 1000);
  f.store.updatePolicy({ hourlyLimit: 2 });
  send(f, f.reply(f.ingest({ senderId: 'dm' })), 'failed');
  send(f, f.reply(follow(f, { senderId: 'follower' })), 'unknown');
  const limited = f.reply(f.ingest({ channel: 'comment', senderId: 'comment' }));
  assert.throws(() => f.store.beginSend(limited.id), /2 条/);
  assert.equal(f.store.getReply(limited.id).reasonCode, 'hourly_limit');
  assert.equal(send(f, f.reply(f.ingest({ accountId: f.two.id }))).reply.status, 'sending');
  f.setNow(EPOCH + 1000 + 3600000);
  assert.equal(f.store.beginSend(f.reply(f.ingest({ senderId: 'next-hour' })).id).reply.status, 'sending');
});

test('daily quota resets at Shanghai midnight and includes failed and unknown claims', t => {
  const f = fixture(t);
  f.setNow(Date.parse('2026-10-12T15:59:00Z'));
  f.rule({ cooldownMinutes: 0 }); f.auto(); f.auto(f.one.id, 'comment');
  f.store.updatePolicy({ hourlyLimit: 100, dailyLimit: 2 });
  send(f, f.reply(f.ingest({ senderId: 'one' })), 'failed');
  send(f, f.reply(f.ingest({ channel: 'comment', senderId: 'two' })), 'unknown');
  const over = f.reply(f.ingest({ senderId: 'three' }));
  assert.throws(() => f.store.beginSend(over.id), /今天.*2 条/);
  assert.equal(f.store.getReply(over.id).reasonCode, 'daily_limit');
  f.setNow(Date.parse('2026-10-12T16:00:00Z'));
  assert.equal(f.store.beginSend(f.reply(f.ingest({ senderId: 'new-day' })).id).reply.status, 'sending');
  assert.equal(f.reopen().getPolicy().dailyLimit, 2);
});

test('cooldown scope can be narrowed to a channel and still rejects repeated replies in that channel', t => {
  const f = fixture(t);
  f.rule({ cooldownMinutes: 30 }); f.auto(); f.auto(f.one.id, 'comment');
  f.store.updatePolicy({ cooldownScope: 'channel' });
  send(f, f.reply(f.ingest()));
  assert.equal(send(f, f.reply(f.ingest({ channel: 'comment' }))).reply.status, 'sending');
  const dm = f.reply(f.ingest());
  assert.throws(() => f.store.beginSend(dm.id), /冷却/);
  f.store.updatePolicy({ cooldownScope: 'account' });
  const comment = f.reply(f.ingest({ channel: 'comment' }));
  assert.throws(() => f.store.beginSend(comment.id), /冷却/);
});

test('allowlists, blocks and permanent mute use exact account-user pairs across channels', t => {
  const f = fixture(t);
  f.rule({ cooldownMinutes: 0 }); f.auto(); f.auto(f.one.id, 'comment'); f.auto(f.two.id);
  const allowed = { accountId: f.one.id, senderId: 'allowed' };
  const existing = f.reply(f.ingest({ senderId: 'outsider' }));
  f.store.updatePolicy({ listMode: 'allowlist', allowlist: [allowed] });
  assert.equal(f.store.getReply(existing.id).reasonCode, 'not_allowlisted');
  assert.equal(f.reply(f.ingest({ senderId: 'outsider' })), undefined);
  assert.equal(f.reply(f.ingest({ accountId: f.two.id, senderId: 'allowed' })), undefined);
  const dm = f.reply(f.ingest({ senderId: 'allowed' }));
  const comment = f.reply(f.ingest({ channel: 'comment', senderId: 'allowed' }));
  f.store.updatePolicy({ mutedUsers: [allowed] });
  for (const reply of [dm, comment]) {
    assert.equal(f.store.getReply(reply.id).status, 'cancelled');
    assert.equal(f.store.getReply(reply.id).reasonCode, 'muted_user');
  }
  const suppressedInput = f.input({ senderId: 'allowed' });
  const suppressed = f.store.ingest(suppressedInput);
  assert.equal(f.reply(suppressed), undefined);
  f.store.updatePolicy({ mutedUsers: [], blocklist: [allowed] });
  assert.equal(f.reply(f.ingest({ senderId: 'allowed' })), undefined);
  f.store.updatePolicy({ blocklist: [] });
  assert.equal(f.store.ingest(suppressedInput).id, suppressed.id);
  assert.equal(f.reply(suppressed), undefined);
  assert.equal(f.reply(f.ingest({ senderId: 'allowed' })).status, 'queued');
});

test('policy validation is atomic and global pause still works with a deleted account in an existing list', t => {
  const f = fixture(t);
  const member = { accountId: f.one.id, senderId: 'user' };
  const before = f.store.getPolicy();
  for (const bad of [{ paused: 'true' }, { timeZone: 'UTC' }, { hourlyLimit: 0 }, { hourlyLimit: 1001 }, { dailyLimit: 0 }, { cooldownScope: 'global' }, { listMode: 'blacklist' }, { unknown: true }, { sendWindows: [{ start: '9:00', end: '18:00' }] }, { sendWindows: [{ start: '09:00', end: '09:00' }] }, { allowlist: [member, member] }, { blocklist: [{ ...member, accountId: randomUUID() }] }, { mutedUsers: [{ ...member, senderId: '' }] }]) {
    assert.throws(() => f.store.updatePolicy(bad));
    assert.deepEqual(f.store.getPolicy(), before);
  }
  f.store.updatePolicy({ blocklist: [member] });
  f.accounts.delete(f.one.id);
  assert.equal(f.store.updatePolicy({ paused: true }).paused, true);
});

test('reply variants are chosen once, rendered literally, and remain valid through reload and claim', t => {
  const f = fixture(t);
  const rule = f.rule({ cooldownMinutes: 0, replyText: '主回复 {nickname}', replyVariants: ['候选一 {nickname}', '候选二 {nickname} <script>neverRun()</script>'] });
  f.auto();
  const senderName = '$&<img onerror=neverRun()>';
  const choices = [rule.replyText, ...rule.replyVariants].map(text => text.replace(/\{nickname\}/g, () => senderName));
  const reply = f.reply(f.ingest({ senderName }));
  assert.ok(choices.includes(reply.replyText));
  f.reopen();
  assert.equal(f.store.getReply(reply.id).replyText, reply.replyText);
  assert.equal(send(f, reply).reply.replyText, reply.replyText);
  const queued = f.reply(f.ingest({ senderId: 'second', senderName }));
  f.rule({ ...rule, replyVariants: ['新候选'] });
  assert.equal(f.store.getReply(queued.id).status, 'cancelled');
  for (const variants of [Array(21).fill('候选'), [''], ['x'.repeat(2001)], [1]]) assert.throws(() => f.rule({ replyVariants: variants }));
});

test('invalid variant text cannot pass claim-time membership validation', t => {
  const f = fixture(t);
  f.rule({ replyVariants: ['替换候选'] }); f.auto();
  const reply = f.reply(f.ingest());
  const raw = JSON.parse(fs.readFileSync(f.store.filePath));
  raw.replies[0].replyText = '文本不属于此规则';
  fs.writeFileSync(f.store.filePath, JSON.stringify(raw));
  assert.throws(() => f.store.beginSend(reply.id), /规则或匹配/);
  assert.equal(f.store.getReply(reply.id).status, 'cancelled');
});

test('persistence failure rolls back policy, baseline and first-event identity reservations', t => {
  const f = fixture(t);
  firstRule(f); followRule(f);
  const before = fs.readFileSync(f.store.filePath, 'utf8');
  failWrite(f.store, () => assert.throws(() => f.store.updatePolicy({ paused: true }), /simulated/));
  assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), before);
  failWrite(f.store, () => assert.throws(() => baseline(f, ['old']), /simulated/));
  assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), before);
  const input = f.input();
  failWrite(f.store, () => assert.throws(() => f.store.ingest(input), /simulated/));
  assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), before);
  assert.equal(f.reply(f.store.ingest(input)).trigger, 'first-message');
  baseline(f); f.setNow(EPOCH + 1000);
  const followInput = f.input({ channel: 'follow', threadId: undefined, text: '' });
  const withBaseline = fs.readFileSync(f.store.filePath, 'utf8');
  failWrite(f.store, () => assert.throws(() => f.store.ingest(followInput), /simulated/));
  assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), withBaseline);
  assert.equal(f.reply(f.store.ingest(followInput)).trigger, 'follow');
  assert.deepEqual(fs.readdirSync(f.store.dataDir), ['interactions.json']);
});

test('two store instances serialize first-message reservations and permit exactly one welcome claim', async t => {
  const f = fixture(t);
  const other = new InteractionStore(f.store.dataDir, f.options);
  firstRule(f); f.auto();
  const first = f.input({ externalId: 'first-instance' });
  const second = f.input({ externalId: 'other-instance' });
  const results = await Promise.all([Promise.resolve().then(() => f.store.ingest(first)), Promise.resolve().then(() => other.ingest(second))]);
  const snapshot = f.store.snapshot();
  assert.equal(snapshot.messages.length, 2);
  assert.equal(snapshot.replies.length, 1);
  assert.equal(snapshot.replies[0].messageId, results[0].id);
  const claims = await Promise.allSettled([Promise.resolve().then(() => f.store.beginSend(snapshot.replies[0].id)), Promise.resolve().then(() => other.beginSend(snapshot.replies[0].id))]);
  assert.equal(claims.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(f.store.getReply(snapshot.replies[0].id).trigger, 'first-message');
});

test('widening cooldown scope immediately revokes now-disallowed queued channel replies', t => {
  const f = fixture(t);
  f.rule(); f.auto(); f.auto(f.one.id, 'comment');
  f.store.updatePolicy({ cooldownScope: 'channel' });
  send(f, f.reply(f.ingest()));
  const comment = f.reply(f.ingest({ channel: 'comment' }));
  assert.equal(comment.status, 'queued');
  f.store.updatePolicy({ cooldownScope: 'account' });
  assert.equal(f.store.getReply(comment.id).status, 'cancelled');
  assert.equal(f.store.getReply(comment.id).reasonCode, 'sender_cooldown');
  assert.throws(() => f.store.beginSend(comment.id));
});

test('assertCanCommit verifies a single existing claim without consuming its own quotas or cooldown', t => {
  const f = fixture(t);
  f.rule({ replyVariants: ['另一个固定候选'] }); f.auto();
  f.store.updatePolicy({ hourlyLimit: 1, dailyLimit: 1 });
  const reply = f.reply(f.ingest());
  assert.throws(() => f.store.assertCanCommit(reply.id), /已领取/);
  const claim = f.store.beginSend(reply.id);
  const before = fs.readFileSync(f.store.filePath, 'utf8');
  assert.equal(f.store.assertCanCommit(reply.id), true);
  assert.equal(f.store.assertCanCommit(reply.id), true);
  assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), before);
  assert.equal(f.store.getReply(reply.id).replyText, claim.reply.replyText);
  assert.equal(f.store.getReply(reply.id).claimId, claim.reply.claimId);
  f.store.finishSend(reply.id, { status: 'sent', receipt: 'checked' });
  assert.throws(() => f.store.assertCanCommit(reply.id), /已领取/);
});

test('a global pause during asynchronous preparation blocks the final commit without rewriting a claim', t => {
  const f = fixture(t);
  f.rule(); f.auto();
  const reply = f.reply(f.ingest());
  const claim = f.store.beginSend(reply.id);
  f.store.updatePolicy({ paused: true });
  assert.throws(() => f.store.assertCanCommit(reply.id), /全局暂停/);
  assert.equal(f.store.getReply(reply.id).status, 'sending');
  assert.equal(f.store.getReply(reply.id).claimId, claim.reply.claimId);
});

test('commit rechecks changed lists, mode, rule and account after preparation has begun', t => {
  for (const scenario of ['block', 'mute', 'allow', 'mode', 'rule', 'account']) {
    const f = fixture(t);
    const rule = f.rule(); f.auto();
    const reply = f.reply(f.ingest());
    f.store.beginSend(reply.id);
    const member = { accountId: f.one.id, senderId: 'person-1' };
    if (scenario === 'block') f.store.updatePolicy({ blocklist: [member] });
    if (scenario === 'mute') f.store.updatePolicy({ mutedUsers: [member] });
    if (scenario === 'allow') f.store.updatePolicy({ listMode: 'allowlist', allowlist: [] });
    if (scenario === 'mode') f.store.setMode({ accountId: f.one.id, channel: 'dm', mode: 'off' });
    if (scenario === 'rule') f.rule({ ...rule, replyText: '另一版规则文案' });
    if (scenario === 'account') f.accounts.delete(f.one.id);
    assert.throws(() => f.store.assertCanCommit(reply.id), undefined, scenario);
    assert.equal(f.store.getReply(reply.id).status, 'sending');
  }
});

test('commit rejects a send window closing or an automatic message aging during asynchronous preparation', t => {
  const f = fixture(t);
  f.setNow(Date.parse('2026-10-12T09:59:00Z'));
  f.rule(); f.auto();
  f.store.updatePolicy({ sendWindows: [{ start: '09:00', end: '18:00' }] });
  const reply = f.reply(f.ingest());
  f.store.beginSend(reply.id);
  assert.equal(f.store.assertCanCommit(reply.id), true);
  f.setNow(Date.parse('2026-10-12T10:00:00Z'));
  assert.throws(() => f.store.assertCanCommit(reply.id), /发送时段/);
  f.store.updatePolicy({ sendWindows: [] });
  f.setNow(Date.parse('2026-10-12T10:09:01Z'));
  assert.throws(() => f.store.assertCanCommit(reply.id), /10 分钟/);
  assert.equal(f.store.getReply(reply.id).status, 'sending');
});

test('commit excludes only its own reservation and still counts other claims against tightened limits', t => {
  const f = fixture(t);
  f.rule({ cooldownMinutes: 0 }); f.auto();
  f.store.updatePolicy({ hourlyLimit: 2 });
  const first = f.reply(f.ingest());
  const second = f.reply(f.ingest({ senderId: 'second' }));
  f.store.beginSend(first.id); f.store.beginSend(second.id);
  assert.equal(f.store.assertCanCommit(first.id), true);
  assert.equal(f.store.assertCanCommit(second.id), true);
  f.store.updatePolicy({ hourlyLimit: 1 });
  assert.throws(() => f.store.assertCanCommit(first.id), /一小时/);
  assert.throws(() => f.store.assertCanCommit(second.id), /一小时/);
  f.store.updatePolicy({ hourlyLimit: 20, dailyLimit: 1 });
  assert.throws(() => f.store.assertCanCommit(first.id), /今天/);
});

test('batch reply preflight is strictly read-only and returns the reviewed source and rule', t => {
  const f = fixture(t), rule = f.rule(), message = f.ingest(), reply = f.reply(message);
  const before = fs.readFileSync(f.store.filePath, 'utf8');
  const check = f.store.checkBatchReply(reply.id);
  assert.deepEqual(check.reply, reply); assert.deepEqual(check.message, message); assert.deepEqual(check.rule, rule);
  assert.deepEqual(check.account, f.one);
  check.reply.replyText = 'not an edit';
  assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), before);
  assert.deepEqual(f.store.getReply(reply.id), reply);
});

for (const kind of ['approved', 'auto', 'comment', 'claimed', 'historical', 'own', 'group']) test(`batch preflight refuses ${kind} replies without mutating state`, t => {
  const f = fixture(t); f.rule({ cooldownMinutes: 0 });
  if (kind === 'auto') f.auto();
  const message = f.ingest({ channel: kind === 'comment' ? 'comment' : 'dm' }), reply = f.reply(message);
  if (kind === 'approved' || kind === 'claimed') f.store.approveReply(reply.id);
  if (kind === 'claimed') f.store.beginSend(reply.id);
  if (['historical', 'own', 'group'].includes(kind)) {
    const state = JSON.parse(fs.readFileSync(f.store.filePath, 'utf8'));
    state.messages.find(item => item.id === message.id)[{ historical: 'historical', own: 'isOwn', group: 'isGroup' }[kind]] = true;
    state.dmSenders.find(item => item.firstMessageId === message.id).firstMessageId = null;
    fs.writeFileSync(f.store.filePath, JSON.stringify(state));
  }
  const before = fs.readFileSync(f.store.filePath, 'utf8');
  assert.throws(() => f.store.checkBatchReply(reply.id));
  assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), before);
});

test('batch preflight enforces delay then shared hourly and daily attempt limits without skipping pending reply', t => {
  const f = fixture(t); f.rule({ delaySeconds: 30, cooldownMinutes: 0 });
  const first = f.reply(f.ingest({ senderId: 'one' })), second = f.reply(f.ingest({ senderId: 'two' }));
  let before = fs.readFileSync(f.store.filePath, 'utf8');
  assert.throws(() => f.store.checkBatchReply(first.id), /尚未到/);
  assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), before);
  f.setNow(EPOCH + 30000); f.store.checkBatchReply(first.id);
  f.store.updatePolicy({ hourlyLimit: 1 }); f.store.approveReply(first.id); send(f, first);
  before = fs.readFileSync(f.store.filePath, 'utf8');
  assert.throws(() => f.store.checkBatchReply(second.id), /一小时/);
  assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), before);
  assert.equal(f.store.getReply(second.id).status, 'pending');
  // Updating the policy deliberately invalidates older unsent replies; create a
  // fresh candidate under the new policy to exercise read-only daily checking.
  f.store.updatePolicy({ hourlyLimit: 20, dailyLimit: 1 });
  const third = f.reply(f.ingest({ senderId: 'three' }));
  f.setNow(EPOCH + 60000); before = fs.readFileSync(f.store.filePath, 'utf8');
  assert.throws(() => f.store.checkBatchReply(third.id), /今天/);
  assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), before);
});

test('batch preflight enforces recipient cooldown and sending windows without changing review status', t => {
  const f = fixture(t); f.rule({ cooldownMinutes: 10 });
  const first = f.reply(f.ingest()); f.store.approveReply(first.id); send(f, first);
  const second = f.reply(f.ingest());
  let before = fs.readFileSync(f.store.filePath, 'utf8');
  assert.throws(() => f.store.checkBatchReply(second.id), /冷却/);
  assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), before);
  f.store.updatePolicy({ sendWindows: [{ start: '00:00', end: '00:01' }] });
  const third = f.reply(f.ingest({ senderId: 'new-user' }));
  before = fs.readFileSync(f.store.filePath, 'utf8');
  assert.throws(() => f.store.checkBatchReply(third.id), /时段/);
  assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), before);
});

test('manual historical DM reply has explicit provenance, no synthetic rule, and survives restart', t => {
  const f = fixture(t), message = f.ingest({ historical: true, text: '之前的问题' });
  f.auto();
  const before = fs.readFileSync(f.store.filePath, 'utf8');
  const check = f.store.checkManualDraft({ messageId: message.id, replyText: '统一文案\n保留换行' });
  assert.equal(check.message.historical, true); assert.equal(check.policy.cooldownMinutes, 0);
  assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), before);
  const reply = f.store.createManualBatchReply({ messageId: message.id, replyText: check.replyText, expectedMessage: check.message });
  assert.equal(reply.origin, 'manual-batch'); assert.equal(reply.ruleId, undefined); assert.equal(reply.ruleRevision, undefined); assert.equal(reply.trigger, undefined);
  assert.equal(reply.status, 'pending'); assert.equal(f.store.getMode(f.one.id, 'dm'), 'auto');
  assert.equal(f.store.snapshot().rules.length, 0);
  f.store.checkBatchReply(reply.id); f.store.approveReply(reply.id);
  const claimed = f.store.beginSend(reply.id);
  assert.equal(claimed.message.historical, true); assert.equal(f.store.assertCanCommit(reply.id), true);
  f.store.finishSend(reply.id, { status: 'sent', receipt: { kind: 'fixture-existing-chat', id: 'receipt-1' } });
  assert.equal(f.reopen().getReply(reply.id).origin, 'manual-batch');
  assert.throws(() => f.store.checkManualDraft({ messageId: message.id, replyText: 'repeat' }), /已有回复记录/);
});

for (const issue of ['own', 'group', 'comment', 'blank', 'off', 'duplicate']) test(`manual draft rejects ${issue} source without creating a record`, t => {
  const f = fixture(t);
  const message = f.ingest({ historical: true, text: issue === 'blank' ? '' : '历史私信', isOwn: issue === 'own', isGroup: issue === 'group', channel: issue === 'comment' ? 'comment' : 'dm' });
  if (issue === 'off') f.store.setMode({ accountId: f.one.id, channel: 'dm', mode: 'off' });
  if (issue === 'duplicate') { const old = f.store.createManualBatchReply({ messageId: message.id, replyText: 'first' }); f.store.approveReply(old.id); send(f, old); }
  const before = fs.readFileSync(f.store.filePath, 'utf8');
  assert.throws(() => f.store.checkManualDraft({ messageId: message.id, replyText: 'reply' }));
  assert.throws(() => f.store.createManualBatchReply({ messageId: message.id, replyText: 'reply' }));
  assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), before);
});

test('manual reply creation rechecks exact source and newer inbound invalidates an in-flight reply', t => {
  const f = fixture(t), message = f.ingest({ historical: true });
  const expected = { ...message, text: 'stale text' };
  assert.throws(() => f.store.createManualBatchReply({ messageId: message.id, replyText: 'answer', expectedMessage: expected }), /原始私信已变化/);
  assert.equal(f.store.snapshot().replies.length, 0);
  const reply = f.store.createManualBatchReply({ messageId: message.id, replyText: 'answer', expectedMessage: message });
  f.store.approveReply(reply.id); f.store.beginSend(reply.id);
  f.setNow(EPOCH + 1000); f.ingest({ historical: true, text: '更新的问题' });
  assert.throws(() => f.store.assertCanCommit(reply.id), /更新的来信/);
});

test('manual replies respect an already-active rule cooldown without inventing one', t => {
  const f = fixture(t); f.rule({ cooldownMinutes: 10 });
  const first = f.reply(f.ingest()); f.store.approveReply(first.id); send(f, first);
  f.setNow(EPOCH + 1000);
  const recent = f.ingest({ historical: true, text: '第二个问题' });
  assert.throws(() => f.store.checkManualDraft({ messageId: recent.id, replyText: 'answer' }), /已生效.*冷却/);
  f.setNow(EPOCH + 10 * 60000 + 1);
  assert.equal(f.store.checkManualDraft({ messageId: recent.id, replyText: 'answer' }).policy.cooldownMinutes, 0);
});

test('rule edits do not cancel reviewed manual replies but channel off still stops them', t => {
  const f = fixture(t), message = f.ingest({ historical: true });
  const reply = f.store.createManualBatchReply({ messageId: message.id, replyText: 'manual answer' });
  const rule = f.rule(); f.store.saveRule({ ...rule, replyText: 'changed rule' });
  assert.equal(f.store.getReply(reply.id).status, 'pending');
  f.store.checkBatchReply(reply.id);
  f.store.setMode({ accountId: f.one.id, channel: 'dm', mode: 'off' });
  assert.throws(() => f.store.approveReply(reply.id));
});

for (const status of ['pending', 'cancelled', 'skipped']) test(`manual confirmation replaces only untouched ${status} reply and keeps its id unique`, t => {
  const f = fixture(t); f.rule();
  const message = f.ingest(), previous = f.reply(message);
  if (status === 'cancelled') f.store.cancelReply(previous.id);
  if (status === 'skipped') f.store.failBeforeSend(previous.id, { error: 'page not connected before any attempt' });
  const check = f.store.checkManualDraft({ messageId: message.id, replyText: '本次统一填写的文案' });
  assert.equal(check.existingReply.id, previous.id); assert.equal(check.existingReply.status, status);
  const replaced = f.store.createManualBatchReply({ messageId: message.id, replyText: check.replyText, expectedMessage: check.message, expectedExistingReply: check.existingReply });
  assert.equal(replaced.id, previous.id); assert.equal(replaced.origin, 'manual-batch'); assert.equal(replaced.replyText, check.replyText);
  assert.equal(replaced.ruleId, undefined); assert.equal(replaced.finishedAt, undefined); assert.equal(replaced.approvedAt, undefined);
  assert.equal(f.store.snapshot().replies.length, 1);
  f.store.approveReply(replaced.id); send(f, replaced);
  assert.equal(f.store.getReply(previous.id).status, 'sent');
});

test('manual draft rejects cancelled or skipped replies that already had approval or a send claim', t => {
  const f = fixture(t); f.rule({ cooldownMinutes: 0 });
  for (const state of ['approved-cancelled', 'approved-skipped', 'claimed-failed', 'claimed-unknown']) {
    const message = f.ingest({ senderId: state, threadId: state }), reply = f.reply(message);
    f.store.approveReply(reply.id);
    if (state === 'approved-cancelled') f.store.cancelReply(reply.id);
    else if (state === 'approved-skipped') f.store.failBeforeSend(reply.id, { error: 'no active connection' });
    else send(f, reply, state === 'claimed-unknown' ? 'unknown' : 'failed');
    const before = fs.readFileSync(f.store.filePath, 'utf8');
    assert.throws(() => f.store.checkManualDraft({ messageId: message.id, replyText: 'different text' }));
    assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), before);
  }
});

test('atomic manual replacement refuses changed previous reply even when it is still safely unattempted', t => {
  const f = fixture(t); f.rule(); const message = f.ingest(), old = f.reply(message);
  const check = f.store.checkManualDraft({ messageId: message.id, replyText: 'manual' });
  f.store.cancelReply(old.id);
  assert.throws(() => f.store.createManualBatchReply({ messageId: message.id, replyText: check.replyText, expectedExistingReply: check.existingReply }), /待回复记录已变化/);
  assert.equal(f.store.getReply(old.id).status, 'cancelled'); assert.equal(f.store.getReply(old.id).origin, undefined);
});

test('manual draft excludes a latest inbound already followed by an own outbound', t => {
  const f = fixture(t), message = f.ingest({ historical: true });
  f.setNow(EPOCH + 1000); f.ingest({ historical: true, isOwn: true, text: '已在平台直接回复' });
  const before = fs.readFileSync(f.store.filePath, 'utf8');
  assert.throws(() => f.store.checkManualDraft({ messageId: message.id, replyText: 'duplicate answer' }), /已有本账号发出/);
  assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), before);
  f.setNow(EPOCH + 2000); const latest = f.ingest({ historical: true, text: '对方又发来一个新问题' });
  assert.equal(f.store.checkManualDraft({ messageId: latest.id, replyText: 'new answer' }).message.id, latest.id);
});

test('manual draft rejects unresolved older send on the same thread until it is explicitly resolved', t => {
  const f = fixture(t), first = f.ingest({ historical: true });
  const reply = f.store.createManualBatchReply({ messageId: first.id, replyText: 'answer' });
  f.store.approveReply(reply.id); send(f, reply, 'unknown');
  f.setNow(EPOCH + 1000); const next = f.ingest({ historical: true, text: '后来的新问题' });
  assert.throws(() => f.store.checkManualDraft({ messageId: next.id, replyText: 'new answer' }), /发送结果未明确/);
  f.store.resolveUnknown(reply.id, { sent: false });
  assert.equal(f.store.checkManualDraft({ messageId: next.id, replyText: 'new answer' }).message.id, next.id);
});

test('late DOM receipt settles only its original unknown claim and survives restart',t=>{
 const f=fixture(t);f.rule();f.auto();const original=f.reply(f.ingest()),claim=send(f,original,'unknown').reply;
 const proof={accountId:claim.accountId,claimId:claim.claimId,text:claim.replyText,receipt:'platform:confirmed-original'};
 for(const patch of [{claimId:randomUUID()},{accountId:f.two.id},{text:'changed'},{receipt:'guessed'}])assert.throws(()=>f.store.confirmObservedReply(claim.id,{...proof,...patch}));
 assert.equal(f.store.getReply(claim.id).status,'unknown');assert.equal(f.store.confirmObservedReply(claim.id,proof).status,'sent');
 f.reopen();assert.equal(f.store.getReply(claim.id).receipt,proof.receipt);assert.throws(()=>f.store.beginSend(claim.id));assert.throws(()=>f.store.confirmObservedReply(claim.id,proof));
});
test('native acknowledgement matches UUID, account, peer, conversation and frozen reply text',t=>{
 const f=fixture(t);f.rule();f.auto(f.two.id);const original=f.reply(f.ingest({accountId:f.two.id,senderId:'123456',threadId:'original-thread'})),claim=send(f,original,'unknown').reply;
 const fingerprint=require('node:crypto').createHash('sha256').update(JSON.stringify(['original-thread',claim.replyText])).digest('hex');
 const proof={requestId:claim.claimId,messageId:'123456789012',peer:'123456',threadId:'original-thread',fingerprint};
 for(const patch of [{requestId:randomUUID()},{peer:'other'},{threadId:'other'},{fingerprint:'bad'}])assert.equal(f.store.confirmNativeMessages(f.two.id,[{...proof,...patch}]).resolved,0);
 assert.equal(f.store.confirmNativeMessages(f.one.id,[proof]).resolved,0);
 assert.equal(f.store.confirmNativeMessages(f.two.id,[proof]).resolved,1);assert.equal(f.store.confirmNativeMessages(f.two.id,[proof]).resolved,0);
 assert.equal(f.store.getReply(claim.id).receipt.messageId,proof.messageId);assert.throws(()=>f.store.beginSend(claim.id));
});
