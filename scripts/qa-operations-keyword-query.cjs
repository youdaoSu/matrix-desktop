// Actual encrypted stores; no browser, platform requests or real recipients.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {cipher}=require('../desktop/account-operations-crypto.cjs'),{configureEncryptedWorkspace,write}=require('../desktop/vendor/hengyuan-interactions/src/workspace-data.cjs');
const {KeywordRoutes}=require('../desktop/account-operations-keyword-routes.cjs'),{OperationsStudio}=require('../desktop/account-operations-studio.cjs'),{InteractionStore}=require('../desktop/vendor/hengyuan-interactions/src/interaction-store.cjs'),{OutreachStore}=require('../desktop/vendor/hengyuan-interactions/src/outreach.cjs');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yx-keyword-query-')),key=crypto.randomBytes(32),unregister=configureEncryptedWorkspace({directory,codecFor:name=>cipher(key,'fixture/'+name)});
const originalRead=fs.readFileSync,originalClone=global.structuredClone;let engine,checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{
try{
 let now=Date.now()+1000,platformActions=0;const primary={id:crypto.randomUUID(),platform:'douyin',name:'synthetic primary',binding:'primary'},member={id:crypto.randomUUID(),platform:'douyin',name:'synthetic member',binding:'member'},accounts=[primary,member];
 const studio=new OperationsStudio({directory});studio.configure(accounts);studio.saveTeams([{id:primary.id,role:'primary'},{id:member.id,role:'member',primaryAccountId:primary.id}]);
 const bindings=new Map(accounts.map((account,index)=>[account.id,{platform:'douyin',identity:String(100+index),establishedAt:new Date(now-1000).toISOString()}]));
 const store=new InteractionStore(directory,{...cipher(key,'incoming'),now:()=>now,getAccount:id=>studio.getAccount(id)}),tasks=new OutreachStore({studio,interactions:store,getBinding:id=>bindings.get(id),now:()=>now});
 const rule={id:crypto.randomUUID(),revision:1,name:'synthetic rule',primaryAccountId:primary.id,senderAccountIds:[member.id],workIds:[],keywords:['request'],match:'contains',replyText:'synthetic',delaySeconds:15,hourlyLimit:1,dailyLimit:1};
 const hits=Array.from({length:100},(_,i)=>({id:crypto.randomUUID(),ruleId:rule.id,ruleRevision:1,messageId:crypto.randomUUID(),accountId:member.id,primaryAccountId:primary.id,recipientId:String(9000+i),sourceDigest:'a'.repeat(64),status:'sent',createdAt:new Date(now-86400001).toISOString(),dueAt:now-86400001,detail:'synthetic history'}));
 write(path.join(directory,'keyword-routes.json'),{version:1,rules:[rule],hits,cursors:{},detail:'synthetic'});
 const options={directory,studio,store,tasks,canSchedule:()=>true,canUseSender:()=>true,start:()=>{platformActions++;throw Error('No real sending');},stop:()=>{},now:()=>now};engine=new KeywordRoutes(options);
 const hash=file=>crypto.createHash('sha256').update(originalRead(file)).digest('hex'),keywordFile=path.join(directory,'keyword-routes.json'),before=hash(keywordFile);let clones=0;
 global.structuredClone=(value,...args)=>{clones++;return originalClone(value,...args);};for(let i=0;i<100;i++)eq(engine.hasArmedRules(),false);global.structuredClone=originalClone;eq(clones,0);eq(hash(keywordFile),before);
 const input=n=>({accountId:primary.id,channel:'comment',externalId:'777777777777777777/'+n,threadId:'777777777777777777',senderId:String(n+3000),senderName:'synthetic',text:'ordinary',receivedAt:new Date(now).toISOString(),profileUrl:'https://www.douyin.com/user/MS4wFixture'+n,isOwn:false,isGroup:false,historical:false});
 const messages=[];for(let start=0;start<512;start+=16)messages.push(...store.ingestMany(Array.from({length:16},(_,i)=>input(start+i+1))));
 let reads=0;const measured=action=>{reads=0;fs.readFileSync=function(file,...args){if(typeof file==='string'&&path.resolve(file)===path.resolve(store.filePath))reads++;return originalRead.call(this,file,...args);};try{return action();}finally{fs.readFileSync=originalRead;}};
 const storeBefore=hash(store.filePath);measured(()=>{for(const message of messages)eq(engine.observe(message),null);});eq(reads,0);eq(hash(store.filePath),storeBefore);eq(hash(keywordFile),before);
 const idleTick=async count=>{let policyChecks=0,tickReads=0;engine.canSchedule=()=>{policyChecks++;return !store.getPolicy().paused;};fs.readFileSync=function(file,...args){if(typeof file==='string'&&path.resolve(file)===path.resolve(store.filePath))tickReads++;return originalRead.call(this,file,...args);};try{for(let i=0;i<count;i++)await engine.tick();return{policyChecks,reads:tickReads};}finally{fs.readFileSync=originalRead;}};
 eq(await idleTick(100),{policyChecks:0,reads:0});eq(hash(keywordFile),before);eq(hash(store.filePath),storeBefore);
 const arm=r=>engine.arm({id:r.id,revision:r.revision,acknowledgeAutomatic:true,acknowledgeEligibleRelationship:true});arm(rule);eq(engine.hasArmedRules(),true);now++;
 eq(await idleTick(100),{policyChecks:100,reads:100});
 // Armed scheduling must still reject corruption, never use a stale policy.
 const intact=originalRead(store.filePath),damaged=Buffer.from(intact);damaged[damaged.length-1]^=1;fs.writeFileSync(store.filePath,damaged);
 try{await assert.rejects(()=>engine.tick(),/原文件已保留/);checks++;eq(originalRead(store.filePath),damaged);}finally{fs.writeFileSync(store.filePath,intact);}
 const fresh=store.ingest(input(600));eq(measured(()=>engine.observe(fresh)),null);eq(reads,1);
 // Enabled routes still validate the exact durable source before matching.
 for(const patch of [{text:'request'},{senderId:'999999',text:'request'},{receivedAt:new Date(now+1).toISOString(),text:'request'},{profileUrl:'https://www.douyin.com/user/MS4wOther',text:'request'}]){eq(measured(()=>engine.observe({...fresh,...patch})),null);eq(reads,1);eq(engine.snapshot().totalHits,100);}
 engine.pause(rule.id);eq(engine.hasArmedRules(),false);eq(await idleTick(10),{policyChecks:0,reads:0});arm(rule);eq(engine.hasArmedRules(),true);
 const edited=engine.save({...rule,name:'edited synthetic'});eq(engine.hasArmedRules(),false);arm(edited);eq(engine.hasArmedRules(),true);engine.remove({id:edited.id,revision:edited.revision});eq(engine.hasArmedRules(),false);
 const imported={...edited,id:crypto.randomUUID()};eq(engine.importPausedRules([imported]).added,1);eq(engine.hasArmedRules(),false);eq(await idleTick(10),{policyChecks:0,reads:0});arm(imported);eq(engine.hasArmedRules(),true);engine.close();eq(engine.hasArmedRules(),false);eq(await idleTick(10),{policyChecks:0,reads:0});
 engine=new KeywordRoutes(options);eq(engine.hasArmedRules(),false);eq(engine.snapshot().totalHits,100);eq(await idleTick(10),{policyChecks:0,reads:0});eq(platformActions,0);
 console.log(JSON.stringify({passed:true,checks,queryClones:clones,unarmedObservations:512,unarmedHistoryReads:0,armedSourceStillVerified:true,lifecycleAndRestartVerified:true,realPlatformActions:0}));
}finally{global.structuredClone=originalClone;fs.readFileSync=originalRead;engine?.close();unregister();key.fill(0);assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('yx-keyword-query-'));fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
