// Passive own-homepage projection only. Observe successful normal GET clones;
// never issue requests, copy headers/cookies, activate notifications or call SDKs.
function normalizeCreatorProfile(raw) {
  const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
  if(!object(raw)||!(typeof raw.status_code==='number'&&Number.isSafeInteger(raw.status_code)||typeof raw.status_code==='string'&&/^-?\d{1,9}$/.test(raw.status_code)))return {code:'SHAPE'};
  if(![0,'0'].includes(raw.status_code))return {code:'STATUS',platformCode:Number(raw.status_code)};
  const profile=object(raw.user_profile)?raw.user_profile:raw;
  const uid=typeof raw.uid==='string'?raw.uid:Number.isSafeInteger(raw.uid)?String(raw.uid):'';
  if(!/^[1-9]\d{0,18}$/.test(uid)||BigInt(uid)>9223372036854775807n)return {code:'OWNER_SHAPE',ownerStage:raw.uid===undefined?'OWNER_UID_MISSING':typeof raw.uid==='number'&&!Number.isSafeInteger(raw.uid)?'OWNER_UID_PRECISION':'OWNER_UID_FORMAT'};
  const handle=[profile.unique_id,raw.unique_id,profile.short_id,raw.short_id].map(value=>Number.isSafeInteger(value)&&value>=0?String(value):value).find(value=>typeof value==='string'&&value.length>0);
  if(handle!==undefined&&!/^[A-Za-z0-9_.:-]{2,100}$/.test(handle))return {code:'OWNER_SHAPE',ownerStage:'OWNER_HANDLE_FORMAT'};
  const rawCount=profile.follower_count??raw.follower_count;
  if(rawCount===undefined)return {uid,...(handle===undefined?{handleUnavailable:true}:{handle}),counterUnavailable:true};
  const followersCount=typeof rawCount==='number'?rawCount:typeof rawCount==='string'&&/^\d{1,10}$/.test(rawCount)?Number(rawCount):undefined;
  if(!Number.isSafeInteger(followersCount)||followersCount<0||followersCount>2147483647)return {code:'COUNTER_SHAPE'};
  return {uid,...(handle===undefined?{handleUnavailable:true}:{handle}),followersCount};
}
function installProfileObserver(normalize) {
  if(location.origin!=='https://creator.douyin.com'||window.__matrixOwnProfileObserved)return;
  const paths=new Set(['/aweme/v1/creator/pc/user/info/','/aweme/v1/creator/user/info/']),state={version:1,pages:new Map(),pending:new Set(),failures:new Map()},sequence=new Map(),requests=new WeakMap();
  Object.defineProperty(window,'__matrixOwnProfileObserved',{value:state});
  const request=(raw,method)=>{try{const url=new URL(raw,location.href);if((method||'GET').toUpperCase()!=='GET'||url.origin!==location.origin||url.username||url.password||!paths.has(url.pathname))return;const serial=(sequence.get(url.pathname)||0)+1;sequence.set(url.pathname,serial);state.pending.add(url.pathname);state.pages.delete(url.pathname);state.failures.delete(url.pathname);return {path:url.pathname,serial};}catch{}};
  const parse=value=>{
    if(typeof value!=='string'||value.length>1024*1024)return;
    // Preserve unquoted int64 UID lexemes in the clone; never change the site's
    // response, strings, fractional numbers or exponent notation.
    const preserved=value.replace(/"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g,token=>token[0]!=='"'&&/^-?\d+$/.test(token)&&!Number.isSafeInteger(Number(token))?JSON.stringify(token):token);
    try{return JSON.parse(preserved);}catch{}
  };
  const receive=(req,status,raw)=>{
    if(!req||sequence.get(req.path)!==req.serial)return;
    state.pending.delete(req.path);
    if(status!==200){state.failures.set(req.path,{code:'HTTP',httpStatus:Number.isInteger(status)&&status>=100&&status<=599?status:0});return;}
    const sample=normalize(raw);
    if(sample.code){state.failures.set(req.path,sample);return;}
    state.pages.set(req.path,{...sample,receivedAt:Date.now()});
  };
  async function responseBody(response){
    const copy=response.clone();if(Number(copy.headers?.get?.('content-length'))>1024*1024)return;
    if(!copy.body?.getReader)return parse(await copy.text());
    const reader=copy.body.getReader(),decoder=new TextDecoder();let size=0,value='';
    try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>1024*1024){void reader.cancel().catch(()=>{});return;}value+=decoder.decode(chunk.value,{stream:true});}value+=decoder.decode();return parse(value);}finally{reader.releaseLock();}
  }
  const fetchOriginal=window.fetch;
  window.fetch=function(input,init){const req=request(typeof input==='string'||input instanceof URL?String(input):input?.url,init?.method||input?.method);const result=Reflect.apply(fetchOriginal,this,arguments);if(req)result.then(response=>responseBody(response).then(raw=>receive(req,response.status,raw)),()=>receive(req,0)).catch(()=>receive(req,0));return result;};
  const openOriginal=XMLHttpRequest.prototype.open,sendOriginal=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open=function(method,url){requests.set(this,request(url,method));return Reflect.apply(openOriginal,this,arguments);};
  XMLHttpRequest.prototype.send=function(){const req=requests.get(this);if(req)this.addEventListener('loadend',()=>{try{const raw=this.responseType==='json'?this.response:!this.responseType||this.responseType==='text'?parse(this.responseText):undefined;receive(req,this.status,raw);}catch{receive(req,0);}},{once:true});return Reflect.apply(sendOriginal,this,arguments);};
}
// Identity does not depend on a follower counter or on the rendered ID label.
// Only fresh normal self-profile responses with an explicit matching handle
// qualify; absence, conflicts, pending replacements and refusals fail closed.
function observedIdentity(expectedHandle) {
  if(location.origin!=='https://creator.douyin.com'||!/^\/creator-micro\/home\/?$/.test(location.pathname))return {code:'ORIGIN'};
  if(!/^[A-Za-z0-9_.-]{2,80}$/.test(expectedHandle||''))return {code:'OWNER'};
  const state=window.__matrixOwnProfileObserved;if(state?.version!==1)return {available:false};
  if(state.failures.size)return {available:false};
  if(state.pending.size)return {available:false,pending:true};
  const fresh=[...state.pages.values()].filter(sample=>Number.isFinite(sample.receivedAt)&&Date.now()-sample.receivedAt<=30000&&sample.receivedAt<=Date.now()+5000);
  if(fresh.some(sample=>typeof sample.handle==='string'&&sample.handle!==expectedHandle))return {code:'OWNER'};
  if(new Set(fresh.map(sample=>sample.uid)).size!==1)return {available:false};
  const sample=fresh.find(sample=>sample.handle===expectedHandle);
  if(!sample||!/^[1-9]\d{0,18}$/.test(sample.uid)||BigInt(sample.uid)>9223372036854775807n)return {available:false};
  return {key:sample.handle,source:'douyin-creator-profile'};
}
async function readObservedIdentity(guest,expectedHandle,assertCurrent) {
  await assertCurrent();if(!guest||guest.isDestroyed())throw Error('本人资料页已关闭');
  const result=await guest.executeJavaScript(`(${observedIdentity.toString()})(${JSON.stringify(expectedHandle)})`,false);
  await assertCurrent();
  if(result?.code==='OWNER')throw Error('官网本人资料身份编号与绑定不一致，未执行操作');
  return result?.source==='douyin-creator-profile'&&result.key===expectedHandle?result:undefined;
}
function observedProfile(expectedHandle,renderedHandleVerified=false) {
  if(location.origin!=='https://creator.douyin.com'||!/^\/(?:creator-micro\/home\/?)?$/.test(location.pathname))return {code:'ORIGIN'};
  const state=window.__matrixOwnProfileObserved;if(state?.version!==1)return {available:false};
  const fresh=[...state.pages.values()].filter(sample=>Number.isFinite(sample.receivedAt)&&Date.now()-sample.receivedAt<=30000&&sample.receivedAt<=Date.now()+5000);
  const matching=fresh.filter(sample=>sample.handle===expectedHandle||sample.handleUnavailable===true&&renderedHandleVerified);
  if(matching.some(sample=>sample.handleUnavailable)&&fresh.some(sample=>typeof sample.handle==='string'&&sample.handle!==expectedHandle))return {code:'OWNER'};
  if(new Set(matching.map(sample=>sample.uid)).size>1)return {code:'OWNER'};
  const sample=matching.filter(sample=>Number.isSafeInteger(sample.followersCount)&&sample.followersCount>=0).sort((a,b)=>b.receivedAt-a.receivedAt)[0];
  if(sample)return {ownUid:sample.uid,metrics:{followersCount:sample.followersCount},source:'douyin-creator-profile'};
  const denied=[...state.failures.values()].find(failure=>failure.code==='HTTP'&&[401,403,429].includes(failure.httpStatus)||failure.code==='STATUS');
  if(denied)return {code:'DENIED',httpStatus:denied.httpStatus,platformCode:denied.platformCode};
  const schema=[...state.failures.values()].find(failure=>['SHAPE','OWNER_SHAPE','COUNTER_SHAPE'].includes(failure.code));
  if(!state.pending.size&&schema)return {code:'SCHEMA',fieldStage:schema.ownerStage||schema.code};
  return {available:false,pending:state.pending.size>0};
}
async function readObservedMetrics(guest,publicHandle,assertCurrent,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))) {
  if(!guest||guest.isDestroyed())return;
  for(let n=0;n<9;n++){
    await assertCurrent();if(guest.isDestroyed())throw Error('本人资料页已关闭，计数未采用');
    const readProfile=require('./platform-profile.cjs').readPlatformProfile;
    const result=await guest.executeJavaScript(`(()=>{const profile=(${readProfile.toString()})('douyin');const verified=profile.ownIdentity?.source==='official_own_homepage'&&profile.ownIdentity?.key===${JSON.stringify(publicHandle)}&&!profile.loginVisible&&!profile.verificationRequired&&!profile.accountIssue;return (${observedProfile.toString()})(${JSON.stringify(publicHandle)},verified)})()`,false);await assertCurrent();
    if(result?.source==='douyin-creator-profile')return result;
    if(result?.code==='DENIED')throw Error('抖音本人资料正常读取被官方拒绝'+(Number.isInteger(result.httpStatus)&&result.httpStatus>=100?`（HTTP ${result.httpStatus}）`:Number.isSafeInteger(result.platformCode)?`（平台码 ${result.platformCode}）`:'')+'，未尝试其他接口；原计数保留');
    if(result?.code==='SCHEMA')throw Error('抖音本人资料计数结构暂未识别（结构阶段：'+(['SHAPE','OWNER_SHAPE','COUNTER_SHAPE','OWNER_UID_MISSING','OWNER_UID_PRECISION','OWNER_UID_FORMAT','OWNER_HANDLE_MISSING','OWNER_HANDLE_FORMAT'].includes(result.fieldStage)?result.fieldStage:'SHAPE')+'），未当作零粉丝；原计数保留');
    if(result?.code)throw Error('抖音本人资料的页面或身份未能确认，原计数保留');
    if(!result?.pending||n===8)return;
    await sleep(250);
  }
}
if(typeof process!=='undefined'&&process.type==='renderer')require('electron').webFrame.executeJavaScriptInIsolatedWorld(0,[{code:'('+installProfileObserver.toString()+')('+normalizeCreatorProfile.toString()+')'}]).catch(()=>{});
else module.exports={normalizeCreatorProfile,installProfileObserver,observedProfile,readObservedMetrics,observedIdentity,readObservedIdentity};
