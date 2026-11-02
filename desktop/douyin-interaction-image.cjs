// Read-only display resources resolved from the authenticated native cache.
// The renderer supplies record references, never a URL, key, cookie or file path.
const {createHash}=require('node:crypto'),path=require('node:path');
const {mediaUrl,loadImage}=require('./douyin-inbox-media.cjs');
const {createSecureDisplayImageCache,imageValue}=require('./douyin-display-image-cache.cjs');
const {commentIdentifier}=require('./douyin-comment-identifiers.cjs');
const {createOperationBudget}=require('./operation-budget.cjs');
function displayDescriptor(row,target,index){
  if(!row)throw Error('本机尚未缓存这条互动记录，请等待同步');
  const raw=target==='avatar'?[row.avatarUrl,...(Array.isArray(row.avatarUrls)?row.avatarUrls:[])]:row.images?.[index]?.urls;
  const urls=[...new Set((Array.isArray(raw)?raw:[]).filter(value=>typeof value==='string'&&mediaUrl(value)===value))].slice(0,4);
  if(!urls.length)throw Error(target==='avatar'?'平台未提供可读取的头像地址':'平台未提供这张评论图片的可读地址');
  return {urls,fingerprint:createHash('sha256').update(JSON.stringify([target,index??null,urls])).digest('hex')};
}
function registerInteractionImages({ipcMain,getWindow,authenticate,resolveRecord,resolveFollowerAvatar,storeFollowerAvatar,onFollowerAvatarDisplayed,userData,safeStorage,imageLoader=loadImage,displayImageCache}){
  let disk=displayImageCache;const pending=new Map(),queue=[];let active=0,closed=false;
  const imageDisk=()=>{if(!disk){if(typeof userData!=='string'||!safeStorage)throw Error('本机图片安全缓存尚未就绪');disk=createSecureDisplayImageCache({directory:path.join(userData,'douyin-interaction-images'),safeStorage});}return disk;};
  const drain=()=>{while(!closed&&active<2&&queue.length){const job=queue.shift();active++;void job.run().then(job.resolve,job.reject).finally(()=>{active--;pending.delete(job.key);drain();});}};
  const run=(key,task)=>{if(pending.has(key))return pending.get(key);if(queue.length>=64)throw Error('图片预览队列繁忙，请稍后重试');const promise=new Promise((resolve,reject)=>queue.push({key,run:task,resolve,reject}));pending.set(key,promise);drain();return promise;};
  const binding=value=>JSON.stringify([value.userId,value.account?.id,value.account?.connectorSessionId,value.account?.nativeAccountKey]);
  ipcMain.handle('matrix:douyin-interaction-image',async(event,input)=>{
    let ended=false;const budget=createOperationBudget(45000);
    try{
      if(closed)throw Error('互动图片读取已结束');const win=getWindow();if(!win||win.isDestroyed?.()||event.sender!==win.webContents)throw Error('只允许远效主窗口读取互动图片');
      if(!input||Object.keys(input).some(key=>!['accessToken','accountId','kind','recordId','workId','target','imageIndex'].includes(key))||!['comments','followers'].includes(input.kind)||typeof input.recordId!=='string'||!['avatar','comment-image'].includes(input.target)||input.kind==='comments'&&(typeof input.workId!=='string'||!/^[1-9]\d{0,18}$/.test(input.workId)||!commentIdentifier(input.recordId,true))||input.kind==='followers'&&(!/^[1-9]\d{0,18}$/.test(input.recordId)||input.workId!==undefined||input.target!=='avatar')||input.target==='avatar'&&input.imageIndex!==undefined||input.target==='comment-image'&&(!Number.isInteger(input.imageIndex)||input.imageIndex<0||input.imageIndex>8))throw Error('互动图片参数无效，未发起请求');
      const auth=await budget.run(()=>authenticate(input.accessToken,input.accountId),'核对互动图片账号',8000),account=auth.account;
      if(account?.id!==input.accountId||account.platform!=='douyin'||!account.nativeAccountKey||!/^[a-f0-9-]{16,80}$/i.test(account.connectorSessionId||''))throw Error('请先在账号管理绑定抖音本人账号');
      const scope=binding(auth),record=()=>resolveRecord(scope,input.kind,input.recordId,input.workId),original=record(),source=()=>displayDescriptor(record(),input.target,input.imageIndex);
      const target=input.kind==='followers'&&input.target==='avatar'?require('./douyin-follower-avatar.cjs').followerAvatarTarget(original):undefined;
      let initial;try{initial=source();}catch(error){if(!target||typeof resolveFollowerAvatar!=='function'||typeof storeFollowerAvatar!=='function')throw error;}
      const bindingGuard=async()=>{budget.check();if(ended||closed)throw Error('互动图片读取已结束');const current=await budget.run(()=>authenticate(input.accessToken,account.id),'复核互动图片账号',8000);if(binding(current)!==scope)throw Error('账号绑定已变化，图片结果已丢弃');};
      const targetGuard=async()=>{await bindingGuard();const current=require('./douyin-follower-avatar.cjs').followerAvatarTarget(record());if(!target||current?.uid!==target.uid||current?.secUid!==target.secUid)throw Error('粉丝记录已变化，补读头像结果未采用');};
      const imageScope=JSON.stringify([scope,input.target]),key=createHash('sha256').update(imageScope+'/'+(initial?.fingerprint||JSON.stringify(['missing-follower-avatar',target]))).digest('hex');
      const loaded=await run(key,async()=>{
        await bindingGuard();
        if(!initial){await targetGuard();const urls=await resolveFollowerAvatar({account,row:original,assertCurrent:targetGuard,diagnosticScope:scope});await targetGuard();storeFollowerAvatar(scope,input.recordId,original,urls);}
        const descriptor=initial||source();
        const guard=async()=>{await bindingGuard();if(source().fingerprint!==descriptor.fingerprint)throw Error('互动图片记录已变化，旧预览未采用');};
        await guard();let cacheWarning;
        try{const cache=imageDisk(),saved=await (cache.getAsync||cache.get).call(cache,imageScope,descriptor.fingerprint,guard);if(saved){await guard();return {attachment:saved,fingerprint:descriptor.fingerprint};}}catch{cacheWarning='本机图片缓存无法读取，原文件保留；本次仅临时预览';}
        let value=await imageLoader(descriptor,guard);await guard();value=imageValue(value);
        if(!cacheWarning)try{const cache=imageDisk();await (cache.putAsync||cache.put).call(cache,imageScope,descriptor.fingerprint,value,guard);}catch{cacheWarning='图片已读取，但本机加密缓存未保存；原有文件保留';}
        return {attachment:{...value,...(cacheWarning?{cacheWarning}:{})},fingerprint:descriptor.fingerprint};
      });await bindingGuard();if(source().fingerprint!==loaded.fingerprint)throw Error('互动图片记录已变化，旧预览未采用');if(input.kind==='followers')try{onFollowerAvatarDisplayed?.(scope);}catch{}return {accountId:account.id,sessionId:account.connectorSessionId,attachment:loaded.attachment};
    }catch(error){const message=error?.message||'';return {error:message.length<=240&&/[\u4e00-\u9fff]/.test(message)&&!/(?:cookie|token|authorization|https?:)/i.test(message)?message:'互动图片暂时无法读取，已有缓存保留',...(error?.avatarCode==='reader-busy'?{retryAfterMs:2000}:{})};}
    finally{ended=true;}
  });
  return {close(){closed=true;for(const job of queue.splice(0))job.reject(Error('互动图片读取已结束'));pending.clear();disk?.clearMemory?.();}};
}
module.exports={registerInteractionImages,displayDescriptor};
