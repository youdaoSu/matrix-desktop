const {performance}=require('node:perf_hooks');

// Requests liveness from the renderer; it never extends an authenticated lease.
// Weak ownership prevents stopped workspaces retaining windows or timer state.
function createRendererHeartbeatRequester({getContents,channel,intervalMs=15000,now=()=>performance.now()}) {
  if(typeof getContents!=='function'||typeof now!=='function'||!/^matrix:[a-z0-9-]+$/.test(channel)||!Number.isFinite(intervalMs)||intervalMs<1000||intervalMs>30000)throw Error('Invalid renderer heartbeat configuration');
  const previous=new WeakMap();
  return(scope,workspaceId)=>{
    if(!scope||typeof scope!=='object'||typeof workspaceId!=='string'||!workspaceId||workspaceId.length>128)return false;
    const at=now(),last=previous.get(scope);if(!Number.isFinite(at)||last!==undefined&&at>=last&&at-last<intervalMs)return false;
    previous.set(scope,at);
    try{const contents=getContents();if(!contents||contents.isDestroyed?.()||typeof contents.send!=='function')return false;contents.send(channel,workspaceId);return true;}catch{return false;}
  };
}
module.exports={createRendererHeartbeatRequester};
