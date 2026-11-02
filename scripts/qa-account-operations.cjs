// Real worker + encrypted disposable disk, fake authenticated platform only.
// This suite never opens an account page or sends any real platform message.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {registerAccountOperations}=require('../desktop/account-operations.cjs');
const {cipher,bindingId}=require('../desktop/account-operations-crypto.cjs');
async function main(){
 let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-ops-')),owner=crypto.randomUUID(),workspaceId=crypto.randomUUID();
 const accounts=[{id:crypto.randomUUID(),platform:'douyin',nickname:'合成账号A',connectorSessionId:crypto.randomUUID(),nativeAccountKey:'account-a'},{id:crypto.randomUUID(),platform:'douyin',nickname:'合成账号B',connectorSessionId:crypto.randomUUID(),nativeAccountKey:'account-b'}];
 let platformCalls=0,mode='confirmed',pause=false,live=true;
 const ownUid='7000000000000000001',peer='7000000000000000002',threadId='0:1:'+ownUid+':'+peer;
 const protectedKey=crypto.randomBytes(32),crypt=cipher(protectedKey,'qa-os-wrap');
 const safeStorage={isEncryptionAvailable:()=>true,encryptString:crypt.protect,decryptString:crypt.unprotect};
 const handlers=new Map(),sender={},win={webContents:sender,isDestroyed:()=>false};
 const authenticate=async(token,id)=>{assert.equal(token,'qa-token');if(!live)throw Error('测试登录已失效');if(!id)return {userId:owner};const account=accounts.find(a=>a.id===id);if(!account)throw Error('账号不可访问');return {userId:owner,account};};
 let history=[{id:'8000000000000000001',threadId,sender:peer,senderName:'合成来信人',text:'历史资料咨询',at:new Date(Date.now()-60000).toISOString(),type:1}];
 const options={ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},getWindow:()=>win,authenticate,safeStorage,userData:root,paused:()=>pause,
  getInbox:()=>({operationsView(userId,accountId,binding){eq(userId,owner);assert.ok(accounts.some(a=>a.id===accountId));assert.ok(binding.includes(accountId));return {ownUid,threads:()=>[{id:threadId,type:1,peer}],messages:()=>history,async send(id,text,requestId,beforeCommit){eq(id,threadId);await beforeCommit();platformCalls++;return {state:mode,requestId,messageId:mode==='confirmed'?'9000000000000000001':undefined,message:'合成平台回执'};}};}}),
  getInteractions:()=>({async run(input,beforeCommit){eq(input.accountId,accounts[0].id);await beforeCommit();platformCalls++;return {receipt:{state:'confirmed',commentId:'9000000000000000002',message:'合成评论回执'}};}})};
 let host=registerAccountOperations(options);const api=async(command,args,extra={})=>{const result=await handlers.get('matrix:account-operations')({sender},{command,args,accessToken:'qa-token',workspaceId,...extra});if(result.error)throw Error(result.error);return result.result;};
 try{
  const key=crypto.randomBytes(32),one=cipher(key,'one'),two=cipher(key,'two'),encrypted=one.protect('private QA body');eq(one.unprotect(encrypted),'private QA body');assert.ok(!encrypted.includes(Buffer.from('private QA body')));assert.throws(()=>two.unprotect(encrypted));const corrupt=Buffer.from(encrypted);corrupt[corrupt.length-1]^=1;assert.throws(()=>one.unprotect(corrupt));checks+=3;
  const {InteractionStore}=require('../desktop/vendor/hengyuan-interactions/src/interaction-store.cjs');
  const firstStore=new InteractionStore(path.join(root,'first-welcome'),{...one,getAccount:id=>({id,platform:'douyin',name:'合成首次私信账号'})});const firstAccount=crypto.randomUUID();firstStore.saveRule({name:'首次欢迎',platform:'douyin',channel:'dm',trigger:'first-message',match:'any',keywords:[],replyText:'首次欢迎',accountIds:[firstAccount]});
  firstStore.baselineDmSender(firstAccount,'known');firstStore.ingest({accountId:firstAccount,channel:'dm',externalId:'known-first',threadId:'known-thread',senderId:'known',text:'新来信',receivedAt:new Date().toISOString()});eq(firstStore.snapshot().replies.length,0);
  firstStore.ingest({accountId:firstAccount,channel:'dm',externalId:'new-first',threadId:'new-thread',senderId:'new',text:'首次来信',receivedAt:new Date().toISOString()});const welcome=firstStore.snapshot().replies[0];eq(welcome.status,'pending');firstStore.baselineDmSender(firstAccount,'new');eq(firstStore.getReply(welcome.id).status,'pending');
  await api('configure',undefined,{accountIds:accounts.map(a=>a.id)});let state=await api('snapshot');eq(state.accounts.length,2);eq(state.settings.modes,[]);eq(platformCalls,0);
  const a=state.accounts.find(a=>a.accountId===accounts[0].id),b=state.accounts.find(a=>a.accountId===accounts[1].id);eq(a.id,bindingId(owner,accounts[0]));assert.notEqual(a.id,b.id);checks++;
  const page=(await api('snapshot',{outreach:{offset:300,limit:50,status:'review',accountId:a.id}})).outreach;
  eq({offset:page.offset,limit:page.limit,status:page.status,accountId:page.accountId,total:page.matchingTasks},{offset:0,limit:50,status:'review',accountId:a.id,total:0});
  const defaultPage=(await api('snapshot')).outreach;eq(defaultPage.limit,300);eq(defaultPage.accountId,'');
  await assert.rejects(()=>api('snapshot',{outreach:{accountId:crypto.randomUUID()}}),/筛选/);checks++;
  await assert.rejects(()=>api('snapshot',{unexpected:true}),/快照条件/);checks++;
  await api('save-rule',{name:'合成关键词',platform:'douyin',accountIds:[a.id],channel:'dm',match:'contains',keywords:['资料'],replyText:'合成回复 {nickname}',cooldownMinutes:0});
  await api('import-thread',{accountId:a.id,threadId});state=await api('snapshot');eq(state.replies.length,0);eq(state.messages.length,1);eq(platformCalls,0);
  const push=(id,text='资料咨询',account=accounts[0])=>host.observe({userId:owner,account,ownUid,message:{id,threadId,sender:peer,senderName:'合成来信人',text,at:new Date(Date.now()+50).toISOString(),type:1}});
  const settle=async()=>{await new Promise(r=>setTimeout(r,80));return api('snapshot');};
  push('8000000000000000002');state=await settle();eq(state.replies.length,1);eq(state.replies[0].status,'pending');eq(state.replies[0].replyText,'合成回复 合成来信人');eq(platformCalls,0);
  push('8000000000000000002');state=await settle();eq(state.replies.length,1);
  const sent=await api('send',{id:state.replies[0].id});eq(sent.status,'sent');eq(platformCalls,1);await assert.rejects(()=>api('send',{id:sent.id}),/不能重复|队列/);eq(platformCalls,1);
  push('8000000000000000003');state=await settle();mode='unknown';await assert.rejects(()=>api('send',{id:state.replies[0].id}),/间隔/);eq(platformCalls,1);eq((await api('snapshot')).replies[0].status,'pending');await new Promise(r=>setTimeout(r,4550));const unknown=await api('send',{id:state.replies[0].id});eq(unknown.status,'unknown');eq(platformCalls,2);await assert.rejects(()=>api('send',{id:unknown.id}));eq(platformCalls,2);
  await api('resolve',{id:unknown.id,sent:false});eq((await api('snapshot')).replies[0].status,'failed');eq(platformCalls,2);
  push('8000000000000000004');state=await settle();await api('policy',{paused:true});state=await api('snapshot');eq(state.replies[0].status,'cancelled');await assert.rejects(()=>api('send',{id:state.replies[0].id}));eq(platformCalls,2);await api('policy',{paused:false});
  // A mode change or old historical event is never interpreted as new input.
  await api('mode',{accountId:a.id,channel:'dm',mode:'auto'});history=[{...history[0],id:'8000000000000000005',at:new Date(Date.now()+1000).toISOString()}];await api('import-thread',{accountId:a.id,threadId});state=await api('snapshot');eq(state.replies.length,3);eq(platformCalls,2);
  await assert.rejects(()=>api('mode',{accountId:a.id,channel:'follow',mode:'auto'}),/请先登录并检查连接/);eq(platformCalls,2);
  await api('mode',{accountId:a.id,channel:'dm',mode:'review'});
  // Manual historical reply requires a five-minute, owner-local preview token.
  const message=state.messages.find(m=>m.externalId==='8000000000000000005');const review=await api('batch-preview',{messageIds:[message.id],replyText:'人工合成答复'});eq(review.tasks[0].accountId,a.id);eq(platformCalls,2);mode='confirmed';await new Promise(r=>setTimeout(r,4550));await api('batch-start',{token:review.token});
  await new Promise(r=>setTimeout(r,300));state=await api('snapshot');eq(state.counts.sent,2);eq(platformCalls,3);await assert.rejects(()=>api('batch-start',{token:review.token}));await api('batch-stop');
  const replyPage=await api('snapshot',{replies:{status:'sent',accountId:a.id,limit:1,offset:50000}});eq(replyPage.replies.length,1);eq(replyPage.replyPage.matchingReplies,2);eq(replyPage.replyPage.offset,1);eq(replyPage.replySources[0].id,replyPage.replies[0].messageId);eq(platformCalls,3);
  await assert.rejects(()=>api('snapshot',{replies:{accountId:crypto.randomUUID()}}));await assert.rejects(()=>api('snapshot',{replies:{limit:301}}));checks+=2;
  eq((await api('snapshot')).replyPage,undefined);
  const inboxPage=await api('snapshot',{inbox:{accountId:a.id,limit:1,offset:50000}});eq(inboxPage.inboxMessages.length,1);eq(inboxPage.inboxPage.offset,0);eq(inboxPage.inboxPage.matchingConversations,1);eq(inboxPage.inboxMessages[0].channel,'dm');eq(inboxPage.inboxMessages[0].accountId,a.id);eq(platformCalls,3);
  await assert.rejects(()=>api('snapshot',{inbox:{channel:'comment'}}));await assert.rejects(()=>api('snapshot',{inbox:{accountId:crypto.randomUUID()}}));checks+=2;eq((await api('snapshot')).inboxPage,undefined);
  // Wrong source owner/binding is dropped before any reply task or send.
  const before=state.totalMessages;host.observe({userId:crypto.randomUUID(),account:accounts[0],ownUid,message:{id:'wrong'}});host.observe({userId:owner,account:{...accounts[0],connectorSessionId:crypto.randomUUID()},ownUid,message:{id:'wrong'}});state=await settle();eq(state.totalMessages,before);
  await api('configure',undefined,{accountIds:[]});state=await api('snapshot');eq(state.accounts.length,0);eq(platformCalls,3);
  await host.close();host=registerAccountOperations(options);await api('configure',undefined,{accountIds:accounts.map(a=>a.id)});state=await api('snapshot');eq(state.counts.sent,2);eq(state.counts.unknown,0);eq(platformCalls,3);
  await api('mode',{accountId:a.id,channel:'dm',mode:'auto'});push('8000000000000000006');await new Promise(r=>setTimeout(r,1400));state=await api('snapshot');eq(state.counts.sent,3);eq(platformCalls,4);await api('mode',{accountId:a.id,channel:'dm',mode:'review'});
  const dir=path.join(root,'account-operations',crypto.createHash('sha256').update(owner).digest('hex'));const bytes=fs.readFileSync(path.join(dir,'interactions.bin'));assert.ok(!bytes.includes(Buffer.from('人工合成答复')));assert.ok(!fs.existsSync(path.join(dir,'interactions.json')));checks+=2;
  await api('close');await assert.rejects(()=>api('configure',undefined,{accountIds:accounts.map(a=>a.id)}),/已结束/);eq(platformCalls,4);
  const rejected=await handlers.get('matrix:account-operations')({sender:{}},{command:'snapshot',accessToken:'qa-token',workspaceId:crypto.randomUUID()});assert.match(rejected.error,/主窗口/);checks++;
  const upstream=require('node:child_process').spawnSync(process.execPath,['--test','--test-reporter=tap',...['interaction-store.test.cjs','reply-batch.test.cjs','comment-dm-store.test.cjs'].map(name=>path.join(__dirname,'../desktop/vendor/hengyuan-interactions/test',name))],{encoding:'utf8',windowsHide:true,timeout:90000});if(upstream.status!==0)throw Error(upstream.stdout+'\n'+upstream.stderr);
  assert.match(upstream.stdout,/# fail 0/);const upstreamTests=Number(/# tests (\d+)/.exec(upstream.stdout)?.[1]);
  console.log(JSON.stringify({ok:true,checks,upstreamTests,realPlatformActions:false,worker:true,encryptedRestart:true}));
 }finally{await host.close();assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('matrix-ops-'));fs.rmSync(root,{recursive:true,force:true});}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
