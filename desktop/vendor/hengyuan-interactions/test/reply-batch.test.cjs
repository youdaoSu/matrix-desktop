'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { InteractionStore } = require('../src/interaction-store.cjs');
const { ReplyBatchController, PREVIEW_TTL_MS } = require('../src/reply-batch.cjs');
const EPOCH = Date.parse('2026-10-14T06:00:00.000Z');
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hy-reply-batch-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let now = EPOCH, seq = 0;
  const account = { id: randomUUID(), name: '测试接待账号', platform: 'douyin' };
  const accounts = [account];
  const store = new InteractionStore(root, { getAccount: id => { const found = accounts.find(item => item.id === id); assert.ok(found); return found; }, now: () => now });
  const rule = store.saveRule({ name: '资料回复', platform: 'all', accountIds: [], channel: 'dm', match: 'contains', keywords: ['资料'], replyText: '您好，资料已整理。', enabled: true, priority: 0, cooldownMinutes: 0, delaySeconds: 0 });
  const manager = {
    binding: { platform: 'douyin', identity: '1234567', establishedAt: new Date(EPOCH).toISOString() },
    calls: [], reserved: null, cancel: [], released: [], before: null, receiptStatus: 'sent',
    previewBatchReply(id) { const reply = store.getReply(id); return reply.origin === 'manual-batch' ? this.previewBatchDraft({ message: store.getMessage(reply.messageId), replyText: reply.replyText }) : { fingerprint: createHash('sha256').update(JSON.stringify([id, this.binding, reply.replyText])).digest('hex'), binding: structuredClone(this.binding) }; },
    previewBatchDraft({ message, replyText }) { return { fingerprint: createHash('sha256').update(JSON.stringify([message, this.binding, replyText])).digest('hex'), binding: structuredClone(this.binding) }; },
    reserveReplyBatch(batchId, items) { assert.equal(this.reserved, null); this.reserved = { batchId, items }; },
    releaseReplyBatch(batchId) { this.released.push(batchId); this.reserved = null; },
    cancelReplyBatchOperation(batchId) { this.cancel.push(batchId); },
    async sendBatchReply(id, { batchId, fingerprint }) {
      assert.equal(this.replyBatchController.isAuthorized(id, batchId), true);
      assert.equal(this.reserved.batchId, batchId);
      assert.equal(this.previewBatchReply(id).fingerprint, fingerprint);
      this.calls.push(id);
      store.approveReply(id); store.beginSend(id);
      if (this.before) await this.before(id, batchId);
      const status = this.replyBatchController.isAuthorized(id, batchId) ? this.receiptStatus : 'unknown';
      store.finishSend(id, { status, ...(status === 'sent' ? { receipt: { kind: 'fixture-page-receipt', externalId: id } } : { error: 'fixture send result' }) });
      return { sent: status === 'sent', unknown: status === 'unknown' };
    },
  };
  const controller = new ReplyBatchController({ interactions: store, manager, now: () => now });
  return { root, account, accounts, store, rule, manager, controller, setNow(value) { now = value; }, message(overrides = {}) {
    const n = ++seq;
    return store.ingest({ accountId: account.id, channel: 'dm', externalId: `ext-${n}`, threadId: `thread-${n}`, senderId: `sender-${n}`, senderName: `用户${n}`, text: '以前来信', receivedAt: new Date(now).toISOString(), isOwn: false, isGroup: false, historical: true, ...overrides });
  }, reply(overrides = {}) {
    const n = ++seq;
    const message = store.ingest({ accountId: account.id, channel: 'dm', externalId: `ext-${n}`, threadId: `thread-${n}`, senderId: `sender-${n}`, senderName: `用户${n}`, text: '请给我资料', receivedAt: new Date(now).toISOString(), isOwn: false, isGroup: false, historical: false, ...overrides });
    return store.snapshot().replies.find(reply => reply.messageId === message.id);
  }, preview(replies) { return controller.preview({ replyIds: replies.map(reply => reply.id) }); }, edit(action) {
    const state = JSON.parse(fs.readFileSync(store.filePath, 'utf8')); action(state); fs.writeFileSync(store.filePath, JSON.stringify(state));
  } };
}

test('preview shows exact inbound account, recipient, text and route without approving or writing', t => {
  const f = fixture(t), reply = f.reply();
  const before = fs.readFileSync(f.store.filePath, 'utf8');
  const p = f.preview([reply]);
  assert.equal(p.total, 1); assert.equal(Date.parse(p.expiresAt), EPOCH + PREVIEW_TTL_MS);
  assert.deepEqual(p.tasks[0], { id: reply.id, accountId: f.account.id, accountName: f.account.name, platform: 'douyin', recipientId: 'sender-1', recipientName: '用户1', threadId: 'thread-1', incomingText: '请给我资料', replyText: '您好，资料已整理。', dueAt: new Date(EPOCH).toISOString() });
  assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), before);
  assert.equal(f.manager.calls.length, 0); assert.equal(f.manager.reserved, null);
  assert.equal(f.controller.isAuthorized(reply.id, p.token), false);
});

test('each send is sequential, original account is retained and remaining items stay pending', async t => {
  const f = fixture(t), replies = [f.reply(), f.reply(), f.reply()];
  const gate = deferred();
  f.manager.before = async () => { if (f.manager.calls.length === 1) await gate.promise; };
  const p = f.preview(replies), started = f.controller.start({ token: p.token });
  assert.equal(started.status, 'running'); assert.equal(started.total, 3);
  await Promise.resolve();
  assert.deepEqual(f.manager.calls, [replies[0].id]);
  assert.equal(f.store.getReply(replies[1].id).status, 'pending');
  assert.equal(f.store.getReply(replies[1].id).approvedAt, undefined);
  assert.throws(() => f.preview([replies[1]]), /正在执行/);
  assert.throws(() => f.controller.start({ token: p.token }), /正在执行/);
  assert.equal(f.controller.isAuthorized(replies[1].id, started.id), false);
  gate.resolve();
  const result = await f.controller.idle();
  assert.equal(result.status, 'completed'); assert.equal(result.sent, 3); assert.equal(result.remaining, 0);
  assert.deepEqual(f.manager.calls, replies.map(reply => reply.id));
  assert.equal(f.manager.released.length, 1); assert.equal(f.manager.reserved, null);
  assert.equal(f.controller.active, false); assert.equal(f.controller.isAuthorized(replies[2].id, started.id), false);
  assert.throws(() => f.controller.start({ token: p.token }), /过期或已使用/);
});

for (const status of ['unknown', 'failed']) test(`${status} result stops entire batch with no retry or later approval`, async t => {
  const f = fixture(t), replies = [f.reply(), f.reply()]; f.manager.receiptStatus = status;
  f.controller.start({ token: f.preview(replies).token });
  const result = await f.controller.idle();
  assert.equal(result.status, 'attention'); assert.equal(result[status === 'unknown' ? 'unknown' : 'failed'], 1);
  assert.equal(result.remaining, 1); assert.equal(f.manager.calls.length, 1);
  assert.equal(f.store.getReply(replies[1].id).status, 'pending');
  assert.equal(f.store.getReply(replies[1].id).approvedAt, undefined);
  assert.throws(() => f.preview([replies[0]]), /尚未确认/);
});

test('stop before execution never approves any item and releases reservation', async t => {
  const f = fixture(t), replies = [f.reply(), f.reply()];
  const started = f.controller.start({ token: f.preview(replies).token });
  assert.equal(f.controller.stop().status, 'stopping');
  const result = await f.controller.idle();
  assert.equal(result.status, 'stopped'); assert.equal(result.remaining, 2); assert.equal(result.sent, 0);
  assert.deepEqual(f.manager.calls, []); assert.deepEqual(f.manager.cancel, [started.id]);
  assert.equal(f.store.getReply(replies[0].id).status, 'pending');
});

test('account stop revokes only matching automatic and manual previews', async t => {
  const f = fixture(t), other = { ...f.account, id: randomUUID() }; f.accounts.push(other);
  const own = f.reply(), peer = f.reply({ accountId: other.id }), message = f.message();
  const related = f.preview([own]), mixed = f.preview([own, peer]);
  const manual = f.controller.preview({ messageIds: [message.id], replyText: '已确认文案' });
  const unrelated = f.preview([peer]);
  assert.equal(f.controller.stopAccount(f.account.id), null);
  for (const preview of [related, mixed, manual]) assert.throws(() => f.controller.start({ token: preview.token }), /过期或已使用/);
  assert.equal(f.manager.calls.length, 0); assert.equal(f.store.getReply(own.id).status, 'pending');
  f.controller.start({ token: unrelated.token }); await f.controller.idle();
  assert.deepEqual(f.manager.calls, [peer.id]);
});

test('account stop before dispatch stops an affected mixed batch and reports all affected accounts', async t => {
  const f = fixture(t), other = { ...f.account, id: randomUUID() }; f.accounts.push(other);
  const replies = [f.reply(), f.reply({ accountId: other.id }), f.reply()];
  const started = f.controller.start({ token: f.preview(replies).token });
  const affected = f.controller.stopAccount(other.id);
  assert.deepEqual(affected, { kind: 'reply', id: started.id, scope: 'batch', accountIds: [f.account.id, other.id] });
  assert.equal(f.controller.snapshot().status, 'stopping');
  affected.accountIds.length = 0;
  const result = await f.controller.idle();
  assert.equal(result.status, 'stopped'); assert.deepEqual(f.manager.calls, []);
  assert.deepEqual(f.manager.cancel, [started.id]); assert.deepEqual(f.manager.released, [started.id]);
  assert.ok(replies.every(reply => f.store.getReply(reply.id).status === 'pending'));
  assert.equal(f.controller.stopAccount(other.id), null);
});

test('unrelated account stop does not revoke an active reply batch', async t => {
  const f = fixture(t), replies = [f.reply(), f.reply()], gate = deferred();
  f.manager.before = async () => { if (f.manager.calls.length === 1) await gate.promise; };
  const started = f.controller.start({ token: f.preview(replies).token }); await Promise.resolve();
  assert.equal(f.controller.stopAccount(randomUUID()), null);
  assert.equal(f.controller.isAuthorized(replies[0].id, started.id), true); assert.deepEqual(f.manager.cancel, []);
  gate.resolve(); assert.equal((await f.controller.idle()).status, 'completed');
  assert.deepEqual(f.manager.calls, replies.map(reply => reply.id));
});

test('account stop revokes in-flight reply authorization and preserves unknown settlement', async t => {
  const f = fixture(t), replies = [f.reply(), f.reply()], gate = deferred(); f.manager.before = () => gate.promise;
  const started = f.controller.start({ token: f.preview(replies).token }); await Promise.resolve();
  assert.equal(f.controller.stopAccount(f.account.id).id, started.id);
  assert.equal(f.controller.isAuthorized(replies[0].id, started.id), false);
  let idle = false; const settled = f.controller.idle().then(result => { idle = true; return result; });
  await Promise.resolve(); assert.equal(idle, false);
  gate.resolve(); const result = await settled;
  assert.equal(result.unknown, 1); assert.equal(result.remaining, 1); assert.equal(f.manager.calls.length, 1);
});

test('stop while platform commit is unresolved preserves unknown and leaves remaining pending', async t => {
  const f = fixture(t), replies = [f.reply(), f.reply()], gate = deferred();
  f.manager.before = () => gate.promise;
  const started = f.controller.start({ token: f.preview(replies).token });
  await Promise.resolve();
  f.controller.stop(); assert.equal(f.controller.isAuthorized(replies[0].id, started.id), false);
  gate.resolve(); const result = await f.controller.idle();
  assert.equal(result.status, 'attention'); assert.equal(result.unknown, 1); assert.equal(result.remaining, 1);
  assert.equal(f.manager.calls.length, 1); assert.equal(f.store.getReply(replies[1].id).status, 'pending');
});

test('expired, malformed and cross-controller preview tokens do no work', async t => {
  const f = fixture(t), reply = f.reply(), p = f.preview([reply]);
  for (const input of [undefined, {}, { token: 'x' }, { token: randomUUID() }]) assert.throws(() => f.controller.start(input));
  f.setNow(EPOCH + PREVIEW_TTL_MS);
  assert.throws(() => f.controller.start({ token: p.token }), /过期/);
  assert.equal(f.manager.calls.length, 0); assert.equal(f.store.getReply(reply.id).status, 'pending');
  assert.equal((await f.controller.idle()).status, 'idle');
});

for (const field of ['replyText', 'threadId', 'senderId', 'binding', 'accountName', 'rule']) test(`changed ${field} invalidates the entire reviewed batch before any approval`, t => {
  const f = fixture(t), replies = [f.reply(), f.reply()], p = f.preview(replies);
  if (field === 'binding') f.manager.binding.establishedAt = new Date(EPOCH + 1).toISOString();
  else if (field === 'accountName') f.account.name = '变更后的账号';
  else if (field === 'rule') f.store.saveRule({ ...f.rule, name: 'changed name' });
  else f.edit(state => {
    const last = state.replies.find(item => item.id === replies[1].id);
    if (field === 'replyText') last.replyText = '另一个文案';
    else {
      state.messages.find(message => message.id === last.messageId)[field] = `changed-${field}`;
      if (field === 'senderId') state.dmSenders.find(item => item.firstMessageId === last.messageId).senderId = `changed-${field}`;
    }
  });
  assert.throws(() => f.controller.start({ token: p.token }));
  assert.equal(f.manager.calls.length, 0); assert.equal(f.manager.reserved, null);
  assert.equal(f.store.getReply(replies[0].id).approvedAt, undefined);
});

test('preview data returned to caller cannot change server-side approval', async t => {
  const f = fixture(t), reply = f.reply(), p = f.preview([reply]);
  p.tasks[0].replyText = '注入文本'; p.tasks[0].recipientId = 'other-person';
  const result = f.controller.start({ token: p.token, tasks: p.tasks });
  assert.equal(result.tasks[0].replyText, '您好，资料已整理。');
  assert.equal(result.tasks[0].recipientId, 'sender-1');
  assert.equal((await f.controller.idle()).sent, 1);
});

test('preview rejects duplicate ids, oversized batches and duplicate conversations', t => {
  const f = fixture(t), one = f.reply(), two = f.reply({ threadId: 'thread-1', senderId: 'sender-1' });
  for (const replyIds of [[], [one.id, one.id], [one.id, randomUUID()], Array.from({ length: 51 }, () => randomUUID())]) assert.throws(() => f.controller.preview({ replyIds }));
  assert.throws(() => f.preview([one, two]), /同一个会话/);
});

test('shared hourly policy stops before next approval after first send reaches the limit', async t => {
  const f = fixture(t), replies = [f.reply(), f.reply()]; f.store.updatePolicy({ hourlyLimit: 1 });
  f.controller.start({ token: f.preview(replies).token });
  const result = await f.controller.idle();
  assert.equal(result.status, 'attention'); assert.equal(result.sent, 1); assert.equal(result.remaining, 1);
  assert.equal(f.store.getReply(replies[1].id).status, 'pending'); assert.equal(f.store.getReply(replies[1].id).approvedAt, undefined);
  assert.equal(f.manager.calls.length, 1); assert.match(result.detail, /一小时/);
});

test('reservation failure is atomic and does not consume still-valid preview', async t => {
  const f = fixture(t), reply = f.reply(), p = f.preview([reply]);
  const reserve = f.manager.reserveReplyBatch;
  f.manager.reserveReplyBatch = () => { throw new Error('page busy'); };
  assert.throws(() => f.controller.start({ token: p.token }), /page busy/);
  assert.equal(f.controller.active, false); assert.equal(f.store.getReply(reply.id).status, 'pending');
  f.manager.reserveReplyBatch = reserve;
  f.controller.start({ token: p.token }); assert.equal((await f.controller.idle()).sent, 1);
});

test('deferred/no-result manager response is never reported as sent and pauses remainder', async t => {
  const f = fixture(t), replies = [f.reply(), f.reply()];
  f.manager.sendBatchReply = async () => ({ deferred: true });
  f.controller.start({ token: f.preview(replies).token });
  const result = await f.controller.idle();
  assert.equal(result.status, 'attention'); assert.equal(result.sent, 0); assert.equal(result.remaining, 2);
});

test('changed second reply while first awaits receipt stops remaining unapproved', async t => {
  const f = fixture(t), replies = [f.reply(), f.reply()], gate = deferred();
  f.manager.before = () => gate.promise;
  f.controller.start({ token: f.preview(replies).token }); await Promise.resolve();
  f.edit(state => { state.messages.find(item => item.id === replies[1].messageId).text = '资料内容已修改'; });
  gate.resolve(); const result = await f.controller.idle();
  assert.equal(result.status, 'attention'); assert.equal(result.sent, 1); assert.equal(result.remaining, 1);
  assert.equal(f.manager.calls.length, 1); assert.equal(f.store.getReply(replies[1].id).approvedAt, undefined);
});

test('manual common text preview admits historical inbound conversations without rules or writes', t => {
  const f = fixture(t), messages = [f.message(), f.message()];
  f.store.deleteRule(f.rule.id);
  const before = fs.readFileSync(f.store.filePath, 'utf8');
  const replyText = '统一回复\n资料已整理。';
  const preview = f.controller.preview({ messageIds: messages.map(item => item.id), replyText });
  assert.equal(preview.total, 2);
  for (let i = 0; i < 2; i++) {
    assert.equal(preview.tasks[i].id, messages[i].id); assert.equal(preview.tasks[i].messageId, messages[i].id);
    assert.equal(preview.tasks[i].manual, true); assert.equal(preview.tasks[i].replyText, replyText);
    assert.equal(preview.tasks[i].accountId, f.account.id);
  }
  assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), before);
  assert.equal(f.store.snapshot().replies.length, 0);
});

test('manual batch creates only current reply, sends exact common body, and keeps original channel modes', async t => {
  const f = fixture(t), messages = [f.message(), f.message()], gate = deferred();
  f.store.setMode({ accountId: f.account.id, channel: 'dm', mode: 'auto' });
  const policy = f.store.snapshot().settings;
  f.manager.before = async () => { if (f.manager.calls.length === 1) await gate.promise; };
  const p = f.controller.preview({ messageIds: messages.map(item => item.id), replyText: '同一段回复，保留空格  。' });
  f.controller.start({ token: p.token }); await Promise.resolve();
  const during = f.store.snapshot().replies;
  assert.equal(during.length, 1); assert.equal(during[0].origin, 'manual-batch');
  assert.equal(during[0].ruleId, undefined); assert.equal(during[0].status, 'sending');
  assert.equal(f.controller.snapshot().remaining, 1);
  assert.equal(f.controller.snapshot().current.messageId, messages[0].id);
  gate.resolve(); const result = await f.controller.idle();
  assert.equal(result.status, 'completed'); assert.equal(result.sent, 2);
  assert.deepEqual(result.tasks.map(item => item.id), messages.map(item => item.id));
  assert.ok(result.tasks.every(item => typeof item.replyId === 'string'));
  assert.deepEqual(f.store.snapshot().settings, policy);
  for (const reply of f.store.snapshot().replies) {
    assert.equal(reply.replyText, '同一段回复，保留空格  。');
    assert.equal(reply.origin, 'manual-batch'); assert.equal(reply.accountId, f.account.id);
  }
});

test('manual stop before first dispatch leaves no artificial replies or sending permissions', async t => {
  const f = fixture(t), message = f.message();
  const p = f.controller.preview({ messageIds: [message.id], replyText: '收到' });
  f.controller.start({ token: p.token }); f.controller.stop();
  const result = await f.controller.idle();
  assert.equal(result.status, 'stopped'); assert.equal(result.remaining, 1);
  assert.equal(f.store.snapshot().replies.length, 0); assert.equal(f.manager.calls.length, 0);
});

test('manual ambiguous send stops next conversation and cannot be previewed or replayed again', async t => {
  const f = fixture(t), messages = [f.message(), f.message()]; f.manager.receiptStatus = 'unknown';
  const p = f.controller.preview({ messageIds: messages.map(item => item.id), replyText: '资料答复' });
  f.controller.start({ token: p.token }); const result = await f.controller.idle();
  assert.equal(result.status, 'attention'); assert.equal(result.unknown, 1); assert.equal(result.remaining, 1);
  assert.equal(f.store.snapshot().replies.length, 1); assert.equal(f.manager.calls.length, 1);
  assert.throws(() => f.controller.preview({ messageIds: [messages[0].id], replyText: '再发一次' }), /已有回复记录|发送结果未明确/);
  assert.equal(f.controller.preview({ messageIds: [messages[1].id], replyText: '资料答复' }).total, 1);
});

test('manual preview rejects invalid text, duplicate conversations and mixed selection modes without mutations', t => {
  const f = fixture(t), message = f.message(), before = fs.readFileSync(f.store.filePath, 'utf8');
  for (const replyText of ['', '  ', 'x'.repeat(2001), null, 10, 'nul\0value']) assert.throws(() => f.controller.preview({ messageIds: [message.id], replyText }));
  assert.throws(() => f.controller.preview({ messageIds: [message.id], replyIds: [message.id], replyText: 'no' }));
  assert.equal(fs.readFileSync(f.store.filePath, 'utf8'), before);
});

test('newer incoming message invalidates entire manual preview before any reply creation', t => {
  const f = fixture(t), messages = [f.message(), f.message()];
  const p = f.controller.preview({ messageIds: messages.map(item => item.id), replyText: '收到资料请求' });
  f.setNow(EPOCH + 1000); f.message({ threadId: messages[1].threadId, senderId: messages[1].senderId });
  assert.throws(() => f.controller.start({ token: p.token }), /更新的来信/);
  assert.equal(f.store.snapshot().replies.length, 0); assert.equal(f.manager.reserved, null);
});

test('manual shared hourly bound stops remaining conversations without creating their replies', async t => {
  const f = fixture(t), messages = [f.message(), f.message()]; f.store.updatePolicy({ hourlyLimit: 1 });
  f.controller.start({ token: f.controller.preview({ messageIds: messages.map(item => item.id), replyText: '收到' }).token });
  const result = await f.controller.idle();
  assert.equal(result.status, 'attention'); assert.equal(result.sent, 1); assert.equal(result.remaining, 1);
  assert.equal(f.store.snapshot().replies.length, 1); assert.equal(f.manager.calls.length, 1);
});

test('new inbound after prior manual send is a new reply opportunity on the same original account', async t => {
  const f = fixture(t), old = f.message();
  f.controller.start({ token: f.controller.preview({ messageIds: [old.id], replyText: '第一条回复' }).token });
  await f.controller.idle();
  f.setNow(EPOCH + 1000);
  const latest = f.message({ threadId: old.threadId, senderId: old.senderId, text: '还有一个问题' });
  const p = f.controller.preview({ messageIds: [latest.id], replyText: '第二次问题的回复' });
  f.controller.start({ token: p.token });
  assert.equal((await f.controller.idle()).sent, 1); assert.equal(f.store.snapshot().replies.length, 2);
});

test('manual batch replaces untouched automatic draft only for current item with the exact reviewed body', async t => {
  const f = fixture(t), replies = [f.reply(), f.reply()], gate = deferred();
  f.manager.before = async () => { if (f.manager.calls.length === 1) await gate.promise; };
  const p = f.controller.preview({ messageIds: replies.map(reply => reply.messageId), replyText: '统一新的文案' });
  f.controller.start({ token: p.token }); await Promise.resolve();
  assert.equal(f.store.getReply(replies[0].id).origin, 'manual-batch'); assert.equal(f.store.getReply(replies[0].id).replyText, '统一新的文案');
  assert.equal(f.store.getReply(replies[1].id).origin, undefined); assert.equal(f.store.getReply(replies[1].id).status, 'pending');
  gate.resolve(); const result = await f.controller.idle();
  assert.equal(result.sent, 2); assert.deepEqual(result.tasks.map(item => item.replyId), replies.map(item => item.id));
  assert.equal(f.store.snapshot().replies.length, 2);
});

test('manual preview freezes the prior pending reply and invalidates confirmation after its cancellation', t => {
  const f = fixture(t), reply = f.reply();
  const p = f.controller.preview({ messageIds: [reply.messageId], replyText: 'manual replacement' });
  f.store.cancelReply(reply.id);
  assert.throws(() => f.controller.start({ token: p.token }), /已变化/);
  assert.equal(f.manager.calls.length, 0); assert.equal(f.store.getReply(reply.id).origin, undefined);
});

test('own platform answer arriving after manual preview prevents background submission', t => {
  const f = fixture(t), message = f.message();
  const p = f.controller.preview({ messageIds: [message.id], replyText: 'manual answer' });
  f.setNow(EPOCH + 1000); f.message({ threadId: message.threadId, senderId: f.account.id, isOwn: true, text: '已经答复' });
  assert.throws(() => f.controller.start({ token: p.token }), /已有本账号发出/);
  assert.equal(f.manager.calls.length, 0); assert.equal(f.store.snapshot().replies.length, 0);
});
