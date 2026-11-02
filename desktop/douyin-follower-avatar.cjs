// On-demand enrichment of an EXISTING cached follower, not a roster fallback.
// Exact bound session, normal GETs only, no signing/SDK/notification traffic.
const {createHash}=require('node:crypto');
const {mediaUrl}=require('./douyin-inbox-media.cjs');
const {avatars}=require('./douyin-interaction-media.cjs');
const AUTH=/^(?:sessionid|sessionid_ss|sid_tt|sid_guard|uid_tt|uid_tt_ss|sid_ucp_v1|ssid_ucp_v1)$/;
const uid=value=>typeof value==='string'&&/^[1-9]\d{0,18}$/.test(value)?value:Number.isSafeInteger(value)&&value>0?String(value):'';
function followerAvatarTarget(row){
  if(!row||row.platformId!==row.platformUserId||!uid(row.platformUserId)||row.workId!==undefined)return;
  try{const url=new URL(row.authorProfileUrl);const sec=/^\/user\/(MS4w[A-Za-z0-9_-]{1,250})\/?$/.exec(url.pathname)?.[1];
    if(url.origin==='https://www.douyin.com'&&!url.username&&!url.password&&!url.search&&!url.hash&&sec)return {uid:row.platformUserId,secUid:sec};
  }catch{}
}
function createFollowerAvatarLookup({session,profileReader,now=Date.now,gapMs=1500,onResult}={}){
  const proofs=new Map(),stops=new Map(),pending=new Map();let closed=false,tail=Promise.resolve(),nextAt=0;
  const controllers=new Set();
  const failure=(message,code='schema')=>Object.assign(Error(message),{avatarCode:code});
  const stamp=async source=>{
    const cookies=(await source.cookies.get({url:'https://www.douyin.com/'})).filter(c=>AUTH.test(c.name)&&typeof c.domain==='string'&&/(?:^|\.)douyin\.com$/.test(c.domain.replace(/^\./,''))&&(!c.expirationDate||c.expirationDate>now()/1000));
    if(!cookies.length||cookies.length>100)throw failure('缺少有效登录，公开资料补头像已暂停','login-required');
    return createHash('sha256').update(JSON.stringify(cookies.map(c=>[c.domain,c.path,c.name,c.name==='sid_guard'?(()=>{try{return decodeURIComponent(c.value).split('|')[0];}catch{return c.value;}})():c.value]).sort())).digest('hex');
  };
  async function json(source,pathname,query,guard){
    await guard();const controller=new AbortController();controllers.add(controller);const timer=setTimeout(()=>controller.abort(),10000);
    try{
      const url=new URL(pathname,'https://www.douyin.com');for(const [key,value]of Object.entries({aid:'6383',device_platform:'webapp',channel:'channel_pc_web',...query}))url.searchParams.set(key,value);
      const response=await source.fetch(url.href,{method:'GET',credentials:'include',redirect:'error',cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});
      await guard();
      if(response.status!==200)throw failure('公开资料补头像返回 HTTP '+(Number.isInteger(response.status)?response.status:'未知')+'，已暂停，原名单保留',[401,403,429].includes(response.status)?'http-denied':'transport');
      if(Number(response.headers?.get('content-length'))>4*1024*1024)throw failure('公开资料响应超过读取限制，原名单保留');
      if(!response.body?.getReader)throw failure('公开资料响应结构未识别，原名单保留');
      const reader=response.body.getReader(),parts=[];let length=0;
      try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>4*1024*1024)throw failure('公开资料响应超过读取限制，原名单保留');parts.push(Buffer.from(value));}}finally{try{await reader.cancel();}catch{}}
      await guard();let result;
      try{const raw=Buffer.concat(parts,length).toString('utf8');result=JSON.parse(raw.replace(/"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g,t=>t[0]!=='"'&&/^-?\d+$/.test(t)&&!Number.isSafeInteger(Number(t))?JSON.stringify(t):t));}catch{throw failure('公开资料未返回可识别数据，补头像暂停；不代表没有粉丝','schema');}
      if(!result||typeof result!=='object'||Array.isArray(result)||![0,'0'].includes(result.status_code))throw failure('公开资料返回平台限制或未识别状态，补头像已暂停','platform-denied');
      return result.user;
    }catch(error){if(error.avatarCode)throw error;throw failure('公开资料网络读取失败或超时，补头像暂停，原名单保留','transport');}
    finally{clearTimeout(timer);controllers.delete(controller);controller.abort();}
  }
  return {
    read({account,row,assertCurrent,diagnosticScope}){
      const target=followerAvatarTarget(row);
      if(closed||!target||account?.platform!=='douyin'||!/^[a-f0-9-]{16,80}$/i.test(account.connectorSessionId||'')||typeof account.nativeAccountKey!=='string'||!account.nativeAccountKey||typeof assertCurrent!=='function')return Promise.reject(failure('缓存粉丝缺少可核验的官方主页，未猜测头像地址'));
      const scope=JSON.stringify([account.id,account.connectorSessionId,account.nativeAccountKey]),key=scope+'/'+target.uid+'/'+target.secUid;
      if(pending.has(key))return pending.get(key);if(pending.size>=8)return Promise.reject(failure('公开资料补头像队列繁忙，请稍后查看','reader-busy'));
      const task=tail.catch(()=>{}).then(async()=>{
        const source=session.fromPartition('persist:matrix-douyin-'+account.connectorSessionId);let fingerprint;
        const guard=async()=>{if(closed)throw failure('公开资料补头像已结束');await assertCurrent();if(closed)throw failure('公开资料补头像已结束');const current=await stamp(source);if(fingerprint&&current!==fingerprint)throw failure('官方登录已变化，旧头像结果未采用','binding-changed');fingerprint=current;};
        try{
          await guard();const stopped=[stops.get(scope),stops.get(key)].find(value=>value?.fingerprint===fingerprint&&value.until>now());if(stopped)throw stopped.error;
          const delay=Math.max(0,nextAt-now());if(delay)await new Promise(resolve=>setTimeout(resolve,Math.min(delay,1500)));await guard();nextAt=now()+Math.max(0,Math.min(gapMs,1500));
          let user;
          if(typeof profileReader==='function')user=await profileReader({accountSession:source,publicHandle:account.nativeAccountKey,target,assertCurrent:guard,diagnosticScope});
          else {
          const proof=proofs.get(scope);
          if(!proof||proof.fingerprint!==fingerprint||now()<proof.at||now()-proof.at>=30000){
            const self=await json(source,'/aweme/v1/web/user/profile/self/',{},guard),handle=String(self?.unique_id||self?.short_id||'');
            if(!uid(self?.uid)||handle!==account.nativeAccountKey)throw failure('官网本人账号与绑定不一致，补头像停止','binding-mismatch');
            proofs.set(scope,{fingerprint,at:now()});while(proofs.size>16)proofs.delete(proofs.keys().next().value);
          }
          user=await json(source,'/aweme/v1/web/user/profile/other/',{sec_user_id:target.secUid},guard);
          }
          if(uid(user?.uid)!==target.uid||(user?.sec_uid??user?.secUid)!==target.secUid)throw failure('公开资料编号与缓存粉丝不一致，旧头像结果未采用','binding-mismatch');
          const urls=avatars(user).filter(value=>mediaUrl(value)===value);if(!urls.length)throw failure('该粉丝公开资料未提供可读取的头像地址','avatar-unavailable');
          await guard();try{onResult?.({scope:diagnosticScope,code:'read-ok',avatarSources:1});}catch{}return urls;
        }catch(error){
          const known=error.avatarCode?error:failure('公开资料补头像未完成，原名单保留');
          // No automatic alternate API/session after a refusal or read failure.
          if(fingerprint&&known.avatarCode!=='reader-busy'){stops.set(known.avatarCode==='avatar-unavailable'?key:scope,{fingerprint,until:now()+600000,error:known});while(stops.size>128)stops.delete(stops.keys().next().value);}
          try{onResult?.({scope:diagnosticScope,code:known.avatarCode,avatarSources:0});}catch{}throw known;
        }
      }).finally(()=>pending.delete(key));pending.set(key,task);tail=task;return task;
    },
    close(){closed=true;for(const controller of controllers)controller.abort();proofs.clear();stops.clear();}
  };
}
module.exports={createFollowerAvatarLookup,followerAvatarTarget};
