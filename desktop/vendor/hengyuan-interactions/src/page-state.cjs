'use strict';

// Independently written reader for the official pages' already rendered state.
// This function is self-contained so its source can run in the page's main world.
// It does not call the platform SDK, fetch history, alter the DOM, or send messages.
function readPageState(platform, scope) {
  const result = {
    ok: false, ready: false, platform, identity: '', selfId: '', threadId: '',
    messages: [], threads: [], threadDetails: [], receipts: [], deliveryFailures: [], outgoingClientIds: [], invalidRows: 0, invalidReasons: {}, pendingRows: 0, localFailedRows: 0, recalledRows: 0,
    scope: 'rendered-text-messages', detail: '',
  };
  // The legacy string grants only a URL scope. A helper-frozen context can
  // additionally verify a new profile chat before it exists in the history list.
  const profileContext = scope && ['profileUrl', 'recipientId', 'identity', 'homeEntryUrl'].some(key => Object.prototype.hasOwnProperty.call(scope, key)) ? scope : null;
  const profileUrl = profileContext ? profileContext.profileUrl : scope?.welcomeProfileUrl;
  const homeEntry = !!profileContext && Object.prototype.hasOwnProperty.call(profileContext, 'homeEntryUrl');
  let scopedProfile = false;
  if (profileContext || profileUrl !== undefined) {
    try {
      const expected = new URL(profileUrl);
      const pageUrl = homeEntry ? `https://www.douyin.com/jingxuan?imToSecUid=${expected.pathname.slice('/user/'.length)}` : profileUrl;
      scopedProfile = platform === 'douyin' && typeof profileUrl === 'string' &&
        expected.href === profileUrl && expected.origin === 'https://www.douyin.com' &&
        !expected.username && !expected.password && !expected.port && !expected.search && !expected.hash &&
        /^\/user\/(?!\d+$)[A-Za-z0-9_-]{1,256}$/.test(expected.pathname) &&
        (!homeEntry || profileContext.homeEntryUrl === pageUrl) && location.href === pageUrl;
    } catch { /* An invalid scope never falls back to another page. */ }
    if (!scopedProfile) { result.detail = '当前页面与欢迎语冻结的抖音用户主页不一致'; return result; }
    if (profileContext && (!['recipientId', 'identity'].every(key => typeof profileContext[key] === 'string' && /^[1-9]\d{0,63}$/.test(profileContext[key])) || profileContext.recipientId === profileContext.identity)) {
      result.detail = '欢迎语冻结的发送账号或粉丝编号无效'; return result;
    }
    if (homeEntry && (profileContext.profileSelectionOnly === true || profileContext.profileScrollOnly === true)) {
      result.detail = '首页官方入口只能核对已打开的目标单聊，不能选择或滚动历史会话'; return result;
    }
  }
  const get = (object, key) => { try { return object?.[key]; } catch { return undefined; } };
  const object = value => value !== null && typeof value === 'object';
  const id = value => {
    if (typeof value === 'string') return value.trim().length <= 256 ? value.trim() : '';
    if (typeof value === 'bigint') return value > 0n ? String(value) : '';
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : '';
  };
  const numericId = value => {
    const raw = id(value);
    return /^[1-9]\d{0,63}$/.test(raw) && (typeof value !== 'string' || value === raw) ? raw : '';
  };
  const normalize = value => typeof value === 'string' ? value.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').trim() : '';
  const timestamp = value => {
    let milliseconds;
    if (typeof value === 'number') milliseconds = value;
    else if (typeof value === 'string' && /^\d{13}$/.test(value)) milliseconds = Number(value);
    else if (object(value)) { try { milliseconds = Date.prototype.getTime.call(value); } catch {} }
    // These are page timestamps, never the time at which this reader ran.
    if (!Number.isFinite(milliseconds) || milliseconds < 946684800000 || milliseconds > 4102444800000) return '';
    return new Date(milliseconds).toISOString();
  };
  const query = (selector, root = document) => { try { return Array.from(root.querySelectorAll(selector)); } catch { return []; } };
  const matches = (element, selector) => { try { return !!element?.matches?.(selector); } catch { return false; } };
  const closest = (element, selector) => { try { return element?.closest?.(selector) || null; } catch { return null; } };
  const attribute = (element, name) => { try { return element?.getAttribute(name) || ''; } catch { return ''; } };
  const loaded = element => {
    try {
      if (!element || element.nodeType !== 1 || !element.isConnected || !element.getClientRects().length) return false;
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || style.visibility === 'collapse' || style.display === 'none') return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    } catch { return false; }
  };
  const visible = element => {
    if (!loaded(element)) return false;
    try { const rect = element.getBoundingClientRect(); return rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth; }
    catch { return false; }
  };
  const one = (selector, root) => {
    if (!visible(root)) return null;
    // The row must overlap the viewport. Its unique loaded text/name/direction
    // child can be clipped at the viewport edge while still belonging to that
    // same validated row; clipping is not a data/text disagreement.
    const elements = query(selector, root).filter(loaded);
    return elements.length === 1 ? elements[0] : null;
  };
  const domText = element => {
    if (!element) return '';
    // Emoji labels and BRs are part of the displayed text. Douyin's official
    // small-emoji renderer uses title instead of alt on this exact wrapper.
    const walk = node => {
      if (node.nodeType === 3) return node.nodeValue || '';
      if (node.nodeType !== 1) return '';
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return '';
      if (node.tagName === 'BR') return '\n';
      if (node.tagName === 'IMG') {
        const alt = attribute(node, 'alt'), title = attribute(node, 'title');
        const smallEmoji = platform === 'douyin' && get(node, 'parentElement')?.tagName === 'SPAN' && matches(node.parentElement, '.TextMessageTextemoji');
        if (smallEmoji && alt && title && alt !== title) throw new Error('表情文字标识不一致');
        if (alt.trim()) return alt;
        if (smallEmoji && /^\[[^\[\]\r\n]{1,32}\]$/.test(title)) return title;
        // Never silently omit an unidentified image and validate only the
        // surrounding words; the complete displayed body must still match.
        throw new Error('正文图片缺少可核对的文字标识');
      }
      return Array.from(node.childNodes).map(walk).join('');
    };
    try { return normalize(walk(element)); } catch { return ''; }
  };
  const parsed = value => { try { return typeof value === 'string' ? JSON.parse(value) : null; } catch { return null; } };
  const xhsText = value => {
    const outer = parsed(value);
    if (!object(outer) || Array.isArray(outer)) return '';
    let inner = get(outer, 'content');
    if (typeof inner === 'string') {
      const decoded = parsed(inner);
      inner = object(decoded) && !Array.isArray(decoded) ? decoded : { text: inner };
    }
    if (!object(inner) || Array.isArray(inner)) inner = {};
    const candidate = typeof get(inner, 'text') === 'string' ? get(inner, 'text') : get(outer, 'text');
    return normalize(candidate || (typeof get(inner, 'content') === 'string' ? get(inner, 'content') : ''));
  };
  const identities = new Set();
  const active = new Map();
  const threadMap = new Map();
  const threadModels = new Map();
  const unreadThreads = new Set();
  const paneThreads = new Map();
  const candidates = new Map();
  let profileEvidence = null;
  let xhsViewIdentity = false;
  const invalidLabels = {
    missing_message_model: '消息行缺少可核对的平台数据',
    unstable_message_id: '缺少稳定平台消息编号',
    invalid_sender_id: '缺少有效发送者编号',
    invalid_timestamp: '缺少有效原始时间',
    text_mismatch: '正文与可见文本不一致',
    direction_mismatch: '消息方向无法核对',
    recalled_layout_mismatch: '撤回状态与当前消息行不一致',
    conversation_mismatch: '消息与当前会话编号不一致',
    duplicate_message_id: '可见消息编号重复',
  };
  const invalid = (...reasons) => {
    result.invalidRows++;
    for (const reason of new Set(reasons)) result.invalidReasons[reason] = (result.invalidReasons[reason] || 0) + 1;
  };
  const addIdentity = value => { const raw = id(value); if (raw && raw !== '0') identities.add(raw); };
  const addThread = (value, element, current = false) => {
    if (!object(value)) return;
    const raw = id(get(value, 'id'));
    if (!raw || raw === '0') return;
    const kind = platform === 'xiaohongshu' ? get(value, 'kind') : get(value, 'type');
    const single = platform === 'xiaohongshu' ? kind === 'c2c' : kind === 1;
    const group = platform === 'xiaohongshu' ? kind === 'group' : kind === 2;
    if (!single && !group) return;
    const peerId = id(get(value, platform === 'xiaohongshu' ? 'peerUserId' : 'toParticipantUserId'));
    const previous = threadModels.get(raw);
    if (previous && (previous.isGroup !== group || (previous.peerId && peerId && previous.peerId !== peerId))) throw new Error('同一会话的接收人或会话类型不一致，已停止读取');
    threadModels.set(raw, { isGroup: group, peerId: peerId || previous?.peerId || '' });
    const xhsNames = platform === 'xiaohongshu' && loaded(element) ? query('.xhs-im-conv-item__name', element).filter(loaded) : [];
    const nameElement = platform === 'xiaohongshu' ? (xhsNames.length === 1 ? xhsNames[0] : null) : one('.conversationConversationItemtitle', element);
    const detail = { id: raw, threadId: raw, isGroup: group, name: domText(nameElement), peerId };
    // openUid can create a temporary Xiaohongshu row using only the query ID.
    // The rendered name must also agree with the loaded conversation view.
    if (platform === 'xiaohongshu') {
      const loadedName = normalize(get(value, 'name'));
      detail.peerVerified = Boolean(loadedName && loadedName === detail.name && loadedName !== detail.peerId);
      const unread = get(value, 'unreadCount');
      if (element && single && Number.isSafeInteger(unread) && unread > 0) unreadThreads.add(raw);
    } else detail.peerVerified = Boolean(detail.name && detail.peerId && raw !== detail.peerId);
    if (element) threadMap.set(raw, detail);
    if (current) active.set(raw, detail);
    if (current && !element) paneThreads.set(raw, detail);
  };
  try {
    if (platform === 'xiaohongshu') {
      if (location.hostname !== 'www.xiaohongshu.com' || !/^\/chat(?:\/|$)/.test(location.pathname)) throw new Error('请打开小红书官方网页版私信页面');
      const root = document.getElementById('app');
      const app = get(root, '__vue_app__');
      const imRoots = query('.xhs-im-view').filter(visible);
      const inboxViews = new Map(), folderRows = new Map();
      const stack = [], queued = new Set();
      let links = 0;
      const enqueue = node => {
        // Count actual unique graph nodes, not missing fields or repeated Vue
        // links. App/container roots and component subtrees commonly overlap.
        if (++links > 200000) throw new Error('页面组件链接数量超出读取范围，已停止读取');
        // Even an ordinary DOM element may own a nested Teleport whose live
        // message rows are elsewhere. Never prune by the ancestor's DOM root.
        if (!object(node) || queued.has(node)) return;
        if (queued.size >= 25000) throw new Error('页面组件数量超出读取范围，已停止读取');
        queued.add(node); stack.push(node);
      };
      for (const node of [get(root, '_vnode'), get(get(app, '_container'), '_vnode'), get(get(app, '_instance'), 'subTree')]) enqueue(node);
      // A teleported IM root can live outside its source element's DOM tree.
      // Its own mounted Vue component supplies a direct route into that branch.
      for (const view of imRoots) {
        const component = get(view, '__vueParentComponent');
        enqueue(get(component, 'vnode')); enqueue(get(component, 'subTree'));
      }
      while (stack.length) {
        const node = stack.pop();
        if (Array.isArray(node)) { for (const child of node) enqueue(child); continue; }
        const component = get(node, 'component');
        const props = get(component, 'props') || get(node, 'props');
        const element = get(node, 'el');
        const convElement = closest(element, '.xhs-im-conv-item[data-conv-id]');
        // Already mounted list rows remain valid navigation hints when pinned
        // groups push them below the viewport. Message bodies stay viewport-
        // limited and are read only after their single chat is opened.
        if (object(props) && (visible(element) || loaded(convElement))) {
          // IMView renders even before the user has selected (or ever had) a
          // conversation. Its explicit currentUserId prop is the same value
          // passed to ChatWindow as myUid; do not inspect authConfig or SDK state.
          if (matches(element, '.xhs-im-view') && get(get(component, 'type'), '__name') === 'IMView') {
            const currentUserId = id(get(props, 'currentUserId'));
            addIdentity(currentUserId);
            if (currentUserId && currentUserId !== '0') xhsViewIdentity = true;
          }
          if (matches(element, '.xhs-im-conv-list') && get(get(component, 'type'), '__name') === 'ConversationList') {
            const showStrangers = get(props, 'showStrangerFolder');
            if (typeof showStrangers !== 'boolean') throw new Error('小红书收件箱分类状态尚未确认');
            const headers = query('.xhs-im-conv-list__stranger-header', element).filter(visible);
            if ((showStrangers && headers.length !== 1) || (!showStrangers && headers.length)) throw new Error('小红书收件箱分类与页面不一致，已停止读取');
            const view = showStrangers ? 'strangers' : 'main';
            if (inboxViews.has(element) && inboxViews.get(element) !== view) throw new Error('小红书收件箱分类组件不一致');
            inboxViews.set(element, view);
          }
          const row = closest(element, '.chat-item[data-message-id]');
          const windowElement = closest(element, '.xhs-im-chat-window');
          if (row || windowElement) {
            addIdentity(get(props, 'myUid') ?? get(props, 'my-uid'));
            const conversation = get(props, 'conv');
            if (object(conversation)) addThread(conversation, null, true);
          }
          const conversation = get(props, 'conv');
          if (convElement && object(conversation) && id(get(conversation, 'id')) === attribute(convElement, 'data-conv-id')) {
            if (get(conversation, 'kind') === 'stranger-folder') {
              const unread = get(conversation, 'unreadCount');
              const names = query('.xhs-im-conv-item__name', convElement).filter(loaded);
              const name = names.length === 1 ? names[0] : null;
              if (id(get(conversation, 'id')) !== '__stranger_folder__' || attribute(convElement, 'data-conv-kind') !== 'stranger-folder' ||
                  normalize(get(conversation, 'name')) !== '陌生人消息' || domText(name) !== '陌生人消息' ||
                  !Number.isSafeInteger(unread) || unread < 0) throw new Error('小红书陌生人消息入口无法核对');
              folderRows.set(convElement, unread);
            }
            addThread(conversation, convElement, matches(convElement, '.xhs-im-conv-item--active'));
          }
          const message = get(props, 'message');
          if (row && visible(row) && object(message) && get(props, 'myUid') !== undefined) {
            candidates.set(row, { message, props });
          }
        }
        for (const child of [get(component, 'subTree'), get(node, 'subTree'), get(node, 'children'), get(node, 'ssContent'), get(get(node, 'suspense'), 'activeBranch')]) enqueue(child);
      }
      if (inboxViews.size > 1 || folderRows.size > 1) throw new Error('小红书收件箱分类或陌生人入口不唯一');
      if (inboxViews.size === 1) {
        const view = [...inboxViews.values()][0];
        if (view === 'strangers' && folderRows.size) throw new Error('小红书两个收件箱同时可见，已停止读取');
        result.xhsInbox = { view, hasStrangerFolder: view === 'strangers' || folderRows.size === 1,
          folderUnread: folderRows.size ? [...folderRows.values()][0] : 0 };
      }
    } else if (platform === 'douyin') {
      if (!scopedProfile && (location.hostname !== 'www.douyin.com' || !/^\/(?:chat|im)(?:\/|$)/.test(location.pathname))) throw new Error('请打开抖音官方网页版私信页面');
      if (homeEntry && query('[role="dialog"], [role="alertdialog"], [aria-modal="true"]').some(visible)) {
        throw new Error('官方首页有未处理的对话框，当前单聊不可核对');
      }
      if (profileContext && query('#login-panel-new, #login-pannel').some(element => {
        if (!visible(element)) return false;
        for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0' ||
              attribute(ancestor, 'aria-hidden') === 'true' || get(ancestor, 'hidden') === true || get(ancestor, 'inert') === true) return false;
        }
        return true;
      })) {
        // Exact official login roots, regardless of role attributes. Never
        // infer login state from a message, profile text or hidden old modal.
        result.errorCode = 'LOGIN_REQUIRED';
        throw new Error('官方页面要求登录，请完成登录后重新检查');
      }
      const fiberLimit = profileContext ? 512 : 100;
      const fiberProps = element => {
        const found = { message: null, conversation: null, curConversation: null };
        const keys = Object.getOwnPropertyNames(element).filter(name => name.startsWith('__reactFiber$'));
        const key = keys[0];
        const sdkSender = { present: false, valid: true, ids: new Set(), complete: false, walkIssues: [] };
        if (!keys.length) sdkSender.walkIssues.push('当前聊天组件标识未出现');
        else if (keys.length > 1) sdkSender.walkIssues.push('当前聊天组件标识不唯一');
        let fiber = key && get(element, key);
        const visited = new Set();
        for (let depth = 0; fiber && depth < fiberLimit && !visited.has(fiber); depth++, fiber = get(fiber, 'return')) {
          visited.add(fiber);
          const props = get(fiber, 'memoizedProps');
          if (!object(props)) continue;
          for (const field of ['message', 'conversation', 'curConversation']) {
            if (!found[field] && object(get(props, field))) found[field] = get(props, field);
          }
          const options = get(props, 'options');
          if (object(options) && object(get(options, 'imsdkOption'))) addIdentity(get(get(options, 'userInfo'), 'uid'));
          if (profileContext && object(options) && Object.prototype.hasOwnProperty.call(options, 'imsdkOption')) {
            // Read the provider belonging to this physical surface now. A
            // history row, a previous scan or the expected account ID cannot
            // supply the sender of a newly opened profile composer.
            sdkSender.present = true;
            const current = numericId(get(get(options, 'userInfo'), 'uid'));
            if (!object(get(options, 'imsdkOption')) || Array.isArray(get(options, 'imsdkOption')) || !current) sdkSender.valid = false;
            else sdkSender.ids.add(current);
          }
        }
        if (fiber) sdkSender.walkIssues.push(visited.has(fiber) ? '当前聊天组件祖先出现循环' : `当前聊天组件超过${fiberLimit}层读取范围`);
        sdkSender.complete = sdkSender.walkIssues.length === 0;
        if (profileContext) found.sdkSender = sdkSender;
        for (const conversation of [found.conversation, found.curConversation]) {
          addIdentity(get(get(get(conversation, 'ctx'), 'option'), 'userId'));
        }
        return found;
      };
      const profileSender = (value, sdk) => {
        const ctx = get(value, 'ctx'), option = get(ctx, 'option'), self = get(option, 'userId');
        const malformed = (ctx !== undefined && (!object(ctx) || Array.isArray(ctx))) || (option !== undefined && (!object(option) || Array.isArray(option)));
        const declared = object(option) && 'userId' in option;
        const missing = !malformed && !declared && self === undefined;
        const checks = {
          senderIdPresent: self !== undefined && self !== null && self !== '', senderIdValid: !!numericId(self), senderMatches: numericId(self) === profileContext.identity,
          sdkSenderPresent: sdk.present, sdkSenderValid: sdk.present && sdk.valid,
          sdkDataValid: sdk.present && sdk.valid, sdkSenderComplete: sdk.complete,
          sdkSenderUnique: sdk.ids.size === 1, sdkSenderMatches: sdk.ids.size === 1 && sdk.ids.has(profileContext.identity),
        };
        const sdkVerified = checks.sdkDataValid && checks.sdkSenderUnique && checks.sdkSenderMatches;
        checks.senderVerified = sdk.complete && (missing ? sdkVerified : !malformed && checks.senderMatches) && (!sdk.present || sdkVerified);
        const issues = [...sdk.walkIssues];
        if (sdk.present && !sdkVerified) issues.push(!checks.sdkDataValid ? '当前聊天登录账号资料无效' : !checks.sdkSenderUnique ? '当前聊天登录账号不唯一' : '当前聊天登录账号不匹配');
        if (missing && !sdk.present) issues.push('发送账号编号未出现，当前聊天也缺少登录账号证据');
        else if (!missing && (malformed || !checks.senderMatches)) issues.push(malformed || !checks.senderIdValid ? '发送账号编号格式不正确' : '发送账号编号不匹配');
        return { checks, issues };
      };
      if (profileContext) {
        // Each visible physical surface supplies its nearest curConversation;
        // neither a history-row selection nor a shared outer conversation may
        // substitute for the current input/header's own model.
        const directConversation = (element, field = 'curConversation') => {
          const key = Object.getOwnPropertyNames(element).find(name => name.startsWith('__reactFiber$'));
          let fiber = key && get(element, key);
          const visited = new Set();
          for (let depth = 0; fiber && depth < fiberLimit && !visited.has(fiber); depth++, fiber = get(fiber, 'return')) {
            visited.add(fiber);
            const props = get(fiber, 'memoizedProps');
            if (object(props) && Object.prototype.hasOwnProperty.call(props, field)) return get(props, field);
          }
          return null;
        };
        const checkedConversation = (value, surface, sdk) => {
          const raw = get(value, 'id'), type = get(value, 'type'), peer = get(value, 'toParticipantUserId');
          const sender = profileSender(value, sdk);
          const present = field => field !== undefined && field !== null && field !== '';
          const checks = {
            surface, modelPresent: value !== undefined && value !== null, modelValid: object(value),
            threadIdPresent: present(raw), threadIdValid: typeof raw === 'string' && !!raw && raw.length <= 256 && !/\s|[\u0000-\u001f\u007f]/.test(raw) && !['0', '-1', profileContext.recipientId, profileContext.identity].includes(raw),
            typePresent: present(type), singleChat: type === 1,
            recipientIdPresent: present(peer), recipientIdValid: !!numericId(peer), recipientMatches: numericId(peer) === profileContext.recipientId,
            ...sender.checks,
          };
          const issues = [];
          if (!checks.modelValid) issues.push(checks.modelPresent ? '会话数据格式不正确' : '会话数据未出现');
          else {
            if (!checks.singleChat) issues.push(checks.typePresent ? '会话类型不是单聊' : '会话类型未出现');
            if (!checks.threadIdValid) issues.push(checks.threadIdPresent ? '会话编号格式不正确' : '会话编号未出现');
            if (!checks.recipientMatches) issues.push(!checks.recipientIdPresent ? '接收人编号未出现' : !checks.recipientIdValid ? '接收人编号格式不正确' : '接收人编号不匹配');
            issues.push(...sender.issues);
          }
          return { id: raw, peerId: numericId(peer), checks, issues };
        };
        const inputs = query('[data-e2e="msg-input"]').filter(visible);
        // The official desktop and stacked popup headers expose the same
        // curConversation prop but different physical containers. Select one
        // complete layout; never combine one layout's header with the other's
        // title or choose between two simultaneously rendered headers.
        const layouts = [
          { header: '.RightPanelHeaderconvHeader', title: '.RightPanelHeadertitle' },
          { header: '.StackLayoutStackChatHeaderinfoContainer', title: '.StackLayoutStackChatHeadertitle' },
        ].map(layout => ({ ...layout, headers: query(layout.header).filter(visible), titles: query(layout.title).filter(visible) }));
        // Home-feed headings describe videos, not the frozen recipient. Only
        // this explicit scope substitutes all three independent numeric pane
        // models for the profile heading; unscoped home pages remain denied.
        const names = homeEntry ? [] : query('h1').filter(visible);
        const panes = query('.messageMessageListwrapper').filter(loaded);
        result.profileSurfaceCounts = { inputs: inputs.length, rightHeaders: layouts[0].headers.length, rightTitles: layouts[0].titles.length,
          stackHeaders: layouts[1].headers.length, stackTitles: layouts[1].titles.length, names: names.length, panes: panes.length };
        const counts = `（输入:${inputs.length}; RightPanel:${layouts[0].headers.length}/${layouts[0].titles.length}; Stack:${layouts[1].headers.length}/${layouts[1].titles.length}; 主页标题:${names.length}; 消息面板:${panes.length}）`;
        const presentLayouts = layouts.filter(layout => layout.headers.length || layout.titles.length);
        if (presentLayouts.length > 1) throw new Error(`主页私信同时出现多套标题布局，已停止读取${counts}`);
        const layout = presentLayouts[0] || layouts[0], { headers, titles } = layout;
        if ([inputs, headers, titles, names, panes].some(items => items.length > 1)) throw new Error(`主页私信输入框、标题或消息面板不唯一，已停止读取${counts}`);
        const surfaces = [...inputs.map(element => ({ element, surface: 'input' })), ...headers.map(element => ({ element, surface: 'header' })), ...panes.map(element => ({ element, surface: 'pane' }))];
        const models = surfaces.map(({ element, surface }) => {
          const props = fiberProps(element);
          return checkedConversation(directConversation(element), surface, props.sdkSender);
        });
        // These bounded diagnostics expose only fixed surface names and
        // booleans, never a platform ID, profile URL, message or credential.
        result.profileSurfaceChecks = models.map(model => ({ ...model.checks, threadMatchesOtherSurfaces: model.checks.threadIdValid && models.every(other => other.checks.threadIdValid && other.id === model.id) }));
        const failures = models.filter(model => model.issues.length);
        if (failures.length) {
          const labels = { input: '输入区', header: '聊天标题', pane: '消息面板' };
          throw new Error(`主页私信面板的会话、接收人或发送账号与冻结信息不一致（${failures.map(model => `${labels[model.checks.surface]}：${model.issues.join('、')}`).join('；')}）`);
        }
        if (models.some(model => model.id !== models[0].id)) throw new Error('主页私信输入框、标题与消息面板的会话不一致');
        if (identities.size > 1 || (identities.size && !identities.has(profileContext.identity))) throw new Error('页面账号身份不一致，已停止读取');
        const listOnly = !homeEntry && !inputs.length && !headers.length && !titles.length && !panes.length && names.length === 1;
        result.profileListOnly = listOnly;
        if (profileContext.profileSelectionOnly === true) {
          // Selecting a not-yet-open single chat is a separate read-only proof.
          // A list summary or a nickname cannot authorize this action. Inspect
          // the nearest declared row model, before any Map can merge duplicates.
          if (!listOnly) { result.renderPending = true; result.renderStage = 'conversation'; throw new Error('主页已有或正在加载单聊面板，将重新核对，未切换历史会话'); }
          const rows = query('[data-e2e="conversation-item"]');
          const listed = rows.map((element, rowIndex) => {
            const isLoaded = loaded(element);
            return { element, rowIndex, isLoaded, value: isLoaded ? directConversation(element, 'conversation') : null };
          });
          const targets = listed.filter(row => numericId(get(row.value, 'toParticipantUserId')) === profileContext.recipientId);
          // Only bounded structural counts leave this reader. They distinguish
          // a missing list, missing peer model and offscreen target without
          // exposing account IDs, names, URLs, message text or React objects.
          result.profileSelectionCounts = {
            rows: rows.length, loadedRows: listed.filter(row => row.isLoaded).length,
            rowsWithPeer: listed.filter(row => !!numericId(get(row.value, 'toParticipantUserId'))).length,
            targetRows: targets.length, targetVisible: targets.length === 1 && visible(targets[0].element),
          };
          const scrollOnly = profileContext.profileScrollOnly === true;
          const listContainers = query('.conversationConversationListwrapper').filter(loaded);
          const rowVisible = element => {
            if (!visible(element)) return false;
            if (listContainers.length !== 1) return !listContainers.length;
            const list = listContainers[0], a = list.getBoundingClientRect(), b = element.getBoundingClientRect();
            return visible(list) && list.contains(element) && b.bottom > a.top && b.top < a.bottom && b.right > a.left && b.left < a.right;
          };
          result.profileSelectionCounts.targetVisible = targets.length === 1 && rowVisible(targets[0].element);
          const scrollProof = (target, checked) => {
            if (!scrollOnly) return;
            // Only the official list scrolls. The profile and document never
            // move; virtual rows must be read afresh after this normal UI action.
            if (listContainers.length !== 1 || !visible(listContainers[0])) throw new Error('官方单聊列表滚动容器无法唯一核对，未滚动');
            const list = listContainers[0], listedRows = listed.filter(row => row.isLoaded);
            if (!listedRows.length) return;
            if (listedRows.some(row => !list.contains(row.element))) throw new Error('单聊列表行不属于唯一官方列表，未滚动');
            const sender = profileSender({}, fiberProps(list).sdkSender);
            if (!sender.checks.senderVerified) throw new Error('单聊列表当前登录账号无法核对，未滚动');
            for (const row of listedRows) {
              const props = fiberProps(row.element);
              if (props.sdkSender.present && !profileSender(row.value || {}, props.sdkSender).checks.senderVerified) throw new Error('单聊列表当前登录账号证据冲突，未滚动');
            }
            if (identities.size !== 1 || !identities.has(profileContext.identity)) throw new Error('页面账号身份不一致，已停止读取');
            const fromTop = list.scrollTop, height = list.clientHeight, total = list.scrollHeight;
            if (![fromTop, height, total].every(value => Number.isFinite(value) && value >= 0 && value <= 10000000) || height <= 0 || total < height || fromTop > total - height + 1) throw new Error('官方单聊列表滚动范围无法核对，未滚动');
            const maxTop = Math.max(0, total - height), box = list.getBoundingClientRect();
            let top = Math.min(maxTop, fromTop + Math.max(1, Math.floor(height * 0.8)));
            if (target) {
              const rect = target.element.getBoundingClientRect();
              top = rect.top < box.top ? fromTop + rect.top - box.top : fromTop + rect.bottom - box.bottom;
              top = Math.max(0, Math.min(maxTop, top));
            }
            result.identity = result.selfId = profileContext.identity;
            result.profileScrollTarget = { fromTop, top, maxTop, threadId: checked?.id || '' };
            Object.defineProperty(result, 'profileScrollElement', { value: list });
          };
          if (!targets.length) {
            scrollProof();
            result.renderPending = true; result.renderStage = 'conversation';
            throw new Error('固定接收人的单聊列表行尚未加载，当前未填写或发送');
          }
          if (targets.length !== 1) throw new Error('固定接收人的单聊列表行不唯一，未切换会话');
          const target = targets[0], props = fiberProps(target.element);
          const checked = checkedConversation(target.value, 'list', props.sdkSender);
          if (checked.issues.length) throw new Error(`接收人列表行的会话或发送账号与冻结信息不一致（${checked.issues.join('、')}）`);
          if (listed.filter(row => get(row.value, 'id') === checked.id).length !== 1) throw new Error('固定接收人的会话编号在列表中重复，未切换会话');
          if (!rowVisible(target.element)) { scrollProof(target, checked); result.renderPending = true; result.renderStage = 'conversation'; throw new Error('固定接收人的单聊列表行尚未可见，当前未填写或发送'); }
          if (identities.size !== 1 || !identities.has(profileContext.identity)) throw new Error('页面账号身份不一致，已停止读取');
          result.identity = result.selfId = profileContext.identity;
          result.profileActivationTarget = { rowIndex: target.rowIndex, threadId: checked.id, peerId: checked.peerId };
          result.detail = '已核对固定接收人的唯一单聊列表行，尚未核对聊天面板';
          return result; // Deliberately not ok/ready: this is never send evidence.
        }
        if (!inputs.length || !headers.length || !titles.length || (homeEntry ? panes.length !== 1 : !names.length)) {
          // Existing bubbles can render before the new pane's title/input.
          // They neither complete that pane nor prove a permanent conflict.
          // All available surface models and sender evidence were checked
          // above; only scan callers may wait for these missing surfaces.
          result.renderPending = true; result.renderStage = 'conversation';
          throw new Error(`主页私信输入框或标题尚未加载完成${counts}`);
        }
        const headerTitles = query(layout.title, headers[0]).filter(loaded);
        if (headerTitles.length !== 1 || headerTitles[0] !== titles[0] || closest(titles[0], layout.header) !== headers[0]) throw new Error('主页私信标题不属于当前聊天面板');
        const name = homeEntry ? '' : domText(names[0]), title = domText(titles[0]);
        if (!title || (!homeEntry && (!name || name !== title))) throw new Error('主页名称与当前私信标题不一致，已停止读取');
        profileEvidence = { id: models[0].id, threadId: models[0].id, isGroup: false, name: title, peerId: profileContext.recipientId, peerVerified: true, peerSource: homeEntry ? 'verified-follow-home-entry' : 'verified-follow-profile' };
      }
      for (const element of query('[data-e2e="conversation-item"]').filter(profileContext ? loaded : visible)) {
        const props = fiberProps(element);
        if (profileEvidence && id(get(props.conversation, 'id')) === profileEvidence.id) {
          const value = props.conversation, names = query('.conversationConversationItemtitle', element).filter(loaded);
          // Inspect every raw same-ID row, including duplicate and clipped rows,
          // before a Map can merge them. Missing evidence is not agreement.
          // Keep the guard strict, but identify which evidence failed so a
          // single stale history row cannot stop unrelated accounts/tasks.
          // Sender evidence takes precedence when several fields disagree.
          if (!profileSender(value, props.sdkSender).checks.senderVerified) {
            result.errorCode = 'PROFILE_HISTORY_SENDER_MISMATCH';
            throw new Error('主页私信与同编号历史会话的发送账号无法一致核对；本条未填写或发送，请检查该账号');
          }
          if (get(value, 'id') !== profileEvidence.id || numericId(get(value, 'toParticipantUserId')) !== profileContext.recipientId) {
            result.errorCode = 'PROFILE_HISTORY_RECIPIENT_MISMATCH';
            throw new Error('主页私信与同编号历史会话的接收人编号不一致；本条未填写或发送，暂缓该对象');
          }
          if (get(value, 'type') !== 1) {
            result.errorCode = 'PROFILE_HISTORY_KIND_MISMATCH';
            throw new Error('主页私信的同编号历史会话尚不能确认为单聊；本条未填写或发送，暂缓该对象');
          }
          if (names.length !== 1 || domText(names[0]) !== profileEvidence.name) {
            result.errorCode = 'PROFILE_HISTORY_NAME_MISMATCH';
            throw new Error('主页私信标题与同编号历史会话名称未一致加载；本条未填写或发送，暂缓该对象');
          }
        }
        addThread(props.conversation, element, !profileContext && matches(element, '.conversationConversationItemcurConversation'));
      }
      if (profileEvidence) {
        threadMap.set(profileEvidence.id, profileEvidence);
        active.set(profileEvidence.id, profileEvidence);
        paneThreads.set(profileEvidence.id, profileEvidence);
      } else {
        for (const element of query('.messageMessageListwrapper, [data-e2e="msg-input"]').filter(visible)) {
          const props = fiberProps(element);
          addThread(props.curConversation || props.conversation, null, true);
        }
      }
      for (const row of query('.messageMessageListwrapper .messageMessageBoxmessageBox').filter(visible)) {
        const props = fiberProps(row);
        if (props.message) {
          candidates.set(row, { message: props.message, props });
          if (get(props.message, 'isFromMe') === true) addIdentity(get(props.message, 'sender'));
        } else invalid('missing_message_model');
      }
    } else throw new Error('这个平台尚无已验证的页面读取器');

    const threadIds = Array.from(threadMap.keys());
    // Unread is a scheduling hint, never a message or permission to send. Put
    // validated visible unread single chats before the bounded list snapshot.
    if (platform === 'xiaohongshu') threadIds.sort((a, b) => Number(unreadThreads.has(b)) - Number(unreadThreads.has(a)));
    result.threads = (profileEvidence ? [profileEvidence.id, ...threadIds.filter(key => key !== profileEvidence.id)] : threadIds).slice(0, 100);
    // The navigation budget must not remove the rendered chat's independent
    // list-row evidence. Otherwise a verified active peer in a large inbox
    // becomes impossible to match during welcome preparation. Keep the bound
    // and unread ordering, replacing only the final navigation hint if needed.
    if (platform === 'xiaohongshu' && active.size === 1) {
      const currentId = active.keys().next().value;
      if (threadMap.has(currentId) && !result.threads.includes(currentId)) {
        if (result.threads.length === 100) result.threads.pop();
        result.threads.push(currentId);
      }
    }
    result.threadDetails = result.threads.map(key => threadMap.get(key));
    if (platform === 'xiaohongshu') result.unreadThreads = result.threads.filter(key => unreadThreads.has(key));
    if (identities.size > 1) throw new Error('页面账号身份不一致，已停止读取');
    if (active.size > 1) throw new Error('当前会话不唯一，已停止读取');
    if (!identities.size) {
      if (!result.invalidRows) { result.renderPending = true; result.renderStage = 'identity'; }
      throw new Error('尚未识别到当前登录账号，请登录并打开一段私信');
    }
    result.identity = result.selfId = Array.from(identities)[0];
    if (!active.size) {
      if (platform === 'xiaohongshu' && xhsViewIdentity && !result.invalidRows) {
        // Authenticated inbox readiness is separate from permission to send.
        // A first-time account can wait for new chats or open a frozen recipient
        // without pretending that a usable conversation already exists.
        result.ok = true;
        result.connectionReady = true;
        result.hasConversation = false;
        result.detail = '已确认小红书登录账号，当前未打开单聊；等待新会话或核对指定接收人';
        return result;
      }
      if (!result.invalidRows) { result.renderPending = true; result.renderStage = 'conversation'; }
      throw new Error('请打开一段私信以检查连接');
    }
    const current = Array.from(active.values())[0];
    result.threadId = current.id;
    result.isGroup = current.isGroup;
    const pane = paneThreads.get(current.id), listed = threadMap.get(current.id);
    result.peerId = pane?.peerId || '';
    result.peerVerified = Boolean(pane && listed?.peerVerified && pane.peerId && pane.peerId === listed.peerId && !pane.isGroup && !listed.isGroup);
    const seen = new Set();
    for (const [row, { message, props }] of candidates) {
      const rawId = id(get(message, platform === 'xiaohongshu' ? 'messageId' : 'serverId'));
      const senderId = id(get(message, platform === 'xiaohongshu' ? 'senderId' : 'sender'));
      const receivedAt = timestamp(get(message, platform === 'xiaohongshu' ? 'createTime' : 'createdAt'));
      const own = senderId === result.selfId;
      const type = get(message, platform === 'xiaohongshu' ? 'contentType' : 'type');
      if (type !== (platform === 'xiaohongshu' ? 1 : 7)) continue;
      if (platform === 'douyin' && get(message, 'isRecalled') === true) {
        // The official renderer keeps the original type/ID but replaces a
        // recalled text bubble with a full-row notice. Its old content is no
        // longer displayed: do not read it or emit an event/delivery receipt.
        // Both the current model and this row's exact replacement layout must
        // agree; a caption containing "撤回" is never sufficient evidence.
        const fullRows = query('.messageMessageBoxfullRowContent', row).filter(loaded);
        const boxes = query('.messageMessageBoxcontentBox', row).filter(loaded);
        const bodies = query('.MessageItemTextbubbleTextContent', row).filter(loaded);
        const reasons = [];
        if (!rawId || rawId === '0' || rawId === '-1') reasons.push('unstable_message_id');
        if (!senderId || senderId === '0' || senderId === '-1') reasons.push('invalid_sender_id');
        if (!receivedAt) reasons.push('invalid_timestamp');
        if (get(message, 'isFromMe') !== own) reasons.push('direction_mismatch');
        if (id(get(message, 'conversationId')) !== current.id) reasons.push('conversation_mismatch');
        if (!matches(row, '.messageMessageBoxisFullRowCenterMessage') || fullRows.length !== 1 ||
            closest(fullRows[0], '.messageMessageBoxmessageBox') !== row || boxes.length || bodies.length) reasons.push('recalled_layout_mismatch');
        if (reasons.length) { invalid(...reasons); continue; }
        const externalId = `${current.id}:${rawId}`;
        if (seen.has(externalId)) { invalid('duplicate_message_id'); continue; }
        seen.add(externalId); result.recalledRows++;
        continue;
      }
      const textElement = one(platform === 'xiaohongshu' ? '.xhs-im-bubble__text' : '.MessageItemTextbubbleTextContent', row);
      const content = get(message, 'content');
      const text = platform === 'xiaohongshu' ? xhsText(content) : normalize(get(parsed(content), 'text'));
      const rendered = domText(textElement);
      let directionMatches = false, conversationMatches = false, rowIdMatches = true;
      if (platform === 'xiaohongshu') {
        const right = !!one('.chat-item__content--right', row);
        const left = !!one('.chat-item__content--left', row);
        const conversation = get(props, 'conv');
        directionMatches = own ? right && !left : left && !right;
        rowIdMatches = attribute(row, 'data-message-id') === rawId;
        conversationMatches = id(get(conversation, 'id')) === current.id;
      } else {
        const box = one('.messageMessageBoxcontentBox', row);
        directionMatches = !!box && matches(box, '.messageMessageBoxisFromMe') === own && get(message, 'isFromMe') === own;
        conversationMatches = id(get(message, 'conversationId')) === current.id;
      }
      const status = get(message, platform === 'xiaohongshu' ? 'pushStatus' : 'flightStatus');
      const reasons = [];
      if (!rawId || rawId === '0' || rawId === '-1' || !rowIdMatches) reasons.push('unstable_message_id');
      if (!senderId || senderId === '0' || senderId === '-1') reasons.push('invalid_sender_id');
      if (!receivedAt) reasons.push('invalid_timestamp');
      if (!text || text !== rendered) reasons.push('text_mismatch');
      if (!directionMatches) reasons.push('direction_mismatch');
      if (!conversationMatches) reasons.push('conversation_mismatch');
      if (platform === 'xiaohongshu' && own && [-1, -2].includes(status) && !rawId) {
        // The official MessageModel starts with a UUID and no messageId/storeId.
        // Both network errors and server rejections become PUSH_FAILED (-2),
        // so that state cannot prove non-delivery. Keep the otherwise verified
        // local row out of inbound events and receipts without poisoning every
        // subsequent read of this conversation.
        const uuid = get(message, 'uuid');
        const stableUuid = typeof uuid === 'string' && uuid.length > 0 && uuid.length <= 256 && !/\s|[\u0000-\u001f\u007f]/.test(uuid) && !['0', '-1'].includes(uuid);
        const localMatches = stableUuid && attribute(row, 'data-message-id') === uuid &&
          get(message, 'isLocalMsg') === true && get(message, 'isGroupChat') === false && !current.isGroup &&
          id(get(message, 'chatId')) === current.id && id(get(message, 'receiverId')) === current.peerId &&
          get(message, 'storeId') === 0 && reasons.every(reason => reason === 'unstable_message_id');
        if (localMatches) {
          if (result.outgoingClientIds.includes(uuid)) { invalid('duplicate_message_id'); continue; }
          result.outgoingClientIds.push(uuid);
          if (status === -1) result.pendingRows++; else result.localFailedRows++;
          continue;
        }
      }
      const clientId = platform === 'douyin' ? get(message, 'clientId') : '';
      const stableClientId = typeof clientId === 'string' && clientId.length > 0 && clientId.length <= 256 && !/\s|[\u0000-\u001f\u007f]/.test(clientId) && !['0', '-1'].includes(clientId);
      const matchedOwnRow = platform === 'douyin' && own && get(message, 'isFromMe') === true && stableClientId && reasons.every(reason => reason === 'unstable_message_id');
      if (matchedOwnRow) {
        if (result.outgoingClientIds.includes(clientId)) { invalid('duplicate_message_id'); continue; }
        result.outgoingClientIds.push(clientId);
      }
      // The official SDK records a nonzero server response on this exact local
      // message before setting Rejected (-2) or SelfVisible (-3). A network
      // Failed (-1) alone never proves that the recipient did not receive it.
      // Rejected local messages may legitimately lack a server ID; a stable
      // client ID, exact own bubble/body/thread/time and response are required.
      if (matchedOwnRow && [-2, -3].includes(status)) {
        const ext = get(message, 'ext'), responseStatus = get(ext, 's:send_response_status');
        const rejection = parsed(get(ext, 's:send_response_check_msg'));
        if (typeof responseStatus === 'string' && /^[1-9]\d{0,9}$/.test(responseStatus)) {
          const tips = normalize(get(get(get(rejection, 'status_msg'), 'msg_content'), 'tips'));
          const checkStatus = get(rejection, 'status_code');
          result.deliveryFailures.push({ id: `${current.id}:client:${clientId}`, clientId, threadId: current.id, senderId,
            text, receivedAt, status, responseStatus, checkStatus: Number.isSafeInteger(checkStatus) ? checkStatus : null, tips: tips.length <= 1000 ? tips : '' });
          continue;
        }
      }
      // Created/Preparing/Inflight are explicit pending states. Only a proven
      // own, otherwise fully matched row may lack its not-yet-issued server ID.
      // It supplies neither an inbound event nor a delivery receipt.
      if (platform === 'douyin' && own && get(message, 'isFromMe') === true && [0, 1, 2].includes(status) && (!reasons.length || (reasons.length === 1 && reasons[0] === 'unstable_message_id'))) { result.pendingRows++; continue; }
      if (reasons.length) { invalid(...reasons); continue; }
      const externalId = `${current.id}:${rawId}`;
      if (seen.has(externalId)) { invalid('duplicate_message_id'); continue; }
      seen.add(externalId);
      const confirmed = own && (platform === 'xiaohongshu'
        ? status === 0 && Number(get(message, 'storeId')) > 0 && attribute(row, 'data-store-id') === String(get(message, 'storeId'))
        // Douyin promotes a locally sent message from Succeeded (3) to
        // Received (4) when its server echo arrives. Both retain the independently
        // checked server ID, own direction, thread, body and original time.
        : status === 3 || status === 4);
      const item = {
        rawId, externalId, threadId: current.id, senderId,
        senderName: platform === 'xiaohongshu' ? normalize(get(props, 'senderNickname')) : (own ? '' : current.name),
        text, receivedAt, isOwn: own, isGroup: current.isGroup,
        sendStatus: typeof status === 'number' ? status : null, confirmed,
      };
      result.messages.push(item);
      if (confirmed) result.receipts.push({ id: externalId, rawId, threadId: current.id, text, receivedAt });
    }
    if (result.invalidRows) {
      result.errorCode = 'MESSAGE_ROWS_INVALID';
      throw new Error(`${result.invalidRows} 条私信未通过校验（${Object.entries(result.invalidReasons).map(([reason, count]) => `${invalidLabels[reason]} × ${count}`).join('；')}），已停止读取`);
    }
    result.ok = true;
    result.ready = !current.isGroup;
    if (platform === 'xiaohongshu') {
      result.connectionReady = true;
      result.hasConversation = true;
      if (!current.isGroup && !result.peerVerified) {
        result.renderPending = true;
        result.renderStage = 'recipient';
      }
    }
    if (profileEvidence) result.profilePeerVerified = true;
    if (profileEvidence && homeEntry) result.homeEntryPeerVerified = true;
    result.detail = current.isGroup ? '已读取群聊，自动回复仅支持单人私信' :
      (platform === 'xiaohongshu' && !result.peerVerified ? '已读取文本私信，接收人资料尚未完成核对' : '已读取当前已渲染的文本私信');
    return result;
  } catch (error) {
    result.ok = false;
    result.ready = false;
    result.messages = [];
    result.receipts = [];
    result.deliveryFailures = [];
    result.outgoingClientIds = [];
    result.detail = error instanceof Error ? error.message : '页面结构发生变化，已停止读取';
    return result;
  }
}

module.exports = { readPageState };
