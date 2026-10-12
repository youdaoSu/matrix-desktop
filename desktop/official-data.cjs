// Executed in an isolated world of an authenticated, owned official page.
// No cookies, network interception, hidden application state or private API access.
function officialData(command, input = {}) {
  const visible = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && !el.closest('[hidden],[aria-hidden=true]'); };
  const uncovered = el => { const r = el.getBoundingClientRect(); const x = Math.max(0, r.left) + (Math.min(innerWidth, r.right) - Math.max(0, r.left)) / 2, y = Math.max(0, r.top) + (Math.min(innerHeight, r.bottom) - Math.max(0, r.top)) / 2; const top = document.elementFromPoint(x, y); return visible(el) && x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && top && (top === el || el.contains(top)); };
  const text = el => (el?.innerText ?? el?.textContent ?? '').trim().replace(/\s+/g, ' ');
  const labels = el => [el.getAttribute('aria-label'), ...[...(el.labels || [])].filter(visible).map(text), ...(el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)).filter(el => el && visible(el)).map(text)].filter(Boolean);
  const aliases = { 音乐: ['音乐', '选择音乐', '添加音乐', '背景音乐'], 商品: ['商品', '店铺商品', '添加商品', '选择商品'], 合集: ['合集', '添加到合集', '选择合集', '所属合集'] };
  const stateKey = '__matrixOfficialOptionsV1';
  const fieldLabels = aliases[input.field];
  const labelled = el => fieldLabels?.some(name => labels(el).includes(name));
  if (command === 'select-option') {
    const plan = globalThis[stateKey]; globalThis[stateKey] = undefined;
    if (!plan || plan.nonce !== input.nonce || plan.url !== location.href || Date.now() > plan.expires) throw Error('候选项已过期，请重新读取');
    const item = Number.isInteger(input.index) && input.index >= 0 ? plan.items[input.index] : undefined;
    if (!item || !item.el.isConnected || !uncovered(item.control || item.el) || item.el.disabled || text(item.el) !== item.label) throw Error('官方候选项已经变化、被遮挡或不在可操作区域，请重新读取');
    if (item.control) {
      if (!item.control.contains(item.el) || item.control.disabled || item.control.value !== item.previous || item.el.value !== item.value) throw Error('官方选择框已变化，请重新读取');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(item.control, item.value);
      item.control.dispatchEvent(new Event('input', { bubbles: true })); item.control.dispatchEvent(new Event('change', { bubbles: true }));
      return { applied: item.control.value === item.value, label: item.label, submitted: false };
    }
    if (!item.scope.isConnected || !visible(item.scope) || !item.scope.contains(item.el) || !item.el.matches('[role=option]') || item.el.getAttribute('aria-disabled') === 'true') throw Error('官方候选面板已关闭或变化');
    item.el.click();
    const applied = item.el.isConnected && item.el.getAttribute('aria-selected') === 'true';
    return { applied, label: item.label, requiresReview: !applied, submitted: false };
  }
  if (command === 'options' || command === 'open-options') {
    if (!fieldLabels) throw Error('不支持的动态选项');
    const controls = [...document.querySelectorAll('select,[role=combobox]')].filter(el => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && labelled(el));
    if (command === 'open-options') {
      // Only an explicitly named combobox, never an arbitrary button or submit.
      const combos = controls.filter(el => el.getAttribute('role') === 'combobox');
      if (combos.length !== 1 || !uncovered(combos[0])) throw Error('无法唯一定位可操作的官方选择框，请在内嵌页面展开后读取');
      combos[0].click(); return { opened: true, submitted: false };
    }
    let items = [];
    const selects = controls.filter(el => el.tagName === 'SELECT');
    if (selects.length === 1) {
      const control = selects[0];
      items = [...control.options].filter(el => !el.disabled && el.value && text(el) && text(el).length <= 300 && !/^(请选择|选择|无|不添加)$/.test(text(el))).map(el => ({ el, control, label: text(el), value: el.value, previous: control.value }));
    } else {
      const scopes = [...document.querySelectorAll('[role=listbox],[role=dialog]')].filter(el => visible(el) && (labelled(el) || controls.some(control => control.getAttribute('aria-controls') === el.id && el.id)));
      // Do not guess which of multiple dialogs/menus belongs to the requested field.
      if (scopes.length !== 1) throw Error('未唯一识别已展开的官方候选列表，请在官方页面打开对应选项');
      const scope = scopes[0];
      items = [...scope.querySelectorAll('[role=option]')].filter(el => visible(el) && el.getAttribute('aria-disabled') !== 'true' && text(el) && text(el).length <= 300).map(el => ({ el, scope, label: text(el) }));
    }
    items = items.slice(0, 100);
    if (!items.length) throw Error('当前官方列表没有可读取的候选项；请检查权限、加载状态或搜索条件');
    globalThis[stateKey] = { nonce: input.nonce, expires: Date.now() + 120000, url: location.href, items };
    return { nonce: input.nonce, items: items.map((item, index) => ({ index, label: item.label })), capturedAt: new Date().toISOString(), source: location.origin + location.pathname, submitted: false };
  }
  if (command !== 'read-interactions') throw Error('操作无效');
  const selectors = {
    comments: '[data-comment-id],.comment-item,[class*=commentItem],[class*=comment-item]',
    messages: '[data-conversation-id],.session-item,[class*=conversation-item],[class*=sessionItem]',
    followers: '[data-follower-id],.fans-item,[class*=follower-item],[class*=fansItem]',
  };
  if (!selectors[input.kind]) throw Error('记录类型无效');
  const douyinMessages = input.kind === 'messages' && location.hostname === 'www.douyin.com';
  const candidates = [...document.querySelectorAll(selectors[input.kind] + (douyinMessages ? ',[data-e2e="im-dialog"] [data-e2e="conversation-item"]' : ''))].filter(visible);
  const rows = candidates.filter(el => !candidates.some(other => other !== el && el.contains(other)));
  const pick = (el, selector) => text([...el.querySelectorAll(selector)].find(visible));
  const records = rows.map(el => {
    const isDouyinConversation = douyinMessages && el.matches('[data-e2e="im-dialog"] [data-e2e="conversation-item"]');
    const author = pick(el, isDouyinConversation ? '.conversationConversationItemtitle' : '[class*=nickname],[class*=user-name],[class*=userName],[class*=username],[data-author],.name');
    let content = input.kind === 'followers' ? '' : pick(el, '[class*=comment-content],[class*=commentContent],[class*=message-content],[class*=last-message],[class*=lastMessage],[data-content],.content');
    if (isDouyinConversation) content = pick(el, '.ConversationItemHinttextBox');
    // Verified against Douyin creator work-detail comments on 2026-10-12.
    // Keep this fallback scoped to the observed comment-main structure, not generic text nodes.
    if (!content && input.kind === 'comments' && location.hostname === 'creator.douyin.com' && location.pathname.startsWith('/creator-micro/work-management/work-detail/')) {
      const main = [...el.children].find(child => [...child.classList].some(name => name.startsWith('comment-main-')));
      const body = main && [...main.children].find(child => [...child.classList].some(name => name.startsWith('text-')) && visible(child));
      if (body) content = text(body) || [...body.querySelectorAll('img[alt]')].filter(visible).map(img => img.alt).join('');
    }
    const platformId = el.getAttribute(input.kind === 'comments' ? 'data-comment-id' : input.kind === 'messages' ? 'data-conversation-id' : 'data-follower-id') || '';
    if (!author || (input.kind !== 'followers' && !content && !isDouyinConversation)) return null;
    return { platformId: platformId.slice(0, 200), author: author.slice(0, 200), content: content.slice(0, 4000) };
  }).filter(Boolean).slice(0, 100);
  if (!records.length) throw Error('当前页没有识别到结构明确的记录。请在官方页面打开评论列表、私信会话列表或粉丝列表；不会把空结果当作账号没有数据。');
  return { records, capturedAt: new Date().toISOString(), source: location.origin + location.pathname, partial: true };
}

function officialDataScript(command, input) {
  return `(() => { try { return (${officialData.toString()})(${JSON.stringify(command)},${JSON.stringify(input)}); } catch (error) { return { error: String(error.message || '官方页面读取失败') }; } })()`;
}

function registerOfficialData({ ipcMain, context }) {
  const busy = new Set(), plans = new Map();
  const { randomUUID } = require('node:crypto');
  ipcMain.handle('matrix:official-data', async (event, input) => {
    let guest, acquired = false;
    try {
      if (!['options', 'open-options', 'select-option', 'read-interactions'].includes(input?.command)) throw Error('操作无效');
      const ctx = await context(event, input); guest = ctx.guest;
      if (busy.has(guest.id)) throw Error('当前官方页面正在读取，请稍后');
      busy.add(guest.id); acquired = true;
      const url = guest.getURL();
      if (input.command !== 'read-interactions' && !/upload|publish|post\/create|post\/video|\/platform/.test(new URL(url).pathname)) throw Error('请先在该账号打开官方发布编辑器');
      let nonce;
      if (input.command === 'select-option') {
        const plan = plans.get(guest.id); plans.delete(guest.id);
        if (!plan || plan.nonce !== input.nonce || plan.owner !== ctx.auth.userId || plan.account !== input.accountId || plan.url !== url || plan.expires < Date.now() || !Number.isInteger(input.index) || input.index < 0 || input.index >= plan.count) throw Error('候选项不属于当前账号或已过期，请重新读取');
        nonce = plan.nonce;
      } else nonce = randomUUID();
      const result = await guest.executeJavaScriptInIsolatedWorld(1003, [{ code: officialDataScript(input.command, { field: input.field, kind: input.kind, nonce, index: input.index }) }]);
      if (guest.isDestroyed() || guest.getURL() !== url) throw Error('官方页面已切换，请重新读取');
      if (result.error) return result;
      if (input.command === 'options') plans.set(guest.id, { nonce, owner: ctx.auth.userId, account: input.accountId, url, count: result.items.length, expires: Date.now() + 120000 });
      for (const [id, plan] of plans) if (plan.expires < Date.now()) plans.delete(id);
      return result;
    } catch (error) { return { error: error.message }; }
    finally { if (acquired) busy.delete(guest.id); }
  });
}
module.exports = { officialData, officialDataScript, registerOfficialData };
