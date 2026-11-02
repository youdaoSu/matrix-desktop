// Synthetic business records only. Verify the old projection exactly and
// report timings separately from production or live-account performance.
const assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const {projectInteractionSnapshot}=require('../desktop/vendor/hengyuan-interactions/src/snapshot-projection.cjs');
function reference(state){
  const counts={sent:0,pending:0,queued:0,unknown:0,failed:0};
  for(const r of state.replies)if(Object.hasOwn(counts,r.status))counts[r.status]++;
  const latest=new Map();for(const m of [...state.messages].sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt))){const k=m.accountId+'/'+m.threadId;if(!latest.has(k))latest.set(k,m);}
  const replies=state.replies.slice(0,300),needed=new Set(replies.map(r=>r.messageId)),messages=[...latest.values()].slice(0,300);
  const included=new Set(messages.map(m=>m.id));for(const m of state.messages)if(needed.has(m.id)&&!included.has(m.id))messages.push(m);
  return {...state,messages,replies,counts,totalMessages:state.messages.length,totalReplies:state.replies.length};
}
const make=(count,threads)=>({rules:[{id:'rule'}],settings:{sample:true},messages:Array.from({length:count},(_,i)=>({id:'m'+i,accountId:'a'+(i%3),threadId:'thread'+(i%threads),receivedAt:new Date(1700000000000+((i*347)%97)*1000).toISOString(),text:'synthetic'})),replies:Array.from({length:Math.min(450,count)},(_,i)=>({id:'r'+i,messageId:'m'+((i*29)%count),status:['sent','pending','queued','unknown','failed','cancelled'][i%6]}))});
let checks=0;
for(const [size,threads] of [[0,1],[7,2],[1500,420],[25000,300],[25000,25000]]){
  const state=make(size,threads),original=structuredClone(state),expected=reference(state),actual=projectInteractionSnapshot(state);
  assert.deepEqual(actual,expected);assert.deepEqual(state,original);checks+=2;
  assert.equal(actual.totalMessages,size);assert.equal(actual.totalReplies,Math.min(450,size));checks+=2;
}
// Deliberately shuffled timestamps and ties across threads exercise the
// original stable-sort contract, not just a pre-sorted timeline.
for(let seed=1;seed<=25;seed++){
  const state=make(500,51);for(let i=state.messages.length-1;i>0;i--){const j=(i*seed*97+seed)% (i+1);[state.messages[i],state.messages[j]]=[state.messages[j],state.messages[i]];}
  assert.deepEqual(projectInteractionSnapshot(state),reference(state));checks++;
}
const sample=make(25000,300),measure=fn=>{const results=[];for(let i=0;i<10;i++){const start=performance.now();fn(sample);results.push(performance.now()-start);}return Math.round(results.sort((a,b)=>a-b)[5]*100)/100;};
measure(reference);measure(projectInteractionSnapshot);
const oldMedianMs=measure(reference),newMedianMs=measure(projectInteractionSnapshot);
console.log(JSON.stringify({projectionChecks:checks,syntheticMessages:25000,syntheticThreads:300,oldMedianMs,newMedianMs,stableOrderAndReplyReferencesPreserved:true,userOrPlatformDataTouched:false,realAppPerformanceMeasured:false}));
