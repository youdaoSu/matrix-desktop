// Independent, read-only website adapter. No copied third-party implementation,
// credentials in renderer replies, closure/debugger inspection or sending SDK.
const { createHash, randomUUID } = require('node:crypto');
const { projectCommentMedia } = require('./douyin-creator-preload.cjs');
const { followerPage } = require('./douyin-followers-preload.cjs');
const { registerScopedRequestPolicy } = require('./douyin-scoped-request-policy.cjs');
const { publicScript } = require('./douyin-public-asset-manifest.cjs');
const AUTH = /^(sessionid|sessionid_ss|sid_tt|sid_guard|uid_tt|uid_tt_ss|sid_ucp_v1|ssid_ucp_v1)$/;
const endpoints = Object.freeze({ self: '/aweme/v1/web/user/profile/self/', works: '/aweme/v1/web/aweme/post/', comments: '/aweme/v1/web/comment/list/', replies: '/aweme/v1/web/comment/list/reply/', followers: '/aweme/v1/web/user/follower/list/' });
// Normal website traffic is not necessarily read-only: notification GETs can
// consume red dots. The collector permits only these specific business reads.
const FAN_INDEX_INFO_PATH='/web/api/creator/monetize/active_fans/fans_score_info';
const READ_PATHS = new Set([...Object.values(endpoints), '/aweme/v1/web/user/profile/other/', '/aweme/v1/web/aweme/detail/',FAN_INDEX_INFO_PATH]);
// Metadata for ONE active, exact-target GET. No URLs/IDs/exception text are
// exported. These observations never change request policy or cause a retry.
function avatarNetwork(r,d,phase,cancel){
  const a=r.avatarAttempt;if(!a)return;
  try{const u=new URL(d.url);if(u.origin!=='https://www.douyin.com'||u.pathname!=='/aweme/v1/web/user/profile/other/'||u.searchParams.get('sec_user_id')!==a.secUid)return;
    if(phase==='start'){a.ids.add(d.id);a.started++;if(cancel)a.blocked++;}
    else if(a.ids.has(d.id)){if(phase==='end')a.status=d.statusCode;else a.failure=d.error==='net::ERR_BLOCKED_BY_CLIENT'?'blocked':d.error==='net::ERR_ABORTED'?'aborted':d.error==='net::ERR_TIMED_OUT'?'timeout':/net::ERR_(?:NAME_NOT_RESOLVED|CERT_AUTHORITY_INVALID|CERT_DATE_INVALID)$/.test(d.error||'')?'connection':'other';}
  }catch{}
}
function renderedWorks({ expectedUid, cursor = '0', peek = false, headOnly = false, advance = false }) {
  // This function is serialized into the owned profile page. Read only the
  // data attached to rendered video links, never SDK closures/auth options.
  const result = [], seen = new Set(), renderedNodes=new Map(), visible = e => e?.isConnected && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0;
  const exact = v => typeof v === 'string' && /^[1-9]\d{0,18}$/.test(v) ? v : Number.isSafeInteger(v) && v > 0 ? String(v) : '';
  const authorId=value=>{const values=[value?.author?.uid,value?.author?.userId,value?.authorInfo?.uid,value?.authorUserId,value?.author_user_id].filter(v=>v!==undefined&&v!==null),ids=new Set(values.map(exact));return values.length&&ids.size===1&&!ids.has('')?[...ids][0]:'';};
  const nonPosts=e=>!!e.closest?.('[data-e2e="user-favorite-list"],[data-e2e="user-like-list"]');
  if (location.origin !== 'https://www.douyin.com' || location.pathname !== '/user/self' || !exact(expectedUid)) return null;
  const previous = window.__matrixOwnedPostInventory;
  if (!peek && cursor === '0' && previous?.uid === expectedUid && previous.lastReturnedAt && Date.now() - previous.lastReturnedAt >= 45000) {
    window.__matrixOwnedPostInventory = { uid: expectedUid, items: [] };
    const list = document.querySelector('[data-e2e="user-post-list"],ul[data-e2e="scroll-list"]');
    for (let parent = list?.parentElement, n = 0; parent && n < 8; parent = parent.parentElement, n++) if (parent.scrollHeight > parent.clientHeight + 10) { parent.scrollTo?.({ top: 0 }); break; }
    document.scrollingElement?.scrollTo?.({ top: 0 });
    return { waiting: true };
  }
  const links = [...document.querySelectorAll('ul[data-e2e="scroll-list"] a[href*="/video/"], ul[data-e2e="scroll-list"] a[href*="/note/"], [data-e2e="user-post-list"] a[href*="/video/"], [data-e2e="user-post-list"] a[href*="/note/"], [data-e2e="user-post-item"] a[href*="/video/"], [data-e2e="user-post-item"] a[href*="/note/"], a[data-e2e="user-post-item"][href*="/video/"], a[data-e2e="user-post-item"][href*="/note/"]')].slice(0, 2000).filter(visible);
  let foreignLinks=0,unknownLinks=0;
  for (const link of links) {
    if(nonPosts(link))continue;
    let url; try { url = new URL(link.href, location.origin); } catch { continue; }
    const workId = /^\/(?:video|note)\/([1-9]\d{0,18})$/.exec(url.pathname)?.[1]; if (url.origin !== location.origin || !workId || seen.has(workId)) continue;
    let item, foreignAuthor = false;
    for (let e = link, parents = 0; e && parents < 4 && !item; e = e.parentElement, parents++) {
      let fiber = e[Object.keys(e).find(k => k.startsWith('__reactFiber$'))];
      for (let n = 0; fiber && n < 6 && !item; n++, fiber = fiber.return) {
        const props = fiber.memoizedProps;
        for (const value of [props?.awemeInfo, props?.itemInfo, props?.aweme, props?.data, props?.item, props?.itemData, props?.video, props?.videoData]) {
          if (value && exact(value.aweme_id ?? value.awemeId) === workId) {
            const author = authorId(value);
            if(!author&&[value.author?.uid,value.author?.userId,value.authorInfo?.uid,value.authorUserId,value.author_user_id].some(v=>v!==undefined&&v!==null))foreignAuthor=true;
            if (author === expectedUid) { item = value; break; }
            if (author) foreignAuthor = true;
          }
        }
      }
    }
    // Only explicitly named own-post cards may use DOM text without a React
    // data object. Generic scroll lists can contain likes/recommendations and
    // still require an exact author UID; never infer owner from nickname.
    const ownedCard = link.closest?.('[data-e2e="user-post-item"], [data-e2e="user-post-list"]');
    if (foreignAuthor || !item && !ownedCard) {if(foreignAuthor)foreignLinks++;else unknownLinks++;continue;}
    const title = item?.desc ?? ownedCard?.querySelector?.('img[alt]')?.alt ?? link.getAttribute?.('title') ?? link.innerText ?? '';
    const created=item?.create_time??item?.createTime,top=item?.is_top??item?.isTop;
    const coverList=item?.video?.cover?.url_list??item?.video?.cover?.urlList,coverCandidates=[...(Array.isArray(coverList)?coverList:[]),typeof item?.video?.cover==='string'?item.video.cover:undefined,ownedCard?.querySelector?.('img')?.currentSrc,ownedCard?.querySelector?.('img')?.src];
    const cover=coverCandidates.find(value=>{if(typeof value!=='string')return false;try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&u.href.length<=4096;}catch{return false;}});
    seen.add(workId);renderedNodes.set(workId,link);result.push({ aweme_id: workId, desc: typeof title === 'string' ? title.slice(0, 1000) : '', ...((typeof created==='number'&&Number.isSafeInteger(created)||typeof created==='string'&&/^\d{1,13}$/.test(created))?{create_time:created}:{}),...([true,false,0,1,'0','1'].includes(top)?{is_top:top}:{}),...(cover?{cover:{url_list:[cover]}}:{}), author: { uid: expectedUid } });
  }
  // The official user-card component deliberately renders DIV rather than A
  // for some quality/status variants. Read only data attached to a rendered
  // single card in the own-post section: exact work + exact author IDs, never
  // a title/thumbnail guess, collection list or an arbitrary state traversal.
  const cards=[...document.querySelectorAll('[data-e2e="user-post-list"] [data-e2e="scroll-list"] > li,[data-e2e="user-post-list"] [data-e2e="scroll-list"] > div,[data-e2e="user-post-item"]')].slice(0,2000).filter(card=>visible(card)&&!nonPosts(card));
  for(const card of cards){
    const values=new Map();let conflict=false;
    for(let element=card,depth=0;element&&depth<3;element=element.parentElement,depth++){
      if(element!==card&&element.matches?.('[data-e2e="scroll-list"],[data-e2e="user-post-list"]'))break;
      let fiber=element[Object.keys(element).find(key=>key.startsWith('__reactFiber$'))];
      for(let n=0;fiber&&n<6;fiber=fiber.return,n++)for(const value of [fiber.memoizedProps?.awemeInfo,fiber.memoizedProps?.itemInfo,fiber.memoizedProps?.aweme,fiber.memoizedProps?.item]){
        if(!value||typeof value!=='object'||Array.isArray(value))continue;
        const ids=new Set([value.aweme_id,value.awemeId].filter(v=>v!==undefined&&v!==null).map(exact));
        if(ids.size!==1||ids.has(''))continue;const id=[...ids][0],author=authorId(value);
        if(author&&author!==expectedUid){conflict=true;continue;}if(author!==expectedUid)continue;
        values.set(id,value);
      }
    }
    if(conflict||values.size!==1){if(conflict)foreignLinks++;else unknownLinks++;continue;}
    const [id,item]=[...values][0];if(seen.has(id))continue;
    const created=item.create_time??item.createTime,top=item.is_top??item.isTop,coverValue=item.video?.cover,coverList=coverValue?.url_list??coverValue?.urlList;
    const cover=[...(Array.isArray(coverList)?coverList:[]),typeof coverValue==='string'?coverValue:undefined,card.querySelector?.('img')?.currentSrc,card.querySelector?.('img')?.src].find(v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&u.href.length<=4096;}catch{return false;}});
    seen.add(id);renderedNodes.set(id,card);result.push({aweme_id:id,desc:typeof item.desc==='string'?item.desc.slice(0,1000):'',author:{uid:expectedUid},...((typeof created==='number'&&Number.isSafeInteger(created)||typeof created==='string'&&/^\d{1,13}$/.test(created))?{create_time:created}:{}),...([true,false,0,1,'0','1'].includes(top)?{is_top:top}:{}),...(cover?{cover:{url_list:[cover]}}:{})});
  }
  result.sort((a,b)=>{const position=renderedNodes.get(a.aweme_id)?.compareDocumentPosition?.(renderedNodes.get(b.aweme_id));return position&2?1:position&4?-1:0;});
  if(peek)return {aweme_list:result.slice(0,100).map((row,index)=>({...row,homepage_rank:index}))};
  const old = window.__matrixOwnedPostInventory;
  const cache = old?.uid === expectedUid && Array.isArray(old.items) && old.items.length <= 5000 ? old : { uid: expectedUid, items: [] };
  const known = new Set(cache.items.map(v => v.aweme_id)); for (const row of result) if (!known.has(row.aweme_id)) { known.add(row.aweme_id); cache.items.push(row); }
  if (cache.items.length > 5000) throw Error('Owned inventory limit');
  window.__matrixOwnedPostInventory = cache;
  const selected = [...document.querySelectorAll('[role="tab"][aria-selected="true"]')].filter(visible).map(e => (e.innerText || e.textContent || '').trim());
  const ownTab = !!document.querySelector('[data-e2e="user-post-list"]:not([data-e2e="user-favorite-list"] *):not([data-e2e="user-like-list"] *)') || selected.some(t => /^作品\s*[\d万.]*$/.test(t));
  // A sidebar/recommendation footer cannot terminate this own-post list.
  // When the exact list scope is unavailable, preserve an unfinished cursor.
  const postRoots=[...document.querySelectorAll('[data-e2e="user-post-list"]')].filter(e=>visible(e)&&!nonPosts(e));
  const ended = ownTab && postRoots.some(root=>[root,...root.querySelectorAll('div,p')].slice(0,10000).some(e => visible(e) && !e.children.length && /^(暂无作品|暂无内容|暂时没有更多了|没有更多作品|没有更多了)$/.test((e.innerText || e.textContent || '').trim())));
  if(headOnly){
    const inventory_stats={inventoryHeadLinks:links.length,inventoryHeadCards:cards.length,inventoryHeadOwned:result.length,inventoryHeadForeign:foreignLinks,inventoryHeadUnknown:unknownLinks,inventoryHeadItemAnchors:document.querySelectorAll('a[data-e2e="user-post-item"]').length,inventoryHeadOwnTab:ownTab?1:0};
    if(!result.length&&(!ownTab||!ended))return {waiting:true,inventory_stats};
    if(advance){const node=renderedNodes.get(result.at(-1)?.aweme_id),allowed=ownTab&&!ended&&result.length>0&&result.length<100&&typeof node?.scrollIntoView==='function';if(allowed){let target;for(let box=node.parentElement,depth=0;box&&depth<8;box=box.parentElement,depth++)if(box.clientHeight>40&&box.scrollHeight>box.clientHeight+2&&/auto|scroll/.test(getComputedStyle(box).overflowY)){target=box;break;}target=target||document.scrollingElement;const before=target?.scrollTop;node.scrollIntoView({block:'end'});if(target&&target.scrollTop===before)(target===document.scrollingElement?window:target).dispatchEvent(new Event('scroll',{bubbles:true}));}return {advanced:allowed};}
    // Exact-author data attached to a rendered generic card still proves
    // ownership, even if this site's tab has no role/aria-selected marker.
    // It may discover an owned post, but cannot claim homepage rank or end.
    return {status_code:0,aweme_list:result.slice(0,100).map((row,index)=>ownTab?{...row,homepage_rank:index}:row),has_more:!ownTab||!ended,max_cursor:'0',inventory_source:ownTab?'rendered-owned-head':'rendered-owned-discovery',inventory_stats};
  }
  const offset = Number(cursor); if (!Number.isSafeInteger(offset) || offset < 0) throw Error('Owned inventory cursor');
  if (offset > cache.items.length) { links.at(-1)?.scrollIntoView({ block: 'end' }); return { waiting: true }; }
  if (!cache.items.length && !ended) return null;
  const page = cache.items.slice(offset, offset + 20), next = offset + page.length;
  if (!page.length && !ended) { links.at(-1)?.scrollIntoView({ block: 'end' }); return { waiting: true }; }
  if (next >= cache.items.length && !ended) links.at(-1)?.scrollIntoView({ block: 'end' });
  cache.lastReturnedAt = Date.now();
  return { status_code: 0, aweme_list: page, max_cursor: String(next), has_more: !ended || next < cache.items.length, inventory_count: cache.items.length, inventory_source: 'rendered-owned-posts' };
}
// Runs only inside a dedicated official profile page. It never selects a chat,
// traverses private SDK closures, reads auth options or constructs signatures.
async function pageRead(input, projectMedia) {
  let responseFacts={};
  const progress = phase => { if (/^[a-f0-9-]{36}$/.test(input.traceToken || '')) { try { window.__matrixReaderProgress={token:input.traceToken,phase}; } catch {} try { console.debug('matrix-read-stage:' + input.traceToken + ':' + phase); } catch {} } };
  progress('page-check');
  const messages = { ORIGIN: '抖音采集页已离开官方本人主页，请在账号管理恢复登录', NOT_READY: '抖音官网只读服务尚未加载，请稍后继续', OWNER: '抖音官网本人ID与绑定账号不一致，已停止采集', VERIFY: '抖音官网要求本人登录或页面验证，请在账号管理处理', SHAPE: '抖音官网返回结构发生变化，本页未采用', API: '抖音官网读取方法未成功返回，已有记录保留', AMBIGUOUS: '抖音官网读取方法不唯一，已停止而未猜测调用', PROFILE_HTTP: '抖音官网本人资料请求未通过，请在账号管理检查官方页面', PROFILE_JSON: '抖音官网本人资料未返回可识别JSON，未当作没有数据', READ_HTTP: '抖音官网只读请求未通过，已有数据保留', READ_JSON: '抖音官网只读请求未返回可识别JSON，不代表没有数据' };
  const fail = (code, platformCode, httpStatus) => { throw Object.assign(Error(code), { matrixCode: code, platformCode, httpStatus }); };
  const id = v => { const s = typeof v === 'string' ? v : Number.isSafeInteger(v) ? String(v) : ''; if (!/^\d{1,19}$/.test(s)) fail('SHAPE'); return s; };
  const text = (v, max = 1000) => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, max) : '';
  const flag = v => { if (![0, 1, true, false].includes(v)) fail('SHAPE'); return !!v; };
  const value = (o, a, b) => o && Object.hasOwn(o, a) ? o[a] : o?.[b];
  const parseResponse = raw => {
    if(typeof raw!=='string'||raw.length>4*1024*1024)throw Error('response size');
    raw=raw.replace(/^\uFEFF/,'');
    const original=JSON.parse(raw);let changed=false;
    const exact=raw.replace(/"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g,token=>{if(token[0]!=='"'&&/^-?\d+$/.test(token)&&!Number.isSafeInteger(Number(token))){changed=true;return JSON.stringify(token);}return token;});
    return changed?JSON.parse(exact):original;
  };
  const responseText = async response => {
    const mime=(response.headers?.get('content-type')||'').split(';')[0].trim().toLowerCase(),encoding=(response.headers?.get('content-encoding')||'').trim().toLowerCase();
    responseFacts={responseStatus:Number.isInteger(response.status)?response.status:0,responseMime:/^(?:application\/(?:[\w.+-]+\+)?json|text\/json)$/.test(mime)?1:mime==='text/html'?2:mime.startsWith('text/')?3:mime?4:0,responseEncoding:encoding==='gzip'?1:encoding==='br'?2:encoding==='deflate'?3:encoding?4:0,responseReadError:0,responseBytes:0,responseBodyKind:0};
    const inspect=raw=>{const trimmed=raw.trimStart();responseFacts.responseBytes=new TextEncoder().encode(raw).length;responseFacts.responseBodyKind=!trimmed.length?1:/^<!doctype\s+html|^<html(?:\s|>)/i.test(trimmed)?2:/^[{[]/.test(trimmed)?3:/^(?:\)\]\}',?|for\s*\(\s*;;\s*\)\s*;|while\s*\(\s*1\s*\)\s*;)/.test(trimmed)?4:/[\u0000-\u0008\ufffd]/.test(trimmed.slice(0,64))?5:6;return raw;};
    if(input.ordinaryReads!==true)return inspect(await response.text());
    if(Number(response.headers?.get('content-length'))>4*1024*1024){responseFacts.responseReadError=2;throw Error('response size');}
    if(!response.body?.getReader){responseFacts.responseReadError=1;throw Error('response stream unavailable');}
    const stream=response.body.getReader(),decoder=new TextDecoder();let bytes=0,text='';
    try{for(;;){const part=await stream.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>4*1024*1024){responseFacts.responseReadError=2;throw Error('response size');}text+=decoder.decode(part.value,{stream:true});}return inspect(text+decoder.decode());}catch(error){responseFacts.responseReadError ||=3;throw error;}finally{try{await stream.cancel();}catch{}}
  };
  const user = u => {
    if (!u || typeof u !== 'object') fail('SHAPE');
    const resources = ['avatar_thumb','avatarThumb','avatar_medium','avatarMedium','avatar_larger','avatarLarger','avatar_url','avatarUrl','avatar_uri','avatarUri','avatar','avatar_168x168','avatar_300x300','avatar_100x100'];
    const urls = resources.flatMap(key => { const v = u[key],resource=value(v,'url_list','urlList')??v?.url??v?.src??v; return typeof resource==='string'?[resource]:Array.isArray(resource)?resource.slice(0,8):[]; });
    const signature=text(typeof u.signature==='string'?u.signature:u.desc),followSource=value(u,'follow_time','followTime'),followNumber=typeof followSource==='string'&&/^\d{1,13}$/.test(followSource)?Number(followSource):followSource;
    const followValid=Number.isSafeInteger(followNumber)&&(followNumber>=946684800&&followNumber<4102444800||followNumber>=946684800000&&followNumber<4102444800000);
    const state=(field,fallback,present)=>present?'provided':['empty','missing','invalid'].includes(u.followerDetailState?.[field])?u.followerDetailState[field]:u.followerDetailState?.[field]==='provided'?'invalid':fallback;
    const followerDetailState={signature:state('signature',Object.hasOwn(u,'signature')||Object.hasOwn(u,'desc')?typeof u.signature==='string'||typeof u.desc==='string'?'empty':'invalid':'missing',!!signature),followTime:state('followTime',Object.hasOwn(u,'follow_time')||Object.hasOwn(u,'followTime')?[0,'0','',null].includes(followSource)?'empty':'invalid':'missing',followValid)};
    return { uid: id(u.uid ?? u.userId), sec_uid: text(value(u, 'sec_uid', 'secUid'), 256), nickname: text(u.nickname ?? u.nickName, 200), remark_name: text(value(u, 'remark_name', 'remarkName'), 200), signature, followerDetailState, avatar_thumb: { url_list: [...new Set(urls.filter(v => typeof v === 'string' && v.length <= 4096 && /^https:\/\//.test(v)))].slice(0, 4) }, ...(typeof u.avatarReadHint==='string'&&u.avatarReadHint.startsWith('头像资源尚无可用地址；字段结构：')?{avatarReadHint:text(u.avatarReadHint,300)}:{}), ...(followValid ? { follow_time: followNumber } : {}) };
  };
  const pageState = () => {
    const q = selector => document.querySelectorAll(selector).length;
    const observed=window.__matrixFollowerObserved;
    return { ...responseFacts,scripts:q('script'),workLinks:q('[data-e2e="user-post-list"] a[href*="/video/"], [data-e2e="user-post-item"] a[href*="/video/"]'),ownLists:q('[data-e2e="user-post-list"], [data-e2e="user-post-item"]'),runtime:Array.isArray(window.webpackChunkdouyin_web),bodyNodes:q('body *'),titleVerification:/验证码|安全验证|访问受限|验证中心/.test(document.title||''),...(observed?.version===1?{
      followerObservedPages:observed.pages.size,followerObservedPending:observed.pending.size,followerObservedErrors:observed.errors.size,followerObservedOrder:observed.order.length,
      followerDomRoots:observed.domRootCount||0,followerDomLinks:observed.domProfileLinks||0,followerDomRows:observed.domProjectedRows||0,followerDomPages:observed.domFollowerPages?.pages.length||0,followerDomSeen:observed.domFollowerPages?.seen.size||0,
      followerDomHeadings:observed.domHeadingCount||0,followerDomImages:observed.domImageCount||0,followerDomFrames:observed.domFrameCount||0,followerDomCards:observed.domCandidateCards||0,followerDomUidFields:observed.domUidFields||0,
      followerDomPanels:observed.domPanelCount||0,followerDomPanelOwnProof:observed.domPanelOwnProof||0,followerDomPanelTabMask:observed.domPanelTabMask||0,followerEntryIdentityMask:observed.entryIdentityMask||0,followerDomRootFastPath:observed.domRootFastPath||0,
      followerDomFollowingHeadings:observed.domFollowingHeadings||0,followerDomRemoveControls:observed.domRemoveControls||0,followerDomBackFollowControls:observed.domBackFollowControls||0,followerDomMutualControls:observed.domMutualControls||0,followerDomAllUserLinks:observed.domAllUserLinks||0,
      followerUiReads:observed.uiReads||0,followerUiOpened:observed.openRequested?1:0,followerUiDomMode:observed.readMode==='dom'?1:0,followerUiResponseMode:observed.readMode==='response'?1:0,followerUiSelfPending:observed.identityPending?1:0,followerUiReaderReady:typeof observed.readRenderedFollowers==='function'?1:0,followerInitialScrolls:observed.initialScrolls||0,followerPanelPropsMask:observed.domPanelPropsMask||0,followerPanelUserListCount:observed.domPanelUserListCount||0,followerDomFooterCount:observed.domFooterCount||0,followerDomFooterStateMask:observed.domFooterStateMask||0,followerDomPanelChildCount:observed.domPanelChildCount||0,
      followerErrorSites:Array.isArray(observed.errorSites)?observed.errorSites.slice(0,8):[],
      ...Object.fromEntries(['fetchStarted','fetchReceived','fetchRepairs','xhrStarted','xhrReceived','xhrRepairs','xhrAbort','xhrError','xhrTimeout','xhrStatusZero','xhrStateErrors'].map(key=>['follower'+key[0].toUpperCase()+key.slice(1),observed.transport?.[key]||0]))
    }:{} ) };
  };
  try {
    if (location.origin !== 'https://www.douyin.com' || location.pathname !== '/user/self') fail('ORIGIN');
    if (pageState().titleVerification || [...document.querySelectorAll('input')].some(e => e.getBoundingClientRect().width > 0 && /captcha|验证码|one-time-code/i.test([e.name, e.placeholder, e.autocomplete].join(' ')))) fail('VERIFY');
    const paths = { self: '/aweme/v1/web/user/profile/self/', works: '/aweme/v1/web/aweme/post/', comments: '/aweme/v1/web/comment/list/', replies: '/aweme/v1/web/comment/list/reply/', followers: '/aweme/v1/web/user/follower/list/' };
    if (!Object.hasOwn(paths, input.kind) || !input.handle || typeof input.handle !== 'string') fail('SHAPE');
    let runtime;
    const chunks = window.webpackChunkdouyin_web;
    const find = route => {
      progress('website-method-discovery');
      if (!runtime && Array.isArray(chunks)) chunks.push([[`matrix-read-${Date.now()}`], {}, r => { runtime = r; }]);
      if (!runtime?.m) fail('NOT_READY');
      const found = new Set(); let inspected = 0;
      const contains = fn => { const source = Function.prototype.toString.call(fn); return ['"', "'", '`'].some(q => source.includes(q + route + q)); };
      for (const [key, factory] of Object.entries(runtime.m)) {
        if (++inspected > 25000) fail('NOT_READY');
        if (typeof factory !== 'function' || !contains(factory)) continue;
        const exported = runtime(key);
        for (const fn of [exported, ...Object.values(exported || {})]) if (typeof fn === 'function' && contains(fn)) found.add(fn);
      }
      if (!found.size) fail('NOT_READY'); if (found.size !== 1) fail('AMBIGUOUS'); return [...found][0];
    };
    const invoke = async (fn, args) => {
      progress('website-method-wait');
      let data; try { data = await fn(args); } catch (e) { if (e.matrixCode) throw e; fail('API'); }
      progress('response-validate');
      if (!data || typeof data !== 'object') fail('SHAPE');
      const status = value(data, 'status_code', 'statusCode');
      if (status !== 0 && status !== '0') fail(status === undefined || status === null ? 'SHAPE' : 'API', Number.isSafeInteger(Number(status)) ? Number(status) : undefined);
      return data;
    };
    const ordinaryGet = (kind, request) => async () => {
      // An optional webpack export is not the website's API contract. When it
      // is absent, make one ordinary same-origin GET through the page's fetch.
      // No copied signature/auth options, denial fallback, alternate identity,
      // captcha bypass or IM initialization. Platform rejection is terminal.
      const query = new URLSearchParams({ aid: '6383', device_platform: 'webapp', channel: 'channel_pc_web', ...Object.fromEntries(Object.entries(request).map(([k, v]) => [k, String(v)])) });
      let response; try { response = await fetch(paths[kind] + '?' + query.toString(), { method: 'GET', credentials: 'same-origin', redirect: 'error' }); } catch { fail('API'); }
      if (response.status !== 200) fail('READ_HTTP', undefined, response.status);
      try { return parseResponse(await responseText(response)); } catch { fail('READ_JSON'); }
    };
    // Identity uses one deterministic ordinary same-origin GET from the start.
    // A URL literal does not establish an internal export's calling contract;
    // calling guessed webpack exports can wait forever before any HTTP request.
    // This is not a replacement request after a refusal: nonzero status, HTTP
    // denial, challenge, fetch failure and timeout all stop without fallback.
    const selfFn = async () => {
        if(input.requireFollowerResponses){
          const observed=window.__matrixFollowerObserved;
          if(observed?.identityFailure){const error=observed.identityFailure;fail(error.code==='HTTP'?'PROFILE_HTTP':error.code==='API'?'API':'SHAPE',error.platformCode,error.httpStatus);}
          if(observed?.identityPending)fail('NOT_READY');
          if(observed?.identity&&Date.now()-observed.identity.at<=30000&&observed.identity.at<=Date.now()+5000){progress('self-validate');return observed.identity.data;}
        }
        progress('self-fetch');
        const response = await fetch('/aweme/v1/web/user/profile/self/?aid=6383&device_platform=webapp&channel=channel_pc_web', { method: 'GET', credentials: 'same-origin', redirect: 'error' });
        progress('self-body');
        if (response.status !== 200) fail('PROFILE_HTTP', undefined, response.status);
        try { return parseResponse(await responseText(response)); } catch { fail('PROFILE_JSON'); }
      };
    const rendered = input.kind === 'works' && input.expectedUid && typeof input.renderedReader === 'function' ? input.renderedReader({ expectedUid: input.expectedUid, cursor: input.args?.cursor || '0' }) : null;
    if (rendered?.waiting) fail('NOT_READY');
    const inspectSelf = async () => {
      let data;
      try { data = await selfFn({}); } catch (e) { if (e.matrixCode) throw e; fail('API'); }
      progress('self-validate');
      if (!data || typeof data !== 'object') fail('SHAPE');
      const status = value(data, 'status_code', 'statusCode');
      if (![0, '0'].includes(status)) fail(status == null ? 'SHAPE' : 'API', Number.isSafeInteger(Number(status)) ? Number(status) : undefined);
      const u = data.user ?? data.userInfo;
      if (!u) fail('SHAPE');
      const uid = id(u.uid ?? u.userId), handle = String(value(u, 'unique_id', 'uniqueId') || value(u, 'short_id', 'shortId') || '');
      if (!uid || uid === '0' || handle !== input.handle || input.expectedUid && uid !== input.expectedUid) throw Object.assign(Error('OWNER'),{matrixCode:'OWNER',uiDetail:'身份校验：'+(!uid||uid==='0'?'本人编号缺失':handle!==input.handle?'抖音号与绑定记录不匹配':'本轮本人编号发生变化')+'；请在账号管理核对当前官方账号，不会自动改绑'});
      const count = value(u, 'aweme_count', 'awemeCount');
      const counter = raw => {const n=typeof raw==='number'?raw:typeof raw==='string'&&/^\d{1,10}$/.test(raw)?Number(raw):undefined;return Number.isSafeInteger(n)&&n>=0&&n<=2147483647?n:undefined;};
      const followersCount=counter(value(u,'follower_count','followerCount'));
      // The optional transport observer is deliberately off in production.
      // Retain the same short, exact-owner self proof for OUR successful
      // ordinary GET, otherwise each DOM-readiness tick re-fetches the profile.
      // Cookie/binding checks still run before and after every operation;
      // refusals/owner conflicts are never cached or replaced with a retry.
      if(input.requireFollowerResponses&&window.__matrixFollowerObserved?.version===1)window.__matrixFollowerObserved.identity={at:Date.now(),data};
      return { uid, secUid: value(u, 'sec_uid', 'secUid'), workCount: Number.isSafeInteger(count) && count >= 0 && count <= 5000 ? count : undefined, ...(followersCount!==undefined?{metrics:{followersCount}}:{}) };
    };
    const before = await inspectSelf();
    if (input.kind === 'self') { progress('done'); return { ok: true, ownUid: before.uid, ...(/^MS4w[A-Za-z0-9_-]{1,250}$/.test(before.secUid||'')?{ownSecUid:before.secUid}:{}),...(before.metrics ? {metrics:before.metrics} : {}),...(before.workCount!==undefined?{workCount:before.workCount}:{}) }; }
    if (!/^MS4w[A-Za-z0-9_-]{1,256}$/.test(before.secUid || '')) fail('SHAPE');
    const args = input.args || {}, request = { count: 20 };
    if (input.kind === 'works') Object.assign(request, { sec_user_id: before.secUid, max_cursor: id(args.cursor || '0') });
    if (input.kind === 'followers') {
      const offset = Number(id(args.offset || '0')); if (!Number.isSafeInteger(offset) || !['1', '2'].includes(args.sourceType || '2')) fail('SHAPE');
      Object.assign(request, { user_id: before.uid, sec_user_id: before.secUid, source_type: Number(args.sourceType || '2'), max_time: id(args.cursor || '0'), min_time: 0, offset, gps_access: 0, address_book_access: 0 });
    }
    if (input.kind === 'comments') Object.assign(request, { aweme_id: id(args.workId), cursor: id(args.cursor || '0'), item_type: 0 });
    if (input.kind === 'replies') Object.assign(request, { item_id: id(args.workId), comment_id: id(args.commentId), cursor: id(args.cursor || '0'), item_type: 0 });
    let readFn;
    if(input.kind==='followers'&&input.requireFollowerResponses){
      if(typeof input.followersReader!=='function')fail('SHAPE');
      const observed=input.followersReader({uid:before.uid,secUid:before.secUid,ownerFollowerCount:before.metrics?.followersCount,...args,allowInitialScroll:input.allowFollowerInitialScroll===true});
      if(observed?.waiting)throw Object.assign(Error('NOT_READY'),{matrixCode:'NOT_READY',uiDetail:observed.detail});
      if(observed?.error){if(observed.error==='RESCAN')return {ok:false,code:'FOLLOWER_RESCAN',error:'抖音粉丝采集页已释放，需要重新建立粉丝分页'};throw Object.assign(Error('FOLLOWER_UI'),{matrixCode:observed.error==='VERIFY'?'VERIFY':observed.error==='OWNER'?'OWNER':'API',platformCode:observed.platformCode,httpStatus:observed.httpStatus,uiDetail:observed.detail});}
      if(!observed?.data)fail('SHAPE');readFn=async()=>observed.data;
    } else if (input.ordinaryReads === true) {
      // A deterministic browser GET is the PRIMARY transport for this mode,
      // not a second path after a website/export/platform failure.
      readFn = ordinaryGet(input.kind, request);
    } else if (!rendered) {
      try { readFn = find(paths[input.kind]); }
      catch (e) { if (e.matrixCode !== 'NOT_READY') throw e; readFn = ordinaryGet(input.kind, request); }
    }
    const data = rendered || await invoke(readFn, request), after = await inspectSelf();
    if (before.uid !== after.uid || before.secUid !== after.secUid) fail('OWNER');
    // A fresh exact own-post count can prove the end even when the website
    // does not render an accessible footer. A changing count never proves end.
    if (rendered && before.workCount !== undefined) {
      if (before.workCount === after.workCount && before.workCount === rendered.inventory_count) data.has_more = Number(data.max_cursor) < rendered.inventory_count;
      else if (before.workCount !== after.workCount) data.has_more = true;
    }
    const list = (raw, map) => { if (raw === null) return null; if (!Array.isArray(raw) || raw.length > 100) fail('SHAPE'); return raw.map(map); };
    const common = { status_code: 0, has_more: flag(value(data, 'has_more', 'hasMore')) };
    let result;
    if (input.kind === 'followers') result = { ...common, followers: list(value(data, 'followers', 'followList'), user), min_time: id(value(data, 'min_time', 'minTime') ?? '0'), offset: id(data.offset ?? '0'), ...(data.total !== undefined ? { total: data.total } : {}), ...(value(data, 'rec_has_more', 'recHasMore') !== undefined ? { rec_has_more: flag(value(data, 'rec_has_more', 'recHasMore')) } : {}), ...(before.metrics&&after.metrics&&before.metrics.followersCount===after.metrics.followersCount?{owner_follower_count:before.metrics.followersCount}:{}), myself_user_id: before.uid };
    else if (input.kind === 'works') result = { ...common, aweme_list: list(value(data, 'aweme_list', 'awemeList'), w => ({ aweme_id: id(value(w, 'aweme_id', 'awemeId')), desc: text(w.desc), create_time:value(w,'create_time','createTime'),is_top:value(w,'is_top','isTop'), author: user(w.author) })), max_cursor: id(value(data, 'max_cursor', 'maxCursor') ?? '0') };
    else {
      const mapComment = (r, nested = false) => ({ cid: id(r.cid ?? r.commentId), ...(value(r, 'aweme_id', 'awemeId') !== undefined ? { aweme_id: id(value(r, 'aweme_id', 'awemeId')) } : {}), text: text(r.text, 16000), ...(typeof projectMedia==='function'?projectMedia(r):{}), user: user(r.user), create_time: value(r, 'create_time', 'createTime'), reply_comment_total: value(r, 'reply_comment_total', 'replyCommentTotal') ?? 0, ...(!nested && Array.isArray(value(r, 'reply_comment', 'replyComment')) ? { reply_comment: list(value(r, 'reply_comment', 'replyComment'), c => mapComment(c, true)) } : {}) });
      result = { ...common, comments: list(data.comments, r => mapComment(r)), cursor: id(data.cursor ?? '0'), ...(data.total !== undefined ? { total: data.total } : {}) };
    }
    progress('done'); return { ok: true, ownUid: before.uid, data: result, ...(input.kind==='followers'&&input.requireFollowerResponses?{pageState:pageState()}:{}) };
  } catch (e) { const code = Object.hasOwn(messages, e?.matrixCode) ? e.matrixCode : 'SHAPE'; return { ok: false, code, error: messages[code]+(typeof e?.uiDetail==='string'? '；'+e.uiDetail.slice(0,100):''), pageState: pageState(), ...(Number.isSafeInteger(e?.platformCode) ? { platformCode: e.platformCode } : {}), ...(Number.isInteger(e?.httpStatus) && e.httpStatus >= 100 && e.httpStatus <= 599 ? { httpStatus: e.httpStatus } : {}) }; }
}
// Closed diagnostic bits only: never retain console text, identifiers or URLs.
function pageTypeErrorMask(message) {
  if(typeof message!=='string'||message.length>16000||!message.includes('TypeError'))return 0;
  let mask=0;
  for(const [field,bit]of [['title_text',1],['content',2],['length',4],['uid',8],['secUid',16],['map',32],['logPb',64]])if(message.includes("reading '"+field+"'")||message.includes('reading "'+field+'"'))mask|=bit;
  // Finite public UI vocabulary only, not arbitrary exception text or keys.
  for(const [field,bit]of [['impr_id',512],['offset',1024],['statusCode',2048],['followList',4096],['userList',8192],['info',16384]])if(message.includes("reading '"+field+"'")||message.includes('reading "'+field+'"'))mask|=bit;
  if(/Cannot destructure property ['"]uid['"]/.test(message))mask|=32768;
  if(/Cannot destructure property ['"](?:secUid|sec_uid)['"]/.test(message))mask|=65536;
  for(const [field,bit]of [['version_code',131072],['user_unique_id',262144],['os',524288]])if(message.includes("reading '"+field+"'")||message.includes('reading "'+field+'"'))mask|=bit;
  if(/\bis not a function\b/.test(message))mask|=256;
  return mask||128;
}
function blockedRequest(details) {
  let url; try { url = new URL(details.url); } catch { return true; }
  // The collector must not connect to IM at all; it cannot clear unread via
  // either a JSON endpoint, a protobuf HTTP request or an IM websocket.
  if (/^(imapi[^.]*|imdesktop|frontier-im)\./.test(url.hostname) || url.pathname.includes('/im/') || /(?:notice|notification|notify|mark[_/-]?read|clear[_/-]?unread|batch[_/-]?read|message\/send|comment\/(?:publish|delete|digg)|reply\/(?:add|delete)|follow\/commit)/i.test(url.pathname)) return true;
  if ([...url.searchParams].some(([k, v]) => /^(?:is_mark_read|mark_read|clear_unread)$/i.test(k) && !['0', 'false', ''].includes(v))) return true;
  if (!['GET', 'HEAD'].includes(details.method)) return true;
  if(url.pathname===FAN_INDEX_INFO_PATH&&(details.method!=='GET'||!['true','1'].includes(url.searchParams.get('is_pc'))))return true;
  if (details.resourceType === 'webSocket' || details.resourceType === 'ping' || details.resourceType === 'media') return true;
  const apiPath = /\/(?:aweme|api|passport)\//.test(url.pathname);
  // Normal page loaders also retrieve public JS/CSS/images with fetch/XHR.
  // Resource type alone must not turn a static CDN file into a business API.
  // Existing unread/write/IM restrictions above apply before this narrow rule.
  const staticAsset = !apiPath && url.protocol==='https:' && !url.username && !url.password && /\.(?:m?js|css|woff2?|ttf|png|jpe?g|webp|gif|avif|svg|ico)$/i.test(url.pathname) && /(?:^|\.)(?:douyincdn\.com|douyinstatic\.com|byteimg\.com|bytescm\.com|bytegoofy\.com)$/.test(url.hostname);
  const api = apiPath || ['xhr', 'fetch'].includes(details.resourceType) && !staticAsset;
  if (api && (url.origin !== 'https://www.douyin.com' || !READ_PATHS.has(url.pathname))) return true;
  return !['https:', 'data:', 'blob:', 'devtools:'].includes(url.protocol);
}
function createBrowserReader({ createWindow, now = Date.now, idleMs = 120000, timeoutMs = 18000, serviceWaitMs = 500, requireFollowerResponses = false, independentReads = false, captureFollowerLayout, publicAssetObserver, initializationEvidence }) {
  const {setReaderActive}=require('./reader-activity.cjs');
  // Identity-only leases keep the page and its continuation but need timers
  // only while a read is actually outstanding. Avatar work shares this page.
  const updateActivity=r=>setReaderActive(r.win,!!r.avatarActive||(r.activeReads||0)>0||!!r.busy&&!r.passiveLease);
  const records = new Map(), opening = new Set(); let quitting = false,collectorGeneration=0;
  // A normal browser execution world, not preload world 999 and not a new
  // session/device. Same origin, cookies, sandbox and read-only webRequest
  // policy; no access to website SDKs, signatures, closures or auth options.
  const scriptRead=(r,code,independent)=>independent?r.win.webContents.executeJavaScriptInIsolatedWorld(1001,[{code}],false):r.win.webContents.executeJavaScript(code,false);
  const readPolicy=details=>{const blocked=blockedRequest(details);if(!blocked&&details.method==='GET'&&typeof publicAssetObserver==='function')try{const asset=publicScript(details.url);if(asset)publicAssetObserver(asset);}catch{}return blocked;};
  const stamp = rows => createHash('sha256').update(JSON.stringify(rows.filter(c => AUTH.test(c.name)).map(c => [c.domain, c.path, c.name, c.name === 'sid_guard' ? (() => { try { return decodeURIComponent(c.value).split('|')[0]; } catch { return c.value; } })() : c.value]).sort())).digest('hex');
  const disposeHead=r=>{try{if(r.headWin&&!r.headWin.isDestroyed())r.headWin.destroy();}finally{r.headWin=undefined;r.headPending=false;r.headSweepPending=false;r.headSweepRuns=0;r.releaseHeadPolicy?.();r.releaseHeadPolicy=undefined;}};
  const dispose = r => { if (r.closed) return; r.closed = true; clearTimeout(r.idle); if (r.cookieListener) r.source.cookies.removeListener('changed', r.cookieListener); try { if (!r.win.isDestroyed()) r.win.destroy(); } finally { disposeHead(r);r.releasePolicy?.(); if (records.get(r.source) === r) records.delete(r.source); } };
  const stageNames = { dispatch:'尚未确认执行进度', 'page-check':'检查本人页面', 'self-fetch':'等待本人资料GET返回', 'self-body':'读取本人资料响应正文', 'self-validate':'校验本人资料', 'website-method-discovery':'定位网页读取方法', 'website-method-wait':'等待网页读取方法返回', 'response-validate':'校验分页响应', done:'完成' };
  const requestKind = details => { try {const u=new URL(details.url);return u.origin==='https://www.douyin.com'&&Object.values(endpoints).includes(u.pathname)?Object.keys(endpoints).find(key=>endpoints[key]===u.pathname):undefined;} catch {} };
  const hintFor=detail=>typeof detail!=='string'?undefined:/响应观察器/.test(detail)?'follower-observer':/尚未识别.*粉丝入口/.test(detail)?'follower-entry-missing':/列表容器/.test(detail)?'follower-list-missing':/可滚动列表/.test(detail)?'follower-scroll-missing':/下一页|已滚动/.test(detail)?'follower-next-pending':/分页响应|等待读取/.test(detail)?'follower-get-pending':undefined;
  const diagnosticSnapshot=r=>({...(r.waitHint?{hint:r.waitHint}:{}),stats:{followerCollectorGeneration:r.collectorGeneration,followerPrepareStage:r.followerPrepareStage||0,followerInitTypeErrorMask:r.followerInitTypeErrorMask||0,fanIndexStarted:r.fanIndexStarted||0,fanIndexCompleted:r.fanIndexCompleted||0,fanIndexFailed:r.fanIndexFailed||0,fanIndexStatus:r.fanIndexStatus||0,pageJsTypeErrorMask:r.pageJsTypeErrorMask||0,pageJsErrors:r.pageJsErrors||0,pageJsTypeErrors:r.pageJsTypeErrors||0,pageJsReferenceErrors:r.pageJsReferenceErrors||0,followingBlocked:r.followingBlocked||0,selfStarted:r.selfStarted||0,selfCompleted:r.selfCompleted||0,selfFailed:r.selfFailed||0,followerStarted:r.followerStarted||0,followerCompleted:r.followerCompleted||0,followerFailed:r.followerFailed||0,followerSource0:r.followerSource0||0,followerSource1:r.followerSource1||0,followerSource2:r.followerSource2||0,followerSourceOther:r.followerSourceOther||0,followerBlocked:r.followerBlocked||0,followerUnreadBlocked:r.followerUnreadBlocked||0,...r.followerObservedStats}});
  const requestDiagnostic = r => `阶段=${stageNames[r.readStage] || '尚未执行'}；资料GET=${r.selfStarted || 0}/${r.selfCompleted || 0}/${r.selfFailed || 0}（发起/完成/失败）${r.lastHttp ? '；HTTP='+r.lastHttp : ''}${r.lastNetworkError?'；网络='+r.lastNetworkError:''}；拦截脚本=${r.blockedScripts}`;
  const bounded = async (r, action, phase, ms = timeoutMs) => { let timer,probeTimer,settled=false;try{return await Promise.race([Promise.resolve().then(action),new Promise((_,reject)=>{timer=setTimeout(async()=>{
    // Console output may be muted by website code. One bounded, no-network
    // progress snapshot distinguishes that case; it is not an API retry.
    if(r.traceToken&&!r.closed){try{const token=r.traceToken,code=`(()=>{const value=window.__matrixReaderProgress;return value?.token===${JSON.stringify(token)}?{phase:value.phase}:null})()`;const sample=await Promise.race([r.win.webContents.executeJavaScript(code,false),new Promise(resolve=>{probeTimer=setTimeout(()=>resolve(null),250);})]);if(!settled&&sample&&Object.hasOwn(stageNames,sample.phase))r.readStage=sample.phase;}catch{}finally{clearTimeout(probeTimer);}}
    if(settled)return;const diagnostic=requestDiagnostic(r);dispose(r);reject(Error(`抖音${phase}超时，已暂停且保留已有记录（${diagnostic}）`));
  },ms);})]);}finally{settled=true;clearTimeout(timer);clearTimeout(probeTimer);}};
  async function acquire({ accountSession, publicHandle, assertCurrent, refreshFollowers = false, onDiagnostic, independent = false, suspendIdleIdentity = false }) {
    const useIndependent=independentReads&&independent===true;
    if(typeof suspendIdleIdentity!=='boolean')throw Error('抖音身份页活动参数无效');
    if(typeof refreshFollowers!=='boolean')throw Error('抖音粉丝刷新参数无效');
    if(onDiagnostic!==undefined&&typeof onDiagnostic!=='function')throw Error('抖音粉丝诊断参数无效');
    if (quitting) throw Error('抖音网页采集已关闭');
    if (opening.has(accountSession)) throw Error('此抖音账号正在读取另一页，请稍候');
    opening.add(accountSession);
    // Native-only callback, not page/renderer code. Fixed stages and counters
    // survive an outer preparation timeout even before a client is returned.
    const publishStage=(r,stage)=>{if(r)r.followerPrepareStage=stage;try{onDiagnostic?.(r?diagnosticSnapshot(r):{stats:{followerPrepareStage:stage}});}catch{}};
    try {
    await assertCurrent();
    publishStage(undefined,1);
    const rows = await accountSession.cookies.get({ url: 'https://www.douyin.com/' });
    const usable = rows.filter(c => typeof c.value === 'string' && c.value && (!c.expirationDate || c.expirationDate > now() / 1000) && /(^|\.)douyin\.com$/.test(c.domain.replace(/^\./, '')));
    if (!usable.some(c => /^(sessionid|sessionid_ss|sid_tt)$/.test(c.name)) || usable.length > 200 || usable.some(c => c.value.length > 8192 || /[\r\n]/.test(c.value))) throw Error('抖音网页采集缺少有效登录，请在账号管理恢复登录');
    const fingerprint = stamp(usable); let r = records.get(accountSession);
    // An explicit manual follower refresh rebuilds only the collector view in
    // this exact bound session. Never interrupt a lease, clear storage, or
    // silently recreate views on ordinary polls/selection/platform refusals.
    if(refreshFollowers && (r?.busy||r?.avatarActive))throw Error('此抖音账号正在读取另一页，请稍候');
    if(refreshFollowers && r){dispose(r);r=undefined;}
    if (r && (r.handle !== publicHandle || r.fingerprint !== fingerprint || r.closed)) { dispose(r); r = undefined; }
    if (!r) {
      if (quitting) throw Error('抖音网页采集已关闭');
      if (records.size + opening.size > 8) throw Error('抖音网页采集已达并发账号上限，请稍后继续');
      // Use this exact bound account's normal browser environment from the
      // first request. Cookie-only fresh sessions discard the site's existing
      // origin state and can demand verification while its normal tab works.
      // Never migrate storage, forge a device, or switch context after denial.
      const win = createWindow(accountSession); r = { source: accountSession, win, handle: publicHandle, fingerprint, closed: false, busy: false, uid: '', requests: 0, blocked: 0, blockedScripts: 0, blockedReads: new Set(), mainStatus: 0 };
      records.set(accountSession, r);
      r.collectorGeneration=++collectorGeneration;
      publishStage(r,2);
      try { r.releasePolicy = registerScopedRequestPolicy(accountSession, win.webContents.id, {
        observe(d,phase,cancel){avatarNetwork(r,d,phase,cancel);},
        blocks(d) { r.requests++; const cancel = readPolicy(d); if(!cancel){try{if(new URL(d.url).pathname===FAN_INDEX_INFO_PATH)r.fanIndexStarted=(r.fanIndexStarted||0)+1;}catch{}if(requestKind(d)==='self')r.selfStarted=(r.selfStarted||0)+1;if(requestKind(d)==='followers'){r.followerStarted=(r.followerStarted||0)+1;const source=new URL(d.url).searchParams.get('source_type'),key=['0','1','2'].includes(source)?'followerSource'+source:'followerSourceOther';r[key]=(r[key]||0)+1;}} if (cancel) { r.blocked++; try { const u = new URL(d.url);if(u.origin==='https://www.douyin.com'&&u.pathname==='/aweme/v1/web/user/following/list/'&&d.method==='GET')r.followingBlocked=(r.followingBlocked||0)+1;if(requestKind(d)==='followers'){r.followerBlocked=(r.followerBlocked||0)+1;if([...u.searchParams].some(([key,value])=>/^(?:is_mark_read|mark_read|clear_unread)$/i.test(key)&&!['0','false',''].includes(value)))r.followerUnreadBlocked=(r.followerUnreadBlocked||0)+1;} if (/\.m?js$/.test(u.pathname)) r.blockedScripts++; if (d.method === 'GET' && u.origin === 'https://www.douyin.com' && /^\/(?:aweme\/v1\/web|api)\/[a-z_/-]{1,100}\/$/.test(u.pathname) && r.blockedReads.size < 8) r.blockedReads.add(u.pathname); } catch {} } return cancel; },
        completed(d) {try{const u=new URL(d.url);if(u.origin==='https://www.douyin.com'&&u.pathname===FAN_INDEX_INFO_PATH){r.fanIndexCompleted=(r.fanIndexCompleted||0)+1;if(Number.isInteger(d.statusCode)&&d.statusCode>=100&&d.statusCode<=599)r.fanIndexStatus=d.statusCode;}if(u.origin==='https://www.douyin.com'&&u.pathname===FAN_INDEX_INFO_PATH&&Number.isInteger(d.statusCode)&&d.statusCode>=400&&d.statusCode<=599)r.fanIndexHttpFailure=d.statusCode;}catch{}if(requestKind(d)==='followers'){r.followerCompleted=(r.followerCompleted||0)+1;if(Number.isInteger(d.statusCode)&&d.statusCode>=400&&d.statusCode<=599)r.followerHttpFailure=d.statusCode;} if (d.resourceType === 'mainFrame') r.mainStatus = d.statusCode; if(requestKind(d)==='self'){r.selfCompleted=(r.selfCompleted||0)+1;if(Number.isInteger(d.statusCode))r.lastHttp=d.statusCode;if(Number.isInteger(d.statusCode)&&d.statusCode>=400&&d.statusCode<=599)r.selfHttpFailure=d.statusCode;} },
        failed(d) {try{if(new URL(d.url).pathname===FAN_INDEX_INFO_PATH)r.fanIndexFailed=(r.fanIndexFailed||0)+1;}catch{}if(requestKind(d)==='followers')r.followerFailed=(r.followerFailed||0)+1;if(requestKind(d)==='self'){r.selfFailed=(r.selfFailed||0)+1;if(/^net::ERR_[A-Z0-9_]{1,60}$/.test(d.error||''))r.lastNetworkError=d.error;}},
      }); } catch(e) { dispose(r); throw e; }
      win.webContents.setAudioMuted(true); win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.webContents.on('console-message',(_event,level,message,line,source)=>{
        if(level!==3||typeof message!=='string'||message.length>16000||!Number.isSafeInteger(line)||line<0||line>10000000)return;
        const asset=publicScript(source),category=message.includes('TypeError')?'type-error':message.includes('ReferenceError')?'reference-error':undefined;
        if(!asset||!category)return;
        try{initializationEvidence?.({generation:r.collectorGeneration,phase:r.followerStarted?'follower-active':r.followerReadEntered?'follower-starting':'page-startup',category,line,column:0,mask:pageTypeErrorMask(message),source:asset});}catch{}
      });
      win.webContents.on('console-message', (_event,_level,message) => {if(_level===3){const mask=pageTypeErrorMask(message);r.pageJsTypeErrorMask=(r.pageJsTypeErrorMask||0)|mask;if(r.followerReadEntered&&!r.followerStarted)r.followerInitTypeErrorMask=(r.followerInitTypeErrorMask||0)|mask;r.pageJsErrors=Math.min(50000,(r.pageJsErrors||0)+1);if(typeof message==='string'&&/TypeError/.test(message))r.pageJsTypeErrors=Math.min(50000,(r.pageJsTypeErrors||0)+1);if(typeof message==='string'&&/ReferenceError/.test(message))r.pageJsReferenceErrors=Math.min(50000,(r.pageJsReferenceErrors||0)+1);}const prefix='matrix-read-stage:'+r.traceToken+':';if(typeof message==='string'&&message.startsWith(prefix)){const stage=message.slice(prefix.length);if(Object.hasOwn(stageNames,stage))r.readStage=stage;}});
      win.webContents.on('will-navigate', (e, value) => { try { const u = new URL(value); if (u.origin !== 'https://www.douyin.com' || u.pathname !== '/user/self') { e.preventDefault(); dispose(r); } } catch { e.preventDefault(); dispose(r); } });
      const normalize = c => c.name === 'sid_guard' ? (() => { try { return decodeURIComponent(c.value).split('|')[0]; } catch { return c.value; } })() : c.value;
      const authValues = new Map(usable.filter(c => AUTH.test(c.name)).map(c => [JSON.stringify([c.domain, c.path, c.name]), normalize(c)]));
      r.cookieListener = (_e, c, cause, removed) => { if (AUTH.test(c.name) && (removed && cause !== 'overwrite' || authValues.get(JSON.stringify([c.domain, c.path, c.name])) !== normalize(c))) dispose(r); };
      accountSession.cookies.on('changed', r.cookieListener);
      try { publishStage(r,3);await bounded(r, () => win.loadURL('https://www.douyin.com/user/self'), '官网本人页加载', 25000);publishStage(r,4); } catch { publishStage(r,6);dispose(r); throw Error('抖音官网本人页未能加载，请在账号管理确认官方网页可用'); }
    }
    if (quitting || r.closed) { dispose(r); throw Error('抖音网页采集已关闭'); }
    if (r.busy) throw Error('此抖音账号正在读取另一页，请稍候'); r.busy = true;r.passiveLease=false; clearTimeout(r.idle);updateActivity(r);
    publishStage(r,4);
    const check = async () => { await assertCurrent(); if (r.closed || stamp((await accountSession.cookies.get({ url: 'https://www.douyin.com/' })).filter(c => !c.expirationDate || c.expirationDate > now() / 1000)) !== r.fingerprint) { dispose(r); throw Error('抖音登录身份已变化，本页未采用'); } };
    const execute = async (kind, args) => {
      r.activeReads=(r.activeReads||0)+1;
      try{updateActivity(r);
      if(kind==='followers'&&!useIndependent&&r.fanIndexHttpFailure)throw Object.assign(Error('抖音官网粉丝指数说明返回 HTTP '+r.fanIndexHttpFailure+'，当前名单读取暂停，已有记录保留'),{readerCode:'READ_HTTP'});
      if(r.selfHttpFailure)throw Object.assign(Error('抖音官网本人资料请求返回 HTTP '+r.selfHttpFailure+'，当前采集已停止；未采用缓存替代拒绝'),{readerCode:'READ_HTTP'});
      await check();if(kind==='followers')r.followerReadEntered=true;r.traceToken=randomUUID();r.readStage='dispatch';r.selfStarted=0;r.selfCompleted=0;r.selfFailed=0;r.lastHttp=0;r.lastNetworkError='';
      const allowFollowerInitialScroll=kind==='followers'&&requireFollowerResponses&&!r.followerStarted&&!r.followerCompleted&&!r.followerFailed&&!r.followerBlocked;
      const independent=useIndependent&&['self','followers'].includes(kind);
      const code=`(${pageRead.toString()})({...${JSON.stringify({ kind, args, requireFollowerResponses:requireFollowerResponses&&!independent, ordinaryReads:independent, allowFollowerInitialScroll:allowFollowerInitialScroll&&!independent, traceToken:r.traceToken, handle: publicHandle, ...(r.uid ? { expectedUid: r.uid } : {}) })},renderedReader:(${renderedWorks.toString()}),followersReader:(${followerPage.toString()})},(${projectCommentMedia.toString()}))`;
      const value = await bounded(r, () => scriptRead(r,code,independent), kind === 'self' ? '本人资料读取' : kind === 'followers' ? '粉丝分页读取' : kind === 'works' ? '作品分页读取' : '评论分页读取'); await check();
      if(Array.isArray(value?.pageState?.followerErrorSites))for(const site of value.pageState.followerErrorSites.slice(0,8))try{
        const source=publicScript(site?.source);if(!source||!['page-startup','follower-starting'].includes(site.phase)||!['type-error','reference-error'].includes(site.category)||!Number.isSafeInteger(site.line)||site.line<0||site.line>10000000||!Number.isSafeInteger(site.column)||site.column<0||site.column>100000000)continue;
        initializationEvidence?.({generation:r.collectorGeneration,phase:site.phase,category:site.category,line:site.line,column:site.column,mask:site.category==='type-error'?128:0,source});
      }catch{}
      if(kind==='followers'&&r.followerHttpFailure)throw Object.assign(Error('抖音官方粉丝名单请求返回 HTTP '+r.followerHttpFailure+'，已停止且保留原名单；未改换请求'),{readerCode:'READ_HTTP'});
      if (!value?.ok) {
        if(kind==='followers'){r.waitHint=hintFor(value?.error);r.followerObservedStats=Object.fromEntries(['followerDomPanels','followerDomPanelOwnProof','followerDomPanelTabMask','followerEntryIdentityMask','followerDomFollowingHeadings','followerDomRemoveControls','followerDomBackFollowControls','followerDomMutualControls','followerDomAllUserLinks','followerObservedPages','followerObservedPending','followerObservedErrors','followerObservedOrder','followerFetchStarted','followerFetchReceived','followerFetchRepairs','followerXhrStarted','followerXhrReceived','followerXhrRepairs','followerDomRoots','followerDomLinks','followerDomRows','followerDomPages','followerDomSeen','followerDomHeadings','followerDomImages','followerDomFrames','followerDomCards','followerDomUidFields','followerXhrAbort','followerXhrError','followerXhrTimeout','followerXhrStatusZero','followerXhrStateErrors','followerUiReads','followerUiOpened','followerUiDomMode','followerUiResponseMode','followerUiSelfPending','followerUiReaderReady'].filter(key=>Number.isSafeInteger(value?.pageState?.[key])&&value.pageState[key]>=0&&value.pageState[key]<=50000).map(key=>[key,value.pageState[key]]));}
        if(kind==='followers')for(const key of ['followerInitialScrolls','followerPanelPropsMask','followerPanelUserListCount','followerDomFooterCount','followerDomFooterStateMask','followerDomPanelChildCount','followerDomRootFastPath'])if(Number.isSafeInteger(value?.pageState?.[key])&&value.pageState[key]>=0&&value.pageState[key]<=50000)r.followerObservedStats[key]=value.pageState[key];
        if(kind==='followers')for(const key of ['responseStatus','responseMime','responseEncoding','responseReadError','responseBytes','responseBodyKind'])if(Number.isSafeInteger(value?.pageState?.[key])&&value.pageState[key]>=0&&value.pageState[key]<=5*1024*1024)r.followerObservedStats[key]=value.pageState[key];
        if(value?.code==='FOLLOWER_RESCAN')throw Error('抖音粉丝采集页已释放，需要重新建立粉丝分页');
        const phase = { self: '本人资料', works: '作品目录', comments: '一级评论', replies: '评论回复', followers: '粉丝名单' }[kind];
        const response=value?.pageState,bodyReason=['未分类','空正文','HTML页面','JSON外形但语法或结构未通过','防劫持前缀，未擅自改写','非文本或编码异常','其他文本'][response?.responseBodyKind]||'未分类',readReason=['已读正文','响应流不可用','超过安全大小','正文读取失败'][response?.responseReadError]||'未知';
        const detail = (Number.isSafeInteger(value?.platformCode) ? `（平台码 ${value.platformCode}）` : Number.isInteger(value?.httpStatus) && value.httpStatus >= 100 && value.httpStatus <= 599 ? `（HTTP ${value.httpStatus}）` : '')+(['READ_JSON','PROFILE_JSON'].includes(value?.code)?`；响应分类：${readReason}，${bodyReason}，${response?.responseBytes||0}字节`:'');
        const p = value?.pageState, diagnostic = p && ['scripts', 'workLinks', 'ownLists', 'bodyNodes'].every(k => Number.isSafeInteger(p[k]) && p[k] >= 0) ? `；页面诊断：文档${r.mainStatus}，节点${p.bodyNodes}，脚本${p.scripts}，作品入口${p.workLinks}，模块${p.runtime ? 1 : 0}，验证页${p.titleVerification ? 1 : 0}，拦截脚本${r.blockedScripts}，启动拦截${r.blockedReads.size}(${[...r.blockedReads][0]?.slice(0,40) || '无'})` : '';
        const requiresVerification=value?.code==='VERIFY'||value?.pageState?.titleVerification===true;
        if(requiresVerification)dispose(r);
        throw Object.assign(Error(`读取${phase}：${requiresVerification?'抖音官网需要本人完成页面验证，请到账号管理打开该账号的平台前台完成验证，再手动刷新；原有记录和未读提示保留':value?.error || '抖音官网未返回可识别数据'}${detail}${diagnostic}`), { readerCode: requiresVerification?'VERIFY':value?.code });
      }
      if (!/^[1-9]\d{0,18}$/.test(value.ownUid) || r.uid && value.ownUid !== r.uid) throw Error('抖音网页采集本人ID不一致，本页未采用');
      r.uid = value.ownUid;if(kind==='self'){if(value.ownSecUid!==undefined&&!/^MS4w[A-Za-z0-9_-]{1,250}$/.test(value.ownSecUid))throw Error('抖音本人主页编号格式无效，未采用');r.ownSecUid=value.ownSecUid;r.ownerVerifiedAt=now();r.ownerProofIndependent=independent;}return value;
      }finally{r.activeReads--;updateActivity(r);}
    };
    const release = () => { if (r.closed) return; r.busy = false;r.passiveLease=false;updateActivity(r);setReaderActive(r.headWin,false);if(!r.avatarActive){r.idle = setTimeout(() => dispose(r), idleMs); r.idle.unref?.();} };
    try {
      for (let n = 0; ; n++) { try { await execute('self'); break; } catch (e) { if (e.readerCode !== 'NOT_READY' || n >= (requireFollowerResponses?24:5)) throw e; await new Promise(resolve => setTimeout(resolve, 300)); } }
      publishStage(r,5);
      r.passiveLease=suspendIdleIdentity;updateActivity(r);
    } catch (e) { publishStage(r,6);release(); throw e; }
    let released = false,activeHead;
    return { ownUid: r.uid, get ownProfileUrl(){return r.ownSecUid?'https://www.douyin.com/user/'+r.ownSecUid:undefined;},followerUi:requireFollowerResponses, diagnosticSnapshot:()=>diagnosticSnapshot(r), inventoryDiagnostics:()=>({...r.inventoryStats}), async check() { if (released) throw Error('本轮抖音采集已结束'); await check(); }, async verify() { if (released) throw Error('本轮抖音采集已结束'); await execute('self'); }, async readInventoryHead(options={}){
      if(released)throw Error('本轮抖音采集已结束');await check();if(released)throw Error('本轮抖音采集已结束');
      if(!options||typeof options!=='object'||Object.keys(options).some(key=>key!=='restart')||options.restart!==undefined&&typeof options.restart!=='boolean')throw Error('本人主页检查参数无效');
      if(r.headWorkHttpFailure)throw Object.assign(Error('抖音本人作品分页返回 HTTP '+r.headWorkHttpFailure+'，当前检查暂停，原目录保留'),{readerCode:'READ_HTTP'});
      if(r.headOperation)throw Error('此抖音账号正在检查新作品，请稍候');
      // Independent normal own-homepage view. Never reload the shared
      // follower list, rewind its UI cursor, or fall back after a refusal.
      if(!r.headWin||r.headWin.isDestroyed()){
        disposeHead(r);r.headWin=createWindow(r.source);const win=r.headWin;
        try{r.releaseHeadPolicy=registerScopedRequestPolicy(r.source,win.webContents.id,{blocks(details){if(r.headWorkHttpFailure){try{const u=new URL(details.url);if(u.origin==='https://www.douyin.com'&&u.pathname===endpoints.works)return true;}catch{}}return readPolicy(details);},completed(details){try{const u=new URL(details.url);if(u.origin==='https://www.douyin.com'&&u.pathname===endpoints.works&&Number.isInteger(details.statusCode)&&details.statusCode>=400)r.headWorkHttpFailure=details.statusCode;}catch{}if(details.resourceType==='mainFrame'&&Number.isInteger(details.statusCode)&&details.statusCode>=400)r.headHttpFailure=details.statusCode;}});}catch(error){disposeHead(r);throw error;}
        win.webContents.setAudioMuted(true);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
        win.webContents.on('will-navigate',(event,value)=>{try{const u=new URL(value);if(u.origin!=='https://www.douyin.com'||u.pathname!=='/user/self'){event.preventDefault();disposeHead(r);}}catch{event.preventDefault();disposeHead(r);}});
      }
      const guest=r.headWin,token={};setReaderActive(guest,true);activeHead=token;r.headOperation=token;r.headHttpFailure=undefined;let timer;
      const headCheck=async()=>{if(released||r.headOperation!==token||guest.isDestroyed())throw Error('本轮新作品检查已结束，原断点保留');await check();};
      try{return await Promise.race([(async()=>{
        // A verified page whose DOM is still loading must be allowed to
        // finish. Reloading it on every readiness check restarts the same
        // cold render forever. This never resumes a refused/network-failed
        // request and never changes the source, account or parameters.
        if(options.restart===true||!r.headPending&&!r.headSweepPending||guest.webContents.getURL()!=='https://www.douyin.com/user/self')try{r.headSweepRuns=0;await guest.loadURL('https://www.douyin.com/user/self');}catch{throw Error(r.headHttpFailure?'抖音本人主页返回 HTTP '+r.headHttpFailure+'，新作品检查暂停，未改换请求':'抖音本人主页新作品页面未能载入，历史和粉丝断点保留');}await headCheck();if(r.headHttpFailure)throw Error('抖音本人主页返回 HTTP '+r.headHttpFailure+'，新作品检查暂停，未改换请求');
        const verifyHead=async()=>{
          await headCheck();
          const value=await guest.webContents.executeJavaScript(`(${pageRead.toString()})(${JSON.stringify({kind:'self',args:{},handle:publicHandle,expectedUid:r.uid,requireFollowerResponses:false})},(${projectCommentMedia.toString()}))`,false);
          if(!value?.ok||value.ownUid!==r.uid){
            const code=['VERIFY','OWNER','NOT_READY','PROFILE_HTTP','PROFILE_JSON','READ_HTTP','READ_JSON','API','SHAPE'].includes(value?.code)?value.code:value?.ok?'OWNER':'SHAPE';
            const http=Number.isInteger(value?.httpStatus)&&value.httpStatus>=100&&value.httpStatus<=599?value.httpStatus:undefined,platform=Number.isSafeInteger(value?.platformCode)?value.platformCode:undefined;
            const detail=code==='VERIFY'?'要求本人验证':code==='OWNER'?'本人编号与绑定记录不一致':http?'资料请求返回 HTTP '+http:platform!==undefined?'资料请求未通过（平台码 '+platform+'）':code==='NOT_READY'?'身份数据尚未加载':code.includes('JSON')||code==='SHAPE'?'资料结构尚未识别':'资料读取未成功';
            throw Object.assign(Error('抖音本人主页'+detail+'，新作品检查暂停，旧目录保留'),{readerCode:'PUBLIC_HEAD_'+code});
          }
          return value.workCount;
        };
        const ownCount=await verifyHead();let value;const until=Date.now()+6500;
        do{await headCheck();value=await guest.webContents.executeJavaScript(`(${renderedWorks.toString()})(${JSON.stringify({expectedUid:r.uid,headOnly:true})})`,false);r.inventoryStats=Object.fromEntries(['inventoryHeadLinks','inventoryHeadCards','inventoryHeadOwned','inventoryHeadForeign','inventoryHeadUnknown','inventoryHeadItemAnchors','inventoryHeadOwnTab'].filter(key=>Number.isSafeInteger(value?.inventory_stats?.[key])&&value.inventory_stats[key]>=0&&value.inventory_stats[key]<=50000).map(key=>[key,value.inventory_stats[key]]));if(Number.isSafeInteger(ownCount)&&ownCount>=0)r.inventoryStats.inventoryHeadExpected=ownCount;if(value?.status_code===0){if(value.aweme_list?.length||ownCount===0)break;value={waiting:true};}await new Promise(resolve=>setTimeout(resolve,200));}while(Date.now()<until);
        if(value?.waiting===true){r.headPending=true;throw Object.assign(Error('抖音本人主页作品首批尚未就绪，历史和粉丝断点保留'),{code:'OWNED_INVENTORY_HEAD_NOT_READY'});}
        if(value?.status_code!==0||!Array.isArray(value.aweme_list)||value.aweme_list.length>100)throw Error('抖音本人主页新作品归属未通过，旧目录保留');
        await verifyHead();await headCheck();const at=new Date(now()).toISOString();
        r.headPending=false;const ownedSource=value.inventory_source==='rendered-owned-head';if(!(r.headSweepRuns||0))r.headFirstWorkId=value.aweme_list[0]?.aweme_id;
        const ordered=ownedSource&&value.aweme_list[0]?.aweme_id===r.headFirstWorkId,rows=value.aweme_list.map(row=>ordered?{...row,homepage_order_at:at}:(({homepage_rank,...rest})=>rest)(row));
        // Continue this independent own-page sweep between normal refreshes.
        // Repeatedly reloading only its first18 cards can never discover an
        // owned work outside that prefix when the creator catalog is paused.
        // One normal DOM scroll per admitted operation; no constructed API,
        // no rewind of comment/follower history, and a bounded100-card window.
        r.headSweepPending=false;
        if(ownedSource&&value.has_more===true&&rows.length<100&&(r.headSweepRuns||0)<6){
          const advanced=await guest.webContents.executeJavaScript(`(${renderedWorks.toString()})(${JSON.stringify({expectedUid:r.uid,headOnly:true,advance:true})})`,false);await headCheck();r.headSweepPending=advanced?.advanced===true;if(r.headSweepPending)r.headSweepRuns=(r.headSweepRuns||0)+1;
        }
        return {...value,homepage_order:ordered?rows:[],aweme_list:rows};
      })(),new Promise((_,reject)=>{timer=setTimeout(()=>{if(r.headOperation===token)disposeHead(r);reject(Error('抖音本人主页新作品检查超时，历史和粉丝断点保留'));},14500);})]);}catch(error){if(error?.code!=='OWNED_INVENTORY_HEAD_NOT_READY'){r.headPending=false;r.headSweepPending=false;}throw error;}finally{clearTimeout(timer);setReaderActive(guest,false);if(r.headOperation===token)r.headOperation=undefined;if(activeHead===token)activeHead=undefined;if(!r.headOperation&&!r.headPending&&!r.headSweepPending)disposeHead(r);}
    }, discardInventoryHead(){if(!released&&!r.headOperation&&(r.headPending||r.headSweepPending))disposeHead(r);}, async peekWorkOrder(){
      if(released)throw Error('本轮抖音采集已结束');await check();
      const result=await bounded(r,()=>r.win.webContents.executeJavaScript(`(${renderedWorks.toString()})(${JSON.stringify({expectedUid:r.uid,peek:true})})`,false),'本人主页作品顺序读取',4000);await check();
      if(!Array.isArray(result?.aweme_list))return;
      const items=result.aweme_list,stamp=JSON.stringify(items.map(row=>[row.aweme_id,row.create_time,row.is_top,row.homepage_rank]));
      if(r.orderStamp!==stamp){r.orderStamp=stamp;r.orderAt=new Date(now()).toISOString();}
      return {items,at:r.orderAt};
    }, async readMetrics() {
      if(released) throw Error('本轮抖音采集已结束');
      const result=await execute('self');
      if(!Number.isSafeInteger(result.metrics?.followersCount)||result.metrics.followersCount<0) throw Error('抖音本人资料尚未提供精确粉丝数，未将缩写或粉丝名单数量当成总数');
      await check();return {ownUid:result.ownUid,metrics:result.metrics,source:'douyin-self-profile'};
    }, async readWeb(kind, args = {}) {
      if (released) throw Error('本轮抖音采集已结束');
      const allowed = { works: ['cursor'], comments: ['workId', 'cursor'], replies: ['workId', 'commentId', 'cursor'], followers: ['cursor', 'offset', 'sourceType'] };
      if (!Object.hasOwn(allowed, kind) || Object.keys(args).some(k => !allowed[kind].includes(k)) || Object.values(args).some(v => typeof v !== 'string' || !/^\d{1,19}$/.test(v)) || args.sourceType && !['1', '2'].includes(args.sourceType)) throw Error('不支持的抖音网页只读参数');
      // Only wait for lazy website code; never auto-repeat a denied request,
      // challenge, malformed result, owner mismatch or failed network call.
      for (let n = 0; ; n++) { try { const data=(await execute(kind, args)).data;if(kind==='followers'&&requireFollowerResponses&&data.has_more===false)r.followerEnded=true;return data; } catch (e) {
        if(kind==='followers'&&captureFollowerLayout&&!r.layoutCaptureAttempted&&!r.closed&&(n>=4||e.readerCode!=='NOT_READY')){r.layoutCaptureAttempted=true;try{await captureFollowerLayout({window:r.win,accountSession:r.source,ownUid:r.uid,assertCurrent:check});}catch{}}
        if(e.readerCode!=='NOT_READY'||n>=24)throw e;
        await new Promise(resolve => setTimeout(resolve, serviceWaitMs));
      } }
    }, close() { if (!released) { released = true;if(activeHead&&r.headOperation===activeHead){r.headOperation=undefined;disposeHead(r);} if(r.followerEnded&&!r.avatarActive)dispose(r);else release(); } } };
    } finally { opening.delete(accountSession); }
  }
  async function readPublicAvatar({accountSession,publicHandle,target,assertCurrent,independent=false}){
    const useIndependent=independentReads&&independent===true;
    const error=(message,code)=>Object.assign(Error(message),{avatarCode:code});
    if(!target||Object.keys(target).sort().join(',')!=='secUid,uid'||typeof target.uid!=='string'||!/^[1-9]\d{0,18}$/.test(target.uid)||typeof target.secUid!=='string'||!/^MS4w[A-Za-z0-9_-]{1,250}$/.test(target.secUid)||typeof assertCurrent!=='function')throw error('粉丝头像身份参数无效，未请求主页','schema');
    let lease,r,timer,active=false,ended=false;
    try{
      await assertCurrent();if(quitting)throw error('抖音网页采集已关闭','collector-released');
      for(let n=0;n<60;n++){
        r=records.get(accountSession);
        if(r&&!r.closed&&r.uid)break;
        if(!r&&!opening.has(accountSession)){
          try{lease=await acquire({accountSession,publicHandle,assertCurrent,independent:useIndependent});}catch(cause){if(cause.message==='此抖音账号正在读取另一页，请稍候')throw error('官网本人采集页尚未就绪，请稍后查看头像','reader-busy');throw cause;}
          r=records.get(accountSession);break;
        }
        await new Promise(resolve=>setTimeout(resolve,100));await assertCurrent();
      }
      if(!r||r.closed||!r.uid)throw error('官网本人采集页尚未就绪，请稍后查看头像','reader-busy');
      const guard=async()=>{
        if(ended)throw error('本轮头像读取已结束，旧结果未采用','collector-released');await assertCurrent();if(ended||quitting||r.closed||records.get(accountSession)!==r||r.win.isDestroyed()||r.win.webContents.session!==accountSession||r.win.webContents.getURL()!=='https://www.douyin.com/user/self'||r.handle!==publicHandle)throw error('本人官网采集页已变化，旧头像未采用','binding-changed');
        const current=stamp((await accountSession.cookies.get({url:'https://www.douyin.com/'})).filter(c=>!c.expirationDate||c.expirationDate>now()/1000));if(current!==r.fingerprint)throw error('官方登录已变化，旧头像未采用','binding-changed');
      };
      await guard();r.avatarActive=(r.avatarActive||0)+1;active=true;clearTimeout(r.idle);setReaderActive(r.win,true);
      const task=async()=>{
        // Same normalized identity proof as normal collection, never a second
        // native-network self-profile request with a different environment.
        if(r.ownerProofIndependent!==useIndependent||!Number.isFinite(r.ownerVerifiedAt)||now()<r.ownerVerifiedAt||now()-r.ownerVerifiedAt>=30000){
          const own=await scriptRead(r,`(${pageRead.toString()})(${JSON.stringify({kind:'self',handle:publicHandle,expectedUid:r.uid,requireFollowerResponses:requireFollowerResponses&&!useIndependent,ordinaryReads:useIndependent})})`,useIndependent);await guard();
          if(!own?.ok||own.ownUid!==r.uid)throw error(own?.code==='OWNER'?'官网本人账号与绑定不一致，补头像停止':'官网本人资料未通过原采集链路核验，补头像暂停',own?.code==='OWNER'?'avatar-owner-mismatch':own?.code==='NOT_READY'?'reader-busy':own?.code==='VERIFY'?'verification-required':own?.code==='READ_HTTP'||own?.code==='PROFILE_HTTP'?'http-denied':'avatar-owner-shape');
          r.ownerVerifiedAt=now();r.ownerProofIndependent=useIndependent;
        }
        await guard();const read=require('./douyin-avatar-profile-page.cjs').readPublicAvatarProfile;
        const attempt={secUid:target.secUid,ids:new Set(),started:0,blocked:0};r.avatarAttempt=attempt;
        let value;try{value=await scriptRead(r,`(${read.toString()})(${JSON.stringify(target)})`,useIndependent);}finally{if(r.avatarAttempt===attempt)r.avatarAttempt=undefined;}await guard();
        if(value?.code==='avatar-fetch-network'){
          const code=!attempt.started?'avatar-request-not-started':attempt.blocked||attempt.failure==='blocked'?'avatar-request-blocked':attempt.failure==='aborted'?'avatar-request-aborted':attempt.failure==='connection'?'avatar-connection-failed':'avatar-fetch-network';
          const messages={'avatar-request-not-started':'官网资料读取在发出网络请求前失败，原名单保留','avatar-request-blocked':'官网资料请求被只读策略或客户端拦截，未改用其他通道','avatar-request-aborted':'官网资料网络请求被中止，未重复执行','avatar-connection-failed':'官网资料连接或证书检查失败，原名单保留'};
          if(messages[code])throw error(messages[code],code);
        }
        if(!value?.ok)throw error(value?.message||'粉丝公开资料未能读取，原名单保留',value?.code||'schema');return value.user;
      };
      return await Promise.race([task(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(error('官网头像补读超时，已有名单和分页保留','timeout')),18000);})]);
    }finally{
      ended=true;clearTimeout(timer);if(r&&active){r.avatarActive=Math.max(0,(r.avatarActive||0)-1);if(!r.closed){updateActivity(r);if(!r.busy&&!r.avatarActive&&!lease){clearTimeout(r.idle);r.idle=setTimeout(()=>dispose(r),idleMs);r.idle.unref?.();}}}lease?.close();
    }
  }
  return { acquire, readPublicAvatar,close() { quitting = true; for (const r of [...records.values()]) dispose(r); } };
}
module.exports = { pageRead, renderedWorks, blockedRequest, pageTypeErrorMask, createBrowserReader, endpoints };
