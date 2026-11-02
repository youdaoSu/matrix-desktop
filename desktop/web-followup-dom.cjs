// Self-contained visible-control adapter. No platform APIs, framework stores,
// credentials, cross-work title searches, or page-global button fallbacks.
function webFollowupDom(command, input, roots = []) {
  const query = (selector, root) => [...new Set((root ? [root] : [document, ...roots]).flatMap(node => [...node.querySelectorAll(selector)]))];
  const text = node => (node?.innerText || node?.textContent || '').replace(/\s+/g, ' ').trim();
  const visible = node => {
    if (!node?.isConnected || node.disabled || node.getAttribute('aria-disabled') === 'true') return false;
    for (let at = node; at; at = at.parentElement || at.getRootNode().host) { const style = getComputedStyle(at); if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false; }
    const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0;
  };
  const isXhs = input.platform === 'xiaohongshu';
  const host = isXhs ? 'creator.xiaohongshu.com' : 'channels.weixin.qq.com';
  if (location.protocol !== 'https:' || location.hostname !== host || !(isXhs ? /^\/(?:new\/)?note-manager(?:\/|$)/ : /^\/platform\/post\/list\/?$/).test(location.pathname)) throw Error('不在本账号官方作品管理页，未操作追评');
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(input.workId || '') || !/^[a-zA-Z0-9-]{16,80}$/.test(input.nonce || '')) throw Error('缺少准确的原作品ID，未操作追评');
  const idOf = node => node.getAttribute('data-note-id') || node.getAttribute('data-object-id') || node.getAttribute('data-work-id');
  const fromLink = link => { try { const url = new URL(link.getAttribute('href'), location.href); if (isXhs && url.hostname === 'www.xiaohongshu.com') return /^\/(?:explore|discovery\/item)\/([a-f0-9]{24})\/?$/.exec(url.pathname)?.[1]; if (!isXhs && url.hostname === host) return url.searchParams.get('objectId') || url.searchParams.get('object_id'); } catch {} };
  const cards = query('[data-note-id],[data-object-id],[data-work-id],article,.note-item,.publish-list-item,.finder-video-item').filter(node => visible(node) && (idOf(node) === input.workId || query('a[href]', node).some(link => fromLink(link) === input.workId)));
  const smallest = cards.filter(node => !cards.some(other => other !== node && node.contains(other)));
  const state = window.__matrixWebFollowup;
  const buttons = root => query('button,[role=button],a[role=menuitem],[role=menuitem]', root).filter(visible);
  const click = node => {
    node.scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = node.getBoundingClientRect(), hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    if (hit !== node && !node.contains(hit)) throw Error('目标控件被遮挡，尚未点击');
    node.click();
  };
  if (command === 'open') {
    if (smallest.length !== 1) throw Error('未唯一定位原作品ID，未打开其他作品评论');
    const controls = buttons(smallest[0]).filter(node => /^(评论(?:管理)?|查看评论|管理评论)(?:\s*[（(]?\d+[）)]?)?$/.test(text(node) || node.getAttribute('aria-label')));
    if (controls.length !== 1) throw Error('原作品没有唯一可用的评论管理入口；官网可能未开放此入口');
    window.__matrixWebFollowup = { nonce: input.nonce, workId: input.workId, used: false, opened: true };
    click(controls[0]); return { opened: true };
  }
  if (!state || state.nonce !== input.nonce || state.workId !== input.workId || !state.opened) throw Error('原作品评论上下文已变化，未操作');
  const panels = query('[role=dialog],[data-comment-panel],.comment-panel,.comments-panel,.comment-manager').filter(visible);
  const scoped = panels.filter(node => !idOf(node) || idOf(node) === input.workId).filter(node => !panels.some(other => other !== node && other.contains(node)));
  if (scoped.length !== 1 || panels.some(node => idOf(node) && idOf(node) !== input.workId)) throw Error('评论面板不唯一或属于其他作品，已停止');
  const panel = scoped[0];
  const rows = query('[data-comment-id],[data-reply-id]', panel).filter(visible);
  const commentId = node => node.getAttribute('data-comment-id') || node.getAttribute('data-reply-id');
  const content = node => { const values = query('[data-comment-content],.comment-content,.comment-text,.content-text', node).filter(visible); return values.length === 1 ? text(values[0]) : ''; };
  const own = node => query('[data-is-author=true],.author-tag,.author-label,.is-author', node).filter(visible).some(label => /^(作者|我|本人)$/.test(text(label)));
  const comments = rows.filter(node => own(node) && content(node) === input.text).map(node => {
    const raw = query('time[datetime]', node).find(visible)?.getAttribute('datetime') || node.getAttribute('data-create-time');
    const at = raw && /^\d{10,13}$/.test(raw) ? Number(raw) * (raw.length === 10 ? 1000 : 1) : Date.parse(raw || '');
    return { id: commentId(node), ...(Number.isFinite(at) ? { createdAt: new Date(at).toISOString() } : {}), pinned: node.getAttribute('data-pinned') === 'true' || query('[data-pinned=true],.pinned-tag,.top-tag', node).filter(visible).some(label => /^(已置顶|置顶|作者置顶)$/.test(text(label))) };
  }).filter(value => /^[a-zA-Z0-9_-]{1,128}$/.test(value.id || ''));
  if (command === 'read') return { comments, ids: rows.map(commentId).filter(id => /^[a-zA-Z0-9_-]{1,128}$/.test(id || '')).slice(0, 100) };
  const editor = () => {
    const inputs = query('textarea,input[type=text],[contenteditable=true]', panel).filter(node => visible(node) && !node.readOnly && !node.closest('[data-comment-id],[data-reply-id]') && !/搜索|回复|密码|验证码|手机号|search|password|token|tel/i.test([node.placeholder, node.name, node.autocomplete, node.getAttribute('aria-label')].join(' ')));
    if (inputs.length !== 1) throw Error('没有唯一的顶层追评输入框，未选择回复其他人的评论'); return inputs[0];
  };
  if (command === 'fill') {
    const node = editor(), value = node.value ?? node.innerText ?? '';
    if (value.trim() && value.trim() !== input.text) throw Error('官方评论框已有其他草稿，未覆盖');
    if (node.isContentEditable) node.textContent = input.text;
    else Object.getOwnPropertyDescriptor(node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(node, input.text);
    node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); return { filled: true };
  }
  if (command === 'comment') {
    if (state.used) throw Error('本次追评已经尝试发送，只能核对结果');
    const node = editor(); if ((node.value ?? node.innerText ?? '').trim() !== input.text) return { clicked: false, rejectedBeforeClick: true };
    const targets = buttons(panel).filter(button => !button.closest('[data-comment-id],[data-reply-id]') && /^(发送|发送评论|发表评论|发布评论|评论)$/.test(text(button)));
    if (targets.length !== 1) return { clicked: false, rejectedBeforeClick: true };
    state.used = true; click(targets[0]); return { clicked: true };
  }
  if (command === 'pin') {
    const candidates = rows.filter(row => commentId(row) === input.commentId && own(row) && content(row) === input.text);
    if (candidates.length !== 1) throw Error('未唯一核对本条作者评论ID，未置顶其他评论');
    const row = candidates[0]; if (comments.find(comment => comment.id === input.commentId)?.pinned) return { alreadyPinned: true };
    const direct = buttons(row).filter(button => /^(置顶|置顶评论)$/.test(text(button)));
    if (direct.length === 1) { click(direct[0]); return { clicked: true }; }
    if (direct.length > 1) throw Error('置顶入口不唯一，未操作');
    const more = buttons(row).filter(button => /^(更多|更多操作)$/.test(text(button) || button.getAttribute('aria-label')));
    if (more.length !== 1) throw Error('官网没有可唯一识别的置顶控件；本条追评无需重发');
    click(more[0]); state.pinCommentId = input.commentId; return { menuOpened: true };
  }
  if (command === 'pin-menu') {
    if (state.pinCommentId !== input.commentId || !comments.some(comment => comment.id === input.commentId)) throw Error('置顶菜单已失去原评论关联');
    const menus = query('[role=menu]').filter(visible); if (menus.length !== 1) throw Error('未识别唯一评论菜单，未置顶');
    const targets = buttons(menus[0]).filter(button => /^(置顶|置顶评论)$/.test(text(button)));
    if (targets.length !== 1) throw Error('当前官方菜单未提供可用置顶入口'); click(targets[0]); state.pinCommentId = undefined; return { clicked: true };
  }
  throw Error('追评控件命令无效');
}
module.exports = { webFollowupDom };
