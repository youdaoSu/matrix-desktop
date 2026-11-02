// Synthetic archive revisions only; never opens a user's archive or transport.
const assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const {createMessageIndex}=require(process.argv.find(v=>v.startsWith('--module='))?.slice(9)||'../desktop/douyin-inbox-index.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const messages={},threads={};
for(let t=0;t<500;t++){
 const threadId='thread-'+t;threads[threadId]={id:threadId,type:1,peer:String(1000+t),name:'Synthetic '+t,nameSource:'alias'};
 for(let m=0;m<100;m++){const id=String(t*1000+m+1);messages[threadId+'/'+id]={id,threadId,index:String(m+1),sender:String(1000+t),senderSecUid:'MS4wSynthetic'+t,messageType:7,status:0};}
}
let state={revision:0,messages,threads,people:{}},index=createMessageIndex(),samples=[],retained=0;
index.get(state);index.rows(state,'thread-499');
for(let iteration=0;iteration<24;iteration++){
 const previous=index.get(state),messageMap={...state.messages},threadId='thread-'+iteration;
 for(let m=0;m<50;m++){const id=String(1000000+iteration*50+m);messageMap[threadId+'/'+id]={id,threadId,index:String(101+m),sender:String(1000+iteration),messageType:7,status:0};}
 state={...state,revision:iteration+1,messages:messageMap};
 const started=performance.now(),current=index.get(state);samples.push(performance.now()-started);
 if(previous.threads.get('thread-499')===current.threads.get('thread-499'))retained++;
 eq(current.threads.get(threadId).visibleCount,150);eq(index.rows(state,threadId).at(-1).index,'150');
}
if(process.argv.includes('--verify-incremental'))eq(retained,24);
// A changed/removed last visible message, a move between buckets, and source
// ordering changes must all agree with a fresh index, including Int64 order.
let seed=1931;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
let small={revision:0,threads:{},people:{},messages:{}};const incremental=createMessageIndex();
for(let step=0;step<100;step++){
 const next={...small.messages},key='key-'+Math.floor(random()*70),old=next[key];
 if(step%9===0)delete next[key];else next[key]={id:String(9007199254740991n+BigInt(Number(key.slice(4)))),index:String(BigInt(Math.floor(random()*40))+9007199254740991n),threadId:'t-'+Math.floor(random()*4),status:step%5,messageType:step%7===0?50001:7};
 small={...small,revision:step+1,messages:step%11===0?Object.fromEntries(Object.entries(next).reverse()):next};
 const actual=incremental.get(small),fresh=createMessageIndex(),expected=fresh.get(small);
 eq([...actual.threads.keys()].sort(),[...expected.threads.keys()].sort());
 for(const [id,bucket]of expected.threads){const b=actual.threads.get(id);eq({last:b.last,lastVisible:b.lastVisible,count:b.visibleCount},{last:bucket.last,lastVisible:bucket.lastVisible,count:bucket.visibleCount});eq(incremental.rows(small,id),fresh.rows(small,id));}
}
const sorted=[...samples].sort((a,b)=>a-b);console.log(JSON.stringify({checks,messages:Object.keys(state.messages).length,revisions:samples.length,indexMs:{median:sorted[Math.floor(sorted.length/2)],max:sorted.at(-1),total:samples.reduce((a,b)=>a+b,0)},unchangedBucketsRetained:retained,syntheticOnly:true,realPlatformCalls:0}));
