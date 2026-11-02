// Lifecycle regression: delayed synthetic ownership, transport and image reads.
// No real profile, network, input, sends or notification-state changes.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {registerDouyinInbox}=require('../desktop/douyin-inbox.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const until=async fn=>{for(let n=0;n<300;n++){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Close fixture wait failed');};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zy8QAAAAASUVORK5CYII=','base64');
function fixture({waitAuth=false,waitAuthCall=1,waitTransport=false,waitImage=false,waitRead=false}={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-inbox-close-')),account={id:crypto.randomUUID(),platform:'douyin',connectorSessionId:crypto.randomUUID(),nativeAccountKey:'qa-close'},win={webContents:{id:1},isDestroyed:()=>false};
 const state={authCalls:0,transports:0,transportClosed:0,reads:0,images:0,sends:0};let handler,releaseAuth,releaseTransport,releaseImage,releaseRead;
 const transport={ownUid:'100',close(){state.transportClosed++;},connect:async()=>()=>{},sendText:async()=>{state.sends++;throw Error('No sends admitted by close fixture');},read:async kind=>{state.reads++;if(waitRead&&kind==='init')await new Promise(resolve=>releaseRead=resolve);return{hasMore:false,cursor:'0',conversations:kind==='init'?[{conversationId:'900',conversationType:2,conversationShortId:'901',conversationCoreInfo:{name:'QA群'}}]:[],messages:kind==='init'?[{conversationId:'900',conversationType:2,conversationShortId:'901',serverMessageId:'902',sender:'200',messageType:8,content:JSON.stringify({cover_url:'https://p1.byteimg.com/qa-cover'}),indexInConversation:'1',version:'1'}]:[]};}};
 const service=registerDouyinInbox({ipcMain:{handle:(_name,fn)=>handler=fn},getWindow:()=>win,authenticate:async()=>{state.authCalls++;if(waitAuth&&state.authCalls===waitAuthCall)await new Promise(resolve=>releaseAuth=resolve);return{userId:'qa-owner',account};},session:{fromPartition:()=>({})},safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('QA:'+s),decryptString:b=>b.toString().slice(3)},userData:directory,transportFactory:async()=>{state.transports++;if(waitTransport)await new Promise(resolve=>releaseTransport=resolve);return transport;},imageLoader:async(_descriptor,guard)=>{state.images++;await guard();if(waitImage)await new Promise(resolve=>releaseImage=resolve);await guard();return{dataUrl:'data:image/png;base64,'+png.toString('base64'),bytes:png.length};}});
 const call=(extra={})=>handler({sender:win.webContents},{command:'watch',accessToken:'qa-token',accountId:account.id,...extra});
 return{service,state,directory,call,authReady:()=>typeof releaseAuth==='function',transportReady:()=>typeof releaseTransport==='function',imageReady:()=>typeof releaseImage==='function',readReady:()=>typeof releaseRead==='function',releaseAuth:()=>releaseAuth(),releaseTransport:()=>releaseTransport(),releaseImage:()=>releaseImage(),releaseRead:()=>releaseRead(),dispose(){service.close();assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(directory).startsWith('matrix-inbox-close-'));fs.rmSync(directory,{recursive:true});}};
}
const snapshot=directory=>{const files=[];const walk=folder=>{for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())walk(file);else files.push([path.relative(directory,file),crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]);}};walk(directory);return files.sort((a,b)=>a[0].localeCompare(b[0]));};
(async()=>{
 for(const command of ['watch','resume','messages','attachment','send']){
  const f=fixture({waitAuth:true});try{const pending=f.call({command});eq(f.authReady(),true);f.service.close();f.releaseAuth();const result=await pending;eq(result.error,'抖音聊天读取已结束');eq(result.status,undefined);eq(result.attachment,undefined);eq(result.receipt,undefined);eq(f.state.transports,0);eq(f.state.sends,0);eq(fs.existsSync(path.join(f.directory,'douyin-inbox')),false);const auth=f.state.authCalls;eq((await f.call()).error,'抖音聊天读取已结束');eq(f.state.authCalls,auth);f.service.close();eq(snapshot(f.directory),[]);}finally{f.dispose();}
 }
 {const f=fixture({waitTransport:true});try{const pending=f.call();await until(f.transportReady);f.service.close();f.releaseTransport();eq((await pending).error,'抖音聊天读取已结束');eq(f.state.transports,1);eq(f.state.transportClosed,1);eq(f.state.reads,0);eq(fs.existsSync(path.join(f.directory,'douyin-inbox')),false);}finally{f.dispose();}}
 {const f=fixture({waitAuth:true,waitAuthCall:2});try{const pending=f.call();await until(f.authReady);eq((await f.call({command:'stop'})).stopped,true);f.releaseAuth();eq(typeof(await pending).error,'string');eq(f.state.transports,1);eq(f.state.transportClosed,1);eq(f.state.reads,0);eq(fs.existsSync(path.join(f.directory,'douyin-inbox')),false);}finally{f.dispose();}}
 {const f=fixture({waitRead:true});try{await f.call();await until(f.readReady);const before=snapshot(f.directory);f.service.close();f.releaseRead();await new Promise(resolve=>setTimeout(resolve,20));eq(snapshot(f.directory),before);eq((await f.call()).error,'抖音聊天读取已结束');eq(f.state.sends,0);}finally{f.dispose();}}
 {const f=fixture({waitImage:true});try{await f.call();await until(async()=>(await f.call()).status?.messageCount===1);const pending=f.call({command:'attachment',threadId:'900',messageId:'902'});await until(f.imageReady);const before=snapshot(f.directory);f.service.close();f.releaseImage();const result=await pending;eq(result.attachment,undefined);eq(typeof result.error,'string');eq(snapshot(f.directory),before);eq(f.state.images,1);eq(f.state.sends,0);}finally{f.dispose();}}
 // Hold an actual asynchronous archive flush. Stop/reopen must not create a
 // second writer, and a stop while reopen waits must cancel that new entry.
 {const f=fixture(),nativeSync=fs.fsync;let hold=true,held=[];
  fs.fsync=(fd,done)=>{if(hold)held.push(()=>nativeSync(fd,done));else nativeSync(fd,done);};
  try{
   await f.call();await until(()=>held.length>0);const before=snapshot(f.directory).filter(([file])=>file.endsWith('.bin'));eq(f.state.transports,1);
   eq((await f.call({command:'stop'})).stopped,true);const reopen=f.call();await new Promise(r=>setTimeout(r,20));eq(f.state.transports,1);
   eq((await f.call({command:'stop'})).stopped,true);hold=false;for(const release of held.splice(0))release();
   eq(typeof(await reopen).error,'string');await new Promise(r=>setTimeout(r,20));eq(snapshot(f.directory),before);eq(f.state.transports,1);
   await f.call();await until(async()=>(await f.call()).status?.historyComplete===true);eq(f.state.transports,2);eq((await f.call()).status.messageCount,1);await f.service.close();
  }finally{hold=false;for(const release of held.splice(0))release();fs.fsync=nativeSync;f.dispose();}
 }
 console.log(JSON.stringify({checks,closedAuthCannotStartCollector:true,lateTransportClosedWithoutArchive:true,lateReadAndImageWritesBlocked:true,closedHandlerDoesNotAuthenticate:true,idempotentClose:true,realUserProfileTouched:false,realPlatformRequests:0,realBusinessWrites:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});
