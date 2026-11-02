// Pure timestamp semantics and actual isolated encrypted archive validation.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {iso,createIsoScope}=require('../desktop/vendor/hengyuan-interactions/src/validated-time.cjs');
const {InteractionStore}=require('../desktop/vendor/hengyuan-interactions/src/interaction-store.cjs'),{cipher}=require('../desktop/account-operations-crypto.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},reject=(fn,label)=>{assert.throws(fn,label);checks++;};
const scope=createIsoScope();
for(const [input,expected] of [
 ['2024-02-29T12:34:56Z','2024-02-29T12:34:56.000Z'],
 ['2024-03-01T00:00:00+08:00','2024-02-29T16:00:00.000Z'],
 ['2024-02-29T23:30:00-02:00','2024-03-01T01:30:00.000Z'],
 ['2000-02-29T12:00:00.1Z','2000-02-29T12:00:00.100Z'],
 ['0000-01-01T00:00:00.12Z','0000-01-01T00:00:00.120Z'],
 ['2024-01-01T24:00:00Z','2024-01-02T00:00:00.000Z'],
 ['9999-12-31T23:59:59-01:00','+010000-01-01T00:59:59.000Z']
]){eq(iso(input),expected);eq(scope(input),expected);eq(scope(input,'另一个字段'),expected);}
for(const input of [undefined,null,123,{},[],new String('2024-01-01T00:00:00Z'),'','2024-01-01','2024-01-01 00:00:00Z','2024-01-01T00:00:00z','2024-01-01T00:00:00.1234Z','2024-01-01T00:00:00Z\0','2024-01-01T24:00:01Z','2024-01-01T23:59:60Z','2024-01-01T00:00:00+24:00','1900-02-29T00:00:00Z','2023-02-29T00:00:00Z','2024-02-30T00:00:00Z','2024-04-31T00:00:00Z']){
 reject(()=>iso(input,'测试字段'),/测试字段/);reject(()=>scope(input,'测试字段'),/测试字段/);reject(()=>scope(input,'其他字段'),/其他字段/);
}
const originalParse=Date.parse,originalFormat=Date.prototype.toISOString;
let parseCalls=0,formatCalls=0;
Date.parse=function(...args){parseCalls++;return originalParse.apply(this,args);};
Date.prototype.toISOString=function(...args){formatCalls++;return originalFormat.apply(this,args);};
let directory;
try{
 const repeated=createIsoScope(),stamp='2026-10-31T00:00:00.000Z';parseCalls=formatCalls=0;
 for(let n=0;n<10000;n++)assert.equal(repeated(stamp),stamp);checks++;
 eq(parseCalls,1);eq(formatCalls,2);
 createIsoScope()(stamp);eq(parseCalls,2); // No cache survives into a new scope.
 const bounded=createIsoScope(),values=Array.from({length:257},(_,n)=>new Date(Date.UTC(2024,0,1,0,0,n)).toISOString());
 for(const value of values)bounded(value);parseCalls=formatCalls=0;
 bounded(values[0]);eq(parseCalls,0);bounded(values[256]);bounded(values[256]);eq(parseCalls,2);eq(formatCalls,2);
 const calendar=createIsoScope(),days=Array.from({length:33},(_,n)=>new Date(Date.UTC(2024,0,n+1)).toISOString());
 for(const day of days)calendar(day);parseCalls=formatCalls=0;
 calendar(days[0].replace('00:00:00','00:00:01'));eq(formatCalls,1);
 calendar(days[32].replace('00:00:00','00:00:01'));eq(formatCalls,3); // Day 33 is not retained.
 directory=fs.mkdtempSync(path.join(os.tmpdir(),'yx-time-validation-'));const accountId=crypto.randomUUID(),now=Date.now();
 const store=new InteractionStore(directory,{...cipher(crypto.randomBytes(32),'fixture'),now:()=>now,getAccount:id=>({id,platform:'douyin',name:'synthetic'})});
 const seed=store.ingest({accountId,channel:'comment',externalId:'seed',threadId:'work',senderId:'peer',senderName:'fixture',text:'synthetic',receivedAt:new Date(now).toISOString(),isOwn:false,isGroup:false,historical:false}),state=store._read();
 state.messages=Array.from({length:512},(_,n)=>({...seed,id:crypto.randomUUID(),externalId:'source-'+n}));
 parseCalls=0;eq(store._validate(state).messages.length,512);eq(parseCalls,1);
 eq(store._validate(state).messages.length,512);eq(parseCalls,2);
 const broken=structuredClone(state);broken.messages[511].createdAt='2024-02-30T00:00:00Z';reject(()=>store._validate(broken),/日期不正确/);
 store._write(broken);const before=fs.readFileSync(store.filePath);reject(()=>store.snapshotForDisplay(),/原文件已保留/);eq(fs.readFileSync(store.filePath),before);
 store._write(state);eq(store.snapshotForDisplay().totalMessages,512);eq(store.snapshotForDisplay().totalMessages,512);
}finally{
 Date.parse=originalParse;Date.prototype.toISOString=originalFormat;
 if(directory){assert.equal(fs.realpathSync(path.dirname(directory)),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('yx-time-validation-'));fs.rmSync(directory,{recursive:true,force:true});}
}
console.log(JSON.stringify({passed:true,checks,identicalTimestampCalls:10000,uniqueValueCacheLimit:256,calendarCacheLimit:32,encryptedInvalidArchivePreserved:true,realPlatformActions:0}));
