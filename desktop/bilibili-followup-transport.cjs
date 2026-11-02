const {createHash}=require('node:crypto');
// Credentials stay solely in this short-lived main-process closure. Only a
// validated bound partition can create it; no Cookie/CSRF or raw body is logged,
// persisted in a journal, returned to the UI, or redirected to another origin.
async function createBilibiliFollowupTransport({accountSession,workId,assertCurrent,onDispatch=()=>{},now=Date.now,timeoutMs=12000}) {
  if(typeof workId!=='string'||!/^BV[0-9A-Za-z]{10}$/.test(workId))throw Error('追评缺少准确的原作品ID，未读取会话或发送请求');
  // www -> api is cross-origin. Electron validates manually supplied Referer
  // against Chromium's default policy and rejects an unsanitized full path
  // before dispatch. Preserve that policy and send only the source origin.
  const referer=new URL(`https://www.bilibili.com/video/${workId}/`).origin+'/';
  const credentialRows=async()=>{let timer;try{return await Promise.race([accountSession.cookies.get({url:'https://api.bilibili.com/'}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('B站本机会话读取超时，未发送追评')),timeoutMs);})]);}finally{clearTimeout(timer);}};
  const credentials=async()=>{
    const rows=await credentialRows(),values={};
    for(const name of ['SESSDATA','bili_jct']){
      const candidates=rows.filter(row=>row.name===name&&(!row.expirationDate||row.expirationDate>now()/1000));
      if(candidates.length!==1||typeof candidates[0].value!=='string'||!candidates[0].value||candidates[0].value.length>4096||/[\u0000-\u0020\u007f;,]/.test(candidates[0].value))throw Error('B站官方登录或会话校验未就绪，请在账号管理恢复登录');
      values[name]=candidates[0].value;
    }
    if(!/^[A-Za-z0-9_-]{16,128}$/.test(values.bili_jct))throw Error('B站会话校验格式未识别，未发送追评');
    return values;
  };
  const digest=value=>createHash('sha256').update(value.SESSDATA).update('\0').update(value.bili_jct).digest('hex');
  await assertCurrent();const snapshot=await credentials(),fingerprint=digest(snapshot);await assertCurrent();
  const allowed={GET:{'/x/web-interface/nav':[],'/x/web-interface/view':['bvid'],'/x/v2/reply/detail':['oid','root','type','ps','next'],'/x/v2/reply':['type','oid','ps','pn','sort']},POST:{'/x/v2/reply/add':['type','oid','root','parent','message','plat'],'/x/v2/reply/top':['type','oid','rpid','action'],'/x/v2/reply/del':['type','oid','rpid']}};
  let closed=false;const controllers=new Set();
  return {
    close(){closed=true;for(const controller of controllers)controller.abort();for(const key of Object.keys(snapshot))snapshot[key]='';},
    async request(method,route,data={}) {
      if(closed)throw Error('这次追评连接已结束，不会重用旧会话');
      const keys=allowed[method]?.[route];
      if(!keys||!data||typeof data!=='object'||Object.keys(data).some(key=>!keys.includes(key))||Object.values(data).some(value=>typeof value!=='string'||value.length>2000))throw Error('不支持的追评请求，未访问其他接口');
      if(method==='POST'&&['/x/v2/reply/top','/x/v2/reply/del'].includes(route)&&(data.type!=='1'||!Object.hasOwn(data,'oid')||!Object.hasOwn(data,'rpid')||!['oid','rpid'].every(key=>/^[1-9]\d{0,24}$/.test(data[key]))||route.endsWith('/top')&&!['0','1'].includes(data.action)))throw Error('不支持的评论管理目标，未发送');
      await assertCurrent();const fresh=await credentials();await assertCurrent();if(closed||digest(fresh)!==fingerprint)throw Error('B站官方登录会话已变化，已停止追评；不会使用另一个账号发送');
      const url=new URL(route,'https://api.bilibili.com'),body=new URLSearchParams(data);
      if(method==='GET')url.search=body.toString();else body.set('csrf',snapshot.bili_jct);
      const controller=new AbortController();controllers.add(controller);let timer,stage='连接',httpStatus=0,responseKind='尚未收到响应';
      const operation={'/x/web-interface/nav':'本人登录核验','/x/web-interface/view':'作品归属核验','/x/v2/reply/detail':'原评论详情','/x/v2/reply':'评论与置顶列表','/x/v2/reply/add':'发送追评','/x/v2/reply/top':'设置置顶','/x/v2/reply/del':'删除评论'}[route];
      try{
        const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('timeout'));},timeoutMs);});
        onDispatch({method,route});
        const pending=accountSession.fetch(url.href,{method,credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json',Cookie:`SESSDATA=${snapshot.SESSDATA}; bili_jct=${snapshot.bili_jct}`,Origin:'https://www.bilibili.com',Referer:referer,...(method==='POST'?{'Content-Type':'application/x-www-form-urlencoded'}:{})},...(method==='POST'?{body:body.toString()}:{})});
        const response=await Promise.race([pending,deadline]);
        stage='响应头';httpStatus=Number.isInteger(response.status)&&response.status>=100&&response.status<=599?response.status:0;
        const contentType=response.headers.get('content-type')||'';
        responseKind=/^application\/json(?:\s*;|$)/i.test(contentType)?'JSON':/^text\/html(?:\s*;|$)/i.test(contentType)?'网页':'非JSON类型';
        if(response.status!==200||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))throw Error('response');
        stage='响应体读取';
        const reader=response.body?.getReader();if(!reader)throw Error('response');
        let size=0;const chunks=[];
        while(true){const part=await Promise.race([reader.read(),deadline]);if(part.done)break;size+=part.value.length;if(size>2*1024*1024){void reader.cancel().catch(()=>{});throw Error('response');}chunks.push(part.value);}
        stage='JSON解析';
        const bytes=Buffer.concat(chunks.map(chunk=>Buffer.from(chunk)),size),value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
        if(!value||typeof value!=='object'||Array.isArray(value))throw Error('response');
        return value;
      }catch(error){
        // Never relay exception/response text that might contain Cookie, CSRF,
        // request headers or an HTML login challenge. POST is not retried.
        const networkCode=typeof error?.message==='string'?/^net::(ERR_[A-Z0-9_]{1,64})$/.exec(error.message)?.[1]:undefined;
        const diagnostic=`${operation}：${stage}；HTTP ${httpStatus||'未收到'}；${responseKind}${networkCode?'；'+networkCode:''}`;
        throw Error(closed?'这次追评连接已结束，平台结果需核对；不会自动重复发送':controller.signal.aborted?`B站请求超时（${diagnostic}），提交结果需核对；不会自动重复发送`:`B站未返回可核对的结构化结果（${diagnostic}）；不会自动重复发送`);
      }finally{clearTimeout(timer);controller.abort();controllers.delete(controller);}
    },
  };
}
module.exports={createBilibiliFollowupTransport};
