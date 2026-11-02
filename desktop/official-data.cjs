// Executed in an isolated world of an authenticated, owned official page.
// No cookies, network interception, hidden application state or private API access.
function officialData(command, input = {}, roots = []) {
  const query = selector => [...new Set([document, ...roots].flatMap(root => [...root.querySelectorAll(selector)]))];
  const visible = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && !el.closest('[hidden],[aria-hidden=true]'); };
  const uncovered = el => { const r = el.getBoundingClientRect(); const x = Math.max(0, r.left) + (Math.min(innerWidth, r.right) - Math.max(0, r.left)) / 2, y = Math.max(0, r.top) + (Math.min(innerHeight, r.bottom) - Math.max(0, r.top)) / 2; const top = document.elementFromPoint(x, y); return visible(el) && x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && top && (top === el || el.contains(top)); };
  const text = el => (el?.innerText ?? el?.textContent ?? '').trim().replace(/\s+/g, ' ');
  if (command === 'open-message-list') {
    if (input.kind !== 'messages' || location.protocol !== 'https:' || location.hostname !== 'www.douyin.com') throw Error('自动消息入口仅用于抖音官方网页，未操作其他平台');
    const list = query('[data-e2e="im-dialog"]').filter(visible);
    if (list.length === 1) return { opened: true, clicked: false, conversationSelected: false };
    const attemptedKey = '__matrixDouyinMessageListAttemptV1';
    if (globalThis[attemptedKey]) return { error: '消息入口已点击，等待官方列表显示；不会因超时重复点击或选择会话', retryable: false };
    if (/login|passport|signin/.test(location.pathname) || query('input[type=password],input[autocomplete=one-time-code]').some(visible)) return { error: '抖音网页版要求本人登录，请在账号管理恢复该账号登录', retryable: false };
    // Navigation only. A message body, notification, recipient or menu action
    // bearing the word "消息" must never be a candidate for this click.
    const entries = query('header button,header [role=button],nav button,nav [role=button],[data-e2e="top-nav-message"]').filter(el => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && !el.closest('[data-e2e="conversation-item"],[data-conversation-id],[data-e2e="msg-input"],article,[role=dialog]') && [el.getAttribute('aria-label'), el.getAttribute('title'), text(el)].some(value => /^消息(?:\s*\d{1,6}\+?)?$/.test(value || '')));
    if (entries.length !== 1) return { error: '抖音官方消息入口尚未唯一识别，未点击任何控件；可查看官方消息页核对当前布局', retryable: entries.length === 0 };
    if (!uncovered(entries[0])) return { error: '抖音消息入口被官方弹层遮挡，未点击；请在官方消息页处理提示', retryable: false };
    globalThis[attemptedKey] = true;
    entries[0].click();
    return { opened: true, clicked: true, conversationSelected: false };
  }
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
  // Rendered metadata only: no conversation activation, event dispatch, scrolling,
  // requests or platform "mark read" calls. Missing badges are not evidence of read.
  const metadata = el => {
    const result = {};
    const avatar = [...el.querySelectorAll('img[data-avatar],img.avatar,img[class*=avatar],[class*=avatar] img')].find(visible);
    try { const url = new URL(avatar?.currentSrc || avatar?.src || ''); if (url.protocol === 'https:' && !url.username && !url.password && url.href.length <= 4096) result.avatarUrl = url.href; } catch {}
    if (input.kind !== 'messages') return result;
    const badges = [el, ...el.querySelectorAll('[data-unread-count],[data-unread], [data-unread-badge],.unread-count,[class*=unreadCount],[class*=unread-count],[aria-label]')].filter(visible);
    for (const badge of badges) {
      const explicitCount = badge.getAttribute('data-unread-count');
      const label = badge.getAttribute('aria-label') || '';
      const labelledCount = /^(\d{1,6})(\+)?\s*(?:条未读(?:消息)?|unread messages?)$/i.exec(label) || /^未读(?:消息)?\s*[:：]?\s*(\d{1,6})(\+)?$/.exec(label);
      const displayedCount = badge.matches('[data-unread-badge],.unread-count,[class*=unreadCount],[class*=unread-count]') && /^(\d{1,6})(\+)?$/.exec(text(badge));
      const raw = explicitCount !== null && /^\d{1,6}$/.test(explicitCount) ? [explicitCount, explicitCount, ''] : labelledCount || displayedCount;
      if (raw) { const count = Number(raw[1]); result.unreadState = count ? 'unread' : 'read'; result.unreadCount = count; if (raw[2]) result.unreadCountCapped = true; break; }
      if (badge.getAttribute('data-unread') === 'true' || /^(未读|未读消息|unread)$/i.test(label)) { result.unreadState = 'unread'; break; }
      if (badge.getAttribute('data-unread') === 'false' || /^(已读|已读消息|read)$/i.test(label)) { result.unreadState = 'read'; break; }
    }
    return result;
  };
  if (!selectors[input.kind]) throw Error('记录类型无效');
  const noRecords = () => {
    const headings = { comments: ['评论管理', '评论列表', '全部评论'], messages: ['私信列表', '会话列表', '消息列表', '全部私信'], followers: ['粉丝列表', '我的粉丝', '粉丝管理'] };
    const emptyLabels = { comments: ['暂无评论', '暂无评论数据', '还没有评论'], messages: ['暂无消息', '暂无私信', '暂无会话'], followers: ['暂无粉丝', '还没有粉丝', '暂无粉丝数据'] };
    const ownList = query('h1,h2,h3,[role=heading]').some(el => visible(el) && headings[input.kind].includes(text(el)));
    const empty = query('.empty-state,.empty-list,.el-empty,.ant-empty,[data-empty]').some(el => visible(el) && emptyLabels[input.kind].includes(text(el)));
    // A verified empty list is different from a layout/parser/login failure.
    // Never infer emptiness from a blank page or from text in a conversation.
    if (ownList && empty) return { records: [], capturedAt: new Date().toISOString(), source: location.origin + location.pathname, partial: true, empty: true };
    if (/login|passport|signin/.test(location.pathname) || query('input[type=password],input[autocomplete=one-time-code]').some(visible)) throw Error('官方页面要求登录或本人验证，请在账号管理恢复登录；已有互动结果保留');
    if (input.kind === 'messages' && location.hostname === 'www.douyin.com' && !query('[data-e2e="im-dialog"]').some(visible)) throw Error('抖音官方消息列表尚未展开；并非没有私信。请查看独立消息页的连接提示，自动读取不会选择联系人');
    if (query('[role=alert]').some(el => visible(el) && /^(没有权限|暂无权限|无权访问|未开通|请先开通)/.test(text(el)))) throw Error('当前官方账号没有该互动列表的访问权限；不会把权限不足当作没有数据');
    if (document.readyState !== 'complete' || query('[aria-busy=true],[role=progressbar]').some(visible)) throw Error('官方互动列表仍在加载，暂未读到记录，稍后自动重试');
    throw Error('当前页没有识别到结构明确的记录。官方列表尚未打开或当前平台布局未适配；已有结果保留，不会把读取失败当作没有数据。');
  };
  if (input.kind === 'comments' && location.hostname === 'www.douyin.com' && /^\/video\/\d+$/.test(location.pathname)) {
    const rows = query('[data-e2e="comment-item"]').filter(el => visible(el) && !el.parentElement?.closest('[data-e2e="comment-item"]'));
    const records = rows.map(el => { const author = [...el.querySelectorAll('a[href*="/user/"]')].find(a => visible(a) && text(a)); const content = text(el.querySelector('.FduGc_lz .Sh1Da424,.FduGc_lz')); let authorProfileUrl = ''; try { const u = new URL(author?.href); if (u.hostname === 'www.douyin.com' && /^\/user\/MS4w[a-zA-Z0-9_-]+$/.test(u.pathname)) authorProfileUrl = u.origin + u.pathname; } catch {} return { platformId: '', author: text(author), content, authorProfileUrl, ...metadata(el) }; }).filter(row => row.author && row.content).slice(0,100);
    if (!records.length) return noRecords();
    return { records, capturedAt: new Date().toISOString(), source: location.origin + location.pathname, partial: true };
  }
  if (input.kind === 'messages' && location.hostname === 'creator.douyin.com') {
    const pickCreator = (el, selector) => text([...el.querySelectorAll(selector)].find(visible));
    if (!/^\/creator-micro\/data\/following\/chat\/?$/.test(location.pathname)) throw Error('请连接抖音创作者中心的消息摘要列表，未从其他页面猜测私信');
    // Publicly observable creator feed cards. Do not use the detail/chat
    // branch of third-party scrapers: it clicks each recipient and history.
    // Refuse an already-open chat pane rather than reading mixed recipients.
    if (query('[data-e2e="msg-input"],.messageEditorinputArea,.StackLayoutStackChatHeadertitle').some(visible)) throw Error('官方页面已进入具体会话，自动摘要读取暂停；请返回消息列表，避免混入其他收件人的聊天');
    const cards = query('li.semi-list-item').filter(visible);
    const records = cards.map(el => {
      const author = pickCreator(el, '[class*="item-header-name-"]');
      const content = pickCreator(el, '[class*="text-"]');
      const displayTime = pickCreator(el, '[class*="item-header-time-"]');
      if (!author || !content || !displayTime) return null;
      const id = el.getAttribute('data-conversation-id') || el.getAttribute('data-message-id') || '';
      return { platformId: id.slice(0,200), author: author.slice(0,200), content: content.slice(0,4000), displayTime: displayTime.slice(0,100), ...metadata(el) };
    }).filter(Boolean).slice(0,100);
    if (!records.length) return noRecords();
    return { records, capturedAt: new Date().toISOString(), source: location.origin + location.pathname, partial: true, sourceMode: 'creator_message_feed', conversationSelected: false };
  }
  const douyinMessages = input.kind === 'messages' && location.hostname === 'www.douyin.com';
  const candidates = query(selectors[input.kind] + (douyinMessages ? ',[data-e2e="im-dialog"] [data-e2e="conversation-item"]' : '')).filter(visible);
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
    return { platformId: platformId.slice(0, 200), author: author.slice(0, 200), content: content.slice(0, 4000), ...metadata(el) };
  }).filter(Boolean).slice(0, 100);
  if (!records.length) return noRecords();
  return { records, capturedAt: new Date().toISOString(), source: location.origin + location.pathname, partial: true };
}

function officialDataScript(command, input) {
  return `(() => { try { return (${officialData.toString()})(${JSON.stringify(command)},${JSON.stringify(input)}); } catch (error) { return { error: String(error.message || '官方页面读取失败') }; } })()`;
}

function registerOfficialData({ ipcMain, context, verifyRead, readTimeoutMs = 15000, readDeadlineMs = 20000 }) {
  const busy = new Set(), plans = new Map();
  const { randomUUID } = require('node:crypto');
  ipcMain.handle('matrix:official-data', async (event, input) => {
    let guest, acquired = false;
    try {
      if (!['options', 'open-options', 'select-option', 'read-interactions', 'open-message-list'].includes(input?.command)) throw Error('操作无效');
      const interaction = input.command === 'read-interactions' || input.command === 'open-message-list';
      if (interaction ? !['comments','messages','followers'].includes(input.kind) : !['音乐','商品','合集'].includes(input.field)) throw Error('不支持的记录类型或动态选项');
      if (input.command === 'open-message-list' && (input.platform !== 'douyin' || input.kind !== 'messages')) throw Error('仅支持连接抖音官方消息列表');
      const pureRead = ['options','read-interactions'].includes(input.command);
      const deadline = Date.now() + Math.max(1, Math.min(20000, readDeadlineMs));
      const budget = require('./operation-budget.cjs').createOperationBudget(deadline - Date.now());
      const readWithin = async (action, label, limit) => {
        try { return await budget.run(action, label, limit); }
        catch (error) {
          // Keep the phase when a late reply crosses the total deadline. The
          // generic budget's final check otherwise loses which read was late.
          if (error.message === '官方页面操作超时，已停止本次操作；不会重复执行') throw Error(label + '超时，未执行后续读取；已有快照保留');
          throw error;
        }
      };
      const ctx = pureRead ? await readWithin(() => context(event, input), '官方页面连接', 20000) : await context(event, input); guest = ctx.guest;
      if (Date.now() > deadline) throw Error('官方页面连接超时，未执行读取或选项操作，请重试');
      if (busy.has(guest.id)) throw Error('当前官方页面操作仍未结束，请先核对，不要重复点击');
      busy.add(guest.id); acquired = true;
      const url = guest.getURL();
      if (!interaction && !/upload|publish|post\/create|post\/video|\/platform/.test(new URL(url).pathname)) throw Error('请先在该账号打开官方发布编辑器');
      let nonce;
      if (input.command === 'select-option') {
        const plan = plans.get(guest.id); plans.delete(guest.id);
        if (!plan || plan.nonce !== input.nonce || plan.owner !== ctx.auth.userId || plan.account !== input.accountId || plan.field !== input.field || plan.url !== url || plan.expires < Date.now() || !Number.isInteger(input.index) || input.index < 0 || input.index >= plan.count) throw Error('候选项不属于当前账号、字段或已过期，请重新读取');
        nonce = plan.nonce;
      } else nonce = randomUUID();
      if (input.command === 'options' || input.command === 'open-options') plans.delete(guest.id);
      const args = { field: input.field, kind: input.kind, nonce, index: input.index };
      // WebView2 renders parts of the official interface inside author-owned
      // shadow roots; a document-only query misses them. No focus emulation,
      // navigation, private state, network calls or user-gesture is requested.
      const pending = input.command === 'read-interactions' && guest.engine === 'webview2'
        ? require('./official-dom.cjs').runOfficialDOM(guest, officialData, [input.command, args], 'matrix-readonly-interactions', { operationTimeoutMs: readTimeoutMs, commandTimeoutMs: Math.min(5000, readTimeoutMs) })
        : guest.executeJavaScriptInIsolatedWorld(1003, [{ code: officialDataScript(input.command, args) }]);
      // Pure rendered reads can time out without holding this guest forever.
      // Mutating combobox/option commands keep their per-guest lock until they
      // actually settle: a renderer timeout is not evidence of a rolled-back click.
      const result = pureRead ? await readWithin(() => pending, '官方可见记录读取超过等待上限，已有快照保留', readTimeoutMs) : await pending;
      if (guest.isDestroyed() || guest.getURL() !== url) throw Error('官方页面已切换，请重新读取');
      if (result.error) return result;
      if (interaction) {
        if (verifyRead) {
          if (pureRead) await readWithin(() => verifyRead(ctx, input, event), '核验互动记录所属账号ID，已有快照保留', 12000);
          else await verifyRead(ctx, input, event);
        }
        if (guest.isDestroyed() || guest.getURL() !== url) throw Error('读取期间官方页面已切换，结果已忽略');
        return { ...result, accountId: input.accountId, sessionId: input.sessionId, platform: input.platform, kind: input.kind };
      }
      if (input.command === 'options') plans.set(guest.id, { nonce, owner: ctx.auth.userId, account: input.accountId, field: input.field, url, count: result.items.length, expires: Date.now() + 120000 });
      for (const [id, plan] of plans) if (plan.expires < Date.now()) plans.delete(id);
      return result;
    } catch (error) { return { error: error.message, ...(input?.command === 'open-message-list' && error.retryable === true ? { retryable: true } : {}) }; }
    finally { if (acquired) busy.delete(guest.id); }
  });
}
module.exports = { officialData, officialDataScript, registerOfficialData };
