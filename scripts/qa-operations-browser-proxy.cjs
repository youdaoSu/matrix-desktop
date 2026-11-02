// Worker facade contracts only. Fake native endpoints, no Electron or network.
const assert=require('node:assert/strict'),{createBrowserProxy}=require('../desktop/account-operations-browser-proxy.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},reject=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++;};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const accounts=new Map([['a',{id:'a',platform:'douyin',binding:'qa-owner-a'}],['b',{id:'b',platform:'xiaohongshu',binding:'qa-owner-b'}]]),calls=[],states=new Map(),errors=[];
 const frame=(url,documentId=1)=>({url,processId:10,routingId:20,documentId});
 const call=async request=>{
  calls.push(request);let state=states.get(request.windowId);
  if(request.action==='create'){state={seq:0,url:request.payload.url,visible:!request.payload.background,loading:false,destroyed:false,frame:frame(request.payload.url),expectedIdentity:request.accountId==='a'?'100':'bbbbbbbbbbbbbbbbbbbbbbbb'};states.set(request.windowId,state);return{state,value:true};}
  if(request.action==='execute'){
   if(request.payload.frame&&request.payload.frame.documentId!==state.frame.documentId)throw Object.assign(Error('Stale frame'),{code:'FRAME_STALE'});
   return {state:{...state},value:{operation:request.context.operation,replyId:request.context.replyId,accountId:request.accountId}};
  }
  state={...state,seq:state.seq+1};if(request.action==='navigate'){state.url=request.payload.url;state.frame=frame(state.url,state.frame.documentId+1);}if(request.action==='show')state.visible=true;if(request.action==='hide')state.visible=false;if(request.action==='release')state.destroyed=true;states.set(request.windowId,state);return{state,value:true};
 };
 const proxy=createBrowserProxy({call,getAccount:id=>accounts.get(id),onError:error=>errors.push(error.code)}),a=proxy.createWindow(accounts.get('a'),'dm','https://www.douyin.com/chat?isPopup=1',{background:true}),b=proxy.createWindow(accounts.get('b'),'dm','https://www.xiaohongshu.com/chat',{background:true});
 await Promise.all([a.ready,b.ready]);eq(calls.filter(call=>call.action==='create').length,2);eq(a.isVisible(),false);eq(a.webContents.mainFrame.url,a.webContents.getURL());
 const count=calls.length;await reject(()=>a.webContents.executeJavaScript('1'),/缺少已核验/);eq(calls.length,count);
 const result=await proxy.withOperation('scan',()=>a.webContents.executeJavaScript('({ok:true})'),{accountId:'a',replyId:'qa-reply-a'});eq(result,{operation:'scan',replyId:'qa-reply-a',accountId:'a'});eq(calls.at(-1).payload.code,'({ok:true})');eq(calls.at(-1).expiresAt>Date.now()-100,true);
 await reject(()=>proxy.withOperation('commit',()=>a.webContents.executeJavaScript('1'),{accountId:'b'}),/目标账号不一致/);eq(calls.length,count+1);
 await reject(()=>proxy.withOperation('send',()=>a.webContents.executeJavaScript('x'.repeat(513*1024))),/脚本或手势/);await reject(()=>proxy.withOperation('send',()=>a.webContents.executeJavaScript('1',true)),/脚本或手势/);await reject(()=>a.webContents.executeJavaScriptInIsolatedWorld(),/未验证页面/);
 const [ra,rb]=await Promise.all([proxy.withOperation('receipt',async()=>{await sleep(10);return a.webContents.executeJavaScript('1');},{accountId:'a',replyId:'qa-reply-a'}),proxy.withOperation('prepare',async()=>{await sleep(1);return b.webContents.executeJavaScript('2');},{accountId:'b',replyId:'qa-reply-b'})]);eq(ra.replyId,'qa-reply-a');eq(rb.replyId,'qa-reply-b');eq(ra.accountId,'a');eq(rb.accountId,'b');
 const old=a.webContents.mainFrame;let ready=0;a.webContents.on('dom-ready',()=>ready++);
 const sa=states.get(a.id);sa.seq++;sa.url='https://www.douyin.com/chat?isPopup=1&qa=1';sa.frame={...sa.frame,url:sa.url};proxy.receive({windowId:a.id,event:'dom-ready',state:{...sa},args:[]});eq(a.webContents.mainFrame,old);eq(old.url,sa.url);eq(ready,1);
 proxy.receive({windowId:a.id,event:'did-finish-load',state:{...sa,seq:sa.seq-1,url:'https://invalid.example/'},args:[]});eq(a.webContents.getURL(),sa.url);
 sa.seq++;sa.frame=frame(sa.url,2);proxy.receive({windowId:a.id,event:'dom-ready',state:{...sa},args:[]});eq(a.webContents.mainFrame!==old,true);await reject(()=>proxy.withOperation('scan',()=>old.executeJavaScript('1')),/Stale frame/);eq(await proxy.withOperation('scan',()=>a.webContents.mainFrame.executeJavaScript('1')),{operation:'scan',replyId:undefined,accountId:'a'});
 let closes=0;a.on('close',event=>event.preventDefault());a.on('closed',()=>closes++);proxy.receive({windowId:a.id,event:'close',state:{...sa},args:[]});await sleep(1);eq(calls.at(-1).action,'close-response');eq(calls.at(-1).payload.prevented,true);eq(closes,0);
 const previous=accounts.get('a');accounts.set('a',{...previous,binding:'DIFFERENT_NATIVE_BINDING'});await reject(()=>proxy.withOperation('scan',()=>a.webContents.executeJavaScript('1')),/绑定已改变/);accounts.set('a',previous);
 a.destroy();await sleep(1);eq(closes,1);eq(a.isDestroyed(),true);proxy.receive({windowId:a.id,event:'closed',state:{...states.get(a.id),seq:100,destroyed:true},args:[]});await sleep(1);eq(closes,1);await reject(()=>proxy.withOperation('scan',()=>a.webContents.executeJavaScript('1')),/页面已结束/);
 proxy.close();await sleep(1);eq(b.isVisible(),false);eq(b.isDestroyed(),false);eq(calls.some(call=>call.windowId===b.id&&call.action==='release'),false);assert.throws(()=>proxy.createWindow(accounts.get('b'),'dm','https://www.xiaohongshu.com/chat'),/渠道无效/);checks++;
 const broken=createBrowserProxy({call:async()=>null,getAccount:id=>accounts.get(id),onError:error=>errors.push(error.code)}),bad=broken.createWindow(accounts.get('a'),'dm','https://www.douyin.com/chat',{background:true});eq(await bad.ready,false);eq(bad.isDestroyed(),true);eq(errors.includes('MATRIX_PAGE_PROXY'),true);broken.close();
 const slow=createBrowserProxy({call:async request=>request.action==='create'?{state:{seq:0,url:'https://www.douyin.com/chat',visible:false,loading:false,destroyed:false,frame:frame('https://www.douyin.com/chat')},value:true}:new Promise(()=>{}),getAccount:id=>accounts.get(id),operationTimeoutMs:20});const timed=slow.createWindow(accounts.get('a'),'dm','https://www.douyin.com/chat',{background:true});await timed.ready;await reject(()=>slow.withOperation('scan',()=>timed.webContents.executeJavaScript('1')),/等待超时/);slow.close();
 let liveClaim,allowSettlement=false;const dynamicCalls=[];
 const dynamic=createBrowserProxy({getAccount:id=>accounts.get(id),getIntent:context=>context.replyId?{replyId:context.replyId,...(liveClaim?{claimId:liveClaim}:{})}:null,call:async request=>{dynamicCalls.push(request);const result=await call(request);return request.action==='finalize'?{...result,value:allowSettlement}:result;}});
 const dw=dynamic.createWindow(accounts.get('a'),'dm','https://www.douyin.com/chat',{background:true});await dw.ready;
 await dynamic.withOperation('prepare',async()=>{await dw.webContents.executeJavaScript('1');liveClaim='claim-after-preparation';await dynamic.withOperation('commit',()=>dw.webContents.executeJavaScript('2'));},{accountId:'a',replyId:'late-reply'});
 eq(dynamicCalls.find(c=>c.payload.operation==='prepare').context.claimId,undefined);eq(dynamicCalls.find(c=>c.payload.operation==='commit').context.claimId,'claim-after-preparation');
 eq(await dynamic.finalizeIntent({accountId:'a',replyId:'other',claimId:liveClaim}),{matched:0,settled:0});
 eq(await dynamic.finalizeIntent({accountId:'a',replyId:'late-reply',claimId:liveClaim}),{matched:1,settled:0});
 allowSettlement=true;eq(await dynamic.finalizeIntent({accountId:'a',replyId:'late-reply',claimId:liveClaim}),{matched:1,settled:1});eq(await dynamic.finalizeIntent({accountId:'a',replyId:'late-reply',claimId:liveClaim}),{matched:0,settled:0});
 await reject(()=>dynamic.withOperation('send',()=>dw.webContents.executeJavaScript('1'),{accountId:'a',replyId:'late-reply',claimId:'stale-claim'}),/凭据已变化/);dynamic.close();
 console.log(JSON.stringify({workerBrowserProxyChecks:checks,privateOperationScopeRequired:true,concurrentAccountScopesIndependent:true,sameDocumentFrameIdentityPreserved:true,staleDocumentFrameRefused:true,oldBindingDoesNotExecute:true,closeHidesWithoutDestroyingUnknownDrafts:true,nativeWindowCreated:false,realPlatformRequests:0,installedProfileTouched:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
