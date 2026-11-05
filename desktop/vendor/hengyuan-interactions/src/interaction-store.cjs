'use strict';

// Original MIT implementation. This module handles local data and authorization
// only. It never contacts a platform, evaluates message text, or retries a send.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomInt } = require('node:crypto');
const { outreachKey, validateProfileUrl, outreachDigest, validateDirectorySource, validateOutreachFailure, validateFollowupOrigin, validatePrimaryFollowup } = require('./outreach.cjs');
const { preparationFailure, RETRY_DELAYS_MS, RETRY_WINDOW_MS } = require('./welcome-preparation-retry.cjs');
const { projectInteractionSnapshot, normalizeReplyQuery, normalizeInboxQuery } = require('./snapshot-projection.cjs');

const { iso, createIsoScope } = require('./validated-time.cjs');

const HOUR = 60 * 60 * 1000;
const AUTO_MAX_AGE = 10 * 60 * 1000;
const CHANNELS = ['dm', 'comment', 'follow'];
const TRIGGERS = ['message', 'first-message', 'follow'];
const MODES = ['off', 'review', 'auto'];
const PLATFORMS = ['xiaohongshu', 'douyin'];
const MATCHES = ['contains', 'exact', 'all', 'any'];
const STATUSES = ['pending', 'queued', 'sending', 'sent', 'failed', 'unknown', 'cancelled', 'skipped'];
const UNSENT = new Set(['pending', 'queued']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REJECT = Symbol('commitThenReject');
const UNCHANGED_INGEST = Symbol('unchangedIngest');
const clone = value => structuredClone(value);
const normalize = value => value.normalize('NFKC').toLocaleLowerCase('zh-CN').trim();
const defaultPolicy = () => ({ paused: false, timeZone: 'Asia/Shanghai', sendWindows: [], hourlyLimit: 20, dailyLimit: null, cooldownScope: 'account', listMode: 'off', allowlist: [], blocklist: [], mutedUsers: [] });
const initialState = () => ({ schemaVersion: 1, rules: [], messages: [], replies: [], externalAttempts: [], settings: { defaultMode: 'review', modes: [], policy: defaultPolicy() }, dmSenders: [], followers: [], followBaselines: [] });
const shanghaiClock = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function localTime(timestamp) {
  const parts = Object.fromEntries(shanghaiClock.formatToParts(new Date(timestamp)).map(part => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

function record(value, label = '输入') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}格式不正确。`);
  return value;
}
function identifier(value, label = '记录编号') {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error(`${label}不正确。`);
  return value;
}
function string(value, label, max, { required = false, trim = true, fallback = '' } = {}) {
  if (value === undefined) value = fallback;
  if (typeof value !== 'string' || value.includes('\0') || value.length > max) throw new Error(`${label}格式不正确，最多 ${max} 个字符。`);
  const result = trim ? value.trim() : value;
  if (required && !result.trim()) throw new Error(`请填写${label}。`);
  return result;
}
function enumeration(value, choices, label) {
  if (!choices.includes(value)) throw new Error(`${label}不正确。`);
  return value;
}
function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label}应为 ${min} 至 ${max} 的整数。`);
  return value;
}
function boolean(value, label, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new Error(`${label}必须是布尔值。`);
  return value;
}
function time(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isFinite(new Date(value).getTime())) throw new Error('当前时间不正确。');
  return value;
}
function array(value, label, max = 1000) {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label}格式不正确，最多 ${max} 项。`);
  return value;
}
function uniqueIds(value, label) {
  const ids = array(value, label, 500).map(item => identifier(item, label));
  if (new Set(ids).size !== ids.length) throw new Error(`${label}不能重复。`);
  return ids;
}
function userKey(accountId, senderId) { return JSON.stringify([accountId, senderId]); }
function commentPrivate(value) { return value?.channel === 'comment' && value?.deliveryChannel === 'dm'; }
function deliveryChannel(value) { return value.deliveryChannel || value.channel; }
function reservesCommentPrivate(reply) { return Boolean(reply.claimedAt) || ['pending', 'queued', 'sending', 'sent', 'unknown'].includes(reply.status); }
function replyLengthDenial(platform, channel, text) {
  if (platform === 'xiaohongshu' && ['dm', 'follow'].includes(channel) && text.length > 1000) {
    return { code: 'reply_too_long', error: `小红书文本私信最多 1,000 个字符；当前完整文案为 ${text.length} 个字符，请缩短后重新核对。` };
  }
  return null;
}
function externalAttempt(input) {
  record(input, '协作发送记录');
  const attempt = { id: identifier(input.id), accountId: identifier(input.accountId), primaryAccountId: identifier(input.primaryAccountId), platform: enumeration(input.platform, PLATFORMS, '协作平台'), channel: enumeration(input.channel, ['dm', 'comment'], '协作渠道'), recipientId: string(input.recipientId, '协作接收人', 1000, { required: true }), sourceExternalId: string(input.sourceExternalId, '来源平台编号', 1000, { required: true }), claimedAt: iso(input.claimedAt), taskDigest: string(input.taskDigest, '任务校验值', 64, { required: true }) };
  if (input.sourceKind === 'fan-directory') {
    Object.assign(attempt, validateDirectorySource(input));
    if (typeof input.recipientIdAlias !== 'string' || !/^[1-9]\d{0,63}$/.test(input.recipientIdAlias)) throw new Error('粉丝发送记录缺少已核对的聊天接收人编号。');
    attempt.recipientIdAlias = input.recipientIdAlias;
  }
  else {
    if (input.sourceKind !== undefined) throw new Error('协作来源类型不正确。');
    attempt.sourceMessageId = identifier(input.sourceMessageId);
  }
  if (input.origin !== undefined) Object.assign(attempt, validateFollowupOrigin(input));
  else if (['followupOf', 'followupSourceDigest', 'followupFailure'].some(field => Object.hasOwn(input, field))) throw new Error('普通发送记录不能混入补发来源。');
  if (input.failure !== undefined) {
    attempt.failure = validateOutreachFailure(input.failure);
    if (attempt.failure.recordedAt < attempt.claimedAt) throw new Error('发送失败证据时间早于领取记录。');
    if (attempt.failure.code === 'manually-confirmed-not-sent' && attempt.failure.evidence !== `manual-not-sent:${attempt.id}`) throw new Error('人工核对证据与发送任务不一致。');
  }
  if (input.priorFailure !== undefined) attempt.priorFailure = validateOutreachFailure(input.priorFailure);
  if (!/^[a-f0-9]{64}$/.test(attempt.taskDigest) || (!['primary-followup','own-fan'].includes(attempt.origin) && attempt.accountId === attempt.primaryAccountId)) throw new Error('协作发送记录不正确。');
  attempt.targetKey = outreachKey(attempt); return attempt;
}
function linkedFollowupAttempt(child, parent) {
  const sourceFields = ['platform', 'primaryAccountId', 'channel', 'recipientId', 'sourceExternalId', 'sourceMessageId', 'sourceKind', 'sourceFanId', 'sourceChannel', 'sourceFanObservedAt', 'sourceOwnerProfileUrl', 'profileUrl', 'recipientIdAlias','nativeDirectoryProof'];
  return child.origin === 'primary-followup' && child.followupOf === parent.id && parent.origin === undefined && parent.failure?.outcome === 'not-sent' && child.followupSourceDigest === parent.taskDigest && sourceFields.every(field => JSON.stringify(child[field]) === JSON.stringify(parent[field])) && JSON.stringify(child.followupFailure) === JSON.stringify(parent.failure);
}
function messageProfileUrl(message) {
  const url = validateProfileUrl(message.platform, message.profileUrl);
  if (message.platform === 'xiaohongshu' && new URL(url).pathname.split('/').at(-1) !== message.senderId) throw new Error('用户主页与消息发送者编号不一致。');
  return url;
}
function priorIngestMessage(state, message) {
  const existing = state.messages.find(candidate => candidate.accountId === message.accountId && candidate.channel === message.channel && candidate.externalId === message.externalId);
  if (existing && message.profileUrl !== undefined &&
      (['platform', 'threadId', 'senderId', 'receivedAt', 'isOwn', 'isGroup'].some(field => existing[field] !== message[field]) ||
        (existing.profileUrl !== undefined && existing.profileUrl !== message.profileUrl))) throw new Error('同一来源的用户主页证据与已记录身份不一致。');
  return existing;
}
function users(value, label) {
  const keys = new Set();
  return array(value, label, 10000).map(entry => {
    record(entry, label);
    const result = { accountId: identifier(entry.accountId, '账号编号'), senderId: string(entry.senderId, '发送者编号', 1000, { required: true }) };
    const key = userKey(result.accountId, result.senderId);
    if (keys.has(key)) throw new Error(`${label}不能重复。`);
    keys.add(key);
    return result;
  });
}
function minuteOfDay(value, label, end = false) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    if (end && value === '24:00') return 1440;
    throw new Error(`${label}须使用 HH:mm 格式。`);
  }
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}
function policy(value) {
  record(value, '互动策略');
  const defaults = defaultPolicy();
  for (const key of Object.keys(value)) if (!Object.hasOwn(defaults, key)) throw new Error(`不支持的互动策略字段：${key}。`);
  const input = { ...defaults, ...value };
  const windows = array(input.sendWindows, '发送时段', 20).map(window => {
    record(window, '发送时段');
    const start = minuteOfDay(window.start, '开始时间');
    const end = minuteOfDay(window.end, '结束时间', true);
    if (start === end) throw new Error('发送时段的开始与结束不能相同；全天发送请留空。');
    return { start: window.start, end: window.end };
  });
  return {
    paused: boolean(input.paused, '全局暂停状态'),
    timeZone: enumeration(input.timeZone, ['Asia/Shanghai'], '发送时区'),
    sendWindows: windows,
    hourlyLimit: integer(input.hourlyLimit, 1, 1000, '每账号小时上限'),
    dailyLimit: input.dailyLimit === null ? null : integer(input.dailyLimit, 1, 100000, '每账号日上限'),
    cooldownScope: enumeration(input.cooldownScope, ['channel', 'account'], '冷却范围'),
    listMode: enumeration(input.listMode, ['off', 'allowlist'], '名单模式'),
    allowlist: users(input.allowlist, '允许名单'), blocklist: users(input.blocklist, '禁止名单'), mutedUsers: users(input.mutedUsers, '静默用户'),
  };
}
function find(items, id, label) {
  identifier(id);
  const item = items.find(candidate => candidate.id === id);
  if (!item) throw new Error(`${label}不存在。`);
  return item;
}
function receipt(value, required = false) {
  if (value === undefined) {
    if (required) throw new Error('确认已发送必须提供发送凭据。');
    return undefined;
  }
  if (typeof value === 'string') return string(value, '发送凭据', 16000, { required: true });
  record(value, '发送凭据');
  if (!Object.keys(value).length) throw new Error('发送凭据不能为空。');
  function inspect(item, depth) {
    if (depth > 8) throw new Error('发送凭据嵌套过深。');
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (typeof item !== 'object') throw new Error('发送凭据只能包含 JSON 数据。');
    const prototype = Object.getPrototypeOf(item);
    if (Array.isArray(item) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw new Error('发送凭据只能包含普通 JSON 数据。');
    if (Object.hasOwn(item, 'toJSON')) throw new Error('发送凭据只能包含 JSON 数据。');
    for (const key of Object.keys(item)) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || descriptor.get || descriptor.set) throw new Error('发送凭据只能包含普通 JSON 数据。');
      inspect(descriptor.value, depth + 1);
    }
  }
  inspect(value, 0);
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded) > 16000) throw new Error('发送凭据过大。');
  return JSON.parse(encoded);
}
function regular(file, label, optional = false) {
  let stats;
  try { stats = fs.lstatSync(file); } catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`${label}必须是普通文件。`);
  return stats;
}
function directory(file) {
  const stats = fs.lstatSync(file);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('互动数据目录必须是普通文件夹。');
  return stats;
}
function sameFile(a, b) { return a.dev === b.dev && a.ino === b.ino; }
function rejectAfterCommit(message) { return { [REJECT]: new Error(message) }; }

class InteractionStore {
  #validatedRead = null;
  #ingestBatch = null;
  constructor(dataDir, options) {
    if (typeof dataDir !== 'string' || !path.isAbsolute(dataDir)) throw new Error('互动数据目录必须是绝对路径。');
    record(options, '互动设置');
    if (typeof options.getAccount !== 'function') throw new Error('互动设置缺少账号读取方法。');
    this._getAccount = options.getAccount;
    if(options.withLock!==undefined&&typeof options.withLock!=='function')throw new Error('互动锁设置不正确。');
    this._customLock=options.withLock;
    if(options.temporaryFileName!==undefined&&(!options.withLock||typeof options.temporaryFileName!=='string'||!/^\.interactions-state-v1-[1-9]\d*-(?:0|[1-9]\d*)-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.tmp$/i.test(options.temporaryFileName)))throw new Error('互动临时文件设置不正确。');
    if(options.onValidatedArchive!==undefined&&typeof options.onValidatedArchive!=='function')throw new Error('互动恢复设置不正确。');
    this._temporaryFileName=options.temporaryFileName;
    // YuanXiao integration: optional authenticated encryption. No plaintext
    // fallback is permitted by the host; upstream tests retain plain fixtures.
    this._protect = options.protect || (text => Buffer.from(text, 'utf8'));
    this._unprotect = options.unprotect || (bytes => bytes.toString('utf8'));
    this._clock = options.now === undefined ? Date.now : options.now;
    if (typeof this._clock !== 'function') throw new Error('时钟设置不正确。');
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    directory(dataDir);
    this.dataDir = fs.realpathSync(dataDir);
    this._directory = directory(this.dataDir);
    this.filePath = path.join(this.dataDir, options.protect ? 'interactions.bin' : 'interactions.json');
    this.lockPath = path.join(this.dataDir, '.interactions.lock');
    this._withLock(() => {
      if (regular(this.filePath, '互动数据文件', true)) {
        this.#readValidated();
        if(options.onValidatedArchive){const result=options.onValidatedArchive();if(result&&typeof result.then==='function')throw new Error('互动恢复必须同步完成。');}
      }
      else this._write(initialState());
    });
    // Construct once per main-process lifecycle. A claim without a durable result
    // is ambiguous after a restart and can only be resolved by a human.
    this._transaction(state => {
      const now = this._date();
      for (const reply of state.replies) if (reply.status === 'sending') {
        reply.status = 'unknown';
        reply.reasonCode = 'restart_during_send';
        reply.reason = '上次发送未记录确定结果，请在平台核对。';
        reply.updatedAt = now;
        reply.finishedAt = now;
      }
    });
  }

  _now() { return time(this._clock()); }
  _date(now = this._now()) { return new Date(now).toISOString(); }
  _assertPath() {
    if (!sameFile(directory(this.dataDir), this._directory)) throw new Error('互动数据目录已更换，请重新打开工作台。');
    regular(this.filePath, '互动数据文件', true);
  }
  _withLock(action) {
    this._assertPath();
    if(this._customLock)return this._customLock(action);
    let fd;
    let lockStat;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try { fd = fs.openSync(this.lockPath, 'wx', 0o600); break; } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const observed = regular(this.lockPath, '互动锁文件');
        let owner;
        try { owner = JSON.parse(fs.readFileSync(this.lockPath, 'utf8')); } catch { throw new Error('互动数据正在使用，或锁文件不完整。请关闭其他工作台后重试。'); }
        if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new Error('互动锁文件不正确。');
        let alive = true;
        try { process.kill(owner.pid, 0); } catch (probeError) { if (probeError.code === 'ESRCH') alive = false; }
        if (alive || !sameFile(regular(this.lockPath, '互动锁文件'), observed)) throw new Error('互动数据正在处理，请稍后重试。');
        fs.unlinkSync(this.lockPath);
      }
    }
    if (fd === undefined) throw new Error('互动数据正在处理，请稍后重试。');
    try {
      lockStat = fs.fstatSync(fd);
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, token: randomUUID() }), 'utf8');
      return action();
    } finally {
      fs.closeSync(fd);
      try { if (sameFile(regular(this.lockPath, '互动锁文件'), lockStat)) fs.unlinkSync(this.lockPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  _write(state) {
    this.#validatedRead = null;
    this._assertPath();
    const temporary = path.join(this.dataDir, this._temporaryFileName||`.interactions-${randomUUID()}.tmp`);
    let fd,temporaryStat;
    try {
      fd = fs.openSync(temporary, 'wx', 0o600);
      temporaryStat=fs.fstatSync(fd);
      const text = JSON.stringify(state);
      if (Buffer.byteLength(text) > 16 * 1024 * 1024) throw new Error('互动记录达到本轮安全容量，已停止写入；原数据保留。');
      fs.writeFileSync(fd, this._protect(text));
      fs.fsyncSync(fd);
      fs.closeSync(fd); fd = undefined;
      this._assertPath();
      const current=regular(temporary,'互动临时文件');
      if(!sameFile(current,temporaryStat)||current.nlink!==1)throw new Error('互动临时文件已变化，原数据保留。');
      fs.renameSync(temporary, this.filePath);
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if(temporaryStat)try {
        this._assertPath();const current=regular(temporary,'互动临时文件');
        if(!sameFile(current,temporaryStat)||current.nlink!==1)throw new Error('互动临时文件已变化，未清理。');
        fs.unlinkSync(temporary);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  #readValidated() {
    if (this._readSnapshot !== undefined) return this._readSnapshot;
    this._assertPath();
    regular(this.filePath, '互动数据文件');
    try {
      // Always read the current file. Reuse validation only when every byte of
      // the file is identical, not when an mtime/size/TTL happens to match.
      // This view stays private. Mutations clone it before writing, while
      // queries clone only their selected result instead of the whole history.
      if (fs.statSync(this.filePath).size > 17 * 1024 * 1024) throw new Error('互动记录过大，未覆盖原文件。');
      const raw = fs.readFileSync(this.filePath);
      this._now();
      if (this.#validatedRead?.raw.equals(raw)) return this.#validatedRead.state;
      this.#validatedRead = null;
      const text = this._unprotect(raw);
      if (typeof text !== 'string') throw new Error('互动记录解码格式不正确。');
      const plainBytes = Buffer.byteLength(text);
      if (plainBytes > 16 * 1024 * 1024) throw new Error('互动记录解码后过大，未覆盖原文件。');
      const state = this._validate(JSON.parse(text));
      // Bound retained memory. Large histories still use the original fresh
      // parsing path; they never lose validation or get silently truncated.
      if (raw.length <= 8 * 1024 * 1024 && plainBytes <= 8 * 1024 * 1024) this.#validatedRead = { raw, state };
      return state;
    } catch (error) {
      this.#validatedRead = null;
      throw new Error(`无法读取互动数据：${error.message} 原文件已保留。`);
    }
  }
  _read() {
    const state = this.#readValidated();
    // A read scope already owns one detached view. Uncached large files also
    // produce a fresh view; neither needs an additional complete clone.
    return this._readSnapshot !== undefined || this.#validatedRead?.state !== state ? state : clone(state);
  }
  #select(read) { return clone(read(this.#readValidated())); }
  withReadSnapshot(action) {
    if (typeof action !== 'function') throw new Error('只读校验方法不正确。');
    const run = () => {
      const result = action();
      if (result && typeof result.then === 'function') throw new Error('只读校验必须同步完成，不能跨异步操作缓存。');
      return result;
    };
    if (this._readSnapshot !== undefined) return run();
    // One synchronous policy check may use several public read methods. Keep
    // their view consistent under one lock, and discard it before any await.
    return this._withLock(() => {
      this._readSnapshot = this._read();
      try { return run(); } finally { delete this._readSnapshot; }
    });
  }
  _transaction(action) {
    return this.#transaction(action);
  }
  #transaction(action, unchanged) {
    if (this._readSnapshot !== undefined) throw new Error('只读校验期间不能修改互动数据。');
    return this._withLock(() => {
      // Duplicate monitor observations are read-only. Inspect them under the
      // same lock and against freshly read bytes before allocating a complete
      // mutable history. The callback and its marker are private to ingestion.
      const current = this.#readValidated();
      const inspected = unchanged?.(current);
      if (inspected && Object.hasOwn(inspected, UNCHANGED_INGEST)) return clone(inspected[UNCHANGED_INGEST]);
      const next = this.#validatedRead?.state === current ? clone(current) : current;
      const result = action(next);
      // Only ingest's verified duplicate path produces this private marker.
      // Keep the fresh validated view, without rewriting/fsyncing unchanged data.
      if (result && Object.hasOwn(result, UNCHANGED_INGEST)) return clone(result[UNCHANGED_INGEST]);
      this._write(next);
      if (result && result[REJECT]) throw result[REJECT];
      return result === undefined ? undefined : clone(result);
    });
  }
  _account(accountId) {
    identifier(accountId, '账号编号');
    const account = this._getAccount(accountId);
    record(account, '账号');
    if (account.id !== accountId) throw new Error('账号编号不匹配。');
    enumeration(account.platform, PLATFORMS, '互动平台');
    return account;
  }
  _rule(input, previous) {
    record(input, '规则');
    const trigger = enumeration(input.trigger === undefined ? 'message' : input.trigger, TRIGGERS, '触发方式');
    const channel = enumeration(input.channel === undefined ? (trigger === 'message' ? 'all' : trigger === 'follow' ? 'follow' : 'dm') : input.channel, ['all', ...CHANNELS], '规则渠道');
    if ((trigger === 'first-message' && channel !== 'dm') || (trigger === 'follow' && channel !== 'follow') || (trigger === 'message' && channel === 'follow')) throw new Error('首次私信规则仅适用于私信，关注规则仅适用于新关注。');
    const match = enumeration(input.match === undefined ? (trigger === 'follow' ? 'any' : 'contains') : input.match, MATCHES, '匹配方式');
    const keywords = array(input.keywords === undefined ? [] : input.keywords, '关键词', 50).map(word => string(word, '关键词', 200, { required: true }));
    if (new Set(keywords.map(normalize)).size !== keywords.length) throw new Error('关键词不能重复。');
    if (match !== 'any' && keywords.length === 0) throw new Error('此匹配方式至少需要一个关键词。');
    const enabled = boolean(input.enabled, '规则启用状态', true);
    const platform = enumeration(input.platform === undefined ? 'all' : input.platform, ['all', ...PLATFORMS], '规则平台');
    if (input.deliveryChannel !== undefined && (input.deliveryChannel !== 'dm' || channel !== 'comment' || trigger !== 'message')) throw new Error('评论私信只适用于评论消息触发，并使用同账号私信渠道。');
    if (input.deliveryChannel === 'dm' && platform !== 'douyin') throw new Error('评论私信目前仅支持抖音，请明确选择抖音平台。');
    const now = this._date();
    // New automatic actions begin at an explicit rule activation. Caller
    // supplied timestamps cannot turn historical comments into new targets.
    const activatedAt = previous && commentPrivate(previous) && previous.enabled && enabled ? previous.activatedAt : now;
    return {
      id: previous?.id || randomUUID(), revision: previous ? previous.revision + 1 : 1,
      name: string(input.name, '规则名称', 100, { required: true }),
      platform,
      accountIds: uniqueIds(input.accountIds === undefined ? [] : input.accountIds, '规则账号'),
      channel, trigger, ...(input.deliveryChannel === 'dm' ? { deliveryChannel: 'dm', activatedAt } : {}),
      match, keywords, replyText: string(input.replyText, '回复内容', 2000, { required: true, trim: false }),
      replyVariants: array(input.replyVariants === undefined ? [] : input.replyVariants, '回复候选', 20).map(text => string(text, '回复候选', 2000, { required: true, trim: false })),
      enabled,
      priority: integer(input.priority === undefined ? 0 : input.priority, -1000, 1000, '优先级'),
      cooldownMinutes: integer(input.cooldownMinutes === undefined ? 30 : input.cooldownMinutes, 0, 1440, '冷却分钟'),
      delaySeconds: integer(input.delaySeconds === undefined ? 0 : input.delaySeconds, 0, 3600, '延迟秒数'),
      createdAt: previous?.createdAt || now, updatedAt: now,
    };
  }
  _mode(state, accountId, channel) { return state.settings.modes.find(mode => mode.accountId === accountId && mode.channel === channel)?.mode || 'review'; }
  _eventContext(state, message) {
    return {
      firstMessage: message.channel === 'dm' && state.dmSenders.some(sender => sender.accountId === message.accountId && sender.senderId === message.senderId && sender.firstMessageId === message.id),
      firstFollow: message.channel === 'follow' && state.followers.some(sender => sender.accountId === message.accountId && sender.senderId === message.senderId && sender.firstEventId === message.id),
    };
  }
  _renderedTexts(rule, senderName) { return [...new Set([rule.replyText, ...rule.replyVariants].map(text => text.replace(/\{nickname\}/g, () => senderName || '朋友')))]; }
  _matches(rule, account, channel, messageText, context) {
    if (!rule.enabled || (rule.platform !== 'all' && rule.platform !== account.platform) || (rule.accountIds.length && !rule.accountIds.includes(account.id)) || (rule.channel !== 'all' && rule.channel !== channel)) return false;
    if (rule.trigger === 'follow') {
      if (channel !== 'follow' || !context.firstFollow) return false;
    } else if (channel === 'follow' || (rule.trigger === 'first-message' && (channel !== 'dm' || !context.firstMessage))) return false;
    const normalized = normalize(messageText);
    if (!normalized && channel !== 'follow') return false;
    const keywords = rule.keywords.map(normalize);
    if (rule.match === 'any') return true;
    if (rule.match === 'exact') return keywords.some(keyword => normalized === keyword);
    if (rule.match === 'all') return keywords.every(keyword => normalized.includes(keyword));
    return keywords.some(keyword => normalized.includes(keyword));
  }
  _selection(state, account, channel, messageText, senderName, context = {}, destination) {
    const rule = [...state.rules].sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).find(candidate => candidate.deliveryChannel === destination && this._matches(candidate, account, channel, messageText, context));
    return { matched: Boolean(rule), rule: rule || null, replyText: rule ? this._renderedTexts(rule, senderName)[0] : null };
  }
  _mark(reply, status, reasonCode, reason, now = this._date()) {
    reply.status = status; reply.reasonCode = reasonCode; reply.reason = reason; reply.updatedAt = now;
    if (!UNSENT.has(status) && status !== 'sending') reply.finishedAt = now;
  }
  _cancelUnsent(state, predicate, code, reason) {
    const now = this._date();
    for (const reply of state.replies) if (UNSENT.has(reply.status) && predicate(reply)) this._mark(reply, 'cancelled', code, reason, now);
  }
  _invalidateRules(state) {
    this._cancelUnsent(state, reply => {
      if (reply.origin === 'manual-batch') return false;
      const message = state.messages.find(candidate => candidate.id === reply.messageId);
      if (!message) return true;
      try {
        const match = this._selection(state, this._account(reply.accountId), reply.channel, message.text, message.senderName, this._eventContext(state, message), reply.deliveryChannel);
        return !match.rule || match.rule.id !== reply.ruleId || match.rule.revision !== reply.ruleRevision || !this._renderedTexts(match.rule, message.senderName).includes(reply.replyText);
      } catch { return true; }
    }, 'rule_changed', '规则已更改或删除，旧回复已撤销。');
  }
  _policyDenial(state, message, now, { replyId, schedule = true, limits = true, senderAliases = [] } = {}) {
    const current = state.settings.policy;
    const identities = new Set([message.senderId, ...senderAliases]);
    const includes = entries => entries.some(entry => entry.accountId === message.accountId && identities.has(entry.senderId));
    if (current.paused) return { code: 'global_paused', error: '互动已全局暂停，回复不能发送。' };
    if (includes(current.blocklist)) return { code: 'blocked_user', error: '此用户在禁止名单中，回复不能发送。' };
    if (includes(current.mutedUsers)) return { code: 'muted_user', error: '此用户已静默，回复不能发送。' };
    if (current.listMode === 'allowlist' && !includes(current.allowlist)) return { code: 'not_allowlisted', error: '此用户不在允许名单中，回复不能发送。' };
    const local = localTime(now);
    if (schedule && current.sendWindows.length && !current.sendWindows.some(window => {
      const start = minuteOfDay(window.start, '开始时间');
      const end = minuteOfDay(window.end, '结束时间', true);
      return start < end ? local.minute >= start && local.minute < end : local.minute >= start || local.minute < end;
    })) return { code: 'outside_send_window', error: '当前不在允许的发送时段内（Asia/Shanghai），本次回复已跳过。' };
    if (limits) {
      const attempts = [...state.replies, ...state.externalAttempts].filter(reply => reply.id !== replyId && reply.accountId === message.accountId && reply.claimedAt);
      if (attempts.filter(reply => Date.parse(reply.claimedAt) > now - HOUR).length >= current.hourlyLimit) return { code: 'hourly_limit', error: `此账号一小时内已尝试发送 ${current.hourlyLimit} 条回复，本次已跳过。` };
      if (current.dailyLimit !== null && attempts.filter(reply => localTime(Date.parse(reply.claimedAt)).day === local.day).length >= current.dailyLimit) return { code: 'daily_limit', error: `此账号今天已尝试发送 ${current.dailyLimit} 条回复（Asia/Shanghai），本次已跳过。` };
    }
    return null;
  }
  _cooldownDenial(state, message, rule, now, replyId) {
    const cooldown = rule.cooldownMinutes * 60000;
    const destination = rule.deliveryChannel || message.channel;
    if (cooldown && [...state.replies, ...state.externalAttempts].some(other => {
      if (other.id === replyId || other.accountId !== message.accountId || !other.claimedAt || Date.parse(other.claimedAt) <= now - cooldown || (state.settings.policy.cooldownScope === 'channel' && deliveryChannel(other) !== destination)) return false;
      // These are two separately authorized actions for this one comment,
      // not a new contact attempt inferred from another event.
      if (message.channel === 'comment' && other.messageId === message.id && commentPrivate(other) !== commentPrivate(rule)) return false;
      return (other.recipientId || state.messages.find(original => original.id === other.messageId)?.senderId) === message.senderId;
    })) return { code: 'sender_cooldown', error: '同一发送者仍在冷却时间内，本次回复已跳过。' };
    return null;
  }
  _manualCooldownDenial(state, message, now, replyId) {
    for (const previous of state.replies) {
      if (previous.id === replyId || previous.accountId !== message.accountId || !previous.claimedAt || (state.settings.policy.cooldownScope === 'channel' && deliveryChannel(previous) !== 'dm')) continue;
      const source = state.messages.find(item => item.id === previous.messageId);
      const priorRule = previous.origin === 'manual-batch' ? null : state.rules.find(item => item.id === previous.ruleId);
      if (source?.senderId === message.senderId && priorRule?.cooldownMinutes && Date.parse(previous.claimedAt) > now - priorRule.cooldownMinutes * 60000) return { code: 'sender_cooldown', error: '同一发送者仍在已生效的回复冷却时间内，请稍后重新核对。' };
    }
    return null;
  }
  _manualDraftCheck(state, input, { replyId, schedule = true, limits = true } = {}) {
    record(input, '手动私信回复');
    const message = find(state.messages, input.messageId, '原始私信');
    const replyText = string(input.replyText, '回复内容', 2000, { required: true, trim: false });
    if (message.channel !== 'dm' || message.isOwn || message.isGroup || !message.text.trim()) throw new Error('请选择已有单人会话中对方发来的文本私信。');
    const account = this._account(message.accountId);
    if (account.platform !== message.platform || this._mode(state, account.id, 'dm') === 'off') throw new Error('原会话账号的私信渠道已关闭或账号不匹配。');
    const lengthDenial = replyLengthDenial(message.platform, 'dm', replyText);
    if (lengthDenial) throw new Error(lengthDenial.error);
    const latest = state.messages.filter(item => item.accountId === message.accountId && item.channel === 'dm' && item.threadId === message.threadId && !item.isOwn && !item.isGroup).sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt) || Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id))[0];
    if (!latest || latest.id !== message.id) throw new Error('该会话已有更新的来信，请重新选择最新消息。');
    if (state.messages.some(item => item.accountId === message.accountId && item.channel === 'dm' && item.threadId === message.threadId && item.isOwn && !item.isGroup && (Date.parse(item.receivedAt) > Date.parse(message.receivedAt) || (Date.parse(item.receivedAt) === Date.parse(message.receivedAt) && Date.parse(item.createdAt) >= Date.parse(message.createdAt))))) throw new Error('这条来信之后已有本账号发出的消息，请先核对原会话，避免重复回复。');
    if (state.replies.some(reply => reply.id !== replyId && reply.accountId === message.accountId && ['unknown', 'sending'].includes(reply.status) && state.messages.some(item => item.id === reply.messageId && item.channel === 'dm' && item.threadId === message.threadId))) throw new Error('该会话有发送结果未明确的回复，请先核对结果再继续。');
    const existingReply = state.replies.find(reply => reply.messageId === message.id && reply.id !== replyId) || null;
    if (existingReply && (!['pending', 'cancelled', 'skipped'].includes(existingReply.status) || ['approvedAt', 'claimedAt', 'claimId', 'receipt', 'sentAt', 'resolvedAt'].some(field => existingReply[field] !== undefined))) throw new Error('这条来信已有回复记录，请在原回复记录中核对，不能重复建立发送。');
    const now = this._now();
    const denial = this._manualCooldownDenial(state, message, now, replyId) || this._policyDenial(state, message, now, { replyId, schedule, limits });
    if (denial) throw new Error(denial.error);
    return { message, account: { id: account.id, name: account.name, platform: account.platform }, replyText, existingReply, policy: { cooldownMinutes: 0 } };
  }
  checkManualDraft(input) { return this._withLock(() => clone(this._manualDraftCheck(this._read(), input))); }
  createManualBatchReply(input) {
    return this._transaction(state => {
      const check = this._manualDraftCheck(state, input);
      if (input.expectedMessage && JSON.stringify(input.expectedMessage) !== JSON.stringify(check.message)) throw new Error('原始私信已变化，请重新核对后发送。');
      if (Object.hasOwn(input, 'expectedExistingReply') && JSON.stringify(input.expectedExistingReply) !== JSON.stringify(check.existingReply)) throw new Error('原会话的待回复记录已变化，请重新核对后发送。');
      const now = this._date();
      const reply = { id: check.existingReply?.id || randomUUID(), messageId: check.message.id, accountId: check.message.accountId, channel: 'dm', origin: 'manual-batch', cooldownMinutes: 0, replyText: check.replyText, status: 'pending', modeAtCreation: 'review', dueAt: now, reasonCode: 'awaiting_review', reason: '已核对的手动批量回复，等待当前批次执行。', createdAt: now, updatedAt: now };
      if (check.existingReply) state.replies[state.replies.findIndex(item => item.id === check.existingReply.id)] = reply;
      else state.replies.unshift(reply);
      return reply;
    });
  }

  snapshot() {
    return this.#select(state => ({ rules: state.rules, messages: state.messages, replies: state.replies, settings: state.settings }));
  }
  // Limit the cloned public view after validated selection. The full snapshot
  // remains available to rules, exports and other internal consumers.
  snapshotForDisplay(input,inboxInput) {
    const query=normalizeReplyQuery(input);if(query?.accountId)this._account(query.accountId);
    const inboxQuery=normalizeInboxQuery(inboxInput);if(inboxQuery?.accountId)this._account(inboxQuery.accountId);
    return this.#select(state => projectInteractionSnapshot({rules:state.rules,messages:state.messages,replies:state.replies,settings:state.settings},query,inboxQuery));
  }
  exportBusinessState(){return this.#select(state=>state);}
  validateBusinessState(value){return this._validate(clone(value));}
  importDisabledRules(rules){
    if(!Array.isArray(rules)||rules.length>1000)throw new Error('一次最多导入 1000 条停用规则');
    return this._transaction(state=>{
      const used=new Set(state.rules.map(rule=>rule.id)),added=[];
      for(const input of rules){identifier(input.id);if(input.enabled!==false||!Array.isArray(input.accountIds)||!input.accountIds.length)throw new Error('导入规则必须停用并明确映射到当前账号');
        for(const id of input.accountIds){const account=this._account(id);if(input.platform!=='all'&&account.platform!==input.platform)throw new Error('导入规则与映射账号的平台不一致');}
        if(used.has(input.id))continue;
        const rule=this._rule({...input,enabled:false},null);rule.id=input.id;state.rules.push(rule);used.add(rule.id);added.push(rule.id);
      }
      return{added:added.length,existing:rules.length-added.length,ids:added};
    });
  }
  getMessage(messageId) { return this.#select(state => find(state.messages, messageId, '消息')); }
  getReply(replyId) { return this.#select(state => find(state.replies, replyId, '回复')); }
  getPolicy() { return this.#select(state => state.settings.policy); }
  // Monitoring needs only configuration, never a copy of the message archive.
  monitoringSettings() { return this.#select(state => ({ rules: state.rules, modes: state.settings.modes })); }
  hasPrivateTarget({platform,senderId}) {
    if(!['douyin','xiaohongshu'].includes(platform)||typeof senderId!=='string'||!senderId)throw Error('私信去重对象无效');
    return this.#select(state=>{const sources=new Set(state.messages.filter(m=>m.platform===platform&&m.senderId===senderId).map(m=>m.id));return state.replies.some(r=>sources.has(r.messageId)&&(r.channel==='dm'||r.channel==='follow'||r.deliveryChannel==='dm')&&!['cancelled','failed','skipped'].includes(r.status));});
  }
  // Native verified history can prove this is not a first inbound contact
  // without copying every historical private message into another archive.
  baselineDmSender(accountId, senderId) {
    this._account(accountId);string(senderId, '发送者编号', 1000, { required: true });
    return this.#transaction(state=>{
      state.dmSenders.push({accountId,senderId,firstMessageId:null,firstSeenAt:this._date()});
      // A second live message must not revoke this worker's already-established
      // first-message welcome. Genuine older history is still handled by ingest.
    },state=>state.dmSenders.some(s=>s.accountId===accountId&&s.senderId===senderId)?{[UNCHANGED_INGEST]:true}:undefined);
  }
  nextDueAutoReply(blockedAccounts=[]) {
    const blocked=new Set(blockedAccounts),now=this._now();
    return this.#select(state=>{let next=null;for(const r of state.replies)if(r.status==='queued'&&r.modeAtCreation==='auto'&&!blocked.has(r.accountId)&&Date.parse(r.dueAt)<=now&&(!next||r.dueAt<next.dueAt||r.dueAt===next.dueAt&&r.createdAt<next.createdAt))next=r;return next;});
  }
  getExternalAttempt(attemptId) { identifier(attemptId); return this.#select(state => state.externalAttempts.find(item => item.id === attemptId) || null); }
  getExternalAttempts() { return this.#select(state => state.externalAttempts); }
  hasExternalTarget(targetKey) { return this.#select(state => state.externalAttempts.some(item => item.targetKey === targetKey)); }
  _followupExclusion(state, task, followupSource, recipientIdAlias) {
    if (task.origin !== 'primary-followup') return null;
    validatePrimaryFollowup(task, followupSource);
    const attempt = state.externalAttempts.find(item => item.id === task.followupOf);
    if (followupSource.claimedAt) {
      if (!attempt || attempt.taskDigest !== task.followupSourceDigest || attempt.claimedAt !== followupSource.claimedAt || JSON.stringify(attempt.failure) !== JSON.stringify(task.followupFailure) || (recipientIdAlias !== undefined && attempt.recipientIdAlias !== undefined && attempt.recipientIdAlias !== recipientIdAlias)) throw new Error('原任务的明确未发送账本证据不一致，不能补发。');
    } else if (attempt) throw new Error('原任务存在未核对的发送领取记录，不能补发。');
    return task.followupOf;
  }
  _externalCheck(state, task, { limits = true, schedule = true, claimed = false, recipientIdAlias, followupSource } = {}) {
    record(task, '协作任务');
    const sender = this._account(task.accountId), primary = this._account(task.primaryAccountId);
    const excludedSourceId = this._followupExclusion(state, task, followupSource, recipientIdAlias);
    if (primary.role !== 'primary' || (['primary-followup','own-fan'].includes(task.origin) ? sender.id !== primary.id : sender.role !== 'member' || sender.primaryAccountId !== primary.id) || sender.platform !== task.platform || primary.platform !== task.platform) throw new Error('协作发送账号与主账号关联不正确。');
    let message, senderAliases = [];
    if (task.sourceKind === 'fan-directory') {
      validateDirectorySource(task);
      const knownIds = new Set(state.messages.filter(item => item.platform === 'douyin' && item.profileUrl === task.profileUrl && !item.isOwn && !item.isGroup && /^[1-9]\d{0,63}$/.test(item.senderId)).map(item => item.senderId));
      if (knownIds.size > 1 || (recipientIdAlias !== undefined && (typeof recipientIdAlias !== 'string' || !/^[1-9]\d{0,63}$/.test(recipientIdAlias) || (knownIds.size && !knownIds.has(recipientIdAlias)) || [task.primaryBinding?.identity, task.senderBinding?.identity].includes(recipientIdAlias)))) throw new Error('粉丝主页与聊天接收人编号不一致，未继续发送。');
      senderAliases = [...knownIds, ...(recipientIdAlias === undefined ? [] : [recipientIdAlias])];
      // The OutreachStore has re-read the bound local directory immediately
      // before this transaction. This policy subject is not an inbound message.
      message = { accountId: primary.id, platform: task.platform, senderId: task.recipientId, channel: 'dm' };
    } else {
      if (task.sourceKind !== undefined) throw new Error('协作来源类型不正确。');
      message = find(state.messages, task.sourceMessageId, '协作来源');
      if (message.accountId !== primary.id || message.platform !== task.platform || message.senderId !== task.recipientId || message.externalId !== task.sourceExternalId || message.isOwn || message.isGroup || (task.channel === 'comment' && message.channel !== 'comment')) throw new Error('协作任务的真实来源或接收人不匹配。');
    }
    enumeration(task.channel, ['dm', 'comment'], '协作渠道');
    const blocked = (code, detail, scope) => {
      const error = new Error(detail);
      error.failure = { outcome: 'not-sent', scope, code, detail, stage: 'preflight' };
      return error;
    };
    if (task.channel === 'dm') {
      const peerIds = new Set([task.recipientId, ...senderAliases]);
      if (state.externalAttempts.some(attempt => attempt.id !== task.id && attempt.id !== excludedSourceId && attempt.platform === task.platform && attempt.channel === 'dm' && (peerIds.has(attempt.recipientId) || (attempt.recipientIdAlias && peerIds.has(attempt.recipientIdAlias))))) throw new Error('该接收人已有私信发送领取记录，请先核对，不能重复发送。');
      // A different outreach source cannot make an already contacted recipient
      // new again. Directory tasks include the verified numeric alias; message
      // sources already carry the exact peer ID. Only this team's DM/welcome
      // history blocks outreach; ordinary inbound replies retain their own flow.
      const sources = new Map(state.messages.map(item => [item.id, item]));
      const duplicate = state.replies.some(reply => {
        if (!['dm', 'follow'].includes(deliveryChannel(reply)) || (!reply.claimedAt && !['pending', 'queued', 'sending', 'sent', 'unknown'].includes(reply.status))) return false;
        const source = sources.get(reply.messageId);
        if (!source || source.platform !== task.platform || !peerIds.has(source.senderId) || source.isOwn || source.isGroup) return false;
        try { const account = this._account(reply.accountId); return account.id === primary.id || (account.role === 'member' && account.primaryAccountId === primary.id); }
        catch { return false; }
      });
      if (duplicate) throw blocked('recipient_already_contacted', '该接收人已有回复或待处理记录，请先核对，不能重复发送。', 'task');
    }
    if (this._mode(state, sender.id, task.channel) === 'off') throw blocked('channel_disabled', '发送账号的此渠道已关闭，不能执行协作任务。', 'account');
    const now = this._now();
    const denial = this._policyDenial(state, message, now, { schedule, limits: false, senderAliases }) || this._policyDenial(state, { accountId: sender.id, senderId: task.recipientId, channel: task.channel }, now, { schedule, limits, senderAliases, replyId: claimed ? task.id : undefined });
    if (denial) {
      if (['hourly_limit', 'daily_limit', 'outside_send_window'].includes(denial.code)) throw blocked(denial.code, denial.error, 'account');
      if (['blocked_user', 'muted_user', 'not_allowlisted'].includes(denial.code)) throw blocked(denial.code, denial.error, 'task');
      throw new Error(denial.error);
    }
    return true;
  }
  checkExternalPolicy(task, options = {}) {
    const check = () => this._externalCheck(this._read(), task, options);
    return this._readSnapshot !== undefined ? check() : this._withLock(check);
  }
  claimExternalAttempt(task, { recipientIdAlias, followupSource } = {}) {
    return this._transaction(state => {
      identifier(task.id);
      const excludedSourceId = this._followupExclusion(state, task, followupSource, recipientIdAlias);
      if (state.replies.some(item => item.id === task.id) || state.externalAttempts.some(item => item.id === task.id || (item.id !== excludedSourceId && item.targetKey === outreachKey(task)))) throw new Error('此协作目标已领取过发送，不能再次尝试。');
      this._externalCheck(state, task, { recipientIdAlias, followupSource });
      const attempt = externalAttempt({ ...task, ...(task.sourceKind === 'fan-directory' ? { recipientIdAlias } : {}), claimedAt: this._date(), taskDigest: outreachDigest(task) });
      state.externalAttempts.push(attempt); return attempt;
    });
  }
  assertExternalAttempt(task, { recipientIdAlias, followupSource } = {}) {
    return this._withLock(() => {
      const state = this._read(), attempt = state.externalAttempts.find(item => item.id === task.id);
      if (!attempt || attempt.taskDigest !== outreachDigest(task) || attempt.claimedAt !== task.claimedAt) throw new Error('协作任务与发送领取记录不一致，不能提交。');
      if (task.sourceKind === 'fan-directory' && attempt.recipientIdAlias !== recipientIdAlias) throw new Error('聊天接收人与已领取发送记录不一致，不能提交。');
      return this._externalCheck(state, task, { claimed: true, recipientIdAlias, followupSource });
    });
  }
  recordExternalFailure(task, input) {
    return this._transaction(state => {
      const attempt = state.externalAttempts.find(item => item.id === task.id), failure = validateOutreachFailure(input);
      if (failure.code === 'manually-confirmed-not-sent') throw new Error('人工核对未发送必须通过专用确认操作记录。');
      if (!attempt || attempt.taskDigest !== outreachDigest(task) || attempt.claimedAt !== task.claimedAt) throw new Error('发送失败记录与已领取任务不一致。');
      if (attempt.failure && JSON.stringify(attempt.failure) !== JSON.stringify(failure)) throw new Error('已有失败证据不能覆盖，请保留原记录核对。');
      attempt.failure = failure; return externalAttempt(attempt);
    });
  }
  resolveExternalFailure(task, input) {
    return this._transaction(state => {
      const attempt = state.externalAttempts.find(item => item.id === task.id), failure = validateOutreachFailure(input);
      if (!['unknown', 'failed'].includes(task.status) || !attempt || attempt.taskDigest !== outreachDigest(task) || attempt.claimedAt !== task.claimedAt || failure.code !== 'manually-confirmed-not-sent' || failure.evidence !== `manual-not-sent:${task.id}`) throw new Error('人工核对与原发送领取记录不一致。');
      // If a crash occurred after this durable write, the next explicit user
      // confirmation completes the same resolution without rewriting evidence.
      if (attempt.failure?.code === 'manually-confirmed-not-sent') return externalAttempt(attempt);
      if (attempt.failure) attempt.priorFailure = clone(attempt.failure);
      attempt.failure = failure;
      return externalAttempt(attempt);
    });
  }
  updatePolicy(input) {
    record(input, '互动策略');
    return this._transaction(state => {
      const next = policy({ ...state.settings.policy, ...input });
      for (const field of ['allowlist', 'blocklist', 'mutedUsers']) if (Object.hasOwn(input, field)) for (const entry of next[field]) this._account(entry.accountId);
      if (!next.paused && JSON.stringify(next) === JSON.stringify(state.settings.policy)) return next;
      state.settings.policy = next;
      const now = this._now();
      for (const reply of state.replies) if (UNSENT.has(reply.status)) {
        const message = state.messages.find(candidate => candidate.id === reply.messageId);
        const rule = state.rules.find(candidate => candidate.id === reply.ruleId);
        const denial = message && (this._policyDenial(state, message, now, { replyId: reply.id }) || (rule && this._cooldownDenial(state, message, rule, now, reply.id)));
        if (denial) this._mark(reply, 'cancelled', denial.code, denial.error, this._date(now));
      }
      return next;
    });
  }
  saveRule(input) {
    return this._transaction(state => {
      const previous = input?.id === undefined ? null : find(state.rules, input.id, '规则');
      const rule = this._rule(input, previous);
      for (const accountId of rule.accountIds) {
        const account = this._account(accountId);
        if (rule.platform !== 'all' && rule.platform !== account.platform) throw new Error('规则账号与选择的平台不一致。');
      }
      if (previous) state.rules[state.rules.findIndex(candidate => candidate.id === previous.id)] = rule;
      else state.rules.push(rule);
      this._invalidateRules(state);
      return rule;
    });
  }
  deleteRule(ruleId) {
    return this._transaction(state => {
      find(state.rules, ruleId, '规则');
      state.rules = state.rules.filter(rule => rule.id !== ruleId);
      this._invalidateRules(state);
    });
  }
  preview(input) {
    record(input, '预览');
    const account = this._account(input.accountId);
    const channel = enumeration(input.channel, CHANNELS, '消息渠道');
    const messageText = string(input.text, '消息内容', 100000, { trim: false });
    const senderName = string(input.senderName, '对方昵称', 200);
    const senderId = input.senderId === undefined ? null : string(input.senderId, '发送者编号', 1000, { required: true });
    const state = this._read();
    const context = {
      firstMessage: channel === 'dm' && senderId !== null && !state.dmSenders.some(sender => sender.accountId === account.id && sender.senderId === senderId),
      firstFollow: channel === 'follow' && senderId !== null && state.followBaselines.some(baseline => baseline.accountId === account.id) && !state.followers.some(sender => sender.accountId === account.id && sender.senderId === senderId),
    };
    if (input.deliveryChannel !== undefined && (input.deliveryChannel !== 'dm' || channel !== 'comment')) throw new Error('评论私信预演渠道不正确。');
    const selections = (channel === 'comment' && input.deliveryChannel === undefined ? [undefined, 'dm'] : [input.deliveryChannel]).map(destination => {
      const selection = this._selection(state, account, channel, messageText, senderName, context, destination);
      const contentWarnings = selection.rule ? this._renderedTexts(selection.rule, senderName).flatMap((text, index) => {
        const denial = replyLengthDenial(account.platform, destination || channel, text);
        return denial ? [{ ...denial, variantIndex: index, length: text.length }] : [];
      }) : [];
      return { ...selection, ...(destination ? { deliveryChannel: destination } : {}), contentValid: contentWarnings.length === 0, contentWarnings };
    });
    return clone({ ...(selections.find(selection => selection.matched) || selections[0]), ...(channel === 'comment' ? { deliveries: selections.filter(selection => selection.matched) } : {}) });
  }

  baselineFollowers(input) {
    record(input, '粉丝基线');
    const account = this._account(input.accountId);
    const observedAt = iso(input.observedAt, '基线观察时间');
    if (Date.parse(observedAt) > this._now() + 60000) throw new Error('基线观察时间不能在未来。');
    // The caller must pass the entire loaded snapshot, including old followers.
    // A later snapshot can only add known followers and advance the baseline.
    const followerIds = array(input.followerIds, '已加载粉丝编号', 100000).map(id => string(id, '粉丝编号', 1000, { required: true }));
    if (new Set(followerIds).size !== followerIds.length) throw new Error('粉丝编号不能重复。');
    return this._transaction(state => {
      let baseline = state.followBaselines.find(entry => entry.accountId === account.id);
      if (!baseline) { baseline = { accountId: account.id, observedAt }; state.followBaselines.push(baseline); }
      else if (Date.parse(observedAt) > Date.parse(baseline.observedAt)) baseline.observedAt = observedAt;
      const known = new Map(state.followers.filter(entry => entry.accountId === account.id).map(entry => [entry.senderId, entry]));
      for (const senderId of followerIds) {
        const existing = known.get(senderId);
        if (existing) existing.firstEventId = null;
        else {
          const follower = { accountId: account.id, senderId, firstEventId: null, firstSeenAt: observedAt };
          state.followers.push(follower); known.set(senderId, follower);
        }
      }
      for (const follower of known.values()) if (follower.firstEventId) {
        const event = state.messages.find(message => message.id === follower.firstEventId);
        if (!event || Date.parse(event.receivedAt) <= Date.parse(baseline.observedAt)) follower.firstEventId = null;
      }
      this._invalidateRules(state);
      return { ...baseline, followerCount: known.size };
    });
  }
  _observeMessage(state, message) {
    if (message.isOwn || message.isGroup) return;
    if (message.channel === 'dm' && (message.historical || normalize(message.text))) {
      const known = state.dmSenders.find(sender => sender.accountId === message.accountId && sender.senderId === message.senderId);
      if (!known) state.dmSenders.push({ accountId: message.accountId, senderId: message.senderId, firstMessageId: message.historical ? null : message.id, firstSeenAt: message.createdAt });
      // A late history page can prove a sender is not new. Revoke any unsent
      // welcome, without converting their next message into another first one.
      else if (message.historical && known.firstMessageId) { known.firstMessageId = null; this._invalidateRules(state); }
    }
    if (message.channel === 'follow') {
      const baseline = state.followBaselines.find(entry => entry.accountId === message.accountId);
      const known = state.followers.find(sender => sender.accountId === message.accountId && sender.senderId === message.senderId);
      if (!baseline || known || Date.parse(message.receivedAt) <= Date.parse(baseline.observedAt)) message.historical = true;
      if (!known) state.followers.push({ accountId: message.accountId, senderId: message.senderId, firstEventId: message.historical ? null : message.id, firstSeenAt: message.createdAt });
      else if (message.historical && known.firstEventId) {
        const first = state.messages.find(candidate => candidate.id === known.firstEventId);
        // Duplicate/refollow notifications do not revoke the first welcome.
        // A genuinely older history observation does invalidate its newness.
        if (first && Date.parse(message.receivedAt) < Date.parse(first.receivedAt)) { known.firstEventId = null; this._invalidateRules(state); }
      }
    }
  }
  setMode(input) {
    record(input, '回复模式');
    this._account(input.accountId);
    const channel = enumeration(input.channel, CHANNELS, '回复渠道');
    const mode = enumeration(input.mode, MODES, '回复模式');
    return this._transaction(state => {
      const oldMode = this._mode(state, input.accountId, channel);
      const entry = { accountId: input.accountId, channel, mode, updatedAt: this._date() };
      const existing = state.settings.modes.findIndex(item => item.accountId === input.accountId && item.channel === channel);
      if (existing === -1) state.settings.modes.push(entry); else state.settings.modes[existing] = entry;
      if (oldMode !== mode) this._cancelUnsent(state, reply => reply.accountId === input.accountId && (reply.channel === channel || channel === 'dm' && mode === 'off' && commentPrivate(reply)), 'mode_changed', '回复模式已改变，原待发送回复已撤销。');
      return entry;
    });
  }
  getMode(accountId, channel) {
    if (accountId && typeof accountId === 'object') ({ accountId, channel } = accountId);
    this._account(accountId);
    enumeration(channel, CHANNELS, '回复渠道');
    return this.#select(state => this._mode(state, accountId, channel));
  }
  // A bounded batch is one durable transaction. Only ingestion participates;
  // other mutations continue to use their normal locking/commit path.
  ingestMany(inputs) {
    if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 16) throw new Error('每批消息须为 1 至 16 条。');
    if (Buffer.byteLength(JSON.stringify(inputs), 'utf8') > 512 * 1024) throw new Error('本批消息过大，请分批读取。');
    if (this.#ingestBatch || this._readSnapshot !== undefined) throw new Error('当前读取或入库期间不能开始另一批入库。');
    return this._withLock(() => {
      const current = this.#readValidated();
      const batch = { current, mutable: null, dirty: false };
      this.#ingestBatch = batch;
      let results;
      try { results = Array.from(inputs, input => this.ingest(input)); }
      finally { this.#ingestBatch = null; }
      if (batch.dirty) this._write(batch.mutable);
      return results;
    });
  }
  #ingestTransaction(action, unchanged) {
    const batch = this.#ingestBatch;
    if (!batch) return this.#transaction(action, unchanged);
    const current = batch.mutable || batch.current;
    const inspected = unchanged?.(current);
    if (inspected && Object.hasOwn(inspected, UNCHANGED_INGEST)) return clone(inspected[UNCHANGED_INGEST]);
    // Never mutate the cached validated state: a later invalid input must leave
    // both the on-disk archive and subsequent reads exactly as they were.
    if (!batch.mutable) batch.mutable = clone(current);
    const result = action(batch.mutable);
    if (result && Object.hasOwn(result, UNCHANGED_INGEST)) return clone(result[UNCHANGED_INGEST]);
    if (result && result[REJECT]) throw result[REJECT];
    batch.dirty = true;
    return result === undefined ? undefined : clone(result);
  }
  ingest(input) {
    record(input, '新消息');
    const account = this._account(input.accountId);
    const now = this._now();
    const channel = enumeration(input.channel, CHANNELS, '消息渠道');
    const senderId = string(input.senderId, '发送者编号', 1000, { required: true });
    const logicalThread = `follower:${senderId}`;
    if (channel === 'follow' && input.threadId !== undefined && input.threadId !== logicalThread) throw new Error('关注事件的逻辑目标必须为 follower:<senderId>，不能使用真实会话编号。');
    const message = {
      id: randomUUID(), accountId: account.id, platform: account.platform,
      channel,
      externalId: string(input.externalId, '平台消息编号', 1000, { required: true }),
      threadId: channel === 'follow' ? logicalThread : string(input.threadId, '会话编号', 1000, { required: true }),
      senderId,
      senderName: string(input.senderName, '对方昵称', 200),
      text: string(input.text, '消息内容', 100000, { trim: false }),
      receivedAt: iso(input.receivedAt, '接收时间'),
      isOwn: boolean(input.isOwn, '自身消息标记'), isGroup: boolean(input.isGroup, '群聊标记'), historical: boolean(input.historical, '历史消息标记'),
      createdAt: this._date(now),
    };
    if (channel === 'follow') message.externalIdSource = enumeration(input.externalIdSource === undefined ? 'platform-event-id' : input.externalIdSource, ['platform-event-id', 'follower-id-and-time'], '关注事件编号来源');
    if (input.profileUrl !== undefined) message.profileUrl = messageProfileUrl({ ...message, profileUrl: input.profileUrl });
    if (Date.parse(message.receivedAt) > now + 60000) throw new Error('消息接收时间不能在未来。');
    return this.#ingestTransaction(state => {
      const existing = priorIngestMessage(state, message);
      if (existing) {
        let enriched = false;
        if (message.profileUrl !== undefined) {
          // A newly verified optional public link may enrich a legacy record;
          // its immutable message identity, age and newness remain unchanged.
          if (existing.profileUrl === undefined) { existing.profileUrl = message.profileUrl; enriched = true; }
        }
        return enriched ? existing : { [UNCHANGED_INGEST]: existing };
      }
      state.messages.unshift(message);
      this._observeMessage(state, message);
      const mode = this._mode(state, message.accountId, message.channel);
      if (message.isOwn || message.isGroup || message.historical || mode === 'off' || this._policyDenial(state, message, now, { schedule: false, limits: false })) return message;
      // A public reply and a private follow-up are independent rule lanes.
      // Existing data without deliveryChannel always remains the public lane.
      for (const destination of channel === 'comment' ? [undefined, 'dm'] : [undefined]) {
        const selection = this._selection(state, account, message.channel, message.text, message.senderName, this._eventContext(state, message), destination);
        if (!selection.rule) continue;
        const privateReply = destination === 'dm';
        if (privateReply && (this._mode(state, message.accountId, 'dm') === 'off' ||
            Date.parse(message.receivedAt) <= Date.parse(selection.rule.activatedAt) || Date.parse(message.createdAt) < Date.parse(selection.rule.activatedAt))) continue;
        const candidates = this._renderedTexts(selection.rule, message.senderName);
        const reply = {
          id: randomUUID(), messageId: message.id, accountId: message.accountId, channel: message.channel,
          ...(privateReply ? { deliveryChannel: 'dm' } : {}),
          ruleId: selection.rule.id, ruleRevision: selection.rule.revision, trigger: selection.rule.trigger, replyText: candidates[randomInt(candidates.length)],
          status: mode === 'auto' ? 'queued' : 'pending', modeAtCreation: mode,
          dueAt: this._date(now + selection.rule.delaySeconds * 1000),
          reasonCode: mode === 'auto' ? 'auto_queued' : 'awaiting_review', reason: mode === 'auto' ? '等待发送。' : '等待人工确认。',
          createdAt: this._date(now), updatedAt: this._date(now),
        };
        const duplicate = privateReply && this._commentPrivateDuplicate(state, message, reply.id, reply.replyText);
        const lengthDenial = replyLengthDenial(message.platform, deliveryChannel(reply), reply.replyText);
        if (duplicate) this._mark(reply, 'skipped', 'comment_dm_already_contacted', '此评论用户已有私信任务或发送记录，不会重复发送。');
        else if (lengthDenial) {
          this._mark(reply, 'skipped', lengthDenial.code, lengthDenial.error);
          reply.error = lengthDenial.error;
        } else {
          if (mode === 'auto' && PLATFORMS.includes(message.platform) && message.channel === 'follow') reply.preparationRetry = { version: 1, attempts: 0 };
          if (mode === 'auto' && now - Date.parse(message.receivedAt) > AUTO_MAX_AGE) this._mark(reply, 'skipped', 'message_too_old', '消息超过 10 分钟，仅保留记录，不自动回复。');
        }
        state.replies.unshift(reply);
      }
      return message;
    }, state => {
      const existing = priorIngestMessage(state, message);
      if (!existing) return undefined;
      if (message.profileUrl !== undefined && existing.profileUrl === undefined) return undefined;
      return { [UNCHANGED_INGEST]: existing };
    });
  }
  _commentPrivateDuplicate(state, message, replyId, replyText) {
    const sources = new Map(state.messages.map(source => [source.id, source]));
    return state.replies.some(other => {
      if (other.id === replyId || other.accountId !== message.accountId || !reservesCommentPrivate(other)) return false;
      if (!commentPrivate(other) && (!['dm', 'follow'].includes(deliveryChannel(other)) || other.replyText !== replyText)) return false;
      const source = sources.get(other.messageId);
      return source?.platform === message.platform && source.senderId === message.senderId;
    });
  }
  _recheck(state, reply, { approving = false } = {}) {
    const message = state.messages.find(item => item.id === reply.messageId);
    if (!message || message.accountId !== reply.accountId || message.channel !== reply.channel) return { error: '消息关联已失效。', code: 'message_mismatch' };
    if (reply.origin === 'manual-batch') {
      try {
        const manual = this._manualDraftCheck(state, { messageId: reply.messageId, replyText: reply.replyText }, { replyId: reply.id, schedule: false, limits: false });
        if (!approving && !reply.approvedAt) return { error: '请先确认此手动回复。', code: 'approval_required' };
        return { message: manual.message, rule: { cooldownMinutes: 0, delaySeconds: 0 }, mode: 'review' };
      } catch (error) { return { error: error.message, code: 'manual_reply_changed' }; }
    }
    if (message.isOwn || message.isGroup || message.historical) return { error: '自身、群聊和历史消息不参与自动回复。', code: 'ineligible_message' };
    let account;
    try { account = this._account(reply.accountId); } catch { return { error: '账号不存在或不支持互动。', code: 'account_unavailable' }; }
    if (account.platform !== message.platform) return { error: '账号平台与消息不匹配。', code: 'account_mismatch' };
    const lengthDenial = replyLengthDenial(message.platform, deliveryChannel(reply), reply.replyText);
    if (lengthDenial) return lengthDenial;
    const selection = this._selection(state, account, reply.channel, message.text, message.senderName, this._eventContext(state, message), reply.deliveryChannel);
    if (!selection.rule || selection.rule.id !== reply.ruleId || selection.rule.revision !== reply.ruleRevision || selection.rule.trigger !== reply.trigger || !this._renderedTexts(selection.rule, message.senderName).includes(reply.replyText)) return { error: '规则或匹配结果已变化，旧回复不能发送。', code: 'rule_changed' };
    if (commentPrivate(reply)) {
      if (this._mode(state, reply.accountId, 'dm') === 'off') return { error: '同账号私信渠道已关闭，评论私信不能发送。', code: 'mode_changed' };
      if (Date.parse(message.receivedAt) <= Date.parse(selection.rule.activatedAt) || Date.parse(message.createdAt) < Date.parse(selection.rule.activatedAt)) return { error: '评论早于本次规则启用，不自动补发私信。', code: 'comment_before_activation' };
      if (this._commentPrivateDuplicate(state, message, reply.id, reply.replyText)) return { error: '此评论用户已有私信任务或发送记录，不会重复发送。', code: 'comment_dm_already_contacted' };
    }
    const denial = this._policyDenial(state, message, this._now(), { schedule: false, limits: false });
    if (denial) return denial;
    const mode = this._mode(state, reply.accountId, reply.channel);
    if (mode === 'off' || mode !== reply.modeAtCreation) return { error: '回复模式已变化，旧回复不能发送。', code: 'mode_changed' };
    if (approving && mode !== 'review') return { error: '此回复不处于人工确认模式。', code: 'mode_changed' };
    if (!approving && mode === 'review' && !reply.approvedAt) return { error: '请先人工确认此回复。', code: 'approval_required' };
    return { message, rule: selection.rule, mode };
  }
  approveReply(replyId) {
    return this._transaction(state => {
      const reply = find(state.replies, replyId, '回复');
      if (reply.status === 'queued' && reply.approvedAt) return reply;
      if (reply.status !== 'pending') throw new Error('只有待确认回复可以批准。');
      const check = this._recheck(state, reply, { approving: true });
      if (check.error) { this._mark(reply, 'cancelled', check.code, check.error); return rejectAfterCommit(check.error); }
      const now = this._date();
      reply.approvedAt = now;
      this._mark(reply, 'queued', 'approved', '已确认，等待发送。', now);
      return reply;
    });
  }
  checkBatchReply(replyId) {
    // Read-only review: an expired preview must not approve, claim, skip or
    // cancel any item. The send path repeats these checks under its own lock.
    return this._withLock(() => {
      const state = this._read();
      const reply = find(state.replies, replyId, '回复');
      if (reply.channel !== 'dm' || reply.status !== 'pending' || reply.modeAtCreation !== 'review' || ['approvedAt', 'claimedAt', 'claimId', 'receipt', 'resolvedAt'].some(field => reply[field] !== undefined)) throw new Error('批量回复只接受尚未确认、尚未尝试发送的私信回复。');
      const check = this._recheck(state, reply, { approving: true });
      if (check.error) throw new Error(check.error);
      const now = this._now();
      if (Date.parse(reply.dueAt) > now || now < Date.parse(reply.createdAt) + check.rule.delaySeconds * 1000) throw new Error('尚未到此回复的发送时间，请稍后重新核对。');
      const denial = this._cooldownDenial(state, check.message, check.rule, now, reply.id) || this._policyDenial(state, check.message, now, { replyId: reply.id });
      if (denial) throw new Error(denial.error);
      const account = this._account(reply.accountId);
      return clone({ reply, message: check.message, rule: check.rule, account: { id: account.id, name: account.name, platform: account.platform } });
    });
  }
  cancelReply(replyId) {
    return this._transaction(state => {
      const reply = find(state.replies, replyId, '回复');
      if (reply.status === 'cancelled') return reply;
      if (!UNSENT.has(reply.status)) throw new Error('已开始发送或已结束的回复不能取消；结果不确定时请人工核对。');
      this._mark(reply, 'cancelled', 'user_cancelled', '已手动取消。');
      return reply;
    });
  }
  cancelAccountUnsent(accountId) {
    this._account(accountId);
    return this._transaction(state => {
      const count = state.replies.filter(reply => reply.accountId === accountId && UNSENT.has(reply.status)).length;
      this._cancelUnsent(state, reply => reply.accountId === accountId, 'account_stopped', '该账号任务已停止，未开始发送的回复已取消。');
      return count;
    });
  }
  pauseAccountPreservingPending(accountId) {
    this._account(accountId);
    // Internal login-repair path only. It disables every sending mode in one
    // durable transaction while retaining drafts and their immutable targets.
    // The regular setMode/cancelAccountUnsent cancellation semantics stay intact.
    return this._transaction(state => {
      const updatedAt = this._date();
      for (const channel of CHANNELS) {
        const entry = { accountId, channel, mode: 'off', updatedAt };
        const index = state.settings.modes.findIndex(item => item.accountId === accountId && item.channel === channel);
        if (index === -1) state.settings.modes.push(entry); else state.settings.modes[index] = entry;
      }
      return { accountId, modes: 'off', pendingPreserved: true };
    });
  }
  failBeforeSend(replyId, input) {
    record(input, '发送前检查结果');
    const code = enumeration(input.code === undefined ? 'preflight_failed' : input.code, ['preflight_failed', 'welcome_conversation_unavailable'], '发送前检查原因');
    const error = string(input.error, '发送前检查错误', 4000, { required: true, trim: false });
    return this._transaction(state => {
      const reply = find(state.replies, replyId, '回复');
      // Recheck under the same durable lock as beginSend. A late page error
      // must never replace a user cancellation or an existing send claim.
      if (!UNSENT.has(reply.status) || reply.claimedAt !== undefined || reply.claimId !== undefined) throw new Error('只有尚未领取的待确认或待发送回复可以记录发送前检查失败。');
      this._mark(reply, 'skipped', code, `未发送：${error}`.slice(0, 1000));
      reply.error = error;
      return reply;
    });
  }
  welcomePreparationRetryStatus(replyId) {
    return this._withLock(() => {
      const reply = find(this._read().replies, replyId, '回复'), retry = reply.preparationRetry;
      if (!retry?.attempts) return { ready: true };
      const now = this._now();
      if (now < Date.parse(retry.firstFailureAt) || now >= Date.parse(retry.deadlineAt)) return { ready: false, expired: true };
      return { ready: now >= Date.parse(retry.nextAttemptAt), nextAttemptAt: retry.nextAttemptAt };
    });
  }
  deferWelcomePreparation(replyId, input) {
    const failure = preparationFailure(input);
    return this._transaction(state => {
      const reply = find(state.replies, replyId, '回复'), retry = reply.preparationRetry;
      if (reply.status !== 'queued' || reply.channel !== 'follow' || reply.trigger !== 'follow' ||
          reply.modeAtCreation !== 'auto' || !retry || ['claimedAt', 'claimId', 'receipt', 'sentAt', 'finishedAt', 'resolvedAt'].some(field => reply[field] !== undefined)) {
        throw new Error('只有新建且从未领取的自动欢迎语可以恢复准备');
      }
      const check = this._recheck(state, reply);
      if (check.error) throw new Error(check.error);
      if (!PLATFORMS.includes(check.message.platform) || this._mode(state, reply.accountId, 'dm') === 'off') throw new Error('欢迎语原账号私信已停止，未恢复准备');
      const now = this._now();
      if (now < Date.parse(reply.createdAt)) throw new Error('欢迎语准备恢复时钟已回退，请检查原记录');
      if (retry.attempts && now < Date.parse(retry.nextAttemptAt)) throw new Error('欢迎语准备仍在等待恢复时间');
      const firstFailureAt = retry.firstFailureAt || this._date(now), deadlineAt = retry.deadlineAt || this._date(now + RETRY_WINDOW_MS);
      const delay = RETRY_DELAYS_MS[retry.attempts];
      if (delay === undefined || now < Date.parse(firstFailureAt) || now + delay >= Date.parse(deadlineAt) || now + delay - Date.parse(check.message.receivedAt) > AUTO_MAX_AGE) {
        this._mark(reply, 'skipped', 'preflight_failed', '欢迎语准备恢复次数或时限已用尽，尚未发送，请检查原记录。');
        reply.error = '欢迎语准备恢复次数或时限已用尽，尚未填写或提交消息。';
        return { deferred: false, exhausted: true };
      }
      reply.preparationRetry = { version: 1, attempts: retry.attempts + 1, firstFailureAt, deadlineAt,
        nextAttemptAt: this._date(now + delay), lastFailure: failure };
      this._mark(reply, 'queued', 'welcome_preparation_retry', `欢迎语页面暂未就绪，${delay / 1000} 秒后恢复准备（${retry.attempts + 1}/${RETRY_DELAYS_MS.length}）；尚未填写或发送。`);
      return { deferred: true, reason: 'welcome-preparation-retry', nextAttemptAt: reply.preparationRetry.nextAttemptAt };
    });
  }
  expireStaleAutoReply(replyId) {
    if (this._readSnapshot !== undefined) throw new Error('只读校验期间不能修改互动数据。');
    return this._withLock(() => {
      const state = this._read(), reply = find(state.replies, replyId, '回复');
      // This is a pre-page age check, never a claim/retry or manual approval.
      // Retain current pause, cancellation, manual and uncertain-result intent.
      if (reply.status !== 'queued' || reply.modeAtCreation !== 'auto' || reply.origin === 'manual-batch' ||
          ['claimedAt', 'claimId', 'receipt', 'sentAt', 'finishedAt', 'resolvedAt'].some(field => reply[field] !== undefined)) return false;
      const check = this._recheck(state, reply);
      if (check.error || check.mode !== 'auto' || this._now() - Date.parse(check.message.receivedAt) <= AUTO_MAX_AGE) return false;
      this._mark(reply, 'skipped', 'message_too_old', '消息超过 10 分钟，停止自动回复。');
      // Most calls are fresh. Only the terminal transition rewrites the store.
      this._write(state);
      return true;
    });
  }
  beginSend(replyId) {
    return this._transaction(state => {
      const reply = find(state.replies, replyId, '回复');
      if (reply.status !== 'queued') throw new Error('此回复不在待发送队列中，不能重复发送。');
      const check = this._recheck(state, reply);
      if (check.error) { this._mark(reply, 'cancelled', check.code, check.error); return rejectAfterCommit(check.error); }
      const now = this._now();
      if (reply.preparationRetry?.attempts) {
        const retry = reply.preparationRetry;
        if (now < Date.parse(retry.firstFailureAt) || now >= Date.parse(retry.deadlineAt)) {
          const reason = '欢迎语准备恢复已超过时限，尚未发送，请检查原记录。';
          this._mark(reply, 'skipped', 'preflight_failed', reason); return rejectAfterCommit(reason);
        }
        if (now < Date.parse(retry.nextAttemptAt)) throw new Error('欢迎语准备仍在等待恢复时间');
      }
      if (Date.parse(reply.dueAt) > now || now < Date.parse(reply.createdAt) + check.rule.delaySeconds * 1000) throw new Error('尚未到此回复的发送时间。');
      if (check.mode === 'auto' && now - Date.parse(check.message.receivedAt) > AUTO_MAX_AGE) {
        const reason = '消息超过 10 分钟，停止自动回复。';
        this._mark(reply, 'skipped', 'message_too_old', reason); return rejectAfterCommit(reason);
      }
      const denial = this._cooldownDenial(state, check.message, check.rule, now, reply.id) || this._policyDenial(state, check.message, now, { replyId: reply.id });
      if (denial) {
        this._mark(reply, 'skipped', denial.code, denial.error); return rejectAfterCommit(denial.error);
      }
      const claimedAt = this._date(now);
      reply.claimedAt = claimedAt;
      reply.claimId = randomUUID();
      this._mark(reply, 'sending', 'claimed', '正在发送；结果不确定时不会自动重试。', claimedAt);
      return { reply, message: check.message };
    });
  }
  assertCanCommit(replyId) {
    // Call synchronously immediately before the irreversible platform action.
    // This only verifies the existing claim; it never reclaims, rerolls text,
    // retries, or changes a result whose delivery may already be ambiguous.
    return this._withLock(() => {
      const state = this._read();
      const reply = find(state.replies, replyId, '回复');
      if (reply.status !== 'sending') throw new Error('只有已领取且仍在发送中的回复可以提交。');
      const check = this._recheck(state, reply);
      if (check.error) throw new Error(check.error);
      const now = this._now();
      if (Date.parse(reply.dueAt) > now || now < Date.parse(reply.createdAt) + check.rule.delaySeconds * 1000) throw new Error('尚未到此回复的发送时间。');
      if (check.mode === 'auto' && now - Date.parse(check.message.receivedAt) > AUTO_MAX_AGE) throw new Error('消息超过 10 分钟，停止自动回复。');
      const denial = this._cooldownDenial(state, check.message, check.rule, now, reply.id) || this._policyDenial(state, check.message, now, { replyId: reply.id });
      if (denial) throw new Error(denial.error);
      return true;
    });
  }
  finishSend(replyId, input) {
    record(input, '发送结果');
    const status = enumeration(input.status, ['sent', 'failed', 'unknown'], '发送结果');
    const proof = receipt(input.receipt, status === 'sent');
    const error = string(input.error, '发送错误', 4000, { trim: false });
    return this._transaction(state => {
      const reply = find(state.replies, replyId, '回复');
      if (reply.status !== 'sending') throw new Error('只有已领取的发送任务可以记录结果。');
      const now = this._date();
      this._mark(reply, status, status === 'sent' ? 'confirmed_sent' : status === 'unknown' ? 'send_uncertain' : 'send_failed', status === 'sent' ? '已有发送凭据。' : status === 'unknown' ? '发送结果不确定，请在平台人工核对；不会重试。' : '本次发送失败，不会自动重试。', now);
      if (proof !== undefined) reply.receipt = proof;
      if (error) reply.error = error;
      if (status === 'sent') reply.sentAt = now;
      return reply;
    });
  }
  resolveUnknown(replyId, input) {
    record(input, '人工核对结果');
    if (typeof input.sent !== 'boolean') throw new Error('请明确确认是否已发送。');
    const proof = receipt(input.receipt);
    return this._transaction(state => {
      const reply = find(state.replies, replyId, '回复');
      if (reply.status !== 'unknown') throw new Error('只有结果不确定的回复可以人工核对。');
      const now = this._date();
      this._mark(reply, input.sent ? 'sent' : 'failed', input.sent ? 'manually_confirmed_sent' : 'manually_confirmed_not_sent', input.sent ? '已人工核对为发送成功。' : '已人工核对为未发送；此任务不会再次发送。', now);
      reply.resolvedAt = now;
      reply.resolution = input.sent ? 'sent' : 'not-sent';
      if (input.sent) { reply.sentAt = now; reply.receipt = proof === undefined ? { kind: 'manual-confirmation', confirmedAt: now } : proof; }
      else if (proof !== undefined) reply.receipt = proof;
      return reply;
    });
  }
  confirmObservedReply(replyId,input){
    const evidence=receipt(input.receipt,true);
    return this._transaction(state=>{
      const reply=find(state.replies,replyId,'回复');
      if(reply.status!=='unknown'||reply.claimId!==input.claimId||reply.accountId!==input.accountId||reply.replyText!==input.text)throw new Error('自动核对与原回复领取记录不一致');
      if(typeof evidence!=='string'||!/^platform:\S+$/.test(evidence))throw new Error('自动核对缺少原平台回执');
      const at=this._date();
      this._mark(reply,'sent','platform_confirmed_sent','已自动核对原平台回执',at);
      reply.receipt=evidence;reply.sentAt=at;reply.resolvedAt=at;reply.resolution='sent';delete reply.error;
      return reply;
    });
  }
  confirmNativeMessages(accountId,proofs){
    this._account(accountId);
    if(!Array.isArray(proofs)||proofs.length>50)throw new Error('自动私信核对范围无效');
    const requests=new Set(proofs.map(p=>p?.requestId));
    if(!this.#select(state=>state.replies.some(r=>r.accountId===accountId&&r.status==='unknown'&&requests.has(r.claimId))))return {resolved:0};
    return this._transaction(state=>{
      let resolved=0;
      const byRequest=new Map(proofs.filter(p=>p&&typeof p.requestId==='string'&&/^\d{1,25}$/.test(p.messageId||'')).map(p=>[p.requestId,p]));
      const messages=new Map(state.messages.map(m=>[m.id,m]));
      for(const reply of state.replies){
        if(reply.accountId!==accountId||reply.status!=='unknown'||(reply.deliveryChannel||reply.channel)!=='dm')continue;
        const p=byRequest.get(reply.claimId),m=messages.get(reply.messageId);
        if(!p||!m||m.platform!=='douyin'||m.senderId!==p.peer||m.channel==='dm'&&m.threadId!==p.threadId)continue;
        const fingerprint=require('node:crypto').createHash('sha256').update(JSON.stringify([p.threadId,reply.replyText])).digest('hex');
        if(fingerprint!==p.fingerprint)continue;
        const at=this._date();this._mark(reply,'sent','platform_confirmed_sent','已从官网原消息核对发送结果',at);
        reply.receipt={kind:'platform-ack',requestId:reply.claimId,messageId:p.messageId};reply.sentAt=at;reply.resolvedAt=at;reply.resolution='sent';delete reply.error;resolved++;
      }
      return {resolved};
    });
  }
  shutdown() {
    return this._transaction(state => {
      this._cancelUnsent(state, () => true, 'shutdown', '工作台已停止，未开始发送的回复已取消。');
      return state.replies.filter(reply => reply.reasonCode === 'shutdown');
    });
  }

  _validate(input) {
    const readIso = createIsoScope();
    record(input, '互动数据');
    if (input.schemaVersion !== 1) throw new Error('互动数据版本不受支持。');
    const state = initialState();
    for (const name of ['rules', 'messages', 'replies']) {
      array(input[name], name, Number.MAX_SAFE_INTEGER);
      const ids = new Set();
      for (const item of input[name]) {
        record(item, name); identifier(item.id);
        if (ids.has(item.id)) throw new Error('互动数据存在重复记录。');
        ids.add(item.id);
      }
    }
    state.rules = input.rules.map(rule => {
      const validated = this._rule(rule, null);
      const result = { ...validated, id: identifier(rule.id), revision: integer(rule.revision, 1, Number.MAX_SAFE_INTEGER, '规则版本'), createdAt: readIso(rule.createdAt), updatedAt: readIso(rule.updatedAt), ...(commentPrivate(validated) ? { activatedAt: readIso(rule.activatedAt, '评论私信启用时间') } : {}) };
      if (commentPrivate(result) && (Date.parse(result.activatedAt) < Date.parse(result.createdAt) || Date.parse(result.activatedAt) > Date.parse(result.updatedAt))) throw new Error('评论私信启用时间与规则记录不一致。');
      return result;
    });
    const messageKeys = new Set();
    state.messages = input.messages.map(message => {
      const result = {
        id: identifier(message.id), accountId: identifier(message.accountId), platform: enumeration(message.platform, PLATFORMS, '消息平台'), channel: enumeration(message.channel, CHANNELS, '消息渠道'),
        externalId: string(message.externalId, '平台消息编号', 1000, { required: true }), threadId: string(message.threadId, '会话编号', message.channel === 'follow' ? 1009 : 1000, { required: true }), senderId: string(message.senderId, '发送者编号', 1000, { required: true }),
        senderName: string(message.senderName, '对方昵称', 200), text: string(message.text, '消息内容', 100000, { trim: false }), receivedAt: readIso(message.receivedAt),
        isOwn: boolean(message.isOwn, '自身消息标记'), isGroup: boolean(message.isGroup, '群聊标记'), historical: boolean(message.historical, '历史消息标记'), createdAt: readIso(message.createdAt),
      };
      if (result.channel === 'follow') {
        if (result.threadId !== `follower:${result.senderId}`) throw new Error('关注事件的逻辑目标不正确。');
        result.externalIdSource = enumeration(message.externalIdSource === undefined ? 'platform-event-id' : message.externalIdSource, ['platform-event-id', 'follower-id-and-time'], '关注事件编号来源');
      }
      if (message.profileUrl !== undefined) result.profileUrl = messageProfileUrl({ ...result, profileUrl: message.profileUrl });
      const key = JSON.stringify([result.accountId, result.channel, result.externalId]);
      if (messageKeys.has(key)) throw new Error('互动数据存在重复平台消息。');
      messageKeys.add(key);
      return result;
    });
    // These indexes belong only to this validation of freshly read data.
    // Duplicate message IDs have already been rejected above.
    const messageById = new Map(state.messages.map(message => [message.id, message]));
    const baselineKeys = new Set();
    state.followBaselines = array(input.followBaselines === undefined ? [] : input.followBaselines, '粉丝基线', Number.MAX_SAFE_INTEGER).map(entry => {
      record(entry, '粉丝基线');
      const result = { accountId: identifier(entry.accountId), observedAt: readIso(entry.observedAt) };
      if (baselineKeys.has(result.accountId)) throw new Error('粉丝基线不能重复。');
      baselineKeys.add(result.accountId);
      return result;
    });
    const baselineByAccount = new Map(state.followBaselines.map(baseline => [baseline.accountId, baseline]));
    for (const [field, channel, firstField] of [['dmSenders', 'dm', 'firstMessageId'], ['followers', 'follow', 'firstEventId']]) {
      const keys = new Set();
      state[field] = array(input[field] === undefined ? [] : input[field], '已知用户', Number.MAX_SAFE_INTEGER).map(entry => {
        record(entry, '已知用户');
        const result = { accountId: identifier(entry.accountId), senderId: string(entry.senderId, '发送者编号', 1000, { required: true }), [firstField]: entry[firstField] === null ? null : identifier(entry[firstField]), firstSeenAt: readIso(entry.firstSeenAt) };
        const key = userKey(result.accountId, result.senderId);
        if (keys.has(key)) throw new Error('已知用户不能重复。');
        keys.add(key);
        if (result[firstField]) {
          const message = messageById.get(result[firstField]);
          if (!message || message.accountId !== result.accountId || message.senderId !== result.senderId || message.channel !== channel || message.isOwn || message.isGroup || message.historical || (channel === 'dm' && !normalize(message.text))) throw new Error('首次事件关联不正确。');
          if (channel === 'follow') {
            const baseline = baselineByAccount.get(result.accountId);
            if (!baseline || Date.parse(message.receivedAt) <= Date.parse(baseline.observedAt)) throw new Error('首次关注事件缺少有效基线。');
          }
        }
        return result;
      });
      // Migration only establishes known identities. Existing 0.2 messages must
      // never become new welcome opportunities when the feature is enabled.
      for (const message of state.messages) if (message.channel === channel && !message.isOwn && !message.isGroup && (channel === 'follow' || message.historical || normalize(message.text))) {
        const key = userKey(message.accountId, message.senderId);
        if (!keys.has(key)) {
          keys.add(key);
          state[field].push({ accountId: message.accountId, senderId: message.senderId, [firstField]: null, firstSeenAt: message.createdAt });
        }
      }
    }
    state.replies = input.replies.map(reply => {
      const manual = reply.origin === 'manual-batch';
      if (reply.origin !== undefined && !manual) throw new Error('回复来源不正确。');
      const result = {
        id: identifier(reply.id), messageId: identifier(reply.messageId), accountId: identifier(reply.accountId), channel: enumeration(reply.channel, CHANNELS, '回复渠道'),
        ...(manual ? { origin: 'manual-batch', cooldownMinutes: integer(reply.cooldownMinutes, 0, 0, '手动回复冷却分钟') } : { ruleId: identifier(reply.ruleId), ruleRevision: integer(reply.ruleRevision, 1, Number.MAX_SAFE_INTEGER, '回复规则版本'), trigger: enumeration(reply.trigger === undefined ? 'message' : reply.trigger, TRIGGERS, '回复触发方式') }), replyText: string(reply.replyText, '回复内容', manual ? 2000 : 40000, { required: true, trim: false }),
        status: enumeration(reply.status, STATUSES, '回复状态'), modeAtCreation: enumeration(reply.modeAtCreation, ['review', 'auto'], '原回复模式'), dueAt: readIso(reply.dueAt),
        reason: string(reply.reason, '回复说明', 1000), reasonCode: string(reply.reasonCode, '回复原因', 100, { required: true }), createdAt: readIso(reply.createdAt), updatedAt: readIso(reply.updatedAt),
      };
      if (reply.deliveryChannel !== undefined) {
        if (manual || reply.deliveryChannel !== 'dm' || result.channel !== 'comment' || result.trigger !== 'message') throw new Error('评论私信回复渠道不正确。');
        result.deliveryChannel = 'dm';
      }
      if (manual && (result.channel !== 'dm' || result.modeAtCreation !== 'review' || ['ruleId', 'ruleRevision', 'trigger'].some(field => reply[field] !== undefined))) throw new Error('手动批量回复来源与渠道不正确。');
      for (const field of ['approvedAt', 'claimedAt', 'sentAt', 'finishedAt', 'resolvedAt']) if (reply[field] !== undefined) result[field] = readIso(reply[field]);
      if (reply.claimId !== undefined) result.claimId = identifier(reply.claimId);
      if (reply.error !== undefined) result.error = string(reply.error, '发送错误', 4000, { trim: false });
      if (reply.resolution !== undefined) result.resolution = enumeration(reply.resolution, ['sent', 'not-sent'], '核对结果');
      const proof = receipt(reply.receipt, reply.status === 'sent');
      if (proof !== undefined) result.receipt = proof;
      const message = messageById.get(result.messageId);
      if (!message || message.accountId !== result.accountId || message.channel !== result.channel) throw new Error('回复关联消息不正确。');
      if (commentPrivate(result) && message.platform !== 'douyin') throw new Error('评论私信目前仅支持抖音。');
      if (reply.preparationRetry !== undefined) {
        const retry = record(reply.preparationRetry, '欢迎语准备恢复');
        if (retry.version !== 1 || manual || result.channel !== 'follow' || result.trigger !== 'follow' || result.modeAtCreation !== 'auto' || !PLATFORMS.includes(message.platform)) throw new Error('欢迎语准备恢复与原回复不一致。');
        const attempts = integer(retry.attempts, 0, RETRY_DELAYS_MS.length, '准备恢复次数');
        const keys = attempts ? ['version', 'attempts', 'firstFailureAt', 'deadlineAt', 'nextAttemptAt', 'lastFailure'] : ['version', 'attempts'];
        if (Object.keys(retry).length !== keys.length || Object.keys(retry).some(key => !keys.includes(key))) throw new Error('欢迎语准备恢复字段不正确。');
        result.preparationRetry = { version: 1, attempts };
        if (attempts) {
          const firstFailureAt = readIso(retry.firstFailureAt), deadlineAt = readIso(retry.deadlineAt), nextAttemptAt = readIso(retry.nextAttemptAt);
          if (Date.parse(firstFailureAt) < Date.parse(result.createdAt) || Date.parse(deadlineAt) !== Date.parse(firstFailureAt) + RETRY_WINDOW_MS ||
              Date.parse(nextAttemptAt) <= Date.parse(firstFailureAt) || Date.parse(nextAttemptAt) >= Date.parse(deadlineAt)) throw new Error('欢迎语准备恢复时间不正确。');
          Object.assign(result.preparationRetry, { firstFailureAt, deadlineAt, nextAttemptAt, lastFailure: preparationFailure(retry.lastFailure) });
        }
      }
      if (['sending', 'sent', 'failed', 'unknown'].includes(result.status) && (!result.claimedAt || !result.claimId)) throw new Error('回复缺少发送领取记录。');
      return result;
    });
    if (new Set(state.replies.map(reply => JSON.stringify([reply.messageId, reply.deliveryChannel || 'source']))).size !== state.replies.length) throw new Error('同一消息同一回复渠道存在多条回复记录。');
    const attemptIds = new Set(state.replies.map(reply => reply.id)), attemptTargets = new Map();
    state.externalAttempts = array(input.externalAttempts === undefined ? [] : input.externalAttempts, '协作发送记录', Number.MAX_SAFE_INTEGER).map(value => {
      const attempt = externalAttempt(value);
      const previous = attemptTargets.get(attempt.targetKey);
      if (attemptIds.has(attempt.id) || (previous && !linkedFollowupAttempt(attempt, previous) && !linkedFollowupAttempt(previous, attempt))) throw new Error('协作发送领取记录重复。');
      attemptIds.add(attempt.id); attemptTargets.set(attempt.targetKey, attempt);
      if (attempt.sourceKind !== 'fan-directory') {
        const message = messageById.get(attempt.sourceMessageId);
        if (!message || message.accountId !== attempt.primaryAccountId || message.platform !== attempt.platform || message.senderId !== attempt.recipientId || message.externalId !== attempt.sourceExternalId || message.isOwn || message.isGroup || (attempt.channel === 'comment' && message.channel !== 'comment')) throw new Error('协作发送记录与真实来源不一致。');
      }
      return attempt;
    });
    record(input.settings, '互动设置');
    if (input.settings.defaultMode !== 'review') throw new Error('默认回复模式必须为人工确认。');
    state.settings.policy = input.settings.policy === undefined ? defaultPolicy() : policy(input.settings.policy);
    const modeKeys = new Set();
    state.settings.modes = array(input.settings.modes, '账号回复设置', Number.MAX_SAFE_INTEGER).map(entry => {
      record(entry, '账号回复设置');
      const result = { accountId: identifier(entry.accountId), channel: enumeration(entry.channel, CHANNELS, '回复渠道'), mode: enumeration(entry.mode, MODES, '回复模式'), updatedAt: readIso(entry.updatedAt) };
      const key = `${result.accountId}:${result.channel}`;
      if (modeKeys.has(key)) throw new Error('账号回复设置重复。');
      modeKeys.add(key); return result;
    });
    return state;
  }
}

module.exports = { InteractionStore };
