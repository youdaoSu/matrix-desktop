import type { DouyinInteractionWork } from './douyin-interactions';
export type PlaybackState='missing'|'baseline'|'waiting'|'counter-reset'|'measured';
export function playbackVelocity(work:DouyinInteractionWork,accountKey?:string,now=Date.now()){
 const validCount=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
 const time=(s:unknown)=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT/.test(s)?Date.parse(s):NaN;
 const end=time(work.playObservedAt);
 // A bound public handle is not the platform's internal UID. The main process
 // records this association only after the official owner recheck succeeds.
 if(!accountKey||work.playbackAccountKey!==accountKey||!work.ownerUid||work.playCountSource!=='douyin-creator-play-count-v1'||!validCount(work.playCount)||!Number.isFinite(end)||end>now+30000)return {state:'missing' as PlaybackState};
 const latest={count:work.playCount,at:work.playObservedAt!},stale=now-end>30*60*1000;
 const points=(work.playbackHistory||[]).filter(p=>validCount(p.count)&&Number.isFinite(time(p.at))&&time(p.at)<end).sort((a,b)=>time(b.at)-time(a.at));
 const previous=points.find(p=>end-time(p.at)>=60000);
 if(!previous)return {state:(points.length?'waiting':'baseline') as PlaybackState,latest,stale};
 const elapsedMs=end-time(previous.at),delta=latest.count-previous.count;
 // A correction/reset is not negative traffic. Wait for the next stable pair.
 if(delta<0||points.some(p=>time(p.at)>time(previous.at)&&p.count>latest.count))return {state:'counter-reset' as PlaybackState,latest,previous,elapsedMs,stale};
 return {state:'measured' as PlaybackState,latest,previous,elapsedMs,delta,perHour:delta*3600000/elapsedMs,stale};
}
