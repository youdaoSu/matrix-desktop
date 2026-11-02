// Synthetic-only regression for history evidence and indexed lookups; no files or sends.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {FanFollowupStore}=require('../desktop/vendor/hengyuan-interactions/src/fan-followup.cjs');
const account=randomUUID(),primary=randomUUID(),id=randomUUID(),messageId=randomUUID();
const base={id,accountId:account,primaryAccountId:primary,platform:'douyin',channel:'dm',sourceChannel:'dm',sourceMessageId:messageId,recipientId:'MS4wFan_1',profileUrl:'https://www.douyin.com/user/MS4wFan_1',status:'review'};
const attempt={id,accountId:account,primaryAccountId:primary,platform:'douyin',channel:'dm',sourceMessageId:messageId,recipientId:'MS4wFan_1',claimedAt:'2026-10-27T00:00:00.000Z'};
const message={id:messageId,accountId:primary,platform:'douyin',channel:'dm',senderId:'MS4wFan_1',isOwn:false,isGroup:false,profileUrl:base.profileUrl};
const state={records:[]};let checks=0;
function project(tasks,attempts,messages=[message],options={}){return FanFollowupStore.prototype.project.call({},state,{studio:{accounts:[],outreach:tasks},interaction:{messages,replies:[],externalAttempts:attempts}},options);}
function status(result,value){assert.equal(result.records[0]?.status,value);checks++;}
status(project([base],[]),'pending');
status(project([base],[attempt]),'attention');
status(project([base],[{...attempt,recipientId:'other'}]),'pending');
status(project([{...base,status:'failed',failure:{outcome:'not-sent'}}],[attempt,attempt]),'attention');
status(project([{...base,status:'failed',failure:{outcome:'not-sent'}},{...base,status:'failed',failure:{outcome:'not-sent'}}],[attempt]),'attention');
status(project([{...base,status:'unknown'}],[]),'attention');
assert.equal(project([base],[attempt],[message,message]).records[0].status,'attention');checks++;
assert.equal(project([base],[attempt],[message],{excludeTaskId:id}).records.length,0);checks++;
const many=Array.from({length:5000},(_,i)=>({...base,id:randomUUID(),recipientId:'MS4wFan_'+i,profileUrl:'https://www.douyin.com/user/MS4wFan_'+i}));
const records=project(many,Array.from({length:5000},()=>({...attempt,id:randomUUID()})));assert.equal(records.records.length,5000);checks++;assert(records.records.every(record=>record.status==='pending'));checks++;
console.log(JSON.stringify({fanFollowupProjectionChecks:checks,duplicateAndUncertainEvidenceRetained:true,syntheticOnly:true,platformActions:0}));
