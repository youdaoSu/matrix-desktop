// Synthetic snapshots only; verifies complete equality and reports local timing.
const assert=require('node:assert/strict'),{performance}=require('node:perf_hooks'),{loadTs}=require('./qa-load-typescript.cjs');
const {sameInboxSnapshot}=loadTs('client/src/components/workspace/inbox-snapshot.ts');let checks=0;
const eq=(a,b,want)=>{assert.equal(sameInboxSnapshot(a,b),want);checks++;};
const base={accountId:'a',sessionId:'s',status:{revision:7,unread:1,error:'',push:'connected',systemSchemas:['a']},threads:[{id:'1',name:'A',unread:1,lastMessage:'hello',lastAt:'2026-01-01',count:4}]};
eq(base,structuredClone(base),true);
for(const mutate of [x=>x.status.revision++,x=>x.status.unread++,x=>x.status.error='bad',x=>x.status.push='disconnected',x=>x.status.systemSchemas.push('b'),x=>x.threads[0].name='B',x=>x.threads[0].unread++,x=>x.threads[0].lastMessage='new',x=>x.threads[0].lastAt='2027',x=>x.threads[0].count++,x=>x.threads[0].futureField='new',x=>x.error='offline',x=>x.threads.push({id:'2'})]){const changed=structuredClone(base);mutate(changed);eq(base,changed,false);}
eq({x:undefined},{},false);eq([],new Array(1),false);eq(null,{},false);eq({x:0},{x:false},false);eq({a:1,b:2},{b:2,a:1},true);
const large={...base,threads:Array.from({length:10000},(_,i)=>({id:String(i),name:'合成会话'+i,unread:i%4,count:i,lastMessage:'synthetic',lastAt:'2026-01-01'}))},copy=structuredClone(large);let start=performance.now();for(let i=0;i<10;i++)eq(large,copy,true);const sameMs=performance.now()-start;copy.threads[9999].lastMessage='changed';start=performance.now();eq(large,copy,false);const changedMs=performance.now()-start;
console.log(JSON.stringify({inboxSnapshotChecks:checks,threads:10000,tenIdenticalComparisonsMs:+sameMs.toFixed(2),lateChangeComparisonMs:+changedMs.toFixed(2),syntheticOnly:true,realRequests:0}));
