// Keep a renderer's timers active only while a native background task needs them.
// Shared leases avoid restoring throttling while another task still owns a lease.
const leases=new WeakMap();
function acquireBackgroundTimerLease(contents){
 if(!contents||typeof contents.getBackgroundThrottling!=='function'||typeof contents.setBackgroundThrottling!=='function')return()=>{};
 let state=leases.get(contents);
 if(!state){const previous=contents.getBackgroundThrottling();contents.setBackgroundThrottling(false);state={previous,count:0};leases.set(contents,state);}
 state.count++;let released=false;
 return()=>{
  if(released)return;released=true;if(--state.count)return;leases.delete(contents);
  try{if(!contents.isDestroyed?.()&&contents.getBackgroundThrottling()===false)contents.setBackgroundThrottling(state.previous);}catch{/* The window can be destroyed while its native task closes. */}
 };
}
module.exports={acquireBackgroundTimerLease};
