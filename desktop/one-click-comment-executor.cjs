'use strict';
const {randomUUID}=require('node:crypto');
const {createBilibiliFollowupTransport}=require('./bilibili-followup-transport.cjs');
const {ownsReply,replyId}=require('./bilibili-followup.cjs');
const {publicCommentDom}=require('./one-click-comment-dom.cjs');
const {createOperationBudget}=require('./operation-budget.cjs');
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
  return async({batch,row,account,primary,assertCurrent,beforeCommit})=>{
    const budget=createOperationBudget(65000);let win,client,ended=false;
    const current=async()=>{budget.check();if(ended)throw Error('本条评论已经结束');await assertCurrent();};
    try{
      if(batch.platform==='bilibili'){
        client=await budget.run(()=>createTransport({accountSession:session.fromPartition('persist:matrix-bilibili-'+account.connectorSessionId),workId:batch.workId,assertCurrent:current}),'准备B站评论连接',15000);
        return await budget.run(()=>biliComment({request:(...a)=>client.request(...a),workId:batch.workId,identity:account.nativeAccountKey,primaryIdentity:primary.nativeAccountKey,text:row.text,beforeCommit}),'提交并核对本条评论',40000);
      }
      const identity=await budget.run(()=>resolveOperationsIdentity({account,owner,assertCurrent:current}),'核对评论发送账号ID',25000);
      await current();win=createOperationsWindow({account,platform:account.platform,background:true});const guest=win.webContents;
      guest.setWindowOpenHandler(()=>({action:'deny'}));const host=new URL(batch.workUrl).hostname;
      guest.on('will-navigate',(event,url)=>{try{const u=new URL(url);if(u.protocol!=='https:'||u.hostname!==host)event.preventDefault();}catch{event.preventDefault();}});
      await budget.run(()=>guest.loadURL(batch.workUrl),'打开原作品',15000);await current();
      const nonce=randomUUID(),args={platform:batch.platform,workId:batch.workId,identity,text:row.text,nonce};
      // Main-world DOM reads are required for DY's rendered React row props.
      const dom=command=>budget.run(()=>guest.executeJavaScript(`(${publicCommentDom.toString()})(${JSON.stringify(command)},${JSON.stringify(args)})`,false),'核对评论控件',5000);
      await dom('prepare');await current();
      const health=await budget.run(()=>inspectAccountHealth(getEvent(),{accessToken:getEvent().accessToken,accountId:account.id,purpose:'publish-identity'}),'提交前核对账号',12000);
      if(health?.state!=='normal'||health.accountId!==account.id||health.sessionId!==account.connectorSessionId||health.nativeAccountKey!==account.nativeAccountKey)throw Error('发送前未核对到同一账号ID，已暂停');
      if(batch.platform==='douyin'&&health.identityEvidence?.ownUid!==identity)throw Error('官网发送UID与已核对账号不一致，未提交');
      await beforeCommit();await dom('submit');
      for(let n=0;n<10;n++){const result=await dom('result');if(result.status==='confirmed')return result;await budget.run(()=>sleep(500),'等待评论回执',1000);}
      return{status:'unknown',message:'未取得新评论ID，已暂停后续账号，请核对原作品'};
    }finally{ended=true;client?.close();if(win&&!win.isDestroyed())win.destroy();}
  };
}
module.exports={createCommentExecutor,biliComment};
