const assert=require('node:assert/strict'),{createRendererHeartbeatRequester:create}=require('../desktop/renderer-heartbeat.cjs');
let at=0,checks=0,destroyed=false,throws=false;const calls=[],one={},two={},eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const request=create({getContents:()=>({isDestroyed:()=>destroyed,send:(...args)=>{if(throws)throw Error('Synthetic unavailable renderer');calls.push(args);}}),channel:'matrix:test-heartbeat',now:()=>at});
eq(request(one,'a'),true);eq(calls,[['matrix:test-heartbeat','a']]);eq(request(one,'a'),false);
at=14999;eq(request(one,'a'),false);at=15000;eq(request(one,'a'),true);eq(request(two,'b'),true);eq(calls.at(-1),['matrix:test-heartbeat','b']);
at=30000;destroyed=true;eq(request(one,'a'),false);destroyed=false;eq(request(one,'a'),false);
at=45000;throws=true;eq(request(one,'a'),false);throws=false;eq(request(one,'a'),false);
at=60000;eq(request(one,'a'),true);at=1;eq(request(one,'a'),true);
at=NaN;eq(request(one,'a'),false);at=75000;eq(request(null,'a'),false);eq(request(one,''),false);eq(request(one,'x'.repeat(129)),false);
const unavailable=create({getContents:()=>undefined,channel:'matrix:test'});eq(unavailable({},'a'),false);
const error=create({getContents:()=>{throw Error('Synthetic window closed');},channel:'matrix:test'});eq(error({},'a'),false);
for(const options of [{channel:'unsafe'},{intervalMs:0},{intervalMs:Infinity},{intervalMs:30001}]){assert.throws(()=>create({getContents:()=>undefined,channel:'matrix:test',...options}));checks++;}
console.log(JSON.stringify({passed:true,checks,requestsDoNotGrantAuthorization:true,perOwnerRateLimit:true,realPlatformActions:0}));
