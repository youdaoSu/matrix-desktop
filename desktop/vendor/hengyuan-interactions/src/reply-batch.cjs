'use strict';

// Original local controller. Only already-reviewed inbound DM replies enter
// this queue; it creates neither conversations nor outbound recipient lists.
const { createHash, randomUUID } = require('node:crypto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PREVIEW_TTL_MS = 5 * 60 * 1000;
const MAX_BATCH = 50;
const clone = value => structuredClone(value);
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function ids(input, key = 'replyIds') {
  if (!object(input) || !Array.isArray(input[key]) || !input[key].length || input[key].length > MAX_BATCH || input[key].some(id => typeof id !== 'string' || !UUID.test(id)) || new Set(input[key]).size !== input[key].length) throw new Error('请选择 1 至 50 个不重复的已有私信会话。');
  return [...input[key]];
}
function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function display(check) {
  const { reply, message, account } = check;
  if (!reply) return { id: message.id, messageId: message.id, manual: true, accountId: account.id, accountName: account.name, platform: account.platform, recipientId: message.senderId, recipientName: message.senderName, threadId: message.threadId, incomingText: message.text, replyText: check.replyText };
  return { id: reply.id, accountId: account.id, accountName: account.name, platform: account.platform, recipientId: message.senderId, recipientName: message.senderName, threadId: message.threadId, incomingText: message.text, replyText: reply.replyText, dueAt: reply.dueAt };
}
function reason(error) { return String(error?.message || error || '批量回复检查失败').slice(0, 4000); }

class ReplyBatchController {
  constructor({ interactions, manager, changed = () => {}, now = Date.now } = {}) {
    if (!interactions || !manager || typeof interactions.checkBatchReply !== 'function' || typeof manager.previewBatchReply !== 'function' || typeof manager.sendBatchReply !== 'function' || typeof manager.reserveReplyBatch !== 'function' || typeof manager.releaseReplyBatch !== 'function' || typeof manager.cancelReplyBatchOperation !== 'function' || typeof changed !== 'function' || typeof now !== 'function') throw new Error('批量回复配置不完整。');
    this.interactions = interactions;
    this.manager = manager;
    this.changed = changed;
    this.now = now;
    this.previews = new Map();
    this.batch = null;
    this.operation = null;
    this.manager.replyBatchController = this;
  }
  _now() {
    const value = this.now();
    if (!Number.isFinite(value) || !Number.isFinite(new Date(value).getTime())) throw new Error('批量回复时间不正确。');
    return value;
  }
  _notify() { try { this.changed(); } catch { /* UI notification cannot authorize or replay a send. */ } }
  _prune() { const now = this._now(); for (const [token, preview] of this.previews) if (preview.expiresAt <= now) this.previews.delete(token); }
  _read(id) {
    const check = this.interactions.checkBatchReply(id);
    const routing = this.manager.previewBatchReply(id);
    if (!object(routing) || typeof routing.fingerprint !== 'string' || !routing.fingerprint || !object(routing.binding)) throw new Error('私信连接缺少可核对的身份信息。');
    const proof = { check, routing };
    return { ...display(check), fingerprint: routing.fingerprint, proof: digest(proof), check: clone(check) };
  }
  _readDraft(messageId, replyText) {
    if (typeof this.interactions.checkManualDraft !== 'function' || typeof this.manager.previewBatchDraft !== 'function') throw new Error('手动批量回复组件尚未就绪。');
    const check = this.interactions.checkManualDraft({ messageId, replyText });
    const routing = this.manager.previewBatchDraft({ message: check.message, replyText: check.replyText });
    if (!object(routing) || typeof routing.fingerprint !== 'string' || !routing.fingerprint || !object(routing.binding)) throw new Error('私信连接缺少可核对的身份信息。');
    return { ...display(check), fingerprint: routing.fingerprint, proof: digest({ check, routing }), check: clone(check) };
  }
  get active() { return Boolean(this.operation); }
  preview(input) {
    if (this.active) throw new Error('已有批量回复正在执行，请等待完成或先停止。');
    const manual = object(input) && Object.hasOwn(input, 'messageIds');
    if (manual && Object.hasOwn(input, 'replyIds')) throw new Error('请只选择一种批量回复方式。');
    const selectedIds = ids(input, manual ? 'messageIds' : 'replyIds');
    this._prune();
    const tasks = selectedIds.map(id => manual ? this._readDraft(id, input.replyText) : this._read(id));
    const threads = new Set(), recipients = new Set();
    for (const task of tasks) {
      const thread = JSON.stringify([task.accountId, task.threadId]), recipient = JSON.stringify([task.accountId, task.recipientId]);
      if (threads.has(thread) || recipients.has(recipient)) throw new Error('同一账号的同一个会话，每批只能选择一条回复。');
      threads.add(thread); recipients.add(recipient);
    }
    while (this.previews.size >= 10) this.previews.delete(this.previews.keys().next().value);
    const token = randomUUID(), expiresAt = this._now() + PREVIEW_TTL_MS;
    this.previews.set(token, { expiresAt, tasks: clone(tasks) });
    return { token, expiresAt: new Date(expiresAt).toISOString(), total: tasks.length, tasks: tasks.map(task => display(task.check)) };
  }
  start(input) {
    if (this.active) throw new Error('已有批量回复正在执行，请等待完成或先停止。');
    if (!object(input) || typeof input.token !== 'string' || !UUID.test(input.token)) throw new Error('请先核对本批次的接收人和回复文案。');
    this._prune();
    const preview = this.previews.get(input.token);
    if (!preview) throw new Error('本次核对已过期或已使用，请重新核对后确认。');
    // Revalidate every approved item synchronously before reserving any page.
    // Nothing is approved until its own exclusive send operation starts.
    for (const task of preview.tasks) if ((task.manual ? this._readDraft(task.messageId, task.replyText) : this._read(task.id)).proof !== task.proof) throw new Error('账号身份、会话、规则或文案已变化，请重新核对后确认。');
    const batchId = randomUUID();
    this.manager.reserveReplyBatch(batchId, preview.tasks.map(task => task.manual ? { messageId: task.messageId, accountId: task.accountId, replyText: task.replyText, fingerprint: task.fingerprint } : { replyId: task.id, fingerprint: task.fingerprint }));
    this.previews.clear();
    const batch = { id: batchId, status: 'running', tasks: clone(preview.tasks), currentId: null, stopRequested: false, detail: '已确认，后台逐条发送并核对平台回执。', startedAt: new Date(this._now()).toISOString() };
    this.batch = batch;
    const operation = { batch, promise: null };
    this.operation = operation;
    operation.promise = Promise.resolve().then(() => this._run(batch)).finally(() => {
      try { this.manager.releaseReplyBatch(batch.id); }
      catch (error) { batch.status = 'attention'; batch.detail = `批次已停止，释放连接失败：${reason(error)}`; }
      finally {
        batch.currentId = null;
        batch.finishedAt = new Date(this._now()).toISOString();
        if (this.operation === operation) this.operation = null;
        this._notify();
      }
    });
    this._notify();
    return this.snapshot();
  }
  isAuthorized(id, batchId) {
    const batch = this.operation?.batch;
    return Boolean(batch && batch.id === batchId && batch.currentId === id && batch.status === 'running' && !batch.stopRequested);
  }
  stop() {
    const batch = this.operation?.batch;
    if (!batch) return this.snapshot();
    batch.stopRequested = true;
    batch.status = 'stopping';
    batch.detail = '正在停止；未开始的回复保留待确认，已提交的结果将记录为已发送或需核对。';
    try { this.manager.cancelReplyBatchOperation(batch.id); }
    catch (error) { batch.detail = `已停止后续发送，正在等待当前结果：${reason(error)}`; }
    this._notify();
    return this.snapshot();
  }
  stopAccount(accountId) {
    for (const [token, preview] of this.previews) if (preview.tasks.some(task => task.accountId === accountId)) this.previews.delete(token);
    const batch = this.operation?.batch;
    if (!batch || !batch.tasks.some(task => task.accountId === accountId)) return null;
    const accountIds = [...new Set(batch.tasks.map(task => task.accountId))];
    this.stop();
    return { kind: 'reply', id: batch.id, scope: 'batch', accountIds };
  }
  async _run(batch) {
    try {
      for (const task of batch.tasks) {
        if (batch.stopRequested) break;
        const check = task.manual ? this.interactions.checkManualDraft({ messageId: task.messageId, replyText: task.replyText }) : this.interactions.checkBatchReply(task.id);
        if (digest(check) !== digest(task.check)) throw new Error('待发送回复的会话、规则或文案已变化；剩余回复未发送。');
        if (task.manual) task.replyId = this.interactions.createManualBatchReply({ messageId: task.messageId, replyText: task.replyText, expectedMessage: task.check.message, expectedExistingReply: task.check.existingReply }).id;
        const replyId = task.replyId || task.id;
        batch.currentId = replyId;
        batch.detail = `正在向 ${task.recipientName || '该会话用户'} 回复，并等待平台回执。`;
        this._notify();
        let failure;
        try { await this.manager.sendBatchReply(replyId, { batchId: batch.id, fingerprint: task.fingerprint }); }
        catch (error) { failure = error; }
        const actual = this.interactions.getReply(replyId);
        if (actual.status !== 'sent' || actual.receipt === undefined || failure) {
          task.detail = failure ? reason(failure) : actual.reason || '未取得平台发送回执。';
          if (batch.stopRequested && actual.status !== 'unknown') break;
          batch.status = 'attention';
          batch.detail = actual.status === 'unknown' ? '当前回复已提交，但未取得明确回执；批次已暂停，其余回复保留待确认，不会重发。' : `本批已暂停：${task.detail} 其余回复保留待确认。`;
          return;
        }
        task.detail = '已取得平台发送回执。';
        batch.currentId = null;
        this._notify();
      }
      batch.status = batch.stopRequested ? 'stopped' : 'completed';
      batch.detail = batch.stopRequested ? '批次已停止；未开始的回复保留待确认。' : '本批回复均已取得平台发送回执。';
    } catch (error) {
      batch.status = batch.stopRequested ? 'stopped' : 'attention';
      batch.detail = `本批已停止：${reason(error)} 其余回复保留待确认。`;
    }
  }
  snapshot() {
    const batch = this.batch;
    if (!batch) return { id: null, status: 'idle', total: 0, sent: 0, failed: 0, unknown: 0, remaining: 0, current: null, tasks: [], detail: '选择已有私信的待确认回复，核对后可在后台逐条发送。' };
    const tasks = batch.tasks.map(task => {
      let actual;
      try { actual = task.manual && !task.replyId ? { status: 'pending', reason: '尚未开始，未创建发送记录。' } : this.interactions.getReply(task.replyId || task.id); }
      catch { actual = { status: 'unknown', reason: '回复记录无法读取，请核对本地数据。' }; }
      return { ...display(task.check), ...(task.replyId ? { replyId: task.replyId } : {}), status: actual.status, detail: task.detail || actual.reason || '' };
    });
    return { id: batch.id, status: batch.status, total: tasks.length, sent: tasks.filter(task => task.status === 'sent').length, failed: tasks.filter(task => ['failed', 'skipped', 'cancelled'].includes(task.status)).length, unknown: tasks.filter(task => task.status === 'unknown').length, remaining: tasks.filter(task => ['pending', 'queued'].includes(task.status)).length, current: tasks.find(task => (task.replyId || task.id) === batch.currentId) || null, tasks, detail: batch.detail, startedAt: batch.startedAt, ...(batch.finishedAt ? { finishedAt: batch.finishedAt } : {}) };
  }
  async idle() { await this.operation?.promise; return this.snapshot(); }
}

module.exports = { ReplyBatchController, PREVIEW_TTL_MS, MAX_BATCH };
