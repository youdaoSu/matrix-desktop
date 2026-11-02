const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { readPlatformProfile, bindingProfile } = require('./platform-profile.cjs');
const { isLoginPage } = require('./platform-session.cjs');
const { createEdgePageGuest, openEdgePublishEntry } = require('./edge-publish.cjs');
const { runOfficialDOM } = require('./official-dom.cjs');

function officialWechatUrl(value) {
  try { const url=new URL(value); return url.protocol==='https:'&&!url.username&&!url.password&&(url.hostname==='weixin.qq.com'||url.hostname.endsWith('.weixin.qq.com')); } catch { return false; }
}
function safeBounds(input) {
  if(!input||!['x','y','width','height'].every(key=>Number.isFinite(input[key])&&Math.abs(input[key])<=32768)) throw Error('嵌入区域尺寸无效');
  return {...Object.fromEntries(['x','y','width','height'].map(key=>[key,Math.max(0,Math.round(input[key]))])),visible:input.visible===true};
}
function createEdgeTransport(child, { timeout=10000 }={}) {
  const pending=new Map(), listeners=new Set(); let buffer='', closed=false;
  const fail=()=>{closed=true;for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('内嵌 Edge 页面已关闭'));}pending.clear();};
  child.once('exit',fail); child.once('error',fail);
  // A native page can exit between the writable check and the pipe write.
  // Stream errors must reject requests, never abort app/database shutdown.
  child.stdin.on('error',fail);
  child.stdout.setEncoding('utf8');
  child.stdout.on('data',chunk=>{
    buffer+=chunk;if(buffer.length>2097152){buffer='';fail();child.stdin.end();return;}
    let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);try{
      const message=JSON.parse(line);
      if(message.id){const item=pending.get(message.id);if(item){pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(Error(message.error)):item.resolve(message.result);}}
      else if(message.event) for(const listener of listeners) listener(message);
    }catch{/* Only framed JSON from our child is consumed. */}}
  });
  // Do not print SDK/browser output, URLs, profile folders or authentication data.
  child.stderr.resume();
  return {
    on(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    request(command,input={}){return new Promise((resolve,reject)=>{
      if(closed||!child.stdin.writable)return reject(Error('内嵌 Edge 页面已关闭'));
      const id=randomUUID(),timer=setTimeout(()=>{pending.delete(id);reject(Error('内嵌 Edge 页面响应超时'));},timeout);
      pending.set(id,{resolve,reject,timer});try{child.stdin.write(JSON.stringify({...input,id,command})+'\n',error=>{if(error)fail();});}catch{fail();}
    });},
    close(){const notify=!closed&&child.stdin.writable&&!child.stdin.destroyed;fail();listeners.clear();if(notify){try{child.stdin.end(JSON.stringify({command:'close'})+'\n');}catch{/* Parent-close watchdog also closes this owned native child. */}}},
  };
}

function registerEdgeEmbed({ipcMain,getWindow,authenticate,userData,helperPath,spawnHost=spawn,now=Date.now}) {
  const guests=new Map();
  const host=event=>{const win=getWindow();if(!win||win.isDestroyed()||event.sender!==win.webContents)throw Error('只允许远效主窗口使用内嵌 Edge');return win;};
  const tokenDigest=token=>{if(typeof token!=='string'||!token||token.length>8192)throw Error('请先登录远效');return createHash('sha256').update(token).digest('hex');};
  const owned=async(event,input,layoutOnly=false)=>{
    host(event);const guest=guests.get(input?.guestId);
    if(!guest||tokenDigest(input?.accessToken)!==guest.tokenDigest)throw Error('内嵌页面不属于当前登录用户或已关闭');
    // Layout/cleanup cannot read or operate the page. Avoid polling the backend
    // during every resize; all page operations revalidate the actual app owner.
    if(!layoutOnly){const auth=await authenticate(input.accessToken);if(auth.userId!==guest.ownerId)throw Error('内嵌页面不属于当前登录用户');}
    return guest;
  };
  const guarded=fn=>async(event,input)=>{try{return await fn(event,input);}catch(error){return {error:error instanceof Error?error.message:'内嵌 Edge 操作失败'};}};
  const openEdge=async(event,input,{resultOnly=false}={})=>{
    const win=host(event),auth=await authenticate(input?.accessToken);
    if(input?.platform!=='wechat'||!/^[a-z0-9-]{16,80}$/i.test(input.sessionId||''))throw Error('视频号会话参数无效');
    if(input.accountId){const verified=await authenticate(input.accessToken,input.accountId);if(verified.account.platform!=='wechat'||verified.account.connectorSessionId!==input.sessionId)throw Error('视频号会话与绑定账号不匹配');}
    if(guests.size>=12)throw Error('最多同时打开 12 个内嵌视频号页面，请先关闭不用的页面');
    if(process.platform!=='win32'||!fs.existsSync(helperPath))throw Error('此版本缺少 Windows 原生 Edge 控件，请安装完整的远效更新');
    // App-user + platform-session isolation. Never reuse/import the user's ordinary Edge profile or Electron cookies.
    const owner=createHash('sha256').update(auth.userId).digest('hex').slice(0,32);
    const profile=path.join(userData,'EdgeProfiles',owner,`wechat-${input.sessionId}`);
    fs.mkdirSync(profile,{recursive:true});
    const handle=win.getNativeWindowHandle();const hwnd=handle.length>=8?handle.readBigUInt64LE().toString():String(handle.readUInt32LE());
    const child=spawnHost(helperPath,[hwnd,profile],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    const transport=createEdgeTransport(child),guestId=randomUUID();
    const guest={guestId,ownerId:auth.userId,tokenDigest:tokenDigest(input.accessToken),sessionId:input.sessionId,transport,resultOnly,url:'',ready:false,embedded:false,identitySince:0,identity:'',seenBackend:false,loginLoop:false};
    guests.set(guestId,guest);
    child.once('exit',()=>{if(guests.get(guestId)===guest)guests.delete(guestId);});
    const ready=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Edge WebView2 启动超时，请检查运行时')),20000);
      transport.on(message=>{
        if(message.event==='ready'){guest.ready=true;guest.embedded=message.embedded===true;clearTimeout(timer);guest.embedded?resolve():reject(Error('Edge 未嵌入远效，已停止打开，未退回外部窗口'));}
        if(message.event==='fatal'){clearTimeout(timer);reject(Error(message.error||'Edge 控件初始化失败'));}
        if(message.event==='status'){
          const next=message.url||'';if(guest.url!==next){guest.identitySince=0;guest.identity='';}
          // A login/foreign route invalidates the in-memory own-account proof.
          // A normal home -> editor transition may retain it because the actual
          // editor need not render the homepage's profile card.
          const resultList=guest.resultOnly&&/^https:\/\/channels\.weixin\.qq\.com\/platform\/post\/list\/?$/.test(next);
          if(!resultList&&!/^https:\/\/channels\.weixin\.qq\.com\/platform(?:\/(?:home|post\/create))?\/?$/.test(next))guest.verifiedAccount=undefined;
          if(officialWechatUrl(next)&&!isLoginPage(next)&&new URL(next).pathname.startsWith('/platform'))guest.seenBackend=true;
          if(isLoginPage(next)&&guest.seenBackend)guest.loginLoop=true;
          guest.url=next;
          guest.lastStatus={guestId,url:next,title:String(message.title||'视频号官方页面').slice(0,120),ready:guest.ready,back:Boolean(message.back),forward:Boolean(message.forward),error:message.error||'',loginLoop:guest.loginLoop,navigationComplete:Boolean(message.navigationComplete),navigationRequestId:typeof message.navigationRequestId==='string'?message.navigationRequestId:''};
          if(!guest.resultOnly&&!win.isDestroyed())win.webContents.send('matrix:edge-status',guest.lastStatus);
        }
      });
      child.once('exit',()=>{clearTimeout(timer);reject(Error('内嵌 Edge 启动失败或已关闭'));});
    });
    try {await ready;return {guestId,engine:'webview2',embedded:true};}catch(error){guests.delete(guestId);transport.close();throw error;}
  };
  ipcMain.handle('matrix:edge-open',guarded(openEdge));
  ipcMain.handle('matrix:edge-control',guarded(async(event,input)=>{
    const command=input?.command,guest=await owned(event,input,['bounds','close'].includes(command));
    if(command==='close'){guests.delete(guest.guestId);guest.transport.close();return {ok:true};}
    if(command==='bounds'){
      return guest.transport.request(command,safeBounds(input));
    }
    if(['reload','back','forward'].includes(command))return guest.transport.request(command);
    if(command==='navigate'){if(!officialWechatUrl(input.url))throw Error('仅允许视频号官方网址');return guest.transport.request(command,{url:input.url});}
    if(command==='zoom'){if(!Number.isFinite(input.zoom))throw Error('页面缩放无效');return guest.transport.request(command,{zoom:Math.max(.5,Math.min(1.5,input.zoom))});}
    throw Error('不支持的内嵌页面操作');
  }));
  ipcMain.handle('matrix:edge-bind',guarded(async(event,input)=>{
    const guest=await owned(event,input);
    if(!officialWechatUrl(guest.url)||new URL(guest.url).hostname!=='channels.weixin.qq.com'||!/^\/platform(?:\/|$)/.test(new URL(guest.url).pathname)||isLoginPage(guest.url))return {error:guest.loginLoop?'手机确认后，官方页面仍退回了扫码页，尚未登录成功。请勿反复扫码，保留此页核验。':'请先在远效内的视频号官方页面扫码并在手机确认登录',loginLoop:guest.loginLoop,loginRequired:isLoginPage(guest.url)};
    // Only rendered own-account identity. No tokens, page store or private API reads.
    const script=`(${readPlatformProfile.toString()})('wechat')`;
    const profile=await guest.transport.request('profile',{script});
    if(!profile||isLoginPage(profile.pageUrl)||profile.loginVisible){guest.identity='';guest.identitySince=0;return {error:'视频号官方登录尚未完成',loginRequired:true};}
    const result=bindingProfile(profile,'视频号');if('error' in result){guest.identity='';guest.identitySince=0;return result;}
    if(guest.identity!==result.nickname){guest.identity=result.nickname;guest.identitySince=now();}
    if(now()-guest.identitySince<3000)return {error:'已识别视频号昵称，正在确认官方登录状态稳定…',pendingProfile:true};
    clearVerifiedLoginWarning(guest);
    return {platform:'wechat',sessionId:guest.sessionId,nickname:result.nickname,avatarUrl:result.avatarUrl,ownIdentity:result.ownIdentity,metrics:result.metrics,pageUrl:new URL(result.pageUrl).origin+new URL(result.pageUrl).pathname};
  }));
  function clearVerifiedLoginWarning(guest){
    if(!guest.loginLoop)return;
    guest.loginLoop=false;
    const win=getWindow();
    if(guest.lastStatus&&win&&!win.isDestroyed()){guest.lastStatus={...guest.lastStatus,loginLoop:false};if(!guest.resultOnly)win.webContents.send('matrix:edge-status',guest.lastStatus);}
  }
  const resolveContext=async(event,input)=>{
    const win=host(event),native=await owned(event,{...input,guestId:input?.edgeGuestId});
    if(input?.platform!=='wechat'||input.sessionId!==native.sessionId||!input.accountId||input.webContentsId!==0)throw Error('视频号原生会话与发布账号不匹配');
    const auth=await authenticate(input.accessToken,input.accountId);
    if(auth.userId!==native.ownerId||auth.account?.platform!=='wechat'||auth.account.connectorSessionId!==native.sessionId)throw Error('该原生页面不属于当前登录用户的绑定账号');
    const before=native.url;
    if(!officialWechatUrl(before)||new URL(before).hostname!=='channels.weixin.qq.com'||!/^\/platform(?:\/|$)/.test(new URL(before).pathname)||isLoginPage(before))throw Error('请先在当前视频号完成官方登录');
    let profile=await native.transport.request('profile',{script:`(${readPlatformProfile.toString()})('wechat')`});
    // Editor components may own the visible sidebar nickname. Read fresh
    // rendered identity there before falling back to the short-lived homepage
    // proof. Never extend that proof or infer the owner from task metadata.
    if(!profile?.nickname&&!profile?.loginVisible&&/^\/platform\/post\/(?:create|list)\/?$/.test(new URL(before).pathname)){
      if(!native.proxy)native.proxy=createEdgePageGuest(native,()=>guests.get(native.guestId)===native);
      try {const rendered=await runOfficialDOM(native.proxy,readPlatformProfile,['wechat'],'matrix-edge-owner-profile');if(rendered)profile=rendered;}
      catch {/* Without fresh readable identity, the original expiry remains. */}
    }
    if(profile?.accountIssue){native.verifiedAccount=undefined;throw Error('官方视频号账号状态异常：'+profile.accountIssue.message);}
    if(native.url!==before||!profile||profile.loginVisible||isLoginPage(profile.pageUrl)){native.verifiedAccount=undefined;throw Error('视频号本人身份尚未就绪，请等待官方页面加载');}
    const nickname=profile.nickname?.trim();
    const previous=native.verifiedAccount,age=previous?now()-previous.checkedAt:Infinity;
    const retainedKey=previous?.accountId===input.accountId&&age>=0&&age<=30000&&nickname===previous.nickname?previous.nativeAccountKey:undefined;
    const key=profile.ownIdentity?.key||retainedKey,boundKey=auth.account.nativeAccountKey,sameId=Boolean(key&&key===boundKey);
    if(key&&boundKey&&!sameId){native.verifiedAccount=undefined;throw Error('视频号平台账号ID与绑定ID不同，未执行发布');}
    if(nickname&&nickname!==auth.account.nickname?.trim()&&!sameId){native.verifiedAccount=undefined;throw Error('视频号页面昵称与绑定账号不一致，且缺少同ID依据，请到账号管理重新授权，未执行发布');}
    if(nickname)native.verifiedAccount={accountId:input.accountId,nickname,nativeAccountKey:key,checkedAt:now()};
    else {
      const proof=native.verifiedAccount,pathname=new URL(before).pathname,editor=/^\/platform\/post\/create\/?$/.test(pathname),resultList=native.resultOnly&&/^\/platform\/post\/list\/?$/.test(pathname);
      if(!(editor||resultList)||!proof||proof.accountId!==input.accountId||(boundKey?proof.nativeAccountKey!==boundKey:proof.nickname!==auth.account.nickname?.trim())||now()<proof.checkedAt||now()-proof.checkedAt>(resultList?30000:600000))throw Error('视频号本人身份尚未就绪，请等待官方页面加载');
    }
    clearVerifiedLoginWarning(native);
    if(!native.proxy)native.proxy=createEdgePageGuest(native,()=>guests.get(native.guestId)===native);
    return {win,guest:native.proxy,auth,nickname:nickname||native.verifiedAccount.nickname,nativeAccountKey:key||native.verifiedAccount?.nativeAccountKey,observedNativeAccountKey:profile.ownIdentity?.key,renderedOwner:Boolean(nickname)};
  };
  ipcMain.handle('matrix:edge-publish-entry',guarded(async(event,input)=>{
    if(!['video','image'].includes(input?.mediaType))throw Error('发布素材类型无效');
    if(input.mediaType!=='video')throw Error('视频号图文发布编辑器尚未验证，不会把图片交付到视频封面控件');
    const ctx=await resolveContext(event,input);return openEdgePublishEntry(ctx.guest,input.mediaType);
  }));
  // Main-process-only reader: same isolated native account profile, a separate
  // hidden controller, a fixed official list URL, and no current-editor navigation.
  const createResultContext=async(event,input)=>{
    const opened=await openEdge(event,{...input,platform:'wechat'},{resultOnly:true});
    const native=guests.get(opened.guestId);
    const close=()=>{if(guests.get(opened.guestId)===native){guests.delete(opened.guestId);native.transport.close();}};
    const pageInput={...input,platform:'wechat',edgeGuestId:opened.guestId,webContentsId:0};
    try {
      const navigate=async url=>{
        const navigation=await native.transport.request('navigate',{url}),deadline=Date.now()+15000;
        while(!native.lastStatus?.navigationComplete||native.lastStatus.navigationRequestId!==navigation.navigationRequestId){
          if(guests.get(opened.guestId)!==native)throw Error('视频号核验页面已经关闭');
          if(Date.now()>=deadline)throw Error('读取视频号核验页面超时');
          await new Promise(resolve=>setTimeout(resolve,100));
        }
      };
      const readHomeOwner=async()=>{
        await navigate('https://channels.weixin.qq.com/platform');
        const deadline=Date.now()+7000;
        while(true){
          try{return await resolveContext(event,pageInput);}
          catch(error){if(!/本人身份尚未就绪/.test(String(error.message))||Date.now()>=deadline)throw error;await new Promise(resolve=>setTimeout(resolve,300));}
        }
      };
      // The compact list header may expose only an avatar. Establish fresh
      // identity on the rendered OWN homepage, not from saved task metadata.
      const home=await readHomeOwner();
      await navigate('https://channels.weixin.qq.com/platform/post/list');
      let ownerChecks=0;
      const verifyOwner=async()=>{
        let current;
        try{current=await resolveContext(event,pageInput);}
        catch(error){if(ownerChecks>0&&/本人身份尚未就绪/.test(String(error.message)))return readHomeOwner();throw error;}
        if(current.renderedOwner)return current;
        if(ownerChecks++===0){
          // Let a deferred list owner settle, including a mismatching owner.
          const deadline=Date.now()+2000;
          while(!current.renderedOwner&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,300));current=await resolveContext(event,pageInput);}
          return current;
        }
        // After matching the list, read the own homepage AGAIN before commit.
        // This navigates only our disposable reader, never an existing editor.
        return readHomeOwner();
      };
      return {...home,close,verifyOwner};
    }catch(error){close();throw error;}
  };
  const inspectAccountProfile=async(event,input,signal)=>{
    if(signal?.aborted)throw Error('账号检查已结束');
    const opened=await openEdge(event,{...input,platform:'wechat'},{resultOnly:true}),native=guests.get(opened.guestId);
    const close=()=>{if(guests.get(opened.guestId)===native){guests.delete(opened.guestId);native.transport.close();}};
    signal?.addEventListener('abort',close,{once:true});
    try{
      if(signal?.aborted)throw Error('账号检查已结束');
      const navigation=await native.transport.request('navigate',{url:'https://channels.weixin.qq.com/platform'}),deadline=Date.now()+10000;
      while(!native.lastStatus?.navigationComplete||native.lastStatus.navigationRequestId!==navigation.navigationRequestId){if(signal?.aborted||guests.get(opened.guestId)!==native)throw Error('账号检查已结束');if(Date.now()>=deadline)throw Error('视频号主页读取超时');await new Promise(resolve=>setTimeout(resolve,100));}
      const proxy=createEdgePageGuest(native,()=>guests.get(opened.guestId)===native);
      let loginReads=0;
      for(let i=0;i<8;i++){
        const profile=await runOfficialDOM(proxy,readPlatformProfile,['wechat'],'matrix-edge-health-profile');
        const login=profile.loginVisible||isLoginPage(native.url);loginReads=login?loginReads+1:0;
        if(profile.accountIssue||!login&&profile.nickname||loginReads>=2)return {authenticated:!login&&!profile.accountIssue&&Boolean(profile.nickname),profile:{...profile,pageUrl:profile.pageUrl||native.url}};
        await new Promise(resolve=>setTimeout(resolve,login?1000:250));
      }
      return {authenticated:false,profile:{}};
    }finally{signal?.removeEventListener('abort',close);close();}
  };
  return {resolveContext,createResultContext,inspectAccountProfile,close(){for(const guest of guests.values())guest.transport.close();guests.clear();},count:()=>guests.size};
}
module.exports={registerEdgeEmbed,createEdgeTransport,officialWechatUrl,safeBounds};
