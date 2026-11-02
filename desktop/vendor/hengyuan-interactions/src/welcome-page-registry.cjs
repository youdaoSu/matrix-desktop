'use strict';

const { idlePageProbeScript } = require('./idle-page.cjs');

const RETENTION_REASONS = new Set(['draft', 'dialog', 'unverified', 'page-changed', 'unavailable', 'unknown', 'visible', 'loading']);

// Owns only the lifetime of temporary welcome pages. It never navigates,
// authenticates, selects a conversation, types, or retries a message.
class WelcomePageRegistry {
  constructor({ changed = () => {}, probeTimeoutMs = 1500 } = {}) {
    if (typeof changed !== 'function' || !Number.isFinite(probeTimeoutMs) || probeTimeoutMs <= 0) throw new Error('欢迎语页面管理设置无效');
    this.changed = changed;
    this.probeTimeoutMs = Math.min(1500, probeTimeoutMs);
    this.accounts = new Map();
    this.windows = new WeakMap();
  }

  notify() { try { this.changed(); } catch { /* Resource notifications cannot change page ownership. */ } }
  validateAccountId(accountId) {
    if (typeof accountId !== 'string' || !accountId.trim() || accountId.length > 256) throw new Error('欢迎语账号标识无效');
  }
  destroyed(record) {
    try { return Boolean(record.win?.isDestroyed()); } catch { return false; }
  }
  hidden(record) {
    try { return record.win?.isVisible() === false; } catch { return false; }
  }
  prune() {
    for (const record of [...this.accounts.values()]) if (record.win && this.destroyed(record)) this.forget(record);
  }
  forget(record) {
    if (this.accounts.get(record.accountId) !== record) return;
    this.accounts.delete(record.accountId);
    record.cancelProbe?.('unavailable');
    record.detach?.();
    if (record.win) this.windows.delete(record.win);
    this.notify();
  }

  create(account, factory) {
    this.validateAccountId(account?.id);
    if (!['douyin', 'xiaohongshu'].includes(account.platform) || typeof factory !== 'function') throw new Error('欢迎语页面创建设置无效');
    this.prune();
    const existing = this.accounts.get(account.id);
    if (existing) {
      const retained = existing.state === 'retained';
      throw Object.assign(new Error(retained
        ? '此账号仍有保留的欢迎语页面，请先检查草稿或发送结果，处理后再继续'
        : '此账号的欢迎语页面正在使用，请等待当前任务结束'), {
        code: retained ? 'WELCOME_PAGE_RETAINED' : 'WELCOME_PAGE_ACTIVE',
      });
    }
    // Reserve synchronously before calling the factory, including reentrant
    // calls. One retained page must never spawn an unbounded series of pages.
    const record = { accountId: account.id, platform: account.platform, state: 'active',
      win: null, reason: '', unknown: false, generation: 0, ready: null, inPage: null, probing: false };
    this.accounts.set(account.id, record);
    try {
      const win = factory();
      if (!win || typeof win.isDestroyed !== 'function' || typeof win.isVisible !== 'function' ||
          typeof win.destroy !== 'function' || typeof win.on !== 'function' || typeof win.removeListener !== 'function' ||
          !win.webContents || typeof win.webContents.on !== 'function' || typeof win.webContents.removeListener !== 'function' ||
          typeof win.webContents.getURL !== 'function' || win.isDestroyed()) throw new Error('欢迎语页面创建未返回有效窗口');
      record.win = win;
      this.windows.set(win, record);
      const wc = win.webContents;
      const invalidate = reason => {
        record.generation++; record.ready = null; record.inPage = null;
        record.cancelProbe?.(reason);
      };
      const navigating = (_event, url, inPlace, mainFrame) => {
        if (mainFrame === false) return;
        // The official homepage can replace its identical URL after hydration.
        // Preserve only the already captured same document, never a reload.
        if (mainFrame === true && inPlace === true && record.ready?.url === url &&
            this.currentDocument(record, record.ready)) return;
        const prior = record.ready;
        let sameDocument = false;
        try {
          const from = new URL(prior?.url), to = new URL(url);
          const origins = record.platform === 'douyin' ? ['https://www.douyin.com', 'https://creator.douyin.com']
            : ['https://www.xiaohongshu.com', 'https://creator.xiaohongshu.com'];
          sameDocument = mainFrame === true && inPlace === true && prior.generation === record.generation &&
            origins.includes(from.origin) && from.origin === to.origin && to.href === url &&
            !from.username && !from.password && !to.username && !to.password &&
            wc.mainFrame === prior.frame && typeof prior.frame.executeJavaScript === 'function' &&
            [prior.url, url].includes(wc.getURL()) && prior.frame.url === wc.getURL();
        } catch { /* An unobserved document or unknown origin remains unready. */ }
        invalidate('page-changed');
        if (sameDocument) record.inPage = { frame: prior.frame, url, generation: record.generation };
      };
      const navigatedInPage = (_event, url, mainFrame) => {
        if (mainFrame === false) return;
        const pending = record.inPage;
        record.inPage = null;
        if (!pending || mainFrame !== true || pending.url !== url || pending.generation !== record.generation) return;
        try {
          if (this.accounts.get(record.accountId) !== record || this.destroyed(record) ||
              wc.getURL() !== url || wc.mainFrame !== pending.frame || pending.frame.url !== url ||
              typeof pending.frame.executeJavaScript !== 'function') return;
          // A finished SPA route change does not emit another DOM-ready. Keep
          // only the already observed main document and freeze its new URL for
          // a fresh read-only idle probe. Old probe results were cancelled;
          // this does not restore recipient evidence or authorize any send.
          record.ready = pending;
        } catch { /* Replacement or unavailable frames remain unready. */ }
      };
      const ready = () => {
        record.inPage = null;
        try {
          const frame = wc.mainFrame, url = wc.getURL();
          record.ready = frame && frame.url === url && typeof frame.executeJavaScript === 'function'
            ? { frame, url, generation: record.generation } : null;
        } catch { record.ready = null; }
      };
      const gone = () => invalidate('unavailable');
      const show = () => { record.cancelProbe?.('visible'); this.notify(); };
      const hide = () => this.notify();
      const closed = () => this.forget(record);
      wc.on('did-start-navigation', navigating);
      wc.on('did-navigate-in-page', navigatedInPage);
      wc.on('dom-ready', ready);
      wc.on('render-process-gone', gone);
      win.on('show', show); win.on('hide', hide); win.on('closed', closed);
      record.detach = () => {
        wc.removeListener('did-start-navigation', navigating);
        wc.removeListener('did-navigate-in-page', navigatedInPage);
        wc.removeListener('dom-ready', ready);
        wc.removeListener('render-process-gone', gone);
        win.removeListener('show', show); win.removeListener('hide', hide); win.removeListener('closed', closed);
      };
      this.notify();
      return win;
    } catch (error) {
      this.forget(record);
      throw error;
    }
  }

  retain(win, { reason = 'unverified', unknown = false } = {}) {
    const record = this.windows.get(win);
    if (!record || this.accounts.get(record.accountId) !== record) return false;
    if (this.destroyed(record)) { this.forget(record); return false; }
    record.state = 'retained';
    // Result uncertainty is sticky. A later generic cleanup result cannot
    // accidentally turn an unconfirmed send into an idle page.
    record.unknown ||= unknown === true || reason === 'unknown';
    record.reason = record.unknown ? 'unknown' : RETENTION_REASONS.has(reason) ? reason : 'unverified';
    record.cancelProbe?.(record.reason);
    this.notify();
    return true;
  }

  forAccount(accountId) {
    this.validateAccountId(accountId); this.prune();
    const record = this.accounts.get(accountId);
    return record?.win ? [record.win] : [];
  }
  snapshot() {
    this.prune();
    return [...this.accounts.values()].filter(record => record.win).map(record => ({
      accountId: record.accountId, platform: record.platform, state: record.state,
      hidden: this.hidden(record), unknown: record.unknown, reason: record.reason,
      probing: record.probing,
    }));
  }
  resourceSummary() {
    const records = this.snapshot();
    return {
      residentCount: records.length,
      visibleCount: records.filter(record => !record.hidden).length,
      hiddenCount: records.filter(record => record.hidden).length,
      busyCount: records.filter(record => record.state === 'active' || record.probing).length,
      retainedCount: records.filter(record => record.state === 'retained').length,
      unknownCount: records.filter(record => record.unknown).length,
      idleHiddenCount: records.filter(record => record.state === 'retained' && record.hidden && !record.unknown && !record.probing).length,
    };
  }

  denial(record, { probing = false } = {}) {
    if (this.accounts.get(record.accountId) !== record || !record.win || this.destroyed(record)) return 'unavailable';
    if (record.state !== 'retained' || (record.probing && !probing)) return 'busy';
    if (record.unknown) return 'unknown';
    if (!this.hidden(record)) return 'visible';
    return null;
  }
  currentDocument(record, document) {
    try {
      const wc = record.win.webContents;
      return this.accounts.get(record.accountId) === record && !this.destroyed(record) &&
        record.generation === document.generation && record.ready === document &&
        wc.getURL() === document.url && wc.mainFrame === document.frame && document.frame.url === document.url;
    } catch { return false; }
  }
  probe(record, document, canRelease) {
    return new Promise(resolve => {
      let settled = false;
      const finish = (reason, result) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (record.cancelProbe === cancel) record.cancelProbe = null;
        resolve(reason ? { ok: false, safeToClose: false, reason } : result);
      };
      const cancel = reason => finish(reason);
      const timer = setTimeout(() => finish('unverified'), this.probeTimeoutMs);
      record.cancelProbe = cancel;
      Promise.resolve().then(() => {
        if (settled) return;
        if (!canRelease()) { finish('cancelled'); return; }
        const reason = this.denial(record, { probing: true });
        if (reason || !this.currentDocument(record, document)) { finish(reason || 'page-changed'); return; }
        // Never queue behind page loading through webContents. The exact
        // observed DOM-ready mainFrame supports a read despite slow assets.
        return document.frame.executeJavaScript(idlePageProbeScript({ platform: record.platform, url: document.url }), false);
      }).then(result => finish(null, result), () => finish('unverified'));
    });
  }
  async releaseIdle({ accountId, canRelease = () => true } = {}) {
    if (accountId !== undefined) this.validateAccountId(accountId);
    if (typeof canRelease !== 'function') throw new Error('欢迎语页面回收检查无效');
    const allowed = () => { try { return canRelease() === true; } catch { return false; } };
    this.prune();
    const results = [];
    for (const record of [...this.accounts.values()]) {
      if (accountId !== undefined && accountId !== record.accountId) continue;
      const base = { accountId: record.accountId, channel: 'welcome' };
      if (!allowed()) { results.push({ ...base, released: false, reason: 'cancelled' }); continue; }
      let reason = this.denial(record);
      if (reason) { results.push({ ...base, released: false, reason }); continue; }
      const document = record.ready;
      if (!document || !this.currentDocument(record, document)) {
        results.push({ ...base, released: false, reason: 'loading' }); continue;
      }
      record.probing = true;
      try {
        const result = await this.probe(record, document, allowed);
        // The optional host guard is rechecked after every asynchronous read.
        // A pause, account reservation or revoked cleanup must retain the page.
        if (!allowed()) { results.push({ ...base, released: false, reason: 'cancelled' }); continue; }
        reason = this.denial(record, { probing: true });
        if (reason || !this.currentDocument(record, document)) {
          results.push({ ...base, released: false, reason: reason || 'page-changed' }); continue;
        }
        if (result?.ok !== true || result.safeToClose !== true) {
          record.reason = RETENTION_REASONS.has(result?.reason) ? result.reason : 'unverified';
          results.push({ ...base, released: false, reason: record.reason }); continue;
        }
        record.win.destroy();
        if (this.destroyed(record)) {
          this.forget(record);
          results.push({ ...base, released: true });
        } else results.push({ ...base, released: false, reason: 'unavailable' });
      } catch {
        results.push({ ...base, released: false, reason: 'unavailable' });
      } finally { record.probing = false; }
    }
    const releasedCount = results.filter(result => result.released).length;
    return { releasedCount, retainedCount: results.length - releasedCount, results, resources: this.resourceSummary() };
  }
}

module.exports = { WelcomePageRegistry };
