'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const {CommentQueue}=require('./one-click-comment-queue.cjs');
const {workReference}=require('./publish-reference.cjs');
const {createCommentExecutor}=require('./one-click-comment-executor.cjs');
const platforms=['douyin','xiaohongshu','bilibili'];
const publicError=e=>{const s=String(e?.message||'');return s.length<400&&/[\u4e00-\u9fff]/.test(s)&&!/(cookie|token|authorization|password|csrf|https?:|[A-Z]:\\)/i.test(s)?s:'一键评论操作失败，原记录保留；请核对后重试';};
function registerOneClickComments({ipcMain,getWindow,authenticate,journal,userData,safeStorage,session,createOperationsWindow,resolveOperationsIdentity,inspectAccountHealth,getOwnWork,verifyFollowup,verifyPage,canReviewPage}){
  let active,opening,closing=false;const locks=new Set();
  const open=async(event,token,owner)=>{
    if(closing)throw Error('软件正在退出');
    if(opening){await opening;return open(event,token,owner);}
    if(active?.owner===owner&&active.token===token)return active.queue;
    opening=(async()=>{
      if(active)await Promise.all([active.reviewer.close(),active.queue.close()]);active=undefined;
      if(!safeStorage.isEncryptionAvailable()||safeStorage.getSelectedStorageBackend?.()==='basic_text')throw Error('本机加密不可用，评论集不会以明文保存');
      const root=path.join(userData,'one-click-comments'),file=path.join(root,createHash('sha256').update(owner).digest('hex')+'.bin');
      await fs.mkdir(root,{recursive:true});if((await fs.lstat(root)).isSymbolicLink())throw Error('评论存档目录不能是链接');let state;
      try{const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4*1024*1024)throw Error('评论存档格式或大小异常');state=JSON.parse(safeStorage.decryptString(await fs.readFile(file)));}catch(e){if(e.code!=='ENOENT')throw Error('评论存档无法解密或格式异常，原文件保留');}
      const entry={owner,token,event};
      const account=async id=>{if(closing||active!==entry)throw Error('当前评论登录已结束');const auth=await authenticate(token,id);if(auth.userId!==owner||!auth.account||auth.account.id!==id)throw Error('账号不属于当前登录用户');return auth.account;};
      const source=async(id,singleRef)=>{
        if(singleRef)return require('./single-comment-source.cjs').resolveSingleSource(singleRef,{account,journal,owner,getOwnWork});
        const p=journal.find(owner,id),ref=workReference(p?.platform,p?.evidence);
        if(!p||p.kind!=='publish'||p.status!=='confirmed'||!platforms.includes(p.platform)||!ref)throw Error('作品尚无已核实的发布回执和完整作品ID，请先刷新发布状态');
        if(['processing','rejected'].includes(p.verification?.state))throw Error('作品尚未通过审核，暂不能评论');
        const a=await account(p.accountId);
        if(a.platform!==p.platform||!a.nativeAccountKey||a.nativeAccountKey!==p.nativeAccountKey||a.connectorSessionId!==p.sessionId)throw Error('发布回执与主号当前绑定不一致，请先核对账号');
        return{...ref,platform:p.platform,title:p.summary,account:a};
      };
      const save=async value=>{
        const plain=JSON.stringify(value);if(Buffer.byteLength(plain)>3*1024*1024)throw Error('评论存档已达容量上限');const bytes=safeStorage.encryptString(plain),temp=path.join(root,randomUUID()+'.tmp');
        let handle;try{handle=await fs.open(temp,'wx',0o600);await handle.writeFile(bytes);await handle.sync();await handle.close();handle=undefined;await fs.rename(temp,file);}finally{await handle?.close();await fs.unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
      };
      const execute=createCommentExecutor({session,createOperationsWindow,resolveOperationsIdentity,inspectAccountHealth,owner,getEvent:()=>({sender:entry.event.sender,accessToken:entry.token})});
      entry.queue=new CommentQueue({state,save,account,source,execute});
      entry.reviewer=require('./automatic-result-review.cjs').createResultReview({queue:entry.queue,journal,owner,canReviewPage,verifyPage:record=>verifyPage(entry.event,token,record),verifyFollowup:async(child,parent)=>{
        if(active!==entry||closing)throw Error('登录已变化');
        return verifyFollowup(entry.event,token,child,parent);
      }});
      active=entry;return entry.queue;
    })();try{return await opening;}finally{opening=undefined;}
  };
  ipcMain.handle('matrix:one-click-comments',async(event,input)=>{
    let lock,acquired=false;
    try{
      const main=getWindow();if(!main||event.sender.id!==main.webContents.id||event.senderFrame&&event.senderFrame!==main.webContents.mainFrame)throw Error('仅允许远效主窗口执行评论');
      if(!input||!['auto-review','snapshot','save-set','delete-set','preview','start','pause','cancel','single-state','single-preview','single-start','single-cancel','single-recheck'].includes(input.command))throw Error('一键评论操作无效');
      const auth=await authenticate(input.accessToken);const q=await open(event,input.accessToken,auth.userId);
      if(input.command==='snapshot')return{result:q.snapshot()};
      if(input.command==='auto-review'){
        if(active?.queue!==q||locks.has(auth.userId))return{result:{nextInMs:15000}};
        return{result:await active.reviewer.tick()};
      }
      lock=auth.userId;if(locks.has(lock))throw Error('上一步尚未完成，请稍后');locks.add(lock);acquired=true;
      const args=input.args||{};let result;
      if(input.command==='single-state')result=await q.singleState(args.source);
      if(input.command==='single-preview')result=await q.previewSingle(args);
      if(input.command==='single-start'){q.singleBatch(args.id);result=await q.start(args.id);}
      if(input.command==='single-cancel'){q.singleBatch(args.id);result=await q.cancel(args.id);}
      if(input.command==='single-recheck')result=await q.recheckSingle(args.id);
      if(input.command==='save-set')result=await q.saveSet(args);
      if(input.command==='delete-set')result=await q.removeSet(args.id);
      if(input.command==='preview')result=await q.preview(args);
      if(input.command==='start')result=await q.start(args.id);
      if(input.command==='pause')result=await q.pause(args.id);
      if(input.command==='cancel')result=await q.cancel(args.id);
      return{result};
    }catch(e){return{error:publicError(e)};}finally{if(acquired)locks.delete(lock);}
  });
  return{async close(){closing=true;if(opening)try{await opening;}catch{}if(active)await Promise.all([active.reviewer.close(),active.queue.close()]);}};
}
module.exports={registerOneClickComments};
