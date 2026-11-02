// Explicit local adjudication of OLD uncertain attempts. Never posts, retries,
// changes titles/nicknames in old evidence, or invents an official failure.
const {createOperationBudget}=require('./operation-budget.cjs');
const {findOwnedPageAction}=require('./page-action-lookup.cjs');
function registerPublishResolution({ipcMain,getWindow,authenticate,journal,dialog,verifyPublishResult,inspectAccountHealth,now=Date.now}){
  const pending=new Set();
  const bounded=(action,label,limit=10000)=>createOperationBudget(limit).run(action,label,limit);
  ipcMain.handle('matrix:resolve-publish-receipt',async(event,input)=>{
    let lock,locked=false;
    try{
      const win=getWindow();if(!win||event.sender.id!==win.webContents.id)throw Error('仅允许远效主窗口核对原记录');
      if(!['identity_rename','not_published'].includes(input?.kind)||typeof input?.receiptId!=='string')throw Error('核对方式无效');
      const auth=await bounded(()=>authenticate(input.accessToken),'确认当前用户');
      const read=()=>{const record=findOwnedPageAction(journal,auth.userId,input.receiptId);return record?.kind==='publish'?record:undefined;};
      const original=read();if(!original||original.status!=='unknown')throw Error('仅能处理当前用户结果不明的原发布记录');
      lock=auth.userId+':'+original.id;if(pending.has(lock))throw Error('本条记录正在核对');pending.add(lock);locked=true;
      const owned=await bounded(()=>authenticate(input.accessToken,original.accountId),'读取原绑定账号');
      const account=owned.account;
      if(owned.userId!==auth.userId||!account||account.platform!==original.platform||original.sessionId&&original.sessionId!==account.connectorSessionId)throw Error('原绑定账号或会话已变化');
      const profile=async()=>{
        if(!inspectAccountHealth)throw Error('当前版本没有可用的本人账号核验器');
        const value=await bounded(()=>inspectAccountHealth(event,{accessToken:input.accessToken,accountId:original.accountId}),'核验本人官网身份',35000);
        if(value.error||value.state!=='normal'||value.accountId!==original.accountId||value.sessionId!==account.connectorSessionId||value.nickname!==account.nickname)throw Error(value.message||value.error||'未核验到原绑定账号，未修改记录');
        return value;
      };
      if(input.kind==='not_published'){
        if(!Number.isFinite(Date.parse(original.createdAt))||now()-Date.parse(original.createdAt)<120000)throw Error('刚提交的作品仍可能处理中，不能提前认定未发布');
        if(!['not_found','not_published'].includes(original.verification?.state))throw Error('请先在原账号官网核实作品状态，未修改记录');
        if(original.nativeAccountKey && original.nativeAccountKey!==account.nativeAccountKey)throw Error('原绑定身份编号已变化，未修改记录');
      }else if(original.verification?.state!=='identity_mismatch')throw Error('这条记录不需要历史更名核对');
      const current=input.kind==='identity_rename'?await profile():{nickname:account.nickname,nativeAccountKey:account.nativeAccountKey};
      if(input.kind==='identity_rename'&&(!current.nativeAccountKey||current.nativeAccountKey!==account.nativeAccountKey))throw Error('没有已绑定的同账号身份编号，不能只凭相似昵称放行');
      const rename=input.kind==='identity_rename';
      const confirmation=await dialog.showMessageBox(win,{type:'warning',title:rename?'确认历史账号更名':'确认本条未发布',message:rename?'请确认旧昵称和当前官网身份属于同一个账号':'请确认你已在原账号官网核实：本条作品没有发布',
        detail:`平台：${original.platform}\n作品：${original.expectedTitle||''}\n原回执昵称：${original.nickname}\n${rename?'当前官网昵称：':'当前绑定账号：'}${current.nickname}\n${rename?'当前官网身份编号：'+current.nativeAccountKey:'提交时间：'+original.createdAt}\n\n${rename?'此操作仅保存你的更名确认，保留旧昵称及原回执，再只读刷新结果。不会发布或自动重发。':'请确认你已在该绑定账号的平台官方网核实本作品未发布。列表缺失不代表失败；确认后仅记录你的判断并允许重发，不伪造官方失败回执，也不自动重发。'}`,
        buttons:['取消',rename?'确认是同一账号':'确认未发布'],defaultId:0,cancelId:0,noLink:true});
      if(confirmation.response!==1)return {cancelled:true};
      const fresh=await bounded(()=>authenticate(input.accessToken,original.accountId),'保存前确认原绑定');
      if(fresh.userId!==auth.userId||fresh.account.connectorSessionId!==account.connectorSessionId||fresh.account.nickname!==account.nickname||fresh.account.nativeAccountKey!==account.nativeAccountKey)throw Error('核对期间账号绑定发生变化，未修改记录');
      const latest=read();if(!latest||latest.status!=='unknown'||latest.attemptId!==original.attemptId)throw Error('原记录结果或尝试已变化，未覆盖新结果');
      if(rename){const observed=await profile();if(observed.nickname!==current.nickname||observed.nativeAccountKey!==current.nativeAccountKey)throw Error('官网身份已变化，未修改记录');}
      const last=read();if(!last||last.status!=='unknown'||last.attemptId!==original.attemptId)throw Error('已出现新结果，未覆盖');
      const at=new Date(now()).toISOString();
      const record=rename?{...last,identityReview:{source:'user_confirmed_rename',accountId:original.accountId,sessionId:account.connectorSessionId,nativeAccountKey:current.nativeAccountKey,originalNickname:original.nickname,currentNickname:current.nickname,at},checkpoint:'user_identity_review',resultSource:'user_confirmed_rename'}:
        {...last,status:'failed',message:'已由本人核实官网未发布，可重发；原提交证据已保留（非官方失败回执）',completedAt:last.completedAt,checkpoint:'user_result_resolution',resultSource:'user_confirmed_not_published',resolution:{source:'user_confirmed_not_published',accountId:original.accountId,sessionId:account.connectorSessionId,at},verification:{state:'not_published',message:'本人已核实原账号官网未发布；不代表平台返回了失败回执，未自动重发',checkedAt:at}};
      journal.write({...record,ownerId:auth.userId});
      if(rename)return await verifyPublishResult(event,{accessToken:input.accessToken,receiptId:original.id});
      return {receipt:record};
    }catch(error){return {error:error.message};}
    finally{if(locked)pending.delete(lock);}
  });
}
module.exports={registerPublishResolution};
