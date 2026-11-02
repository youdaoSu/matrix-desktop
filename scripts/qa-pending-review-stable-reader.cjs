// Delayed official-page callback fixtures only: no real browser, account or post.
const assert=require('node:assert/strict');
const {createOfficialResultReader}=require('../desktop/official-publish-result-reader.cjs');
const {observePublishOutcome}=require('../desktop/publish-outcome.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
let checks=0;function eq(actual,expected){assert.deepEqual(actual,expected);checks++;}
function fixture(platform,patch={}){
 let time=0,loads=0,reads=0,owner='fixture-owner';const windows=[],pending=[];
 const account={platform,connectorSessionId:'fixture-session',nativeAccountKey:owner};
 const record={kind:'publish',platform,sessionId:account.connectorSessionId,nativeAccountKey:owner,status:'unknown',clicked:true};
 const accepted={reason:'processing',pendingReview:true,evidence:{workId:'fixture-work',statusText:'待审核'}};
 const reader=createOfficialResultReader({record,account,now:()=>time,
  createWindow:kind=>{const local={closed:false,url:'about:blank'};windows.push(local);return{
   isDestroyed:()=>local.closed,destroy(){local.closed=true;},webContents:{isDestroyed:()=>local.closed,getURL:()=>local.url,
    setAudioMuted(){},setWindowOpenHandler(){},on(){},loadURL:url=>{local.url=url;if(kind==='result')loads++;return new Promise(resolve=>pending.push({at:time+11000,resolve}));},
   },
  };},
  inspectOwner:async()=>({authenticated:true,profile:{nickname:'fixture',ownIdentity:{key:owner}}}),
  readCard:async()=>{reads++;if(patch.switchOwner)owner='other-owner';return patch.result||accepted;},
 });
 const advance=async ms=>{time+=ms;for(let i=pending.length-1;i>=0;i--)if(pending[i].at<=time)pending.splice(i,1)[0].resolve();await tick();};
 return{record,reader,advance,get time(){return time;},get loads(){return loads;},get reads(){return reads;},
  close(){reader.close();eq(windows.every(w=>w.closed),true);},
  args:{record,now:()=>time,sleep:advance,timeoutMs:16000,readNotice:async()=>({status:'unknown'}),readValidation:async()=>({inspected:true,errors:[]}),readWorkList:()=>reader.read(),verifyIdentity:()=>reader.verifyIdentity(),write(){}},
 };
}
(async()=>{
 for(const platform of ['douyin','bilibili','xiaohongshu']){
  // First official page load takes eleven seconds. Evidence must remain usable
  // for the second owner check, without starting a replacement navigation.
  {const f=fixture(platform);await observePublishOutcome(f.args);eq(f.record.status,'confirmed');eq(f.record.verification.state,'processing');eq(f.time,12000);eq(f.loads,1);eq(f.reads,1);assert.ok(f.record.acceptedAt);checks++;f.close();}
  for(const result of [{matched:true,message:'发布成功',evidence:{workId:'fixture-work'}},{rejected:true,message:'平台拒绝',evidence:{workId:'fixture-work'}}]){
   const f=fixture(platform,{result});await observePublishOutcome(f.args);eq(f.record.status,result.matched?'confirmed':'failed');eq(f.time,12000);eq(f.loads,1);f.close();
  }
  // A pending flag without work evidence is still unconfirmed; generic
  // processing still permits the existing bounded read-only refresh.
  for(const result of [{reason:'processing',pendingReview:true},{reason:'processing',evidence:{workId:'fixture-work'}}]){
   const f=fixture(platform,{result});await observePublishOutcome(f.args);eq(f.record.status,'unknown');eq(f.record.acceptedAt,undefined);eq(f.time,16000);eq(f.loads,2);f.close();
  }
  {const f=fixture(platform,{switchOwner:true});await observePublishOutcome(f.args);eq(f.record.status,'unknown');eq(f.record.acceptedAt,undefined);eq(f.loads,1);eq(f.reads,1);f.close();}
 }
 console.log(JSON.stringify({delayedReviewChecks:checks,delayedLoadMs:11000,acceptedAtMs:12000,platforms:['douyin','bilibili','xiaohongshu'],identityStillRequired:true,platformActions:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});
