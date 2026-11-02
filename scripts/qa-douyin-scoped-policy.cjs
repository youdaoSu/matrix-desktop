// Pure session/window policies only; no user profiles, browser or network.
const assert=require('node:assert/strict');
const {registerScopedRequestPolicy:register}=require('../desktop/douyin-scoped-request-policy.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
function source(){let beforeSets=0,completedSets=0;return{webRequest:{onBeforeRequest(fn){this.before=fn;beforeSets++;},onCompleted(fn){this.completed=fn;completedSets++;},onErrorOccurred(fn){this.failed=fn;}},counts:()=>[beforeSets,completedSets]};}
const a=source(),b=source(),hits=[];
const failures=[];
const one=register(a,1,{blocks:d=>d.method==='POST',completed:d=>hits.push(['one',d.statusCode]),failed:d=>failures.push(d.error)});
const two=register(a,2,{blocks:d=>d.url.includes('mark_read'),completed:d=>hits.push(['two',d.statusCode])});
const third=register(b,1,{blocks:()=>true});eq(a.counts(),[1,1]);eq(b.counts(),[1,1]);
const canceled=(session,id,method='GET',url='https://www.douyin.com/user/self')=>{let result;session.webRequest.before({webContentsId:id,method,url},value=>result=value.cancel);return result;};
eq(canceled(a,1,'POST'),true);eq(canceled(a,1),false);eq(canceled(a,2,'GET','https://www.douyin.com/mark_read'),true);eq(canceled(a,2),false);
eq(canceled(a,99,'POST','https://www.douyin.com/mark_read'),false);eq(canceled(b,1),true);
a.webRequest.completed({webContentsId:1,statusCode:200});a.webRequest.completed({webContentsId:2,statusCode:403});a.webRequest.completed({webContentsId:99,statusCode:500});eq(hits,[['one',200],['two',403]]);
a.webRequest.failed({webContentsId:1,error:'net::ERR_TIMED_OUT'});a.webRequest.failed({webContentsId:99,error:'PRIVATE_UNRELATED'});eq(failures,['net::ERR_TIMED_OUT']);
assert.throws(()=>register(a,1,{blocks:()=>false}),/已注册/);checks++;
one();one();eq(a.counts(),[1,1]);eq(canceled(a,2,'GET','https://www.douyin.com/mark_read'),true);eq(canceled(a,1,'POST'),false);eq(canceled(b,1),true);
const throwing=register(a,3,{blocks(){throw Error('fixture');}});eq(canceled(a,3),true);throwing();two();eq(a.webRequest.before,null);eq(a.webRequest.completed,null);eq(a.counts(),[2,2]);third();eq(b.webRequest.before,null);
const observations=[];const again=register(a,4,{blocks:()=>true,observe(d,phase,cancel){observations.push([phase,cancel]);throw Error('QA observer must not change policy');}});eq(canceled(a,4),true);a.webRequest.completed({webContentsId:4});a.webRequest.failed({webContentsId:4});eq(observations,[['start',true],['end',undefined],['failed',undefined]]);again();
eq(a.webRequest.failed,null);eq(b.webRequest.failed,null);
console.log(JSON.stringify({scopedRequestPolicyChecks:checks,oneDispatcherPerSession:true,siblingReaderPoliciesNotOverwritten:true,ordinaryForegroundTabsUnaffected:true,accountBoundaryPreserved:true,guardExceptionFailsClosed:true,realPlatformRequests:0,realUserProfileTouched:false}));
