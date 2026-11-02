// Synthetic owned-account catalogs only. No real account/profile/network,
// notifications, message bodies, likes, replies or mark-read endpoints.
const assert = require('node:assert/strict');
const { initial, readPage } = require('../desktop/douyin-interactions.cjs');
const { SOURCE } = require('../desktop/douyin-warm-history.cjs');
const { workOrder } = require('../desktop/douyin-work-order.cjs');
let checks = 0;
const eq = (a,b) => { assert.deepEqual(a,b); checks++; };
const own = '9007199254740993', peer = '9007199254740995';
const work = n => String(8000000000000000000n + BigInt(n));
const rawWork = n => ({aweme_id:work(n),desc:'Fixture work '+n,author:{uid:own},create_time:1792512000-n,is_top:n<3,metrics:{comment_count:0}});
const rawComment = (id,workId) => ({cid:String(8100000000000000000n+BigInt(id)),aweme_id:workId,text:'Fixture comment',user:{uid:peer,nickname:'Fixture'},reply_comment_total:0});
const snapshotCursors = state => new Map(state.works.map(w=>[w.id,JSON.stringify([w.cursor,w.rootDone,w.replies,w.seenRoots,w.pagesRead])]));

async function collect({live=true,warm=false,slow=false,changeSelection=false}={}) {
 const calls=[],catalogCalls=[],found=new Map(); let stamp=100000,sequence=0;
 const client={ownUid:own,source:'https://creator.douyin.com/',async readWeb(kind,args){
  calls.push({kind,...args});
  if(kind==='works') {
   const offset=Number(args.cursor),end=Math.min(119,offset+(offset===0?13:12));
   catalogCalls.push(args.cursor);
   // Pinned records may repeat on later pages. Only exact IDs deduplicate.
   const rows=[...(offset?[rawWork(1),rawWork(2)]:[]),...Array.from({length:end-offset},(_,i)=>rawWork(offset+i+1))];
   return {aweme_list:rows,has_more:end<119,max_cursor:String(end)};
  }
  return {comments:[rawComment(++sequence,args.workId)],has_more:true,cursor:String(Number(args.cursor)+1)};
 }};
 if(live)client.readLatest=async id=>{calls.push({kind:'live-head',workId:id});return {comments:[],has_more:true,cursor:'1'};};
 let state=initial('comments'),steps=0,result;
 while(!state.workEnded&&steps<40) {
  const before=structuredClone(state),oldCursors=snapshotCursors(state),oldCalls=calls.length;
  result=await readPage(client,state,{previewFirst:true,now:()=>stamp,priorityWorkId:state.seenWorks.length?state.seenWorks[changeSelection?steps%state.seenWorks.length:0]:undefined,
   findWork:warm?id=>({platformId:id,ownerUid:own,commentCount:0,commentCountSource:SOURCE,readComplete:true,historyCompletedAt:new Date(stamp-1000).toISOString()}):undefined});
  eq(state,before);eq(calls.length,oldCalls+1);
  if(calls.at(-1).kind==='works')for(const w of result.next.works)if(oldCursors.has(w.id))eq(snapshotCursors(result.next).get(w.id),oldCursors.get(w.id));
  for(const w of result.works)found.set(w.platformId,{...found.get(w.platformId),...w});
  state=result.next;steps++;stamp+=slow?20000:5000;
  eq(result.progress.worksCatalogComplete,state.workEnded);
  if(!state.workEnded)eq(result.complete,false);
 }
 eq(state.workEnded,true);eq(state.seenWorks.length,119);eq(found.size,119);eq(catalogCalls,['0','13','25','37','49','61','73','85','97','109']);
 assert(steps<=15,'Catalog must finish within 15 admitted reads including one selected-work priority slot, not after comment completion');checks++;
 eq(result.complete,false);eq(result.progress.worksCatalogComplete,true);
 if(!warm){assert(calls.some(c=>c.kind==='comments'));checks++;assert(state.works.some(w=>w.rootDone===false));checks++;}
 if(live&&!warm){assert(calls.some(c=>c.kind==='live-head'));checks++;}
 eq(found.get(work(1)).pinned,true);eq(found.get(work(119)).publishedAt,workOrder(rawWork(119)).publishedAt);
 // New-work checks resume after the catalog ends. They do not rewind its
 // saved continuation or any in-progress comment/reply cursor.
 if(live&&!warm){const cursors=snapshotCursors(state),oldCursor=state.workCursor;stamp+=61000;result=await readPage(client,{...state,lastWasLive:false},{previewFirst:true,now:()=>stamp});eq(calls.at(-1).kind,'works');eq(calls.at(-1).cursor,'0');eq(result.next.workCursor,oldCursor);for(const [id,value]of cursors)eq(snapshotCursors(result.next).get(id),value);}
 return {steps,works:state.seenWorks.length,historyReads:calls.filter(c=>c.kind==='comments').length,headReads:calls.filter(c=>c.kind==='live-head').length};
}

(async()=>{
 const scenarios=[];
 for(const options of [{},{slow:true,changeSelection:true},{live:false},{warm:true}])scenarios.push(await collect(options));
 // Failed or denied catalog pages cannot advance the original continuation.
 const seed=await readPage({ownUid:own,readWeb:async()=>({aweme_list:[rawWork(1)],has_more:true,max_cursor:'13'})},initial('comments'),{previewFirst:true,now:()=>100000});
 for(const response of [Error('HTTP 403'),{aweme_list:[],has_more:true,max_cursor:'25'},{aweme_list:[rawWork(2)],has_more:true,max_cursor:'13'},{aweme_list:[{...rawWork(2),author:{uid:peer}}],has_more:false,max_cursor:'25'},{aweme_list:[rawWork(1)],has_more:true,max_cursor:'25'}]){
  const state=structuredClone(seed.next),before=structuredClone(state);
  await assert.rejects(()=>readPage({ownUid:own,readWeb:async()=>{if(response instanceof Error)throw response;return response;}},state,{previewFirst:true,now:()=>200000}));checks++;eq(state,before);
 }
 // A catalog turn preserves reply ancestry/cursors and live/history fairness.
 const state={...seed.next,lastWasLive:true,works:[{...seed.next.works[0],cursor:'87',replies:[{id:'400',cursor:'55',loaded:20,livePriority:true}],seenRoots:['400'],pagesRead:8}]},before=structuredClone(state);
 const page=await readPage({ownUid:own,readLatest:async()=>{throw Error('Unexpected head read');},readWeb:async kind=>{eq(kind,'works');return {aweme_list:[rawWork(2)],has_more:false,max_cursor:'25'};}},state,{previewFirst:true,priorityWorkId:work(1),now:()=>300000});
 eq(page.next.works[0],state.works[0]);eq(page.next.lastWasLive,true);eq(state,before);eq(page.next.workEnded,true);eq(page.complete,false);
 // A new publication must be found while the historical catalog is STILL
 // open. One normal dedicated head read preserves every historical cursor.
 let freshReads=0;
 const historical={...structuredClone(state),inventoryAt:100000},historicalBefore=structuredClone(historical);
 const freshClient={ownUid:own,readLatest:async()=>{throw Error('Unexpected selected head');},readInventoryHead:async()=>{freshReads++;return {aweme_list:[rawWork(120)],has_more:true,max_cursor:'13'};},readWeb:async(kind,args)=>{eq(kind,'works');eq(args.cursor,historical.workCursor);return {aweme_list:[rawWork(2)],has_more:false,max_cursor:'25'};}};
 const fresh=await readPage(freshClient,historical,{previewFirst:true,now:()=>200000});
 eq(freshReads,1);eq(fresh.works[0].platformId,work(120));eq(fresh.next.workCursor,historical.workCursor);eq(fresh.next.workEnded,false);eq(fresh.next.works.find(w=>w.id===work(1)),historical.works[0]);eq(historical,historicalBefore);
 const resumed=await readPage(freshClient,fresh.next,{previewFirst:true,now:()=>270000});eq(freshReads,1);eq(resumed.next.workEnded,true);
 const manual=await readPage(freshClient,{...historical,inventoryAt:199999},{previewFirst:true,refreshLatest:true,now:()=>200000});eq(freshReads,2);eq(manual.next.workCursor,historical.workCursor);
 await assert.rejects(()=>readPage({...freshClient,readInventoryHead:async()=>{throw Error('HTTP 403');}},historical,{previewFirst:true,refreshLatest:true,now:()=>200000}),/403/);checks++;eq(historical,historicalBefore);
 // An owner with no works needs one proven end page, not a fabricated total.
 const empty=await readPage({ownUid:own,readWeb:async()=>({aweme_list:[],has_more:false,max_cursor:'0'})},initial('comments'),{previewFirst:true});eq(empty.complete,true);eq(empty.progress.worksCatalogComplete,true);eq(empty.progress.worksFound,0);
 console.log(JSON.stringify({catalogSchedulingChecks:checks,scenarios,full119BeforeHistoryEnd:true,twoCatalogSlotsThenOneCommentSlot:true,periodicHeadCannotResetOpenCatalog:true,pinnedOverlapDeduplicated:true,warmCatalogNotMistakenForRepeatedPage:true,stateOwnerCursorAndFailureGuards:true,realPlatformRequests:0,realUserProfileTouched:false,businessWrites:0,markReadRequests:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});
