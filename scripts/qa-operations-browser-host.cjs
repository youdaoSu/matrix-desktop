// Native host with fake Electron windows. No actual UI, account, or network.
const assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{randomUUID}=require('node:crypto');
const {createBrowserHost,allowedUrl}=require('../desktop/account-operations-browser-host.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},reject=async(fn,re)=>{await assert.rejects(fn,re);checks++;};
class FakeWindow extends EventEmitter{
 constructor(){super();this.destroyed=false;this.visible=false;this.url='';this.loading=false;this.hasDraft=false;this.calls=[];this.result={ok:true,identity:'100'};const wc=new EventEmitter();this.webContents=wc;wc.isDestroyed=()=>this.destroyed;wc.getURL=()=>this.url;wc.isLoadingMainFrame=()=>this.loading;wc.setAudioMuted=value=>this.muted=value;wc.setWindowOpenHandler=fn=>this.open=fn;wc.executeJavaScript=async code=>{this.calls.push(code);return code.includes('safeToClose')?{ok:true,safeToClose:!this.hasDraft}:this.result;};}
 async loadURL(url){this.webContents.emit('did-start-navigation',{},url,false,true);this.url=url;this.webContents.mainFrame={url,processId:10,routingId:20,executeJavaScript:code=>this.webContents.executeJavaScript(code)};this.webContents.emit('dom-ready');this.webContents.emit('did-finish-load');}
 isDestroyed(){return this.destroyed;}isVisible(){return this.visible;}show(){this.visible=true;}hide(){if(this.visible){this.visible=false;this.emit('hide');}}focus(){}destroy(){this.destroyed=true;this.emit('closed');}
}
(async()=>{
 for(const value of ['http://www.douyin.com/chat','https://www.douyin.com.evil.test/chat','https://u:p@www.douyin.com/chat','https://www.douyin.com:443/chat','https://www.douyin.com/chat?isPopup=1&isPopup=1','https://www.douyin.com/jingxuan?imToSecUid=javascript:bad','https://www.xiaohongshu.com/chat?openUid=WRONG','https://www.xiaohongshu.com/notification?token=secret','https://creator.douyin.com/creator-micro/interactive/comment?token=secret','https://creator.douyin.com/creator-micro/interactive/comment#login'])eq(allowedUrl(value.includes('xiaohongshu')?'xiaohongshu':'douyin',value),false);
 eq(allowedUrl('douyin','https://www.douyin.com/?open_notice=true'),true);eq(allowedUrl('douyin','https://www.douyin.com/chat?isPopup=1'),true);eq(allowedUrl('xiaohongshu','https://www.xiaohongshu.com/chat?channel_id=&channel_type=web_engagement_notification_page'),true);
 const a={id:randomUUID(),platform:'douyin',binding:'QA_NATIVE_BINDING'},accounts=new Map([[a.id,a]]),wins=[],events=[],pool=new Set();let pause=false,authorize=true,settled=false,swap=false,identity='100';
 const options={createWindow:()=>{const w=new FakeWindow();wins.push(w);return w;},getAccount:id=>accounts.get(id),verifyOwner:async current=>{if(swap)accounts.set(a.id,{...a,binding:'DIFFERENT'});return{id:current.id};},verifyIntent:async context=>{if(!authorize)throw Error('Intent cancelled');return{settled};},getExpectedIdentity:async()=>identity,notify:event=>events.push(event),paused:()=>pause,pagePool:pool,maxWindows:2};
 const host=createBrowserHost(options),id=randomUUID(),request=(action,payload={},context=null,windowId=id)=>({windowId,accountId:a.id,action,payload,context,expiresAt:Date.now()+10000});
 await reject(()=>host.command({...request('create',{channel:'dm',url:'https://www.douyin.com/chat?isPopup=1',background:true}),expiresAt:Date.now()-1}),/已过期/);eq(wins.length,0);
 await reject(()=>host.command(request('create',{channel:'dm',url:'https://evil.test/',background:true})),/官方账号运营入口/);eq(wins.length,0);
 const opened=await host.command(request('create',{channel:'dm',url:'https://www.douyin.com/chat?isPopup=1',background:true}));eq(opened.state.expectedIdentity,'100');eq(wins.length,1);eq(wins[0].muted,true);eq(events.some(event=>event.event==='dom-ready'),true);eq(pool.size,1);
 await reject(()=>host.command({...request('show'),accountId:randomUUID()}),/不属于当前账号/);
 const execute=(operation,extra={})=>host.command(request('execute',{operation,code:'({ok:true})',...extra},{accountId:a.id,operation}));
 await reject(()=>host.command(request('execute',{operation:'scan',code:'1'})),/操作范围/);eq(wins[0].calls.length,0);
 pause=true;await reject(()=>execute('scan'),/交互优先/);eq(wins[0].calls.length,0);pause=false;
 const scan=await execute('scan');eq(scan.value.identity,'100');eq(wins[0].calls.length,1);
 await reject(()=>execute('scan',{frame:{processId:10,routingId:20,url:'https://wrong.test',documentId:0}}),/执行上下文/);eq(wins[0].calls.length,1);
 await reject(()=>execute('send'),/持久任务/);eq(wins[0].calls.length,1);
 const context={accountId:a.id,replyId:randomUUID(),claimId:randomUUID(),operation:'commit',intentExpiresAt:Date.now()+10000};
 await reject(()=>host.command(request('execute',{operation:'commit',code:'EXPIRED'},{...context,intentExpiresAt:Date.now()-1})),/确认已过期/);eq(wins[0].calls.length,1);
 authorize=false;await reject(()=>host.command(request('execute',{operation:'commit',code:'COMMIT'},context)),/Intent cancelled/);eq(wins[0].calls.length,1);authorize=true;
 await host.command(request('execute',{operation:'commit',code:'COMMIT'},context));eq(host.resources()[0].uncertain,true);eq(wins[0].calls.length,2);
 await reject(()=>host.command(request('execute',{operation:'send',code:'SEND'},{...context,operation:'send',claimId:randomUUID()})),/未知发送结果/);eq(wins[0].calls.length,2);
 await host.command(request('release'));eq(wins[0].destroyed,false);eq(host.resources()[0].retained,'unknown');
 await reject(()=>host.command(request('navigate',{url:'https://www.douyin.com/chat'})),/未知发送结果/);eq(wins[0].url,'https://www.douyin.com/chat?isPopup=1');
 await reject(()=>host.command(request('finalize',{}, {...context,claimId:randomUUID()})),/持久任务不一致/);
 eq((await host.command(request('finalize',{},context))).value,false);eq(host.resources()[0].uncertain,true);settled=true;eq((await host.command(request('finalize',{},context))).value,true);eq(host.resources()[0].uncertain,false);
 wins[0].hasDraft=true;await host.command(request('release'));eq(wins[0].destroyed,false);eq(host.resources()[0].retained,'draft-or-unverified');wins[0].hasDraft=false;await host.command(request('release'));eq(wins[0].destroyed,true);eq(pool.size,0);
 const id2=randomUUID();identity='200';await host.command(request('create',{channel:'dm',url:'https://www.douyin.com/chat',background:true},null,id2));wins[1].result={ok:true,identity:'OTHER'};await reject(()=>host.command(request('execute',{operation:'scan',code:'SCAN'},{operation:'scan'},id2)),/本人身份与绑定不一致/);
 swap=true;await reject(()=>host.command(request('show',{},null,id2)),/账号绑定已变化/);swap=false;accounts.set(a.id,a);
 const nativeClose={prevented:false,preventDefault(){this.prevented=true;}};wins[1].emit('close',nativeClose);eq(nativeClose.prevented,true);
 await host.close();const stoppedClose={prevented:false,preventDefault(){this.prevented=true;}};wins[1].emit('close',stoppedClose);eq(stoppedClose.prevented,false);
 const exhausted=createBrowserHost({...options,maxWindows:1});const fresh=randomUUID();await exhausted.command(request('create',{channel:'dm',url:'https://www.douyin.com/chat',background:true},null,fresh));const capped=createBrowserHost({...options,maxWindows:1});await reject(()=>capped.command(request('create',{channel:'dm',url:'https://www.douyin.com/chat',background:true},null,randomUUID())),/资源上限/);await exhausted.close();await capped.close();
 console.log(JSON.stringify({nativeBrowserHostChecks:checks,officialOriginsAndQueriesOnly:true,identityAndBindingRechecked:true,durableClaimRequiredBeforeWrites:true,unknownDeliveryPageRetained:true,confirmedLedgerRequiredToReleaseUnknown:true,draftsNotDestroyed:true,closeDoesNotBlockApplicationQuit:true,resourcePoolSharedAcrossOwners:true,nativeWindowsCreated:false,realPlatformRequests:0,installedProfileTouched:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
