const assert=require('node:assert/strict'),{registerPublishResolution}=require('../desktop/publish-resolution.cjs');
function fixture(kind='not_published'){
  const f={handlers:{},writes:[],dialogs:0,dialogResponse:1,auth:true,reads:0,verifyCalls:0,now:Date.now(),account:{id:'qa-account',platform:'douyin',nickname:'Current nickname',connectorSessionId:'fixture-session-001',nativeAccountKey:'own-id'},owner:'qa-owner'};
  f.record={id:'qa-receipt',accountId:f.account.id,platform:'douyin',nickname:'@Old nickname1',kind:'publish',taskId:'original-task',attemptId:'original-attempt',status:'unknown',createdAt:new Date(f.now-5*60000).toISOString(),expectedTitle:'Original title',verification:{state:kind==='identity_rename'?'identity_mismatch':'not_found'}};
  f.health=()=>({state:'normal',accountId:f.account.id,sessionId:f.account.connectorSessionId,nickname:f.account.nickname,nativeAccountKey:f.account.nativeAccountKey});
  registerPublishResolution({ipcMain:{handle:(key,handler)=>f.handlers[key]=handler},getWindow:()=>({webContents:{id:7}}),now:()=>f.now,
    authenticate:async(token,id)=>{if(!f.auth||token!=='qa-only')throw Error('Unauthorized');return{userId:f.owner,account:id?{...f.account}:undefined};},journal:{list:()=>f.missing?[]:[{...f.record}],write:value=>{if(f.diskError)throw Error('Disk full');f.writes.push({...value});f.record={...value};}},
    inspectAccountHealth:async()=>{f.reads++;return f.profileGate?await f.profileGate:f.health();},
    verifyPublishResult:async()=>{f.verifyCalls++;return f.verify?await f.verify():{receipt:{...f.record,verification:{state:'not_found'}}};},
    dialog:{showMessageBox:async(_win,input)=>{f.dialogs++;assert.equal(input.defaultId,0);assert.equal(input.cancelId,0);assert.match(input.detail,/Original title/);if(f.dialogGate)await f.dialogGate;f.afterDialog?.();return{response:f.dialogResponse};}}
  });
  f.call=(extra={},sender=7)=>f.handlers['matrix:resolve-publish-receipt']({sender:{id:sender}},{accessToken:'qa-only',receiptId:f.record.id,kind,...extra});return f;
}
(async()=>{
  let checks=0,f=fixture();let result=await f.call();assert.equal(result.receipt.status,'failed');assert.equal(result.receipt.id,'qa-receipt');assert.equal(result.receipt.taskId,'original-task');assert.equal(result.receipt.attemptId,'original-attempt');assert.equal(result.receipt.resultSource,'user_confirmed_not_published');assert.equal(result.receipt.nickname,'@Old nickname1');assert.equal(f.verifyCalls,0);assert.equal(f.reads,0);assert.equal(f.writes.length,1);checks+=9;
  f=fixture('identity_rename');result=await f.call();assert.equal(result.receipt.status,'unknown');assert.equal(f.record.identityReview.nativeAccountKey,'own-id');assert.equal(f.record.nickname,'@Old nickname1');assert.equal(f.verifyCalls,1);assert.equal(f.writes.length,1);checks+=5;
  for(const mutate of [f=>f.missing=true,f=>f.auth=false,f=>f.record.status='confirmed',f=>f.record.status='failed',f=>f.record.createdAt=new Date(f.now-30000).toISOString(),f=>f.record.sessionId='foreign-session']){f=fixture();mutate(f);assert.ok((await f.call()).error);assert.equal(f.writes.length,0);assert.equal(f.dialogs,0);checks+=3;}
  f=fixture();assert.ok((await f.call({},9)).error);assert.ok((await f.call({receiptId:'foreign'})).error);assert.ok((await f.call({kind:'force_success'})).error);assert.equal(f.writes.length,0);checks+=4;
  for(const state of ['processing','identity_mismatch','login_required','timeout']){f=fixture();f.record.verification={state,message:'Not safely resolved'};assert.ok((await f.call()).error);assert.equal(f.dialogs,0);assert.equal(f.writes.length,0);checks+=3;}
  f=fixture();f.dialogResponse=0;assert.equal((await f.call()).cancelled,true);assert.equal(f.writes.length,0);checks+=2;
  for(const mutate of [f=>f.account.connectorSessionId='changed-session',f=>f.account.nativeAccountKey='changed-id',f=>f.owner='another-owner',f=>f.record.status='confirmed',f=>f.record.attemptId='new-attempt']){f=fixture();f.afterDialog=()=>mutate(f);assert.ok((await f.call()).error);assert.equal(f.writes.length,0);checks+=2;}
  f=fixture('identity_rename');f.health=()=>({state:'normal',accountId:f.account.id,sessionId:f.account.connectorSessionId,nickname:f.account.nickname,nativeAccountKey:'other-id'});assert.ok((await f.call()).error);assert.equal(f.writes.length,0);assert.equal(f.dialogs,0);checks+=3;
  f=fixture();f.record.nativeAccountKey='different';assert.ok((await f.call()).error);assert.equal(f.writes.length,0);checks+=2;
  f=fixture();let release;f.dialogGate=new Promise(resolve=>release=resolve);const pending=f.call();for(let i=0;i<30&&!f.dialogs;i++)await new Promise(resolve=>setImmediate(resolve));assert.ok((await f.call()).error);assert.ok((await f.call()).error);release();assert.equal((await pending).receipt.status,'failed');assert.equal(f.dialogs,1);checks+=4;
  f=fixture();f.diskError=true;assert.ok((await f.call()).error);assert.equal(f.writes.length,0);checks+=2;
  f=fixture();const originalEnd=new Date(f.now-4*60000).toISOString();f.record.completedAt=originalEnd;result=await f.call();assert.equal(result.receipt.completedAt,originalEnd);assert.equal(result.receipt.resolution.at,new Date(f.now).toISOString());assert.notEqual(result.receipt.completedAt,result.receipt.resolution.at);checks+=3;
  f=fixture();result=await f.call();assert.equal(result.receipt.completedAt,undefined);checks++;
  console.log(JSON.stringify({historicalReceiptResolutionChecks:checks,explicitDefaultCancelConfirmation:true,originalIdsAndEvidenceRetained:true,noFakeOfficialFailure:true,lateAccountOrResultChangesBlocked:true,newSubmissions:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
