// Actual engine, disposable in-memory state and deterministic transport only.
const assert=require('node:assert/strict');
const {createEngine}=require('../desktop/douyin-inbox-engine.cjs');
const own='9007199254740993',peerA='9007199254740995',peerB='9007199254740997',a=`0:1:${own}:${peerA}`,b=`0:1:${own}:${peerB}`;
let state={version:1,revision:0,threads:{},messages:{},init:{cursor:'0',done:false},strangers:{cursor:'0',done:false},frontier:{}},release,atSelected;
const calls=[],store={get:()=>state,commit(change){const next=structuredClone(state);change(next);next.revision++;state=next;}},first=new Promise(resolve=>release=resolve);
const until=async check=>{for(let n=0;n<300;n++){if(check())return;await new Promise(r=>setTimeout(r,2));}throw Error('Synthetic message priority deadline');};
const transport={ownUid:own,async read(kind,args){
 if(kind==='init')return {messages:[],conversations:[{id:a,shortId:'101',type:1},{id:b,shortId:'102',type:1}],hasMore:false,cursor:'0'};
 if(kind==='strangers')return {messages:[],hasMore:false,cursor:'0'};
 assert.equal(kind,'history');calls.push({id:args.id,cursor:args.cursor});if(calls.length===1)await first;if(args.id===b)atSelected=state.threads[a].history.cursor;
 const n=args.cursor==='0'?100:Number(args.cursor),peer=args.id===a?peerA:peerB;
 return {messages:[{conversationId:args.id,conversationShortId:args.shortId,conversationType:1,sender:peer,serverMessageId:String(BigInt(peer)*1000n+BigInt(n)),messageType:7,content:JSON.stringify({text:'Synthetic priority message'}),createTime:'1792512000',indexInConversationV2:String(n),version:'1'}],hasMore:args.id===a&&n>1,cursor:String(n-1)};
 },async connect(){return()=>{};},close(){}};
(async()=>{const engine=createEngine({transport,store,assertCurrent:async()=>{},now:()=>100000,delay:async()=>{}});try{
 engine.start();await until(()=>calls.length===1);assert.equal(calls[0].id,a);engine.messages(b);release();await until(()=>calls.length>=2);assert.equal(calls[1].id,b,'Selected conversation should get the next admitted page, before draining 100 pages of another conversation');
 assert.equal(atSelected,'99');console.log(JSON.stringify({selectedConversationNextPage:true,unfinishedHistoryCursorRetained:true,realUserProfileTouched:false,realPlatformRequests:0,sends:0,readReceipts:0}));
}finally{engine.close();release();}})().catch(error=>{console.error(error);process.exitCode=1;});
