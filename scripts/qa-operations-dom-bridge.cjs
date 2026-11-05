// Real Node worker + imported manager + private host/proxy, synthetic pages.
// It checks the wiring, NOT current official-site selectors or live delivery.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{EventEmitter}=require('node:events');
const {registerAccountOperations}=require('../desktop/account-operations.cjs'),{cipher}=require('../desktop/account-operations-crypto.cjs');
const lateOutreach=process.argv.includes('--outreach-late');const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yuanxiao-dom-bridge-')),userId=crypto.randomUUID(),workspaceId=crypto.randomUUID(),account={id:crypto.randomUUID(),nickname:'离线小红书',platform:'xiaohongshu',connectorSessionId:crypto.randomUUID(),nativeAccountKey:'111111111111111111111111'},member={id:crypto.randomUUID(),nickname:'离线小红书客服',platform:'xiaohongshu',connectorSessionId:crypto.randomUUID(),nativeAccountKey:'333333333333333333333333'},handlers=new Map(),sender={},key=crypto.randomBytes(32),codec=cipher(key,'fake-os-wrap'),wins=[],ops=[];
 let peer='222222222222222222222222',nativeCalls=0,rows=[],commitCount=0,receipt='platform:fixture-message-id',service;
 class Page extends EventEmitter{
  constructor(actor){super();this.actor=actor;this.url='';this.dead=false;this.visible=false;const wc=new EventEmitter();this.webContents=wc;wc.id=wins.length+1;wc.getURL=()=>this.url;wc.isDestroyed=()=>this.dead;wc.isLoadingMainFrame=()=>false;wc.setAudioMuted=()=>{};wc.setWindowOpenHandler=()=>{};
   wc.executeJavaScript=async code=>{
    if(code.includes('safeToClose')&&!code.includes('function operate'))return{ok:true,safeToClose:true};
    const matches=[...code.matchAll(/\)\("xiaohongshu","dm","([A-Za-z]+)",/g)],op=matches.at(-1)?.[1];assert.ok(op,'fixture must identify the trusted generated operation');ops.push(op);
    if(op==='scan')return{ok:true,ready:true,identity:actor.nativeAccountKey,invalidRows:0,threadId:'fixture-thread',peerId:peer,peerVerified:true,threads:['fixture-thread'],threadDetails:[{id:'fixture-thread',peerId:peer,peerVerified:true,isGroup:false,name:'离线来信者'}],messages:rows,canSwitch:true};
    if(op==='probeComposer')return{ok:true,ready:true,identity:actor.nativeAccountKey};
    if(op==='send')return{ok:true,identity:actor.nativeAccountKey,before:['old-message-id']};
    if(op==='commit'){commitCount++;return{ok:true,identity:actor.nativeAccountKey,submitted:true};}
    if(op==='receipt')return{ok:true,identity:actor.nativeAccountKey,...(receipt?{receipt}:{})};
    return{ok:true,identity:actor.nativeAccountKey};
   };
  }
  async loadURL(url){this.url=url;const wc=this.webContents;wc.mainFrame={url,processId:1,routingId:1,executeJavaScript:code=>wc.executeJavaScript(code)};wc.emit('did-start-navigation',{},url,false,true);wc.emit('dom-ready');wc.emit('did-finish-load');}
  isDestroyed(){return this.dead;}isVisible(){return this.visible;}show(){this.visible=true;}hide(){this.visible=false;}focus(){}destroy(){this.dead=true;this.emit('closed');}
 }
 const options={ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},getWindow:()=>({webContents:sender,isDestroyed:()=>false}),authenticate:async(token,id)=>{assert.equal(token,'fixture-token');const a=[account,member].find(a=>a.id===id);if(id)assert.ok(a);return{userId,...(id?{account:a}:{})};},safeStorage:{isEncryptionAvailable:()=>true,encryptString:codec.protect,decryptString:codec.unprotect},userData:directory,
  getInbox:()=>{nativeCalls++;throw Error('No real/native sends allowed');},getInteractions:()=>{nativeCalls++;throw Error('No platform writes allowed');},createOperationsWindow:({account:a})=>{assert.ok([account.id,member.id].includes(a.id));const win=new Page(a);wins.push(win);return win;},resolveOperationsIdentity:async({account:a,assertCurrent})=>{await assertCurrent();return a.nativeAccountKey;}};
 const api=async(command,args,accountIds)=>{const result=await handlers.get('matrix:account-operations')({sender},{command,args,accountIds,workspaceId,accessToken:'fixture-token'});if(result.error)throw Error(result.error);return result.result;};
 try{
  service=registerAccountOperations(options);await api('configure',undefined,[account.id]);let state=await api('snapshot'),a=state.accounts[0];eq(state.connections.connections.every(c=>!c.monitorEnabled),true);eq(wins.length,0);
  await assert.rejects(()=>api('outreach-preview-remaining',{batchId:crypto.randomUUID()}),/原批次已变化/);checks++;eq(commitCount,0);
  await assert.rejects(()=>api('connection-monitor',{accountId:a.id,channel:'dm',enabled:true}),/请先确认知悉/);checks++;eq(wins.length,0);
  await api('save-rule',{name:'离线规则',platform:'xiaohongshu',accountIds:[a.id],channel:'dm',match:'contains',keywords:['资料'],replyText:'固定合成回复',cooldownMinutes:0});
  await api('connection-open',{accountId:a.id,channel:'dm'});await wait(50);const connected=await api('connection-check',{accountId:a.id,channel:'dm'});eq(connected.ready,true);eq(wins.length,1);eq(commitCount,0);
  await api('mode',{accountId:a.id,channel:'dm',mode:'review'});await api('connection-monitor',{accountId:a.id,channel:'dm',enabled:true,acknowledgeOfficialRead:true});
  rows=[{externalId:'fixture-thread:platform-event',threadId:'fixture-thread',senderId:peer,senderName:'离线来信者',text:'资料咨询',receivedAt:new Date(Date.now()+50).toISOString(),isOwn:false,isGroup:false}];
  const until=Date.now()+11000;do{await wait(200);state=await api('snapshot');}while(!state.replies.length&&Date.now()<until);eq(state.replies.length,1);eq(state.replies[0].status,'pending');eq(commitCount,0);
  const sent=await api('send',{id:state.replies[0].id});eq(sent.status,'sent');eq(commitCount,1);eq(ops.includes('prepare'),true);eq(ops.includes('send'),true);eq(ops.includes('receipt'),true);eq(nativeCalls,0);
  await assert.rejects(()=>api('send',{id:sent.id}),/不能重复/);checks++;eq(commitCount,1);
  rows=[{...rows[0],externalId:'fixture-thread:unconfirmed-event',receivedAt:new Date(Date.now()+50).toISOString()}];const nextUntil=Date.now()+11000;do{await wait(200);state=await api('snapshot');}while(state.replies.length<2&&Date.now()<nextUntil);eq(state.replies.length,2);await wait(4600);receipt=null;
  const unknown=await api('send',{id:state.replies[0].id});eq(unknown.status,'unknown');eq(commitCount,2);await assert.rejects(()=>api('send',{id:unknown.id}),/不能重复/);checks++;eq(commitCount,2);
  state=await api('snapshot');if(!state.connections?.resources?.automaticReviews?.length)throw Error(JSON.stringify({missingProbe:true,unknown,resources:state.connections.resources}));await api('connection-release-idle',{});eq(wins[0].dead,false);
  if(lateOutreach){await api('resolve',{id:unknown.id,sent:false});}else{  receipt='platform:late-original-message';const reviewDeadline=Date.now()+75000;let resolved;do{await wait(500);await api('heartbeat');state=await api('snapshot');resolved=state.replies.find(r=>r.id===unknown.id);}while(resolved?.status==='unknown'&&Date.now()<reviewDeadline);if(resolved.status!=='sent')throw Error(JSON.stringify({resolved,review:state.connections?.resources?.automaticReviews,ops:ops.slice(-12)}));eq(resolved.status,'sent');eq(resolved.reasonCode,'platform_confirmed_sent');eq(commitCount,2);eq(nativeCalls,0);await api('connection-monitor',{accountId:a.id,channel:'dm',enabled:false});}
  peer='444444444444444444444444';rows=[{...rows[0],externalId:'fixture-thread:outreach-event',senderId:peer,text:'合法既有会话，合成测试',receivedAt:new Date(Date.now()+50).toISOString()}];await api('connection-monitor',{accountId:a.id,channel:'dm',enabled:true,acknowledgeOfficialRead:true});let sourceMessage;const sourceUntil=Date.now()+11000;do{await wait(200);state=await api('snapshot');sourceMessage=state.messages.find(m=>m.externalId==='fixture-thread:outreach-event'&&m.accountId===a.id);}while(!sourceMessage&&Date.now()<sourceUntil);assert.ok(sourceMessage);checks++;await api('connection-monitor',{accountId:a.id,channel:'dm',enabled:false});
  await api('configure',undefined,[account.id,member.id]);state=await api('snapshot');const b=state.accounts.find(v=>v.accountId===member.id);await api('save-teams',[{id:a.id,role:'primary'},{id:b.id,role:'member',primaryAccountId:a.id}]);await api('connection-open',{accountId:b.id,channel:'dm'});await wait(50);eq((await api('connection-check',{accountId:b.id,channel:'dm'})).ready,true);
  receipt=lateOutreach?null:'platform:fixture-outreach-message';const created=await api('outreach-create',{primaryAccountId:a.id,senderAccountIds:[b.id],messageIds:[sourceMessage.id],channel:'dm',text:'固定客服合成答复',acknowledgeEligibleRelationship:true});eq(created.length,1);eq(created[0].status,'review');eq(commitCount,2);
  const preview=await api('outreach-preview',{ids:[created[0].id]});eq(preview.readyCount,1);eq(commitCount,2);await api('outreach-start',{token:preview.token});if(lateOutreach){
  const failedUntil=Date.now()+15000;do{await wait(200);await api('heartbeat');state=await api('snapshot');}while(state.outreach.tasks[0]?.status!=='unknown'&&Date.now()<failedUntil);
  eq(state.outreach.tasks[0].status,'unknown');eq(commitCount,3);
  receipt='platform:late-outreach-message';
  const receiptUntil=Date.now()+75000;do{await wait(500);await api('heartbeat');state=await api('snapshot');}while(state.outreach.tasks[0]?.status==='unknown'&&Date.now()<receiptUntil);
  if(state.outreach.tasks[0]?.status!=='sent')throw Error(JSON.stringify({task:state.outreach.tasks[0],review:state.connections.resources.automaticReviews,ops:ops.slice(-12)}));
  eq(state.outreach.batch.sent,1);eq(state.outreach.batch.unknown,0);eq(commitCount,3);
}
const batchUntil=Date.now()+15000;do{await wait(150);state=await api('snapshot');}while(state.outreach.tasks[0]?.status!=='sent'&&Date.now()<batchUntil);if(state.outreach.tasks[0]?.status!=='sent')throw Error(JSON.stringify({syntheticTask:state.outreach.tasks[0],syntheticBatch:state.outreach.batch,operations:ops.slice(-20),pages:wins.map(w=>({dead:w.dead,url:w.url}))}));eq(state.outreach.tasks[0].status,'sent');eq(state.outreach.tasks[0].accountId,b.id);eq(commitCount,3);await assert.rejects(()=>api('outreach-start',{token:preview.token}),/失效|尚未结束/);checks++;eq(commitCount,3);eq(nativeCalls,0);
  await service.close();service=registerAccountOperations(options);await api('configure',undefined,[account.id,member.id]);state=await api('snapshot');eq(state.replies.find(r=>r.id===sent.id).status,'sent');eq(state.replies.find(r=>r.id===unknown.id).status,lateOutreach?'failed':'sent');eq(state.outreach.tasks[0].status,'sent');eq(state.connections.connections.every(c=>!c.monitorEnabled),true);eq(commitCount,3);eq(nativeCalls,0);
  console.log(JSON.stringify({domWorkerBridgeChecks:checks,actualImportedManager:true,actualNodeWorker:true,encryptedRestart:true,claimAndReceiptRoundTrip:true,monitoringOptInRequired:true,platformSends:0,browserPages:'synthetic only'}));
 }finally{await service?.close();key.fill(0);assert.equal(path.dirname(directory),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('yuanxiao-dom-bridge-'));fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
