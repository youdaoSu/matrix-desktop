'use strict';

// Original local workflow. This module neither opens a platform nor sends a
// message. A platform adapter must independently verify the fixed sender,
// recipient, source comment and delivery receipt before recording success.
const { randomUUID, createHash } = require('node:crypto');
const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_OUTREACH = new Set(['review', 'sending', 'unknown']);
const LEGACY_IMMUTABLE_OUTREACH = ['id', 'primaryAccountId', 'accountId', 'platform', 'sourceMessageId', 'sourceExternalId', 'sourceChannel', 'recipientId', 'recipientName', 'profileUrl', 'channel', 'replyText', 'workUrl', 'primaryBinding', 'senderBinding', 'createdAt'];
const LEGACY_DIRECTORY_FIELDS = ['sourceKind', 'sourceFanId', 'sourceFanObservedAt', 'sourceOwnerProfileUrl'];
const DIRECTORY_FIELDS = [...LEGACY_DIRECTORY_FIELDS,'nativeDirectoryProof'];
const DIRECTORY_IMMUTABLE = [...LEGACY_IMMUTABLE_OUTREACH, ...DIRECTORY_FIELDS];
const FOLLOWUP_FIELDS = ['origin', 'followupOf', 'followupSourceDigest', 'followupFailure'];
const IMMUTABLE_OUTREACH = [...DIRECTORY_IMMUTABLE, ...FOLLOWUP_FIELDS];
const clone = value => structuredClone(value);
function record(value, label = '协作任务') { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}格式不正确。`); return value; }
function id(value) { if (typeof value !== 'string' || !RECORD_ID.test(value)) throw new Error('协作记录编号不正确。'); return value; }
function text(value, label, max, required = false) { if (typeof value !== 'string' || value.includes('\0') || value.length > max || (required && !value.trim())) throw new Error(`${label}格式不正确。`); return value; }
function opaque(value, label) { text(value, label, 1000, true); if (/[\x00-\x1f\x7f]/.test(value)) throw new Error(`${label}包含无效字符。`); return value; }
function oneOf(value, values, label) { if (!values.includes(value)) throw new Error(`${label}不正确。`); return value; }
function iso(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== value.slice(0, 10)) throw new Error('协作任务时间不正确。'); return new Date(value).toISOString(); }
function binding(value, platform) {
  record(value, '登录身份');
  if (value.platform !== platform) throw new Error('登录身份与任务平台不一致。');
  return { platform, identity: opaque(value.identity, '登录身份'), establishedAt: iso(value.establishedAt) };
}
function proof(value, required = false) {
  if (value === undefined) { if (required) throw new Error('发送成功必须提供发送凭据。'); return undefined; }
  if (typeof value === 'string') return text(value, '发送凭据', 16000, true);
  record(value, '发送凭据');
  if (!Object.keys(value).length) throw new Error('发送凭据不能为空。');
  const inspect = (item, depth = 0) => {
    if (depth > 8) throw new Error('发送凭据嵌套过深。');
    if (item === null || ['string', 'boolean'].includes(typeof item) || (typeof item === 'number' && Number.isFinite(item))) return;
    if (!item || typeof item !== 'object' || Object.hasOwn(item, 'toJSON')) throw new Error('发送凭据只能包含 JSON 数据。');
    const proto = Object.getPrototypeOf(item);
    if (Array.isArray(item) ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) throw new Error('发送凭据只能包含普通 JSON 数据。');
    for (const key of Object.keys(item)) { const d = Object.getOwnPropertyDescriptor(item, key); if (d.get || d.set) throw new Error('发送凭据不能包含动态属性。'); inspect(d.value, depth + 1); }
  };
  inspect(value); if (JSON.stringify(value).length > 16000) throw new Error('发送凭据过长。'); return clone(value);
}
function workUrl(platform, value, sourceExternalId) {
  const prefix = platform === 'xiaohongshu' ? /^([0-9a-f]{24}):(.+)$/i : /^(\d+):(.+)$/;
  const source = prefix.exec(sourceExternalId);
  if (!source) throw new Error('原评论缺少可核对的作品与评论编号。');
  const raw = value || (platform === 'xiaohongshu' ? `https://www.xiaohongshu.com/explore/${source[1]}` : `https://www.douyin.com/video/${source[1]}`);
  text(raw, '作品链接', 8000, true);
  let url; try { url = new URL(raw); } catch { throw new Error('请填写官方公开作品链接。'); }
  const expectedHost = platform === 'xiaohongshu' ? 'www.xiaohongshu.com' : 'www.douyin.com';
  const match = (platform === 'xiaohongshu' ? /^\/(?:explore|discovery\/item)\/([0-9a-f]{24})\/?$/i : /^\/video\/(\d+)\/?$/).exec(url.pathname);
  if (url.protocol !== 'https:' || url.hostname !== expectedHost || url.username || url.password || url.port || !match || match[1] !== source[1]) throw new Error('作品链接必须指向原评论所属的同平台公开作品。');
  // Navigation secrets and tracking parameters never enter business records.
  return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
}
function outreachKey(task) { return JSON.stringify([task.platform, task.channel, task.channel === 'dm' ? task.recipientId : task.sourceExternalId]); }
function outreachDigest(task) {
  // Existing durable claims keep their original digest after an upgrade.
  const base = task.sourceKind === 'fan-directory' ? [...LEGACY_IMMUTABLE_OUTREACH,...LEGACY_DIRECTORY_FIELDS,...(task.nativeDirectoryProof!==undefined?['nativeDirectoryProof']:[])] : LEGACY_IMMUTABLE_OUTREACH;
  const fields = task.origin !== undefined ? [...base, ...FOLLOWUP_FIELDS] : base;
  return createHash('sha256').update(JSON.stringify(fields.map(field => task[field]))).digest('hex');
}
function validateProfileUrl(platform, value) {
  text(value, '用户主页', 2048, true);
  let url; try { url = new URL(value); } catch { throw new Error('用户主页链接不正确。'); }
  const match = (platform === 'xiaohongshu' ? /^\/user\/profile\/([0-9a-f]{24})\/?$/i : /^\/user\/([A-Za-z0-9_-]{1,256})\/?$/).exec(url.pathname);
  const host = platform === 'xiaohongshu' ? 'www.xiaohongshu.com' : platform === 'douyin' ? 'www.douyin.com' : null;
  if (!host || url.protocol !== 'https:' || url.hostname !== host || url.port || url.username || url.password || url.search || url.hash || !match || (platform === 'douyin' && /^\d+$/.test(match[1]))) throw new Error('用户主页必须是已验证的同平台官方 HTTPS 个人主页，不能使用抖音数字 UID 拼接。');
  return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
}
function fanId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(value) || /^\d+$/.test(value) || /^self$/i.test(value)) throw new Error('粉丝来源必须使用已核验的 secUID。');
  return value;
}
function validateDirectorySource(input) {
  record(input, '粉丝目录来源');
  if (input.sourceKind !== 'fan-directory' || input.platform !== 'douyin' || input.channel !== 'dm' || input.sourceChannel !== 'follow' || Object.hasOwn(input, 'sourceMessageId')) throw new Error('粉丝目录来源仅支持抖音私信，不能伪造收到的消息记录。');
  const sourceFanId = fanId(input.sourceFanId), profileUrl = validateProfileUrl('douyin', input.profileUrl), sourceOwnerProfileUrl = validateProfileUrl('douyin', input.sourceOwnerProfileUrl);
  if (input.recipientId !== sourceFanId || input.sourceExternalId !== sourceFanId || profileUrl !== `https://www.douyin.com/user/${sourceFanId}` || /^self$/i.test(new URL(sourceOwnerProfileUrl).pathname.split('/').at(-1)) || sourceOwnerProfileUrl === profileUrl) throw new Error('粉丝目录来源、接收人或主账号主页不一致。');
  let nativeDirectoryProof;
  if(input.nativeDirectoryProof!==undefined){const p=record(input.nativeDirectoryProof,'原生目录归属凭据');if(p.kind!=='native-cache-v1'||typeof p.scopeHash!=='string'||!/^[a-f0-9]{64}$/.test(p.scopeHash)||Object.keys(p).some(k=>!['kind','scopeHash','verifiedAt'].includes(k)))throw new Error('原生目录归属凭据格式不正确。');nativeDirectoryProof={kind:p.kind,scopeHash:p.scopeHash,verifiedAt:iso(p.verifiedAt)};}
  return { sourceKind: 'fan-directory', sourceFanId, sourceExternalId: sourceFanId, sourceChannel: 'follow', sourceFanObservedAt: iso(input.sourceFanObservedAt), sourceOwnerProfileUrl, profileUrl,...(nativeDirectoryProof?{nativeDirectoryProof}:{}) };
}
function sameTarget(left, right) {
  return outreachKey(left) === outreachKey(right) || (left.platform === right.platform && left.channel === 'dm' && right.channel === 'dm' && Boolean(left.profileUrl) && left.profileUrl === right.profileUrl);
}
function validateOutreachFailure(input) {
  record(input, '发送失败记录');
  const failure = { outcome: oneOf(input.outcome, ['not-sent', 'unknown'], '发送结果'), scope: oneOf(input.scope, ['task', 'account', 'batch'], '失败范围'), code: text(input.code, '失败代码', 100, true), detail: text(input.detail, '失败说明', 4000, true), stage: oneOf(input.stage, ['preflight', 'fill', 'commit', 'receipt'], '失败阶段'), recordedAt: iso(input.recordedAt) };
  if (input.evidence !== undefined) failure.evidence = proof(input.evidence, true);
  const manual = failure.code === 'manually-confirmed-not-sent';
  if (manual && (failure.outcome !== 'not-sent' || failure.scope !== 'task' || failure.stage !== 'receipt' || typeof failure.evidence !== 'string' || !failure.evidence.startsWith('manual-not-sent:') || !RECORD_ID.test(failure.evidence.slice('manual-not-sent:'.length)))) throw new Error('人工核对未发送的凭据格式不正确。');
  if (failure.outcome === 'not-sent' && ['commit', 'receipt'].includes(failure.stage) && !manual && !(typeof failure.evidence === 'string' && /^platform-rejection:\S+$/.test(failure.evidence))) throw new Error('提交后的明确未发送结果必须有平台拒绝凭据。');
  return failure;
}
function ownFanOrigin(input) {
  if(input.origin!=='own-fan'||input.platform!=='douyin'||input.channel!=='dm'||input.sourceKind!=='fan-directory'||input.accountId!==input.primaryAccountId||['followupOf','followupSourceDigest','followupFailure'].some(k=>Object.hasOwn(input,k)))throw Error('本人粉丝任务的账号或来源无效');
  return {origin:'own-fan'};
}
function validateFollowupOrigin(input) {
  if(input.origin==='own-fan')return ownFanOrigin(input);
  if (input.origin !== 'primary-followup' || input.channel !== 'dm' || input.accountId !== input.primaryAccountId) throw new Error('主账号补发任务的来源或发送账号不正确。');
  const followupOf = id(input.followupOf), followupSourceDigest = text(input.followupSourceDigest, '原任务校验值', 64, true), followupFailure = validateOutreachFailure(input.followupFailure);
  if (followupOf === input.id || !/^[a-f0-9]{64}$/.test(followupSourceDigest) || followupFailure.outcome !== 'not-sent') throw new Error('主账号补发必须关联明确未发送的原任务。');
  return { origin: 'primary-followup', followupOf, followupSourceDigest, followupFailure };
}
function validatePrimaryFollowup(input, sourceInput) {
  const task = validateOutreachTask(input), source = validateOutreachTask(sourceInput);
  if (task.origin !== 'primary-followup' || source.origin !== undefined || source.id !== task.followupOf || source.status !== 'failed' || source.failure?.outcome !== 'not-sent' || source.accountId === source.primaryAccountId || task.followupSourceDigest !== outreachDigest(source) || JSON.stringify(task.followupFailure) !== JSON.stringify(source.failure)) throw new Error('主账号补发的原任务或明确未发送证据已变化。');
  const fixed = ['primaryAccountId', 'platform', 'channel', 'sourceMessageId', 'sourceExternalId', 'sourceChannel', 'recipientId', 'recipientName', 'profileUrl', 'replyText', 'workUrl', 'primaryBinding', ...DIRECTORY_FIELDS];
  if (fixed.some(field => JSON.stringify(task[field]) !== JSON.stringify(source[field])) || task.createdAt < source.failure.recordedAt) throw new Error('主账号补发不能更换原任务的目标、来源、账号身份或文案。');
  return true;
}
function validateOutreachTask(input) {
  record(input);
  const platform = oneOf(input.platform, ['xiaohongshu', 'douyin'], '任务平台');
  const channel = oneOf(input.channel, ['dm', 'comment'], '任务渠道');
  if (input.sourceKind !== undefined && input.sourceKind !== 'fan-directory') throw new Error('协作任务来源类型不正确。');
  const directory = input.sourceKind === 'fan-directory';
  if (!directory && DIRECTORY_FIELDS.some(field => Object.hasOwn(input, field))) throw new Error('消息来源不能混入粉丝目录字段。');
  const source = directory ? validateDirectorySource(input) : { sourceMessageId: id(input.sourceMessageId), sourceExternalId: opaque(input.sourceExternalId, '来源平台编号'), sourceChannel: oneOf(input.sourceChannel, ['dm', 'comment', 'follow'], '来源渠道') };
  const task = {
    id: id(input.id), primaryAccountId: id(input.primaryAccountId), accountId: id(input.accountId), platform,
    ...source,
    recipientId: opaque(input.recipientId, '接收人编号'), recipientName: text(input.recipientName, '接收人名称', 200), channel,
    replyText: text(input.replyText, '协作内容', 5000, true), workUrl: channel === 'comment' ? workUrl(platform, input.workUrl, input.sourceExternalId) : null,
    primaryBinding: binding(input.primaryBinding, platform), senderBinding: binding(input.senderBinding, platform),
    status: oneOf(input.status, ['review', 'sending', 'sent', 'unknown', 'failed', 'cancelled'], '协作任务状态'), createdAt: iso(input.createdAt), updatedAt: iso(input.updatedAt),
  };
  if (input.origin !== undefined) Object.assign(task, validateFollowupOrigin(input));
  else if (FOLLOWUP_FIELDS.some(field => Object.hasOwn(input, field))) throw new Error('普通任务不能混入主账号补发字段。');
  if (input.failure !== undefined) task.failure = validateOutreachFailure(input.failure);
  if (input.priorFailure !== undefined) task.priorFailure = validateOutreachFailure(input.priorFailure);
  if (input.preflightHistory !== undefined) {
    if (!Array.isArray(input.preflightHistory) || input.preflightHistory.length > 1000) throw new Error('发送前恢复历史格式不正确。');
    let previousAt = task.createdAt;
    task.preflightHistory = input.preflightHistory.map(entry => {
      record(entry, '发送前恢复记录');
      const failure = validateOutreachFailure(entry.failure), restoredAt = iso(entry.restoredAt);
      if (failure.outcome !== 'not-sent' || failure.stage !== 'preflight' || failure.recordedAt < previousAt || restoredAt < failure.recordedAt || restoredAt > task.updatedAt || (input.claimedAt !== undefined && restoredAt > iso(input.claimedAt))) throw new Error('发送前恢复记录缺少明确未提交证据或时间顺序不正确。');
      previousAt = restoredAt;
      return { failure, restoredAt };
    });
  }
  if(directory){const native=task.nativeDirectoryProof;if(task.sourceFanObservedAt>task.createdAt||native&&(native.verifiedAt<task.primaryBinding.establishedAt||native.verifiedAt>task.createdAt||task.sourceFanObservedAt>native.verifiedAt)||!native&&task.sourceFanObservedAt<task.primaryBinding.establishedAt)throw new Error('粉丝来源观察时间或原生目录归属核验时间与绑定、任务创建不一致。');}
  if (['primary-followup','own-fan'].includes(task.origin)) {
    if (JSON.stringify(task.primaryBinding) !== JSON.stringify(task.senderBinding)) throw new Error('主账号补发必须使用原主账号的同一登录绑定。');
  } else if (task.primaryAccountId === task.accountId || task.primaryBinding.identity === task.senderBinding.identity) throw new Error('主账号与发送账号必须是不同的已验证平台身份。');
  if (channel === 'comment' && task.sourceChannel !== 'comment') throw new Error('评论任务必须关联真实的原评论。');
  if (input.profileUrl !== undefined) {
    task.profileUrl = validateProfileUrl(platform, input.profileUrl);
    if (platform === 'xiaohongshu' && new URL(task.profileUrl).pathname.split('/').at(-1) !== task.recipientId) throw new Error('协作任务的用户主页与接收人编号不一致。');
  }
  if (input.claimedAt !== undefined) task.claimedAt = iso(input.claimedAt);
  if (['sending', 'sent', 'unknown', 'failed'].includes(task.status) && !task.claimedAt && !(task.status === 'failed' && task.failure?.outcome === 'not-sent' && task.failure.stage === 'preflight')) throw new Error('协作任务缺少发送领取记录。');
  if (task.failure && ((task.failure.outcome === 'unknown' ? task.status !== 'unknown' : task.status !== 'failed') || task.failure.recordedAt < task.createdAt || (task.claimedAt && task.failure.recordedAt < task.claimedAt))) throw new Error('发送失败证据与任务状态或时间不一致。');
  if (['review', 'cancelled'].includes(task.status) && task.claimedAt) throw new Error('已尝试的协作任务不能返回待确认或取消状态。');
  if (input.reason !== undefined) task.reason = text(input.reason, '任务说明', 4000);
  const receipt = proof(input.receipt, task.status === 'sent'); if (receipt !== undefined) task.receipt = receipt;
  if (input.resolvedAt !== undefined) task.resolvedAt = iso(input.resolvedAt);
  if (task.failure?.code === 'manually-confirmed-not-sent' && (task.failure.evidence !== `manual-not-sent:${task.id}` || task.resolvedAt !== task.failure.recordedAt)) throw new Error('人工核对未发送必须保留对应任务和确认时间。');
  return task;
}
function validateOutreachRelations(studio, interactionData, fanData) {
  record(studio, '工作台数据'); record(interactionData, '互动数据');
  const tasks = studio.outreach || [], messages = interactionData.messages || [], attempts = interactionData.externalAttempts || [];
  if (!Array.isArray(tasks) || !Array.isArray(messages) || !Array.isArray(attempts)) throw new Error('协作任务跨文件数据格式不正确。');
  const taskMap = new Map(), attemptMap = new Map(), targetKeys = new Map();
  // Preserve the original first-match behavior; never let a later duplicate
  // replace the source identity already selected by the old Array.find path.
  const sourceMap = new Map();
  for (const message of messages) if (!sourceMap.has(message.id)) sourceMap.set(message.id, message);
  for (const input of tasks) {
    const task = validateOutreachTask(input);
    if (taskMap.has(task.id)) throw new Error('协作任务编号重复。'); taskMap.set(task.id, task);
    if (task.sourceKind === 'fan-directory') {
      // Completed history retains its frozen provenance if a later account
      // rebind replaces the directory; active tasks still require that source.
      if (fanData !== undefined && ACTIVE_OUTREACH.has(task.status)) {
        if (!Array.isArray(fanData?.lists)) throw new Error('粉丝目录跨文件数据格式不正确。');
        const list = fanData.lists.find(item => item.primaryAccountId === task.primaryAccountId), fan = list?.items?.find(item => item.id === task.sourceFanId);
        if (!list || list.platform !== task.platform || list.source !== 'visible-followers' || list.ownerIdentity !== task.primaryBinding.identity || JSON.stringify(list.primaryBinding) !== JSON.stringify(task.primaryBinding) || list.ownerProfileUrl !== task.sourceOwnerProfileUrl || !fan || fan.profileUrl !== task.profileUrl || fan.firstSeenAt !== task.sourceFanObservedAt) throw new Error('协作任务与已核验的粉丝目录来源不一致。');
      }
    } else {
      const source = sourceMap.get(task.sourceMessageId);
      if (!source || source.accountId !== task.primaryAccountId || source.platform !== task.platform || source.senderId !== task.recipientId || source.externalId !== task.sourceExternalId || source.channel !== task.sourceChannel || source.isOwn || source.isGroup || (task.profileUrl !== undefined && source.profileUrl !== task.profileUrl)) throw new Error('协作任务与真实来源记录不一致。');
      if (Date.parse(source.createdAt) < Date.parse(task.primaryBinding.establishedAt)) throw new Error('协作来源记录早于冻结的主账号登录身份。');
    }
    if (ACTIVE_OUTREACH.has(task.status)) {
      const primary = studio.accounts?.find(account => account.id === task.primaryAccountId), sender = studio.accounts?.find(account => account.id === task.accountId);
      if (!primary || !sender || primary.role !== 'primary' || (['primary-followup','own-fan'].includes(task.origin) ? sender.id !== primary.id : sender.role !== 'member' || sender.primaryAccountId !== primary.id) || primary.platform !== task.platform || sender.platform !== task.platform) throw new Error('活跃协作任务与主账号、发送账号的关系不一致。');
    }
  }
  const followed = new Set();
  for (const task of taskMap.values()) if (task.origin === 'primary-followup') {
    if (followed.has(task.followupOf)) throw new Error('同一原任务不能建立多次主账号补发。');
    followed.add(task.followupOf); validatePrimaryFollowup(task, taskMap.get(task.followupOf));
  }
  for (const attempt of attempts) {
    record(attempt, '协作发送账本');
    const task = taskMap.get(id(attempt.id)), key = outreachKey(attempt);
    if (!task || attemptMap.has(attempt.id)) throw new Error('共享发送账本存在缺失或重复的协作任务。');
    const prior = targetKeys.get(key);
    if (prior && !((task.origin === 'primary-followup' && task.followupOf === prior.id && validatePrimaryFollowup(task, prior)) || (prior.origin === 'primary-followup' && prior.followupOf === task.id && validatePrimaryFollowup(prior, task)))) throw new Error('共享发送账本存在重复的协作目标。');
    const sourceFields = task.sourceKind === 'fan-directory' ? [...DIRECTORY_FIELDS, 'sourceChannel', 'profileUrl'] : [];
    if (['accountId', 'primaryAccountId', 'platform', 'channel', 'sourceMessageId', 'sourceExternalId', 'recipientId', ...sourceFields].some(field => JSON.stringify(task[field]) !== JSON.stringify(attempt[field])) || attempt.taskDigest !== outreachDigest(task) || (attempt.targetKey !== undefined && attempt.targetKey !== key)) throw new Error('共享发送账本与协作任务的固定来源、目标或内容不一致。');
    const pendingResolution = ['unknown', 'failed'].includes(task.status) && attempt.failure?.code === 'manually-confirmed-not-sent' && attempt.failure.evidence === `manual-not-sent:${task.id}` && JSON.stringify(task.failure) === JSON.stringify(attempt.priorFailure);
    if (FOLLOWUP_FIELDS.some(field => JSON.stringify(task[field]) !== JSON.stringify(attempt[field])) || (task.failure !== undefined && JSON.stringify(task.failure) !== JSON.stringify(attempt.failure) && !pendingResolution) || (task.priorFailure !== undefined && JSON.stringify(task.priorFailure) !== JSON.stringify(attempt.priorFailure))) throw new Error('共享发送账本与任务的失败证据或补发来源不一致。');
    const claimedAt = iso(attempt.claimedAt);
    if (task.status === 'cancelled' || (task.claimedAt !== undefined && task.claimedAt !== claimedAt)) throw new Error('协作任务与共享发送账本的领取状态或时间不一致。');
    attemptMap.set(attempt.id, attempt); targetKeys.set(key, task);
  }
  for (const task of taskMap.values()) if (task.claimedAt && !attemptMap.has(task.id)) throw new Error('协作任务的共享发送账本缺失，请保留数据并恢复完整备份。');
  return true;
}

class OutreachStore {
  constructor({ studio, interactions, fans = null, getFollowup = null, getBinding = () => null, now = Date.now }) {
    if (!studio || !interactions || typeof getBinding !== 'function' || typeof now !== 'function' || (getFollowup !== null && typeof getFollowup !== 'function')) throw new Error('协作任务存储设置不正确。');
    Object.assign(this, { studio, interactions, fans, getFollowup, getBinding, now });
    this.recover();
  }
  date() { const value = this.now(); if (!Number.isFinite(value)) throw new Error('协作任务时钟不正确。'); return new Date(value).toISOString(); }
  recover() {
    const state = this.studio.snapshot();
    validateOutreachRelations(state, { ...this.interactions.snapshot(), externalAttempts: this.interactions.getExternalAttempts() });
    const updates = new Map();
    for (const task of state.outreach || []) {
      const attempt = this.interactions.getExternalAttempt(task.id);
      if (task.claimedAt && !attempt) throw new Error('协作任务的共享发送账本缺失，请保留数据并恢复完整备份。');
      if (attempt?.failure?.code === 'manually-confirmed-not-sent' && ['unknown', 'failed'].includes(task.status) && JSON.stringify(task.failure) === JSON.stringify(attempt.priorFailure)) updates.set(task.id, { status: 'failed', failure: attempt.failure, ...(attempt.priorFailure ? { priorFailure: attempt.priorFailure } : {}), resolvedAt: attempt.failure.recordedAt, updatedAt: this.date(), reason: attempt.failure.detail });
      else if (attempt && (task.status === 'review' || task.status === 'sending')) updates.set(task.id, { status: 'unknown', claimedAt: attempt.claimedAt, updatedAt: this.date(), reason: '上次领取发送后未记录确定结果，请到平台人工核对；不会自动重试。' });
    }
    if (updates.size) this.studio.mutateOutreach(tasks => { for (const task of tasks) if (updates.has(task.id)) Object.assign(task, updates.get(task.id)); });
  }
  snapshot() { if(typeof this.studio.outreachSnapshot==='function')return this.studio.outreachSnapshot();return clone(this.studio.snapshot().outreach || []); }
  get(taskId) { id(taskId);if(typeof this.studio.outreachTask==='function')return this.studio.outreachTask(taskId); const task = this.snapshot().find(item => item.id === taskId); if (!task) throw new Error('协作任务不存在。'); return task; }
  currentBinding(account) {
    const value = this.getBinding(account.id); if (!value) throw new Error(`账号「${account.name}」需先登录并检查连接，才能创建或发送协作任务。`);
    return binding(value, account.platform);
  }
  directoryRecipients(primaryAccountId, accountId, fanIds) {
    if (!this.fans || typeof this.fans.getRecipients !== 'function' || typeof this.fans.snapshot !== 'function') throw new Error('粉丝目录尚未连接，请重新打开工作台。');
    const results = this.fans.getRecipients({ primaryAccountId, accountId, fanIds });
    const list = this.fans.snapshot().find(item => item.primaryAccountId === primaryAccountId);
    if (!list || list.platform !== 'douyin' || list.source !== 'visible-followers' || list.ownerIdentity !== list.primaryBinding?.identity || !Array.isArray(results) || results.length !== fanIds.length) throw new Error('已核验粉丝目录的归属或数量不一致。');
    return results.map((result, index) => {
      if (result?.account?.id !== accountId || result.account.platform !== 'douyin' || result.fan?.id !== fanIds[index]) throw new Error('粉丝目录返回的固定账号或对象不一致。');
      const source = validateDirectorySource({ sourceKind: 'fan-directory', platform: 'douyin', channel: 'dm', sourceChannel: 'follow', sourceFanId: result.fan.id, sourceExternalId: result.fan.id, recipientId: result.fan.id, profileUrl: result.fan.profileUrl, sourceFanObservedAt: result.fan.firstSeenAt, sourceOwnerProfileUrl: list.ownerProfileUrl,...(list.nativeDirectoryProof?{nativeDirectoryProof:list.nativeDirectoryProof}:{}) });
      return { ...source, recipientId: result.fan.id, recipientName: text(result.fan.name, '粉丝名称', 200, true), primaryBinding: binding(list.primaryBinding, 'douyin') };
    });
  }
  assertDirectoryContactAvailable(task) {
    if (typeof this.getFollowup !== 'function') throw new Error('粉丝联系记录尚未连接，无法核对重复发送。');
    const followup = this.followupOptions(task);
    const history = this.getFollowup({ excludeTaskId: task.id, ...(followup.followupSource ? { excludeTaskIds: [followup.followupSource.id] } : {}) });
    if (!history || !Array.isArray(history.records)) throw new Error('粉丝联系记录无法读取，请刷新后再试。');
    if (history.records.some(entry => entry.fanId === task.sourceFanId)) throw new Error('该粉丝已有联系标记、发送或待处理记录，请先核对，不能重复创建或发送。');
  }
  source(task) {
    if (task.sourceKind === 'fan-directory') {
      const current = this.directoryRecipients(task.primaryAccountId, task.accountId, [task.sourceFanId])[0];
      if (['sourceFanId', 'sourceExternalId', 'sourceFanObservedAt', 'sourceOwnerProfileUrl', 'profileUrl'].some(field => current[field] !== task[field]) || JSON.stringify(current.primaryBinding) !== JSON.stringify(task.primaryBinding)) throw new Error('协作任务的粉丝目录来源或主账号身份已变化，请重新核对。');
      if(task.nativeDirectoryProof&&(!current.nativeDirectoryProof||current.nativeDirectoryProof.scopeHash!==task.nativeDirectoryProof.scopeHash||current.nativeDirectoryProof.verifiedAt<task.nativeDirectoryProof.verifiedAt))throw new Error('原生粉丝目录的绑定范围或最新核验凭据已变化，未发送。');
      this.assertDirectoryContactAvailable(task);
      return current;
    }
    const message = this.interactions.getMessage(task.sourceMessageId);
    if (message.accountId !== task.primaryAccountId || message.platform !== task.platform || message.senderId !== task.recipientId || message.externalId !== task.sourceExternalId || message.channel !== task.sourceChannel || message.isOwn || message.isGroup) throw new Error('协作任务的主账号来源或接收对象已失效。');
    if (Date.parse(message.createdAt) < Date.parse(task.primaryBinding.establishedAt) || message.profileUrl !== task.profileUrl) throw new Error('来源记录早于本次登录绑定或已验证主页发生变化，请重新检查来源。');
    if (task.channel === 'comment' && message.channel !== 'comment') throw new Error('评论任务必须关联真实的原评论。');
    return message;
  }
  recheck(task) {
    const primary = this.studio.getAccount(task.primaryAccountId), sender = this.studio.getAccount(task.accountId);
    if (primary.role !== 'primary' || (['primary-followup','own-fan'].includes(task.origin) ? sender.id !== primary.id : sender.role !== 'member' || sender.primaryAccountId !== primary.id) || primary.platform !== task.platform || sender.platform !== task.platform) throw new Error('主账号与协作账号的关联已变化，不能发送原任务。');
    this.followupOptions(task);
    if (JSON.stringify(this.currentBinding(primary)) !== JSON.stringify(task.primaryBinding) || JSON.stringify(this.currentBinding(sender)) !== JSON.stringify(task.senderBinding)) throw new Error('主账号或发送账号的登录绑定已变化，不能转给其他身份发送。');
    this.source(task);
    if ([task.primaryBinding.identity, task.senderBinding.identity].includes(task.recipientId)) throw new Error('协作任务不能发送给主账号或发送账号自身。');
    return task;
  }
  create(input, {ownFans=false} = {}) {
    record(input);
    const { primaryAccountId, senderAccountIds, messageIds, fanIds, sourceKind, channel, text: replyText, workUrl: selectedWorkUrl } = input;
    const directory = sourceKind === 'fan-directory';
    if (sourceKind !== undefined && !directory) throw new Error('协作任务来源类型不正确。');
    if (directory ? Object.hasOwn(input, 'messageIds') : Object.hasOwn(input, 'fanIds')) throw new Error('粉丝目录与互动记录来源不能混合。');
    const primary = this.studio.getAccount(id(primaryAccountId));
    if (primary.role !== 'primary' || !['xiaohongshu', 'douyin'].includes(primary.platform)) throw new Error('请选择受支持平台的主账号。');
    oneOf(channel, ['dm', 'comment'], '任务渠道'); text(replyText, '协作内容', 5000, true);
    if (directory && (primary.platform !== 'douyin' || channel !== 'dm')) throw new Error('当前粉丝目录只支持抖音私信。');
    const ids = (value, label) => { if (!Array.isArray(value) || !value.length || value.length > 100) throw new Error(`${label}须选择 1 至 100 项。`); value.forEach(id); if (new Set(value).size !== value.length) throw new Error(`${label}不能重复。`); return value; };
    const primaryBinding = this.currentBinding(primary);
    const senders = ids(senderAccountIds, '协作账号').map(accountId => {
      const account = this.studio.getAccount(accountId);
      if ((ownFans ? account.id !== primary.id || !directory || channel!=='dm' || primary.platform!=='douyin' || senderAccountIds.length!==1 : account.role !== 'member' || account.primaryAccountId !== primary.id) || account.platform !== primary.platform) throw new Error('发送账号必须是此主账号的同平台协作账号。');
      return { account, binding: this.currentBinding(account) };
    });
    const identities = new Set(ownFans?[]:[primaryBinding.identity]);
    for (const sender of senders) { if (identities.has(sender.binding.identity)) throw new Error('所选账号重复使用同一个平台登录身份。'); identities.add(sender.binding.identity); }
    let sources;
    if (directory) {
      if (!Array.isArray(fanIds) || fanIds.length < 1 || fanIds.length > 100) throw new Error('目录粉丝须选择 1 至 100 项。');
      fanIds.forEach(fanId);
      if (new Set(fanIds).size !== fanIds.length) throw new Error('目录粉丝不能重复。');
      sources = this.directoryRecipients(primary.id, primary.id, fanIds);
    } else {
      sources = ids(messageIds, '来源记录').map(messageId => this.interactions.getMessage(messageId)).map(message => {
        if (message.accountId !== primary.id || message.platform !== primary.platform || message.isOwn || message.isGroup || (channel === 'comment' && message.channel !== 'comment')) throw new Error('来源必须是该主账号真实收到的非自身、非群聊记录；评论任务必须选择原评论。');
        return { sourceMessageId: message.id, sourceExternalId: message.externalId, sourceChannel: message.channel, recipientId: message.senderId, recipientName: message.senderName, profileUrl: message.profileUrl };
      });
    }
    const seen = new Set(), createdAt = this.date(), created = [];
    const existing = this.snapshot();
    for (const source of sources) {
      const target = { ...source, platform: primary.platform, channel }, key = outreachKey(target);
      if (seen.has(key) || created.some(task => sameTarget(task, target))) continue; seen.add(key);
      if (existing.some(task => sameTarget(task, target) && (task.status !== 'cancelled' || task.claimedAt)) || this.interactions.hasExternalTarget(key)) throw new Error('该目标已有协作任务或发送尝试，不能换账号重复创建；未知结果请先人工核对。');
      const sender = senders[created.length % senders.length];
      const task = validateOutreachTask({ ...source, ...(ownFans?{origin:'own-fan'}:{}), id: randomUUID(), primaryAccountId: primary.id, accountId: sender.account.id, platform: primary.platform, channel, replyText, workUrl: selectedWorkUrl, primaryBinding, senderBinding: sender.binding, status: 'review', createdAt, updatedAt: createdAt });
      this.recheck(task); this.interactions.checkExternalPolicy(task, { limits: false, schedule: false }); created.push(task);
    }
    this.studio.mutateOutreach(tasks => tasks.unshift(...created));
    return clone(created);
  }
  followupOptions(task) {
    if (task.origin !== 'primary-followup') return {};
    const followupSource = this.get(task.followupOf); validatePrimaryFollowup(task, followupSource);
    return { followupSource };
  }
  createPrimaryFollowups({ ids } = {}) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 50 || new Set(ids).size !== ids.length) throw new Error('请选择 1 至 50 条不同的明确未发送任务。');
    const existing = this.snapshot(), createdAt = this.date(), created = ids.map(sourceId => {
      const source = this.get(id(sourceId));
      if (source.origin !== undefined || source.channel !== 'dm' || source.status !== 'failed' || source.failure?.outcome !== 'not-sent') throw new Error('只有协作账号明确未发送的私信任务可以交由主账号补发；结果未知不能重发。');
      if (existing.some(task => task.followupOf === source.id)) throw new Error('该原任务已经建立主账号补发，不能重复创建。');
      if (existing.some(task => task.id !== source.id && sameTarget(task, source) && (task.status !== 'cancelled' || task.claimedAt))) throw new Error('该接收人还有其他发送或待处理记录，请先核对。');
      const { claimedAt, reason, receipt, resolvedAt, failure, priorFailure, preflightHistory, ...base } = source;
      const task = validateOutreachTask({ ...base, id: randomUUID(), origin: 'primary-followup', followupOf: source.id, followupSourceDigest: outreachDigest(source), followupFailure: failure, accountId: source.primaryAccountId, senderBinding: source.primaryBinding, status: 'review', createdAt, updatedAt: createdAt });
      validatePrimaryFollowup(task, source); this.recheck(task);
      this.interactions.checkExternalPolicy(task, { ...this.followupOptions(task), limits: false, schedule: false });
      return task;
    });
    if (created.some((task, index) => created.slice(0, index).some(previous => sameTarget(task, previous)))) throw new Error('所选原任务指向重复接收人，未建立补发。');
    this.studio.mutateOutreach(tasks => tasks.unshift(...created)); return clone(created);
  }
  recordFailure(taskId, input) {
    const task = this.get(taskId);
    if (!['review', 'sending'].includes(task.status)) throw new Error('只有待处理或正在发送的任务可以记录失败。');
    const failure = validateOutreachFailure({ ...record(input, '发送失败记录'), recordedAt: this.date() });
    if (failure.code === 'manually-confirmed-not-sent' || (typeof failure.evidence === 'string' && failure.evidence.startsWith('manual-not-sent:'))) throw new Error('人工核对凭据只能通过明确的核对未发送操作记录。');
    if (task.status === 'review' && (this.interactions.getExternalAttempt(task.id) || failure.outcome !== 'not-sent' || failure.stage !== 'preflight')) throw new Error('尚未领取的任务只能记录明确未发送的检查失败。');
    if (task.claimedAt) this.interactions.recordExternalFailure(task, failure);
    return this.update(task.id, { status: failure.outcome === 'not-sent' ? 'failed' : 'unknown', failure, reason: failure.detail });
  }
  retryPreflight({ ids } = {}) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 50 || new Set(ids).size !== ids.length) throw new Error('请选择 1 至 50 条不同的发送前失败任务。');
    const existing = this.snapshot(), restoredAt = this.date();
    // Recovery restores the original reviewable work, never a submitted send.
    // Validate every item before the single atomic studio mutation.
    const restored = ids.map(taskId => {
      const task = this.get(id(taskId));
      if (task.status !== 'failed' || task.failure?.outcome !== 'not-sent' || task.failure.stage !== 'preflight' || task.claimedAt !== undefined || task.receipt !== undefined || task.resolvedAt !== undefined || this.interactions.getExternalAttempt(task.id)) throw new Error('仅可恢复从未领取或提交发送的预检失败任务；已发送、结果未知和已尝试任务不能重试。');
      if (existing.some(other => other.followupOf === task.id)) throw new Error('该任务已交由主账号处理，不能同时恢复原协作账号任务。');
      if (existing.some(other => other.id !== task.id && other.id !== task.followupOf && sameTarget(other, task) && (other.status !== 'cancelled' || other.claimedAt || this.interactions.getExternalAttempt(other.id)))) throw new Error('该接收人已有其他任务或发送记录，不能恢复重复发送。');
      this.recheck(task);
      const { failure, priorFailure, ...unchanged } = task;
      return validateOutreachTask({ ...unchanged, status: 'review', updatedAt: restoredAt,
        preflightHistory: [...(task.preflightHistory || []), { failure, restoredAt }],
        reason: '已恢复原发送账号的待核对任务；原预检失败记录已保留，重新确认前不会发送。' });
    });
    if (restored.some((task, index) => restored.slice(0, index).some(other => sameTarget(other, task)))) throw new Error('所选任务含重复接收人，不能同时恢复。');
    this.studio.mutateOutreach(tasks => { for (const task of restored) { const index = tasks.findIndex(item => item.id === task.id); tasks[index] = task; } });
    return clone(restored);
  }
  update(taskId, changes) { this.studio.mutateOutreach(tasks => { const task = tasks.find(item => item.id === taskId); if (!task) throw new Error('协作任务不存在。'); Object.assign(task, changes, { updatedAt: this.date() }); }); return this.get(taskId); }
  withCheckSnapshot(action, directory = false) {
    const read = () => directory && this.fans?.withReadSnapshot ? this.fans.withReadSnapshot(action) : action();
    return this.interactions.withReadSnapshot ? this.interactions.withReadSnapshot(read) : read();
  }
  preflight(taskId) {
    const task = this.get(taskId);
    return this.withCheckSnapshot(() => {
      if (task.status !== 'review' || this.interactions.getExternalAttempt(task.id)) throw new Error('此协作任务不是未经尝试的待确认任务，不能再次发送。');
      this.recheck(task); this.interactions.checkExternalPolicy(task, this.followupOptions(task)); return task;
    }, task.sourceKind === 'fan-directory');
  }
  recipientPolicyOptions(task, recipientId) {
    const directory = task.sourceKind === 'fan-directory';
    if (!directory) {
      if (recipientId !== undefined && recipientId !== task.recipientId) throw new Error('实际接收人与已核对任务不一致。');
      recipientId = task.recipientId;
    } else if (typeof recipientId !== 'string' || !/^[1-9]\d{0,63}$/.test(recipientId) || [task.primaryBinding.identity, task.senderBinding.identity].includes(recipientId)) {
      throw new Error('请先从已核验的粉丝主页确认真实私信接收人。');
    }
    if (task.platform === 'douyin' && task.channel === 'dm' && /^[1-9]\d{0,63}$/.test(recipientId)) {
      const attempts = new Map(this.interactions.getExternalAttempts().map(attempt => [attempt.id, attempt]));
      const permittedSource = this.followupOptions(task).followupSource;
      if (this.snapshot().some(previous => previous.id !== task.id && previous.id !== permittedSource?.id && previous.platform === task.platform && previous.channel === 'dm' && (previous.status !== 'cancelled' || previous.claimedAt || attempts.has(previous.id)) && (previous.recipientId === recipientId || attempts.get(previous.id)?.recipientIdAlias === recipientId))) throw new Error('该真实接收人已有协作任务或发送记录，不能更换来源重复发送，请先核对原任务。');
    }
    return { ...this.followupOptions(task), ...(directory ? { recipientIdAlias: recipientId } : {}) };
  }
  assertRecipientPolicy(taskId, recipientId) {
    const task = this.get(taskId);
    return this.withCheckSnapshot(() => {
      const options = this.recipientPolicyOptions(task, recipientId);
      if (!['review', 'sending'].includes(task.status)) throw new Error('当前任务已结束，不能继续核对接收人。');
      this.recheck(task);
      this.interactions.checkExternalPolicy(task, { ...options, claimed: task.status === 'sending' });
      return true;
    }, task.sourceKind === 'fan-directory');
  }
  beginSend(taskId, { recipientId } = {}) {
    const task = this.get(taskId);
    if (task.status !== 'review') throw new Error('只有待确认的协作任务可以开始发送，已尝试任务不能重发。');
    const options = this.recipientPolicyOptions(task, recipientId);
    const previous = this.interactions.getExternalAttempt(task.id);
    if (previous) { this.update(task.id, { status: 'unknown', claimedAt: previous.claimedAt, reason: '已有发送领取记录但结果未确定，请人工核对；不会重试。' }); throw new Error('此任务已有发送尝试，不能重发。'); }
    this.recheck(task);
    // Reserve the shared budget first. If the following studio write fails or
    // the process stops between files, this durable attempt blocks a retry.
    const attempt = this.interactions.claimExternalAttempt(task, options);
    return this.update(task.id, { status: 'sending', claimedAt: attempt.claimedAt, reason: '正在发送，结果不确定时不会重试。' });
  }
  assertCanCommit(taskId, { recipientId } = {}) {
    const task = this.get(taskId); if (task.status !== 'sending') throw new Error('协作任务未领取或已结束，不能提交。');
    const options = this.recipientPolicyOptions(task, recipientId);
    this.recheck(task); this.interactions.assertExternalAttempt(task, options); return true;
  }
  finishSend(taskId, { status, receipt, error = '', failure }) {
    const task = this.get(taskId); if (task.status !== 'sending') throw new Error('只有正在发送的协作任务可以记录结果。');
    oneOf(status, ['sent', 'unknown', 'failed'], '发送结果');
    if (failure !== undefined) {
      if (status !== (failure.outcome === 'not-sent' ? 'failed' : 'unknown')) throw new Error('失败证据与发送结果不一致。');
      return this.recordFailure(taskId, failure);
    }
    const result = { status, reason: status === 'sent' ? '已取得发送凭据。' : status === 'unknown' ? '结果不确定，请到平台人工核对；不会重试。' : '发送失败，此任务不会自动重试。' };
    const receiptValue = proof(receipt, status === 'sent'); if (receiptValue !== undefined) result.receipt = receiptValue;
    if (error) result.reason = text(error, '发送错误', 4000, true);
    return this.update(task.id, result);
  }
  cancel(taskId) {
    const task = this.get(taskId); if (task.status === 'cancelled') return task;
    if (task.status !== 'review' || this.interactions.getExternalAttempt(task.id)) throw new Error('已开始发送或结果未知的任务不能取消，请人工核对。');
    return this.update(task.id, { status: 'cancelled', reason: '已取消，未开始发送。' });
  }
  confirmObserved(taskId,{claimedAt,receipt}){
    const task=this.get(taskId),attempt=this.interactions.getExternalAttempt(taskId);
    if(task.status!=='unknown'||!attempt||attempt.taskDigest!==outreachDigest(task)||task.claimedAt!==claimedAt||attempt.claimedAt!==claimedAt)throw new Error('自动复核与原协作发送记录不一致');
    if(typeof receipt!=='string'||!/^platform:\S+$/.test(receipt))throw new Error('自动复核缺少原平台回执');
    return this.update(taskId,{status:'sent',receipt,resolvedAt:this.date(),failure:undefined,reason:'已自动核对原平台发送回执'});
  }
  cancelAccountUnsent(accountId) {
    this.studio.getAccount(accountId);
    const attempted = new Set(this.interactions.getExternalAttempts().map(attempt => attempt.id));
    const selected = new Set(this.snapshot().filter(task => [task.accountId, task.primaryAccountId].includes(accountId) && task.status === 'review' && !task.claimedAt && !attempted.has(task.id)).map(task => task.id));
    if (selected.size) this.studio.mutateOutreach(tasks => {
      const now = this.date();
      for (const task of tasks) if (selected.has(task.id)) Object.assign(task, { status: 'cancelled', updatedAt: now, reason: '该账号任务已停止，未开始发送的触达任务已取消。' });
    });
    return selected.size;
  }
  resolve(taskId, { sent, receipt }) {
    const task = this.get(taskId); if (!['unknown', 'failed'].includes(task.status) || typeof sent !== 'boolean') throw new Error('请对结果未知或失败的任务明确确认是否已发送。');
    if (!task.claimedAt) throw new Error('未发生发送尝试的失败任务不能标记为已发送，请在主账号补发中重新核对。');
    if (!sent) {
      if (task.failure?.outcome === 'not-sent') return task;
      const failure = validateOutreachFailure({ outcome: 'not-sent', scope: 'task', code: 'manually-confirmed-not-sent', detail: '用户已在平台人工核对，明确确认此任务未发送；主账号补发仍需重新预览确认。', stage: 'receipt', evidence: `manual-not-sent:${task.id}`, recordedAt: this.date() });
      const attempt = this.interactions.resolveExternalFailure(task, failure);
      return this.update(task.id, { status: 'failed', failure: attempt.failure, ...(attempt.priorFailure ? { priorFailure: attempt.priorFailure } : {}), resolvedAt: attempt.failure.recordedAt, reason: attempt.failure.detail });
    }
    const resolvedAt = this.date(), result = { status: sent ? 'sent' : 'failed', resolvedAt, failure: undefined, reason: sent ? '已人工核对为发送成功。' : '已人工核对为未发送；此任务仍不会重试。' };
    const receiptValue = proof(receipt); if (receiptValue !== undefined) result.receipt = receiptValue;
    else if (sent) result.receipt = { kind: 'manual-confirmation', confirmedAt: resolvedAt };
    return this.update(task.id, result);
  }
}
module.exports = { OutreachStore, validateOutreachTask, validateDirectorySource, validateProfileUrl, validateOutreachFailure, validateFollowupOrigin, validatePrimaryFollowup, validateOutreachRelations, outreachKey, outreachDigest, ACTIVE_OUTREACH, IMMUTABLE_OUTREACH };
