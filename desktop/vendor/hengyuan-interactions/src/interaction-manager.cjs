'use strict';
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { validateProfile, scriptFor } = require('./dom-adapter.cjs');
const { builtinProfile, builtinScript } = require('./builtin-adapter.cjs');
const { read, write } = require('./workspace-data.cjs');
const { isAllowedUrl } = require('./policy.cjs');
const { getPlatform } = require('./platforms.cjs');
const { prepareWelcomeRecipient } = require('./welcome-recipient.cjs');
const { prepareXhsRecipient, xhsChatUrl } = require('./xhs-recipient.cjs');
const { idlePageProbeScript } = require('./idle-page.cjs');
const { validateProfileUrl } = require('./outreach.cjs');
const { inspectWelcomeChatWindow } = require('./welcome-chat-inspection.cjs');
const { WelcomePageRegistry } = require('./welcome-page-registry.cjs');
const { releasedPreparationFailure } = require('./welcome-preparation-retry.cjs');
const ENTRY_PAGES = Object.freeze({
  xiaohongshu: { dm: 'https://www.xiaohongshu.com/chat?channel_id=&channel_type=web_engagement_notification_page', comment: 'https://www.xiaohongshu.com/notification', follow: 'https://www.xiaohongshu.com/notification' },
  douyin: { dm: 'https://www.douyin.com/chat?isPopup=1', comment: 'https://creator.douyin.com/creator-micro/interactive/comment', follow: 'https://www.douyin.com/?open_notice=true' },
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function removePageListener(webContents, event, listener) {
  // Native BrowserWindow.webContents access can throw after destruction. Keep
  // the captured emitter and make cleanup best-effort; listener removal must
  // never strand a pending promise or its worker's busy flag.
  try { webContents?.removeListener(event, listener); } catch { /* The renderer may already be destroyed. */ }
}
function verifiedWelcomeRejection(value, threadId, beforeClientIds) {
  const scope = { 'recipient-restricted': 'task', 'account-limit': 'account', 'account-unavailable': 'account', 'task-error': 'task' }[value?.code];
  const prefix = `platform-rejection:${threadId}:client:`;
  return scope && Array.isArray(beforeClientIds) && value.outcome === 'not-sent' && value.scope === scope && value.stage === 'receipt' &&
    typeof value.detail === 'string' && value.detail.length > 0 && value.detail.length <= 1500 &&
    typeof value.evidence === 'string' && value.evidence.startsWith(prefix) && value.evidence.length > prefix.length &&
    value.evidence.length <= 1024 && !/\s/.test(value.evidence) && !beforeClientIds.includes(value.evidence.slice(prefix.length));
}
const isCommentPrivateReply = reply => reply?.channel === 'comment' && reply?.deliveryChannel === 'dm';
const isRecipientPrivateReply = reply => reply?.channel === 'follow' || isCommentPrivateReply(reply);

class InteractionManager {
  constructor({ dataDir, studio, interactions, createWindow, changed, waitForPage = sleep, operationTimeoutMs = 10000, externalReservationTimeoutMs = 30000, prepareWelcome = prepareWelcomeRecipient, prepareXhsWelcome = prepareXhsRecipient }) {
    this.prepareWelcome = prepareWelcome;
    this.prepareXhsWelcome = prepareXhsWelcome;
    Object.assign(this, { studio, interactions, createWindow, changed, waitForPage, operationTimeoutMs, externalReservationTimeoutMs });
    this.connections = new Map(); this.timer = null; this.stopped = false;
    this.welcomeProfileWindows = new Map();
    this.welcomePages = new WelcomePageRegistry({ changed: () => this.changed?.(), probeTimeoutMs: operationTimeoutMs });
    this.welcomePageReplies = new WeakMap();
    this.suspended = false; this.resuming = false; this.serviceGeneration = 0;
    this.monitorVersions = new Map(); this.monitorOperations = new Map(); this.pendingMonitorActivations = new Map();
    this.replyBatchReservations = new Map(); this.replyBatchAccounts = new Map(); this.replyBatchController = null;
    this.externalBatchAccounts = new Map(); this.externalBatchWaiters = new Map(); this.externalBatchResources = new Map();
    this.restoreOperation = null; this.resumeOperation = null;
    // Short scheduling passes own bounded jobs; they never hold a global
    // interval lock while a recipient page or platform receipt is loading.
    this.monitorJobs = new Map(); this.activeSends = new Map();
    this.backgroundSend = null; this.lastMonitorKey = null; this.lastSendAccount = null;
    this.retainedWelcomeCleanup = null; this.retainedWelcomeCleanupAt = new Map();
    this.profilePath = path.join(dataDir, 'interaction-profiles.json');
    this.profiles = read(this.profilePath, true) || {};
    this.controlPath = path.join(dataDir, 'interaction-control.json');
    this.welcomeInspectionPath = path.join(dataDir, 'welcome-chat-inspection.json');
    this.control = read(this.controlPath, true) || { version: 1, bindings: {}, channels: {} };
    if (!this.profiles || typeof this.profiles !== 'object' || Array.isArray(this.profiles) || this.control.version !== 1 || !this.control.bindings || !this.control.channels) throw new Error('互动页面设置损坏，请保留原文件并恢复备份');
  }
  key(accountId, channel) { return `${accountId}:${channel}`; }
  commentPrivateEnabled(accountId) {
    const account = this.studio.getAccount(accountId);
    return account.platform === 'douyin' && this.monitoring(this.key(accountId, 'comment')) &&
      this.interactions.getMode(accountId, 'comment') !== 'off' && this.interactions.snapshot().rules.some(rule =>
        rule.enabled && rule.channel === 'comment' && rule.deliveryChannel === 'dm' &&
        ['all', account.platform].includes(rule.platform) && (!rule.accountIds?.length || rule.accountIds.includes(accountId)));
  }
  externalRestoreAllowed(accountId, token) {
    return Boolean(token && this.externalBatchResources.get(token.batchId) === token && token.restoring &&
      token.ids.includes(accountId) && this.replyBatchAccounts.get(accountId) === token.batchId);
  }
  assertAccountUnreserved(accountId, restoreToken) {
    if (this.accountBlocked?.(accountId)) throw new Error('这个账号正在停止任务或退出登录，请稍后重试');
    if (this.replyBatchAccounts.has(accountId) && !this.externalRestoreAllowed(accountId, restoreToken)) throw new Error('后台批量发送（批量回复或多账号触达）或监控恢复正在使用此账号，请等待恢复完成或先停止相关操作');
  }
  openWelcomeProfile(input) { return this.openWelcomeInspection(input, 'profile'); }
  openWelcomeChat(input) { return this.openWelcomeInspection(input, 'chat'); }
  openWelcomeInspection(input, kind) {
    if (!['profile', 'chat'].includes(kind)) throw new Error('不支持的欢迎记录检查方式');
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || typeof input.id !== 'string' || !input.id) throw new Error('主页检查只接受原回复记录编号');
    if (this.stopped || this.suspended || this.resuming) throw new Error('工作台正在退出、休眠或恢复，请稍后检查主页');
    const { reply, message, sending } = this.withReadSnapshot(() => {
      const reply = this.interactions.getReply(input.id);
      return { reply, message: this.interactions.getMessage(reply.messageId),
        sending: this.interactions.snapshot().replies.some(item => item.accountId === reply.accountId && item.status === 'sending') };
    });
    const commentPrivate = isCommentPrivateReply(reply);
    const account = this.validate(reply.accountId, commentPrivate ? 'comment' : 'follow');
    const retained = kind === 'chat' && this.welcomePages.snapshot().find(page => page.accountId === account.id && page.state === 'retained');
    const retainedWindow = retained && this.welcomePages.forAccount(account.id).find(win => this.welcomePageReplies.get(win) === reply.id);
    const cancelledRetained = reply.status === 'cancelled' && Boolean(retainedWindow);
    if (account.platform === 'xiaohongshu' && kind === 'chat') {
      // Inspection reveals only the exact original retained window. It neither
      // navigates a fresh recipient nor grants a retry of an uncertain send.
      if (reply.channel !== 'follow' || reply.trigger !== 'follow' || !['failed', 'skipped', 'unknown', 'cancelled', 'sent'].includes(reply.status) ||
          message.accountId !== account.id || message.platform !== account.platform || message.channel !== 'follow' ||
          message.id !== reply.messageId || typeof message.senderId !== 'string' || !/^[a-f\d]{24}$/i.test(message.senderId) || message.threadId !== `follower:${message.senderId}` ||
          message.isOwn || message.isGroup) throw new Error('只能检查原账号的小红书关注欢迎记录');
      if (!retainedWindow || retainedWindow.isDestroyed()) throw new Error('小红书原单聊窗口已关闭或没有待处理页面，请从该账号官方私信核对历史；不会重新发送');
      this.assertAccountUnreserved(account.id);
      if (sending || this.activeSends.has(account.id) || this.welcomeInspectionBlocked?.(account.id)) throw new Error('原账号正在执行其他操作，请稍后检查保留页面');
      retainedWindow.show(); retainedWindow.focus();
      return { opened: true, reused: true, retained: true, detail: '已打开小红书原单聊页面，请核对草稿或发送结果；未填写或重发消息。' };
    }
    if (account.platform !== 'douyin' || (!commentPrivate && (reply.channel !== 'follow' || reply.trigger !== 'follow')) || (!['failed', 'skipped', 'unknown'].includes(reply.status) && !cancelledRetained) ||
      message.id !== reply.messageId || message.accountId !== account.id || message.platform !== 'douyin' || message.channel !== reply.channel ||
      typeof message.senderId !== 'string' || !/^[1-9]\d{0,63}$/.test(message.senderId) ||
      (commentPrivate ? !message.threadId || !(message.externalId.startsWith(`${message.threadId}:`)||message.externalId.startsWith(`${message.threadId}/`)) : message.threadId !== `follower:${message.senderId}`) || message.isOwn || message.isGroup) throw new Error('只能检查原账号失败、已跳过或结果待核对的抖音关注或评论私信记录');
    const profileUrl = validateProfileUrl('douyin', message.profileUrl);
    if (/\/user\/self$/i.test(profileUrl)) throw new Error('原关注记录缺少可核对的粉丝主页');
    // This public official entry is derived only from the frozen validated
    // profile, never from numeric UID or caller-controlled query parameters.
    // A new BrowserWindow cold-loads it; no monitor SPA is navigated or clicked.
    const inspectionUrl = kind === 'chat' ? `https://www.douyin.com/jingxuan?imToSecUid=${new URL(profileUrl).pathname.slice('/user/'.length)}` : profileUrl;
    this.assertAccountUnreserved(account.id);
    if (retainedWindow) {
      const win = retainedWindow;
      if (!win.isDestroyed() && this.welcomePages.forAccount(account.id).includes(win) && this.welcomePageReplies.get(win) === reply.id) {
        // Open the original page, including an uncertain result or unsent
        // draft. Never navigate, inspect or retry it as a fresh recipient page.
        if (this.welcomeInspectionBlocked?.(account.id)) throw new Error('原账号正在执行其他操作，请稍后检查保留页面');
        win.show(); win.focus();
        return { opened: true, reused: true, retained: true,
          detail: '已打开这条记录原来的保留页面，请核对草稿或发送结果；本次不会填写或重发消息。' };
      }
    }
    // A cancelled record authorizes only revealing its own preserved window.
    // It must never fall through to a new inspection page or navigation.
    if (cancelledRetained) throw new Error('这条已取消记录的原保留页面已关闭，不能新建检查或重试');
    const connections = [...this.connections.values()].filter(item => item.accountId === account.id);
    if (sending || connections.some(item => item.busy || item.refreshing) || [...this.monitorOperations.keys()].some(key => key.startsWith(`${account.id}:`))) throw new Error('原账号正在处理消息或检查连接，请结束当前操作后再检查主页');
    const binding = this.control.bindings[account.id];
    if (!binding || binding.platform !== 'douyin' || !binding.establishedAt || typeof binding.identity !== 'string' || !/^[1-9]\d{0,63}$/.test(binding.identity) || binding.identity === message.senderId ||
      connections.some(item => !item.win.isDestroyed() && item.identity && item.identity !== binding.identity) ||
      !connections.some(item => ['dm', 'follow', ...(commentPrivate ? ['comment'] : [])].includes(item.channel) && !item.win.isDestroyed() && item.status === 'ready' && !item.needsReload && !item.needsRebuild &&
        !this.control.channels[item.key]?.loginRequired && item.identity === binding.identity && this.profile(account.id, item.channel)?.adapter === 'official-page-v1')) throw new Error('请先检查原账号的私信或关注连接，确认当前登录身份与已绑定账号一致');
    const bindingKey = JSON.stringify([binding.platform, binding.identity, binding.establishedAt]);
    const existing = this.welcomeProfileWindows.get(account.id);
    if (existing && !existing.win.isDestroyed()) {
      existing.win.show(); existing.win.focus();
      // Never navigate an existing inspection page: the user may have opened
      // a chat or entered a draft there. At most one such page owns an account.
      let actual;
      try {
        if (kind === 'chat') actual = existing.win.webContents.getURL();
        else { const url = new URL(existing.win.webContents.getURL()); url.search = ''; url.hash = ''; actual = validateProfileUrl('douyin', url.href); }
      } catch { /* Keep the existing page intact. */ }
      if (existing.kind !== kind || existing.profileUrl !== profileUrl || existing.bindingKey !== bindingKey || actual !== inspectionUrl) throw new Error('已显示这个账号已有的检查窗口。请先关闭该窗口，再检查其他粉丝页面；现有页面不会被覆盖');
      if (kind === 'chat') return this.inspectWelcomeChat(existing, { reply, message, account, profileUrl, inspectionUrl, bindingKey, identity: binding.identity });
      return { opened: true, reused: true, detail: kind === 'chat' ? '已显示原账号的粉丝聊天检查窗口；未填写、发送消息或关注对方。' : '已显示原账号的粉丝主页检查窗口；未点击私信、填写或发送消息。' };
    }
    this.welcomeProfileWindows.delete(account.id);
    const win = this.createWindow(account, kind === 'chat' ? 'fan-chat' : 'fan-profile', inspectionUrl, { background: false });
    const entry = { win, profileUrl, bindingKey, kind, inspectionGeneration: 0, inspectionReadyFrame: null };
    const wc = win.webContents;
    const onNavigation = (_event, _url, inPlace, mainFrame) => {
      if (mainFrame === false) return;
      entry.inspectionGeneration++;
      if (!inPlace) entry.inspectionReadyFrame = null;
    };
    const onReady = () => {
      if (!win.isDestroyed() && wc.getURL() === inspectionUrl && wc.mainFrame?.url === inspectionUrl) entry.inspectionReadyFrame = wc.mainFrame;
    };
    wc.on?.('did-start-navigation', onNavigation); wc.on?.('dom-ready', onReady);
    this.welcomeProfileWindows.set(account.id, entry);
    win.on('closed', () => {
      removePageListener(wc, 'did-start-navigation', onNavigation); removePageListener(wc, 'dom-ready', onReady);
      if (this.welcomeProfileWindows.get(account.id) === entry) this.welcomeProfileWindows.delete(account.id);
      this.changed();
    });
    this.changed();
    return { opened: true, reused: false, detail: kind === 'chat' ? '已用原账号打开官方粉丝聊天检查页；未填写、发送消息或关注对方。' : '已用原账号打开该粉丝主页，仅供检查；未点击私信、填写或发送消息。' };
  }
  async inspectWelcomeChat(entry, frozen) {
    const { reply, message, account, profileUrl, inspectionUrl, bindingKey, identity } = frozen;
    const token = `welcome-inspection:${randomUUID()}`, epoch = this.serviceGeneration;
    this.assertAccountUnreserved(account.id);
    if (this.welcomeInspectionBlocked?.(account.id)) throw new Error('原账号正在处理其他任务，请稍后只读检查');
    this.replyBatchAccounts.set(account.id, token);
    const check = () => {
      if (this.stopped || this.suspended || this.resuming || this.serviceGeneration !== epoch ||
          this.accountBlocked?.(account.id) || this.welcomeInspectionBlocked?.(account.id) || this.replyBatchAccounts.get(account.id) !== token ||
          this.welcomeProfileWindows.get(account.id) !== entry || entry.win.isDestroyed()) throw new Error('只读检查已取消');
      const currentAccount = this.validate(account.id, reply.channel), binding = this.control.bindings[account.id];
      if (currentAccount.platform !== 'douyin' || JSON.stringify([binding?.platform, binding?.identity, binding?.establishedAt]) !== bindingKey) throw new Error('检查账号已变化');
      this.withReadSnapshot(() => {
        const current = this.interactions.getReply(reply.id), event = this.interactions.getMessage(current.messageId);
        if (current.accountId !== account.id || current.messageId !== message.id || current.status !== reply.status ||
            current.channel !== reply.channel || current.deliveryChannel !== reply.deliveryChannel || !isRecipientPrivateReply(current) ||
            event.accountId !== account.id || event.platform !== 'douyin' || event.channel !== reply.channel ||
            event.senderId !== message.senderId || event.threadId !== message.threadId || event.profileUrl !== message.profileUrl ||
            event.isOwn || event.isGroup || this.interactions.snapshot().replies.some(item => item.accountId === account.id && item.status === 'sending')) throw new Error('原关注记录或发送状态已变化');
      });
      const connections = [...this.connections.values()].filter(item => item.accountId === account.id);
      if (connections.some(item => item.busy || item.refreshing || (!item.win.isDestroyed() && item.identity && item.identity !== identity)) ||
          [...this.monitorOperations.keys()].some(key => key.startsWith(`${account.id}:`)) ||
          !connections.some(item => ['dm', 'follow', ...(isCommentPrivateReply(reply) ? ['comment'] : [])].includes(item.channel) && !item.win.isDestroyed() && item.status === 'ready' && !item.needsReload && !item.needsRebuild &&
            !this.control.channels[item.key]?.loginRequired && item.identity === identity && this.profile(account.id, item.channel)?.adapter === 'official-page-v1')) throw new Error('原账号连接状态已变化');
    };
    try {
      const verification = await inspectWelcomeChatWindow({ entry, profileUrl, url: inspectionUrl, identity, recipientId: message.senderId, check,
        timeoutMs: Math.min(this.operationTimeoutMs, 5000) });
      // This separate diagnostic has no IDs, URLs, text, receipts or settings.
      // It never changes the original reply, ledger or channel configuration.
      write(this.welcomeInspectionPath, { version: 1, checkedAt: new Date().toISOString(), ...verification });
      return { opened: true, reused: true, verification, detail: verification.detail };
    } finally {
      if (this.replyBatchAccounts.get(account.id) === token) this.replyBatchAccounts.delete(account.id);
    }
  }
  closeWelcomeProfile(accountId) {
    const entry = this.welcomeProfileWindows.get(accountId);
    this.welcomeProfileWindows.delete(accountId);
    if (entry && !entry.win.isDestroyed()) entry.win.destroy();
  }
  welcomePagesSnapshot() {
    return this.welcomePages.snapshot().map(page => ({ ...page,
      replyId: this.welcomePageReplies.get(this.welcomePages.forAccount(page.accountId)[0]) || null }));
  }
  ownedWelcomeWindows(accountId) {
    if (accountId !== undefined) return this.welcomePages.forAccount(accountId);
    return this.welcomePages.snapshot().flatMap(page => this.welcomePages.forAccount(page.accountId));
  }
  releaseRetainedWelcomePages({ accountId } = {}) {
    if (accountId !== undefined) {
      this.welcomePages.validateAccountId(accountId);
      this.studio.getAccount(accountId);
    }
    return this.welcomePages.releaseIdle({ accountId });
  }
  reserveExternalBatch(batchId, accountIds) {
    if (this.stopped || this.suspended || this.resuming || this.interactions.getPolicy().paused) throw new Error('互动服务已暂停或正在恢复，请稍后启动批次');
    if (typeof batchId !== 'string' || !batchId || this.externalBatchAccounts.has(batchId) || !Array.isArray(accountIds) || !accountIds.length) throw new Error('批量发送账号预约无效');
    const ids = [...new Set(accountIds)];
    for (const accountId of ids) {
      this.validate(accountId, 'dm'); this.assertAccountUnreserved(accountId);
    }
    if (!Number.isFinite(this.externalReservationTimeoutMs) || this.externalReservationTimeoutMs <= 0) throw new Error('批量发送账号等待时间无效');
    // Reserve before yielding, so a periodic scan cannot repeatedly take the
    // next slot. Existing operations retain their own busy flags until done.
    this.externalBatchAccounts.set(batchId, ids);
    this.externalBatchResources.set(batchId, { batchId, ids, epoch: this.serviceGeneration, parked: new Map(), released: false, restoring: false, promise: null });
    for (const accountId of ids) this.replyBatchAccounts.set(accountId, batchId);
    const waiting = { ids, generation: this.serviceGeneration, cancelled: false, wake: null };
    this.externalBatchWaiters.set(batchId, waiting);
    return this.waitExternalBatch(batchId, waiting);
  }
  async waitExternalBatch(batchId, waiting) {
    const startedAt = performance.now();
    try {
      for (;;) {
        if (waiting.cancelled || this.externalBatchAccounts.get(batchId) !== waiting.ids || waiting.ids.some(id => this.replyBatchAccounts.get(id) !== batchId)) throw new Error('批量发送预约已取消，未开始发送');
        if (this.stopped || this.suspended || this.resuming || this.serviceGeneration !== waiting.generation || this.interactions.getPolicy().paused) throw new Error('互动服务已暂停或发生变化，批量发送预约已停止');
        const busy = waiting.ids.some(accountId => this.activeSends.has(accountId) || [...this.connections.values()].some(connection => connection.accountId === accountId && connection.busy) || [...this.monitorOperations.keys()].some(key => key.startsWith(`${accountId}:`)));
        if (!busy) {
          await this.parkExternalBatch(batchId, waiting, Math.min(startedAt + this.externalReservationTimeoutMs, performance.now() + 5000));
          if (waiting.cancelled || this.externalBatchAccounts.get(batchId) !== waiting.ids || this.stopped || this.suspended || this.resuming || this.serviceGeneration !== waiting.generation || this.interactions.getPolicy().paused) throw new Error('批量发送预约已取消或暂停，未开始发送');
          return { ready: true, batchId };
        }
        const remaining = this.externalReservationTimeoutMs - (performance.now() - startedAt);
        if (remaining <= 0) throw new Error('等待账号当前操作结束超时，未开始发送；请检查该账号连接后重新确认批次');
        await new Promise(resolve => {
          const done = () => { clearTimeout(timer); if (waiting.wake === done) waiting.wake = null; resolve(); };
          const timer = setTimeout(done, Math.min(100, remaining));
          waiting.wake = done;
        });
      }
    } catch (error) {
      if (this.externalBatchAccounts.get(batchId) === waiting.ids) this.releaseExternalBatch(batchId);
      throw error;
    } finally {
      if (this.externalBatchWaiters.get(batchId) === waiting) this.externalBatchWaiters.delete(batchId);
    }
  }
  cancelExternalBatch(batchId) {
    const waiting = this.externalBatchWaiters.get(batchId);
    if (waiting) { waiting.cancelled = true; waiting.wake?.(); }
  }
  cancelExternalBatchWaiters() {
    for (const batchId of this.externalBatchWaiters.keys()) this.cancelExternalBatch(batchId);
  }
  releaseExternalBatch(batchId) {
    this.cancelExternalBatch(batchId);
    const resource = this.externalBatchResources.get(batchId);
    if (resource?.restoring) return resource.promise;
    if (resource) resource.released = true;
    const finish = () => {
      if (resource && this.externalBatchResources.get(batchId) !== resource) return;
      for (const accountId of this.externalBatchAccounts.get(batchId) || []) if (this.replyBatchAccounts.get(accountId) === batchId) this.replyBatchAccounts.delete(accountId);
      this.externalBatchAccounts.delete(batchId); this.externalBatchResources.delete(batchId);
      this.changed();
    };
    if (!resource?.parked.size) { finish(); return; }
    resource.restoring = true;
    for (const accountId of resource.ids) if (![...resource.parked.values()].some(entry => entry.accountId === accountId) && this.replyBatchAccounts.get(accountId) === batchId) this.replyBatchAccounts.delete(accountId);
    for (const entry of resource.parked.values()) entry.connection.parkedRestoring = true;
    this.changed();
    // Batch completion is not blocked by cold page loads. Account reservations
    // remain until this serialized restoration has settled, so another batch
    // cannot overtake it or consume stale DOM evidence.
    resource.promise = Promise.resolve().then(async () => {
      for (const entry of resource.parked.values()) {
        const { accountId, channel, key, version } = entry;
        try {
          if (this.externalBatchResources.get(batchId) !== resource || this.stopped || this.suspended || this.resuming || this.serviceGeneration !== resource.epoch || this.interactions.getPolicy().paused || !this.monitoring(key) || this.interactions.getMode(accountId, channel) === 'off' || (this.monitorVersions.get(key) || 0) !== version || this.accountBlocked?.(accountId)) continue;
          await this.monitorConnection({ accountId, channel, forceReload: false, restoreToken: resource });
        } catch { /* The connection records its own login/transport error. */ }
        finally {
          if (this.externalBatchResources.get(batchId) === resource) {
            const connection = this.connections.get(key);
            for (const item of new Set([entry.connection, connection])) if (item?.parkedForBatch === batchId) {
              delete item.parkedForBatch; delete item.parkedRestoring;
              if (item.status === 'parked') { item.status = 'closed'; item.detail = '本批结束；监控恢复已暂停，原设置和消息基线已保留'; }
            }
            resource.parked.delete(key);
            if (![...resource.parked.values()].some(item => item.accountId === accountId) && this.replyBatchAccounts.get(accountId) === batchId) this.replyBatchAccounts.delete(accountId);
            this.changed();
          }
        }
      }
    }).catch(() => {}).finally(finish).catch(() => {});
    return resource.promise;
  }
  cancelExternalRestores() {
    // Called only after lifecycle invalidation. Releasing these restore-only
    // leases synchronously lets a subsequent wake/resume see every channel;
    // late work still fails its generation/token checks and cannot revive it.
    for (const resource of [...this.externalBatchResources.values()]) {
      if (!resource.restoring) continue;
      for (const entry of resource.parked.values()) for (const connection of new Set([entry.connection, this.connections.get(entry.key)])) {
        if (connection?.parkedForBatch !== resource.batchId) continue;
        delete connection.parkedForBatch; delete connection.parkedRestoring;
        connection.status = connection.win.isDestroyed() ? 'closed' : 'unconfigured'; connection.retryAt = null;
        connection.detail = '监控恢复已暂停，原设置和消息基线已保留';
      }
      for (const accountId of resource.ids) if (this.replyBatchAccounts.get(accountId) === resource.batchId) this.replyBatchAccounts.delete(accountId);
      resource.parked.clear();
      this.externalBatchAccounts.delete(resource.batchId); this.externalBatchResources.delete(resource.batchId);
    }
  }
  externalParkDenial(connection, resource, waiting, { probing = false } = {}) {
    if (!resource || this.externalBatchResources.get(resource.batchId) !== resource || resource.released || waiting.cancelled || this.externalBatchAccounts.get(resource.batchId) !== resource.ids || this.replyBatchAccounts.get(connection.accountId) !== resource.batchId || this.stopped || this.suspended || this.resuming || this.serviceGeneration !== resource.epoch || this.interactions.getPolicy().paused) return 'unavailable';
    if (this.connections.get(connection.key) !== connection || connection.win.isDestroyed() || !this.hidden(connection) || !this.activeMonitoring(connection) || connection.status !== 'ready' || this.profile(connection.accountId, connection.channel)?.adapter !== 'official-page-v1') return 'unavailable';
    if ((connection.busy && !probing) || connection.initialLoading || connection.refreshing || this.monitorOperations.has(connection.key) || this.accountBlocked?.(connection.accountId)) return 'busy';
    if (this.interactions.snapshot().replies.some(reply => reply.accountId === connection.accountId && (reply.channel === connection.channel || (connection.channel === 'dm' && isRecipientPrivateReply(reply))) && ['queued', 'sending', 'unknown'].includes(reply.status))) return 'pending-operation';
    return null;
  }
  async parkExternalBatch(batchId, waiting, deadline) {
    const resource = this.externalBatchResources.get(batchId);
    if (!resource || resource.ids !== waiting.ids) return;
    for (const connection of this.connections.values()) {
      if (performance.now() >= deadline) break;
      if (!resource.ids.includes(connection.accountId) || this.externalParkDenial(connection, resource, waiting)) continue;
      const generation = connection.generation, win = connection.win, url = win.webContents.getURL();
      connection.busy = true;
      try {
        const result = await this.probeIdleConnection(connection, deadline - performance.now());
        if (result?.ok !== true || result.safeToClose !== true || this.externalParkDenial(connection, resource, waiting, { probing: true }) || connection.generation !== generation || connection.win !== win || win.webContents.getURL() !== url) continue;
        resource.parked.set(connection.key, { connection, accountId: connection.accountId, channel: connection.channel, key: connection.key, version: this.monitorVersions.get(connection.key) || 0 });
        this.destroyConnection(connection);
        connection.parkedForBatch = batchId; connection.parkedRestoring = false; connection.status = 'parked'; connection.retryAt = null;
        connection.detail = '本批触达期间暂存监控页面以减少资源占用；原监控设置和消息基线已保留，批次结束后恢复';
        this.changed();
      } catch { /* Failure to prove an idle page always retains it. */ }
      finally { connection.busy = false; }
    }
  }
  batchReplyEnvironment(id, { batchId, draft } = {}) {
    if (this.stopped || this.suspended || this.resuming || this.interactions.getPolicy().paused) throw new Error('互动服务已暂停或正在恢复，不能批量回复');
    const message = this.interactions.getMessage(draft ? draft.message.id : this.interactions.getReply(id).messageId);
    if (draft && JSON.stringify(message) !== JSON.stringify(draft.message)) throw new Error('原始私信已变化，请重新预览');
    const reply = draft ? { origin: 'manual-batch', accountId: message.accountId, messageId: message.id, channel: 'dm', replyText: draft.replyText } : this.interactions.getReply(id);
    const account = this.validate(reply.accountId, 'dm');
    if (reply.channel !== 'dm' || message.channel !== 'dm' || message.accountId !== account.id || message.platform !== account.platform || message.isOwn || message.isGroup || (message.historical && reply.origin !== 'manual-batch') || !message.threadId || !message.senderId || !message.externalId) throw new Error('批量回复仅支持原账号收到的已有单人私信');
    const reservation = this.replyBatchAccounts.get(account.id);
    if (reservation && reservation !== batchId) this.assertAccountUnreserved(account.id);
    const connection = this.connections.get(this.key(account.id, 'dm')), profile = this.profile(account.id, 'dm');
    if (!connection || connection.win.isDestroyed() || connection.status !== 'ready' || connection.needsReload || connection.needsRebuild) throw new Error('原账号私信连接尚未就绪，请先检查连接');
    if (profile?.adapter !== 'official-page-v1') throw new Error('批量回复需要已校验的官方私信页面');
    const binding = this.control.bindings[account.id];
    if (!binding || binding.platform !== account.platform || !binding.establishedAt || connection.identity !== binding.identity) throw new Error('原账号身份未绑定或已变化，请重新检查连接');
    if (!batchId && [...this.connections.values()].some(item => item.accountId === account.id && item.busy)) throw new Error('原账号正在处理消息，请稍后预览批量回复');
    const actual = new URL(connection.win.webContents.getURL()), expected = new URL(profile.pageUrl);
    if (!isAllowedUrl(actual.href, getPlatform(account.platform).domains) || actual.origin !== expected.origin || !(actual.pathname === expected.pathname || (expected.pathname === '/chat' && actual.pathname.startsWith('/chat/')))) throw new Error('原账号私信页面已变化，请重新检查连接');
    const fingerprint = createHash('sha256').update(JSON.stringify({
      binding, profile, connectionId: connection.instanceId, generation: connection.generation,
      accountId: account.id, platform: account.platform, message,
      reply: reply.origin === 'manual-batch' ? { origin: reply.origin, messageId: reply.messageId, accountId: reply.accountId, channel: reply.channel, replyText: reply.replyText } : { id: reply.id, messageId: reply.messageId, accountId: reply.accountId, channel: reply.channel, ruleId: reply.ruleId, ruleRevision: reply.ruleRevision, trigger: reply.trigger, replyText: reply.replyText, modeAtCreation: reply.modeAtCreation, dueAt: reply.dueAt, createdAt: reply.createdAt },
    })).digest('hex');
    return { fingerprint, binding: structuredClone(binding), connection, accountId: account.id };
  }
  previewBatchReply(id) {
    this.interactions.checkBatchReply(id);
    const { fingerprint, binding } = this.batchReplyEnvironment(id);
    return { fingerprint, binding };
  }
  previewBatchDraft({ message, replyText }) {
    this.interactions.checkManualDraft({ messageId: message.id, replyText });
    const { fingerprint, binding } = this.batchReplyEnvironment(null, { draft: { message, replyText } });
    return { fingerprint, binding };
  }
  reserveReplyBatch(batchId, items) {
    if (typeof batchId !== 'string' || !batchId || this.replyBatchReservations.has(batchId) || !Array.isArray(items) || !items.length || items.length > 1000) throw new Error('批量回复预约无效');
    const prepared = items.map(item => {
      if (Boolean(item.replyId) === Boolean(item.messageId)) throw new Error('批量回复对象无效');
      const message = item.messageId ? this.interactions.getMessage(item.messageId) : null;
      const storedReply = item.replyId ? this.interactions.getReply(item.replyId) : null;
      const live = message ? this.previewBatchDraft({ message, replyText: item.replyText }) : this.previewBatchReply(item.replyId);
      if (live.fingerprint !== item.fingerprint) throw new Error('账号、页面或回复内容已变化，请重新预览');
      const accountId = message?.accountId || storedReply.accountId;
      if (item.accountId && item.accountId !== accountId) throw new Error('批量回复必须使用原来接收私信的账号');
      return { ...item, key: item.messageId || (storedReply.origin === 'manual-batch' ? storedReply.messageId : item.replyId), sourceMessageId: message?.id || storedReply.messageId, accountId };
    });
    if (new Set(prepared.map(item => item.key)).size !== prepared.length || new Set(prepared.map(item => item.sourceMessageId)).size !== prepared.length) throw new Error('批量回复不能重复选择同一消息');
    const reservation = { batchId, items: new Map(prepared.map(item => [item.key, item])), accounts: new Set(prepared.map(item => item.accountId)), cancelled: false, activeConnection: null };
    // Validation of every item completes before any account is reserved.
    this.replyBatchReservations.set(batchId, reservation);
    for (const accountId of reservation.accounts) this.replyBatchAccounts.set(accountId, batchId);
  }
  releaseReplyBatch(batchId) {
    const reservation = this.replyBatchReservations.get(batchId);
    if (!reservation) return;
    if (reservation.activeConnection) throw new Error('批量回复仍在核对发送结果，请等待当前操作结束');
    for (const accountId of reservation.accounts) if (this.replyBatchAccounts.get(accountId) === batchId) this.replyBatchAccounts.delete(accountId);
    this.replyBatchReservations.delete(batchId);
  }
  cancelReplyBatchOperation(batchId) {
    const reservation = this.replyBatchReservations.get(batchId);
    if (!reservation) return;
    reservation.cancelled = true;
    const connection = reservation.activeConnection;
    if (connection) {
      this.invalidate(connection); connection.status = 'unconfigured'; connection.retryAt = null;
      connection.detail = '批量回复已暂停；请核对当前草稿或发送结果后重新检查连接';
      this.changed();
    }
  }
  assertBatchReplyAuthorized(id, { batchId, fingerprint }) {
    const reply = this.interactions.getReply(id);
    const reservation = this.replyBatchReservations.get(batchId), item = reservation?.items.get(reply.origin === 'manual-batch' ? reply.messageId : id);
    if (!reservation || reservation.cancelled || !item || item.fingerprint !== fingerprint || this.replyBatchAccounts.get(item.accountId) !== batchId || this.replyBatchController?.isAuthorized(id, batchId) !== true) throw new Error('批量回复已暂停或确认已失效，未继续发送');
    if (this.batchReplyEnvironment(id, { batchId }).fingerprint !== fingerprint) throw new Error('账号、页面或回复内容已变化，未继续发送');
    return reservation;
  }
  sendBatchReply(id, authorization) {
    const reservation = this.assertBatchReplyAuthorized(id, authorization);
    const { connection } = this.batchReplyEnvironment(id, authorization);
    if (connection.busy || reservation.activeConnection) throw new Error('原账号连接仍在处理消息，批次未继续发送');
    this.interactions.checkBatchReply(id);
    // Approval and acquisition of the page's busy flag are synchronous. The
    // timer cannot consume a newly approved item between these two steps.
    this.interactions.approveReply(id);
    reservation.activeConnection = connection;
    return this.sendReply(id, authorization).catch(error => {
      if (this.interactions.getReply(id).status === 'queued') this.interactions.failBeforeSend(id, { error: error.message, code: 'preflight_failed' });
      throw error;
    }).finally(() => { reservation.activeConnection = null; });
  }
  monitoring(key) { return this.control.channels[key]?.monitorEnabled === true; }
  activeMonitoring(connection) { return this.monitoring(connection.key) && this.interactions.getMode(connection.accountId, connection.channel) !== 'off'; }
  invalidate(connection) {
    connection.generation++;
    connection.eventValidated = false;
    const error = Object.assign(new Error('连接已停止或变化，本次操作取消'), { code: 'CONNECTION_CANCELLED' });
    connection.cancelLoad?.(error);
    for (const cancel of [...(connection.cancelOperations || [])]) cancel(error);
  }
  cancelPending(accountId, channel) {
    for (const reply of this.interactions.snapshot().replies) if (reply.accountId === accountId && reply.channel === channel && ['pending', 'queued'].includes(reply.status)) this.interactions.cancelReply(reply.id);
  }
  destroyConnection(connection) {
    this.invalidate(connection); connection.intentionalClose = true;
    if (!connection.win.isDestroyed()) connection.win.destroy();
  }
  hidden(connection) {
    return typeof connection.win.isVisible === 'function' ? !connection.win.isVisible() : connection.background === true;
  }
  resourceSummary() {
    return this.withReadSnapshot(() => {
      const resident = [...this.connections.values()].filter(connection => !connection.win.isDestroyed());
      const hidden = resident.filter(connection => this.hidden(connection));
      const parked = [...this.connections.values()].filter(connection => connection.parkedForBatch);
      return { residentCount: resident.length, visibleCount: resident.length - hidden.length, hiddenCount: hidden.length,
        parkedCount: parked.length, restoringCount: parked.filter(connection => connection.parkedRestoring).length,
        monitoringCount: resident.filter(connection => this.monitoring(connection.key) && this.interactions.getMode(connection.accountId, connection.channel) !== 'off').length,
        busyCount: resident.filter(connection => connection.busy || connection.refreshing || this.monitorOperations.has(connection.key) || this.replyBatchAccounts.has(connection.accountId)).length,
        idleHiddenCount: hidden.filter(connection => this.releaseDenial(connection) === null).length,
        welcome: this.welcomePages.resourceSummary() };
    });
  }
  releaseDenial(connection, { probing = false } = {}) {
    if (this.stopped || this.suspended || this.resuming || this.connections.get(connection.key) !== connection || connection.win.isDestroyed()) return 'unavailable';
    if (!this.hidden(connection)) return 'visible';
    if ((connection.busy && !probing) || connection.refreshing || connection.initialLoading || this.monitorOperations.has(connection.key) || this.replyBatchAccounts.has(connection.accountId) || this.accountBlocked?.(connection.accountId)) return 'busy';
    if (this.monitoring(connection.key) && this.interactions.getMode(connection.accountId, connection.channel) !== 'off') return 'monitoring';
    if (connection.channel === 'dm' && ((this.monitoring(this.key(connection.accountId, 'follow')) && this.interactions.getMode(connection.accountId, 'follow') !== 'off') || this.commentPrivateEnabled(connection.accountId))) return 'monitoring-dependency';
    // Manual approval must survive cleanup until its reserved page can send.
    // Unknown work must keep its original page for receipt reconciliation.
    if (this.interactions.snapshot().replies.some(reply => reply.accountId === connection.accountId && (reply.channel === connection.channel || (isRecipientPrivateReply(reply) && connection.channel === 'dm')) && ['queued', 'sending', 'unknown'].includes(reply.status))) return 'pending-operation';
    return null;
  }
  async handleWindowHidden({ accountId, channel }) {
    this.validate(accountId, channel);
    const connection = this.connections.get(this.key(accountId, channel));
    if (connection && !connection.win.isDestroyed() && this.hidden(connection) && !this.activeMonitoring(connection)) {
      // A mode-off page may have remained visible when cleanup first ran. A
      // later native close/hide is a new opportunity, not permission to drop
      // drafts, uncertain sends, login dialogs or an account reservation.
      connection.background = true; connection.releaseWhenIdle = true;
    }
    return this.releaseIdleConnections({ accountId, channel });
  }
  releaseAfterOperation(connection) {
    if (connection.releaseWhenIdle) void Promise.resolve().then(() => this.releaseIdleConnections({ accountId: connection.accountId, channel: connection.channel })).catch(() => {});
  }
  probeIdleConnection(connection, timeoutMs = 1500) {
    // Unlike a sending timeout, a cleanup probe cannot invalidate or reload a
    // page. Failure is simply evidence that the page must be retained.
    return new Promise(resolve => {
      let settled = false;
      const finish = (_error, result) => {
        if (settled) return;
        settled = true; clearTimeout(timer); connection.cancelOperations.delete(finish); resolve(result);
      };
      const timer = setTimeout(() => finish(), Math.max(1, Math.min(1500, this.operationTimeoutMs, timeoutMs)));
      connection.cancelOperations ||= new Set(); connection.cancelOperations.add(finish);
      Promise.resolve().then(() => this.execute(connection, 'idlePageProbe')).then(result => finish(null, result), () => finish());
    });
  }
  async releaseIdleConnections({ accountId, channel } = {}) {
    if (accountId !== undefined) this.validate(accountId, channel || 'dm');
    if (channel !== undefined && !['dm', 'comment', 'follow'].includes(channel)) throw new Error('互动渠道无效');
    const results = [];
    for (const connection of [...this.connections.values()]) {
      if ((accountId !== undefined && connection.accountId !== accountId) || (channel !== undefined && connection.channel !== channel) || connection.win.isDestroyed()) continue;
      const base = { accountId: connection.accountId, channel: connection.channel };
      let reason = this.releaseDenial(connection);
      if (reason) { results.push({ ...base, released: false, reason }); continue; }
      const generation = connection.generation, win = connection.win;
      let url;
      try { url = win.webContents.getURL(); } catch { results.push({ ...base, released: false, reason: 'unavailable' }); continue; }
      connection.busy = true;
      try {
        const result = await this.probeIdleConnection(connection);
        reason = this.releaseDenial(connection, { probing: true });
        if (reason || connection.generation !== generation || connection.win !== win || win.webContents.getURL() !== url) { results.push({ ...base, released: false, reason: reason || 'page-changed' }); continue; }
        if (result?.ok !== true || result?.safeToClose !== true) { results.push({ ...base, released: false, reason: ['draft', 'dialog', 'page-changed'].includes(result?.reason) ? result.reason : 'unverified' }); continue; }
        this.destroyConnection(connection); connection.releaseWhenIdle = false;
        connection.status = 'closed'; connection.retryAt = null; connection.detail = '闲置页面已释放，登录状态与消息基线已保留；使用时重新打开并检查连接';
        results.push({ ...base, released: true });
      } catch { results.push({ ...base, released: false, reason: 'unavailable' }); }
      finally { connection.busy = false; }
    }
    const releasedCount = results.filter(result => result.released).length;
    if (releasedCount) this.changed();
    return { releasedCount, retainedCount: results.length - releasedCount, results, resources: this.resourceSummary() };
  }
  validate(accountId, channel) {
    const account = this.studio.getAccount(accountId);
    if (!ENTRY_PAGES[account.platform] || !['dm', 'comment', 'follow'].includes(channel)) throw new Error('互动仅支持小红书、抖音');
    return account;
  }
  profile(accountId, channel) { return this.profiles[this.key(accountId, channel)] || builtinProfile(this.studio.getAccount(accountId).platform, channel); }
  capability(accountId, channel) {
    const account = this.studio.getAccount(accountId);
    if (channel === 'follow') return { supported: Boolean(ENTRY_PAGES[account.platform]?.follow), liveVerified: this.connections.get(this.key(accountId, channel))?.eventValidated === true, sendVerified: false, requiresExistingConversation: !['douyin', 'xiaohongshu'].includes(account.platform) };
    return { supported: true };
  }
  withReadSnapshot(action) { return this.interactions.withReadSnapshot ? this.interactions.withReadSnapshot(action) : action(); }
  snapshot() {
    return this.withReadSnapshot(() => {
      const retained = new Map(this.welcomePagesSnapshot().filter(page => page.state === 'retained').map(page => [page.accountId, page]));
      return this.studio.snapshot().accounts.filter(account => ENTRY_PAGES[account.platform]).flatMap(account => ['dm', 'comment', 'follow'].map(channel => {
      const connection = this.connections.get(this.key(account.id, channel));
      const capability = this.capability(account.id, channel);
      const loginRequired = this.control.channels[this.key(account.id, channel)]?.loginRequired === true;
      const fallback = loginRequired ? '已退出登录，请重新登录原账号并检查连接' : capability.supported ? (channel === 'follow' ? `打开官方关注通知并检查连接；首次建立历史基线，${capability.requiresExistingConversation ? '欢迎语只支持可核对 ID 的已有单聊' : '新粉丝可通过已核对的官方主页建立单聊；平台限制会显示未发送原因'}` : '打开官方页面，登录后检查连接') : '此平台尚无已验证的新关注事件读取器';
      const key = this.key(account.id, channel), live = connection && !connection.win.isDestroyed();
      const accountPage = retained.get(account.id);
      let retainedReply;
      try { if (accountPage?.replyId) retainedReply = this.interactions.getReply(accountPage.replyId); } catch { /* Preserve legacy unlinked welcome pages. */ }
      const retainedPage = (channel === 'follow' || channel === 'comment' && isCommentPrivateReply(retainedReply)) ? accountPage : null;
      const welcomeBlocked = retainedPage ? { replyId: retainedPage.replyId, reason: retainedPage.reason, unknown: retainedPage.unknown } : null;
      const detail = (loginRequired ? fallback : connection?.detail || fallback) +
        (welcomeBlocked ? (channel === 'comment' ? '；评论私信等待处理保留页面，公开评论回复和监控继续。请在原记录点击“检查该评论者聊天”核对草稿或发送结果。' : '；欢迎语等待处理保留页面，请在原记录点击“检查该粉丝聊天”核对草稿或发送结果。') : '');
      return { accountId: account.id, channel, ...capability, loginRequired, status: loginRequired ? 'login' : connection?.status || 'closed', detail, ...(welcomeBlocked ? { welcomeBlocked } : {}), url: live ? connection.win.webContents.getURL() : (this.profile(account.id, channel)?.pageUrl || ENTRY_PAGES[account.platform][channel]), profile: this.profile(account.id, channel), mode: this.interactions.getMode(account.id, channel), monitorEnabled: this.monitoring(key), parked: Boolean(connection?.parkedForBatch), resourceRestoring: Boolean(connection?.parkedRestoring), background: Boolean(live && (typeof connection.win.isVisible === 'function' ? !connection.win.isVisible() : connection.background)), lastSuccessfulAt: connection?.lastSuccessfulAt || this.control.channels[key]?.lastSuccessfulAt || null, lastCheckedAt: connection?.lastCheckedAt || null, retryAt: connection?.retryAt ? new Date(connection.retryAt).toISOString() : null, retryCount: connection?.retryCount || 0, identityBound: Boolean(this.control.bindings[account.id]), eventValidated: Boolean(connection?.eventValidated) };
      }));
    });
  }
  diagnostics() {
    return this.withReadSnapshot(() => {
      const replies = this.interactions.snapshot().replies;
      return { generatedAt: new Date().toISOString(), paused: this.interactions.getPolicy().paused, service: this.serviceSummary(), connections: this.snapshot(), counts: Object.fromEntries(['pending', 'queued', 'sending', 'unknown'].map(status => [status, replies.filter(item => item.status === status).length])) };
    });
  }
  serviceSummary() {
    const channels = this.snapshot().filter(connection => connection.monitorEnabled);
    return { suspended: this.suspended || this.resuming, enabledCount: channels.length, activeCount: channels.filter(connection => connection.mode !== 'off').length,
      readyCount: channels.filter(connection => connection.status === 'ready' && connection.mode !== 'off' && !this.suspended && !this.resuming).length,
      attentionCount: channels.filter(connection => connection.mode !== 'off' && !connection.parked && !connection.resourceRestoring && ['login', 'unconfigured', 'error'].includes(connection.status)).length,
      recoveringCount: channels.filter(connection => connection.mode !== 'off' && (connection.status === 'recovering' || connection.resourceRestoring)).length,
      parkedCount: channels.filter(connection => connection.mode !== 'off' && connection.parked).length,
      restoringCount: channels.filter(connection => connection.mode !== 'off' && connection.resourceRestoring).length };
  }
  isCurrent(connection, generation) { return !this.stopped && !this.suspended && !this.accountBlocked?.(connection.accountId) && this.connections.get(connection.key) === connection && !connection.win.isDestroyed() && connection.generation === generation; }
  assertCurrent(connection, generation) { if (!this.isCurrent(connection, generation)) throw Object.assign(new Error('连接已停止或变化，本次操作取消'), { code: 'CONNECTION_CANCELLED' }); }
  saveControl() { write(this.controlPath, this.control); }
  pinIdentity(connection, identity) {
    if (typeof identity !== 'string' || !identity || identity.length > 1000) throw new Error('缺少可验证的登录账号身份');
    const platform = this.studio.getAccount(connection.accountId).platform;
    const pin = this.control.bindings[connection.accountId];
    if (pin && (pin.identity !== identity || pin.platform !== platform)) throw new Error('平台登录账号与已绑定账号不同，已停止。需主动清理该账号登录会话后重新绑定');
    if (!pin) { this.control.bindings[connection.accountId] = { identity, platform, establishedAt: new Date().toISOString() }; this.saveControl(); }
    connection.identity = identity;
    if (this.control.channels[connection.key]?.loginRequired) { delete this.control.channels[connection.key].loginRequired; this.saveControl(); }
  }
  forgetIdentity(accountId) {
    delete this.control.bindings[accountId];
    for (const key of Object.keys(this.control.channels)) if (key.startsWith(`${accountId}:`)) delete this.control.channels[key];
    this.saveControl();
  }
  markLoggedOut(accountId) {
    for (const channel of ['dm', 'comment', 'follow']) {
      const key = this.key(accountId, channel);
      this.control.channels[key] = { ...this.control.channels[key], monitorEnabled: false, loginRequired: true };
      const connection = this.connections.get(key);
      if (connection) { connection.eventValidated = false; connection.status = 'login'; connection.detail = '已退出登录，请重新登录原账号并检查连接'; connection.retryAt = null; }
    }
    this.saveControl(); this.changed();
  }
  saveProfile({ accountId, channel, profile }) {
    this.assertAccountUnreserved(accountId);
    const account = this.validate(accountId, channel);
    if (channel === 'follow' && profile?.adapter !== 'official-page-v1') throw new Error('关注事件只接受内置的严格读取器');
    const clean = profile?.adapter === 'official-page-v1' ? builtinProfile(account.platform, channel) : validateProfile(profile, account.platform);
    if (!clean) throw new Error('此平台暂不支持该事件');
    const key = this.key(accountId, channel);
    const next = { ...this.profiles, [key]: clean }; write(this.profilePath, next); this.profiles = next;
    for (const reply of this.interactions.snapshot().replies) if (reply.accountId === accountId && reply.channel === channel && ['pending', 'queued'].includes(reply.status)) this.interactions.cancelReply(reply.id);
    this.interactions.setMode({ accountId, channel, mode: 'review' });
    this.stopConnection(key, '页面设置已更新，请重新检查连接'); return clean;
  }
  stopConnection(key, detail) {
    const connection = this.connections.get(key);
    if (connection) { this.invalidate(connection); connection.status = connection.win.isDestroyed() ? 'closed' : 'unconfigured'; connection.detail = detail; connection.retryAt = null; }
    this.changed();
  }
  pause(paused) {
    if (typeof paused !== 'boolean') throw new Error('请明确指定暂停或恢复');
    const policy = this.interactions.updatePolicy({ paused });
    if (paused) { this.pendingMonitorActivations.clear(); this.cancelExternalBatchWaiters(); this.resuming = false; this.serviceGeneration++; for (const connection of this.connections.values()) { this.invalidate(connection); connection.needsReload = true; connection.renderRetryReadOnly = false; } this.cancelExternalRestores(); }
    else if (!this.suspended && !this.resuming) void this.restoreMonitoring().catch(() => {});
    this.changed(); return policy;
  }
  async setMonitoring({ accountId, channel, enabled }) {
    this.validate(accountId, channel);
    if (enabled) this.assertAccountUnreserved(accountId);
    if (typeof enabled !== 'boolean') throw new Error('请明确指定开启或停止后台监控');
    if (this.stopped) throw new Error('工作台正在关闭');
    const key = this.key(accountId, channel);
    this.control.channels[key] = { ...this.control.channels[key], monitorEnabled: enabled }; this.saveControl();
    if (!enabled) {
      this.pendingMonitorActivations.delete(key);
      this.monitorVersions.set(key, (this.monitorVersions.get(key) || 0) + 1);
      this.cancelPending(accountId, channel);
      const connection = this.connections.get(key);
      if (connection) { this.invalidate(connection); connection.releaseWhenIdle = true; connection.status = connection.win.isDestroyed() ? 'closed' : 'unconfigured'; connection.retryAt = null; connection.detail = '后台监控已停止，回复模式未改变；可见页面或未完成内容会保留'; }
      await this.releaseIdleConnections({ accountId, channel });
      this.changed(); return { ready: false, detail: '后台监控已停止，回复模式未改变' };
    }
    const connection = this.connections.get(key); if (connection) connection.releaseWhenIdle = false;
    if (this.resuming) this.queueMonitorActivation({ accountId, channel });
    this.changed();
    if (this.resuming && !this.interactions.getPolicy().paused && this.interactions.getMode(accountId, channel) !== 'off') return { ready: false, detail: '已记住后台监控请求；系统恢复后会检查并启动此渠道，回复模式未改变' };
    if (this.suspended || this.resuming || this.interactions.getPolicy().paused || this.interactions.getMode(accountId, channel) === 'off') return { ready: false, detail: '已记住后台监控设置；恢复运行并开启此渠道后再检查连接，回复模式未改变' };
    return this.monitorConnection({ accountId, channel, forceReload: this.connections.get(key)?.status !== 'ready' });
  }
  queueMonitorActivation({ accountId, channel }) {
    const key = this.key(accountId, channel), version = this.monitorVersions.get(key) || 0, epoch = this.serviceGeneration;
    const existing = this.pendingMonitorActivations.get(key);
    if (existing?.version === version && existing.epoch === epoch) return;
    this.pendingMonitorActivations.set(key, { accountId, channel, key, version, epoch });
  }
  async drainMonitorActivations(epoch) {
    // The startup snapshot cannot include requests made later during wake.
    // Drain only those explicit requests; do not automatically retry another
    // channel's hard login/identity error from the original restore pass.
    const valid = () => !this.stopped && !this.suspended && this.serviceGeneration === epoch && !this.interactions.getPolicy().paused;
    while (valid() && this.pendingMonitorActivations.size) {
      const request = this.pendingMonitorActivations.values().next().value;
      try {
        if (request.epoch !== epoch || request.version !== (this.monitorVersions.get(request.key) || 0) || !this.monitoring(request.key) || this.interactions.getMode(request.accountId, request.channel) === 'off') continue;
        const connection = this.connections.get(request.key);
        await this.monitorConnection({ ...request, forceReload: connection?.status !== 'ready' || connection.needsReload === true });
      } catch { /* The selected account may have been stopped or reserved. */ }
      finally { if (this.pendingMonitorActivations.get(request.key) === request) this.pendingMonitorActivations.delete(request.key); }
    }
  }
  monitorConnection({ accountId, channel, forceReload = true, restoreToken }) {
    this.assertAccountUnreserved(accountId, restoreToken);
    const key = this.key(accountId, channel), version = this.monitorVersions.get(key) || 0, epoch = this.serviceGeneration;
    const previous = this.monitorOperations.get(key);
    if (previous?.version === version && previous.epoch === epoch) return previous.promise;
    const valid = () => !this.stopped && !this.suspended && this.serviceGeneration === epoch && (this.monitorVersions.get(key) || 0) === version && this.monitoring(key) && !this.interactions.getPolicy().paused && this.interactions.getMode(accountId, channel) !== 'off' && (!restoreToken || this.externalRestoreAllowed(accountId, restoreToken));
    const operation = { version, epoch, promise: null };
    operation.promise = (async () => {
      if (!valid()) return { ready: false, detail: '后台监控已暂停或停止' };
      let connection = this.connections.get(key);
      const count = connection?.retryCount || 0;
      if (connection?.busy && !connection.needsRebuild && !connection.needsReload) return { ready: connection.status === 'ready', detail: '后台监控设置已保存；当前操作完成后继续监听' };
      // A renderer may never settle its old JavaScript promise after sleep or
      // a crash. Invalidate that window before constructing its replacement.
      if (connection && (connection.needsRebuild || connection.busy)) this.destroyConnection(connection);
      try {
        const fresh = !connection || connection.win.isDestroyed();
        this.open({ accountId, channel, background: true, restoreToken });
        connection = this.connections.get(key); connection.retryCount = count;
        if (!valid()) return { ready: false, detail: '后台监控已暂停或停止' };
        if (this.profile(accountId, channel)?.adapter !== 'official-page-v1') throw new Error('自定义页面仅支持手动检查；后台恢复需使用已校验的官方页面入口');
        // An explicitly settling comment DOM can be reread in place. Reloading
        // the generic creator entry would discard the selected work. Network,
        // navigation, wake and renderer failures never use this narrow path.
        const rereadComments = !fresh && connection.status === 'recovering' && connection.renderRetryReadOnly === true && !connection.needsReload && !connection.needsRebuild &&
          this.studio.getAccount(accountId).platform === 'douyin' && channel === 'comment' &&
          !connection.initialLoading && connection.win.webContents.isLoadingMainFrame?.() !== true;
        connection.status = 'recovering'; connection.detail = '正在后台重新加载官方页面并核对账号'; connection.retryAt = null; this.changed();
        const generation = connection.generation + 1;
        const result = await this.connect({ accountId, channel, recovering: true, background: true, reload: forceReload && !fresh && !rereadComments, restoreToken });
        if (valid() && this.isCurrent(connection, generation) && !result.ready) this.failConnection(connection, Object.assign(new Error(result.detail), { code: result.errorCode }), count);
        return result;
      } catch (error) {
        if (valid() && connection && this.connections.get(key) === connection) this.failConnection(connection, error, count);
        return { ready: false, detail: error.message, errorCode: error.code };
      } finally {
        if (valid()) { this.start(); this.changed(); }
      }
    })().finally(() => { if (this.monitorOperations.get(key) === operation) this.monitorOperations.delete(key); const connection = this.connections.get(key); if (connection) this.releaseAfterOperation(connection); });
    this.monitorOperations.set(key, operation);
    return operation.promise;
  }
  restoreMonitoring() {
    const epoch = this.serviceGeneration;
    if (this.restoreOperation?.epoch === epoch) return this.restoreOperation.promise;
    const operation = { epoch, promise: null };
    operation.promise = (async () => {
      const results = [];
      if (this.stopped || this.suspended || this.interactions.getPolicy().paused) return { results };
      for (const item of this.snapshot()) {
        if (this.stopped || this.suspended || this.interactions.getPolicy().paused || this.serviceGeneration !== epoch) break;
        if (!item.monitorEnabled || item.mode === 'off' || this.replyBatchAccounts.has(item.accountId)) continue;
        const connection = this.connections.get(this.key(item.accountId, item.channel));
        if (connection?.status === 'ready' && !connection.needsReload && !connection.win.isDestroyed()) continue;
        try { results.push({ accountId: item.accountId, channel: item.channel, ...await this.monitorConnection(item) }); }
        catch (error) { results.push({ accountId: item.accountId, channel: item.channel, ready: false, detail: error.message }); }
      }
      return { results };
    })().finally(() => { if (this.restoreOperation === operation) this.restoreOperation = null; });
    this.restoreOperation = operation; return operation.promise;
  }
  suspendMonitoring() {
    if (this.stopped || this.suspended) return this.serviceSummary();
    this.pendingMonitorActivations.clear(); this.cancelExternalBatchWaiters();
    this.suspended = true; this.resuming = false; this.serviceGeneration++;
    for (const connection of this.connections.values()) { this.invalidate(connection); connection.needsReload = true; connection.renderRetryReadOnly = false; }
    this.cancelExternalRestores();
    this.changed(); return this.serviceSummary();
  }
  resumeMonitoring() {
    if (this.resumeOperation?.epoch === this.serviceGeneration) return this.resumeOperation.promise;
    if (this.stopped || (!this.suspended && !this.resuming)) return Promise.resolve(this.serviceSummary());
    const epoch = this.serviceGeneration, operation = { epoch, promise: null };
    this.suspended = false; this.resuming = true;
    // Nothing from the pre-sleep page may send while channels are being
    // revalidated, including channels without persisted monitoring intent.
    for (const connection of this.connections.values()) {
      connection.status = 'unconfigured'; connection.detail = '唤醒后需重新验证官方页面'; connection.retryAt = null;
    }
    this.changed();
    operation.promise = (async () => {
      try { await this.restoreMonitoring(); await this.drainMonitorActivations(epoch); }
      finally {
        if (this.serviceGeneration === epoch) { this.resuming = false; this.changed(); }
        if (this.resumeOperation === operation) this.resumeOperation = null;
      }
      return this.serviceSummary();
    })();
    this.resumeOperation = operation; return operation.promise;
  }
  open({ accountId, channel, background = false, restoreToken }) {
    this.assertAccountUnreserved(accountId, restoreToken);
    if (this.stopped) throw new Error('工作台正在关闭');
    const account = this.validate(accountId, channel);
    if (!this.capability(accountId, channel).supported) throw new Error('此平台新关注欢迎尚未接通；请使用首次私信欢迎');
    const key = this.key(accountId, channel), current = this.connections.get(key);
    if (current && !current.win.isDestroyed()) {
      if (!background) { current.releaseWhenIdle = false; current.win.show(); current.win.focus(); current.background = false; }
      return { opened: true };
    }
    const pageUrl = background ? builtinProfile(account.platform, channel).pageUrl : this.profile(accountId, channel).pageUrl;
    const win = this.createWindow(account, channel, pageUrl, { background });
    const saved = this.control.channels[key];
    // A cancelled restore may be rebuilt by wake/resume before a new successful
    // check persists its baseline. Keep the old bound baseline, never old DOM.
    const retainedBaseline = current?.initialized && current.identity && this.control.bindings[accountId]?.identity === current.identity ? current : null;
    const connection = { key, accountId, channel, win, instanceId: randomUUID(), background, initialLoading: true, status: 'login', detail: '请在官方页面登录，再回工作台检查连接', identity: this.control.bindings[accountId]?.identity || null, generation: 0, startedAt: retainedBaseline?.startedAt || saved?.startedAt || Date.now(), initialized: Boolean(retainedBaseline || saved?.startedAt), lastSuccessfulAt: retainedBaseline?.lastSuccessfulAt || saved?.lastSuccessfulAt || null, busy: false, visitedThreads: new Set(), cursor: 0, retryCount: 0 };
    if (account.platform === 'douyin' && channel === 'comment') {
      const selectedThreadId = retainedBaseline?.selectedThreadId || retainedBaseline?.threadId || saved?.selectedThreadId;
      // This is only a restriction on the next verified read, never DOM or
      // send evidence. Legacy files without it keep the first-check behavior.
      if (typeof selectedThreadId === 'string' && selectedThreadId.trim()) connection.selectedThreadId = connection.threadId = selectedThreadId;
    }
    if (this.externalRestoreAllowed(accountId, restoreToken) && current?.parkedForBatch === restoreToken.batchId) {
      // Only the read baseline survives parking. Thread/DOM/receipt evidence is
      // always rebuilt and the current login identity is verified again.
      Object.assign(connection, { startedAt: current.startedAt, initialized: current.initialized, lastSuccessfulAt: current.lastSuccessfulAt,
        parkedForBatch: restoreToken.batchId, parkedRestoring: true });
    }
    this.connections.set(key, connection);
    const currentConnection = () => this.connections.get(key) === connection;
    connection.hiddenHandler = () => { if (currentConnection() && !win.isDestroyed() && !this.stopped && !connection.intentionalClose) void this.handleWindowHidden({ accountId, channel }).catch(() => {}); };
    win.on('hide', connection.hiddenHandler);
    win.on('close', event => {
      if (currentConnection() && this.monitoring(key) && !this.stopped && !connection.intentionalClose) { event.preventDefault(); win.hide?.(); connection.background = true; this.changed(); void this.handleWindowHidden({ accountId, channel }).catch(() => {}); }
    });
    win.on('closed', () => {
      win.removeListener('hide', connection.hiddenHandler);
      if (!currentConnection()) return;
      this.invalidate(connection);
      if (!this.stopped && !connection.intentionalClose && this.activeMonitoring(connection)) {
        connection.needsRebuild = true;
        this.failConnection(connection, Object.assign(new Error('后台页面意外关闭，将重新连接'), { code: 'WINDOW_DESTROYED' }));
      } else { connection.status = 'closed'; connection.detail = '页面已关闭，监听已停止'; connection.retryAt = null; }
      this.changed();
    });
    connection.initialLoadDone = () => { if (currentConnection()) connection.initialLoading = false; };
    win.webContents.once('did-finish-load', connection.initialLoadDone);
    win.webContents.on('dom-ready', () => {
      if (!currentConnection() || win.isDestroyed()) return;
      const wc = win.webContents, frame = wc.mainFrame;
      connection.domReadyFrame = frame?.url === wc.getURL() && typeof frame.executeJavaScript === 'function' ? frame : null;
    });
    win.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
      if (!currentConnection() || connection.refreshing || connection.intentionalClose || this.stopped || isMainFrame === false || code === -3 || !this.monitoring(key)) return;
      this.invalidate(connection); this.failConnection(connection, new Error(description || '平台页面加载失败')); this.changed();
    });
    win.webContents.on('did-start-navigation', (_event, _url, inPlace, isMainFrame) => {
      if (currentConnection() && isMainFrame && !inPlace) connection.domReadyFrame = null;
      if (!currentConnection() || !isMainFrame || inPlace || connection.refreshing || connection.initialLoading || connection.intentionalClose || this.stopped) return;
      if (this.monitoring(key)) { this.invalidate(connection); this.failConnection(connection, Object.assign(new Error('平台页面重新加载，将重新验证官方入口'), { code: 'PAGE_NAVIGATED' })); this.changed(); }
      else this.stopConnection(key, '页面重新加载后请检查连接');
    });
    win.webContents.on('render-process-gone', () => {
      if (!currentConnection() || connection.intentionalClose || this.stopped) return;
      this.invalidate(connection); connection.needsRebuild = true;
      this.failConnection(connection, Object.assign(new Error('平台页面进程已退出，将重新校验'), { code: 'RENDER_PROCESS_GONE' })); this.changed();
    });
    return { opened: true };
  }
  runPage(connection, operation, payload = {}, beforeExecute) {
    const generation = connection.generation;
    this.assertCurrent(connection, generation);
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, result) => {
        if (settled) return;
        settled = true; clearTimeout(timer); connection.cancelOperations.delete(finish);
        if (error) reject(error); else resolve(result);
      };
      const timer = setTimeout(() => {
        const error = Object.assign(new Error('平台页面操作超时，将重新加载并验证'), { code: 'PAGE_OPERATION_TIMEOUT' });
        finish(error);
        if (this.isCurrent(connection, generation)) {
          this.invalidate(connection); connection.needsRebuild = true; this.failConnection(connection, error); this.changed();
        }
      }, this.operationTimeoutMs);
      connection.cancelOperations ||= new Set(); connection.cancelOperations.add(finish);
      // Keep rejection handling attached even after cancellation or a timeout.
      // A late renderer response cannot reach a caller or update durable data.
      Promise.resolve().then(() => { this.assertCurrent(connection, generation); beforeExecute?.(); return this.execute(connection, operation, payload); }).then(result => {
        try { this.assertCurrent(connection, generation); finish(null, result); } catch (error) { finish(error); }
      }, error => finish(error));
    });
  }
  async execute(connection, operation, payload = {}) {
    const account = this.validate(connection.accountId, connection.channel), profile = this.profile(connection.accountId, connection.channel);
    if (!profile || connection.win.isDestroyed()) throw new Error('请打开平台页面');
    const currentUrl = connection.win.webContents.getURL();
    if (!currentUrl) throw new Error('平台页面尚未加载');
    const actual = new URL(currentUrl), expected = new URL(profile.pageUrl);
    const executeOfficial = script => {
      const wc = connection.win.webContents;
      if (account.platform !== 'xiaohongshu') return wc.executeJavaScript(script, false);
      const frame = wc.mainFrame, ready = frame && frame.url === currentUrl && typeof frame.executeJavaScript === 'function' &&
        (connection.domReadyFrame === frame || wc.isLoadingMainFrame?.() === false);
      if (!ready && wc.isLoadingMainFrame?.() !== false) throw Object.assign(new Error('小红书文档仍在加载，将重新检查；尚未提交操作'), { code: 'PAGE_RENDER_TIMEOUT' });
      // Do not enqueue writes behind page load. A ready mainFrame remains
      // executable while optional images/analytics are still loading.
      const startedAt = Date.now(), readMaySettle = connection.channel === 'dm' && ['scan', 'prepare', 'selectThread'].includes(operation);
      // A same-document chat route may settle between dispatch and execution.
      // These reads or an unexecuted row selection may ask their bounded
      // caller to recheck. No click has run at this guard; text writes,
      // submission, receipts and expired operations keep the strict URL gate.
      const code = `(()=>{const now=Date.now();if(now>=${startedAt + this.operationTimeoutMs}||now<${startedAt})return {ok:false,submitted:false,errorCode:'PAGE_OPERATION_EXPIRED',detail:'操作已过期，未提交'};if(location.href!==${JSON.stringify(currentUrl)}){const next=new URL(location.href);if(${readMaySettle}&&next.origin===${JSON.stringify(actual.origin)}&&(next.pathname==='/chat'||next.pathname.startsWith('/chat/')))return {ok:false,ready:false,submitted:false,renderPending:true,renderStage:'conversation',errorCode:'XHS_CHAT_ROUTE_PENDING',detail:'小红书单聊路由正在切换，将重新只读核对'};return {ok:false,submitted:false,detail:'页面变化，未提交'};}return ${script};})()`;
      return (ready ? frame : wc).executeJavaScript(code, false);
    };
    if (operation === 'idlePageProbe') {
      if (!isAllowedUrl(actual.href, getPlatform(account.platform).domains)) throw new Error('当前页面不是允许的平台页面');
      return executeOfficial(idlePageProbeScript({ platform: account.platform, url: actual.href }));
    }
    const mainSiteNotice = profile.adapter === 'official-page-v1' && account.platform === 'douyin' && connection.channel === 'follow' && actual.origin === 'https://www.douyin.com';
    // The creator site redirects its legacy comment entry to this observed
    // replacement. Treat only these exact official routes as equivalent;
    // custom profiles, other creator tools and other origins keep their gate.
    const commentPath = pathname => /^\/creator-micro\/(?:data\/following|interactive)\/comment\/?$/.test(pathname);
    const creatorCommentRedirect = profile.adapter === 'official-page-v1' && account.platform === 'douyin' && connection.channel === 'comment' &&
      actual.origin === 'https://creator.douyin.com' && expected.origin === 'https://creator.douyin.com' && commentPath(actual.pathname) && commentPath(expected.pathname);
    if (!isAllowedUrl(actual.href, getPlatform(account.platform).domains) || actual.origin !== expected.origin || !(actual.pathname === expected.pathname || mainSiteNotice || creatorCommentRedirect || (profile.adapter && expected.pathname === '/chat' && actual.pathname.startsWith('/chat/')))) throw new Error('当前页面与校准页面不同，请返回后重新检查连接');
    const args = { ...payload, identity: connection.identity || this.control.bindings[connection.accountId]?.identity || undefined };
    if (profile.adapter) return executeOfficial(builtinScript(profile, operation, args));
    if (['send', 'commit'].includes(operation)) throw new Error('自定义页面尚无发送对象和回执校验，仅支持读取及规则预览');
    return connection.win.webContents.executeJavaScriptInIsolatedWorld(913, [{ code: scriptFor(profile, operation, args) }], false);
  }
  async waitForFollowScan(connection, generation, { activate = false } = {}) {
    let activated = !activate, followMenuRequested = false, followMenuRetryCount = 0, detail = '关注列表尚未完成加载';
    for (let attempt = 0; attempt < 8; attempt++) {
      this.assertCurrent(connection, generation);
      if (!activated) {
        const result = await this.runPage(connection, 'activateFollow', { followMenuRequested, followMenuRetryCount }); this.assertCurrent(connection, generation);
        if (result?.followMenuRequested === true) followMenuRequested = true;
        if (result?.followMenuRetryCount === 1) followMenuRetryCount = 1;
        const identity = connection.identity || this.control.bindings[connection.accountId]?.identity;
        if (result?.identity && identity && result.identity !== identity) throw new Error('平台登录账号与已绑定账号不同，已停止读取关注通知');
        if (result?.invalidRows) throw new Error(result.detail || '关注通知结构未通过校验');
        if (result?.ok) {
          activated = true;
          // The official tab changes its rendered list asynchronously. Once
          // selected, only read again; repeated clicks could restart loading.
          await this.waitForPage(500); this.assertCurrent(connection, generation);
        } else {
          detail = result?.detail || '无法打开新增关注标签';
          if (result?.renderPending !== true && !/^请打开小红书通知页面的[“"]新增关注[”"]标签/.test(detail)) throw new Error(detail);
        }
      }
      if (activated) {
        const scan = await this.runPage(connection, 'scan'); this.assertCurrent(connection, generation);
        detail = scan?.detail || '关注通知结构未通过校验';
        // Loading retries must never hide a changed account or invalid row.
        const identity = connection.identity || this.control.bindings[connection.accountId]?.identity;
        if (scan?.identity && identity && scan.identity !== identity) throw new Error('平台登录账号与已绑定账号不同，已停止读取关注通知');
        if (scan?.invalidRows) throw new Error(detail);
        if (scan?.noFollowEvents === true) {
          // Only the official reader's fully loaded, classified empty result is
          // idle. A partial/malformed success must not become an empty baseline.
          if (!['douyin', 'xiaohongshu'].includes(this.studio.getAccount(connection.accountId).platform) || scan.ok !== true || scan.ready !== true || scan.invalidRows !== 0 || scan.renderPending === true || scan.threadId !== 'followers' || !Array.isArray(scan.messages) || scan.messages.length || !Array.isArray(scan.followers) || scan.followers.length || !Number.isSafeInteger(scan.ignoredRows) || scan.ignoredRows < 1) throw new Error('关注待机结果未通过完整页面校验');
          if (typeof scan.identity !== 'string' || !scan.identity || scan.identity.length > 1000) throw new Error('缺少可验证的登录账号身份，已停止读取关注通知');
          return scan;
        }
        const empty = scan?.ok && scan.ready !== false && (!Array.isArray(scan.messages) || !scan.messages.length || !Array.isArray(scan.followers) || !scan.followers.length);
        if (scan?.ok && scan.ready !== false && !empty) {
          if (typeof scan.identity !== 'string' || !scan.identity || scan.identity.length > 1000) throw new Error('缺少可验证的登录账号身份，已停止读取关注通知');
          return scan;
        }
        if (!empty && scan?.renderPending !== true && !/^关注列表正在加载或为空/.test(detail)) throw new Error(detail);
        if (empty) detail = '关注列表为空，不能据此建立或替换粉丝基线';
      }
      if (attempt < 7) { await this.waitForPage(500); this.assertCurrent(connection, generation); }
    }
    const error = new Error(`关注页面渲染等待超时：${detail}`);
    error.code = 'PAGE_RENDER_TIMEOUT';
    throw error;
  }
  followReadDetail(connection, scan) {
    const ignored = Number.isSafeInteger(scan.ignoredRows) && scan.ignoredRows > 0 ? `已跳过 ${scan.ignoredRows} 条非关注或已取消关注的通知。` : '';
    if (scan.noFollowEvents === true) return (connection.initialized ? '关注通知已读取，当前没有可确认仍在关注的事件；保留原粉丝基线，继续等待新关注。' : '关注通知已读取，当前没有可校准的关注事件；监听待机，首次有效读取只建立历史基线。') + ignored;
    const account = this.studio.getAccount(connection.accountId);
    return `已核对 ${scan.messages?.length || 0} 条关注记录。首次连接只建立历史基线；新关注欢迎语需同时连接私信。${account.platform === 'douyin' ? '无已有会话时，通过已核对的官方主页尝试建立单聊。' : '无已有会话时，通过官方私信入口加载并核对新粉丝单聊。'}平台限制会显示未发送原因。关注列表每分钟刷新，发现后按规则延迟发送。${ignored}`;
  }
  idleXhsInbox(connection, scan) {
    return connection.channel === 'dm' && this.studio.getAccount(connection.accountId).platform === 'xiaohongshu' &&
      this.profile(connection.accountId, 'dm')?.adapter === 'official-page-v1' && scan?.ok === true && scan.ready === false &&
      scan.connectionReady === true && scan.invalidRows === 0 &&
      ((scan.hasConversation === false && !scan.threadId) || (scan.hasConversation === true && scan.isGroup === true && typeof scan.threadId === 'string' && scan.threadId.length > 0 && scan.threadId.length <= 1000)) &&
      typeof scan.identity === 'string' && /^[a-f\d]{24}$/i.test(scan.identity) &&
      Array.isArray(scan.messages) && !scan.messages.length && Array.isArray(scan.receipts) && !scan.receipts.length;
  }
  xhsInboxState(connection, scan) {
    const inbox = scan?.xhsInbox;
    if (connection.channel !== 'dm' || this.studio.getAccount(connection.accountId).platform !== 'xiaohongshu' ||
        this.profile(connection.accountId, 'dm')?.adapter !== 'official-page-v1' || !inbox ||
        !['main', 'strangers'].includes(inbox.view) || typeof inbox.hasStrangerFolder !== 'boolean' ||
        !Number.isSafeInteger(inbox.folderUnread) || inbox.folderUnread < 0 || !Array.isArray(scan.threads)) return null;
    return inbox;
  }
  async advanceXhsInbox(connection, scan, generation) {
    const inbox = this.xhsInboxState(connection, scan);
    if (!inbox) return false;
    // The reader returns only already loaded, validated single conversations.
    // Keep independent cursors while visiting both official inbox folders;
    // neither a large history nor a perpetually unread row can monopolize them.
    const schedule = connection.xhsInboxSchedule ||= { view: inbox.view, views: {} };
    const state = schedule.views[inbox.view] ||= { cursor: 0, unreadCursor: 0, priorityTurns: 0, visits: 0 };
    if (schedule.view !== inbox.view) { state.visits = 0; schedule.view = inbox.view; }
    if (scan.canSwitch !== true) return true;
    const threads = [...new Set(scan.threads.filter(id => typeof id === 'string' && id))];
    const unread = [...new Set((Array.isArray(scan.unreadThreads) ? scan.unreadThreads : []).filter(id => threads.includes(id) && id !== scan.threadId))];
    state.visits++;
    const destination = inbox.view === 'strangers'
      ? state.visits >= 4 || !threads.length ? 'main' : null
      : inbox.hasStrangerFolder && (state.visits >= 4 || inbox.folderUnread > 0 && state.visits >= 2 || !threads.length) ? 'strangers' : null;
    if (destination) {
      const switched = await this.runPage(connection, 'switchInbox', { view: destination }); this.assertCurrent(connection, generation);
      if (switched?.identity && switched.identity !== connection.identity) throw new Error('私信列表切换期间登录账号变化，已停止读取');
      if (!switched?.ok) throw this.scanError(switched, '小红书私信列表尚未就绪，未继续切换');
      state.visits = 0; schedule.view = destination;
      if (schedule.views[destination]) schedule.views[destination].visits = 0;
      return true;
    }
    let next;
    if (unread.length && state.priorityTurns < 2) {
      next = unread[state.unreadCursor++ % unread.length]; state.priorityTurns++;
    } else {
      state.priorityTurns = 0;
      for (let count = 0; count < threads.length; count++) {
        const candidate = threads[state.cursor++ % threads.length];
        if (candidate !== scan.threadId) { next = candidate; break; }
      }
    }
    if (next) {
      const selected = await this.runPage(connection, 'selectThread', { threadId: next }); this.assertCurrent(connection, generation);
      if (selected?.identity && selected.identity !== connection.identity) throw new Error('私信会话切换期间登录账号变化，已停止读取');
      // A new message can move a row between the two official lists. Reread it
      // on the next bounded pass; this path never prepares or submits a reply.
      if (!selected?.ok && selected?.errorCode !== 'XHS_THREAD_NOT_FOUND' && !(selected?.errorCode === 'XHS_CHAT_ROUTE_PENDING' && selected.submitted === false && selected.renderPending === true)) throw this.scanError(selected, '小红书单聊尚未就绪，未切换或发送');
    }
    return true;
  }
  async selectReplyThread(connection, threadId, check) {
    const xhs = connection.channel === 'dm' && this.studio.getAccount(connection.accountId).platform === 'xiaohongshu';
    let selected;
    for (let attempt = 0; attempt < (xhs ? 4 : 1); attempt++) {
      selected = await this.runPage(connection, 'selectThread', { threadId }); check();
      // This code comes only from the URL dispatch guard, before the adapter
      // can click anything. Never retry a successful click, a general page
      // error, an uncertain outcome or any text fill/commit operation.
      if (!xhs || selected?.ok || selected?.submitted !== false || selected?.errorCode !== 'XHS_CHAT_ROUTE_PENDING' || selected?.renderPending !== true) return selected;
      if (attempt === 3) break;
      await this.waitForPage(350); check();
      const scan = await this.stableScan(connection, connection.generation); check();
      if ((!scan?.ok || scan.ready === false || scan.invalidRows) && !this.idleXhsInbox(connection, scan)) throw this.scanError(scan, '原私信页面尚未就绪，未发送');
      if (scan.identity !== connection.identity) throw new Error('私信登录账号变化，未发送');
      if (scan.canSwitch !== true) throw new Error('当前私信有未发送内容或附件，已保留，未切换会话');
    }
    return selected;
  }
  async recoverXhsReplyThread(connection, threadId, selection, check) {
    if (selection?.ok || selection?.errorCode !== 'XHS_THREAD_NOT_FOUND' || connection.channel !== 'dm' ||
        this.studio.getAccount(connection.accountId).platform !== 'xiaohongshu') return selection;
    const scan = await this.stableScan(connection, connection.generation); check();
    if ((!scan?.ok || scan.ready === false || scan.invalidRows) && !this.idleXhsInbox(connection, scan)) throw this.scanError(scan, '私信列表未通过校验，未发送');
    if (scan.identity !== connection.identity) throw new Error('私信登录账号变化，未发送');
    const inbox = this.xhsInboxState(connection, scan);
    if (!inbox || scan.canSwitch !== true || scan.threads.includes(threadId) || inbox.view === 'main' && !inbox.hasStrangerFolder) return selection;
    const view = inbox.view === 'main' ? 'strangers' : 'main';
    const switched = await this.runPage(connection, 'switchInbox', { view }); check();
    if (switched?.identity && switched.identity !== connection.identity) throw new Error('私信列表切换期间登录账号变化，未发送');
    if (!switched?.ok) return switched;
    await this.waitForPage(350); check();
    let found = false;
    // A folder click may settle its list after the active conversation. Only
    // reread the fixed destination; never reclick, fetch history or change peer.
    for (let attempt = 0; attempt < 8; attempt++) {
      const next = await this.stableScan(connection, connection.generation); check();
      if ((!next?.ok || next.ready === false || next.invalidRows) && !this.idleXhsInbox(connection, next)) throw this.scanError(next, '原私信列表尚未就绪，未发送');
      if (next.identity !== connection.identity) throw new Error('私信登录账号变化，未发送');
      if (next.canSwitch !== true) return selection;
      if (this.xhsInboxState(connection, next)?.view === view && next.threads.includes(threadId)) { found = true; break; }
      if (attempt < 7) { await this.waitForPage(350); check(); }
    }
    if (!found) return selection;
    // Merely locating the original thread does not authorize its composer:
    // sendReply still checks the original message, peer, identity and receipt.
    return this.selectReplyThread(connection, threadId, check);
  }
  async stableScan(connection, generation) {
    // Re-read a settling message row without accepting any partial result.
    // Identity, login and non-row failures are never hidden by these retries.
    // Comment lists also disappear briefly while the official sort refreshes.
    // Use the same bounded, read-only settling check as initial connection;
    // invalid rows and a different login still return/throw immediately.
    if (connection.channel === 'comment' && this.profile(connection.accountId, connection.channel)?.adapter === 'official-page-v1') {
      return this.waitForConnectionScan(connection, generation);
    }
    let scan;
    const xhs = connection.channel === 'dm' && this.studio.getAccount(connection.accountId).platform === 'xiaohongshu';
    for (let attempt = 0; attempt < (xhs ? 8 : 4); attempt++) {
      scan = await this.runPage(connection, 'scan'); this.assertCurrent(connection, generation);
      const identity = connection.identity || this.control.bindings[connection.accountId]?.identity;
      if (scan?.identity && identity && scan.identity !== identity) throw new Error('平台登录账号与已绑定账号不同，已停止读取');
      if (this.idleXhsInbox(connection, scan)) return scan;
      if (!xhs && connection.channel === 'dm' && this.studio.getAccount(connection.accountId).platform === 'douyin' &&
          this.profile(connection.accountId, 'dm')?.adapter === 'official-page-v1' &&
          scan?.renderPending === true && scan.renderStage === 'conversation' && !scan.invalidRows &&
          identity && scan.identity === identity) {
        // The official inbox can temporarily clear the active pane while its
        // list rehydrates. Use the same bounded, draft-aware existing-chat
        // selection as initial connection instead of permanently stopping all
        // replies and welcome dependencies. This never opens a new recipient
        // or prepares/commits a message; fresh send checks remain mandatory.
        return this.waitForConnectionScan(connection, generation);
      }
      if (xhs && scan?.renderPending === true && !scan.invalidRows && ['identity', 'conversation', 'recipient'].includes(scan.renderStage)) {
        if (attempt === 7) throw Object.assign(new Error(`小红书会话仍在加载，将重新检查：${scan.detail || '会话尚未就绪'}`), { code: 'PAGE_RENDER_TIMEOUT' });
        await this.waitForPage(350); this.assertCurrent(connection, generation); continue;
      }
      if (connection.channel !== 'dm' || scan?.errorCode !== 'MESSAGE_ROWS_INVALID' || !scan.identity || !identity || scan.identity !== identity || attempt === 3) return scan;
      await this.waitForPage(350); this.assertCurrent(connection, generation);
    }
    return scan;
  }
  scanError(scan, fallback) {
    const detail = scan?.invalidRows && (!scan.detail || /^已读取/.test(scan.detail)) ? `有 ${scan.invalidRows} 条消息未通过页面校验，未读取或回复这些消息` : scan?.detail || fallback;
    return Object.assign(new Error(detail), { code: scan?.errorCode });
  }
  async waitForConnectionScan(connection, generation) {
    const deadline = Date.now() + 8000;
    let activated = false, identity = connection.identity || this.control.bindings[connection.accountId]?.identity;
    for (let attempt = 0; attempt < 17; attempt++) {
      this.assertCurrent(connection, generation);
      const scan = await this.runPage(connection, 'scan'); this.assertCurrent(connection, generation);
      if (scan?.identity && identity && scan.identity !== identity) throw new Error('平台登录账号与已绑定账号不同，已停止读取');
      if (scan?.identity) identity = scan.identity;
      if (this.idleXhsInbox(connection, scan)) {
        if (scan.threads?.length && !activated) {
          const selected = await this.runPage(connection, 'activateFirst'); this.assertCurrent(connection, generation);
          if (!selected?.ok) return selected;
          activated = true; await this.waitForPage(350); continue;
        }
        return scan;
      }
      if (scan?.invalidRows || (scan?.ok && scan.ready !== false)) return scan;
      const stages = connection.channel === 'dm' ? ['identity', 'conversation', 'recipient'] : ['identity', 'comments'];
      if (this.profile(connection.accountId, connection.channel)?.adapter !== 'official-page-v1' || scan?.renderPending !== true || !stages.includes(scan.renderStage)) return scan;
      // Preparation alone may select one existing conversation. A hard reader
      // failure, changed account or invalid row never triggers this action.
      if (connection.channel === 'dm' && scan.renderStage === 'conversation' && !activated) {
        const selected = await this.runPage(connection, 'activateFirst'); this.assertCurrent(connection, generation);
        if (selected?.identity && identity && selected.identity !== identity) throw new Error('平台登录账号与已绑定账号不同，已停止读取');
        if (selected?.invalidRows || (!selected?.ok && selected?.renderPending !== true)) return selected;
        if (selected?.ok) activated = true;
      }
      if (attempt === 16 || Date.now() >= deadline) throw Object.assign(new Error(`页面渲染等待超时：${scan.detail || '请登录并打开需要监听的内容'}`), { code: 'PAGE_RENDER_TIMEOUT' });
      await this.waitForPage(Math.min(500, Math.max(0, deadline - Date.now()))); this.assertCurrent(connection, generation);
    }
  }
  async connect({ accountId, channel, recovering = false, background = false, reload = false, restoreToken }) {
    this.assertAccountUnreserved(accountId, restoreToken);
    const account = this.validate(accountId, channel);
    const key = this.key(accountId, channel);
    const connection = this.connections.get(key);
    if (!connection || connection.win.isDestroyed()) { this.open({ accountId, channel, background, restoreToken }); return { ready: false, detail: '页面已打开，请登录后检查连接' }; }
    if (connection.busy) throw new Error('当前连接正在处理消息，请稍后重试');
    const webContents = connection.win.webContents;
    connection.busy = true;
    const generation = ++connection.generation;
    connection.eventValidated = false;
    try {
      this.assertCurrent(connection, generation);
      connection.lastCheckedAt = new Date().toISOString();
      let scan;
      if (reload || (channel === 'follow' && account.platform === 'douyin' && connection.needsEntryReload)) scan = await this.reloadInteractionPage(connection, generation, { officialEntry: reload });
      if (!scan && connection.initialLoading) await this.waitInitialLoad(connection, generation);
      if (!scan) scan = channel === 'follow' ? await this.waitForFollowScan(connection, generation, { activate: true }) : await this.waitForConnectionScan(connection, generation);
      this.assertCurrent(connection, generation);
      if ((!scan?.ok || scan.ready === false || scan.invalidRows) && !this.idleXhsInbox(connection, scan)) throw this.scanError(scan, '消息缺少稳定 ID、账号或时间，连接未通过校验');
      this.pinIdentity(connection, scan.identity);
      const boundCommentWork = account.platform === 'douyin' && channel === 'comment';
      const selectedThreadId = boundCommentWork && (connection.selectedThreadId || this.control.channels[key]?.selectedThreadId || (connection.initialized && connection.threadId));
      if (recovering && selectedThreadId && scan.threadId !== selectedThreadId) throw new Error('评论恢复页面与原监控作品不一致；请打开原作品后检查连接，或手动检查以确认切换作品。未读取或回复其他作品评论');
      const idleFollow = channel === 'follow' && scan.noFollowEvents === true;
      const first = !connection.initialized && !idleFollow;
      if (first) connection.startedAt = Date.now();
      connection.threadId = scan.threadId; connection.lastRefreshAt = Date.now(); connection.lastCheckedAt = new Date().toISOString();
      if (boundCommentWork) connection.selectedThreadId = scan.threadId;
      connection.visitedThreads = new Set([scan.threadId]); connection.cursor = 0;
      if (channel === 'follow' && first) this.interactions.baselineFollowers({ accountId, followerIds: scan.followers || [], observedAt: new Date(connection.startedAt).toISOString() });
      for (const message of scan.messages || []) this.interactions.ingest({ ...message, accountId, channel, historical: first || Date.parse(message.receivedAt) < connection.startedAt });
      this.assertCurrent(connection, generation);
      connection.initialized ||= !idleFollow; connection.eventValidated = channel === 'follow' && !idleFollow && scan.messages?.length > 0;
      connection.status = 'ready'; connection.retryCount = 0; connection.retryAt = null;
      connection.needsReload = false; connection.needsRebuild = false; connection.renderRetryReadOnly = false; connection.lastSuccessfulAt = connection.lastCheckedAt;
      connection.detail = channel === 'follow' ? this.followReadDetail(connection, scan) : channel === 'dm' ? this.idleXhsInbox(connection, scan) ? '小红书账号已核对；私信列表待机，新单聊加载后继续读取' : '监听已加载的单人对话；首次连接前的历史消息不会自动回复' : '监听当前页面已加载的评论；切换作品后需重新检查连接';
      if (!this.monitoring(key)) connection.detail = '连接已核对，后台监控尚未开启。登录与消息基线已保留；开启监控后才会按所选回复方式处理新消息。';
      this.control.channels[key] = { ...this.control.channels[key], ...(connection.initialized ? { startedAt: connection.startedAt } : {}), ...(boundCommentWork ? { selectedThreadId: connection.selectedThreadId } : {}), lastSuccessfulAt: connection.lastCheckedAt, monitorEnabled: this.monitoring(key) }; this.saveControl();
      this.start(); return { ready: true, detail: connection.detail };
    } catch (error) {
      if (this.isCurrent(connection, generation)) { connection.eventValidated = false; connection.status = recovering ? 'error' : 'unconfigured'; connection.detail = error.message; }
      return { ready: false, detail: error.message, errorCode: error.code };
    } finally {
      try { removePageListener(webContents, 'did-finish-load', connection.initialLoadDone); }
      finally { connection.initialLoading = false; connection.busy = false; this.changed(); this.releaseAfterOperation(connection); }
    }
  }
  async connectAll({ accountId } = {}) {
    const accounts = accountId ? [this.studio.getAccount(accountId)] : this.studio.snapshot().accounts;
    const results = [], epoch = this.serviceGeneration;
    for (const account of accounts.filter(item => ENTRY_PAGES[item.platform])) for (const channel of ['dm', 'comment', 'follow']) {
      if (this.stopped || this.suspended || this.resuming || this.serviceGeneration !== epoch) break;
      const key = this.key(account.id, channel), existing = this.connections.get(key);
      const monitored = this.monitoring(key) && this.interactions.getMode(account.id, channel) !== 'off';
      const dependency = channel === 'dm' && ((this.monitoring(this.key(account.id, 'follow')) &&
        this.interactions.getMode(account.id, 'follow') !== 'off') || this.commentPrivateEnabled(account.id)) && this.interactions.getMode(account.id, 'dm') !== 'off';
      // A global health check must not create DM/comment renderers for every
      // saved account. Opening an unused channel remains an explicit action.
      if (!monitored && !dependency && (!existing || existing.win.isDestroyed())) continue;
      try {
        if (!existing || existing.win.isDestroyed()) this.open({ accountId: account.id, channel, background: true });
        const result = await this.connect({ accountId: account.id, channel, background: true });
        const connection = this.connections.get(key);
        if (connection && !connection.win.isDestroyed() && this.hidden(connection) && !this.activeMonitoring(connection)) {
          connection.releaseWhenIdle = true;
          await this.releaseIdleConnections({ accountId: account.id, channel });
        }
        const released = Boolean(connection?.win.isDestroyed());
        results.push({ accountId: account.id, channel, ...result,
          ...(released ? { ready: false, checkedReady: result.ready === true, released: true, detail: connection.detail } : {}) });
      }
      catch (error) { results.push({ accountId: account.id, channel, ready: false, detail: error.message }); }
    }
    return { results, detail: '已检查开启监控的渠道和当前打开的页面；闲置空白后台页已按条件释放。未使用的渠道请单独打开，发送模式未改变' };
  }
  setMode(data) {
    if (data.mode !== 'off') this.assertAccountUnreserved(data.accountId);
    this.validate(data.accountId, data.channel);
    const connection = this.connections.get(this.key(data.accountId, data.channel));
    if (data.mode === 'auto') {
      if (connection?.status !== 'ready') throw new Error('请先登录并检查连接');
      if (this.profile(data.accountId, data.channel)?.adapter !== 'official-page-v1') throw new Error('自定义页面尚未验证发送对象和回执，不支持自动发送');
      if (data.channel === 'follow') {
        const dm = this.connections.get(this.key(data.accountId, 'dm'));
        if (!this.capability(data.accountId, 'follow').liveVerified || dm?.status !== 'ready' || dm.identity !== connection.identity || this.profile(data.accountId, 'dm')?.adapter !== 'official-page-v1' || this.interactions.getMode(data.accountId, 'dm') === 'off') throw new Error('需先校验真实关注记录和同账号私信连接；当前不能开启关注自动回复');
      }
    }
    if (data.mode !== 'off' && connection?.busy) throw new Error('当前连接正在处理消息，请稍后重试');
    const result = this.interactions.setMode(data);
    if (data.mode !== 'off' && connection) connection.releaseWhenIdle = false;
    if (data.mode === 'off') this.pendingMonitorActivations.delete(this.key(data.accountId, data.channel));
    if (data.mode === 'off' && connection) { this.invalidate(connection); connection.retryAt = null; connection.releaseWhenIdle = true; this.releaseAfterOperation(connection); }
    if (data.mode !== 'off' && this.monitoring(this.key(data.accountId, data.channel)) && this.resuming) this.queueMonitorActivation(data);
    if (data.mode !== 'off' && this.monitoring(this.key(data.accountId, data.channel)) && connection?.status !== 'ready' && !this.suspended && !this.resuming && !this.interactions.getPolicy().paused) void this.monitorConnection(data).catch(() => {});
    return result;
  }
  async sendReply(id, batchAuthorization) {
    if (this.suspended || this.resuming) throw new Error('系统正在休眠或恢复连接，未发送');
    const reply = this.interactions.getReply(id), message = this.interactions.getMessage(reply.messageId);
    if (batchAuthorization) this.assertBatchReplyAuthorized(id, batchAuthorization);
    else if (this.replyBatchAccounts.has(reply.accountId)) return { deferred: true };
    if (this.activeSends.has(reply.accountId)) return { deferred: true, reason: 'account-sending' };
    if (this.interactions.getMode(reply.accountId, reply.channel) === 'off') throw new Error('回复模式已关闭；保留待处理记录，未发送');
    if (reply.status === 'queued' && reply.preparationRetry?.attempts) {
      const recovery = this.interactions.welcomePreparationRetryStatus(id);
      if (recovery.expired) {
        this.interactions.failBeforeSend(id, { error: '欢迎语准备恢复已超过时限，尚未发送，请检查原记录。' });
        this.changed(); return { sent: false, expired: true };
      }
      if (!recovery.ready) return { deferred: true, reason: 'welcome-preparation-retry', nextAttemptAt: recovery.nextAttemptAt };
    }
    const source = this.connections.get(this.key(reply.accountId, reply.channel));
    const commentPrivate = isCommentPrivateReply(reply), welcome = isRecipientPrivateReply(reply);
    if (commentPrivate && message.platform !== 'douyin') throw new Error('评论私信当前仅支持抖音，未发送');
    const triggerName = commentPrivate ? '评论私信' : '欢迎语';
    if (welcome && this.welcomePages.snapshot().some(page => page.accountId === reply.accountId && page.state === 'retained')) {
      // Do not age out/reclassify queued follow events while their account's
      // original draft or uncertain result is waiting for a person to inspect.
      return { deferred: true, reason: 'retained-welcome-page' };
    }
    // A retained page must be resolved first. Once released, expire stale
    // automatic work before any platform scan or new recipient page can block
    // newer events again. beginSend still performs its final age recheck.
    if (this.interactions.expireStaleAutoReply(id)) {
      this.changed(); return { sent: false, expired: true, reason: 'message_too_old' };
    }
    const connection = welcome ? this.connections.get(this.key(reply.accountId, 'dm')) : source;
    if (!source || source.status !== 'ready' || !connection || connection.status !== 'ready' || connection.win.isDestroyed()) throw new Error(welcome ? (commentPrivate ? '需先连接评论页和同账号私信页；未发送' : '需先连接关注页和同账号私信页；未发送') : '消息页面尚未连接，未发送');
    if (connection.busy || source.busy || this.monitorJobs.has(connection.key) || this.monitorJobs.has(source.key)) return { deferred: true };
    if (this.profile(connection.accountId, connection.channel)?.adapter !== 'official-page-v1') throw new Error('自定义页面目前仅支持读取，未发送');
    const sendLease = { id, source, connection, epoch: this.serviceGeneration };
    this.activeSends.set(reply.accountId, sendLease);
    connection.busy = source.busy = true;
    let claimed = false, commitStarted = false, welcomePage = null, welcomeWindow = null;
    const generation = connection.generation, sourceGeneration = source.generation;
    const checkReplyState = () => {
      if (this.interactions.getPolicy().paused || this.interactions.getReply(id).status !== (claimed ? 'sending' : 'queued')) throw new Error('回复已暂停、取消或结束，未继续发送');
      if (welcome && this.interactions.getMode(reply.accountId, 'dm') === 'off') throw new Error(`私信渠道已关闭，${triggerName}未发送`);
      if (welcome && this.interactions.getMode(reply.accountId, reply.channel) !== reply.modeAtCreation) throw new Error(`${triggerName}模式已变化，未继续发送`);
    };
    const check = () => {
      this.assertCurrent(connection, generation); this.assertCurrent(source, sourceGeneration);
      if (batchAuthorization) this.assertBatchReplyAuthorized(id, batchAuthorization);
      if (this.resuming || connection.status !== 'ready' || source.status !== 'ready') throw new Error('连接已停止');
      // Each synchronous check gets a fresh disk view once. Release it before
      // any await and before the independently locked final claim validation.
      if (typeof this.interactions.withReadSnapshot === 'function') this.interactions.withReadSnapshot(checkReplyState);
      else checkReplyState();
      if (claimed) this.interactions.assertCanCommit(id);
    };
    const run = (operation, payload) => welcomePage ? welcomePage.run(operation, payload) : this.runPage(connection, operation, payload, (batchAuthorization || commentPrivate) ? () => { check(); if (operation === 'commit') commitStarted = true; } : undefined);
    const verifyTrigger = async () => {
      const events = commentPrivate ? await this.stableScan(source, sourceGeneration) : await this.runPage(source, 'scan'); check();
      if (!events?.ok || events.ready === false || events.invalidRows || events.identity !== source.identity ||
          source.identity !== connection.identity || message.senderId === source.identity ||
          (commentPrivate && (events.threadId !== message.threadId || message.channel !== 'comment')) ||
          (events.messages || []).filter(item => item.externalId === message.externalId && item.senderId === message.senderId &&
            item.receivedAt === message.receivedAt && item.profileUrl === message.profileUrl && !item.isOwn && !item.isGroup &&
            (!commentPrivate || item.threadId === message.threadId && item.text === message.text)).length !== 1)
        throw new Error(commentPrivate ? '原始评论、作品或评论者主页已无法核对，评论私信未发送' : '原始关注记录或用户主页已无法核对，欢迎语未发送');
    };
    try {
    if (commentPrivate && this.profile(source.accountId, source.channel)?.adapter !== 'official-page-v1') throw new Error('评论私信必须使用已校验的官方评论读取器，未发送');
      check();
      if (message.platform === 'xiaohongshu' && connection.channel === 'dm' && reply.replyText.trim().length > 1000) throw new Error('小红书文本私信最多 1,000 个字符，请缩短回复文案；尚未填写或发送');
      let threadId = message.threadId;
      if (welcome) {
        if (this.interactions.getMode(reply.accountId, 'dm') === 'off') throw new Error(`私信渠道已关闭，${triggerName}未发送`);
        await verifyTrigger();
        const scan = await this.stableScan(connection, generation); check();
        if ((!scan?.ok || scan.ready === false || scan.invalidRows) && !this.idleXhsInbox(connection, scan)) throw new Error(scan?.detail || `私信页面校验未通过，${triggerName}未发送`);
        if (scan.identity !== source.identity) throw new Error(commentPrivate ? '私信账号与评论账号不一致，评论私信未发送' : '私信账号与关注账号不一致，欢迎语未发送');
        const candidates = (scan.threadDetails || []).filter(item => !item.isGroup && item.peerId === message.senderId);
        const targets = candidates.filter(item => item.peerVerified === true);
        const needsRecipientPage = !candidates.length || message.platform === 'xiaohongshu' && candidates.length === 1 && this.idleXhsInbox(connection, scan);
        if (needsRecipientPage && ((message.platform === 'douyin' && message.profileUrl) || (message.platform === 'xiaohongshu' && /^[a-f\d]{24}$/i.test(message.senderId))) && scan.canSwitch === true) {
          // A failed preparation may have retained a draft or an uncertain
          // renderer. Keep later replies queued rather than creating one
          // hidden homepage per event while that page needs attention.
          if (this.welcomePages.forAccount(reply.accountId).length) return { deferred: true, reason: 'retained-welcome-page' };
          const account = this.studio.getAccount(reply.accountId);
          const entryUrl = message.platform === 'xiaohongshu' ? xhsChatUrl(message.senderId) : message.profileUrl;
          const createWelcomeWindow = (preparedAccount, channel, url, options) => {
            check();
            if (welcomeWindow || preparedAccount?.id !== account.id || preparedAccount.platform !== account.platform ||
                channel !== 'dm' || url !== entryUrl || options?.background !== true) throw new Error('欢迎语临时页面与原账号或粉丝记录不一致');
            welcomeWindow = this.welcomePages.create(account, () => this.createWindow(preparedAccount, channel, url, options));
            this.welcomePageReplies.set(welcomeWindow, reply.id);
            return welcomeWindow;
          };
          const prepare = message.platform === 'xiaohongshu' ? this.prepareXhsWelcome : this.prepareWelcome;
          welcomePage = await prepare({ account, identity: source.identity, recipientId: message.senderId, profileUrl: message.profileUrl, createWindow: createWelcomeWindow, check, wait: this.waitForPage, operationTimeoutMs: this.operationTimeoutMs });
          check(); threadId = welcomePage.threadId;
          await verifyTrigger();
        } else {
          if (candidates.length !== 1 || targets.length !== 1) throw Object.assign(new Error(commentPrivate ? '无法唯一核对评论者的单人会话；缺少可验证的主页或平台不允许建立会话，评论私信未发送' : '无法唯一核对新粉丝的单人会话；缺少可验证的主页或平台不允许建立会话，欢迎语未发送'), { code: 'WELCOME_CONVERSATION_UNAVAILABLE' });
          threadId = targets[0].id;
        }
      }
      let selection = welcomePage ? await run('selectThread', { threadId }) : await this.selectReplyThread(connection, threadId, check); check();
      if (!welcome && !welcomePage) selection = await this.recoverXhsReplyThread(connection, threadId, selection, check);
      if (!selection?.ok) throw new Error(selection?.detail || '对话不可用');
      await this.waitForPage(350); check();
      const routing = welcome ? { welcome: true, ...(commentPrivate ? { commentPrivate: true } : {}), recipientId: message.senderId, threadId } : {};
      let prepared;
      for (let attempt = 0; attempt < (message.platform === 'xiaohongshu' && connection.channel === 'dm' ? 17 : 1); attempt++) {
        prepared = await run('prepare', { message, ...routing }); check();
        if (prepared?.identity && prepared.identity !== connection.identity) throw new Error('私信登录账号在准备期间变化，未发送');
        if (prepared?.ok || prepared?.invalidRows || prepared?.renderPending !== true || !['identity', 'conversation', 'recipient', 'message-thread', 'message-history'].includes(prepared?.renderStage)) break;
        if (attempt < 16) { await this.waitForPage(500); check(); }
      }
      if (!prepared?.ok) throw new Error(prepared?.detail || '原消息不可用');
      await this.waitForPage(180); check();
      if (commentPrivate) { await verifyTrigger(); check(); }
      const claim = this.interactions.beginSend(id); claimed = true;
      const payload = { message: claim.message, replyText: claim.reply.replyText, ...routing };
      const filled = await run('send', payload); check();
      if (!filled?.ok) throw new Error(filled?.detail || '无法填写回复');
      if (filled.needsNativeInput) throw new Error('旧式跨页面输入已停用，请更新内置页面适配器');
      await this.waitForPage(120); check();
      this.interactions.assertCanCommit(id);
      if (!batchAuthorization && !commentPrivate) commitStarted = true;
      const commit = await run('commit', payload);
      if (!commit?.ok || commit.nativeEnter) { commitStarted = commit?.nativeEnter ? false : commit?.submitted !== false; throw new Error(commit?.detail || '发送前检查失败'); }
      for (let attempt = 0; attempt < 8; attempt++) {
        await this.waitForPage(700);
        if (!this.isCurrent(connection, generation)) break;
        const result = await run('receipt', { threadId, replyText: claim.reply.replyText, before: filled.before, replyTo: filled.replyTo, claimedAt: claim.reply.claimedAt, ...(welcome ? { ...routing, message: claim.message, beforeClientIds: filled.beforeClientIds } : {}) });
        if (!result?.ok) break;
        if (result.failure) {
          if (welcome && message.platform === 'douyin' && !result.receipt && verifiedWelcomeRejection(result.failure, threadId, filled.beforeClientIds)) {
            this.interactions.finishSend(id, { status: 'failed', error: result.failure.detail, receipt: result.failure.evidence });
            return { sent: false, failed: true, failure: result.failure };
          }
          // Conflicting, unbound or unrecognised evidence remains uncertain.
          // It must not be persisted as success or cause another submission.
          break;
        }
        if (batchAuthorization && result.receipt && (typeof result.receipt !== 'string' || !/^platform:\S+$/.test(result.receipt))) break;
        if (result.receipt) { this.interactions.finishSend(id, { status: 'sent', receipt: result.receipt }); return { sent: true, receipt: result.receipt }; }
      }
      this.interactions.finishSend(id, { status: 'unknown', error: '已提交发送，未取得唯一送达回执。请到平台核对，不会自动重试。' });
      return { sent: false, unknown: true };
    } catch (error) {
      const preparationFailure = releasedPreparationFailure(error);
      if (!claimed && !commitStarted && welcome && !welcomePage && welcomeWindow?.isDestroyed() &&
          preparationFailure && reply.preparationRetry) {
        // The helper attests only a safely released read-only preparation.
        // Recheck current intent after cleanup, then persist on the same reply;
        // no prior failed/skipped/unknown record is selected or resurrected.
        try {
          check();
          const recovery = this.interactions.deferWelcomePreparation(id, preparationFailure);
          if (recovery.deferred || recovery.exhausted) return recovery;
        } catch { /* Preserve existing cancellation and ordinary failure rules. */ }
      }
      if (claimed) this.interactions.finishSend(id, { status: commitStarted ? 'unknown' : 'failed', error: error.message });
      else if (this.interactions.getReply(id).status === 'queued') this.interactions.failBeforeSend(id, { error: error.message, code: error.code === 'WELCOME_CONVERSATION_UNAVAILABLE' ? 'welcome_conversation_unavailable' : 'preflight_failed' });
      if (claimed && commitStarted && ['PAGE_OPERATION_TIMEOUT', 'CONNECTION_CANCELLED'].includes(error.code)) return { sent: false, unknown: true };
      throw error;
    } finally {
      let unknown = true;
      try { unknown = ['sending', 'unknown'].includes(this.interactions.getReply(id).status); } catch { /* Preserve uncertain work. */ }
      // Submission is not delivery. Keep the actual page until an uncertain
      // result can be reconciled, even if its composer is already empty.
      try { await welcomePage?.close({ preserve: unknown }); }
      finally {
        if (welcomeWindow) {
          this.welcomePages.retain(welcomeWindow, { unknown });
          let cleanupAfterStop = this.stopped;
          try { cleanupAfterStop ||= this.interactions.getMode(reply.accountId, reply.channel) === 'off'; } catch { /* Resource bookkeeping cannot strand the worker. */ }
          if (cleanupAfterStop) {
            void this.releaseRetainedWelcomePages({ accountId: reply.accountId }).catch(() => {});
          }
        }
        if (this.activeSends.get(reply.accountId) === sendLease) this.activeSends.delete(reply.accountId);
        connection.busy = source.busy = false; this.changed(); this.releaseAfterOperation(connection);
        if (source !== connection) this.releaseAfterOperation(source);
      }
    }
  }
  async waitInitialLoad(connection, generation) {
    this.assertCurrent(connection, generation);
    if (!connection.initialLoading) return;
    const wc = connection.win.webContents;
    const xhs = this.studio.getAccount(connection.accountId).platform === 'xiaohongshu';
    const domReady = () => xhs && connection.domReadyFrame && connection.domReadyFrame === wc.mainFrame &&
      wc.mainFrame.url === wc.getURL() && typeof wc.mainFrame.executeJavaScript === 'function';
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        removePageListener(wc, 'did-finish-load', done); removePageListener(wc, 'did-fail-load', failed); removePageListener(wc, 'dom-ready', documentReady);
        if (connection.cancelLoad === finish) connection.cancelLoad = null;
        if (error) reject(error); else resolve();
      };
      const done = () => finish();
      const documentReady = () => { if (domReady()) finish(); };
      const failed = (_event, code, description, _url, isMainFrame) => { if (isMainFrame !== false && code !== -3) finish(Object.assign(new Error(description || '页面加载失败'), { code: 'PAGE_LOAD_FAILED' })); };
      const timer = setTimeout(() => finish(Object.assign(new Error('页面首次加载超时'), { code: 'PAGE_LOAD_TIMEOUT' })), 20000);
      connection.cancelLoad = finish;
      try {
        wc.once('did-finish-load', done); wc.on('did-fail-load', failed); if (xhs) wc.on('dom-ready', documentReady);
        if (domReady() || !connection.initialLoading || (typeof wc.isLoadingMainFrame === 'function' && !wc.isLoadingMainFrame() && /^https:\/\//.test(wc.getURL()))) finish();
      } catch (error) { finish(error); }
    });
    this.assertCurrent(connection, generation);
    await this.waitForPage(1200); this.assertCurrent(connection, generation);
  }
  async reloadInteractionPage(connection, generation, { officialEntry = false } = {}) {
    this.assertCurrent(connection, generation);
    connection.eventValidated = false;
    const account = this.studio.getAccount(connection.accountId);
    const reopenNotice = account.platform === 'douyin' && connection.channel === 'follow';
    // Douyin may redirect this entry to /jingxuan and remove its query. Reload
    // of that destination loses the notice panel, so reuse the official entry.
    if (reopenNotice) connection.needsEntryReload = true;
    const wc = connection.win.webContents;
    connection.refreshing = true;
    try {
      await new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
          clearTimeout(timer);
          try { removePageListener(wc, 'did-finish-load', done); removePageListener(wc, 'did-fail-load', failed); }
          finally { if (connection.cancelLoad === finish) connection.cancelLoad = null; }
        };
        const finish = error => {
          if (settled) return;
          settled = true;
          try { cleanup(); } finally { if (error) reject(error); else resolve(); }
        };
        const done = () => finish();
        const failed = (_event, code, description, _url, isMainFrame) => { if (isMainFrame !== false && code !== -3) finish(Object.assign(new Error(description || '页面加载失败'), { code: 'PAGE_LOAD_FAILED' })); };
        const timer = setTimeout(() => finish(Object.assign(new Error('页面刷新超时'), { code: 'PAGE_LOAD_TIMEOUT' })), 20000);
        connection.cancelLoad = finish;
        try {
          wc.once('did-finish-load', done);
          wc.on('did-fail-load', failed);
          if (reopenNotice || officialEntry) {
            // Attach rejection handling immediately, including when a load
            // event arrives before the navigation promise settles.
            Promise.resolve(connection.win.loadURL(builtinProfile(account.platform, connection.channel).pageUrl)).catch(finish);
          } else wc.reload();
        } catch (error) { finish(error); }
      });
      this.assertCurrent(connection, generation); await this.waitForPage(1200); this.assertCurrent(connection, generation);
      const scan = connection.channel === 'follow' ? await this.waitForFollowScan(connection, generation, { activate: true }) : undefined;
      if (connection.channel === 'follow') connection.eventValidated = scan.noFollowEvents !== true && scan.messages.length > 0;
      if (reopenNotice) connection.needsEntryReload = false;
      return scan;
    } finally {
      try { removePageListener(wc, 'did-finish-load', connection.initialLoadDone); }
      finally { connection.refreshing = false; connection.initialLoading = false; }
    }
  }
  async refreshComments(connection, scan) {
    if (!['comment', 'follow'].includes(connection.channel) || !this.profile(connection.accountId, connection.channel)?.adapter || Date.now() - (connection.lastRefreshAt || 0) < 60000 || scan.canSwitch === false || this.interactions.getPolicy().paused || this.interactions.getMode(connection.accountId, connection.channel) === 'off') return;
    connection.lastRefreshAt = Date.now(); const generation = connection.generation;
    const account = this.studio.getAccount(connection.accountId);
    if (account.platform === 'douyin' && connection.channel === 'comment') {
      for (const label of ['按点赞量排序', '按评论时间排序']) {
        const opened = await this.waitForCommentRefresh(connection, generation, 'refreshOpen', { label }); this.assertCurrent(connection, generation);
        if (opened.skipped) return; if (!opened.ok) throw new Error(opened.detail);
        await sleep(160); this.assertCurrent(connection, generation);
        const selected = await this.waitForCommentRefresh(connection, generation, 'refreshSort', { label }); this.assertCurrent(connection, generation);
        if (selected.skipped) return; if (!selected.ok) throw new Error(selected.detail);
        await sleep(700); this.assertCurrent(connection, generation);
      }
    } else await this.reloadInteractionPage(connection, generation);
  }
  async waitForCommentRefresh(connection, generation, operation, payload = {}) {
    const deadline = Date.now() + 8000;
    for (let attempt = 0; attempt < 17; attempt++) {
      this.assertCurrent(connection, generation);
      const result = await this.runPage(connection, operation, { ...payload, threadId: connection.threadId }); this.assertCurrent(connection, generation);
      const identity = connection.identity || this.control.bindings[connection.accountId]?.identity;
      if (result?.identity && identity && result.identity !== identity) throw new Error('平台登录账号与已绑定账号不同，已停止刷新评论');
      if (result?.threadId && connection.threadId && result.threadId !== connection.threadId) throw new Error('所选作品已切换，请重新检查评论连接');
      if (result?.invalidRows || result?.ok || result?.renderPending !== true || !['identity', 'comments', 'comment-sort'].includes(result.renderStage)) return result;
      // Only the adapter's explicit not-yet-rendered result can be retried.
      // Opening is idempotent; sorting is retried only before its one click.
      // No composer, submit action or receipt is retried by this helper.
      if (attempt === 16 || Date.now() >= deadline) throw Object.assign(new Error(`评论刷新等待超时：${result.detail || '评论列表或排序菜单仍在加载'}`), { code: 'PAGE_RENDER_TIMEOUT' });
      await this.waitForPage(Math.min(500, Math.max(0, deadline - Date.now()))); this.assertCurrent(connection, generation);
    }
  }
  schedulingAllowed(epoch) {
    return !this.stopped && !this.suspended && !this.resuming && this.serviceGeneration === epoch && !this.interactions.getPolicy().paused;
  }
  scheduleRetainedWelcomeCleanup(epoch, owner) {
    if (!this.schedulingAllowed(epoch) || this.retainedWelcomeCleanup || this.monitorJobs.size >= 2) return null;
    const now = performance.now();
    const pages = this.welcomePagesSnapshot()
      .filter(page => page.state === 'retained' && page.hidden && !page.unknown && !page.probing &&
        (this.retainedWelcomeCleanupAt.get(page.accountId) || 0) <= now)
      .sort((a, b) => (this.retainedWelcomeCleanupAt.get(a.accountId) || 0) - (this.retainedWelcomeCleanupAt.get(b.accountId) || 0));
    for (const page of pages) {
      let originalReply;
      try { originalReply = page.replyId && this.interactions.getReply(page.replyId); } catch { continue; }
      if (!isRecipientPrivateReply(originalReply)) continue;
      const key = this.key(page.accountId, originalReply.channel), version = this.monitorVersions.get(key) || 0;
      const win = this.welcomePages.forAccount(page.accountId).find(item => this.welcomePageReplies.get(item) === page.replyId);
      if (!win || !page.replyId) continue;
      const canRelease = () => {
        if (!this.schedulingAllowed(epoch) || this.accountBlocked?.(page.accountId) ||
            this.replyBatchAccounts.has(page.accountId) || this.activeSends.has(page.accountId) ||
            !this.monitoring(key) || this.interactions.getMode(page.accountId, originalReply.channel) === 'off' ||
            (this.monitorVersions.get(key) || 0) !== version || win.isDestroyed() ||
            this.welcomePageReplies.get(win) !== page.replyId || !this.welcomePages.forAccount(page.accountId).includes(win)) return false;
        const reply = this.interactions.getReply(page.replyId);
        return reply.accountId === page.accountId && reply.channel === originalReply.channel && isRecipientPrivateReply(reply) &&
          ['skipped', 'failed', 'cancelled', 'sent'].includes(reply.status);
      };
      try { if (!canRelease()) continue; } catch { continue; }
      // This is only a fresh read of a preserved page, never a message retry.
      // It shares the two-reader budget and probes each account at most once
      // every 30 seconds; drafts, dialogs, visible and uncertain pages remain.
      this.retainedWelcomeCleanupAt.set(page.accountId, now + 30000);
      const operation = { epoch, accountId: page.accountId, promise: null };
      this.retainedWelcomeCleanup = operation;
      operation.promise = Promise.resolve().then(() => this.welcomePages.releaseIdle({ accountId: page.accountId, canRelease }))
        .catch(() => { /* Keep the page when its original scope cannot be rechecked. */ })
        .finally(() => {
          if (this.retainedWelcomeCleanup === operation) this.retainedWelcomeCleanup = null;
          this.changed();
          // Only still-queued work is selected. The old terminal record and
          // its text/claim/receipt are not modified or replayed by cleanup.
          this.scheduleQueuedReply(epoch, owner);
        });
      return operation.promise;
    }
    return null;
  }
  async scanConnection(connection, epoch, knownMessages) {
    if (!this.schedulingAllowed(epoch) || this.connections.get(connection.key) !== connection || connection.busy ||
        !this.monitoring(connection.key) || this.replyBatchAccounts.has(connection.accountId) ||
        this.interactions.getMode(connection.accountId, connection.channel) === 'off') return;
    if (connection.status === 'recovering' && connection.retryAt <= Date.now()) {
      await this.monitorConnection(connection); return;
    }
    if (connection.win.isDestroyed() || connection.status !== 'ready') return;
    let dirty = false;
    connection.busy = true; const generation = connection.generation;
    try {
        const scan = connection.channel === 'follow' ? await this.waitForFollowScan(connection, generation) : await this.stableScan(connection, generation); this.assertCurrent(connection, generation);
        if ((!scan?.ok || scan.ready === false || scan.invalidRows) && !this.idleXhsInbox(connection, scan)) throw this.scanError(scan, '消息结构变化，自动回复已停止');
        const identityWasBound = Boolean(this.control.bindings[connection.accountId]);
        this.pinIdentity(connection, scan.identity);
        if (!identityWasBound) dirty = true;
        if (connection.channel !== 'dm' && scan.threadId !== connection.threadId) throw new Error('所选页面已切换，请重新检查连接');
        connection.lastCheckedAt = new Date().toISOString(); connection.lastSuccessfulAt = connection.lastCheckedAt; connection.visitedThreads.add(scan.threadId);
        const firstFollow = connection.channel === 'follow' && !connection.initialized && scan.noFollowEvents !== true;
        if (firstFollow) {
          connection.startedAt = Date.now();
          this.interactions.baselineFollowers({ accountId: connection.accountId, followerIds: scan.followers, observedAt: new Date(connection.startedAt).toISOString() });
        }
        for (const message of scan.messages || []) {
          const saved = this.interactions.ingest({ ...message, accountId: connection.accountId, channel: connection.channel, historical: firstFollow || Date.parse(message.receivedAt) < connection.startedAt });
          if (!knownMessages.has(saved.id)) { knownMessages.add(saved.id); dirty = true; }
        }
        if (connection.channel === 'follow') {
          if (firstFollow) {
            connection.initialized = true;
            this.control.channels[connection.key] = { ...this.control.channels[connection.key], startedAt: connection.startedAt, lastSuccessfulAt: connection.lastCheckedAt }; this.saveControl();
          }
          const validated = scan.noFollowEvents !== true && scan.messages.length > 0, detail = this.followReadDetail(connection, scan);
          if (connection.eventValidated !== validated || connection.detail !== detail) dirty = true;
          connection.eventValidated = validated; connection.detail = detail;
        }
        const advancedXhsInbox = await this.advanceXhsInbox(connection, scan, generation); this.assertCurrent(connection, generation);
        if (!advancedXhsInbox && scan.canSwitch !== false && (scan.threads?.length > 1 || this.idleXhsInbox(connection, scan) && scan.threads?.length)) {
          const next = scan.threads[connection.cursor++ % scan.threads.length];
          if (next !== scan.threadId) {
            const idle = this.idleXhsInbox(connection, scan);
            const selected = await this.runPage(connection, idle ? 'activateFirst' : 'selectThread', idle ? {} : { threadId: next }); this.assertCurrent(connection, generation);
            if (idle && !selected?.ok) throw this.scanError(selected, '小红书新会话尚未就绪，未切换或发送');
          }
        }
        await this.refreshComments(connection, scan); this.assertCurrent(connection, generation);
    } catch (error) { if (this.isCurrent(connection, generation)) { this.failConnection(connection, error); dirty = true; } }
    finally { connection.busy = false; this.releaseAfterOperation(connection); }
    // Fresh check timestamps and scan cursors do not require repainting the
    // entire workspace. Snapshot/diagnostics still read their current values.
    if (dirty) this.changed();
  }
  queuedReplyCandidate(epoch) {
    return this.withReadSnapshot(() => {
      if (!this.schedulingAllowed(epoch) || this.backgroundSend || this.activeSends.size) return null;
      const now = Date.now(), groups = new Map();
      const replies = this.interactions.snapshot().replies
        .filter(item => item.status === 'queued' && Date.parse(item.dueAt) <= now)
        .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt) || Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
      for (const reply of replies) {
        if (groups.has(reply.accountId) || this.accountBlocked?.(reply.accountId) || this.replyBatchAccounts.has(reply.accountId)) continue;
        // Login repair retains pending drafts with the channel explicitly off.
        if (this.interactions.getMode(reply.accountId, reply.channel) === 'off' || (!reply.approvedAt && !this.monitoring(this.key(reply.accountId, reply.channel)))) continue;
        if (reply.preparationRetry?.attempts && Date.parse(reply.preparationRetry.nextAttemptAt) > now) continue;
        const source = this.connections.get(this.key(reply.accountId, reply.channel));
        const target = isRecipientPrivateReply(reply) ? this.connections.get(this.key(reply.accountId, 'dm')) : source;
        if (!source || !target || [source, target].some(connection => connection.status !== 'ready' || connection.win.isDestroyed() ||
            this.monitorOperations.has(connection.key))) continue;
        if (isRecipientPrivateReply(reply) && this.welcomePages.snapshot().some(page => page.accountId === reply.accountId && page.state === 'retained')) continue;
        groups.set(reply.accountId, { reply, busy: [source, target].some(connection => connection.busy || this.monitorJobs.has(connection.key)) });
      }
      if (!groups.size) return null;
      // Keep rotation anchored to the saved account order even when the previous
      // sender exhausted its queue. Sorting only the remaining replies would
      // repeatedly put an older large backlog ahead of a third account.
      const accounts = this.studio.snapshot().accounts.map(account => account.id);
      const next = (accounts.indexOf(this.lastSendAccount) + 1) % (accounts.length || 1);
      let candidate;
      for (let offset = 0; offset < accounts.length; offset++) {
        candidate = groups.get(accounts[(next + offset) % accounts.length]);
        if (candidate) break;
      }
      if (!candidate) return null;
      // Do not let the first fast scan repeatedly overtake the next account's
      // already-running bounded read. Its completion (or failure) releases turn.
      if (candidate.busy) return null;
      return candidate;
    });
  }
  scheduleQueuedReply(epoch, owner) {
    // Selection is one synchronous consistent read, not a separate full-file
    // read for every pending item. The scope ends before any promise starts;
    // sendReply still obtains fresh policy, mode, identity and commit evidence.
    const candidate = this.queuedReplyCandidate(epoch);
    if (!candidate) return null;
    const { reply } = candidate;
    const operation = { epoch, owner, accountId: reply.accountId, replyId: reply.id, promise: null };
    this.backgroundSend = operation; this.lastSendAccount = reply.accountId;
    operation.promise = Promise.resolve().then(() => {
      if (this.backgroundSend !== operation || !this.schedulingAllowed(epoch)) return;
      return this.sendReply(reply.id);
    }).catch(() => { /* Durable reply state explains failure; never resubmit an uncertain result. */ })
      .finally(() => { if (this.backgroundSend === operation) this.backgroundSend = null; });
    return operation.promise;
  }
  async tick() {
    const epoch = this.serviceGeneration;
    if (!this.schedulingAllowed(epoch)) return;
    const owner = {};
    const knownMessages = new Set(this.interactions.snapshot().messages.map(message => message.id));
    const connections = [...this.connections.values()], jobs = [];
    const cleanup = this.scheduleRetainedWelcomeCleanup(epoch, owner);
    if (cleanup) jobs.push(cleanup);
    const start = (connections.findIndex(connection => connection.key === this.lastMonitorKey) + 1) % (connections.length || 1);
    for (let offset = 0; offset < connections.length && this.monitorJobs.size + (this.retainedWelcomeCleanup ? 1 : 0) < 2; offset++) {
      const connection = connections[(start + offset) % connections.length];
      if (!this.schedulingAllowed(epoch)) break;
      if (connection.busy || this.monitorJobs.has(connection.key) || this.monitorOperations.has(connection.key) ||
          this.backgroundSend?.accountId === connection.accountId || this.replyBatchAccounts.has(connection.accountId) ||
          this.accountBlocked?.(connection.accountId) || !this.monitoring(connection.key) ||
          this.interactions.getMode(connection.accountId, connection.channel) === 'off') continue;
      const recovering = connection.status === 'recovering' && connection.retryAt <= Date.now();
      if (recovering && [...this.monitorJobs.values()].some(job => job.recovering)) continue;
      if (!recovering && (connection.status !== 'ready' || connection.win.isDestroyed())) continue;
      const operation = { epoch, connection, recovering, promise: null };
      this.monitorJobs.set(connection.key, operation); this.lastMonitorKey = connection.key;
      operation.promise = this.scanConnection(connection, epoch, knownMessages).catch(() => {})
        .finally(() => {
          if (this.monitorJobs.get(connection.key) === operation) this.monitorJobs.delete(connection.key);
          // A fast channel can deliver its ready reply while another channel is
          // still loading. No next task is automatically chained after a send.
          this.scheduleQueuedReply(epoch, owner);
        });
      jobs.push(operation.promise);
    }
    const immediateSend = this.scheduleQueuedReply(epoch, owner);
    if (immediateSend) jobs.push(immediateSend);
    await Promise.allSettled(jobs);
    // Await this pass's one already-started send for callers that explicitly
    // await tick; timer passes remain free to schedule unrelated monitor work.
    const sending = this.backgroundSend;
    if (sending?.epoch === epoch && sending.owner === owner) await sending.promise;
  }
  failConnection(connection, error, previousCount = connection.retryCount || 0) {
    // Only transport failures are recoverable. Identity, DOM and login failures
    // require the user to inspect the page; a new login is never silently rebound.
    const transient = ['PAGE_RENDER_TIMEOUT', 'PAGE_LOAD_TIMEOUT', 'PAGE_OPERATION_TIMEOUT', 'PAGE_NAVIGATED', 'WINDOW_DESTROYED', 'RENDER_PROCESS_GONE'].includes(error.code) || /ERR_(?:NETWORK|INTERNET_DISCONNECTED|CONNECTION_(?:RESET|CLOSED|REFUSED|TIMED_OUT)|NAME_NOT_RESOLVED|TIMED_OUT)|页面刷新超时/.test(error.message);
    const active = this.activeMonitoring(connection), off = this.interactions.getMode(connection.accountId, connection.channel) === 'off';
    connection.renderRetryReadOnly = error.code === 'PAGE_RENDER_TIMEOUT' && connection.channel === 'comment' &&
      this.studio.getAccount(connection.accountId).platform === 'douyin' && this.profile(connection.accountId, connection.channel)?.adapter === 'official-page-v1' &&
      !connection.win.isDestroyed() && !connection.win.webContents.isDestroyed?.() && !connection.needsRebuild &&
      !connection.initialLoading && connection.win.webContents.isLoadingMainFrame?.() !== true;
    connection.eventValidated = false;
    connection.retryCount = previousCount + 1;
    connection.status = transient && active ? 'recovering' : connection.win.isDestroyed() ? 'closed' : off ? 'unconfigured' : 'error';
    connection.retryAt = connection.status === 'recovering' ? Date.now() + Math.min(300000, 5000 * 2 ** Math.min(previousCount, 8)) : null;
    if (active && transient) { connection.needsReload = !connection.renderRetryReadOnly; this.start(); }
    connection.detail = `${error.message}${connection.retryAt ? '；稍后重新校验连接，保留消息基线' : off ? '；此渠道已暂停，恢复处理后需重新核对连接' : active ? '；监听已停止，请检查连接' : '；后台监控未启用，请打开页面并检查连接'}`;
  }
  start() {
    if (this.timer || this.stopped) return;
    this.timer = setInterval(async () => {
      const operation = { epoch: this.serviceGeneration }; this.ticking = operation;
      try { await this.tick(); } catch { /* No automatic resend. */ } finally { if (this.ticking === operation) this.ticking = null; }
    }, 4000); this.timer.unref?.();
  }
  closeAccount(accountId, { preservePending = false } = {}) {
    this.closeWelcomeProfile(accountId);
    const supported = Boolean(ENTRY_PAGES[this.studio.getAccount(accountId).platform]);
    if (supported) {
      if (preservePending) this.interactions.pauseAccountPreservingPending(accountId);
      else this.interactions.cancelAccountUnsent(accountId);
    }
    for (const channel of ['dm', 'comment', 'follow']) {
      const key = this.key(accountId, channel);
      if (this.control.channels[key]) this.control.channels[key].monitorEnabled = false;
      this.pendingMonitorActivations.delete(key);
      this.monitorVersions.set(key, (this.monitorVersions.get(key) || 0) + 1);
      if (supported && !preservePending) this.interactions.setMode({ accountId, channel, mode: 'off' });
      const connection = this.connections.get(key);
      if (connection) { this.destroyConnection(connection); connection.status = 'closed'; connection.detail = '账号会话已关闭'; connection.retryAt = null; }
    }
    this.saveControl(); this.changed();
    // Stopping an account is not permission to discard a draft or uncertain
    // send. Empty hidden retained pages can be released by a fresh safe read;
    // the others stay owned and reachable from their original reply record.
    void this.releaseRetainedWelcomePages({ accountId }).catch(() => {});
  }
  shutdown() { this.pendingMonitorActivations.clear(); this.cancelExternalBatchWaiters(); this.stopped = true; this.serviceGeneration++; for (const accountId of this.welcomeProfileWindows.keys()) this.closeWelcomeProfile(accountId); if (this.timer) clearInterval(this.timer); this.timer = null; for (const connection of this.connections.values()) { this.invalidate(connection); connection.intentionalClose = true; connection.status = 'closed'; } this.cancelExternalRestores(); void this.releaseRetainedWelcomePages().catch(() => {}); }
}
module.exports = { InteractionManager, ENTRY_PAGES };
