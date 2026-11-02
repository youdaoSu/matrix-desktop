'use strict';

// Original read-only candidate for the public Xiaohongshu note page. This is
// deliberately separate from the account owner's notification reply adapter.
// Selector evidence: saved official index + editor chunk 5382 (2026-10-13).
// No live editor-target or delivery-receipt calibration has been completed.
function probePublicCommentPage(platform, operation, payload) {
  const supported = platform === 'xiaohongshu';
  const result = {
    ok: false, ready: false, readable: false, targetVerified: false,
    supported, submitted: false, receipt: null, invalidRows: 0,
    capability: { platform, supported, readOnly: true, liveVerified: false, sendVerified: false, canSend: false, scope: 'rendered-public-comment-reply-probe' },
    gaps: ['live-page-calibration', 'editor-reply-target-id', 'server-reply-parent-and-receipt'],
    detail: '',
  };
  if (!supported) { result.detail = '此公开评论候选仅支持小红书，只读且未开放发送'; return result; }
  if (operation === 'capability') { result.ok = true; result.detail = '仅可只读核对公开评论；实页目标与回执尚未校准，发送关闭'; return result; }
  // This hard gate is not configurable through payload, DOM data or page state.
  // Even receipt requests cannot turn a synthetic/observed row into a send proof.
  if (!['probe', 'scan'].includes(operation)) {
    result.detail = '公开评论适配器尚未完成实页回复目标和回执验证；未填写、未点击、未发送';
    return result;
  }
  const get = (value, key) => { try { return value?.[key]; } catch { return undefined; } };
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const text = value => typeof value === 'string' ? value.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').trim() : '';
  const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value) ? value : '';
  const query = (root, selector) => { try { return Array.from(root.querySelectorAll(selector)); } catch { return []; } };
  const attr = (element, key) => { try { return element.getAttribute(key) || ''; } catch { return ''; } };
  const closest = (element, selector) => { try { return element.closest(selector); } catch { return null; } };
  const matches = (element, selector) => { try { return element.matches(selector); } catch { return false; } };
  const loaded = element => {
    try {
      if (element?.nodeType !== 1 || !element.isConnected || !element.getClientRects().length) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    } catch { return false; }
  };
  const visible = (root, selector) => query(root, selector).filter(loaded);
  const one = (root, selector, label) => {
    const elements = visible(root, selector);
    if (elements.length !== 1) throw new Error(`无法唯一确认${label}，请在官方页面检查`);
    return elements[0];
  };
  const domText = element => {
    let count = 0;
    const walk = node => {
      if (++count > 10000) throw new Error('文本节点过多');
      if (node.nodeType === 3) return node.nodeValue || '';
      if (node.nodeType !== 1) return '';
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return '';
      if (node.tagName === 'BR') return '\n';
      if (node.tagName === 'IMG') {
        const alt = attr(node, 'alt');
        if (!alt) throw new Error('图片缺少文字');
        return alt;
      }
      return Array.from(node.childNodes || []).map(walk).join('');
    };
    try { return text(walk(element)); } catch { return ''; }
  };
  const official = value => {
    let url; try { url = new URL(value, 'https://www.xiaohongshu.com'); } catch { return null; }
    return url.origin === 'https://www.xiaohongshu.com' && !url.username && !url.password ? url : null;
  };
  const profileId = element => {
    const url = official(attr(element, 'href'));
    const match = url && /^\/user\/profile\/([a-f\d]{24})\/?$/i.exec(url.pathname);
    return match ? match[1] : '';
  };
  const noteIdFromUrl = value => {
    const url = official(value);
    const match = url && /^\/(?:explore|discovery\/item)\/([a-f\d]{24})\/?$/i.exec(url.pathname);
    return match ? match[1] : '';
  };
  const originalTime = value => {
    if (typeof value !== 'number' && !(typeof value === 'string' && /^\d{9,13}$/.test(value))) return '';
    const raw = Number(value), ms = raw < 100000000000 ? raw * 1000 : raw;
    return Number.isSafeInteger(raw) && ms >= 946684800000 && ms <= 4102444800000 ? new Date(ms).toISOString() : '';
  };
  try {
    const task = get(payload, 'task'), source = get(payload, 'sourceMessage');
    if (!object(task) || !object(source)) throw new Error('缺少固定协作任务或原评论记录');
    const primary = get(task, 'primaryBinding'), sender = get(task, 'senderBinding');
    const primaryId = id(get(primary, 'identity')), senderId = id(get(sender, 'identity'));
    if (get(task, 'platform') !== platform || get(task, 'channel') !== 'comment' || get(task, 'sourceChannel') !== 'comment'
      || get(primary, 'platform') !== platform || get(sender, 'platform') !== platform || !primaryId || !senderId || primaryId === senderId
      || !get(task, 'primaryAccountId') || !get(task, 'accountId') || task.primaryAccountId === task.accountId) throw new Error('主账号与协作账号的固定身份不正确');
    if (source.platform !== platform || source.channel !== 'comment' || source.id !== task.sourceMessageId || source.externalId !== task.sourceExternalId
      || source.accountId !== task.primaryAccountId || source.senderId !== task.recipientId || source.isOwn !== false || source.isGroup !== false
      || !id(source.senderId) || [primaryId, senderId].includes(source.senderId) || !text(source.text)) throw new Error('任务与主账号的原评论来源不一致');
    const external = /^([a-f\d]{24}):([A-Za-z0-9_-]{1,256})$/i.exec(source.externalId);
    if (!external) throw new Error('原评论缺少明确的作品与评论编号');
    const expectedNoteId = external[1], expectedCommentId = external[2];
    if (noteIdFromUrl(task.workUrl) !== expectedNoteId || noteIdFromUrl(location.href) !== expectedNoteId) throw new Error('当前官方笔记链接与任务作品不一致');

    const identities = new Set();
    for (const anchor of visible(document, 'a[href]')) {
      if (!closest(anchor, '.user.side-bar-component, .bottom-menu-component')) continue;
      if (text(anchor.textContent) !== '我' && attr(anchor, 'title') !== '我') continue;
      const uid = profileId(anchor); if (uid) identities.add(uid);
    }
    if (identities.size !== 1 || !identities.has(senderId)) throw new Error('当前登录者与任务的协作账号身份不一致或无法唯一确认');
    const panel = one(document, '.interaction-container', '当前笔记详情区');
    const author = one(panel, '.author-container .author-wrapper .name', '笔记作者链接');
    if (profileId(author) !== primaryId) throw new Error('笔记作者主页与主账号绑定不一致');
    const rows = visible(panel, '.comment-item[id]');
    if (rows.length > 1000) throw new Error('已加载评论超过候选读取范围');
    const targetRows = rows.filter(row => attr(row, 'id') === `comment-${expectedCommentId}`);
    if (targetRows.length !== 1) throw new Error('原评论未加载、已移除或编号不唯一');
    const row = targetRows[0];
    const noteCandidates = [], commentCandidates = new Set();
    const root = document.getElementById('app'), app = get(root, '__vue_app__');
    const stack = [get(root, '_vnode'), get(get(app, '_container'), '_vnode'), get(get(app, '_instance'), 'subTree')].map(node => ({ node, commentProps: null }));
    const visited = new Set();
    let count = 0;
    while (stack.length && count++ < 25000) {
      const entry = stack.pop(), node = entry.node;
      if (node === null || typeof node !== 'object' || visited.has(node)) continue;
      visited.add(node);
      if (Array.isArray(node)) { for (const child of node) stack.push({ node: child, commentProps: entry.commentProps }); continue; }
      const component = get(node, 'component');
      const props = get(component, 'props') || get(node, 'props');
      const name = get(get(component, 'type'), '__name') || get(get(node, 'type'), '__name');
      const element = get(node, 'el');
      let commentProps = entry.commentProps;
      if (name === 'CommentItem') commentProps = object(props) ? props : null;
      if (name === 'Author' && loaded(element) && closest(element, '.interaction-container') === panel && !closest(element, '.comment-item')) noteCandidates.push(get(props, 'note'));
      // CommentItem has a fragment root; associate inherited props only with
      // that component's rendered row, not arbitrary siblings or page stores.
      if (element === row && object(commentProps)) commentCandidates.add(commentProps);
      for (const child of [get(component, 'subTree'), get(node, 'subTree'), get(node, 'children'), get(node, 'ssContent'), get(get(node, 'suspense'), 'activeBranch')]) stack.push({ node: child, commentProps });
    }
    if (stack.length) throw new Error('页面组件数量超过读取范围');
    if (!noteCandidates.length || !commentCandidates.size) throw new Error('笔记或原评论没有可核对的已渲染组件数据');
    for (const note of noteCandidates) {
      const user = get(note, 'user');
      if (id(get(note, 'noteId')) !== expectedNoteId || id(get(user, 'userId')) !== primaryId || !text(get(user, 'nickname')) || domText(author) !== text(get(user, 'nickname'))) throw new Error('笔记数据、作者名称或页面链接不一致');
    }
    const rowOnly = selector => visible(row, selector).filter(element => closest(element, '.comment-item') === row);
    const names = rowOnly('.author .name[data-user-id]'), bodies = rowOnly('.content'), replyControls = rowOnly('.reply.icon-container');
    if (names.length !== 1 || bodies.length !== 1 || replyControls.length !== 1) throw new Error('原评论的作者、正文或回复控件不唯一');
    const validated = new Map();
    for (const props of commentCandidates) {
      const comment = get(props, 'comment'), user = get(comment, 'userInfo');
      const commentId = id(get(comment, 'id')), commentUserId = id(get(user, 'userId'));
      const content = text(get(comment, 'content')), receivedAt = originalTime(get(comment, 'createTime'));
      if (id(get(props, 'nodeId')) !== expectedNoteId || id(get(props, 'noteOwnerId')) !== primaryId || commentId !== expectedCommentId
        || commentUserId !== source.senderId || content !== text(source.text) || !receivedAt || get(comment, 'invalid') === true) throw new Error('原评论编号、作品、作者、正文或原始时间无法核对');
      if ((Array.isArray(get(comment, 'pictures')) && comment.pictures.length) || get(comment, 'audioInfo') || (Array.isArray(get(comment, 'atUsers')) && comment.atUsers.length)) throw new Error('只读候选暂不核对含图片、语音或提及的评论');
      if (attr(names[0], 'data-user-id') !== commentUserId || profileId(names[0]) !== commentUserId || !text(get(user, 'nickname'))
        || domText(names[0]) !== text(get(user, 'nickname')) || domText(bodies[0]) !== content) throw new Error('原评论的可见作者、主页或正文与数据不一致');
      const item = { noteId: expectedNoteId, commentId, senderId: commentUserId, text: content, receivedAt };
      validated.set(JSON.stringify(item), item);
    }
    if (validated.size !== 1) throw new Error('同一原评论对应冲突的数据');
    const container = one(panel, '.engage-bar-container', '当前笔记评论编辑区');
    const editors = visible(document, 'p#content-textarea.content-input[contenteditable="true"]');
    if (editors.length !== 1 || closest(editors[0], '.engage-bar-container') !== container) throw new Error('评论输入框未加载或不唯一');
    const editor = editors[0], button = one(container, 'button.btn.submit', '评论发送控件');
    const banners = visible(container, '.reply-content');
    if (banners.length > 1) throw new Error('当前回复提示不唯一');
    const draft = text(editor.textContent) || query(editor, 'img, a').length > 0;
    result.ok = result.readable = result.targetVerified = true;
    result.identity = senderId;
    result.noteId = expectedNoteId;
    result.noteAuthorId = primaryId;
    result.sourceComment = Array.from(validated.values())[0];
    result.hasDraft = Boolean(draft);
    result.editor = { unique: true, empty: !draft, active: matches(closest(editor, '.engage-bar'), '.active'), submitEnabled: button.disabled !== true && attr(button, 'aria-disabled') !== 'true', replyBannerPresent: banners.length === 1, replyTargetVerified: false };
    result.detail = draft ? '已只读核对作品、账号与原评论；已有草稿完整保留，回复目标和回执未实页校准，发送关闭'
      : '已只读核对作品、账号、原评论与唯一编辑器；回复目标和回执未实页校准，发送关闭';
    return result;
  } catch (error) {
    result.invalidRows = 1;
    result.detail = error instanceof Error ? error.message : '公开评论页面结构发生变化，候选读取停止';
    return result;
  }
}

function publicCommentScript(platform, operation, payload = {}) {
  if (typeof platform !== 'string' || typeof operation !== 'string') throw new Error('公开评论候选参数不正确');
  const data = JSON.stringify(payload);
  if (data === undefined || data.length > 300000) throw new Error('公开评论候选载荷不正确或过长');
  return `(${probePublicCommentPage.toString()})(${JSON.stringify(platform)},${JSON.stringify(operation)},${data})`;
}

module.exports = { publicCommentScript, probePublicCommentPage };
