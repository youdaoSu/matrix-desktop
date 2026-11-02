// Two isolated encrypted stores compare sequential and atomic ingestion.
// No runtime sender, browser, user profile or platform connection is created.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {InteractionStore}=require('../desktop/vendor/hengyuan-interactions/src/interaction-store.cjs');
const {AtomicThreadLock}=require('../desktop/account-operations-store-lock.cjs');
const {cipher}=require('../desktop/account-operations-crypto.cjs');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yx-ingest-batch-')),key=crypto.randomBytes(32),accounts=[crypto.randomUUID(),crypto.randomUUID()];
let now=Date.now(),checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function canonical(state){
 const ids=new Map(state.messages.map(m=>[m.id,JSON.stringify([m.accountId,m.channel,m.externalId])]));
 for(const r of state.replies)ids.set(r.id,JSON.stringify([ids.get(r.messageId),r.ruleId,r.deliveryChannel||r.channel]));
 return JSON.parse(JSON.stringify(state,(_,value)=>typeof value==='string'&&ids.has(value)?ids.get(value):value));
}
try{
 const create=name=>{const dir=path.join(directory,name);fs.mkdirSync(dir);const lock=new AtomicThreadLock(dir,{leaseId:crypto.randomUUID()});return new InteractionStore(dir,{...cipher(key,'fixture'),now:()=>now,getAccount:id=>{assert(accounts.includes(id));return{id,platform:'douyin',name:'synthetic'};},withLock:action=>lock.run(action)});};
 const sequential=create('sequential'),batched=create('batched');
 const base={name:'synthetic',platform:'douyin',accountIds:[],channel:'comment',match:'contains',keywords:['fixture'],replyText:'synthetic response',enabled:true,cooldownMinutes:30,delaySeconds:10};
 sequential.saveRule(base);
 sequential.saveRule({...base,name:'private',deliveryChannel:'dm',replyText:'synthetic private'});
 sequential.saveRule({...base,name:'first',channel:'dm',trigger:'first-message',priority:10});
 sequential.saveRule({...base,name:'follow',channel:'follow',trigger:'follow',match:'any',keywords:[]});
 for(const channel of ['comment','dm','follow'])sequential.setMode({accountId:accounts[0],channel,mode:'auto'});
 batched._write(sequential._read());now+=1000;
 const row=(n,extra={})=>({accountId:accounts[0],channel:'comment',externalId:'source-'+n,threadId:'work-1',senderId:'peer-'+n,senderName:'synthetic',text:'fixture '+n,receivedAt:new Date(now).toISOString(),isOwn:false,isGroup:false,historical:false,...extra});
 const rows=[row(0),row(1,{senderId:'peer-0'}),row(2,{accountId:accounts[1]}),row(3,{isOwn:true}),row(4,{isGroup:true}),row(5,{historical:true}),row(6,{channel:'dm',threadId:'thread-1'}),row(7,{channel:'dm',threadId:'thread-1',senderId:'peer-6'}),row(8,{channel:'follow',threadId:'follower:peer-8'}),row(9,{channel:'follow',threadId:'follower:peer-8',senderId:'peer-8'}),row(10,{text:'unmatched'}),row(11,{receivedAt:new Date(now-11*60000).toISOString()}),row(0),row(12),row(13),row(14)];
 const original=batched._write.bind(batched);let writes=0;batched._write=state=>{writes++;return original(state);};
 const expected=rows.map(r=>sequential.ingest(r)),actual=batched.ingestMany(rows);
 eq(writes,1);eq(canonical(batched._read()),canonical(sequential._read()));eq(actual.length,16);
 eq(actual.map(({id,...r})=>r),expected.map(({id,...r})=>r));
 actual[0].text='external mutation';eq(batched.getMessage(actual[0].id).text,'fixture 0');
 const snapshot=batched._read(),before=digest(batched.filePath);writes=0;
 batched.ingestMany(rows);eq(writes,0);eq(digest(batched.filePath),before);eq(batched._read(),snapshot);
 const rejects=fn=>{const hash=digest(batched.filePath),state=batched._read();assert.throws(fn);checks++;eq(digest(batched.filePath),hash);eq(batched._read(),state);eq(fs.existsSync(batched.lockPath),false);};
 for(const invalid of [[],Array(1),Array(17).fill(row(20)),[row(20),row(21,{senderId:''})],[row(20),row(21,{accountId:crypto.randomUUID()})],[row(20),row(21,{text:'x'.repeat(100001)})],[row(20),row(21,{receivedAt:new Date(now+60001).toISOString()})],Array.from({length:16},(_,i)=>row(30+i,{text:'x'.repeat(40000)}))])rejects(()=>batched.ingestMany(invalid));
 rejects(()=>batched.withReadSnapshot(()=>batched.ingestMany([row(22)])));
 // Identity conflict later in the batch rolls back a preceding valid record.
 rejects(()=>batched.ingestMany([row(23),row(0,{senderId:'different',profileUrl:'https://www.douyin.com/user/MS4wSynthetic'})]));
 // Simulated encryption failure cannot publish the in-memory batch.
 const protect=batched._protect;batched._protect=()=>{throw Error('synthetic encryption failure');};rejects(()=>batched.ingestMany([row(24),row(25)]));batched._protect=protect;
 // A failed batch does not leave a context that affects later normal writes.
 batched.ingest(row(26));eq(batched.getMessage(batched.snapshotForDisplay().messages?.[0]?.id||batched._read().messages[0].id).externalId,'source-26');
 // Optional verified profile enrichment remains ordered and idempotent.
 const profile='https://www.douyin.com/user/MS4wSynthetic';
 sequential.ingest(row(0,{profileUrl:profile}));batched.ingestMany([row(0,{profileUrl:profile})]);eq(batched._read().messages.find(m=>m.externalId==='source-0').profileUrl,profile);
 const altered=fs.readFileSync(batched.filePath);altered[altered.length-1]^=1;fs.writeFileSync(batched.filePath,altered);assert.throws(()=>batched.ingestMany([row(27)]));checks++;eq(fs.readFileSync(batched.filePath),altered);
 console.log(JSON.stringify({passed:true,checks,sequentialRuleAndIdentitySemantics:true,oneAtomicWrite:true,duplicateReadOnly:true,invalidBatchRollback:true,encryptedFailurePreserved:true,realPlatformActions:0}));
}finally{key.fill(0);assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('yx-ingest-batch-'));fs.rmSync(directory,{recursive:true,force:true});}
