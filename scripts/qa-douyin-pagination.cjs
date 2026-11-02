const assert=require('node:assert/strict');
const {registerFollowerPagination}=require('../desktop/douyin-follower-pagination.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{
 let handler,clock=100000,owner='qa-owner',mode='normal',writes=0,advances=0,top=0,savedRows=[];
 const account={id:'qa-account',platform:'douyin',connectorSessionId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',nativeAccountKey:'qa-handle'},win={webContents:{}},input={accessToken:'qa-token',accountId:account.id,webContentsId:7},event={sender:win.webContents};
 const native=registerFollowerPagination({ipcMain:{handle:(_name,value)=>{handler=value;}},getWindow:()=>win,authenticate:async()=>({userId:owner,account:{...account}}),now:()=>clock,project:user=>({platformId:user.uid,platformUserId:user.uid,author:'QA',content:''}),failure:error=>error.message,cacheFor:()=>({merge(page){if(mode==='disk-failure')throw Error('缓存保存失败');writes++;savedRows.push(...page.records);}}),read:async({pagination,assertCurrent})=>{
  await assertCurrent();if(pagination.action==='reset'){top=0;return{ownerUid:'101',followers:[],page:{top:0,height:mode==='all-seen'?3000:300,view:100}};}
  if(pagination.action==='resume')return{ownerUid:'101',followers:[],page:{top,height:300,view:100}};
  if(mode==='all-seen'){
   if(pagination.action==='read')return{ownerUid:'101',followers:Array.from({length:100},(_v,i)=>({uid:String(201+i)})),page:{top,height:3000,view:100,end:top===2900,empty:false,loadedCount:100,fullDom:false}};
   advances++;top=Math.min(2900,top+70);return{ownerUid:'101',followers:[],page:{top,height:3000,view:100}};
  }
  if(pagination.action==='read'){if(mode==='owner-change')owner='other-owner';return{ownerUid:'101',followers:[{uid:'201'}],page:{top,height:300,view:100,end:false,empty:false,loadedCount:1}};}
  advances++;top=200;return{ownerUid:'101',followers:[],page:{top,height:300,view:100}};
 }});
 const call=async(command,cursor,extra={})=>{clock+=2000;return handler(event,{...input,command,...(cursor?{cursor}:{}),...extra});};
 try{
  eq(!!(await handler({sender:{}},{...input,command:'start'})).error,true);eq(writes,0);
  for(const extra of [{url:'https://evil.invalid'},{uid:'201'},{webContentsId:'7'}])eq(!!(await call('start',undefined,extra)).error,true);
  let r=await call('start');eq(r.loaded,0);const cursor=r.cursor;mode='disk-failure';r=await call('next',cursor);eq(r.status,'paused');eq(r.loaded,0);eq(advances,0);eq(savedRows.length,0);
  mode='normal';eq((await call('resume',cursor)).status,'running');r=await call('next',cursor);eq(r.loaded,1);eq(savedRows.length,1);eq(advances,1);
  r=await call('start');const before=writes;mode='owner-change';r=await call('next',r.cursor);eq(!!r.error,true);eq(r.loaded,undefined);eq(writes,before);eq(savedRows.length,1);
  owner='qa-owner';mode='normal';r=await call('start');const idleCursor=r.cursor;await call('pause',idleCursor);clock+=31*60000;eq((await call('resume',idleCursor)).cursor,idleCursor);eq((await call('next',idleCursor)).loaded,1);
  eq(!!(await call('next','aaaaaaaa-bbbb-cccc-dddd-ffffffffffff')).error,true);
  mode='all-seen';r=await call('start');const fullCursor=r.cursor;for(let n=0;n<100&&r.status==='running';n++)r=await call('next',fullCursor);eq(r.error,undefined);eq(r.complete,true);eq(r.loaded,100);eq(top,2900);
  console.log(JSON.stringify({paginationGuardChecks:checks,failedWriteRolledBack:true,saveBeforeScroll:true,lateOwnerResultDiscardedWithoutWrites:true,scopeCheckedIdlePauseRetained:true,realPlatformRequests:0,realUserDataTouched:false}));
 }finally{native.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
