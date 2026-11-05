'use strict';
const minute=60000;
// The second and third reads are spaced from the previous actual read. A
// machine waking up late performs one read, rather than replaying missed ticks.
const gaps=[minute,4*minute,10*minute];
function commentReviewKey(row){return 'comment/'+row.id+'/'+row.commentId;}
function reviewProgress(ledger,row,createdAt){
  const prior=ledger?.[commentReviewKey(row)],attempts=prior?.count||0;
  const nextAt=gaps[attempts]===undefined?undefined:(prior?.at||row.completedAt||createdAt)+gaps[attempts];
  return {attempts,lastAt:prior?.at,nextAt};
}
function pendingFollowup(r){
  if(!r.followupOf||r.kind!=='comments'||r.commentDeleted||!['bilibili','xiaohongshu','wechat'].includes(r.platform))return false;
  return r.pinResult?.status==='unknown'||r.commentManagement?.status==='unknown'||
    r.status==='unknown'&&(r.clicked===true||!!r.commentId);
}
function createResultReview({queue,journal,owner,verifyFollowup,canReviewPage,verifyPage,now=Date.now}){
  let flight,stopped=false;
  const idle={nextInMs:minute};
  async function run(){
      const candidates=[];
      for(const batch of queue.state.batches){
        for(const row of batch.rows){
          if(!queue.canReview(batch,row)||row.visibility?.state==='author-visible')continue;
          candidates.push({key:commentReviewKey(row),at:row.completedAt||batch.createdAt,read:()=>queue.recheckRow(batch,row),kind:'comment'});
        }
      }
      const actions=journal.pendingReviews?journal.pendingReviews(owner):journal.list(owner);
      const parents=new Map(actions.filter(r=>r.kind==='publish'&&r.status==='confirmed').map(r=>[r.id,r]));
      for(const child of actions){
        if(!child.followupOf&&canReviewPage?.(child)){
          candidates.push({key:'page/'+child.id,at:Date.parse(child.createdAt),kind:'page',read:()=>verifyPage(child)});
        }
        if(!pendingFollowup(child))continue;
        const parent=parents.get(child.followupOf)||journal.find?.(owner,child.followupOf);
        if(parent?.status!=='confirmed'||parent.kind!=='publish'||parent.accountId!==child.accountId||parent.platform!==child.platform||parent.taskId!==child.taskId||parent.attemptId!==child.attemptId)continue;
        // A later explicit management operation has its own bounded budget.
        const key=JSON.stringify(['followup',child.id,child.requestId,child.commentManagement?.operation]);
        candidates.push({key,at:Date.parse(child.createdAt),kind:'followup',read:()=>verifyFollowup(child,parent)});
      }
      const ledger=queue.state.autoReviews||{};
      const pending=new Set(candidates.map(c=>c.key));
      const stale=Object.keys(ledger).filter(key=>!pending.has(key));
      if(stale.length){for(const key of stale)delete ledger[key];await queue.persist();}
      let chosen,earliest=Infinity;
      for(const candidate of candidates){
        const prior=ledger[candidate.key];
        const gap=gaps[prior?.count||0];
        if(gap===undefined||!Number.isFinite(candidate.at))continue;
        const due=(prior?.at||candidate.at)+gap;
        if(due<earliest){earliest=due;chosen=candidate;}
      }
      if(!chosen)return idle;
      if(earliest>now())return {nextInMs:Math.min(minute,earliest-now())};
      // Persist the reservation first so a restart never resets the budget.
      queue.state.autoReviews=ledger;
      ledger[chosen.key]={count:(ledger[chosen.key]?.count||0)+1,at:now()};
      await queue.persist();
      if(stopped||queue.closed||queue.active)return {nextInMs:15000};
      try{await chosen.read();}catch{/* Keep the original receipt and retry only inside this budget. */}
      return {nextInMs:15000,checked:chosen.kind};
  }
  return {
    tick(){
      if(stopped||flight||queue.active||queue.closed)return Promise.resolve({nextInMs:15000});
      flight=run().finally(()=>{flight=undefined;});
      return flight;
    },
    async close(){stopped=true;try{await flight;}catch{/* An interrupted read preserves the receipt. */}},
  };
}
module.exports={createResultReview,pendingFollowup,reviewProgress};
