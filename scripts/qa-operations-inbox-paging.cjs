'use strict';
const assert=require('node:assert/strict');
const {projectInteractionSnapshot}=require('../desktop/vendor/hengyuan-interactions/src/snapshot-projection.cjs');
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const at=i=>new Date(1700000000000+i*1000).toISOString();
const message=(i,channel='dm')=>({id:channel+i,accountId:i%2?a:b,channel,threadId:String(i),receivedAt:at(i),isOwn:false,isGroup:false,text:'synthetic '+i});
const state={rules:[],settings:{},replies:[],messages:[message(0),...Array.from({length:301},(_,i)=>message(i+1,'comment'))]};let checks=0;
let view=projectInteractionSnapshot(state,{limit:100},{limit:100});
assert.equal(view.inboxMessages?.length,1);checks++;
const collision=projectInteractionSnapshot({...state,messages:[message(0),{...message(0,'comment'),receivedAt:at(999)}]},{limit:100},{limit:100});assert.equal(collision.messages.length,2);assert.equal(collision.inboxMessages.length,1);checks+=2;
state.messages=Array.from({length:651},(_,i)=>message(i));
state.messages.push({...message(0),id:'own',isOwn:true,receivedAt:at(9999)},{...message(1),id:'group',isGroup:true,receivedAt:at(9999)},...Array.from({length:400},(_,i)=>message(i+1000,'comment')));
const original=structuredClone(state),all=[];
for(let offset=0;offset<700;offset+=100){view=projectInteractionSnapshot(state,{limit:100},{offset,limit:100});assert.equal(view.inboxPage.offset,offset);assert.equal(view.inboxPage.matchingConversations,651);assert.equal(view.inboxPage.totalConversations,651);assert(view.inboxMessages.every(m=>m.channel==='dm'&&!m.isOwn&&!m.isGroup));assert(view.inboxMessages.length<=100);all.push(...view.inboxMessages.map(m=>m.id));checks+=5;}
assert.deepEqual(all,Array.from({length:651},(_,i)=>'dm'+(650-i)));checks++;
for(const accountId of ['',a,b]){const expected=original.messages.filter(m=>m.channel==='dm'&&!m.isOwn&&!m.isGroup&&(!accountId||m.accountId===accountId)).sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt));view=projectInteractionSnapshot(state,{limit:100},{accountId,offset:50000,limit:37});const offset=Math.floor((expected.length-1)/37)*37;assert.equal(view.inboxPage.offset,offset);assert.equal(view.inboxPage.matchingConversations,expected.length);assert.deepEqual(view.inboxMessages,expected.slice(offset,offset+37));checks+=3;}
view=projectInteractionSnapshot({...state,messages:[]},undefined,{offset:500});assert.equal(view.inboxPage.offset,0);assert.equal(view.inboxPage.matchingConversations,0);checks+=2;
const repeated={...state,messages:[message(0),{...message(0),id:'new',receivedAt:at(2)},{...message(0),id:'tie',receivedAt:at(2)},message(2)]};view=projectInteractionSnapshot(repeated,undefined,{});assert.deepEqual(view.inboxMessages.map(m=>m.id),['new','dm2']);checks++;
for(const input of [null,[],1,{offset:-1},{offset:50001},{offset:1.5},{limit:0},{limit:301},{limit:'1'},{accountId:'bad'},{accountId:1},{channel:'comment'},{unknown:true}]){assert.throws(()=>projectInteractionSnapshot(state,undefined,input));checks++;}
assert.deepEqual(state,original);checks++;
assert.equal(projectInteractionSnapshot(state).inboxPage,undefined);checks++;
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {InteractionStore}=require('../desktop/vendor/hengyuan-interactions/src/interaction-store.cjs'),{cipher}=require('../desktop/account-operations-crypto.cjs');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'yuanxiao-inbox-pages-')),folder=path.join(base,'data'),key=crypto.randomBytes(32),options={...cipher(key,'inbox-fixture'),getAccount:id=>{assert([a,b].includes(id));return{id,platform:'douyin',name:'synthetic'};}};let store;
try{
 store=new InteractionStore(folder,options);const full=store._read();
 full.messages=state.messages.map(m=>({...m,id:crypto.randomUUID(),externalId:m.id,platform:'douyin',senderId:'synthetic-'+m.id,senderName:'synthetic',historical:true,createdAt:m.receivedAt}));store._write(full);
 const before=fs.readFileSync(store.filePath),stamp=fs.statSync(store.filePath).mtimeMs,seen=[];
 for(let offset=0;offset<700;offset+=100){const page=store.snapshotForDisplay({limit:100},{offset,limit:100});assert(page.inboxMessages.length<=100);assert.equal(page.inboxPage.matchingConversations,651);assert(page.inboxMessages.every(m=>m.channel==='dm'&&!m.isOwn&&!m.isGroup));seen.push(...page.inboxMessages.map(m=>m.externalId));checks+=3;}
 assert.deepEqual(seen,all);checks++;
 const page=store.snapshotForDisplay(undefined,{offset:600});page.inboxMessages[0].text='mutated';page.inboxPage.offset=0;assert.notEqual(store.snapshotForDisplay(undefined,{offset:600}).inboxMessages[0].text,'mutated');checks++;
 assert.throws(()=>store.snapshotForDisplay(undefined,{accountId:crypto.randomUUID()}));assert.deepEqual(fs.readFileSync(store.filePath),before);assert.equal(fs.statSync(store.filePath).mtimeMs,stamp);assert(!before.includes(Buffer.from('synthetic')));checks+=4;
 store=new InteractionStore(folder,options);assert.deepEqual(store.snapshotForDisplay(undefined,{offset:600}).inboxMessages.map(m=>m.externalId),all.slice(600));checks++;
}finally{key.fill(0);assert.equal(path.dirname(fs.realpathSync(base)),fs.realpathSync(os.tmpdir()));assert(path.basename(base).startsWith('yuanxiao-inbox-pages-'));if(store&&fs.existsSync(store.filePath))fs.unlinkSync(store.filePath);if(fs.existsSync(folder))fs.rmdirSync(folder);fs.rmdirSync(base);}
console.log(JSON.stringify({inboxPagingChecks:checks,syntheticConversations:651,commentCrowdingPrevented:true,channelCollisionPrevented:true,encryptedRestart:true,queriesDoNotWrite:true,platformWrites:0}));
