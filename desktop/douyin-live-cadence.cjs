// Pure monitor scheduling, not a request generator. Preserve the native account
// floor and at least fifteen seconds between automatic reads of the same work.
const MIN=4500,PER_WORK=15000,INVENTORY=60000;
const validStamp=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const elapsed=(stamp,at)=>validStamp(at)&&stamp>=at?stamp-at:Infinity;
function interval(count){return Number.isSafeInteger(count)&&count>0?Math.max(MIN,Math.ceil(PER_WORK/Math.min(count,5000))):INVENTORY;}
function eligible(work,stamp){return elapsed(stamp,work.headCheckedAt)>=PER_WORK;}
function choose(state,stamp,priority){
 const heads=state.headWorks||[];if(!heads.length)return;
 const index=(state.headIndex||0)%heads.length;
 const preferred=priority&&state.priorityHeadId!==priority?heads.find(work=>work.id===priority&&eligible(work,stamp)):undefined;
 if(preferred)return{work:preferred,index:preferred.id===heads[index].id?index+1:index,preferred:true};
 for(let offset=0;offset<heads.length;offset++){const at=(index+offset)%heads.length,work=heads[at];if(eligible(work,stamp))return{work,index:at+1,preferred:false};}
}
function delay(state,stamp){
 const heads=state.headWorks||[],inventoryLeft=Math.max(0,INVENTORY-elapsed(stamp,state.inventoryAt));
 if(!heads.length)return Math.max(MIN,Math.min(INVENTORY,inventoryLeft));
 const nextWork=Math.min(...heads.map(work=>Math.max(0,PER_WORK-elapsed(stamp,work.headCheckedAt))));
 const nextHead=Math.max(interval(heads.length)-elapsed(stamp,state.headAt),nextWork,0);
 return Math.max(MIN,Math.min(INVENTORY,nextHead,inventoryLeft));
}
module.exports={MIN,PER_WORK,INVENTORY,interval,eligible,choose,delay};
