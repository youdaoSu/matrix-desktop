// Synthetic protocol and existing archive only; no platform requests or sends.
const assert=require('node:assert/strict');
const c=require('../desktop/douyin-inbox-codec.cjs');
const {createEngine}=require('../desktop/douyin-inbox-engine.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const own='100',peer='200',id='0:1:100:200',sec='MS4wQaPeer';
const raw={conversationId:id,conversationShortId:'300',conversationType:1};
const thread=()=>({...c.thread(raw,own),history:{done:true,cursor:'0',pages:1}});
const person={uid:peer,secUid:sec,name:'QA cached contact',avatarUrl:'https://example.test/avatar',at:100000};
const message={...raw,serverMessageId:'400',sender:peer,secSender:sec,messageType:7,content:'{"text":"QA"}',version:'1'};
const initial=()=>({revision:0,threads:{[id]:thread()},messages:{},people:{},init:{done:true,cursor:'0'},strangers:{done:true,cursor:'0'},frontier:{}});
const until=async test=>{for(let i=0;i<300;i++){if(test())return;await new Promise(r=>setTimeout(r,2));}throw Error('Synthetic name fixture deadline');};
function fixture(state,extra={}){const store={get:()=>state,commit(change){const next=structuredClone(state);change(next);next.revision++;state=next;}};return{store,engine:createEngine({store,transport:{ownUid:own,close(){},async connect(){return()=>{};},async read(){return{messages:[],hasMore:false,cursor:'0'};},...extra},assertCurrent:async()=>{},now:()=>100000,delay:async()=>{}})};}
(async()=>{
 const {initializationFailure}=require('../desktop/douyin-inbox.cjs');
 const failure=new TypeError('secret-cookie-user-message');failure.stack='TypeError: secret-cookie-user-message\n    at call (C:\\private\\account\\douyin-inbox-transport.cjs:90:5)';
 eq(initializationFailure(failure,'transport'),'私信初始化程序异常（阶段：transport；TypeError；位置：douyin-inbox-transport.cjs:90），本地存档保留');
 eq(initializationFailure(failure,'unknown'),undefined);eq(initializationFailure(Error('secret'),'transport'),undefined);
 const typed=new TypeError('The "signal" argument must be an AbortSignal. Received secret');typed.code='ERR_INVALID_ARG_TYPE';
 const typedResult=initializationFailure(typed,'transport');assert(typedResult.includes('ERR_INVALID_ARG_TYPE')&&typedResult.includes('参数：signal')&&!typedResult.includes('secret'));checks++;
 typed.code='secret-token';typed.message='The "secret-cookie" argument is invalid';assert(!initializationFailure(typed,'transport').includes('secret'));checks++;
 const stranger=c.thread({...raw,strangerInfo:{participants:[{userId:own,secUid:'MS4wOwn'},{userId:peer,secUid:sec,alias:'QA alias'}]}},own);
 eq(stranger.peerSecUid,sec);eq(stranger.name,'QA alias');
 let state=initial();state.people[peer+'/'+sec]=person;
 let f=fixture(state);try{const before=JSON.stringify(state);eq(f.engine.threads()[0].name,person.name);eq(f.engine.threads()[0].avatarUrl,person.avatarUrl);eq(f.engine.status().profileNames.resolved,1);eq(JSON.stringify(state),before);}finally{await f.engine.close();}
 // An incoming sender identifier resolves its own peer, never the outbound sender.
 state=initial();state.messages[id+'/400']=c.message(message,own);let requested=[];
 f=fixture(state,{async people(pairs){requested.push(...pairs);return [person];}});
 try{f.engine.messages(id);await until(()=>!f.engine.status().profileBusy);eq(requested,[{uid:peer,secUid:sec}]);eq(f.engine.threads()[0].name,person.name);eq(f.store.get().threads[id].peerSecUid,sec);}finally{await f.engine.close();}
 for(const conflict of [true,false]){
  state=initial();state.messages[id+'/400']=c.message({...message,sender:conflict?peer:own},own);state.messages[id+'/401']=c.message({...message,serverMessageId:'401',sender:conflict?peer:own,secSender:'MS4wOther'},own);
  if(conflict){state.people[peer+'/'+sec]=person;state.people[peer+'/MS4wOther']={...person,secUid:'MS4wOther',name:'QA other identity'};}
  f=fixture(state);try{eq(f.engine.threads()[0].name,'昵称待同步');eq(f.engine.status().profileNames.resolved,0);}finally{await f.engine.close();}
 }
 state=initial();state.people[peer+'/'+sec]=person;state.threads[id].name='QA saved alias';state.threads[id].nameSource='alias';
 f=fixture(state);try{eq(f.engine.threads()[0].name,'QA saved alias');}finally{await f.engine.close();}
 // Real encoded stranger shape, including outbound-only threads.
 state=initial();state.threads={};let lookups=0;
 const encoded=c.encode('Response',{cmd:2047,sequenceId:'1',statusCode:0,body:{getRecentStrangerMessage:{hasMore:false,nextStrangerVersion:'0',messages:[{...raw,version:'1',strangerInfo:{participants:[{userId:peer,secUid:sec}]},messages:[{...message,sender:own,secSender:'MS4wOwn'}]}]}}});
 f=fixture(state,{async read(kind){return kind==='strangers'?c.page(kind,encoded,1):{messages:[],hasMore:false,cursor:'0'};},async people(pairs){lookups++;eq(pairs,[{uid:peer,secUid:sec}]);return[person];}});
 try{f.engine.start();await until(()=>!f.engine.status().busy&&!f.engine.status().profileBusy);eq(f.engine.threads()[0].name,person.name);eq(lookups,1);eq(f.engine.threads()[0].count,1);}finally{await f.engine.close();}
 console.log(JSON.stringify({checks,syntheticOnly:true,platformRequests:0,sends:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
