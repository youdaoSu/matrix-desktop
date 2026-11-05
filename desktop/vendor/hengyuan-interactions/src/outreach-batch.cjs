'use strict';

const { randomUUID } = require('node:crypto');
const { outreachDigest, validateOutreachFailure } = require('./outreach.cjs');
const PREVIEW_TTL_MS = 5 * 60 * 1000;
const BETWEEN_TASKS_MS = 1500;
const clone = value => structuredClone(value);
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

// A restart restores an inspectable summary only. Tokens, promises and running
// authority are deliberately absent; continuation always creates a fresh preview.
function restoreBatchState(input) {
  if (input == null) return null;
  const invalid = () => { throw new Error('批次摘要格式不正确。'); };
  if (!input || input.version !== 1 || !input.batch || typeof input.batch !== 'object') invalid();
  const value = input.batch;
  const string = (text, max = 256) => typeof text === 'string' && text.length > 0 && text.length <= max;
  const ids = (items, limit = 50) => {
    if (!Array.isArray(items) || items.length > limit || items.some(id => !string(id)) || new Set(items).size !== items.length) invalid();
    return [...items];
  };
  if (!string(value.id) || !['running', 'paused', 'stopped', 'completed'].includes(value.status) || !string(value.detail, 1600)) invalid();
  const taskIds = ids(value.taskIds), accountIds = ids(value.accountIds, 100);
  if (!taskIds.length || value.total !== taskIds.length || !accountIds.length) invalid();
  if (!Array.isArray(value.digests) || value.digests.length !== taskIds.length || value.digests.some(digest => typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest))) invalid();
  const subset = items => { const result = ids(items); if (result.some(id => !taskIds.includes(id))) invalid(); return result; };
  const accountSubset = items => { const result = ids(items, 100); if (result.some(id => !accountIds.includes(id))) invalid(); return result; };
  const attemptedTaskIds = subset(value.attemptedTaskIds), deferredTaskIds = subset(value.deferredTaskIds), processedTaskIds = subset(value.processedTaskIds), accountedTaskIds = subset(value.accountedTaskIds);
  if (processedTaskIds.length !== value.completed || accountedTaskIds.some(id => !processedTaskIds.includes(id))) invalid();
  const blockedAccountIds = accountSubset(value.blockedAccountIds), deferredAccountIds = accountSubset(value.deferredAccountIds);
  if (value.currentTaskId !== null && !taskIds.includes(value.currentTaskId)) invalid();
  for (const key of ['completed', 'sent', 'failed', 'skipped', 'unknown']) if (!Number.isInteger(value[key]) || value[key] < 0 || value[key] > value.total) invalid();
  if (value.sent + value.failed + value.skipped + value.unknown !== accountedTaskIds.length || accountedTaskIds.length > value.completed || deferredTaskIds.some(id => !accountedTaskIds.includes(id))) invalid();
  if (!Array.isArray(value.failures) || value.failures.length > value.total || new Set(value.failures.map(failure => failure?.taskId)).size !== value.failures.length) invalid();
  const failures = value.failures.map(entry => {
    if (!entry || !accountedTaskIds.includes(entry.taskId) || !accountIds.includes(entry.accountId) || !string(entry.recipientName, 1000)) invalid();
    if (entry.deferred !== undefined && entry.deferred !== true) invalid();
    if (entry.deferred === true && !deferredTaskIds.includes(entry.taskId)) invalid();
    return { taskId: entry.taskId, accountId: entry.accountId, recipientName: entry.recipientName, ...validateOutreachFailure(entry), ...(entry.deferred ? { deferred: true } : {}) };
  });
  if (!Array.isArray(value.recoveryNotes) || value.recoveryNotes.length > value.total || new Set(value.recoveryNotes.map(note => note?.taskId)).size !== value.recoveryNotes.length) invalid();
  const recoveryNotes = value.recoveryNotes.map(note => {
    if (!note || !accountedTaskIds.includes(note.taskId) || !string(note.detail, 4000) || !['sent', 'unknown', 'failed', 'deferred'].includes(note.outcome)) invalid();
    if (note.accountId !== undefined && !accountIds.includes(note.accountId)) invalid();
    if (note.recipientName !== undefined && (typeof note.recipientName !== 'string' || note.recipientName.length > 1000)) invalid();
    return { taskId: note.taskId, detail: note.detail, outcome: note.outcome,
      ...(note.accountId ? { accountId: note.accountId } : {}), ...(note.recipientName !== undefined ? { recipientName: note.recipientName } : {}) };
  });
  if (value.continuationOf !== undefined && !string(value.continuationOf)) invalid();
  if (value.executionKind !== undefined && !['manual', 'keyword-rule'].includes(value.executionKind)) invalid();
  return { id: value.id, executionKind: value.executionKind || 'manual', status: value.status === 'running' ? 'stopped' : value.status,
    total: value.total, completed: value.completed, sent: value.sent, failed: value.failed, skipped: value.skipped, unknown: value.unknown,
    failures, taskIds, accountIds, currentTaskId: value.currentTaskId,
    detail: value.status === 'running' ? '应用已重新启动，原批次未自动恢复。可继续尚未尝试的任务；已尝试或待核对项目请先检查。' : value.detail,
    digests: new Map(taskIds.map((id, index) => [id, value.digests[index]])), attemptedTaskIds: new Set(attemptedTaskIds),
    blockedAccountIds: new Set(blockedAccountIds), deferredTaskIds, deferredAccountIds: new Set(deferredAccountIds),
    technicalFailureStreaks: new Map(), initialBlocked: new Map(), processing: false, waitingForAccounts: false,
    processedTaskIds: new Set(processedTaskIds), accountedTaskIds: new Set(accountedTaskIds), recoveryNotes,
    ...(value.continuationOf ? { continuationOf: value.continuationOf } : {}) };
}

// Confirmation authorizes this exact immutable set once. The manager remains
// responsible for durable claims, platform identity, policy and receipt checks.
class OutreachBatchController {
  #preview = null;
  #batch = null;
  #worker = null;
  #persistenceError = null;
  constructor({ tasks, manager, changed = () => {}, now = Date.now, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), reserve = () => {}, release = () => {}, cancelReservation = () => {}, loadState = () => null, saveState = () => {}, authorizeAutomatic = () => false }) {
    if (!tasks || typeof tasks.preflight !== 'function' || typeof tasks.get !== 'function' || !manager || typeof manager.send !== 'function' || typeof manager.cancelBatchOperation !== 'function' || [changed, now, wait].some(fn => typeof fn !== 'function')) throw new Error('批量发送设置不正确。');
    if ([reserve, release, cancelReservation, loadState, saveState].some(fn => typeof fn !== 'function')) throw new Error('批量发送账号预约设置不正确。');
    if (typeof authorizeAutomatic !== 'function') throw new Error('自动分配核验器不正确。');
    Object.assign(this, { tasks, manager, changed, now, wait, reserve, release, cancelReservation, saveState, authorizeAutomatic });
    try { this.#batch = restoreBatchState(loadState()); if (this.#batch) this.reconcileRestoredBatch(this.#batch); } catch { this.#batch = null; }
  }
  markProcessed(batch, taskId) {
    batch.processedTaskIds.add(taskId); batch.completed = batch.processedTaskIds.size;
  }
  reconcileRestoredBatch(batch) {
    // Only read durable task results. A prior dispatch without a completed local
    // result is never repeated, and a receipt is never inferred from a status.
    for (const taskId of batch.attemptedTaskIds) {
      if (batch.accountedTaskIds.has(taskId)) continue;
      let task;
      try { task = this.tasks.get(taskId); } catch { /* Retain a visible inspection note if the original record is missing. */ }
      const fixed = task?.id === taskId && outreachDigest(task) === batch.digests.get(taskId);
      let outcome = 'deferred', detail = '上次已开始检查，但没有完整处理结果；请核对原任务，本条不会随剩余任务自动重试。';
      let failure;
      if (fixed && task.status === 'sent' && typeof task.receipt === 'string' && task.receipt.trim() && task.claimedAt) {
        batch.sent++; outcome = 'sent'; detail = '已按原任务保存的平台回执补齐批次统计；没有重新发送。';
      } else if (fixed && task.status === 'unknown') {
        batch.unknown++; outcome = 'unknown'; detail = task.reason || '原任务账本记录为结果待核对；没有重新发送。';
        batch.blockedAccountIds.add(task.accountId);
        if (task.failure?.outcome === 'unknown') try { failure = validateOutreachFailure(task.failure); } catch {}
      } else if (fixed && task.status === 'failed' && task.failure?.outcome === 'not-sent') {
        try { failure = validateOutreachFailure(task.failure); } catch {}
        if (failure) { batch.failed++; outcome = 'failed'; detail = failure.detail; }
      }
      if (outcome === 'deferred') {
        batch.skipped++;
        if (!batch.deferredTaskIds.includes(taskId)) batch.deferredTaskIds.push(taskId);
        if (!fixed) detail = '原任务缺失或内容已变化，不能依据旧批次继续；请单独核对，本条已暂缓。';
        else if (task.status === 'review' && task.claimedAt === undefined) detail = '上次已开始检查，当前任务没有领取记录；已暂缓供人工核对，不会随剩余任务自动重试。';
        else { detail = '上次任务没有可核验的完成回执，请检查原平台记录；本条不会自动重试。'; batch.blockedAccountIds.add(task.accountId); }
      }
      if (failure) {
        batch.failures.push({ taskId, accountId: task.accountId, recipientName: task.recipientName, ...clone(failure) });
        if (failure.scope === 'account') batch.blockedAccountIds.add(task.accountId);
      }
      this.markProcessed(batch, taskId); batch.accountedTaskIds.add(taskId);
      batch.recoveryNotes.push({ taskId, outcome, detail,
        ...(fixed ? { accountId: task.accountId, recipientName: task.recipientName } : {}) });
    }
    this.deferBlockedRemainder(batch);
  }
  deferBlockedRemainder(batch) {
    const detail = batch.detail;
    for (const taskId of batch.taskIds) {
      if (batch.processedTaskIds.has(taskId) || batch.attemptedTaskIds.has(taskId)) continue;
      let task;
      try { task = this.fixedTask(batch, taskId); } catch { continue; }
      if (!batch.blockedAccountIds.has(task.accountId) || task.status !== 'review' || task.claimedAt !== undefined || task.failure !== undefined || task.receipt !== undefined) continue;
      this.deferPreflight(batch, taskId, { outcome: 'not-sent', scope: 'account', code: 'account-skipped', stage: 'preflight', detail: '该发送账号在本批次需要处理，本条尚未尝试，已暂缓；不会随其他账号的剩余任务自动重试。' });
      this.markProcessed(batch, taskId);
    }
    batch.detail = detail;
  }
  get active() { return this.#worker !== null; }
  get hasPendingPreview() { return Boolean(this.#preview && this.time() - this.#preview.createdAt < PREVIEW_TTL_MS); }
  time() { const value = this.now(); if (!Number.isFinite(value)) throw new Error('批量确认时钟不正确。'); return value; }
  exportState() {
    if (!this.#batch) return null;
    const batch = this.#batch;
    const { id, status, total, completed, sent, failed, skipped, unknown, failures, currentTaskId, taskIds, accountIds, detail, continuationOf } = batch;
    return { version: 1, batch: { id, executionKind: batch.executionKind || 'manual', status, total, completed, sent, failed, skipped, unknown, failures: clone(failures), currentTaskId,
      taskIds: [...taskIds], accountIds: [...accountIds], detail, ...(continuationOf ? { continuationOf } : {}),
      digests: taskIds.map(id => batch.digests.get(id)), attemptedTaskIds: [...batch.attemptedTaskIds],
      processedTaskIds: [...batch.processedTaskIds], accountedTaskIds: [...batch.accountedTaskIds], recoveryNotes: clone(batch.recoveryNotes),
      blockedAccountIds: [...batch.blockedAccountIds], deferredTaskIds: [...batch.deferredTaskIds], deferredAccountIds: [...batch.deferredAccountIds] } };
  }
  notify() {
    try { this.saveState(this.exportState()); this.#persistenceError = null; }
    catch {
      this.#persistenceError = '批次进度无法保存，已停止启动后续任务；请检查本机存储后继续。';
      if (this.#batch && this.current(this.#batch)) {
        this.#batch.status = 'paused'; this.#batch.processing = false; this.#batch.waitingForAccounts = false;
        this.#batch.detail = this.#persistenceError;
        const batch = this.#batch;
        batch.cancelWait();
        const cancel = fn => { try { return Promise.resolve(fn(batch.id)).catch(() => {}); } catch { return Promise.resolve(); } };
        batch.cancellation = Promise.all([cancel(id => this.cancelReservation(id)), cancel(id => this.manager.cancelBatchOperation(id))]);
      }
    }
    try { this.changed(this.snapshot()); } catch { /* Observer errors cannot restart or interrupt delivery. */ }
  }
  remainingTaskIds(batch = this.#batch) {
    if (!batch) return [];
    const handled = new Set([...batch.attemptedTaskIds, ...batch.deferredTaskIds, ...batch.failures.map(item => item.taskId)]);
    // Production get() clones the full store; read it once for all remaining
    // candidates instead of cloning every historical task up to fifty times.
    let currentTasks;
    if (typeof this.tasks.snapshot === 'function') {
      try { currentTasks = new Map(this.tasks.snapshot().map(task => [task.id, task])); } catch { return []; }
    }
    return batch.taskIds.filter(taskId => {
      if (handled.has(taskId)) return false;
      try {
        const task = currentTasks ? currentTasks.get(taskId) : this.tasks.get(taskId);
        return task?.id === taskId && task.channel === 'dm' && task.status === 'review' && task.claimedAt === undefined &&
          task.failure === undefined && task.receipt === undefined && !batch.blockedAccountIds.has(task.accountId) && outreachDigest(task) === batch.digests.get(taskId);
      } catch { return false; }
    });
  }
  previewRemaining({ batchId } = {}) {
    const batch = this.#batch;
    if (!batch || batch.id !== batchId) throw new Error('原批次已变化，请刷新后继续。');
    if (this.active || !['paused', 'stopped'].includes(batch.status)) throw new Error('请等待本批停止和页面清理完成后再继续。');
    if (this.#persistenceError) { this.notify(); if (this.#persistenceError) throw new Error(this.#persistenceError); }
    const ids = this.remainingTaskIds(batch);
    if (!ids.length) throw new Error('本批没有尚未尝试且内容未变化的任务；暂缓、失败和待核对项目请在汇总中处理。');
    const preview = this.preview({ ids });
    this.#preview = freeze({ ...this.#preview, continuationOf: batch.id });
    return { ...preview, continuationOf: batch.id };
  }
  inspectEligibility(taskId, digest) {
    let task, failure;
    try { task = this.tasks.preflight(taskId); }
    catch (error) {
      // Preview freezes recipients/content, while transient per-account policy
      // outcomes are rechecked and recorded by the worker without blocking peers.
      if (!error.failure) throw error;
      const f = validateOutreachFailure({ ...error.failure, recordedAt: new Date().toISOString() });
      if (f.outcome !== 'not-sent' || f.stage !== 'preflight' || !['task', 'account'].includes(f.scope)) throw error;
      task = this.tasks.get(taskId);
      failure = f;
    }
    if (!task || task.id !== taskId || task.channel !== 'dm' || task.status !== 'review' || task.claimedAt !== undefined) throw new Error('批量发送只接受未经尝试的待确认私信任务。');
    if (digest !== undefined && outreachDigest(task) !== digest) throw new Error('批量确认后的任务内容或发送对象已变化，请重新核对。');
    return { task, failure };
  }
  eligible(taskId, digest) {
    const { task, failure } = this.inspectEligibility(taskId, digest);
    if (failure) throw Object.assign(new Error(failure.detail), { failure });
    return task;
  }
  preview({ ids } = {}) {
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 50 || ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) throw new Error('请选择 1 至 50 条不重复的待确认私信。');
    // Discard an earlier confirmation before creating another preview.
    this.#preview = null;
    const checked = ids.map(taskId => this.inspectEligibility(taskId));
    const tasks = checked.map(({ task }) => freeze(clone(task)));
    const blocked = checked.filter(item => item.failure).map(({ task, failure }) => ({ taskId: task.id, accountId: task.accountId, recipientName: task.recipientName, ...failure }));
    const preview = { token: randomUUID(), createdAt: this.time(), tasks, blocked, digests: tasks.map(outreachDigest) };
    this.#preview = freeze(preview);
    return { token: preview.token, tasks: clone(tasks), total: tasks.length, blocked: clone(blocked), readyCount: tasks.length - blocked.length };
  }
  start({ token } = {}) {
    if (this.active) throw new Error('上一批任务尚未结束，请等待停止清理完成后重新确认。');
    if (this.manager.busyAccounts?.size > 0 || this.manager.checkingCount > 0) throw new Error('正在核对或发送单条任务，请等待当前操作结束后再启动批次。');
    const preview = this.#preview;
    if (!preview || typeof token !== 'string' || preview.token !== token) throw new Error('批量确认已失效，请重新预览任务。');
    // Consume before rechecking: a failed start also requires fresh confirmation.
    this.#preview = null;
    return this.#startPrepared(preview);
  }
  // Worker-only authority from an explicitly armed rule, never a fabricated
  // UI preview token. One frozen recipient per automatic dispatch.
  startAutomatic({ taskId, authority } = {}) {
    if (this.hasPendingPreview) throw new Error('已有人工预览，自动分配暂缓。');
    if (!authority || !this.authorizeAutomatic(authority, [taskId])) throw new Error('自动规则授权已失效，未启动发送。');
    const task = freeze(clone(this.eligible(taskId)));
    return this.#startPrepared({ createdAt: this.time(), tasks: [task], digests: [outreachDigest(task)], blocked: [] }, freeze(clone(authority)));
  }
  #startPrepared(preview, automaticAuthority) {
    if (this.active || this.manager.busyAccounts?.size > 0 || this.manager.checkingCount > 0) throw new Error('已有任务正在处理，未启动新的批次。');
    if (automaticAuthority && !this.authorizeAutomatic(automaticAuthority, preview.tasks.map(task => task.id))) throw new Error('自动规则授权已变化，未启动发送。');
    const age = this.time() - preview.createdAt;
    if (age < 0 || age >= PREVIEW_TTL_MS) throw new Error('批量确认已过期，请重新预览任务。');
    const previous = preview.continuationOf ? this.#batch : null;
    if (preview.continuationOf && (!previous || previous.id !== preview.continuationOf || !['paused', 'stopped'].includes(previous.status))) throw new Error('原批次已变化，请重新核对剩余任务。');
    const checked = preview.tasks.map((task, index) => this.inspectEligibility(task.id, preview.digests[index]));
    if (previous && preview.tasks.some((task, index) => previous.digests.get(task.id) !== preview.digests[index])) throw new Error('原批次剩余任务的内容已变化，请重新核对。');
    // Confirmation may shrink its runnable set, never expand it after the UI
    // disclosed which tasks were blocked. Recovered tasks need a new preview.
    const initialBlocked = new Map(preview.blocked.map(({ taskId, accountId, recipientName, ...failure }) => [taskId, failure]));
    for (const { task, failure } of checked) if (failure) initialBlocked.set(task.id, failure);
    if (initialBlocked.size === checked.length) throw new Error(`所选任务当前均不可发送，请先处理后重新核对：${initialBlocked.values().next().value.detail}`);
    let cancelWait;
    const batch = {
      id: randomUUID(), executionKind: automaticAuthority ? 'keyword-rule' : 'manual', automaticAuthority, status: 'running', total: previous?.total ?? preview.tasks.length, completed: previous?.completed || 0, sent: previous?.sent || 0,
      failed: previous?.failed || 0, skipped: previous?.skipped || 0, unknown: previous?.unknown || 0, failures: clone(previous?.failures || []),
      blockedAccountIds: new Set(previous?.blockedAccountIds), deferredTaskIds: [...(previous?.deferredTaskIds || [])], deferredAccountIds: new Set(previous?.deferredAccountIds),
      technicalFailureStreaks: new Map(), attemptedTaskIds: new Set(previous?.attemptedTaskIds), waitingForAccounts: true,
      processedTaskIds: new Set(previous?.processedTaskIds), accountedTaskIds: new Set(previous?.accountedTaskIds), recoveryNotes: clone(previous?.recoveryNotes || []),
      initialBlocked, continuationOf: preview.continuationOf,
      currentTaskId: null, taskIds: previous ? [...previous.taskIds] : preview.tasks.map(task => task.id), runTaskIds: preview.tasks.map(task => task.id), detail: automaticAuthority ? '已按启用的关键词规则分配，等待原账号就绪。' : '已确认，等待账号当前操作结束后自动开始。',
      accountIds: previous ? [...previous.accountIds] : [...new Set(preview.tasks.flatMap(task => [task.accountId, task.primaryAccountId].filter(Boolean)))],
      processing: false,
      digests: previous ? new Map(previous.digests) : new Map(preview.tasks.map((task, index) => [task.id, preview.digests[index]])),
      stopped: new Promise(resolve => { cancelWait = resolve; }), cancelWait,
      cancellation: Promise.resolve(),
    };
    // Deferred tasks cannot run under this confirmation, so their unrelated
    // account operations must not hold up the authorized senders. Directory
    // tasks that can run still reserve their primary for source/duplicate checks.
    const runnable = preview.tasks.filter(task => !initialBlocked.has(task.id));
    const reservation = this.reserve(batch.id, [...new Set(runnable.flatMap(task => task.sourceKind === 'fan-directory' ? [task.accountId, task.primaryAccountId] : [task.accountId]))]);
    // Attach rejection handling in the same turn; confirmation stays valid while
    // the reserved accounts finish an existing monitor/receipt operation.
    const ready = Promise.resolve(reservation).then(() => ({ ready: true }), error => ({ error }));
    this.#batch = batch;
    this.#worker = Promise.all([ready, new Promise(resolve => setImmediate(resolve))]).then(async ([result]) => {
      batch.waitingForAccounts = false;
      if (!this.current(batch)) return;
      if (result.error) { this.pause(batch, result.error); return; }
      await this.run(batch);
    }).catch(error => this.pause(batch, error)).finally(async () => {
      await batch.cancellation;
      try { this.release(batch.id); }
      finally { if (this.#batch === batch) { batch.waitingForAccounts = false; this.#worker = null; this.notify(); } }
    });
    this.notify();
    return this.snapshot();
  }
  current(batch) { return this.#batch === batch && batch.status === 'running'; }
  isAuthorized(taskId, batchId) {
    const batch = this.#batch;
    if (!batch || !this.current(batch) || !batch.processing || batch.id !== batchId || batch.currentTaskId !== taskId) return false;
    if (batch.automaticAuthority && !this.authorizeAutomatic(batch.automaticAuthority, [taskId])) return false;
    try { return outreachDigest(this.tasks.get(taskId)) === batch.digests.get(taskId); } catch { return false; }
  }
  fixedTask(batch, taskId) {
    const task = this.tasks.get(taskId);
    if (!task || task.id !== taskId || outreachDigest(task) !== batch.digests.get(taskId)) throw new Error('批量确认后的任务内容或发送对象已变化，请重新核对。');
    return task;
  }
  recordFailure(batch, taskId, input, skipped = false) {
    const failure = validateOutreachFailure({ ...input, recordedAt: input?.recordedAt || new Date().toISOString() });
    if (failure.scope === 'batch') throw new Error(failure.detail);
    let stored = this.fixedTask(batch, taskId);
    const expectedStatus = failure.outcome === 'not-sent' ? 'failed' : 'unknown';
    if (stored.status === expectedStatus && stored.failure) {
      for (const key of ['outcome', 'scope', 'code', 'detail', 'stage', 'evidence']) if (stored.failure[key] !== failure[key]) throw new Error('失败记录与发送结果不一致，已暂停核对。');
    } else {
      if (typeof this.tasks.recordFailure !== 'function') throw new Error('无法保存发送失败记录，已暂停核对。');
      this.tasks.recordFailure(taskId, failure);
      stored = this.fixedTask(batch, taskId);
    }
    if (stored.status !== expectedStatus || !stored.failure) throw new Error('发送失败记录未保存，已暂停核对。');
    batch.accountedTaskIds.add(taskId);
    if (failure.outcome === 'unknown') batch.unknown++;
    else if (skipped) batch.skipped++;
    else batch.failed++;
    batch.failures.push({ taskId, accountId: stored.accountId, recipientName: stored.recipientName, ...clone(stored.failure) });
    if (failure.scope === 'account' || failure.outcome === 'unknown') batch.blockedAccountIds.add(stored.accountId);
    batch.detail = '正在继续其他可执行任务；未成功项目已保留在汇总中。';
  }
  deferPreflight(batch, taskId, input) {
    const failure = validateOutreachFailure({ ...input, recordedAt: input?.recordedAt || new Date().toISOString() });
    const task = this.fixedTask(batch, taskId);
    if (task.status !== 'review' || task.claimedAt !== undefined || failure.outcome !== 'not-sent' || failure.stage !== 'preflight' || !['task', 'account'].includes(failure.scope)) throw new Error('不能将已尝试或无法确认的任务恢复为待核对。');
    batch.accountedTaskIds.add(taskId);
    batch.skipped++; batch.deferredTaskIds.push(taskId);
    batch.failures.push({ taskId, accountId: task.accountId, recipientName: task.recipientName, ...clone(failure), deferred: true });
    if (failure.scope === 'account') { batch.blockedAccountIds.add(task.accountId); batch.deferredAccountIds.add(task.accountId); }
    batch.detail = '当前无法发送的任务保留待核对；正在继续其他可执行任务。';
  }
  async run(batch) {
    try {
      for (const taskId of batch.runTaskIds) {
        if (!this.current(batch)) break;
        batch.currentTaskId = taskId;
        const fixed = this.fixedTask(batch, taskId);
        if (batch.initialBlocked.has(taskId)) {
          this.deferPreflight(batch, taskId, batch.initialBlocked.get(taskId));
          this.markProcessed(batch, taskId); this.notify(); continue;
        }
        if (batch.blockedAccountIds.has(fixed.accountId)) {
          if (fixed.status !== 'review' || fixed.claimedAt !== undefined) throw new Error('待跳过任务状态已变化，请核对。');
          const skipped = { outcome: 'not-sent', scope: 'account', code: 'account-skipped', stage: 'preflight', detail: '该发送账号在本批次需要处理，后续任务已跳过，未提交消息。' };
          this.deferPreflight(batch, taskId, skipped);
          this.markProcessed(batch, taskId); this.notify(); continue;
        }
        try { this.eligible(taskId, batch.digests.get(taskId)); }
        catch (error) {
          if (!error.failure) { this.pause(batch, error); break; }
          this.deferPreflight(batch, taskId, error.failure); this.markProcessed(batch, taskId); this.notify(); continue;
        }
        if (!this.current(batch)) break;
        batch.attemptedTaskIds.add(taskId);
        batch.processing = true; batch.detail = '正在核对固定发送账号与接收人，并等待平台回执。'; this.notify();
        if (!this.current(batch)) break;
        let result, error;
        try { result = await this.manager.send(taskId, { background: true, batchId: batch.id }); }
        catch (caught) { error = caught; }
        batch.processing = false;
        if (this.#batch !== batch) break;
        this.markProcessed(batch, taskId);
        const stored = this.fixedTask(batch, taskId);
        const sent = !error && result?.sent === true && stored.status === 'sent';
        if (sent) { batch.sent++; batch.accountedTaskIds.add(taskId); batch.technicalFailureStreaks.delete(stored.accountId); }
        // Stopping revokes authorization immediately; preserve a late receipt,
        // but never start a new task or replace a stopped status with completed.
        if (!this.current(batch)) { this.notify(); break; }
        if (!sent) {
          const failure = result?.failure || error?.failure;
          if (!failure) { this.pause(batch, error || new Error('未取得确定的发送结果，已暂停核对。')); break; }
          if (failure.outcome === 'not-sent' && failure.stage === 'preflight' && ['task', 'account'].includes(failure.scope) && stored.status === 'review' && stored.claimedAt === undefined) {
            this.deferPreflight(batch, taskId, failure);
            if (failure.code === 'page-load-timeout') {
              const streak = (batch.technicalFailureStreaks.get(stored.accountId) || 0) + 1;
              batch.technicalFailureStreaks.set(stored.accountId, streak);
              if (streak >= 2) {
                batch.blockedAccountIds.add(stored.accountId); batch.deferredAccountIds.add(stored.accountId);
                batch.detail = '该账号连续两次页面加载超时，后续任务已暂缓；正在继续其他账号。';
              }
            } else batch.technicalFailureStreaks.delete(stored.accountId);
          } else {
            batch.technicalFailureStreaks.delete(stored.accountId);
            this.recordFailure(batch, taskId, failure);
          }
        }
        this.notify();
        if (batch.completed < batch.total && this.current(batch)) await Promise.race([this.wait(BETWEEN_TASKS_MS), batch.stopped]);
      }
      if (this.current(batch)) {
        batch.status = 'completed'; batch.currentTaskId = null;
        batch.detail = batch.sent === batch.total ? '本批任务已全部取得发送成功回执。' : `本批处理完成：发送成功 ${batch.sent} 条，失败 ${batch.failed} 条，跳过 ${batch.skipped} 条，结果待核对 ${batch.unknown} 条。`;
      }
    } catch (error) { this.pause(batch, error); }
    finally { batch.processing = false; await batch.cancellation; }
  }
  pause(batch, error) {
    if (!this.current(batch)) return;
    batch.status = 'paused'; batch.processing = false; batch.waitingForAccounts = false;
    this.deferBlockedRemainder(batch);
    batch.detail = `批次已暂停：${String(error?.message || '发送未确认').slice(0, 1500)} 剩余任务可通过“继续剩余任务”重新核对并确认。`;
    this.notify();
  }
  stop(detail) {
    this.#preview = null;
    return this.#stopBatch(detail);
  }
  invalidatePreview() { this.#preview = null; }
  stopAccount(accountId) {
    if (this.#preview?.tasks.some(task => task.accountId === accountId || task.primaryAccountId === accountId)) this.#preview = null;
    const batch = this.#batch;
    if (!this.active || !batch?.accountIds.includes(accountId)) return null;
    this.#stopBatch();
    return { kind: 'outreach', id: batch.id, scope: 'batch', accountIds: [...batch.accountIds] };
  }
  #stopBatch(detail = '已停止批量发送，剩余任务需重新确认。') {
    const batch = this.#batch;
    if (!batch || batch.status !== 'running') return this.snapshot();
    batch.status = 'stopped'; batch.detail = typeof detail === 'string' && detail.trim() ? detail.slice(0, 1500) : '已停止批量发送，剩余任务需重新确认。';
    batch.cancelWait();
    const cancel = fn => { try { return Promise.resolve(fn(batch.id)).catch(() => {}); } catch { return Promise.resolve(); } };
    batch.cancellation = Promise.all([cancel(id => this.cancelReservation(id)), cancel(id => this.manager.cancelBatchOperation(id))]);
    this.notify(); return this.snapshot();
  }
  snapshot() {
    if (!this.#batch) return null;
    const { id, status, total, completed, sent, failed, skipped, unknown, failures, blockedAccountIds, deferredTaskIds, waitingForAccounts, currentTaskId, taskIds, detail } = this.#batch;
    const remainingTaskIds = this.remainingTaskIds();
    return { id, executionKind: this.#batch.executionKind || 'manual', status, total, completed, sent, failed, skipped, unknown, failures: clone(failures), blockedAccountIds: [...blockedAccountIds], deferredTaskIds: [...deferredTaskIds], waitingForAccounts, currentTaskId, taskIds: [...taskIds], detail,
      recoveryNotes: clone(this.#batch.recoveryNotes), remainingTaskIds, remainingCount: remainingTaskIds.length, canContinue: !this.active && ['paused', 'stopped'].includes(status) && remainingTaskIds.length > 0,
      ...(this.#batch.continuationOf ? { continuationOf: this.#batch.continuationOf } : {}) };
  }
  reconcileObservedTask(taskId){
    const batch=this.#batch;
    if(!batch||this.active||!batch.accountedTaskIds.has(taskId))return false;
    const failure=batch.failures.find(f=>f.taskId===taskId&&f.outcome==='unknown');
    if(!failure)return false;
    const task=this.fixedTask(batch,taskId);
    if(task?.status!=='sent'||typeof task.receipt!=='string'||!/^platform:\S+$/.test(task.receipt)||!task.claimedAt)return false;
    batch.unknown=Math.max(0,batch.unknown-1);batch.sent++;
    batch.failures=batch.failures.filter(f=>f!==failure);
    batch.recoveryNotes.push({taskId,outcome:'sent',detail:'已自动核对原平台回执并更新统计'});
    this.notify();return true;
  }
  async idle() { if (this.#worker) await this.#worker; }
}

module.exports = { OutreachBatchController };
