// Serialized into the dedicated owned creator collector. Follow only rendered
// content-card controls, not a cold deep link or a router/SDK/private closure.
function navigateOwnedComment(input) {
  const id = value => typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) ? value : Number.isSafeInteger(value) && value > 0 ? String(value) : '';
  const visible = e => e?.isConnected && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden';
  const text = e => (e?.innerText || e?.textContent || '').trim().replace(/\s+/g, ' ');
  const find = selector => [...document.querySelectorAll(selector)].filter(visible);
  const waiting = detail => ({ waiting: true, detail });
  if (location.origin !== 'https://creator.douyin.com' || !id(input.workId) || !id(input.ownUid)) throw Error('抖音本人作品导航身份无效');
  if (/login|passport|verify/.test(location.pathname) || /安全验证|访问受限|验证码/.test(document.title || '') || find('input[type="password"],input[autocomplete="one-time-code"]').length) throw Error('抖音创作者页面需要本人登录或验证，请到账号管理处理');
  const route = /^\/creator-micro\/work-management\/work-detail\/([1-9]\d{0,18})$/.exec(location.pathname);
  const state = window.__matrixCreatorObservedPages;
  if (state?.version !== 1 || !(state.pages instanceof Map)) return waiting('等待官网作品导航初始化');
  state.navigationRequested ||= new Set();
  if (route?.[1] === input.workId) {
    // The official card may open an ordinary detail URL with no tabKey. The
    // selected rendered tab, not a guessed query parameter, proves readiness.
    const tabs = find('[role="tab"]').filter(e => text(e) === '评论管理');
    if (tabs.length > 1) throw Error('抖音官方评论标签不唯一，未操作');
    if (tabs[0]?.getAttribute('aria-selected') === 'true') { state.navigationRequested.clear(); return { ready: true }; }
    if (!tabs.length) return waiting('等待目标作品评论标签加载');
    const key = 'tab/' + input.workId;
    if (tabs[0].getAttribute('aria-selected') === 'false' && !state.navigationRequested.has(key)) { state.navigationRequested.add(key); tabs[0].click(); }
    return waiting('等待官网目标作品切换到评论管理');
  }
  if (route) {
    const back = find('[class*="back-text"]').filter(e => text(e) === '内容管理');
    if (back.length !== 1) return waiting('等待官网返回内容管理入口');
    const key = 'back/' + route[1] + '/' + input.workId;
    if (!state.navigationRequested.has(key)) { state.navigationRequested.add(key); back[0].click(); }
    return waiting('沿官网入口返回作品目录');
  }
  if (location.pathname !== '/creator-micro/content/manage') throw Error('抖音作品导航未进入官方内容管理');
  if ([...state.pending || []].some(key => key.startsWith('works/'))) return waiting('等待官网作品列表请求返回');
  const cards = find('[class*="video-card-content-"],[data-aweme-id]'), candidates = [];
  for (const card of cards) {
    const ids = new Set();
    for (const name of ['data-aweme-id', 'data-item-id']) if (id(card.getAttribute(name))) ids.add(id(card.getAttribute(name)));
    for (let e = card, depth = 0; e && depth < 4; e = e.parentElement, depth++) {
      let fiber = e[Object.keys(e).find(key => key.startsWith('__reactFiber$'))];
      for (let n = 0; fiber && n < 7; fiber = fiber.return, n++) {
        const props = fiber.memoizedProps;
        for (const row of [props, ...['item', 'data', 'itemData', 'video', 'videoInfo', 'aweme', 'awemeInfo', 'work', 'workInfo'].map(key => props?.[key])]) {
          if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
          const value = id(row.aweme_id ?? row.awemeId ?? row.item_id ?? row.itemId);
          const author = id(row.author?.uid ?? row.author?.userId);
          if (author && author !== input.ownUid) { if (value === input.workId) throw Error('抖音目标作品卡片作者不属于当前绑定账号'); continue; }
          if (value) ids.add(value);
        }
      }
    }
    if (ids.has(input.workId)) {
      if (ids.size !== 1) throw Error('抖音目标作品卡片编号不唯一，未操作');
      candidates.push(card);
    }
  }
  if (candidates.length > 1) throw Error('抖音目标作品卡片不唯一，未操作');
  if (candidates.length === 1) {
    // This exact official disabled-card class uses a toast instead of opening
    // any details (private/review-limited work). Do not wait or bypass its gate.
    if (candidates[0].closest('[class*="video-card-new-disabled"]')) return { unavailable: true, detail: '官网当前作品状态暂不支持查看详情数据' };
    const controls = [...candidates[0].querySelectorAll('span,button,a,p,div')].filter(e => visible(e) && text(e) === '评论' && ![...e.children].some(child => text(child) === '评论'));
    if (controls.length !== 1) return waiting('等待目标作品唯一评论入口');
    const key = 'comment/' + input.workId;
    if (!state.navigationRequested.has(key)) { state.navigationRequested.add(key); controls[0].click(); }
    return waiting('沿官网作品卡片打开评论');
  }
  const signature = [...state.pages].filter(([key, value]) => key.startsWith('works/') && !value.error).map(([key, value]) => key + ':' + value.max_cursor).join('|');
  const key = 'next/' + input.workId + '/' + signature;
  const next = find('button[aria-label="下一页"],button[title="下一页"],.semi-page-next button,.semi-pagination-next button,.ant-pagination-next button').filter(e => !e.disabled && e.getAttribute('aria-disabled') !== 'true');
  if (next.length > 1) throw Error('抖音作品导航下一页控件不唯一，未操作');
  if (next.length === 1 && !state.navigationRequested.has(key)) { state.navigationRequested.add(key); next[0].click(); }
  else {
    const last = cards.at(-1); last?.scrollIntoView({ block: 'end' });
    for (let e = last?.parentElement; e && e !== document.body; e = e.parentElement) if (e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY)) e.scrollTop = e.scrollHeight;
    window.scrollTo(0, document.scrollingElement?.scrollHeight || 0);
  }
  return waiting('在官方作品列表定位目标作品；不按标题猜测');
}
module.exports = { navigateOwnedComment };
