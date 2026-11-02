const assert=require('node:assert/strict'),{registerFollowerPagination}=require('../desktop/douyin-follower-pagination.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{
 let handler,clock=100000,refused=false;const win={webContents:{}},alive=new Set([7,8,9,10,11]),positions=new Map(),seenReads=[],operations=[];
 const account=id=>({id,platform:'douyin',connectorSessionId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',nativeAccountKey:'qa-'+id});
 const reader=async({webContentsId,pagination})=>{
  operations.push(pagination.action);
  if(pagination.action==='resume'){if(refused)throw Error('QA official verification required');positions.set(webContentsId,pagination.expectedTop);}
  if(pagination.action==='reset')positions.set(webContentsId,0);
  if(pagination.action==='advance')positions.set(webContentsId,Math.min(900,positions.get(webContentsId)+70));
  const top=positions.get(webContentsId);if(pagination.action==='read')seenReads.push([webContentsId,top]);
  return {ownerUid:'101',followers:pagination.action==='read'?[{uid:String(webContentsId+200)}]:[],page:{top,height:1000,view:100,end:false,empty:false,loadedCount:1}};
 };
 reader.isAlive=id=>alive.has(id);
 const api=registerFollowerPagination({ipcMain:{handle:(_name,fn)=>{handler=fn;}},getWindow:()=>win,authenticate:async(_token,id)=>({userId:'qa-owner',account:account(id)}),read:reader,now:()=>clock,cacheFor:()=>({merge(){}}),project:r=>({platformId:r.uid}),failure:e=>e.message});
 const call=(id,guest,command,cursor)=>{clock+=2000;return handler({sender:win.webContents},{accessToken:'qa-token',accountId:id,webContentsId:guest,command,...(cursor?{cursor}:{})});};
 try{
  const a=await call('a',7,'start');await call('a',7,'next',a.cursor);eq(positions.get(7),70);await call('a',7,'pause',a.cursor);
  clock+=31*60000;eq(api.state(JSON.stringify(['qa-owner','a',account('a').connectorSessionId,'qa-a'])).status,'paused');
  const b=await call('b',8,'start');await call('b',8,'pause',b.cursor);
  eq((await call('a',7,'resume',a.cursor)).loaded,1);await call('a',7,'next',a.cursor);eq(seenReads.at(-1),[7,70]);
  await call('a',7,'pause',a.cursor);const retained=positions.get(7);positions.set(7,0);refused=true;
  eq((await call('a',7,'resume',a.cursor)).status,'paused');eq(positions.get(7),0);eq(operations.filter(value=>value==='reset').length,2);
  refused=false;eq((await call('a',7,'resume',a.cursor)).loaded,1);eq(positions.get(7),retained);await call('a',7,'next',a.cursor);eq(seenReads.at(-1),[7,retained]);
  eq(!!(await call('b',8,'resume',a.cursor)).error,true);eq(positions.get(8),0);
  for(const [id,guest]of [['c',9],['d',10]]){const r=await call(id,guest,'start');await call(id,guest,'pause',r.cursor);}
  eq((await call('e',11,'start')).error.includes('上限'),true);eq(positions.has(11),false);
  alive.delete(7);eq((await call('e',11,'start')).status,'running');eq(!!(await call('a',7,'resume',a.cursor)).error,true);
  // Completed local writes count toward the native remaining deadline, but
  // no call can cause an advance before the previous trigger + 1500 ms.
  let timedHandler,tick=0;const scrolls=[],timedReads=[];
  const timed=registerFollowerPagination({ipcMain:{handle:(_name,fn)=>{timedHandler=fn;}},getWindow:()=>win,authenticate:async()=>({userId:'qa-owner',account:account('timed')}),read:async({pagination})=>{
   if(pagination.action==='read')timedReads.push(tick);
   if(pagination.action==='advance')scrolls.push(tick);
   return{ownerUid:'101',followers:pagination.action==='read'?[{uid:'999'}]:[],page:{top:0,height:1000,view:100,end:false,empty:false}};
  },now:()=>tick,cacheFor:()=>({merge(){tick+=500;}}),project:r=>({platformId:r.uid}),failure:e=>e.message});
  try{
   const timedCall=(command,cursor)=>timedHandler({sender:win.webContents},{accessToken:'qa-token',accountId:'timed',webContentsId:11,command,...(cursor?{cursor}:{})});
   let r=await timedCall('start');eq(r.retryAfterMs,1000);eq(tick,500);await timedCall('next',r.cursor);eq(timedReads.length,0);
   tick+=r.retryAfterMs;r=await timedCall('next',r.cursor);eq(scrolls.length,1);eq(r.retryAfterMs,1500);
   await timedCall('next',r.cursor);eq(scrolls.length,1);tick+=1499;await timedCall('next',r.cursor);eq(scrolls.length,1);
   tick++;r=await timedCall('next',r.cursor);eq(scrolls.length,2);eq(scrolls[1]-scrolls[0]>=1500,true);
  }finally{timed.close();}
  console.log(JSON.stringify({followerCheckpointChecks:checks,idlePausedGuestRetained:true,samePositionAfterOtherAccount:true,explicitResumeRestoresExactPosition:true,verificationRetainsCursor:true,remainingDeadlineNotDoubleWait:true,minimumScrollGapMs:1500,crossAccountCursorRejected:true,fourLiveGuestCapacity:true,destroyedGuestReclaimed:true,realPlatformRequests:0,realProfileTouched:false}));
 }finally{api.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
