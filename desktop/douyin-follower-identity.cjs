// Narrow identity read for an OWN follower panel. No recommendation/page-wide
// nickname search, repeated ancestor style walks, network calls or browser stores.
function readFollowerIdentity() {
 const visible=e=>e?.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
 const title=(document.title||'').trim();
 const verificationRequired=/^(?:验证码中间页|安全验证|Captcha(?: Verification)?)(?:\s*[-|].*)?$/i.test(title)||[...document.querySelectorAll('iframe')].slice(0,30).some(e=>visible(e)&&/captcha|verifycenter|verify\.snssdk\.com/i.test(e.getAttribute('src')||''));
 const loginVisible=[...document.querySelectorAll('input')].slice(0,100).some(e=>visible(e)&&/密码|验证码|手机号|password|one-time-code/.test([e.type,e.placeholder,e.autocomplete].join(' ')));
 let ownIdentity;
 if(/^\/user\/self\/?$/.test(location.pathname)){
  const keys=new Set();
  for(const heading of [...document.querySelectorAll('h1')].slice(0,20)){
   if(!visible(heading)||heading.closest('article,[data-e2e="user-post-list"],[data-e2e="user-fans-container"],[class*=comment]'))continue;
   for(let box=heading.parentElement,n=0;box&&box!==document.body&&n<4;box=box.parentElement,n++){
    if(box.querySelector('[data-e2e="user-post-list"],[data-e2e="user-fans-container"],a[href*="/video/"]'))break;
    for(const e of [...box.querySelectorAll('span,div,p')].slice(0,128)){
     const raw=e.textContent||'';if(raw.length>100||!visible(e))continue;
     const match=/^抖音号[：:]\s*([A-Za-z0-9_.-]{2,80})$/.exec(raw.trim());if(match)keys.add(match[1]);
    }
   }
  }
  if(keys.size===1)ownIdentity={source:'official_own_homepage',key:[...keys][0]};
  else if(keys.size>1)ownIdentity={source:'official_own_homepage',key:'!ambiguous'};
 }
 return {verificationRequired,loginVisible,...(ownIdentity?{ownIdentity}:{})};
}
module.exports={readFollowerIdentity};
