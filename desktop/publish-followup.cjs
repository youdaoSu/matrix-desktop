const {createOperationBudget}=require('./operation-budget.cjs');
const {createBilibiliFollowup}=require('./bilibili-followup.cjs');
const {createBilibiliFollowupManagement}=require('./bilibili-followup-manage.cjs');
const {createBilibiliFollowupTransport}=require('./bilibili-followup-transport.cjs');

function bilibiliReference(value){
  if(!value||value.workReferenceSource!=='official_title_link'||!/^BV[0-9A-Za-z]{10}$/.test(value.workId||''))return;
  try{const url=new URL(value.workUrl);if(url.protocol==='https:'&&url.hostname==='www.bilibili.com'&&!url.port&&!url.username&&!url.password&&!url.search&&!url.hash&&new RegExp('^/video/'+value.workId+'/?$').test(url.pathname))return{workId:value.workId,workUrl:url.origin+url.pathname};}catch{}
}
function publicReceipt(record){
  const result={};for(const key of ['id','accountId','platform','nickname','kind','taskId','attemptId','pageUrl','button','summary','status','message','createdAt','completedAt','clicked','followupOf','commentId','pinResult','commentManagement','commentDeleted','retryable','checkpoint','officialCode'])if(record[key]!==undefined)result[key]=record[key];if(record.evidence)result.evidence=Object.fromEntries(['workId','workUrl','workReferenceSource','commentId'].filter(key=>record.evidence[key]!==undefined).map(key=>[key,record.evidence[key]]));return result;
}
function safeFailure(error){const message=typeof error?.message==='string'?error.message:'';return message.length<=500&&/[\u4e00-\u9fff]/.test(message)&&!/(?:cookie|csrf|sessdata|authorization|password|access[_-]?token|bili_jct)/i.test(message)?message:'追评执行异常，未取得可核对的结果；请核对原评论，不要重复发送';}

function registerPublishFollowup({ipcMain,getWindow,authenticate,session,journal,createTransport=createBilibiliFollowupTransport,openWebContext,collectPublishReference,timeoutMs=45000}){
  const busy=new Set();
  ipcMain.handle('matrix:publish-followup',async(event,input)=>{
    let key,record,client,ended=false,dispatched=false,pinDispatched=false,previousConfirmed=false,previousMayHaveSent=false,acquired=false,previousRequestId,managementOperation,managementStarted=false;
    const startedAt=Date.now();
    const save=()=>{try{
      const latest=journal.find(record.ownerId,record.id);
      if(latest?.requestId&&latest.requestId!==record.requestId&&latest.requestId!==previousRequestId)throw Error('superseded');
      if(latest?.status==='confirmed'&&record.status!=='confirmed')record={...record,...latest};
      journal.write(record);
    }catch{throw Error('本机追评回执保存失败或已被更新；已停止后续发送，请核对原评论');}};
    try{
      const host=getWindow();if(!host||event.sender.id!==host.webContents.id)throw Error('仅允许远效主窗口操作追评');
      const operation=input?.operation||'start';
      if(!['start','verify','pin','unpin','delete'].includes(operation)||typeof input?.receiptId!=='string'||!/^[a-z0-9-]{16,80}$/i.test(input.receiptId)||operation!=='verify'&&!/^[a-z0-9-]{16,80}$/i.test(input.requestId||''))throw Error('追评操作或原发布回执无效，未发送');
      const budget=createOperationBudget(timeoutMs);
      const auth=await budget.run(()=>authenticate(input.accessToken,input.accountId),'读取追评所属绑定账号',8000),account=auth.account;
      if(['unpin','delete'].includes(operation)&&account?.platform!=='bilibili')throw Error('评论取消置顶和删除当前仅接入B站，未操作其他平台');
      if(account?.id===input.accountId&&['xiaohongshu','wechat'].includes(account.platform)){
        const old=journal.find(auth.userId,input.receiptId);
        if(collectPublishReference&&old?.accountId===account.id&&old.status==='confirmed'&&(!require('./publish-reference.cjs').workReference(account.platform,old.evidence)||!old.nativeAccountKey&&!old.referenceAttestation)){
          const collected=await budget.run(()=>collectPublishReference(event,{accessToken:input.accessToken,receiptId:input.receiptId}),'只读补取原作品编号',timeoutMs-1000);
          if(!require('./publish-reference.cjs').workReference(account.platform,collected.receipt?.evidence)||Date.now()-startedAt>timeoutMs-10000)return{pending:true,message:collected.receipt?.referenceCollection?.message||collected.error||'原作品编号只读补取完成；请使用原追评入口继续，作品不重发'};
        }
        return await require('./web-followup.cjs').runWebFollowup({event,input,auth,account,authenticate,journal,busy,openContext:openWebContext,publicReceipt,safeFailure,timeoutMs:Math.max(1,timeoutMs-(Date.now()-startedAt))});
      }
      if(!account||account.id!==input.accountId||account.platform!=='bilibili')throw Error('自动追评与置顶当前仅接入B站会话适配；其他平台保留文案待办，尚未自动发送');
      if(typeof journal.find!=='function')throw Error('当前本机回执索引尚不可用，未发送追评');
      const parent=journal.find(auth.userId,input.receiptId),reference=bilibiliReference(parent?.evidence);
      if(!parent||parent.kind!=='publish'||parent.status!=='confirmed'||parent.accountId!==account.id||parent.platform!=='bilibili')throw Error('未找到属于此账号的成功发布回执，未发送追评');
      if(operation!=='verify'&&['processing','rejected'].includes(parent.verification?.state))throw Error('作品已提交，审核尚未通过，未发送追评或置顶');
      if(!/^[a-z0-9-]{16,80}$/i.test(account.connectorSessionId||'')||parent.sessionId!==account.connectorSessionId||!/^\d{1,25}$/.test(account.nativeAccountKey||'')||parent.nativeAccountKey!==account.nativeAccountKey)throw Error('原发布会话或稳定UID与当前绑定不一致，未发送追评');
      if(!reference){
        if(parent.evidence?.workId||parent.evidence?.workUrl)throw Error('原回执的BV号与官方作品链接不一致或来源未核实，未发送追评');
        return{pending:true,message:'作品已发布，但原回执尚未取得准确BV号；追评文案保留，不会按同名标题猜测或重发作品'};
      }
      key=auth.userId+':'+account.id;if(busy.has(key))throw Error('此账号正在处理另一条追评，请等待该操作结果；不会合并其他账号的状态');busy.add(key);acquired=true;
      const childId='followup-'+parent.id,existing=journal.find(auth.userId,childId);
      if(existing&&(existing.accountId!==account.id||existing.followupOf!==parent.id||existing.sessionId!==account.connectorSessionId||existing.nativeAccountKey!==account.nativeAccountKey))throw Error('原追评记录与当前账号会话不一致，未发送');
      if(operation!=='verify'&&existing?.requestId===input.requestId)return{receipt:publicReceipt({...existing,status:existing.status==='submitting'?'unknown':existing.status})};
      if(existing?.commentDeleted===true)return{receipt:publicReceipt(existing)};
      if(operation!=='verify'&&existing?.commentManagement?.status==='unknown')return{receipt:publicReceipt(existing),pending:true,message:'上次评论管理结果未确认；请只核对，不会重复删除、置顶或发送'};
      if(['unpin','delete'].includes(operation)){
        if(existing?.status!=='confirmed'||!existing.commentId||input.expectedCommentId!==existing.commentId||input.expectedComment!==existing.summary)throw Error('确认弹窗的原评论ID或正文已变化，请重新核对，未操作');
        managementOperation=operation;
      }else if(operation==='verify'&&existing?.commentManagement?.status==='unknown')managementOperation=existing.commentManagement.operation;
      if(operation==='start'&&existing){
        const definitelyUnsent=existing.clicked===false&&existing.checkpoint==='followup_preparing';
        if(existing.status==='confirmed'||!definitelyUnsent&&(existing.status==='submitting'||existing.status==='unknown'||existing.retryable!==true))return{receipt:publicReceipt({...existing,status:existing.status==='submitting'?'unknown':existing.status})};
      }
      if(operation!=='start'&&!existing)throw Error('没有可核对的原追评记录，未创建新评论');
      const text=operation==='start'?input.comment?.trim():existing.summary;
      if(typeof text!=='string'||!text||text.length>2000)throw Error('请填写有效的追评正文，未发送');
      previousConfirmed=existing?.status==='confirmed';
      previousMayHaveSent=Boolean(existing&&(!existing.retryable&&existing.clicked!==false||existing.commentId));previousRequestId=existing?.requestId;
      record={...(existing||{}),id:childId,ownerId:auth.userId,accountId:account.id,platform:'bilibili',nickname:account.nickname||parent.nickname,kind:'comments',taskId:parent.taskId,attemptId:parent.attemptId,followupOf:parent.id,sessionId:account.connectorSessionId,nativeAccountKey:account.nativeAccountKey,pageUrl:reference.workUrl,button:'发布后追评',summary:text,createdAt:existing?.createdAt||new Date().toISOString(),status:previousConfirmed?'confirmed':'unknown',message:operation==='start'?'正在核对原作品与本人UID，尚未发送追评':'正在只读核对原评论ID',checkpoint:'followup_preparing',requestId:input.requestId||existing?.requestId,retryable:false,evidence:{workId:reference.workId,workUrl:reference.workUrl,workReferenceSource:'official_title_link'}};
      if(operation==='start')record.clicked=false;
      const assertCurrent=async()=>{
        budget.check();if(ended)throw Error('本次追评已结束，未开始后续发送');
        const fresh=await budget.run(()=>authenticate(input.accessToken,account.id),'再次确认追评账号',8000);
        if(fresh.userId!==auth.userId||fresh.account.platform!=='bilibili'||fresh.account.connectorSessionId!==account.connectorSessionId||fresh.account.nativeAccountKey!==account.nativeAccountKey)throw Error('追评期间账号绑定已变化，已停止后续发送');
      };
      save();
      client=await budget.run(()=>createTransport({accountSession:session.fromPartition('persist:matrix-bilibili-'+account.connectorSessionId),workId:reference.workId,assertCurrent,onDispatch:({method,route})=>{
        budget.check();if(ended)throw Error('本次追评已结束');
        if(method==='POST'){
          const latest=journal.find(auth.userId,childId);if(latest?.requestId!==record.requestId)throw Error('追评意图已变化，未发送');
          if(route==='/x/v2/reply/add')dispatched=true;else if(route==='/x/v2/reply/top')pinDispatched=true;
        }
      }}).then(value=>{if(ended){value.close();throw Error('追评连接已结束');}return value;}),'准备本次追评会话',12000);
      if(managementOperation){
        const result=await budget.run(()=>createBilibiliFollowupManagement({request:(...args)=>client.request(...args)})({workId:reference.workId,nativeAccountKey:account.nativeAccountKey,text,commentId:record.commentId,operation:managementOperation,verifyOnly:operation==='verify'},{beforeDispatch:async()=>{
          await assertCurrent();record.commentManagement={operation:managementOperation,status:'unknown',commentId:record.commentId,message:'评论管理请求准备发送；结果未确认时不重复操作'};record.checkpoint='followup_management_started';save();managementStarted=true;
        }}),'核对和管理原追评',40000);
        record.commentManagement=result;record.message=result.message;record.completedAt=new Date().toISOString();record.checkpoint='followup_management_result';
        if(result.status==='confirmed'){
          if(result.operation==='delete')record.commentDeleted=true;
          record.pinResult={status:'cancelled',message:result.operation==='delete'?'原追评已删除，不再置顶':'原追评当前未置顶'};
        }
        save();return{receipt:publicReceipt(record)};
      }
      const execute=createBilibiliFollowup({request:(...args)=>client.request(...args)});
      const result=await budget.run(()=>execute({workId:reference.workId,nativeAccountKey:account.nativeAccountKey,text,commentId:operation==='start'?undefined:record.commentId,operation,pin:operation==='pin'||operation==='verify'&&!!existing?.pinResult||operation==='start'&&input.pin===true},{
        beforeDispatch:async value=>{
          await assertCurrent();
          if(value.operation==='comment'){record.status='submitting';record.clicked=true;record.checkpoint='followup_request_started';record.message='追评请求准备发送，结果需等待官方回执';save();}
          else{record.pinResult={status:'unknown',message:'置顶请求准备发送，结果需等待官方回执'};record.checkpoint='followup_pin_started';save();}
        },
        acknowledged:async value=>{record.commentId=value.commentId;record.evidence.commentId=value.commentId;record.checkpoint='followup_comment_id_received';save();},
      }),'处理本条追评与独立置顶',40000);
      record.status=previousConfirmed?'confirmed':result.status;record.message=result.message;record.completedAt=new Date().toISOString();record.checkpoint='followup_result';record.commentId=result.commentId||record.commentId;record.evidence.commentId=record.commentId;
      if(result.pin)record.pinResult=operation==='verify'&&existing?.pinResult?.status==='cancelled'&&existing?.commentManagement?.operation==='unpin'&&existing.commentManagement.status==='confirmed'&&result.pin.status==='failed'?{status:'cancelled',message:'官方核对原追评当前未置顶；已取消的状态保留，未重新置顶'}:result.pin;
      else if(operation==='pin'&&result.status!=='confirmed')record.pinResult={status:'unknown',message:result.message};
      record.officialCode=result.officialCode;record.retryable=record.status==='failed'&&Number.isInteger(result.officialCode);save();
      return{receipt:publicReceipt(record)};
    }catch(error){
      const message=safeFailure(error);
      if(record&&managementOperation){record.commentManagement={operation:managementOperation,status:managementStarted||record.commentManagement?.status==='unknown'?'unknown':'failed',commentId:record.commentId,message};record.message=message;record.completedAt=new Date().toISOString();try{save();}catch{}return{error:message,receipt:publicReceipt(record)};}
      if(record){const mayHaveSent=dispatched||previousMayHaveSent;record.status=previousConfirmed?'confirmed':mayHaveSent?'unknown':'failed';record.clicked=mayHaveSent||previousConfirmed||false;record.message=message;record.retryable=!mayHaveSent&&!previousConfirmed;record.completedAt=new Date().toISOString();if(pinDispatched)record.pinResult={status:'unknown',message:'置顶结果待核对；原追评无需重发'};try{save();}catch{}return{error:message,receipt:publicReceipt(record),mayHaveSubmitted:mayHaveSent};}
      return{error:message};
    }finally{ended=true;client?.close();if(acquired)busy.delete(key);}
  });
}
module.exports={registerPublishFollowup,bilibiliReference,publicReceipt};
