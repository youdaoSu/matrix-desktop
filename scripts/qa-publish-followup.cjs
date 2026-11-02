// Main-process journal/intent boundaries; all requests are inert objects.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {registerPublishFollowup}=require('../desktop/publish-followup.cjs');
const {createJournal}=require('../desktop/page-actions.cjs');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
function fixture(){
 const owner='qa-owner',account={id:randomUUID(),platform:'bilibili',connectorSessionId:randomUUID(),nativeAccountKey:'12345',nickname:'QA改名后的本人'},parent={id:randomUUID(),ownerId:owner,kind:'publish',platform:'bilibili',accountId:account.id,sessionId:account.connectorSessionId,nativeAccountKey:'12345',taskId:randomUUID(),attemptId:randomUUID(),status:'confirmed',createdAt:new Date().toISOString(),evidence:{workId:'BV1qa0000001',workUrl:'https://www.bilibili.com/video/BV1qa0000001',workReferenceSource:'official_title_link'}};
 const stored=new Map([[parent.id,structuredClone(parent)]]),calls=[],handlers={},history=[];let authOwner=owner,failWrite=()=>false,requestHook=async()=>{},mode='success',closed=0,createCount=0,pinned=false;
 const journal={find:(who,id)=>{const value=stored.get(id);return value?.ownerId===who?structuredClone(value):undefined;},write:record=>{if(failWrite(record))throw Error('QA write full');stored.set(record.id,structuredClone(record));history.push(structuredClone(record));}};
 const createTransport=async({assertCurrent,onDispatch,workId})=>{eq(workId,parent.evidence.workId);createCount++;return{close:()=>closed++,request:async(method,route,body)=>{
  await assertCurrent();await requestHook({method,route,body});onDispatch({method,route});calls.push({method,route,body});
  if(route.endsWith('/nav'))return{code:0,data:{isLogin:true,mid:12345}};
  if(route.endsWith('/view'))return{code:0,data:{bvid:'BV1qa0000001',aid:24680,owner:{mid:12345}}};
  if(route.endsWith('/add')){eq(journal.find(owner,'followup-'+parent.id).checkpoint,'followup_request_started');if(mode==='lost-add')throw Error('QA private Cookie=do-not-relay');if(mode==='denied')return{code:-403};return{code:0,data:{rpid_str:'998877',...(mode==='needs-detail'||mode==='lost-detail'?{}:{reply:{rpid_str:'998877',oid:24680,type:1,mid:'12345',member:{mid:'12345'},root:0,parent:0,content:{message:'QA追评，未发送'}}})}};}
  if(route.endsWith('/detail')){if(mode==='lost-detail')throw Error('QA private response lost');if(mode==='deleted')return{code:12006};return{code:0,data:{root:{rpid_str:'998877',oid:24680,type:1,mid:'12345',member:{mid:'12345'},root:0,parent:0,...(mode==='pending-state'||mode==='pending-state-top-flag'?{state:17}:{}),...(mode==='pending-state-top-flag'?{reply_control:{is_up_top:true}}:{}),content:{message:'QA追评，未发送'}}}};}
  if(route==='/x/v2/reply')return{code:0,data:{top:{upper:pinned?{rpid_str:'998877',oid:24680,type:1,mid:'12345',member:{mid:'12345'},root:0,parent:0,content:{message:'QA追评，未发送'}}:null}}};
  if(route.endsWith('/top')){eq(journal.find(owner,'followup-'+parent.id).checkpoint,body.action==='0'?'followup_management_started':'followup_pin_started');if(mode!=='pin-denied')pinned=body.action==='1';return{code:mode==='pin-denied'?12029:0};}
  if(route.endsWith('/del')){eq(journal.find(owner,'followup-'+parent.id).checkpoint,'followup_management_started');if(mode==='lost-delete')throw Error('QA deletion result lost');mode='deleted';return{code:0};}
 }};};
 registerPublishFollowup({ipcMain:{handle:(name,handler)=>handlers[name]=handler},getWindow:()=>({webContents:{id:7}}),authenticate:async()=>({userId:authOwner,account:{...account}}),session:{fromPartition:name=>{eq(name,'persist:matrix-bilibili-'+account.connectorSessionId);return{};}},journal,createTransport});
 const input={accountId:account.id,accessToken:'qa-only',receiptId:parent.id,requestId:randomUUID(),comment:'QA追评，未发送',pin:true};
 return{account,parent,input,stored,calls,history,journal,get closed(){return closed;},get creates(){return createCount;},set owner(value){authOwner=value;},set mode(value){mode=value;},set failWrite(value){failWrite=value;},set hook(value){requestHook=value;},call:(changes={},event={sender:{id:7}})=>handlers['matrix:publish-followup'](event,{...input,...changes})};
}
(async()=>{
 let f=fixture(),r=await f.call();eq(r.receipt.status,'confirmed');eq(r.receipt.commentId,'998877');eq(r.receipt.pinResult.status,'confirmed');eq(r.receipt.followupOf,f.parent.id);eq(r.receipt.taskId,f.parent.taskId);eq(r.receipt.attemptId,f.parent.attemptId);eq(r.receipt.ownerId,undefined);eq(r.receipt.nativeAccountKey,undefined);eq(f.closed,1);
 const before=f.calls.length;await f.call();await f.call({requestId:randomUUID()});eq(f.calls.length,before);eq(f.creates,1);
 const beforeVerify=f.calls.filter(call=>call.method==='POST').length;r=await f.call({operation:'verify'});eq(r.receipt.pinResult.status,'confirmed');eq(f.calls.filter(call=>call.method==='POST').length,beforeVerify);
 for(const change of [x=>x.owner='other-owner',x=>x.account.nativeAccountKey='54321',x=>x.account.connectorSessionId=randomUUID(),x=>x.parent.status='unknown',x=>x.parent.accountId=randomUUID(),x=>x.parent.evidence.workUrl='https://evil.invalid/video/BV1qa0000001']){
  f=fixture();change(f);if(f.parent)f.stored.set(f.parent.id,structuredClone(f.parent));r=await f.call();assert.ok(r.error);checks++;eq(f.calls.length,0);
 }
 f=fixture();delete f.parent.evidence;f.stored.set(f.parent.id,structuredClone(f.parent));r=await f.call();eq(r.pending,true);eq(f.creates,0);
 f=fixture();r=await f.call({}, {sender:{id:99}});assert.ok(r.error);checks++;eq(f.creates,0);
 f=fixture();f.failWrite=()=>true;r=await f.call();eq(r.receipt.status,'failed');eq(r.receipt.clicked,false);eq(f.calls.length,0);eq(f.creates,0);
 f=fixture();f.mode='lost-add';r=await f.call();eq(r.receipt.status,'unknown');eq(r.receipt.retryable,false);eq(r.receipt.clicked,true);eq(r.error.includes('do-not-relay'),false);const addCount=f.calls.filter(c=>c.route.endsWith('/add')).length;await f.call({requestId:randomUUID()});eq(f.calls.filter(c=>c.route.endsWith('/add')).length,addCount);
 // A failed READ after an uncertain POST cannot turn the row into retryable.
 f.hook=async()=>{throw Error('QA private read failure');};r=await f.call({operation:'verify'});eq(r.receipt.status,'unknown');eq(r.receipt.clicked,true);eq(r.receipt.retryable,false);
 f=fixture();f.mode='lost-detail';r=await f.call();eq(r.receipt.status,'unknown');eq(r.receipt.commentId,'998877');eq(f.journal.find('qa-owner','followup-'+f.parent.id).commentId,'998877');f.mode='success';const posted=f.calls.filter(c=>c.method==='POST').length;r=await f.call({operation:'verify'});eq(r.receipt.status,'confirmed');eq(f.calls.filter(c=>c.method==='POST').length,posted);
 f=fixture();f.mode='pin-denied';r=await f.call();eq(r.receipt.status,'confirmed');eq(r.receipt.pinResult.status,'failed');const originalAdds=f.calls.filter(c=>c.route.endsWith('/add')).length;f.mode='success';const pinRequest=randomUUID();r=await f.call({operation:'pin',requestId:pinRequest});eq(r.receipt.pinResult.status,'confirmed');eq(f.calls.filter(c=>c.route.endsWith('/add')).length,originalAdds);const tops=f.calls.filter(c=>c.route.endsWith('/top')).length;await f.call({operation:'pin',requestId:pinRequest});eq(f.calls.filter(c=>c.route.endsWith('/top')).length,tops);
 f=fixture();f.mode='denied';r=await f.call();eq(r.receipt.status,'failed');eq(r.receipt.retryable,true);f.mode='success';r=await f.call({requestId:randomUUID()});eq(r.receipt.status,'confirmed');eq(f.calls.filter(c=>c.route.endsWith('/add')).length,2);
 f=fixture();f.hook=async({route})=>{if(route.endsWith('/view'))f.account.nativeAccountKey='changed-before-send';};r=await f.call();eq(r.receipt.status,'failed');eq(r.receipt.clicked,false);eq(f.calls.some(c=>c.method==='POST'),false);
 f=fixture();let release;f.hook=({route})=>route.endsWith('/nav')?new Promise(resolve=>release=resolve):Promise.resolve();const first=f.call();for(let i=0;i<30&&!release;i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(release);checks++;assert.match((await f.call({requestId:randomUUID()})).error,/正在处理/);checks++;assert.match((await f.call({requestId:randomUUID()})).error,/正在处理/);checks++;release();await first;eq(f.calls.filter(c=>c.route.endsWith('/add')).length,1);
 // An explicit pending-visibility pin keeps the original journal and ID;
 // verify never writes, the intent stays idempotent, and disk failure blocks it.
 {const pending=fixture();await pending.call({pin:false});pending.mode='pending-state';const before=pending.calls.filter(c=>c.method==='POST').length;
  const observed=await pending.call({operation:'verify'});eq(observed.receipt.status,'confirmed');eq(observed.receipt.commentId,'998877');eq(observed.receipt.pinResult,undefined);eq(observed.receipt.message.includes('官方评论状态 17'),true);eq(pending.calls.filter(c=>c.method==='POST').length,before);
  const request={operation:'pin',requestId:randomUUID()},pinned=await pending.call(request);eq(pinned.receipt.commentId,'998877');eq(pinned.receipt.pinResult.status,'confirmed');eq(pending.calls.filter(c=>c.method==='POST').length,before+1);
  await pending.call(request);eq(pending.calls.filter(c=>c.method==='POST').length,before+1);eq(pending.calls.filter(c=>c.route.endsWith('/add')).length,1);
 }
 {const pending=fixture();await pending.call({pin:false});pending.mode='pending-state';pending.failWrite=record=>record.checkpoint==='followup_pin_started';await pending.call({operation:'pin',requestId:randomUUID()});eq(pending.calls.filter(c=>c.route.endsWith('/top')).length,0);}
 {const pending=fixture();await pending.call();pending.mode='pending-state-top-flag';const before=pending.calls.filter(c=>c.method==='POST').length;
  const observed=await pending.call({operation:'verify'});eq(observed.receipt.status,'confirmed');eq(observed.receipt.commentId,'998877');eq(observed.receipt.pinResult.status,'confirmed');eq(observed.receipt.message.includes('官方评论状态 17'),true);eq(pending.calls.filter(c=>c.method==='POST').length,before);
 }
 // Management binds the confirmation to both original ID and original text.
 const intent=operation=>({operation,requestId:randomUUID(),expectedCommentId:'998877',expectedComment:'QA追评，未发送'});
 f=fixture();await f.call();let posts=f.calls.filter(c=>c.method==='POST').length;
 r=await f.call({...intent('delete'),expectedCommentId:'8899'});assert.match(r.error,/原评论ID/);checks++;eq(f.calls.filter(c=>c.method==='POST').length,posts);
 r=await f.call({...intent('delete'),expectedComment:'changed'});assert.ok(r.error);checks++;eq(f.calls.filter(c=>c.method==='POST').length,posts);
 r=await f.call(intent('unpin'));eq(r.receipt.status,'confirmed');eq(r.receipt.pinResult.status,'cancelled');eq(r.receipt.commentManagement.status,'confirmed');eq(f.calls.at(-2).body.action,'0');
 posts=f.calls.filter(c=>c.method==='POST').length;await f.call(intent('unpin'));eq(f.calls.filter(c=>c.method==='POST').length,posts);
 r=await f.call({operation:'verify'});eq(r.receipt.pinResult.status,'cancelled');eq(f.calls.filter(c=>c.method==='POST').length,posts);
 r=await f.call(intent('delete'));eq(r.receipt.status,'confirmed');eq(r.receipt.commentDeleted,true);eq(r.receipt.commentManagement.operation,'delete');
 posts=f.calls.filter(c=>c.method==='POST').length;for(const operation of ['start','pin','unpin','delete','verify'])await f.call(intent(operation));eq(f.calls.filter(c=>c.method==='POST').length,posts);
 f=fixture();await f.call();f.mode='deleted';posts=f.calls.filter(c=>c.method==='POST').length;r=await f.call(intent('delete'));eq(r.receipt.commentManagement.status,'failed');eq(r.receipt.commentDeleted,undefined);eq(f.calls.filter(c=>c.method==='POST').length,posts);
 f=fixture();await f.call();f.mode='lost-delete';r=await f.call(intent('delete'));eq(r.receipt.status,'confirmed');eq(r.receipt.commentManagement.status,'unknown');posts=f.calls.filter(c=>c.method==='POST').length;
 for(const operation of ['start','pin','unpin','delete']){r=await f.call(intent(operation));eq(r.pending,true);}
 r=await f.call({operation:'verify'});eq(r.receipt.commentManagement.status,'unknown');eq(f.calls.filter(c=>c.method==='POST').length,posts);
 // Restart-style reuse of the durable unknown marker cannot enable another POST.
 f.journal.write({...f.journal.find('qa-owner','followup-'+f.parent.id),requestId:'persisted-unknown-request'});r=await f.call(intent('delete'));eq(r.pending,true);eq(f.calls.filter(c=>c.method==='POST').length,posts);
 f=fixture();await f.call();f.failWrite=record=>record.checkpoint==='followup_management_started';posts=f.calls.filter(c=>c.method==='POST').length;r=await f.call(intent('delete'));eq(f.calls.filter(c=>c.method==='POST').length,posts);eq(r.receipt.commentDeleted,undefined);
 // Durable lookup survives the UI's200-item list cap and is owner-scoped.
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-followup-journal-qa-')),actual=createJournal(directory),at='2020-01-01T00:00:00.000Z';
 actual.write({id:'old-followup',ownerId:'qa-owner',createdAt:at,status:'confirmed',commentId:'998877'});for(let i=0;i<205;i++)actual.write({id:'new-'+i,ownerId:'qa-owner',createdAt:new Date(Date.parse(at)+1000+i).toISOString(),status:'confirmed'});
 eq(actual.list('qa-owner').length,200);eq(actual.list('qa-owner').some(row=>row.id==='old-followup'),false);eq(actual.find('qa-owner','old-followup').commentId,'998877');eq(actual.find('another-owner','old-followup'),undefined);
 console.log(JSON.stringify({publishFollowupBoundaryChecks:checks,writeAheadAndDurableDedup:true,unknownAndReadFailureNeverResend:true,independentPinAndPerIntentDedup:true,concurrentRequestDoesNotUnlockAnother:true,preDispatchIdentityFailureKnownUnsent:true,noRealAccountsOrRequests:true}));
})().catch(error=>{console.error(error);process.exitCode=1;});
