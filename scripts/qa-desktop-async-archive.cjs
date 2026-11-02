// Synthetic archives/transport only. Never opens an installed user profile.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const {createStore}=require('../desktop/douyin-inbox-store.cjs'),{createEngine}=require('../desktop/douyin-inbox-engine.cjs'),codec=require('../desktop/douyin-inbox-codec.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-async-archive-'));let checks=0,number=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},turn=()=>new Promise(r=>setImmediate(r));
const until=async predicate=>{for(let n=0;n<1000;n++){if(predicate())return;await new Promise(r=>setTimeout(r,2));}throw Error('Synthetic archive fixture timeout');};
function fixture(){
 const directory=path.join(root,String(number++));let failure='',gate,release,flushes=0,protects=0;
 const io={...fs};for(const method of ['open','writeFile','fsync','close','rename'])io[method]=(...args)=>{
   const callback=args.pop();
   if(failure===method){if(method==='close')return fs.close(...args,()=>callback(Object.assign(Error('PRIVATE_NATIVE_DETAIL'),{code:'EIO'})));return setImmediate(()=>callback(Object.assign(Error('PRIVATE_NATIVE_DETAIL'),{code:'EIO'})));}
   if(method==='fsync'){flushes++;if(gate)return gate.then(()=>fs.fsync(...args,callback));}
   fs[method](...args,callback);
 };
 const native=process.versions.electron?require('electron').safeStorage:undefined;
 const options={directory,scope:['qa-async',number],asyncEngine:true,fileSystem:io,protect:text=>{if(failure==='encrypt')throw Error('PRIVATE_NATIVE_DETAIL');protects++;return native?native.encryptString(text):Buffer.from('QA:'+text);},unprotect:bytes=>native?native.decryptString(bytes):bytes.toString().slice(3)};
 const store=createStore(options),file=()=>path.join(directory,fs.readdirSync(directory).find(name=>name.endsWith('.bin')));
 return{store,options,directory,file,flushes:()=>flushes,protects:()=>protects,fail:value=>failure=value,block(){gate=new Promise(r=>release=r);},release(){gate=undefined;release();}};
}
module.exports=(async()=>{
 try{
 const f=fixture();f.store.commit(next=>{next.people={};next.lastSendAt=undefined;next.threads.t={id:'t',type:2,history:{pages:1,cursor:'0',done:true}};for(let n=0;n<42000;n++)next.messages['t/'+n]={threadId:'t',id:String(n+1),index:String(n),version:'1',text:'x'.repeat(320)};});
 const before=f.store.get();let ticks=0,maxGap=0,last=performance.now();const heartbeat=setInterval(()=>{const at=performance.now();maxGap=Math.max(maxGap,at-last);last=at;ticks++;},1);
 const began=performance.now();await f.store.commitEngineAsync(next=>{next.frontier.fixture=[{service:1,name:'test',value:'1'}];},['frontier']);clearInterval(heartbeat);
 const elapsed=performance.now()-began;assert(ticks>2);checks++;eq(f.store.get().messages,before.messages);assert.equal(f.store.get().messages,before.messages);checks++;
 const plaintext=f.options.unprotect(fs.readFileSync(f.file()));eq(require('../desktop/douyin-inbox-storage-codec.cjs').decodeArchiveText(plaintext),JSON.stringify(f.store.get()));eq(createStore(f.options).get(),JSON.parse(JSON.stringify(f.store.get())));
 const protects=f.protects(),flushes=f.flushes(),same=f.store.get();await f.store.commitEngineAsync(()=>{},['messages','frontier']);eq(f.store.get(),same);eq(f.protects(),protects);eq(f.flushes(),flushes);
 for(const method of ['encrypt','open','writeFile','fsync','close','rename']){
  const old=f.store.get(),bytes=fs.readFileSync(f.file());f.fail(method);
  await assert.rejects(()=>f.store.commitEngineAsync(next=>{next.frontier.failed=method;},['frontier']),error=>!error.message.includes('PRIVATE')&&/encrypt|EIO/.test(error.message));checks++;f.fail('');
  assert.equal(f.store.get(),old);checks++;eq(fs.readFileSync(f.file()),bytes);eq(fs.readdirSync(f.directory).filter(name=>name.endsWith('.tmp')),[]);
 }
 const q=fixture();await q.store.commitEngineAsync(next=>{next.frontier.counter=0;},['frontier']);q.block();const one=q.store.commitEngineAsync(next=>{next.frontier.counter++;},['frontier']);await until(()=>q.flushes()===2);
 const two=q.store.commitEngineAsync(next=>{next.frontier.counter++;},['frontier']);eq(q.store.get().frontier.counter,0);assert.throws(()=>q.store.commit(()=>{}),/正在保存/);checks++;
 let drained=false;const drain=q.store.drain().then(()=>drained=true);await turn();eq(drained,false);q.release();await Promise.all([one,two,drain]);eq(q.store.get().frontier.counter,2);eq(createStore(q.options).get().frontier.counter,2);
 q.block();let open=true;const original=q.store.get(),bytes=fs.readFileSync(q.file()),flush=q.flushes();const cancelled=q.store.commitEngineAsync(next=>{next.frontier.cancelled=true;},['frontier'],()=>{if(!open)throw Error('closed');});const rejected=assert.rejects(()=>cancelled);await until(()=>q.flushes()>flush);open=false;q.release();await rejected;checks++;await q.store.drain();eq(q.store.get(),original);eq(fs.readFileSync(q.file()),bytes);
 const b=fixture();await b.store.commitEngineAsync(next=>{next.frontier.n=0;},['frontier']);b.block();const many=[];
 for(let n=0;n<128;n++)many.push(b.store.commitEngineAsync(next=>{next.frontier.n++;},['frontier']));await assert.rejects(()=>b.store.commitEngineAsync(()=>{},['frontier']),/队列已满/);checks++;b.release();await Promise.all(many);eq(b.store.get().frontier.n,128);
 // Push QoS is blocked on real async fsync, and failure never advances cursor.
 const p=fixture();let receive;const transport={ownUid:'100',close(){},connect:async callbacks=>{receive=callbacks.onFrame;return()=>{};},read:async()=>({messages:[],conversations:[],cursor:'0',hasMore:false})};
 const engine=createEngine({store:p.store,transport,assertCurrent:async()=>{},delay:async()=>{}});engine.start();await until(()=>receive&&!engine.status().busy);
 const frame={seqid:'1',logid:'2',frameType:32,service:1,method:1,headers:[{key:'cursor_file_name',value:'qa'},{key:'need_ack',value:'1'}],payload:codec.encodeCursors([{service:1,name:'fixture',value:'1'}])};
 let acks=0;p.block();const previousFlush=p.flushes(),push=receive(frame,()=>acks++);await until(()=>p.flushes()>previousFlush);eq(acks,0);eq(p.store.get().frontier.qa,undefined);p.release();await push;eq(acks,1);eq(p.store.get().frontier.qa[0].value,'1');
 p.fail('fsync');await assert.rejects(()=>receive({...frame,payload:codec.encodeCursors([{service:1,name:'fixture',value:'2'}])},()=>acks++));checks++;p.fail('');eq(acks,1);eq(p.store.get().frontier.qa[0].value,'1');
 p.block();const closeFlush=p.flushes(),closingPush=receive({...frame,payload:codec.encodeCursors([{service:1,name:'fixture',value:'3'}])},()=>acks++),closeFailure=assert.rejects(()=>closingPush);await until(()=>p.flushes()>closeFlush);let closeDone=false;const closing=Promise.resolve(engine.close()).then(()=>closeDone=true);await turn();eq(closeDone,false);p.release();await closeFailure;await closing;eq(acks,1);eq(p.store.get().frontier.qa[0].value,'1');
 // Two concurrent clicks with the same request ID cannot pass the reservation
 // check together after the new asynchronous write yields to the event loop.
 const s=fixture();await s.store.commitEngineAsync(next=>{next.threads['900']={id:'900',shortId:'901',type:2,history:{cursor:'0',pages:0,done:true}};},['threads']);let sends=0;
 const sending=createEngine({store:s.store,assertCurrent:async()=>{},transport:{ownUid:'100',close(){},sendText:async({requestId})=>{sends++;return{state:'confirmed',requestId};}}}),requestId=crypto.randomUUID();
 s.block();const sendFlush=s.flushes(),first=sending.sendText('900','QA fake send',requestId),repeat=sending.sendText('900','QA fake send',requestId);await until(()=>s.flushes()>sendFlush);eq(sends,0);s.release();eq((await first).state,'confirmed');eq((await repeat).state,'confirmed');eq(sends,1);await sending.close();
 // The actual main quit handler must defer backend/DB cleanup until drain.
 const main=fs.readFileSync(require.resolve('../desktop/main.cjs'),'utf8'),start=main.indexOf('let inboxQuitPending='),end=main.indexOf("app.on('activate'",start);assert(start>0&&end>start);checks++;
 let handler,finish,quits=0;const events=[],context={oneClickComments:{close:async()=>events.push('comments-stopped')},accountOperations:{close:async()=>events.push('operations-stopped')},app:{on:(_name,fn)=>handler=fn,quit:()=>quits++},startupAbort:{abort:()=>events.push('abort')},douyinInbox:{close:()=>new Promise(r=>finish=r)},windowInteractionLease:{close:()=>events.push('window-lease-closed')},cleanupResources:items=>{for(const [name,run]of items){events.push(name);run();}return[];},douyinInteractions:{close(){}},douyinCreatorReader:{close(){}},douyinBrowserReader:{close(){}},publishPreview:{close(){}},edgeEmbed:{close(){}},serverProcess:{killed:false,kill:()=>events.push('server-stopped')},stopEmbeddedDatabase:()=>events.push('database-stopped'),Promise};vm.runInNewContext(main.slice(start,end),context);
 let prevented=0;handler({preventDefault:()=>prevented++});handler({preventDefault:()=>prevented++});await turn();eq(prevented,2);eq(events.includes('database-stopped'),false);eq(events.includes('window-lease-closed'),false);eq(events.filter(x=>x.endsWith('-stopped')),['comments-stopped','operations-stopped']);assert.equal(typeof finish,'function');checks++;finish();await turn();eq(quits,1);handler({preventDefault:()=>prevented++});eq(events.at(-1),'database-stopped');eq(prevented,2);eq(events.filter(event=>event==='window-lease-closed').length,1);
 console.log(JSON.stringify({asyncArchiveChecks:checks,syntheticMessages:42000,heartbeatTicksDuringLargeSave:ticks,maxHeartbeatGapMs:maxGap,largeSaveWallMs:elapsed,nativeDpapi:!!process.versions.electron,exactDecodedArchive:true,legacyReadPreserved:true,atomicFailureRollback:true,serializedTransactions:true,fsyncBeforeAck:true,shutdownDrainBeforeDatabase:true,realProfileTouched:false,realRequests:0}));
 }finally{if(path.dirname(fs.realpathSync(root))!==fs.realpathSync(os.tmpdir())||!path.basename(root).startsWith('matrix-async-archive-'))throw Error('Unexpected fixture directory');fs.rmSync(root,{recursive:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
