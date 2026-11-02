// Deterministic pager fixtures: no browser, network or platform writes.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {KeywordCommentMonitor}=require('../desktop/account-operations-comment-monitor.cjs');
let checks=0;const eq=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
function fixture(){
 let now=Date.now(),paused=false,live=true,plans=[{accountId:randomUUID(),generation:'a'.repeat(64),workIds:['123','456']}],reads=[],reports=[],next=()=>({nextCursor:randomUUID()}),allow=true;
 const monitor=new KeywordCommentMonitor({now:()=>now,paused:()=>paused,alive:()=>live,plans:async()=>plans,read:async input=>{reads.push(input);return{accountId:input.accountId,kind:'comments',capturedAt:new Date(now).toISOString(),...await next(input)};},report:async result=>{reports.push(result);return allow;}});
 return{monitor,reads,reports,get plans(){return plans;},set plans(value){plans=value;},set paused(value){paused=value;},set live(value){live=value;},set next(value){next=value;},set allow(value){allow=value;},advance:()=>{now+=15001;},tick:()=>monitor.tick()};
}
(async()=>{
 const {ReplyCommentPlans}=require('../desktop/account-operations-comment-monitor.cjs');
 let control={rules:[{id:'r',revision:1,enabled:true,platform:'douyin',channel:'comment',trigger:'message',accountIds:[]}],modes:[]},keywordPlans=[],keywordReports=[];
 const accounts=new Map([['account',{id:'account',platform:'douyin',binding:'first-binding'}]]);
 const coordinator=new ReplyCommentPlans({accounts,store:{monitoringSettings:()=>structuredClone(control),snapshot:()=>{throw Error('Must not copy message history');},setMode:m=>{control.modes=[{...m,updatedAt:'2026-10-31T00:00:01Z'}];}},keywords:{monitorPlan:()=>keywordPlans,monitorResult:r=>keywordReports.push(r)}});
 eq(coordinator.plans(),[]);control.modes=[{accountId:'account',channel:'comment',mode:'auto',updatedAt:'2026-10-31T00:00:00Z'}];
 const original=coordinator.plans()[0];eq(original.workIds,[]);eq(original.ordinary,true);
 keywordPlans=[{accountId:'account',generation:'a'.repeat(64),workIds:['123']}];const merged=coordinator.plans();eq(merged.length,1);eq(merged[0].workIds,[]);
 eq(coordinator.report({...original,status:'reading',at:new Date().toISOString()}),false);
 eq(coordinator.report({...merged[0],status:'ready',detail:'synthetic read',at:new Date().toISOString()}),true);eq(keywordReports[0].generation,'a'.repeat(64));eq(coordinator.snapshot()[0].status,'ready');
 control.rules[0].revision++;eq(coordinator.snapshot()[0].status,'waiting');eq(coordinator.report({...merged[0],status:'paused',at:new Date().toISOString()}),false);eq(control.modes[0].mode,'auto');
 const current=coordinator.plans()[0];eq(coordinator.report({...current,status:'paused',detail:'synthetic login failure',at:new Date().toISOString()}),true);eq(control.modes[0].mode,'off');eq(coordinator.snapshot()[0].status,'paused');
 eq(coordinator.plans()[0].generation,'a'.repeat(64));control.modes[0].mode='review';eq(coordinator.snapshot()[0].status,'waiting');
 keywordPlans=[];control.rules[0].enabled=false;eq(coordinator.plans(),[]);control.rules[0].enabled=true;control.rules[0].platform='xiaohongshu';eq(coordinator.plans(),[]);
 accounts.clear();eq(coordinator.plans(),[]);eq(coordinator.snapshot(),[]);
 const a=fixture(),one=randomUUID(),two=randomUUID();a.next=()=>({nextCursor:one});await a.tick();eq(a.reads.length,1);eq(a.reads[0].cursor,undefined);eq(a.reads[0].priorityWorkId,'123');eq(a.reports.at(-1).status,'ready');await a.tick();eq(a.reads.length,1);
 a.paused=true;a.advance();await a.tick();eq(a.reads.length,1);a.paused=false;a.next=()=>({nextCursor:two});await a.tick();eq(a.reads[1].cursor,one);eq(a.reads[1].priorityWorkId,'456');
 const plan=a.plans;a.plans=null;a.advance();await a.tick();eq(a.reads.length,2);a.plans=plan;a.advance();a.next=()=>({error:'抖音分页读取过于频繁，请稍后继续，已有结果保留'});await a.tick();eq(a.reads[2].cursor,two);eq(a.reports.at(-1).status,'waiting');
 a.advance();a.next=()=>({nextCursor:two});await a.tick();eq(a.reads[3].cursor,two);eq(a.reads[3].priorityWorkId,'123');
 a.allow=false;a.advance();await a.tick();eq(a.reads.length,4);a.allow=true;
 a.plans=[{...plan[0],generation:'b'.repeat(64)}];a.advance();await a.tick();eq(a.reads[4].cursor,undefined);
 a.advance();a.next=()=>({error:'合成官网身份核对失败'});await a.tick();eq(a.reports.at(-1).status,'paused');a.plans=[];a.advance();await a.tick();eq(a.reads.length,6);a.monitor.close();
 const rotation=fixture(),first=rotation.plans[0];rotation.plans=[first,{...first,accountId:randomUUID()}];await rotation.tick();rotation.advance();await rotation.tick();rotation.advance();await rotation.tick();eq(rotation.reads.map(r=>r.accountId),[first.accountId,rotation.plans[1].accountId,first.accountId]);eq(rotation.reads[2].cursor!==undefined,true);rotation.monitor.close();
 const intake=fixture();intake.next=()=>({nextCursor:one,automationIntake:{status:'complete'}});await intake.tick();intake.advance();intake.next=()=>({nextCursor:two,automationIntake:{status:'partial'}});await intake.tick();eq(intake.reports.at(-1).status,'paused');assert.match(intake.reports.at(-1).detail,/本地规则接收/);checks++;intake.advance();intake.next=()=>({nextCursor:two,automationIntake:{status:'complete'}});await intake.tick();eq(intake.reads[2].cursor,one);eq(intake.reads[2].priorityWorkId,'456');eq(intake.reports.at(-1).status,'ready');intake.monitor.close();
 const held=fixture();let release,entered;const started=new Promise(resolve=>{entered=resolve;});held.next=()=>new Promise(resolve=>{release=resolve;entered();});const run=held.tick();await started;held.advance();await held.tick();eq(held.reads.length,1);held.paused=true;release({nextCursor:one});await run;eq(held.reports.at(-1).status,'ready');held.paused=false;held.next=()=>({nextCursor:two});await held.tick();eq(held.reads.length,1);held.advance();await held.tick();eq(held.reads[1].cursor,one);held.monitor.close();
 for(const change of ['close','logout']){const f=fixture();let finish,enter;const began=new Promise(resolve=>{enter=resolve;});f.next=()=>new Promise(resolve=>{finish=resolve;enter();});const pending=f.tick();await began;if(change==='close')f.monitor.close();else f.live=false;finish({nextCursor:one});await pending;eq(f.reports.map(r=>r.status),['reading']);f.advance();await f.tick();eq(f.reads.length,1);f.monitor.close();}
 for(const bad of [{accountId:randomUUID()},{kind:'followers'},{nextCursor:'not-a-native-continuation'},{capturedAt:'invalid'}]){const f=fixture();f.next=()=>bad;await f.tick();eq(f.reports.at(-1).status,'paused');f.monitor.close();}
 for(const bad of [undefined,{},[null],[{accountId:'synthetic',generation:'bad',workIds:[]}]]){const f=fixture();f.plans=bad;await assert.rejects(()=>f.tick(),/范围/);checks++;eq(f.reads.length,0);f.monitor.close();}
 const duplicate=fixture();duplicate.plans=[duplicate.plans[0],duplicate.plans[0]];await assert.rejects(()=>duplicate.tick(),/重复/);checks++;duplicate.monitor.close();
 console.log(JSON.stringify({commentMonitorChecks:checks,singleFlight:true,temporaryYieldKeepsCursor:true,staleGenerationCannotRead:true,logoutAndCloseDiscardLateResults:true,unknownReadPauses:true,realPlatformActions:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});
