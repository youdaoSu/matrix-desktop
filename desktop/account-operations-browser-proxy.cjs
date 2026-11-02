// Worker-side browser facade. Private RPC only: no Electron, credentials,
// network API, renderer IPC endpoint or arbitrary shell execution exists here.
const {EventEmitter}=require('node:events'),{AsyncLocalStorage}=require('node:async_hooks'),{randomUUID}=require('node:crypto');
const operations=new Set(['scan','prepare','send','commit','receipt','probe','probeComposer','activateFirst','activateFollow','activateProfileTarget','scrollProfileTargets','selectThread','switchInbox','refreshOpen','refreshSort','idlePageProbe','prepare-recipient','profile-identity','recipient-entry','recipient-navigation','recipient-cleanup','inspect-welcome']);
function createBrowserProxy({call,getAccount,getIntent=()=>null,onError=()=>{},now=Date.now,operationTimeoutMs=10000}){
 if(typeof call!=='function'||typeof getAccount!=='function'||typeof getIntent!=='function'||typeof onError!=='function'||typeof now!=='function'||!Number.isFinite(operationTimeoutMs)||operationTimeoutMs<10||operationTimeoutMs>60000)throw Error('账号运营页面代理参数无效');
 const windows=new Map(),scope=new AsyncLocalStorage();let closed=false;
 const failure=(message,code='MATRIX_PAGE_PROXY')=>Object.assign(Error(message),{code});
 function report(error){try{onError(error);}catch{}}
 function withOperation(operation,action,extra={}){
  if(!operations.has(operation)||typeof action!=='function'||!extra||typeof extra!=='object')throw failure('页面操作类型未核验');
  return scope.run({...scope.getStore(),...extra,operation},action);
 }
 class RemoteContents extends EventEmitter{
  constructor(win){super();this.win=win;this.frame=null;this.frameData=null;}
  getURL(){return this.win.state.url;}
  isDestroyed(){return this.win.isDestroyed();}
  isLoading(){return this.win.state.loading;}
  isLoadingMainFrame(){return this.win.state.loading;}
  reload(){this.win.fire('reload');}
  get mainFrame(){return this.frame;}
  _frame(value){
   if(!value){this.frame=null;this.frameData=null;return;}
   if(this.frameData?.routingId===value.routingId&&this.frameData?.processId===value.processId&&this.frameData?.documentId===value.documentId){this.frameData.url=value.url;return;}
   const owner=this,data={...value};this.frameData=data;this.frame=Object.freeze({get url(){return data.url;},processId:data.processId,routingId:data.routingId,
    executeJavaScript(code,gesture=false){return owner._execute(code,gesture,{processId:data.processId,routingId:data.routingId,documentId:data.documentId,url:data.url});}});
  }
  _execute(code,gesture,frame){
   const context=scope.getStore();if(!context||!operations.has(context.operation))return Promise.reject(failure('页面脚本缺少已核验的操作范围'));
   if(typeof code!=='string'||!code||Buffer.byteLength(code)>512*1024||gesture!==false)return Promise.reject(failure('页面脚本或手势参数无效'));
   return this.win.request('execute',{code,operation:context.operation,...(frame?{frame}:{})},context);
  }
  executeJavaScript(code,gesture=false){return this._execute(code,gesture);}
  executeJavaScriptInIsolatedWorld(){return Promise.reject(failure('自定义未验证页面适配器未接入发送链路'));}
 }
 class RemoteWindow extends EventEmitter{
  constructor(account,channel,url,options){
   super();this.id=randomUUID();this.accountId=account.id;this.platform=account.platform;this.binding=account.binding;this.channel=channel;this.closedEvent=false;this.fatal=null;
   this.state={seq:-1,url:'',visible:!options.background,loading:true,destroyed:false,expectedIdentity:null};this.fireTasks=new Set();this.fireErrors=[];this.webContents=new RemoteContents(this);windows.set(this.id,this);
   this.ready=this.raw('create',{channel,url,background:options.background===true},null,25000).then(result=>{if(!result||!result.state)throw failure('页面创建回执无效');this.apply(result.state);return true;}).catch(error=>{this.fatal=error;report(error);return false;});
  }
  current(cleanup=false){
   if(cleanup)return;
   if(closed||this.state.destroyed)throw failure('账号运营页面已结束');if(this.fatal)throw this.fatal;
   const actual=getAccount(this.accountId);if(!actual||actual.id!==this.accountId||actual.platform!==this.platform||actual.binding!==this.binding)throw failure('账号绑定已改变，页面操作取消','MATRIX_BINDING_CHANGED');
  }
  raw(action,payload,context,timeoutMs=operationTimeoutMs){
   let timer;const started=now(),expiresAt=started+timeoutMs;
   return Promise.race([Promise.resolve().then(()=>call({windowId:this.id,accountId:this.accountId,action,payload,context:context?{...context}:null,expiresAt})),new Promise((_,reject)=>{timer=setTimeout(()=>reject(failure('账号运营页面操作等待超时；提交结果不能据此重发','PAGE_OPERATION_TIMEOUT')),timeoutMs);})]).finally(()=>clearTimeout(timer));
  }
  async request(action,payload={},context=null,cleanup=false){
   await this.ready;this.current(cleanup);
   if(context?.accountId&&context.accountId!==this.accountId)throw failure('页面操作与目标账号不一致','MATRIX_BINDING_CHANGED');
   if(action==='execute'&&context){
    // A preparation can await navigation before the store creates its durable
    // send claim. Resolve that claim here, never at outer async-scope entry.
    const intent=await getIntent({...context,accountId:this.accountId});this.current();
    if(intent!==null&&intent!==undefined){
     if(typeof intent!=='object'||Array.isArray(intent)||Object.keys(intent).some(key=>!['replyId','outreachId','claimId'].includes(key)))throw failure('持久操作凭据格式无效');
     for(const key of ['replyId','outreachId','claimId'])if(context[key]!==undefined&&intent[key]!==undefined&&context[key]!==intent[key])throw failure('持久操作凭据已变化，旧操作取消');
     context={...context,...intent,accountId:this.accountId};
    }
    if(payload.operation==='commit')this.lastIntent={accountId:this.accountId,replyId:context.replyId,outreachId:context.outreachId,claimId:context.claimId};
   }
   const result=await this.raw(action,payload,context);this.apply(result.state);this.current(cleanup);return result.value;
  }
  apply(value){
   if(!value||!Number.isSafeInteger(value.seq)||value.seq<=this.state.seq)return;
   if(typeof value.url!=='string'||typeof value.visible!=='boolean'||typeof value.loading!=='boolean'||typeof value.destroyed!=='boolean')throw failure('页面状态回执无效');
   this.state={...this.state,...value};this.webContents._frame(value.frame);
  }
  isDestroyed(){return this.state.destroyed||Boolean(this.fatal);}
  isVisible(){return !this.isDestroyed()&&this.state.visible;}
  loadURL(url){if(typeof url!=='string'||url.length>2048)return Promise.reject(failure('官方页面地址无效'));return this.request('navigate',{url});}
  fire(action,payload={},cleanup=false){const task=this.request(action,payload,null,cleanup);this.fireTasks.add(task);void task.then(()=>this.fireTasks.delete(task),error=>{this.fireTasks.delete(task);this.fireErrors.push(error);if(this.fireErrors.length>5)this.fireErrors.shift();report(error);});}
  show(){this.state.visible=true;this.fire('show');}
  hide(){this.state.visible=false;this.fire('hide',{},true);}
  focus(){this.fire('focus');}
  destroy(){if(this.state.destroyed)return;this.state.destroyed=true;this.webContents._frame(null);this.fire('release',{},true);this.emitClosed();}
  emitClosed(){if(this.closedEvent)return;this.closedEvent=true;queueMicrotask(()=>{this.webContents.emit('destroyed');this.emit('closed');});}
 }
 function createWindow(account,channel,url,options={}){
  if(closed||!account||!['douyin','xiaohongshu'].includes(account.platform)||typeof account.id!=='string'||!['dm','comment','follow','fan-profile','fan-chat'].includes(channel))throw failure('账号或页面渠道无效');
  const live=getAccount(account.id);if(!live||live.platform!==account.platform||typeof live.binding!=='string'||!live.binding)throw failure('账号尚未通过当前用户绑定核验');
  return new RemoteWindow(live,channel,url,options);
 }
 function receive(event){
  const win=windows.get(event?.windowId);if(!win)return false;win.apply(event.state);
  if(event.event==='closed'){win.state.destroyed=true;win.emitClosed();return true;}
  if(event.event==='close'){
   let prevented=false;win.emit('close',{preventDefault(){prevented=true;}});win.fire('close-response',{prevented},true);return true;
  }
  if(event.event==='hide'){win.state.visible=false;win.emit('hide');return true;}
  const allowed=new Set(['dom-ready','did-finish-load','did-start-navigation','did-navigate','did-navigate-in-page','did-fail-load','render-process-gone']);
  if(!allowed.has(event.event)||!Array.isArray(event.args)||event.args.length>6)return false;
  win.webContents.emit(event.event,{},...event.args);return true;
 }
 function close(){if(closed)return;closed=true;for(const win of windows.values())win.hide();}
 async function finalizeIntent(context){
  if(!context||typeof context!=='object'||!context.accountId||!context.claimId)throw failure('缺少待核对的持久发送凭据');
  const matches=[...windows.values()].filter(win=>win.lastIntent?.accountId===context.accountId&&win.lastIntent?.claimId===context.claimId&&win.lastIntent?.replyId===context.replyId&&win.lastIntent?.outreachId===context.outreachId);
  const results=await Promise.all(matches.map(async win=>{
   // A source helper may synchronously request destroy before our outer send
   // returns. Native release retains an uncertain page; wait for its actual
   // state instead of mistaking that local closed flag for a native destroy.
   await Promise.allSettled([...win.fireTasks]);if(win.state.destroyed){win.lastIntent=null;return true;}
   const settled=await win.request('finalize',{},context);if(settled===true){win.lastIntent=null;if(win.closedEvent)await win.request('release',{},null,true);}return settled===true;
  }));
  return{matched:matches.length,settled:results.filter(Boolean).length};
 }
 function snapshot(){return [...windows.values()].map(win=>({id:win.id,accountId:win.accountId,channel:win.channel,visible:win.isVisible(),destroyed:win.isDestroyed(),pending:win.state.loading}));}
 async function settleAccount(id){const alive=[...windows.values()].filter(win=>win.accountId===id&&!win.closedEvent);await Promise.all(alive.map(async win=>{if(!await win.ready)throw win.fatal||failure('官方页面未能建立');await Promise.all([...win.fireTasks]);if(win.fireErrors.length)throw win.fireErrors.shift();win.current();}));}
 return{createWindow,withOperation,receive,close,snapshot,finalizeIntent,settleAccount,currentOperation:()=>scope.getStore()?{...scope.getStore()}:null};
}
module.exports={createBrowserProxy};
