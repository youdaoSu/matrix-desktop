'use strict';

const { validateProfileUrl } = require('./outreach.cjs');

// Runs in the official profile page. This entry only clicks the normal private
// message button; sender and numeric recipient identity must still be checked
// independently in the resulting single-person chat before any text is filled.
function recipientPageOperation(profileUrl, operation, fixedPoint = null) {
  const fail = (detail, renderPending = false) => ({ ok: false, opened: false, renderPending, detail });
  let expected, current;
  try { expected = new URL(profileUrl); current = new URL(location.href); }
  catch { return fail('接收人主页地址无效，未打开私信'); }
  const allowChat = operation === 'navigation';
  const exactProfile = current.href === expected.href && current.origin === expected.origin && current.pathname === expected.pathname;
  const officialChat = allowChat && current.origin === 'https://www.douyin.com' && !current.port && !current.username && !current.password && /^\/chat(?:\/|$)/.test(current.pathname);
  if (expected.protocol !== 'https:' || expected.hostname !== 'www.douyin.com' || expected.port || expected.username || expected.password || expected.search || expected.hash ||
      !/^\/user\/(?!\d+$)[A-Za-z0-9_-]{1,256}$/.test(expected.pathname) ||
      (!exactProfile && !officialChat)) {
    return fail('当前页面与任务冻结的抖音接收人主页不一致，未打开私信');
  }
  const visible = element => {
    if (!element || !element.getClientRects().length || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false;
    }
    return true;
  };
  const all = selector => Array.from(document.querySelectorAll(selector)).filter(visible);
  // Inspect only explicit visible dialogs, never the profile's entire text or
  // message history. Unknown dialogs also require a person to dismiss them.
  const dialogs = all('[role="dialog"], [role="alertdialog"], [aria-modal="true"]');
  if (dialogs.length) {
    const needsLogin = dialogs.some(dialog => /登录|登入|扫码|验证码|安全验证|验证身份|完成验证|人机验证|滑块|captcha/i.test(dialog.textContent || ''));
    return fail(needsLogin ? '官方页面要求登录或安全验证，请人工处理后继续' : '接收人主页有未关闭的对话框，请人工处理后继续');
  }
  const editorSelector = 'textarea, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]';
  const editors = operation === 'cleanup' ? Array.from(document.querySelectorAll(editorSelector)) : all(editorSelector);
  const draftKind = editor => {
    if (editor.querySelectorAll('img, video, audio, svg, canvas, iframe, [data-void="true"], [data-inline-wrapper]').length) return '附件';
    let value = String('value' in editor ? editor.value : editor.innerText || editor.textContent || '').trim();
    // The official profile can restore its empty chat sidebar before the
    // private-message button is clicked. Only that identified composer gets
    // the same exact marked-empty-leaf treatment as the navigation guard.
    // Other page editors, textarea values and unmatched invisible drafts stay
    // significant; this does not clear or mutate any editor content.
    if (!('value' in editor) && (allowChat || editor.closest('[data-e2e="msg-input"]'))) {
      const markers = Array.from(editor.querySelectorAll('[data-zero-space="true"], [data-string="true"][data-enter="true"][data-leaf="true"]'));
      const zeroCount = (value.match(/\u200b/g) || []).length;
      if (markers.length && markers.length === zeroCount && markers.every(marker => marker.textContent === '\u200b')) value = value.replace(/\u200b/g, '').trim();
    }
    if (!value) return '';
    return /^[\s\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]+$/.test(value) ? '不可见内容' : '文字草稿';
  };
  const draftKinds = [...new Set(editors.map(draftKind).filter(Boolean))];
  if (draftKinds.length) {
    return fail(`接收人主页${allowChat ? '跳转检查' : '入口检查'}发现未发送草稿（${draftKinds.join('、')}），已保留，请先人工处理`);
  }
  // A background profile created for one read-only check can be released only
  // when every editor, including hidden restored editors, is demonstrably empty.
  if (operation === 'cleanup') return { ok: true, safeToClose: true };
  // Presence is only a rendering hint before leaving the profile. It provides
  // no evidence of sender, recipient, conversation identity or delivery.
  if (allowChat) return { ok: true, chatRendered: exactProfile && all('[data-e2e="msg-input"]').length > 0 && all('[data-e2e="conversation-item"]').length > 0 };
  const buttons = all('button').filter(button => String(button.textContent || '').trim() === '私信');
  if (!buttons.length && !all('h1').length) {
    const excluded = 'input, textarea, [contenteditable], [role="textbox"], [role="log"], blockquote, q, button, a, [data-e2e="msg-input"], [data-e2e="conversation-item"], .messageMessageListwrapper, [data-e2e="comment-item"]';
    const unavailable = all('div, p, span').some(element => !element.closest(excluded) &&
      Array.from(element.childNodes || []).some(node => node.nodeType === 3 && String(node.nodeValue || '').trim() === '用户不存在') && String(element.textContent || '').trim() === '用户不存在');
    if (unavailable) return { ...fail('平台当前显示“用户不存在”，无法核对该粉丝主页或建立私信；本条未发送。'), stage: 'profile-unavailable' };
  }
  if (!buttons.length) return fail('接收人主页尚未出现可核对的“私信”按钮，请等待页面加载或人工检查', true);
  if (buttons.length !== 1) return fail('接收人主页存在多个“私信”按钮，无法唯一核对，未点击');
  const button = buttons[0];
  if (button.disabled || button.hasAttribute('disabled') || button.getAttribute('aria-disabled') === 'true' || button.matches(':disabled') ||
      button.closest('[aria-disabled="true"]') || getComputedStyle(button).pointerEvents === 'none') return fail('官方页面的“私信”按钮当前不可用，未点击');
  if (operation === 'inspect-home-entry') return { ok: true, ready: true, opened: false };
  if (operation === 'probe') {
    const rect = button.getBoundingClientRect(), width = innerWidth, height = innerHeight;
    const values = [rect.left, rect.top, rect.width, rect.height, width, height];
    if (!values.every(value => Number.isFinite(value) && Math.abs(value) <= 32768) || rect.width <= 0 || rect.height <= 0 || width <= 0 || height <= 0) return fail('官方私信按钮的位置尚未就绪，未点击', true);
    const x = fixedPoint === null ? rect.left + rect.width / 2 : fixedPoint.x;
    const y = fixedPoint === null ? rect.top + rect.height / 2 : fixedPoint.y;
    if (![x, y].every(value => Number.isFinite(value) && Math.abs(value) <= 65536)) return fail('官方私信入口的固定点击坐标无效，未点击');
    if (x < 0 || y < 0 || x >= width || y >= height) return fail(fixedPoint === null ? '官方私信按钮尚未进入可点击区域，未点击' : '官方私信入口的固定点击位置已离开当前视口，未点击', fixedPoint === null);
    if (x < rect.left || y < rect.top || x >= rect.left + rect.width || y >= rect.top + rect.height) return fail('官方私信入口的固定点击位置已离开按钮，未点击');
    const hit = document.elementFromPoint(x, y);
    if (hit !== button && !button.contains(hit)) return fail('官方私信按钮被其他页面元素遮挡，未点击', true);
    return { ok: true, ready: true, opened: false, hovered: button.matches(':hover'), point: { x, y },
      buttonRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, viewport: { width, height } };
  }
  // Navigation and DOM checks above are synchronous with this one UI action.
  // No editor, platform network API, or framework-private state is touched.
  try { button.click(); }
  catch { return fail('点击官方“私信”入口时发生异常，请人工检查页面，当前未填写或发送消息'); }
  return { ok: true, opened: true };
}

function recipientEntryScript(profileUrl) {
  const frozenUrl = validateProfileUrl('douyin', profileUrl);
  return `(${recipientPageOperation.toString()})(${JSON.stringify(frozenUrl)},"entry")`;
}

function recipientNavigationScript(profileUrl) {
  const frozenUrl = validateProfileUrl('douyin', profileUrl);
  return `(${recipientPageOperation.toString()})(${JSON.stringify(frozenUrl)},"navigation")`;
}
function recipientCleanupScript(profileUrl) {
  const frozenUrl = validateProfileUrl('douyin', profileUrl);
  return `(${recipientPageOperation.toString()})(${JSON.stringify(frozenUrl)},"cleanup")`;
}

// Directory records contain a public secUID route, whereas chat models expose
// numeric UIDs. Resolve that relationship from the exact rendered profile;
// neither a nickname nor a newly selected chat can supply this mapping.
function readRecipientIdentity(profileUrl, identity) {
  const fail = (detail, renderPending = false) => ({ ok: false, renderPending, detail });
  const pending = (stage, detail) => ({ ...fail(`${detail}（${stage}）`, true), stage });
  let expected;
  try { expected = new URL(profileUrl); }
  catch { return fail('粉丝主页地址无效'); }
  if (expected.href !== profileUrl || expected.origin !== 'https://www.douyin.com' || expected.username || expected.password || expected.search || expected.hash ||
      !/^\/user\/(?!\d+$)[A-Za-z0-9_-]{1,256}$/.test(expected.pathname) || location.href !== profileUrl ||
      typeof identity !== 'string' || !/^[1-9]\d{0,63}$/.test(identity)) return fail('粉丝主页或发送账号与任务不一致');
  const route = expected.pathname.slice('/user/'.length);
  const object = value => value !== null && typeof value === 'object';
  const own = (value, field) => object(value) && Object.prototype.hasOwnProperty.call(value, field);
  const get = (value, field) => { try { return value?.[field]; } catch { return undefined; } };
  const uid = value => typeof value === 'string' && /^[1-9]\d{0,63}$/.test(value) ? value : typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : '';
  const visible = element => {
    if (!element || !element.getClientRects().length || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) || style.opacity === '0') return false;
    }
    return true;
  };
  const all = selector => Array.from(document.querySelectorAll(selector)).filter(visible);
  try {
    if (all('[role="dialog"], [role="alertdialog"], [aria-modal="true"]').length) return fail('粉丝主页有登录、验证或对话框，请先处理');
    const titles = all('h1'), buttons = all('button').filter(button => String(button.textContent || '').trim() === '私信');
    if (titles.length > 1 || buttons.length > 1) return fail('粉丝主页标题或私信入口不唯一');
    if (!titles.length && !buttons.length) {
      // Only an exact, visible standalone platform notice is evidence. Do not
      // infer account state from the document title, biography or quoted chats.
      const excluded = 'input, textarea, [contenteditable], [role="textbox"], [role="log"], blockquote, q, button, a, [data-e2e="msg-input"], [data-e2e="conversation-item"], .messageMessageListwrapper, [data-e2e="comment-item"]';
      const unavailable = all('div, p, span').some(element => !element.closest(excluded) &&
        Array.from(element.childNodes || []).some(node => node.nodeType === 3 && String(node.nodeValue || '').trim() === '用户不存在') && String(element.textContent || '').trim() === '用户不存在');
      if (unavailable) return { ...fail('平台当前显示“用户不存在”，无法核对该粉丝主页或建立私信；本条未发送。'), stage: 'profile-unavailable' };
      return pending('profile-elements', '尚未显示粉丝主页标题和私信入口');
    }
    if (!titles.length) return pending('profile-title', '尚未显示粉丝主页标题');
    if (!buttons.length) return pending('profile-button', '尚未显示粉丝主页私信入口');
    const inspect = (element, surface) => {
      const keys = Object.getOwnPropertyNames(element).filter(name => name.startsWith('__reactFiber$'));
      if (keys.length > 1) throw new Error('粉丝主页组件身份不唯一');
      let fiber = keys[0] && get(element, keys[0]);
      if (!fiber) return { pending: pending(`profile-${surface}-fiber`, `粉丝主页${surface === 'title' ? '标题' : '私信入口'}组件尚未就绪`) };
      const visited = new Set(), recipients = new Set();
      let fullContexts = 0, loginSeen = false, nearestUserSeen = false, nearestRecipientId = '', privateProfile = false;
      for (let depth = 0; fiber && depth < 100 && !visited.has(fiber); depth++, fiber = get(fiber, 'return')) {
        visited.add(fiber);
        const props = get(fiber, 'memoizedProps');
        if (!object(props)) continue;
        // The live profile uses userInfo on the nearest title/button component.
        // It must itself bind both route and numeric ID; never fall through a
        // missing/malformed nearest model into global or logged-in user data.
        if (!nearestUserSeen && own(props, 'userInfo')) {
          nearestUserSeen = true;
          const user = get(props, 'userInfo');
          nearestRecipientId = uid(get(user, 'uid'));
          if (!nearestRecipientId || nearestRecipientId === identity || get(user, 'secUid') !== route) throw new Error('最近的粉丝主页资料与固定接收人无法对应');
          recipients.add(nearestRecipientId);
          // The official private-profile route has no IM dock when the
          // account is private and this sender does not follow it. This
          // narrow flag is derived from the same nearest recipient model,
          // never from biography text, query parameters or an outer model.
          privateProfile = [true, 1].includes(get(user, 'secret')) && get(user, 'followStatus') === 0;
        }
        if (own(props, 'isLogin')) {
          if (get(props, 'isLogin') !== true) throw new Error('粉丝主页登录状态未通过核对');
          loginSeen = true;
        }
        if (own(props, 'currentUserInfo')) {
          const user = get(props, 'currentUserInfo'), recipientId = uid(get(user, 'uid'));
          if (!recipientId || recipientId === identity || get(user, 'secUid') !== route) throw new Error('粉丝主页与收件人身份无法对应');
          recipients.add(recipientId);
        }
        if (own(props, 'currentUserUid')) {
          const recipientId = uid(get(props, 'currentUserUid'));
          if (!recipientId || recipientId === identity) throw new Error('粉丝主页收件人编号无效');
          recipients.add(recipientId);
        }
        if (own(props, 'selfInfo')) {
          if (uid(get(get(get(props, 'selfInfo'), 'info'), 'uid')) !== identity) throw new Error('粉丝主页登录账号与任务不一致');
        }
        if (['currentUserInfo', 'currentUserUid', 'selfInfo'].every(field => own(props, field))) {
          if (get(props, 'isSelf') !== false) throw new Error('粉丝主页不能是发送账号自己');
          fullContexts++;
        }
      }
      if (fiber || recipients.size > 1) throw new Error('粉丝主页组件祖先或收件人身份不一致');
      if (recipients.size === 1 && (nearestRecipientId || (fullContexts && loginSeen))) return { recipientId: [...recipients][0], privateProfile };
      return { pending: pending(`profile-${surface}-model`, `粉丝主页${surface === 'title' ? '标题' : '私信入口'}缺少可核对的身份资料`) };
    };
    const title = inspect(titles[0], 'title'), button = inspect(buttons[0], 'button');
    if (title.pending || button.pending) return title.pending || button.pending;
    const titleId = title.recipientId, buttonId = button.recipientId;
    if (titleId !== buttonId || location.href !== profileUrl) return fail('粉丝主页身份在核对时发生变化');
    if (title.privateProfile !== button.privateProfile) return fail('粉丝主页的私密状态在独立组件间不一致');
    // The profile mapping proves the recipient. The expected sender is still
    // independently verified by the official chat reader before any fill.
    return { ok: true, profileUrl, expectedIdentity: identity, recipientId: titleId, ...(title.privateProfile ? { privateProfile: true } : {}) };
  } catch (error) { return fail(error?.message || '粉丝主页身份无法核对'); }
}

function recipientIdentityScript(profileUrl, identity) {
  const frozenUrl = validateProfileUrl('douyin', profileUrl);
  if (typeof identity !== 'string' || !/^[1-9]\d{0,63}$/.test(identity)) throw new Error('粉丝私信缺少已核对的发送账号身份');
  return `(${readRecipientIdentity.toString()})(${JSON.stringify(frozenUrl)},${JSON.stringify(identity)})`;
}

function probeRecipientEntry(profileUrl, identity, recipientId, fixedPoint, readIdentity, inspectEntry, entryOperation = 'probe') {
  if (typeof recipientId !== 'string' || !/^[1-9]\d{0,63}$/.test(recipientId) || recipientId === identity) return { ok: false, detail: '欢迎语接收人编号无效，未点击' };
  const mapping = readIdentity(profileUrl, identity);
  if (!mapping?.ok) return mapping;
  if (mapping.profileUrl !== profileUrl || mapping.expectedIdentity !== identity || mapping.recipientId !== recipientId) return { ok: false, detail: '欢迎语主页身份与固定接收人不一致，未点击' };
  const entry = inspectEntry(profileUrl, entryOperation, fixedPoint);
  return entry.ok ? { ...mapping, ...entry } : entry;
}

function recipientEntryProbeScript(profileUrl, identity, recipientId, fixedPoint = null) {
  const frozenUrl = validateProfileUrl('douyin', profileUrl);
  if (![identity, recipientId].every(value => typeof value === 'string' && /^[1-9]\d{0,63}$/.test(value)) || identity === recipientId) throw new Error('欢迎语私信入口缺少固定数字账号或接收人');
  if (fixedPoint !== null && (!fixedPoint || Object.keys(fixedPoint).length !== 2 || ![fixedPoint.x, fixedPoint.y].every(value => Number.isFinite(value) && value >= 0 && value <= 32768))) throw new Error('欢迎语私信入口的固定点击坐标无效');
  return `(${probeRecipientEntry.toString()})(${JSON.stringify(frozenUrl)},${JSON.stringify(identity)},${JSON.stringify(recipientId)},${JSON.stringify(fixedPoint)},${readRecipientIdentity.toString()},${recipientPageOperation.toString()})`;
}

function recipientHomeEntryProbeScript(profileUrl, identity, recipientId) {
  const frozenUrl = validateProfileUrl('douyin', profileUrl);
  if (![identity, recipientId].every(value => typeof value === 'string' && /^[1-9]\d{0,63}$/.test(value)) || identity === recipientId) throw new Error('欢迎语官方入口缺少固定数字账号或接收人');
  return `(${probeRecipientEntry.toString()})(${JSON.stringify(frozenUrl)},${JSON.stringify(identity)},${JSON.stringify(recipientId)},null,${readRecipientIdentity.toString()},${recipientPageOperation.toString()},"inspect-home-entry")`;
}

module.exports = { recipientEntryScript, recipientEntryProbeScript, recipientHomeEntryProbeScript, recipientNavigationScript, recipientIdentityScript, recipientCleanupScript };
