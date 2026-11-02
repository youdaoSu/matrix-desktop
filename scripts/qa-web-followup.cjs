const assert = require('node:assert/strict'), { randomUUID } = require('node:crypto');
const { runWebFollowup, webWorkReference } = require('../desktop/web-followup.cjs');
const { publicReceipt } = require('../desktop/publish-followup.cjs');
const { loadTs } = require('./qa-load-typescript.cjs');
let checks = 0;
function fixture(platform, overrides = {}) {
  const owner = randomUUID(), account = { id: randomUUID(), platform, nativeAccountKey: 'qa-stable-own-id', connectorSessionId: randomUUID(), nickname: 'QA 本人' };
  const evidence = platform === 'wechat' ? { workId: '123456789012345', workUrl: 'https://channels.weixin.qq.com/platform/post/list', workReferenceSource: 'official_work_card' } : { workId: 'abcdef0123456789abcdef01', workUrl: 'https://www.xiaohongshu.com/explore/abcdef0123456789abcdef01', workReferenceSource: 'official_title_link' };
  const parent = { id: randomUUID(), ownerId: owner, kind: 'publish', status: 'confirmed', accountId: account.id, platform, nativeAccountKey: account.nativeAccountKey, sessionId: account.connectorSessionId, taskId: randomUUID(), attemptId: randomUUID(), evidence };
  const records = new Map([[parent.id, parent]]), counters = { comments: 0, pins: 0, ownerChecks: 0, closed: 0, calls: [] };
  let row, own = true, definiteReject = false, lostAck = false, pinFail = false;
  const journal = { find: (_owner, id) => records.get(id), write: record => { assert.equal(record.ownerId, owner); records.set(record.id, structuredClone(record)); } };
  const input = { receiptId: parent.id, requestId: randomUUID(), comment: '功能测试追评（仅隔离）', pin: true };
  const deps = { event: { sender: { id: 11 } }, input, auth: { userId: owner, account }, account,
    authenticate: async () => ({ userId: own ? owner : 'other-owner', account }), journal, busy: new Set(), publicReceipt, safeFailure: error => error.message, sleep: async () => {},
    openContext: async () => ({ guest: {}, close: () => counters.closed++, assertOwner: async () => { counters.ownerChecks++; if (!own) throw Error('本人身份已变化'); }, readWork: async () => ({ matched: true, evidence }) }),
    readDom: async (_guest, command, args) => {
      counters.calls.push(command); assert.equal(args.workId, evidence.workId);
      if (command === 'open') return { opened: true };
      if (command === 'fill') return { filled: true };
      if (command === 'read') return { ids: row ? [row.id] : [], comments: row ? [row] : [] };
      if (command === 'comment') {
        const saved = records.get('followup-' + parent.id); assert.equal(saved.clicked, true); assert.equal(saved.checkpoint, 'followup_request_started');
        if (definiteReject) return { clicked: false, rejectedBeforeClick: true };
        counters.comments++; if (lostAck) throw Error('模拟点击后连接中断');
        row = { id: 'qa-comment-id', createdAt: new Date().toISOString(), pinned: false }; return { clicked: true };
      }
      if (command === 'pin') {
        assert.equal(records.get('followup-' + parent.id).status, 'confirmed'); assert.equal(args.commentId, row.id); counters.pins++; if (pinFail) throw Error('没有官方置顶控件'); row.pinned = true; return { clicked: true };
      }
      throw Error('Unknown fake DOM command');
    }, ...overrides,
  };
  return { deps, counters, records, parent, account, input, row: value => { row = value; }, flags: value => { if ('own' in value) own = value.own; if ('definiteReject' in value) definiteReject = value.definiteReject; if ('lostAck' in value) lostAck = value.lostAck; if ('pinFail' in value) pinFail = value.pinFail; } };
}
(async () => {
  for (const platform of ['xiaohongshu', 'wechat']) {
    let f = fixture(platform), result = await runWebFollowup(f.deps);
    assert.equal(result.receipt.status, 'confirmed'); assert.equal(result.receipt.pinResult.status, 'confirmed'); assert.equal(f.counters.comments, 1); assert.equal(f.counters.pins, 1); assert.equal(f.counters.ownerChecks, 2); assert.equal(f.counters.closed, 1); checks += 6;
    assert.ok(!JSON.stringify(result).includes('beforeCommentIds')); checks++;
    await runWebFollowup(f.deps); assert.equal(f.counters.comments, 1); assert.equal(f.counters.pins, 1); checks += 2;
    f.deps.input = { ...f.input, operation: 'verify', requestId: undefined }; result = await runWebFollowup(f.deps); assert.equal(result.receipt.status, 'confirmed'); assert.equal(f.counters.comments, 1); checks += 2;
    f = fixture(platform); f.flags({ lostAck: true }); result = await runWebFollowup(f.deps); assert.equal(result.receipt.status, 'unknown'); await runWebFollowup(f.deps); assert.equal(f.counters.comments, 1); assert.equal(f.counters.pins, 0); checks += 3;
    f = fixture(platform); f.flags({ definiteReject: true }); result = await runWebFollowup(f.deps); assert.equal(result.receipt.status, 'failed'); assert.equal(result.receipt.retryable, true); assert.equal(f.counters.comments, 0); checks += 3;
    f = fixture(platform); f.flags({ pinFail: true }); result = await runWebFollowup(f.deps); assert.equal(result.receipt.status, 'confirmed'); assert.equal(result.receipt.pinResult.status, 'unknown'); assert.equal(f.counters.comments, 1); checks += 3;
    f = fixture(platform); f.flags({ own: false }); result = await runWebFollowup(f.deps); assert.equal(result.receipt.status, 'failed'); assert.equal(f.counters.comments, 0); checks += 2;
    f = fixture(platform); f.parent.nativeAccountKey = 'different-id'; result = await runWebFollowup(f.deps); assert.ok(result.error); assert.equal(f.counters.calls.length, 0); checks += 2;
    f = fixture(platform); f.deps.busy.add(f.deps.auth.userId + ':' + f.account.id); result = await runWebFollowup(f.deps); assert.ok(result.error); assert.equal(f.counters.calls.length, 0); checks += 2;
    f = fixture(platform); f.row({ id: 'existing-comment', createdAt: new Date().toISOString() }); result = await runWebFollowup(f.deps); assert.equal(result.receipt.status, 'failed'); assert.equal(f.counters.comments, 0); checks += 2;
    f=fixture(platform);delete f.parent.nativeAccountKey;delete f.parent.sessionId;f.parent.referenceAttestation={source:'official_owned_work_id',nativeAccountKey:f.account.nativeAccountKey,sessionId:f.account.connectorSessionId,workId:f.parent.evidence.workId};result=await runWebFollowup(f.deps);assert.equal(result.receipt.status,'confirmed');assert.equal(f.counters.comments,1);checks+=2;
    f=fixture(platform);delete f.parent.nativeAccountKey;f.parent.referenceAttestation={source:'official_owned_work_id',nativeAccountKey:f.account.nativeAccountKey,sessionId:f.account.connectorSessionId,workId:'wrong-work-id'};result=await runWebFollowup(f.deps);assert.ok(result.error);assert.equal(f.counters.calls.length,0);checks+=2;
    f=fixture(platform);f.parent.nativeAccountKey='foreign-id';f.parent.referenceAttestation={source:'official_owned_work_id',nativeAccountKey:f.account.nativeAccountKey,sessionId:f.account.connectorSessionId,workId:f.parent.evidence.workId};result=await runWebFollowup(f.deps);assert.ok(result.error);assert.equal(f.counters.calls.length,0);checks+=2;
  }
  assert.equal(webWorkReference('wechat', { workId: '12345678901234', workReferenceSource: 'official_work_card', workUrl: 'https://evil.test/' }), undefined); checks++;
  const sync = loadTs('shared/publish-sync.ts').syncPublishToPlatform, config = { title: '21字标题完整保留', body: 'QA简介', topics: ['话题'], comment: 'QA追评', options: { visibility: '仅自己可见', originality: '自制' }, extras: { 地理位置: 'QA位置', 星图任务: '抖音专属', 创作声明: '内容无需标注' }, covers: [{ id: 'cover', name: 'qa.jpg', index: 1 }], schedule: { mode: 'now' }, pinComment: true };
  const xhs = sync('xiaohongshu', config); assert.equal(xhs.title, config.title); assert.equal(xhs.body, config.body); assert.deepEqual(xhs.topics, config.topics); assert.equal(xhs.comment, config.comment); assert.equal(xhs.extras.星图任务, undefined); assert.equal(xhs.extras.地理位置, 'QA位置'); assert.equal(xhs.options.originality, undefined); assert.equal(xhs.pinComment, true); checks += 8;
  const manual = sync('xiaohongshu', config, { ...config, title: '右侧自定义' }, new Set(['title'])); assert.equal(manual.title, '右侧自定义'); checks++;
  const explicit = sync('xiaohongshu', config, { ...config, title: '右侧自定义' }); assert.equal(explicit.title, config.title); checks++;
  console.log(JSON.stringify({webFollowupAndFullSyncChecks:checks,platforms:['xiaohongshu','wechat'],writeAheadJournal:true,noReplayAfterUncertainClick:true,pinIndependentOfCommentSuccess:true,stableOwnerAndWorkIdRequired:true,platformSpecificSyncOnly:true,realPlatformActions:false}));
})().catch(error => { console.error(error); process.exitCode = 1; });
