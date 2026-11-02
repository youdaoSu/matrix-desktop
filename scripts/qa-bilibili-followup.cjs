// Original inert API fixtures only. This file never performs network IO.
const assert=require('node:assert/strict');
const {createBilibiliFollowup,ownsReply,replyId}=require('../desktop/bilibili-followup.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const values={workId:'BV1qa0000001',nativeAccountKey:'12345',text:'QA隔离追评，未发送到平台',pin:true};
const reply={rpid_str:'998877665544332211',oid:24680,type:1,mid:'12345',member:{mid:'12345'},root:0,parent:0,state:0,content:{message:values.text}};
const good={nav:{code:0,data:{isLogin:true,mid:12345}},view:{code:0,data:{bvid:values.workId,aid:24680,owner:{mid:12345}}},add:{code:0,data:{rpid_str:reply.rpid_str,reply}},detail:{code:0,data:{root:reply}},top:{code:0}};
function fixture(patch={}){
 const calls=[],events=[],responses={...good,...patch};let pinned=false;
 const run=createBilibiliFollowup({sleep:async()=>{},request:async(method,route,body)=>{calls.push({method,route,body});events.push(route);const key=route.split('/').at(-1),value=key==='reply'&&!Object.hasOwn(patch,'reply')?{code:0,data:{top:{upper:pinned?reply:null}}}:responses[key];if(value instanceof Error)throw value;if(typeof value==='function')return value({method,route,body});if(key==='top'&&value?.code===0)pinned=true;return value;}});
 return{calls,events,run:(input={},hooks={})=>run({...values,...input},{beforeDispatch:async data=>{events.push('saved-before-'+data.operation);await hooks.beforeDispatch?.(data);},acknowledged:async data=>{events.push('saved-ack');await hooks.acknowledged?.(data);}})};
}
(async()=>{
 // Saved automatic pin intent follows the same exact-root path as manual pin.
 for(const state of [0,17]){
  let reads=0;
  const probe=fixture({add:{code:0,data:{rpid_str:reply.rpid_str,reply:{...reply,state}}},detail:{code:0,data:{root:{...reply,state}}},reply:()=>({code:0,data:{top:{upper:++reads>=4?{...reply,state}:null}}})});
  const result=await probe.run();eq(result.pin.status,'confirmed');eq(reads,4);
  eq(probe.calls.filter(call=>call.method==='POST').map(call=>call.route),['/x/v2/reply/add','/x/v2/reply/top']);
 }
 for(const mode of ['no-intent','other-pin','owner-changed','unknown-slot']){
  const patch={add:{code:0,data:{rpid_str:reply.rpid_str,reply:{...reply,state:17}}},detail:{code:12006}};
  if(mode==='other-pin')patch.reply={code:0,data:{top:{upper:{...reply,rpid_str:'777'}}}};
  if(mode==='unknown-slot')patch.reply={code:-101};
  const probe=fixture(patch);await probe.run({pin:mode!=='no-intent'},{beforeDispatch:value=>{if(mode==='owner-changed'&&value.operation==='pin')throw Error('account changed');}});
  eq(probe.calls.filter(call=>call.method==='POST').map(call=>call.route),['/x/v2/reply/add']);
 }
 for(const state of [0,17])for(const operation of ['verify','pin']){
  const probe=fixture({detail:{code:0,data:{root:{...reply,state,reply_control:{is_up_top:true}}}},reply:{code:0,data:{top:{upper:null}}}}),result=await probe.run({operation,commentId:reply.rpid_str});
  eq(result.pin.status,'confirmed');eq(probe.calls.some(call=>call.method==='POST'),false);eq(result.status,state===0?'confirmed':'unknown');
 }
 for(const control of [{},{is_up_top:false},{is_up_top:1},{is_up_top:'true'},{is_admin_top:true},{is_vote_top:true}]){
  const probe=fixture({detail:{code:0,data:{root:{...reply,state:17,reply_control:control}}}}),result=await probe.run({operation:'verify',commentId:reply.rpid_str});
  eq(result.pin.status,'unknown');eq(probe.calls.some(call=>call.method==='POST'),false);
 }
 for(const change of [{oid:1},{type:2},{mid:'9'},{member:{mid:'9'}},{root:1},{parent:1},{rpid_str:'9'},{content:{message:'different'}},{state:11}]){
  const probe=fixture({detail:{code:0,data:{root:{...reply,state:17,reply_control:{is_up_top:true},...change}}}}),result=await probe.run({operation:'verify',commentId:reply.rpid_str});
  eq(result.pin?.status==='confirmed',false);eq(probe.calls.some(call=>call.method==='POST'),false);
 }
 {const probe=fixture({detail:{code:0,data:{root:{...reply,state:17}}},reply:{code:0,data:{top:{upper:{...reply,state:17}}}}}),result=await probe.run({operation:'verify',commentId:reply.rpid_str});eq(result.pin.status,'confirmed');eq(probe.calls.some(call=>call.method==='POST'),false);}
 {let details=0;const probe=fixture({detail:()=>({code:0,data:{root:{...reply,state:17,reply_control:{is_up_top:++details>1}}}}),reply:{code:0,data:{top:{upper:null}}}}),result=await probe.run({operation:'pin',commentId:reply.rpid_str});eq(result.pin.status,'confirmed');eq(details,2);eq(probe.calls.filter(call=>call.method==='POST').map(call=>call.route),['/x/v2/reply/top']);}
 for(const state of [1,11,99]){
  const probe=fixture({detail:{code:0,data:{root:{...reply,state}}}}),result=await probe.run({operation:'pin',commentId:reply.rpid_str});
  eq(result.status,'unknown');eq(result.message.includes('官方评论状态 '+state),true);eq(probe.calls.some(call=>call.method==='POST'),false);
 }
 // State 17 is not an identity mismatch. Only an explicit pin may send one
 // normal request, after exact ownership and an empty pin slot are proved.
 for(const top of [{code:0},{code:-404},{code:12006},{code:-403},{code:12015},{code:-509},new Error('QA lost pin reply')]){
  const probe=fixture({detail:{code:0,data:{root:{...reply,state:17}}},top}),result=await probe.run({operation:'pin',commentId:reply.rpid_str});
  eq(result.status,'unknown');eq(result.message.includes('公开可见性尚未确认'),true);
  eq(probe.calls.filter(call=>call.method==='POST').map(call=>({route:call.route,body:call.body})),[{route:'/x/v2/reply/top',body:{type:'1',oid:'24680',rpid:reply.rpid_str,action:'1'}}]);
  eq(result.pin.status,top.code===0?'confirmed':Number.isInteger(top.code)?'failed':'unknown');
 }
 for(const operation of ['verify','start']){
  const probe=fixture({add:{code:0,data:{rpid_str:reply.rpid_str,reply:{...reply,state:17}}},detail:{code:0,data:{root:{...reply,state:17}}}}),result=await probe.run({operation,...(operation==='verify'?{commentId:reply.rpid_str}:{})});
  eq(result.status,'unknown');eq(probe.calls.filter(call=>call.route==='/x/v2/reply/top').length,operation==='start'?1:0);
  eq(probe.calls.filter(call=>call.method==='POST').length,operation==='start'?2:0);eq(result.pin.status,operation==='start'?'confirmed':'unknown');
 }
 for(const change of [{oid:1},{type:2},{mid:'9'},{member:{mid:'9'}},{root:1},{parent:1},{rpid_str:'9'},{content:{message:'different'}}]){
  const probe=fixture({detail:{code:0,data:{root:{...reply,state:17,...change}}}}),result=await probe.run({operation:'pin',commentId:reply.rpid_str});
  eq(result.status,'unknown');eq(probe.calls.some(call=>call.method==='POST'),false);
 }
 for(const page of [{code:-101},{code:0,data:{}},{code:0,data:{top:{upper:{...reply,rpid_str:'different'}}}},{code:0,data:{top:{upper:{...reply,rpid_str:'777'}}}}]){
  const probe=fixture({detail:{code:0,data:{root:{...reply,state:17}}},reply:page});await probe.run({operation:'pin',commentId:reply.rpid_str});eq(probe.calls.some(call=>call.method==='POST'),false);
 }
 {const probe=fixture({detail:{code:0,data:{root:{...reply,state:17}}}});await probe.run({operation:'pin',commentId:reply.rpid_str,pin:false});eq(probe.calls.some(call=>call.method==='POST'),false);}
 {const probe=fixture({detail:{code:0,data:{root:{...reply,state:17}}},reply:{code:0,data:{top:{upper:null}}}}),result=await probe.run({operation:'pin',commentId:reply.rpid_str});eq(result.pin.status,'unknown');eq(probe.calls.filter(call=>call.method==='POST').length,1);}
 for(const root of [undefined,{}, {...reply,content:{message:'sensitive-different-body'}}]){
  const probe=fixture({detail:{code:0,data:{root}}}),result=await probe.run({operation:'pin',commentId:reply.rpid_str});
  eq(result.status,'unknown');eq(result.message.includes(root===undefined?'未返回原评论对象':'字段未匹配'),true);eq(result.message.includes('sensitive-different-body'),false);eq(probe.calls.some(call=>call.method==='POST'),false);
 }
 // The authoritative add response already proves this new root. A lagging
 // detail API must not suppress its requested pin; there is exactly one POST.
 for(const detail of [{code:12006},{code:-404},new Error('detail not indexed')]){
  const probe=fixture({detail}),result=await probe.run();
  eq(result.status,'confirmed');eq(result.pin.status,'confirmed');
  eq(probe.calls.filter(call=>call.method==='POST').map(call=>call.route),['/x/v2/reply/add','/x/v2/reply/top']);
  eq(probe.calls.some(call=>call.route==='/x/v2/reply/detail'),false);
 }
 for(const replyPatch of [{member:{mid:'999'}},{oid:99},{root:1},{content:{message:'different'}},{state:11}]){
  const probe=fixture({add:{code:0,data:{rpid_str:reply.rpid_str,reply:{...reply,...replyPatch}}},detail:{code:12006},reply:{code:0,data:{replies:[],upper:{mid:'12345',top:null}}}});
  const result=await probe.run();eq(result.status,'unknown');eq(probe.calls.filter(call=>call.method==='POST').map(call=>call.route),['/x/v2/reply/add']);
 }
 {const probe=fixture({detail:{code:12006}}),result=await probe.run({}, {beforeDispatch:value=>{if(value.operation==='pin')throw Error('QA account changed');}});eq(result.pin.status,'unknown');eq(probe.calls.filter(call=>call.method==='POST').map(call=>call.route),['/x/v2/reply/add']);}
 let f=fixture(),r=await f.run();eq(r.status,'confirmed');eq(r.commentId,reply.rpid_str);eq(r.pin.status,'confirmed');eq(f.events,['/x/web-interface/nav','/x/web-interface/view','saved-before-comment','/x/v2/reply/add','saved-ack','/x/v2/reply','saved-before-pin','/x/v2/reply/top','/x/v2/reply']);
 eq(f.calls.filter(c=>c.method==='POST').map(c=>c.body),[{type:'1',oid:'24680',root:'0',parent:'0',message:values.text,plat:'1'},{type:'1',oid:'24680',rpid:reply.rpid_str,action:'1'}]);
 for(const nav of [{code:-101},{code:0,data:{isLogin:false,mid:12345}},{code:0,data:{isLogin:true,mid:54321}}]){f=fixture({nav});await assert.rejects(f.run(),/UID/);checks++;eq(f.calls.some(c=>c.method==='POST'),false);}
 for(const view of [{code:-403},{code:0,data:{bvid:values.workId,aid:24680,owner:{mid:54321}}},{code:0,data:{...good.view.data,bvid:'BV1qa0000002'}},{code:0,data:{...good.view.data,aid:9007199254740993}}]){f=fixture({view});await assert.rejects(f.run(),/BV作品/);checks++;eq(f.calls.some(c=>c.method==='POST'),false);}
 for(const input of [{workId:'same title'},{nativeAccountKey:''},{text:''},{text:'x'.repeat(2001)},{operation:'delete'},{commentId:'not-id'}]){f=fixture();await assert.rejects(f.run(input));checks++;eq(f.calls.length,0);}
 f=fixture();await assert.rejects(f.run({}, {beforeDispatch:()=>{throw Error('QA journal disk full');}}),/journal disk full/);checks++;eq(f.calls.filter(c=>c.method==='POST').length,0);
 for(const code of [-101,-102,-111,-403,-509,12002,12003,12015,12016,12025,12035,12045,12051,12052,987654]){f=fixture({add:{code,message:'untrusted cookie=never-log-this'}});r=await f.run();eq(r.status,code===12051?'unknown':'failed');eq(f.calls.filter(c=>c.method==='POST').length,1);eq(r.message.includes('never-log'),false);eq(r.pin,undefined);}
 f=fixture({add:{code:0,data:{need_captcha:true,rpid_str:reply.rpid_str}}});r=await f.run();eq(r.status,'unknown');eq(r.commentId,reply.rpid_str);eq(r.pin,undefined);
 f=fixture({add:{code:0,data:{rpid_str:reply.rpid_str}}});r=await f.run({pin:false});eq(r.status,'confirmed');eq(f.calls.at(-1).route,'/x/v2/reply/detail');eq(f.events.indexOf('saved-ack')<f.events.indexOf('/x/v2/reply/detail'),true);
 f=fixture({add:{code:0,data:{rpid_str:reply.rpid_str}},detail:{code:0,data:{root:{...reply,member:{mid:'999'}}}}});r=await f.run();eq(r.status,'unknown');eq(f.calls.some(c=>c.route.endsWith('/top')),false);
 f=fixture({add:{code:0,data:{}}});r=await f.run();eq(r.status,'unknown');eq(f.calls.filter(c=>c.method==='POST').length,1);
 f=fixture({add:new Error('QA lost add response')});await assert.rejects(f.run(),/lost add/);checks++;eq(f.calls.filter(c=>c.method==='POST').length,1);
 for(const top of [{code:12029},{code:-403},{code:0},{unexpected:true},new Error('QA pin timeout')]){f=fixture({top});r=await f.run();eq(r.status,'confirmed');eq(r.pin.status,top.code===0?'confirmed':Number.isInteger(top.code)?'failed':'unknown');eq(f.calls.filter(c=>c.route.endsWith('/add')).length,1);}
 f=fixture();r=await f.run({operation:'verify',commentId:reply.rpid_str,pin:true});eq(r.status,'confirmed');eq(f.calls.some(c=>c.method==='POST'),false);eq(r.pin.status,'failed');
 f=fixture();r=await f.run({operation:'pin',commentId:reply.rpid_str});eq(r.status,'confirmed');eq(r.pin.status,'confirmed');eq(f.calls.filter(c=>c.method==='POST').map(c=>c.route),['/x/v2/reply/top']);
 f=fixture();r=await f.run({operation:'verify',commentId:undefined});eq(r.status,'unknown');eq(f.calls.some(c=>c.method==='POST'),false);
 // Idempotent read-back is the authority, not a zero POST response alone.
 f=fixture({reply:{code:0,data:{top:{upper:null}}}});r=await f.run();eq(r.pin.status,'unknown');eq(f.calls.filter(c=>c.route.endsWith('/top')).length,1);
 f=fixture({reply:{code:0,data:{top:{upper:reply}}}});r=await f.run({operation:'pin',commentId:reply.rpid_str});eq(r.pin.status,'confirmed');eq(f.calls.some(c=>c.method==='POST'),false);
 f=fixture({reply:{code:0,data:{top:{upper:{...reply,rpid_str:'777'}}}}});r=await f.run({operation:'pin',commentId:reply.rpid_str});eq(r.pin.status,'failed');eq(f.calls.some(c=>c.method==='POST'),false);
 for(const body of [{code:-404},{code:0,data:{}},{code:0,data:{top:{upper:{...reply,mid:'999'}}}}]){f=fixture({reply:body});r=await f.run({operation:'pin',commentId:reply.rpid_str});eq(r.pin.status,'unknown');eq(f.calls.some(c=>c.method==='POST'),false);}
 f=fixture({top:{code:-404}});r=await f.run({operation:'pin',commentId:reply.rpid_str});eq(r.pin.status,'failed');eq(r.pin.officialCode,-404);eq(f.calls.filter(c=>c.method==='POST').length,1);eq(f.calls.filter(c=>c.route.endsWith('/add')).length,0);
 let scans=0;f=fixture({top:{code:-404},reply:()=>({code:0,data:{top:{upper:++scans===1?null:reply}}})});r=await f.run({operation:'pin',commentId:reply.rpid_str});eq(r.pin.status,'confirmed');eq(f.calls.filter(c=>c.method==='POST').length,1);
 f=fixture({reply:{code:0,data:{upper:{mid:values.nativeAccountKey,top:reply}}}});r=await f.run({operation:'verify',commentId:reply.rpid_str});eq(r.pin.status,'confirmed');eq(f.calls.some(c=>c.method==='POST'),false);
 for(const patch of [{oid:13579},{type:2},{mid:'999'},{member:{mid:'999'}},{root:888},{parent:888},{content:{message:values.text+' extra'}},{rpid_str:'111'},{state:1}])eq(ownsReply({...reply,...patch},{oid:'24680',mid:'12345',text:values.text,commentId:reply.rpid_str}),false);
 eq(replyId({rpid_str:'9007199254740993',rpid:9007199254740992}),'9007199254740993');eq(replyId({rpid_str:'123',rpid:456}),undefined);eq(replyId({rpid:9007199254740992}),undefined);
 // An unavailable detail response is not authoritative absence: the same
 // authenticated first page may contain the exact recorded root comment.
 let fallbackPinned=false;
 f=fixture({detail:{code:12006},reply:({body})=>({code:0,data:{upper:{mid:'12345',top:fallbackPinned?reply:null},replies:body.ps==='20'?[reply]:[]}}),top:()=>{fallbackPinned=true;return{code:0};}});
 r=await f.run({operation:'pin',commentId:reply.rpid_str});eq(r.status,'confirmed');eq(r.pin.status,'confirmed');eq(f.calls.filter(c=>c.method==='POST').map(c=>c.route),['/x/v2/reply/top']);eq(f.calls.filter(c=>c.route==='/x/v2/reply'&&c.body.ps==='20').length,1);
 for(const candidates of [[],[reply,reply],[{...reply,mid:'999'}],[{...reply,oid:99}],[{...reply,content:{message:values.text+' changed'}}],[{...reply,root:1}],[{...reply,state:1}],[{...reply,rpid_str:'777'}]]){
  f=fixture({detail:{code:12006},reply:{code:0,data:{upper:{mid:'12345',top:null},replies:candidates}}});r=await f.run({operation:'pin',commentId:reply.rpid_str});eq(r.status,'unknown');eq(f.calls.some(c=>c.method==='POST'),false);eq(r.message.includes('12006'),true);
 }
 for(const detail of [{code:-101},{code:-509},{code:0,data:{root:{...reply,mid:'999'}}},{code:0,data:{}}]){
  f=fixture({detail,reply:{code:0,data:{replies:[reply],upper:{mid:'12345',top:null}}}});r=await f.run({operation:'pin',commentId:reply.rpid_str});eq(r.status,'unknown');eq(f.calls.some(c=>c.route==='/x/v2/reply'),false);eq(f.calls.some(c=>c.method==='POST'),false);
 }
 f=fixture({detail:{code:-404},reply:{code:0,data:{upper:{mid:'999',top:null},replies:[reply]}}});r=await f.run({operation:'pin',commentId:reply.rpid_str});eq(r.status,'unknown');eq(f.calls.some(c=>c.method==='POST'),false);
 f=fixture({detail:{code:12006},reply:{code:0,data:{upper:{mid:'12345',top:null},replies:[reply]}}});r=await f.run({operation:'verify',commentId:reply.rpid_str});eq(r.status,'confirmed');eq(f.calls.some(c=>c.method==='POST'),false);
 console.log(JSON.stringify({bilibiliFollowupStateChecks:checks,stableOwnerWorkAndCommentIds:true,writeAheadHooks:true,noPostRetryOnUnknown:true,verifyIsReadOnly:true,pinFailureDoesNotResendComment:true,realPlatformRequests:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
