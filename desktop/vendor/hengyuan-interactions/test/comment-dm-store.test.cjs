'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { InteractionStore } = require('../src/interaction-store.cjs');
const EPOCH = Date.parse('2026-10-26T04:00:00Z');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hy-comment-dm-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let now = EPOCH, counter = 0;
  const account = { id: randomUUID(), platform: 'douyin', role: 'primary', name: 'Synthetic creator' };
  const accounts = new Map([[account.id, account]]);
  const options = { now: () => now, getAccount: id => { if (!accounts.has(id)) throw Error('missing account'); return accounts.get(id); } };
  let store = new InteractionStore(root, options);
  store.setMode({ accountId: account.id, channel: 'comment', mode: 'auto' });
  store.setMode({ accountId: account.id, channel: 'dm', mode: 'auto' });
  return { root, account, accounts, get store() { return store; }, now: () => now,
    setNow(value) { now = value; }, advance(ms = 1000) { now += ms; },
    reopen() { store = new InteractionStore(root, options); },
    rule(overrides = {}) { return store.saveRule({ name: 'Comment private reply', platform: 'douyin', accountIds: [account.id], channel: 'comment', trigger: 'message', deliveryChannel: 'dm', match: 'any', keywords: [], replyText: 'Hello {nickname}', priority: 50, cooldownMinutes: 30, delaySeconds: 0, enabled: true, ...overrides }); },
    comment(overrides = {}) { return store.ingest({ accountId: account.id, channel: 'comment', externalId: `work:comment-${++counter}`, threadId: 'work', senderId: '1002', senderName: 'Visitor', text: 'Useful', receivedAt: new Date(now).toISOString(), ...overrides }); },
    replies(message) { return store.snapshot().replies.filter(r => r.messageId === message.id); },
    private(message) { return this.replies(message).find(r => r.deliveryChannel === 'dm'); },
    public(message) { return this.replies(message).find(r => r.deliveryChannel === undefined); },
  };
}
function complete(f, reply, status = 'sent') {
  f.store.beginSend(reply.id); f.store.assertCanCommit(reply.id);
  f.store.finishSend(reply.id, { status, ...(status === 'sent' ? { receipt: 'platform:synthetic-receipt' } : { error: 'synthetic result' }) });
}

test('comment private rule is explicit and cannot change the meaning of ordinary rules', t => {
  const f = fixture(t), ordinary = f.rule({ deliveryChannel: undefined, name: 'Public' }), direct = f.rule();
  assert.equal(ordinary.deliveryChannel, undefined); assert.equal(ordinary.activatedAt, undefined);
  assert.equal(direct.deliveryChannel, 'dm'); assert.equal(direct.activatedAt, new Date(EPOCH).toISOString());
  for (const change of [{ channel: 'dm' }, { channel: 'all' }, { channel: 'follow', trigger: 'follow' }, { trigger: 'first-message', channel: 'dm' }, { deliveryChannel: 'comment' }]) assert.throws(() => f.rule(change));
  const forged = f.rule({ activatedAt: '2000-01-01T00:00:00Z' }); assert.equal(forged.activatedAt, new Date(EPOCH).toISOString());
});

test('one comment independently selects public and private rule priority lanes', t => {
  const f = fixture(t); f.rule({ deliveryChannel: undefined, name: 'Public', replyText: 'Public response', priority: 1 }); f.rule({ replyText: 'Private response', priority: 200 }); f.advance();
  const message = f.comment(), replies = f.replies(message);
  assert.equal(replies.length, 2); assert.equal(f.public(message).replyText, 'Public response'); assert.equal(f.private(message).replyText, 'Private response');
  assert.ok(replies.every(r => r.channel === 'comment' && r.status === 'queued'));
  f.store.ingest({ ...message, id: undefined }); assert.equal(f.replies(message).length, 2);
  f.reopen(); assert.equal(f.replies(message).length, 2);
});

test('comment preview exposes both deliveries without changing the ordinary top-level match', t => {
  const f = fixture(t); const pub = f.rule({ deliveryChannel: undefined, name: 'Public', priority: 1 }); const dm = f.rule({ priority: 200 });
  const preview = f.store.preview({ accountId: f.account.id, channel: 'comment', senderName: 'Visitor', text: 'Useful' });
  assert.equal(preview.rule.id, pub.id); assert.equal(preview.deliveries.length, 2); assert.equal(preview.deliveries.find(d => d.deliveryChannel === 'dm').rule.id, dm.id);
  const only = f.store.preview({ accountId: f.account.id, channel: 'comment', deliveryChannel: 'dm', text: 'Useful' }); assert.equal(only.rule.id, dm.id);
  assert.throws(() => f.store.preview({ accountId: f.account.id, channel: 'dm', deliveryChannel: 'dm', text: 'Useful' }));
});

for (const [name, changes] of [['self', { isOwn: true }], ['group', { isGroup: true }], ['history', { historical: true }], ['before activation', { receivedAt: new Date(EPOCH - 1000).toISOString() }], ['activation boundary', { receivedAt: new Date(EPOCH).toISOString() }]]) {
  test(`comment private reply excludes ${name}`, t => { const f = fixture(t); f.rule(); f.advance(); assert.equal(f.private(f.comment(changes)), undefined); });
}

test('enabling later does not replay recorded comments, and activation survives restart', t => {
  const f = fixture(t); let rule = f.rule({ enabled: false }); f.advance(); const old = f.comment(); f.advance(); rule = f.rule({ ...rule, enabled: true });
  assert.equal(Date.parse(rule.activatedAt), f.now()); f.reopen(); assert.equal(Date.parse(f.store.snapshot().rules[0].activatedAt), f.now());
  f.store.ingest({ ...old, profileUrl: 'https://www.douyin.com/user/MS4wLjABTestUser' }); assert.equal(f.private(old), undefined);
  f.advance(); const newer = f.comment(); assert.equal(f.private(newer).status, 'queued');
});

test('editing a still-enabled rule preserves activation, disabling and enabling resets it', t => {
  const f = fixture(t); let rule = f.rule(); f.advance(); rule = f.rule({ ...rule, replyText: 'Changed' }); assert.equal(Date.parse(rule.activatedAt), EPOCH);
  f.advance(); rule = f.rule({ ...rule, enabled: false }); f.advance(); rule = f.rule({ ...rule, enabled: true }); assert.equal(Date.parse(rule.activatedAt), f.now());
  const earlier = f.comment({ receivedAt: new Date(f.now() - 1000).toISOString() }); assert.equal(f.private(earlier), undefined);
});

for (const status of ['pending', 'queued', 'sending', 'sent', 'unknown', 'failed']) {
  test(`same commenter is deduplicated across works, restart, and ${status} result`, t => {
    const f = fixture(t); f.rule(); if (status === 'pending') f.store.setMode({ accountId: f.account.id, channel: 'comment', mode: 'review' });
    f.advance(); const first = f.private(f.comment());
    if (status === 'sending') f.store.beginSend(first.id);
    if (['sent', 'unknown', 'failed'].includes(status)) complete(f, first, status);
    f.reopen(); f.advance(); const second = f.private(f.comment({ threadId: 'other-work', externalId: 'other-work:other-comment' }));
    assert.equal(second.status, 'skipped'); assert.equal(second.reasonCode, 'comment_dm_already_contacted'); assert.equal(second.claimedAt, undefined);
  });
}

test('unattempted cancelled task is not replayed but a later new comment may create a new task', t => {
  const f = fixture(t); f.rule(); f.advance(); const firstMessage = f.comment(), first = f.private(firstMessage); f.store.cancelReply(first.id);
  f.store.ingest({ ...firstMessage }); assert.equal(f.private(firstMessage).status, 'cancelled');
  f.advance(); const next = f.private(f.comment()); assert.equal(next.status, 'queued');
});

test('same original comment public and private replies do not suppress each other by cooldown', t => {
  for (const privateFirst of [false, true]) {
    const f = fixture(t); f.rule({ deliveryChannel: undefined, name: 'Public', replyText: 'Public response' }); f.rule(); f.advance(); const message = f.comment();
    const first = privateFirst ? f.private(message) : f.public(message), second = privateFirst ? f.public(message) : f.private(message);
    complete(f, first); complete(f, second); assert.equal(f.store.getReply(second.id).status, 'sent');
  }
});

test('unrelated public comment still respects account cooldown after a private reply', t => {
  const f = fixture(t); f.rule({ deliveryChannel: undefined, name: 'Public', replyText: 'Public response' }); f.rule(); f.advance(); const one = f.comment(); complete(f, f.private(one));
  f.advance(); const two = f.comment(); assert.throws(() => f.store.beginSend(f.public(two).id), /冷却/);
});

test('channel cooldown counts comment private as DM and public comments as comment', t => {
  const f = fixture(t); f.store.updatePolicy({ cooldownScope: 'channel' }); f.rule({ deliveryChannel: undefined, name: 'Public', replyText: 'Public response' }); f.rule(); f.rule({ channel: 'dm', deliveryChannel: undefined, name: 'DM reply', replyText: 'Different DM' });
  f.advance(); const one = f.comment(); complete(f, f.private(one)); f.advance(); const two = f.comment(); complete(f, f.public(two));
  const incoming = f.comment({ channel: 'dm', externalId: 'dm-message', threadId: 'conversation' }); assert.throws(() => f.store.beginSend(f.replies(incoming)[0].id), /冷却/);
});

test('DM-off prevents creation, cancels pending private actions and blocks a claimed commit', t => {
  const f = fixture(t); f.rule(); f.store.setMode({ accountId: f.account.id, channel: 'dm', mode: 'off' }); f.advance(); assert.equal(f.private(f.comment()), undefined);
  f.store.setMode({ accountId: f.account.id, channel: 'dm', mode: 'auto' }); f.advance(); const queued = f.private(f.comment()); f.store.setMode({ accountId: f.account.id, channel: 'dm', mode: 'off' }); assert.equal(f.store.getReply(queued.id).status, 'cancelled');
  f.store.setMode({ accountId: f.account.id, channel: 'dm', mode: 'auto' }); f.advance(); const claimed = f.private(f.comment()); f.store.beginSend(claimed.id); f.store.setMode({ accountId: f.account.id, channel: 'dm', mode: 'off' }); assert.throws(() => f.store.assertCanCommit(claimed.id), /私信渠道已关闭/);
});

test('comment mode review still requires approval even when destination DM mode is auto', t => {
  const f = fixture(t); f.rule(); f.store.setMode({ accountId: f.account.id, channel: 'comment', mode: 'review' }); f.advance(); const reply = f.private(f.comment()); assert.equal(reply.status, 'pending');
  assert.throws(() => f.store.beginSend(reply.id), /待发送队列/); f.store.approveReply(reply.id); complete(f, reply); assert.equal(f.store.getReply(reply.id).status, 'sent');
});

test('rule change, source mode change and global pause revoke queued actions', t => {
  for (const kind of ['rule', 'mode', 'pause']) {
    const f = fixture(t); const rule = f.rule(); f.advance(); const reply = f.private(f.comment());
    if (kind === 'rule') f.rule({ ...rule, replyText: 'Changed' }); if (kind === 'mode') f.store.setMode({ accountId: f.account.id, channel: 'comment', mode: 'off' }); if (kind === 'pause') f.store.updatePolicy({ paused: true });
    assert.equal(f.store.getReply(reply.id).status, 'cancelled'); assert.throws(() => f.store.beginSend(reply.id));
  }
});

test('private reply consumes the same account attempt limit and cannot create unlimited actions', t => {
  const f = fixture(t); f.store.updatePolicy({ hourlyLimit: 1 }); f.rule(); f.advance(); complete(f, f.private(f.comment())); f.advance(); const second = f.private(f.comment({ senderId: '1003' })); assert.throws(() => f.store.beginSend(second.id), /一小时/); assert.equal(f.store.getReply(second.id).claimedAt, undefined);
});

test('freshly read but stale comment is kept without automatically sending', t => {
  const f = fixture(t); f.rule(); f.advance(20 * 60 * 1000); const reply = f.private(f.comment({ receivedAt: new Date(EPOCH + 1000).toISOString() })); assert.equal(reply.status, 'skipped'); assert.equal(reply.reasonCode, 'message_too_old');
});

for (const channel of ['dm', 'follow']) {
  test(`same frozen DM text already ${channel} queued or sent suppresses new comment private action`, t => {
    for (const sent of [false, true]) {
      const f = fixture(t); f.rule(); f.rule({ channel, trigger: channel === 'follow' ? 'follow' : 'message', deliveryChannel: undefined, name: 'Existing private rule' });
      f.store.setMode({ accountId: f.account.id, channel, mode: 'auto' });
      if (channel === 'follow') f.store.baselineFollowers({ accountId: f.account.id, followerIds: [], observedAt: new Date(EPOCH).toISOString() });
      f.advance(); const previous = f.comment({ channel, threadId: channel === 'follow' ? 'follower:1002' : 'conversation' }); const reply = f.replies(previous)[0]; if (sent) complete(f, reply);
      f.advance(); const next = f.private(f.comment()); assert.equal(next.status, 'skipped'); assert.equal(next.reasonCode, 'comment_dm_already_contacted');
    }
  });
}

test('cross-action duplicate is rechecked immediately before final commit', t => {
  const f = fixture(t); f.rule(); f.rule({ channel: 'dm', deliveryChannel: undefined, name: 'DM reply' }); f.advance(); const reply = f.private(f.comment()); f.store.beginSend(reply.id);
  f.advance(); f.comment({ channel: 'dm', externalId: 'incoming-dm', threadId: 'conversation' }); assert.throws(() => f.store.assertCanCommit(reply.id), /已有私信任务/);
});

test('a different DM text does not permanently suppress comment private replies', t => {
  const f = fixture(t); f.rule({ cooldownMinutes: 0 }); f.rule({ channel: 'dm', deliveryChannel: undefined, name: 'DM reply', replyText: 'Different content' }); f.advance(); const dm = f.comment({ channel: 'dm', threadId: 'conversation' }); complete(f, f.replies(dm)[0]);
  f.advance(); const next = f.private(f.comment()); assert.equal(next.status, 'queued'); complete(f, next);
});

test('comment private rules require the explicitly supported Douyin platform', t => {
  const f = fixture(t);
  for (const platform of ['xiaohongshu', 'all', undefined]) assert.throws(() => f.rule({ platform }), /仅支持抖音/);
  assert.equal(f.store.snapshot().rules.length, 0);
  const rule = f.rule();
  for (const platform of ['xiaohongshu', 'all', undefined]) assert.throws(() => f.rule({ ...rule, platform }), /仅支持抖音/);
  assert.equal(f.store.snapshot().rules[0].platform, 'douyin');
});

test('persisted private rules on unsupported or unspecified platforms fail validation', t => {
  for (const platform of ['xiaohongshu', 'all', undefined]) {
    const f = fixture(t); f.rule();
    const data = JSON.parse(fs.readFileSync(f.store.filePath)); data.rules[0].platform = platform;
    fs.writeFileSync(f.store.filePath, JSON.stringify(data)); assert.throws(() => f.store.snapshot(), /仅支持抖音/);
  }
});

test('persisted private replies cannot target an unsupported source platform after deleting their rule', t => {
  const f = fixture(t); const rule = f.rule(); f.advance(); const message = f.comment(); f.store.deleteRule(rule.id);
  const data = JSON.parse(fs.readFileSync(f.store.filePath)); data.messages.find(m => m.id === message.id).platform = 'xiaohongshu';
  fs.writeFileSync(f.store.filePath, JSON.stringify(data)); assert.throws(() => f.store.snapshot(), /仅支持抖音/);
});

test('private destination cannot be forged on persisted wrong-channel records', t => {
  const f = fixture(t); f.rule(); f.advance(); const reply = f.private(f.comment());
  const data = JSON.parse(fs.readFileSync(f.store.filePath)); data.replies.find(r => r.id === reply.id).deliveryChannel = 'comment'; fs.writeFileSync(f.store.filePath, JSON.stringify(data)); assert.throws(() => f.store.snapshot(), /评论私信回复渠道/);
});

test('private activation requires a persisted timestamp within the rule lifetime', t => {
  for (const activatedAt of [undefined, new Date(EPOCH - 1).toISOString(), new Date(EPOCH + 1).toISOString()]) {
    const f = fixture(t); f.rule();
    const data = JSON.parse(fs.readFileSync(f.store.filePath)); data.rules[0].activatedAt = activatedAt;
    fs.writeFileSync(f.store.filePath, JSON.stringify(data)); assert.throws(() => f.store.snapshot(), /评论私信启用时间/);
  }
});

test('deduplication remains scoped to the sending account and commenter identity', t => {
  const f = fixture(t); f.rule(); f.advance(); complete(f, f.private(f.comment()));
  const secondAccount = { id: randomUUID(), name: 'Another creator', platform: 'douyin' }; f.accounts.set(secondAccount.id, secondAccount);
  f.store.setMode({ accountId: secondAccount.id, channel: 'comment', mode: 'auto' });
  f.rule({ accountIds: [secondAccount.id] }); f.advance();
  const reply = f.private(f.comment({ accountId: secondAccount.id })); assert.equal(reply.status, 'queued'); complete(f, reply);
  const otherPerson = f.private(f.comment({ senderId: '1003' })); assert.equal(otherPerson.status, 'queued'); complete(f, otherPerson);
});

test('revoking a private rule after claiming prevents commit without invalidating the public lane', t => {
  const f = fixture(t); f.rule({ deliveryChannel: undefined, replyText: 'Public response' }); const rule = f.rule(); f.advance();
  const message = f.comment(), reply = f.private(message); f.store.beginSend(reply.id);
  f.rule({ ...rule, enabled: false }); assert.throws(() => f.store.assertCanCommit(reply.id), /规则或匹配结果已变化/);
  assert.equal(f.public(message).status, 'queued'); complete(f, f.public(message));
});
