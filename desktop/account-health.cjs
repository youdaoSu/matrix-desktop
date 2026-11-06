const { createOperationBudget } = require('./operation-budget.cjs');
function registerAccountHealth({ipcMain,getWindow,authenticate,session,platforms,inspectPlatformSession,createWindow,inspectNative,readDouyinMetrics,readDouyinIdentity,readDouyinPublishIdentity,prepareReadContext,diagnostics,platformCheckCooldown,observePlatformSession,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
  const pending=new Map();
  const inspect=async(event,input)=>{
    let window;
    try{
      const host=getWindow();if(!host||event.sender.id!==host.webContents.id)throw Error('仅允许远效主窗口核验账号');
      const admission=createOperationBudget(8000);
      const auth=await admission.run(()=>authenticate(input?.accessToken,input?.accountId),'读取当前绑定',8000),account=auth.account;
      if(!account||!platforms[account.platform]||!/^[a-z0-9-]{16,80}$/i.test(account.connectorSessionId||''))throw Error('账号没有可核验的本机绑定');
      const limited=platformCheckCooldown?.get(account.platform);
      if(limited)return {accountId:account.id,sessionId:account.connectorSessionId,platform:account.platform,state:'unknown',rateLimited:true,retryAt:limited.retryAt,checkedAt:Date.now(),message:limited.error};
      const identityOnly=input?.purpose==='publish-identity';
      const key=auth.userId+':'+account.id+':'+account.connectorSessionId+(identityOnly?':identity':'');if(pending.has(key))return await pending.get(key);
      const work=(async()=>{
        const budget=createOperationBudget(24000),controller=new AbortController();let state,readContext;
        const assertBinding=async()=>{budget.check();if(controller.signal.aborted)throw Error('账号核验已结束');const pause=platformCheckCooldown?.get(account.platform);if(pause)throw Error(pause.error);const latest=await authenticate(input.accessToken,account.id);if(latest.userId!==auth.userId||latest.account.connectorSessionId!==account.connectorSessionId||latest.account.nativeAccountKey!==account.nativeAccountKey)throw Error('账号绑定已变化，旧本人资料未采用');};
        try{
          // Select the same-session self reader before reading creator-home.
          // A refusal here is terminal, never followed by another identity source.
          if(identityOnly&&account.platform==='douyin'&&account.nativeAccountKey&&typeof readDouyinPublishIdentity==='function'){
            const proof=await budget.run(()=>readDouyinPublishIdentity({accountSession:session.fromPartition(`persist:matrix-douyin-${account.connectorSessionId}`),publicHandle:account.nativeAccountKey,assertCurrent:assertBinding}),'核验同会话官网本人身份',22000);
            await assertBinding();
            if(proof?.source!=='douyin-self-profile'||proof.key!==account.nativeAccountKey||typeof proof.ownUid!=='string'||!/^[1-9]\d{0,18}$/.test(proof.ownUid)||BigInt(proof.ownUid)>9223372036854775807n)throw Error('官网本人身份凭据不完整，未放行提交');
            return {accountId:account.id,sessionId:account.connectorSessionId,platform:account.platform,state:'normal',nativeAccountKey:proof.key,identityEvidence:{source:proof.source,ownUid:proof.ownUid},checkedAt:Date.now(),message:'同一绑定会话的官网本人身份已核验'};
          }
          if(account.platform==='wechat' && inspectNative){
            state=await budget.run(()=>inspectNative(event,{accessToken:input.accessToken,accountId:account.id,sessionId:account.connectorSessionId},controller.signal), '读取视频号本人主页',22000);
          }else{
            let isolated=session.fromPartition(`persist:matrix-${account.platform}-${account.connectorSessionId}`);
            observePlatformSession?.(account.platform,isolated);
            if(account.platform==='douyin'&&prepareReadContext){readContext=await budget.run(()=>prepareReadContext({sourceSession:isolated,assertCurrent:assertBinding,signal:controller.signal}),'准备本人资料只读会话',6000);isolated=readContext.session;}
            window=createWindow(isolated,account.platform);const guest=window.webContents,config=platforms[account.platform];
            readContext?.attach?.(guest);
            guest.setWindowOpenHandler?.(()=>({action:'deny'}));
            guest.on?.('will-navigate',(navigation,url)=>{try{const target=new URL(url);if(target.protocol!=='https:'||!(target.hostname===config.domain||target.hostname.endsWith('.'+config.domain)))navigation.preventDefault();}catch{navigation.preventDefault();}});
            await budget.run(()=>guest.loadURL(account.platform==='douyin'?'https://creator.douyin.com/creator-micro/home':config.home),'加载官方本人主页',12000);
            let loginReads=0;
            for(let i=0;i<8;i++){
              state=await budget.run(()=>inspectPlatformSession(account.platform,isolated,guest),'读取官方账号状态',10000);
              const profile=state?.profile;
              if(profile?.rateLimited)break;
              if(account.platform==='douyin'&&account.nativeAccountKey&&!profile?.ownIdentity?.key&&state?.authenticated&&profile?.nickname&&!profile.loginVisible&&!profile.verificationRequired&&!profile.accountIssue&&readContext&&typeof readDouyinIdentity==='function'){
                const identity=await budget.run(()=>readDouyinIdentity(guest,account.nativeAccountKey,readContext.check),'核对官网本人资料身份',3000);
                if(identity?.source==='douyin-creator-profile'&&identity.key===account.nativeAccountKey)state={...state,profile:{...profile,ownIdentity:identity}};
              }
              // A nickname often renders before the portrait. Give Douyin's
              // own card the existing bounded settling loop, not another page
              // navigation. Missing imagery never makes a valid account offline.
              const identityReady=!account.nativeAccountKey||!!state.profile?.ownIdentity?.key;
              if(state.profile?.verificationRequired||state.profile?.accountIssue||state.authenticated&&state.profile?.nickname&&identityReady&&(identityOnly||account.platform!=='douyin'||state.profile.avatarUrl))break;
              loginReads=state.profile?.loginVisible?loginReads+1:0;
              if(loginReads>=2)break;
              await budget.run(()=>sleep(loginReads||!identityReady?1000:250),'等待本人主页稳定');
            }
          }
          if(readContext)await budget.run(()=>readContext.check(),'确认本人只读会话仍有效',6000);
          const fresh=await budget.run(()=>authenticate(input.accessToken,account.id),'确认账号绑定未变化',10000);
          if(fresh.userId!==auth.userId||fresh.account.connectorSessionId!==account.connectorSessionId||fresh.account.nativeAccountKey!==account.nativeAccountKey)throw Error('账号绑定已变化，忽略旧结果');
          const profile=state?.profile||{},issue=profile.accountIssue,nickname=profile.nickname?.trim(),nativeAccountKey=profile.ownIdentity?.key,verificationRequired=!!profile.verificationRequired;
          if(profile.rateLimited){const pause=platformCheckCooldown?.get(account.platform)||platformCheckCooldown?.limit(account.platform);return {accountId:account.id,sessionId:account.connectorSessionId,platform:account.platform,state:'unknown',rateLimited:true,retryAt:pause?.retryAt||Date.now()+60*60000,checkedAt:Date.now(),message:pause?.error||'官方提示访问频繁，自动核验已暂停，请稍后再试'};}
          const sameKey=Boolean(account.nativeAccountKey&&nativeAccountKey&&account.nativeAccountKey===nativeAccountKey),differentKey=Boolean(account.nativeAccountKey&&nativeAccountKey&&!sameKey);
          const explicitOffline=Boolean(profile.loginVisible||profile.pageUrl&&require('./platform-session.cjs').isLoginPage(profile.pageUrl));
          const identityPending=Boolean(account.nativeAccountKey&&!nativeAccountKey);
          const status=verificationRequired?'unknown':issue?.kind==='banned'?'banned':issue?'abnormal':differentKey?'abnormal':!state?.authenticated?(explicitOffline?'offline':'unknown'):!nickname||identityPending?'unknown':nickname!==account.nickname?.trim()&&!sameKey?'unknown':'normal';
          let metrics=profile.metrics,metricEvidence=status==='normal'&&nativeAccountKey&&Number.isSafeInteger(metrics?.followersCount)?{source:'rendered-own-counter'}:undefined,metricsError;
          if(!identityOnly&&account.platform==='douyin'&&status==='normal'&&nativeAccountKey&&typeof readDouyinMetrics==='function') {
            try {
              const assertCurrent=readContext?readContext.check:assertBinding;
              const exact=await budget.run(()=>readDouyinMetrics({accountSession:session.fromPartition(`persist:matrix-douyin-${account.connectorSessionId}`),webContents:window?.webContents,publicHandle:nativeAccountKey,assertCurrent}),'读取抖音本人精确粉丝数',14000);
              await assertCurrent();
              if(!/^[1-9]\d{0,18}$/.test(exact?.ownUid||'')||BigInt(exact.ownUid)>9223372036854775807n||!Number.isSafeInteger(exact.metrics?.followersCount)||exact.metrics.followersCount<0||exact.metrics.followersCount>2147483647||!['douyin-self-profile','douyin-creator-profile'].includes(exact.source))throw Error('抖音精确粉丝计数结构无效，原计数保留');
              metrics={...metrics,followersCount:exact.metrics.followersCount};metricEvidence={source:exact.source,ownerUid:exact.ownUid};
              try{diagnostics?.record(key,{kind:'profile',stage:'profile-counter',code:'read-ok'});}catch{}
            }catch(e){try{diagnostics?.record(key,{kind:'profile',stage:'profile-counter',code:require('./douyin-sync-diagnostics.cjs').classifySyncFailure(e)});}catch{}const value=e?.message||'';metricsError=value.length<=240&&/[\u4e00-\u9fff]/.test(value)&&!/(?:cookie|token|authorization|https?:)/i.test(value)?value:'抖音精确粉丝数暂未读到，原计数保留';}
            const final=await budget.run(()=>authenticate(input.accessToken,account.id),'确认精确计数仍属于当前绑定',8000);
            if(final.userId!==auth.userId||final.account.connectorSessionId!==account.connectorSessionId||final.account.nativeAccountKey!==account.nativeAccountKey)throw Error('账号绑定已变化，忽略旧粉丝计数');
          }
          const pause=platformCheckCooldown?.get(account.platform);
          if(pause)return {accountId:account.id,sessionId:account.connectorSessionId,platform:account.platform,state:'unknown',rateLimited:true,retryAt:pause.retryAt,checkedAt:Date.now(),message:pause.error};
          return {accountId:account.id,sessionId:account.connectorSessionId,platform:account.platform,state:status,verificationRequired,nickname,avatarUrl:profile.avatarUrl,nativeAccountKey,metrics,metricEvidence,metricsError,renamed:status==='normal'&&nickname!==account.nickname?.trim(),checkedAt:Date.now(),message:verificationRequired?'官网要求本人验证，请在账号管理正常完成验证；未判定离线或封禁':issue?.message|| (differentKey?'官方账号身份编号与绑定不一致，请重新核验':identityPending?'官网本人账号ID尚未读到，未只凭昵称放行':status==='normal'?'本人官方登录已核验':status==='offline'?'官方登录未就绪，请在账号管理重新登录':nickname?'昵称已变化且没有可比对的身份编号，请重新核验绑定':'本人身份暂未读到，不据此判断封禁')};
        }catch(error){const pause=platformCheckCooldown?.get(account.platform);return {accountId:account.id,sessionId:account.connectorSessionId,state:'unknown',...(pause?{rateLimited:true,retryAt:pause.retryAt}:{}),checkedAt:Date.now(),message:pause?.error||(/超时/.test(error.message)?'账号核验超时，已结束等待；保留原数据':error.message)};}
        finally{controller.abort();if(window&&!window.isDestroyed())window.destroy();readContext?.close();}
      })();pending.set(key,work);try{return await work;}finally{pending.delete(key);}
    }catch(error){return {error:error.message};}
  };
  ipcMain.handle('matrix:inspect-account-health',inspect);
  return {inspect};
}
module.exports={registerAccountHealth};
