// Read-only rendered Bilibili documents. No platform APIs, credentials or actions.
const targets=await fetch((await import('./local-installed-debug.mjs')).installedDebugUrl,{signal:AbortSignal.timeout(3000)}).then(r=>r.json());
for(const target of targets.filter(t=>t.type==='webview'&&new URL(t.url).origin==='https://member.bilibili.com')){
  const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})});
  try{
    const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Read-only result timeout')),8000);ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id!==1)return;clearTimeout(timer);m.error?reject(Error(m.error.message)):resolve(m.result);});ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{returnByValue:true,expression:`(()=>{if(location.origin!=='https://member.bilibili.com'||/login|passport/.test(location.pathname))throw Error('Not the authenticated official document');const visible=e=>e.getClientRects().length&&getComputedStyle(e).display!=='none';return{url:location.origin+location.pathname,renderedText:document.body.innerText.slice(-5000),links:[...document.querySelectorAll('a[href]')].filter(e=>visible(e)&&/稿件|管理|作品/.test(e.innerText)).map(e=>({text:e.innerText.trim(),href:e.href.split('?')[0]})).slice(0,15),privateChoice:[...document.querySelectorAll('.video-setting-card .check-radio-v2-container')].filter(e=>visible(e)&&e.querySelector('.check-radio-v2-box-checked')).map(e=>e.innerText.trim())}})()`}}));});
    if(result.exceptionDetails)throw Error('Official result document not readable');console.log(JSON.stringify(result.result.value));
  }finally{ws.close();}
}
