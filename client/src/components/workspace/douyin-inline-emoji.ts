// Schema and resource root used by the public creator emoji picker (ay),
// work-management.c9d22583.js SHA256 a042534e40ffcc9c9bb96c13bd2bd8aa786903cce7833a150e3e55c03ff9b8dc.
// No copied artwork, guessed filename, account request, cookie or read ACK.
export const emojiCatalogUrl='https://lf3-beecdn.bytetos.com/obj/ies-fe-bee/bee_prod/biz_181/bee_prod_181_bee_publish_1343.json';
const imageRoot='https://sf3-cdn-tos.douyinstatic.com/obj/ies-douyin-opencn/emoji/';
const cacheKey='matrix-public-douyin-emoji:v2';
const publicImage=(value:string)=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.href.length<=4096&&/(?:^|\.)(?:douyinpic\.com|douyinstatic\.com|byteimg\.com|bytetos\.com|pstatp\.com)$/.test(u.hostname)?u.href:undefined;}catch{return;}};
export function normalizeEmojiCatalog(value:unknown):Record<string,string>{
  const result:Record<string,string>=Object.create(null),conflicts=new Set<string>();
  if(!Array.isArray(value)||value.length>2000)return result;
  for(const row of value){if(!row||typeof row!=='object'||typeof row.name!=='string'||typeof row.img!=='string')continue;
    const name=row.name.replace(/^\[|\]$/g,'');
    if(!name||name.length>24||/[\[\]\r\n<>\u0000-\u001f]/.test(name))continue;
    const token='['+name+']',url=/^[-a-zA-Z0-9_]{1,160}$/.test(row.img)?imageRoot+row.img+'-3x.png':publicImage(row.img);if(!url)continue;
    if(conflicts.has(token))continue;
    if(Object.prototype.hasOwnProperty.call(result,token)&&result[token]!==url){delete result[token];conflicts.add(token);continue;}result[token]=url;
  }
  return result;
}
export function inlineEmojiTokens(text:string){return text.split(/(\[[^\[\]\r\n]{1,24}\])/g).filter(Boolean);}
export const needsInlineEmoji=(text:string)=>inlineEmojiTokens(text).some(token=>/^\[[^\[\]\r\n]{1,24}\]$/.test(token)&&!/^\[(?:图片|表情|图片表情|作品卡片|文件|链接卡片|用户名片)\]$/.test(token));
let catalog:Record<string,string>=Object.create(null),promise:Promise<void>|undefined,retryTimer:ReturnType<typeof setTimeout>|undefined,retryAfter=0;
const listeners=new Set<()=>void>(),retryDelayMs=60000;
function scheduleRetry(){
  if(retryTimer||!listeners.size||Object.keys(catalog).length)return;
  retryTimer=setTimeout(()=>{retryTimer=undefined;void loadInlineEmojiCatalog();},Math.max(0,retryAfter-Date.now()));
}
export function subscribeInlineEmoji(listener:()=>void){
  listeners.add(listener);
  return()=>{listeners.delete(listener);if(!listeners.size&&retryTimer){clearTimeout(retryTimer);retryTimer=undefined;}};
}
export const getInlineEmojiCatalog=()=>catalog;
export function loadInlineEmojiCatalog():Promise<void>{
  if(promise)return promise;
  if(Date.now()<retryAfter){scheduleRetry();return Promise.resolve();}
  promise=(async()=>{
    const save=()=>{if(!Object.keys(catalog).length)return;try{localStorage.setItem(cacheKey,JSON.stringify({version:2,at:Date.now(),entries:Object.entries(catalog).map(([name,img])=>({name,img}))}));}catch{}};
    try{const raw=localStorage.getItem(cacheKey);if(raw&&raw.length<1024*1024){const saved=JSON.parse(raw);if(saved.version===2&&Number.isSafeInteger(saved.at)&&Date.now()>=saved.at&&Date.now()-saved.at<86400000&&Array.isArray(saved.entries)){catalog=normalizeEmojiCatalog(saved.entries);if(Object.keys(catalog).length)return;}}}catch{}
    if(window.matrixDesktop?.douyinEmojiCatalog)try{const result=await window.matrixDesktop.douyinEmojiCatalog();const fresh=normalizeEmojiCatalog(result.entries);if(Object.keys(fresh).length){catalog=fresh;save();return;}}catch{/* An unavailable public catalog never changes account state. */}
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetch(emojiCatalogUrl,{credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal});
      if(!response.ok||Number(response.headers.get('content-length')||0)>2*1024*1024||!response.body)return;
      const reader=response.body.getReader(),parts:Uint8Array[]=[];let bytes=0;
      try{while(true){const item=await reader.read();if(item.done)break;bytes+=item.value.byteLength;if(bytes>2*1024*1024){await reader.cancel();return;}parts.push(item.value);}}finally{reader.releaseLock();}
      const raw=new Uint8Array(bytes);let offset=0;for(const part of parts){raw.set(part,offset);offset+=part.byteLength;}
      const entries=JSON.parse(new TextDecoder().decode(raw));catalog=normalizeEmojiCatalog(entries);
      save();
    }catch{/* Preserve the literal shortcode on offline/denied/malformed assets. */}finally{clearTimeout(timer);}
  })().finally(()=>{
    if(Object.keys(catalog).length){for(const listener of listeners)try{listener();}catch{/* One view cannot block other views. */}}
    else{promise=undefined;retryAfter=Date.now()+retryDelayMs;scheduleRetry();}
  });return promise;
}
