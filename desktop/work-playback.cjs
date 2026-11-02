// Only exact counts observed by the verified creator collector. No requests.
const SOURCE='douyin-creator-play-count-v1',INTERVAL=5*60*1000,LIMIT=16;
const count=n=>Number.isSafeInteger(n)&&n>=0;
const time=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT/.test(s)&&Number.isFinite(Date.parse(s));
function playbackFields(row,source,ownUid,now=Date.now()){
 const n=row?.metrics?.play_count,at=row?.metrics_observed_at;
 if(source!=='https://creator.douyin.com/'||!ownUid||row?.author?.uid!==ownUid||!count(n)||!time(at)||Date.parse(at)>now+30000)return {};
 return {playCount:n,playObservedAt:at,playCountSource:SOURCE};
}
function mergePlayback(previous,next){
 const result={...previous,...next};delete result.playbackHistory;
 const same=previous?.ownerUid&&previous.ownerUid===result.ownerUid&&(!Object.hasOwn(next,'playbackAccountKey')||previous.playbackAccountKey===next.playbackAccountKey);
 const history=same&&Array.isArray(previous.playbackHistory)?previous.playbackHistory.filter(p=>time(p?.at)&&count(p?.count)).slice(-LIMIT):[];
 const valid=next.playCountSource===SOURCE&&count(next.playCount)&&time(next.playObservedAt);
 const oldValid=same&&previous.playCountSource===SOURCE&&count(previous.playCount)&&time(previous.playObservedAt);
 if(!valid||oldValid&&Date.parse(next.playObservedAt)<=Date.parse(previous.playObservedAt)){
  if(oldValid)Object.assign(result,{playCount:previous.playCount,playObservedAt:previous.playObservedAt,playCountSource:SOURCE,playbackAccountKey:previous.playbackAccountKey});
  else{delete result.playCount;delete result.playObservedAt;delete result.playCountSource;delete result.playbackAccountKey;}
 }else if(result.ownerUid){
  const last=history.at(-1);
  if(!last||Date.parse(next.playObservedAt)-Date.parse(last.at)>=INTERVAL)history.push({at:next.playObservedAt,count:next.playCount});
 }
 if(history.length)result.playbackHistory=history.slice(-LIMIT);
 return result;
}
module.exports={SOURCE,INTERVAL,LIMIT,playbackFields,mergePlayback};
