'use strict';
const { operate } = require('./builtin-adapter.cjs');
const { readPageState } = require('./page-state.cjs');

// The raw scan stays in the page. Only booleans, bounded structural counts and
// fixed text cross the IPC boundary; this operation cannot fill or submit.
function readInspection(context, run, reader) {
  const base = {
    welcomeProfileUrl: context.profileUrl, welcomeHomeEntryUrl: context.url,
    welcomeRecipientId: context.recipientId, identity: context.identity,
  };
  const summary = { ready: false, identityMatches: false, peerMatches: false, empty: false, threadVerified: false, surfaceCounts: {}, detail: '当前官方聊天面板尚未通过完整核验。' };
  try {
    const scan = run('douyin', 'dm', 'scan', base, reader);
    for (const key of ['inputs', 'rightHeaders', 'rightTitles', 'stackHeaders', 'stackTitles', 'names', 'panes']) {
      const count = scan?.profileSurfaceCounts?.[key];
      if (Number.isSafeInteger(count) && count >= 0 && count <= 10000) summary.surfaceCounts[key] = count;
    }
    summary.identityMatches = scan?.identity === context.identity;
    summary.peerMatches = scan?.peerId === context.recipientId && scan?.peerVerified === true;
    const targets = Array.isArray(scan?.threadDetails) ? scan.threadDetails.filter(item => item.id === scan.threadId && item.peerId === context.recipientId &&
      item.peerVerified === true && item.isGroup === false && item.peerSource === 'verified-follow-home-entry') : [];
    summary.threadVerified = scan?.ok === true && scan.ready === true && !scan.invalidRows &&
      scan.profilePeerVerified === true && scan.homeEntryPeerVerified === true && scan.isGroup === false && targets.length === 1;
    if (!summary.identityMatches || !summary.peerMatches || !summary.threadVerified) return summary;
    if (scan.canSwitch !== true) { summary.detail = '检测到未发送草稿或附件，已保留；未填写或发送。'; return summary; }
    const probe = run('douyin', 'dm', 'probeComposer', {
      ...base, welcome: true, recipientId: context.recipientId, threadId: scan.threadId,
      message: { senderId: context.recipientId, threadId: `follower:${context.recipientId}` },
    }, reader);
    summary.empty = probe?.ok === true && probe.ready === true;
    summary.ready = summary.empty;
    summary.detail = summary.ready ? '账号、接收人、唯一单聊与空输入框均已核对；未填写或发送。' : '当前输入框未通过空白且可编辑核验；未填写或发送。';
    return summary;
  } catch { return summary; }
}

const unavailable = detail => ({ ready: false, identityMatches: false, peerMatches: false, empty: false, threadVerified: false, surfaceCounts: {}, detail });
function sanitizedInspection(value) {
  const details = new Set([
    '当前官方聊天面板尚未通过完整核验。',
    '检测到未发送草稿或附件，已保留；未填写或发送。',
    '账号、接收人、唯一单聊与空输入框均已核对；未填写或发送。',
    '当前输入框未通过空白且可编辑核验；未填写或发送。',
  ]);
  const result = unavailable(details.has(value?.detail) ? value.detail : '当前官方聊天面板尚未通过完整核验。');
  for (const key of ['identityMatches', 'peerMatches', 'empty', 'threadVerified']) result[key] = value?.[key] === true;
  for (const key of ['inputs', 'rightHeaders', 'rightTitles', 'stackHeaders', 'stackTitles', 'names', 'panes']) {
    const count = value?.surfaceCounts?.[key];
    if (Number.isSafeInteger(count) && count >= 0 && count <= 10000) result.surfaceCounts[key] = count;
  }
  result.ready = value?.ready === true && result.identityMatches && result.peerMatches && result.empty && result.threadVerified;
  if (!result.ready && result.detail === '账号、接收人、唯一单聊与空输入框均已核对；未填写或发送。') result.detail = '当前官方聊天面板尚未通过完整核验。';
  return result;
}

async function inspectWelcomeChatWindow({ entry, profileUrl, url, identity, recipientId, check, timeoutMs = 5000 }) {
  const win = entry.win, wc = win.webContents;
  const frame = wc.mainFrame, generation = entry.inspectionGeneration || 0;
  let changed = false;
  const assertCurrent = () => {
    check();
    if (changed || win.isDestroyed() || wc.getURL() !== url || entry.inspectionGeneration !== generation ||
        !frame || wc.mainFrame !== frame || frame.url !== url || typeof frame.executeJavaScript !== 'function') throw new Error('检查窗口、账号或页面已变化，本次只读结果已作废。');
  };
  try {
    assertCurrent();
    if (wc.isLoadingMainFrame?.() === true && entry.inspectionReadyFrame !== frame) return unavailable('官方检查页仍在加载，请稍后再次检查。');
  } catch { return unavailable('检查窗口、账号或页面已变化，本次只读结果已作废。'); }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return unavailable('只读检查超时设置无效。');
  return new Promise(resolve => {
    let finished = false;
    const finish = value => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      wc.removeListener?.('did-start-navigation', navigation);
      wc.removeListener?.('render-process-gone', closed);
      win.removeListener?.('closed', closed);
      resolve(value);
    };
    const closed = () => { changed = true; finish(unavailable('检查窗口、账号或页面已变化，本次只读结果已作废。')); };
    const navigation = (_event, _url, _inPlace, mainFrame) => { if (mainFrame !== false) closed(); };
    const timer = setTimeout(() => finish(unavailable('只读检查超时，未填写或发送；迟到结果不会采用。')), Math.min(timeoutMs, 5000));
    wc.on?.('did-start-navigation', navigation); wc.on?.('render-process-gone', closed); win.on?.('closed', closed);
    try {
      assertCurrent();
      const context = { profileUrl, url, identity, recipientId };
      const script = `(${readInspection.toString()})(${JSON.stringify(context)},${operate.toString()},${readPageState.toString()})`;
      Promise.resolve(frame.executeJavaScript(script, false)).then(value => {
        if (finished) return;
        try { assertCurrent(); finish(sanitizedInspection(value)); }
        catch { closed(); }
      }, () => finish(unavailable('只读检查未完成，未填写或发送。')));
    } catch { closed(); }
  });
}
module.exports = { inspectWelcomeChatWindow, readInspection, sanitizedInspection };
