// Two disposable encrypted workspaces; no network, browser, or real recipients.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {cipher}=require('../desktop/account-operations-crypto.cjs');
const {configureEncryptedWorkspace}=require('../desktop/vendor/hengyuan-interactions/src/workspace-data.cjs');
const {OperationsStudio}=require('../desktop/account-operations-studio.cjs');
const {InteractionStore}=require('../desktop/vendor/hengyuan-interactions/src/interaction-store.cjs');
const {OutreachStore}=require('../desktop/vendor/hengyuan-interactions/src/outreach.cjs');
const {KeywordRoutes}=require('../desktop/account-operations-keyword-routes.cjs');
const {OperationsArchive}=require('../desktop/account-operations-archive.cjs');
let checks=0,dispatches=0,now=Date.now()+1000;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},bad=(fn,re)=>{assert.throws(fn,re);checks++;};
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex'),encode=body=>JSON.stringify({...body,sha256:hash(body)});
const root=fs.mkdtempSync(path.join(os.tmpdir(),'yuanxiao-keyword-archive-')),disposers=[],keys=[];
function fixture(name){
 const directory=path.join(root,name);fs.mkdirSync(directory);const key=crypto.randomBytes(32);keys.push(key);disposers.push(configureEncryptedWorkspace({directory,codecFor:file=>cipher(key,name+'/'+file)}));
 const accounts=['主号','成员甲','成员乙'].map((label,i)=>({id:crypto.randomUUID(),platform:'douyin',name:name+label,binding:name+'-binding-'+i})),[primary,a,b]=accounts;
 const studio=new OperationsStudio({directory});studio.configure(accounts);const teams=()=>studio.saveTeams([{id:primary.id,role:'primary'},{id:a.id,role:'member',primaryAccountId:primary.id},{id:b.id,role:'member',primaryAccountId:primary.id}]);teams();
 const bindings=new Map(accounts.map((v,i)=>[v.id,{platform:'douyin',identity:String(100+i),establishedAt:new Date(now-1000).toISOString()}]));
 const store=new InteractionStore(directory,{...cipher(key,name+'/interactions'),now:()=>now,getAccount:id=>studio.getAccount(id)}),tasks=new OutreachStore({studio,interactions:store,getBinding:id=>bindings.get(id),now:()=>now});
 const options={directory,studio,store,tasks,now:()=>now,canSchedule:()=>true,canUseSender:()=>true,start:()=>{dispatches++;throw Error('No synthetic sends expected');},stop:()=>{}};
 const engine=new KeywordRoutes(options),archiveOptions={directory,studio,store,keywordRoutes:engine,canImport:()=>true,now:()=>now},archive=new OperationsArchive(archiveOptions);
 const input={name:'合成关键词配置',primaryAccountId:primary.id,senderAccountIds:[b.id,a.id],workIds:['7123456789012345678'],keywords:['求'],match:'contains',replyText:'ARCHIVE_PRIVATE_CONTENT',delaySeconds:15,hourlyLimit:5,dailyLimit:10};
 return{directory,key,accounts,primary,a,b,studio,teams,store,tasks,engine,options,archiveOptions,archive,input};
}
(async()=>{try{
 const source=fixture('source'),target=fixture('target'),rule=source.engine.save({...source.input,quotaMode:'per-account-success',windowMinutes:30,queueHours:48,senderLimits:[{accountId:source.b.id,limit:3},{accountId:source.a.id,limit:5}]});
 source.engine.arm({id:rule.id,revision:rule.revision,acknowledgeAutomatic:true,acknowledgeEligibleRelationship:true});now++;
 const message=source.store.ingest({accountId:source.primary.id,channel:'comment',externalId:'7123456789012345678/9001',threadId:'7123456789012345678',senderId:'9001',senderName:'合成咨询',text:'求资料',receivedAt:new Date(now).toISOString(),profileUrl:'https://www.douyin.com/user/MS4wSynthetic9001',isOwn:false,isGroup:false,historical:false});
 eq(source.engine.observe(message).status,'queued');eq(source.engine.snapshot().rules[0].armed,true);
 const exported=source.archive.export(),raw=JSON.parse(exported.text),{sha256,...body}=raw;
 eq(raw.version,2);eq(Object.keys(raw.data).length,6);eq(Object.keys(raw.data['keyword-routes.json']).sort(),['hits','rules','version']);eq(raw.data['keyword-routes.json'].rules[0].armed,undefined);eq(raw.data['keyword-routes.json'].hits[0].status,'queued');eq(raw.data['keyword-routes.json'].rules[0].senderAccountIds,[source.b.id,source.a.id]);eq(raw.data['studio.json'].accounts.some(a=>Object.hasOwn(a,'binding')),false);
 const keep=target.engine.save({...target.input,name:'本机原有规则'});target.engine.arm({id:keep.id,revision:keep.revision,acknowledgeAutomatic:true,acknowledgeEligibleRelationship:true});
 const mapping=source.accounts.map((a,i)=>({from:a.id,to:target.accounts[i].id})),inspect=()=>target.archive.inspect(exported.text),preview=()=>target.archive.prepare({inspectionId:inspect().id,mapping});
 const inspected=inspect();eq(inspected.counts.keywordRules,1);eq(inspected.counts.keywordHits,1);
 const incomplete=target.archive.prepare({inspectionId:inspected.id,mapping:mapping.slice(0,2)});eq(incomplete.keywordRules.length,0);eq(incomplete.skipped.length,1);
 target.studio.saveTeams([{id:target.b.id,role:'independent'}]);const wrongTeam=preview();eq(wrongTeam.keywordRules.length,0);eq(wrongTeam.skipped.length,1);target.teams();
 const stale=preview();target.studio.saveTeams([{id:target.b.id,role:'independent'}]);bad(()=>target.archive.confirm({token:stale.token}),/分工已变化/);eq(target.archive.list().length,0);target.teams();
 const p=preview();eq(p.keywordRules[0].armed,false);eq(p.keywordRules[0].senderAccountIds,[target.b.id,target.a.id]);eq(target.engine.snapshot().rules.length,1);
 const result=target.archive.confirm({token:p.token});eq(result.keywordRulesAdded,1);eq(result.keywordHitsRestoredAsTasks,false);eq(result.automaticModesRestored,false);eq(target.engine.snapshot().hits.length,0);eq(target.tasks.snapshot().length,0);eq(target.store.snapshot().messages.length,0);
 const imported=target.engine.snapshot().rules.find(r=>r.id!==keep.id);eq(imported.armed,false);eq(imported.revision,1);eq(imported.primaryAccountId,target.primary.id);eq(target.engine.snapshot().rules.find(r=>r.id===keep.id).armed,true);eq(target.engine.monitorPlan().length,1);now+=20000;await target.engine.tick();eq(dispatches,0);
 const historical=target.archive.history({id:result.importId,kind:'keyword-hits'});eq(historical.rows[0].status,'queued');eq(historical.readOnly,true);eq(historical.platformReverified,false);eq(target.archive.history({id:result.importId,kind:'keyword-rules'}).rows[0].id,rule.id);
 eq(fs.readFileSync(target.engine.file).includes(Buffer.from('ARCHIVE_PRIVATE_CONTENT')),false);eq(fs.readFileSync(target.archive.file).includes(Buffer.from('ARCHIVE_PRIVATE_CONTENT')),false);eq(JSON.parse(target.archive.exportOriginal({id:result.importId}).text).sha256,sha256);
 target.engine.save({...imported,name:'在本机修改，重复导入必须保留'});const duplicate=preview();eq(duplicate.keywordRules.length,0);eq(target.archive.confirm({token:duplicate.token}).keywordRulesAdded,0);eq(target.engine.snapshot().rules.find(r=>r.id===imported.id).name,'在本机修改，重复导入必须保留');
 const restarted=new KeywordRoutes(target.options);eq(restarted.snapshot().rules.every(r=>!r.armed),true);eq(restarted.snapshot().hits.length,0);await restarted.tick();eq(dispatches,0);
 // Crash after a real encrypted keyword commit, before archive completion.
 const crashBody=structuredClone(body);crashBody.data['keyword-routes.json'].rules[0].name='中断后重试规则';const crashText=encode(crashBody),ci=target.archive.inspect(crashText),cp=target.archive.prepare({inspectionId:ci.id,mapping}),original=target.engine.importPausedRules.bind(target.engine);
 target.engine.importPausedRules=rules=>{original(rules);throw Error('synthetic interruption after keyword commit');};bad(()=>target.archive.confirm({token:cp.token}),/synthetic interruption/);eq(target.archive.list()[0].status,'prepared');eq(target.engine.snapshot().rules.length,3);target.engine.importPausedRules=original;
 target.archive=new OperationsArchive(target.archiveOptions);const ri=target.archive.inspect(crashText),rp=target.archive.prepare({inspectionId:ri.id,mapping});eq(target.archive.confirm({token:rp.token}).keywordRulesAdded,0);eq(target.archive.list()[0].status,'complete');eq(target.engine.snapshot().rules.length,3);eq(target.engine.snapshot().hits.length,0);
 // Capacity changing after preview must fail before any archive or rule write.
 const capBody=structuredClone(body);capBody.data['keyword-routes.json'].rules[0].name='容量检查规则';const capText=encode(capBody),capI=target.archive.inspect(capText),capP=target.archive.prepare({inspectionId:capI.id,mapping});
 for(let i=3;i<20;i++)target.engine.save({...target.input,name:'容量占位'+i});const archiveBefore=fs.readFileSync(target.archive.file);bad(()=>target.archive.confirm({token:capP.token}),/超过20/);eq(fs.readFileSync(target.archive.file),archiveBefore);eq(target.engine.snapshot().rules.length,20);
 const corrupt=structuredClone(body);corrupt.data['keyword-routes.json'].rules[0].armed=true;bad(()=>target.archive.inspect(encode(corrupt)),/执行字段/);delete corrupt.data['keyword-routes.json'].rules[0].armed;corrupt.data['keyword-routes.json'].hits[0].status='run-now';bad(()=>target.archive.inspect(encode(corrupt)),/命中记录/);
 corrupt.data['keyword-routes.json'].hits=[];corrupt.data['keyword-routes.json'].grant={};bad(()=>target.archive.inspect(encode(corrupt)),/格式/);
 const legacy=structuredClone(body);legacy.version=1;delete legacy.data['keyword-routes.json'];eq(target.archive.inspect(encode(legacy)).counts.keywordRules,0);
 eq(dispatches,0);console.log(JSON.stringify({keywordArchiveChecks:checks,twoEncryptedWorkspaces:true,orderedPoolMapped:true,importedRulesPaused:true,oldHitsReadOnly:true,existingRulesUnchanged:true,crashRecoveryIdempotent:true,capacityRecheckedBeforeWrite:true,legacyCompatible:true,realPlatformCalls:0}));
}finally{for(const dispose of disposers)dispose();for(const key of keys)key.fill(0);assert.equal(path.dirname(root),fs.realpathSync(os.tmpdir()));assert(path.basename(root).startsWith('yuanxiao-keyword-archive-'));fs.rmSync(root,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
