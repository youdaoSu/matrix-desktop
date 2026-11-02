'use strict';

// Original DOM adapter. Profiles contain CSS/data attributes only, never code.
const { isAllowedUrl } = require('./policy.cjs');
const { getPlatform } = require('./platforms.cjs');
const SELECTORS = ['readySelector', 'identitySelector', 'rowSelector', 'incomingSelector', 'textSelector', 'senderSelector', 'timeSelector', 'activeThreadSelector', 'composerSelector', 'sendSelector', 'receiptSelector', 'receiptTextSelector'];
const OPTIONAL = ['threadSelector', 'replySelector', 'groupSelector'];
const ATTRIBUTES = ['identityAttribute', 'idAttribute', 'senderIdAttribute', 'timeAttribute', 'activeThreadIdAttribute', 'receiptIdAttribute', 'threadIdAttribute'];
function validateProfile(input, platform) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('页面设置必须是 JSON 对象');
  const result = { pageUrl: String(input.pageUrl || '') };
  if (!isAllowedUrl(result.pageUrl, getPlatform(platform).domains)) throw new Error('页面地址必须属于这个平台的 HTTPS 官方域名');
  const url = new URL(result.pageUrl);
  if (url.username || url.password || (url.port && url.port !== '443')) throw new Error('不允许带凭据或自定义端口的页面地址');
  for (const key of SELECTORS) {
    if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > 400) throw new Error(`页面设置缺少 ${key}，或选择器过长`);
    result[key] = input[key].trim();
  }
  for (const key of OPTIONAL) {
    if (input[key] != null && (typeof input[key] !== 'string' || input[key].length > 400)) throw new Error(`页面设置 ${key} 无效`);
    result[key] = (input[key] || '').trim();
  }
  for (const key of ATTRIBUTES) {
    if (key === 'threadIdAttribute' && !result.threadSelector) { result[key] = ''; continue; }
    if (typeof input[key] !== 'string' || !/^[a-zA-Z][\w:-]{0,79}$/.test(input[key])) throw new Error(`页面设置 ${key} 必须是属性名`);
    result[key] = input[key];
  }
  return result;
}

// Executed in an isolated world: no preload, Node, cookies or network bridge.
function pageOperation(profile, operation, payload = {}) {
  const all = (selector, root = document) => selector ? Array.from(root.querySelectorAll(selector)) : [];
  const visible = element => !!element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  const one = (selector, root = document) => {
    const found = all(selector, root).filter(visible);
    return found.length === 1 ? found[0] : null;
  };
  const text = element => (element?.innerText || element?.textContent || '').trim();
  const attr = (element, name) => element?.getAttribute(name)?.trim() || '';
  const error = detail => ({ ok: false, detail });
  const active = () => attr(one(profile.activeThreadSelector), profile.activeThreadIdAttribute);
  const self = () => attr(one(profile.identitySelector), profile.identityAttribute);
  const ready = () => !!one(profile.readySelector) && !!self() && !!active();
  try {
    // Parse every selector before performing an action.
    for (const [key, value] of Object.entries(profile)) if (key.endsWith('Selector') && value) document.querySelector(value);
    if (!ready()) return error('尚未识别到已登录账号和唯一会话，请登录并完成页面校准');
    if (payload.identity && self() !== payload.identity) return error('页面登录账号发生变化，请重新检查连接');
    const threadId = active();
    const rows = () => all(profile.rowSelector).filter(visible);
    const readRow = row => {
      const incoming = row.matches(profile.incomingSelector) || !!row.querySelector(profile.incomingSelector);
      if (!incoming) return null;
      const rawId = attr(row, profile.idAttribute);
      const sender = one(profile.senderSelector, row);
      const senderId = attr(sender, profile.senderIdAttribute);
      const content = one(profile.textSelector, row);
      const timestamp = attr(one(profile.timeSelector, row), profile.timeAttribute);
      // No invented IDs or timestamps: older/history rows must not turn into new messages.
      const parsed = /^\d{10,13}$/.test(timestamp) ? Number(timestamp) * (timestamp.length === 10 ? 1000 : 1) : Date.parse(timestamp);
      if (!rawId || !senderId || !content || !Number.isFinite(parsed)) return null;
      return { externalId: `${threadId}:${rawId}`, threadId, senderId, senderName: text(sender), text: text(content), receivedAt: new Date(parsed).toISOString(), isOwn: senderId === self(), isGroup: !!(profile.groupSelector && document.querySelector(profile.groupSelector)) };
    };
    const receipts = () => all(profile.receiptSelector).filter(visible).map(row => ({ id: attr(row, profile.receiptIdAttribute), text: text(one(profile.receiptTextSelector, row)) })).filter(row => row.id);
    if (operation === 'scan') {
      const messages = rows().map(readRow).filter(Boolean);
      const threads = all(profile.threadSelector).filter(visible).map(element => attr(element, profile.threadIdAttribute)).filter(Boolean);
      return { ok: true, identity: self(), threadId, messages, threads: [...new Set(threads)].slice(0, 100), invalidRows: rows().filter(row => row.matches(profile.incomingSelector) || row.querySelector(profile.incomingSelector)).length - messages.length };
    }
    if (operation === 'selectThread') {
      if (threadId === payload.threadId) return { ok: true };
      const candidates = all(profile.threadSelector).filter(element => visible(element) && attr(element, profile.threadIdAttribute) === payload.threadId);
      if (candidates.length !== 1) return error('找不到唯一的原始对话，已停止发送');
      candidates[0].click();
      return { ok: true };
    }
    if (operation === 'receipt') {
      if (threadId !== payload.threadId) return error('页面已切换对话，发送结果需要人工核对');
      const found = receipts().filter(row => row.text === payload.replyText && !payload.before.includes(row.id));
      return { ok: true, receipt: found.length === 1 ? `page:${found[0].id}` : null };
    }
    if (threadId !== payload.message.threadId) return error('页面已切换对话，已停止发送');
    const candidates = rows().map(row => ({ row, message: readRow(row) })).filter(item => item.message?.externalId === payload.message.externalId);
    if (candidates.length !== 1) return error('找不到唯一的原始消息，已停止发送');
    const { row, message } = candidates[0];
    if (message.isOwn || message.isGroup || message.senderId !== payload.message.senderId || message.text !== payload.message.text) return error('原始消息或接收人发生变化，已停止发送');
    if (operation === 'prepare') {
      if (profile.replySelector) {
        const reply = one(profile.replySelector, row);
        if (!reply) return error('找不到原评论的回复按钮');
        reply.click();
      }
      return { ok: true };
    }
    if (operation !== 'send') return error('不支持的页面操作');
    const input = one(profile.composerSelector);
    const send = one(profile.sendSelector);
    if (!input || !send || send.getAttribute('aria-disabled') === 'true' || send.disabled) return error('输入区或发送按钮不唯一或不可用');
    if (String('value' in input ? input.value : text(input)).trim()) return error('输入框已有未发送内容，已保留，请先处理');
    const before = receipts().map(row => row.id);
    input.focus();
    if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
      const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, payload.replyText);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (input.isContentEditable) {
      input.textContent = payload.replyText;
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: payload.replyText }));
    } else return error('输入区类型尚不支持');
    // Let the site's input handlers settle before the separate commit operation.
    return { ok: true, prepared: true, before };
  } catch { return error('页面结构不符合设置，已停止自动操作'); }
}

function commitOperation(profile, payload) {
  const visible = element => element && element.getClientRects().length > 0;
  const unique = selector => { const found = [...document.querySelectorAll(selector)].filter(visible); return found.length === 1 ? found[0] : null; };
  try {
    const identity = unique(profile.identitySelector)?.getAttribute(profile.identityAttribute);
    const thread = unique(profile.activeThreadSelector)?.getAttribute(profile.activeThreadIdAttribute);
    const input = unique(profile.composerSelector);
    const send = unique(profile.sendSelector);
    const value = input && ('value' in input ? input.value : input.innerText || input.textContent);
    const row = [...document.querySelectorAll(profile.rowSelector)].filter(visible).find(element => `${thread}:${element.getAttribute(profile.idAttribute)}` === payload.message.externalId);
    const incoming = row && (row.matches(profile.incomingSelector) || row.querySelector(profile.incomingSelector));
    const sender = row && [...row.querySelectorAll(profile.senderSelector)].filter(visible);
    const content = row && [...row.querySelectorAll(profile.textSelector)].filter(visible);
    if (identity !== payload.identity || thread !== payload.message.threadId || !incoming || sender?.length !== 1 || sender[0].getAttribute(profile.senderIdAttribute) !== payload.message.senderId || content?.length !== 1 || (content[0].innerText || content[0].textContent).trim() !== payload.message.text || value?.trim() !== payload.replyText.trim() || !send || send.disabled || send.getAttribute('aria-disabled') === 'true') return { ok: false, submitted: false, detail: '发送前检查未通过，内容留在输入框，请人工核对' };
    send.click();
    return { ok: true, submitted: true };
  } catch { return { ok: false, submitted: 'unknown', detail: '发送时页面发生变化，请人工核对' }; }
}

function scriptFor(profile, operation, payload) {
  const fn = operation === 'commit' ? commitOperation : pageOperation;
  return operation === 'commit'
    ? `(${fn.toString()})(${JSON.stringify(profile)},${JSON.stringify(payload)})`
    : `(${fn.toString()})(${JSON.stringify(profile)},${JSON.stringify(operation)},${JSON.stringify(payload || {})})`;
}
module.exports = { validateProfile, scriptFor, pageOperation, commitOperation };
