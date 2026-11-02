// Self-contained display projection shared with the native adapter. It reads
// supplied image resources only, never IDs/keys, arbitrary deep objects or URLs
// reconstructed from metadata. No requests, Node APIs or private fields.
function projectCommentMedia(row) {
  const resources=['animate_url','animateUrl','origin_url','originUrl','medium_url','mediumUrl','crop_url','cropUrl','thumb_url','thumbUrl','static_url','staticUrl','image_url','imageUrl','url_list','urlList','url','src'];
  const fields=['image_list','imageList','sticker','stickers','sticker_info','stickerInfo','emoji','emoji_info','emojiInfo'];
  const images=[],seen=new Set();
  const urls=(value,depth=0)=>{
    if(depth>3)return [];
    if(typeof value==='string'){try{const u=new URL(value.startsWith('//')?'https:'+value:value);return u.protocol==='https:'&&!u.username&&!u.password&&u.href.length<=4096?[u.href]:[];}catch{return [];}}
    if(Array.isArray(value))return value.slice(0,8).flatMap(item=>urls(item,depth+1));
    if(!value||typeof value!=='object')return [];
    return resources.flatMap(key=>urls(value[key],depth+1)).slice(0,32);
  };
  for(const key of fields){
    let value=row?.[key];
    const fieldUrls=[];
    if(typeof value==='string'&&value.length<=16384&&/^[\[{]/.test(value)){try{value=JSON.parse(value);}catch{value=undefined;}}
    for(const item of (Array.isArray(value)?value.slice(0,9):value?[value]:[])){
      const list=[...new Set(urls(item))].slice(0,4);if(!list.length||list.some(url=>seen.has(url)))continue;
      fieldUrls.push(...list);images.push({url_list:list});if(images.length===9)break;
    }
    fieldUrls.forEach(url=>seen.add(url));
    if(images.length===9)break;
  }
  if(images.length)return {image_list:images};
  if(!/^\[(?:图片|图片表情|表情)\]$/.test(row?.text||''))return {};
  const shape=fields.filter(key=>row?.[key]!==undefined&&row[key]!==null).map(key=>key+'='+(Array.isArray(row[key])?'array('+Math.min(row[key].length,100)+')':typeof row[key])).join(',')||'无';
  return {imageReadHint:'评论附件尚无可用地址；已识别资源字段：'+shape};
}
// Dedicated creator collector only. Observe normal GET responses; never issue
// requests, copy credentials/headers, call an SDK, or expose Node/IPC to the page.
function installCreatorResponseObserver(projectMedia) {
  if (location.origin !== 'https://creator.douyin.com' || window.__matrixCreatorObservedPages) return;
  const state = { version: 1, pages: new Map(), pending: new Set(), summaries: new Map(), identities:new Map(),workRequestCounts: new Set() }, xhrRequests = new WeakMap(), references = new Map(), latest = new Map(), rootReferences = new Map();
  let sequence = 0;
  Object.defineProperty(window, '__matrixCreatorObservedPages', { value: state });
  const id = v => typeof v === 'string' && /^[1-9]\d{0,18}$/.test(v) ? v : Number.isSafeInteger(v) && v > 0 ? String(v) : '';
  const commentId = (v, legacy = false) => id(v) || (legacy && typeof v === 'string' && /^[\x21-\x7e]{1,512}$/.test(v) && !/^(?:https?|file|data|javascript):/i.test(v) && !/^\d+$/.test(v) ? v : '');
  const cursor = v => typeof v === 'string' && /^\d{1,19}$/.test(v) ? v : Number.isSafeInteger(v) && v >= 0 ? String(v) : undefined;
  // JSON.parse would round unquoted 64-bit IDs before validation. Preserve
  // integer lexemes from the response CLONE only; never change the site's
  // original response or reinterpret quoted text/decimals/exponents as IDs.
  const parseResponse=text=>{const original=JSON.parse(text);let changed=false;const preserved=text.replace(/"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g,token=>{if(token[0]!=='"'&&/^-?\d+$/.test(token)&&!Number.isSafeInteger(Number(token))){changed=true;return JSON.stringify(token);}return token;});return changed?JSON.parse(preserved):original;};
  function officialMessage(value) {
    if (typeof value !== 'string' || !value.trim()) return '官网未提供错误说明';
    if (/^(?:access\s+)?token\s+(?:is\s+)?(?:expired|invalid)[.!]?$/i.test(value.trim())) return '官方提示登录凭据失效';
    // Error text is untrusted platform data, not instructions. Never pass
    // credentials, URLs, long opaque values, account numbers or mail onward.
    if (/cookie|token|authorization|password|bearer|https?:|[A-Za-z0-9_+/=-]{24,}/i.test(value)) return '官方错误说明含敏感字段，已隐藏';
    return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\S+@\S+|\d{5,}/g, '[已隐藏]').replace(/\s+/g, ' ').trim().slice(0, 90) || '官网未提供错误说明';
  }
  function begin(req) {
    if (!req) return;
    req.serial = ++sequence; latest.set(req.key, req.serial); state.pages.delete(req.key);
    if (req.kind === 'summary') { state.summaries.set(req.workId, '作品摘要请求中'); if (state.summaries.size > 128) state.summaries.delete(state.summaries.keys().next().value); }
    if (req.kind !== 'summary') state.pending.add(req.key);
    if (state.pending.size > 256) state.pending.delete(state.pending.values().next().value);
    if (latest.size > 256) latest.delete(latest.keys().next().value);
    return req;
  }
  function renderedReference(req) {
    // The official rendered comment component receives both identifiers. A
    // cached/prefetched summary may not produce another observable GET here.
    // Inspect only those rendered props, never hooks, SDK closures or tokens.
    if (!req.reference || id(req.reference) || !['comments', 'replies'].includes(req.kind)) return false;
    const visible = e => e.isConnected && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';
    const tabs = [...document.querySelectorAll('[role="tab"]')].filter(e => visible(e) && (e.textContent || '').trim() === '评论管理');
    if (tabs.length !== 1 || tabs[0].getAttribute('aria-selected') !== 'true') return false;
    const matches = new Set();
    const panels=[...document.querySelectorAll('[role="tabpanel"]')];
    const controlled=tabs[0].getAttribute('aria-controls');if(controlled){const panel=document.getElementById(controlled);if(panel)panels.push(panel);}
    for (const element of [...new Set([...panels,...document.querySelectorAll('[class*="comment-item"],[class*="commentItem"],[class*="comment-management"]')])].slice(0, 150)) {
      if (!visible(element)) continue;
      for (let e = element, depth = 0; e && depth < 4; e = e.parentElement, depth++) {
        let fiber = e[Object.keys(e).find(key => key.startsWith('__reactFiber$'))];
        for (let n = 0; fiber && n < 12; fiber = fiber.return, n++) {
          const props = fiber.memoizedProps;
          if (id(props?.itemId) !== req.workId || props.resolvingItemId !== false || props.newComment !== false || typeof props.commentItemId !== 'string' || !props.commentItemId || props.commentItemId.length > 512) continue;
          matches.add(props.commentItemId);
        }
      }
    }
    if (matches.size !== 1 || !matches.has(req.reference)) return false;
    references.set(req.reference, req.workId);
    state.summaries.set(req.workId, '官网已选中评论组件关联作品引用');
    return true;
  }
  function request(url, method, activate = true) {
    if (String(method || 'GET').toUpperCase() !== 'GET') return;
    let u; try { u = new URL(url, location.href); } catch { return; }
    if (u.origin !== location.origin) return;
    const currentWork = id(/^\/creator-micro\/work-management\/work-detail\/([1-9]\d{0,18})$/.exec(location.pathname)?.[1]);
    const reference = u.searchParams.get('item_id') || u.searchParams.get('aweme_id') || '';
    let kind, workId = '', commentId = '';
    if(['/aweme/v1/creator/pc/user/info/','/aweme/v1/creator/user/info/'].includes(u.pathname)){
      const req={kind:'identity',key:'identity/'+u.pathname,path:u.pathname};return activate?begin(req):req;
    }
    if (u.pathname === '/janus/douyin/creator/pc/work_list') {
      // The rendered all-works list's loader (e6) uses count=12. Other
      // inventory previews share status/scene/cursor but must not overwrite
      // the actual list, even when they finish later or return has_more/0.
      if(location.pathname==='/creator-micro/content/manage'&&state.workRequestCounts.size<8)state.workRequestCounts.add(/^\d{1,3}$/.test(u.searchParams.get('count')||'')?u.searchParams.get('count'):'未提供');
      if (location.pathname !== '/creator-micro/content/manage' || u.searchParams.getAll('status').length!==1 || u.searchParams.get('status') !== '0' || u.searchParams.getAll('scene').length!==1 || u.searchParams.get('scene') !== 'star_atlas' || u.searchParams.getAll('count').length!==1 || u.searchParams.get('count')!=='12') return;
      kind = 'works';
    }
    else if (u.pathname.replace(/\/$/, '') === '/web/api/creator/data/item/summarize' && u.searchParams.getAll('item_id').length===1 && id(u.searchParams.get('item_id')) === currentWork && currentWork) { kind = 'summary'; workId = currentWork; }
    else if (['/aweme/v1/creator/comment/list', '/web/api/third_party/aweme/api/comment/read/aweme/v1/web/comment/list/select/'].includes(u.pathname)) { kind = 'comments'; workId = id(reference) || references.get(reference) || (reference.length <= 512 && reference ? currentWork : ''); }
    else if (['/aweme/v1/creator/comment/reply/list', '/web/api/third_party/aweme/api/comment/read/aweme/v1/web/comment/list/reply/'].includes(u.pathname)) { kind = 'replies'; workId = id(reference) || references.get(reference) || (reference.length <= 512 && reference ? currentWork : ''); const candidate = u.searchParams.get('comment_id'); commentId = id(candidate) || (u.pathname === '/aweme/v1/creator/comment/reply/list' && rootReferences.get(currentWork)?.has(candidate) ? candidate : ''); }
    else return;
    const at = cursor(u.searchParams.get(kind === 'works' ? 'max_cursor' : 'cursor') || '0');
    if (at === undefined || kind === 'comments' && !workId || kind === 'replies' && !commentId) return;
    // Legacy reply requests omit item_id; the current owned detail route is the
    // only accepted source of that relationship, never a caller-supplied URL.
    if (kind === 'replies' && !workId) workId = currentWork;
    if (kind !== 'works' && !workId) return;
    if (kind !== 'works' && workId !== currentWork) return;
    const interfaceName = kind === 'works' ? '作品列表' : kind === 'summary' ? '作品摘要' : u.pathname.startsWith('/aweme/v1/creator/') ? '旧版评论' : '新版评论';
    const req = { kind, workId, commentId, reference, interfaceName, key: [kind, workId, commentId, at].join('/') };
    return activate ? begin(req) : req;
  }
  function receive(req, status, raw, attempt = 0) {
    if (!req || latest.get(req.key) !== req.serial) return;
    let value;
    try {
      if (status < 200 || status >= 300) throw Error('官方读取请求返回 HTTP ' + status);
      const body = raw?.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? raw.data : raw;
      const codes = [raw?.status_code, body?.status_code].filter(v => v !== undefined);
      const code = codes.find(v => v !== 0) ?? codes[0];
      if (code !== 0) {
        const message = body?.status_code !== undefined && body.status_code !== 0 ? body.status_msg : raw?.status_msg ?? body?.status_msg;
        throw Error(code === undefined ? '官方读取响应缺少业务状态码' : '官方读取请求未成功（平台码 ' + String(code).replace(/[^\d-]/g, '').slice(0, 12) + '）；' + officialMessage(message));
      }
      if(req.kind==='identity'){
        const uid=id(body.uid??raw.uid),profile=body.user_profile??raw.user_profile??body;
        const handle=[profile.unique_id,body.unique_id,profile.short_id,body.short_id].map(value=>Number.isSafeInteger(value)&&value>=0?String(value):value).find(value=>typeof value==='string'&&value.length>0);
        if(uid)state.identities.set(req.path,{uid,...(/^[A-Za-z0-9_.:-]{2,100}$/.test(handle||'')?{handle}:{}),at:Date.now()});state.pending.delete(req.key);return;
      }
      if (req.kind === 'summary') {
        const rows = body.item_list;
        if(!Array.isArray(rows)||rows.length>100){state.summaries.set(req.workId,'作品摘要列表未识别或超过容量');return;}
        const matches=rows.filter(row=>[row?.item_id,row?.aweme_id].some(value=>id(value)===req.workId));
        const row=matches.length===1?matches[0]:rows.length===1&&matches.length===0?rows[0]:undefined;
        if(!row||matches.length>1){state.summaries.set(req.workId,'作品摘要返回'+rows.length+'条，未找到唯一匹配的本人作品');return;}
        // The request itself is already tied to the numeric owned detail.
        // Some legacy summaries echo sec_item_id as item_id. Accept that
        // exact echo, not a different numeric work, malformed ID or ambiguity.
        const echo=row.item_id??row.aweme_id,ref=row.sec_item_id;
        if(echo!==undefined&&id(echo)!==req.workId&&!(typeof echo==='string'&&!/^\d+$/.test(echo)&&echo===ref&&echo.length>0&&echo.length<=512)){state.summaries.set(req.workId,typeof echo==='number'&&!Number.isSafeInteger(echo)?'作品摘要编号数字精度不可核验':'作品摘要作品编号与请求不一致');return;}
        if(row.aweme_id!==undefined&&id(row.aweme_id)!==req.workId){state.summaries.set(req.workId,'作品摘要作品编号与请求不一致');return;}
        if (typeof ref === 'string' && ref.length > 0 && ref.length <= 512) { references.set(ref, req.workId); state.summaries.set(req.workId, ref === req.workId ? '作品摘要返回数字作品引用' : '作品摘要已关联旧版引用'); }
        else state.summaries.set(req.workId, '作品摘要已返回，但未提供旧版评论引用');
        return;
      }
      if (req.reference && !id(req.reference) && references.get(req.reference) !== req.workId && !renderedReference(req)) {
        // A normal fetch clone may finish after the website has already used
        // its summary response. Wait only for that in-flight receive; no GET.
        if (attempt < 40) { setTimeout(() => receive(req, status, raw, attempt + 1), 50); return; }
        throw Error('官方评论使用的作品引用尚未通过本人作品摘要关联');
      }
      const hasMore = body.has_more;
      if (![true, false, 0, 1].includes(hasMore)) throw Error('官方读取响应缺少分页结束标记');
      const next = cursor(body[req.kind === 'works' ? 'max_cursor' : 'cursor']) ?? (!hasMore ? '0' : undefined);
      if (next === undefined) throw Error('官方读取响应缺少有效分页游标');
      let list = req.kind === 'works' ? body.aweme_list : Object.prototype.hasOwnProperty.call(body, 'comments') ? body.comments : body.comment_info_list;
      if (list === null && !hasMore) list = [];
      if (!Array.isArray(list) || list.length > 100) throw Error('官方读取响应的记录列表未识别');
      const legacy = req.interfaceName === '旧版评论';
      const user = u => ({ uid: commentId(u?.uid ?? u?.user_id, legacy), ...([undefined, null, ''].includes(u?.uid ?? u?.user_id) ? { identityUnavailable: true } : {}), ...(legacy ? { referenceKind: 'legacy' } : {}), nickname: typeof (u?.nickname ?? u?.screen_name) === 'string' ? (u.nickname ?? u.screen_name).slice(0, 200) : '', sec_uid: u?.sec_uid, avatar_thumb: u?.avatar_thumb ?? (typeof u?.avatar_url === 'string' ? { url_list: [u.avatar_url] } : undefined) });
      const comments = (list, nested = false) => list.map(row => {
        const cid = commentId(row.cid ?? row.comment_id, legacy), author = user(row.user ?? row.user_info);
        if (!cid) { const rawId=row.cid??row.comment_id;throw Error('官方评论标识未识别（' + (typeof rawId === 'number' ? '数字精度或范围无效' : typeof rawId === 'string' ? '字符串格式未支持；长度'+rawId.length+'；'+(/^[A-Za-z0-9]/.test(rawId)?'字母数字开头':'非字母数字开头')+'；'+(/[^\x21-\x7e]/.test(rawId)?'含空白或非ASCII':'仅ASCII') : '字段未提供') + '）'); }
        if (!author.uid && !author.identityUnavailable) throw Error('官方评论作者标识未识别（' + (typeof (row.user?.uid ?? row.user_info?.user_id) === 'number' ? '数字精度或范围无效' : '字符串格式未支持') + '）');
        if (typeof row.text !== 'string') throw Error('官方评论正文字段未识别');
        const related = id(row.aweme_id ?? row.item_id); if (related && related !== req.workId) throw Error('官方评论作品编号不一致');
        const count = row.reply_comment_total ?? row.comment_reply_total ?? row.reply_count ?? 0;
        const result = { cid, ...(legacy ? { referenceKind: 'legacy' } : {}), aweme_id: req.workId, text: row.text.slice(0, 16000), user: author, create_time: row.create_time, reply_comment_total: count, user_digged: row.user_digged ?? row.user_digg ?? row.is_digged, digg_count: row.digg_count ?? row.like_count };
        Object.assign(result,projectMedia(row));
        const preview = row.reply_comment ?? row.reply_list;
        if (!nested && preview !== undefined) {
          if (!Array.isArray(preview) || preview.length > 100) throw Error('官方内嵌回复列表未识别或超过容量');
          result.reply_comment = comments(preview, true);
          const total = typeof count === 'string' && /^\d{1,5}$/.test(count) ? Number(count) : count;
          // Official UI calculates has_more_reply from reply_count and
          // reply_list length (Ay), including new replies mapped by Gh. When
          // all exact unique replies are already
          // in that GET, its button is Collapse, not another paging request.
          if (preview.length && (!Number.isSafeInteger(total) || total < preview.length)) throw Error('官方内嵌回复数量与声明总数不一致');
          result.reply_comment_complete = Number.isSafeInteger(total) && total > 0 && total === preview.length && new Set(result.reply_comment.map(r => r.cid)).size === total && row.has_more_reply !== true;
        }
        return result;
      });
      const rows = req.kind === 'works' ? list.map(row => {
        const awemeId = id(row.aweme_id ?? row.item_id), author = id(row.author?.uid ?? row.author?.user_id);
        if (!awemeId) throw Error('官方作品编号未识别');
        const cover = row.video?.cover ?? row.video?.origin_cover ?? row.cover;
        const coverUrl = Array.isArray(cover?.url_list) ? cover.url_list.find(url => { try { const u = new URL(url); return u.protocol === 'https:' && !u.username && !u.password && u.href.length <= 4096; } catch { return false; } }) : undefined;
        const rawCount=row.metrics?.comment_count,count=(typeof rawCount==='number'||typeof rawCount==='string'&&/^\d+$/.test(rawCount))&&Number.isSafeInteger(Number(rawCount))&&Number(rawCount)>=0?Number(rawCount):undefined;
        const rawPlay=row.metrics?.play_count,play=(typeof rawPlay==='number'||typeof rawPlay==='string'&&/^\d+$/.test(rawPlay))&&Number.isSafeInteger(Number(rawPlay))&&Number(rawPlay)>=0?Number(rawPlay):undefined;
        const created=row.create_time,top=row.is_top;
        return { aweme_id: awemeId, desc: typeof (row.desc ?? row.title) === 'string' ? (row.desc ?? row.title).slice(0, 1000) : '', ...((typeof created==='number'&&Number.isSafeInteger(created)||typeof created==='string'&&/^\d{1,13}$/.test(created))?{create_time:created}:{}),...([true,false,0,1,'0','1'].includes(top)?{is_top:top}:{}), ...(coverUrl ? { cover: { url_list: [coverUrl] } } : {}), ...(author ? { author: { uid: author } } : {}),...(count!==undefined||play!==undefined?{metrics:{...(count!==undefined?{comment_count:count}:{}),...(play!==undefined?{play_count:play}:{})}}:{}),...(play!==undefined?{metrics_observed_at:new Date().toISOString()}:{}) };
      }) : comments(list);
      if (req.kind === 'comments') {
        let known = rootReferences.get(req.workId); if (!known) { known = new Set(); rootReferences.set(req.workId, known); }
        for (const row of rows) { if (known.size >= 50000 && !known.has(row.cid)) throw Error('此作品评论标识达到只读容量上限'); known.add(row.cid); }
      }
      value = { status_code: 0, has_more: !!hasMore, [req.kind === 'works' ? 'max_cursor' : 'cursor']: next, [req.kind === 'works' ? 'aweme_list' : 'comments']: rows };
    } catch (e) {
      if(req.kind==='identity'){state.identities.delete(req.path);state.pending.delete(req.key);return;}
      if (req.kind === 'summary') { state.summaries.set(req.workId, '作品摘要：' + e.message); return; }
      const referenceKind = !req.reference || id(req.reference) ? '数字编号' : references.get(req.reference) === req.workId ? '摘要已关联' : '摘要未关联';
      value = { error: (req.kind === 'works' ? '作品目录' : req.kind === 'replies' ? '评论回复' : '作品评论') + '（' + req.interfaceName + '，' + referenceKind + '）：' + e.message, receivedAt: Date.now() };
    }
    state.pages.set(req.key, value);
    state.pending.delete(req.key);
    if (state.pages.size > 128) state.pages.delete(state.pages.keys().next().value);
  }
  const fetchOriginal = window.fetch;
  // Separate one-shot user-action receipt observer. It never creates a
  // request; native's exact work/comment/body policy still gates the POST.
  const writeRequest = (raw, method) => {
    const intent = window.__matrixCreatorCommentWrite;
    if (!intent || String(method || 'GET').toUpperCase() !== 'POST') return;
    try { const u = new URL(raw, location.href); if (u.origin === location.origin && intent.routes.includes(u.pathname)) return { nonce: intent.nonce }; } catch {}
  };
  const receiveWrite = (req, status, body) => {
    const intent = window.__matrixCreatorCommentWrite;
    if (!intent || intent.nonce !== req.nonce) return;
    const code = body?.status_code, child = Array.isArray(body?.comments) ? body.comments.find(v => v.reply_to_comment_id === intent.commentId) : undefined;
    const failed = status !== 200 || Number.isInteger(code) && code !== 0 || child && Number(child.code) !== 0;
    if (failed) { intent.receipt = { state: 'failed', message: '评论操作失败（HTTP ' + status + '，平台码 ' + (Number.isInteger(code) ? code : '未提供') + '）：' + officialMessage(body?.status_msg || child?.msg) }; return; }
    if (code !== 0) return;
    if (intent.action === 'like') {
      const rawCount=body.digg_count??body.like_count??body.comment?.digg_count;
      const count=(typeof rawCount==='number'||typeof rawCount==='string'&&/^\d+$/.test(rawCount))&&Number.isSafeInteger(Number(rawCount))&&Number(rawCount)>=0?Number(rawCount):undefined;
      intent.receipt = { state: 'confirmed', message: intent.liked ? '已点赞' : '已取消点赞', liked: intent.liked,...(count!==undefined?{likeCount:count}:{}) }; return;
    }
    const added = child?.comment ?? body.comment_info ?? body.comment;
    const cid = commentId(added?.cid ?? added?.comment_id, true);
    if (cid && cid !== intent.commentId && added.text === intent.text) intent.receipt = { state: 'confirmed', message: '平台已确认回复', commentId: cid };
  };
  window.fetch = function(input, init) {
    const req = request(typeof input === 'string' || input instanceof URL ? String(input) : input?.url, init?.method || input?.method);
    const write = writeRequest(typeof input === 'string' || input instanceof URL ? String(input) : input?.url, init?.method || input?.method);
    const result = Reflect.apply(fetchOriginal, this, arguments);
    if (write) result.then(response => response.clone().text().then(value => receiveWrite(write, response.status, value.length <= 1024 * 1024 ? parseResponse(value) : null)), () => {}).catch(() => {});
    if (req) result.then(response => {
      // Read a clone only. The website receives the original response unchanged.
      const copy = response.clone();
      copy.text().then(value => receive(req, response.status, value.length <= 4 * 1024 * 1024 ? parseResponse(value) : null)).catch(() => receive(req, response.status, null));
    }, () => receive(req, 0, null)).catch(() => {});
    return result;
  };
  const openOriginal = XMLHttpRequest.prototype.open, sendOriginal = XMLHttpRequest.prototype.send;
  const xhrWrites = new WeakMap();
  XMLHttpRequest.prototype.open = function(method, url) { xhrRequests.set(this, request(url, method, false)); xhrWrites.set(this, writeRequest(url, method)); return Reflect.apply(openOriginal, this, arguments); };
  XMLHttpRequest.prototype.send = function() {
    const req = begin(xhrRequests.get(this));
    const write = xhrWrites.get(this);
    if (write) this.addEventListener('loadend', () => { try { const raw = this.responseType === 'json' ? this.response : this.responseText; receiveWrite(write, this.status, typeof raw === 'string' ? raw.length <= 1024 * 1024 ? parseResponse(raw) : null : raw); } catch {} }, { once: true });
    if (req) this.addEventListener('loadend', () => { try { const raw = this.responseType === 'json' ? this.response : !this.responseType || this.responseType === 'text' ? this.responseText : ''; receive(req, this.status, typeof raw === 'string' ? raw.length <= 4 * 1024 * 1024 ? parseResponse(raw) : null : raw); } catch { receive(req, this.status, null); } }, { once: true });
    return Reflect.apply(sendOriginal, this, arguments);
  };
}
if (typeof process !== 'undefined' && process.type === 'renderer') {
  // World 0 is the normal website world; isolated preload keeps its privileges.
  // No script tag/CSP changes, webSecurity changes or debugger attachment.
  require('electron').webFrame.executeJavaScriptInIsolatedWorld(0, [{ code: '(' + installCreatorResponseObserver.toString() + ')(('+projectCommentMedia.toString()+'))' }]).catch(() => {});
} else module.exports = { installCreatorResponseObserver, projectCommentMedia };
