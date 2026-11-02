// Post-click, same-session, read-only official work-list context. This module
// has no submit/click/journal capability and never navigates the live editor.
const ROUTES = Object.freeze({bilibili:'https://member.bilibili.com/platform/upload-manager/article',douyin:'https://creator.douyin.com/creator-micro/content/manage',xiaohongshu:'https://creator.xiaohongshu.com/new/note-manager'});
function createOfficialResultReader({record, account, createWindow, inspectOwner, readCard, now = Date.now, loadTimeoutMs = 15000}) {
  const platform=record.platform, resultUrl=ROUTES[platform];
  if(!resultUrl||account.platform!==platform)throw Error('Unsupported or mismatched result reader platform');
  const route=new URL(resultUrl);
  const ownerUrl=platform==='douyin'?'https://creator.douyin.com/creator-micro/home':platform==='xiaohongshu'?'https://creator.xiaohongshu.com/new/home':undefined;
  let ownerWindow,ownerLoaded=false,ownerLoadError=false,ownerStartedAt;
  let window, loaded = false, ended = false, loadError, startedAt, terminalReason;
  let loadCount=0, lastLoadAt, epoch=0, lastReason, inFlightRead;
  const close = () => {
    ended = true;
    epoch++;
    if (window && !window.isDestroyed()) window.destroy();
    if (ownerWindow && !ownerWindow.isDestroyed()) ownerWindow.destroy();
  };
  const sameOwner = (profile, bound = account) => {
    const key = profile?.ownIdentity?.key;
    if (bound.connectorSessionId !== account.connectorSessionId || bound.platform !== platform) return false;
    if (record.sessionId && record.sessionId !== bound.connectorSessionId) return false;
    if (record.nativeAccountKey) return Boolean(key && key === record.nativeAccountKey && (!bound.nativeAccountKey || key === bound.nativeAccountKey));
    if(platform==='douyin')return Boolean(key&&bound.nativeAccountKey&&key===bound.nativeAccountKey);
    if (bound.nativeAccountKey) return Boolean(key && key === bound.nativeAccountKey && (profile.nickname?.trim() === record.nickname?.trim() || bound.verifiedNicknames?.includes(record.nickname?.trim())));
    return Boolean(profile?.nickname?.trim() && profile.nickname.trim() === record.nickname?.trim());
  };
  const locationState = () => {
    if (ended || window?.isDestroyed() || window?.webContents.isDestroyed?.()) return 'page_closed';
    try {
      const url = new URL(window.webContents.getURL());
      if (/login|passport|signin/.test(url.hostname + url.pathname)) return 'login_required';
      if (url.protocol !== 'https:' || url.hostname !== route.hostname || url.pathname.replace(/\/$/, '') !== route.pathname) return 'wrong_page';
    } catch {return 'page_not_ready';}
  };
  const ownerState = async bound => {
    const state = locationState(); if (state) return state;
    // The manager may contain only an avatar. Read the signed-in own home in
    // parallel, preserving the live editor and the work-list document.
    if(ownerUrl){
      if(ownerLoadError)return 'error';
      if(!ownerLoaded)return now()-ownerStartedAt>=loadTimeoutMs?'timeout':'identity_pending';
      if(ownerWindow.isDestroyed()||ownerWindow.webContents.isDestroyed?.())return 'page_closed';
      const address=new URL(ownerWindow.webContents.getURL());
      if(/login|passport|signin/.test(address.hostname+address.pathname))return 'login_required';
      if(address.origin+address.pathname.replace(/\/$/,'')!==ownerUrl)return 'wrong_page';
    }
    const login = await inspectOwner((ownerWindow||window).webContents);
    if (ended) return 'page_closed';
    if (!login?.authenticated) return 'login_required';
    if (!login.profile?.nickname?.trim()) return 'identity_pending';
    return sameOwner(login.profile, bound) ? undefined : 'identity_mismatch';
  };
  const navigate = () => {
    loaded=false;loadError=false;startedAt=now();
    const current=++epoch;
    // All reloads are this exact read-only manager URL, never the editor. The
    // observer owns the outer minute and closes this context on every exit.
    Promise.resolve().then(() => {
      if (!ended && current===epoch) {startedAt=now();lastLoadAt=startedAt;loadCount++;return window.webContents.loadURL(resultUrl);}
    }).then(() => {
      if(!ended&&current===epoch)loaded=true;
    }, () => {if(!ended&&current===epoch)loadError=true;});
  };
  const configure = target => {
    const guest = target.webContents;
    guest.setAudioMuted?.(true);
    guest.setWindowOpenHandler?.(() => ({action: 'deny'}));
    guest.on?.('will-navigate', (event, value) => {
      try {const url = new URL(value); if (url.protocol !== 'https:' || url.hostname !== route.hostname) event.preventDefault();}
      catch {event.preventDefault();}
    });
  };
  const open = () => {
    window = createWindow('result');
    configure(window);
    if(ownerUrl){
      ownerWindow=createWindow('owner');configure(ownerWindow);ownerStartedAt=now();
      Promise.resolve().then(()=>{if(!ended)return ownerWindow.webContents.loadURL(ownerUrl);}).then(()=>{if(!ended)ownerLoaded=true;},()=>{if(!ended)ownerLoadError=true;});
    }
    navigate();
  };
  const readOnce=async()=>{
    if (ended) return {matched: false, reason: terminalReason || 'page_closed'};
    if (!window) {try {open();} catch {terminalReason='error'; close(); return {matched:false,reason:terminalReason};}}
    if (!loaded && now() - startedAt >= loadTimeoutMs) {terminalReason='timeout'; close(); return {matched: false, reason: terminalReason};}
    if (loadError) {terminalReason='error'; close(); return {matched: false, reason: terminalReason};}
    if (!loaded) return {matched: false, reason: lastReason || 'page_not_ready'};
    const current=epoch,reason = await ownerState(account);
    if(reason)return {matched:false,reason};
    if(ended||current!==epoch)return {matched:false,reason:'page_closed'};
    const result = await readCard(window.webContents, record);
    if(ended||current!==epoch)return {matched:false,reason:'page_closed'};
    lastReason=result?.reason;
    // A loaded SPA can remain stale while the backend accepts/reviews a new
    // work. Refresh only read-only absence/processing, at most five times and
    // at least ten seconds apart. Unknown/conflicting states are not erased.
    // Pending review with work evidence is already a successful handoff. Keep
    // this document stable for the observer's final owner check, just as for
    // a published/rejected card. A refresh here invalidates that check.
    const acceptedReview=lastReason==='processing'&&result?.pendingReview===true&&Boolean(result.evidence);
    if(!result?.matched&&!result?.rejected&&!acceptedReview&&['not_found','processing','page_not_ready'].includes(lastReason)&&now()-startedAt>=10000&&loadCount<6)navigate();
    return result;
  };
  return {
    read() {
      if(!inFlightRead){
        const pending=readOnce().then(result=>({...result,readObservation:{workListLoads:loadCount,...(loadCount?{lastWorkListLoadAt:new Date(lastLoadAt).toISOString()}: {})}}));
        inFlightRead=pending;
        const clear=()=>{if(inFlightRead===pending)inFlightRead=undefined;};pending.then(clear,clear);
      }
      return inFlightRead;
    },
    async verifyIdentity(bound = account) {
      const current=epoch,state = loaded ? await ownerState(bound) : 'page_not_ready';
      if(current!==epoch)throw Error('官方作品页面已变化，未采信旧卡片');
      if (state) throw Error('官方作品账号ID核验未通过：' + state);
    },
    close,
  };
}
module.exports = {createOfficialResultReader};
