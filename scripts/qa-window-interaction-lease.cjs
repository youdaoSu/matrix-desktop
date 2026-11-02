// In-memory native engine, synthetic socket frame, no OS input or real profile.
const assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createWindowInteractionLease}=require('../desktop/window-interaction-lease.cjs'),{createEngine}=require('../desktop/douyin-inbox-engine.cjs'),c=require('../desktop/douyin-inbox-codec.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const until=async test=>{for(let i=0;i<300;i++){if(test())return;await new Promise(resolve=>setImmediate(resolve));}throw Error('Offline interaction fixture did not settle');};
(async()=>{
 let clock=1000;const win=new EventEmitter();win.isDestroyed=()=>false;const lease=createWindowInteractionLease({now:()=>clock});lease.bind(win);eq(lease.paused(),false);win.emit('will-move');eq(lease.paused(),true);clock+=399;eq(lease.paused(),true);clock++;eq(lease.paused(),false);win.emit('will-resize');eq(lease.paused(),true);clock-=1;eq(lease.paused(),false);clock=2000;win.emit('will-move');
 const own='9007199254740993',peer='9007199254740995',thread=`0:1:${own}:${peer}`;
 let state={version:1,revision:0,threads:{},messages:{},init:{cursor:'0',done:false},strangers:{cursor:'0',done:false},frontier:{}},frameReceiver,reads=0,acks=0;const waits=[];
 const store={get:()=>state,commit(change){const next=structuredClone(state);change(next);next.revision++;state=next;}};
 const engine=createEngine({store,transport:{ownUid:own,async connect(callbacks){frameReceiver=callbacks.onFrame;callbacks.onStatus('connected');return()=>{};},async read(){reads++;return{messages:[],conversations:[],hasMore:false,cursor:'0'};},close(){}},assertCurrent:async()=>{},paused:()=>lease.paused(),delay:async ms=>{if(ms===1000&&lease.paused())await new Promise(resolve=>waits.push(resolve));},now:()=>clock});
 try{
  engine.start();await until(()=>waits.length&&frameReceiver);eq(reads,0);
  const message={conversationId:thread,conversationShortId:'101',conversationType:1,sender:peer,serverMessageId:'1234567890123456789',messageType:7,content:JSON.stringify({text:'Synthetic receive while moving'}),createTime:'1792512000',indexInConversationV2:'1',version:'1'};
  const payload=c.encode('Response',{cmd:500,sequenceId:'1',statusCode:0,body:{hasNewMessageNotify:{message,badgeCount:1}}});
  const frame=c.frame(c.encode('Frame',{seqid:'99',logid:'88',service:1,method:1,headers:[{key:'need_ack',value:'1'}],payloadType:'pb',payload}));
  await frameReceiver(frame,()=>{eq(Object.keys(state.messages).length,1);acks++;});eq(acks,1);eq(reads,0);eq(engine.status().messageCount,1);
  clock+=400;waits.splice(0).forEach(resolve=>resolve());await until(()=>!engine.status().busy);eq(reads>=3,true);eq(engine.status().messageCount,1);
 }finally{await engine.close();waits.splice(0).forEach(resolve=>resolve());lease.close();}
 eq(win.listenerCount('will-move'),0);eq(win.listenerCount('will-resize'),0);eq(win.listenerCount('closed'),0);eq(lease.paused(),false);
 assert.throws(()=>createWindowInteractionLease({quietMs:Infinity}));checks++;
 const other=new EventEmitter();other.isDestroyed=()=>false;const rebound=createWindowInteractionLease({now:()=>clock});rebound.bind(win);rebound.bind(other);eq(win.listenerCount('will-move'),0);let prevented=0;other.emit('will-move',{preventDefault(){prevented++;}});eq(rebound.paused(),true);eq(prevented,0);other.emit('closed');eq(rebound.paused(),false);eq(other.listenerCount('will-resize'),0);rebound.close();
 // Exercise the production inbox wiring too, not only createEngine's existing
 // pause callback. Fresh encrypted-mock archive and fake transport, no HTTP.
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{registerDouyinInbox}=require('../desktop/douyin-inbox.cjs');
 let handler,hold=true,pauseChecks=0,serviceReads=0;const wc={},account={id:'qa-lease-account',platform:'douyin',connectorSessionId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',nativeAccountKey:'qa-window'};
 const service=registerDouyinInbox({ipcMain:{handle:(_name,fn)=>{handler=fn;}},getWindow:()=>({isDestroyed:()=>false,webContents:wc}),authenticate:async()=>({userId:'qa-owner',account}),session:{fromPartition:()=>({})},safeStorage:{isEncryptionAvailable:()=>true,encryptString:text=>Buffer.from('QA:'+text),decryptString:bytes=>bytes.toString().slice(3)},userData:fs.mkdtempSync(path.join(os.tmpdir(),'matrix-window-history-qa-')),historyPaused:()=>{pauseChecks++;return hold;},transportFactory:async()=>({ownUid:own,async read(){serviceReads++;return{messages:[],conversations:[],hasMore:false,cursor:'0'};},async connect(callbacks){callbacks.onStatus('connected');return()=>{};},close(){}})});
 try{const result=await handler({sender:wc},{command:'watch',accessToken:'qa-only',accountId:account.id});eq(result.error,undefined);await until(()=>pauseChecks>0);eq(serviceReads,0);hold=false;for(let i=0;i<300&&serviceReads===0;i++)await new Promise(resolve=>setTimeout(resolve,5));eq(serviceReads>0,true);}finally{hold=false;await service.close();}
 console.log(JSON.stringify({windowInteractionChecks:checks,historyYieldsDuringSyntheticMove:true,pushStillPersistedBeforeAck:true,historyResumesAfterQuietLease:true,productionInboxPauseCallbackWired:true,nativeEventsPrevented:false,realWindowMoved:false,realPlatformRequests:0,realProfileTouched:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
