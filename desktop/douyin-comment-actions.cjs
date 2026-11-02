// Independent rendered-control adapter. Static route/operation facts verified
// in creator work-management.c9d22583.js, SHA256 a042534e40ffcc9c9bb96c13bd2bd8aa786903cce7833a150e3e55c03ff9b8dc.
// No SDK closure calls, unsigned writes, title matching, deletes or read ACKs.
function commentControl(input) {
  if (location.origin !== 'https://creator.douyin.com' || location.pathname !== '/creator-micro/work-management/work-detail/' + input.workId) throw Error('目标作品页面已变化，未操作');
  const shown = e => e?.isConnected && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== 'hidden';
  const text = e => (e?.innerText || e?.textContent || '').trim();
  if ([...document.querySelectorAll('input')].some(e => shown(e) && /password|one-time-code|captcha|验证码/.test([e.type,e.autocomplete,e.placeholder].join(' ')))) throw Error('官网需要本人登录或验证，未操作');
  const data = node => {
    let fiber = node[Object.keys(node).find(k => k.startsWith('__reactFiber$'))];
    for (let n = 0; fiber && n < 7; fiber = fiber.return, n++) {
      const p = fiber.memoizedProps;
      if (p?.comment && typeof p.comment.text === 'string' && (p.comment.cid || p.comment.comment_id)) return p.comment;
    }
  };
  const nodes = [...document.querySelectorAll('[class*="comment-item"],[data-comment-id]')].filter(shown);
  const found = nodes.map(node => ({ node, row: data(node) })).filter(v => v.row && String(v.row.cid ?? v.row.comment_id ?? '') === input.commentId);
  if (found.length !== 1) return { found: false };
  const { node, row } = found[0];
  const own = selector => [...node.querySelectorAll(selector)].filter(e => shown(e) && e.closest('[class*="comment-item"],[data-comment-id]') === node);
  const likedValue = row.user_digg ?? row.user_digged;
  const liked = [true,1,'1'].includes(likedValue) ? true : [false,0,'0'].includes(likedValue) ? false : undefined;
  const rawCount=row.digg_count;
  const likeCount=(typeof rawCount==='number'||typeof rawCount==='string'&&/^\d+$/.test(rawCount))?Number(rawCount):NaN;
  const current = { found: true, liked, ...(Number.isSafeInteger(likeCount) && likeCount >= 0 ? { likeCount } : {}) };
  const click = button => {
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true' || /disabled/.test(button.className || '')) throw Error('目标评论控件不可操作，未提交');
    button.scrollIntoView({ block: 'center' });
    const r = button.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    if (!shown(button) || hit !== button && !button.contains(hit)) throw Error('目标评论控件被遮挡，未提交');
    button.click();
  };
  if (input.step === 'inspect') return current;
  const operations = own('[class*="operations"] > button');
  if (input.step === 'like') {
    if (liked === undefined) throw Error('官网未提供此评论的本人点赞状态，未猜测或操作');
    if (liked === input.liked) return { ...current, already: true };
    // In this exact creator component: direct buttons are like, dislike,
    // reply, delete, report. Require the labelled reply/delete anchors too.
    if (operations.length !== 5 || text(operations[2]) !== '回复' || text(operations[3]) !== '删除') throw Error('官网评论操作布局已变化，未操作');
    click(operations[0]); return { submitted: true };
  }
  if (input.step === 'open-reply') {
    const replies = operations.filter(b => text(b) === '回复');
    if (replies.length !== 1) throw Error('目标评论回复按钮未唯一定位，未操作');
    const editors = own('[contenteditable=true]');
    if (!editors.length) click(replies[0]); return { opened: true };
  }
  if (input.step === 'reply') {
    const editors = own('[contenteditable=true]');
    if (editors.length !== 1) throw Error('目标评论专属回复框未就绪，未提交');
    const editor = editors[0];
    if (text(editor) && text(editor) !== input.text) throw Error('官网回复框已有其他草稿，未覆盖或提交');
    editor.focus(); const range = document.createRange(); range.selectNodeContents(editor); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.execCommand('insertText', false, input.text);
    if (text(editor) !== input.text) throw Error('回复正文核对失败，未提交');
    const composer = editor.closest('[class*="composer"]');
    const buttons = composer ? [...composer.querySelectorAll('button')].filter(b => shown(b) && text(b) === '发送') : [];
    if (buttons.length !== 1) throw Error('目标评论发送按钮未唯一定位，未提交');
    click(buttons[0]); return { submitted: true };
  }
  if (input.step === 'result') {
    const alerts = [...document.querySelectorAll('[role=alert],.semi-toast-content')].filter(shown).map(text);
    const error = alerts.find(t => /失败|无法|权限|频繁|限制|验证|未通过|违规/.test(t));
    if (error) return { state: 'failed', message: error.slice(0, 180) };
    if (input.action === 'like' && liked === input.liked) return { ...current, state: 'confirmed', message: liked ? '已点赞' : '已取消点赞' };
    return { state: 'unknown' };
  }
  throw Error('不支持的评论操作');
}
function allowCommentRequest(details, intent) {
  if (!intent || intent.used || intent.expires < Date.now() || details.method !== 'POST') return false;
  let u; try { u = new URL(details.url); } catch { return false; }
  if (u.origin !== 'https://creator.douyin.com' || details.webContentsId !== intent.webContentsId) return false;
  const routes = intent.action === 'like' ? ['/aweme/v1/creator/comment/action/', '/aweme/janus/creator/comment/aweme/v1/web/comment/digg/'] : ['/aweme/v1/creator/comment/reply/', '/aweme/janus/creator/comment/aweme/v1/web/comment/multi_publish/'];
  if (!routes.includes(u.pathname)) return false;
  const bytes = details.uploadData;
  if (bytes && (!Array.isArray(bytes) || bytes.length > 1 || bytes.length === 1 && (!bytes[0].bytes || bytes[0].bytes.length > 16384))) return false;
  let p; try {
    const raw = bytes?.length ? Buffer.from(bytes[0].bytes).toString('utf8') : '';
    const body = raw.trim().startsWith('{') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
    if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
    for (const field of ['comment_Id','cid','reply_to_comment_ids','aweme_id','item_id','text','action_type','digg_type']) if (u.searchParams.getAll(field).length > 1 || body[field] !== undefined && u.searchParams.has(field) && String(body[field]) !== u.searchParams.get(field)) return false;
    p = { ...Object.fromEntries(u.searchParams), ...body };
  } catch { return false; }
  const cid = p.comment_Id ?? p.cid ?? p.reply_to_comment_ids;
  if (cid !== intent.commentId || (p.aweme_id ?? p.item_id) !== undefined && (p.aweme_id ?? p.item_id) !== intent.workId) return false;
  if (intent.action === 'reply' && p.text !== intent.text) return false;
  if (intent.action === 'like' && Number(p.action_type ?? p.digg_type) !== (u.pathname.includes('/janus/') ? intent.liked ? 1 : 2 : intent.liked ? 1 : 3)) return false;
  intent.used = true; return true;
}
module.exports = { commentControl, allowCommentRequest };
