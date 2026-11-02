// User-requested snapshot of an already OPEN normal official follower panel.
// No navigation, transport hooks, generated requests, clicks, scroll or SDK.
const {readFollowerIdentity}=require('./douyin-follower-identity.cjs');
const {projectFollowerUser,readRenderedFollowers}=require('./douyin-followers-preload.cjs');
const {inspectFollowerResponse}=require('./douyin-follower-response.cjs');

function snapshotOpenFollowers(handle,profileReader,projectUser,readRows,pagination,notAfter,inspectResponse) {
  const fail=message=>({error:message});
  if(notAfter!==undefined&&(!Number.isSafeInteger(notAfter)||Date.now()>notAfter))return fail('官网粉丝读取已过期，未再打开或滚动面板，原名单保留');
  const selfRoute=/^\/user\/self\/?$/.test(location.pathname);
  if(location.origin!=='https://www.douyin.com'||!['/','/jingxuan','/jingxuan/','/user/self','/user/self/'].includes(location.pathname))return fail('请在对应账号的平台前台打开本人粉丝面板');
  const profile=profileReader('douyin');
  if(profile.verificationRequired||profile.loginVisible||profile.accountIssue)return fail('官网当前需要处理登录、验证或账号状态；未读取名单');
  const headerProof=profile.ownIdentity?.source==='official_own_homepage'&&profile.ownIdentity.key===handle;
  if(profile.ownIdentity&&!headerProof)return fail('官网本人账号与绑定不一致，未读取粉丝面板');
  const visible=e=>e.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
  const panels=[...document.querySelectorAll('[data-e2e="user-fans-container"]')].filter(visible);
  if(pagination?.action==='prepare'&&!panels.length){
    if(!selfRoute)return fail('自动准备只允许在本人主页打开粉丝名单，原页面不跳转');
    if(!headerProof)return {waiting:true,followers:[],reason:'等待官网本人主页身份就绪'};
    const marker='__matrixOwnFollowerOpenRequested',previous=window[marker];
    if(previous?.handle===handle)return Date.now()-previous.at>30000?fail('已请求打开本人粉丝入口，但官网尚未出现可读名单，已暂停，原缓存保留'):{waiting:true,followers:[],reason:'等待官网本人粉丝面板展开'};
    const label=/^(?:粉丝(?:指数|数)?\s*[\d,.万亿]*|[\d,.万亿]+\s*粉丝(?:指数|数)?)$/;
    const controls=[...document.querySelectorAll('[data-e2e="user-info-fans"]')].filter(e=>visible(e)&&label.test((e.textContent||'').trim().replace(/\s+/g,' ')));
    if(controls.length!==1)return {waiting:true,followers:[],reason:'等待唯一的官网本人粉丝入口，不点击通知或其他按钮'};
    const control=controls[0],numbers=[...control.querySelectorAll('span,div,p,b,strong')].filter(e=>!e.children.length&&visible(e)&&/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?[万亿]?$/.test((e.textContent||'').trim()));
    if(numbers.length>1)return fail('官网粉丝计数入口不唯一，自动同步已暂停');
    if(control.disabled||control.closest('[disabled],[aria-disabled="true"]'))return fail('官网本人粉丝入口暂不可用，原缓存保留');
    const anchor=control.closest('a');if(anchor){try{const target=new URL(anchor.href,location.href);if(target.origin!==location.origin||target.username||target.password||!['/user/self','/user/self/'].includes(target.pathname))return fail('官网本人粉丝入口指向其他页面，未自动跳转');}catch{return fail('官网本人粉丝入口地址未识别，原缓存保留');}}
    const header=control.closest('[data-e2e="user-info"]');
    if(header){
      let fiber=header[Object.keys(header).find(key=>key.startsWith('__reactFiber$'))],ready=false,foreign=false;const ids=new Set();
      for(let depth=0;fiber&&depth<10;fiber=fiber.return,depth++)for(const props of [fiber.memoizedProps,fiber.memoizedProps?.children?.props])for(const user of [props?.userInfo,props?.currentUserInfo]){
        if(!user||typeof user!=='object')continue;
        const exact=v=>typeof v==='string'&&/^[1-9]\d{0,18}$/.test(v)?v:Number.isSafeInteger(v)&&v>0?String(v):'';
        const uid=exact(user.uid),sec=user.secUid??user.sec_uid,key=user.unique_id||user.uniqueId||user.short_id||user.shortId;
        if(uid)ids.add(uid);if(key!==undefined&&String(key)!==handle)foreign=true;
        if(uid&&typeof sec==='string'&&/^MS4w[A-Za-z0-9_-]{1,250}$/.test(sec))ready=true;
      }
      if(foreign||ids.size>1)return fail('官网本人资料组件归属不一致，未打开粉丝入口');
      if(!ready)return {waiting:true,followers:[],reason:'等待官网本人资料组件完成渲染，再打开粉丝列表'};
    }
    Object.defineProperty(window,marker,{value:{handle,at:Date.now()},configurable:true});
    // The official counter owns this callback. Its number child may consume
    // clicks for a separate index tooltip. Never guess an arbitrary sibling.
    control.click();
    return {waiting:true,followers:[],reason:'已请求打开本人粉丝入口，等待官网名单渲染'};
  }
  if(panels.length!==1)return fail('请先在官网打开唯一的本人粉丝面板，保持面板展开');
  const panel=panels[0],owners=new Set(),tabs=new Set(),handles=new Set(),counts=new Set(),secUids=new Set(),memberLists=new Set(),counterValues={follower_count:new Set(),mplatform_followers_count:new Set()};let self=false,foreign=false,filtered=false;
  let fiber=panel[Object.keys(panel).find(key=>key.startsWith('__reactFiber$'))];
  const exact=v=>typeof v==='string'&&/^[1-9]\d{0,18}$/.test(v)?v:Number.isSafeInteger(v)&&v>0?String(v):'';
  for(let n=0;fiber&&n<6;fiber=fiber.return,n++)for(const props of [fiber.memoizedProps,fiber.memoizedProps?.children?.props]){
    if(!props||!Object.hasOwn(props,'currentUserInfo')||!Object.hasOwn(props,'isSelf'))continue;
    if(props.isSelf!==true){foreign=true;continue;}
    const uid=exact(props.currentUserInfo?.uid);if(!uid)return fail('官网本人编号结构未识别，未读取粉丝面板');
    owners.add(uid);self=true;tabs.add(props.activeTab);
    const sec=props.currentUserInfo.sec_uid??props.currentUserInfo.secUid;if(typeof sec==='string'&&/^MS4w[A-Za-z0-9_-]{1,250}$/.test(sec))secUids.add(sec);
    if(Array.isArray(props.userList)&&props.userList.length<=50000){counts.add(props.userList.length);memberLists.add(props.userList);}
    // On the normal home/feed the own-header card is absent. Only the
    // already rendered SELF panel's explicit public handle can substitute;
    // nickname, avatar, account partition or isSelf alone are not identity.
    const info=props.currentUserInfo;
    // Numeric facts from this exact SELF panel only. They do not establish
    // roster membership, explain a discrepancy, or override end-of-list proof.
    for(const field of Object.keys(counterValues)){
      const raw=info[field],value=typeof raw==='string'&&/^\d{1,10}$/.test(raw)?Number(raw):raw;
      if(raw!==undefined)counterValues[field].add(Number.isSafeInteger(value)&&value>=0&&value<=2147483647?value:null);
    }
    const publicKey=value=>typeof value==='string'&&/^[A-Za-z0-9_.-]{2,80}$/.test(value)?value:Number.isSafeInteger(value)&&value>0?String(value):'';
    const unique=['unique_id','uniqueId'].filter(key=>info[key]!==undefined&&info[key]!==null&&info[key]!=='');
    const keys=unique.length?unique:['short_id','shortId'].filter(key=>info[key]!==undefined&&info[key]!==null&&info[key]!=='');
    for(const key of keys){const value=publicKey(info[key]);if(!value)return fail('官网粉丝面板本人抖音号结构未识别，未读取名单');handles.add(value);}
    if(typeof props.searchVal!=='string'||props.searchVal.length)filtered=true;
  }
  if(foreign||!self||owners.size!==1||tabs.size!==1||!tabs.has(1))return fail('官网当前面板不是可核验的本人粉丝名单，未读取关注列表或其他账号');
  if(filtered)return fail('请先清空官网粉丝面板的搜索条件，再同步已加载成员');
  if(handles.size>1||handles.size===1&&!handles.has(handle))return fail('官网粉丝面板本人抖音号与绑定不一致，未读取名单');
  if(!headerProof&&handles.size!==1)return fail('当前官网粉丝面板未包含可核验的本人抖音号，请在本人主页打开粉丝列表后同步');
  const ownerUid=[...owners][0],state={openRequested:true,findRenderedRoot:()=>({root:panel})};
  if(pagination?.action==='prepare'){
    const counterEvidence={};
    for(const [field,values]of Object.entries(counterValues))if(values.size===1&&!values.has(null))counterEvidence[field]=[...values][0];
    return {ownerUid,followers:[],ready:true,counterEvidence};
  }
  if(pagination?.action==='inspect'){
    if(secUids.size===0&&selfRoute&&headerProof){
      for(const header of [...document.querySelectorAll('[data-e2e="user-info"]')].filter(visible).slice(0,2)){
        let current=header[Object.keys(header).find(key=>key.startsWith('__reactFiber$'))];
        for(let depth=0;current&&depth<10;current=current.return,depth++)for(const props of [current.memoizedProps,current.memoizedProps?.children?.props])for(const user of [props?.userInfo,props?.currentUserInfo]){
          if(!user||exact(user.uid)!==ownerUid)continue;const key=user.unique_id||user.uniqueId||user.short_id||user.shortId;
          if(key!==undefined&&String(key)!==handle)return fail('官网本人资料编号归属冲突，未检测接口');
          const sec=user.sec_uid??user.secUid;if(typeof sec==='string'&&/^MS4w[A-Za-z0-9_-]{1,250}$/.test(sec))secUids.add(sec);
        }
      }
    }
    if(secUids.size!==1||typeof inspectResponse!=='function')return fail('官网本人粉丝面板未提供唯一编号，未发起接口检测');
    return inspectResponse({uid:ownerUid,secUid:[...secUids][0]}).then(result=>({...result,ownerUid,followers:[]}));
  }
  let scroll,page;
  if(pagination){
    const {action,lease}=pagination;
    if(!['reset','read','advance','release','resume'].includes(action)||typeof lease!=='string'||!/^[a-f0-9-]{36}$/.test(lease))return fail('官网分页参数无效，未操作面板');
    if(pagination.ownerUid&&pagination.ownerUid!==ownerUid)return fail('官网粉丝面板本人编号已变化，自动同步已停止');
    const marker='__matrixOwnFollowerPagination';
    if(action==='reset'){
      const candidates=[panel,...panel.querySelectorAll('div,ul,section')].filter(e=>visible(e)&&e.clientHeight>40&&/auto|scroll/.test(getComputedStyle(e).overflowY));
      const leaves=candidates.filter(e=>!candidates.some(other=>other!==e&&e.contains(other)));
      if(leaves.length!==1)return fail('官网粉丝面板滚动区不唯一或尚未就绪，未操作其他区域');
      scroll=leaves[0];Object.defineProperty(panel,marker,{value:{lease,scroll},configurable:true});
      const originalTop=scroll.scrollTop;scroll.scrollTop=0;if(originalTop>0)scroll.dispatchEvent(new Event('scroll',{bubbles:true}));
    }else{
      const current=panel[marker];
      if(!current||current.lease!==lease||!current.scroll?.isConnected||!panel.contains(current.scroll)&&current.scroll!==panel)return fail('官网粉丝面板已重建，原名单保留；请重新从顶部核验');
      scroll=current.scroll;
    }
    const bounds=()=>({top:Math.round(scroll.scrollTop),height:Math.round(scroll.scrollHeight),view:Math.round(scroll.clientHeight)});
    page={...bounds(),...(counts.size===1?{loadedCount:[...counts][0]}:{})};
    if(Object.values(page).some(value=>!Number.isSafeInteger(value)||value<0||value>100000000))return fail('官网粉丝面板位置结构未识别');
    if(action==='release'){delete panel[marker];return {ownerUid,followers:[],page};}
    if(action==='resume'){
      const denied=[...panel.querySelectorAll('[data-e2e="user-fans-footer"]')].filter(visible).some(e=>/^(?:请完成安全验证|请完成验证|安全验证|需要验证|请先登录|请登录|登录后查看|访问受限|网络异常|网络错误|加载失败|请求失败|服务异常|暂时无法加载)(?:[，,。！!：:\s].*)?$/.test((e.innerText||e.textContent||'').trim()));
      if(denied)return fail('官网仍要求登录、验证或处理加载异常；断点保留，请处理后再继续，未滚动或重试请求');
      const target=pagination.expectedTop;
      if(!Number.isSafeInteger(target)||target<0||page.view<40||target>Math.max(0,page.height-page.view)+2)return fail('官网尚未恢复原断点所需的名单高度，断点保留，未猜测位置或从顶部重读');
      if(Math.abs(page.top-target)>2){scroll.scrollTop=target;scroll.dispatchEvent(new Event('scroll',{bubbles:true}));}
      const restored=bounds();if(Math.abs(restored.top-target)>2)return fail('官网粉丝原断点位置未恢复，已有名单保留');
      return {ownerUid,followers:[],page:{...page,...restored}};
    }
    if(action!=='reset'&&Number.isFinite(pagination.expectedTop)&&Math.abs(page.top-pagination.expectedTop)>2)return fail('官网粉丝面板位置被改变，已暂停；请重新从顶部核验，缓存保留');
    if(action==='advance'){
      const destination=Math.max(0,Math.min(page.height-page.view,pagination.fast? page.height-page.view:page.top+Math.max(20,Math.floor(page.view*0.7))));
      // One ordinary DOM scroll signal for actual movement, matching the
      // existing official-list reader. Never retry a stationary bottom,
      // invoke callbacks, click business controls or navigate the page.
      if(destination>page.top){scroll.scrollTop=destination;scroll.dispatchEvent(new Event('scroll',{bubbles:true}));}
      return {ownerUid,followers:[],page:{...page,...bounds()}};
    }
    if(action==='reset')return {ownerUid,followers:[],page};
    const rect=scroll.getBoundingClientRect();
    const allFooters=[...panel.querySelectorAll('[data-e2e="user-fans-footer"]')].filter(visible);
    if(allFooters.some(e=>/^(?:请完成安全验证|请完成验证|安全验证|需要验证|请先登录|请登录|登录后查看|访问受限)(?:[，,。！!：:\s].*)?$/.test((e.innerText||e.textContent||'').trim())))return fail('官网粉丝面板要求本人登录或页面验证，自动同步已暂停，原名单保留');
    const footers=allFooters.filter(e=>e.getBoundingClientRect().bottom>=rect.top&&e.getBoundingClientRect().top<=rect.bottom);
    if(footers.some(e=>/^(?:网络异常|网络错误|加载失败|请求失败|服务异常|暂时无法加载)(?:[，,。！!：:].*)?$/.test((e.innerText||e.textContent||'').trim())))return fail('官网粉丝面板提示读取失败，自动同步暂停，已读取名单保留');
    page.end=footers.length===1&&/^(?:暂时没有更多了|没有更多了|暂无粉丝|暂时没有粉丝|还没有粉丝|你还没有粉丝)$/.test((footers[0].innerText||footers[0].textContent||'').trim());
    page.empty=page.end&&/粉丝/.test((footers[0].innerText||footers[0].textContent||'').trim());
  }
  // Index only during a READ, not on every scroll/reset/prepare. A missing
  // relation button is corroborated by an exact UID from this owner-proven,
  // unfiltered SELF fans list, never hooks, callbacks or API responses.
  if(memberLists.size===1){
    state.panelMemberIds=new Set();
    for(const raw of [...memberLists][0]){
      let user=raw;const keys=['uid','userId','user_id','uid_str','uidStr','user_id_str'];
      if(!keys.some(key=>exact(user?.[key])))user=raw?.user??raw?.user_info??raw?.userInfo;
      const ids=new Set(keys.filter(key=>user?.[key]!==undefined&&user?.[key]!==null).map(key=>exact(user[key])));
      if(ids.size===1&&!ids.has(''))state.panelMemberIds.add([...ids][0]);
    }
  }
  const result=readRows({uid:ownerUid,offset:'0',snapshotOnly:true,allowInitialScroll:false,...(pagination?{measureCoverage:true,requireFollowerControls:true}:{}),...(pagination?.viewportOnly?{viewportOnly:true,viewportRoot:scroll}:{})},projectUser,state);
  if(pagination&&result?.waitReason==='identity-conflict')return fail('官网粉丝卡片身份结构不唯一，已暂停，未猜测匹配或覆盖名单');
  if(pagination&&result?.waiting===true&&!result.error&&!page.end)return {ownerUid,followers:[],page:{...page,pending:true,pendingIdentity:result.waitReason==='identity-missing',...(Number.isInteger(result.identityCandidateKind)&&result.identityCandidateKind>=1&&result.identityCandidateKind<=3?{identityCandidateKind:result.identityCandidateKind}:{}),...Object.fromEntries(['identityFailureMask','identityImageFacts'].filter(key=>Number.isInteger(result[key])&&result[key]>=0&&result[key]<=63).map(key=>[key,result[key]]))}};
  if(!result?.data)return fail(result?.detail||'官网粉丝成员尚未渲染，原有名单保留');
  if(!result.data.followers.length&&!pagination)return fail('当前官网粉丝面板尚无可核验成员，未当作空名单');
  if(pagination){
    page.memberProofRows=state.domMemberProofRows||0;page.missingControlRows=state.domMissingControlRows||0;page.anchoredNameProofRows=state.domAnchoredNameProofRows||0;page.linkedAvatarProofRows=state.domLinkedAvatarProofRows||0;
    // Counts alone cannot distinguish a virtual window from the full DOM.
    // Permit a bottom jump only when exact one-person cards cover the whole
    // scroll content, without spacers/gaps. Otherwise use overlapping steps.
    const rect=scroll.getBoundingClientRect(),spans=(state.domCoverageSpans||[]).sort((a,b)=>a.top-b.top),start=rect.top+scroll.clientTop-page.top;
    let edge=start,continuous=spans.length>0;
    for(const span of spans){if(span.top>edge+8)continuous=false;edge=Math.max(edge,span.bottom);}
    const footerHeight=[...scroll.querySelectorAll('[data-e2e="user-fans-footer"]')].reduce((sum,e)=>sum+e.getBoundingClientRect().height,0);
    page.fullDom=continuous&&edge>=start+page.height-footerHeight-8;
  }
  return {ownerUid,followers:result.data.followers,...(pagination?{page}:{})};
}

function createOpenFollowerReader({getWindow,webContents,session}) {
  const pending=new Set();
  const read=async function read({account,webContentsId,assertCurrent,pagination}) {
    const win=getWindow(),guest=webContents.fromId(webContentsId);
    const source=session.fromPartition('persist:matrix-douyin-'+account.connectorSessionId);
    const valid=()=>{
      if(!win||win.isDestroyed()||!guest||guest.isDestroyed()||guest.getType()!=='webview'||guest.hostWebContents?.id!==win.webContents.id||guest.session!==source)throw Error('官网页面已关闭或不属于当前绑定账号');
      const url=new URL(guest.getURL());
      if(url.origin!=='https://www.douyin.com'||!['/','/jingxuan','/jingxuan/','/user/self','/user/self/'].includes(url.pathname)||url.username||url.password)throw Error('请在对应账号的平台前台打开本人粉丝面板');
      return url.href;
    };
    if(pending.has(webContentsId))throw Error('当前官网粉丝面板正在读取，请稍候');
    pending.add(webContentsId);let changed=false,authenticationChanged=false,timer;
    const invalidate=()=>{changed=true;};
    const authChanged=(_event,cookie)=>{if(/^(?:sessionid|sessionid_ss|sid_tt|sid_guard|uid_tt|uid_tt_ss|sid_ucp_v1|ssid_ucp_v1)$/.test(cookie?.name||'')){authenticationChanged=true;invalidate();}};
    const navigated=(_event,_url,_inPlace,mainFrame)=>{if(mainFrame!==false)invalidate();};
    try {
      const start=valid();await assertCurrent();valid();
      // Authentication cookies never leave the native session. Any change
      // during the snapshot invalidates it, even if the guest returns to self.
      source.cookies.on('changed',authChanged);
      guest.on('did-start-navigation',navigated);guest.on('destroyed',invalidate);
      // WebContents.executeJavaScript waits for did-stop-loading in Electron
      // 33, even after DOM-ready. A slow resource must not queue a scroll that
      // runs after our timeout. Use the exact current main frame, not another
      // execution world, debugger, user gesture or authentication environment.
      const frame=guest.mainFrame;
      if(!frame||typeof frame.executeJavaScript!=='function'||frame.url!==start)throw Error('官网本人主帧尚未就绪，未读取或滚动粉丝面板');
      const code=`(${snapshotOpenFollowers.toString()})(${JSON.stringify(account.nativeAccountKey)},${readFollowerIdentity.toString()},${projectFollowerUser.toString()},${readRenderedFollowers.toString()},${JSON.stringify(pagination)},${Date.now()+7500},${inspectFollowerResponse.toString()})`;
      const result=await Promise.race([frame.executeJavaScript(code,false),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('读取已打开粉丝面板超时，原有名单保留')),8000);})]);
      await assertCurrent();const end=valid();
      if(authenticationChanged)throw Error('官网页面或登录已变化（登录凭据变化），本次粉丝结果丢弃；请核对账号后重新同步');
      if(changed||guest.mainFrame!==frame||end!==start){
        // During PREPARE only, discard a normal own-home navigation and let
        // the existing bounded preparation loop re-prove the fresh document.
        // No members/cursor were accepted. Auth changes remain terminal; never
        // retry inspect/read/scroll or continue a page-bound pagination lease.
        if(pagination?.action==='prepare'&&/^\/user\/self\/?$/.test(new URL(end).pathname))return {waiting:true,followers:[],reason:'官网本人页面正在完成正常跳转，等待稳定后重新核验归属'};
        throw Error('官网页面或登录已变化（官网页面变化），本次粉丝结果丢弃');
      }
      if(result?.error)throw Error(result.error);
      if(pagination?.action==='prepare'&&(result?.waiting===true||result?.ready===true&&/^[1-9]\d{0,18}$/.test(result.ownerUid||'')))return result;
      if(!/^[1-9]\d{0,18}$/.test(result?.ownerUid||'')||!Array.isArray(result?.followers)||!pagination&&!result.followers.length||result.followers.length>1000)throw Error('官网已加载粉丝结构未识别，原有名单保留');
      return result;
    }finally{
      clearTimeout(timer);source.cookies.removeListener('changed',authChanged);
      guest?.removeListener('did-start-navigation',navigated);guest?.removeListener('destroyed',invalidate);pending.delete(webContentsId);
    }
  };
  // Object liveness only; no URL, title, page body or session values read.
  read.isAlive=id=>{try{const win=getWindow(),guest=webContents.fromId(id);return !!win&&!win.isDestroyed()&&!!guest&&!guest.isDestroyed()&&guest.getType()==='webview'&&guest.hostWebContents?.id===win.webContents.id;}catch{return false;}};
  return read;
}
module.exports={snapshotOpenFollowers,createOpenFollowerReader};
