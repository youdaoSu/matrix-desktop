// Transport selection is per exact native scope; never authorization/fallback.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto'),{independentFollowerScope}=require('../desktop/douyin-interactions.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},scope=JSON.stringify(['qa-user','qa-account','qa-session','qa-handle']),at=Date.parse('2026-10-25T00:00:00Z'),event={at:new Date(at-1000).toISOString(),scope:createHash('sha256').update(scope).digest('hex').slice(0,24),kind:'followers',stage:'follower-avatar',code:'avatar-request-not-started'};
eq(independentFollowerScope(scope,[event],at),true);eq(independentFollowerScope(scope+'other',[event],at),false);
for(const code of ['http-denied','platform-denied','verification-required','binding-mismatch','avatar-owner-mismatch','avatar-peer-mismatch','transport','timeout','read-ok'])eq(independentFollowerScope(scope,[{...event,code}],at),false);
for(const patch of [{kind:'comments'},{stage:'follower-page'},{scope:'not-a-scope'},{at:'invalid'},{at:new Date(at+1).toISOString()},{at:new Date(at-86400001).toISOString()}])eq(independentFollowerScope(scope,[{...event,...patch}],at),false);
for(const events of [undefined,null,{},[],Array(257).fill(event)])eq(independentFollowerScope(scope,events,at),false);
eq(independentFollowerScope(scope,[event],Infinity),false);eq(independentFollowerScope('',[event],at),false);eq(independentFollowerScope('x'.repeat(1025),[event],at),false);
console.log(JSON.stringify({independentStrategyChecks:checks,exactNativeScopeOnly:true,recentPreHttpFailureRequired:true,normalAccountsKeepExistingTransport:true,refusalDoesNotSelectAnotherTransport:true,realRequests:0}));
