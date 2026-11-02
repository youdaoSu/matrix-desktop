'use strict';

const { builtinProfile, builtinScript } = require('./builtin-adapter.cjs');
const { validateProfileUrl } = require('./outreach.cjs');
const { recipientHomeEntryProbeScript } = require('./recipient-entry.cjs');
const { idlePageProbeScript } = require('./idle-page.cjs');
const { networkCode, markReleasedPreparation } = require('./welcome-preparation-retry.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// A separate same-account page for a verified incoming follow. Preparation only
// enters the official chat; the caller still owns approval and durable claims.
async function prepareWelcomeRecipient({ account, identity, recipientId, profileUrl, createWindow, check, wait = sleep, operationTimeoutMs = 10000, now = Date.now }) {
  if (account?.platform !== 'douyin' || typeof account.id !== 'string' || !account.id ||
      !/^[1-9]\d{0,63}$/.test(identity || '') || !/^[1-9]\d{0,63}$/.test(recipientId || '') || identity === recipientId ||
      typeof createWindow !== 'function' || typeof check !== 'function' || typeof wait !== 'function' || typeof now !== 'function' ||
      !Number.isFinite(operationTimeoutMs) || operationTimeoutMs <= 0) throw new Error('新关注私信的固定账号、接收人或准备设置不正确');
  const frozenProfile = validateProfileUrl('douyin', profileUrl);
  const frozenHomeEntry = `https://www.douyin.com/jingxuan?imToSecUid=${new URL(frozenProfile).pathname.slice('/user/'.length)}`;
  const profile = builtinProfile('douyin', 'dm');
  const started = now(), profileDeadline = started + 30000, hardDeadline = started + 60000;
  if (!Number.isFinite(started)) throw new Error('欢迎语准备时钟无效');
  await check();
  const win = createWindow(account, 'dm', frozenProfile, { background: true });
  const wc = win.webContents;
  let closed = false, phase = 'entry', generation = 0, fatal = null, submitted = false, threadId = null;
  let homeEntry = false, homeNavigationSeen = false, homeNavigationGeneration = null;
  let preparing = true, preparationStage = 'profile-load', entryAttempted = false, lastNow = started;
  let domReadyGeneration = null, domReadyUrl = null, domReadyFrame = null;
  let lastRenderStage = '', lastSurfaceDetail = '';
  let profileReadyMs = -1, entryStartedMs = -1, entryCompletedMs = -1, chatVerifyStartedMs = -1;
  let chatDeadline = null;
  const pending = new Set();
  const issuedFailures = new WeakSet();
  const failure = (message, code = 'WELCOME_RECIPIENT_UNAVAILABLE') => {
    const error = Object.assign(new Error(message), { code });
    issuedFailures.add(error); return error;
  };
  const loadFailure = error => {
    const code = networkCode(error);
    return Object.assign(failure(`官方首页私信入口加载失败，当前未发送（${code || '未分类加载错误'}）`, 'WELCOME_LOAD_FAILED'), {
      ...(code ? { networkCode: code } : {}),
    });
  };
  const remaining = () => {
    const value = now();
    if (!Number.isFinite(value) || value < lastNow) throw failure('欢迎语准备时钟已变化，请重新核对');
    lastNow = value;
    return Math.max(0, Math.min(hardDeadline, chatDeadline ?? profileDeadline) - value);
  };
  const beginChatBudget = () => {
    // One handoff after the sole entry attempt. Reads, scrolling, retries and
    // later navigation can never reset either phase or the whole-process cap.
    if (chatDeadline === null) chatDeadline = Math.min(hardDeadline, lastNow + 30000);
  };
  const elapsedMs = () => Math.max(0, Math.floor(lastNow - started));
  const preparationTiming = () => {
    // Durations only. Never persist clock timestamps, account IDs or page data.
    let observed = lastNow;
    try { const value = now(); if (Number.isFinite(value) && value >= lastNow) observed = value; } catch { /* Keep the last checked monotonic time. */ }
    const totalMs = Math.max(0, Math.floor(observed - started));
    return { profileReadyMs, entryStartedMs, entryCompletedMs, chatVerifyStartedMs,
      afterEntryMs: entryCompletedMs < 0 ? -1 : Math.max(0, totalMs - entryCompletedMs), totalMs };
  };
  const deadlineFailure = () => {
    const timing = preparationTiming();
    const detail = `；阶段耗时毫秒:主页就绪=${timing.profileReadyMs},入口开始=${timing.entryStartedMs},入口完成=${timing.entryCompletedMs},单聊核对开始=${timing.chatVerifyStartedMs},入口后等待=${timing.afterEntryMs},总计=${timing.totalMs}`;
    const limit = timing.totalMs >= 60000 ? '整个准备流程已超过 60 秒' : chatDeadline === null ? '主页与入口准备已超过 30 秒' : '聊天准备已超过 30 秒';
    return Object.assign(failure(`欢迎语${limit}（${preparationStage}），请检查平台页面；当前未发送${preparationStage === 'chat-verify' ? `；最近阶段:${lastRenderStage || 'conversation'}${lastSurfaceDetail}` : ''}${detail}`, 'WELCOME_PREPARE_TIMEOUT'), { preparationTiming: timing });
  };
  const rejectPending = error => { for (const reject of [...pending]) reject(error); };
  const unexpectedHomeNavigation = (url, inPlace, mainFrame) => {
    // Fixed categories and booleans only: never attach the URL, secUID, page
    // content, event object or credentials to errors persisted by the caller.
    let currentUrl = '';
    try { currentUrl = wc.getURL(); } catch { /* Unknown is a fixed category. */ }
    const category = value => value === frozenHomeEntry ? 'target' : value === frozenProfile ? 'profile' : 'other';
    const diagnostic = {
      stage: ['profile-load', 'entry', 'chat-verify'].includes(preparationStage) ? preparationStage : 'other',
      phase: phase === 'entry' ? 'entry' : 'chat',
      sameDocument: inPlace === true, mainFrame: mainFrame === true,
      destination: category(url), current: category(currentUrl),
      navigationSeen: homeNavigationSeen === true,
      generationMatches: generation === homeNavigationGeneration,
      domReadyMatches: domReadyGeneration === generation && domReadyUrl === frozenHomeEntry,
    };
    const suffix = Object.entries(diagnostic).map(([key, value]) => `${key}=${value}`).join(',');
    return Object.assign(failure(`欢迎语首页私信入口发生非预期导航，已停止（${suffix}）`, 'WELCOME_PAGE_CHANGED'), { navigationDiagnostic: diagnostic });
  };
  const navigation = (_event, url, inPlace, mainFrame) => {
    if (mainFrame === false) return;
    if (!inPlace) { generation++; domReadyGeneration = null; domReadyUrl = null; domReadyFrame = null; }
    if (homeEntry) {
      // An already DOM-ready exact document can replace/push its own identical
      // URL during initialization. This does not authorize a new document or
      // target: neither readiness, generation nor any budget is reset, and
      // every subsequent read/write still rechecks the full frozen scope.
      let unchangedDocument = false;
      try {
        unchangedDocument = !fatal && homeNavigationSeen && inPlace === true && mainFrame === true &&
          url === frozenHomeEntry && wc.getURL() === frozenHomeEntry &&
          generation === homeNavigationGeneration && domReadyGeneration === generation &&
          domReadyUrl === frozenHomeEntry && domReadyFrame && wc.mainFrame === domReadyFrame &&
          domReadyFrame.url === frozenHomeEntry && typeof domReadyFrame.executeJavaScript === 'function';
      } catch { /* Unknown frame or document remains a navigation failure. */ }
      if (unchangedDocument) return;
      // Only one cold official query entry is allowed. Redirects, query cleanup,
      // reloads and return-to-target events never provide recipient evidence.
      if (phase === 'entry' && !homeNavigationSeen && !inPlace && url === frozenHomeEntry) {
        homeNavigationSeen = true; homeNavigationGeneration = generation;
        rejectPending(failure('官方首页私信入口正在切换页面', 'WELCOME_PAGE_NAVIGATED'));
        return;
      }
      fatal ||= unexpectedHomeNavigation(url, inPlace, mainFrame); rejectPending(fatal); return;
    }
    if (phase !== 'entry' || entryAttempted || url !== frozenProfile) {
      fatal = failure('欢迎语准备页面发生非预期导航，已停止', 'WELCOME_PAGE_CHANGED'); rejectPending(fatal); return;
    }
    if (!inPlace) {
      rejectPending(failure('官方私信入口正在切换页面', 'WELCOME_PAGE_NAVIGATED'));
    }
  };
  const gone = () => { fatal = failure('欢迎语准备页面已关闭或崩溃', 'WELCOME_WINDOW_CLOSED'); rejectPending(fatal); };
  const ready = () => {
    if (closed || fatal || win.isDestroyed()) return;
    domReadyGeneration = generation; domReadyUrl = wc.getURL(); domReadyFrame = wc.mainFrame;
  };
  wc.on('did-start-navigation', navigation);
  wc.on('render-process-gone', gone);
  wc.on('dom-ready', ready);
  win.on('closed', gone);
  const current = async () => {
    await check();
    if (fatal) throw fatal;
    if (closed || win.isDestroyed()) throw failure('欢迎语准备页面已关闭', 'WELCOME_WINDOW_CLOSED');
    if (preparing && remaining() <= 0) throw deadlineFailure();
  };
  const timed = (operation, { cleanup = false } = {}) => new Promise((resolve, reject) => {
    const duration = preparing && !cleanup ? Math.min(operationTimeoutMs, remaining()) : operationTimeoutMs;
    if (duration <= 0) { reject(deadlineFailure()); return; }
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); pending.delete(cancel);
      if (error) reject(error); else resolve(value);
    };
    const cancel = error => finish(error);
    const timer = setTimeout(() => finish(preparing && !cleanup && duration < operationTimeoutMs ? deadlineFailure() : failure('欢迎语准备页面操作超时，当前结果需检查', 'PAGE_OPERATION_TIMEOUT')), duration);
    pending.add(cancel);
    Promise.resolve().then(() => { if (!settled) return operation(); }).then(value => finish(null, value), error => finish(error));
  });
  const captureReadyFrame = (expectedGeneration, url) => {
    if (domReadyGeneration !== expectedGeneration || domReadyUrl !== url) return null;
    const frame = wc.mainFrame;
    if (wc.getURL() !== url || !frame || frame !== domReadyFrame || frame.url !== url || typeof frame.executeJavaScript !== 'function') throw failure('欢迎语当前文档已经变化，请重新核对', 'WELCOME_PAGE_CHANGED');
    return frame;
  };
  const execute = async (script, pinnedGeneration, { requestedOp = 'prepare-recipient', actualOp = 'other' } = {}) => {
    // Local timing only. Fixed operation names distinguish the caller's action
    // from its guard read; no script, payload, URL or successful timing is saved.
    const operationStarted = now();
    const requestLabel = ['prepare-recipient', 'selectThread', 'prepare', 'scan', 'send', 'commit', 'receipt'].includes(requestedOp) ? requestedOp : 'other';
    const actualLabel = ['profile-probe', 'profile-idle', 'home-idle', 'scan', 'probe', 'prepare', 'send', 'commit', 'receipt'].includes(actualOp) ? actualOp : 'other';
    await current(); const expectedGeneration = pinnedGeneration ?? generation, url = wc.getURL();
    let frame = null;
    const assertDocument = () => {
      if (fatal) throw fatal;
      if (closed || win.isDestroyed()) throw failure('欢迎语准备页面已关闭', 'WELCOME_WINDOW_CLOSED');
      if (generation !== expectedGeneration || wc.getURL() !== url) throw failure('欢迎语准备页面已经切换', 'WELCOME_PAGE_NAVIGATED');
      if (frame && captureReadyFrame(expectedGeneration, url) !== frame) throw failure('欢迎语当前文档已经变化，请重新核对', 'WELCOME_PAGE_CHANGED');
    };
    assertDocument();
    return new Promise((resolve, reject) => {
      const duration = preparing ? Math.min(operationTimeoutMs, remaining()) : operationTimeoutMs;
      if (duration <= 0) { reject(deadlineFailure()); return; }
      let settled = false, dispatched = false, checking = false;
      const annotateTimeout = error => {
        if (!['PAGE_OPERATION_TIMEOUT', 'WELCOME_PREPARE_TIMEOUT'].includes(error?.code) || error.operationDiagnostic) return error;
        let elapsedMs = 0, domReady = false, mainFrameLoading = false, loadingKnown = false;
        try {
          const ended = now();
          if (Number.isFinite(operationStarted) && Number.isFinite(ended) && ended >= operationStarted) elapsedMs = Math.min(60000, Math.floor(ended - operationStarted));
        } catch { /* A broken timing source cannot reveal arbitrary values. */ }
        try {
          domReady = !win.isDestroyed() && generation === expectedGeneration && wc.getURL() === url &&
            domReadyGeneration === expectedGeneration && domReadyUrl === url && !!domReadyFrame &&
            wc.mainFrame === domReadyFrame && domReadyFrame.url === url;
          if (typeof wc.isLoadingMainFrame === 'function') { mainFrameLoading = wc.isLoadingMainFrame() === true; loadingKnown = true; }
        } catch { /* Fixed false/unknown flags are safe when a page disappears. */ }
        const diagnostic = { requestedOp: requestLabel, actualOp: actualLabel, dispatched, elapsedMs, domReady, mainFrameLoading, loadingKnown };
        error.operationDiagnostic = diagnostic;
        error.message += `（${Object.entries(diagnostic).map(([key, value]) => `${key}=${value}`).join(',')}）`;
        return error;
      };
      const finish = (error, value) => {
        if (settled) return;
        settled = true; clearTimeout(timer); pending.delete(cancel);
        wc.removeListener('dom-ready', dispatch); wc.removeListener('did-stop-loading', dispatch);
        if (error) reject(annotateTimeout(error)); else resolve(value);
      };
      const cancel = error => finish(error);
      const dispatch = async () => {
        if (settled || dispatched || checking) return;
        checking = true;
        try {
          await current(); assertDocument();
          if (settled) return;
          frame = captureReadyFrame(expectedGeneration, url);
          // webContents queues scripts behind full page loading. A timed-out
          // queued entry/commit could run later, so only dispatch once this
          // exact document is ready; DOM-ready mainFrame ignores slow assets.
          if (!frame && wc.isLoadingMainFrame?.() === true) return;
          assertDocument(); dispatched = true;
          Promise.resolve((frame || wc).executeJavaScript(script, false)).then(async result => {
            try { await current(); assertDocument(); finish(null, result); } catch (error) { finish(error); }
          }, error => finish(error));
        } catch (error) { finish(error); }
        finally { checking = false; }
      };
      const timer = setTimeout(() => finish(preparing && duration < operationTimeoutMs ? deadlineFailure() : failure(`欢迎语页面操作超时（${preparationStage}），当前结果需检查`, 'PAGE_OPERATION_TIMEOUT')), duration);
      pending.add(cancel); wc.on('dom-ready', dispatch); wc.on('did-stop-loading', dispatch);
      void dispatch();
    });
  };
  const pause = async milliseconds => { await current(); await wait(preparing ? Math.min(milliseconds, remaining()) : milliseconds); await current(); };
  const raw = async (operation, payload = {}, requestedOp = 'prepare-recipient') => {
    await current();
    if (!homeEntry || wc.getURL() !== frozenHomeEntry || generation !== homeNavigationGeneration) throw failure('欢迎语页面不是冻结的官方私信入口');
    return execute(builtinScript(profile, operation, { ...payload, identity, welcomeProfileUrl: frozenProfile,
      welcomeHomeEntryUrl: frozenHomeEntry, welcomeRecipientId: recipientId }), undefined,
    { requestedOp, actualOp: operation === 'probeComposer' ? 'probe' : operation });
  };

  const verifyScan = (scan, { target = false, empty = false } = {}) => {
    if (scan?.identity && scan.identity !== identity) throw failure('欢迎语发送账号身份已变化，已停止', 'WELCOME_IDENTITY_CHANGED');
    if (!scan?.ok || scan.ready === false || scan.invalidRows || scan.identity !== identity) throw failure(scan?.detail || '欢迎语私信页面身份或内容尚未核对');
    if (empty && scan.canSwitch !== true) throw failure('欢迎语准备页面有未发送草稿或状态不明，已保留');
    const targets = (scan.threadDetails || []).filter(item => !item.isGroup && item.peerId === recipientId);
    if ((scan.profilePeerVerified !== true || scan.homeEntryPeerVerified !== true ||
        scan.isGroup === true || scan.peerId !== recipientId || scan.peerVerified !== true ||
        targets.length !== 1 || targets[0].peerVerified !== true || targets[0].peerSource !== 'verified-follow-home-entry' ||
        targets[0].id !== scan.threadId)) throw failure('主页当前聊天无法唯一核对新粉丝的单人私信接收人，当前未发送');
    if (targets.length !== 1 || targets[0].peerVerified !== true) throw failure('无法唯一核对新粉丝的单人私信，当前未发送');
    if (target && (scan.threadId !== threadId || scan.peerId !== recipientId || scan.peerVerified !== true || targets[0].id !== threadId)) throw failure('欢迎语接收人或当前单聊已变化，当前未发送');
    return targets[0];
  };
  const probeHomeComposer = async (requestedOp = 'prepare-recipient') => {
    const result = await raw('probeComposer', { welcome: true, recipientId, threadId,
      message: { externalId: `follower:${recipientId}`, senderId: recipientId, threadId: `follower:${recipientId}` } }, requestedOp);
    if (result?.ok !== true || result.ready !== true) throw failure(result?.detail || '官方首页私信输入框尚未通过可编辑核验，当前未发送');
  };
  const detach = () => { wc.removeListener('did-start-navigation', navigation); wc.removeListener('render-process-gone', gone); wc.removeListener('dom-ready', ready); win.removeListener('closed', gone); };
  const close = async ({ preserve = false } = {}) => {
    if (closed || win.isDestroyed()) { closed = true; detach(); return { closed: true }; }
    if (preserve) {
      closed = true; detach(); rejectPending(failure('欢迎语准备已结束', 'WELCOME_WINDOW_CLOSED'));
      return { closed: false, retained: true, detail: '发送结果待核对，已保留原聊天页面，不会自动重发' };
    }
    // Closing must work even after the caller has paused. This final read never
    // clicks or types and does not invoke the caller's now-revoked permission.
    let empty = submitted;
    if (!empty && (wc.getURL() === frozenProfile || (homeEntry && wc.getURL() === frozenHomeEntry))) {
      try {
        const cleanupGeneration = generation, cleanupUrl = wc.getURL();
        const frame = captureReadyFrame(cleanupGeneration, cleanupUrl);
        const unchanged = () => !win.isDestroyed() && generation === cleanupGeneration && wc.getURL() === cleanupUrl &&
          (!frame || captureReadyFrame(cleanupGeneration, cleanupUrl) === frame);
        // Cleanup remains read-only after caller cancellation. A slow asset
        // must not queue even this read behind the entire page load; without
        // a current ready document, retain the page rather than guess empty.
        if (frame || wc.isLoadingMainFrame?.() !== true) {
          const result = await timed(() => {
            if (!unchanged() || (!frame && wc.isLoadingMainFrame?.() === true)) return null;
            return (frame || wc).executeJavaScript(idlePageProbeScript({ platform: 'douyin', url: cleanupUrl }), false);
          }, { cleanup: true });
          empty = result?.ok === true && result.safeToClose === true && unchanged();
        }
      } catch { /* Preserve unverified content. */ }
    }
    closed = true; detach(); rejectPending(failure('欢迎语准备已结束', 'WELCOME_WINDOW_CLOSED'));
    if (empty) { if (!win.isDestroyed()) win.destroy(); return { closed: true }; }
    return { closed: false, retained: true, detail: '准备页面有草稿或无法确认可安全关闭，已保留隐藏页面，请人工检查' };
  };
  try {
    for (;;) {
      await current();
      const url = wc.getURL();
      if (!url || url === 'about:blank' || (wc.isLoadingMainFrame?.() === true && !captureReadyFrame(generation, url))) { await pause(400); continue; }
      if (url !== frozenProfile) throw failure('新粉丝主页与已验证的关注记录不一致');
      const profileGeneration = generation, profileFrame = wc.mainFrame;
      let entry;
      try { entry = await execute(recipientHomeEntryProbeScript(frozenProfile, identity, recipientId), profileGeneration, { actualOp: 'profile-probe' }); }
      catch (error) {
        await current();
        if (error.code !== 'WELCOME_PAGE_NAVIGATED' || wc.getURL() !== frozenProfile) throw error;
        await pause(400); continue;
      }
      await current();
      if (generation !== profileGeneration) { await pause(400); continue; }
      if (!entry?.ok) {
        if (!entry?.renderPending) throw failure(entry?.detail || '新粉丝主页身份或官方入口无法核对');
        await pause(400); continue;
      }
      if (entry.ready !== true || entry.profileUrl !== frozenProfile || entry.expectedIdentity !== identity || entry.recipientId !== recipientId) throw failure('新粉丝主页与冻结的发送账号或接收人身份不一致', 'WELCOME_IDENTITY_CHANGED');
      if (!profileFrame || wc.mainFrame !== profileFrame || profileFrame.url !== frozenProfile) throw failure('新粉丝主页文档在跳转前发生变化，当前未发送', 'WELCOME_PAGE_CHANGED');
      profileReadyMs = elapsedMs();
      // Keep every restored/hidden editor and attachment. The official public
      // route is used only after this document independently maps secUID to
      // numeric UID; no native input, history row or SDK action is a fallback.
      const empty = await execute(idlePageProbeScript({ platform: 'douyin', url: frozenProfile }), profileGeneration, { actualOp: 'profile-idle' });
      await current();
      if (generation !== profileGeneration || wc.getURL() !== frozenProfile || wc.mainFrame !== profileFrame || profileFrame.url !== frozenProfile) throw failure('新粉丝主页在跳转前发生变化，当前未发送', 'WELCOME_PAGE_CHANGED');
      if (empty?.ok !== true || empty.safeToClose !== true) throw failure('新粉丝主页有草稿、验证或无法确认的内容，已保留，当前未发送');
      if (entryAttempted) throw failure('官方私信入口已尝试，不能重复导航');
      entryAttempted = true; entryStartedMs = elapsedMs(); preparationStage = 'entry'; homeEntry = true;
      let loadError = null;
      try { Promise.resolve(win.loadURL(frozenHomeEntry)).catch(error => { loadError = loadFailure(error); }); }
      catch (error) { throw loadFailure(error); }
      for (;;) {
        await current();
        if (loadError) throw loadError;
        if (homeNavigationSeen && wc.getURL() === frozenHomeEntry && generation === homeNavigationGeneration &&
            (wc.isLoadingMainFrame?.() !== true || captureReadyFrame(generation, frozenHomeEntry))) break;
        await pause(400);
      }
      entryCompletedMs = elapsedMs(); beginChatBudget(); break;
    }
    preparationStage = 'chat-verify'; chatVerifyStartedMs = elapsedMs();
    let scan;
    for (let attempt = 0; attempt < 80; attempt++) {
      await current();
      const guard = await execute(idlePageProbeScript({ platform: 'douyin', url: frozenHomeEntry }), homeNavigationGeneration, { actualOp: 'home-idle' });
      if (guard?.ok !== true || guard.safeToClose !== true) throw failure('官方首页私信入口存在草稿、登录验证或无法确认的内容，已保留');
      scan = await raw('scan');
      if (scan?.identity && scan.identity !== identity) throw failure('欢迎语发送账号身份已变化，已停止', 'WELCOME_IDENTITY_CHANGED');
      if (scan?.invalidRows) throw failure(scan.detail || '欢迎语私信页面结构校验失败');
      lastRenderStage = ['conversation', 'profile-title', 'identity'].includes(scan?.renderStage) ? scan.renderStage : '';
      lastSurfaceDetail = /^主页私信输入框或标题尚未加载完成（输入:\d{1,3}; RightPanel:\d{1,3}\/\d{1,3}; Stack:\d{1,3}\/\d{1,3}; 主页标题:\d{1,3}; 消息面板:\d{1,3}）$/.test(scan?.detail || '') ? `；最近面板:${scan.detail}` : '';
      if (scan?.ok && scan.ready !== false) { verifyScan(scan, { empty: true }); break; }
      if (scan?.renderPending !== true) throw failure(scan?.detail || '新粉丝聊天尚未通过核验');
      await pause(400);
    }
    threadId = verifyScan(scan, { empty: true }).id;
    verifyScan(await raw('scan'), { target: true, empty: true });
    await probeHomeComposer();
    const run = async (operation, payload = {}) => {
      if (!['prepare', 'send', 'commit', 'receipt', 'scan', 'selectThread'].includes(operation)) throw failure('欢迎语准备页面不支持此操作');
      if (operation === 'selectThread' && payload.threadId !== threadId) throw failure('欢迎语只能选择已核对的新粉丝单聊');
      const scan = await raw('scan', {}, operation);
      verifyScan(scan, { target: true, empty: operation === 'prepare' });
      if (operation === 'scan') return scan;
      if (operation === 'prepare') await probeHomeComposer(operation);
      if (operation === 'selectThread') return { ok: true };
      const result = await raw(operation, { ...payload, welcome: true, recipientId, threadId }, operation);
      if (operation === 'commit' && result?.ok && result.submitted === true) submitted = true;
      return result;
    };
    await current(); phase = 'chat'; preparing = false;
    return { threadId, run, close };
  } catch (error) {
    const result = await close();
    if (result.retained) { error.message += `；${result.detail}`; error.retainedWindow = true; }
    // This helper has not returned its send/commit operations yet. A retry is
    // possible only after a read-only cleanup proved the original page empty
    // and actually destroyed it. Fatal navigation/identity, drafts, dialogs,
    // unknown errors and any error after preparation are excluded.
    if (preparing && !submitted && !fatal && issuedFailures.has(error) && result.closed === true && win.isDestroyed()) {
      try {
        markReleasedPreparation(error, { code: error.code, stage: preparationStage,
          ...(error.networkCode ? { networkCode: error.networkCode } : {}), pageReleased: true });
      } catch { /* Explicit non-transient failures remain terminal. */ }
    }
    throw error;
  }
}

module.exports = { prepareWelcomeRecipient };
