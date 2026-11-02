// Serialized into the already owner-verified official OWN page. No SDK,
// signatures, arbitrary URLs, navigation or roster-state changes.
async function readPublicAvatarProfile(input) {
  const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
  const exact=v=>typeof v==='string'&&/^[1-9]\d{0,18}$/.test(v)?v:Number.isSafeInteger(v)&&v>0?String(v):'';
  let timer,phase='fetch';const controller=new AbortController();
  try{
    if(location.origin!=='https://www.douyin.com'||location.pathname!=='/user/self')fail('binding-changed','本人官网页面已变化，旧头像未采用');
    if(!exact(input?.uid)||!/^MS4w[A-Za-z0-9_-]{1,250}$/.test(input.secUid||''))fail('schema','缓存粉丝身份字段未识别，未请求其他主页');
    timer=setTimeout(()=>controller.abort(),15000);
    const query=new URLSearchParams({aid:'6383',device_platform:'webapp',channel:'channel_pc_web',sec_user_id:input.secUid});
    const response=await fetch('/aweme/v1/web/user/profile/other/?'+query,{method:'GET',credentials:'same-origin',redirect:'error',signal:controller.signal});
    if(!Number.isInteger(response.status)||response.status<100||response.status>599)fail('transport','粉丝公开资料网络状态未识别，补头像暂停');
    if(response.status!==200)fail([401,403,429].includes(response.status)?'http-denied':'transport','粉丝公开资料返回 HTTP '+response.status+'，补头像暂停，原名单保留');
    if(Number(response.headers?.get('content-length'))>4*1024*1024||!response.body?.getReader)fail('schema','粉丝公开资料响应结构未识别，原名单保留');
    phase='body';const reader=response.body.getReader(),decoder=new TextDecoder();let raw='',size=0;
    try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>4*1024*1024)fail('schema','粉丝公开资料响应超过读取限制');raw+=decoder.decode(chunk.value,{stream:true});}raw+=decoder.decode();}finally{try{await reader.cancel();}catch{}}
    let data;try{data=JSON.parse(raw.replace(/"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g,t=>t[0]!=='"'&&/^-?\d+$/.test(t)&&!Number.isSafeInteger(Number(t))?JSON.stringify(t):t));}catch{fail('schema','粉丝公开资料未返回可识别数据，原名单保留');}
    if(!data||typeof data!=='object'||Array.isArray(data))fail('schema','粉丝公开资料结构未识别');
    const statuses=['status_code','statusCode'].filter(key=>Object.hasOwn(data,key)).map(key=>data[key]);
    if(!statuses.length)fail('schema','粉丝公开资料缺少状态字段');
    if(statuses.some(value=>![0,'0'].includes(value)))fail('platform-denied','粉丝公开资料返回平台限制，补头像已暂停');
    const users=[data.user,data.userInfo].filter(value=>value&&typeof value==='object'&&!Array.isArray(value));
    if(users.length!==1)fail('schema','粉丝公开资料成员字段不唯一或缺失');
    const user=users[0],ids=['uid','userId','user_id'].filter(key=>Object.hasOwn(user,key)).map(key=>exact(user[key])),secs=['sec_uid','secUid'].filter(key=>Object.hasOwn(user,key)).map(key=>user[key]);
    if(!ids.length||ids.some(value=>!value)||new Set(ids).size!==1||!secs.length||new Set(secs).size!==1)fail('schema','粉丝公开资料身份字段缺失或矛盾');
    if(ids[0]!==input.uid||secs[0]!==input.secUid)fail('avatar-peer-mismatch','公开资料编号与缓存粉丝不一致，旧头像结果未采用');
    const urls=[],add=value=>{if(typeof value!=='string'||value.length>4096)return;try{const url=new URL(value.startsWith('//')?'https:'+value:value);if(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.hash&&/(?:^|\.)(?:byteimg\.com|douyinpic\.com|douyincdn\.com|pstatp\.com|ibytedtos\.com|bytecdn\.cn)$/.test(url.hostname)&&!urls.includes(url.href)&&urls.length<4)urls.push(url.href);}catch{}};
    const resource=(value,depth=0)=>{if(depth>3)return;if(typeof value==='string')add(value);else if(Array.isArray(value))value.slice(0,8).forEach(item=>resource(item,depth+1));else if(value&&typeof value==='object')for(const key of ['url_list','urlList','urls','url','src'])resource(value[key],depth+1);};
    for(const key of ['avatar_thumb','avatarThumb','avatar_medium','avatarMedium','avatar_larger','avatarLarger','avatar_url','avatarUrl','avatar','avatar_168x168','avatar_300x300','avatar_100x100'])resource(user[key]);
    if(!urls.length)fail('avatar-unavailable','该粉丝公开资料未提供可读取的头像地址');
    return {ok:true,user:{uid:ids[0],sec_uid:secs[0],avatar_thumb:{url_list:urls}}};
  }catch(error){const known=['binding-changed','schema','http-denied','transport','platform-denied','avatar-peer-mismatch','avatar-unavailable'].includes(error?.code);return {ok:false,code:known?error.code:controller.signal.aborted?'avatar-network-timeout':phase==='body'?'avatar-body-network':'avatar-fetch-network',message:known?error.message:controller.signal.aborted?'粉丝公开资料请求超时，原名单保留':phase==='body'?'粉丝资料已响应，但内容读取中断，原名单保留':'粉丝公开资料请求未成功建立，原名单保留'};}
  finally{clearTimeout(timer);controller.abort();}
}
module.exports={readPublicAvatarProfile};
