// Real native collector/cache with synthetic responses, no platform access.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {SOURCE,INTERVAL,LIMIT,playbackFields,mergePlayback}=require('../desktop/work-playback.cjs');
const {createInteractionCache}=require('../desktop/douyin-interaction-cache.cjs');
const {initial,readPage}=require('../desktop/douyin-interactions.cjs');
const {playbackVelocity}=require('./qa-load-typescript.cjs').loadTs('shared/playback-velocity.ts');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},base=Date.parse('2026-10-30T00:00:00Z'),at=n=>new Date(base+n).toISOString(),own='9007199254740991',id='9007199254740992';
const raw=(n,ms)=>({aweme_id:id,author:{uid:own},metrics:{play_count:n},metrics_observed_at:at(ms)});
const accountKey='qa-public-handle';
const work=(n,ms)=>({platformId:id,title:'QA exact playback',ownerUid:own,playbackAccountKey:accountKey,...playbackFields(raw(n,ms),'https://creator.douyin.com/',own,base+ms)});
(async()=>{
 for(const n of [undefined,null,'100',-1,0.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1])eq(playbackFields(raw(n,0),'https://creator.douyin.com/',own,base),{});
 eq(playbackFields(raw(0,0),'https://www.douyin.com/',own,base),{});eq(playbackFields(raw(2,0),'https://creator.douyin.com/','other',base),{});eq(playbackFields(raw(2,60000),'https://creator.douyin.com/',own,base),{});
 let w=mergePlayback(undefined,work(0,0));eq(playbackVelocity(w,accountKey,base).state,'baseline');eq(playbackVelocity(w,'other',base).state,'missing');
 eq(playbackVelocity(w,own,base).state,'missing');eq(playbackVelocity({...w,ownerUid:undefined},accountKey,base).state,'missing');
 w=mergePlayback(w,work(50,30000));eq(w.playbackHistory.length,1);eq(playbackVelocity(w,accountKey,base+30000).state,'waiting');
 w=mergePlayback(w,work(60,60000));eq(playbackVelocity(w,accountKey,base+60000).perHour,3600);
 const before=structuredClone(w);w=mergePlayback(w,work(999,0));eq(w,before);w=mergePlayback(w,work(999,60000));eq(w,before);
 w=mergePlayback(w,{platformId:id,title:'New title'});eq(w.playCount,60);eq(w.playbackHistory.length,1);
 w=mergePlayback(w,work(120,INTERVAL));eq(w.playbackHistory.length,2);eq(playbackVelocity(w,accountKey,base+INTERVAL).delta,120);
 w=mergePlayback(w,work(100,2*INTERVAL));eq(playbackVelocity(w,accountKey,base+2*INTERVAL).state,'counter-reset');
 w=mergePlayback(w,work(100,3*INTERVAL));eq(playbackVelocity(w,accountKey,base+3*INTERVAL).perHour,0);
 for(let i=4;i<100;i++)w=mergePlayback(w,work(i*100,i*INTERVAL));eq(w.playbackHistory.length,LIMIT);eq(w.playbackHistory[0].at,at(84*INTERVAL));
 eq(playbackVelocity(w,accountKey,base+100*INTERVAL+3600000).stale,true);
 const rebound=mergePlayback(w,{platformId:id,ownerUid:'new-owner'});eq(rebound.playCount,undefined);eq(rebound.playbackHistory,undefined);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-playback-qa-')),key=crypto.randomBytes(32);
 const protect=s=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),body=Buffer.concat([c.update(s,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),body]);};
 const unprotect=b=>{const d=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8');};
 try{
  const options={directory:dir,scope:'qa-owner/account/session/comments',protect,unprotect};let cache=createInteractionCache(options);
  const page=n=>({kind:'comments',records:[],works:[work(n*20,n*INTERVAL)],complete:false,capturedAt:at(n*INTERVAL)});
  cache.merge(page(0));const merged=cache.merge(page(1));eq(merged.works[0].playbackHistory.length,2);
  cache=createInteractionCache(options);eq(cache.findWork(id).playbackHistory,merged.works[0].playbackHistory);eq(playbackVelocity(cache.findWork(id),accountKey,base+INTERVAL).perHour,240);
  eq(createInteractionCache({...options,scope:'other-owner/account/session/comments'}).get().works.length,0);
  const client={ownUid:own,source:'https://creator.douyin.com/',readWeb:async()=>({aweme_list:[raw(100,0)],has_more:false,max_cursor:'0'})};
  const result=await readPage(client,initial('comments'),{now:()=>base});eq(result.works[0].playCount,100);eq(result.works[0].playObservedAt,at(0));eq(result.works[0].playCountSource,SOURCE);
  eq((await readPage(client,initial('comments'),{now:()=>base+60000})).works[0].playObservedAt,at(0));
  eq((await readPage({...client,source:'https://www.douyin.com/'},initial('comments'),{now:()=>base})).works[0].playCount,undefined);
 }finally{for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);key.fill(0);}
 console.log(JSON.stringify({playbackChecks:checks,actualCollectorAndEncryptedCache:true,sourceOwnerAndTimestampRequired:true,boundedHistory:true,missingNotZero:true,realPlatformActions:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
