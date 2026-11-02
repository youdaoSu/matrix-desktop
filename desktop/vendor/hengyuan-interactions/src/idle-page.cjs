'use strict';

// A fixed, read-only guard for releasing an idle renderer. It does not inspect
// credentials, message history or React state and never clears an editor.
function inspectIdlePage(platform, expectedUrl) {
  const fail = reason => ({ ok: false, safeToClose: false, reason });
  let url;
  try { url = new URL(expectedUrl); } catch { return fail('page-changed'); }
  const domains = platform === 'douyin' ? ['https://www.douyin.com', 'https://creator.douyin.com']
    : platform === 'xiaohongshu' ? ['https://www.xiaohongshu.com', 'https://creator.xiaohongshu.com'] : [];
  const allowed = domains.includes(url.origin);
  if (!allowed || url.username || url.password || location.href !== url.href) return fail('page-changed');
  const query = selector => Array.from(document.querySelectorAll(selector));
  const visible = element => {
    if (!element.getClientRects().length) return false;
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.hidden || node.inert || node.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false;
    }
    return true;
  };
  if (query('[role="dialog"], [role="alertdialog"], [aria-modal="true"], #login-panel-new, #login-pannel').some(visible)) return fail('dialog');
  if (query('input[type="file"]').some(input => input.files?.length > 0 || String(input.value || '').trim())) return fail('draft');
  // A history bubble can still represent an active upload. Explicit in-flight
  // markers protect the page even when its upload widget is currently hidden.
  if (query('[data-uploading="true"], [data-upload-status="uploading"]').length) return fail('draft');
  const regions = new Map();
  for (const editor of query('textarea, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]')) {
    if (editor.querySelectorAll('img, video, audio, svg, canvas, iframe, [data-void="true"], [data-inline-wrapper]').length) return fail('draft');
    let value = String('value' in editor ? editor.value : editor.innerText || editor.textContent || '').trim();
    if (!('value' in editor) && platform === 'douyin' && editor.closest('[data-e2e="msg-input"]')) {
      const markers = Array.from(editor.querySelectorAll('[data-zero-space="true"], [data-string="true"][data-enter="true"][data-leaf="true"]'));
      const count = (value.match(/\u200b/g) || []).length;
      if (markers.length && count === markers.length && markers.every(node => node.textContent === '\u200b')) value = value.replace(/\u200b/g, '').trim();
    }
    if (value) return fail('draft');
    const root = editor.closest('[data-e2e="msg-input"], .xhs-im-input-bar, [class*="cmt-editor-"]');
    if (!root) return fail('unverified');
    // The upload preview may be a sibling of the editable leaf. Include its
    // local composer wrapper, but never mistake message-history media for a
    // draft. If that boundary cannot be established, retain the renderer.
    const region = root.parentElement || root;
    if (region === document.body) return fail('unverified');
    const histories = Array.from(region.querySelectorAll('.messageMessageListwrapper, [data-e2e="conversation-item"], .xhs-im-chat-window'));
    let history = null;
    if (histories.length) {
      // Douyin's RightPanel (also embedded in its stacked popup) deliberately
      // places MessageList and MsgInput beside each other in this wrapper.
      // A history sibling is not an unknown composer or an upload preview.
      // Accept only this observed, unique, direct-sibling layout. All editors
      // and selected files above are still checked, including within history;
      // media anywhere outside that exact history subtree remains protected.
      const composers = Array.from(region.querySelectorAll('[data-e2e="msg-input"]'));
      if (platform !== 'douyin' || root.matches?.('[data-e2e="msg-input"]') !== true ||
          region.matches?.('.componentsRightPanelnotHeaderArea') !== true ||
          composers.length !== 1 || composers[0] !== root || histories.length !== 1 ||
          histories[0].matches?.('.messageMessageListwrapper') !== true || histories[0].parentElement !== region) return fail('unverified');
      history = histories[0];
    }
    regions.set(region, history);
  }
  for (const [region, history] of regions) {
    const outsideHistory = element => !history || !history.contains(element);
    if (Array.from(region.querySelectorAll('img, video, audio, canvas, iframe, [data-void="true"], [data-inline-wrapper]')).some(outsideHistory)) return fail('draft');
    // Only inert history media is exempt. A visible progress or preview inside
    // MessageList can belong to an upload/send that has not finished yet.
    if (Array.from(region.querySelectorAll('progress, [role="progressbar"], [class*="upload-preview"], [class*="uploadPreview"], [class*="UploadPreview"], [class*="attachment-preview"], [class*="attachmentPreview"]')).some(visible)) return fail('draft');
  }
  return { ok: true, safeToClose: true };
}
function idlePageScript(platform, url) { return `(${inspectIdlePage.toString()})(${JSON.stringify(platform)},${JSON.stringify(url)})`; }
function idlePageProbeScript({ platform, url }) { return idlePageScript(platform, url); }
module.exports = { inspectIdlePage, idlePageScript, idlePageProbeScript };
