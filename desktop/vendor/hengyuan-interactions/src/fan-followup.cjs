'use strict';

// Local contact bookkeeping only. It never opens pages or enqueues/sends messages.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { read, write } = require('./workspace-data.cjs');
const { validateOutreachTask, validateOutreachRelations } = require('./outreach.cjs');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_RECORDS = 100000;
const PREVIEW_TTL_MS = 10 * 60 * 1000;
const MAX_PREVIEWS = 256;
const MANUAL = ['manual-sent', 'excluded'];
const RANK = { attention: 5, sent: 4, pending: 3, 'manual-sent': 2, excluded: 1 };
const clone = value => structuredClone(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => object(value) && Object.hasOwn(value, key);
function fields(value, keys) {
  if (!object(value) || Object.keys(value).some(key => !keys.includes(key))) throw new Error('粉丝联系标记字段不正确。');
  return value;
}
function accountId(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error('联系标记账号编号不正确。');
  return value;
}
function fanId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(value) || /^\d+$/.test(value) || /^self$/i.test(value)) throw new Error('联系标记必须使用已核验的粉丝主页编号。');
  return value;
}
function profileId(value) {
  if (typeof value !== 'string') return null;
  const match = /^https:\/\/www\.douyin\.com\/user\/([A-Za-z0-9_-]{1,256})$/.exec(value);
  if (!match) return null;
  try { return fanId(match[1]); } catch { return null; }
}
function text(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('联系标记文字不正确。');
  return value.trim();
}
function iso(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('联系标记时间不正确。');
  return value;
}
function binding(value, strict = false) {
  if (strict) fields(value, ['platform', 'identity', 'establishedAt']);
  if (!object(value) || value.platform !== 'douyin' || typeof value.identity !== 'string' || !/^[1-9]\d{0,63}$/.test(value.identity)) throw new Error('联系标记缺少已验证的账号绑定。');
  return { platform: 'douyin', identity: value.identity, establishedAt: iso(value.establishedAt) };
}
function sameBinding(a, b) { return a.platform === b.platform && a.identity === b.identity && a.establishedAt === b.establishedAt; }
function manualRecord(value) {
  fields(value, ['platform', 'fanId', 'status', 'accountId', 'accountName', 'senderBinding', 'primaryAccountId', 'primaryBinding', 'markedAt']);
  if (value.platform !== 'douyin' || !MANUAL.includes(value.status)) throw new Error('联系标记平台或状态不正确。');
  const result = { platform: 'douyin', fanId: fanId(value.fanId), status: value.status,
    accountId: accountId(value.accountId), accountName: text(value.accountName, 200), senderBinding: binding(value.senderBinding, true),
    primaryAccountId: accountId(value.primaryAccountId), primaryBinding: binding(value.primaryBinding, true), markedAt: iso(value.markedAt) };
  if ((result.accountId === result.primaryAccountId) !== sameBinding(result.senderBinding, result.primaryBinding) ||
      (result.accountId !== result.primaryAccountId && result.senderBinding.identity === result.primaryBinding.identity)) throw new Error('联系标记发送账号与主号绑定不一致。');
  if (result.markedAt < result.senderBinding.establishedAt || result.markedAt < result.primaryBinding.establishedAt) throw new Error('联系标记时间早于账号绑定。');
  return result;
}
function validate(value) {
  fields(value, ['schemaVersion', 'records']);
  if (value.schemaVersion !== 1 || !Array.isArray(value.records) || value.records.length > MAX_RECORDS) throw new Error('联系标记版本或记录数量不正确。');
  const ids = new Set();
  return { schemaVersion: 1, records: value.records.map(entry => {
    const clean = manualRecord(entry);
    if (ids.has(clean.fanId)) throw new Error('同一粉丝存在重复联系标记。');
    ids.add(clean.fanId); return clean;
  }) };
}
function receiptKind(value) {
  if (typeof value === 'string') {
    if (!value.trim() || value.length > 16000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) return null;
    return /^platform:[^\s\u0000-\u001f\u007f]+$/.test(value) ? 'platform-receipt' : 'recorded-receipt';
  }
  if (!object(value) || !Object.keys(value).length) return null;
  try {
    let nodes = 0;
    const inspect = (item, depth = 0) => {
      if (++nodes > 16000 || depth > 8) throw new Error('receipt');
      if (item === null || typeof item === 'string' || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) return;
      if (!item || typeof item !== 'object' || own(item, 'toJSON')) throw new Error('receipt');
      const proto = Object.getPrototypeOf(item);
      if (Array.isArray(item) ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) throw new Error('receipt');
      for (const key of Object.keys(item)) {
        const d = Object.getOwnPropertyDescriptor(item, key);
        if (!d || d.get || d.set) throw new Error('receipt');
        inspect(d.value, depth + 1);
      }
    };
    inspect(value);
    if (Buffer.byteLength(JSON.stringify(value)) > 16000) return null;
    return value.kind === 'manual-confirmation' ? 'manual-confirmation' : 'recorded-receipt';
  } catch { return null; }
}
function evidenceStatus(entry, family, attempted) {
  if (entry.status === 'sent') {
    const proof = receiptKind(entry.receipt);
    if (!proof) return { status: 'attention', label: '需核对', source: `${family}-missing-receipt` };
    const manual = entry.resolvedAt !== undefined || entry.resolution === 'sent' || entry.reasonCode === 'manually_confirmed_sent' || proof === 'manual-confirmation';
    if (manual) return { status: 'manual-sent', label: '人工确认已发送', source: `${family}-manual-confirmation` };
    if (proof !== 'platform-receipt') return { status: 'attention', label: '需核对', source: `${family}-unverified-receipt` };
    return { status: 'sent', label: '已发送（平台回执）', source: `${family}-platform-receipt` };
  }
  if (['sending', 'unknown'].includes(entry.status) || attempted) return { status: 'attention', label: '需核对', source: `${family}-uncertain` };
  if (['review', 'pending', 'queued'].includes(entry.status)) return { status: 'pending', label: '已有待处理任务', source: `${family}-pending` };
  // Unattempted cancellation, skipped input and unclaimed failures are not sends.
  return null;
}
function safeAt(entry) {
  for (const key of ['resolvedAt', 'sentAt', 'updatedAt', 'claimedAt', 'createdAt']) {
    try { if (entry[key] !== undefined) return iso(entry[key]); } catch { /* no guessed timestamp */ }
  }
  return undefined;
}
function historyArray(value, field) {
  if (!object(value)) throw new Error('本地发送历史不可读取，请保留记录后重试。');
  if (value[field] === undefined) return [];
  if (!Array.isArray(value[field])) throw new Error('本地发送历史列表格式不正确。');
  return value[field];
}
function confirmedUnsentParent(task, taskCounts, attemptsById, messages) {
  if (task.origin !== undefined || task.status !== 'failed' || task.failure?.outcome !== 'not-sent' || task.receipt !== undefined || taskCounts.get(task.id) !== 1) return false;
  try {
    validateOutreachTask(task);
    const claims = attemptsById.get(task.id) || [];
    // A claimed failure is safe only when the frozen task and durable ledger
    // agree. Missing, legacy, duplicated or conflicting evidence stays uncertain.
    if (task.claimedAt === undefined ? claims.length !== 0 : claims.length !== 1) return false;
    validateOutreachRelations({ outreach: [task] }, { messages, externalAttempts: claims });
    return true;
  } catch { return false; }
}

class FanFollowupStore {
  constructor({ dataDir, fans, getHistory, now = Date.now }) {
    if (typeof dataDir !== 'string' || !path.isAbsolute(dataDir) || !fans || typeof fans.validateSource !== 'function' || typeof fans.getRecipients !== 'function' || typeof getHistory !== 'function' || typeof now !== 'function') throw new Error('粉丝联系标记存储设置不正确。');
    const stat = fs.lstatSync(dataDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('联系标记数据路径必须是普通文件夹。');
    Object.assign(this, { dataDir, fans, getHistory, now, filePath: path.join(dataDir, 'fan-followup.json'), base: { dev: stat.dev, ino: stat.ino } });
    this.previews = new Map();
    this.load();
  }
  assertPath() {
    const stat = fs.lstatSync(this.dataDir);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== this.base.dev || stat.ino !== this.base.ino) throw new Error('联系标记数据路径已变化，请重新打开工作台。');
  }
  load() {
    this.assertPath();
    const value = read(this.filePath, true);
    return value === null && !fs.existsSync(this.filePath) ? { schemaVersion: 1, records: [] } : validate(value);
  }
  date() {
    const value = this.now();
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isFinite(new Date(value).getTime())) throw new Error('联系标记时钟不正确。');
    return new Date(value).toISOString();
  }
  snapshot(options = {}) { return this.project(this.load(), this.getHistory(), options); }
  project(state, history, { excludeTaskId, excludeTaskIds = [] } = {}) {
    if (!object(history)) throw new Error('本地发送历史不可读取，请保留记录后重试。');
    const tasks = historyArray(history.studio, 'outreach'), accounts = historyArray(history.studio, 'accounts');
    const messages = historyArray(history.interaction, 'messages'), replies = historyArray(history.interaction, 'replies');
    const attempts = historyArray(history.interaction, 'externalAttempts');
    // Internal caller validates the parent-child link before excluding its exact
    // parent. Other tasks, interaction replies and manual marks remain evidence.
    if (!Array.isArray(excludeTaskIds) || excludeTaskIds.some(id => typeof id !== 'string' || !UUID.test(id))) throw new Error('待核对的原任务编号不正确。');
    const excluded = new Set([excludeTaskId, ...excludeTaskIds]);
    const groups = new Map(), accountNames = new Map(), messageMap = new Map(), duplicateMessages = new Set();
    // Preserve duplicate/conflicting records for validation while avoiding a
    // full history scan for every task. No absent evidence is inferred as sent.
    const taskCounts = new Map(), attemptsById = new Map();
    for (const task of tasks) { const id = task?.id; if (id !== id) continue; taskCounts.set(id, (taskCounts.get(id) || 0) + 1); }
    for (const attempt of attempts) { const id = attempt?.id; if (id !== id) continue; if (!attemptsById.has(id)) attemptsById.set(id, []); attemptsById.get(id).push(attempt); }
    const coverage = { scope: 'local-records-only', matchedHistoryRecords: 0, unmatchedHistoryRecords: 0, ignoredUnattemptedRecords: 0,
      detail: '仅合并人工标记和能以抖音规范主页精确对应的本地私信、关注欢迎、评论转私信及协作私信记录；未标记不代表从未联系。无可靠主页的历史不猜测匹配，公开评论回复不计作私信。' };
    for (const account of accounts) {
      if (object(account) && account.platform === 'douyin' && typeof account.id === 'string' && UUID.test(account.id)) {
        try { accountNames.set(account.id, text(account.name, 200)); } catch { /* historical name optional */ }
      }
    }
    for (const message of messages) if (object(message) && typeof message.id === 'string') {
      if (messageMap.has(message.id)) duplicateMessages.add(message.id);
      messageMap.set(message.id, message);
    }
    const add = entry => { if (!groups.has(entry.fanId)) groups.set(entry.fanId, []); groups.get(entry.fanId).push(entry); };
    for (const entry of state.records) add({ fanId: entry.fanId, status: entry.status, label: entry.status === 'excluded' ? '已排除' : '人工标记已发送', source: 'manual-mark', accountId: entry.accountId, accountName: entry.accountName, at: entry.markedAt });
    const historyEntry = (entry, family, id, attempted) => {
      if (!id || typeof entry.accountId !== 'string' || !UUID.test(entry.accountId)) { coverage.unmatchedHistoryRecords++; return; }
      const evidence = evidenceStatus(entry, family, attempted);
      if (!evidence) { coverage.ignoredUnattemptedRecords++; return; }
      const at = safeAt(entry), accountName = accountNames.get(entry.accountId);
      add({ fanId: id, ...evidence, accountId: entry.accountId, ...(accountName ? { accountName } : {}), ...(at ? { at } : {}) });
      coverage.matchedHistoryRecords++;
    };
    for (const task of tasks) {
      if (!object(task) || excluded.has(task.id) || task.platform !== 'douyin' || task.channel !== 'dm') continue;
      const source = !duplicateMessages.has(task.sourceMessageId) ? messageMap.get(task.sourceMessageId) : null;
      const sourceValid = source && source.platform === 'douyin' && source.accountId === task.primaryAccountId && source.channel === task.sourceChannel && source.senderId === task.recipientId && !source.isOwn && !source.isGroup;
      const direct = profileId(task.profileUrl), fromSource = sourceValid ? profileId(source.profileUrl) : null;
      // A present malformed or conflicting target URL never falls back to another field.
      const id = task.profileUrl !== undefined ? direct && (!fromSource || fromSource === direct) ? direct : null : fromSource;
      const attempted = task.claimedAt !== undefined || (attemptsById.get(task.id) || []).some(attempt => object(attempt) && attempt.id === task.id && attempt.platform === 'douyin' && attempt.channel === 'dm' && attempt.accountId === task.accountId && attempt.primaryAccountId === task.primaryAccountId && attempt.sourceMessageId === task.sourceMessageId && attempt.recipientId === task.recipientId && attempt.claimedAt !== undefined);
      historyEntry(task, 'outreach', id, attempted && !confirmedUnsentParent(task, taskCounts, attemptsById, messages));
    }
    for (const reply of replies) {
      if (!object(reply)) continue;
      const commentPrivate = reply.channel === 'comment' && reply.deliveryChannel === 'dm';
      if (!['dm', 'follow'].includes(reply.channel) && !commentPrivate) continue;
      const message = !duplicateMessages.has(reply.messageId) ? messageMap.get(reply.messageId) : null;
      const id = message && message.platform === 'douyin' && message.accountId === reply.accountId && message.channel === reply.channel && !message.isOwn && !message.isGroup ? profileId(message.profileUrl) : null;
      historyEntry(reply, 'interaction', id, reply.claimedAt !== undefined || reply.claimId !== undefined);
    }
    const records = [...groups].map(([id, entries]) => {
      const manual = entries.find(entry => entry.source === 'manual-mark');
      entries.sort((a, b) => RANK[b.status] - RANK[a.status] || (b.at || '').localeCompare(a.at || '') || a.source.localeCompare(b.source));
      return { ...entries[0], fanId: id, hasManualMark: Boolean(manual), ...(manual ? { manualStatus: manual.status } : {}), sources: [...new Set(entries.map(entry => entry.source))].sort() };
    }).sort((a, b) => a.fanId.localeCompare(b.fanId));
    return clone({ records, coverage });
  }
  selection(input, withToken = false) {
    fields(input, ['primaryAccountId', 'accountId', 'fanIds', 'status', ...(withToken ? ['previewToken'] : [])]);
    const primaryAccountId = accountId(input.primaryAccountId), selectedAccountId = accountId(input.accountId);
    if (!['manual-sent', 'excluded', 'unmarked'].includes(input.status) || !Array.isArray(input.fanIds) || !input.fanIds.length || input.fanIds.length > 1000) throw new Error('每次可标记 1 至 1000 位粉丝，状态必须有效。');
    const ids = input.fanIds.map(fanId);
    if (new Set(ids).size !== ids.length) throw new Error('本次粉丝编号不能重复。');
    return { primaryAccountId, accountId: selectedAccountId, fanIds: ids, status: input.status };
  }
  verifySource(selection) {
    const result = this.fans.validateSource({ primaryAccountId: selection.primaryAccountId, readerAccountId: selection.accountId });
    if (result.primary.id !== selection.primaryAccountId || result.reader.id !== selection.accountId) throw new Error('联系标记的固定账号不一致。');
    return { primaryBinding: binding(result.primaryBinding), senderBinding: binding(result.readerBinding), accountName: text(result.reader.name, 200), primaryAccountName: text(result.primary.name, 200) };
  }
  verifyRecipients(selection) {
    const results = this.fans.getRecipients({ primaryAccountId: selection.primaryAccountId, accountId: selection.accountId, fanIds: selection.fanIds });
    if (!Array.isArray(results) || results.length !== selection.fanIds.length) throw new Error('已核验目录返回的粉丝数量不一致，整批未保存。');
    return results.map((result, index) => {
      const id = selection.fanIds[index];
      if (!object(result) || !object(result.account) || !object(result.fan) || result.account.id !== selection.accountId || result.account.platform !== 'douyin' || result.fan.id !== id || profileId(result.fan.profileUrl) !== id) throw new Error('粉丝或固定账号与已核验目录不一致，整批未保存。');
      return { fanId: id, name: text(result.fan.name, 500), profileUrl: result.fan.profileUrl };
    });
  }
  assertEligible(selection, snapshot) {
    if (selection.status === 'unmarked') return;
    const selected = new Set(selection.fanIds);
    if (snapshot.records.some(entry => selected.has(entry.fanId))) throw new Error('所选粉丝已有联系标记或待处理记录，请刷新并核对；整批未保存。');
  }
  manualTargets(state, ids) {
    const records = new Map(state.records.map(entry => [entry.fanId, entry]));
    return ids.map(id => records.get(id) || null);
  }
  assertFrozen(selection, fixed, recipients) {
    const currentRecipients = this.verifyRecipients(selection), current = this.verifySource(selection);
    if (!sameBinding(current.primaryBinding, fixed.primaryBinding) || !sameBinding(current.senderBinding, fixed.senderBinding) || current.accountName !== fixed.accountName || current.primaryAccountName !== fixed.primaryAccountName) throw new Error('账号身份或名称已变化，请重新预览联系标记。');
    if (JSON.stringify(currentRecipients) !== JSON.stringify(recipients)) throw new Error('粉丝名单或昵称已变化，请重新预览联系标记。');
  }
  preview(input) {
    const selection = this.selection(input), fixed = this.verifySource(selection), recipients = this.verifyRecipients(selection);
    const createdAt = this.date(), createdMs = Date.parse(createdAt);
    const state = this.load();
    this.assertEligible(selection, this.project(state, this.getHistory()));
    this.assertFrozen(selection, fixed, recipients);
    for (const [token, entry] of this.previews) if (createdMs >= entry.expiresMs || createdMs < entry.createdMs) this.previews.delete(token);
    if (this.previews.size >= MAX_PREVIEWS) throw new Error('待确认标记过多，请稍后重新预览。');
    const token = randomBytes(32).toString('hex'), expiresMs = createdMs + PREVIEW_TTL_MS;
    if (!Number.isFinite(new Date(expiresMs).getTime())) throw new Error('联系标记预览时间不正确。');
    this.previews.set(token, { selection, fixed, recipients, createdMs, expiresMs, inUse: false,
      ...(selection.status === 'unmarked' ? { manualTargets: clone(this.manualTargets(state, selection.fanIds)) } : {}) });
    return clone({ token, ...selection, accountName: fixed.accountName, primaryAccountName: fixed.primaryAccountName, recipients, createdAt, expiresAt: new Date(expiresMs).toISOString() });
  }
  mark(input) {
    const selection = this.selection(input, true);
    const token = input.previewToken, entry = typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) ? this.previews.get(token) : null;
    if (!entry) throw new Error('请先预览并确认本次联系标记。');
    const markedAt = this.date(), markedMs = Date.parse(markedAt);
    if (markedMs < entry.createdMs || markedMs >= entry.expiresMs) { this.previews.delete(token); throw new Error('联系标记预览已过期，请重新核对。'); }
    if (entry.inUse || JSON.stringify(selection) !== JSON.stringify(entry.selection)) throw new Error('确认内容与预览不一致或正在保存，请重新核对。');
    entry.inUse = true;
    try {
      this.assertFrozen(selection, entry.fixed, entry.recipients);
      const state = this.load();
      if (selection.status === 'unmarked' && JSON.stringify(this.manualTargets(state, selection.fanIds)) !== JSON.stringify(entry.manualTargets)) throw new Error('待撤销的人工标记已变化，请重新预览；整批未保存。');
      if (state.records.some(record => record.markedAt > markedAt)) throw new Error('系统时间早于已有联系标记，未覆盖记录。');
      const history = this.getHistory();
      this.assertEligible(selection, this.project(state, history));
      const next = new Map(state.records.map(record => [record.fanId, record]));
      for (const id of selection.fanIds) {
        if (selection.status === 'unmarked') next.delete(id);
        else next.set(id, { platform: 'douyin', fanId: id, status: selection.status,
          accountId: selection.accountId, accountName: entry.fixed.accountName, senderBinding: entry.fixed.senderBinding,
          primaryAccountId: selection.primaryAccountId, primaryBinding: entry.fixed.primaryBinding, markedAt });
      }
      const clean = validate({ schemaVersion: 1, records: [...next.values()] });
      const projected = this.project(clean, history);
      this.assertFrozen(selection, entry.fixed, entry.recipients);
      this.assertPath(); write(this.filePath, clean);
      this.previews.delete(token);
      return { ...projected, updatedCount: selection.fanIds.length };
    } finally {
      entry.inUse = false;
    }
  }
}

module.exports = { FanFollowupStore };
