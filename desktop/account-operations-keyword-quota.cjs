'use strict';
// Pure projection of durable outcomes. Uncertain sends never age out as if
// they had failed; only a durable receipt or explicit not-sent proof settles them.
function accountQuota({rule,accountId,hits,tasks,now,exceptId}) {
 const limit=rule.senderLimits?.find(row=>row.accountId===accountId)?.limit??rule.hourlyLimit;
 const windowMs=rule.windowMinutes*60000,successes=[];let reserved=0,queued=0;
 for(const hit of hits){
  if(hit.accountId!==accountId||hit.id===exceptId)continue;
  const task=tasks.get(hit.taskId);
  if(task?.status==='sent'&&task.receipt&&task.claimedAt){
   const at=Date.parse(task.resolvedAt||task.updatedAt);
   if(Number.isFinite(at))successes.push(at);else reserved++;
  }else if(task?.status==='failed'&&task.failure?.outcome==='not-sent'){
   // Proven failure consumes no success allowance.
  }else if(task?.claimedAt||['sending','unknown'].includes(task?.status)||hit.status==='sent'||hit.dispatchedAt!==undefined&&!task){
   reserved++;
  }else if(hit.status==='dispatching')reserved++;
  // Paused/deleted rules retain evidence but must not distort live assignment.
  else if(hit.status==='queued')queued++;
 }
 const windowTimes=successes.filter(at=>at>now-windowMs).sort((a,b)=>a-b);
 const dayTimes=successes.filter(at=>at>now-86400000).sort((a,b)=>a-b);
 const remaining=Math.max(0,Math.min(limit-windowTimes.length-reserved,rule.dailyLimit-dayTimes.length-reserved));
 const release=(times,cap,span)=>reserved>=cap?null:times.length+reserved>=cap?times[times.length+reserved-cap]+span:now;
 const w=release(windowTimes,limit,windowMs),d=release(dayTimes,rule.dailyLimit,86400000);
 return {accountId,limit,windowMinutes:rule.windowMinutes,dailyLimit:rule.dailyLimit,success:windowTimes.length,dailySuccess:dayTimes.length,reserved,queued,remaining,nextAt:w===null||d===null?null:Math.max(w,d)};
}
module.exports={accountQuota};
