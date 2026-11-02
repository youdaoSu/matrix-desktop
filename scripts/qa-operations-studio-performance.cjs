// Real encrypted temporary store; no browser, profile, network or sending adapter.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {randomUUID,randomBytes,createHash}=require('node:crypto'),{performance}=require('node:perf_hooks');
const {OperationsStudio}=require('../desktop/account-operations-studio.cjs');
const {OutreachStore,validateOutreachRelations}=require('../desktop/vendor/hengyuan-interactions/src/outreach.cjs');
const {cipher}=require('../desktop/account-operations-crypto.cjs');
const {configureEncryptedWorkspace}=require('../desktop/vendor/hengyuan-interactions/src/workspace-data.cjs');
const reportIndex=process.argv.indexOf('--report'),reportPath=reportIndex>=0?process.argv[reportIndex+1]:null;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yuanxiao-studio-perf-')),key=randomBytes(32);
const stop=configureEncryptedWorkspace({directory:dir,codecFor:name=>cipher(key,'synthetic-perf/'+name)});
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let report;
try{
 const at='2026-10-30T00:00:00.000Z',studio=new OperationsStudio({directory:dir,now:()=>Date.parse(at)});
 const primary={id:randomUUID(),name:'synthetic primary',platform:'douyin',binding:'synthetic-main'},sender={id:randomUUID(),name:'synthetic sender',platform:'douyin',binding:'synthetic-member'};
 studio.configure([primary,sender]);studio.saveTeams([{id:primary.id,role:'primary'},{id:sender.id,role:'member',primaryAccountId:primary.id}]);
 const size=5000,binding={platform:'douyin',identity:'100',establishedAt:at};
 const tasks=Array.from({length:size},(_,i)=>({id:randomUUID(),primaryAccountId:primary.id,accountId:sender.id,platform:'douyin',sourceMessageId:randomUUID(),sourceExternalId:'perf-source-'+i,sourceChannel:'comment',recipientId:String(10000+i),recipientName:'synthetic '+i,channel:'dm',replyText:'SYNTHETIC_PRIVATE_CONTENT '+('word '+i+' ').repeat(40),workUrl:null,primaryBinding:binding,senderBinding:{...binding,identity:'200'},status:'review',createdAt:at,updatedAt:at}));
 studio.mutateOutreach(items=>items.push(...tasks));eq(studio.snapshot().outreach.length,size);
 const snapshot=()=>OutreachStore.prototype.snapshot.call({studio});
 const expected=studio.snapshot().outreach,copy=snapshot();eq(copy,expected);
 copy[0].replyText='changed outside';copy[0].primaryBinding.identity='999';copy.pop();eq(snapshot(),expected);
 const legacyState={outreach:[{nested:{value:1}}]},legacy=OutreachStore.prototype.snapshot.call({studio:{snapshot:()=>legacyState}});legacy[0].nested.value=2;eq(legacyState.outreach[0].nested.value,1);
 const times=fn=>{const values=[];for(let i=0;i<7;i++){const start=performance.now();fn(i);values.push(performance.now()-start);}values.sort((a,b)=>a-b);return{medianMs:values[3],maxMs:values[6]};};
 snapshot();const readTiming=times(snapshot);
 studio.mutateOutreach(items=>{items[size-1].reason='warmup';});
 const updateTiming=times(i=>studio.mutateOutreach(items=>{items[size-1].reason='synthetic update '+i;}));
 const originalFind=Array.prototype.find,originalClone=global.structuredClone;
 let comparisonProbes=0,relationComparisonProbes=0,cloneCalls=0;
 try{
  Array.prototype.find=function(predicate,thisArg){const selected=this.length===size&&typeof this[0]?.sourceExternalId==='string'&&this[0].sourceExternalId.startsWith('perf-source-');return originalFind.call(this,selected?function(...args){comparisonProbes++;return predicate.apply(this,args);}:predicate,thisArg);};
  studio.mutateOutreach(items=>{items[size-1].reason='counted update';});
 }finally{Array.prototype.find=originalFind;}
 try{global.structuredClone=function(...args){cloneCalls++;return originalClone(...args);};snapshot();}finally{global.structuredClone=originalClone;}
 const crossState=studio.snapshot(),sources={messages:tasks.map(t=>({id:t.sourceMessageId,accountId:t.primaryAccountId,platform:t.platform,senderId:t.recipientId,externalId:t.sourceExternalId,channel:t.sourceChannel,isOwn:false,isGroup:false,createdAt:at})),externalAttempts:[]};
 const relationTiming=times(()=>validateOutreachRelations(crossState,sources));
 try{
  Array.prototype.find=function(predicate,thisArg){const selected=this===sources.messages;return originalFind.call(this,selected?function(...args){relationComparisonProbes++;return predicate.apply(this,args);}:predicate,thisArg);};
  eq(validateOutreachRelations(crossState,sources),true);
 }finally{Array.prototype.find=originalFind;}
 const single={...crossState,outreach:[crossState.outreach[0]]},source=sources.messages[0],wrong={...source,senderId:'different'};
 eq(validateOutreachRelations(single,{messages:[source,wrong],externalAttempts:[]}),true);
 assert.throws(()=>validateOutreachRelations(single,{messages:[wrong,source],externalAttempts:[]}));checks++;
 assert.throws(()=>validateOutreachRelations(single,{messages:[],externalAttempts:[]}));checks++;
 const originalSnapshot=studio.snapshot;let recoverySnapshots=0;
 try{
  studio.snapshot=function(){recoverySnapshots++;return originalSnapshot.call(this);};
  new OutreachStore({studio,interactions:{snapshot:()=>sources,getExternalAttempts:()=>[],getExternalAttempt:()=>undefined}});
 }finally{studio.snapshot=originalSnapshot;}
 eq(recoverySnapshots,1);
 const safeReject=action=>{const before=hash(studio.file),revision=studio.snapshot().revision;assert.throws(()=>studio.mutateOutreach(action));eq(hash(studio.file),before);eq(studio.snapshot().revision,revision);};
 for(const position of [0,Math.floor(size/2),size-1])safeReject(items=>{items[position].replyText='forbidden';});
 safeReject(items=>{items.pop();});safeReject(items=>{items.push({...items[0]});});
 safeReject(items=>{items[size-1].sourceMessageId=randomUUID();});
 safeReject(items=>{items[size-1].id=randomUUID();});
 safeReject(items=>{items[size-1].recipientId='changed';});
 safeReject(items=>{items[size-1].senderBinding.identity='300';});
 const failure={outcome:'not-sent',scope:'task',code:'synthetic-preflight',detail:'synthetic refusal before sending',stage:'preflight',recordedAt:'2026-10-30T00:00:01.000Z'};
 studio.mutateOutreach(items=>Object.assign(items[0],{preflightHistory:[{failure,restoredAt:'2026-10-30T00:00:02.000Z'}],updatedAt:'2026-10-30T00:00:02.000Z'}));
 safeReject(items=>{items[0].preflightHistory=[];});
 safeReject(items=>{items[0].preflightHistory[0].failure.detail='changed';});
 studio.mutateOutreach(items=>Object.assign(items[0],{status:'sending',claimedAt:'2026-10-30T00:00:03.000Z',updatedAt:'2026-10-30T00:00:03.000Z'}));
 safeReject(items=>{items[0].claimedAt='2026-10-30T00:00:04.000Z';items[0].updatedAt=items[0].claimedAt;});
 studio.mutateOutreach(items=>items.reverse());eq(studio.outreachTask(tasks[0].id).id,tasks[0].id);
 const restart=new OperationsStudio({directory:dir,now:()=>Date.parse(at)});eq(restart.snapshot().outreach,studio.snapshot().outreach);eq(restart.activeAccounts(),[]);
 const current=fs.readFileSync(studio.file);eq(current.includes(Buffer.from('SYNTHETIC_PRIVATE_CONTENT')),false);
 report={studioPerformanceChecks:checks,syntheticTasks:size,comparisonProbes,relationComparisonProbes,cloneCalls,readTiming,updateTiming,relationTiming,encryptedBytes:current.length,linearLookupBoundPassed:comparisonProbes<=size*2,linearRelationBoundPassed:relationComparisonProbes<=size*2,singleSnapshotClonePassed:cloneCalls===1,realPlatformActions:0,userProfileTouched:false};
 console.log(JSON.stringify(report));
 if(reportPath)fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 assert(report.linearLookupBoundPassed,'A task update must not repeatedly search the whole task history');
 assert(report.singleSnapshotClonePassed,'Detached outreach snapshot should be cloned once');
 assert(report.linearRelationBoundPassed,'Cross-file validation must not repeatedly search every source message');
}finally{
 stop();key.fill(0);assert.equal(path.dirname(fs.realpathSync(dir)),fs.realpathSync(os.tmpdir()));assert(path.basename(dir).startsWith('yuanxiao-studio-perf-'));
 for(const name of fs.readdirSync(dir)){const file=path.join(dir,name);assert(fs.lstatSync(file).isFile());fs.unlinkSync(file);}fs.rmdirSync(dir);
}
