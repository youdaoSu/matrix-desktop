'use strict';
const {randomUUID}=require('node:crypto');
const {createBilibiliFollowupTransport}=require('./bilibili-followup-transport.cjs');
const {ownsReply,replyId}=require('./bilibili-followup.cjs');
const {publicCommentDom}=require('./one-click-comment-dom.cjs');
const {createOperationBudget}=require('./operation-budget.cjs');
function commentFailure(error,stage){
  const raw=String(error?.message||''),network=/\bERR_[A-Z_]+\b/.exec(raw)?.[0];
  const detail=raw.length<=300&&/[\u4e00-\u9fff]/.test(raw)&&!/(cookie|token|authorization|password|csrf|https?:|[A-Z]:\\)/i.test(raw)?raw:network?`页面网络错误 ${network}`:error?.name==='TypeError'?'程序处理异常（TypeError）':'页面执行异常，未取得可核对的结果';
  return Error(`${stage}：${detail}`);
}
// Catch inside the renderer: Electron may otherwise replace the original DOM
// exception with "Script failed to execute", losing the actionable reason.
function commentDomScript(command,args){return `(()=>{try{return {ok:true,value:(${publicCommentDom.toString()})(${JSON.stringify(command)},${JSON.stringify(args)})};}catch(e){return {ok:false,message:String(e?.message||'').slice(0,300)}}})()`;}
// Douyin changes a /video URL into /note for image posts. Chromium cancels
// the first navigation (-3); this is not a failed comment or a reason to reload.
async function loadCommentWork(guest,batch){
  let noteTransition=false;
  const started=(_event,url,inPlace,isMainFrame)=>{
    if(batch.platform!=='douyin'||inPlace||!isMainFrame)return;
    try{const u=new URL(url),from=new URL(batch.workUrl);if(from.origin==='https://www.douyin.com'&&from.pathname===`/video/${batch.workId}`&&u.origin===from.origin&&u.pathname===`/note/${batch.workId}`&&!u.username&&!u.password)noteTransition=true;}catch{}
  };
  guest.on('did-start-navigation',started);
  try{await guest.loadURL(batch.workUrl);}catch(error){if(!noteTransition||!/\bERR_ABORTED\b/.test(String(error?.message||'')))throw error;}
  finally{guest.removeListener('did-start-navigation',started);}
}
// Bili uses the existing bounded official-session transport; the original
// self-followup ownership guard is unchanged. Here primary and sender differ.
async function biliComment({request,workId,identity,primaryIdentity,text,beforeCommit}){
  const nav=await request('GET','/x/web-interface/nav');if(nav?.code!==0||nav.data?.isLogin!==true||String(nav.data.mid)!==identity)throw Error('B站当前登录UID与发送账号不同，未发送');
  const view=await request('GET','/x/web-interface/view',{bvid:workId});
  if(view?.code!==0||view.data?.bvid!==workId||String(view.data.owner?.mid)!==primaryIdentity||!/^\d+$/.test(String(view.data.aid||'')))throw Error('作品ID或作者UID与主号不一致，未发送');
  const oid=String(view.data.aid);await beforeCommit();
  const added=await request('POST','/x/v2/reply/add',{type:'1',oid,root:'0',parent:'0',message:text,plat:'1'});
  const commentId=replyId(added?.data)||replyId(added?.data?.reply);
  if(added?.code!==0)return{status:Number.isInteger(added?.code)&&added.code!==12051?'failed':'unknown',message:Number.isInteger(added?.code)?`B站评论返回 ${added.code}，后续账号已暂停`:'官方回执无法识别，评论结果待核对'};
  if(added.data?.need_captcha)return{status:'unknown',commentId,message:'官网要求本人验证，已暂停，不会重复评论'};
  const expected={oid,mid:identity,text,commentId};
  if(commentId&&ownsReply(added.data?.reply,expected))return{status:'confirmed',commentId,message:'官方已确认本条一级评论ID、发送UID和正文'};
  if(commentId){const detail=await request('GET','/x/v2/reply/detail',{type:'1',oid,root:commentId,ps:'1',next:'0'});if(detail?.code===0&&ownsReply(detail.data?.root,expected))return{status:'confirmed',commentId,message:'已核对原评论ID与账号'};}
  return{status:'unknown',commentId,message:'已提交评论，公开结果尚未核对；不会重发'};
}
function createCommentExecutor({session,createOperationsWindow,resolveOperationsIdentity,inspectAccountHealth,getEvent,owner,createTransport=createBilibiliFollowupTransport,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
  return async({batch,row,account,primary,assertCurrent,beforeCommit,verifyOnly=false})=>{
    const budget=createOperationBudget(90000);let win,client,ended=false,stage='核验发送账号';
    const current=async()=>{budget.check();if(ended)throw Error('本条评论已经结束');await assertCurrent();};
    const healthCheck=async(target=account)=>{
      await current();const event=getEvent();
      const health=await budget.run(()=>inspectAccountHealth(event,{accessToken:event.accessToken,accountId:target.id,purpose:'publish-identity'}),'核验账号',25000);
      await current();
      if(health?.state!=='normal'||health.verificationRequired||health.accountId!==target.id||health.sessionId!==target.connectorSessionId||health.nativeAccountKey!==target.nativeAccountKey)throw Error(health?.message||health?.error||'账号状态或绑定身份未确认正常，请在账号管理核验');
      return health;
    };
    try{
      if(verifyOnly&&!validReceiptId(batch.platform,row.commentId))throw Error('没有可复核的原评论ID');
      const initialHealth=await healthCheck();
      stage='核对评论发送账号ID';
      const identity=batch.platform==='bilibili'?account.nativeAccountKey:batch.platform==='douyin'?initialHealth.identityEvidence?.ownUid:await budget.run(()=>resolveOperationsIdentity({account,owner,assertCurrent:current}),'核对评论发送账号ID',25000);
      if(!identity||batch.platform==='douyin'&&!/^[1-9]\d{0,18}$/.test(identity))throw Error('账号状态已读取，但本人UID未确认，未打开评论页面');
      // Sender-side echo (even with a CID) does not establish author visibility.
      // Open a fresh page in the work owner's bound session. This path never
      // prepares a composer or commits a comment, including explicit rechecks.
      const verifyAuthor=async commentId=>{
        let reader;
        const result=(state,message)=>({status:state==='author-visible'?'confirmed':'unknown',commentId,message,visibility:{state,checkedAt:Date.now()}});
        try{
          if(!primary||primary.id===account.id||primary.connectorSessionId===account.connectorSessionId||primary.nativeAccountKey===account.nativeAccountKey)throw Error('作品作者与发送账号未独立核验');
          await healthCheck(primary);await current();
          if(batch.platform==='bilibili'){
            const primaryClient=await budget.run(()=>createTransport({accountSession:session.fromPartition('persist:matrix-bilibili-'+primary.connectorSessionId),workId:batch.workId,assertCurrent:current}),'准备作者只读连接',15000);
            try{
              const read=(route,params)=>budget.run(()=>primaryClient.request('GET',route,params),'读取原评论',8000);
              const nav=await read('/x/web-interface/nav');
              if(nav?.code!==0||!nav.data?.isLogin||String(nav.data.mid)!==primary.nativeAccountKey)throw Error('作品作者身份未确认');
              const view=await read('/x/web-interface/view',{bvid:batch.workId});
              if(view?.code!==0||view.data?.bvid!==batch.workId||String(view.data.owner?.mid)!==primary.nativeAccountKey||!/^\d+$/.test(String(view.data?.aid||'')))throw Error('作品与作者不匹配');
              const oid=String(view.data.aid);
              const detail=await read('/x/v2/reply/detail',{type:'1',oid,root:commentId,ps:'1',next:'0'});
              await current();
              return detail?.code===0&&ownsReply(detail.data?.root,{oid,mid:identity,text:row.text,commentId})?result('author-visible','作者侧已核对原评论ID、发送账号和正文'):result('not-observed','作者侧暂未读到匹配的原评论');
            }finally{primaryClient.close();}
          }
          reader=createOperationsWindow({account:primary,platform:batch.platform,background:true});
          const wc=reader.webContents,host=new URL(batch.workUrl).hostname;
          wc.setWindowOpenHandler(()=>({action:'deny'}));
          wc.on('will-navigate',(event,url)=>{try{const u=new URL(url);if(u.protocol!=='https:'||u.hostname!==host)event.preventDefault();}catch{event.preventDefault();}});
          await budget.run(()=>loadCommentWork(wc,batch),'打开作者视角原作品',15000);
          const args={platform:batch.platform,workId:batch.workId,identity,text:row.text,commentId,nonce:randomUUID()};
          const read=async command=>{await current();const r=await budget.run(()=>wc.executeJavaScript(commentDomScript(command,args),false),'只读复核原评论',5000);if(r?.ok!==true)throw Error(r?.message||'原评论读取结构无效');return r.value;};
          let ready=false;
          for(let n=0;n<20;n++){
            if(!wc.isLoadingMainFrame()&&(await read('open-comments'))?.ready){
              const receipt=await read('check-receipt');ready=ready||receipt?.ready;
              if(receipt?.visible){await current();return result('author-visible','已在作品作者的官网页面核对原评论ID、发送账号和完整正文；不代表所有用户均可见');}
            }
            await budget.run(()=>sleep(500),'等待作者视角评论列表',1000);
          }
          return result(ready?'not-observed':'unverified',ready?'已提交；本次作者视角已加载列表未读到原评论，原因未确认，不自动重发':'已提交；作者视角列表未就绪，尚未核对可见性，不自动重发');
        }catch(error){return result('unverified',`已提交；${commentFailure(error,'作者可见性未核对').message}；不自动重发`);}
        finally{if(reader&&!reader.isDestroyed())reader.destroy();}
      };
      if(verifyOnly)return await verifyAuthor(row.commentId);
      if(batch.platform==='bilibili'){
        stage='打开B站评论连接';
        client=await budget.run(()=>createTransport({accountSession:session.fromPartition('persist:matrix-bilibili-'+account.connectorSessionId),workId:batch.workId,assertCurrent:current}),'准备B站评论连接',15000);
        stage='提交并核对B站评论';
        const receipt=await budget.run(()=>biliComment({request:(...a)=>client.request(...a),workId:batch.workId,identity,primaryIdentity:primary.nativeAccountKey,text:row.text,beforeCommit}),'提交并核对本条评论',40000);
        return receipt.status==='confirmed'?await verifyAuthor(receipt.commentId):receipt;
      }
      await current();win=createOperationsWindow({account,platform:account.platform,background:true});const guest=win.webContents;
      guest.setWindowOpenHandler(()=>({action:'deny'}));const host=new URL(batch.workUrl).hostname;
      guest.on('will-navigate',(event,url)=>{try{const u=new URL(url);if(u.protocol!=='https:'||u.hostname!==host)event.preventDefault();}catch{event.preventDefault();}});
      stage='打开原作品';await budget.run(()=>loadCommentWork(guest,batch),'打开原作品',15000);await current();
      const nonce=randomUUID(),args={platform:batch.platform,workId:batch.workId,identity,text:row.text,nonce};
      // Main-world DOM reads are required for DY's rendered React row props.
      const dom=async command=>{const result=await budget.run(()=>guest.executeJavaScript(commentDomScript(command,args),false),'核对评论控件',5000);if(!result||result.ok!==true)throw Error(result?.message||'评论页面返回结构无效');return result.value;};
      stage='等待评论框加载';let ready=false;
      for(let n=0;n<24;n++){await current();if(!guest.isLoadingMainFrame()&&(await dom('ready'))?.ready){ready=true;break;}await budget.run(()=>sleep(500),'等待评论框加载',1000);}
      if(!ready)throw Error('作品已打开，但评论输入框尚未显示；本次未填写或发送');
      stage='填写并核对评论正文';const preparation=await dom('prepare');await current();
      if(preparation?.requiresNativeInput){
        await dom('input-ready');await budget.run(()=>guest.insertText(row.text),'填写原评论正文',5000);await current();
        let prepared=false;for(let n=0;n<8;n++){if((await dom('verify-prepared'))?.prepared){prepared=true;break;}await budget.run(()=>sleep(250),'核对原评论正文',1000);}
        if(!prepared)throw Error('原评论正文未通过核对，本次未提交');
      }
      stage='提交前复核发送账号';const health=await healthCheck();
      if(batch.platform==='douyin'&&health.identityEvidence?.ownUid!==identity)throw Error('官网发送UID与已核对账号不一致，未提交');
      stage='核对评论发送按钮';let sendReady=false;
      for(let n=0;n<10;n++){await current();if((await dom('submit-ready'))?.ready){sendReady=true;break;}await budget.run(()=>sleep(250),'等待评论发送按钮',1000);}
      if(!sendReady)throw Error('评论正文已填写，但发送按钮尚未就绪；本次未提交');
      stage='提交评论';await beforeCommit();await dom('submit');
      stage='读取评论回执';
      for(let n=0;n<10;n++){const result=await dom('result');if(result.status==='confirmed'){
        if(win&&!win.isDestroyed())win.destroy();win=undefined;
        stage='复核作者可见性';return await verifyAuthor(result.commentId);
      }await budget.run(()=>sleep(500),'等待评论回执',1000);}
      return{status:'unknown',message:'未取得新评论ID，已暂停后续账号，请核对原作品'};
    }catch(error){throw commentFailure(error,stage);}finally{ended=true;client?.close();if(win&&!win.isDestroyed())win.destroy();}
  };
}
function validReceiptId(platform,id){
  if(typeof id!=='string')return false;
  return platform==='xiaohongshu'?/^[\w-]{1,80}$/.test(id):['douyin','bilibili'].includes(platform)&&/^\d{1,25}$/.test(id);
}
module.exports={createCommentExecutor,biliComment,commentFailure,commentDomScript,loadCommentWork,validReceiptId};
