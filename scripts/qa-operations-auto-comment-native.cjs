// Actual IPC/worker/queue and encrypted disposable store. Platform is a fixture.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
let moduleRoot=path.resolve(__dirname,'..');const packagedAt=process.argv.indexOf('--packaged');
if(packagedAt>=0){assert(process.versions.electron);moduleRoot=path.resolve(process.argv[packagedAt+1]);assert.equal(path.basename(moduleRoot),'app.asar');assert.match(process.argv[packagedAt+2]||'',/^[a-f0-9]{64}$/);assert.equal(crypto.createHash('sha256').update(require('original-fs').readFileSync(moduleRoot)).digest('hex'),process.argv[packagedAt+2]);}
const {registerAccountOperations}=require(path.join(moduleRoot,'desktop/account-operations.cjs')),{cipher}=require(path.join(moduleRoot,'desktop/account-operations-crypto.cjs'));
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yx-auto-comment-')),owner=crypto.randomUUID(),codec=cipher(crypto.randomBytes(32),'qa-os');
 const account={id:crypto.randomUUID(),platform:'douyin',nickname:'合成自动评论账号',connectorSessionId:crypto.randomUUID(),nativeAccountKey:'synthetic-account'},sender={},handlers=new Map();
 let service,heartbeat,workspaceId=crypto.randomUUID(),reads=0,sends=0,checks=0,source,cursor,fail=false;
 const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
 const options={ipcMain:{handle:(n,f)=>handlers.set(n,f)},getWindow:()=>({webContents:sender,isDestroyed:()=>false}),userData:dir,safeStorage:{isEncryptionAvailable:()=>true,encryptString:codec.protect,decryptString:codec.unprotect},authenticate:async(token,id)=>{eq(token,'qa');if(id)eq(id,account.id);return {userId:owner,...(id?{account}:{})};},getInbox:()=>{throw Error('No message adapter in this fixture');},getInteractions:()=>({run:async(input,beforeCommit)=>{
  eq(input.accountId,account.id);eq(input.kind,'comments');
  if(input.command){eq(input.command,'reply');eq(input.commentId,source.platformId);eq(input.workId,source.workId);eq(input.text,'合成自动答复');await beforeCommit();sends++;return {receipt:{state:'confirmed',commentId:'999999999999999999',message:'synthetic acknowledgement'}};}
  reads++;if(cursor)eq(input.cursor,cursor);if(fail)return {error:'合成账号需要验证'};
  source||={platformId:'888888888888888888',workId:'777777777777777777',platformUserId:'200',author:'合成咨询人',content:'求资料',displayTime:new Date().toISOString()};
  service.observe({userId:owner,account,ownUid:'100',records:[source]});cursor=crypto.randomUUID();return {accountId:account.id,sessionId:account.connectorSessionId,platform:'douyin',kind:'comments',capturedAt:new Date().toISOString(),nextCursor:cursor};
 }})};
 const call=async(command,args)=>{const v=await handlers.get('matrix:account-operations')({sender},{command,args,accountIds:[account.id],accessToken:'qa',workspaceId});if(v.error)throw Error(v.error);return v.result;};
 const until=async(predicate,ms)=>{const end=Date.now()+ms;while(Date.now()<end){const state=await call('snapshot');if(predicate(state))return state;await new Promise(r=>setTimeout(r,200));}throw Error('Synthetic automation condition timed out');};
 try{
  service=registerAccountOperations(options);await call('configure');heartbeat=setInterval(()=>void call('heartbeat'),10000);
  const a=(await call('snapshot')).accounts[0];await call('save-rule',{name:'普通评论自动回复',platform:'douyin',accountIds:[a.id],channel:'comment',match:'contains',keywords:['求'],replyText:'合成自动答复'});
  eq((await call('snapshot')).commentMonitors[0].status,'off');eq(sends,0);
  await call('mode',{accountId:a.id,channel:'comment',mode:'auto'});
  const state=await until(s=>s.counts.sent===1,23000);eq(state.replies[0].receipt.kind,'platform-ack');eq(state.commentMonitors[0].status,'ready');eq(sends,1);eq(reads,1);
  // No page visit/import/keyword rule was needed. Duplicate source cannot send twice.
  service.observe({userId:owner,account,ownUid:'100',records:[source]});fail=true;
  const paused=await until(s=>s.commentMonitors[0].status==='paused',23000);eq(paused.settings.modes.find(m=>m.channel==='comment').mode,'off');eq(sends,1);eq(reads,2);
  // A workspace lifetime ends its heartbeat before closing/reopening the host.
  // Otherwise this fixture's old timer can race the new host's configuration.
  clearInterval(heartbeat);heartbeat=undefined;
  await service.close();workspaceId=crypto.randomUUID();service=registerAccountOperations(options);await call('configure');const reopened=await call('snapshot');eq(reopened.counts.sent,1);eq(reopened.commentMonitors[0].status,'off');eq(sends,1);
  console.log(JSON.stringify({automaticCommentNativeChecks:checks,automaticReadMatchSendReceipt:true,noPageVisitRequired:true,cursorPreserved:true,duplicatesDoNotResend:true,readFailureDisarms:true,encryptedRestart:true,realPlatformActions:0}));
 }finally{clearInterval(heartbeat);await service?.close();assert.equal(path.dirname(fs.realpathSync(dir)),fs.realpathSync(os.tmpdir()));assert(path.basename(dir).startsWith('yx-auto-comment-'));fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
