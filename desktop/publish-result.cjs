// Read-only verification of a persisted submission in an authenticated official work list.
// A redirect, an empty editor, or a same-title old work is never success evidence.
function publishResult(receipt, componentRoots = []) {
  const routes = {
    douyin: { host: 'creator.douyin.com', path: '/creator-micro/content/manage', title: '[class*="info-title-text-"]', card: '[class*="video-card-content-"]' },
    xiaohongshu: { host: 'creator.xiaohongshu.com', path: '/new/note-manager', title: '.note-card__title', card: '.note-card' },
    wechat: { host:'channels.weixin.qq.com', path:'/platform/post/list', title:'div,span,p,a' },
    bilibili: { host:'member.bilibili.com', path:'/platform/upload-manager/article', title:'a[href*="/video/"],.title,.video-title,[class*="title"]', card:'.article-card,.video-card,.bili-video-card,[class*="archive-item"],[class*="video-item"]' },
  };
  const route = routes[receipt.platform];
  const no=reason=>({matched:false,reason});
  if(!route)return no('unsupported');
  if(location.protocol!=='https:'||location.hostname!==route.host||location.pathname.replace(/\/$/,'')!==route.path)return no(/login|passport|signin/.test(location.pathname+location.hostname)?'login_required':'wrong_page');
  const normalize=value=>String(value||'').replace(/\u200b/g,'').replace(/\s+/g,' ').trim();
  const title = normalize(receipt.expectedTitle || receipt.summary?.split('\n')[0]);
  const submitted = Date.parse(receipt.createdAt);
  if (!title || title.length > 500 || !Number.isFinite(submitted)) return no('missing_reference');
  const query=selector=>[...new Set([document,...componentRoots].flatMap(root=>[...root.querySelectorAll(selector)]))];
  const parent=el=>el.parentElement||el.getRootNode()?.host;
  const within=(ancestor,node)=>{for(let current=node;current;current=parent(current))if(current===ancestor)return true;return false;};
  const inside=(card,selector)=>query(selector).filter(node=>within(card,node));
  const visible = element => {
    if (!element?.isConnected) return false;
    const box=element.getBoundingClientRect();if(!(box.width>0&&box.height>0))return false;
    for(let node=element;node;node=parent(node)){const style=getComputedStyle(node);if(style.display==='none'||style.visibility==='hidden'||style.opacity==='0'||node.hidden||node.getAttribute('aria-hidden')==='true')return false;}
    return true;
  };
  const text=element=>normalize(element?.innerText||element?.textContent);
  const dates=body=>[...body.matchAll(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})日?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/g)];
  // Douyin renders a single combined title+description label in its manager.
  // Match the entire saved submission, never a loose title/body prefix. The
  // rich-text editor's zero-width space is not user-visible content.
  const douyinCombined=receipt.platform==='douyin'&&typeof receipt.summary==='string'&&receipt.summary.includes('\n')&&normalize(receipt.summary.split(/\r?\n/)[0])===title?normalize(receipt.summary):undefined;
  // Official rich-text topic chips can collapse the whitespace immediately
  // before '#'. Normalize that boundary only; keep all words/topics exact.
  const topicSpacing=value=>value.replace(/\s+(?=#[^\s#]+)/g,'');
  const matchesTitle=label=>label===title||(receipt.platform==='douyin'&&(label.startsWith(title+' #')||douyinCombined&&topicSpacing(label)===topicSpacing(douyinCombined)))||(receipt.platform==='wechat'&&label.startsWith(title+' ')&&(label===normalize(receipt.expectedContent)||normalize(receipt.summary).includes(label)));
  let titles=query(route.title).filter(el=>visible(el)&&matchesTitle(text(el)));
  if(receipt.platform==='wechat')titles=titles.filter(el=>![...el.children].some(child=>visible(child)&&matchesTitle(text(child))));
  if(!titles.length)return no('not_found');
  const cards=new Map();
  for(const element of titles){
    let card;
    if(route.card)for(let node=element;node;node=parent(node)){if(node.matches(route.card)){card=node;break;}}
    if(!card&&['wechat','bilibili'].includes(receipt.platform)){
      for(let node=parent(element),depth=0;node&&depth<8;node=parent(node),depth++){
        const body=text(node).replace(text(element),'');
        const actions=receipt.platform==='wechat'?body.includes('可见权限')&&(body.includes('评论管理')||body.includes('修改描述和封面')):body.includes('编辑')&&(body.includes('删除')||body.includes('稿件'));
        if(dates(body).length===1&&actions){card=node;break;}
      }
    }
    if(card&&visible(card)){
      const previous=cards.get(card);
      cards.set(card,{label:text(element),body:text(card),titleElement:element,titleElements:[...new Set([...(previous?.titleElements||[]),element])]});
    }
  }
  if(!cards.size)return no('page_not_ready');
  const recent=[];let hadDate=false;
  for(const [card,{label,body,titleElement,titleElements}] of cards){
    const remainder=body.replace(label,''),found=dates(remainder);
    if(found.length!==1)continue;hadDate=true;const d=found[0];
    const publishedAt=Date.parse(`${d[1]}-${d[2].padStart(2,'0')}-${d[3].padStart(2,'0')}T${d[4].padStart(2,'0')}:${d[5]}:${d[6]||'00'}+08:00`),local=new Date(publishedAt+8*3600000);
    const fields=[local.getUTCFullYear(),local.getUTCMonth()+1,local.getUTCDate(),local.getUTCHours(),local.getUTCMinutes(),local.getUTCSeconds()];
    if(!Number.isFinite(publishedAt)||fields.some((field,index)=>field!==Number(d[index+1]||'00'))||publishedAt<submitted-(d[6]===undefined?60000:1000)||publishedAt>submitted+20*60000||publishedAt>Date.now()+60000)continue;
    recent.push({card,remainder,publishedAt,titleElement,titleElements,timePrecision:d[6]===undefined?'minute':'second',dateLabel:normalize(d[0])});
  }
  if(!recent.length)return no(hadDate?'time_mismatch':'missing_time');
  if(recent.length!==1)return {matched:false,ambiguous:true,reason:'ambiguous'};
  const {card,remainder,publishedAt,titleElements,timePrecision,dateLabel}=recent[0];
  const unrelatedToTitle=element=>!titleElements.some(title=>within(element,title)||within(title,element));
  const under=(element,selector)=>{for(let node=element;node&&node!==card;node=parent(node))if(node.matches?.(selector))return true;return false;};
  const statusLabels=[...new Set(inside(card,'[class*="status"],[class*="state"],[role="status"]').filter(el=>visible(el)&&unrelatedToTitle(el)&&!under(el,'button,input,textarea,[contenteditable="true"]')&&!el.querySelector('button,input,textarea')).map(el=>text(el).slice(0,500)).filter(Boolean))];
  // Bili's thumbnail state overlay is metadata, not a review state. Only an
  // exact duration (optionally adjoining a known permission label) is ignored;
  // scheduled countdowns, unknown badges and failure/review text stay decisive.
  const biliMediaOverlay=label=>receipt.platform==='bilibili'&&/^(?:(?:仅自己可见|自己可见|私密|公开|公开可见|所有人可见|好友可见|仅好友可见)\s*)?(?:\d{1,3}:)?[0-5]?\d:[0-5]\d$/.test(label);
  const patterns={failed:/^(?:发布失败|审核失败|审核未通过|审核不通过|审核驳回|稿件退回|未通过审核|未通过)(?:[：:，。\s（(！!]|$)/,published:/^(?:已发布|发布成功|已发表|发表成功)(?:[：:，。\s（(！!]|$)/,processing:/^(?:审核中|转码中|待审核|等待平台审核|等待审核|处理中|上传中|提交中)(?:[：:，。\s（(！!]|$)/,absent:/^(?:草稿|待发布|定时发布|发布定时|已删除|已下架)(?:[：:，。\s（(！!]|$)/};
  const states=Object.fromEntries(Object.entries(patterns).map(([key,pattern])=>[key,statusLabels.filter(label=>pattern.test(label))]));
  if(Object.values(states).filter(labels=>labels.length).length>1)return no('ambiguous');
  const explicit=Object.values(states).some(labels=>labels.length);
  // Only title-linked canonical IDs establish the work reference. A cover
  // link can subsequently carry permission metadata, but cannot invent its ID.
  const officialReference=link=>{
    try{
      const href=link.getAttribute('href');if(!href||href.length>2048)return;
      const url=new URL(href,location.origin+location.pathname);
      if(url.protocol!=='https:'||url.username||url.password||url.port)return;
      const formats={bilibili:['www.bilibili.com',/^\/video\/(BV[0-9A-Za-z]{10})\/?$/],douyin:['www.douyin.com',/^\/video\/([1-9]\d{9,24})\/?$/],xiaohongshu:['www.xiaohongshu.com',/^\/(?:explore|discovery\/item)\/([a-f0-9]{24})\/?$/]};
      const format=formats[receipt.platform],match=format&&url.hostname===format[0]&&format[1].exec(url.pathname);
      if(match)return {workId:match[1],workUrl:url.origin+url.pathname,workReferenceSource:'official_title_link'};
    }catch{ /* Unsupported/malformed links are not work evidence. */ }
  };
  const references=new Map();
  if(receipt.platform==='wechat'){
    const ids=new Set([card,...inside(card,'[data-object-id],[data-work-id]')].filter(visible).flatMap(node=>[node.getAttribute('data-object-id'),node.getAttribute('data-work-id')]).filter(value=>/^[1-9]\d{9,24}$/.test(value||'')));
    for(const link of inside(card,'a[href]').filter(visible)){try{const url=new URL(link.getAttribute('href'),location.href);if(url.protocol==='https:'&&url.hostname==='channels.weixin.qq.com'&&!url.username&&!url.password)for(const key of['objectId','object_id']){const id=url.searchParams.get(key);if(/^[1-9]\d{9,24}$/.test(id||''))ids.add(id);}}catch{}}
    if(ids.size>1)return no('ambiguous');if(ids.size===1){const workId=[...ids][0];references.set(workId,{workId,workUrl:'https://channels.weixin.qq.com/platform/post/list',workReferenceSource:'official_work_card'});}
  }
  for(const link of inside(card,'a[href]').filter(el=>visible(el)&&titleElements.some(title=>within(el,title)||within(title,el)))){
    const reference=officialReference(link);if(reference)references.set(reference.workId,reference);
  }
  if(references.size>1)return no('ambiguous');
  const reference=references.values().next().value;
  if(states.absent.length||!explicit&&/草稿|待发布|定时发布|发布定时|已删除|已下架/.test(remainder))return no('not_published');
  if(states.processing.length||!explicit&&/审核中|转码中|待审核|等待平台审核|等待审核|处理中|上传中|提交中/.test(remainder)) {
    // Only a separate status badge on the unique recent task card proves
    // acceptance. Caption text or an upload/transcode hint cannot do so.
    const pendingReview=states.processing.filter(label=>/^(?:审核中|待审核|等待平台审核|等待审核)(?:[：:，。\s（(！!]|$)/.test(label));
    return {...no('processing'),...(pendingReview.length?{pendingReview:true,evidence:{title,publishedAt:new Date(publishedAt).toISOString(),timePrecision,...(reference||{}),statusText:pendingReview.join('；').slice(0,400),pageUrl:location.origin+location.pathname}}:{})};
  }
  const failed=states.failed.length>0;
  // The actual Bili manager also styles its publication timestamp as a state.
  // Exempt only the exact one date already validated and tied to this attempt,
  // never an arbitrary date, review notice, caption or status with extra text.
  const biliPublicationTime=label=>{
    if(receipt.platform!=='bilibili')return false;
    if(label===dateLabel)return true;
    // Observed manager metadata: the same state-styled date container also
    // includes a subtitle count after approval. Only this exact bounded label
    // on a title-linked work is metadata; extra/review text remains decisive.
    return Boolean(reference&&label.startsWith(dateLabel+' ')&&/^当前字幕\s*[:：]\s*\d{1,4}\s*(?:（含平台自动生成）|\(含平台自动生成\))?$/.test(label.slice(dateLabel.length+1)));
  };
  const unresolved=statusLabels.filter(label=>label&&!/^(?:仅自己可见|自己可见|私密|公开|好友可见)$/.test(label)&&!biliMediaOverlay(label)&&!biliPublicationTime(label));
  if(!explicit&&unresolved.length)return {...no('status_unresolved'),diagnostic:{statusLabels:unresolved.slice(0,3).map(label=>label.replace(/(?:cookie|authorization|password|access[_-]?token|refresh[_-]?token|secret|密码|验证码)\s*[:=：]\s*[^\n;；]+/gi,'[敏感信息已移除]').replace(/\bBearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gi,'[认证信息已移除]').replace(/https?:\/\/[^\s<>"']+/gi,'[网址已移除]').slice(0,100))}};
  if(!explicit&&/发布失败|审核未通过|审核不通过|审核驳回|稿件退回/.test(remainder))return no('status_unresolved');
  const clean=value=>normalize(value).replace(/(?:cookie|authorization|password|access[_-]?token|refresh[_-]?token|secret|密码|验证码)\s*[:=：]\s*[^\n;；]+/gi,'[敏感信息已移除]').replace(/\bBearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gi,'[认证信息已移除]').replace(/https?:\/\/[^\s<>"']+/gi,'[网址已移除]').slice(0,400);
  const labels=failed?states.failed:states.published,longest=[...labels].sort((a,b)=>b.length-a.length)[0];
  const statusText=longest?clean(labels.every(label=>longest.startsWith(label))?longest:labels.join('；')):undefined;
  const permissionMediaLinks=receipt.platform==='bilibili'&&reference?inside(card,'a[href]').filter(link=>{
    if(!visible(link)||officialReference(link)?.workId!==reference.workId||under(link,'p,button,[role="button"],[class*="caption"],[class*="description"]'))return false;
    return inside(link,'img,[role="img"]').some(image=>visible(image)&&normalize(image.getAttribute('aria-label')||image.getAttribute('alt')||image.getAttribute('title'))===title);
  }):[];
  // Read a separate rendered permission label, never a substring of the work
  // caption. The receipt's requested scope is not observed work-card evidence.
  const permission=label=>({'仅自己可见':'仅自己可见','自己可见':'仅自己可见','私密':'仅自己可见','公开':'公开','公开可见':'公开','所有人可见':'公开','好友可见':'好友可见','仅好友可见':'好友可见'})[label.replace(/^(?:可见权限|可见范围|权限设置|作品权限)\s*[:：]?\s*/,'')];
  const permissionNodes=inside(card,receipt.platform==='xiaohongshu'?'.permission_msg':'span,small,[role="status"],[class*="permission"],[class*="privacy"],[class*="visibility"]').filter(el=>visible(el)&&unrelatedToTitle(el)&&!under(el,'p,button,[role="button"],input,textarea,[contenteditable="true"],[class*="caption"],[class*="description"]')&&permission(text(el)));
  const linkedPermission=el=>permissionMediaLinks.some(link=>within(link,el));
  const eligiblePermissions=permissionNodes.filter(el=>!under(el,'a')||linkedPermission(el));
  const permissions=[...new Set(eligiblePermissions.map(el=>permission(text(el))))];
  if(permissions.length>1)return no('ambiguous');
  const visibility=permissions[0];
  if(!failed&&(receipt.visibility&&visibility&&receipt.visibility!==visibility||['仅自己可见','好友可见'].includes(receipt.visibility)&&visibility!==receipt.visibility))return {...no('visibility_mismatch'),diagnostic:{observedVisibility:visibility||'unreadable',permissionLabelUnassociated:!visibility&&permissionNodes.length>0}};
  const visibilitySource=eligiblePermissions.some(linkedPermission)?'same_work_thumbnail_link':'official_permission_label';
  return {matched:!failed,rejected:failed,reason:failed?'rejected':'confirmed',message:failed?'官方作品状态：'+statusText:'发布成功',evidence:{title,publishedAt:new Date(publishedAt).toISOString(),timePrecision,...(statusText?{statusText}:{}),...(visibility?{visibility,visibilitySource}:{}),...(reference||{}),pageUrl:location.origin+location.pathname}};
}

const resultMessages=Object.freeze({
  confirmed:'已在原账号的官方作品列表确认发布成功', rejected:'已定位到本条作品，官方显示审核未通过或发布失败',
  not_found:'本次加载的官方作品列表未找到匹配标题；不能据此认定发布失败，不会重发',
  time_mismatch:'找到了同标题作品，但发布时间与这次提交不一致，未更新结果',
  missing_time:'找到标题，但未读取到唯一的官方发布时间，未更新结果',
  status_unresolved:'本条作品的官方状态尚未明确识别，原结果保留；不会据此认定失败或重发',
  ambiguous:'官网作品或结果证据不唯一、相互矛盾，无法安全关联本次任务，未更新结果',
  processing:'投稿已提交，平台仍在审核或处理；不是发布失败，无需重复提交',
  visibility_mismatch:'找到对应作品，但未确认可见范围与任务一致，未更新结果',
  not_published:'对应记录显示草稿、定时或已下架，不能记为本次发布成功',
  page_not_ready:'官方作品卡片尚未完整加载，未读取到可核对的记录',
  wrong_page:'当前未进入对应的官方作品管理页，可能正在跳转或登录',
  login_required:'原账号官方登录已失效，请到账号管理重新登录后刷新；不会重发',
  identity_mismatch:'官方页面账号与原任务不一致，已停止核验',
  identity_pending:'尚未读全官方页面的本人昵称或账号ID，未更新结果，不会重发',
  unsupported:'此平台暂不支持自动结果核验，原记录不变',
  missing_reference:'这条旧回执缺少标题或提交时间，无法安全关联官网作品',
  timeout:'读取官方作品列表超时，原结果保留，可稍后重试',
  busy:'当前官方页面正被其他操作使用，请稍后刷新',
  error:'本次官方结果读取失败，原结果保留，可稍后重试',
});
function publishVerification(reason,at=new Date().toISOString(),diagnostic){
  const state=Object.hasOwn(resultMessages,reason)?reason:'error';
  // Allowlisted visible status labels only. No HTML, field values, links or
  // credential attributes are accepted into the user-facing failure trace.
  const labels=state==='status_unresolved'&&Array.isArray(diagnostic?.statusLabels)?diagnostic.statusLabels.slice(0,3).filter(value=>typeof value==='string').map(value=>value.replace(/(?:cookie|authorization|password|access[_-]?token|refresh[_-]?token|secret|密码|验证码)\s*[:=：]\s*[^\n;；]+/gi,'[敏感信息已移除]').replace(/\bBearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gi,'[认证信息已移除]').replace(/https?:\/\/[^\s<>"']+/gi,'[网址已移除]').replace(/\s+/g,' ').slice(0,100)):[];
  const scope=state==='visibility_mismatch'&&['仅自己可见','好友可见','公开','unreadable'].includes(diagnostic?.observedVisibility)?diagnostic.observedVisibility:undefined;
  const scopeMessage=scope==='unreadable'?(diagnostic.permissionLabelUnassociated===true?'；官网可见范围标记已出现，但未能与本条作品安全关联':'；未读到可核验的官网可见范围标记'):scope?'；官网读取到的可见范围：'+scope:'';
  return {state,message:resultMessages[state]+(labels.length?'；官网可见状态：'+labels.join('；'):'')+scopeMessage,checkedAt:at};
}
module.exports = { publishResult, publishVerification };
