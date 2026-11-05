const { randomUUID } = require('node:crypto');
const { createOperationBudget } = require('./operation-budget.cjs');
const { runOfficialDOM } = require('./official-dom.cjs');
const { webFollowupDom } = require('./web-followup-dom.cjs');

function webWorkReference(platform, evidence) {
  if (platform === 'xiaohongshu' && evidence?.workReferenceSource === 'official_title_link' && /^[a-f0-9]{24}$/.test(evidence.workId || '')) {
    try { const url = new URL(evidence.workUrl); if (url.protocol === 'https:' && url.hostname === 'www.xiaohongshu.com' && !url.port && !url.username && !url.password && !url.search && !url.hash && new RegExp('^/(?:explore|discovery/item)/' + evidence.workId + '/?$').test(url.pathname)) return { workId: evidence.workId, workUrl: url.origin + url.pathname, workReferenceSource: 'official_title_link' }; } catch {}
  }
  if (platform === 'wechat' && evidence?.workReferenceSource === 'official_work_card' && /^[1-9]\d{9,24}$/.test(evidence.workId || '') && evidence.workUrl === 'https://channels.weixin.qq.com/platform/post/list') return { workId: evidence.workId, workUrl: evidence.workUrl, workReferenceSource: 'official_work_card' };
}

async function runWebFollowup({ event, input, auth, account, authenticate, journal, busy, openContext, publicReceipt, safeFailure, timeoutMs = 45000, readDom, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  let context, record, sent = false, pinSent = false, acquired = false, ended = false, previousConfirmed = false;
  const key = auth.userId + ':' + account.id, operation = input.operation || 'start', budget = createOperationBudget(timeoutMs);
  const save = () => {
    const latest = journal.find(auth.userId, record.id);
    if (latest?.requestId && latest.requestId !== record.requestId) throw Error('本条追评已被其他操作更新，已停止');
    journal.write(record);
  };
  const assertCurrent = async () => {
    budget.check(); if (ended) throw Error('追评操作已结束');
    const fresh = await budget.run(() => authenticate(input.accessToken, account.id), '核对追评所属账号', 8000);
    if (fresh.userId !== auth.userId || fresh.account.platform !== account.platform || fresh.account.connectorSessionId !== account.connectorSessionId || fresh.account.nativeAccountKey !== account.nativeAccountKey) throw Error('账号绑定或所属用户已变化，未开始后续操作');
  };
  try {
    if (!openContext) return { pending: true, message: '当前版本尚未提供此平台的网页追评连接；作品无需重发' };
    const parent = journal.find(auth.userId, input.receiptId);
    if (!parent || parent.kind !== 'publish' || parent.status !== 'confirmed' || parent.accountId !== account.id || parent.platform !== account.platform) throw Error('没有属于当前账号的成功发布回执，未发送追评');
    if(operation!=='verify'&&['processing','rejected'].includes(parent.verification?.state))throw Error('作品已提交，审核尚未通过，未发送追评或置顶');
    const attestation = parent.referenceAttestation, reference = webWorkReference(account.platform, parent.evidence);
    const observedOwner = attestation?.source === 'official_owned_work_id' && attestation.workId === reference?.workId && attestation.nativeAccountKey === account.nativeAccountKey && attestation.sessionId === account.connectorSessionId;
    if (!account.nativeAccountKey || parent.nativeAccountKey && parent.nativeAccountKey !== account.nativeAccountKey || !observedOwner && (parent.nativeAccountKey !== account.nativeAccountKey || parent.sessionId !== account.connectorSessionId)) throw Error(parent.referenceCollection?.message || '原作品缺少可用的本人ID及准确作品编号关联，尚未发送追评；后台只读补全失败不会重发作品');
    if (busy.has(key)) throw Error('此账号正在处理追评，请等待原评论结果'); busy.add(key); acquired = true;
    const id = 'followup-' + parent.id, existing = journal.find(auth.userId, id);
    if (existing && (existing.followupOf !== parent.id || existing.accountId !== account.id || existing.sessionId !== account.connectorSessionId || existing.nativeAccountKey !== account.nativeAccountKey)) throw Error('原追评与当前账号身份不一致');
    if (operation === 'start' && existing && (existing.status === 'confirmed' || existing.clicked !== false || existing.retryable !== true)) return { receipt: publicReceipt(existing) };
    if (operation !== 'start' && !existing) throw Error('没有原追评记录，未创建新评论');
    const content = operation === 'start' ? input.comment?.trim() : existing.summary;
    if (typeof content !== 'string' || !content || content.length > 2000) throw Error('追评正文为空或超过2000字，未发送');
    previousConfirmed = existing?.status === 'confirmed'; sent = Boolean(existing?.clicked);
    context = await budget.run(() => openContext(event, input, account).then(value => { if (ended) { value.close(); throw Error('追评连接已结束'); } return value; }), '打开独立官方作品评论页', 30000);
    let work = reference;
    if (!work) {
      const result = await budget.run(() => context.readWork(parent), '读取原作品准确ID', 6000);
      work = result?.matched && webWorkReference(account.platform, result.evidence);
      if (!work) return { pending: true, message: '原作品发布成功，但官方列表尚未提供可核对的作品ID；不会按同名标题或昵称猜测追评对象' };
      if (parent.evidence?.workId && parent.evidence.workId !== work.workId) throw Error('原发布回执出现不同作品ID，未操作追评');
      await assertCurrent(); journal.write({ ...parent, evidence: { ...parent.evidence, ...work } });
    }
    const nonce = randomUUID(), args = { platform: account.platform, workId: work.workId, nonce, text: content };
    const dom = (command, patch = {}) => budget.run(() => readDom ? readDom(context.guest, command, { ...args, ...patch }) : runOfficialDOM(context.guest, webFollowupDom, [command, { ...args, ...patch }], 'matrix-web-followup'), '核对原作品评论控件', 6000);
    const requestId = input.requestId || existing.requestId;
    record = { ...(existing || {}), id, ownerId: auth.userId, accountId: account.id, platform: account.platform, nickname: account.nickname, kind: 'comments', taskId: parent.taskId, attemptId: parent.attemptId, followupOf: parent.id, sessionId: account.connectorSessionId, nativeAccountKey: account.nativeAccountKey, pageUrl: work.workUrl, button: '发布后追评', summary: content, requestId, createdAt: existing?.createdAt || new Date().toISOString(), status: previousConfirmed ? 'confirmed' : 'unknown', clicked: Boolean(existing?.clicked), checkpoint: 'followup_preparing', retryable: false, evidence: { ...work, ...(existing?.evidence || {}) } };
    if (existing?.requestId && existing.requestId !== requestId) {
      // A new explicit verify/pin operation may update the same child record.
      const latest = journal.find(auth.userId, id); if (latest?.requestId !== existing.requestId) throw Error('追评意图已更新');
      journal.write(record);
    } else save();
    await dom('open');
    let initial;
    for (let n = 0; n < 8; n++) { try { initial = await dom('read'); break; } catch (error) { if (n === 7) throw error; await budget.run(() => sleep(250), '等待原作品评论面板', 1000); } }
    if (operation === 'start') {
      if (initial.comments?.length) throw Error('原作品已有相同作者评论，未重复发送；请核对原评论ID');
      record.evidence.beforeCommentIds = initial.ids || []; record.evidence.startedAt = new Date().toISOString(); record.clicked = false; save();
      await dom('fill'); await assertCurrent(); await budget.run(() => context.assertOwner(), '发送前核对官方本人ID', 10000); await assertCurrent();
      record.clicked = true; record.checkpoint = 'followup_request_started'; record.status = 'submitting'; save(); sent = true;
      const clicked = await dom('comment');
      if (clicked?.clicked === false && clicked.rejectedBeforeClick === true) { sent = false; record.clicked = false; record.checkpoint = 'followup_preparing'; throw Error('追评正文或发送控件未通过核对，尚未发送'); }
      if (!clicked?.clicked) throw Error('追评点击未确认，请只核对原评论');
    }
    let verified;
    for (let n = 0; n < 12; n++) {
      const result = await dom('read'), after = Date.parse(record.evidence.startedAt || record.createdAt) - 1000;
      const candidates = (result.comments || []).filter(row => record.commentId ? row.id === record.commentId : !(record.evidence.beforeCommentIds || []).includes(row.id) && Date.parse(row.createdAt) >= after && Date.parse(row.createdAt) <= Date.now() + 60000);
      if (candidates.length > 1) throw Error('同一作品出现多条匹配评论，未猜测本次评论ID');
      if (candidates.length === 1) { verified = candidates[0]; break; }
      await budget.run(() => sleep(300), '等待本条作者评论ID', 1000);
    }
    if (!verified) { record.status = previousConfirmed ? 'confirmed' : 'unknown'; record.message = '尚未读到本次作者评论的准确ID与时间，只能核对结果，不会重复发表'; save(); return { receipt: publicReceipt(record) }; }
    record.status = 'confirmed'; record.commentId = verified.id; record.evidence.commentId = verified.id; record.message = '已按原作品ID和本条作者评论ID确认追评'; record.checkpoint = 'followup_comment_id_received'; record.retryable = false; save();
    if(operation==='verify'&&record.pinResult?.status==='unknown'&&verified.pinned===true){
      record.pinResult={status:'confirmed',message:'作者侧已读到原评论的置顶标记'};
    }
    if (operation === 'pin' || operation === 'start' && input.pin === true) {
      if (verified.pinned) record.pinResult = { status: 'confirmed', message: '官方已显示本条评论置顶' };
      else {
        await assertCurrent(); await budget.run(() => context.assertOwner(), '置顶前核对官方本人ID', 10000); await assertCurrent();
        record.pinResult = { status: 'unknown', message: '正在处理原评论置顶，作品和评论均不重发' }; record.checkpoint = 'followup_pin_started'; save(); pinSent = true;
        const result = await dom('pin', { commentId: verified.id });
        if (result?.menuOpened) await dom('pin-menu', { commentId: verified.id });
        let pinned = Boolean(result?.alreadyPinned);
        for (let n = 0; !pinned && n < 8; n++) { await budget.run(() => sleep(250), '等待官方置顶标记', 1000); pinned = (await dom('read')).comments?.some(row => row.id === verified.id && row.pinned === true); }
        record.pinResult = { status: pinned ? 'confirmed' : 'unknown', message: pinned ? '已按本条作者评论ID确认置顶' : '官网尚未显示置顶标记，原追评已成功，不会重发评论' };
      }
    }
    record.completedAt = new Date().toISOString(); save(); return { receipt: publicReceipt(record) };
  } catch (error) {
    const message = safeFailure(error);
    if (record) {
      const commentConfirmed = record.status === 'confirmed' || previousConfirmed;
      record.status = commentConfirmed ? 'confirmed' : sent ? 'unknown' : 'failed'; record.clicked = sent || commentConfirmed; record.retryable = !sent && !commentConfirmed; record.message = message; record.completedAt = new Date().toISOString();
      if (pinSent || commentConfirmed && (input.pin || operation === 'pin')) record.pinResult = { status: pinSent ? 'unknown' : 'failed', message };
      try { save(); } catch {} return { error: message, receipt: publicReceipt(record), mayHaveSubmitted: sent };
    }
    return { error: message };
  } finally { ended = true; context?.close(); if (acquired) busy.delete(key); }
}
module.exports = { runWebFollowup, webWorkReference };
