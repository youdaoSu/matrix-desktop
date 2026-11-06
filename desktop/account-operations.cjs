const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Worker}=require('node:worker_threads');
const {hash,bindingId}=require('./account-operations-crypto.cjs');
const {createBrowserHost}=require('./account-operations-browser-host.cjs');
const {KeywordCommentMonitor}=require('./account-operations-comment-monitor.cjs');
const {ObservationQueue}=require('./account-operations-observation-queue.cjs');
const {acquireBackgroundTimerLease}=require('./background-timer-lease.cjs');
const {createRendererHeartbeatRequester}=require('./renderer-heartbeat.cjs');
const {performance}=require('node:perf_hooks');
const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value);
const fingerprint=(userId,a)=>JSON.stringify([userId,a.id,a.platform,a.connectorSessionId,a.nativeAccountKey]);
function registerAccountOperations({ipcMain,getWindow,authenticate,safeStorage,userData,getInbox,getInteractions,createOperationsWindow,resolveOperationsIdentity,resolveOperationsDirectoryIdentity,paused=()=>false,workerFactory=(file,options)=>new Worker(file,options),monotonicNow=()=>performance.now()}) {
  let active,opening,closed=false,sequence=0,configurationIntent;const revoked=new Set(),pagePool=new Set(),retiredLeases=new Map();
  const requestHeartbeat=createRendererHeartbeatRequester({getContents:()=>getWindow()?.webContents,channel:'matrix:account-operations-heartbeat'});
  function retire(entry){
    if(entry.retired||!Number.isSafeInteger(entry.threadId)||entry.threadId<1)return;
    entry.retired=true;const previous=retiredLeases.get(entry.owner)||[];
    retiredLeases.delete(entry.owner);retiredLeases.set(entry.owner,[...previous,{pid:process.pid,threadId:entry.threadId,leaseId:entry.leaseId}].slice(-32));
    while(retiredLeases.size>32)retiredLeases.delete(retiredLeases.keys().next().value);
  }
  function rpc(entry,command,args={}) {
    if(entry.dead)return Promise.reject(Error('互动后台已停止'));
    if(entry.requests.size>=128)return Promise.reject(Error('互动后台繁忙，未执行新操作'));
    return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{entry.requests.delete(id);reject(Error('互动操作等待超时；发送结果需核对，勿重复发送'));},70000);entry.requests.set(id,{resolve,reject,timer});entry.worker.postMessage({type:'command',id,command,args});});
  }
  async function stop(entry) {
    if(!entry||entry.stopping)return entry?.stopping;
    entry.alive=false;entry.releaseBackgroundTimers?.();entry.commentMonitor?.close();entry.observations?.close();
    entry.stopping=(async()=>{await Promise.allSettled([...(entry.commentAdmissions||[])]);try{await rpc(entry,'close');}catch{}await entry.observations?.idle();await Promise.allSettled([...entry.sends]);try{await rpc(entry,'drain');}catch{}await entry.browser?.close();entry.dead=true;for(const p of entry.requests.values()){clearTimeout(p.timer);p.reject(Error('互动后台已停止'));}entry.requests.clear();await entry.worker.terminate();})();return entry.stopping;
  }
  function secureKey(directory,owner) {
    if(!safeStorage.isEncryptionAvailable()||safeStorage.getSelectedStorageBackend?.()==='basic_text')throw Error('本机安全加密不可用，不会明文保存互动记录');
    fs.mkdirSync(directory,{recursive:true,mode:0o700});if(!fs.lstatSync(directory).isDirectory()||fs.lstatSync(directory).isSymbolicLink())throw Error('互动存档目录无效');
    const file=path.join(directory,'key.bin');
    if(fs.existsSync(file)){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8192)throw Error('互动密钥文件无效，原文件保留');let value;try{value=JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));}catch{throw Error('互动密钥无法读取，原记录保留；请从桌面正常启动软件');}if(value.owner!==owner||!/^\w{64}$/.test(value.key)||!/^[a-f0-9]+$/.test(value.key))throw Error('互动密钥与当前用户不一致');return Buffer.from(value.key,'hex');}
    if(fs.readdirSync(directory).some(name=>/\.(?:bin|json)$/i.test(name)))throw Error('互动记录缺少配套密钥，原记录保留；不会新建密钥覆盖');
    const key=crypto.randomBytes(32),temporary=path.join(directory,crypto.randomUUID()+'.tmp');let fd,created=false;
    try{try{fd=fs.openSync(temporary,'wx',0o600);created=true;fs.writeFileSync(fd,safeStorage.encryptString(JSON.stringify({owner,key:key.toString('hex')})));fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.renameSync(temporary,file);}finally{if(fd!==undefined)fs.closeSync(fd);if(created&&fs.existsSync(temporary))fs.unlinkSync(temporary);}return key;}catch(error){key.fill(0);throw error;}
  }
  async function open(owner,token,workspaceId,assertIntent) {
    assertIntent();
    if(closed||revoked.has(workspaceId))throw Error('当前互动登录已结束');
    // An entry is registered before ready; even its own workspace must wait.
    if(opening){try{await opening;}catch(error){if(!['MATRIX_STALE_CONFIGURATION','MATRIX_STALE_WORKSPACE'].includes(error.code))throw error;}return open(owner,token,workspaceId,assertIntent);}
    if(active?.owner===owner&&active.workspaceId===workspaceId&&active.alive){active.token=token;return active;}
    opening=(async()=>{if(active)await stop(active);assertIntent();if(closed)throw Error('软件正在退出');const ownerHash=hash(owner),directory=path.join(userData,'account-operations',ownerHash);
      if(revoked.has(workspaceId))throw Error('当前互动登录已结束');
      const entry={owner,token,workspaceId,leaseId:crypto.randomUUID(),startedAt:Date.now(),accounts:new Map(),requests:new Map(),sends:new Set(),commentAdmissions:new Set(),directoryProofs:new Map(),alive:true,dead:false,configured:false,heartbeat:monotonicNow()};
      const ready=new Promise((resolve,reject)=>{entry.readyResolve=resolve;entry.readyReject=reject;});
      // Node workers need a physical script and relative dependencies. Ship this
      // small audited graph unpacked; never extract executable code to userData.
      const workerFile=path.join(__dirname,'account-operations-worker.cjs').replace(path.sep+'app.asar'+path.sep,path.sep+'app.asar.unpacked'+path.sep);
      const key=secureKey(directory,ownerHash);try{entry.worker=workerFactory(workerFile,{workerData:{directory,key:key.toString('base64'),owner:ownerHash,storeLease:{leaseId:entry.leaseId,retiredOwners:retiredLeases.get(owner)||[]}}});}finally{key.fill(0);}entry.threadId=entry.worker.threadId;active=entry;
      entry.observations=new ObservationQueue({
        process:row=>rpc(entry,'observe',row),
        processBatch:rows=>rpc(entry,'observe-batch',rows),
        batchable:row=>row.channel==='comment',
        isCurrent:row=>!closed&&active===entry&&entry.alive&&!entry.dead&&entry.accounts.has(row.accountId),
        onFailure:()=>{entry.queueWarning='部分新事件未能进入规则队列，原会话记录仍保留；请到私信或评论管理核对，不会自动补发。';}
      });
      entry.browser=createBrowserHost({pagePool,paused,getAccount:id=>entry.accounts.get(id),verifyOwner:a=>current(entry,a),
        verifyIntent:context=>rpc(entry,'can-dom-operation',context),
        getExpectedIdentity:async(a,verified)=>{if(typeof resolveOperationsIdentity!=='function')throw Error('官网互动身份适配尚未接通，未打开页面');return resolveOperationsIdentity({account:verified,owner:entry.owner,assertCurrent:()=>current(entry,a)});},
        createWindow:options=>{if(typeof createOperationsWindow!=='function')throw Error('官网互动页面尚未接通');return createOperationsWindow(options);},
        notify:message=>{if(!entry.dead)entry.worker.postMessage({type:'browser-event',event:message});}});
      const failure=()=>{entry.alive=false;entry.dead=true;entry.releaseBackgroundTimers?.();entry.observations?.close();entry.commentMonitor?.close();void entry.browser?.close();entry.readyReject(Error('互动后台启动失败，原有记录保留'));for(const p of entry.requests.values()){clearTimeout(p.timer);p.reject(Error('互动后台停止，原有记录保留'));}entry.requests.clear();};
      entry.worker.on('error',failure);entry.worker.on('exit',()=>{failure();retire(entry);});
      entry.worker.on('message',message=>{
        if(message.type==='ready'){entry.readyResolve();return;}
        if(message.type==='result'){const p=entry.requests.get(message.id);if(p){clearTimeout(p.timer);entry.requests.delete(message.id);message.error?p.reject(Error(message.error)):p.resolve(message.result);}return;}
        if(message.type==='browser'){
          const task=entry.browser.command(message.request).then(result=>{if(!entry.dead)entry.worker.postMessage({type:'browser-result',id:message.id,result});},error=>{if(!entry.dead)entry.worker.postMessage({type:'browser-result',id:message.id,error:{message:String(error?.message||'官网互动页面操作失败').slice(0,400),code:['MATRIX_UI_PRIORITY','MATRIX_BINDING_CHANGED','MATRIX_FRAME_CHANGED','MATRIX_PAGE_CAPACITY','MATRIX_PAGE_BUSY','PAGE_OPERATION_TIMEOUT'].includes(error?.code)?error.code:'MATRIX_NATIVE_PAGE'}});});
          entry.sends.add(task);void task.finally(()=>entry.sends.delete(task));return;
        }
        if(message.type==='directory-request'){
          const task=readDirectory(entry,message.args,false).then(result=>{if(!entry.dead)entry.worker.postMessage({type:'directory-result',id:message.id,result});},()=>{if(!entry.dead)entry.worker.postMessage({type:'directory-result',id:message.id,error:'原生粉丝目录未能重新核对，原任务保留，未继续发送'});});entry.sends.add(task);void task.finally(()=>entry.sends.delete(task));return;
        }
        if(message.type==='reply-route'||message.type==='comment-verify'){
          const task=(async()=>{const a=entry.accounts.get(message.args?.accountId),source=message.args?.message;if(!a||a.platform!=='douyin'||source?.accountId!==a.id||source.platform!=='douyin'||source.channel!=='comment'||source.isOwn||source.isGroup)throw Error('评论私信必须属于原账号的真实非自身评论');await current(entry,a);
            let result;if(message.type==='reply-route'){const inbox=getInbox();if(typeof inbox.operationsRoute!=='function')throw Error('同账号原生私信连接尚未就绪，请先在私信管理核对');result=inbox.operationsRoute(entry.owner,a.accountId,a.binding,source.senderId);}else{const service=getInteractions();if(typeof service.verifyOperationComment!=='function')throw Error('原生评论来源核验尚未接通');result=await service.verifyOperationComment({accessToken:entry.token,accountId:a.accountId,message:source});}await current(entry,a);return result;
          })().then(result=>{if(!entry.dead)entry.worker.postMessage({type:message.type+'-result',id:message.id,result});},error=>{const detail=String(error?.message||'');const safe=/[\u4e00-\u9fff]/.test(detail)&&!/(?:cookie|token|authorization|password|https?:|[A-Za-z]:[\\/])/i.test(detail)?detail.slice(0,280):'本轮原账号来源核验未通过，未把旧缓存当作新证明';if(!entry.dead)entry.worker.postMessage({type:message.type+'-result',id:message.id,error:(message.type==='reply-route'?'评论私信路由未就绪：':'原生评论重新核验未通过：')+safe});});entry.sends.add(task);void task.finally(()=>entry.sends.delete(task));return;
        }
        if(message.type==='send'){const task=dispatch(entry,message).then(receipt=>{if(!entry.dead)entry.worker.postMessage({type:'send-result',id:message.id,receipt});},()=>{if(!entry.dead)entry.worker.postMessage({type:'send-result',id:message.id,receipt:{state:'unknown',message:'发送结果需核对，不会重复发送'}});});entry.sends.add(task);void task.finally(()=>entry.sends.delete(task));}
      });
      // A worker that never became ready cannot service close/drain RPCs.
      // Revoke this unconfigured entry before cleanup, preserving the original
      // startup error instead of waiting through two unrelated RPC deadlines.
      const timer=setTimeout(()=>entry.readyReject(Error('互动后台启动超时')),10000);try{await ready;assertIntent();entry.releaseBackgroundTimers=acquireBackgroundTimerLease(getWindow()?.webContents);}catch(error){failure();await stop(entry);throw error;}finally{clearTimeout(timer);}
      entry.commentMonitor=new KeywordCommentMonitor({
        alive:()=>!closed&&active===entry&&entry.alive&&!entry.dead,paused,
        plans:()=>rpc(entry,'keyword-route-monitor-plan'),report:result=>rpc(entry,'keyword-route-monitor-result',result),
        read:async input=>{
          const a=entry.accounts.get(input.accountId);if(!a||a.platform!=='douyin')throw Error('评论监控原账号已不可用');
          const verified=await current(entry,a),service=getInteractions();
          const result=await service.run({accessToken:entry.token,accountId:verified.id,kind:'comments',...(input.cursor?{cursor:input.cursor}:{}),...(input.priorityWorkId?{priorityWorkId:input.priorityWorkId}:{})});
          await current(entry,a);if(result?.error)return{error:result.error};
          if(result?.accountId!==verified.id||result.sessionId!==verified.connectorSessionId||result.platform!=='douyin'||result.kind!=='comments')throw Error('评论监控返回了不同账号的记录');
          // Large record arrays stay in the existing cache; only progress and
          // the private continuation are retained by this scheduler.
          return{accountId:a.id,kind:'comments',capturedAt:result.capturedAt,nextCursor:result.nextCursor};
        }
      });return entry;
    })();try{return await opening;}finally{opening=undefined;}
  }
  async function current(entry,a) {
    if(closed||active!==entry||!entry.alive||monotonicNow()-entry.heartbeat>45000||entry.accounts.get(a.id)!==a)throw Error('账号或当前登录已改变，未发送');
    const fresh=await authenticate(entry.token,a.accountId);
    if(fresh.userId!==entry.owner||fingerprint(fresh.userId,fresh.account)!==a.binding||active!==entry||!entry.alive||entry.accounts.get(a.id)!==a)throw Error('账号绑定已改变，未发送');
    return fresh.account;
  }
  async function dispatch(entry,{reply,message}) {
    const a=entry.accounts.get(reply.accountId);let submitted=false;
    try{
      if(!a||reply.accountId!==message.accountId||a.platform!=='douyin')throw Error('当前平台或账号未完成发送适配，未发送');
      await current(entry,a);
      const beforeCommit=async()=>{await current(entry,a);if(paused())throw Error('正在操作前台，自动回复稍后处理');await rpc(entry,'can-commit',{id:reply.id});await current(entry,a);submitted=true;};
      const channel=reply.deliveryChannel||reply.channel;
      if(channel==='dm'){
        const view=getInbox().operationsView(entry.owner,a.accountId,a.binding);
        const thread=reply.channel==='dm'?view.threads().find(t=>t.id===message.threadId&&t.type===1&&t.peer===message.senderId):view.threads().filter(t=>t.type===1&&t.peer===message.senderId);
        const target=Array.isArray(thread)?thread.length===1?thread[0]:undefined:thread;
        if(!target)throw Error('没有可精确核验的既有单聊，未发送；请在原账号官方页面核对');
        return await view.send(target.id,reply.replyText,reply.claimId,beforeCommit);
      }
      if(channel==='comment'){
        const match=/^([1-9]\d{0,18})\/(.+)$/.exec(message.externalId);if(!match)throw Error('评论来源编号无效，未发送');
        const result=await getInteractions().run({accessToken:entry.token,accountId:a.accountId,kind:'comments',command:'reply',workId:match[1],commentId:match[2],text:reply.replyText,requestId:reply.claimId},beforeCommit);
        if(result.receipt?.state==='confirmed'&&result.receipt.commentId)return {...result.receipt,messageId:result.receipt.commentId};
        return result.receipt||{state:submitted?'unknown':'failed',message:result.error||'评论结果未确认'};
      }
      throw Error('该渠道尚未接通发送适配，未发送');
    }catch(error){return {state:submitted?'unknown':'failed',message:/cookie|token|https?:|[A-Za-z]:[\\/]/i.test(error?.message||'')?'互动处理失败；请核对原会话':String(error?.message||'互动失败').slice(0,240)};}
  }
  async function readDirectory(entry,args,freshProof){
    if(!args||typeof args!=='object'||Object.keys(args).some(k=>!['primaryAccountId','accountId','offset','limit','query','ids','ownFanHistory'].includes(k)))throw Error('粉丝目录读取参数无效');
    const primary=entry.accounts.get(args.primaryAccountId),reader=entry.accounts.get(args.accountId||args.primaryAccountId);if(!primary||!reader||primary.platform!=='douyin'||reader.platform!=='douyin')throw Error('请选择已绑定的抖音主账号和读取账号');
    const p=await current(entry,primary),r=reader===primary?p:await current(entry,reader);let proof=entry.directoryProofs.get(primary.id);
    if(freshProof||!proof||proof.binding!==primary.binding||Date.now()-proof.at>60000){if(typeof resolveOperationsDirectoryIdentity!=='function')throw Error('原生目录本人主页核验尚未接通');const own=await resolveOperationsDirectoryIdentity({account:p,owner:entry.owner,assertCurrent:()=>current(entry,primary)});await current(entry,primary);proof={binding:primary.binding,at:Date.now(),...own};entry.directoryProofs.set(primary.id,proof);}
    const readerIdentity=reader===primary?proof.identity:await resolveOperationsIdentity({account:r,owner:entry.owner,assertCurrent:()=>current(entry,reader)});
    const service=getInteractions();if(typeof service.directoryAccess!=='function')throw Error('原生粉丝缓存目录尚未接通');
    const page=await service.directoryAccess({accessToken:entry.token,accountId:p.id,offset:args.offset,limit:args.limit,query:args.query,ids:args.ids});await current(entry,primary);await current(entry,reader);
    if(page?.accountId!==p.id||page.sessionId!==p.connectorSessionId||page.platform!=='douyin')throw Error('原生粉丝目录返回了不同的账号，未采用');
    let contactHistory;
    if(args.ownFanHistory===true){if(reader!==primary)throw Error('本人粉丝批次不能借用其他发送账号');contactHistory=getInbox().operationsView(entry.owner,primary.accountId,primary.binding).contactEvidence(page.items);if(contactHistory.ownerUid!==proof.identity)throw Error('私信历史身份与粉丝所属账号不一致');}
    return{primaryAccountId:primary.id,accountId:reader.id,ownerIdentity:proof.identity,ownerProfileUrl:proof.profileUrl,readerIdentity,nativeDirectoryProof:{kind:'native-cache-v1',scopeHash:hash(primary.binding),verifiedAt:new Date().toISOString()},items:page.items,total:page.total,complete:page.complete,offset:page.offset,limit:page.limit,capturedAt:page.capturedAt,...(contactHistory?{contactHistory}:{})};
  }
  const commands=new Set(['own-fan-preview','own-fan-preview-page','own-fan-start','own-fan-pause','own-fan-resume','own-fan-cancel','snapshot','heartbeat','save-rule','delete-rule','preview-rule','mode','policy','cancel','resolve','send','batch-preview','batch-start','batch-stop','connection-open','connection-check','connection-monitor','connection-release-idle','connection-first-chat','reply-open-profile','reply-open-chat','save-teams','directory-page','directory-mark-preview','directory-mark','outreach-create','outreach-preview','outreach-preview-remaining','outreach-start','outreach-stop','outreach-cancel','outreach-resolve','outreach-primary-followups','outreach-retry-preflight','outreach-show','archive-inspect','archive-preview','archive-confirm','archive-list','archive-history','archive-export','archive-export-original','contact-note-get','contact-note-save','contact-note-remove','contact-note-list','keyword-route-save','keyword-route-arm','keyword-route-pause','keyword-route-delete']);
  ipcMain.handle('matrix:account-operations',async(event,input)=>{
    try{
      const win=getWindow();if(!win||win.isDestroyed()||event.sender!==win.webContents)throw Error('只允许远效主窗口操作互动');
      if(!input||typeof input!=='object'||!uuid(input.workspaceId)||Object.keys(input).some(k=>!['command','accessToken','workspaceId','accountIds','args'].includes(k))||!commands.has(input.command)&&!['configure','import-thread','close'].includes(input.command))throw Error('不支持的账号运营操作');
      // Reserve the latest configuration before asynchronous identity reads.
      // A late result must not replace a newer account list or login workspace.
      let intent,configurationIds,heartbeatMode;
      if(input.command==='configure'){
        if(!Array.isArray(input.accountIds)||input.accountIds.length>100||input.accountIds.some(id=>!uuid(id))||new Set(input.accountIds).size!==input.accountIds.length)throw Error('账号列表无效');
        heartbeatMode=input.args?.heartbeatMode;if(heartbeatMode!==undefined&&!['main-event','renderer-timer'].includes(heartbeatMode))throw Error('互动心跳模式无效');
        configurationIds=[...input.accountIds];intent=Symbol();configurationIntent=intent;
      }
      const requestConfiguration=configurationIntent;
      const assertSession=()=>{if(closed)throw Error('软件正在退出');if(revoked.has(input.workspaceId))throw Object.assign(Error('当前互动登录已结束'),{code:'MATRIX_STALE_WORKSPACE'});};
      const assertConfiguration=()=>{assertSession();if(intent!==configurationIntent)throw Object.assign(Error('账号列表或当前登录已更新，旧配置未采用'),{code:'MATRIX_STALE_CONFIGURATION'});};
      const auth=await authenticate(input.accessToken);if(closed)throw Error('软件正在退出');
      if(input.command==='close'){revoked.add(input.workspaceId);if(active?.owner===auth.userId&&active.workspaceId===input.workspaceId)await stop(active);return {result:true};}
      const assertRequest=input.command==='configure'?assertConfiguration:()=>{assertSession();if(requestConfiguration!==configurationIntent||active&&(active.owner!==auth.userId||active.workspaceId!==input.workspaceId))throw Object.assign(Error('当前互动账号配置已改变，请重新读取当前页面'),{code:'MATRIX_STALE_WORKSPACE'});};
      const entry=await open(auth.userId,input.accessToken,input.workspaceId,assertRequest);assertRequest();if(active!==entry||!entry.alive)throw Error('互动后台已重建，请重新读取当前页面');entry.heartbeat=monotonicNow();
      if(input.command==='configure'){
        assertConfiguration();const verified=await Promise.all(configurationIds.map(id=>authenticate(input.accessToken,id)));assertConfiguration();
        if(active!==entry||!entry.alive||revoked.has(input.workspaceId))throw Error('当前登录已改变');
        const next=new Map();for(const value of verified){const a=value.account;if(value.userId!==entry.owner)throw Error('账号不属于当前用户');if(!['douyin','xiaohongshu'].includes(a.platform)||!a.connectorSessionId||!a.nativeAccountKey)continue;const id=bindingId(entry.owner,a),binding=fingerprint(entry.owner,a);const old=entry.accounts.get(id);if(old)old.name=a.nickname||'已绑定账号';next.set(id,old||{id,accountId:a.id,name:a.nickname||'已绑定账号',platform:a.platform,binding});}
        entry.configured=false;entry.accounts=next;await rpc(entry,'configure',[...next.values()]);assertConfiguration();await rpc(entry,'runtime',{paused:paused()});assertConfiguration();
        if(heartbeatMode==='main-event'){entry.releaseBackgroundTimers?.();entry.releaseBackgroundTimers=undefined;entry.heartbeatMode=heartbeatMode;}
        else if(heartbeatMode==='renderer-timer'){if(!entry.releaseBackgroundTimers)entry.releaseBackgroundTimers=acquireBackgroundTimerLease(getWindow()?.webContents);entry.heartbeatMode=heartbeatMode;}
        entry.configured=true;return {result:true};
      }
      if(input.command==='import-thread'){
        const a=entry.accounts.get(input.args?.accountId);if(!a)throw Error('请选择已绑定账号');await current(entry,a);const view=getInbox().operationsView(entry.owner,a.accountId,a.binding),messages=view.messages(input.args.threadId);await current(entry,a);await rpc(entry,'import',messages.map(m=>normalizeDm(a.id,m,view.ownUid)));return {result:true};
      }
      if(input.command==='heartbeat'){if(!entry.configured)throw Error('互动后台已重建，正在重新配置绑定账号');await rpc(entry,'heartbeat');await rpc(entry,'runtime',{paused:paused()});return {result:true};}
      if(input.command==='directory-page'){const page=await readDirectory(entry,input.args,true);return{result:await rpc(entry,'directory-sync',page)};}
      if(input.command==='keyword-route-arm'){
        const args=input.args;if(args?.acknowledgeAutomatic!==true||args?.acknowledgeEligibleRelationship!==true)throw Error('请先核对规则和自动发送范围');
        const state=await rpc(entry,'snapshot'),rule=state.keywordRoutes?.rules.find(r=>r.id===args.id&&r.revision===args.revision),a=rule&&entry.accounts.get(rule.primaryAccountId);
        if(!a||a.platform!=='douyin'||typeof resolveOperationsIdentity!=='function')throw Error('规则主号或官网身份核验尚未就绪');
        const verified=await current(entry,a),identity=await resolveOperationsIdentity({account:verified,owner:entry.owner,assertCurrent:()=>current(entry,a)});await current(entry,a);
        await rpc(entry,'keyword-route-bind',{accountId:a.id,identity,verifiedAt:new Date().toISOString()});
      }
      if(input.command==='archive-inspect'&&(typeof input.args?.text!=='string'||input.args.text.length>16*1024*1024))throw Error('本轮业务备份最多16 MiB，不会截断导入');
      const result=await rpc(entry,input.command,input.args);if(input.command==='snapshot'&&entry.queueWarning)result.error=result.error||entry.queueWarning;return {result};
    }catch(error){const message=String(error?.message||'账号运营处理失败');return {error:/cookie|token|password|https?:|[A-Za-z]:[\\/]/i.test(message)?'账号运营处理失败，原有记录保留':message.slice(0,500)};}
  });
  function normalizeDm(accountId,m,ownUid) {return {accountId,channel:'dm',externalId:m.id,threadId:m.threadId,senderId:m.sender,senderName:m.senderName||'',text:m.text,receivedAt:m.at,isOwn:m.sender===ownUid,isGroup:m.type!==1,historical:false,...(m.knownSender===true?{knownSender:true}:{})};}
  async function observeComments(entry,a,ownUid,records,signal){
    const result={kind:'operations-intake',status:'partial',received:records.length,eligible:0,confirmed:0,unconfirmed:0,unprocessed:0,skipped:0};
    const current=()=>!closed&&!signal?.aborted&&active===entry&&entry.alive&&!entry.dead&&entry.accounts.get(a.id)===a;
    try{
      // Retain only references to the existing source page. Parse dates once;
      // do not normalize/copy an entire history into the bounded queue at once.
      const eligible=[];
      for(const row of records){const at=Date.parse(row?.displayTime);if(row?.platformUserId&&row.authorIdentityAvailable!==false&&at>entry.startedAt&&typeof row.content==='string'&&row.content.trim())eligible.push({row,at});}
      eligible.sort((left,right)=>left.at-right.at);result.eligible=eligible.length;result.skipped=records.length-eligible.length;
      let index=0;
      while(index<eligible.length&&current()){
        if(!await entry.observations.waitUntilIdle(signal)||!current())break;
        const batch=[];let bytes=0;
        while(index<eligible.length&&batch.length<16){
          const r=eligible[index].row,row={accountId:a.id,channel:'comment',externalId:r.workId+'/'+r.platformId,threadId:r.workId,senderId:r.platformUserId,senderName:r.author||'',text:r.content,receivedAt:r.displayTime,...(/^https:\/\/www\.douyin\.com\/user\/MS4w[A-Za-z0-9_-]{1,250}$/.test(r.authorProfileUrl||'')?{profileUrl:r.authorProfileUrl}:{}),isOwn:r.platformUserId===ownUid,isGroup:false,historical:false};
          const size=Buffer.byteLength(JSON.stringify(row),'utf8');if(batch.length&&bytes+size>256*1024)break;
          batch.push(row);bytes+=size;index++;
        }
        const outcomes=await Promise.all(batch.map(row=>entry.observations.enqueueAndWait(row)));
        const confirmed=outcomes.filter(Boolean).length;result.confirmed+=confirmed;result.unconfirmed+=batch.length-confirmed;
        // Do not replay an uncertain batch or keep hammering failed storage.
        if(confirmed!==batch.length)break;
      }
      result.unprocessed=eligible.length-result.confirmed-result.unconfirmed;
      if(!result.unconfirmed&&!result.unprocessed)result.status='complete';
    }catch{result.unprocessed=Math.max(0,result.eligible-result.confirmed-result.unconfirmed);}
    if(result.status!=='complete')entry.queueWarning='部分新事件尚未确认进入评论规则队列，原评论记录保留；请核对监控状态，不会自动补发。';
    return result;
  }
  function observe({userId,account,ownUid,message,records,signal}) {
    const entry=active;if(!entry?.alive||entry.owner!==userId)return;
    const a=entry.accounts.get(bindingId(userId,account));if(!a||a.binding!==fingerprint(userId,account))return;
    if(message)return Date.parse(message.at)>entry.startedAt?entry.observations.enqueue(normalizeDm(a.id,message,ownUid)):false;
    if(!Array.isArray(records)||records.length>50000||entry.commentAdmissions.size>=8){entry.queueWarning='本轮评论接收超过本地处理范围，原评论记录保留；请核对监控状态，不会自动补发。';return Promise.resolve({kind:'operations-intake',status:'partial'});}
    const task=observeComments(entry,a,ownUid,records,signal);entry.commentAdmissions.add(task);void task.finally(()=>entry.commentAdmissions.delete(task));return task;
  }
  async function reviewNativeReplies(entry){
    if(entry.receiptReviewing||monotonicNow()<(entry.nextReceiptReview||0))return;
    entry.receiptReviewing=true;entry.nextReceiptReview=monotonicNow()+60000;
    try{
      for(const a of entry.accounts.values()){
        if(a.platform!=='douyin')continue;
        try{
          const proofs=getInbox().operationsView(entry.owner,a.accountId,a.binding).reviewedProofs?.()||[];
          if(!proofs.length)continue;
          await current(entry,a);
          await rpc(entry,'observed-native-messages',{accountId:a.id,proofs});
        }catch{/* Await the next current, bound inbox snapshot. */}
      }
    }finally{entry.receiptReviewing=false;}
  }
  const timer=setInterval(()=>{const entry=active;if(entry?.alive&&monotonicNow()-entry.heartbeat>45000){void stop(entry);return;}if(entry?.alive&&entry.configured&&!entry.receiptReviewing){const review=reviewNativeReplies(entry);entry.sends.add(review);void review.finally(()=>entry.sends.delete(review));}if(entry?.alive&&entry.configured&&entry.heartbeatMode==='main-event')requestHeartbeat(entry,entry.workspaceId);if(entry?.alive&&entry.commentMonitor){const task=entry.commentMonitor.tick();entry.sends.add(task);void task.catch(()=>{entry.queueWarning='关键词评论监控未完成，原队列保留；请核对监控状态';}).finally(()=>entry.sends.delete(task));}},5000);timer.unref?.();
  return {observe,async close(){closed=true;clearInterval(timer);await stop(active);}};
}
module.exports={registerAccountOperations};
