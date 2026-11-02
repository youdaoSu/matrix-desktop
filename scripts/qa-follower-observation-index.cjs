// Synthetic equivalence of the observation projection; no account data or I/O.
const assert=require('node:assert/strict'),{performance}=require('node:perf_hooks'),{loadTs}=require('./qa-load-typescript.cjs');
const {projectFollowerObservations}=loadTs('client/src/pages/user/follower-observation-index.ts');
const now=Date.parse('2026-10-28T00:00:00.000Z'),accounts=[{id:'a',nickname:'账号A'},{id:'b',nickname:''}];
const values=[undefined,'invalid',new Date(now).toISOString(),new Date(now-86400000).toISOString(),new Date(now-86400001).toISOString(),new Date(now+1).toISOString(),'1970-01-01T00:00:00.000Z','1969-12-31T23:59:59.000Z'];
const entries=new Map(accounts.map((a,j)=>[a.id,Array.from({length:5000},(_,i)=>({platformId:`${j}-${i}`,author:i%2?'测试粉丝':'Alice',firstObservedAt:values[i%values.length],isCurrentFollower:[true,false,undefined][i%3]}))]));
const get=a=>entries.get(a.id)||[];
function reference(mode,search){const rows=accounts.flatMap(a=>get(a).map(row=>({...row,accountId:a.id,accountNickname:a.nickname||'未命名账号'})));const recent=x=>!!x&&Number.isFinite(Date.parse(x))&&Date.parse(x)<=now&&Date.parse(x)>=now-86400000;const current=rows.filter(x=>x.isCurrentFollower!==false).length,newlyObserved=rows.filter(x=>recent(x.firstObservedAt)).length;const filtered=rows.filter(x=>(mode!=='recent'||recent(x.firstObservedAt))&&(mode!=='historical'||x.isCurrentFollower===false)&&(x.author+'\n'+x.accountNickname).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).sort((a,b)=>(Date.parse(b.firstObservedAt||'')||0)-(Date.parse(a.firstObservedAt||'')||0));return{total:rows.length,current,newlyObserved,filtered};}
let checks=0;for(const mode of ['all','recent','historical'])for(const search of ['',' Alice ','账号A','不存在']){assert.deepEqual(projectFollowerObservations(accounts,get,mode,search,now),reference(mode,search));checks++;}
const t=performance.now(),old=reference('all',''),oldMs=performance.now()-t,u=performance.now(),fresh=projectFollowerObservations(accounts,get,'all','',now),newMs=performance.now()-u;assert.deepEqual(fresh,old);checks++;
assert.equal(get(accounts[0])[0].accountId,undefined);checks++;
console.log(JSON.stringify({observationProjectionChecks:checks,syntheticRecords:10000,oldMs:+oldMs.toFixed(2),newMs:+newMs.toFixed(2),stableTiesAndBoundaries:true,syntheticOnly:true}));
