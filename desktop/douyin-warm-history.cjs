// Titles, nicknames, rounded counters and cached list length are not identities
// or completion proofs. Unknown evidence always retains normal pagination.
const SOURCE='douyin-creator-work-metrics-v1',DAY=86400000;
const id=value=>typeof value==='string'&&/^[1-9]\d{0,18}$/.test(value)&&BigInt(value)<=9223372036854775807n;
const count=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
function canWarmHistory(fresh,cached,{forceHistory=false,now=Date.now()}={}){
 if(forceHistory||!fresh||!cached||!id(fresh.platformId)||fresh.platformId!==cached.platformId||!id(fresh.ownerUid)||fresh.ownerUid!==cached.ownerUid||fresh.commentCountSource!==SOURCE||cached.commentCountSource!==SOURCE||!count(fresh.commentCount)||fresh.commentCount!==cached.commentCount||cached.readComplete!==true||cached.readError!==undefined&&cached.readError!=='')return false;
 const at=typeof cached.historyCompletedAt==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(cached.historyCompletedAt)?Date.parse(cached.historyCompletedAt):NaN;
 return Number.isFinite(at)&&at<=now+5000&&now-at<=DAY;
}
module.exports={SOURCE,DAY,canWarmHistory};
