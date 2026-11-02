// One explicit same-origin READ diagnostic. No copied tokens/headers, signing,
// SDK calls, response body export, fallback request or follower-cache writes.
async function inspectFollowerResponse({uid,secUid}) {
 const facts={responseStatus:0,responseMime:0,responseEncoding:0,responseReadError:0,responseBytes:0,responseBodyKind:0,responseJsonValid:false,responseRosterShape:false,responseApiAccepted:false};
 if(location.origin!=='https://www.douyin.com'||!['/','/jingxuan','/jingxuan/','/user/self','/user/self/'].includes(location.pathname)||!/^\d{1,19}$/.test(uid||'')||!/^MS4w[A-Za-z0-9_-]{1,250}$/.test(secUid||''))return {facts,error:'官网本人资料未提供可核验编号，未发起接口检测'};
 const control=new AbortController(),timer=setTimeout(()=>control.abort(),6000);let platformCode;
 try{
  const query=new URLSearchParams({aid:'6383',device_platform:'webapp',channel:'channel_pc_web',count:'20',user_id:uid,sec_user_id:secUid,source_type:'1',max_time:'0',min_time:'0',offset:'0',gps_access:'0',address_book_access:'0'});
  const response=await fetch('/aweme/v1/web/user/follower/list/?'+query.toString(),{method:'GET',credentials:'same-origin',redirect:'error',signal:control.signal});
  facts.responseStatus=Number.isInteger(response.status)&&response.status>=100&&response.status<=599?response.status:0;
  const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase(),encoding=(response.headers.get('content-encoding')||'').trim().toLowerCase();
  facts.responseMime=/^(?:application\/(?:[\w.+-]+\+)?json|text\/json)$/.test(mime)?1:mime==='text/html'?2:mime.startsWith('text/')?3:mime?4:0;
  facts.responseEncoding=encoding==='gzip'?1:encoding==='br'?2:encoding==='deflate'?3:encoding?4:0;
  if(response.status!==200){try{await response.body?.cancel();}catch{}return {facts};}
  if(Number(response.headers.get('content-length'))>1024*1024){facts.responseReadError=2;try{await response.body?.cancel();}catch{}return {facts};}
  if(response.body===null){facts.responseBodyKind=1;return {facts};}
  if(typeof response.body?.getReader!=='function'){facts.responseReadError=1;return {facts};}
  const reader=response.body.getReader(),decoder=new TextDecoder();let raw='';
  try{for(;;){const part=await reader.read();if(part.done)break;facts.responseBytes+=part.value.byteLength;if(facts.responseBytes>1024*1024){facts.responseBytes=1024*1024+1;facts.responseReadError=2;return {facts};}raw+=decoder.decode(part.value,{stream:true});}raw+=decoder.decode();}finally{try{await reader.cancel();}catch{}}
  const trimmed=raw.replace(/^\uFEFF/,'').trimStart();
  facts.responseBodyKind=!trimmed.length?1:/^<!doctype\s+html|^<html(?:\s|>)/i.test(trimmed)?2:/^[{[]/.test(trimmed)?3:/^(?:\)\]\}',?|for\s*\(\s*;;\s*\)\s*;|while\s*\(\s*1\s*\)\s*;)/.test(trimmed)?4:/[\u0000-\u0008\ufffd]/.test(trimmed.slice(0,64))?5:6;
  try{
   const outer=JSON.parse(trimmed);facts.responseJsonValid=true;
   if(outer&&typeof outer==='object'&&!Array.isArray(outer)){
    const body=outer.data&&typeof outer.data==='object'&&!Array.isArray(outer.data)?outer.data:outer;
    const status=body.status_code??body.statusCode??outer.status_code??outer.statusCode;
    if((typeof status==='number'||typeof status==='string'&&/^-?\d{1,9}$/.test(status))&&Number.isSafeInteger(Number(status))&&Math.abs(Number(status))<=2147483647)platformCode=Number(status);
    const list=Object.hasOwn(body,'followers')?body.followers:Object.hasOwn(body,'followList')?body.followList:body.follow_list,more=body.has_more??body.hasMore;
    facts.responseApiAccepted=platformCode===0;
    facts.responseRosterShape=facts.responseApiAccepted&&[true,false,0,1,'0','1'].includes(more)&&(Array.isArray(list)&&list.length<=100||list===null&&[false,0,'0'].includes(more));
   }
  }catch{/* JSON-like/HTML/empty text is reported, never rewritten into data. */}
  return {facts,...(platformCode!==undefined?{platformCode}:{})};
 }catch{facts.responseReadError=control.signal.aborted?4:3;return {facts};}finally{clearTimeout(timer);}
}
module.exports={inspectFollowerResponse};
