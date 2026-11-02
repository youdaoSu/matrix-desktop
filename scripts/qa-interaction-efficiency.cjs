// Read-only/pure statistical semantics. No database or services are started.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {localInteractionEfficiency:calculate}=require('./qa-load-typescript.cjs').loadTs('shared/interaction-efficiency.ts');
let checks=0;
for(const messageUnread of [0,1,50,100]){
  const result=calculate({messageTotal:100,messageUnread,commentTotal:10,commentReplied:3});
  assert.equal(result.messageReplyRate,null);assert.equal(result.avgReplyTimeMinutes,null);assert.equal(result.commentReplyRate,30);assert.equal(result.scope,'local-synced-records');checks+=4;
}
const empty=calculate({messageTotal:0,messageUnread:0,commentTotal:0,commentReplied:0});
assert.equal(empty.messageReplyRate,null);assert.equal(empty.commentReplyRate,null);assert.equal(empty.observed.messages,0);assert.match(empty.unavailableReasons.commentReplyRate,/尚无/);checks+=4;
for(const [commentTotal,commentReplied] of [[2,3],[-1,0],[NaN,1],[1,Infinity],[1.5,1]]){
  const result=calculate({messageTotal:0,messageUnread:2,commentTotal,commentReplied});
  assert.equal(result.commentReplyRate,null);assert.equal(result.observed.unreadInboundMessages,null);checks+=2;
}
assert.equal(calculate({messageTotal:3,messageUnread:0,commentTotal:3,commentReplied:1}).commentReplyRate,33.3);checks++;
const service=fs.readFileSync('server/modules/analytics/analytics.service.ts','utf8');
assert.match(service,/return localInteractionEfficiency\(\{ messageTotal,messageUnread,commentTotal,commentReplied \}\)/);assert.ok(!service.includes('messageTotal * 0.4'));checks+=2;
console.log(JSON.stringify({honestInteractionEfficiencyChecks:checks,inventedReplyRateOrDuration:false,unreadIsNotUnreplied:true,servicesStarted:false,realPlatformActions:false}));
