'use strict';

const { builtinProfile, builtinScript } = require('./builtin-adapter.cjs');
const { idlePageProbeScript } = require('./idle-page.cjs');
const { markReleasedPreparation } = require('./welcome-preparation-retry.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function xhsChatUrl(recipientId) {
  if (typeof recipientId !== 'string' || !/^[a-f\d]{24}$/i.test(recipientId)) throw new Error('小红书接收人编号无效');
  return `https://www.xiaohongshu.com/chat?openUid=${encodeURIComponent(recipientId)}`;
}

// Use the public web entry, in the sending account's own isolated session.
// The URL alone never proves identity: the loaded conversation must agree.
async function prepareXhsRecipient({ account, identity, recipientId, createWindow, check, wait = sleep, operationTimeoutMs = 10000, now = Date.now }) {
  const entryUrl = xhsChatUrl(recipientId);
  if (account?.platform !== 'xiaohongshu' || typeof account.id !== 'string' || !account.id ||
      !/^[a-f\d]{24}$/i.test(identity || '') || identity === recipientId || typeof createWindow !== 'function' ||
      typeof check !== 'function' || typeof wait !== 'function' || typeof now !== 'function' ||
      !Number.isFinite(operationTimeoutMs) || operationTimeoutMs <= 0) throw new Error('小红书单聊的固定账号或准备设置不正确');
  const started = now();
  if (!Number.isFinite(started)) throw new Error('小红书单聊准备时钟无效');
  check();
  const win = createWindow(account, 'dm', entryUrl, { background: true }), wc = win.webContents;
  const profile = builtinProfile('xiaohongshu', 'dm'), deadline = started + 30000;
  let generation = 0, readyDocument = null, preparing = true, closed = false, fatal = null, pinned = null;
  let threadId = '', selectedThreadId = '', lastNow = started, submitted = false, closing = false, operationActive = false;
  let lastTargetState = '';
  const pending = new Set(), ownErrors = new WeakSet();
  const error = (message, code = 'WELCOME_RECIPIENT_UNAVAILABLE') => {
    const value = Object.assign(new Error(message), { code }); ownErrors.add(value); return value;
  };
  const permittedUrl = value => {
    try {
      const url = new URL(value);
      return url.origin === 'https://www.xiaohongshu.com' && !url.username && !url.password && !url.hash &&
        /^\/chat(?:\/[^/]+)?\/?$/.test(url.pathname) && url.searchParams.getAll('openUid').length <= 1 &&
        (!url.searchParams.has('openUid') || url.searchParams.get('openUid') === recipientId);
    } catch { return false; }
  };
  const cancel = value => { for (const finish of [...pending]) finish(value); };
  const navigation = (_event, url, inPlace, mainFrame) => {
    if (mainFrame === false) return;
    if (!permittedUrl(url) || !preparing && (!inPlace || url !== pinned?.url)) {
      fatal ||= error('小红书单聊页面已切换，已停止当前操作', 'WELCOME_PAGE_CHANGED'); cancel(fatal); return;
    }
    // Initial official SPA routing may change /chat to /chat/<conversation>.
    // No write operations are exposed until that document and peer are pinned.
    if (!inPlace) { generation++; readyDocument = null; cancel(error('小红书单聊正在加载', 'WELCOME_PAGE_NAVIGATED')); }
  };
  const gone = () => { fatal ||= error('小红书单聊页面已关闭或失去响应', 'WELCOME_WINDOW_CLOSED'); cancel(fatal); };
  const capture = () => {
    try {
      const frame = wc.mainFrame, url = wc.getURL();
      if (frame?.url === url && typeof frame.executeJavaScript === 'function' && permittedUrl(url)) readyDocument = { frame, url, generation };
    } catch { /* The next guarded read will wait or fail. */ }
  };
  wc.on('did-start-navigation', navigation); wc.on('dom-ready', capture); wc.on('render-process-gone', gone); win.on('closed', gone);
  const current = () => {
    check();
    if (fatal) throw fatal;
    if (closed || closing || win.isDestroyed()) throw error('小红书单聊准备已结束', 'WELCOME_WINDOW_CLOSED');
    const stamp = now();
    if (!Number.isFinite(stamp) || stamp < lastNow) throw error('小红书单聊准备时钟已变化');
    lastNow = stamp;
    if (preparing && stamp >= deadline) throw error(`小红书单聊加载超过 30 秒，尚未填写或发送${lastTargetState ? `（${lastTargetState}）` : ''}`, 'WELCOME_PREPARE_TIMEOUT');
  };
  const documentNow = () => {
    const url = wc.getURL();
    if (!permittedUrl(url)) return null;
    if (!readyDocument && wc.isLoadingMainFrame?.() === false) capture();
    const frame = wc.mainFrame;
    if (!frame || frame.url !== url || typeof frame.executeJavaScript !== 'function') return null;
    // pushState does not replace the captured, already DOM-ready document.
    if (readyDocument?.frame !== frame || readyDocument.generation !== generation) return null;
    return { frame, url, generation };
  };
  const same = doc => !closed && !win.isDestroyed() && generation === doc.generation && wc.getURL() === doc.url &&
    wc.mainFrame === doc.frame && doc.frame.url === doc.url;
  const documentChanged = () => error('小红书单聊文档已变化', preparing && !pinned && !fatal ? 'WELCOME_PAGE_NAVIGATED' : 'WELCOME_PAGE_CHANGED');
  const execute = async (script, { cleanup = false, beforeDispatch } = {}) => {
    if (!cleanup) current();
    const doc = documentNow();
    if (!doc || pinned && (doc.frame !== pinned.frame || doc.url !== pinned.url || doc.generation !== pinned.generation)) throw error('小红书单聊文档尚未就绪或已变化', 'WELCOME_PAGE_NAVIGATED');
    const duration = cleanup ? Math.min(operationTimeoutMs, 1500) : preparing ? Math.min(operationTimeoutMs, deadline - lastNow) : operationTimeoutMs;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (failure, value) => {
        if (settled) return; settled = true; clearTimeout(timer); pending.delete(finish);
        failure ? reject(failure) : resolve(value);
      };
      const timer = setTimeout(() => {
        const timedOut = error('小红书单聊页面操作超时', 'PAGE_OPERATION_TIMEOUT');
        // A timed-out operation may still be executing in the renderer. Once
        // preparation has returned, this handle can never authorize another
        // write. The owner will retain uncertain sends for reconciliation.
        if (!preparing && !cleanup) fatal ||= timedOut;
        finish(timedOut);
      }, Math.max(1, duration));
      pending.add(finish);
      Promise.resolve().then(() => {
        if (settled) return;
        if (!cleanup) current();
        if (!same(doc)) throw documentChanged();
        beforeDispatch?.();
        // Main-frame execution avoids Chromium queuing behind slow subresources.
        // The page deadline also prevents a delayed script from writing later.
        return doc.frame.executeJavaScript(`(()=>{if(Date.now()>${Date.now() + duration}||location.href!==${JSON.stringify(doc.url)})return {ok:false,submitted:false,detail:'单聊操作已过期或页面变化'};return ${script};})()`, false);
      }).then(value => {
        if (settled) return;
        if (!cleanup) current();
        if (!same(doc)) throw documentChanged();
        finish(null, value);
      }).catch(finish);
    });
  };
  const raw = (operation, payload = {}, options) => execute(builtinScript(profile, operation, { ...payload, identity }), options);
  const targetState = scan => {
    const targets = (Array.isArray(scan?.threadDetails) ? scan.threadDetails : []).filter(item => !item.isGroup && item.peerId === recipientId);
    const currentTarget = scan?.peerId === recipientId;
    // This diagnostic deliberately contains no recipient IDs, names or text.
    lastTargetState = `当前单聊${currentTarget ? '是' : '不是'}目标；目标行 ${targets.length} 条；目标${targets.length ? '已在' : '未在'}列表；${selectedThreadId ? '已选择目标' : '等待目标'}`;
    return targets;
  };
  const verify = (scan, { empty = false } = {}) => {
    if (scan?.identity && scan.identity !== identity) throw error('小红书登录账号与原账号绑定不一致', 'WELCOME_IDENTITY_CHANGED');
    if (!scan?.ok || scan.ready !== true || scan.invalidRows || scan.identity !== identity) throw error(scan?.detail || '小红书私信尚未通过核验');
    const targets = targetState(scan);
    if (scan.isGroup || scan.peerId !== recipientId || scan.peerVerified !== true || targets.length !== 1 ||
        targets[0].peerVerified !== true || targets[0].id !== scan.threadId || threadId && threadId !== scan.threadId ||
        selectedThreadId && selectedThreadId !== scan.threadId) throw error(`小红书当前单聊未能与新粉丝唯一对应，尚未发送（${lastTargetState}）`);
    if (empty && scan.canSwitch !== true) throw error('小红书单聊有未发送草稿或附件，已保留');
    return scan.threadId;
  };
  const detach = () => { wc.removeListener('did-start-navigation', navigation); wc.removeListener('dom-ready', capture); wc.removeListener('render-process-gone', gone); win.removeListener('closed', gone); };
  const close = async ({ preserve = false } = {}) => {
    if (closed || win.isDestroyed()) { closed = true; detach(); return { closed: win.isDestroyed() }; }
    if (closing) return { closed: false, retained: true, detail: '小红书单聊正在结束当前操作' };
    // Never let an idle probe race a caller's already dispatched page action.
    preserve ||= operationActive;
    closing = true;
    cancel(error('小红书单聊准备已结束', 'WELCOME_WINDOW_CLOSED'));
    let empty = false;
    if (!preserve && win.isVisible?.() === false) {
      try { const result = await execute(idlePageProbeScript({ platform: 'xiaohongshu', url: wc.getURL() }), { cleanup: true }); empty = result?.ok === true && result.safeToClose === true; } catch { /* Preserve unverified content. */ }
    }
    closed = true; detach(); cancel(error('小红书单聊准备已结束', 'WELCOME_WINDOW_CLOSED'));
    if (empty && win.isVisible?.() === false) { win.destroy(); return { closed: true }; }
    return { closed: false, retained: true, detail: preserve ? '结果待核对，已保留原单聊，不会重发' : '草稿、验证或页面状态需处理，已保留原单聊' };
  };
  try {
    for (let attempt = 0; attempt < 80; attempt++) {
      current();
      const url = wc.getURL();
      if (url && url !== 'about:blank' && !permittedUrl(url)) throw error('请在原小红书账号完成登录或验证后检查连接');
      if (!documentNow()) { await wait(400); continue; }
      let candidateThread, candidateDocument;
      try {
        const scan = await raw('scan');
        if (scan?.identity && scan.identity !== identity) throw error('小红书登录账号与原账号绑定不一致', 'WELCOME_IDENTITY_CHANGED');
        if (scan?.invalidRows) throw error(scan.detail || '小红书消息结构未通过核验');
        const targets = targetState(scan);
        if (scan?.canSwitch === false) throw error('小红书单聊有未发送草稿或附件，已保留');
        if (targets.length > 1) throw error(`小红书新粉丝对应多个单聊，尚未发送（${lastTargetState}）`);
        if (!scan?.ok || scan.ready !== true || scan.peerVerified !== true) {
          if (scan?.renderPending !== true && scan?.ok !== true) throw error(scan?.detail || '小红书目标单聊不可用');
          await wait(400); continue;
        }
        if (scan.identity !== identity) throw error('小红书私信尚未通过账号核验');
        const listedCurrent = (scan.threadDetails || []).filter(item => item.id === scan.threadId);
        if (listedCurrent.length !== 1 || listedCurrent[0].peerId !== scan.peerId || listedCurrent[0].isGroup !== scan.isGroup) {
          throw error(`小红书当前单聊与列表身份不一致，尚未发送（${lastTargetState}）`);
        }
        // The official openUid route first hydrates its inbox, which may
        // briefly select an existing chat before the requested fan is loaded.
        // That other chat is only a navigation state, never send authority.
        // Wait within the original deadline, or select one fully verified
        // target row once; then require the exact target pane on every read.
        if (scan.peerId !== recipientId) {
          const target = targets[0];
          if (target && selectedThreadId && target.id !== selectedThreadId) throw error(`小红书准备期间目标单聊编号发生变化，尚未发送（${lastTargetState}）`);
          if (target?.peerVerified === true && !selectedThreadId) {
            const guard = await execute(idlePageProbeScript({ platform: 'xiaohongshu', url: wc.getURL() }));
            if (guard?.ok !== true || guard.safeToClose !== true) throw error('小红书单聊存在草稿、验证或附件，已保留');
            const selection = await raw('selectThread', { threadId: target.id }, { beforeDispatch: () => { selectedThreadId = target.id; } });
            if (selection?.ok !== true) throw error(selection?.detail || '小红书新粉丝单聊尚未能打开，未发送');
          }
          await wait(400); continue;
        }
        candidateThread = verify(scan, { empty: true }); candidateDocument = documentNow();
        if (!candidateDocument) throw documentChanged();
        const guard = await execute(idlePageProbeScript({ platform: 'xiaohongshu', url: candidateDocument.url }));
        if (guard?.ok !== true || guard.safeToClose !== true) throw error('小红书单聊存在草稿、验证或附件，已保留');
        if (verify(await raw('scan'), { empty: true }) !== candidateThread) throw error('小红书准备期间目标单聊发生变化，尚未发送');
        const composer = await raw('probeComposer', { welcome: true, recipientId, threadId: candidateThread,
          message: { senderId: recipientId, threadId: `follower:${recipientId}`, externalId: `follower:${recipientId}` } });
        if (composer?.ok !== true || composer.ready !== true) {
          if (composer?.renderPending === true) { await wait(400); continue; }
          throw error(composer?.detail || '小红书私信输入框尚未通过核验');
        }
        if (!same(candidateDocument)) throw documentChanged();
      } catch (value) {
        if (value.code !== 'WELCOME_PAGE_NAVIGATED') throw value;
        await wait(400); continue;
      }
      threadId = candidateThread; pinned = candidateDocument;
      current(); preparing = false;
      return { threadId, close, run: async (operation, payload = {}) => {
        current();
        if (!['scan', 'selectThread', 'prepare', 'send', 'commit', 'receipt'].includes(operation)) throw error('小红书单聊不支持此操作');
        if (operationActive) throw error('小红书单聊正在执行另一项操作');
        if (submitted && !['scan', 'receipt'].includes(operation)) throw error('小红书消息已经提交或结果待核对，不会再次填写或发送');
        if (payload.threadId && payload.threadId !== threadId) throw error('小红书目标会话已变化');
        operationActive = true;
        try {
          const scan = await raw('scan'); verify(scan, { empty: operation === 'prepare' });
          if (operation === 'scan') return scan;
          if (operation === 'selectThread') return { ok: true };
          return await raw(operation, { ...payload, welcome: true, recipientId, threadId },
            operation === 'commit' ? { beforeDispatch: () => { submitted = true; } } : undefined);
        } finally { operationActive = false; }
      } };
    }
    throw error('小红书单聊加载超过检查次数，尚未填写或发送', 'WELCOME_PREPARE_TIMEOUT');
  } catch (value) {
    const result = await close();
    if (result.retained) { value.message += `；${result.detail}`; value.retainedWindow = true; }
    if (preparing && !submitted && !fatal && ownErrors.has(value) && result.closed && win.isDestroyed() && ['WELCOME_PREPARE_TIMEOUT', 'PAGE_OPERATION_TIMEOUT'].includes(value.code)) {
      markReleasedPreparation(value, { code: value.code, stage: 'chat-verify', pageReleased: true });
    }
    throw value;
  }
}

module.exports = { xhsChatUrl, prepareXhsRecipient };
