// Disposable callback fixtures only. No real profile, official requests or posts.
const assert = require('node:assert/strict');
const {createBilibiliResultReader} = require('../desktop/bilibili-result-reader.cjs');
const {registerPageActions} = require('../desktop/page-actions.cjs');
const {observePublishOutcome,sanitizeOutcomeObservation}=require('../desktop/publish-outcome.cjs');
const URL = 'https://member.bilibili.com/platform/upload-manager/article';
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(patch = {}) {
  const f = {time:0, opened:0, destroyed:0, loads:0, reads:0, owners:0, muted:[], events:{},
    record:{platform:'bilibili',sessionId:'aaaaaaaaaaaaaaaa',nickname:'QA display',nativeAccountKey:'qa-native-id'},
    account:{platform:'bilibili',connectorSessionId:'aaaaaaaaaaaaaaaa',nativeAccountKey:'qa-native-id'},
    profile:{nickname:'Renamed QA display',ownIdentity:{key:'qa-native-id'}}, authenticated:true,
    outcome:{matched:true,message:'发布成功',evidence:{workId:'BV1s54y1d72u'}}};
  Object.assign(f,patch);
  f.guest = {getURL:()=>f.url || URL, isDestroyed:()=>false,
    setAudioMuted:value=>f.muted.push(value), setWindowOpenHandler:handler=>f.popup=handler,
    on:(name,handler)=>f.events[name]=handler,
    loadURL:async url=>{assert.equal(url,URL);f.loads++; if(f.load) return f.load();}};
  f.reader = createBilibiliResultReader({record:f.record,account:f.account,now:()=>f.time,
    createWindow:()=>{f.opened++;return{webContents:f.guest,isDestroyed:()=>f.destroyed>0,destroy:()=>f.destroyed++};},
    inspectOwner:async()=>{f.owners++;return{authenticated:f.authenticated,profile:f.profile};},
    readCard:async()=>{f.reads++;return f.read?f.read():f.outcome;}});
  f.ready = async()=>{assert.equal((await f.reader.read()).reason,'page_not_ready');await tick();};
  return f;
}
(async()=>{
  let checks=0,f=fixture(); await f.ready();
  assert.equal(f.opened,1);assert.equal(f.loads,1);assert.deepEqual(f.muted,[true]);assert.deepEqual(f.popup(),{action:'deny'});checks+=4;
  assert.equal((await f.reader.read()).evidence.workId,'BV1s54y1d72u');await f.reader.verifyIdentity();assert.equal(f.owners,2);checks+=2;
  for(const value of ['http://member.bilibili.com/','https://member.bilibili.com.attacker.invalid/','https://other.invalid/','invalid']){
    let denied=false;f.events['will-navigate']({preventDefault:()=>denied=true},value);assert.equal(denied,true);checks++;
  }
  let denied=false;f.events['will-navigate']({preventDefault:()=>denied=true},URL);assert.equal(denied,false);checks++;
  f.reader.close();f.reader.close();assert.equal(f.destroyed,1);assert.equal((await f.reader.read()).reason,'page_closed');assert.equal(f.reads,1);checks+=3;
  f=fixture();const notDispatched=f.reader.read();f.reader.close();const cancelled=await notDispatched;await tick();assert.equal(f.loads,0);assert.equal(cancelled.readObservation.workListLoads,0);assert.equal(cancelled.readObservation.lastWorkListLoadAt,undefined);assert.equal(f.destroyed,1);checks+=4;
  for(const [patch,reason]of[
    [{authenticated:false},'login_required'],[{profile:{nickname:''}},'identity_pending'],
    [{profile:{nickname:'QA display',ownIdentity:{key:'another-id'}}},'identity_mismatch'],
    [{profile:{nickname:'QA display'}},'identity_mismatch'],
    [{url:'https://passport.bilibili.com/login'},'login_required'],
    [{url:'https://member.bilibili.com/platform/upload/video/frame'},'wrong_page'],
    [{url:'https://other.invalid/platform/upload-manager/article'},'wrong_page'],
  ]){
    f=fixture(patch);await f.ready();assert.equal((await f.reader.read()).reason,reason);assert.equal(f.reads,0);await assert.rejects(f.reader.verifyIdentity());f.reader.close();assert.equal(f.destroyed,1);checks+=4;
  }
  f=fixture();await f.ready();for(const bound of [{...f.account,nativeAccountKey:'other-id'},{...f.account,connectorSessionId:'other-session'},{...f.account,platform:'douyin'}]){await assert.rejects(f.reader.verifyIdentity(bound));checks++;}f.reader.close();
  f=fixture({load:()=>new Promise(()=>{})});await f.ready();f.time=15000;assert.equal((await f.reader.read()).reason,'timeout');assert.equal((await f.reader.read()).reason,'timeout');assert.equal(f.destroyed,1);assert.equal(f.owners,0);checks+=4;
  f=fixture({load:async()=>{throw Error('load failed');}});await f.ready();assert.equal((await f.reader.read()).reason,'error');assert.equal(f.destroyed,1);checks+=2;
  let resolveLoad;f=fixture({load:()=>new Promise(resolve=>resolveLoad=resolve)});await f.ready();f.reader.close();resolveLoad();await tick();assert.equal((await f.reader.read()).reason,'page_closed');assert.equal(f.owners,0);checks+=2;
  let resolveRead;f=fixture({read:()=>new Promise(resolve=>resolveRead=resolve)});await f.ready();const pending=f.reader.read();await tick();f.reader.close();resolveRead({matched:true});assert.equal((await pending).reason,'page_closed');checks++;
  f=fixture({outcome:{reason:'not_found'}});await f.ready();f.time=9999;await f.reader.read();await tick();assert.equal(f.loads,1);f.time=10000;await f.reader.read();await tick();assert.equal(f.loads,2);checks+=2;
  f.time=20000;f.profile.ownIdentity.key='different-id';assert.equal((await f.reader.read()).reason,'identity_mismatch');await tick();assert.equal(f.loads,2);f.reader.close();checks+=2;
  for(const reason of ['status_unresolved','visibility_mismatch','ambiguous','time_mismatch','not_published']){
    f=fixture({outcome:{reason}});await f.ready();f.time=10000;assert.equal((await f.reader.read()).reason,reason);await tick();assert.equal(f.loads,1);f.reader.close();checks+=2;
  }
  f=fixture({outcome:{reason:'processing'}});await f.ready();for(let i=1;i<=10;i++){f.time=i*10000;await f.reader.read();await tick();}assert.equal(f.loads,6);f.reader.close();checks++;
  // Concurrent reads share one actual DOM operation and cannot overlap reloads.
  f=fixture({read:()=>new Promise(resolve=>resolveRead=resolve)});await f.ready();const first=f.reader.read(),second=f.reader.read();assert.equal(first,second);await tick();assert.equal(f.reads,1);resolveRead({reason:'not_found'});await Promise.all([first,second]);f.reader.close();checks+=2;
  let lateNavigation;
  f=fixture({outcome:{reason:'not_found'}});await f.ready();f.load=()=>new Promise(resolve=>lateNavigation=resolve);f.time=10000;await f.reader.read();await tick();f.reader.close();lateNavigation();await tick();assert.equal((await f.reader.read()).reason,'page_closed');assert.equal(f.loads,2);checks+=2;
  // Backend visibility changes only after reloading its static response, not
  // merely after another DOM read. This used to stay stale for the whole minute.
  for(const initial of ['not_found','processing']){
    f=fixture();f.time=Date.parse('2026-10-19T06:00:00.000Z');const began=f.time;
    f.record.status='unknown';f.load=()=>{f.documentPublished=f.time-began>=29000;};f.read=()=>f.documentPublished?{matched:true,message:'发布成功',evidence:{workId:'BV1s54y1d72u'}}:{reason:initial};
    await observePublishOutcome({record:f.record,now:()=>f.time,sleep:async ms=>{f.time+=ms;await tick();},readNotice:async()=>({status:'unknown'}),readValidation:async()=>({inspected:true,errors:[]}),readWorkList:()=>f.reader.read(),verifyIdentity:()=>f.reader.verifyIdentity(),write:()=>{}});
    assert.equal(f.record.status,'confirmed');assert.equal(f.loads,4);assert.ok(f.time-began<60000);assert.equal(f.record.outcomeObservation.workListLoads,4);assert.ok(sanitizeOutcomeObservation(f.record.outcomeObservation).lastWorkListLoadAt);f.reader.close();assert.equal(f.destroyed,1);checks+=6;
  }
  f=fixture({outcome:{reason:'not_found'}});f.record.status='unknown';f.time=Date.parse('2026-10-19T06:00:00.000Z');const beginning=f.time;
  await observePublishOutcome({record:f.record,now:()=>f.time,sleep:async ms=>{f.time+=ms;await tick();},readNotice:async()=>({status:'unknown'}),readValidation:async()=>({inspected:true,errors:[]}),readWorkList:()=>f.reader.read(),verifyIdentity:()=>f.reader.verifyIdentity(),write:()=>{}});
  assert.equal(f.record.status,'unknown');assert.equal(f.time-beginning,60000);assert.equal(f.loads,6);assert.equal(f.record.outcomeObservation.workListLoads,6);f.reader.close();checks+=4;
  // Actual submit handler integration: the editor stays on its upload frame,
  // while only the separate same-session reader sees an official work card.
  const handlers={},rows=[];let clicks=0,editorLoads=0,resultLoads=0,closed=0,muted=0,concurrent=false;
  const account={platform:'bilibili',connectorSessionId:'aaaaaaaaaaaaaaaa',nativeAccountKey:'qa-native-id'},partition={};
  const editor={id:22,hostWebContents:{id:11},session:partition,isDestroyed:()=>false,getURL:()=> 'https://member.bilibili.com/platform/upload/video/frame',loadURL:()=>{editorLoads++;throw Error('Must not navigate editor');},
    executeJavaScriptInIsolatedWorld:async(_world,scripts)=>{
      const code=scripts[0].code;
      if(code.includes('function publishValidation'))return{version:1,inspected:true,errors:[]};
      if(code.includes(')("inspect",'))return{pageUrl:editor.getURL(),fields:[{label:'标题',value:'QA work'}],candidates:[{index:0,label:'立即投稿'}]};
      if(code.includes(')("submit-checked",')){clicks++;return{clicked:true};}
      if(code.includes('function publishResult'))throw Error('Must not look for work cards in upload editor');
      return{status:'unknown'};
    }};
  registerPageActions({ipcMain:{handle:(name,fn)=>handlers[name]=fn},getWindow:()=>({webContents:{id:11}}),
    dialog:{showMessageBox:async()=>({response:1})},webContents:{fromId:()=>editor},session:{fromPartition:()=>partition},platforms:{bilibili:{domain:'bilibili.com',label:'B站'}},
    authenticate:async()=>({userId:'qa-owner',account}),inspectPlatformSession:async()=>({authenticated:true,profile:{nickname:'QA display',ownIdentity:{key:'qa-native-id'}}}),
    journal:{list:()=>rows.slice(-1),write:record=>rows.push(structuredClone(record))},sleep:tick,
    createResultWindow:passed=>{assert.equal(passed,partition);return{isDestroyed:()=>closed>0,destroy:()=>closed++,webContents:{getURL:()=>URL,isDestroyed:()=>false,
      setAudioMuted:value=>{assert.equal(value,true);muted++;},loadURL:async url=>{assert.equal(url,URL);resultLoads++;},
      executeJavaScriptInIsolatedWorld:async(_world,scripts)=>{assert.ok(scripts[0].code.includes('function publishResult'));
        if(concurrent){rows.push({...rows.at(-1),status:'confirmed',message:'Concurrent verified success',evidence:{workId:'BV1s54y1d72u'}});return{rejected:true,message:'Stale rejection'};}
        return{matched:true,message:'发布成功',evidence:{workId:'BV1s54y1d72u'}};}}};},
  });
  const event={sender:{id:11}},input={platform:'bilibili',accountId:'qa-account',sessionId:account.connectorSessionId,webContentsId:22,accessToken:'qa-only',kind:'publish'};
  const plan=await handlers['matrix:inspect-page-action'](event,input);assert.ok(plan.nonce);
  const result=await handlers['matrix:submit-page-action'](event,{...input,nonce:plan.nonce,index:0});
  assert.equal(result.receipt.status,'confirmed');assert.equal(result.receipt.evidence.workId,'BV1s54y1d72u');assert.equal(result.receipt.resultSource,'official_work_list');assert.equal(clicks,1);assert.equal(editorLoads,0);assert.equal(resultLoads,1);assert.equal(closed,1);assert.equal(muted,1);checks+=9;
  concurrent=true;closed=0;const next=await handlers['matrix:inspect-page-action'](event,input);
  const race=await handlers['matrix:submit-page-action'](event,{...input,nonce:next.nonce,index:0});
  assert.equal(race.receipt.status,'confirmed');assert.equal(race.receipt.message,'Concurrent verified success');assert.equal(rows.at(-1).message,'Concurrent verified success');assert.equal(closed,1);checks+=4;
  console.log(JSON.stringify({separateBiliResultContextChecks:checks,sameSessionAndStableIdentity:true,liveEditorUntouched:true,boundedLoadingAndLateCompletion:true,realPlatformActions:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
