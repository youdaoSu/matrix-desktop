// Bounded display projection only. Never execute templates/HTML, interpolate
// arbitrary fields, follow card actions or use attachment object IDs/keys.
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
const text = value => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, 24000) : '';
const { localizedGroupNotice, contextualGroupNotice, decorateGroupNotice } = require('./douyin-inbox-notice.cjs');
function url(value, media = false) {
  try {
    if (typeof value !== 'string' || value.length > 4096) return;
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash) return;
    const emoji=/(?:^|\.)douyinstatic\.com$/.test(u.hostname)&&/^\/obj\/ies-douyin-opencn\/emoji\/[a-zA-Z0-9_-]{1,160}\.(?:png|gif|webp|jpe?g)$/.test(u.pathname);
    if (media && !emoji && !/(?:^|\.)(?:byteimg\.com|douyinpic\.com|douyincdn\.com|pstatp\.com|ibytedtos\.com|bytecdn\.cn)$/.test(u.hostname)) return;
    return u.href;
  } catch {}
}
const resourceUrl = value => {
  const v = object(value); if (!v) return url(value, true);
  for (const key of ['origin_url_list', 'large_url_list', 'medium_url_list', 'thumb_url_list', 'url_list']) {
    if (Array.isArray(v[key])) for (const candidate of v[key].slice(0, 10)) { const u = url(candidate, true); if (u) return u; }
  }
  return url(v.uri, true);
};
function stickerResource(value){
  if(!object(value))return;
  for(const key of ['stickers','joker_stickers']){const list=value[key];if(!Array.isArray(list)||!list.length||list.length>9)continue;const resource=object(list[0])?.static_url;if(typeof resource==='string'||object(resource))return resource;}
}
// Generic SYSTEM tips use {{key}} -> name. Group notices additionally carry
// localized resources and literal-highlight templates, handled separately. Never
// evaluate templates, follow actions, stringify objects or substitute user IDs.
function systemDisplay(value, depth=0, context={}) {
  if(!object(value)||depth>3)return;
  if(context.type===1001){const localized=localizedGroupNotice(value,context);if(localized)return decorateGroupNotice(localized,value,context);}
  // Some notices wrap their display payload in content/msg_content, either as
  // an object or JSON string. Only explicit display containers are followed;
  // unknown maps, URLs, actions and key/token fields are never traversed.
  const displayString=v=>{if(typeof v!=='string')return '';try{const parsed=JSON.parse(v);if(object(parsed)||Array.isArray(parsed))return '';}catch{}return text(v);};
  const hint=displayString(value.hint_text),tips=displayString(value.tips)||displayString(value.fallback_tips);
  const direct=displayString(value.text)||displayString(value.content);if(direct)return {text:direct};
  if(!tips){
    for(const key of ['content','msg_content','template_info','templateInfo','push_detail']){
      let nested=value[key];if(typeof nested==='string'){try{nested=JSON.parse(nested);}catch{continue;}}
      if(object(nested)){const projected=systemDisplay(nested,depth+1,context);if(projected)return projected;const body=displayString(nested.text)||displayString(nested.content)||displayString(nested.msgHint);if(body)return {text:body};}
    }
    const body=displayString(value.text)||displayString(value.content)||hint||displayString(value.msgHint);
    return body?{text:body}:undefined;
  }
  const template=object(value.template),entries=Array.isArray(value.template)?value.template:template?Object.keys(template).filter(key=>/^\d{1,3}$/.test(key)).map(key=>({key,...(object(template[key])||{})})):[],names=new Map(),conflicts=new Set();
  if(entries.length<=100)for(const entry of entries){
    const key=typeof entry?.key==='number'&&Number.isSafeInteger(entry.key)?String(entry.key):entry?.key;
    if(typeof key!=='string'||!key.length||key.length>100||/[{}\u0000-\u001f\u007f]/.test(key)||typeof entry?.name!=='string'||entry.name.length>2000)continue;
    const name=text(entry.name);if(!name)continue;
    if(names.has(key)&&names.get(key)!==name)conflicts.add(key);else names.set(key,name);
  }
  let missing=false;
  const rendered=tips.replace(/\{\{([^{}]{1,100})\}\}|(?<!\{)\{(\d{1,3})\}(?!\})/g,(_token,double,single)=>{const key=double??single;if(!conflicts.has(key)&&names.has(key))return names.get(key);missing=true;return '（信息未提供）';});
  return {text:rendered.slice(0,24000),...(missing?{contentNote:'平台未提供提示中的部分名称信息，未猜测为某个用户'}:{})};
}
function displayContent(raw, type, status = 0, context = {}) {
  // MessageStatus in the pinned protocol: invisible/deleted/withdrawn payloads
  // are not displayable, including an older archive with an original body.
  if (status === 3) return { text: '消息已撤回', contentKind: 'system' };
  if ([1, 2, 4].includes(status)) return { text: status === 4 ? '消息已删除' : '消息当前不可见', contentKind: 'system' };
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 256 * 1024) return { text: '消息正文无法识别，原文已缓存', contentKind: 'unsupported' };
  const recallPlaceholder = value => typeof value === 'string' && /^Recall Content Hidden$/i.test(value.trim());
  if (recallPlaceholder(raw)) return { text: '消息已撤回', contentKind: 'system' };
  let value; try { value = JSON.parse(raw); } catch { if (type === 7) return { text: text(raw), contentKind: 'text' };if(type===1001&&raw.trim()&&!/^[\s]*[\[{]/.test(raw))return {text:text(raw),contentKind:'system'}; }
  if(type===1001&&typeof value==='string'&&value.trim())return {text:text(value),contentKind:'system'};
  const v = object(value);
  if (!v) return type === 1001 ? { text: '系统提示', contentKind: 'system', contentNote: '提示正文尚未解析，原始记录已在本机保留' } : { text: `暂未支持的消息（类型 ${type}），原文已缓存`, contentKind: 'unsupported' };
  // Group notices are not missing chat text. Project only documented aweTypes
  // and explicit nickname fields; never substitute numeric UIDs for names.
  const rawAwe = v.aweType ?? v.awe_type;
  const awe = type===1001 ? typeof rawAwe === 'string' && /^\d{1,9}$/.test(rawAwe) ? Number(rawAwe) : rawAwe : undefined;
  const names = values => Array.isArray(values) ? values.slice(0, 20).map(p => text(p?.nickname ?? p?.nick_name ?? p?.display_name ?? p?.displayName)).filter(Boolean).join('、') : '';
  const active = names(v.active_users ?? v.activeUsers), passive = names(v.passive_users ?? v.passiveUsers);
  let notice = '';
  // Keep the previously supported, known join-event fallback for old archives
  // without locale resources. Unknown event numbers never enter this branch.
  if (type===1001&&[100100, 100101, 100102, 100107, 100109, 100111, 100112, 100113, 100114].includes(awe)) notice = passive ? `${passive} 加入群聊` : '有新成员加入群聊';
  else if (awe === 100104) notice = passive ? `${passive} 被移出群聊` : '群成员被移出群聊';
  else if (awe === 100105) notice = (active || passive) ? `${active || passive} 退出群聊` : '有成员退出群聊';
  else if (awe === 100110) notice = passive ? `${passive} 成为群管理员` : '群管理员发生变更';
  else if (awe === 100106) notice = text(v.new_name ?? v.newName ?? v.conversation_name ?? v.conversationName ?? v.name) ? `群名已修改为：${text(v.new_name ?? v.newName ?? v.conversation_name ?? v.conversationName ?? v.name)}` : '群名已修改';
  else if (awe === 100115) notice = '群头像已修改';
  const officialSystem=systemDisplay(v,0,{...context,type});
  const body = [1,1001,1002].includes(type)?officialSystem?.text||'':text(v.text)||text(v.content);
  if (recallPlaceholder(body)) return { text: '消息已撤回', contentKind: 'system' };
  if (notice) {
    const contextual=type===1001?contextualGroupNotice(v,context):undefined;
    const displayed = body || officialSystem?.text || contextual?.text || notice;
    const mentions = [...new Set([active,passive].filter(Boolean))].map(name => ({ start: displayed.indexOf(name), length: name.length })).filter(m => m.start >= 0);
    return decorateGroupNotice({ text: displayed, contentKind: 'system', ...(officialSystem?.contentNote?{contentNote:officialSystem.contentNote}:{}), ...(mentions.length ? { mentions } : {}) },v,context);
  }
  const mediaTypes = { 2: 'image', 27: 'image', 5: 'emoji', 17: 'audio', 3: 'audio', 30: 'video', 4: 'video' };
  const sticker=[1,1001].includes(type)?stickerResource(v):undefined;
  if (mediaTypes[type]||sticker) {
    const kind = sticker?'emoji':mediaTypes[type], resource = sticker??(kind === 'emoji' ? v.url : kind === 'video' ? v.video : v.resource_url);
    const mediaUrl = resourceUrl(resource), mediaLabel = { image: '图片', emoji: '表情', audio: '语音', video: '视频' }[kind];
    return { contentKind: kind, text: body || text(v.display_name) || `[${mediaLabel}]`, ...(!body || kind === 'emoji' && body === text(v.display_name) ? { textIsMediaLabel: true } : {}), ...(mediaUrl ? { mediaUrl } : {}), ...(!mediaUrl ? { contentNote: '附件地址尚未提供或需要官方解密，请在官网查看；原文已缓存' } : {}) };
  }
  if ([8, 77, 16, 75, 105].includes(type)) {
    const workId = typeof v.itemId === 'string' ? v.itemId : v.aweme_id;
    const validWork = typeof workId === 'string' && /^[1-9]\d{0,18}$/.test(workId) && BigInt(workId) <= 9223372036854775807n;
    const cardCoverUrl = resourceUrl(v.cover_url ?? v.cover);
    return { contentKind: 'card', text: body || text(v.comment) || text(v.content_title) || '[作品卡片]', ...(validWork ? { linkUrl: 'https://www.douyin.com/video/' + workId } : {}), ...(cardCoverUrl ? { cardCoverUrl } : {}) };
  }
  if (type === 26) return { contentKind: 'card', text: text(v.title) || body || '[链接卡片]', ...(url(v.link_url) ? { linkUrl: url(v.link_url) } : {}) };
  if (type === 25) return { contentKind: 'card', text: text(v.name) || '[用户名片]', ...(/^MS4w[A-Za-z0-9_-]{1,256}$/.test(v.secUID || '') ? { linkUrl: 'https://www.douyin.com/user/' + v.secUID } : {}) };
  if (type === 6) return { contentKind: 'card', text: text(v.name) ? `[文件] ${text(v.name)}` : '[文件]', contentNote: '不自动下载文件，请在官网查看' };
  if ([1,1001,1002].includes(type)&&officialSystem) return type===1001?decorateGroupNotice({...officialSystem,contentKind:'system'},v,context):{...officialSystem,contentKind:'system'};
  if (body && ![1,1001,1002].includes(type)) {
    const mentions = Array.isArray(v.richTextInfos) ? v.richTextInfos.slice(0, 100).filter(r => r?.infoType === 1 && Number.isSafeInteger(r.location) && Number.isSafeInteger(r.length) && r.location >= 0 && r.length > 0 && r.location + r.length <= body.length).map(r => ({ start: r.location, length: r.length })) : [];
    return { text: body, contentKind: [1, 1001].includes(type) ? 'system' : 'text', ...(mentions.length ? { mentions } : {}) };
  }
  // Explicit display fields only; no recursive traversal of token/key payloads.
  if ([1, 1001, 1002].includes(type)) {
    if(officialSystem)return {...officialSystem,contentKind:'system'};
    const hint = text(v.msgHint) || text(v.display_name);
    if (hint) return { text: hint, contentKind: 'system' };
  }
  if (type === 1001) return { text: '系统提示', contentKind: 'system', contentNote: '提示正文尚未解析，原始记录已在本机保留' };
  return { text: `暂未支持的消息（类型 ${type}），原文已缓存`, contentKind: 'unsupported' };
}
// Diagnostics contain only a fixed vocabulary of field names/types, bounded
// aweType and counts, never unknown keys, IDs, user text, URLs or attachment keys.
function systemShape(raw) {
  if(typeof raw!=='string'||Buffer.byteLength(raw)>256*1024)return 'body=oversize-or-missing';
  let v;try{v=JSON.parse(raw);}catch{return 'body=non-json';}
  if(!object(v))return 'body='+ (Array.isArray(v)?'array':typeof v);
  const keys=['aweType','awe_type','text','content','tips','fallback_tips','locale_resources','lang','hint_text','msgHint','display_name','template','template_info','templateInfo','template_values','templateValues','richTextInfos','active_users','passive_users','activeUsers','passiveUsers','description','desc','title','push_detail','is_system_type','type','key','name','value','nickname','nick_name','displayName','default_pattern','pattern','fallback_pattern','default_template','content_template','template_id','template_key','template_content','display_text','text_list','user_list','users','user_info','params','parameters','values','event_type','event_name'];
  const shape=o=>keys.filter(k=>Object.hasOwn(o,k)).map(k=>k+'='+(Array.isArray(o[k])?'array':o[k]===null?'null':typeof o[k])).join(',');
  const lengths=o=>keys.filter(k=>typeof o[k]==='string').map(k=>k+'='+o[k].length).join(',');
  const awe=v.aweType??v.awe_type, code=typeof awe==='number'&&Number.isSafeInteger(awe)&&Math.abs(awe)<1000000000||typeof awe==='string'&&/^\d{1,9}$/.test(awe)?String(awe):'unrecognized';
  return ['awe='+code,shape(v),'lengths{'+lengths(v)+'}','other='+Object.keys(v).filter(k=>!keys.includes(k)).length,...(Array.isArray(v.locale_resources)?['localeItems='+v.locale_resources.length,...v.locale_resources.slice(0,3).filter(object).map(item=>'localeEntry{'+shape(item)+'};localeLanguage='+(item.lang==='zh-Hans'?'zh-Hans':'other')+';localeLengths{'+lengths(item)+'}')]:[]),...['content','template','template_info','templateInfo'].filter(k=>object(v[k])).map(k=>k+'{'+shape(v[k])+'}'),...['template','active_users','passive_users'].flatMap(key=>Array.isArray(v[key])?[key+'Items='+v[key].length,...v[key].slice(0,3).filter(object).flatMap(item=>[(key==='template'?'entry':key+'Entry')+'{'+shape(item)+'}',key+'Lengths{'+lengths(item)+'}'])]:[])].join(';').slice(0,1400);
}
module.exports = { displayContent, systemShape, stickerResource };
