'use strict';
const { readPageState } = require('./page-state.cjs');
const { readCommentState } = require('./comment-state.cjs');
const { readFollowState } = require('./follow-state.cjs');
const BUILTINS = {
  xiaohongshu: { dm: 'https://www.xiaohongshu.com/chat?channel_id=&channel_type=web_engagement_notification_page', comment: 'https://www.xiaohongshu.com/notification', follow: 'https://www.xiaohongshu.com/notification' },
  douyin: { dm: 'https://www.douyin.com/chat?isPopup=1', comment: 'https://creator.douyin.com/creator-micro/interactive/comment', follow: 'https://www.douyin.com/?open_notice=true' },
};
function builtinProfile(platform, channel) { return BUILTINS[platform]?.[channel] ? { adapter: 'official-page-v1', platform, channel, pageUrl: BUILTINS[platform][channel] } : null; }

function operate(platform, channel, operation, payload, reader) {
  const fail = detail => ({ ok: false, submitted: false, detail });
  const commentPrivate = payload.commentPrivate === true;
  if (payload.commentPrivate !== undefined && (!commentPrivate || payload.welcome !== true || payload.outreach || platform !== 'douyin' || channel !== 'dm')) return fail('评论私信的来源或发送渠道不正确，未发送');
  let readerScope;
  const homeEntry = Object.prototype.hasOwnProperty.call(payload, 'welcomeHomeEntryUrl');
  if (payload.welcomeProfileUrl !== undefined || homeEntry) {
    try {
      const expected = new URL(payload.welcomeProfileUrl);
      const pageUrl = homeEntry ? `https://www.douyin.com/jingxuan?imToSecUid=${expected.pathname.slice('/user/'.length)}` : payload.welcomeProfileUrl;
      if (platform !== 'douyin' || channel !== 'dm' || typeof payload.welcomeProfileUrl !== 'string' ||
          expected.href !== payload.welcomeProfileUrl || expected.origin !== 'https://www.douyin.com' ||
          expected.username || expected.password || expected.port || expected.search || expected.hash ||
          !/^\/user\/(?!\d+$)[A-Za-z0-9_-]{1,256}$/.test(expected.pathname) ||
          (homeEntry && payload.welcomeHomeEntryUrl !== pageUrl) || location.href !== pageUrl) return fail('当前页面与欢迎语冻结的抖音用户主页不一致');
      if (typeof payload.welcomeRecipientId !== 'string' || !/^[1-9]\d{0,63}$/.test(payload.welcomeRecipientId) ||
          typeof payload.identity !== 'string' || !/^[1-9]\d{0,63}$/.test(payload.identity) || payload.welcomeRecipientId === payload.identity) return fail('欢迎语缺少固定的数字发送者或接收人身份');
      readerScope = { profileUrl: payload.welcomeProfileUrl, recipientId: payload.welcomeRecipientId, identity: payload.identity };
      if (homeEntry) readerScope.homeEntryUrl = payload.welcomeHomeEntryUrl;
    } catch { return fail('欢迎语用户主页范围无效'); }
  }
  const visible = element => !!element && element.getClientRects().length > 0 && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden';
  const all = selector => Array.from(document.querySelectorAll(selector)).filter(visible);
  const normalized = value => String(value || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').trim();
  const editorValue = element => {
    const value = normalized('value' in element ? element.value : element.innerText || element.textContent);
    if (channel === 'comment' && element.querySelectorAll('img,video,audio,svg,canvas,iframe,[data-void="true"],[data-inline-wrapper]').length) return value || '\ufffc';
    if (platform === 'xiaohongshu' && channel === 'dm' && element.querySelectorAll('img,video,audio,svg,canvas,iframe,[data-void="true"],[data-inline-wrapper],.xhs-im-input-mention').length) return value || '\ufffc';
    if (platform !== 'douyin' || channel !== 'dm') return value;
    // The official editor-kit represents empty text with marked zero-space
    // leaves. Ignore only those exact leaves, never arbitrary invisible drafts,
    // user text, mentions or media attachments.
    const markers = Array.from(element.querySelectorAll('[data-zero-space="true"], [data-string="true"][data-enter="true"][data-leaf="true"]'));
    const atoms = element.querySelectorAll('img,video,audio,svg,canvas,iframe,[data-void="true"],[data-inline-wrapper]');
    if (atoms.length) return value || '\ufffc';
    const zeroCount = (value.match(/\u200b/g) || []).length;
    // A populated composer can retain a separate empty paragraph leaf. Exclude
    // only markers accounting for every zero-space character; unmarked input
    // remains significant for both draft and exact pre-submit text checks.
    return markers.length && markers.length === zeroCount && markers.every(marker => marker.textContent === '\u200b') ? normalized(value.replace(/\u200b/g, '')) : value;
  };
  const draftSelector = channel === 'dm' ? (platform === 'xiaohongshu' ? '.xhs-im-input-bar-editor' : '[data-e2e="msg-input"] [contenteditable="true"]') : channel === 'follow' ? 'textarea, [contenteditable="true"], input[type="text"]' : '.notification-page textarea, .notification-page [contenteditable="true"], .comment-container textarea, .comment-container [contenteditable="true"], main.creator-comment-redesign textarea, main.creator-comment-redesign [contenteditable="true"]';
  // XHS keeps quoted messages and pending media outside its editable text.
  // The official InputBar restores the quote together with the text draft;
  // empty innerText therefore does not mean this conversation is untouched.
  const xhsAuxiliaryDraft = () => platform === 'xiaohongshu' && channel === 'dm' &&
    (all('.xhs-im-input-bar-quote, .xhs-im-media-preview-overlay').length > 0 ||
      all('.xhs-im-input-bar-wrap input[type="file"]').some(element => element.files?.length || String(element.value || '').trim()));
  // Comment replies may stay mounted when their row is collapsed. A hidden
  // draft is still user content and must prevent a sort refresh from losing it.
  const hasDraft = () => xhsAuxiliaryDraft() || (channel === 'comment'
    ? Array.from(document.querySelectorAll(draftSelector)) : all(draftSelector)).some(element => editorValue(element));
  const homeDraft = (allowApprovedComposer = false) => {
    const editors = Array.from(document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]'));
    if (editors.some(element => {
      if (element.querySelectorAll('img,video,audio,svg,canvas,iframe,[data-void="true"],[data-inline-wrapper]').length) return true;
      const text = editorValue(element);
      if (!text) return false;
      return !(allowApprovedComposer && visible(element) && element === document.activeElement &&
        all(draftSelector).includes(element) && typeof payload.replyText === 'string' && text === normalized(payload.replyText));
    })) return true;
    return Array.from(document.querySelectorAll('input[type="file"]')).some(element => element.files?.length || String(element.value || '').trim()) ||
      document.querySelectorAll('[data-uploading="true"], [data-upload-status="uploading"]').length > 0 ||
      document.querySelectorAll('[class*="upload-preview"], [class*="uploadPreview"], [class*="attachment-preview"], [class*="attachmentPreview"]').length > 0;
  };
  if (homeEntry) {
    if (['activateFirst', 'activateProfileTarget', 'scrollProfileTargets'].includes(operation)) return fail('首页官方入口不能选择或滚动历史会话');
    if (all('[role="dialog"], [role="alertdialog"], [aria-modal="true"], #login-panel-new, #login-pannel').length) return fail('官方首页有登录、验证或未关闭的对话框，请人工处理');
    if (['prepare', 'send', 'probeComposer', 'selectThread', 'commit'].includes(operation) && homeDraft(operation === 'commit')) return fail('首页私信有未发送草稿或附件，已保留，请先人工处理');
  }
  if (operation === 'activateFollow') {
    if (channel !== 'follow' || hasDraft()) return fail('无法切换关注通知标签，现有草稿已保留');
    if (platform === 'douyin') {
      if (typeof location === 'undefined' || location.protocol !== 'https:' || location.hostname !== 'www.douyin.com') return fail('请打开抖音官方主站的互动消息面板');
      const panels = all('[data-e2e="listDlgTest-container"]');
      if (!panels.length) return { ...fail('抖音互动消息面板正在加载，请保持通知面板打开'), renderPending: true };
      if (panels.length !== 1) return fail('无法唯一确定抖音互动消息面板');
      const prefix = '[data-e2e="listDlgTest-container"] #noticeTypeList';
      const controls = all(`${prefix} [data-e2e="cur-filter"]`);
      if (controls.length !== 1) return fail('通知筛选控件发生变化，请在平台打开粉丝通知');
      const isFollowFilter = element => /^(?:粉丝|关注)$/.test(normalized(element.textContent));
      if (isFollowFilter(controls[0])) return { ok: true };
      const menus = all(`${prefix} [data-e2e="cur-dropdown-list"]`);
      if (menus.length > 1) return fail('通知筛选菜单不唯一，已停止切换');
      if (!menus.length) {
        const pending = extra => ({ ...fail('通知筛选菜单正在加载'), renderPending: true, followMenuRequested: true, ...extra });
        if (payload.followMenuRequested !== true) { controls[0].click(); return pending(); }
        // A click during hydration can be lost. Never blindly toggle again:
        // the official component toggles showNoticeTypeList, so an open-but-
        // unrendered menu must only be waited on. Read the current control's
        // provider, without invoking its methods, before one bounded retry.
        try {
          const control = controls[0], keys = Object.getOwnPropertyNames(control).filter(key => key.startsWith('__reactFiber$'));
          if (!keys.length) return pending();
          if (keys.length !== 1 || control.closest('[data-e2e="listDlgTest-container"]') !== panels[0]) return fail('通知筛选控件的来源无法唯一确认，已停止切换');
          let fiber = control[keys[0]], depth = 0;
          const seen = new Set(), stores = new Set(), identities = new Set();
          const hydrated = fiber?.stateNode === control && typeof fiber?.memoizedProps?.onClick === 'function';
          let hydrationPending = false;
          const decimalId = value => {
            const valueString = typeof value === 'number' ? (Number.isSafeInteger(value) && value > 0 ? String(value) : '') : typeof value === 'bigint' ? (value > 0n ? String(value) : '') : typeof value === 'string' ? value : '';
            return /^[1-9]\d{0,63}$/.test(valueString) ? valueString : '';
          };
          while (fiber) {
            if (typeof fiber !== 'object' || seen.has(fiber) || ++depth > 128) return fail('通知筛选组件结构异常，已停止切换');
            seen.add(fiber);
            const props = fiber.memoizedProps;
            if (props?.noticeStore !== undefined) {
              if (!props.noticeStore || typeof props.noticeStore !== 'object' || Array.isArray(props.noticeStore)) return fail('通知筛选状态无法确认，已停止切换');
              stores.add(props.noticeStore);
            }
            if (props?.uInfo !== undefined) {
              const rawUid = props.uInfo?.uid, uid = decimalId(rawUid);
              if (props.isLogin === false || (props.isLogin !== undefined && props.isLogin !== true) || (!uid && rawUid !== undefined && rawUid !== '')) return fail('通知筛选登录状态无法确认，已停止切换');
              if (props.isLogin === undefined || !uid) hydrationPending = true;
              if (uid) identities.add(uid);
            }
            fiber = fiber.return;
          }
          if (!stores.size) return pending();
          if (stores.size !== 1) return fail('通知筛选状态不唯一，已停止切换');
          const store = [...stores][0], identity = decimalId(store.uid), opened = store.showNoticeTypeList, filter = store.curNoticeFilter;
          if (store.isLogin === false || (store.isLogin !== undefined && store.isLogin !== true) || (!identity && store.uid !== undefined && store.uid !== '') || (identity && payload.identity !== undefined && payload.identity !== identity) || [...identities].some(value => (identity && value !== identity) || (payload.identity !== undefined && value !== payload.identity))) return fail('通知筛选登录账号与当前绑定不同，已停止切换');
          if (store.isLogin === undefined || !identity || opened === undefined || !filter || filter.value === undefined || !filter.label) hydrationPending = true;
          // Official notice filter values are strings, unlike notice row type
          // numbers. The FOLLOW reader uses "10"; these are its rendered peers.
          const filterLabels = { '25': '全部消息', '26': '推荐', '7': '评论', '8': '赞', '9': '@我的', '-1': '弹幕' };
          if ((opened !== undefined && typeof opened !== 'boolean') || (filter?.value !== undefined && (typeof filter.value !== 'string' || !Object.hasOwn(filterLabels, filter.value) || (filter.label && filter.label !== filterLabels[filter.value]))) || (filter?.label && filter.label !== normalized(control.textContent))) return fail('通知筛选控件与当前分类状态不一致，已停止切换');
          const retries = payload.followMenuRetryCount === undefined ? 0 : payload.followMenuRetryCount;
          if (retries !== 0 && retries !== 1) return fail('通知筛选重试状态不正确，已停止切换');
          if (hydrationPending || opened || !hydrated || payload.identity === undefined || retries === 1) return pending({ ...(identity ? { identity } : {}), followMenuRetryCount: retries });
          control.click();
          return pending({ identity, followMenuRetryCount: 1 });
        } catch { return fail('通知筛选状态读取失败，已停止切换'); }
      }
      const options = Array.from(menus[0].children).filter(visible).filter(isFollowFilter);
      if (options.length !== 1) return fail('通知菜单中没有唯一的粉丝筛选项');
      options[0].click(); return { ok: true };
    }
    if (platform !== 'xiaohongshu') return fail('该平台没有关注通知读取器');
    const isFollowLabel = value => /^新增关注(?:\s*\d+\+?)?$/.test(normalized(value));
    const tabs = all('.notification-page div, .notification-page span').filter(element => isFollowLabel(element.textContent) && ![...element.children].some(child => isFollowLabel(child.textContent)));
    if (tabs.length !== 1) return fail('请打开小红书通知页面的“新增关注”标签');
    tabs[0].click(); return { ok: true };
  }
  if (operation === 'activateFirst') {
    if (readerScope) return fail('主页欢迎语不能切换到历史私信');
    if (channel === 'dm') {
      let rows = platform === 'xiaohongshu' ? all('.xhs-im-conv-item[data-conv-kind="c2c"]') : all('[data-e2e="conversation-item"]').filter(row => {
        let f = row[Object.keys(row).find(key => key.startsWith('__reactFiber$'))];
        for (let i = 0; f && i < 80; i++, f = f.return) if (f.memoizedProps?.conversation) return f.memoizedProps.conversation.type === 1;
        return false;
      });
      // Pane recovery may run while the previous composer is temporarily
      // hidden. Preserve its draft and any pending media outside the editor
      // before selecting an existing chat; visibility is not proof of emptiness.
      if (platform === 'douyin' && homeDraft()) return fail('私信页面有未发送草稿或附件，已保留，请先人工处理');
      if (hasDraft()) return fail('私信页面有未发送草稿，已保留，请先人工处理');
      if (!rows.length) return { ...fail('单人私信列表尚未加载，请稍后检查'), renderPending: true };
      if (platform === 'xiaohongshu') rows[0].click();
      else rows[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      return { ok: true };
    }
    return fail('请先选择作品并加载评论');
  }
  if (operation === 'activateProfileTarget' || operation === 'scrollProfileTargets') {
    if (!readerScope || platform !== 'douyin' || channel !== 'dm') return fail('只有固定粉丝主页可核对新单聊列表');
    if (all('[role="dialog"], [role="alertdialog"], [aria-modal="true"]').length) return fail('官方页面有登录、验证或未关闭的对话框，请人工处理后继续');
    // Include restored hidden editors, mentions and attachments. A list-only
    // click must never abandon existing unsent content elsewhere in the page.
    const editors = Array.from(document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]'));
    if (editors.some(element => editorValue(element))) return fail('私信页面有未发送草稿或附件，已保留，请先人工处理');
    if (Array.from(document.querySelectorAll('input[type="file"]')).some(element => element.files?.length) ||
        all('[data-uploading="true"], [data-upload-status="uploading"], [class*="upload-preview"], [class*="uploadPreview"]').length) return fail('私信页面有未发送附件或正在上传的内容，已保留，请先人工处理');
    const scrolling = operation === 'scrollProfileTargets';
    const selected = reader(platform, { ...readerScope, profileSelectionOnly: true, profileScrollOnly: scrolling });
    const target = selected.profileActivationTarget;
    const stages = {
      '固定接收人的单聊列表行尚未加载，当前未填写或发送': 'target-not-loaded',
      '固定接收人的单聊列表行尚未可见，当前未填写或发送': 'target-not-visible',
      '主页已有或正在加载单聊面板，将重新核对，未切换历史会话': 'pane-rendering',
    };
    const counts = selected.profileSelectionCounts;
    const diagnostics = counts && ['rows', 'loadedRows', 'rowsWithPeer', 'targetRows'].every(key => Number.isSafeInteger(counts[key]) && counts[key] >= 0 && counts[key] <= 10000) &&
      counts.loadedRows <= counts.rows && counts.rowsWithPeer <= counts.loadedRows && counts.targetRows <= counts.rowsWithPeer && typeof counts.targetVisible === 'boolean' && (!counts.targetVisible || counts.targetRows === 1)
      ? { profileSelectionCounts: { rows: counts.rows, loadedRows: counts.loadedRows, rowsWithPeer: counts.rowsWithPeer, targetRows: counts.targetRows, targetVisible: counts.targetVisible } } : {};
    if (scrolling) {
      if (target) return { ok: true, scrolled: false, scrollStage: 'target-visible', ...diagnostics };
      const proof = selected.profileScrollTarget, list = selected.profileScrollElement;
      if (!proof) return { ...fail(selected.detail || '官方单聊列表尚未就绪，未滚动'), renderPending: selected.renderPending === true, errorCode: selected.errorCode, ...diagnostics };
      if (selected.profileListOnly !== true || selected.identity !== readerScope.identity || !visible(list) || !list.isConnected || typeof list.scrollTo !== 'function' ||
          list.scrollTop !== proof.fromTop || !['fromTop', 'top', 'maxTop'].every(key => Number.isFinite(proof[key]) && proof[key] >= 0 && proof[key] <= 10000000)) return fail('官方单聊列表在滚动前发生变化，未滚动');
      if (payload.profileScrollThreadId && proof.threadId && payload.profileScrollThreadId !== proof.threadId) return fail('固定接收人的列表会话已变化，未滚动');
      if (payload.profileScrollPreviousTop !== undefined && (!Number.isFinite(payload.profileScrollPreviousTop) || Math.abs(proof.fromTop - payload.profileScrollPreviousTop) < 1)) {
        return { ok: true, scrolled: false, scrollStage: 'no-progress', ...diagnostics };
      }
      // Begin a bounded search at the top when the official popup restored an
      // older scroll position. Thereafter move only this container forward.
      const top = !proof.threadId && payload.profileScrollStarted !== true && proof.fromTop > 1 ? 0 : proof.top;
      if (Math.abs(top - proof.fromTop) < 1) return { ok: true, scrolled: false, scrollStage: 'list-end', ...diagnostics };
      try { list.scrollTo({ top, behavior: 'instant' }); }
      catch { return fail('官方单聊列表滚动失败，当前未填写或发送'); }
      return { ok: true, scrolled: true, scrollStage: 'scrolled', fromTop: proof.fromTop, threadId: proof.threadId, ...diagnostics };
    }
    if (!target) return { ...fail(selected.detail || '尚未核对固定接收人的单聊列表行'), renderPending: selected.renderPending === true, errorCode: selected.errorCode,
      selectionStage: Object.hasOwn(stages, selected.detail) ? stages[selected.detail] : 'unavailable', ...diagnostics };
    if (selected.profileListOnly !== true || selected.identity !== readerScope.identity || target.peerId !== readerScope.recipientId ||
        !Number.isInteger(target.rowIndex) || target.rowIndex < 0 || typeof target.threadId !== 'string' || !target.threadId) return fail('接收人列表行身份无法唯一核对，未切换会话');
    if (payload.profileScrollThreadId && target.threadId !== payload.profileScrollThreadId) return fail('固定接收人的列表会话已变化，未切换会话');
    const row = Array.from(document.querySelectorAll('[data-e2e="conversation-item"]'))[target.rowIndex];
    if (!visible(row)) return fail('已核对的接收人列表行发生变化，未切换会话');
    try { row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); }
    catch { return fail('打开已核对的单聊列表行时发生异常，未填写或发送'); }
    return { ok: true, activated: true, threadId: target.threadId, selectionStage: 'selected', ...diagnostics };
  }
  const state = reader(platform, readerScope);
  const redesignedComments = platform === 'douyin' && channel === 'comment' && state.layout === 'douyin-comment-redesign';
  // Read only the nearest observed React component props for a DOM control.
  // This never invokes callbacks or traverses stores/network clients.
  const nearestControlProps = (element, matches) => {
    try {
      const keys = Object.getOwnPropertyNames(element).filter(key => key.startsWith('__reactFiber$'));
      if (keys.length !== 1) return null;
      let fiber = element[keys[0]];
      const seen = new Set();
      for (let depth = 0; fiber && typeof fiber === 'object' && depth < 20 && !seen.has(fiber); depth++, fiber = fiber.return) {
        seen.add(fiber);
        const props = fiber.memoizedProps;
        if (props && typeof props === 'object' && !Array.isArray(props) && matches(props)) return props;
      }
    } catch { /* A changing or ambiguous control is not safe to operate. */ }
    return null;
  };
  // The verified profile pane can first show its numeric placeholder while
  // the same peer's display name is loading. Never accept that mismatch: only
  // let a bounded caller rescan until the existing strict reader agrees.
  const profileTitles = readerScope && !homeEntry && operation === 'scan' && state.detail === '主页名称与当前私信标题不一致，已停止读取'
    ? all('.RightPanelHeadertitle, .StackLayoutStackChatHeadertitle') : [];
  const pendingProfileTitle = profileTitles.length === 1 && normalized(profileTitles[0].textContent) === readerScope.recipientId;
  const homeSurfaceCounts = {};
  if (homeEntry) for (const key of ['inputs', 'rightHeaders', 'rightTitles', 'stackHeaders', 'stackTitles', 'names', 'panes']) {
    const count = state.profileSurfaceCounts?.[key];
    if (Number.isSafeInteger(count) && count >= 0 && count <= 10000) homeSurfaceCounts[key] = count;
  }
  // A freshly selected XHS conversation hydrates its header and history in
  // separate turns. Keep a bounded read-only prepare retry possible, while a
  // positively identified different login remains an immediate hard failure.
  if (platform === 'xiaohongshu' && channel === 'dm' && payload.identity && state.identity && state.identity !== payload.identity) return fail('平台登录账号已变化，请重新检查连接');
  const xhsConnected = platform === 'xiaohongshu' && channel === 'dm' && state.ok === true &&
    state.connectionReady === true && state.invalidRows === 0 && typeof state.identity === 'string' && /^[0-9a-f]{24}$/i.test(state.identity);
  const xhsIdle = xhsConnected && state.ready === false &&
    ((state.hasConversation === false && !state.threadId && Array.isArray(state.messages) && !state.messages.length && Array.isArray(state.receipts) && !state.receipts.length) ||
      (state.hasConversation === true && state.isGroup === true && typeof state.threadId === 'string' && !!state.threadId));
  if (operation === 'switchInbox') {
    if (!xhsConnected || (!state.ready && !xhsIdle) || !payload.identity || payload.identity !== state.identity) return fail('小红书收件箱切换前需要核对绑定账号');
    if (!['main', 'strangers'].includes(payload.view) || !['main', 'strangers'].includes(state.xhsInbox?.view)) return fail('小红书收件箱分类尚未核对');
    if (hasDraft()) return fail('私信页面有未发送草稿或附件，已保留，请先人工处理');
    if (all('[role="dialog"], [role="alertdialog"], [aria-modal="true"]').length) return fail('小红书页面有未处理的对话框，请先完成处理');
    if (state.xhsInbox.view === payload.view) return { ok: true, identity: state.identity, view: payload.view, unchanged: true };
    const selector = payload.view === 'strangers'
      ? '.xhs-im-conv-list .xhs-im-conv-item[data-conv-id="__stranger_folder__"][data-conv-kind="stranger-folder"]'
      : '.xhs-im-conv-list .xhs-im-conv-list__stranger-header .xhs-im-conv-list__back-btn';
    if (payload.view === 'strangers' && state.xhsInbox.hasStrangerFolder !== true) return { ...fail('当前没有已核对的陌生人消息入口'), errorCode: 'XHS_INBOX_NOT_FOUND' };
    const targets = all(selector);
    if (targets.length !== 1) return fail('小红书收件箱切换入口不唯一，已停止切换');
    targets[0].click();
    return { ok: true, identity: state.identity, view: payload.view };
  }
  if (xhsIdle && operation === 'selectThread') {
    if (!payload.identity || payload.identity !== state.identity) return fail('选择私信会话前需要核对绑定账号');
    if (hasDraft()) return fail('当前输入框有未发送内容，已保留');
    const threads = state.threadDetails.filter(thread => !thread.isGroup).map(thread => thread.id);
    if (!threads.includes(payload.threadId)) return { ...fail('原始对话当前未加载'), errorCode: 'XHS_THREAD_NOT_FOUND' };
    const rows = all('.xhs-im-conv-item').filter(row => row.getAttribute('data-conv-id') === payload.threadId && row.getAttribute('data-conv-kind') === 'c2c');
    if (rows.length !== 1) return fail('无法唯一定位原对话');
    rows[0].click(); return { ok: true };
  }
  if (xhsIdle && operation === 'scan') {
    // A verified, logged-in inbox with no selected conversation can be
    // monitored. It still grants no composer, recipient or send permission.
    const idleThreads = Array.isArray(state.threadDetails) ? state.threadDetails.filter(thread => !thread.isGroup && typeof thread.id === 'string' && thread.id).map(thread => thread.id) : [];
    return { ...state, messages: [], receipts: [], deliveryFailures: [], outgoingClientIds: [], threads: idleThreads, canSwitch: !hasDraft() };
  }
  if (platform === 'xiaohongshu' && channel === 'dm' && operation === 'prepare' && (!state.ok || state.ready === false) &&
      !state.invalidRows && state.renderPending === true) {
    return { ...fail(state.detail || '小红书会话正在加载，当前未填写或提交'), ready: false, renderPending: true,
      renderStage: state.renderStage, identity: typeof state.identity === 'string' ? state.identity : '', errorCode: state.errorCode };
  }
  const refreshingComments = platform === 'douyin' && channel === 'comment' && ['refreshOpen', 'refreshSort'].includes(operation);
  if (refreshingComments) {
    if (!payload.identity || !payload.threadId) return fail('评论刷新缺少已绑定账号或作品');
    if (state.identity && state.identity !== payload.identity) return fail('平台登录账号已变化，请重新检查连接');
    if (state.threadId && state.threadId !== payload.threadId) return fail('原评论所属作品已切换，请打开原作品后重新检查连接');
    if ((!state.ok || state.ready === false) && !state.invalidRows && state.renderPending === true &&
        ['identity', 'comments'].includes(state.renderStage)) {
      return { ...fail(state.detail || '评论列表正在加载，稍后重新核对'), renderPending: true,
        renderStage: state.renderStage, identity: typeof state.identity === 'string' ? state.identity : '' };
    }
  }
  if (!state.ok || state.ready === false || state.invalidRows) return operation === 'scan'
    ? { ...fail(state.detail || '页面消息校验未通过'), ready: false, identity: typeof state.identity === 'string' ? state.identity : '', invalidRows: state.invalidRows || 0, invalidReasons: state.invalidReasons || {}, errorCode: state.errorCode, renderPending: state.renderPending === true || Boolean(pendingProfileTitle), renderStage: pendingProfileTitle ? 'profile-title' : state.renderStage, profileListOnly: state.profileListOnly === true, ...(homeEntry ? { profileSurfaceCounts: homeSurfaceCounts } : {}) }
    : { ...fail(state.detail || '页面消息校验未通过'), errorCode: state.errorCode };
  if (payload.identity && state.identity !== payload.identity) return fail('平台登录账号已变化，请重新检查连接');
  if (readerScope) {
    const targets = state.threadDetails.filter(thread => !thread.isGroup && thread.peerId === readerScope.recipientId);
    if (state.profilePeerVerified !== true || state.isGroup === true || state.peerId !== readerScope.recipientId || state.peerVerified !== true ||
        (homeEntry && state.homeEntryPeerVerified !== true) || targets.length !== 1 || targets[0].peerVerified !== true ||
        targets[0].peerSource !== (homeEntry ? 'verified-follow-home-entry' : 'verified-follow-profile') || targets[0].id !== state.threadId) return fail('主页当前聊天未通过新关注接收人核验');
    if (operation === 'selectThread') return payload.threadId === state.threadId ? { ok: true } : fail('主页欢迎语只能使用已核对的当前聊天');
  }
  const threads = channel === 'dm' ? state.threadDetails.filter(thread => !thread.isGroup).map(thread => thread.id) : [state.threadId];
  if (operation === 'scan') return { ...state, threads, canSwitch: homeEntry ? !homeDraft() : !hasDraft() };
  if (channel === 'follow') return fail('关注通知页只用于读取，欢迎语必须在已核对接收人的单聊中发送');
  if (operation === 'refreshOpen' || operation === 'refreshSort') {
    if (channel !== 'comment' || platform !== 'douyin') return fail('不支持这项刷新操作');
    if (state.threadId !== payload.threadId) return fail('原评论所属作品尚未核对，已停止刷新');
    if (hasDraft()) return { ok: true, skipped: true };
    const pending = detail => ({ ...fail(detail), identity: state.identity, renderPending: true, renderStage: 'comment-sort' });
    const labels = ['按点赞量排序', '按评论时间排序'];
    if (!labels.includes(payload.label)) return fail('评论排序方式不受支持');
    if (redesignedComments) {
      const roots = all('main.creator-comment-redesign');
      if (roots.length !== 1) return fail('无法唯一确认新版评论管理区域');
      const expectedOptions = [{ label: '最新发布', value: 0 }, { label: '最早发布', value: 1 }, { label: '最多点赞', value: 2 }];
      const targetLabel = payload.label === '按点赞量排序' ? '最多点赞' : '最新发布';
      const controls = all('main.creator-comment-redesign [role="combobox"]');
      if (!controls.length) return pending('评论排序控件正在加载');
      const candidates = controls.filter(element => {
        if (element.closest('main.creator-comment-redesign') !== roots[0]) return false;
        const props = nearestControlProps(element, value => Array.isArray(value.optionList));
        if (!props || props.optionList.length !== expectedOptions.length || props.disabled === true || props.multiple === true) return false;
        if (!expectedOptions.every((option, index) => props.optionList[index]?.label === option.label && props.optionList[index]?.value === option.value)) return false;
        return expectedOptions.some(option => option.value === props.value && option.label === normalized(element.textContent));
      });
      if (candidates.length !== 1) return fail('无法唯一核对新版评论排序控件，未切换筛选');
      const control = candidates[0];
      if (control.getAttribute('aria-disabled') === 'true' || control.closest('[inert]')) return fail('评论排序控件当前不可用');
      const controlsId = control.getAttribute('aria-controls');
      if (typeof controlsId !== 'string' || !/^douyin-creator-interactive-select-[A-Za-z0-9_-]+$/.test(controlsId)) return fail('评论排序菜单缺少可核对的关联');
      const matchingPopups = Array.from(document.querySelectorAll('[id]')).filter(element => element.getAttribute('id') === controlsId);
      if (matchingPopups.length > 1) return fail('评论排序菜单关联不唯一，已停止刷新');
      const popup = matchingPopups[0];
      const lists = popup ? [...popup.querySelectorAll('[role="listbox"]')].filter(visible) : [];
      if (lists.length > 1) return fail('评论排序菜单不唯一，已停止刷新');
      const options = lists.length ? [...lists[0].querySelectorAll('[role="option"]')].filter(visible) : [];
      if (options.length && (options.length !== expectedOptions.length || !expectedOptions.every(option => options.filter(element => normalized(element.textContent) === option.label).length === 1))) return fail('评论排序选项发生变化，已停止刷新');
      if (operation === 'refreshOpen') {
        if (lists.length || control.getAttribute('aria-expanded') === 'true') return { ok: true, unchanged: true };
        control.click(); return { ok: true };
      }
      if (!lists.length || !options.length) return pending('评论排序菜单正在加载');
      const option = options.find(element => normalized(element.textContent) === targetLabel);
      if (!option || option.getAttribute('aria-disabled') === 'true' || option.closest('[inert]')) return fail('评论排序选项当前不可用');
      option.click(); return { ok: true };
    }
    const selects = all('.comment-container .semi-select');
    if (!selects.length) return pending('评论排序控件正在加载');
    if (selects.length !== 1) return fail('评论排序控件不唯一，已停止刷新');
    const options = all('[role="option"]').filter(element => normalized(element.textContent) === payload.label);
    if (options.length > 1) return fail('评论排序选项不唯一，已停止刷新');
    if (operation === 'refreshOpen') {
      // Repeated refreshes can encounter a menu left open after a draft was
      // preserved. Never toggle an already expanded or rendered menu closed.
      const knownOptions = all('[role="option"]').filter(element => labels.includes(normalized(element.textContent)));
      if (labels.some(label => knownOptions.filter(element => normalized(element.textContent) === label).length > 1)) return fail('评论排序选项不唯一，已停止刷新');
      if (knownOptions.length || selects[0].getAttribute('aria-expanded') === 'true') return { ok: true, unchanged: true };
      selects[0].click(); return { ok: true };
    }
    if (!options.length) return pending('评论排序选项正在加载');
    options[0].click(); return { ok: true };
  }
  if (operation === 'selectThread') {
    if (payload.threadId === state.threadId) return { ok: true };
    if (hasDraft()) return fail('当前输入框有未发送内容，已保留');
    if (channel === 'comment') return fail('原评论所属作品已切换，请打开原作品后重新检查连接');
    if (!threads.includes(payload.threadId)) return { ...fail('原始对话当前未加载'), ...(platform === 'xiaohongshu' ? { errorCode: 'XHS_THREAD_NOT_FOUND' } : {}) };
    let candidates = [];
    if (platform === 'xiaohongshu') candidates = all('.xhs-im-conv-item').filter(row => row.getAttribute('data-conv-id') === payload.threadId && row.getAttribute('data-conv-kind') === 'c2c');
    else candidates = all('[data-e2e="conversation-item"]').filter(row => {
      let fiber = row[Object.keys(row).find(key => key.startsWith('__reactFiber$'))];
      for (let depth = 0; fiber && depth < 80; depth++, fiber = fiber.return) {
        const conv = fiber.memoizedProps?.conversation;
        if (conv) return String(conv.id) === payload.threadId && conv.type === 1;
      }
      return false;
    });
    if (candidates.length !== 1) return fail('无法唯一定位原对话');
    if (platform === 'douyin') candidates[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    else candidates[0].click();
    return { ok: true };
  }
  if (payload.outreach) {
    const targets = state.threadDetails.filter(thread => !thread.isGroup && thread.id === state.threadId && thread.peerId === payload.recipientId && thread.peerVerified === true);
    if (channel !== 'dm' || !/^[0-9a-f-]{36}$/i.test(payload.taskId || '') || payload.threadId !== state.threadId || targets.length !== 1 || state.peerId !== payload.recipientId || state.peerVerified !== true) return fail('协作任务的接收人、资料或单聊无法唯一核对，未发送');
  }
  if (payload.welcome) {
    const targets = state.threadDetails.filter(thread => !thread.isGroup && thread.id === state.threadId && thread.peerId === payload.recipientId && thread.peerVerified === true);
    if (channel !== 'dm' || payload.threadId !== state.threadId || targets.length !== 1 || state.peerId !== payload.recipientId || state.peerVerified !== true || payload.recipientId !== payload.message?.senderId) return fail(commentPrivate ? '评论私信接收人不能与原评论作者唯一对应，未发送' : '欢迎语接收人不能与关注记录唯一对应，未发送');
    if (commentPrivate) {
      // The manager re-reads this exact original comment on its own source
      // page before claiming the send. This page independently binds that
      // frozen author to the current verified single chat. Keep the comment
      // envelope intact; a comment must never masquerade as a follow event.
      const source = payload.message;
      if (source?.platform !== 'douyin' || source.channel !== 'comment' || source.isOwn !== false || source.isGroup !== false ||
          typeof payload.identity !== 'string' || !/^[1-9]\d{0,63}$/.test(payload.identity) ||
          typeof payload.recipientId !== 'string' || !/^[1-9]\d{0,63}$/.test(payload.recipientId) || payload.recipientId === payload.identity ||
          typeof source.threadId !== 'string' || !/^[^:\s]{1,500}$/.test(source.threadId) ||
          typeof source.externalId !== 'string' || !source.externalId.startsWith(`${source.threadId}:`) ||
          !/^[^:\s]{1,500}:[^:\s]{1,500}$/.test(source.externalId) ||
          typeof source.text !== 'string' || source.text.length > 100000 ||
          typeof source.receivedAt !== 'string' || !Number.isFinite(Date.parse(source.receivedAt)) ||
          (payload.welcomeProfileUrl !== undefined && source.profileUrl !== payload.welcomeProfileUrl) ||
          (payload.welcomeRecipientId !== undefined && payload.welcomeRecipientId !== payload.recipientId)) return fail('原评论、作品或评论作者身份不完整，评论私信未发送');
    } else if (payload.message?.threadId !== `follower:${payload.recipientId}`) return fail('欢迎语接收人不能与关注记录唯一对应，未发送');
  }
  if (operation === 'receipt') {
    if (payload.threadId !== state.threadId) return fail('当前会话发生变化，请人工核对发送结果');
    const claimedAt = Date.parse(payload.claimedAt);
    // Readers and the pre-submit composer check use these exact text rules.
    // Compare in the same form without changing the user-approved payload.
    const expectedText = normalized(payload.replyText);
    const matches = state.receipts.filter(item => Number.isFinite(claimedAt) && Date.parse(item.receivedAt) >= claimedAt && Date.parse(item.receivedAt) <= Date.now() + 60000 && item.text === expectedText && !payload.before.includes(item.id) && (channel !== 'comment' || item.replyTo === payload.replyTo));
    const failures = platform === 'douyin' && channel === 'dm' && (payload.outreach || payload.welcome === true) && Array.isArray(payload.beforeClientIds)
      ? (state.deliveryFailures || []).filter(item => Number.isFinite(claimedAt) && Date.parse(item.receivedAt) >= claimedAt && Date.parse(item.receivedAt) <= Date.now() + 60000 &&
        item.threadId === payload.threadId && item.senderId === payload.identity && item.text === expectedText && typeof item.clientId === 'string' && item.clientId &&
        !payload.beforeClientIds.includes(item.clientId) && [-2, -3].includes(item.status) && typeof item.responseStatus === 'string' && /^[1-9]\d{0,9}$/.test(item.responseStatus)) : [];
    if (!matches.length && failures.length === 1) {
      const rejected = failures[0], tips = normalized(rejected.tips);
      let code = 'task-error', scope = 'task', detail = '平台明确拒绝了本条消息，未送达接收人。';
      if (/^给陌生人发送消息已达到今日上限[，,]请明天再发送陌生人消息[。.!！]?$/.test(tips)) {
        code = 'account-limit'; scope = 'account'; detail = '该账号今日陌生人私信次数已达到平台上限。';
      } else if (/^对方设置了仅他关注的人可发消息[，,]由于你不在范围内[，,]暂无法给对方发送消息[。.!！]?$/.test(tips)) {
        code = 'recipient-restricted'; detail = '对方仅接收其关注账号的私信，当前账号无法发送。';
      } else if ([7400, 8201, 8402, 7183].includes(rejected.checkStatus)) {
        code = 'account-unavailable'; scope = 'account'; detail = '平台要求处理账号身份或私信使用条件，该账号暂不能继续发送。';
      }
      return { ok: true, receipt: null, failure: { outcome: 'not-sent', scope, code, detail, stage: 'receipt', evidence: `platform-rejection:${rejected.id}` } };
    }
    return { ok: true, receipt: matches.length === 1 && !failures.length ? `platform:${matches[0].id}` : null };
  }
  if (operation === 'probeComposer' && (channel !== 'dm' || (!payload.outreach && !(payload.welcome === true && (homeEntry || platform === 'xiaohongshu'))))) return fail('输入框预检仅用于已核对接收人的私信任务');
  let message;
  if (payload.outreach) {
    // A task is intentionally not represented as a received platform message.
    message = { externalId: `outreach:${payload.taskId}`, senderId: payload.recipientId, threadId: state.threadId };
  } else if (payload.welcome) {
    message = payload.message;
  } else {
    const mayWaitForMessage = platform === 'xiaohongshu' && channel === 'dm' && operation === 'prepare' &&
      typeof payload.message?.externalId === 'string' && payload.message.externalId &&
      typeof payload.message?.threadId === 'string' && payload.message.threadId &&
      typeof payload.message?.senderId === 'string' && payload.message.senderId && typeof payload.message?.text === 'string';
    if (mayWaitForMessage && payload.message.threadId !== state.threadId) {
      return { ...fail('小红书正在切换到原始私信会话，当前未填写或提交'), ready: false, renderPending: true,
        renderStage: 'message-thread', errorCode: 'MESSAGE_THREAD_LOADING', identity: state.identity };
    }
    const matches = state.messages.filter(item => item.externalId === payload.message?.externalId && item.threadId === payload.message?.threadId);
    if (!matches.length && mayWaitForMessage) {
      return { ...fail('小红书原始私信历史正在加载，当前未填写或提交'), ready: false, renderPending: true,
        renderStage: 'message-history', errorCode: 'MESSAGE_HISTORY_LOADING', identity: state.identity };
    }
    if (matches.length !== 1) return fail('原始消息不在当前页面或无法唯一识别');
    message = matches[0];
    if (message.isOwn || message.isGroup || message.senderId !== payload.message.senderId || message.text !== payload.message.text || message.threadId !== state.threadId) return fail('原消息或接收对象发生变化，未发送');
  }
  let row;
  if (channel === 'comment') {
    if (redesignedComments) {
      const roots = all('main.creator-comment-redesign');
      if (roots.length !== 1) return fail('无法唯一确认新版评论管理区域');
      const rows = [];
      const counts = new Map();
      for (const body of document.querySelectorAll('main.creator-comment-redesign div[class*="comment-content-text-"]')) {
        const content = body.parentElement?.closest('div[class*="content-"]');
        const candidate = content?.parentElement?.closest('div[class*="container-"]');
        if (!candidate || body.closest('main.creator-comment-redesign') !== roots[0] || candidate.closest('main.creator-comment-redesign') !== roots[0]) return fail('评论正文与回复区域的归属无法确认');
        if (!counts.has(candidate)) rows.push(candidate);
        counts.set(candidate, (counts.get(candidate) || 0) + 1);
      }
      if ([...counts.values()].some(count => count !== 1) || !Number.isSafeInteger(message.domIndex) || message.domIndex < 0) return fail('原评论的页面位置无法唯一核对');
      row = rows[message.domIndex];
      if (message.canReply !== true || typeof message.replyTo !== 'string' || !message.replyTo || typeof message.levelOneCid !== 'string' || !message.levelOneCid) return fail('原评论当前不可回复或缺少已核对的回复目标');
    } else if (platform === 'douyin') {
      const rows = [...new Set([...document.querySelectorAll('pre[class*="cmt-text-"]')].map(element => element.closest('div[class*="cmt-item-"]')).filter(Boolean))];
      row = rows[message.domIndex];
    } else row = document.querySelectorAll('.notification-page .interaction-content')[message.domIndex]?.closest('.container');
    if (!row || !visible(row)) return fail('未找到可见的原评论');
  }
  const ownCommentEditor = element => !redesignedComments || element.closest('div[class*="reply-content-"]')?.parentElement?.closest('div[class*="container-"]') === row;
  if (operation === 'prepare') {
    if (xhsAuxiliaryDraft()) return fail('小红书私信有未发送的引用或附件，已保留，请先人工处理');
    if (redesignedComments && hasDraft()) return fail('评论页面有未发送草稿，已保留，请先人工处理');
    if (row) {
      if ([...row.querySelectorAll('textarea,[contenteditable="true"]')].some(element => visible(element) && ownCommentEditor(element))) return { ok: true };
      const replies = [...row.querySelectorAll('*')].filter(element => visible(element) && normalized(element.textContent) === '回复' && ![...element.children].some(child => normalized(child.textContent) === '回复') && (!redesignedComments ||
        element.tagName === 'DIV' && String(element.getAttribute('class') || '').split(/\s+/).some(name => name.startsWith('item-')) && element.closest('div[class*="container-"]') === row &&
        element.getAttribute('aria-disabled') !== 'true' && getComputedStyle(element).pointerEvents !== 'none'));
      if (replies.length !== 1) return fail('无法唯一定位这条评论的回复按钮');
      replies[0].click();
    }
    return { ok: true };
  }
  const selector = channel === 'dm'
    ? (platform === 'xiaohongshu' ? '.xhs-im-input-bar-editor[contenteditable="true"]' : '[data-e2e="msg-input"] [contenteditable="true"]')
    : (platform === 'douyin' ? redesignedComments ? 'div[class*="input-"][contenteditable="true"]' : '[class*="cmt-input-"][contenteditable="true"]' : '.notification-page [contenteditable="true"], .notification-page textarea');
  const editors = channel === 'comment' ? [...row.querySelectorAll(selector)].filter(element => visible(element) && ownCommentEditor(element)) : all(selector);
  if (operation === 'probeComposer' && !editors.length) return { ...fail('私信输入框尚未加载，请稍后重新核对'), renderPending: true };
  if (editors.length !== 1) return fail('没有唯一的回复输入框，请先关闭其他回复编辑框');
  const editor = editors[0];
  const value = () => editorValue(editor);
  let redesignedCommentWrap;
  if (redesignedComments) {
    const section = editor.closest('div[class*="reply-content-"]');
    const wrap = editor.parentElement?.closest('div[class*="wrap-"]');
    const target = nearestControlProps(editor, props => 'cid' in props && 'uid' in props && 'levelOneCid' in props);
    if (!section || section.parentElement?.closest('div[class*="container-"]') !== row || !wrap || wrap.closest('div[class*="reply-content-"]') !== section ||
        !target || target.cid !== message.replyTo || target.uid !== message.senderId || target.levelOneCid !== message.levelOneCid || target.disabled === true || target.buried === true) return fail('评论输入框与原评论接收人不一致，未填写或发送');
    if (editor.isContentEditable !== true || editor.getAttribute('aria-disabled') === 'true' || editor.getAttribute('aria-readonly') === 'true' ||
        editor.closest('[inert], [aria-disabled="true"], [aria-readonly="true"]') || getComputedStyle(editor).pointerEvents === 'none') return fail('评论输入框当前不可编辑，未填写或发送');
    const hasOtherDraft = Array.from(document.querySelectorAll(draftSelector)).some(element => {
      const content = editorValue(element);
      const media = element.querySelectorAll('img,video,audio,svg,canvas,iframe,[data-void="true"],[data-inline-wrapper]').length > 0;
      if (!content && !media) return false;
      return !(operation === 'commit' && element === editor && !media && content === normalized(payload.replyText) && document.activeElement === editor);
    });
    if (hasOtherDraft) return fail('评论页面已有未发送内容或附件，已保留，请先人工处理');
    redesignedCommentWrap = wrap;
  }
  if (platform === 'xiaohongshu' && channel === 'dm') {
    if (xhsAuxiliaryDraft()) return fail('小红书私信有未发送的引用或附件，已保留，请先人工处理');
    if (editor.querySelectorAll('img,video,audio,svg,canvas,iframe,[data-void="true"],[data-inline-wrapper],.xhs-im-input-mention').length) {
      return fail('小红书输入框有表情、提及或附件，已保留，请先人工处理');
    }
    // The official XHS InputBar leaves contenteditable=true even when its
    // disabled prop is true; it applies pointer-events:none via CSS instead.
    // Synthetic Enter would otherwise be silently ignored by handleSend and
    // incorrectly enter receipt waiting. Check the actual editable surface
    // and inherited/ancestor UI restrictions before either fill or commit.
    for (let element = editor; element; element = element.parentElement) {
      if (element.disabled === true || element.readOnly === true || element.getAttribute('aria-disabled') === 'true' ||
          element.getAttribute('aria-readonly') === 'true' || element.closest('[inert]') || getComputedStyle(element).pointerEvents === 'none') {
        return fail('小红书当前私信输入框不可用，请检查平台提示，当前未提交');
      }
    }
    if (editor.isContentEditable === false) return fail('小红书当前私信输入框不可编辑，当前未提交');
    // Saved official InputBar truncates getPlainText().length at 1000 UTF-16
    // units. Refuse before filling, so a longer approved reply never becomes
    // a truncated draft and is never submitted as a different message.
    if (['send', 'commit'].includes(operation) && typeof payload.replyText === 'string' && payload.replyText.length > 1000) {
      return fail('小红书私信最多 1000 字符，请缩短文案后重新确认；当前未填写或提交');
    }
  }
  if (operation === 'probeComposer') {
    if (editor.isContentEditable !== true || editor.disabled === true || editor.readOnly === true ||
        editor.getAttribute('aria-disabled') === 'true' || editor.getAttribute('aria-readonly') === 'true' ||
        editor.closest('[inert], [aria-disabled="true"], [aria-readonly="true"]')) return fail('当前私信输入框不可编辑，请检查平台提示后重新核对');
    if (value() || editor.querySelectorAll('img,video,audio,svg,canvas,iframe,[data-void="true"],[data-inline-wrapper]').length) return fail('输入框已有未发送内容或附件，已保留，请先人工处理');
    // An empty official composer normally has a disabled send button. This
    // probe checks only the editor; it never focuses, fills or submits it.
    return { ok: true, ready: true };
  }
  if (operation === 'send') {
    if (value()) return fail('输入框已有未发送内容，已保留，请先人工处理');
    if (typeof payload.replyText !== 'string' || !payload.replyText.trim() || payload.replyText.length > 5000) return fail('回复文字无效');
    editor.focus();
    if (document.activeElement !== editor) return fail('输入框焦点无法确认，未填写');
    // Fill the exact validated element in the same page turn. A later global
    // keyboard operation could otherwise insert into a newly selected chat.
    if (platform === 'douyin' && channel === 'dm' && !('value' in editor)) {
      // Use Chromium's normal editable transaction so the platform's editor
      // receives its regular input event without replacing its structured DOM.
      // Focus and the exact peer were validated in this synchronous page turn.
      if (typeof document.execCommand !== 'function' || !document.execCommand('insertText', false, payload.replyText)) return fail('平台输入框未接受文字，请检查页面，当前未发送');
      return { ok: true, before: state.receipts.map(item => item.id), beforeClientIds: state.outgoingClientIds || [], replyTo: message.replyTo || message.externalId.slice(message.externalId.indexOf(':') + 1) };
    } else if ('value' in editor) {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(editor), 'value')?.set;
      if (!setter) return fail('输入框类型变化，未填写');
      setter.call(editor, payload.replyText);
    } else {
      editor.textContent = payload.replyText;
      const range = document.createRange(); range.selectNodeContents(editor); range.collapse(false);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    }
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: payload.replyText }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, before: state.receipts.map(item => item.id), beforeClientIds: state.outgoingClientIds || [], replyTo: message.replyTo || message.externalId.slice(message.externalId.indexOf(':') + 1) };
  }
  if (operation !== 'commit') return fail('不支持的操作');
  if (value() !== normalized(payload.replyText) || document.activeElement !== editor) return fail('发送前输入内容或焦点发生变化，未发送');
  if (channel === 'dm' && platform === 'xiaohongshu') {
    // The normal official keydown listener handles Enter. Target validation and
    // dispatch are synchronous, leaving no native-keyboard routing gap.
    try { editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true })); return { ok: true, submitted: true }; }
    catch { return { ok: false, submitted: 'unknown', detail: '提交欢迎语或回复时发生异常，请人工核对' }; }
  }
  let buttons;
  if (channel === 'dm') buttons = all('svg.e2e-send-msg-btn');
  else if (redesignedCommentWrap) buttons = [...redesignedCommentWrap.querySelectorAll('button')].filter(element => visible(element) && normalized(element.textContent) === '发送' && element.closest('div[class*="wrap-"]') === redesignedCommentWrap);
  else {
    const region = platform === 'douyin' ? editor.closest('[class*="cmt-editor-"]') || row : editor.closest('.container') || editor.parentElement?.parentElement;
    buttons = region ? [...region.querySelectorAll('button,[role="button"],div,span')].filter(element => visible(element) && normalized(element.textContent) === '发送' && ![...element.children].some(child => normalized(child.textContent) === '发送')) : [];
  }
  buttons = [...new Set(buttons.map(element => element.closest('button') || element))];
  if (buttons.length !== 1 || buttons[0].disabled || buttons[0].getAttribute('aria-disabled') === 'true') return fail('没有唯一可用的发送按钮，未发送');
  try { buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })); return { ok: true, submitted: true }; }
  catch { return { ok: false, submitted: 'unknown', detail: '点击发送时发生异常，需要人工核对' }; }
}
function builtinScript(profile, operation, payload = {}) {
  const reader = profile.channel === 'dm' ? readPageState : profile.channel === 'follow' ? readFollowState : readCommentState;
  return `(${operate.toString()})(${JSON.stringify(profile.platform)},${JSON.stringify(profile.channel)},${JSON.stringify(operation)},${JSON.stringify(payload)},${reader.toString()})`;
}
module.exports = { builtinProfile, builtinScript, operate };
