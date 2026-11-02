// Reuse the exact bound website session; isolate policy by webContents ID.
const {createHash}=require('node:crypto');
const {registerScopedRequestPolicy}=require('./douyin-scoped-request-policy.cjs');
const {creatorBlocked}=require('./douyin-creator-reader.cjs');
const AUTH=/^(?:sessionid|sessionid_ss|sid_tt|sid_guard|uid_tt|uid_tt_ss|sid_ucp_v1|ssid_ucp_v1)$/;
const owned=cookie=>typeof cookie?.domain==='string'&&/(^|\.)douyin\.com$/.test(cookie.domain.replace(/^\./,''));
const paths=new Set(['/aweme/v1/creator/pc/user/info/','/aweme/v1/creator/user/info/','/aweme/v1/web/oversea/judgment/','/web/api/media/user/info/','/web/api/v2/creator/xigua/user/info','/web/api/creator/center/fans/index/config','/web/api/creator/mcn/account_base_info']);
function profileBlocked(details){
 if(creatorBlocked(details))return true;
 let url;try{url=new URL(details.url);}catch{return true;}
 if(/\/(?:api|aweme|janus)\//.test(url.pathname))return url.origin!=='https://creator.douyin.com'||!paths.has(url.pathname);
 return false;
}
function createProfileContext({now=Date.now}={}){
 return async function prepare({sourceSession,assertCurrent,signal}){
  let closed=false,listener,release;
  const rows=async()=>{const cookies=(await sourceSession.cookies.get({})).filter(cookie=>owned(cookie)&&(!cookie.expirationDate||cookie.expirationDate>now()/1000));if(cookies.length>300)throw Error('本人资料会话超过安全范围，未读取');return cookies;};
  const stamp=cookies=>{const known=cookies.filter(cookie=>AUTH.test(cookie.name));return createHash('sha256').update(JSON.stringify((known.length?known:cookies).map(cookie=>[cookie.domain,cookie.path,cookie.name,cookie.name==='sid_guard'?(()=>{try{return decodeURIComponent(cookie.value).split('|')[0];}catch{return cookie.value;}})():cookie.value]).sort())).digest('hex');};
  const close=()=>{if(closed)return;closed=true;release?.();if(listener)sourceSession.cookies.removeListener('changed',listener);signal?.removeEventListener('abort',close);};
  const active=()=>{if(closed||signal?.aborted)throw Error('本人资料只读会话已结束，旧计数未采用');};
  let fingerprint;
  const check=async()=>{active();await assertCurrent();active();const current=stamp(await rows());active();if(current!==fingerprint){close();throw Error('抖音官方登录已变化，旧本人资料计数未采用');}};
  signal?.addEventListener('abort',close,{once:true});
  try{
   active();await assertCurrent();active();fingerprint=stamp(await rows());active();
   listener=(_event,cookie)=>{if(owned(cookie)&&AUTH.test(cookie.name))void check().catch(close);};sourceSession.cookies.on('changed',listener);
   await check();
   return {session:sourceSession,check,close,attach(guest){
    active();if(release||!Number.isSafeInteger(guest?.id)||guest.id<1||guest.session!==sourceSession)throw Error('本人资料只读页面与绑定会话不一致');
    release=registerScopedRequestPolicy(sourceSession,guest.id,{blocks:details=>closed||profileBlocked(details)});
   }};
  }catch(error){close();throw error;}
 };
}
module.exports={profileBlocked,createProfileContext};
