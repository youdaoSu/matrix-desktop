'use strict';

// Original MIT-licensed reader for comments already loaded in official pages.
// Kept self-contained for main-world injection. It reads only rendered DOM and
// the narrow component props below; it never calls a SDK or sends a request.
function readCommentState(platform) {
  const result = {
    ok: false, ready: false, platform, identity: '', selfId: '', threadId: '',
    messages: [], threads: [], receipts: [], invalidRows: 0,
    scope: 'loaded-comments', detail: '',
  };
  const pending = (detail, stage) => {
    result.renderPending = true;
    result.renderStage = stage;
    throw new Error(detail);
  };
  const get = (value, key) => { try { return value?.[key]; } catch { return undefined; } };
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const id = value => {
    if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : '';
    if (typeof value === 'bigint') return value > 0n ? String(value) : '';
    // Creator pages sometimes use opaque, encoded IDs rather than decimal IDs.
    // Keep their exact value; never coerce an unsafe numeric ID or read a token.
    return typeof value === 'string' && value.trim() && value.length <= 1000 && !/[\u0000-\u001f\u007f]/.test(value) ? value : '';
  };
  const text = value => typeof value === 'string' ? value.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').trim() : '';
  const timestamp = value => {
    if (typeof value !== 'number' && !(typeof value === 'string' && /^\d{9,13}$/.test(value))) return '';
    const raw = Number(value);
    if (!Number.isSafeInteger(raw)) return '';
    const milliseconds = raw < 100000000000 ? raw * 1000 : raw;
    if (milliseconds < 946684800000 || milliseconds > 4102444800000) return '';
    return new Date(milliseconds).toISOString();
  };
  const douyinCommentProfile = (user, senderId, uidField) => {
    // A decimal IM user ID is not a homepage ID. A homepage is optional
    // evidence from this exact verified comment user, never a guessed URL.
    if (typeof senderId !== 'string' || !/^[1-9]\d{0,63}$/.test(senderId) || get(user, uidField) !== senderId) return '';
    const secUid = get(user, 'sec_uid');
    if (typeof secUid !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(secUid) || /^\d+$/.test(secUid) || /^self$/i.test(secUid)) return '';
    return `https://www.douyin.com/user/${secUid}`;
  };
  const loaded = element => {
    try {
      if (!element || element.nodeType !== 1 || !element.isConnected || !element.getClientRects().length) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    } catch { return false; }
  };
  const imageUrl = value => {
    if (typeof value !== 'string' || !value || value.length > 4000) return '';
    try {
      const url = new URL(value, location.href);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  };
  const emojiMap = list => {
    const map = new Map();
    if (!Array.isArray(list) || list.length > 2000) return map;
    for (const emoji of list) {
      const name = text(get(emoji, 'name'));
      const url = imageUrl(get(emoji, 'img'));
      if (!name || name.length > 100 || /[\[\]\u0000-\u001f\u007f]/.test(name) || !url) continue;
      const token = `[${name}]`;
      // Ambiguous image-to-name mappings cannot establish the displayed text.
      map.set(url, map.has(url) && map.get(url) !== token ? null : token);
    }
    return map;
  };
  const displayedText = (element, emojiNames, ignoredElement = null) => {
    const walk = node => {
      if (node === ignoredElement) return '';
      if (node.nodeType === 3) return node.nodeValue || '';
      if (node.nodeType !== 1) return '';
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return '';
      if (node.tagName === 'BR') return '\n';
      if (node.tagName === 'IMG') {
        const alt = node.getAttribute('alt');
        if (alt) return alt;
        const token = emojiNames?.get(imageUrl(node.getAttribute('src')));
        if (typeof token === 'string' && token) return token;
        throw new Error('图片没有可验证的文字或表情映射');
      }
      return Array.from(node.childNodes).map(walk).join('');
    };
    try { return text(walk(element)); } catch { return ''; }
  };
  const component = (element, row) => {
    const found = { item: null, video: null, emojiList: null, identities: new Set(), profileUrl: '' };
    const paths = [];
    for (const start of [element, row]) {
      const keys = Object.getOwnPropertyNames(start).filter(name => name.startsWith('__reactFiber$'));
      if (keys.length > 1) throw new Error('评论节点存在多个组件路径，无法唯一核对');
      const key = keys[0];
      let fiber = key && get(start, key);
      const seen = new Set();
      const path = { item: null, video: null, emojiList: null, identities: new Set() };
      for (let depth = 0; object(fiber) && depth < 100 && !seen.has(fiber); depth++, fiber = get(fiber, 'return')) {
        seen.add(fiber);
        const props = get(fiber, 'memoizedProps');
        if (!object(props)) continue;
        const item = get(props, 'item');
        const video = get(props, 'video');
        if (!path.item && object(item) && get(item, 'comment_id') !== undefined) path.item = item;
        if (!path.video && object(video)) path.video = video;
        if (!path.emojiList && Array.isArray(get(props, 'emojiList'))) path.emojiList = get(props, 'emojiList');
        // The observed parent exposes exactly { video, emojiList, uid }.
        // Do not walk stores, SDK clients, authorization data, or unrelated props.
        if (object(video)) {
          const uid = id(get(props, 'uid'));
          if (uid) path.identities.add(uid);
        }
      }
      if (object(fiber)) throw new Error('评论组件路径循环或超出读取范围，已停止核对');
      paths.push(path);
    }
    // A nested reply's text and its enclosing parent row can expose different
    // nearest items. Never combine one path's author flag with another row's
    // identity or video merely because their displayed text happens to match.
    const itemKey = item => JSON.stringify([
      id(get(item, 'comment_id')), id(get(get(item, 'user_info'), 'user_id')),
      text(get(get(item, 'user_info'), 'screen_name')), text(get(item, 'text')),
      timestamp(get(item, 'create_time')), get(item, 'is_author'),
    ]);
    const videoKey = video => JSON.stringify([id(get(video, 'item_id_plain')), id(get(video, 'item_id')), id(get(video, 'anchor_user_id'))]);
    const items = paths.map(path => path.item).filter(Boolean);
    const videos = paths.map(path => path.video).filter(Boolean);
    if (new Set(items.map(itemKey)).size > 1) throw new Error('评论正文与行组件指向不同评论或作者，已停止读取');
    if (new Set(videos.map(videoKey)).size > 1) throw new Error('评论正文与行组件的作品归属不一致，已停止读取');
    const profiles = paths.map(path => {
      const user = get(path.item, 'user_info');
      return douyinCommentProfile(user, id(get(user, 'user_id')), 'user_id');
    });
    if (profiles.length === 2 && profiles[0] && profiles[0] === profiles[1]) found.profileUrl = profiles[0];
    for (const path of paths) {
      if (!found.item && path.item) found.item = path.item;
      if (!found.video && path.video) found.video = path.video;
      if (!found.emojiList && path.emojiList) found.emojiList = path.emojiList;
      for (const uid of path.identities) found.identities.add(uid);
    }
    return found;
  };
  const hasOwnAuthorBadge = row => {
    // The creator page renders the role badge separately from the author's
    // name in its h4 heading. Comment text or a nested reply cannot supply it.
    const rowSelector = 'div[class*="cmt-item-"]';
    try {
      const badges = new Set();
      for (const heading of row.querySelectorAll('h4')) {
        if (!loaded(heading) || heading.closest(rowSelector) !== row || heading.closest('pre')) continue;
        for (const badge of heading.querySelectorAll('span')) {
          if (loaded(badge) && badge.textContent === '作者' && badge.closest('h4') === heading && badge.closest(rowSelector) === row && !badge.closest('pre')) badges.add(badge);
        }
      }
      return badges.size === 1;
    } catch { return false; }
  };
  const authorBadgeEvidence = row => {
    const evidence = { headingCount: 0, authorTags: [], crossesNestedRow: false };
    try {
      const rowSelector = 'div[class*="cmt-item-"]';
      const tags = new Set();
      for (const heading of row.querySelectorAll('h4')) {
        if (!loaded(heading)) continue;
        const sameRow = heading.closest(rowSelector) === row;
        if (sameRow) evidence.headingCount++;
        for (const element of heading.querySelectorAll('*')) {
          if (!loaded(element) || element.textContent !== '作者') continue;
          const nested = !sameRow || element.closest(rowSelector) !== row;
          if (nested) evidence.crossesNestedRow = true;
          else if (tags.size < 6 && typeof element.tagName === 'string' && /^[A-Z][A-Z0-9-]{0,29}$/.test(element.tagName)) tags.add(element.tagName);
        }
      }
      evidence.authorTags = Array.from(tags);
    } catch { /* Diagnostic shape never relaxes the author-badge check. */ }
    return evidence;
  };
  const readRedesignedDouyin = main => {
    result.layout = 'douyin-comment-redesign';
    const decimal = value => typeof value === 'string' && /^[1-9]\d{0,63}$/.test(value) ? value : '';
    const fiberOf = element => {
      const keys = Object.getOwnPropertyNames(element).filter(key => key.startsWith('__reactFiber$'));
      if (keys.length !== 1) throw new Error('新版评论节点组件路径缺失或不唯一');
      return get(element, keys[0]);
    };
    const workKey = work => JSON.stringify([id(get(work, 'item_id_plain')), id(get(work, 'item_id')), id(get(work, 'anchor_user_id')), text(get(work, 'title'))]);
    const workCopies = [], logins = new Set();
    let scopeFound = false, mainFiber = fiberOf(main);
    const mainSeen = new Set();
    // Only the nearest main component's observed hook context and currentItem
    // snapshots are read. Never enumerate a store or invoke a hook/handler.
    for (let depth = 0; object(mainFiber) && depth < 4; depth++, mainFiber = get(mainFiber, 'return')) {
      if (mainSeen.has(mainFiber)) throw new Error('新版评论页面组件路径循环');
      mainSeen.add(mainFiber);
      let hook = get(mainFiber, 'memoizedState');
      const hookSeen = new Set();
      let count = 0, contextSeen = false;
      for (; object(hook) && count < 64; count++, hook = get(hook, 'next')) {
        if (hookSeen.has(hook)) throw new Error('新版评论页面状态路径循环');
        hookSeen.add(hook);
        const state = get(hook, 'memoizedState');
        if (object(state)) {
          const userInfo = get(state, 'userInfo'), fastUserInfo = get(state, 'fastUserInfo');
          if (object(userInfo) || object(fastUserInfo)) {
            contextSeen = true;
            const uid = decimal(get(userInfo, 'uid')), fastUid = decimal(get(fastUserInfo, 'uid'));
            if (!uid || !fastUid) pending('新版评论页面登录身份正在加载', 'identity');
            if (uid !== fastUid) throw new Error('新版评论页面登录身份不一致');
            logins.add(uid);
          }
        }
        const current = object(state) ? get(state, 'current') : undefined;
        const tuple = Array.isArray(state) && state.length === 3 ? state : Array.isArray(current) && current.length === 3 ? current : null;
        const selected = tuple && get(tuple[0], 'currentItem');
        if (object(selected)) workCopies.push(selected);
      }
      if (object(hook)) throw new Error('新版评论页面状态超出读取范围');
      if (contextSeen) { scopeFound = true; break; }
    }
    if (!scopeFound || !logins.size) pending('新版评论页面登录身份正在加载', 'identity');
    if (logins.size !== 1) throw new Error('新版评论页面出现多个登录身份');
    const uid = [...logins][0]; result.identity = result.selfId = uid;
    if (!workCopies.length) pending('请在新版评论页面选择作品并等待加载', 'comments');
    if (new Set(workCopies.map(workKey)).size !== 1) throw new Error('新版评论页面当前作品状态不一致');
    const work = workCopies[0], videoId = decimal(get(work, 'item_id_plain')), author = decimal(get(work, 'anchor_user_id'));
    if (!videoId || !author || author !== uid) throw new Error('无法确认新版评论当前作品所属账号');
    result.threadId = videoId;
    const bodySelector = 'div[class*="comment-content-text-"]';
    const rowSelector = 'div[class*="container-"]';
    const elements = Array.from(main.querySelectorAll(bodySelector));
    if (elements.length > 1000) throw new Error('当前加载的新版评论过多，请减少加载范围后重新检查');
    const sourceCache = new WeakMap();
    const sourceMap = list => {
      if (!Array.isArray(list) || list.length > 1000) throw new Error('新版评论数据源缺失或超出读取范围');
      if (sourceCache.has(list)) return sourceCache.get(list);
      const map = new Map();
      const add = (raw, parentId = '') => {
        const cid = decimal(get(raw, 'cid'));
        if (!cid || map.has(cid) || map.size >= 1000) throw new Error('新版评论数据源编号缺失、重复或超出读取范围');
        map.set(cid, { raw, parentId });
      };
      for (const raw of list) {
        add(raw);
        const replies = get(raw, 'reply_list');
        if (replies !== undefined && replies !== null && !Array.isArray(replies)) throw new Error('新版评论回复数据源结构变化');
        if (Array.isArray(replies)) {
          if (replies.length > 1000) throw new Error('新版评论回复数据源超出读取范围');
          for (const reply of replies) add(reply, decimal(get(raw, 'cid')));
        }
      }
      sourceCache.set(list, map); return map;
    };
    const rowPath = element => {
      let fiber = fiberOf(element), props = null;
      const seen = new Set();
      for (let depth = 0; object(fiber) && depth < 32; depth++, fiber = get(fiber, 'return')) {
        if (seen.has(fiber)) throw new Error('新版评论行组件路径循环');
        seen.add(fiber);
        const next = get(fiber, 'memoizedProps');
        if (!object(next)) continue;
        if (!props && typeof get(next, 'id') === 'string' && typeof get(next, 'uid') === 'string' && typeof get(next, 'content') === 'string' &&
            typeof get(next, 'levelOneCid') === 'string' && typeof get(next, 'canReply') === 'boolean') props = next;
        const dataSource = get(get(next, 'value'), 'dataSource');
        if (dataSource !== undefined) {
          if (!props) throw new Error('新版评论行缺少可验证组件');
          return { props, source: sourceMap(dataSource) };
        }
      }
      throw new Error('新版评论行数据源路径缺失或超出读取范围');
    };
    const bool = value => typeof value === 'boolean' ? value : null;
    const propsKey = props => JSON.stringify([id(get(props, 'id')), id(get(props, 'uid')), text(get(props, 'content')), text(get(props, 'username')),
      text(get(props, 'publishTime')), id(get(props, 'levelOneCid')), bool(get(props, 'canReply')), bool(get(props, 'isAuthor')), text(get(props, 'replyToUserName'))]);
    const rawKey = entry => JSON.stringify([id(get(entry.raw, 'cid')), text(get(entry.raw, 'text')), id(get(entry.raw, 'aweme_id')), timestamp(get(entry.raw, 'create_time')),
      id(get(get(entry.raw, 'user'), 'uid')), text(get(get(entry.raw, 'user'), 'nickname')), id(get(entry.raw, 'reply_id')), id(get(entry.raw, 'reply_to_reply_id')),
      text(get(entry.raw, 'label_text')), typeof get(entry.raw, 'label_type') === 'number' ? get(entry.raw, 'label_type') : null,
      text(get(entry.raw, 'reply_to_username')), id(get(entry.raw, 'reply_to_userid')), entry.parentId]);
    const rows = [], seenRows = new Set(), messages = new Map(), receipts = new Map(), failures = new Set();
    const invalid = reason => { result.invalidRows++; failures.add(reason); };
    for (const element of elements) {
      // Start at the parent: the body's own class also contains "content-".
      const content = element.parentElement?.closest('div[class*="content-"]');
      const row = content?.parentElement?.closest(rowSelector);
      if (!content || !row || element.closest(rowSelector) !== row || row.closest('main.creator-comment-redesign') !== main || seenRows.has(row)) {
        invalid('新版评论正文与所属行不唯一'); continue;
      }
      seenRows.add(row); rows.push({ element, row, domIndex: rows.length });
    }
    for (const { element, row, domIndex } of rows) {
      if (!loaded(main) || !loaded(row) || !loaded(element)) continue;
      try {
        const body = rowPath(element), line = rowPath(row);
        if (propsKey(body.props) !== propsKey(line.props)) throw new Error('新版评论正文与行组件指向不同评论或作者');
        const props = body.props, cid = decimal(get(props, 'id')), senderId = decimal(get(props, 'uid'));
        const first = body.source.get(cid), second = line.source.get(cid);
        if (!first || !second || rawKey(first) !== rawKey(second)) throw new Error('新版评论正文与行数据源不一致');
        const raw = first.raw, user = get(raw, 'user'), senderName = text(get(props, 'username')), content = text(get(props, 'content'));
        const receivedAt = timestamp(get(raw, 'create_time'));
        if (!cid || !senderId || senderId !== decimal(get(user, 'uid')) || !senderName || senderName !== text(get(user, 'nickname')) ||
            !content || content !== text(get(raw, 'text')) || !receivedAt || decimal(get(raw, 'aweme_id')) !== videoId) throw new Error('新版评论编号、作者、作品、正文或原始时间未通过核对');
        if (typeof get(props, 'canReply') !== 'boolean') throw new Error('新版评论回复权限尚未确认');
        const parentId = first.parentId, replyId = get(raw, 'reply_id'), replyToId = get(raw, 'reply_to_reply_id');
        if (parentId ? replyId !== parentId || get(props, 'levelOneCid') !== parentId || (replyToId !== '0' && !decimal(replyToId))
          : replyId !== '0' || replyToId !== '0' || get(props, 'levelOneCid') !== cid) throw new Error('新版评论父子回复关系不一致');
        const target = parentId && replyToId !== '0' ? body.source.get(replyToId) : null;
        if (parentId && (replyToId === cid || (target && replyToId !== parentId && target.parentId !== parentId))) throw new Error('新版评论直接回复对象与所属评论不一致');
        const classToken = (node, prefix) => typeof node?.getAttribute === 'function' && (node.getAttribute('class') || '').split(/\s+/).some(token => token.startsWith(prefix));
        const directNodes = Array.from(element.childNodes);
        const prefixes = directNodes.filter(node => node.nodeType === 1 && node.tagName === 'SPAN' && classToken(node, 'reply-to-'));
        let replyPrefix = null;
        if (prefixes.length) {
          // Only the observed structural annotation is excluded. The real
          // content, even when it starts with "回复…:", is never sliced.
          const prefix = prefixes[0], parts = Array.from(prefix.childNodes), targetUser = get(target?.raw, 'user');
          const name = text(get(props, 'replyToUserName')), targetName = text(get(targetUser, 'nickname')), targetUid = decimal(get(targetUser, 'uid'));
          const before = directNodes.slice(0, directNodes.indexOf(prefix));
          if (prefixes.length !== 1 || !parentId || replyToId === '0' || !target || !name || name !== targetName || !targetUid ||
              decimal(get(target.raw, 'aweme_id')) !== videoId || text(get(raw, 'reply_to_username')) !== name || decimal(get(raw, 'reply_to_userid')) !== targetUid ||
              before.some(node => node.nodeType !== 3 || text(node.nodeValue)) || !loaded(prefix) || parts.length !== 3 ||
              parts[0].nodeType !== 3 || parts[0].nodeValue !== '回复' || parts[2].nodeType !== 3 || parts[2].nodeValue !== ':' ||
              parts[1].nodeType !== 1 || parts[1].tagName !== 'SPAN' || !classToken(parts[1], 'name-') || !loaded(parts[1]) ||
              Array.from(parts[1].childNodes).some(node => node.nodeType !== 3) || text(parts[1].textContent) !== name) throw new Error('新版评论回复对象前缀未与原始接收人对应');
          replyPrefix = prefix;
        }
        if (content !== displayedText(element, undefined, replyPrefix)) throw new Error('新版评论正文与页面显示不一致或暂不支持该内容');
        const isOwn = senderId === uid, isAuthor = get(props, 'isAuthor'), rawAuthor = get(raw, 'label_text') === '作者';
        if ((isAuthor !== undefined && typeof isAuthor !== 'boolean') || (typeof isAuthor === 'boolean' && isAuthor !== isOwn) || (rawAuthor && !isOwn) ||
            (isOwn && (isAuthor !== true || !rawAuthor || get(raw, 'label_type') !== 1))) throw new Error('新版评论作者身份与页面角色不一致');
        const externalId = `${videoId}:${cid}`;
        if (messages.has(externalId)) throw new Error('新版评论页面出现重复评论编号');
        const bodyProfile = douyinCommentProfile(user, senderId, 'uid');
        const lineProfile = douyinCommentProfile(get(second.raw, 'user'), senderId, 'uid');
        const profileUrl = !isOwn && bodyProfile && bodyProfile === lineProfile ? bodyProfile : '';
        messages.set(externalId, { externalId, threadId: videoId, senderId, senderName, text: content, receivedAt, isOwn,
          isGroup: false, domIndex, canReply: get(props, 'canReply'), replyTo: cid, levelOneCid: get(props, 'levelOneCid'), ...(parentId ? { parentCommentId: parentId } : {}), ...(profileUrl ? { profileUrl } : {}) });
        if (isOwn && parentId) {
          const receiptTarget = replyToId === '0' ? parentId : replyToId;
          receipts.set(externalId, { id: externalId, text: content, replyTo: receiptTarget, receivedAt });
        }
      } catch (error) { invalid(error.message); }
    }
    if (result.invalidRows) throw new Error(Array.from(failures).join('；'));
    if (!messages.size) pending('新版评论列表正在加载或当前作品没有可验证的已加载评论', 'comments');
    result.messages = [...messages.values()]; result.receipts = [...receipts.values()];
    result.threads = [{ id: videoId, domIndex: result.messages[0].domIndex }];
    result.ok = result.ready = true;
    result.detail = `已验证新版评论页面中 ${result.messages.length} 条已加载评论；仅监听当前作品已加载内容`;
    return result;
  };
  try {
    if (platform === 'xiaohongshu') {
      if (location.protocol !== 'https:' || location.hostname !== 'www.xiaohongshu.com' || !/^\/notification\/?$/.test(location.pathname)) {
        throw new Error('请打开小红书官方网页版通知页面');
      }
      const identities = new Set();
      for (const anchor of document.querySelectorAll('a[href^="/user/profile/"]')) {
        if (!loaded(anchor) || text(anchor.textContent) !== '我') continue;
        const href = anchor.getAttribute('href') || '';
        const match = /^\/user\/profile\/([^/?#]+)(?:[/?#]|$)/.exec(href);
        const uid = match && id(match[1]);
        if (uid) identities.add(uid);
      }
      if (identities.size === 0) pending('无法唯一确认当前登录的小红书账号，请登录后重新检查', 'identity');
      if (identities.size !== 1) throw new Error('无法唯一确认当前登录的小红书账号，请登录后重新检查');
      result.identity = result.selfId = Array.from(identities)[0];
      result.threadId = 'notifications';
      const containerSelector = '.notification-page .tabs-content-container .container';
      const elements = Array.from(document.querySelectorAll('.notification-page .interaction-content'));
      if (elements.length > 1000) throw new Error('当前加载的通知过多，请减少加载范围后重新检查');
      const candidates = new Map();
      const root = document.getElementById('app');
      const app = get(root, '__vue_app__');
      const stack = [get(root, '_vnode'), get(get(app, '_container'), '_vnode'), get(get(app, '_instance'), 'subTree')];
      const visited = new Set();
      let count = 0;
      while (stack.length && count++ < 25000) {
        const node = stack.pop();
        if (node === null || typeof node !== 'object' || visited.has(node)) continue;
        visited.add(node);
        if (Array.isArray(node)) { for (const child of node) stack.push(child); continue; }
        const component = get(node, 'component');
        const nodeElement = get(node, 'el');
        // Only associate props with their own rendered notification container.
        // Matching comment text alone would mix identical comments on two notes.
        let container = null;
        try { if (nodeElement?.nodeType === 1) container = nodeElement.closest(containerSelector); } catch {}
        if (container && loaded(container)) {
          for (const props of [get(node, 'props'), get(component, 'props')]) {
            const data = get(props, 'data');
            if (!object(data)) continue;
            if (!candidates.has(container)) candidates.set(container, new Set());
            candidates.get(container).add(data);
          }
        }
        // The traversal is limited to Vue render-tree links. No app stores,
        // network clients, cookies, request metadata, or note access tokens.
        stack.push(get(component, 'subTree'), get(node, 'subTree'), get(node, 'children'), get(node, 'ssContent'), get(get(node, 'suspense'), 'activeBranch'));
      }
      if (stack.length) throw new Error('页面组件数量超出读取范围，评论读取已停止');
      const messages = new Map();
      const failures = new Set();
      const invalid = reason => { result.invalidRows++; failures.add(reason); };
      for (const [domIndex, element] of elements.entries()) {
        if (!loaded(element)) continue;
        const container = element.closest(containerSelector);
        const entries = candidates.get(container);
        if (!container || !entries?.size) { invalid('通知内容缺少可核对的页面数据'); continue; }
        const comments = Array.from(entries).filter(data => get(data, 'type') === 'comment/item');
        // Likes, mentions and replies to someone else's note are not inbound
        // comments on this account's own notes and are never reply candidates.
        if (!comments.length) {
          if (Array.from(entries).some(data => typeof get(data, 'type') !== 'string')) invalid('通知类型无法确认');
          continue;
        }
        const validated = new Map();
        for (const data of comments) {
          const comment = get(data, 'commentInfo');
          const item = get(data, 'itemInfo');
          const user = get(data, 'userInfo');
          const authorId = id(get(get(item, 'userInfo'), 'userid'));
          // Missing note authorship fails closed. A proven other author's note
          // is simply outside the listening scope, including replies to us there.
          if (!authorId) { invalid('无法确认收到评论的笔记所属账号'); continue; }
          if (authorId !== result.identity) continue;
          const noteId = id(get(item, 'id'));
          const commentId = id(get(comment, 'id'));
          const senderId = id(get(user, 'userid'));
          const senderName = text(get(user, 'nickname'));
          const content = text(get(comment, 'content'));
          const receivedAt = timestamp(get(data, 'time'));
          if (!noteId || !commentId || !senderId || !senderName || !receivedAt) {
            invalid('评论缺少可验证的编号、作者或原始时间'); continue;
          }
          if (!content || content !== displayedText(element)) { invalid('评论内容与页面显示不一致或暂不支持该内容'); continue; }
          const externalId = `${noteId}:${commentId}`;
          const message = { externalId, threadId: 'notifications', senderId, senderName, text: content, receivedAt, isOwn: senderId === result.identity, isGroup: false, domIndex };
          const previous = validated.get(externalId);
          if (previous && JSON.stringify(previous) !== JSON.stringify(message)) { invalid('同一评论编号对应的页面数据不一致'); continue; }
          validated.set(externalId, message);
        }
        if (validated.size > 1) { invalid('同一通知行对应多个评论，无法确认回复对象'); continue; }
        for (const [externalId, message] of validated) {
          if (messages.has(externalId)) { invalid('页面出现重复评论编号'); continue; }
          messages.set(externalId, message);
        }
      }
      if (result.invalidRows) throw new Error(Array.from(failures).join('；'));
      if (!messages.size) pending('请先在通知页加载至少一条自己笔记收到的评论，再检查连接', 'comments');
      result.messages = Array.from(messages.values());
      result.threads = [{ id: 'notifications', domIndex: result.messages[0].domIndex }];
      // No verified platform reply object is currently exposed on this page.
      // Empty receipts deliberately leave send outcomes for manual verification.
      result.receipts = [];
      result.ok = result.ready = true;
      result.detail = `已验证通知页中 ${result.messages.length} 条自己笔记收到的评论；仅监听当前已加载内容`;
      return result;
    }
    if (platform !== 'douyin') throw new Error('该平台尚未提供评论接入');
    if (location.protocol !== 'https:' || location.hostname !== 'creator.douyin.com' || !/^\/creator-micro\/(?:data\/following|interactive)\/comment\/?$/.test(location.pathname)) {
      throw new Error('请打开抖音创作者中心的评论管理页面');
    }
    const redesigned = Array.from(document.querySelectorAll('main.creator-comment-redesign'));
    if (redesigned.length > 1) throw new Error('新版评论页面范围不唯一');
    if (redesigned.length === 1) return readRedesignedDouyin(redesigned[0]);
    const elements = Array.from(document.querySelectorAll('pre[class*="cmt-text-"]'));
    if (elements.length > 1000) throw new Error('当前加载的评论过多，请减少加载范围后重新检查');
    const rows = [];
    const seenRows = new Set();
    for (const element of elements) {
      const row = element.closest('div[class*="cmt-item-"]');
      if (!row || seenRows.has(row)) continue;
      seenRows.add(row);
      // domIndex counts all matching rows, including any currently hidden rows.
      rows.push({ element, row, domIndex: rows.length });
    }
    const identities = new Set();
    const videos = new Set();
    const messages = new Map();
    const receipts = new Map();
    const failures = new Set();
    const invalid = reason => { result.invalidRows++; failures.add(reason); };
    const ownReplies = [];
    const otherReplies = [];
    const authorAliases = new Set();
    for (const { element, row, domIndex } of rows) {
      if (!loaded(row) || !loaded(element)) continue;
      let found;
      try { found = component(element, row); }
      catch (error) { invalid(error.message); continue; }
      const item = found.item;
      const video = found.video;
      const rawCommentId = id(get(item, 'comment_id'));
      const plainVideoId = id(get(video, 'item_id_plain'));
      const videoId = plainVideoId || id(get(video, 'item_id'));
      const author = id(get(video, 'anchor_user_id'));
      const uid = found.identities.size === 1 ? Array.from(found.identities)[0] : '';
      const user = get(item, 'user_info');
      const senderId = id(get(user, 'user_id'));
      const senderName = text(get(user, 'screen_name'));
      const content = text(get(item, 'text'));
      const receivedAt = timestamp(get(item, 'create_time'));
      const isOwn = get(item, 'is_author');
      if (!uid || !author || author !== uid) { invalid('无法确认当前作品所属账号'); continue; }
      if (!rawCommentId || !videoId || !senderId || !senderName || !receivedAt || typeof isOwn !== 'boolean') {
        invalid('评论缺少可验证的编号、作者或原始时间'); continue;
      }
      const renderedOpaqueAuthor = isOwn === true && /^\d+$/.test(uid) && !/^\d+$/.test(senderId) && hasOwnAuthorBadge(row);
      if (renderedOpaqueAuthor) authorAliases.add(senderId);
      if ((senderId === uid) !== isOwn && !renderedOpaqueAuthor) {
        const shape = value => ({ type: /^\d+$/.test(value) ? 'decimal' : 'opaque', length: value.length });
        const diagnostic = { isAuthor: isOwn, sender: shape(senderId), uid: shape(uid), anchor: shape(author),
          senderEqualsUid: senderId === uid, senderEqualsAnchor: senderId === author, uidEqualsAnchor: uid === author, authorBadge: authorBadgeEvidence(row) };
        // Diagnostics deliberately contain no raw platform IDs, text, names,
        // URLs or component objects. Keep the visible error and payload bounded.
        if (!result.identityDiagnostics) result.identityDiagnostics = [];
        if (result.identityDiagnostics.length < 5) result.identityDiagnostics.push(diagnostic);
        const suffix = result.identityDiagnostics.length === 1
          ? `（is_author=${isOwn}; sender=${diagnostic.sender.type}:${diagnostic.sender.length}; uid=${diagnostic.uid.type}:${diagnostic.uid.length}; anchor=${diagnostic.anchor.type}:${diagnostic.anchor.length}; sender=uid:${diagnostic.senderEqualsUid}; sender=anchor:${diagnostic.senderEqualsAnchor}; uid=anchor:${diagnostic.uidEqualsAnchor}; authorBadge=h4:${diagnostic.authorBadge.headingCount},tags:${diagnostic.authorBadge.authorTags.join('/') || 'none'},nested:${diagnostic.authorBadge.crossesNestedRow}）` : '';
        invalid(`评论作者身份与页面标记不一致${suffix}`); continue;
      }
      if (!content || content !== displayedText(element, emojiMap(found.emojiList))) { invalid('评论内容与页面显示不一致或暂不支持该内容'); continue; }
      identities.add(uid);
      videos.add(videoId);
      const externalId = `${videoId}:${rawCommentId}`;
      if (messages.has(externalId)) { invalid('页面出现重复评论编号'); continue; }
      messages.set(externalId, { externalId, threadId: videoId, senderId, senderName, text: content, receivedAt, isOwn, isGroup: false, domIndex,
        ...(!isOwn && found.profileUrl ? { profileUrl: found.profileUrl } : {}) });
      // The sender compares receipt IDs before and after an attempted send.
      // Reading an existing own reply here does not claim that a new send worked.
      for (const field of ['reply_list', 'reply_more_list']) {
        const list = get(item, field);
        if (list !== undefined && list !== null && !Array.isArray(list)) { invalid('评论回复列表结构发生变化'); continue; }
        if (!Array.isArray(list)) continue;
        if (list.length > 1000) { invalid('评论回复列表超出可验证范围'); continue; }
        for (const reply of list) {
          if (get(reply, 'is_author') !== true) { otherReplies.push(reply); continue; }
          ownReplies.push({ reply, videoId, parentId: rawCommentId, uid });
        }
      }
    }
    if (authorAliases.size > 1) invalid('同一作品出现多个不同的作者身份标记，已停止读取');
    // Aliases are local to this rendered work and retain their original value.
    // A role conflict must fail regardless of which row was traversed first.
    for (const message of messages.values()) if (!message.isOwn && authorAliases.has(message.senderId)) invalid('同一评论用户同时被标记为作者与非作者，已停止读取');
    for (const reply of otherReplies) {
      const senderId = id(get(get(reply, 'user_info'), 'user_id'));
      if (get(reply, 'is_author') === false && (identities.has(senderId) || authorAliases.has(senderId))) invalid('回复作者身份与页面标记不一致，无法核对回执');
    }
    if (result.invalidRows) throw new Error(Array.from(failures).join('；'));
    if (!messages.size) pending('请先选择一条作品并加载评论；当前没有可验证的已加载评论', 'comments');
    if (identities.size !== 1 || videos.size !== 1) throw new Error('无法唯一确认当前账号或所选作品，评论读取已停止');
    result.identity = result.selfId = Array.from(identities)[0];
    result.threadId = Array.from(videos)[0];
    for (const { reply, videoId, parentId, uid } of ownReplies) {
      const replyId = id(get(reply, 'comment_id'));
      const senderId = id(get(get(reply, 'user_info'), 'user_id'));
      const content = text(get(reply, 'text'));
      const receivedAt = timestamp(get(reply, 'create_time'));
      if (!replyId || replyId === parentId || (senderId !== uid && !authorAliases.has(senderId)) || !content || !receivedAt) {
        invalid('本人回复缺少独立编号、作者或原始时间，无法核对回执'); continue;
      }
      const receiptId = `${videoId}:${replyId}`;
      const receipt = { id: receiptId, text: content, replyTo: parentId, receivedAt, senderId };
      const old = receipts.get(receiptId);
      if (old && (old.text !== receipt.text || old.replyTo !== receipt.replyTo || old.senderId !== receipt.senderId || old.receivedAt !== receipt.receivedAt)) {
        invalid('同一回复编号对应了不同评论'); continue;
      }
      receipts.set(receiptId, receipt);
    }
    if (result.invalidRows) throw new Error(Array.from(failures).join('；'));
    result.messages = Array.from(messages.values());
    result.threads = [{ id: result.threadId, domIndex: result.messages[0].domIndex }];
    result.receipts = Array.from(receipts.values(), ({ senderId, ...receipt }) => receipt);
    result.ok = result.ready = true;
    result.detail = `已验证所选作品中 ${result.messages.length} 条已加载评论；仅监听当前已加载内容`;
    return result;
  } catch (error) {
    result.ok = result.ready = false;
    result.messages = [];
    result.threads = [];
    result.receipts = [];
    result.detail = error instanceof Error ? error.message : '评论页面结构发生变化，读取已停止';
    return result;
  }
}

module.exports = { readCommentState };
