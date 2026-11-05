'use strict';
const gaps=[60000,240000,600000];
function createOperationResultReviews({now=Date.now,paused=()=>false}={}){
  const pending=new Map();
  let active,closed=false;
  async function finish(key,job){
    if(pending.get(key)!==job)return;
    pending.delete(key);
    try{await job.dispose?.();}catch{/* Preserve any original retained page. */}
  }
  return {
    enqueue(key,read,dispose){
      if(closed||pending.has(key)||pending.size>=100)return false;
      pending.set(key,{read,dispose,count:0,next:now()+gaps[0]});
      return true;
    },
    tick(){
      if(closed||active||paused())return Promise.resolve();
      const due=[...pending].find(([,job])=>job.next<=now());
      if(!due)return Promise.resolve();
      const [key,job]=due;
      job.count++;
      job.next=now()+(gaps[job.count]||0);
      active=(async()=>{
        try{if(await job.read()||job.count>=gaps.length)await finish(key,job);}
        catch(error){
          const detail=String(error?.message||'');
          job.issue=/cookie|token|https?:|[A-Za-z]:[\\/]/i.test(detail)?'原页面复核未完成':detail.slice(0,240);
          if(job.count>=gaps.length)await finish(key,job);
        }
      })().finally(()=>{active=undefined;});
      return active;
    },
    async close(){closed=true;await active;for(const [key,job] of pending)await finish(key,job);},
    snapshot(){return [...pending].map(([key,j])=>({key,attempts:j.count,nextAt:j.next,issue:j.issue}));},
  };
}
module.exports={createOperationResultReviews};
