'use strict';

// Independently written, read-only adapter for already rendered follow notices.
// Static field evidence is recorded in work/expansion-research/FEATURE-INVENTORY.md.
// This function is self-contained for main-world injection. No SDK or store mutation,
// request, pagination, navigation, DOM mutation, or sending is performed here.
function readFollowState(platform) {
  const result = {
    ok: false, ready: false, supported: platform === 'xiaohongshu' || platform === 'douyin', platform,
    identity: '', selfId: '', threadId: 'followers', messages: [], followers: [],
    invalidRows: 0, liveVerified: false, scope: 'rendered-follow-notifications', detail: '',
  };
  if (!result.supported) {
    result.detail = '该平台尚无经过验证的新关注通知读取器';
    return result;
  }
  const get = (value, key) => { try { return value?.[key]; } catch { return undefined; } };
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const id = value => {
    if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : '';
    if (typeof value === 'bigint') return value > 0n ? String(value) : '';
    return typeof value === 'string' && value !== '0' && value.length > 0 && value.length <= 256 && !/[\s\u0000-\u001f\u007f]/.test(value) ? value : '';
  };
  const text = value => typeof value === 'string' ? value.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').trim() : '';
  const query = (root, selector) => { try { return Array.from(root.querySelectorAll(selector)); } catch { return []; } };
  const closest = (element, selector) => { try { return element?.closest?.(selector) || null; } catch { return null; } };
  const attribute = (element, name) => { try { return element?.getAttribute(name) || ''; } catch { return ''; } };
  const loaded = element => {
    try {
      if (!element || element.nodeType !== 1 || !element.isConnected || !element.getClientRects().length) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    } catch { return false; }
  };
  const profileId = element => {
    try {
      const url = new URL(attribute(element, 'href'), 'https://www.xiaohongshu.com');
      if (url.protocol !== 'https:' || url.hostname !== 'www.xiaohongshu.com' || url.port || url.username || url.password) return '';
      const match = /^\/user\/profile\/([^/]+)\/?$/.exec(url.pathname);
      return match ? id(decodeURIComponent(match[1])) : '';
    } catch { return ''; }
  };
  const serverSeconds = value => {
    if (typeof value !== 'number' && !(typeof value === 'string' && /^\d{9,10}$/.test(value))) return null;
    const seconds = Number(value);
    // Notification BaseItem renders its original time multiplied by 1000.
    // Never accept milliseconds, relative display text, or this reader's time.
    return Number.isSafeInteger(seconds) && seconds >= 946684800 && seconds <= 4102444800 ? seconds : null;
  };
  if (platform === 'douyin') {
    // Independent mapping of the official rendered notice row: type 33,
    // nid_str, create_time (seconds), and follow.from_user (one object).
    // Only selected public component fields are read; no handler is invoked.
    result.renderPending = false;
    result.ignoredRows = 0;
    const decimalId = value => {
      const normalized = id(value);
      return /^[1-9]\d{0,63}$/.test(normalized) ? normalized : '';
    };
    const pending = detail => { result.renderPending = true; throw new Error(detail); };
    try {
      if (location.protocol !== 'https:' || location.hostname !== 'www.douyin.com' || get(location, 'port')) {
        throw new Error('请打开抖音官方网页版通知面板的“粉丝”或“关注”分类');
      }
      if (get(location, 'href')) {
        const url = new URL(location.href);
        if (url.origin !== 'https://www.douyin.com' || url.username || url.password) throw new Error('当前页面不是抖音官方安全地址');
      }
      const rootSelector = '[data-e2e="listDlgTest-container"]';
      const rowSelector = '.v4ybwR9T';
      const nameSelector = '[data-e2e="user-name-card"]';
      const roots = query(document, rootSelector).filter(element => element?.nodeType === 1 && element.isConnected);
      if (!roots.length) pending('抖音通知面板尚未呈现，请打开“粉丝”或“关注”分类；未建立空基线');
      if (roots.length !== 1) throw new Error('页面同时挂载多个通知面板，无法确认读取来源');
      const root = roots[0];
      if (!loaded(root)) pending('抖音通知面板尚未显示，未建立空基线');
      const filters = query(root, '#noticeTypeList [data-e2e="cur-filter"]').filter(loaded);
      if (!filters.length) pending('通知分类尚未呈现，请稍后再检查');
      if (filters.length !== 1) throw new Error('页面出现多个通知分类，已停止读取');
      const filterText = text(filters[0].textContent);
      if (!filterText) pending('通知分类仍在加载，请稍后再检查');
      if (filterText !== '粉丝' && filterText !== '关注') throw new Error('请切换到抖音通知的“粉丝”或“关注”分类');
      if (query(root, '[aria-busy="true"], [data-loading="true"], .mROlbWfe').some(loaded)) {
        pending('抖音关注通知正在加载，暂不读取部分结果');
      }

      const rows = query(root, rowSelector).filter(loaded);
      const names = query(root, nameSelector).filter(loaded);
      if (rows.length > 1000 || names.length > 1000) throw new Error('当前通知数量超过读取范围，请减少加载范围');
      const stores = new Set();
      const entryIdentities = [];
      const inspectFiber = element => {
        let keys;
        try { keys = Object.getOwnPropertyNames(element).filter(key => key.startsWith('__reactFiber$')); } catch { keys = []; }
        if (keys.length !== 1) throw new Error('通知的已渲染组件结构无法唯一确认');
        let node = get(element, keys[0]);
        const visited = new Set();
        const notices = new Set();
        let depth = 0;
        while (node) {
          if (!object(node) || visited.has(node) || ++depth > 128) throw new Error('通知组件祖先结构异常，已停止读取');
          visited.add(node);
          const props = get(node, 'memoizedProps');
          if (object(props)) {
            const store = get(props, 'noticeStore');
            if (store !== undefined) {
              if (!object(store)) throw new Error('通知账号状态结构无法确认');
              stores.add(store);
            }
            const info = get(props, 'uInfo');
            if (info !== undefined) entryIdentities.push({ isLogin: get(props, 'isLogin'), uid: get(info, 'uid') });
            const notice = get(props, 'notice');
            if (notice !== undefined) {
              if (!object(notice)) throw new Error('通知行数据结构无法确认');
              notices.add(notice);
            }
          }
          node = get(node, 'return');
        }
        return notices;
      };
      inspectFiber(root);
      inspectFiber(filters[0]);
      const rowEntries = new Map();
      const rowSet = new Set(rows);
      const failures = new Set();
      const invalid = reason => { result.invalidRows++; failures.add(reason); };
      // The official list also renders system/recommendation/request rows.
      // Classify each physical row before imposing the single-user FOLLOW
      // shape; a non-follow row may legitimately have zero or several names.
      // All row/name ancestors still participate in global account checks.
      for (const row of rows) {
        try { rowEntries.set(row, { names: [], notices: inspectFiber(row) }); } catch (error) { invalid(error.message); }
      }
      for (const name of names) {
        const row = closest(name, rowSelector), entry = rowEntries.get(row);
        if (!rowSet.has(row) || !entry || entry.names.includes(name)) { invalid('可见用户名无法唯一对应一条通知'); continue; }
        entry.names.push(name);
        try { for (const notice of inspectFiber(name)) entry.notices.add(notice); } catch (error) { invalid(error.message); }
      }
      if (!stores.size) throw new Error('无法确认当前通知面板的登录账号与分类状态');
      const identities = new Set();
      for (const store of stores) {
        const uid = decimalId(get(store, 'uid'));
        if (get(store, 'isLogin') !== true || !uid) throw new Error('无法确认当前登录的抖音账号，请登录后重新检查');
        identities.add(uid);
        if (get(get(store, 'curNoticeFilter'), 'value') !== '10') throw new Error('通知分类状态与“粉丝”或“关注”显示不一致');
        const list = get(store, 'noticeListObj');
        if (!object(list) || typeof get(list, 'loading') !== 'boolean') throw new Error('通知列表加载状态无法确认');
        if (get(list, 'loading')) pending('抖音关注通知正在加载，暂不读取部分结果');
        const relationMap = get(store, 'followStatusMap');
        if (relationMap !== undefined && !object(relationMap)) throw new Error('通知关注关系状态结构无法确认');
      }
      for (const entry of entryIdentities) {
        const uid = decimalId(entry.uid);
        if (entry.isLogin !== true || !uid) throw new Error('通知入口的登录身份无法确认');
        identities.add(uid);
      }
      if (identities.size !== 1) throw new Error('通知页面包含多个不同账号身份，已停止读取');
      result.identity = result.selfId = Array.from(identities)[0];
      if (result.invalidRows) throw new Error(Array.from(failures).join('；'));
      if (!rows.length) pending('关注通知正在加载或为空；空列表不会建立基线');

      const messages = new Map();
      const seenIds = new Set(), ignoredIds = new Set();
      for (const row of rows) {
        const { names: rowNames, notices } = rowEntries.get(row);
        if (!notices.size) { invalid('可见通知缺少原始事件数据'); continue; }
        const types = new Set(Array.from(notices, notice => get(notice, 'type')));
        if (Array.from(types).some(type => !Number.isSafeInteger(type) || (type !== -1 && type <= 0))) {
          invalid('通知类型缺失或格式无法确认'); continue;
        }
        if (types.size !== 1) { invalid('同一通知行对应多个不同通知类型'); continue; }
        if (!types.has(33)) {
          // This is not evidence of a follow, irrespective of its wording or
          // payload. Do not read a different notice schema or invent an event.
          result.ignoredRows++;
          for (const notice of notices) { const rawId = id(get(notice, 'nid_str')); if (rawId) ignoredIds.add(rawId); }
          continue;
        }
        if (rowNames.length !== 1) { invalid('关注通知缺失或重复可见用户名，已停止读取部分结果'); continue; }
        const name = rowNames[0];
        let canonical;
        let rowFailed = false;
        for (const notice of notices) {
          const type = get(notice, 'type');
          const rawId = id(get(notice, 'nid_str'));
          const seconds = serverSeconds(get(notice, 'create_time'));
          const follow = get(notice, 'follow');
          const user = get(follow, 'from_user');
          const senderId = decimalId(get(user, 'uid'));
          const rawSecUid = get(user, 'sec_uid');
          const secUid = typeof rawSecUid === 'string' && !/^\d+$/.test(rawSecUid) ? id(rawSecUid) : '';
          const senderName = text(get(user, 'remark_name')) || text(get(user, 'nickname'));
          if (!object(follow) || !object(user) || !rawId || !senderId || !secUid || !senderName || senderId === result.selfId || seconds === null) {
            invalid('关注通知缺少可验证的事件编号、用户或服务器原始时间'); rowFailed = true; continue;
          }
          const anchor = closest(name, 'a[href]');
          let linkedSecUid = '';
          try {
            const url = new URL(attribute(anchor, 'href'), 'https://www.douyin.com');
            const match = /^\/user\/([^/]+)\/?$/.exec(url.pathname);
            if (url.origin === 'https://www.douyin.com' && !url.username && !url.password && match) linkedSecUid = decodeURIComponent(match[1]);
          } catch { /* A malformed or foreign link cannot verify a peer. */ }
          if (!loaded(anchor) || !query(row, 'a[href]').includes(anchor) || linkedSecUid !== secUid || text(name.textContent) !== senderName) {
            invalid('通知中的用户身份或昵称未与可见个人页链接对应'); rowFailed = true; continue;
          }
          let relation = get(user, 'follower_status');
          if (type === 33) {
            if (![0, 1, 2].includes(relation)) { invalid('无法确认关注者当前的入站粉丝关系'); rowFailed = true; continue; }
            for (const store of stores) {
              const mapEntry = get(get(store, 'followStatusMap'), senderId);
              if (mapEntry !== undefined && !object(mapEntry)) { invalid('关注关系覆盖状态结构异常'); rowFailed = true; continue; }
              const override = get(mapEntry, '2');
              if (override === undefined || override === null) continue;
              if (![0, 1, 2].includes(override) || override !== relation) { invalid('原始通知与页面当前粉丝关系冲突'); rowFailed = true; continue; }
              relation = override;
            }
          }
          const value = { type, rawId, seconds, senderId, secUid, senderName, relation: type === 33 ? relation : null };
          if (canonical && JSON.stringify(canonical) !== JSON.stringify(value)) { invalid('同一通知行对应多个不同事件或用户'); rowFailed = true; continue; }
          canonical = value;
        }
        if (rowFailed || !canonical) continue;
        if (seenIds.has(canonical.rawId)) { invalid('当前页面出现重复的关注通知编号'); continue; }
        seenIds.add(canonical.rawId);
        if (canonical.relation === 0) { result.ignoredRows++; continue; }
        const externalId = `follow:notification:${encodeURIComponent(canonical.rawId)}`;
        messages.set(externalId, {
          externalId, threadId: `follower:${canonical.senderId}`, senderId: canonical.senderId, senderName: canonical.senderName,
          // This sec_uid was matched to this row's visible official profile
          // anchor above. Drop navigation query/hash data; UID is not a route.
          profileUrl: `https://www.douyin.com/user/${encodeURIComponent(canonical.secUid)}`,
          text: '', receivedAt: new Date(canonical.seconds * 1000).toISOString(), isOwn: false, isGroup: false,
          externalIdSource: 'platform-event-id',
        });
      }
      if (Array.from(seenIds).some(rawId => ignoredIds.has(rawId))) invalid('关注与非关注通知复用了同一事件编号');
      if (result.invalidRows) throw new Error(Array.from(failures).join('；'));
      if (!messages.size) {
        // An authenticated, fully loaded, classified nonempty list can be
        // idle. This flag never establishes/replaces the caller's baseline.
        result.ok = result.ready = true;
        result.noFollowEvents = true;
        result.detail = '通知已加载，当前没有仍在关注你的新关注事件；保留原基线等待新事件';
        return result;
      }
      result.messages = Array.from(messages.values());
      result.followers = Array.from(new Set(result.messages.map(message => message.senderId)));
      result.ok = result.ready = true;
      result.detail = `已读取 ${result.messages.length} 条抖音关注通知候选，仅含当前已呈现内容；尚需真实关注样本校准`;
      return result;
    } catch (error) {
      result.ok = result.ready = false;
      result.messages = [];
      result.followers = [];
      result.detail = error instanceof Error ? error.message : '抖音关注通知结构发生变化，读取已停止';
      return result;
    }
  }
  try {
    if (location.protocol !== 'https:' || location.hostname !== 'www.xiaohongshu.com' || !/^\/notification\/?$/.test(location.pathname)) {
      throw new Error('请打开小红书官方网页版通知页面的“新增关注”标签');
    }
    const identities = new Set();
    for (const anchor of query(document, 'a[href]')) {
      if (!loaded(anchor) || !closest(anchor, '.user.side-bar-component, .bottom-menu-component')) continue;
      if (text(anchor.textContent) !== '我' && attribute(anchor, 'title') !== '我') continue;
      const uid = profileId(anchor);
      if (uid) identities.add(uid);
    }
    if (identities.size !== 1) throw new Error('无法唯一确认当前登录的小红书账号，请登录后重新检查');
    result.identity = result.selfId = Array.from(identities)[0];

    const selector = '.notification-page .tabs-content-container .container';
    const rows = query(document, selector).filter(loaded);
    if (rows.length > 1000) throw new Error('当前已加载的通知超过读取范围，请减少加载范围后重新检查');
    const rowSet = new Set(rows);
    const candidates = new Map();
    const root = document.getElementById('app');
    const app = get(root, '__vue_app__');
    const stack = [], queued = new Set();
    let edges = 0;
    const enqueue = node => {
      // A rendered Vue node has many absent and repeated links. Count only
      // distinct objects against the component budget, with a separate bound
      // on link attempts so a huge duplicate array cannot monopolize a scan.
      if (++edges > 200000) throw new Error('页面组件引用数量超出读取范围，已停止读取关注通知');
      if (node === null || typeof node !== 'object' || queued.has(node)) return;
      if (queued.size >= 25000) throw new Error('页面组件数量超出读取范围，已停止读取关注通知');
      queued.add(node); stack.push(node);
    };
    enqueue(get(root, '_vnode')); enqueue(get(get(app, '_container'), '_vnode')); enqueue(get(get(app, '_instance'), 'subTree'));
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) { for (const child of node) enqueue(child); continue; }
      const component = get(node, 'component');
      const name = get(get(component, 'type'), '__name') || get(get(node, 'type'), '__name');
      const element = get(node, 'el');
      if (name === 'Connections' && loaded(element)) {
        const row = closest(element, selector);
        if (rowSet.has(row)) {
          if (!candidates.has(row)) candidates.set(row, []);
          for (const props of [get(component, 'props'), get(node, 'props')]) {
            if (object(props)) candidates.get(row).push(props);
          }
        }
      }
      // Traverse render-tree links only, never Pinia state, clients or handlers.
      enqueue(get(component, 'subTree')); enqueue(get(node, 'subTree')); enqueue(get(node, 'children'));
      enqueue(get(node, 'ssContent')); enqueue(get(get(node, 'suspense'), 'activeBranch'));
    }

    const failures = new Set();
    const invalid = reason => { result.invalidRows++; failures.add(reason); };
    const messages = new Map();
    result.ignoredRows = 0;
    for (const row of rows) {
      const entries = candidates.get(row);
      // This also rejects another notification tab instead of silently
      // establishing an empty baseline from comments, likes or unloaded rows.
      if (!entries?.length) { invalid('通知行缺少可核对的新增关注组件'); continue; }
      const validated = new Map();
      const processed = new Set();
      let nonFollow = false;
      for (const props of entries) {
        const data = get(props, 'data');
        // Vue component props are camelCase; the corresponding rendered VNode
        // carries the same documented prop under its template kebab-case key.
        const channel = get(get(props, 'jumpQuery') || get(props, 'jump-query'), 'channelTabId');
        if (!object(data) || channel !== 'connections') { invalid('当前通知标签或数据来源无法确认'); continue; }
        if (processed.has(data)) continue;
        processed.add(data);
        const type = get(data, 'trackType');
        if (typeof type !== 'string' || !type) { invalid('通知类型无法确认'); continue; }
        // The Connections tab also renders collected-album notices. It is not
        // itself a follow-event classifier; official FANS is exactly string 1.
        if (type === '5') { nonFollow = true; continue; }
        if (type !== '1') { invalid('新增关注分类中出现无法确认的通知类型'); continue; }
        const user = get(data, 'user');
        const senderId = id(get(user, 'userid'));
        const senderName = text(get(user, 'nickname'));
        const seconds = serverSeconds(get(data, 'time'));
        const rawValue = get(data, 'id');
        const rawId = id(rawValue);
        const status = get(user, 'fstatus');
        if (!senderId || senderId === result.selfId || !senderName || seconds === null) {
          invalid('关注通知缺少可验证的用户、昵称或服务器原始时间'); continue;
        }
        if (rawValue !== undefined && rawValue !== null && rawValue !== '' && !rawId) {
          invalid('关注通知编号无效，已停止读取'); continue;
        }
        const anchors = query(row, '.user-info a[href]').filter(loaded);
        const times = query(row, '.interaction-time').filter(loaded);
        if (anchors.length !== 1 || text(anchors[0].textContent) !== senderName || profileId(anchors[0]) !== senderId || times.length !== 1 || !text(times[0].textContent)) {
          invalid('关注通知中的用户或时间未与页面显示对应'); continue;
        }
        if (status === 'none' || status === 'follows') { nonFollow = true; continue; }
        if (status !== 'fans' && status !== 'both') { invalid('无法确认通知中的用户当前仍是粉丝'); continue; }
        const externalId = rawId ? `follow:notification:${encodeURIComponent(rawId)}` : `follow:time:${seconds}:user:${encodeURIComponent(senderId)}`;
        const message = {
          externalId, threadId: `follower:${senderId}`, senderId, senderName,
          // Only emitted after the same row's official profile path and user ID
          // agree. Do not retain tracking or other unvalidated query values.
          profileUrl: `https://www.xiaohongshu.com/user/profile/${encodeURIComponent(senderId)}`,
          text: '', receivedAt: new Date(seconds * 1000).toISOString(), isOwn: false, isGroup: false,
          externalIdSource: rawId ? 'platform-event-id' : 'follower-id-and-time',
        };
        const previous = validated.get(externalId);
        if (previous && JSON.stringify(previous) !== JSON.stringify(message)) { invalid('同一关注通知对应不同数据'); continue; }
        validated.set(externalId, message);
      }
      if (validated.size > 1 || (validated.size && nonFollow)) { invalid('同一通知行对应多个不同事件，无法确认关注者'); continue; }
      if (nonFollow && !validated.size) result.ignoredRows++;
      for (const [externalId, message] of validated) {
        if (messages.has(externalId)) { invalid('当前页面出现重复的关注事件编号'); continue; }
        messages.set(externalId, message);
      }
    }
    if (result.invalidRows) throw new Error(Array.from(failures).join('；'));
    if (!messages.size) {
      // A fully classified collection/ended-relation page is healthy idle.
      // It is not an empty baseline and cannot authorize a welcome by itself.
      if (rows.length && result.ignoredRows === rows.length) {
        result.ok = result.ready = true; result.noFollowEvents = true; result.renderPending = false;
        result.detail = '关注通知已核对，当前仅有非关注或已取消关注的通知；保留原粉丝基线，继续等待新关注';
        return result;
      }
      throw new Error('关注列表正在加载或为空；请稍后再检查，空列表不会建立基线');
    }
    result.messages = Array.from(messages.values());
    result.followers = Array.from(new Set(result.messages.map(message => message.senderId)));
    result.ok = result.ready = true;
    result.detail = `已读取 ${result.messages.length} 条新关注通知候选，仅含当前已加载内容；适配器尚未经真实关注样本校准`;
    return result;
  } catch (error) {
    result.ok = result.ready = false;
    result.messages = [];
    result.followers = [];
    result.detail = error instanceof Error ? error.message : '关注通知结构发生变化，读取已停止';
    return result;
  }
}

module.exports = { readFollowState };
