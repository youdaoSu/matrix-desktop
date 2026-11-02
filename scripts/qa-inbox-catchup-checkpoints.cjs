// Actual engine/store, disposable synthetic data. No real profiles or requests.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createStore}=require('../desktop/douyin-inbox-store.cjs'),codec=require('../desktop/douyin-inbox-codec.cjs');
const defaultEngine=require('../desktop/douyin-inbox-engine.cjs').createEngine;
const own='9007199254740993';let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const until=async test=>{for(let n=0;n<2000;n++){if(test())return;await new Promise(resolve=>setTimeout(resolve,2));}throw Error('Synthetic checkpoint deadline');};
async function scenario({count=33,mode='empty',extra=0,createEngine=defaultEngine}={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-catchup-checkpoint-'));let engine,clock=100000,reads=0,writes=0,encryptedBytes=0,failRename=false,renameFailures=0,changedObserved=false;
 const threads=[],raws=[],readCounts=new Map(),durableDuring=[];
 const io=Object.create(fs);io.rename=(from,to,callback)=>{if(failRename){renameFailures++;queueMicrotask(()=>callback(Object.assign(Error('synthetic disk full'),{code:'ENOSPC'})));}else fs.rename(from,to,callback);};
 const options={directory,scope:['checkpoint-fixture'],fileSystem:io,asyncEngine:true,protect:text=>{writes++;encryptedBytes+=Buffer.byteLength(text);return Buffer.from(text);},unprotect:bytes=>bytes.toString()};
 const store=createStore(options);
 try{
  store.commit(next=>{
   next.init.done=true;next.strangers.done=true;
   for(let n=0;n<count;n++){
    const peer=String(9007199254741001n+BigInt(n)),id=`0:1:${own}:${peer}`;
    const thread={...codec.thread({id,shortId:String(1000+n),type:1},own),history:{cursor:'1',done:true,pages:1},latestIndex:'100',catchup:'0'};
    const raw={conversationId:id,conversationShortId:thread.shortId,conversationType:1,sender:peer,serverMessageId:String(100000+n),messageType:7,content:JSON.stringify({text:'synthetic stored message'}),createTime:'1792512000',indexInConversationV2:'100',version:'1'};
    threads.push(thread);raws.push(raw);next.threads[id]=thread;const m=codec.message(raw,own);next.messages[id+'/'+m.id]=m;
   }
   for(let n=0;n<extra;n++){const raw={...raws[n%count],serverMessageId:String(200000+n),indexInConversationV2:String(n%99+1),content:JSON.stringify({text:crypto.createHash('sha512').update('synthetic-'+n).digest('base64')})},m=codec.message(raw,own);next.messages[m.threadId+'/'+m.id]=m;}
  });writes=0;encryptedBytes=0;
  const transport={ownUid:own,connect:async()=>()=>{},close(){},async read(kind,args){
   if(kind==='init')return {messages:[],conversations:[],cursor:'0',hasMore:false};
   if(kind==='strangers')return {messages:[],cursor:'0',hasMore:false};
   assert.equal(kind,'history');assert.equal(args.direction,'newer');reads++;readCounts.set(args.id,(readCounts.get(args.id)||0)+1);
   durableDuring.push(Object.values(store.get().threads).filter(t=>t.catchup==='0').length);
   if(mode==='timer')clock+=800;
   if(mode==='read-error'&&reads===3)throw Error('synthetic history failure');
   if(mode==='closed'&&reads===3){void engine.close();return {messages:[],cursor:'100',hasMore:false};}
   if(mode==='disk-error'&&reads===8||mode==='late-disk-error'&&reads===10)failRename=true;
   if(mode==='race'&&reads===2){
    const m=codec.message({...raws[0],serverMessageId:'999900',indexInConversationV2:'200'},own);
    await store.commitEngineAsync(next=>{next.messages[m.threadId+'/'+m.id]=m;next.threads[m.threadId].latestIndex='200';},['threads','messages']);
   }
   if(['new','edit','retract','older-version'].includes(mode)){
    if(reads===2)changedObserved=Object.values(store.get().messages).some(m=>m.id==='999999'||m.version==='2');
    if(args.id===threads[0].id){
     let raw={...raws[0],version:'2',content:JSON.stringify({text:'changed synthetic message'})};
     if(mode==='new')raw={...raw,serverMessageId:'999999',indexInConversationV2:'101'};
     if(mode==='retract')raw.status=4;
     if(mode==='older-version')raw.version='0';
     return {messages:[raw],cursor:'101',hasMore:false};
    }
   }
   return {messages:mode==='duplicate'?[raws[threads.findIndex(t=>t.id===args.id)]]:[],cursor:'100',hasMore:false};
  }};
  engine=createEngine({transport,store,assertCurrent:async()=>{},delay:async()=>{},now:()=>clock});
  const started=performance.now();engine.start();await until(()=>!engine.status().busy);await store.drain();
  const status=engine.status(),state=store.get(),writeCount=writes,writeBytes=encryptedBytes;
  const reopened=createStore(options).get();eq(JSON.stringify(reopened),JSON.stringify(state));
  const canonical={...state};delete canonical.revision;
  return {mode,count,reads,writes:writeCount,encryptedBytes:writeBytes,elapsedMs:performance.now()-started,renameFailures,changedObserved,durableDuring,readCounts:[...readCounts.values()],catchups:threads.map(t=>state.threads[t.id].catchup),historyComplete:status.historyComplete,error:status.error,messageCount:Object.keys(state.messages).length,stateDigest:crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex')};
 }finally{
  await engine?.close();await store.drain();assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('matrix-catchup-checkpoint-'));fs.rmSync(directory,{recursive:true});
 }
}
async function main(){
 for(const mode of ['empty','duplicate']){const r=await scenario({mode});eq(r.reads,33);eq(r.writes,8);eq(r.historyComplete,true);eq(r.catchups.every(v=>v==='0'),true);eq(r.durableDuring[7],0);eq(r.durableDuring[8],8);}
 for(const mode of ['new','edit','retract']){const r=await scenario({count:10,mode});eq(r.changedObserved,true);eq(r.writes,6);eq(r.reads,10);eq(r.historyComplete,true);eq(r.messageCount,mode==='new'?11:10);}
 const old=await scenario({count:10,mode:'older-version'});eq(old.changedObserved,false);eq(old.writes,5);eq(old.historyComplete,true);
 const failed=await scenario({count:10,mode:'disk-error'});eq(failed.renameFailures,1);eq(failed.historyComplete,false);eq(failed.catchups.every(v=>v==='100'),true);assert(failed.error.includes('ENOSPC'));checks++;
 const late=await scenario({count:10,mode:'late-disk-error'});eq(late.renameFailures,1);eq(late.catchups.slice(0,8).every(v=>v==='0'),true);eq(late.catchups.slice(8).every(v=>v==='100'),true);
 const interrupted=await scenario({count:10,mode:'read-error'});eq(interrupted.catchups.slice(0,2),['0','0']);eq(interrupted.catchups.slice(2).every(v=>v==='100'),true);eq(interrupted.historyComplete,false);eq(interrupted.error,'synthetic history failure');
 const closed=await scenario({count:10,mode:'closed'});eq(closed.catchups.every(v=>v==='100'),true);eq(closed.writes,3);
 const raced=await scenario({count:3,mode:'race'});eq(raced.readCounts[0],2);eq(raced.reads,4);eq(raced.historyComplete,true);eq(raced.messageCount,4);
 const timed=await scenario({count:5,mode:'timer'});eq(timed.writes,6);eq(timed.historyComplete,true);
 console.log(JSON.stringify({passed:true,checks,empty33ExpectedWritesBefore:36,empty33ActualWrites:8,newOrEditedMessagesImmediate:true,failedFlushNotRetried:true,closeRechecksUncommittedGETs:true,realProfiles:false,platformRequests:0,sends:0}));
}
module.exports={scenario,main};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
