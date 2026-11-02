// Exact ordering, safe diagnostics and avatar variants; synthetic data only.
const assert=require('node:assert/strict'),{loadTs}=require('./qa-load-typescript.cjs');
const {newestInteractionsFirst}=loadTs('shared/interaction-order.ts');
const {interactionFailure,person,comment}=require('../desktop/douyin-interactions.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const rows=[{id:'a-old',displayTime:'2025-12-29T00:00:00Z'},{id:'b-new',displayTime:'2026-10-23T00:00:00Z'},{id:'a-new',displayTime:'2026-10-22T00:00:00Z'},{id:'unknown'},{id:'bad',displayTime:'not a time'},{id:'b-same',displayTime:'2026-10-22T00:00:00Z'}],before=structuredClone(rows);
eq(newestInteractionsFirst(rows).map(r=>r.id),['b-new','a-new','b-same','a-old','unknown','bad']);eq(rows,before);
eq(newestInteractionsFirst([{id:'a',displayTime:'2026-10-23T08:00:00+08:00'},{id:'b',displayTime:'2026-10-23T00:01:00Z'}]).map(r=>r.id),['b','a']);
const project=stamp=>comment({cid:'201',aweme_id:'301',user:{uid:'401',nickname:'QA'},text:'QA',create_time:stamp},{id:'301',title:'QA'});
eq(project(1792713600).displayTime,project('1792713600000').displayTime);eq(newestInteractionsFirst([{id:'old',...project(1792713600)},{id:'new',...project(1792713660000)}]).map(row=>row.id),['new','old']);for(const stamp of [0,-1,1.2,'not-a-date',9999999999,4102444800000])eq(project(stamp).displayTime,undefined);
for(const avatar of [{avatar_thumb:{url_list:'https://p1.byteimg.com/one'}},{avatar:{url:'https://p1.byteimg.com/one'}},{avatar_168x168:{url_list:['https://p1.byteimg.com/one']}},{avatar_300x300:{src:'https://p1.byteimg.com/one'}}])eq(person({uid:'201',nickname:'QA',...avatar}).avatarUrl,'https://p1.byteimg.com/one');
const long='作品目录：等待正常分页响应；'+ '已有记录保留；'.repeat(60);eq(interactionFailure(Error(long),'作品目录分页').startsWith('作品目录：等待正常分页响应'),true);eq(interactionFailure(Error(long),'作品目录分页').length<=231,true);
for(const secret of ['cookie=PRIVATE','token=PRIVATE','https://private.invalid','C:\\private\\secret']){const output=interactionFailure(new TypeError('读取失败 '+secret),'作品评论分页');eq(output.includes('PRIVATE')||output.includes('private'),false);eq(output.includes('阶段：作品评论分页'),true);eq(output.includes('TypeError'),true);}
eq(interactionFailure(Object.assign(Error('internal'),{code:'ENOSPC'}),'保存互动缓存').includes('unknown/ENOSPC'),true);
console.log(JSON.stringify({aggregateOrderChecks:checks,crossAccountGlobalNewestFirst:true,unknownTimeLastStable:true,safeLongDiagnosticsPreserved:true,avatarVariants:true,realPlatformRequests:0,realUserDataTouched:false}));
