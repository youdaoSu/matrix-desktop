// Read-only callback fixtures; no real account, upload, click or network.
const assert=require('node:assert/strict');
const {createOfficialResultReader}=require('../desktop/official-publish-result-reader.cjs');
const {observePublishOutcome}=require('../desktop/publish-outcome.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
let platform='douyin',url,home;
const select=value=>{platform=value;url=value==='douyin'?'https://creator.douyin.com/creator-micro/content/manage':'https://creator.xiaohongshu.com/new/note-manager';home=value==='douyin'?'https://creator.douyin.com/creator-micro/home':'https://creator.xiaohongshu.com/new/home';};
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
function fixture(){
 let time=Date.parse('2026-10-30T00:00:00Z'),loadedAt=0,loads=0,reads=0,owners=0;const windows=[];
 const beginning=time,record={kind:'publish',platform,sessionId:'fixture-session',nativeAccountKey:'fixture-own-id',nickname:'Old name',status:'unknown',clicked:true};
 const account={platform,connectorSessionId:'fixture-session',nativeAccountKey:'fixture-own-id'};
 const state={pending:false,identity:'fixture-own-id',resultIdentity:'fixture-own-id',liveUrl:url,never:false};
 const reader=createOfficialResultReader({record,account,now:()=>time,createWindow:kind=>{const local={closed:false};windows.push(local);return{isDestroyed:()=>local.closed,destroy:()=>{local.closed=true;},webContents:{kind,getURL:()=>kind==='owner'?home:state.liveUrl,isDestroyed:()=>local.closed,setAudioMuted(){},setWindowOpenHandler(){},on(){},loadURL:async target=>{eq(target,kind==='owner'?home:url);if(kind==='result'){loads++;loadedAt=time;}}}};},inspectOwner:async guest=>{eq(guest.kind,'owner');owners++;return{authenticated:true,profile:{nickname:'New name',ownIdentity:{key:state.identity}}};},readCard:async guest=>{eq(guest.kind,'result');reads++;if(state.never||loadedAt-beginning<19000)return{reason:'not_found'};return state.pending?{reason:'processing',pendingReview:true,evidence:{title:'fixture',statusText:'待审核'}}:{matched:true,message:'发布成功',evidence:{workId:'1234567890123456789'}};}});
 return{record,account,state,reader,args:{record,now:()=>time,sleep:async ms=>{time+=ms;await tick();},readNotice:async()=>{throw Error('页面已切换，请重新检查表单');},readValidation:async()=>{throw Error('Old editor must not delay result read');},readWorkList:()=>reader.read(),verifyIdentity:()=>reader.verifyIdentity(),write(){}},get elapsed(){return time-beginning;},get loads(){return loads;},get reads(){return reads;},get owners(){return owners;},get closed(){return windows.length===2&&windows.every(item=>item.closed);}};
}
(async()=>{
 for(const target of ['douyin','xiaohongshu']){select(target);
 for(const pending of [false,true]){const f=fixture();f.state.pending=pending;await observePublishOutcome(f.args);eq(f.record.status,'confirmed');assert.ok(f.elapsed>=19000&&f.elapsed<25000);checks++;eq(f.loads,3);if(pending){eq(f.record.verification.state,'processing');assert.ok(f.record.acceptedAt);checks++;}f.reader.close();eq(f.closed,true);}
 for(const identity of ['another-account',undefined]){const f=fixture();f.state.identity=identity;await observePublishOutcome({...f.args,timeoutMs:3000});eq(f.record.status,'unknown');eq(f.reads,0);f.reader.close();}
 {const f=fixture();f.state.liveUrl='https://creator.douyin.com/creator-micro/content/upload';await observePublishOutcome({...f.args,timeoutMs:3000});eq(f.reads,0);eq(f.record.status,'unknown');f.reader.close();}
 {const f=fixture();f.state.never=true;await observePublishOutcome(f.args);eq(f.record.status,'unknown');eq(f.loads,6);eq(f.elapsed,60000);f.reader.close();}
 {const f=fixture();await f.reader.read();await tick();await assert.rejects(f.reader.verifyIdentity({...f.account,connectorSessionId:'switched'}));checks++;f.reader.close();}
 }
 console.log(JSON.stringify({platforms:['douyin','xiaohongshu'],earlyResultChecks:checks,successAndReviewBeforeTwentyFiveSeconds:true,editorNavigationDoesNotWaitMinute:true,stableIdentityRequired:true,noPlatformActions:true}));
})().catch(error=>{console.error(error);process.exitCode=1;});
