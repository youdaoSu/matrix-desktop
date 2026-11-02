// Synthetic bounded archives and transport gates only; no profile or network.
const assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const {createMessageIndex}=require('../desktop/douyin-inbox-index.cjs'),{createEngine}=require('../desktop/douyin-inbox-engine.cjs');
let checks=0;const eq=(actual,wanted)=>{assert.deepEqual(actual,wanted);checks++;},pause=()=>new Promise(resolve=>setImmediate(resolve));
async function until(test){for(let i=0;i<500;i++){if(test())return;await pause();}throw Error('Inbox index fixture deadline');}
function sample(){
 const threads={},messages={};
 for(let i=0;i<500;i++){
  const peer=String(200+i),id='0:1:100:'+peer;threads[id]={id,shortId:String(1000+i),type:1,peer,name:'QA联系人'+i,nameSource:'alias',unread:i===0?12:0,latestIndex:'100',messageRevision:1,history:{cursor:'0',done:true,pages:1}};
  for(let j=100;j>0;j--){const messageId=String(100000+i*100+j);messages[id+'/'+messageId]={id:messageId,threadId:id,shortId:String(1000+i),type:1,sender:peer,senderSecUid:'MS4wQa'+peer,messageType:7,rawContent:JSON.stringify({text:'QA隔离消息'+j}),text:'QA隔离消息'+j,status:0,index:String(j),version:'1',at:'2026-10-23T00:00:00.000Z'};}
 }
 return {revision:0,threads,messages,people:{'200/MS4wOther':{uid:'200',secUid:'MS4wOther',name:'QA不匹配资料'},'200/MS4wQa200':{uid:'200',secUid:'MS4wQa200',name:'QA本人资料名',avatarUrl:'https://p1.byteimg.com/qa.jpg'}},init:{done:true},strangers:{done:true},frontier:{}};
}
async function resumeCase({explicit=true,closeEarly=false}={}){
 let state={revision:0,threads:{},messages:{},init:{cursor:'0',done:false},strangers:{cursor:'0',done:false},frontier:{}},release,initializations=0,strangers=0;
 const store={get:()=>state,commit(change){const next=structuredClone(state);change(next);next.revision++;state=next;}},engine=createEngine({store,now:()=>100000,delay:async()=>{},assertCurrent:async()=>{},transport:{ownUid:'100',close(){},async connect(){return()=>{};},async read(kind){if(kind==='init'&&++initializations===1)await new Promise(resolve=>release=resolve);if(kind==='strangers'){strangers++;throw Error('QA stranger HTTP403');}return{messages:[],conversations:[],hasMore:false,cursor:'0'};}}});
 try{
  engine.start();await until(()=>release);if(explicit){engine.resume();engine.resume();}else engine.poll();if(closeEarly)engine.close();release();await until(()=>!engine.status().busy);await pause();await until(()=>!engine.status().busy);
  eq(initializations,explicit&&!closeEarly?2:1);eq(strangers,closeEarly?0:explicit?2:1);eq(engine.status().unread,0);if(!closeEarly)eq(engine.status().partialFailure,true);
 }finally{engine.close();}
}
(async()=>{
 let state=sample(),enumerations=0;state.messages=new Proxy(state.messages,{ownKeys(target){enumerations++;return Reflect.ownKeys(target);}});
 const index=createMessageIndex(),selected='0:1:100:200';
 eq(index.get(state).all.length,50000);eq(index.rows(state,selected).length,100);eq(index.rows(state,selected)[0].index,'1');eq(index.rows(state,selected)[99].index,'100');
 for(let i=0;i<20;i++)index.rows(state,selected);eq(enumerations,1);eq(state.threads[selected].unread,12);
 const sameRevision={...state};eq(index.get(sameRevision).state,sameRevision);eq(enumerations,1);const cursorOnly={...state,revision:1,frontier:{fixture:[]}};eq(index.get(cursorOnly).all,index.get(state).all);eq(enumerations,1);index.clear();index.get(sameRevision);eq(enumerations,2);
 const isolated=createMessageIndex();eq(isolated.get({revision:0,threads:{},messages:{},people:{}}).all.length,0);eq(index.get(sameRevision).all.length,50000);
 const largeIds=createMessageIndex(),numericState={revision:0,threads:{},messages:{b:{threadId:'qa',id:'9007199254740994',index:'9007199254740993'},a:{threadId:'qa',id:'9007199254740993',index:'9007199254740993'},c:{threadId:'qa',id:'9007199254740995',index:'9007199254740992'}}};eq(largeIds.rows(numericState,'qa').map(row=>row.id),['9007199254740995','9007199254740993','9007199254740994']);eq(largeIds.get(numericState).threads.get('qa').last.id,'9007199254740994');
 const store={get:()=>state},engine=createEngine({store,assertCurrent:async()=>{},transport:{ownUid:'100',close(){}}});
 try{
  const beforeScans=enumerations,started=performance.now();const listing=engine.threads();eq(listing.length,500);eq(listing.find(row=>row.id===selected).count,100);eq(listing.find(row=>row.id===selected).lastMessage,'QA隔离消息100');
  for(let i=0;i<20;i++){const page=engine.messages(selected);assert.equal(page.messages.length,50);assert.equal(page.messages[0].index,'51');assert.equal(page.messages[49].index,'100');}
  const elapsed=performance.now()-started;eq(enumerations-beforeScans,1);checks+=60;
  for(let i=0;i<5;i++)eq(engine.status().messageCount,50000);eq(enumerations-beforeScans,1);
  let page=engine.messages(selected);eq(page.messages[0].senderName,'QA本人资料名');eq(page.messages[0].senderAvatarUrl,'https://p1.byteimg.com/qa.jpg');eq(page.before,'100051');eq(page.messages.some(row=>Object.hasOwn(row,'rawContent')||Object.hasOwn(row,'senderSecUid')),false);
  const older=engine.messages(selected,page.before);eq(older.messages.length,50);eq(older.messages[0].index,'1');eq(older.messages[49].index,'50');eq(older.before,undefined);
  assert.throws(()=>engine.messages('0:1:100:9999'),/不属于/);checks++;assert.throws(()=>engine.messages(selected,'wrong-anchor'),/锚点/);checks++;
  const raw=state.messages,withdrawn={...raw[selected+'/100100'],status:3};state={...state,revision:1,messages:{...raw,[selected+'/100100']:withdrawn},people:{'200/MS4wQa200':{uid:'200',secUid:'MS4wQa200',name:'QA更新资料名'}}};
  page=engine.messages(selected);eq(page.messages.at(-1).text,'消息已撤回');eq(page.messages[0].senderName,'QA更新资料名');eq(page.messages[0].senderAvatarUrl,undefined);eq(engine.threads().find(row=>row.id===selected).lastMessage,'消息已撤回');eq(state.threads[selected].unread,12);
  // Hidden records remain addressable history anchors, never preview/count rows.
  state={...state,revision:2,messages:{...state.messages,[selected+'/100100']:{...withdrawn,status:2}}};
  eq(engine.threads().find(row=>row.id===selected).count,99);eq(engine.threads().find(row=>row.id===selected).lastMessage,'QA隔离消息99');
  eq(engine.messages(selected).messages.at(-1).id,'100100');eq(engine.messages(selected,'100100').messages.at(-1).id,'100099');eq(engine.status().messageCount,50000);eq(state.threads[selected].unread,12);
  state={...state,revision:3,messages:{...state.messages,[selected+'/100099']:{...state.messages[selected+'/100099'],status:1}}};
  eq(engine.threads().find(row=>row.id===selected).count,98);eq(engine.threads().find(row=>row.id===selected).lastMessage,'QA隔离消息98');
  const hiddenIndex=createMessageIndex(),hiddenBucket=hiddenIndex.get({revision:0,threads:{},messages:{a:{id:'1',threadId:'qa',index:'1',status:1},b:{id:'2',threadId:'qa',index:'2',status:2}}}).threads.get('qa');
  eq(hiddenBucket.visibleCount,0);eq(hiddenBucket.lastVisible,undefined);eq(hiddenBucket.last.id,'2');eq(hiddenBucket.rows.length,2);
  // Real public SDK display boundary: control frames remain durable and usable
  // as old pagination anchors but never displace actual chat summaries/pages.
  const controls={};for(let n=0;n<140;n++){const id=String(200000+n);controls[selected+'/'+id]={...state.messages[selected+'/100098'],id,index:String(1000+n),messageType:n%2?50001:50002,rawContent:'{"text":"QA_NOT_CHAT_COMMAND"}',text:'QA_NOT_CHAT_COMMAND'};}
  const originalBytes=JSON.stringify(state.messages);state={...state,revision:4,messages:{...state.messages,...controls}};
  eq(engine.threads().find(row=>row.id===selected).lastMessage,'QA隔离消息98');eq(engine.threads().find(row=>row.id===selected).count,98);
  const controlsPage=engine.messages(selected);eq(controlsPage.messages.length,50);eq(controlsPage.messages.at(-1).id,'100100');eq(controlsPage.messages.some(m=>m.messageType>=50000),false);eq(controlsPage.before,'100051');
  eq(engine.messages(selected,'200139').messages.length,50);eq(Object.keys(state.messages).length,50140);eq(JSON.stringify(Object.fromEntries(Object.entries(state.messages).filter(([key])=>!Object.hasOwn(controls,key)))),originalBytes);
  console.log(JSON.stringify({inboxReadIndexBenchmark:{messageCount:50000,threads:500,repeatedSelectedThreadReads:20,messageMapEnumerations:1,elapsedMs:Math.round(elapsed*100)/100,syntheticOnly:true,wallTimeNotPlatformLatency:true}}));
 }finally{engine.close();}
 await resumeCase();await resumeCase({explicit:false});await resumeCase({closeEarly:true});
 console.log(JSON.stringify({inboxIndexAndResumeChecks:checks,revisionLocalIndex:true,exactInt64OrderAndPagination:true,senderMetadataInvalidation:true,withdrawnBodiesStillHidden:true,busyExplicitResumeCoalesced:true,automaticDenialNotRetried:true,closeDropsQueuedResume:true,realPlatformRequests:0,readReceipts:0,businessWrites:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});
