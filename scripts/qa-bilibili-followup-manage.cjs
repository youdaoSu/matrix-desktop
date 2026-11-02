const assert=require('node:assert/strict');
const {createBilibiliFollowupManagement}=require('../desktop/bilibili-followup-manage.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const input={workId:'BV1qa0000001',nativeAccountKey:'12345',text:'QA original',commentId:'998877',operation:'delete'};
function fixture(){
 const calls=[],root={rpid_str:'998877',oid:'24680',type:1,mid:'12345',member:{mid:'12345'},root:0,parent:0,content:{message:input.text}};
 const f={root,pin:root,code:0,detailCode:0,mid:12345,owner:12345,missingPin:false,hook:async()=>{}};
 f.run=(changes={},hooks={})=>createBilibiliFollowupManagement({request:async(method,route,data)=>{
  calls.push({method,route,data});await f.hook({method,route,data});
  if(route.endsWith('/nav'))return{code:0,data:{isLogin:true,mid:f.mid}};
  if(route.endsWith('/view'))return{code:0,data:{bvid:input.workId,aid:24680,owner:{mid:f.owner}}};
  if(route.endsWith('/detail'))return{code:f.detailCode,data:{root:f.root}};
  if(route==='/x/v2/reply')return{code:0,data:f.missingPin?{}:{top:{upper:f.pin}}};
  if(method==='POST'){if(f.code===0&&route.endsWith('/top'))f.pin=null;return{code:f.code};}
 }})({...input,...changes},hooks);
 f.calls=calls;return f;
}
(async()=>{
 let f=fixture(),r=await f.run();eq(r.status,'confirmed');eq(f.calls.filter(c=>c.method==='POST').length,1);eq(f.calls.at(-1).data,{type:'1',oid:'24680',rpid:'998877'});
 f=fixture();r=await f.run({operation:'unpin'});eq(r.status,'confirmed');eq(f.calls.find(c=>c.method==='POST').data.action,'0');
 for(const pin of [null,{rpid_str:'887766'}]){f=fixture();f.pin=pin;r=await f.run({operation:'unpin'});eq(r.status,'confirmed');eq(f.calls.some(c=>c.method==='POST'),false);}
 for(const mutate of [f=>f.mid=999,f=>f.owner=999,f=>f.detailCode=12006,f=>f.root.member.mid='9',f=>f.root.oid='2',f=>f.root.content.message='edited',f=>f.root.root=7,f=>f.root.rpid_str='887766']){
  f=fixture();mutate(f);try{r=await f.run();eq(r.status,'failed');}catch{checks++;}eq(f.calls.some(c=>c.method==='POST'),false);
 }
 f=fixture();f.missingPin=true;r=await f.run({operation:'unpin'});eq(r.status,'failed');eq(f.calls.some(c=>c.method==='POST'),false);
 for(const code of [-404,-403,-111,-509,12006,12022,undefined]){f=fixture();f.code=code;r=await f.run();eq(r.status,code===12022?'confirmed':code===undefined?'unknown':'failed');eq(f.calls.filter(c=>c.method==='POST').length,1);}
 for(const operation of ['delete','unpin']){f=fixture();r=await f.run({operation,verifyOnly:true});eq(r.status,'unknown');eq(f.calls.some(c=>c.method==='POST'),false);}
 f=fixture();f.detailCode=12006;r=await f.run({verifyOnly:true});eq(r.status,'unknown');eq(f.calls.some(c=>c.method==='POST'),false);
 f=fixture();await assert.rejects(f.run({}, {beforeDispatch:async()=>{throw Error('journal failed');}}));checks++;eq(f.calls.some(c=>c.method==='POST'),false);
 f=fixture();await assert.rejects(f.run({operation:'edit'}));checks++;eq(f.calls.length,0);
 console.log(JSON.stringify({bilibiliManagementChecks:checks,realNetwork:false,otherPinUntouched:true,noEditOrDeleteAndRepost:true}));
})().catch(error=>{console.error(error);process.exitCode=1;});
