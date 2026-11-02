const { createHash } = require('node:crypto');
// The creator header can expose only an avatar. Read the authenticated official
// personal-center page in the SAME session, not public creators/private APIs.
function createBilibiliProfileReader({ createWindow, readProfile, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now }) {
  const cached = new WeakMap(), pending = new WeakMap();
  const fingerprint = cookies => createHash('sha256').update(cookies.filter(cookie=>cookie.name==='SESSDATA'&&cookie.value).map(cookie=>cookie.value).sort().join('\n')).digest('hex');
  return async (accountSession, cookies) => {
    if (!cookies.some(cookie=>cookie.name==='SESSDATA'&&cookie.value&&(!cookie.expirationDate||cookie.expirationDate>now()/1000))) return undefined;
    const key = fingerprint(cookies), previous = cached.get(accountSession);
    if (previous?.key === key && previous.expires > now()) return previous.profile;
    const existing = pending.get(accountSession);
    if (existing?.key === key) return existing.promise;
    const promise = (async()=>{
      let window;
      try {
        window=createWindow(accountSession);const guest=window.webContents;
        guest.setWindowOpenHandler?.(()=>({action:'deny'}));
        guest.on?.('will-navigate',(event,url)=>{try{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.hostname!=='account.bilibili.com')event.preventDefault();}catch{event.preventDefault();}});
        await Promise.race([guest.loadURL('https://account.bilibili.com/account/home'),sleep(10000).then(()=>{throw Error('官方个人中心加载超时');})]);
        for(let attempt=0;attempt<12;attempt++){
          const url=new URL(guest.getURL());
          if(url.protocol!=='https:'||url.hostname!=='account.bilibili.com'||url.pathname!=='/account/home')return undefined;
          const profile=await readProfile(guest);
          if(profile.nickname&&!profile.loginVisible){
            const fresh=await accountSession.cookies.get({url:'https://account.bilibili.com/account/home'});
            if(!fresh.some(cookie=>cookie.name==='SESSDATA'&&cookie.value&&(!cookie.expirationDate||cookie.expirationDate>now()/1000))||fingerprint(fresh)!==key)return undefined;
            cached.set(accountSession,{key,profile,expires:now()+10000});return profile;
          }
          await sleep(500);
        }
        return undefined;
      }catch{return undefined;}
      finally{if(window&&!window.isDestroyed())window.destroy();}
    })();
    pending.set(accountSession,{key,promise});
    try{return await promise;}finally{if(pending.get(accountSession)?.promise===promise)pending.delete(accountSession);}
  };
}
module.exports={createBilibiliProfileReader};
