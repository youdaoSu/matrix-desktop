// Synthetic equivalence and local performance check, no account data read.
const assert=require('node:assert/strict'),{performance}=require('node:perf_hooks'),{loadTs}=require('./qa-load-typescript.cjs');
const {indexAccountsByGroup}=loadTs('client/src/components/workspace/account-group-index.ts');let checks=0;
const groups=Array.from({length:100},(_,i)=>({id:'g'+i,groupName:i===99?'':'group'+(i%97),isDefault:i===0}));
const accounts=Array.from({length:10000},(_,i)=>({id:'a'+i,groupId:i%3===0?'g'+(i%100):undefined,groupName:i%7===0?undefined:i%13===0?'': 'group'+(i%97)}));
const matches=(a,g)=>a.groupId?a.groupId===g.id:a.groupName===g.groupName||(g.isDefault&&!a.groupName);
let at=performance.now();const baseline=groups.map(g=>accounts.filter(a=>matches(a,g)).map(a=>a.id));const baselineMs=performance.now()-at;
at=performance.now();const indexed=indexAccountsByGroup(accounts,groups);const indexMs=performance.now()-at;
for(let i=0;i<groups.length;i++){assert.deepEqual(indexed.get(groups[i].id).map(a=>a.id),baseline[i]);checks++;}
assert.deepEqual([...indexAccountsByGroup([],groups).values()].flat(),[]);checks++;
console.log(JSON.stringify({groupIndexChecks:checks,accounts:accounts.length,groups:groups.length,baselineMs:+baselineMs.toFixed(2),indexedMs:+indexMs.toFixed(2),identicalOrdering:true,syntheticOnly:true,realRequests:0}));
