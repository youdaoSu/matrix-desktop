// Native endpoint for one owner-scoped worker. This is NOT renderer IPC.
// Native bindings, target frames, durable send intent and page lifecycle are
// independently rechecked before executing trusted imported adapter scripts.
const {idlePageProbeScript}=require('./vendor/hengyuan-interactions/src/idle-page.cjs');
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const ops=new Set(['scan','prepare','send','commit','receipt','probe','probeComposer','activateFirst','activateFollow','activateProfileTarget','scrollProfileTargets','selectThread','switchInbox','refreshOpen','refreshSort','idlePageProbe','prepare-recipient','profile-identity','recipient-entry','recipient-navigation','recipient-cleanup','inspect-welcome','own-fan-follow','own-fan-follow-status']);
function allowedUrl(platform,value,creation=false){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||u.href!==value||value.length>2048)return false;
  if(platform==='douyin'){
   if(u.hostname==='creator.douyin.com')return !u.search&&!u.hash&&/^\/creator-micro\/(?:interactive|data\/following)\/comment\/?$/.test(u.pathname);
   if(u.hostname!=='www.douyin.com')return false;
   if(/^\/user\/(?!self(?:\/|$))(?:MS4w[A-Za-z0-9_-]{1,256}|[1-9]\d{0,18})\/?$/.test(u.pathname))return !u.search&&!u.hash;
   return /^(?:\/chat(?:\/[^?#]*)?|\/jingxuan|\/)$/.test(u.pathname)&&!u.hash&&[...u.searchParams.keys()].every(name=>['isPopup','open_notice','imToSecUid'].includes(name)&&u.searchParams.getAll(name).length===1&&(name==='isPopup'?u.searchParams.get(name)==='1':name==='open_notice'?u.searchParams.get(name)==='true':/^MS4w[A-Za-z0-9_-]{1,256}$/.test(u.searchParams.get(name))));
  }
  if(platform==='xiaohongshu'&&u.hostname==='www.xiaohongshu.com')return !u.hash&&(/^\/chat(?:\/[^?#]*)?$/.test(u.pathname)&&[...u.searchParams.keys()].every(name=>['channel_id','channel_type','openUid'].includes(name)&&u.searchParams.getAll(name).length===1&&(name==='openUid'?/^[a-f0-9]{24}$/i:/^[A-Za-z0-9_-]{0,128}$/).test(u.searchParams.get(name)))||u.pathname==='/notification'&&!u.search||/^\/user\/profile\/[a-f0-9]{24}$/.test(u.pathname)&&!u.search);
 }catch{}return false;
}
function createBrowserHost({createWindow,getAccount,verifyOwner,verifyIntent,getExpectedIdentity,notify,paused=()=>false,now=Date.now,maxWindows=12,pagePool=new Set()}){
 if([createWindow,getAccount,verifyOwner,verifyIntent,getExpectedIdentity,notify,paused,now].some(fn=>typeof fn!=='function')||!Number.isInteger(maxWindows)||maxWindows<1||maxWindows>16||!(pagePool instanceof Set))throw Error('账号运营原生页面设置无效');
 const pages=new Map();let closed=false;
 const fail=(message,code='MATRIX_NATIVE_PAGE')=>Object.assign(Error(message),{code});
 function snapshot(page){const wc=page.win.webContents,alive=!page.win.isDestroyed()&&!wc.isDestroyed();let frame;if(alive&&wc.mainFrame)frame={url:wc.mainFrame.url,processId:wc.mainFrame.processId,routingId:wc.mainFrame.routingId,documentId:page.documentId};return{seq:++page.seq,url:alive?wc.getURL():page.lastUrl,visible:alive&&page.win.isVisible(),loading:alive&&wc.isLoadingMainFrame(),destroyed:!alive,expectedIdentity:page.identity,frame};}
 function emit(page,event,args=[]){try{notify({windowId:page.id,event,args,state:snapshot(page)});}catch{}}
 function checkDeadline(request){if(!Number.isSafeInteger(request.expiresAt)||request.expiresAt<=now()||request.expiresAt-now()>60000)throw fail('账号运营页面操作已过期，未执行','PAGE_OPERATION_TIMEOUT');}
 async function owner(page,request){
  checkDeadline(request);if(closed||page?.win.isDestroyed())throw fail('账号运营页面已停止');
  const a=getAccount(request.accountId);if(!a||page&&(a.id!==page.accountId||a.platform!==page.platform||a.binding!==page.binding))throw fail('账号绑定已变化，页面操作取消','MATRIX_BINDING_CHANGED');
  const verified=await verifyOwner(a);checkDeadline(request);
  const fresh=getAccount(a.id);if(closed||!fresh||fresh.binding!==a.binding||page&&page.binding!==fresh.binding)throw fail('账号绑定已变化，页面操作取消','MATRIX_BINDING_CHANGED');return {a:fresh,verified};
 }
 async function release(page){
  if(page.win.isDestroyed())return true;
  page.win.hide();if(page.uncertain){page.retained='unknown';return false;}
  let timer;try{
   const wc=page.win.webContents,url=wc.getURL();if(wc.isLoadingMainFrame()||!allowedUrl(page.platform,url)){page.retained='loading-or-unverified';return false;}
   if(page.followFinalized&&page.followDocument===page.documentId&&!page.win.isVisible()){
    const frame=wc.mainFrame,clean=await wc.executeJavaScript('('+require('./own-fan-follow.cjs').discardFollowPage.toString()+')()',false);
    if(clean===true&&!page.uncertain&&!page.win.isVisible()&&wc.mainFrame===frame&&wc.getURL()===url&&page.followDocument===page.documentId){page.releasing=true;page.win.destroy();return true;}
   }
   const before=wc.mainFrame,probe=await Promise.race([wc.executeJavaScript(idlePageProbeScript({platform:page.platform,url}),false),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),1500);timer.unref?.();})]);
   if(page.uncertain||page.win.isDestroyed()||page.win.isVisible()||wc.getURL()!==url||wc.mainFrame!==before||probe?.ok!==true||probe.safeToClose!==true){page.retained='draft-or-unverified';return false;}
   page.releasing=true;page.win.destroy();page.retained=null;return true;
  }catch{page.retained='unverified';return false;}finally{clearTimeout(timer);}
 }
 function handlers(page){
  const wc=page.win.webContents;
  wc.setAudioMuted(true);wc.on('will-attach-webview',event=>event.preventDefault());
  const navigation=(event,url)=>{if(!allowedUrl(page.platform,url)){event.preventDefault();page.blocked=true;page.retained='navigation-blocked';}};
  wc.on('will-navigate',navigation);wc.on('will-redirect',navigation);
  wc.setWindowOpenHandler(({url})=>{if(allowedUrl(page.platform,url)&&!closed&&!page.win.isDestroyed())void owner(page,{accountId:page.accountId,expiresAt:now()+10000}).then(()=>page.win.loadURL(url)).catch(()=>{});return{action:'deny'};});
  wc.on('did-start-navigation',(_event,url,inPlace,isMainFrame)=>{if(isMainFrame&&!inPlace)page.documentId++;page.lastUrl=url;emit(page,'did-start-navigation',[url,inPlace,isMainFrame]);});
  for(const event of ['dom-ready','did-finish-load'])wc.on(event,()=>emit(page,event));
  for(const event of ['did-navigate','did-navigate-in-page'])wc.on(event,(_event,url,...args)=>{page.lastUrl=url;emit(page,event,[url,...args.slice(0,3)]);});
  wc.on('did-fail-load',(_event,code,_description,url,isMainFrame)=>emit(page,'did-fail-load',[code,'官方页面载入未完成',url,isMainFrame]));
  wc.on('render-process-gone',()=>emit(page,'render-process-gone',[{reason:'gone'}]));
  page.win.on('hide',()=>emit(page,'hide'));
  page.win.on('close',event=>{if(page.releasing||closed)return;event.preventDefault();page.win.hide();emit(page,'close');});
  page.win.on('closed',()=>{pagePool.delete(page);emit(page,'closed');});
 }
 async function command(request){
  if(!request||!uuid(request.windowId)||typeof request.accountId!=='string'||typeof request.action!=='string'||!request.payload||typeof request.payload!=='object')throw fail('原生页面请求格式无效');
  let page=pages.get(request.windowId);const payload=request.payload;
  if(request.action==='create'){
   if(page||!['dm','comment','follow','fan-profile','fan-chat'].includes(payload.channel)||typeof payload.background!=='boolean')throw fail('页面创建参数无效');
   const {a,verified}=await owner(null,request);if(!allowedUrl(a.platform,payload.url,true))throw fail('页面不属于已允许的官方账号运营入口');
   for(const old of pagePool)if(old.win.isDestroyed())pagePool.delete(old);
   if(pagePool.size>=maxWindows)throw fail('账号运营后台页面达到资源上限；请处理保留页面后继续','MATRIX_PAGE_CAPACITY');
   const identity=await getExpectedIdentity(a,verified);checkDeadline(request);if(typeof identity!=='string'||!(a.platform==='douyin'?/^[1-9]\d{0,63}$/:/^[a-f0-9]{24}$/i).test(identity))throw fail('缺少与当前绑定对应的本人身份，未打开页面','MATRIX_BINDING_CHANGED');
   await owner(null,request);if(pages.has(request.windowId)||pagePool.size>=maxWindows)throw fail('后台页面或资源名额已变化，请稍后继续','MATRIX_PAGE_CAPACITY');const win=createWindow({account:verified,platform:a.platform,background:payload.background});
   page={id:request.windowId,accountId:a.id,platform:a.platform,channel:payload.channel,binding:a.binding,win,identity,documentId:0,seq:0,lastUrl:payload.url,uncertain:false,retained:null,busy:false,blocked:false};pages.set(page.id,page);pagePool.add(page);handlers(page);
   if(!payload.background)win.show();void win.loadURL(payload.url).catch(()=>emit(page,'did-fail-load',[-1,'官方页面载入未完成',payload.url,true]));return{value:true,state:snapshot(page)};
  }
  if(!page||page.accountId!==request.accountId)throw fail('页面不属于当前账号');
  if(['hide','release','close-response'].includes(request.action)){
   if(request.action==='hide'){if(!page.win.isDestroyed())page.win.hide();}
   else if(request.action==='release'||payload.prevented===false)await release(page);
   return{value:true,state:snapshot(page)};
  }
  await owner(page,request);if(page.blocked)throw fail('官网页面已离开允许入口，请到账号管理核对登录状态');
  const wc=page.win.webContents;
  if(request.action==='finalize'){
   const context=request.context;if(!context||!page.intent||context.claimId!==page.intent.claimId||context.replyId!==page.intent.replyId||context.outreachId!==page.intent.outreachId)throw fail('页面完成回执与持久任务不一致');
   const proof=await verifyIntent({...context,accountId:page.accountId,operation:'finalize',write:false});await owner(page,request);
   if(proof?.settled===true){page.uncertain=false;page.retained=null;page.intent=null;if(proof.followSettled===true){page.followFinalized=true;page.followDocument=page.documentId;}}
   return{value:!page.uncertain,state:snapshot(page)};
  }
  if(request.action==='show'||request.action==='focus'){if(request.action==='show')page.win.show();else page.win.focus();return{value:true,state:snapshot(page)};}
  if(request.action==='navigate'||request.action==='reload'){
   const url=request.action==='navigate'?payload.url:wc.getURL();if(!allowedUrl(page.platform,url))throw fail('官方页面导航地址未通过核验');
   if(page.uncertain)throw fail('此页面有未知发送结果，未覆盖原页面');await page.win.loadURL(url);await owner(page,request);return{value:true,state:snapshot(page)};
  }
  if(request.action!=='execute'||!request.context||!ops.has(payload.operation)||payload.operation!==request.context.operation||request.context.accountId&&request.context.accountId!==page.accountId||typeof payload.code!=='string'||!payload.code||Buffer.byteLength(payload.code)>512*1024)throw fail('页面操作范围或脚本无效');
  if(page.busy)throw fail('同一账号运营页面正在执行其他操作','MATRIX_PAGE_BUSY');
  const write=['send','commit','own-fan-follow'].includes(payload.operation),context=request.context;
  if(['own-fan-follow','own-fan-follow-status'].includes(payload.operation)&&(page.channel!=='fan-profile'||!uuid(context.outreachId)||!uuid(context.claimId)))throw fail('普通关注必须使用已领取的专用粉丝主页');
  if(write&&(!uuid(context.replyId)&&!uuid(context.outreachId)||!uuid(context.claimId)))throw fail('页面写入缺少持久任务及领取凭据');
  if(write&&(!Number.isSafeInteger(context.intentExpiresAt)||context.intentExpiresAt<=now()||context.intentExpiresAt-now()>60000))throw fail('本条发送确认已过期，未执行页面写入','PAGE_OPERATION_TIMEOUT');
  if(write&&page.uncertain&&page.intent?.claimId!==context.claimId)throw fail('此页面有未知发送结果，需先人工核对，未处理下一条消息');
  if(paused()&&!context.claimId)throw fail('当前窗口交互优先，后台只读检查暂时让步','MATRIX_UI_PRIORITY');
  page.busy=true;
  try{
   if(context.replyId||context.outreachId)await verifyIntent({...context,accountId:page.accountId,operation:payload.operation,write});
   await owner(page,request);const url=wc.getURL();if(!allowedUrl(page.platform,url))throw fail('当前页面已离开允许的官方入口');
   const frame=wc.mainFrame;
   if(payload.frame&&(!frame||frame.processId!==payload.frame.processId||frame.routingId!==payload.frame.routingId||frame.url!==payload.frame.url||page.documentId!==payload.frame.documentId))throw fail('页面执行上下文已变化，旧操作未执行','MATRIX_FRAME_CHANGED');
   checkDeadline(request);
   if(write&&context.intentExpiresAt!==undefined&&context.intentExpiresAt<=now())throw fail('本条发送确认已过期，未提交','PAGE_OPERATION_TIMEOUT');
   if(['commit','own-fan-follow','own-fan-follow-status'].includes(payload.operation)){if(payload.operation!=='own-fan-follow-status'){page.uncertain=true;page.retained='unknown';}page.intent={replyId:context.replyId,outreachId:context.outreachId,claimId:context.claimId};}
   const value=await (payload.frame?frame:wc).executeJavaScript(payload.code,false);await owner(page,request);
   if(value?.identity&&value.identity!==page.identity)throw fail('官网本人身份与绑定不一致，已停止当前操作','MATRIX_BINDING_CHANGED');
   return{value,state:snapshot(page)};
  }finally{page.busy=false;}
 }
 function resources(){return [...pages.values()].filter(page=>!page.win.isDestroyed()).map(page=>({id:page.id,accountId:page.accountId,platform:page.platform,visible:page.win.isVisible(),retained:page.retained,uncertain:page.uncertain}));}
 async function close(){closed=true;for(const page of pages.values())if(!page.win.isDestroyed())page.win.hide();await Promise.allSettled([...pages.values()].map(release));}
 return{command,resources,close};
}
module.exports={createBrowserHost,allowedUrl};
