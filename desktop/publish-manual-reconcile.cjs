// A read-only reconciliation request, never a simulated submission/click.
const {createHash}=require('node:crypto');
const {createOperationBudget}=require('./operation-budget.cjs');
const {findOwnedPageAction}=require('./page-action-lookup.cjs');
const id=value=>typeof value==='string'&&/^[a-z0-9-]{16,80}$/i.test(value);
function registerManualPublishReconciliation({ipcMain,getWindow,authenticate,journal,verifyPublishResult,now=Date.now}){
  const pending=new Map();
  ipcMain.handle('matrix:verify-manual-publish',async(event,input)=>{
    try{
      const host=getWindow();if(!host||event.sender.id!==host.webContents.id)throw Error('仅允许远效主窗口核对原任务');
      if(![input?.accountId,input?.taskId,input?.attemptId].every(id)||!['douyin','xiaohongshu'].includes(input.platform)||typeof input.expectedTitle!=='string'||!input.expectedTitle.trim()||input.expectedTitle.length>500)throw Error('原任务核验参数无效');
      const started=Date.parse(input.startedAt);
      if(!Number.isFinite(started)||started>now()+60000||now()-started>7*86400000)throw Error('原尝试时间无效，请核对原作品，不会重发');
      if(input.visibility!==undefined&&!['公开','好友可见','仅自己可见'].includes(input.visibility))throw Error('原可见范围无效');
      if(input.body!==undefined&&(typeof input.body!=='string'||input.body.length>10000))throw Error('原作品正文无效');
      if(input.topics!==undefined&&(!Array.isArray(input.topics)||input.topics.length>100||input.topics.some(value=>typeof value!=='string'||value.length>100)))throw Error('原作品话题无效');
      // Use the saved original form content, not a loose title-prefix match.
      const summary=input.platform==='douyin'?[input.expectedTitle.trim(),input.body,(input.topics||[]).map(tag=>'#'+tag).join(' ')].filter(Boolean).join('\n').slice(0,1000):input.expectedTitle.trim();
      if(input.expectedWorkId!==undefined&&(typeof input.expectedWorkId!=='string'||!(input.platform==='douyin'?/^[1-9]\d{9,24}$/:/^[a-f0-9]{24}$/).test(input.expectedWorkId)))throw Error('作品ID无效');
      const auth=await createOperationBudget(10000).run(()=>authenticate(input.accessToken,input.accountId),'核验原绑定账号',10000),account=auth.account;
      if(!account||account.id!==input.accountId||account.platform!==input.platform||!id(account.connectorSessionId)||!account.nativeAccountKey)throw Error('原账号身份编号尚未核验，未修改发布结果');
      const key=[auth.userId,input.taskId,input.attemptId].join(':');
      const fingerprint=JSON.stringify([input.accountId,input.platform,input.expectedTitle.trim(),summary,new Date(started).toISOString(),input.visibility,input.expectedWorkId,account.connectorSessionId,account.nativeAccountKey]);
      if(pending.has(key)){
        const active=pending.get(key);
        if(active.fingerprint!==fingerprint)throw Error('本条任务正在核对另一组原参数，未混用结果');
        return await active.promise;
      }
      const work=(async()=>{
        const digest=createHash('sha256').update(JSON.stringify(['manual-verification-v1',auth.userId,input.accountId,input.taskId,input.attemptId])).digest('hex');
        const recordId=[digest.slice(0,8),digest.slice(8,12),'5'+digest.slice(13,16),'8'+digest.slice(17,20),digest.slice(20,32)].join('-');
        const previous=findOwnedPageAction(journal,auth.userId,recordId)||journal.list(auth.userId).find(row=>row.kind==='publish'&&row.taskId===input.taskId&&row.attemptId===input.attemptId);
        if(previous&&(previous.accountId!==input.accountId||previous.platform!==input.platform))throw Error('原任务账号不一致');
        if(previous&&!previous.manualVerification)throw Error('该尝试已有提交回执，请核对原回执，不另建记录');
        if(previous&&(previous.expectedTitle!==input.expectedTitle.trim()||previous.createdAt!==new Date(started).toISOString()||previous.sessionId!==account.connectorSessionId||previous.nativeAccountKey!==account.nativeAccountKey||previous.expectedWorkId!==input.expectedWorkId||previous.visibility!==input.visibility))throw Error('原核验内容或绑定已变化，未覆盖原记录');
        const record=previous||{id:recordId,ownerId:auth.userId,accountId:account.id,platform:account.platform,nickname:account.nickname,sessionId:account.connectorSessionId,nativeAccountKey:account.nativeAccountKey,taskId:input.taskId,attemptId:input.attemptId,kind:'publish',expectedTitle:input.expectedTitle.trim(),summary:input.expectedTitle.trim(),visibility:input.visibility,expectedWorkId:input.expectedWorkId,createdAt:new Date(started).toISOString(),verificationRequestedAt:new Date(now()).toISOString(),status:'unknown',clicked:false,manualVerification:true,button:'只读核对官网作品（未代点发布）',pageUrl:'',checkpoint:'manual_verification_requested',resultSource:'manual_verification_request',message:'正在核对官网原作品；未上传、未点击发布，不会重发'};
        if(previous&&previous.summary!==summary&&summary!==input.expectedTitle.trim()){
          if(previous.summary!==previous.expectedTitle||previous.status!=='unknown')throw Error('原核验正文已确定，未覆盖原记录');
          // Public receipt projections omit ownerId. Restore the authenticated
          // owner on append or the next owned lookup silently reads the old row.
          journal.write({...record,ownerId:auth.userId,summary});
        }else if(!previous){record.summary=summary;journal.write(record);}
        return await verifyPublishResult(event,{accessToken:input.accessToken,receiptId:record.id});
      })();
      pending.set(key,{fingerprint,promise:work});try{return await work;}finally{pending.delete(key);}
    }catch(error){return {error:error.message};}
  });
}
module.exports={registerManualPublishReconciliation};
