'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const {CommentQueue}=require('../desktop/one-click-comment-queue.cjs');
const {singleSourceRef,resolveSingleSource}=require('../desktop/single-comment-source.cjs');
const workId='7777777777777777777',sourceRef={kind:'cached-work',accountId:'account',workId};
function fixture(options={}){
  let stored,clock=100000,writes=0,executions=0;
  const account={id:'account',platform:'douyin',nickname:'合成账号',connectorSessionId:'test-session',nativeAccountKey:'test-native'};
  const sender={id:'sender',platform:'douyin',nickname:'合成发送账号',connectorSessionId:'sender-session',nativeAccountKey:'sender-native'};
  const accounts=new Map([[account.id,account],[sender.id,sender]]);
  const source={platform:'douyin',account,workId,workUrl:'https://www.douyin.com/video/'+workId,title:'合成作品'};
  const q=new CommentQueue({account:async id=>{if(!accounts.has(id))throw Error('账号已解绑');return accounts.get(id);},source:async(_receipt,ref)=>{assert.deepEqual(ref,sourceRef);return source;},save:async value=>{writes++;stored=structuredClone(value);},execute:async args=>{await args.beforeCommit();executions++;return{status:'confirmed',commentId:'12345',message:'合成官方回执'};},now:()=>clock,sleep:async()=>{},...options});
  return{q,account,sender,accounts,source,get stored(){return stored;},get writes(){return writes;},get executions(){return executions;},tick:n=>clock+=n,preview:()=>q.previewSingle({source:sourceRef,senderAccountId:sender.id,text:'我想补充一点说明。'}),finish:async()=>{await q.active?.promise;}};
}
test('single preview does not dispatch, fixed owner/text and confirmed ID after one explicit start',async()=>{const f=fixture(),b=await f.preview();assert.equal(f.executions,0);assert.equal(b.rows.length,1);assert.equal(b.rows[0].accountId,'sender');assert.equal(b.primaryId,'account');assert.equal(b.rows[0].text,'我想补充一点说明。');assert(!JSON.stringify(b).includes('test-session'));assert.equal(f.q.singleBatch(b.id).mode,'single');await f.q.start(b.id);await f.finish();const s=await f.q.singleState(sourceRef);assert.equal(s.batches[0].rows[0].status,'sent');assert.equal(s.batches[0].rows[0].commentId,'12345');assert.equal(f.executions,1);});
test('single input rejects account arrays, random sets, excessive text and invalid source fields',async()=>{const f=fixture();for(const extra of [{accountIds:['a','b']},{setId:'set'}])await assert.rejects(f.q.previewSingle({source:sourceRef,text:'正文',...extra}));for(const text of ['', ' ', 'x'.repeat(501), '\0'])await assert.rejects(f.q.previewSingle({source:sourceRef,text}));for(const ref of [{...sourceRef,accountIds:['a']},{...sourceRef,workId:'javascript:1'},{...sourceRef,workId:'../file'},{kind:'other',accountId:'account'}])assert.throws(()=>singleSourceRef(ref));assert.equal(f.writes,0);});
test('parallel starts and subsequent previews retain durable once-only claim',async()=>{let release,ready;const wait=new Promise(r=>release=r),entered=new Promise(r=>ready=r);let sent=0;const f=fixture({execute:async a=>{await a.beforeCommit();sent++;ready();await wait;return{status:'confirmed',commentId:'once'};}}),b=await f.preview();await f.q.start(b.id);await entered;await assert.rejects(f.q.start(b.id));assert.equal(f.stored.batches[0].rows[0].status,'sending');release();await f.finish();const next=await f.preview();assert.equal(next.rows[0].status,'skipped');assert.equal(sent,1);});
test('unknown receipt and process restart never duplicate the same work/account',async()=>{const f=fixture({execute:async a=>{await a.beforeCommit();throw Error('断线');}}),b=await f.preview();await f.q.start(b.id);await f.finish();assert.equal(f.stored.batches[0].rows[0].status,'unknown');const resumed=fixture({state:f.stored});const duplicate=await resumed.preview();assert.equal(duplicate.rows[0].status,'skipped');assert.equal(resumed.executions,0);});
test('binding changed after preview prevents sending even with same nickname',async()=>{const f=fixture(),b=await f.preview();f.account.connectorSessionId='new-session';await assert.rejects(f.q.start(b.id),/绑定/);assert.equal(f.executions,0);});
test('source changed immediately before commit produces no external mutation',async()=>{let sent=0;const f=fixture({execute:async a=>{f.source.workId='8888888888888888888';await a.beforeCommit();sent++;}}),b=await f.preview();await f.q.start(b.id);await f.finish();assert.equal(sent,0);assert.equal(f.q.snapshot().batches[0].rows[0].status,'failed');});
test('failed durable start write stops execution and preserves old source',async()=>{let fail=false,sent=0;const f=fixture({save:async()=>{if(fail)throw Error('disk');},execute:async()=>{sent++;}}),b=await f.preview();fail=true;await assert.rejects(f.q.start(b.id),/保存失败/);assert.equal(sent,0);});
test('cancellation and expired preview cannot dispatch',async()=>{const f=fixture(),b=await f.preview();await f.q.cancel(b.id);await assert.rejects(f.q.start(b.id));const c=await f.preview();f.tick(600001);await assert.rejects(f.q.start(c.id),/过期/);assert.equal(f.executions,0);});
test('single-state excludes other works and legacy group batches; guards legacy start command',async()=>{const f=fixture(),b=await f.preview();f.q.state.batches.push({...structuredClone(f.q.state.batches[0]),id:'legacy',mode:undefined});assert.throws(()=>f.q.singleBatch('legacy'));assert.deepEqual((await f.q.singleState(sourceRef)).batches.map(b=>b.id),[b.id]);f.q.state.batches[0].workId='8888888888888888888';assert.equal((await f.q.singleState(sourceRef)).batches.length,0);});
test('cached source reads one exact bound-owner work, never accepts a renderer URL',async()=>{const f=fixture();let seen;const dependencies={account:async()=>f.account,owner:'owner',journal:{find(){throw Error('Unexpected journal read');}},getOwnWork:async input=>{seen=input;return{platformId:workId,title:'官方缓存标题'};}};const s=await resolveSingleSource(sourceRef,dependencies);assert.equal(seen.owner,'owner');assert.equal(seen.account,f.account);assert.equal(s.workUrl,'https://www.douyin.com/video/'+workId);assert.equal(s.title,'官方缓存标题');await assert.rejects(resolveSingleSource({...sourceRef,workUrl:'https://evil.test'},dependencies));await assert.rejects(resolveSingleSource(sourceRef,{...dependencies,getOwnWork:async()=>undefined}));await assert.rejects(resolveSingleSource(sourceRef,{...dependencies,getOwnWork:async()=>({platformId:workId,readError:'未授权'})}));});
test('receipt source requires original account, session, exact ID and completed review',async()=>{const account={id:'bili',platform:'bilibili',nativeAccountKey:'123',connectorSessionId:'session'},ref={kind:'receipt',accountId:'bili',receiptId:'original'};let receipt={kind:'publish',status:'confirmed',accountId:'bili',platform:'bilibili',nativeAccountKey:'123',sessionId:'session',summary:'确切作品',evidence:{workId:'BV1234567890',workUrl:'https://www.bilibili.com/video/BV1234567890',workReferenceSource:'official_title_link'}};const deps={account:async()=>account,owner:'owner',journal:{find(owner,id){assert.equal(owner,'owner');assert.equal(id,'original');return receipt;}}};assert.equal((await resolveSingleSource(ref,deps)).workId,'BV1234567890');for(const patch of [{status:'unknown'},{accountId:'other'},{sessionId:'old'},{verification:{state:'processing'}},{verification:{state:'rejected'}},{evidence:{...receipt.evidence,workId:'other'}}]){const old=receipt;receipt={...old,...patch};await assert.rejects(resolveSingleSource(ref,deps));receipt=old;}});

test('other sender must be explicit and authenticated, same platform and distinct identity/session',async()=>{
 const f=fixture();for(const id of [undefined,[],['sender'],'', 'account','missing'])await assert.rejects(f.q.previewSingle({source:sourceRef,senderAccountId:id,text:'正文'}));
 for(const patch of [{platform:'bilibili'},{nativeAccountKey:''},{connectorSessionId:''},{nativeAccountKey:f.account.nativeAccountKey},{connectorSessionId:f.account.connectorSessionId}]){const before={...f.sender};Object.assign(f.sender,patch);await assert.rejects(f.preview(),/同平台/);Object.assign(f.sender,before);}
 assert.equal(f.writes,0);assert.equal(f.executions,0);
});
test('backend rejects a different account returned by the account resolver',async()=>{const f=fixture({account:async()=>({id:'another',platform:'douyin',nativeAccountKey:'n',connectorSessionId:'s'})});await assert.rejects(f.preview(),/选定发送账号/);assert.equal(f.writes,0);});
test('sender rebind after preview rejects start before durable running or execution',async()=>{const f=fixture(),b=await f.preview();f.sender.connectorSessionId='new-binding';await assert.rejects(f.q.start(b.id),/绑定/);assert.equal(f.executions,0);assert.equal(f.stored.batches[0].status,'preview');});
test('sender rebind immediately before commit cannot dispatch',async()=>{let sent=0;const f=fixture({execute:async args=>{assert.equal(args.primary.id,'account');assert.equal(args.account.id,'sender');f.sender.nativeAccountKey='rebound';await args.beforeCommit();sent++;}}),b=await f.preview();await f.q.start(b.id);await f.finish();assert.equal(sent,0);assert.equal(f.stored.batches[0].rows[0].status,'failed');assert.equal(Object.keys(f.stored.ledger).length,0);});
test('legacy owner preview and changed sender selection require a fresh explicit preview',async()=>{const f=fixture(),b=await f.preview(),stored=f.q.singleBatch(b.id);delete stored.senderMode;await assert.rejects(f.q.start(b.id),/重新预览/);await f.q.cancel(b.id);assert.equal(f.executions,0);const c=await f.preview();f.q.singleBatch(c.id).senderAccountId='changed';await assert.rejects(f.q.start(c.id),/重新预览/);});
test('dedupe follows the selected native identity and a second sender is never auto-started',async()=>{const f=fixture(),b=await f.preview();await f.q.start(b.id);await f.finish();f.accounts.set('alias',{...f.sender,id:'alias',connectorSessionId:'alias-session'});const duplicate=await f.q.previewSingle({source:sourceRef,senderAccountId:'alias',text:'另一条正文'});assert.equal(duplicate.rows[0].status,'skipped');f.accounts.set('second',{...f.sender,id:'second',nativeAccountKey:'second-native',connectorSessionId:'second-session'});const next=await f.q.previewSingle({source:sourceRef,senderAccountId:'second',text:'独立确认正文'});assert.equal(next.rows.length,1);assert.equal(next.rows[0].status,'queued');assert.equal(f.executions,1);assert.equal(f.q.active,null);});
test('read-only author recheck persists real status without changing CID, timing or dedupe',async()=>{
 const f=fixture(),b=await f.preview();await f.q.start(b.id);await f.finish();const before=structuredClone(f.stored),row=before.batches[0].rows[0];let checks=0;
 f.q.execute=async a=>{assert.equal(a.verifyOnly,true);assert.equal(a.row.commentId,row.commentId);await assert.rejects(a.beforeCommit(),/禁止提交/);checks++;return{status:checks===1?'unknown':'confirmed',commentId:row.commentId,visibility:{state:checks===1?'not-observed':'author-visible',checkedAt:1000},message:'合成作者列表核对'};};
 assert.equal((await f.q.recheckSingle(b.id)).rows[0].status,'unknown');assert.equal((await f.q.recheckSingle(b.id)).rows[0].status,'sent');assert.equal(f.stored.batches[0].rows[0].completedAt,row.completedAt);assert.deepEqual(f.stored.ledger,before.ledger);assert.equal(f.executions,1);assert.equal((await f.preview()).rows[0].status,'skipped');
});
test('recheck rejects preview, missing claim, concurrent work and changed bindings',async()=>{
 const f=fixture(),b=await f.preview();await assert.rejects(f.q.recheckSingle(b.id));await f.q.start(b.id);await f.finish();let release,entered;const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r);const before=structuredClone(f.stored);
 f.q.execute=async a=>{entered();await gate;return{status:'confirmed',commentId:a.row.commentId,visibility:{state:'author-visible'}};};
 const check=f.q.recheckSingle(b.id);await ready;await assert.rejects(f.q.recheckSingle(b.id),/执行中/);await assert.rejects(f.q.start(b.id));f.sender.connectorSessionId='changed';release();await assert.rejects(check,/绑定/);assert.deepEqual(f.stored,before);assert.equal(f.q.active,null);
 f.sender.connectorSessionId='sender-session';delete f.q.state.ledger[f.q.singleBatch(b.id).rows[0].key];await assert.rejects(f.q.recheckSingle(b.id),/提交记录/);
});
test('closing during read-only verification waits and discards late result',async()=>{
 const f=fixture(),b=await f.preview();await f.q.start(b.id);await f.finish();let release,entered,closed=false;const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r),before=structuredClone(f.stored);
 f.q.execute=async a=>{entered();await gate;return{status:'confirmed',commentId:a.row.commentId,visibility:{state:'author-visible'}};};
 const check=f.q.recheckSingle(b.id);const rejected=assert.rejects(check,/已停止/);await ready;const closing=f.q.close().then(()=>closed=true);await Promise.resolve();assert.equal(closed,false);release();await rejected;await closing;assert.deepEqual(f.stored,before);assert.equal(closed,true);
});

test('global automatic reads reserve 1/5/15 minute attempts across restart, stop on visibility and never submit',async()=>{
  const {createResultReview}=require('../desktop/automatic-result-review.cjs');
  const f=fixture(),b=await f.preview();await f.q.start(b.id);await f.finish();const ledger=structuredClone(f.stored.ledger);
  let reads=0;f.q.execute=async a=>{assert.equal(a.verifyOnly,true);reads++;return{status:'unknown',commentId:a.row.commentId,visibility:{state:'not-observed'}};};
  const make=()=>createResultReview({queue:f.q,owner:'owner',journal:{list:()=>[]},now:f.q.now});
  let service=make();await service.tick();assert.equal(reads,0);
  for(const ms of [60000,240000,600000]){f.tick(ms-1);await service.tick();const n=reads;f.tick(1);await service.tick();assert.equal(reads,n+1);await service.close();service=make();}
  f.tick(86400000);await service.tick();assert.equal(reads,3);assert.deepEqual(f.stored.ledger,ledger);assert.equal(f.executions,1);
  f.q.state.batches[0].rows[0].visibility.state='author-visible';await service.tick();assert.deepEqual(f.stored.autoReviews,{});
});
test('automatic follow-up probe is serial, requires original parent and honors terminal pin state',async()=>{
  const {createResultReview}=require('../desktop/automatic-result-review.cjs');const f=fixture();
  const parent={id:'owned',accountId:'a',platform:'bilibili',kind:'publish',status:'confirmed',attemptId:'attempt'};
  const child={id:'child',followupOf:'owned',accountId:'a',platform:'bilibili',attemptId:'attempt',createdAt:new Date(1).toISOString(),kind:'comments',status:'confirmed',pinResult:{status:'unknown'}};
  let reads=0,release;const gate=new Promise(r=>release=r);
  const review=createResultReview({queue:f.q,owner:'owner',now:f.q.now,journal:{list:()=>[parent,child]},verifyFollowup:async(c,p)=>{assert.equal(c,child);assert.equal(p,parent);reads++;await gate;child.pinResult.status='confirmed';}});
  child.attemptId='changed';await review.tick();assert.equal(reads,0);child.attemptId='attempt';
  const first=review.tick();await review.tick();release();await first;await review.tick();assert.equal(reads,1);await review.close();
});

test('retained original-page review is serial, bounded and cancelled on shutdown',async()=>{
 const {createOperationResultReviews}=require('../desktop/account-operations-result-review.cjs');
 let clock=0,reads=0;const reviews=createOperationResultReviews({now:()=>clock});
 reviews.enqueue('original',async()=>{reads++;return false;});assert.equal(reviews.enqueue('original',async()=>true),false);
 for(const gap of [60000,240000,600000]){clock+=gap;await reviews.tick();await reviews.tick();}
 assert.equal(reads,3);clock+=86400000;await reviews.tick();assert.equal(reads,3);
 reviews.enqueue('stopped',async()=>{assert.fail('read after close');});await reviews.close();clock+=60000;await reviews.tick();
});
