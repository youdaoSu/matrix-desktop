// Offline scheduler/IPC fixtures only; no installed profile or platform traffic.
const assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
const root=process.env.MATRIX_QA_SOURCE_ROOT||path.resolve(__dirname,'..');
let api;
if(process.env.MATRIX_QA_SOURCE_ROOT){const file=path.join(root,'desktop/douyin-interactions.cjs'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(require('node:fs').readFileSync(path.resolve(__dirname,'../desktop/douyin-interactions.cjs'),'utf8'),file);api=m.exports;}
else api=require('../desktop/douyin-interactions.cjs');
const {initial,readPage,interactionFailure}=api;let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const own='100',workId='300',cid='qa.legacy/root+reference==';
const rootRow={platformId:cid,platformUserId:'200',referenceKind:'legacy',workId,content:'QA root',author:'QA',replyCount:3,pageCursor:'40'};
const raw=(id,parent=false)=>({cid:id,aweme_id:workId,text:'QA',user:{uid:'200',nickname:'QA'},...(parent?{referenceKind:'legacy',reply_comment_total:3}:{})});
const base=()=>({...initial('comments'),pages:8,workCursor:'75',workEnded:false,inventoryAt:0,headAt:0,seenWorks:[workId],headWorks:[{id:workId,title:'QA work',ownerUid:own}],works:[{id:workId,title:'QA work',cursor:'60',rootDone:false,seenRoots:[cid],replies:[{id:cid,cursor:'20',loaded:1,expected:3},{id:'999',cursor:'10',loaded:1,expected:2}]}]});
(async()=>{
 let calls=[],failure;const client={ownUid:own,source:'https://creator.douyin.com/',readInventoryHead:async()=>{calls.push('inventory');throw Error('Script failed to execute, this normally means an error was thrown.');},readLatest:async()=>{calls.push('head');throw Error('Should not inspect head');},readWeb:async(kind,args)=>{calls.push({kind,...args});if(failure)throw failure;return {comments:[raw('401'),raw('402')],has_more:false,cursor:'0',total:3};}};
 const opts={previewFirst:true,now:()=>100000,priorityWorkId:workId,priorityCommentId:cid,findRecord:(id,w)=>id===cid&&w===workId?rootRow:undefined};
 let state=base(),before=structuredClone(state),result=await readPage(client,state,opts);
 eq(state,before);eq(calls,[{kind:'replies',workId,cursor:'20',commentId:cid}]);eq(result.next.workCursor,'75');eq(result.next.works[0].cursor,'60');eq(result.next.works[0].replies,[{id:'999',cursor:'10',loaded:1,expected:2}]);eq(result.records.at(-1).repliesReadState,'complete');eq(result.records[0].parentPlatformId,cid);eq(result.next.replyPages,1);eq(result.next.rootPages,0);
 // A new request reuses an already-running reply cursor, even while catalog
 // checks are due. Another root, work or account cannot be substituted.
 for(const row of [undefined,{...rootRow,workId:'301'},{...rootRow,parentPlatformId:'499'}]){calls=[];await assert.rejects(()=>readPage(client,base(),{...opts,findRecord:()=>row}),/缓存核验/);checks++;eq(calls,[]);}
 calls=[];state=base();state.works=[];state.headWorks=[];state.inventoryAt=100000;failure=Error('HTTP 403');await assert.rejects(()=>readPage(client,state,opts),/HTTP 403/);checks++;eq(calls.every(call=>call.kind==='works'),true);
 // A cache-only root is re-proven on its original normal root page first;
 // the history cursor is never rewound, nor is that GET an end proof.
 calls=[];failure=undefined;state=base();state.works[0].replies=[];state.works[0].seenRoots=[];client.readWeb=async(kind,args)=>{calls.push({kind,...args});return {comments:[raw(cid,true)],has_more:true,cursor:'60'};};
 result=await readPage(client,state,opts);eq(calls,[{kind:'comments',workId,cursor:'40'}]);eq(result.next.works[0].cursor,'60');eq(result.next.works[0].replies[0].cursor,'0');eq(result.next.replyPages,0);eq(result.complete,false);eq(result.records[0].platformId,cid);
 client.readWeb=async(kind,args)=>{calls.push({kind,...args});return {comments:[raw('403')],has_more:false,cursor:'0',total:3};};calls=[];result=await readPage(client,result.next,opts);eq(calls,[{kind:'replies',workId,cursor:'0',commentId:cid}]);eq(result.records.at(-1).repliesReadState,'partial');
 // Refusal/network/identity failures still stop at the exact same cursor.
 calls=[];state=base();state.works[0].replies=[];result=await readPage(client,state,{...opts,findRecord:()=>({...rootRow,repliesReadState:'complete'})});eq(calls,[]);eq(result.records[0].repliesReadState,'complete');eq(result.next.works[0].cursor,'60');
 state=base();state.works=[];state.workEnded=true;result=await readPage(client,state,{...opts,findRecord:()=>({...rootRow,repliesReadState:'complete'})});eq(result.complete,true);eq(result.monitoring,true);eq(result.next.monitoringStarted,true);eq(result.pollAfterMs>=4500,true);eq(calls,[]);
 for(const error of [Error('HTTP 403'),Error('HTTP 429'),Error('平台码 5'),Error('官网本人编号不一致'),Error('Network failed')]){calls=[];client.readWeb=async(kind,args)=>{calls.push({kind,...args});throw error;};state=base();before=structuredClone(state);await assert.rejects(()=>readPage(client,state,opts),value=>value===error);checks++;eq(state,before);eq(calls.length,1);eq(calls[0].kind,'replies');}
 // Fixed classifier never returns arbitrary English exception payload/URLs.
 calls=[];state=base();state.pages=10000;await assert.rejects(()=>readPage(client,state,opts),/10000页/);checks++;eq(calls,[]);
 const safe=interactionFailure(Error('Script failed to execute PRIVATE_SECRET https://secret.invalid'),'作品更新检查');eq(safe.includes('官网页面脚本执行未完成'),true);eq(safe.includes('PRIVATE_SECRET'),false);eq(safe.includes('secret.invalid'),false);
 console.log(JSON.stringify({replyPriorityChecks:checks,exactRootCursorPreserved:true,inventoryDoesNotBlockExplicitReplyReads:true,cacheRequiresCurrentRootProof:true,refusalsNeverRetriedOrBypassed:true,realPlatformRequests:0,realUserProfileTouched:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
