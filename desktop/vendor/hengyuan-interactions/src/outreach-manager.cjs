'use strict';

const { builtinProfile, builtinScript } = require('./builtin-adapter.cjs');
const { publicCommentScript } = require('./public-comment-adapter.cjs');
const { validateProfileUrl, outreachDigest } = require('./outreach.cjs');
const { recipientEntryScript, recipientNavigationScript, recipientIdentityScript, recipientCleanupScript } = require('./recipient-entry.cjs');
const { idlePageScript } = require('./idle-page.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// Comment sources already contain a numeric author UID. A first conversation
// must prove the same UID at that exact profile, rather than treating the
// profile route (secUID) as a chat recipient or switching back to history.
const hasCommentProfile = task => task.platform === 'douyin' && task.channel === 'dm' && task.sourceKind === undefined && task.sourceChannel === 'comment' &&
  /^[1-9]\d{0,63}$/.test(task.recipientId) && typeof task.profileUrl === 'string' && /^https:\/\/www\.douyin\.com\/user\/MS4w[A-Za-z0-9_-]{1,250}$/.test(task.profileUrl);
const PAGE_OPERATIONS = new Set(['scan', 'probe', 'probeComposer', 'activateFirst', 'activateProfileTarget', 'selectThread', 'send', 'commit', 'receipt', 'profile-identity', 'recipient-entry', 'recipient-navigation']);
const PROFILE_HISTORY_FAILURES = Object.freeze({
  PROFILE_HISTORY_SENDER_MISMATCH: { scope: 'account', code: 'profile-history-sender-mismatch' },
  PROFILE_HISTORY_RECIPIENT_MISMATCH: { scope: 'task', code: 'profile-history-recipient-mismatch' },
  PROFILE_HISTORY_KIND_MISMATCH: { scope: 'task', code: 'profile-history-kind-mismatch' },
  PROFILE_HISTORY_NAME_MISMATCH: { scope: 'task', code: 'profile-history-name-mismatch' },
});
function pageLoadTimeout(detail) { return Object.assign(new Error(detail), { code: 'PAGE_LOAD_TIMEOUT' }); }
function profilePendingDetail(scan) {
  const stage = ['conversation', 'profile-title', 'identity'].includes(scan?.renderStage) ? scan.renderStage : '';
  const detail = typeof scan?.detail === 'string' ? scan.detail : '';
  // Keep only fixed reader diagnostics and bounded surface counts. Arbitrary
  // page text, identifiers, URLs or account data must not enter timeout logs.
  const safe = ['主页名称与当前私信标题不一致，已停止读取', '尚未识别到当前登录账号，请登录并打开一段私信', '请打开一段私信以检查连接'].includes(detail) ||
    /^主页私信输入框或标题尚未加载完成（输入:\d{1,3}; RightPanel:\d{1,3}\/\d{1,3}; Stack:\d{1,3}\/\d{1,3}; 主页标题:\d{1,3}; 消息面板:\d{1,3}）$/.test(detail);
  if (safe) return `；最近检查${stage ? `（${stage}）` : ''}：${detail}`;
  return stage ? `；最近检查阶段：${stage}，页面仍在加载` : '';
}
function profileActivationDetail(page, scan) {
  const attempts = Number.isSafeInteger(page.profileActivationChecks) && page.profileActivationChecks >= 0 ? Math.min(page.profileActivationChecks, 999) : 0;
  const known = ['固定接收人的单聊列表行尚未加载，当前未填写或发送', '固定接收人的单聊列表行尚未可见，当前未填写或发送', '主页已有或正在加载单聊面板，将重新核对，未切换历史会话'];
  const detail = known.includes(page.profileActivationPending) ? page.profileActivationPending : attempts ? '等待下一次完整面板核对' : '尚未触发列表选择核对';
  const listOnly = scan?.profileListOnly === true ? '是' : scan?.profileListOnly === false ? '否' : '未返回';
  return `；会话选择诊断（范围:固定主页; 仅列表:${listOnly}; 核对次数:${attempts}; 已点击:${page.profileTargetActivated === true ? '是' : '否'}; 最近结果:${detail}）`;
}
function profileOperationError(result, fallback) {
  const error = new Error(result?.detail || fallback);
  // This is a structured observation from our fixed profile reader, not a
  // conclusion that the recipient was deleted or the sender's login expired.
  // Preserve it across the page/manager boundary instead of flattening every
  // unreadable profile into an unrelated task error.
  if (result?.ok === false && result.renderPending === false && result.stage === 'profile-unavailable') error.profileStage = result.stage;
  if (result?.ok === false && result.renderPending !== true && Object.hasOwn(PROFILE_HISTORY_FAILURES, result.errorCode)) error.code = result.errorCode;
  return error;
}
function operationFailure(error, stage, committed = false) {
  if (committed) return { outcome: 'unknown', scope: 'account', code: 'delivery-unknown', stage,
    detail: '消息可能已提交，但未取得确定结果；请核对该账号，本条不会重发。' };
  if (error?.failure) return error.failure;
  const detail = String(error?.message || '当前任务未完成，未提交消息。').slice(0, 1500);
  // Only fixed reader codes before a claim qualify for local deferral. A
  // submitted/ambiguous delivery and frozen task/binding changes keep their
  // existing stronger handling; arbitrary error text cannot opt into this.
  if (stage === 'preflight' && Object.hasOwn(PROFILE_HISTORY_FAILURES, error?.code)) return { outcome: 'not-sent', ...PROFILE_HISTORY_FAILURES[error.code], stage, detail };
  if (stage === 'preflight' && ['PAGE_OPERATION_TIMEOUT', 'PAGE_LOAD_TIMEOUT'].includes(error?.code)) return { outcome: 'not-sent', scope: 'task', code: 'page-load-timeout', stage, detail };
  if (error?.profileStage === 'profile-unavailable') return { outcome: 'not-sent', scope: 'account', code: 'profile-unavailable', stage,
    detail: '当前发送账号的网页显示“用户不存在”，尚不能区分单个主页不可用与账号网页会话异常。本条未提交。批量执行时将暂缓该账号的后续任务，请先检查主页和登录状态，必要时重新登录后复查。' };
  const identityMismatch = /协作账号登录身份|平台登录账号已变化|粉丝主页登录账号与任务不一致|(?:接收人|收件人).*(?:冲突|不一致|映射已失效|无法对应|无法唯一核对|无法唯一确认)|粉丝目录身份与主页不一致|粉丝主页身份返回值无法核对|粉丝主页身份在核对时发生变化|粉丝主页组件身份不唯一|会话切换后无法再次确认接收人|后台切换后无法核对发送账号或接收人|主账号或发送账号的登录绑定已变化|主账号与协作账号的关联已变化|粉丝目录来源或主账号身份已变化|主账号来源或接收对象已失效|来源记录早于本次登录绑定或已验证主页发生变化|请先从已核验的粉丝主页确认真实私信接收人/.test(detail);
  const unavailable = /官方页面要求登录或安全验证|粉丝主页有登录、验证|粉丝主页登录状态未通过核对|请.*(?:完成登录|登录后|登录或验证)|需先登录并检查连接|登录.*(?:失效|过期)/.test(detail);
  return { outcome: 'not-sent', scope: identityMismatch ? 'batch' : unavailable ? 'account' : 'task', code: identityMismatch ? 'identity-mismatch' : unavailable ? 'account-unavailable' : 'task-error', stage, detail };
}
function verifiedRejection(value, threadId) {
  const scope = { 'recipient-restricted': 'task', 'account-limit': 'account', 'account-unavailable': 'account', 'task-error': 'task' }[value?.code];
  const prefix = `platform-rejection:${threadId}:client:`;
  return scope && value.outcome === 'not-sent' && value.scope === scope && value.stage === 'receipt' &&
    typeof value.detail === 'string' && value.detail.length > 0 && value.detail.length <= 1500 &&
    typeof value.evidence === 'string' && value.evidence.startsWith(prefix) && value.evidence.length > prefix.length && value.evidence.length <= 1024 && !/\s/.test(value.evidence);
}

// Explicit, one-task-at-a-time execution. It never reuses the monitoring page,
// changes a channel's reply mode, or retries a submitted/ambiguous task.
class OutreachManager {
  constructor({ studio, tasks, createWindow, changed = () => {}, wait = sleep, operationTimeoutMs = 10000, now = Date.now, maxPages = 4, idleTimeoutMs = 60000 }) {
    if (typeof now !== 'function') throw new Error('协作页面时钟设置不正确');
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 32 || !Number.isFinite(idleTimeoutMs) || idleTimeoutMs < 1) throw new Error('后台页面资源设置不正确');
    Object.assign(this, { studio, tasks, createWindow, changed, wait, operationTimeoutMs, now, maxPages, idleTimeoutMs });
    this.pages = new Map(); this.busyAccounts = new Set(); this.checkingCount = 0; this.suspended = false; this.stopped = false;
    this.accountOperations = new Map(); this.releasingAccounts = new Set(); this.idleTimer = null;
  }
  async withAccountOperation(id, kind, operation) {
    const task = this.tasks.get(id), accountId = task.accountId;
    if (this.accountOperations.has(accountId) || this.releasingAccounts.has(accountId) || this.busyAccounts.has(accountId)) throw new Error('这个账号正在处理另一项任务（核对、发送或释放后台页面），请稍后重试');
    const lease = { id, kind }; this.accountOperations.set(accountId, lease); this.checkingCount++;
    try {
      // Reclaim previous unclaimed checks before allocating another task page.
      await this.releaseIdle({ accountId, all: true, excludeId: id, owner: lease });
      if (!this.pages.has(id) && this.pages.size >= this.maxPages) await this.releaseIdle({ all: true, excludeId: id, owner: lease });
      return await operation();
    } finally {
      if (this.accountOperations.get(accountId) === lease) this.accountOperations.delete(accountId);
      const page = this.pages.get(id);
      try { if (page) { page.lastUsedAt = this.now(); if (!page.ready && kind !== 'diagnose') await this.releaseIdlePage(page); } }
      catch { /* Cleanup is observational and cannot replace a durable result. */ }
      this.checkingCount--;
      this.scheduleIdleRelease();
    }
  }
  scheduleIdleRelease() {
    if (this.idleTimer || this.stopped || !this.pages.size) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      void this.releaseIdle().catch(() => {}).finally(() => this.scheduleIdleRelease());
    }, this.idleTimeoutMs);
    this.idleTimer.unref?.();
  }
  idleReason(page, { owner } = {}) {
    if (!page || this.pages.get(page.id) !== page || page.win.isDestroyed()) return 'closed';
    const active = this.accountOperations.get(page.accountId);
    if (this.releasingAccounts.has(page.accountId) || (active && (active !== owner || active.id === page.id)) || this.busyAccounts.has(page.accountId) || page.pending.size) return 'busy';
    if (page.hasBeenShown || page.win.isVisible?.() === true) return 'visible';
    const task = this.tasks.get(page.id);
    if (task.accountId !== page.accountId) return 'page-changed';
    if (task.status === 'sending' || task.status === 'unknown') return task.status;
    const terminal = task.status === 'sent' || task.status === 'failed' && task.failure?.outcome === 'not-sent';
    if ((page.claimStarted || task.claimedAt) && !terminal) return 'claimed';
    if (!terminal && !['review', 'failed', 'cancelled'].includes(task.status)) return 'status';
    return '';
  }
  async releaseIdlePage(page, { owner } = {}) {
    let reason;
    try { reason = this.idleReason(page, { owner }); } catch { reason = 'unverified'; }
    if (reason) return { released: false, reason };
    let generation, task, url, digest, frame;
    try { generation = page.generation; task = this.tasks.get(page.id); url = page.win.webContents.getURL(); digest = outreachDigest(task); frame = this.captureReadyFrame(page, generation, url); }
    catch { return { released: false, reason: 'unverified' }; }
    this.releasingAccounts.add(page.accountId); page.releasing = true;
    let timer;
    try {
      const result = await Promise.race([(frame || page.win.webContents).executeJavaScript(idlePageScript(task.platform, url), false),
        new Promise(resolve => { timer = setTimeout(() => resolve(null), Math.min(this.operationTimeoutMs, 1500)); })]);
      this.releasingAccounts.delete(page.accountId);
      if (result?.ok !== true || result.safeToClose !== true) { page.retainedReason = ['draft', 'dialog', 'page-changed'].includes(result?.reason) ? result.reason : 'unverified'; return { released: false, reason: page.retainedReason }; }
      const current = this.tasks.get(page.id);
      if (page.generation !== generation || page.win.webContents.getURL() !== url || (frame && this.captureReadyFrame(page, generation, url) !== frame) || outreachDigest(current) !== digest || current.status !== task.status || current.claimedAt !== task.claimedAt || this.idleReason(page, { owner })) return { released: false, reason: 'changed' };
      page.ready = false; page.win.destroy();
      return { released: true };
    } catch { return { released: false, reason: 'unverified' }; }
    finally { clearTimeout(timer); page.releasing = false; this.releasingAccounts.delete(page.accountId); }
  }
  async releaseIdle({ accountId, all = false, excludeId, owner } = {}) {
    const summary = { released: 0, retained: 0, reasons: {} };
    for (const page of [...this.pages.values()]) {
      if (page.id === excludeId || accountId && page.accountId !== accountId) continue;
      const age = this.now() - page.lastUsedAt;
      if (!all && (!Number.isFinite(age) || age < this.idleTimeoutMs)) continue;
      const result = await this.releaseIdlePage(page, { owner });
      if (result.released) summary.released++;
      else { summary.retained++; summary.reasons[result.reason] = (summary.reasons[result.reason] || 0) + 1; }
    }
    return summary;
  }
  async releaseCheck(id) {
    const task = this.tasks.get(id), page = this.pages.get(id);
    if (!page) return { released: 0, retained: 0, reasons: {} };
    if (this.accountOperations.has(task.accountId) || this.busyAccounts.has(task.accountId) || page.claimStarted || task.claimedAt || ['sending', 'unknown', 'sent'].includes(task.status)) return { released: 0, retained: 1, reasons: { busy: 1 } };
    page.ready = false;
    const result = await this.releaseIdlePage(page);
    return { released: result.released ? 1 : 0, retained: result.released ? 0 : 1, reasons: result.released ? {} : { [result.reason]: 1 } };
  }
  resourceSnapshot() {
    const reasons = {};
    for (const page of this.pages.values()) {
      let reason; try { reason = this.idleReason(page) || page.retainedReason || 'idle'; } catch { reason = 'unverified'; }
      reasons[reason] = (reasons[reason] || 0) + 1;
    }
    return { pages: this.pages.size, limit: this.maxPages, activeAccounts: this.accountOperations.size, releasingAccounts: this.releasingAccounts.size, reasons };
  }
  assertCurrent(page, generation) {
    if (this.stopped || this.suspended || page.generation !== generation || page.win.isDestroyed() || this.pages.get(page.id) !== page) throw new Error('协作页面已停止或发生变化，未继续发送');
    if (page.batchId && !this.batchController?.isAuthorized(page.id, page.batchId)) throw new Error('此批次已停止，未继续发送');
    if (!page.batchId && this.batchController?.active) throw new Error('批次已开始，原单条操作停止');
  }
  assertBatchAccess(id, batchId) {
    if (batchId ? !this.batchController?.isAuthorized(id, batchId) : this.batchController?.active) throw new Error('批量任务正在处理或已经停止，请先检查批次状态');
    if (this.stopped || this.suspended) throw new Error('工作台正在停止或休眠，当前不能继续处理');
  }
  assertReadCurrent(page, generation) {
    this.assertBatchAccess(page.id);
    if (page.generation !== generation || page.win.isDestroyed() || this.pages.get(page.id) !== page) throw new Error('处理页面已关闭或发生变化，无法继续只读诊断');
    if (this.busyAccounts.has(page.accountId)) throw new Error('这个账号正在发送，暂不能诊断页面');
  }
  isXhsChatRoute(page, value) {
    try {
      const task = this.tasks.get(page.id), url = new URL(value);
      return task.platform === 'xiaohongshu' && task.channel === 'dm' && url.origin === 'https://www.xiaohongshu.com' &&
        !url.username && !url.password && !url.hash && /^\/chat(?:\/[^/]+)?\/?$/.test(url.pathname) &&
        url.searchParams.getAll('openUid').length <= 1 && (!url.searchParams.has('openUid') || url.searchParams.get('openUid') === task.recipientId);
    } catch { return false; }
  }
  assertXhsReadyDocument(page, task) {
    if (task.platform !== 'xiaohongshu' || task.channel !== 'dm') return;
    const pinned = page.xhsReadyDocument, wc = page.win.webContents;
    if (!pinned || pinned.generation !== page.generation || pinned.url !== wc.getURL() ||
        pinned.frame !== (wc.mainFrame || null) || pinned.frame && pinned.frame.url !== pinned.url || !this.isXhsChatRoute(page, pinned.url)) {
      throw new Error('小红书已核对的单聊文档发生变化，当前操作已停止，请重新核对');
    }
  }
  cancelPage(page, { reason = 'cancelled', url } = {}) {
    page.generation++;
    page.domReadyGeneration = null; page.domReadyUrl = null; page.domReadyFrame = null;
    const interruption = Object.freeze({ reason, url, generation: page.generation });
    // Keep enough consecutive invalidations to reject an intervening foreign
    // navigation, even if the page returns to its original URL before a read.
    page.interruptions = [...(page.interruptions || []), interruption].slice(-32);
    const detail = { navigation: '协作页面正在导航，当前操作已中断', closed: '协作页面已关闭，当前操作已中断', 'renderer-gone': '协作页面进程已退出，当前操作已中断', timeout: '协作页面操作超时，当前操作已中断', stopped: '协作页面操作已停止' }[reason] || '协作页面操作已取消';
    for (const cancel of [...page.pending]) cancel(Object.assign(new Error(detail), { pageInterruption: interruption }));
  }
  captureReadyFrame(page, generation, url) {
    if (page.domReadyGeneration !== generation) return null;
    const wc = page.win.webContents, frame = wc.mainFrame;
    if (page.domReadyUrl !== url) {
      // A Vue pushState route uses the same already DOM-ready document. Only
      // the XHS official chat route with the same recipient, native frame and
      // generation may update its ready URL; no new dom-ready event is due.
      if (!frame || frame !== page.domReadyFrame || wc.getURL() !== url || frame.url !== url ||
          !this.isXhsChatRoute(page, page.domReadyUrl) || !this.isXhsChatRoute(page, url)) return null;
      page.domReadyUrl = url;
    }
    if (wc.getURL() !== url || !frame || frame !== page.domReadyFrame || frame.url !== url || typeof frame.executeJavaScript !== 'function') throw new Error('协作页面当前文档已变化，请重新核对');
    return frame;
  }
  async run(page, operation, payload = {}, options = {}) {
    const generation = page.generation;
    if(operation==='receipt'&&options.independentRead)this.assertReadCurrent(page,generation);
    else this.assertCurrent(page, generation);
    const task = this.tasks.get(page.id);
    if(options.independentRead&&(operation!=='receipt'||task.status!=='unknown'||!task.claimedAt||payload.claimedAt!==task.claimedAt))throw new Error('只读复核与原任务领取时间不一致');
    const recipientOperation = ['probeComposer', 'send', 'commit', 'receipt'].includes(operation);
    if (page.profileChat || task.sourceKind === 'fan-directory' && recipientOperation) {
      const mapping = page.recipientMapping;
      if (!mapping || mapping.profileUrl !== task.profileUrl || mapping.identity !== task.senderBinding.identity || (recipientOperation && mapping.recipientId !== payload.recipientId) ||
          !/^[1-9]\d{0,63}$/.test(mapping.recipientId) || (task.sourceKind === 'fan-directory' ? task.recipientId !== new URL(task.profileUrl).pathname.slice('/user/'.length) : !hasCommentProfile(task) || task.recipientId !== mapping.recipientId)) throw new Error('粉丝主页与当前私信接收人映射已失效，未继续发送');
    }
    const url = new URL(page.win.webContents.getURL());
    const expected = new URL(task.channel === 'comment' ? task.workUrl : builtinProfile(task.platform, 'dm').pageUrl);
    if (task.channel === 'comment') {
      if (operation !== 'probe' || task.platform !== 'xiaohongshu') throw new Error('公开评论当前仅可只读核对，发送尚未开放');
      if (url.origin !== expected.origin || url.pathname !== expected.pathname || url.username || url.password) throw new Error('当前页面与任务的官方作品链接不同，请打开原作品后重新核对');
    } else if (page.profileChat) {
      if (!(task.sourceKind === 'fan-directory' || hasCommentProfile(task)) || task.platform !== 'douyin' || url.href !== task.profileUrl) throw new Error('当前页面与任务冻结的粉丝主页单聊不一致，未继续发送');
    } else if (url.origin !== expected.origin || !/^\/chat(?:\/|$)/.test(url.pathname) || url.username || url.password) throw new Error('请在协作账号的官方私信页面检查目标，当前未发送');
    if (task.platform === 'xiaohongshu' && task.channel === 'dm') {
      const routeRecipients = url.searchParams.getAll('openUid');
      if (routeRecipients.length > 1 || routeRecipients.length === 1 && routeRecipients[0] !== task.recipientId) throw new Error('小红书私信入口与固定接收人不一致，当前未发送');
      if (['send', 'commit', 'receipt'].includes(operation)) this.assertXhsReadyDocument(page, task);
    }
    const script = task.channel === 'comment'
      ? publicCommentScript(task.platform, operation, { task, sourceMessage: this.tasks.source(task) })
      : builtinScript(builtinProfile(task.platform, 'dm'), operation, { ...payload, identity: task.senderBinding.identity,
        welcomeProfileUrl: page.profileChat ? task.profileUrl : undefined, welcomeRecipientId: page.profileChat ? page.recipientMapping.recipientId : undefined });
    return this.execute(page, script, { ...options, operationName: operation });
  }
  execute(page, script, { beforeExecute, timeoutMs = this.operationTimeoutMs, independentRead = false, operationName } = {}) {
    const generation = page.generation;
    const stage = PAGE_OPERATIONS.has(operationName) ? operationName : 'page-script';
    const wc = page.win.webContents, url = wc.getURL();
    const task = this.tasks.get(page.id), xhs = task.platform === 'xiaohongshu';
    const startedAt = Date.now(), duration = Math.min(this.operationTimeoutMs, timeoutMs), expiresAt = startedAt + duration;
    if (xhs && (!Number.isFinite(duration) || duration <= 0)) throw pageLoadTimeout('小红书页面操作已超过准备期限，当前未执行');
    const initialFrame = wc.mainFrame;
    let frame = null, nativeDispatched = false;
    const assert = () => {
      if (independentRead) this.assertReadCurrent(page, generation); else this.assertCurrent(page, generation);
      if (xhs && (operationName === 'scan' || operationName === 'selectThread' && nativeDispatched) && !page.claimStarted && !task.claimedAt && page.win.webContents === wc && wc.getURL() !== url &&
          initialFrame && wc.mainFrame === initialFrame && initialFrame === page.domReadyFrame && page.domReadyGeneration === generation &&
          initialFrame.url === wc.getURL() && this.isXhsChatRoute(page, url) && this.isXhsChatRoute(page, wc.getURL())) {
        this.captureReadyFrame(page, generation, wc.getURL());
        throw Object.assign(new Error('小红书官方单聊路由正在切换，将重新只读核对'), { code: operationName === 'scan' ? 'XHS_CHAT_ROUTE_CHANGED' : 'XHS_CHAT_SELECTION_NAVIGATED' });
      }
      if (page.win.webContents !== wc || wc.getURL() !== url || (frame && this.captureReadyFrame(page, generation, url) !== frame)) throw new Error('协作页面当前文档已变化，请重新核对');
    };
    assert();
    return new Promise((resolve, reject) => {
      let settled = false, dispatched = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true; clearTimeout(timer); page.pending.delete(finish);
        wc.removeListener('dom-ready', dispatch); wc.removeListener('did-stop-loading', dispatch);
        if (error) reject(error); else resolve(value);
      };
      const dispatch = () => {
        if (settled || dispatched) return;
        try {
          assert();
          frame = this.captureReadyFrame(page, generation, url);
          // Never enqueue scripts in webContents while loading: a timeout or
          // stop cannot retract its queued code. Wait for current DOM evidence
          // without running the claim/commit callback or touching the page.
          if (!frame && wc.isLoadingMainFrame?.() === true) return;
          beforeExecute?.();
          assert();
          if (!frame && wc.isLoadingMainFrame?.() === true) throw pageLoadTimeout(`协作页面文档尚未就绪（${stage}），当前未执行操作`);
          dispatched = true;
          nativeDispatched = true;
          // Same fixed script and all existing guards, only a transport change:
          // current DOM-ready mainFrame does not wait for unrelated resources.
          const code = xhs ? `(()=>{const now=Date.now();if(now>=${expiresAt}||now<${startedAt})return {ok:false,submitted:false,errorCode:'PAGE_OPERATION_EXPIRED',detail:'小红书页面操作已过期，未提交'};if(location.href!==${JSON.stringify(url)})return {ok:false,submitted:false,errorCode:'XHS_CHAT_ROUTE_CHANGED',detail:'小红书单聊页面已变化，未提交'};return ${script};})()` : script;
          Promise.resolve((frame || wc).executeJavaScript(code, false))
            .then(result => { try { assert(); finish(null, result); } catch (error) { finish(error); } }, error => finish(error));
        } catch (error) { finish(error); }
      };
      const timer = setTimeout(() => { finish(Object.assign(new Error(`协作页面操作超时（${stage}），请核对页面`), { code: 'PAGE_OPERATION_TIMEOUT' })); this.cancelPage(page, { reason: 'timeout' }); }, duration);
      page.pending.add(finish);
      wc.on('dom-ready', dispatch); wc.on('did-stop-loading', dispatch);
      Promise.resolve().then(dispatch);
    });
  }
  open(task, { recipientProfile = false, background = false, batchId = null } = {}) {
    let page = this.pages.get(task.id);
    if (page && !page.win.isDestroyed()) {
      if (page.releasing) throw new Error('后台页面正在安全释放，请稍后重新核对');
      page.lastUsedAt = this.now();
      page.profileCleanupCandidate = false;
      page.batchId = batchId;
      if (background) page.win.hide?.(); else { page.hasBeenShown = true; page.win.show(); page.win.focus(); }
      return page;
    }
    if (this.pages.size >= this.maxPages) {
      const detail = '后台任务页面已达到资源上限，请先处理保留的草稿、不明结果或已打开页面，再重试';
      // This is a workspace resource condition, not a recipient failure. Pause
      // a batch without consuming the remaining confirmed recipient tasks.
      throw Object.assign(new Error(detail), { failure: { outcome: 'not-sent', scope: 'batch', code: 'resource-limit', stage: 'preflight', detail } });
    }
    const account = this.studio.getAccount(task.accountId);
    let url = task.channel === 'comment' ? task.workUrl : builtinProfile(task.platform, 'dm').pageUrl;
    if (task.channel === 'dm' && task.platform === 'xiaohongshu' && /^[a-f\d]{24}$/i.test(task.recipientId)) {
      url = `https://www.xiaohongshu.com/chat?openUid=${encodeURIComponent(task.recipientId)}`;
    }
    if (recipientProfile) {
      if (task.platform !== 'douyin' || task.channel !== 'dm') throw new Error('此入口仅用于抖音私信任务');
      url = validateProfileUrl(task.platform, task.profileUrl);
    }
    const win = this.createWindow(account, task.channel, url, { background });
    page = { id: task.id, accountId: task.accountId, win, generation: 0, domReadyGeneration: null, domReadyUrl: null, domReadyFrame: null, interruptions: [], pending: new Set(), ready: false, profileChat: false, batchId,
      profileCleanupCandidate: background && recipientProfile && task.sourceKind === 'fan-directory', hasBeenShown: !background, entryStarted: false, claimStarted: false, lastUsedAt: this.now() };
    this.pages.set(task.id, page);
    win.on('show', () => { page.hasBeenShown = true; page.profileCleanupCandidate = false; });
    win.on('closed', () => { this.cancelPage(page, { reason: 'closed' }); if (this.pages.get(task.id) === page) this.pages.delete(task.id); try { this.changed(); } catch { /* Resource observers cannot alter delivery results. */ } });
    win.webContents.on('did-start-navigation', (_event, url, isInPlace, isMainFrame) => { if (isMainFrame && !isInPlace) { this.cancelPage(page, { reason: 'navigation', url }); page.ready = false; } });
    win.webContents.on('render-process-gone', () => { this.cancelPage(page, { reason: 'renderer-gone' }); page.ready = false; });
    win.webContents.on('dom-ready', () => {
      if (this.pages.get(task.id) !== page || win.isDestroyed()) return;
      page.domReadyGeneration = page.generation; page.domReadyUrl = win.webContents.getURL(); page.domReadyFrame = win.webContents.mainFrame;
    });
    return page;
  }
  async releaseUnusedProfile(page, task) {
    if (!page || !task) return false;
    const eligible = () => {
      if (this.pages.get(page.id) !== page || page.win.isDestroyed() || !page.profileCleanupCandidate || page.hasBeenShown || page.entryStarted || page.claimStarted || page.ready || page.win.isVisible?.() === true) return false;
      const current = this.tasks.get(task.id);
      return current.accountId === page.accountId && current.profileUrl === task.profileUrl && current.sourceKind === 'fan-directory' && current.platform === 'douyin' && current.channel === 'dm' && !current.claimedAt && !['sending', 'sent', 'unknown'].includes(current.status) && page.win.webContents.getURL() === task.profileUrl;
    };
    let timer;
    try {
      if (!eligible()) return false;
      const generation = page.generation, frame = this.captureReadyFrame(page, generation, task.profileUrl);
      // The batch may already be cancelled. This fixed read-only script has no
      // entry click, fill or submit path and grants no new task authorization.
      const result = await Promise.race([
        (frame || page.win.webContents).executeJavaScript(recipientCleanupScript(task.profileUrl), false),
        new Promise(resolve => { timer = setTimeout(() => resolve(null), Math.min(this.operationTimeoutMs, 1500)); }),
      ]);
      if (result?.ok !== true || result.safeToClose !== true || page.generation !== generation || (frame && this.captureReadyFrame(page, generation, task.profileUrl) !== frame) || !eligible()) return false;
      page.profileCleanupCandidate = false;
      page.win.destroy(); return true;
    } catch { return false; }
    finally { clearTimeout(timer); }
  }
  async openRecipient(id) { return this.withAccountOperation(id, 'open', () => this.openRecipientTask(id)); }
  async openRecipientTask(id) {
    this.assertBatchAccess(id);
    if (this.stopped || this.suspended) throw new Error('系统正在停止或恢复，请稍后打开接收人主页');
    const task = this.tasks.preflight(id);
    if (task.platform !== 'douyin' || task.channel !== 'dm' || !task.profileUrl) throw new Error('任务没有可核对的抖音接收人主页，请重新读取来源记录');
    const url = validateProfileUrl(task.platform, task.profileUrl);
    if (this.busyAccounts.has(task.accountId)) throw new Error('这个协作账号正在处理另一项任务');
    this.busyAccounts.add(task.accountId);
    try {
      let page = this.pages.get(id);
      if (!page || page.win.isDestroyed()) {
        page = this.open(task, { recipientProfile: true });
      } else {
        const generation = page.generation;
        this.assertCurrent(page, generation);
        if (page.win.webContents.getURL() !== url) {
          const scan = await this.run(page, 'scan');
          this.assertCurrent(page, generation);
          if (!scan?.ok || scan.ready === false || scan.invalidRows || scan.identity !== task.senderBinding.identity || scan.canSwitch !== true) throw new Error('当前会话或登录身份无法核对，或有未发送草稿，请先处理后再打开接收人主页');
          this.tasks.preflight(id);
          page.ready = false;
          let timer;
          try {
            await Promise.race([
              page.win.loadURL(url),
              new Promise((_resolve, reject) => { timer = setTimeout(() => reject(pageLoadTimeout('接收人主页加载超时（profile-navigation），请检查平台页面后重试')), this.operationTimeoutMs); }),
            ]);
          } finally { clearTimeout(timer); }
          if (this.stopped || this.suspended || page.win.isDestroyed() || this.pages.get(id) !== page) throw new Error('接收人页面已停止，请重新打开');
          this.tasks.preflight(id);
        }
        page.hasBeenShown = true; page.profileCleanupCandidate = false; page.win.show(); page.win.focus();
      }
      return { opened: true, detail: '已用指定协作账号打开接收人的官方主页。点击主页“私信”；若未自动弹出单聊，请关闭主页窗口，再点本任务的“核对与发送”。打开主页不会发送消息。' };
    } finally { this.busyAccounts.delete(task.accountId); }
  }
  async navigateBackground(page, url, batchId, timeoutMs = this.operationTimeoutMs) {
    this.assertBatchAccess(page.id, batchId);
    this.tasks.preflight(page.id);
    page.ready = false;
    const initialGeneration = page.generation, wc = page.win.webContents;
    let settledGeneration, settledFrame;
    const validate = () => {
      this.assertBatchAccess(page.id, batchId);
      this.assertCurrent(page, page.generation);
      const interruptions = (page.interruptions || []).filter(item => item.generation > initialGeneration);
      if (page.generation - initialGeneration !== interruptions.length || interruptions.some(item => item.reason !== 'navigation' || item.url !== url)) throw new Error('后台页面导航已中断或离开固定目标，当前未发送');
      if (wc.getURL() !== url) throw new Error('后台页面与固定目标不一致，当前未发送');
      this.tasks.preflight(page.id);
    };
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, frame) => {
        if (settled) return;
        settled = true; clearTimeout(timer); page.pending.delete(interrupted); wc.removeListener('dom-ready', ready);
        if (error) reject(error);
        else { settledGeneration = page.generation; settledFrame = frame; resolve(); }
      };
      const interrupted = error => {
        const reason = error?.pageInterruption;
        if (reason?.reason === 'navigation' && reason.url === url) return;
        finish(error);
      };
      const ready = () => {
        try { validate(); const frame = this.captureReadyFrame(page, page.generation, url); if (frame) finish(null, frame); }
        catch (error) { finish(error); }
      };
      const timer = setTimeout(() => finish(pageLoadTimeout('后台页面加载超时（profile-navigation），请打开处理页面检查')), Math.min(this.operationTimeoutMs, timeoutMs));
      page.pending.add(interrupted); wc.on('dom-ready', ready);
      try {
        Promise.resolve(page.win.loadURL(url)).then(() => { try { validate(); finish(); } catch (error) { finish(error); } }, error => finish(error));
      } catch (error) { finish(error); }
    });
    this.assertCurrent(page, settledGeneration);
    validate();
    if (settledFrame && this.captureReadyFrame(page, settledGeneration, url) !== settledFrame) throw new Error('后台页面当前文档已变化，当前未发送');
  }
  async scanBackground(page, task, batchId, { remaining = () => Infinity } = {}) {
    const profileGeneration = page.profileChat ? page.generation : undefined;
    let scan, activated = false;
    const profileStarted = profileGeneration !== undefined ? this.now() : null;
    const timeLeft = () => {
      if (profileGeneration === undefined) return remaining();
      const now = this.now();
      if (!Number.isFinite(profileStarted) || !Number.isFinite(now) || now < profileStarted) throw new Error('主页单聊检查时钟已变化，请重新核对');
      return Math.min(remaining(), Math.max(0, profileStarted + 30000 - now));
    };
    const timeoutDetail = () => page.profileChat ? `主页新单聊加载等待超时（已等待最多 30 秒），请检查接收人页面；当前未填写或发送${profilePendingDetail(scan)}${profileActivationDetail(page, scan)}` : '粉丝主页身份检查超过 30 秒，请打开处理页面检查';
    // A cold official popup can take longer than ten seconds. The wall-clock
    // deadline controls normal waits; the count also bounds a frozen clock.
    const attempts = profileGeneration !== undefined ? 80 : 24;
    for (let attempt = 0; attempt < attempts; attempt++) {
      this.assertBatchAccess(task.id, batchId);
      if (profileGeneration !== undefined) this.assertCurrent(page, profileGeneration);
      this.tasks.preflight(task.id);
      if (timeLeft() <= 0) throw pageLoadTimeout(timeoutDetail());
      try { scan = await this.run(page, 'scan', {}, { timeoutMs: timeLeft() }); }
      catch (error) {
        if (profileGeneration !== undefined) throw error;
        this.assertCurrent(page, page.generation);
        if (attempt === attempts - 1) throw error;
        await this.wait(Math.min(400, timeLeft())); continue;
      }
      if (profileGeneration !== undefined) this.assertCurrent(page, profileGeneration);
      if (scan?.identity && scan.identity !== task.senderBinding.identity) throw new Error('协作账号登录身份已变化，批次已暂停');
      if (scan?.invalidRows) throw new Error('页面消息结构无法核对，批次已暂停');
      // A hard conflict remains a hard conflict even when the read finishes
      // at the deadline. Only pending/otherwise-ready reads become timeouts.
      if (profileGeneration !== undefined && (!scan?.ok || scan.ready === false) && scan?.renderPending !== true) throw profileOperationError(scan, '主页当前单聊尚未通过身份核验');
      if (profileGeneration !== undefined && timeLeft() <= 0) throw pageLoadTimeout(timeoutDetail());
      if (scan?.ok && scan.ready !== false) {
        if (page.profileTargetThreadId && scan.threadId !== page.profileTargetThreadId) throw new Error('接收人单聊与刚核对并打开的会话不一致，未继续发送');
        return scan;
      }
      if (page.profileChat) {
        if (scan.profileListOnly === true && !page.profileTargetActivated) {
          page.profileActivationChecks = (page.profileActivationChecks || 0) + 1;
          const activation = await this.run(page, 'activateProfileTarget', {}, { timeoutMs: timeLeft() });
          this.assertCurrent(page, profileGeneration);
          // Keep only fixed reader diagnostics; never retain page text, IDs,
          // URLs or arbitrary errors from the selection probe in this summary.
          page.profileActivationPending = ['固定接收人的单聊列表行尚未加载，当前未填写或发送', '固定接收人的单聊列表行尚未可见，当前未填写或发送', '主页已有或正在加载单聊面板，将重新核对，未切换历史会话'].includes(activation?.detail) ? activation.detail : '';
          if (activation?.ok && activation.activated === true && typeof activation.threadId === 'string' && activation.threadId) {
            page.profileTargetActivated = true; page.profileTargetThreadId = activation.threadId;
          } else if (activation?.renderPending !== true) throw profileOperationError(activation, '固定接收人的单聊列表无法唯一核对');
        }
        await this.wait(Math.min(400, timeLeft())); continue;
      }
      if (task.platform === 'douyin' && !activated) {
        if (timeLeft() <= 0) throw pageLoadTimeout('粉丝主页身份检查超过 30 秒（profile-navigation），请打开处理页面检查');
        const activation = await this.run(page, 'activateFirst', {}, { timeoutMs: timeLeft() });
        if (activation?.ok) activated = true;
      }
      await this.wait(Math.min(400, timeLeft()));
    }
    if (profileGeneration !== undefined) throw pageLoadTimeout(timeoutDetail());
    throw new Error(scan?.detail || '私信尚未就绪，请打开处理页面完成登录或验证');
  }
  async enterRecipientBackground(page, task, batchId) {
    const profileUrl = validateProfileUrl(task.platform, task.profileUrl);
    if (page.win.webContents.getURL() !== profileUrl) {
      const scan = await this.scanBackground(page, task, batchId);
      if (scan.identity !== task.senderBinding.identity || scan.canSwitch !== true) throw new Error('现有会话有草稿或身份未就绪，已保留页面内容');
      await this.navigateBackground(page, profileUrl, batchId);
    }
    if (hasCommentProfile(task)) await this.resolveDirectoryRecipient(page, task, batchId);
    let entry;
    for (let attempt = 0; attempt < 24; attempt++) {
      this.assertBatchAccess(task.id, batchId); this.tasks.preflight(task.id);
      page.entryStarted = true; page.profileCleanupCandidate = false;
      try { entry = await this.execute(page, recipientEntryScript(profileUrl), { operationName: 'recipient-entry' }); }
      catch (error) {
        this.assertBatchAccess(task.id, batchId);
        this.assertCurrent(page, page.generation);
        const current = new URL(page.win.webContents.getURL());
        if (current.origin !== 'https://www.douyin.com' || current.username || current.password || !/^\/chat(?:\/|$)/.test(current.pathname)) throw error;
        // The normal button can navigate before executeJavaScript resolves.
        // Only the official chat destination is accepted, then peer IDs are
        // checked again below; this is never a delivery result.
        entry = { ok: true, opened: true };
      }
      if (entry?.ok) break;
      if (!entry?.renderPending) throw profileOperationError(entry, '无法建立接收人单聊');
      await this.wait(400);
    }
    if (!entry?.ok) throw new Error(entry?.detail || '接收人主页未就绪，请打开处理页面检查');
    // A new profile chat may exist only in this page until its first message.
    // Leaving for the history page would discard that verified empty chat.
    await this.wait(600);
    const guard = await this.execute(page, recipientNavigationScript(profileUrl), { operationName: 'recipient-navigation' });
    if (!guard?.ok) throw new Error(guard?.detail || '入口页面存在草稿或验证，已暂停并保留内容');
    const current = new URL(page.win.webContents.getURL());
    if ((task.sourceKind === 'fan-directory' || hasCommentProfile(task)) && current.href === profileUrl) {
      page.profileChat = true;
      const recipientId = page.recipientMapping?.recipientId;
      const started = this.now();
      const remaining = () => {
        const now = this.now();
        if (!Number.isFinite(started) || !Number.isFinite(now) || now < started) throw new Error('主页单聊检查时钟已变化，请重新核对');
        return Math.max(0, started + 30000 - now);
      };
      const scan = await this.scanBackground(page, task, batchId, { remaining });
      const target = this.recipientScan(scan, task, recipientId, scan.threadId)?.target;
      if (scan.profilePeerVerified !== true || scan.isGroup === true || scan.peerId !== recipientId || scan.peerVerified !== true ||
          target?.peerSource !== 'verified-follow-profile') throw new Error('主页当前单聊无法与固定粉丝身份唯一对应，未继续发送');
      return;
    }
    if (!/^\/chat(?:\/|$)/.test(current.pathname)) await this.navigateBackground(page, builtinProfile(task.platform, 'dm').pageUrl, batchId);
  }
  async readProfileIdentity(page, task, batchId, state, { remaining, independentRead = false }) {
    const pending = () => ({ ok: false, renderPending: true, stage: 'profile-navigation', detail: '粉丝主页正在完成加载，将继续只读核对身份（profile-navigation）' });
    const recheck = () => {
      let current;
      if (independentRead) { this.assertReadCurrent(page, page.generation); current = this.tasks.get(task.id); }
      else { this.assertBatchAccess(task.id, batchId); this.assertCurrent(page, page.generation); current = this.tasks.preflight(task.id); }
      if (outreachDigest(current) !== state.digest || page.accountId !== task.accountId) throw new Error('粉丝主页身份在核对时发生变化，固定任务或账号来源已变化');
      const changes = page.interruptions.filter(change => change.generation > state.generation);
      if (changes.length !== page.generation - state.generation) throw new Error('粉丝主页身份读取期间页面多次变化，无法确认导航过程');
      if (changes.some(change => change.reason !== 'navigation')) throw new Error('粉丝主页身份读取期间页面已停止、关闭、超时或进程退出，未继续核对');
      if (changes.some(change => change.url !== task.profileUrl) || page.win.webContents.getURL() !== task.profileUrl) throw new Error('导航目标与固定接收人主页不一致，未继续核对');
      if (independentRead) this.tasks.recheck(current);
      state.generation = page.generation;
    };
    try {
      recheck();
      if (remaining() <= 0) return pending();
      if (page.win.webContents.isLoadingMainFrame?.() === true) {
        if (page.domReadyGeneration !== page.generation || page.domReadyUrl !== task.profileUrl) return pending();
        if (!this.captureReadyFrame(page, page.generation, task.profileUrl)) return pending();
      }
      try {
        const generation = page.generation;
        const result = await this.execute(page, recipientIdentityScript(task.profileUrl, task.senderBinding.identity), { independentRead, timeoutMs: remaining(), operationName: 'profile-identity' });
        recheck();
        // A successful script can resolve immediately before a navigation is
        // observed by its caller. Never accept that previous document's map.
        if (page.generation !== generation) return pending();
        return result;
      } catch (error) {
        // Only this read-only identity probe tolerates normal navigation. Entry,
        // fill, commit and receipt operations retain their cancellation behavior.
        if (error.pageInterruption?.reason !== 'navigation') throw error;
        recheck();
        return pending();
      }
    } catch (error) {
      throw Object.assign(new Error(`粉丝主页身份读取中断：${error.message}`), error.failure ? { failure: error.failure } : {}, error.code ? { code: error.code } : {});
    }
  }
  async resolveDirectoryRecipient(page, task, batchId) {
    const profileUrl = validateProfileUrl(task.platform, task.profileUrl);
    if (task.platform !== 'douyin' || (task.sourceKind === 'fan-directory' ? task.recipientId !== new URL(profileUrl).pathname.slice('/user/'.length) : !hasCommentProfile(task))) throw new Error('粉丝目录身份与主页不一致');
    const started = this.now(), deadline = started + 30000;
    const remaining = () => {
      const now = this.now();
      if (!Number.isFinite(started) || !Number.isFinite(now) || now < started) throw new Error('身份检查时钟已变化，请重新核对');
      return Math.max(0, deadline - now);
    };
    // Every new check resolves from the fixed profile again, so a stale page
    // cannot turn a prior recipient's numeric UID into a new authorization.
    page.recipientMapping = null;
    while (['', 'about:blank'].includes(page.win.webContents.getURL()) && remaining() > 0) {
      this.assertBatchAccess(task.id, batchId); this.assertCurrent(page, page.generation); this.tasks.preflight(task.id);
      await this.wait(Math.min(400, remaining()));
    }
    this.assertBatchAccess(task.id, batchId);
    if (['', 'about:blank'].includes(page.win.webContents.getURL())) throw pageLoadTimeout('粉丝主页正在加载（profile-navigation），请稍后重新核对');
    if (page.win.webContents.getURL() !== profileUrl) {
      const scan = await this.scanBackground(page, task, batchId, { remaining });
      if (scan.identity !== task.senderBinding.identity || scan.canSwitch !== true) throw new Error('现有会话有草稿或身份未就绪，已保留页面内容');
      if (remaining() <= 0) throw pageLoadTimeout('粉丝主页加载已超过 30 秒（profile-navigation），请打开处理页面检查');
      await this.navigateBackground(page, profileUrl, batchId, remaining());
    }
    let lastMappingDetail = '';
    const readState = { generation: page.generation, digest: outreachDigest(task) };
    while (remaining() > 0) {
      this.assertBatchAccess(task.id, batchId);
      if (remaining() <= 0) break;
      const mapping = await this.readProfileIdentity(page, task, batchId, readState, { remaining });
      lastMappingDetail = typeof mapping?.detail === 'string' ? mapping.detail : '';
      this.assertBatchAccess(task.id, batchId);
      if (mapping?.ok) {
        if (mapping.profileUrl !== profileUrl || mapping.expectedIdentity !== task.senderBinding.identity || !/^[1-9]\d{0,63}$/.test(mapping.recipientId) || mapping.recipientId === mapping.expectedIdentity) throw new Error('粉丝主页身份返回值无法核对');
        if (hasCommentProfile(task) && mapping.recipientId !== task.recipientId) throw new Error('当前主页身份与原评论作者不一致，未打开私信或发送');
        page.recipientMapping = Object.freeze({ profileUrl, identity: mapping.expectedIdentity, recipientId: mapping.recipientId });
        return mapping.recipientId;
      }
      if (!mapping?.renderPending) throw profileOperationError(mapping, '粉丝主页身份无法核对');
      await this.wait(Math.min(400, remaining()));
    }
    this.assertBatchAccess(task.id, batchId);
    throw pageLoadTimeout(`粉丝主页身份检查超过 30 秒，请打开处理页面检查${lastMappingDetail ? `：${lastMappingDetail}` : ''}`);
  }
  async diagnoseTask(id) { return this.withAccountOperation(id, 'diagnose', () => this.diagnoseTaskPage(id)); }
  async diagnoseTaskPage(id) {
    let diagnosticPage, diagnosticTask;
    try {
      this.assertBatchAccess(id);
      const task = this.tasks.get(id);
      if (task.sourceKind !== 'fan-directory' || task.platform !== 'douyin' || task.channel !== 'dm' || task.recipientId !== new URL(validateProfileUrl('douyin', task.profileUrl)).pathname.slice('/user/'.length)) throw new Error('只读诊断仅支持固定粉丝主页的抖音私信任务');
      if (this.busyAccounts.has(task.accountId)) throw new Error('这个账号正在发送，暂不能诊断页面');
      let page = this.pages.get(id), newlyOpened = false;
      if (!page || page.win.isDestroyed()) {
        // After restart, reconstruct only the frozen profile in the original
        // account session. recheck validates provenance without claiming a task.
        this.tasks.recheck(task);
        page = this.open(task, { recipientProfile: true, background: true });
        newlyOpened = true;
        diagnosticPage = page; diagnosticTask = task;
      }
      if (page.accountId !== task.accountId) throw new Error('保留页面的账号与任务不一致，无法诊断');
      const started = this.now(), deadline = started + 30000;
      const remaining = () => {
        const value = this.now();
        if (!Number.isFinite(started) || !Number.isFinite(value) || value < started) throw new Error('身份检查时钟已变化，请重新核对');
        return Math.max(0, deadline - value);
      };
      let mapping = { ok: false, renderPending: true, stage: 'profile-navigation', detail: '后台粉丝主页尚未加载（profile-navigation）' };
      const readState = { generation: page.generation, digest: outreachDigest(task) };
      while (remaining() > 0) {
        this.assertReadCurrent(page, page.generation);
        if (!['', 'about:blank'].includes(page.win.webContents.getURL())) {
          mapping = await this.readProfileIdentity(page, task, undefined, readState, { independentRead: true, remaining });
          this.assertReadCurrent(page, page.generation);
          if (mapping?.ok || !mapping?.renderPending || (!newlyOpened && mapping?.stage !== 'profile-navigation')) break;
        }
        await this.wait(Math.min(400, remaining()));
      }
      this.assertReadCurrent(page, page.generation);
      if (mapping?.ok) {
        if (mapping.profileUrl !== task.profileUrl || mapping.expectedIdentity !== task.senderBinding.identity || !/^[1-9]\d{0,63}$/.test(mapping.recipientId) || mapping.recipientId === mapping.expectedIdentity) throw new Error('粉丝主页身份返回值无法核对');
        return { readOnly: true, ready: true, mappingVerified: true, stage: 'profile-verified', renderPending: false, detail: '当前粉丝主页身份可核对；只读诊断未打开私信、填写或发送消息。' };
      }
      const timedOut = remaining() <= 0;
      const diagnosticError = profileOperationError(mapping, '未取得页面诊断结果');
      const failure = diagnosticError.profileStage ? operationFailure(diagnosticError, 'preflight') : undefined;
      return { readOnly: true, ready: false, mappingVerified: false, stage: /^profile-[a-z-]+$/.test(mapping?.stage || '') ? mapping.stage : 'profile-check', renderPending: mapping?.renderPending === true, timedOut,
        detail: failure?.detail || `${timedOut ? '只读检查已等待 30 秒：' : ''}${String(mapping?.detail || '未取得页面诊断结果').slice(0, 1500)}`, ...(failure ? { failure } : {}) };
    } finally { if (diagnosticPage) await this.releaseUnusedProfile(diagnosticPage, diagnosticTask); }
  }
  recipientScan(scan, task, recipientId, threadId) {
    if (scan?.ok === false && Object.hasOwn(PROFILE_HISTORY_FAILURES, scan.errorCode)) throw profileOperationError(scan, '主页单聊资料尚未通过核对');
    if (scan?.identity !== task.senderBinding.identity) throw new Error('协作账号登录身份已变化，批次已暂停');
    if (scan.invalidRows || !scan.ok || scan.ready === false || !Array.isArray(scan.threadDetails)) throw profileOperationError(scan, '页面消息结构无法核对，批次已暂停');
    if (scan.canSwitch !== true) throw new Error('当前会话有草稿或状态不明，批次已暂停并保留内容');
    const targets = scan.threadDetails.filter(thread => !thread.isGroup && thread.peerId === recipientId);
    if (targets.length > 1) throw new Error('无法唯一确认接收人的单聊，批次已暂停');
    if (threadId !== undefined) {
      const fixed = scan.threadDetails.filter(thread => thread.id === threadId);
      if (fixed.length > 1 || fixed.some(thread => thread.isGroup || (thread.peerId && thread.peerId !== recipientId)) ||
          (scan.threadId === threadId && scan.peerId && scan.peerId !== recipientId) ||
          (targets.length === 1 && targets[0].id !== threadId)) throw new Error('固定会话的接收人发生冲突，批次已暂停');
    }
    // A verified old active conversation can render before a newly created
    // target is added to the list. Missing peer verification is not evidence
    // of a different recipient; wait without changing the authorized target.
    const target = targets.length === 1 && targets[0].peerVerified === true ? targets[0] : null;
    if (!target || (threadId !== undefined && (scan.threadId !== threadId || scan.peerId !== recipientId || scan.peerVerified !== true))) return null;
    return { scan, target };
  }
  async waitForRecipientBackground(page, task, batchId, recipientId, { initialScan, threadId } = {}) {
    const generation = page.generation;
    const recheck = () => {
      this.assertBatchAccess(task.id, batchId); this.assertCurrent(page, generation);
      this.tasks.preflight(task.id);
      if (task.sourceKind === 'fan-directory') this.tasks.assertRecipientPolicy(task.id, recipientId);
    };
    // One bounded scan loop per phase, never nested scanBackground retries.
    for (let attempt = 0; attempt < 24; attempt++) {
      recheck();
      const scan = attempt === 0 && initialScan !== undefined ? initialScan : await this.run(page, 'scan');
      recheck();
      const result = this.recipientScan(scan, task, recipientId, threadId);
      if (result) return result;
      if (attempt < 23) await this.wait(400);
    }
    throw pageLoadTimeout(threadId === undefined ? '无法唯一确认接收人的单聊：等待新会话加载超时（selectThread），当前未发送' : '后台切换后无法核对发送账号或接收人：等待固定会话加载超时（selectThread），当前未发送');
  }
  async waitForComposer(page, task, batchId, recipientId, threadId) {
    const generation = page.generation, started = this.now(), deadline = started + 10000;
    const remaining = () => {
      const now = this.now();
      if (!Number.isFinite(started) || !Number.isFinite(now) || now < started) throw new Error('输入框检查时钟已变化，请重新核对');
      return Math.max(0, deadline - now);
    };
    const recheck = () => {
      this.assertBatchAccess(task.id, batchId); this.assertCurrent(page, generation); this.tasks.preflight(task.id);
      if (task.sourceKind === 'fan-directory') this.tasks.assertRecipientPolicy(task.id, recipientId);
    };
    let detail;
    for (let attempt = 0; attempt < 25 && remaining() > 0; attempt++) {
      recheck();
      const result = await this.run(page, 'probeComposer', { outreach: true, taskId: task.id, threadId, recipientId }, { timeoutMs: remaining() });
      recheck();
      if (result?.ok === true && result.ready === true) return;
      detail = result?.detail || '私信输入框无法核对，请检查平台页面';
      if (result?.renderPending !== true) throw new Error(detail);
      if (attempt < 24 && remaining() > 0) await this.wait(Math.min(400, remaining()));
    }
    throw pageLoadTimeout(`私信输入框等待超时（probeComposer），当前未填写或提交，请稍后重新核对${detail ? `：${detail}` : ''}`);
  }
  async checkBackground(id, batchId, { background = true } = {}) {
    this.assertBatchAccess(id, batchId);
    const task = this.tasks.preflight(id);
    if (this.busyAccounts.has(task.accountId)) throw new Error('这个协作账号正在处理另一项任务');
    if (task.channel !== 'dm') throw new Error('批量发送当前仅支持私信');
    if (task.platform === 'xiaohongshu') return this.checkXhsDm(task, { background, batchId });
    const page = this.open(task, { recipientProfile: task.sourceKind === 'fan-directory', background, batchId });
    page.ready = false; page.profileChat = false; page.profileTargetActivated = false; page.profileTargetThreadId = '';
    page.profileActivationChecks = 0; page.profileActivationPending = '';
    const recipientId = task.sourceKind === 'fan-directory' ? await this.resolveDirectoryRecipient(page, task, batchId) : task.recipientId;
    if (task.sourceKind === 'fan-directory') this.tasks.assertRecipientPolicy(id, recipientId);
    let entered = false;
    if (task.platform === 'douyin' && task.profileUrl && page.win.webContents.getURL() === task.profileUrl) {
      await this.enterRecipientBackground(page, task, batchId); entered = true;
    }
    let scan = await this.scanBackground(page, task, batchId);
    const initialTarget = this.recipientScan(scan, task, recipientId);
    if (!initialTarget && task.platform === 'douyin' && task.profileUrl && !entered) {
      await this.enterRecipientBackground(page, task, batchId);
      scan = await this.scanBackground(page, task, batchId);
    }
    const { target } = await this.waitForRecipientBackground(page, task, batchId, recipientId, { initialScan: scan });
    const selection = await this.run(page, 'selectThread', { threadId: target.id });
    if (!selection?.ok) throw new Error(selection?.detail || '接收人单聊无法打开');
    const { scan: checked } = await this.waitForRecipientBackground(page, task, batchId, recipientId, { threadId: target.id });
    await this.waitForComposer(page, task, batchId, recipientId, checked.threadId);
    page.threadId = checked.threadId; page.ready = true;
    return { ready: true, detail: '后台账号与接收人已核对', recipientName: target.name };
  }
  async checkXhsDm(task, { background = false, batchId } = {}) {
    if (!/^[a-f\d]{24}$/i.test(task.recipientId)) throw new Error('小红书接收人编号无效，请重新读取来源记录');
    if (typeof task.replyText !== 'string' || !task.replyText.trim() || task.replyText.length > 1000) throw new Error('小红书私信需填写 1–1000 字符，请缩短文案后重新确认；当前未填写或提交');
    const page = this.open(task, { background, batchId }); page.ready = false; page.xhsReadyDocument = null;
    const started = this.now(), digest = outreachDigest(task), entryUrl = `https://www.xiaohongshu.com/chat?openUid=${encodeURIComponent(task.recipientId)}`;
    const context = { generation: page.generation, observedDocument: false, initialNavigation: false };
    const remaining = () => {
      const now = this.now();
      if (!Number.isFinite(started) || !Number.isFinite(now) || now < started) throw new Error('小红书私信检查时钟已变化，请重新核对');
      return Math.max(0, started + 30000 - now);
    };
    const recheck = () => {
      this.assertBatchAccess(task.id, batchId);
      const changes = page.interruptions.filter(item => item.generation > context.generation);
      // Only the newly allocated official openUid navigation may finish while
      // its first document is warming up. No reload, timeout, renderer exit or
      // subsequent navigation can inherit the old preparation authorization.
      if (page.generation !== context.generation && !context.observedDocument && !context.initialNavigation &&
          changes.length === 1 && page.generation === context.generation + 1 && changes[0].reason === 'navigation' && changes[0].url === entryUrl) {
        context.generation = page.generation; context.initialNavigation = true;
      }
      this.assertCurrent(page, context.generation);
      if (outreachDigest(this.tasks.preflight(task.id)) !== digest) throw new Error('小红书任务或接收人资料在核对期间发生变化，当前未发送');
    };
    const waitForTarget = async threadId => {
      for (let attempt = 0; attempt < 76 && remaining() > 0; attempt++) {
        recheck();
        const wc = page.win.webContents, url = wc.getURL();
        const coldDocument = !context.observedDocument && (!url || url === 'about:blank' ||
          url === entryUrl && wc.isLoadingMainFrame?.() === true && !this.captureReadyFrame(page, page.generation, url));
        if (coldDocument) { await this.wait(Math.min(400, remaining())); continue; }
        let scan; const readGeneration = context.generation;
        try { scan = await this.run(page, 'scan', {}, { timeoutMs: remaining() }); }
        catch (error) {
          if (error?.code === 'XHS_CHAT_ROUTE_CHANGED') { recheck(); await this.wait(Math.min(400, remaining())); continue; }
          if (error?.pageInterruption?.reason !== 'navigation' || context.observedDocument || context.initialNavigation || error.pageInterruption.url !== entryUrl) throw error;
          recheck(); await this.wait(Math.min(400, remaining())); continue;
        }
        recheck();
        if (readGeneration !== context.generation) { await this.wait(Math.min(400, remaining())); continue; }
        context.observedDocument = true;
        if (scan?.identity && scan.identity !== task.senderBinding.identity) throw new Error('协作账号登录身份已变化，批次已暂停');
        if (scan?.invalidRows) throw new Error(scan.detail || '页面消息结构无法核对，批次已暂停');
        if (scan?.canSwitch === false) throw new Error('小红书私信有未发送草稿或附件，已保留，请先人工处理');
        const idle = scan?.ok === true && scan.ready === false && scan.connectionReady === true && scan.hasConversation === false &&
          scan.identity === task.senderBinding.identity && !scan.threadId && Array.isArray(scan.messages) && !scan.messages.length && Array.isArray(scan.receipts) && !scan.receipts.length;
        if (!scan?.ok || scan.ready === false) {
          if (scan?.renderPending !== true && !idle) throw new Error(scan?.detail || '小红书私信页面尚未通过核验，请检查登录或平台提示');
        } else {
          const target = this.recipientScan(scan, task, task.recipientId, threadId);
          if (remaining() <= 0) break;
          if (target) return target;
        }
        if (attempt < 75 && remaining() > 0) await this.wait(Math.min(400, remaining()));
      }
      throw pageLoadTimeout('小红书指定接收人的单聊或资料加载超过 30 秒，当前未填写或提交，请稍后重新核对');
    };
    const { target } = await waitForTarget();
    recheck();
    let selection;
    try { selection = await this.run(page, 'selectThread', { threadId: target.id }, { timeoutMs: remaining() }); }
    catch (error) {
      // A single target click may pushState before its result returns. Never
      // click again or infer readiness; only rescan that same frozen thread.
      if (error?.code !== 'XHS_CHAT_SELECTION_NAVIGATED') throw error;
      recheck(); selection = { ok: true };
    }
    recheck();
    if (!selection?.ok) throw new Error(selection?.detail || '小红书接收人单聊无法打开');
    const { scan } = await waitForTarget(target.id);
    await this.waitForComposer(page, task, batchId, task.recipientId, scan.threadId);
    recheck(); page.threadId = scan.threadId;
    page.xhsReadyDocument = Object.freeze({ generation: page.generation, url: page.win.webContents.getURL(), frame: page.win.webContents.mainFrame || null });
    this.assertXhsReadyDocument(page, task); page.ready = true;
    return { ready: true, detail: '已核对小红书发送账号、接收人和输入框，尚未发送', recipientName: target.name };
  }
  async check(id, options = {}) {
    try { return await this.withAccountOperation(id, 'check', () => this.checkTask(id, options)); }
    catch (error) { const failure = operationFailure(error, 'preflight'); return { ready: false, detail: error.message, failure }; }
  }
  async checkTask(id, { background = false, batchId } = {}) {
    try {
      this.assertBatchAccess(id, batchId);
      if (background) return await this.checkBackground(id, batchId);
      if (this.stopped || this.suspended) throw new Error('系统正在停止或恢复，当前不能发送');
      const task = this.tasks.preflight(id);
      if (this.busyAccounts.has(task.accountId)) throw new Error('这个协作账号正在处理另一项任务');
      if (task.sourceKind === 'fan-directory') return await this.checkBackground(id, undefined, { background: false });
      if (task.channel === 'comment') {
        if (task.platform !== 'xiaohongshu') return { ready: false, detail: '抖音公开评论尚待接入。任务已保存，当前不能发送。' };
        const page = this.open(task);
        const probe = await this.run(page, 'probe');
        this.tasks.preflight(id);
        // A read-only result can never authorize the sending pipeline.
        return { ready: false, readable: probe?.readable === true, detail: probe?.detail || '作品页面正在加载，请在页面中找到原评论后重新核对；公开评论发送尚未开放。' };
      }
      if (task.platform === 'xiaohongshu') return await this.checkXhsDm(task);
      const page = this.open(task);
      page.ready = false;
      if (task.platform === 'douyin' && task.profileUrl && page.win.webContents.getURL() === task.profileUrl) return { ready: false, detail: '请先在接收人主页点击“私信”，关闭主页窗口后，再点本任务的“核对与发送”。当前没有发送。' };
      let scan, activated = false;
      for (let attempt = 0; attempt < 8; attempt++) {
        try { scan = await this.run(page, 'scan'); } catch (error) { if (attempt === 7) throw error; }
        if (scan?.identity && scan.identity !== task.senderBinding.identity) throw new Error('协作账号登录身份与任务绑定不同，未发送');
        if (scan?.ok && scan.ready !== false && !scan.invalidRows) break;
        if (task.platform === 'douyin' && scan && !scan.invalidRows && !activated) {
          const activation = await this.run(page, 'activateFirst');
          if (!activation?.ok) throw new Error(activation?.detail || '请先打开一段单人私信，当前没有发送');
          activated = true;
        }
        await this.wait(500);
      }
      if (!scan?.ok || scan.ready === false || scan.invalidRows) throw new Error(scan?.detail || '私信页面还没有完成加载，请登录后重新检查');
      if (scan.identity !== task.senderBinding.identity) throw new Error('协作账号登录身份与任务绑定不同，未发送');
      const targets = (scan.threadDetails || []).filter(thread => !thread.isGroup && thread.peerId === task.recipientId && thread.peerVerified === true);
      if (targets.length !== 1) throw new Error(task.platform === 'douyin' ? '尚未找到该协作账号与目标的唯一单聊。请先在抖音官方页面建立会话，再回来检查；当前未发送。' : '目标私信资料还未核验完成，或平台不允许建立该会话，当前未发送。');
      if (scan.canSwitch === false) throw new Error('协作页面有未发送草稿，请先处理，工作台没有覆盖内容');
      const selection = await this.run(page, 'selectThread', { threadId: targets[0].id });
      if (!selection?.ok) throw new Error(selection?.detail || '接收人会话无法打开');
      await this.wait(350);
      const checked = await this.run(page, 'scan');
      if (!checked?.ok || checked.ready === false || checked.invalidRows || checked.identity !== task.senderBinding.identity || checked.threadId !== targets[0].id || checked.peerId !== task.recipientId || checked.peerVerified !== true || checked.canSwitch === false || (checked.threadDetails || []).filter(thread => thread.id === checked.threadId && thread.peerId === task.recipientId && thread.peerVerified === true && !thread.isGroup).length !== 1) throw new Error('会话切换后无法再次确认接收人，当前未发送');
      await this.waitForComposer(page, task, batchId, task.recipientId, checked.threadId);
      this.tasks.preflight(id);
      page.threadId = checked.threadId; page.ready = true;
      return { ready: true, detail: '已核对发送账号及单聊接收人，尚未发送', recipientName: targets[0].name };
    } catch (error) {
      try { await this.releaseUnusedProfile(this.pages.get(id), this.tasks.get(id)); } catch { /* Preserve the original failure. */ }
      const failure = operationFailure(error, 'preflight');
      return { ready: false, detail: failure.code === 'profile-unavailable' ? failure.detail : error.message, failure };
    }
  }
  async send(id, options = {}) { return this.withAccountOperation(id, 'send', () => this.sendTask(id, options)); }
  async sendTask(id, { background = false, batchId } = {}) {
    this.assertBatchAccess(id, batchId);
    const task = this.tasks.get(id);
    if (this.busyAccounts.has(task.accountId)) throw new Error('这个账号正在发送，请稍后检查结果');
    const check = await this.checkTask(id, { background, batchId });
    if (!check.ready) throw Object.assign(new Error(check.detail), { failure: check.failure || operationFailure(new Error(check.detail), 'preflight') });
    this.assertBatchAccess(id, batchId);
    // check() yields; claim the account synchronously only after re-checking it.
    if (this.busyAccounts.has(task.accountId)) throw new Error('这个账号正在发送，请稍后检查结果');
    this.busyAccounts.add(task.accountId);
    let page;
    let claimed = false, commitStarted = false, stage = 'preflight', receiptProbe;
    try {
      page = this.pages.get(id);
      if (!page || !page.ready) throw new Error('协作页面已关闭或发生变化，请重新检查');
      const generation = page.generation;
      const payload = { outreach: true, taskId: id, threadId: page.threadId, recipientId: task.sourceKind === 'fan-directory' ? page.recipientMapping?.recipientId : task.recipientId, replyText: task.replyText };
      this.assertCurrent(page, generation);
      this.assertXhsReadyDocument(page, task);
      page.claimStarted = true; page.profileCleanupCandidate = false;
      this.tasks.beginSend(id, { recipientId: payload.recipientId }); claimed = true;
      stage = 'fill';
      const filled = await this.run(page, 'send', payload);
      this.assertCurrent(page, generation);
      if (!filled?.ok || filled.needsNativeInput) throw new Error(filled?.detail || '无法填写协作内容');
      const originalReceiptPayload={...payload,before:filled.before,beforeClientIds:filled.beforeClientIds,claimedAt:this.tasks.get(id).claimedAt};
      receiptProbe={id,accountId:task.accountId,claimedAt:originalReceiptPayload.claimedAt,read:async()=>{
        this.assertReadCurrent(page,generation);
        return this.run(page,'receipt',originalReceiptPayload,{independentRead:true});
      }};
      await this.wait(120);
      this.assertCurrent(page, generation); this.tasks.assertCanCommit(id, { recipientId: payload.recipientId });
      stage = 'commit';
      const commit = await this.run(page, 'commit', payload, { beforeExecute: () => {
        this.assertCurrent(page, generation); this.tasks.assertCanCommit(id, { recipientId: payload.recipientId });
        commitStarted = true;
      } });
      if (!commit?.ok || commit.nativeEnter) { commitStarted = commit?.submitted !== false; throw new Error(commit?.detail || '平台提交检查失败'); }
      stage = 'receipt';
      for (let attempt = 0; attempt < 8; attempt++) {
        await this.wait(700);
        this.assertCurrent(page, generation);
        const result = await this.run(page, 'receipt', { ...payload, before: filled.before, beforeClientIds: filled.beforeClientIds, claimedAt: this.tasks.get(id).claimedAt });
        if (!result?.ok) break;
        if (result.failure) {
          if (!result.receipt && Array.isArray(filled.beforeClientIds) && verifiedRejection(result.failure, page.threadId)) {
            const failure = result.failure;
            this.tasks.finishSend(id, { status: 'failed', error: failure.detail, failure });
            return { sent: false, failure };
          }
          break;
        }
        if (typeof result.receipt === 'string' && /^platform:\S+$/.test(result.receipt)) {
          this.tasks.finishSend(id, { status: 'sent', receipt: result.receipt });
          // Completed hidden task pages no longer need a renderer process.
          // Failed/unknown pages remain available for the user's inspection.
          // Cleanup cannot replace an already persisted platform receipt with
          // an unknown result or attempt a second terminal state transition.
          // The operation wrapper releases only an empty, hidden page after
          // the durable result and all pending operations have settled.
          return { sent: true, receipt: result.receipt };
        }
      }
      const failure = operationFailure(null, stage, true);
      this.tasks.finishSend(id, { status: 'unknown', error: failure.detail, failure });
      return { sent: false, unknown: true, failure };
    } catch (error) {
      const failure = operationFailure(error, stage === 'commit' && !commitStarted ? 'fill' : stage, commitStarted);
      if (claimed) this.tasks.finishSend(id, { status: commitStarted ? 'unknown' : 'failed', error: error.message, failure });
      if (claimed && commitStarted) return { sent: false, unknown: true, failure };
      error.failure = failure;
      throw error;
    } finally {
      if(commitStarted&&receiptProbe&&this.tasks.get(id).status==='unknown')this.deferReceipt?.(receiptProbe);
      this.busyAccounts.delete(task.accountId); if (page) page.ready = false;
      // Notification is observational. A renderer/snapshot listener failure
      // must not replace the actual persisted send result or original error.
      try { this.changed(); } catch { /* The next snapshot can refresh the UI. */ }
    }
  }
  showTask(id) {
    this.assertBatchAccess(id);
    const task = this.tasks.get(id);
    if (this.busyAccounts.has(task.accountId) || this.accountOperations.has(task.accountId) || this.releasingAccounts.has(task.accountId)) throw new Error('这个账号正在核对、发送或释放页面，暂不能打开处理页面');
    let page = this.pages.get(id);
    if (!page || page.win.isDestroyed()) {
      if (!['review', 'failed'].includes(task.status) || task.claimedAt !== undefined || task.sourceKind !== 'fan-directory' || task.platform !== 'douyin' || task.channel !== 'dm') throw new Error('处理页面已关闭；已尝试任务请从账号官方页面核对记录');
      const profileUrl = validateProfileUrl('douyin', task.profileUrl);
      if (profileUrl !== task.profileUrl || task.recipientId !== new URL(profileUrl).pathname.slice('/user/'.length)) throw new Error('粉丝目录身份与固定主页不一致，未打开页面');
      // Opening a released unclaimed page is observation only. Its review
      // or failed status remains fixed; no preflight, claim or chat entry runs.
      this.tasks.recheck(task);
      page = this.open(task, { recipientProfile: true, background: false });
    }
    if (page.accountId !== task.accountId) throw new Error('处理页面账号与任务不一致');
    page.hasBeenShown = true; page.profileCleanupCandidate = false; page.win.show(); page.win.focus(); return { opened: true };
  }
  async cancelBatchOperation(batchId) {
    const releases = [];
    for (const page of this.pages.values()) if (page.batchId === batchId) {
      this.cancelPage(page, { reason: 'stopped' }); page.ready = false;
      try { releases.push(this.releaseUnusedProfile(page, this.tasks.get(page.id))); } catch { /* Unknown pages are retained. */ }
    }
    await Promise.allSettled(releases);
  }
  closeAccount(id) {
    for (const page of this.pages.values()) {
      const task = this.tasks.get(page.id);
      if (page.accountId === id || task.primaryAccountId === id) { this.cancelPage(page, { reason: 'closed' }); if (!page.win.isDestroyed()) page.win.destroy(); }
    }
  }
  suspend() { this.batchController?.stop('工作台休眠或退出，剩余任务需重新确认'); this.suspended = true; for (const page of this.pages.values()) this.cancelPage(page, { reason: 'stopped' }); }
  resume() { if (!this.stopped) this.suspended = false; }
  shutdown() { this.stopped = true; clearTimeout(this.idleTimer); this.idleTimer = null; this.suspend(); for (const page of [...this.pages.values()]) if (!page.win.isDestroyed()) page.win.destroy(); }
}

module.exports = { OutreachManager };
