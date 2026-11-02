// Read the signed-in creator UI, not an unsigned public-profile API fallback.
// Normal page navigation + scoped normal GET responses/rendered card data. No SDK closure inspection,
// signature emulation, message entry, mark-read, posting or arbitrary URLs.
const { navigateOwnedComment } = require('./douyin-creator-navigation.cjs');
const { commentIdentifier } = require('./douyin-comment-identifiers.cjs');
const { commentControl, allowCommentRequest } = require('./douyin-comment-actions.cjs');
const { registerScopedRequestPolicy } = require('./douyin-scoped-request-policy.cjs');
const { projectCommentMedia } = require('./douyin-creator-preload.cjs');
function creatorPage(input, projectMedia) {
  const id = v => typeof v === 'string' && /^[1-9]\d{0,18}$/.test(v) ? v : Number.isSafeInteger(v) && v > 0 ? String(v) : '';
  const commentId = v => id(v) || (typeof v === 'string' && /^[\x21-\x7e]{1,512}$/.test(v) && !/^(?:https?|file|data|javascript):/i.test(v) && !/^\d+$/.test(v) ? v : '');
  const shown = e => e?.isConnected && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden';
  const text = e => (e?.innerText || e?.textContent || '').trim().replace(/\s+/g, ' ');
  const q = selector => [...document.querySelectorAll(selector)].filter(shown);
  const fields = new Set();
  const records = element => {
    const result = [], aliases = ['item', 'data', 'itemData', 'video', 'videoInfo', 'aweme', 'awemeInfo', 'work', 'workInfo', 'comment', 'commentInfo', 'commentData'];
    for (let e = element, n = 0; e && n < 4; e = e.parentElement, n++) {
      let fiber = e[Object.keys(e).find(k => k.startsWith('__reactFiber$'))];
      for (let j = 0; fiber && j < 7; fiber = fiber.return, j++) {
        const props = fiber.memoizedProps; if (!props || typeof props !== 'object') continue;
        for (const name of Object.keys(props)) if (/^[a-zA-Z_][a-zA-Z0-9_]{0,24}$/.test(name) && fields.size < 20) fields.add(name);
        const first = [props, ...aliases.map(k => props[k])].filter(v => v && typeof v === 'object' && !Array.isArray(v));
        const add = value => result.push(value === props.comment && id(props.levelOneCid) ? { ...value, matrixParentId: id(props.levelOneCid) } : value);
        for (const value of first) {
          // The current creator UI passes reply ancestry alongside `comment`,
          // not inside the API record. Copy only that rendered relationship.
          add(value);
          for (const key of aliases) if (value[key] && typeof value[key] === 'object' && !Array.isArray(value[key])) add(value[key]);
        }
      }
    }
    return result;
  };
  const wait = detail => ({ waiting: true, detail });
  if (location.origin !== 'https://creator.douyin.com' || !id(input.ownUid)) throw Error('抖音创作者本人页面或身份无效');
  if (/login|passport|verify/.test(location.pathname) || /安全验证|访问受限|验证码/.test(document.title || '') || q('input[autocomplete="one-time-code"],input[type="password"]').length) throw Error('抖音创作者页面需要本人登录或验证，请到账号管理处理');
  if (!/^\d{1,19}$/.test(input.cursor || '0')) throw Error('抖音创作者分页游标无效');
  const observed = window.__matrixCreatorObservedPages;
  if (input.requireResponses && observed?.version !== 1) return wait('等待只读分页响应观察器就绪');
  if (observed?.version === 1 && observed.pages instanceof Map) {
    const workRoute = /^\/creator-micro\/work-management\/work-detail\/([1-9]\d{0,18})$/.exec(location.pathname);
    if (input.kind === 'works' ? location.pathname !== '/creator-micro/content/manage' : workRoute?.[1] !== input.workId) throw Error('抖音官方只读页面与目标作品不一致');
    if (input.kind !== 'works') {
      const tabs = q('[role="tab"]').filter(e => text(e) === '评论管理');
      if (tabs.length > 1) throw Error('抖音官方评论标签不唯一，未操作');
      if (tabs[0]?.getAttribute('aria-selected') !== 'true') return wait('等待目标作品评论管理标签就绪');
    }
    const key = [input.kind, input.workId || '', input.commentId || '', input.cursor || '0'].join('/');
    const result = observed.pages.get(key);
    if (result?.error) {
      // The official UI can replace an initial legacy request with its active
      // current-comment request. Let that existing transition settle; do not
      // let a late old response overwrite the newer request, or retry a denial.
      if (Number.isFinite(result.receivedAt) && Date.now() - result.receivedAt < 600) return wait('等待官方当前评论请求状态稳定');
      const summary = input.kind !== 'works' && result.error.includes('旧版评论') && /数字编号|摘要未关联/.test(result.error) ? observed.summaries?.get(input.workId) || '作品摘要响应尚未被观察到' : '';
      throw Error(String(result.error).slice(0,120) + (summary ? '；' + String(summary).slice(0,70) : ''));
    }
    if (result) {
      if (input.kind === 'works') {
        if (result.aweme_list.some(row => row.author?.uid && row.author.uid !== input.ownUid)) {
          const samples=observed.identities instanceof Map?[...observed.identities.values()].filter(row=>Number.isFinite(row.at)&&Date.now()-row.at<=300000&&row.at<=Date.now()+5000):[];
          const relation=!samples.length?'CREATOR_ID_UNOBSERVED':samples.some(row=>row.uid===input.ownUid)?'CREATOR_ID_SAME':samples.some(row=>row.handle===input.publicHandle)?'CREATOR_ID_DIFFERENT_SAME_HANDLE':samples.some(row=>row.handle)?'CREATOR_ACCOUNT_DIFFERENT':'CREATOR_ID_DIFFERENT_HANDLE_UNAVAILABLE';
          throw Error('抖音官方作品作者不属于当前绑定账号（归属关系：'+relation+'）');
        }
        // A normal bootstrap response can advertise another page before it has
        // usable records/a progressing cursor. It is neither an inventory page
        // nor proof of an empty account. Wait only for the website's own normal
        // response, within the existing deadline; never fabricate a cursor or
        // issue a replacement GET. Native pagination validation stays intact.
        if (result.has_more && (!result.aweme_list.length || result.max_cursor === (input.cursor || '0'))) return wait(`作品分页待就绪：记录${result.aweme_list.length}；还有下一页；游标${result.max_cursor === (input.cursor || '0') ? '未前进' : '已前进'}`);
        return { ...result, aweme_list: result.aweme_list.map(row => ({ ...row, author: { uid: input.ownUid } })) };
      }
      // Some normal comment responses omit attachments that the official row
      // has already hydrated. Enrich only an exact rendered comment on this
      // owner-proven work; never use an avatar or another row's image.
      if(typeof projectMedia==='function'&&Array.isArray(result.comments)){
        const rendered=new Map();
        for(const node of q('[data-comment-id],[class*="comment-item"],[class*="commentItem"]').slice(0,150)){
          const row=records(node).find(row=>commentId(row.cid??row.comment_id)&&typeof row.text==='string');
          const cid=commentId(row?.cid??row?.comment_id);
          if(!cid||row.aweme_id!==undefined&&id(row.aweme_id)!==input.workId||row.item_id!==undefined&&id(row.item_id)!==input.workId)continue;
          const media=projectMedia(row);
          if(!media.image_list?.length){
            const images=[...node.querySelectorAll('img')].filter(image=>shown(image)&&image.closest('[data-comment-id],[class*="comment-item"],[class*="commentItem"]')===node&&!image.closest('[class*="avatar"],[class*="Avatar"]')&&(/图片|表情/.test(image.alt||'')||/comment[-_]?image|sticker|emoji/i.test(image.className||'')||image.hasAttribute('data-comment-image')));
            Object.assign(media,projectMedia({image_list:images.slice(0,9).map(image=>({url_list:[image.currentSrc,image.getAttribute('src')].filter(Boolean)}))}));
          }
          if(media.image_list?.length)rendered.set(cid,{text:row.text,media});
        }
        const enrich=row=>{const supplied=rendered.get(row.cid),media=projectMedia(row);return {...row,...(!media.image_list?.length&&supplied?.text===row.text?supplied.media:{}),...(Array.isArray(row.reply_comment)?{reply_comment:row.reply_comment.map(enrich)}:{})};};
        return {...result,comments:result.comments.map(enrich)};
      }
      return result;
    }
    // While the site's current GET is in flight, do not click/scroll another
    // page merely because begin() invalidated an older response at this key.
    if (observed.pending?.has(key)) return wait('等待官网当前分页请求返回');
    if (input.kind !== 'works') {
      const tabs = q('[role="tab"]').filter(e => text(e) === '评论管理');
      if (tabs.length > 1) throw Error('抖音官方评论标签不唯一，未操作');
      if (tabs[0]?.getAttribute('aria-selected') === 'false') { tabs[0].click(); return wait('等待官方评论标签加载'); }
    }
    if (input.kind === 'replies') {
      const nodes = q('[data-comment-id],[class*="comment-item"],[class*="commentItem"]');
      const root = nodes.find(node => { const row = records(node).find(row => commentId(row.cid ?? row.comment_id) && typeof row.text === 'string'); return commentId(row?.cid ?? row?.comment_id) === input.commentId; });
      const buttons = root ? [...root.querySelectorAll('button[class*="load-reply-"]')].filter(e => shown(e) && e.closest('[class*="comment-item"],[data-comment-id]') === root && /^查看\s*\d+\s*条回复$/.test(text(e)) && !e.disabled) : [];
      if (buttons.length > 1) throw Error('抖音官方展开回复控件不唯一，未操作');
      observed.requested ||= new Set();
      if (buttons.length && !observed.requested.has(key)) { observed.requested.add(key); buttons[0].click(); }
    } else {
      const next = q('button[aria-label="下一页"],button[title="下一页"],.semi-page-next button,.semi-pagination-next button,.ant-pagination-next button').filter(e => !e.disabled && e.getAttribute('aria-disabled') !== 'true');
      if (next.length > 1) throw Error('抖音官方下一页控件不唯一，未操作');
      observed.requested ||= new Set();
      if (next.length && input.cursor !== '0' && !observed.requested.has(key)) { observed.requested.add(key); next[0].click(); }
      else {
        const last = q(input.kind === 'works' ? '[class*="video-card-content-"]' : '[data-comment-id],[class*="comment-item"],[class*="commentItem"]').at(-1);
        last?.scrollIntoView({ block: 'end' });
        for (let e = last?.parentElement; e && e !== document.body; e = e.parentElement) if (e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY)) e.scrollTop = e.scrollHeight;
        window.scrollTo(0, document.scrollingElement?.scrollHeight || 0);
      }
    }
    return wait('等待官方' + (input.kind === 'works' ? '作品' : input.kind === 'replies' ? '回复' : '评论') + '分页响应；已观察' + observed.pages.size + '页'+(input.kind==='works'&&observed.workRequestCounts?.size?'；列表请求数量'+[...observed.workRequestCounts].join(','):''));
  }
  const offset = Number(input.cursor || '0'); if (!Number.isSafeInteger(offset) || offset < 0 || offset > 50000) throw Error('抖音创作者页面偏移无效');
  const cacheKey = '__matrixCreatorReadInventory';
  const scope = input.kind === 'works' ? 'works' : input.workId + '/' + (input.commentId || 'root');
  const store = window[cacheKey]?.uid === input.ownUid ? window[cacheKey] : { uid: input.ownUid, entries: {} }; window[cacheKey] = store;
  const cache = store.entries[scope] ||= { rows: [], ids: new Set(), signature: '', advancedFrom: '' };
  const nextControls = () => q('button[aria-label="下一页"],button[title="下一页"],[aria-label="Next"],.semi-page-next,.semi-pagination-next,.ant-pagination-next').filter(e => !e.parentElement?.closest('.semi-page-next,.semi-pagination-next,.ant-pagination-next'));
  const disabled = e => e.disabled || e.getAttribute('aria-disabled') === 'true' || /(?:^|[-\s])disabled(?:$|[-\s])/.test(e.className || '') || e.querySelector('button:disabled');
  const append = rows => { for (const row of rows) { const key = input.kind === 'works' ? row.aweme_id : row.cid; if (!cache.ids.has(key)) { cache.ids.add(key); cache.rows.push(row); } } if (cache.rows.length > (input.kind === 'works' ? 5000 : 50000)) throw Error('抖音本轮达到只读容量上限，已有结果保留'); };
  let rows = [], ended = false, total, replyRoot;
  if (input.kind === 'works') {
    if (location.pathname !== '/creator-micro/content/manage') throw Error('尚未进入抖音官方内容管理页');
    const cards = q('[class*="video-card-content-"],[data-aweme-id]');
    for (const card of cards.slice(0, 100)) {
      const titleNode = card.querySelector('[class*="info-title-text-"]'), title = text(titleNode);
      const candidates = new Set();
      for (const name of ['data-aweme-id', 'data-item-id']) { const v = id(card.getAttribute(name)); if (v) candidates.add(v); }
      for (const a of card.querySelectorAll('a[href]')) { try { const u = new URL(a.href, location.href), m = /^\/creator-micro\/work-management\/work-detail\/([1-9]\d{0,18})$/.exec(u.pathname); if (u.origin === location.origin && m) candidates.add(m[1]); } catch {} }
      for (const value of records(card)) {
        const direct = id(value.aweme_id ?? value.awemeId), named = id(value.item_id ?? value.itemId ?? value.id);
        const author = id(value.author?.uid ?? value.author?.userId); if (author && author !== input.ownUid) continue;
        if (direct) candidates.add(direct);
        else if (named && title && [value.desc, value.title, value.item_title].some(v => typeof v === 'string' && v.replace(/\s+/g, ' ').trim() === title)) candidates.add(named);
      }
      if (candidates.size > 1) throw Error('抖音官方作品卡片编号不唯一，未猜测关联');
      if (candidates.size === 1) rows.push({ aweme_id: [...candidates][0], desc: title.slice(0, 1000), author: { uid: input.ownUid } });
    }
    for (const e of q('span,div,button')) { const m = /^(?:作品\s*[（(]\s*(\d{1,6})\s*[）)]|共\s*(\d{1,6})\s*个作品)$/.exec(text(e)); if (m) { total = Number(m[1] ?? m[2]); break; } }
    const emptyFooter = q('div,p,span').some(e => /^(没有更多作品|暂无作品)$/.test(text(e)));
    // A freshly mounted list initializes its counter to zero while fetching.
    // Only the official zero count together with its settled footer is empty.
    if (!rows.length && !(total === 0 && emptyFooter)) return wait(`作品卡片${cards.length}，编号0；总数${total ?? '未识别'}；节点${document.querySelectorAll('*').length}；字段${[...fields].slice(0, 8).join(',') || '无'}`);
  } else {
    const route = /^\/creator-micro\/work-management\/work-detail\/([1-9]\d{0,18})$/.exec(location.pathname);
    if (route?.[1] !== input.workId || new URLSearchParams(location.search).get('tabKey') !== 'commentManagement') throw Error('抖音官方评论页与本人作品编号不一致');
    const commentTabs = q('[role="tab"]').filter(e => text(e) === '评论管理');
    if (commentTabs.length > 1) throw Error('抖音官方评论标签不唯一，未操作');
    if (commentTabs.length === 1 && commentTabs[0].getAttribute('aria-selected') === 'false') { commentTabs[0].click(); return wait('等待官方评论标签切换完成'); }
    const nodes = q('[data-comment-id],[class*="comment-item"],[class*="commentItem"],[class*="comment-content"],[class*="commentContent"]');
    const nearestComment = node => records(node).find(value => id(value.cid ?? value.comment_id ?? value.commentId) && typeof (value.text ?? value.content) === 'string' && (value.user || value.userInfo || value.user_info || value.author));
    if (input.kind === 'replies') {
      replyRoot = nodes.find(node => { const value = nearestComment(node); return id(value?.cid ?? value?.comment_id ?? value?.commentId) === input.commentId; });
      if (!replyRoot) return wait('等待本人作品的目标评论加载');
      const value = nearestComment(replyRoot), count = Number(value.reply_comment_total ?? value.replyCommentTotal ?? value.reply_count);
      if (Number.isSafeInteger(count) && count >= 0) total = count;
    }
    for (const node of nodes.slice(0, 2000)) {
      const value = nearestComment(node); if (!value) continue;
      const cid = id(value.cid ?? value.comment_id ?? value.commentId), content = value.text ?? value.content, user = value.user ?? value.userInfo ?? value.user_info ?? value.author;
      if (!cid || typeof content !== 'string' || !user || !id(user.uid ?? user.userId ?? user.user_id)) continue;
      const workId = id(value.aweme_id ?? value.awemeId ?? value.item_id ?? value.itemId); if (workId && workId !== input.workId) continue;
      const parent = id(value.matrixParentId ?? value.reply_id ?? value.replyId ?? value.parent_comment_id ?? value.parentCommentId);
      if (input.kind === 'replies' ? parent !== input.commentId : !!parent) continue;
      const nickname = user.nickname ?? user.nickName ?? user.screen_name;
      const media=typeof projectMedia==='function'?projectMedia({...value,text:content}):{};
      rows.push({ cid, aweme_id: input.workId, text: content.slice(0, 16000), ...media, user: { uid: id(user.uid ?? user.userId ?? user.user_id), nickname: typeof nickname === 'string' ? nickname.slice(0, 200) : '', sec_uid: user.sec_uid ?? user.secUid, avatar_thumb: user.avatar_thumb ?? user.avatarThumb ?? (typeof user.avatar_url === 'string' ? { url_list: [user.avatar_url] } : undefined) }, create_time: value.create_time ?? value.createTime, reply_comment_total: value.reply_comment_total ?? value.replyCommentTotal ?? value.reply_count ?? 0 });
    }
    ended = input.kind !== 'replies' && q('div,p,span').some(e => /^(暂无评论|暂无更多评论|暂时没有更多评论|没有更多评论|没有更多了)$/.test(text(e).replace(/\s*点击刷新$/, '')) && !e.querySelector('[class*="comment-item"]'));
    if (!rows.length && input.kind !== 'replies' && (nodes.length || !ended)) return wait(`评论节点${nodes.length}，有效编号${rows.length}；字段${[...fields].slice(0, 8).join(',') || '无'}`);
  }
  const signature = rows.map(r => r.aweme_id && input.kind === 'works' ? r.aweme_id : r.cid).join('/');
  if (cache.advancedFrom && cache.advancedFrom === signature) return wait('等待官方列表完成翻页');
  cache.advancedFrom = ''; cache.signature = signature; append(rows);
  const controls = nextControls(); if (controls.length > 1) throw Error('抖音官方下一页控件不唯一，未操作');
  if (total !== undefined) ended = cache.rows.length === total;
  else if (controls.length && disabled(controls[0]) && input.kind !== 'replies') ended = true;
  if (offset >= cache.rows.length && !ended) {
    if (input.kind === 'replies') {
      const buttons = [...replyRoot.querySelectorAll('button[class*="load-reply-"]')].filter(e => shown(e) && e.closest('[class*="comment-item"],[data-comment-id]') === replyRoot && /^查看\s*\d+\s*条回复$/.test(text(e)) && !disabled(e));
      if (buttons.length > 1) throw Error('抖音官方展开回复控件不唯一，未操作');
      if (buttons.length && cache.replyClickSignature !== signature) { cache.replyClickSignature = signature; buttons[0].click(); }
    }
    else if (controls.length && !disabled(controls[0])) { cache.advancedFrom = signature; controls[0].click(); }
    else {
      const last = q(input.kind === 'works' ? '[class*="video-card-content-"]' : '[data-comment-id],[class*="comment-item"],[class*="commentItem"]').at(-1);
      last?.scrollIntoView({ block: 'end' });
      // The creator work list uses a window-scroll loader; aligning the last
      // card alone can leave its sentinel below the viewport behind the footer.
      if (input.kind === 'works') window.scrollTo(0, document.scrollingElement?.scrollHeight || 0);
    }
    return wait('等待官方列表加载下一页');
  }
  const page = cache.rows.slice(offset, offset + 20), cursor = String(offset + page.length), common = { status_code: 0, has_more: !ended || Number(cursor) < cache.rows.length };
  return input.kind === 'works' ? { ...common, aweme_list: page, max_cursor: cursor } : { ...common, comments: page, cursor };
}

function creatorBlocked(details) {
  let u; try { u = new URL(details.url); } catch { return true; }
  if (!['GET', 'HEAD'].includes(details.method) || ['webSocket', 'ping', 'media'].includes(details.resourceType)) return true;
  if (/^(?:imapi[^.]*|imdesktop|frontier-im)\./.test(u.hostname)) return true;
  if ([...u.searchParams].some(([k,v]) => /^(?:is_mark_read|mark_read|clear_unread)$/i.test(k) && !['0','false',''].includes(v))) return true;
  // Micro-frontends fetch their HTML and JS as xhr/fetch, not resourceType
  // script. These public asset roots were verified against the official HTML.
  // This does not allow notification/follower APIs or arbitrary cross-origin reads.
  const staticFile = u.protocol === 'https:' && /\.(?:m?js|css|woff2?|ttf|png|jpe?g|webp|svg|ico)$/i.test(u.pathname);
  const creatorAsset = u.hostname === 'lf-fe-creator.douyinstatic.com' && u.pathname.startsWith('/obj/douyn-creator-scm-cdn/');
  if (staticFile && (creatorAsset || ['script','stylesheet','font','image'].includes(details.resourceType) && /(?:^|\.)(?:douyin\.com|douyincdn\.com|bytegoofy\.com|bytescm\.com|byteimg\.com)$/.test(u.hostname))) return false;
  // The normal own-homepage micro-frontend is fetched as HTML/XHR. Its two
  // public shell paths are not notification APIs; writes/read flags remain
  // rejected above. Exact paths only, not all creator HTML or arbitrary APIs.
  if (u.origin === 'https://creator.douyin.com' && ['/goofy/douyin_creator_pc/home/index.html','/goofy/douyin_creator_pc/org/home/index.html'].includes(u.pathname)) return false;
  const bootstrap = ['/goofy/douyin_creator_pc/mono/creator_content','/goofy/douyin_creator_pc/mono/work-management','/goofy/douyin_creator_pc/mono/prefetch/creator_content/manage/prefetch.json','/goofy/douyin_creator_pc/mono/prefetch/work-management/work-detail/prefetch.json','/aweme/v1/web/oversea/judgment/','/web/api/creator/center/fans/index/config','/web/api/creator/data/item/summarize','/web/api/creator/item/auth','/web/api/creator/item/mget','/janus/douyin/creator/data/author/upgrade','/janus/douyin/creator/data/diagnose/item_compare'];
  if (u.origin === 'https://creator.douyin.com' && (bootstrap.includes(u.pathname) || bootstrap.includes(u.pathname.replace(/\/$/, '')))) return false;
  if (/^(?:imapi[^.]*|imdesktop|frontier-im)\./.test(u.hostname) || /(?:notice|notification|notify|mark[_/-]?read|clear[_/-]?unread|batch[_/-]?read|\/im\/|\/message\/|fans?(?:[_/-]|$)|\/follower\/|\/follow\/|publish|delete|digg|\/reply\/(?:add|create)|\/comment\/(?:add|create|send)|\/send\/|\/commit\/)/i.test(u.pathname)) return true;
  if (/\/(?:api|aweme)\//.test(u.pathname) || ['xhr','fetch'].includes(details.resourceType)) {
    return u.origin !== 'https://creator.douyin.com' || !/\/(?:[a-z_]*(?:list|query|info|detail|search|statistic|count|config)[a-z_]*|get|post|home|profile)(?:\/|$)/i.test(u.pathname);
  }
  return !['https:','data:','blob:'].includes(u.protocol);
}

function blockedReadHint(details) {
  // Diagnostic paths only, never query strings, headers, cookies or bodies.
  // Protected notification/IM polling is expected and is not a loading cause.
  try { const u=new URL(details.url); if(details.method!=='GET'||u.origin!=='https://creator.douyin.com'||!/^\/(?:web\/api|aweme)\//.test(u.pathname)||/notice|notification|notify|user_message|\/msg\/|\/message\/|mark[_/-]?read|clear[_/-]?unread/i.test(u.pathname))return; return u.pathname.replace(/\d{6,}|[a-zA-Z0-9_-]{24,}/g,'#').slice(0,90); } catch {}
}
function commentSchemaUnsupported(text) {
  // Only our exact normalizer diagnostic, never words occurring inside an
  // official refusal/status_msg, may downgrade a failure to per-work.
  return /^(?:作品评论|评论回复)（(?:旧版评论|新版评论)，(?:数字编号|摘要已关联|摘要未关联)）：官方评论(?:标识未识别|作者标识未识别|正文字段未识别)/.test(text);
}

function createCreatorReader({ acquireIdentity, createWindow, now = Date.now, waitMs = 400, requireResponses = false }) {
  const {setReaderActive}=require('./reader-activity.cjs');
  const activate=(r,selected)=>{for(const win of [r.win,r.detailWin,r.inventoryWin,r.liveWin])setReaderActive(win,win===selected);};
  // This head always reloads cursor zero on its next check. It owns no history
  // continuation: retire only that completed page and its scoped policy.
  const retireInventory=r=>{const win=r.inventoryWin;if(!win)return;r.inventoryWin=undefined;try{if(!win.isDestroyed())win.destroy();}finally{const release=r.releasePolicies?.get(win);r.releasePolicies?.delete(win);release?.();}};
  // Only the caller's committed terminal catalog page permits releasing this
  // window. Keep owner-proven works/comments and every detail/reply cursor.
  const retireCatalog=r=>{const win=r.win;if(!win||!r.catalogTerminal)return false;if(!win.isDestroyed())win.destroy();r.win=undefined;r.catalogTerminal=false;const release=r.releasePolicies?.get(win);r.releasePolicies?.delete(win);release?.();return true;};
  const states = new Map(); let closed = false;
  function dispose(r) { if(r.disposed)return;r.disposed=true;clearTimeout(r.idle);try{for (const win of [r.win,r.detailWin,r.inventoryWin,r.liveWin]) if (win && !win.isDestroyed()) win.destroy();}finally{for(const release of r.releasePolicies?.values()||[])release();r.releasePolicies?.clear();if (states.get(r.source) === r) states.delete(r.source);} }
  async function limited(r, action, ms) { let timer; try { return await Promise.race([Promise.resolve().then(action),new Promise((_,reject)=>{timer=setTimeout(()=>{dispose(r);reject(Error('抖音创作者只读页面操作超时，已有记录保留'));},ms);})]); } finally { clearTimeout(timer); } }
  function prepareWindow(r, win) {
    r.releasePolicies ||= new Map();
    r.releasePolicies.set(win,registerScopedRequestPolicy(r.source,win.webContents.id,{
      blocks(d){const cancel=creatorBlocked(d)&&!allowCommentRequest(d,r.writeIntent);if(cancel){r.blocked++;const hint=blockedReadHint(d);if(hint&&r.blockedPaths.size<3)r.blockedPaths.add(hint);}return cancel;},
      completed(d){if(d.statusCode<400||r.writeIntent&&d.method==='POST')return;try{const u=new URL(d.url);if(d.resourceType==='mainFrame'||u.origin==='https://creator.douyin.com'&&['xhr','fetch'].includes(d.resourceType)&&/\/(?:api|aweme)\//.test(u.pathname))r.httpFailure=d.statusCode;}catch{}},
    }));win.webContents.setAudioMuted(true); win.webContents.setWindowOpenHandler(({url})=>{
      // Some official card controls open their comment detail in a new tab.
      // Keep that exact, already owner-proven destination in this collector;
      // every other popup remains denied. Never permit an arbitrary URL.
      try { const u=new URL(url); if(requireResponses && (win===r.detailWin||win===r.liveWin) && r.expectedWorkId && r.works.has(r.expectedWorkId) && !r.pendingPopup && !u.username && !u.password && u.origin==='https://creator.douyin.com' && u.pathname==='/creator-micro/work-management/work-detail/'+r.expectedWorkId && (!u.searchParams.has('tabKey')||u.searchParams.get('tabKey')==='commentManagement') && [...u.searchParams.keys()].every(key=>['tabKey','enter_from'].includes(key)) && (!u.searchParams.has('enter_from')||u.searchParams.get('enter_from')==='content')) {
        r.pendingPopup=true; limited(r,()=>win.loadURL(u.href),10000).catch(()=>{r.navigationFailure='抖音官网目标作品评论页面未能加载，已有记录保留';}).finally(()=>{r.pendingPopup=false;});
      } } catch {} return {action:'deny'};
    });
    win.webContents.on('will-navigate',(e,url)=>{try{const u=new URL(url);if(u.origin!=='https://creator.douyin.com'||!/^\/creator-micro\/(?:content\/manage|work-management\/work-detail\/[1-9]\d{0,18})$/.test(u.pathname))e.preventDefault();}catch{e.preventDefault();}});
  }
  async function acquire(options) {
    const identity = await acquireIdentity({...options,suspendIdleIdentity:true}); let r = states.get(options.accountSession), released = false;
    try {
      if (closed) throw Error('抖音创作者只读采集已停止');
      if (r && r.ownUid !== identity.ownUid) { dispose(r); r = undefined; }
      if (r?.busy) throw Error('此抖音账号正在读取另一页，请稍候');
      if (r && (r.disposed || r.win?.isDestroyed() || r.detailWin?.isDestroyed())) { dispose(r); r = undefined; }
      if (!r) {
        const win = createWindow(options.accountSession); r = { source: options.accountSession, win, ownUid: identity.ownUid, works: new Set(), comments: new Map(), blocked: 0, blockedPaths: new Set(), worksAt: 0 }; states.set(r.source, r); prepareWindow(r,win);
        await limited(r,()=>win.loadURL('https://creator.douyin.com/creator-micro/content/manage'),18000);
      }
      clearTimeout(r.idle); r.busy = true;
      const verify = async (proof = false) => { if (closed || released) throw Error('抖音创作者只读采集已停止'); if(r.navigationFailure)throw Error(r.navigationFailure); if(r.httpFailure)throw Error(`抖音创作者官方页面请求返回 HTTP ${r.httpFailure}，已停止当前采集，已有结果保留`); if(r.disposed || r.win?.isDestroyed() || r.detailWin?.isDestroyed()) { dispose(r); throw Error('抖音创作者只读采集页已释放，需要重新建立作品目录'); } await options.assertCurrent(); if(proof)await identity.verify();else await identity.check(); };
      return { ownUid: identity.ownUid, hasOwnedWork:workId=>r.works.has(workId),source: 'https://creator.douyin.com/', inventoryDiagnostics:()=>identity.inventoryDiagnostics?.()||{}, releaseCompletedCatalog(){if(released||r.disposed)return false;return retireCatalog(r);}, async readWeb(kind, args = {}, dedicated = '') {
        const inventoryHead=dedicated==='inventory',latestHead=dedicated==='latest';
        await verify(true);
        if (!['works','comments','replies'].includes(kind)) throw Error('不支持的创作者只读操作');
        const allowed = kind === 'works' ? ['cursor'] : kind === 'comments' ? ['workId','cursor'] : ['workId','cursor','commentId'];
        if (Object.keys(args).some(k=>!allowed.includes(k)) || Object.entries(args).some(([key,v])=>typeof v!=='string'||(key==='commentId' && requireResponses ? !commentIdentifier(v,true) : !/^\d{1,19}$/.test(v)))) throw Error('抖音创作者只读参数无效');
        if(kind!=='works'&&!r.works.size)throw Error('抖音创作者只读采集页已释放，需要重新建立作品目录');
        if (kind !== 'works' && (!/^[1-9]\d{0,18}$/.test(args.workId || '') || !r.works.has(args.workId))) throw Error('评论作品编号不属于本轮本人作品目录');
        if (kind === 'replies' && requireResponses && !r.comments.get(args.workId)?.has(args.commentId)) throw Error('回复评论标识不属于本轮目标作品已读取根评论');
        if (kind !== 'works') r.expectedWorkId=args.workId;
        const target = kind === 'works' ? 'https://creator.douyin.com/creator-micro/content/manage' : 'https://creator.douyin.com/creator-micro/work-management/work-detail/' + args.workId + '?enter_from=content&tabKey=commentManagement';
        if(kind!=='works'){const slot=latestHead?'liveWin':'detailWin';if(!r[slot]){r[slot]=createWindow(r.source);prepareWindow(r,r[slot]);}}
        if(inventoryHead&&kind!=='works')throw Error('独立新作品检查只允许作品目录');
        if(inventoryHead&&!r.inventoryWin){r.inventoryWin=createWindow(r.source);prepareWindow(r,r.inventoryWin);}
        if(kind==='works'&&!inventoryHead){r.catalogTerminal=false;if(!r.win){r.win=createWindow(r.source);prepareWindow(r,r.win);}}
        const guest=kind==='works'?(inventoryHead?r.inventoryWin:r.win):latestHead?r.liveWin:r.detailWin;activate(r,guest);
        if(latestHead&&guest.webContents.getURL()===target)await limited(r,()=>guest.loadURL(target),10000);
        if (kind !== 'works' && requireResponses) {
          const current = new URL(guest.webContents.getURL() || 'about:blank');
          if (current.origin !== 'https://creator.douyin.com' || !/^\/creator-micro\/(?:content\/manage|work-management\/work-detail\/[1-9]\d{0,18})$/.test(current.pathname)) await limited(r,()=>guest.loadURL('https://creator.douyin.com/creator-micro/content/manage'),10000);
        } else if (guest.webContents.getURL() !== target || kind === 'works' && args.cursor === '0' && (inventoryHead || r.worksAt) && (requireResponses || now()-r.worksAt>45000)) await limited(r,()=>guest.loadURL(target),10000);
        let result; const deadline = now() + 14000;
        do {
          await verify();
          if (r.pendingPopup) { result={waiting:true,detail:'等待官网目标作品评论页面加载'}; await new Promise(resolve=>setTimeout(resolve,waitMs)); continue; }
          if (kind !== 'works' && requireResponses) {
            const navigation = await limited(r,()=>guest.webContents.executeJavaScript(`(()=>{try{return (${navigateOwnedComment.toString()})(${JSON.stringify({ workId: args.workId, ownUid: r.ownUid })})}catch(e){return {pageError:String(e.message).slice(0,180)}}})()`,false),4000);
            if (navigation?.pageError) throw Error(navigation.pageError);
            if (navigation?.unavailable === true) { const error = Error('作品 ' + args.workId + '：官网当前作品状态暂不支持查看详情数据，未判定为零评论'); error.code = 'OWNED_WORK_UNAVAILABLE'; throw error; }
            if (!navigation?.ready) { result = navigation; await new Promise(resolve=>setTimeout(resolve,waitMs)); continue; }
          }
          result = await limited(r,()=>guest.webContents.executeJavaScript(`(()=>{try{return (${creatorPage.toString()})(${JSON.stringify({ kind, ownUid: r.ownUid,publicHandle:options.publicHandle,requireResponses, ...args })},(${projectCommentMedia.toString()}))}catch(e){return {pageError:String(e.message).slice(0,180)}}})()`, false),4000);
          await verify();
          if (result?.pageError) { const error=Error((args.workId ? '作品 ' + args.workId + ' · ' : '') + result.pageError);if(kind!=='works'&&commentSchemaUnsupported(result.pageError))error.code='OWNED_COMMENT_SCHEMA_UNSUPPORTED';if(kind==='works'&&result.pageError==='抖音官方作品作者不属于当前绑定账号（归属关系：CREATOR_ID_SAME）')error.code='OWNED_CATALOG_AUTHOR_MISMATCH';throw error; }
          if (!result?.waiting) break;
          await new Promise(resolve => setTimeout(resolve, waitMs));
        } while (now() < deadline);
        if (result?.waiting) throw Error(`抖音官方${kind === 'works' ? '作品目录' : '评论'}尚未读取完成：${String(result.detail || '列表未加载').slice(0,130)}`);
        if (!result || result.status_code !== 0) throw Error('抖音创作者页面未返回可核验的只读记录');
        await verify(true);
        if (kind === 'works') { for (const item of result.aweme_list) r.works.add(item.aweme_id); if(!inventoryHead){r.worksAt = now();r.catalogTerminal=result.has_more===false||result.has_more===0;} }
        if (kind === 'comments') { let known=r.comments.get(args.workId);if(!known){known=new Set();r.comments.set(args.workId,known);}for(const row of result.comments){if(known.size>=50000&&!known.has(row.cid))throw Error('此作品评论标识达到只读容量上限');known.add(row.cid);} }
        if(kind==='works'&&typeof identity.peekWorkOrder==='function'){
          const order=await identity.peekWorkOrder();await verify();
          if(order&&Array.isArray(order.items)&&order.items.length<=100){
            const ownItems=order.items.filter(item=>item.author?.uid===r.ownUid),byId=new Map(ownItems.map(item=>[item.aweme_id,item]));
            return {...result,homepage_order:ownItems.map(item=>({...item,homepage_order_at:order.at})),aweme_list:result.aweme_list.map(row=>{const item=byId.get(row.aweme_id);return item?{...row,...item,desc:row.desc,homepage_order_at:order.at}:row;})};
          }
        }
        return result;
      }, async readInventoryHead(options) {
        if(r.inventoryOperation)throw Error('此抖音账号正在检查新作品，请稍候');const inventoryOperation={};r.inventoryOperation=inventoryOperation;try{
        if(typeof identity.readInventoryHead==='function'){
          await verify(true);
          // Both complementary reads are selected from the start. The public
          // head discovers new owned posts; the creator head retains exact
          // comment counters. Neither is a fallback after the other refuses.
          const reads=await Promise.allSettled([identity.readInventoryHead(options),this.readWeb('works',{cursor:'0'},'inventory')]);
          // A local DOM-readiness wait cannot mask a real refusal or owner
          // conflict in the complementary source selected at the same time.
          const failures=reads.filter(value=>value.status==='rejected'),fatal=failures.find(value=>value.reason?.code!=='OWNED_INVENTORY_HEAD_NOT_READY');if(fatal){identity.discardInventoryHead?.();throw fatal.reason;}if(failures.length)throw failures[0].reason;
          const [data,creator]=reads.map(value=>value.value);await verify(true);
          if(data?.status_code!==0||!Array.isArray(data.aweme_list)||data.aweme_list.length>100||data.aweme_list.some(row=>row.author?.uid!==r.ownUid||!/^[1-9]\d{0,18}$/.test(row.aweme_id||'')))throw Error('抖音本人主页新作品归属未通过，旧目录保留');
          for(const row of data.aweme_list){if(r.works.size>=5000&&!r.works.has(row.aweme_id))throw Error('本人作品达到只读容量上限，旧目录保留');r.works.add(row.aweme_id);}
          const counters=new Map(creator.aweme_list.map(row=>[row.aweme_id,row])),ids=new Set(data.aweme_list.map(row=>row.aweme_id));
          return {...data,aweme_list:[...data.aweme_list.map(row=>({...row,...(counters.get(row.aweme_id)?.metrics?{metrics:counters.get(row.aweme_id).metrics,metrics_observed_at:counters.get(row.aweme_id).metrics_observed_at}:{})})),...creator.aweme_list.filter(row=>!ids.has(row.aweme_id))].slice(0,100)};
        }
        // A separate transient collector keeps the official historical list's
        // continuation intact. Same bound session, exact normal page and policy;
        // no changed query, SDK call, denial fallback or read-notification route.
        return await this.readWeb('works',{cursor:'0'},'inventory');
        }finally{if(r.inventoryOperation===inventoryOperation){r.inventoryOperation=undefined;retireInventory(r);}}
      }, async readLatest(workId) {
        await verify(true);
        if(!r.works.has(workId)) throw Error('评论更新作品不属于本轮本人作品目录');
        // Fresh-head reloads never touch the historical comment continuation.
        return this.readWeb('comments',{workId,cursor:'0'},'latest');
      }, async actComment(args, reserve) {
        await verify(true);
        if (!r.works.has(args.workId) || !['like','reply'].includes(args.action) || !commentIdentifier(args.commentId, true) || args.action === 'like' && typeof args.liked !== 'boolean' || args.action === 'reply' && (typeof args.text !== 'string' || !args.text.trim() || args.text.length > 500)) throw Error('评论操作参数或本人作品证明无效，未提交');
        // Reuse an already verified, currently rendered exact target. Preparing
        // the same comment page again on every toggle needlessly paged history.
        let guest = r.detailWin;
        const run = async step => { await verify();activate(r,guest); const result = await limited(r, () => guest.webContents.executeJavaScript(`(()=>{try{return (${commentControl.toString()})(${JSON.stringify({ ...args, step })})}catch(e){return {error:String(e.message).slice(0,180)}}})()`, false), 4000); if (result?.error) throw Error(result.error); return result; };
        let inspected;
        if(guest&&!guest.isDestroyed()){try{const current=new URL(guest.webContents.getURL());if(current.origin==='https://creator.douyin.com'&&current.pathname==='/creator-micro/work-management/work-detail/'+args.workId)inspected=await run('inspect');}catch{}}
        if(!inspected?.found){
          await this.readWeb('comments', { workId: args.workId, cursor: args.rootCursor || args.pageCursor || '0' });
          if (args.parentPlatformId) await this.readWeb('replies', { workId: args.workId, commentId: args.parentPlatformId, cursor: args.pageCursor || '0' });
          guest=r.detailWin;inspected=await run('inspect');
        }
        if (!inspected?.found) throw Error('目标评论不在官网当前已加载页面，未猜测其他评论或提交');
        if (args.action === 'like' && inspected.liked === args.liked) return { state: 'confirmed', message: args.liked ? '当前已点赞' : '当前未点赞', liked: args.liked, likeCount: inspected.likeCount };
        if (args.action === 'reply') { await run('open-reply'); await new Promise(resolve => setTimeout(resolve, 100)); }
        await verify(true); await reserve();
        const routes = args.action === 'like' ? ['/aweme/v1/creator/comment/action/', '/aweme/janus/creator/comment/aweme/v1/web/comment/digg/'] : ['/aweme/v1/creator/comment/reply/', '/aweme/janus/creator/comment/aweme/v1/web/comment/multi_publish/'];
        const intent = { ...args, webContentsId: guest.webContents.id, expires: now() + 12000, used: false };
        r.writeIntent = intent;
        let attempted = false;
        try {
          await limited(r, () => guest.webContents.executeJavaScript(`window.__matrixCreatorCommentWrite=${JSON.stringify({ ...args, routes })}`, false), 4000);
          attempted = true; await run(args.action);
          const until = now() + 10000;
          do {
            await verify();
            const receipt = await limited(r, () => guest.webContents.executeJavaScript(`window.__matrixCreatorCommentWrite?.nonce===${JSON.stringify(args.nonce)}?window.__matrixCreatorCommentWrite.receipt:null`, false), 4000);
            if (receipt && ['confirmed','failed'].includes(receipt.state)) {
              await verify(true);
              if(args.action==='like'&&receipt.state==='confirmed'&&receipt.likeCount===undefined){
                // Prefer a current rendered official count. The POST can omit
                // it, and React may commit the matching update shortly later.
                for(let attempt=0;attempt<4;attempt++){
                  const after=await run('inspect');
                  if(after?.found&&after.liked===args.liked&&Number.isSafeInteger(after.likeCount)&&after.likeCount>=0&&after.likeCount!==inspected.likeCount)return {...receipt,likeCount:after.likeCount};
                  if(attempt<3)await new Promise(resolve=>setTimeout(resolve,80));
                }
                // This is an explicitly labelled local transition estimate,
                // not an official total and not used as the stored likeCount.
                if(typeof inspected.liked==='boolean'&&inspected.liked!==args.liked&&Number.isSafeInteger(inspected.likeCount)&&inspected.likeCount>=0){const estimate=inspected.likeCount+(args.liked?1:-1);if(Number.isSafeInteger(estimate)&&estimate>=0)return {...receipt,likeCountEstimate:estimate};}
              }
              return receipt;
            }
            await new Promise(resolve => setTimeout(resolve, 250));
          } while (now() < until);
          return { state: 'unknown', message: '评论操作结果未确认，请核对官网，勿重复提交' };
        } catch (e) { if (!attempted) throw e; return { state: 'unknown', message: '评论操作结果未确认：' + String(e.message).slice(0,140) + '；请核对官网，勿重复提交' }; }
        finally { if (r.writeIntent === intent) r.writeIntent = undefined; if (!guest.isDestroyed()) await guest.webContents.executeJavaScript(`if(window.__matrixCreatorCommentWrite?.nonce===${JSON.stringify(args.nonce)})delete window.__matrixCreatorCommentWrite`, false).catch(() => {}); }
      }, close() { if (released) return; released = true; r.writeIntent = undefined; identity.close(); r.busy = false; if(!r.disposed) { activate(r,undefined);r.idle = setTimeout(() => dispose(r), 5 * 60 * 1000); r.idle.unref?.(); } } };
    } catch (e) { identity.close(); if (r && !r.busy) dispose(r); throw e; }
  }
  return { acquire, close() { closed = true; for (const r of [...states.values()]) dispose(r); } };
}
module.exports = { creatorPage, creatorBlocked, blockedReadHint, commentSchemaUnsupported, createCreatorReader, navigateOwnedComment };
