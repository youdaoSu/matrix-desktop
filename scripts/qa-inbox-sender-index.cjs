// Synthetic identities only. No user's archive, network, sends or receipts.
const assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const {createMessageIndex}=require(process.argv.find(v=>v.startsWith('--module='))?.slice(9)||'../desktop/douyin-inbox-index.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
let secReads=0;const messages={},threads={};
for(let t=0;t<300;t++){
 const threadId='thread-'+t,peer=String(1000+t);threads[threadId]={id:threadId,type:1,peer,nameSource:'fallback'};
 for(let n=0;n<100;n++){const id=String(t*100+n+1),m={id,threadId,index:String(n),sender:peer,messageType:7,status:0};Object.defineProperty(m,'senderSecUid',{enumerable:true,get(){secReads++;return 'MS4wSynthetic'+t;}});messages[id]=m;}
}
let state={revision:0,messages,threads,people:{}},index=createMessageIndex();index.get(state);const before=secReads,started=performance.now();
for(let n=0;n<40;n++){state={...state,revision:n+1,threads:{...state.threads,['thread-'+n]:{...state.threads['thread-'+n],messageRevision:n+1}}};eq(index.get(state).resolved.length,300);}
const elapsed=performance.now()-started,reads=secReads-before;
console.log(JSON.stringify({senderIndexBenchmark:{messages:30000,threadOnlyUpdates:40,messageIdentityReads:reads,elapsedMs:elapsed,syntheticOnly:true}}));
if(process.argv.includes('--benchmark-only'))process.exit(0);
eq(reads,0);eq(index.get(state).senderPairs.length,300);
const old=index.get(state);state={...state,revision:41,people:{'1000/MS4wConflict':{uid:'1000',secUid:'MS4wConflict',name:'Different identity'}}};
const conflict=index.get(state);eq(conflict.senderPairs,old.senderPairs);eq(conflict.resolved.find(t=>t.id==='thread-0').peerSecUid,undefined);eq(old.identityCandidates.get('1000').size,1);eq(conflict.identityCandidates.get('1000').size,2);
// Replacements, removals, source order and unqualified identifiers cannot leave
// stale sender membership. Compare index membership with the source records.
let seed=93,small={revision:0,messages:{},threads:{},people:{}};const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296),inc=createMessageIndex();
for(let step=0;step<70;step++){
 const next={...small.messages},key=String(Math.floor(random()*25));
 if(step%7===0)delete next[key];else next[key]={id:key,index:key,threadId:'g'+Math.floor(random()*4),sender:String(Math.floor(random()*3)),senderSecUid:step%3?'MS4wPair'+Math.floor(random()*3):undefined,messageType:7,status:0};
 small={...small,revision:step+1,messages:step%11===0?Object.fromEntries(Object.entries(next).reverse()):next};const actual=inc.get(small),seen=new Map(),expected=[];
 for(const m of Object.values(small.messages)){const key=m.sender+'/'+m.senderSecUid;if(!seen.has(key)){seen.set(key,{first:m,threads:new Set()});expected.push(seen.get(key));}seen.get(key).threads.add(m.threadId);}
 eq(actual.senderPairs.map(e=>[e.first,[...e.threads]]),expected.map(e=>[e.first,[...e.threads]]));
 for(const entry of expected)eq([...actual.sendersByUid.get(entry.first.sender).get(entry.first.senderSecUid).threads],[...entry.threads]);
}
async function inflight(){
 const {createEngine}=require('../desktop/douyin-inbox-engine.cjs'),c=require('../desktop/douyin-inbox-codec.cjs');
 const own='100',peer='200',sec='MS4wSyntheticPeer',ids=['800','801','802','803'];
 const thread=id=>({...c.thread({conversationId:id,conversationShortId:'300',conversationType:2},own),messageRevision:1,history:{done:true,cursor:'0',pages:1}});
 const msg=(id,n,secUid)=>c.message({conversationId:id,conversationShortId:'300',conversationType:2,serverMessageId:String(400+n),sender:peer,secSender:secUid,messageType:7,content:'{"text":"synthetic"}',version:'1'},own);
 let state={revision:0,threads:{[ids[0]]:thread(ids[0])},messages:{first:msg(ids[0],0,sec)},people:{},frontier:{},init:{done:true},strangers:{done:true}},release,calls=[];
 const store={get:()=>state,commit(change){const next=structuredClone(state);change(next);next.revision++;state=next;}};
 const engine=createEngine({store,assertCurrent:async()=>{},now:()=>100000,delay:async()=>{},transport:{ownUid:own,close(){},async people(pairs){calls.push(pairs);if(calls.length===1)return new Promise(resolve=>release=resolve);return [];}}});
 const until=async test=>{for(let n=0;n<500;n++){if(test())return;await new Promise(resolve=>setImmediate(resolve));}throw Error('Profile fixture deadline');};
 try{
  engine.messages(ids[0]);await until(()=>release);
  store.commit(next=>{for(let n=1;n<4;n++)next.threads[ids[n]]=thread(ids[n]);next.messages.new=msg(ids[1],1,sec);next.messages.conflict=msg(ids[2],2,'MS4wDifferent');next.messages.unknown=msg(ids[3],3,undefined);});
  release([{uid:peer,secUid:sec,name:'Synthetic person'}]);await until(()=>!engine.status().profileBusy);
  eq(calls[0],[{uid:peer,secUid:sec}]);eq(ids.map(id=>state.threads[id].messageRevision),[2,2,1,2]);eq(state.people[peer+'/'+sec].name,'Synthetic person');
 }finally{await engine.close();}
}
inflight().then(()=>console.log(JSON.stringify({checks,unchangedMessagesNotRescanned:true,inflightMessageMembershipVerified:true,identityConflictsPreserved:true,realRequests:0,sends:0}))).catch(error=>{console.error(error);process.exitCode=1;});
