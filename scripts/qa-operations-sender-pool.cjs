// Real encrypted stores and outreach runtime; inert directory and browser boundary.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {cipher}=require('../desktop/account-operations-crypto.cjs');
const {configureEncryptedWorkspace}=require('../desktop/vendor/hengyuan-interactions/src/workspace-data.cjs');
const {OperationsStudio}=require('../desktop/account-operations-studio.cjs');
const {InteractionStore}=require('../desktop/vendor/hengyuan-interactions/src/interaction-store.cjs');
const {createDomRuntime}=require('../desktop/account-operations-dom-runtime.cjs');
const {createOutreachRuntime}=require('../desktop/account-operations-outreach-runtime.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yuanxiao-sender-pool-')),key=crypto.randomBytes(32);
 const unregister=configureEncryptedWorkspace({directory,codecFor:name=>cipher(key,'isolated/'+name)});
 const accounts=['主号','客服甲','客服乙','其他账号'].map((name,i)=>({id:crypto.randomUUID(),name,platform:'douyin',binding:'native-'+i}));
 const [primary,a,b,other]=accounts,studio=new OperationsStudio({directory});let dom,runtime,browserCalls=0;
 try{
  studio.configure(accounts);studio.saveTeams([{id:primary.id,role:'primary'},{id:a.id,role:'member',primaryAccountId:primary.id},{id:b.id,role:'member',primaryAccountId:primary.id},{id:other.id,role:'independent'}]);
  const store=new InteractionStore(directory,{...cipher(key,'interaction'),getAccount:id=>studio.getAccount(id)});
  dom=createDomRuntime({directory,studio,store,call:async()=>{browserCalls++;throw Error('No browser allowed');}});
  for(let i=0;i<accounts.length;i++)dom.registerNativeIdentity(accounts[i].id,String(101+i));
  let failReader='',pauseReader='',paused=false,wrongReader=false,missingReader=false;const reads=[];
  const refreshDirectory=async args=>{
   reads.push(args.accountId);if(args.accountId===failReader)throw Error('synthetic reader unavailable');if(args.accountId===pauseReader)paused=true;
   return{primaryAccountId:primary.id,accountId:wrongReader&&args.accountId===b.id?a.id:args.accountId,ownerIdentity:'101',readerIdentity:String(101+accounts.findIndex(account=>account.id===args.accountId)),ownerProfileUrl:'https://www.douyin.com/user/MS4wOwner_pool',nativeDirectoryProof:{kind:'native-cache-v1',scopeHash:crypto.createHash('sha256').update(primary.binding).digest('hex'),verifiedAt:new Date().toISOString()},items:(missingReader&&args.accountId===b.id?args.ids.slice(0,1):args.ids).map(id=>({id,uid:String(10000+Number(id.split('_').at(-1))),name:'合成联系人',profileUrl:'https://www.douyin.com/user/'+id,firstSeenAt:'2026-01-01T00:00:00.000Z'})),total:20,complete:false};
  };
  runtime=createOutreachRuntime({directory,studio,store,dom,refreshDirectory,reserve:()=>{throw Error('No sending allowed');},release:()=>{},canRun:()=>!paused,canWrite:()=>!paused});
  const input={primaryAccountId:primary.id,senderAccountIds:[a.id,b.id],sourceKind:'fan-directory',channel:'dm',fanIds:['MS4wFan_1','MS4wFan_2','MS4wFan_3'],text:'隔离合成答复',acknowledgeEligibleRelationship:true};
  for(const senders of [[],[a.id,a.id],[primary.id],[other.id],Array.from({length:11},()=>crypto.randomUUID())]){await assert.rejects(()=>runtime.command('outreach-create',{...input,senderAccountIds:senders}));checks++;}
  eq(reads.length,0);
  const created=await runtime.command('outreach-create',input);eq(reads,[a.id,b.id]);eq(created.map(t=>t.accountId),[a.id,b.id,a.id]);eq(created.map(t=>t.status),['review','review','review']);eq(store.getExternalAttempts().length,0);eq(browserCalls,0);
  const reopened=new OperationsStudio({directory});reopened.configure(accounts);eq(created.map(task=>reopened.outreachPage().tasks.find(t=>t.id===task.id).accountId),[a.id,b.id,a.id]);
  runtime.tasks.recordFailure(created[0].id,{outcome:'not-sent',scope:'task',code:'profile-unavailable',stage:'preflight',detail:'synthetic unavailable',recordedAt:new Date().toISOString()});
  await assert.rejects(()=>runtime.command('outreach-create',{...input,senderAccountIds:[b.id],fanIds:['MS4wFan_1']}),/已有/);checks++;eq(runtime.tasks.get(created[0].id).accountId,a.id);
  const count=runtime.tasks.snapshot().length;failReader=b.id;
  await assert.rejects(()=>runtime.command('outreach-create',{...input,fanIds:['MS4wFan_4','MS4wFan_5']}),/reader unavailable/);checks++;eq(runtime.tasks.snapshot().length,count);failReader='';
  pauseReader=b.id;await assert.rejects(()=>runtime.command('outreach-create',{...input,fanIds:['MS4wFan_4','MS4wFan_5']}),/服务已暂停/);checks++;eq(runtime.tasks.snapshot().length,count);pauseReader='';paused=false;
  wrongReader=true;await assert.rejects(()=>runtime.command('outreach-create',{...input,fanIds:['MS4wFan_4','MS4wFan_5']}),/本次选择不一致/);checks++;eq(runtime.tasks.snapshot().length,count);eq(dom.manager.control.bindings[a.id].identity,'102');wrongReader=false;
  missingReader=true;await assert.rejects(()=>runtime.command('outreach-create',{...input,fanIds:['MS4wFan_4','MS4wFan_5']}),/本次选择不一致/);checks++;eq(runtime.tasks.snapshot().length,count);missingReader=false;
  // Received comments can also be distributed, with duplicate people removed.
  for(let i=0;i<3;i++)store.ingest({accountId:primary.id,channel:'comment',externalId:'comment-'+i,threadId:'work-1',senderId:String(201+i%2),senderName:'合成咨询者',text:'求资料',receivedAt:new Date().toISOString(),isOwn:false,isGroup:false,historical:true});
  const messages=store.snapshot().messages.filter(m=>m.externalId.startsWith('comment-'));
  const incoming=await runtime.command('outreach-create',{primaryAccountId:primary.id,senderAccountIds:[b.id,a.id],messageIds:messages.map(m=>m.id),channel:'dm',text:'隔离答复',acknowledgeEligibleRelationship:true});
  eq(incoming.length,2);eq(incoming.map(t=>t.accountId),[b.id,a.id]);eq(incoming.every(t=>t.sourceChannel==='comment'&&t.status==='review'),true);
  eq(store.getExternalAttempts().length,0);eq(browserCalls,0);
  console.log(JSON.stringify({senderPoolChecks:checks,everyReaderVerified:true,fixedAssignmentsPersist:true,noFailureReassignment:true,recipientDeduplication:true,creationDoesNotSend:true,realPlatformCalls:0}));
 }finally{runtime?.close();dom?.close();unregister();key.fill(0);assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(directory).startsWith('yuanxiao-sender-pool-'));fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
