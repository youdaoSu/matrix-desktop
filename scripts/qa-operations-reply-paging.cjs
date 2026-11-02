'use strict';
const assert=require('node:assert/strict');
const {projectInteractionSnapshot}=require('../desktop/vendor/hengyuan-interactions/src/snapshot-projection.cjs');
const account='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const state={rules:[],settings:{},messages:[],replies:[]};
for(let i=0;i<651;i++){
 state.messages.push({id:'m'+i,accountId:i%2?account:other,threadId:'thread'+(i%20),receivedAt:new Date(1700000000000+i*1000).toISOString(),text:'source '+i});
 state.replies.push({id:'r'+i,messageId:'m'+i,accountId:i%2?account:other,status:i%3?'sent':'unknown'});
}
const original=structuredClone(state);let checks=0;
const first=projectInteractionSnapshot(state,{limit:100});
assert.equal(first.replies.length,100);checks++;
const seen=[];for(let offset=0;offset<700;offset+=100){const page=projectInteractionSnapshot(state,{offset,limit:100});seen.push(...page.replies.map(r=>r.id));assert.equal(page.replyPage.offset,offset);assert.equal(page.replyPage.matchingReplies,651);assert.deepEqual(page.replySources.map(m=>m.id),page.replies.map(r=>r.messageId));assert.equal(page.messages.length,20);checks+=4;}
assert.equal(new Set(seen).size,651);assert.equal(seen.length,651);checks+=2;
for(const status of ['all','sent','unknown','pending'])for(const accountId of ['',account,other]){const expected=state.replies.filter(r=>(status==='all'||r.status===status)&&(!accountId||r.accountId===accountId));const page=projectInteractionSnapshot(state,{status,accountId,offset:50000,limit:37});const offset=expected.length?Math.floor((expected.length-1)/37)*37:0;assert.equal(page.replyPage.offset,offset);assert.equal(page.replyPage.matchingReplies,expected.length);assert.deepEqual(page.replies,expected.slice(offset,offset+37));assert.deepEqual(page.counts,first.counts);checks+=4;}
for(const invalid of [null,[],1,{offset:-1},{offset:50001},{offset:1.1},{limit:0},{limit:301},{limit:'100'},{status:'bad'},{accountId:3},{accountId:'foreign'},{extra:true}]){assert.throws(()=>projectInteractionSnapshot(state,invalid));checks++;}
assert.deepEqual(state,original);checks++;
const legacy=projectInteractionSnapshot(state);assert.equal(legacy.replies.length,300);assert.equal(legacy.replyPage,undefined);assert.equal(legacy.replySources,undefined);checks+=3;
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {InteractionStore}=require('../desktop/vendor/hengyuan-interactions/src/interaction-store.cjs'),{cipher}=require('../desktop/account-operations-crypto.cjs');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'yuanxiao-reply-pages-')),folder=path.join(base,'data'),key=crypto.randomBytes(32),now=Date.parse('2026-10-30T00:00:00Z');
const options={...cipher(key,'reply-page-fixture'),now:()=>now,getAccount:id=>{assert([account,other].includes(id));return{id,platform:'douyin',name:'synthetic'};}};
let store;try{
 store=new InteractionStore(folder,options);
 store.saveRule({name:'synthetic',platform:'all',accountIds:[],channel:'all',match:'contains',keywords:['fixture'],replyText:'fixture response',enabled:true,priority:0,cooldownMinutes:30,delaySeconds:0});
 store.setMode({accountId:account,channel:'dm',mode:'review'});
 store.ingest({accountId:account,channel:'dm',externalId:'seed',threadId:'seed',senderId:'fixture-peer',senderName:'synthetic',text:'fixture',receivedAt:new Date(now).toISOString(),isOwn:false,isGroup:false,historical:false});
 const state=store._read(),message=state.messages[0],reply=state.replies[0];assert(reply);checks++;
 state.messages=[];state.replies=[];state.dmSenders=[];
 for(let i=0;i<651;i++){const id=crypto.randomUUID(),accountId=i%2?account:other;state.messages.push({...message,id,accountId,externalId:'fixture-'+i,threadId:'thread-'+(i%20)});state.replies.push({...reply,id:crypto.randomUUID(),messageId:id,accountId,status:i%3?'pending':'cancelled'});}
 store._write(state);const before=fs.readFileSync(store.filePath),stamp=fs.statSync(store.filePath).mtimeMs;
 const ids=[];for(let offset=0;offset<700;offset+=100){const view=store.snapshotForDisplay({offset,limit:100});ids.push(...view.replies.map(r=>r.id));assert(view.replies.length<=100);assert(view.replySources.length<=100);assert(view.messages.length<=40);checks+=3;}
 assert.deepEqual(ids,state.replies.map(r=>r.id));checks++;
 const view=store.snapshotForDisplay({offset:600,limit:100});view.replies[0].replyText='changed';view.replySources[0].text='changed';view.replyPage.offset=0;
 assert.equal(store.snapshotForDisplay({offset:600}).replies[0].replyText,'fixture response');assert.equal(store.snapshotForDisplay({offset:600}).replySources[0].text,'fixture');checks+=2;
 assert.throws(()=>store.snapshotForDisplay({accountId:crypto.randomUUID()}));checks++;
 assert.deepEqual(fs.readFileSync(store.filePath),before);assert.equal(fs.statSync(store.filePath).mtimeMs,stamp);assert(!before.includes(Buffer.from('fixture response')));checks+=3;
 store=new InteractionStore(folder,options);assert.deepEqual(store.snapshotForDisplay({offset:600}).replies.map(r=>r.id),ids.slice(600));checks++;
}finally{key.fill(0);assert.equal(path.dirname(fs.realpathSync(base)),fs.realpathSync(os.tmpdir()));assert(path.basename(base).startsWith('yuanxiao-reply-pages-'));if(store&&fs.existsSync(store.filePath))fs.unlinkSync(store.filePath);if(fs.existsSync(folder))fs.rmdirSync(folder);fs.rmdirSync(base);}
console.log(JSON.stringify({replyPagingChecks:checks,syntheticReplies:651,allPagesReachable:true,encryptedRestart:true,queriesDoNotWrite:true,returnedValuesDetached:true,sourceMessagesSeparateFromLatestThreads:true,platformWrites:0}));
