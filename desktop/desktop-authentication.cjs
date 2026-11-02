// Concurrent checks share only an IN-FLIGHT read, never a completed login or
// account proof. Every later operation rechecks the local authenticated API.
const {createHash}=require('node:crypto');
const {localServiceCsrf}=require('./local-service-session.cjs');
function createDesktopAuthentication({getOrigin,getSession,fetchImpl=globalThis.fetch,readCsrf=localServiceCsrf}) {
  const pending=new Map();
  const read=(origin,route,token,csrf)=>{
    const key=createHash('sha256').update(JSON.stringify([origin,route,token,csrf])).digest('hex');
    let task=pending.get(key);
    if(!task){
      task=(async()=>{const response=await fetchImpl(origin+route,{headers:{Authorization:`Bearer ${token}`,Cookie:`suda-csrf-token=${csrf}`,'x-suda-csrf-token':decodeURIComponent(csrf)},redirect:'error',signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw Error('登录已失效或账号不可访问，请重新登录远效');
        return (await response.json()).data;
      })();
      if(pending.size<128){pending.set(key,task);const release=()=>{if(pending.get(key)===task)pending.delete(key);};void task.then(release,release);}
    }
    // Callers may not mutate another module's authorization result.
    return task.then(value=>structuredClone(value));
  };
  return async(accessToken,accountId)=>{
    if(typeof accessToken!=='string'||!accessToken||accessToken.length>8192)throw Error('请先登录远效');
    if(accountId!==undefined&&(typeof accountId!=='string'||!/^[a-f0-9-]{36}$/i.test(accountId)))throw Error('账号标识不正确');
    const target=new URL(getOrigin()),origin=target.origin;
    if(!['http:','https:'].includes(target.protocol)||!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||target.username||target.password)throw Error('桌面操作记录需要本机服务');
    const csrf=await readCsrf(getSession(),origin);
    if(accountId===undefined){const user=await read(origin,'/api/auth/me',accessToken,csrf);if(!user?.id)throw Error('无法确认当前登录用户');return {userId:user.id};}
    // One authenticated, owner-scoped read replaces /me + dashboard detail.
    // It still makes a NEW API read after each completed proof: no TTL cache,
    // stale-login reuse, fallback to an older result, or ownership shortcut.
    const context=await read(origin,`/api/platform/accounts/${accountId}/desktop-context`,accessToken,csrf);
    if(typeof context?.userId!=='string'||!context.userId||context.account?.id!==accountId)throw Error('账号不可访问');
    return context;
  };
}
module.exports={createDesktopAuthentication};
