const assert=require('node:assert/strict');
const {ObservationQueue}=require('../desktop/account-operations-observation-queue.cjs');
(async()=>{
 let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},flush=()=>new Promise(r=>setImmediate(r));
 let release;const gate=new Promise(r=>release=r),errors=[];
 const q=new ObservationQueue({process:()=>gate,isCurrent:()=>true,onFailure:r=>errors.push(r)});
 const first=q.enqueueAndWait({id:1}),duplicate=q.enqueueAndWait({id:1});eq(first,duplicate);eq(q.pending,1);
 let finished=false;first.then(()=>finished=true);await flush();eq(finished,false);
 const controller=new AbortController(),cancelled=q.waitUntilIdle(controller.signal);controller.abort();eq(await cancelled,false);eq(await q.waitUntilIdle(controller.signal),false);
 const waiters=Array.from({length:8},()=>q.waitUntilIdle());eq(await q.waitUntilIdle(),false);eq(errors,['producer-capacity']);
 release();eq(await first,true);eq(await Promise.all(waiters),Array(8).fill(true));eq(q.pending,0);eq(await q.waitUntilIdle(),true);
 let stop;const held=new Promise(r=>stop=r),closed=new ObservationQueue({process:()=>held,isCurrent:()=>true});
 const one=closed.enqueueAndWait({id:1}),two=closed.enqueueAndWait({id:2});await flush();const idle=closed.waitUntilIdle();closed.close();
 eq(await Promise.all([one,two,idle]),[false,false,false]);eq(closed.pending,0);eq(closed.bufferedBytes,0);eq(await closed.enqueueAndWait({id:3}),false);stop();await closed.idle();
 let owner='a',resume;const pause=new Promise(r=>resume=r),changed=new ObservationQueue({process:()=>pause,isCurrent:v=>v.owner===owner});
 const stale=changed.enqueueAndWait({owner:'a'});await flush();owner='b';resume();eq(await stale,false);await changed.idle();
 const failed=new ObservationQueue({process:()=>{throw Error('synthetic')},isCurrent:()=>true});eq(await failed.enqueueAndWait({id:1}),false);eq(await failed.waitUntilIdle(),true);
 let latch;const tinyGate=new Promise(r=>latch=r),tiny=new ObservationQueue({maxItems:1,maxBytes:100,maxItemBytes:100,process:()=>tinyGate,isCurrent:()=>true});const admitted=tiny.enqueueAndWait({id:1});eq(await tiny.enqueueAndWait({id:2}),false);latch();eq(await admitted,true);
 const processed=[],many=new ObservationQueue({isCurrent:()=>true,process:v=>processed.push(v.id),processBatch:vs=>processed.push(...vs.map(v=>v.id)),batchable:()=>true});
 for(let start=0;start<600;start+=16){eq(await many.waitUntilIdle(),true);const end=Math.min(start+16,600),result=await Promise.all(Array.from({length:end-start},(_,i)=>many.enqueueAndWait({id:start+i})));eq(result.every(Boolean),true);assert(many.pending<=16);checks++;}
 eq(processed,Array.from({length:600},(_,i)=>i));eq(many.bufferedBytes,0);
 for(const queue of [q,closed,changed,failed,tiny,many])queue.close();
 console.log(JSON.stringify({passed:true,checks,actualCompletionNotAdmission:true,boundedWaiters:true,closeAndBindingChangeSettle:false===await q.waitUntilIdle(),realPlatformActions:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});
