const assert=require('node:assert/strict'),{test}=require('node:test');
const {CommentQueue}=require('../desktop/one-click-comment-queue.cjs');
const {biliComment}=require('../desktop/one-click-comment-executor.cjs');
function harness(extra={}){
  let clock=100000,saved;const calls=[],accounts=new Map(['main','a','b','c'].map((id,i)=>[id,{id,nickname:id,platform:'bilibili',connectorSessionId:'session-'+id,nativeAccountKey:String(i+1)}]));
  const source=async()=>({account:accounts.get('main'),platform:'bilibili',workId:'BV1234567890',workUrl:'https://www.bilibili.com/video/BV1234567890',title:'合成作品'});
  const q=new CommentQueue({save:async s=>{saved=structuredClone(s);},source,account:async id=>{if(!accounts.has(id))throw Error('账号已解绑');return accounts.get(id);},now:()=>clock,random:()=>0,sleep:async()=>{},execute:async args=>{await args.beforeCommit();calls.push(args.row.accountId);return{status:'confirmed',commentId:'c-'+args.row.accountId,message:'模拟回执'};},...extra});
  const prepare=async ids=>{const set=await q.saveSet({name:'合成评论集',comments:['甲','乙','丙']});return q.preview({receiptId:'receipt',setId:set.id,accountIds:ids||['a','b','c']});};
  const finish=async()=>{await q.active?.promise;};
  return{q,calls,accounts,prepare,finish,get saved(){return saved;},tick:ms=>clock+=ms};
}
test('preview makes no sends, shuffles unique texts and persists the exact assignment',async()=>{const h=harness(),b=await h.prepare();assert.equal(h.calls.length,0);assert.deepEqual(b.rows.map(r=>r.text),['乙','丙','甲']);assert.equal(h.saved.batches[0].rows[0].text,b.rows[0].text);assert.ok(!JSON.stringify(h.q.snapshot()).includes('session-a'));await h.q.start(b.id);await h.finish();assert.deepEqual(h.calls,['a','b','c']);assert.equal(h.q.snapshot().batches[0].status,'completed');assert.equal(h.q.snapshot().batches[0].rows[0].commentId,'c-a');});
test('batch uses a verified work source and never reuses text when the set is short',async()=>{
  const h=harness(),original=h.q.source;
  const source={kind:'cached-work',accountId:'main',workId:'7777777777777777777'};
  let reads=0,changed=false;
  h.q.source=async(_id,ref)=>{
    reads++;
    assert.deepEqual(ref,source);
    return {...await original(),workId:changed?'other':source.workId};
  };
  const set=await h.q.saveSet({name:'评论集',comments:['甲',' 甲 ','乙']});
  await assert.rejects(h.q.preview({source,setId:set.id,accountIds:['a','b','c']}),/3 个待发送账号.*2 条不同正文/);
  assert.equal(h.q.snapshot().batches.length,0);
  const b=await h.q.preview({source,setId:set.id,accountIds:['a','b']});
  assert.equal(h.calls.length,0);
  changed=true;
  await assert.rejects(h.q.start(b.id),/作品或主号绑定已变化/);
  changed=false;
  await h.q.start(b.id);
  await h.finish();
  assert.deepEqual(h.calls,['a','b']);
  assert.ok(reads>3);
  const next=await h.q.preview({source,setId:set.id,accountIds:['a','b','c']});
  assert.deepEqual(next.rows.map(r=>r.status),['skipped','skipped','queued']);
  assert.deepEqual(next.rows.map(r=>r.text),['','','乙']);
});
test('repeated preview/start, rebinding alias and unknown never duplicate a work/account',async()=>{const h=harness(),b=await h.prepare(['a']);await h.q.start(b.id);await h.finish();await assert.rejects(h.q.start(b.id));const b2=await h.prepare(['a']);assert.equal(b2.rows[0].status,'skipped');h.accounts.set('alias',{...h.accounts.get('a'),id:'alias',connectorSessionId:'different'});const b3=await h.prepare(['alias']);assert.equal(b3.rows[0].status,'skipped');assert.equal(h.calls.length,1);});
test('reject cross platform, same physical account, primary, duplicate IDs and excessive count',async()=>{const h=harness();await assert.rejects(h.prepare(['main']));await assert.rejects(h.prepare(['a','a']));h.accounts.set('d',{...h.accounts.get('a'),id:'d'});await assert.rejects(h.prepare(['a','d']));h.accounts.get('b').platform='douyin';await assert.rejects(h.prepare(['b']));await assert.rejects(h.prepare(Array.from({length:101},(_,i)=>'z'+i)),/1～100/);assert.equal(h.calls.length,0);});
test('a batch can assign 100 different comments to 100 distinct accounts',async()=>{
  const h=harness();
  const accountIds=Array.from({length:100},(_,index)=>'sender-'+index);
  for(const id of accountIds)h.accounts.set(id,{id,platform:'bilibili',nativeAccountKey:id,connectorSessionId:'session-'+id});
  const set=await h.q.saveSet({name:'百条评论集',comments:accountIds.map((_,index)=>'正文 '+index)});
  const batch=await h.q.preview({receiptId:'receipt',setId:set.id,accountIds});
  assert.deepEqual(batch.rows.map(row=>row.accountId),accountIds);
  assert.equal(new Set(batch.rows.map(row=>row.text)).size,100);
  assert.equal(h.calls.length,0);
});
test('expired preview cannot be resumed by pausing; changed binding stops before dispatch',async()=>{const h=harness(),b=await h.prepare(['a']);await h.q.pause(b.id);h.tick(600001);await assert.rejects(h.q.start(b.id),/过期/);const b2=await h.prepare(['a']);h.accounts.get('a').connectorSessionId='changed';await h.q.start(b2.id);await h.finish();assert.equal(h.calls.length,0);assert.equal(h.q.snapshot().batches[0].rows[0].status,'failed');});
test('loss of response consumes dedupe claim, pauses remaining, explicit resume skips uncertain row',async()=>{let attempts=0;const h=harness({execute:async a=>{await a.beforeCommit();attempts++;if(attempts===1)throw Error('连接中断');return{status:'confirmed',commentId:'after'};}}),b=await h.prepare(['a','b']);await h.q.start(b.id);await h.finish();let result=h.q.snapshot().batches[0];assert.equal(result.status,'paused');assert.equal(result.rows[0].status,'unknown');assert.equal(result.rows[1].status,'queued');await h.q.start(b.id);await h.finish();assert.equal(attempts,2);assert.equal(h.q.snapshot().batches[0].rows[0].status,'unknown');});
test('durable claim precedes send and cannot be replayed after restart',async()=>{let release,entered;const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r);const h=harness({execute:async a=>{await a.beforeCommit();entered();await gate;return{status:'unknown'};}}),b=await h.prepare(['a','b']);await h.q.start(b.id);await ready;assert.equal(h.saved.batches[0].rows[0].status,'sending');const restarted=harness({state:h.saved});assert.equal(restarted.q.snapshot().batches[0].rows[0].status,'unknown');assert.equal(restarted.q.snapshot().batches[0].status,'paused');await h.q.pause(b.id);release();await h.finish();assert.equal(h.q.snapshot().batches[0].rows[1].status,'queued');});
test('double starts / double commits cannot send twice',async()=>{let release;const gate=new Promise(r=>release=r);const h=harness({execute:async a=>{await a.beforeCommit();await assert.rejects(a.beforeCommit());await gate;return{status:'confirmed',commentId:'once'};}}),b=await h.prepare(['a']);await h.q.start(b.id);await assert.rejects(h.q.start(b.id));release();await h.finish();assert.equal(h.q.snapshot().batches[0].rows[0].status,'sent');});
test('failed persistence prevents all platform writes',async()=>{let rejectWrite=false,calls=0;const h=harness({save:async()=>{if(rejectWrite)throw Error('disk');},execute:async a=>{await a.beforeCommit();calls++;return{status:'confirmed',commentId:'x'};}}),b=await h.prepare(['a']);rejectWrite=true;await assert.rejects(h.q.start(b.id));assert.equal(calls,0);assert.equal(h.q.closed,true);});
test('editing/deleting set does not mutate persisted preview; cancellation stops queued',async()=>{const h=harness(),b=await h.prepare();const set=h.q.snapshot().sets[0];await h.q.saveSet({id:set.id,name:'新集',comments:['新正文']});assert.deepEqual(h.q.snapshot().batches[0].rows.map(r=>r.text),b.rows.map(r=>r.text));await h.q.removeSet(set.id);await h.q.cancel(b.id);assert.ok(h.q.snapshot().batches[0].rows.every(r=>r.status==='cancelled'));assert.equal(h.calls.length,0);});
test('source ownership is rechecked before each commit',async()=>{let flip=false,sends=0;const h=harness({execute:async a=>{flip=true;await a.beforeCommit();sends++;return{status:'confirmed',commentId:'x'};}});const original=h.q.source;h.q.source=async()=>{const s=await original();if(flip)s.workId='different';return s;};const b=await h.prepare(['a']);await h.q.start(b.id);await h.finish();assert.equal(sends,0);assert.equal(h.q.snapshot().batches[0].rows[0].status,'failed');});
test('Bili checks sender AND primary owner; precise ack, no pin and only one POST',async()=>{const calls=[];let commit=false;const reply={rpid_str:'1234',oid:'5678',type:1,root:0,parent:0,member:{mid:'2'},content:{message:'合成评论'},state:0};const request=async(method,route,data)=>{calls.push({method,route,data});if(route.endsWith('/nav'))return{code:0,data:{isLogin:true,mid:2}};if(route.endsWith('/view'))return{code:0,data:{bvid:'BV1234567890',aid:5678,owner:{mid:1}}};assert.equal(commit,true);return{code:0,data:{reply}};};const result=await biliComment({request,workId:'BV1234567890',identity:'2',primaryIdentity:'1',text:'合成评论',beforeCommit:async()=>{commit=true;}});assert.equal(result.status,'confirmed');assert.equal(result.commentId,'1234');assert.equal(calls.filter(c=>c.method==='POST').length,1);assert.equal(calls.some(c=>c.route.endsWith('/top')),false);});
test('Bili unknown / verification response is not success and is never retried',async()=>{let writes=0;const request=async(method,route)=>{if(route.endsWith('/nav'))return{code:0,data:{isLogin:true,mid:2}};if(route.endsWith('/view'))return{code:0,data:{bvid:'BV1234567890',aid:5678,owner:{mid:1}}};writes++;return{code:12015};};const args={request,workId:'BV1234567890',identity:'2',primaryIdentity:'1',text:'合成',beforeCommit:async()=>{}};assert.equal((await biliComment(args)).status,'failed');assert.equal(writes,1);await assert.rejects(biliComment({...args,primaryIdentity:'3'}));assert.equal(writes,1);});

function executorFixture(options={}){
 const {createCommentExecutor}=require('../desktop/one-click-comment-executor.cjs');const order=[];let healthCalls=0,readyReads=0;
 const account={id:'sender',platform:'douyin',connectorSessionId:'bound-session',nativeAccountKey:'bound-handle'};
 const normal={state:'normal',accountId:account.id,sessionId:account.connectorSessionId,nativeAccountKey:account.nativeAccountKey,identityEvidence:{ownUid:'12345'}};
 const guest={setWindowOpenHandler(){},on(){},removeListener(){},isLoadingMainFrame(){return false;},async insertText(value){assert.equal(value,'合成正文');order.push('native-input');},async loadURL(){order.push('load');if(options.loadError)throw options.loadError;},async executeJavaScript(script){
  const command=['ready','prepare','input-ready','verify-prepared','submit-ready','submit','result','open-comments','check-receipt'].find(c=>script.includes(')("'+c+'",'));order.push(command);
  if(command==='open-comments')return{ok:true,value:{ready:true}};
  if(command==='check-receipt'){if(options.readError)throw Error('合成复核断线');return{ok:true,value:{ready:true,visible:!options.authorMissing}};}
  if(command==='ready'){readyReads++;return options.domError?{ok:false,message:options.domError}:{ok:true,value:{ready:readyReads>2}};}
  if(command==='prepare'&&options.nativeInput)return{ok:true,value:{requiresNativeInput:true}};
  if(command==='input-ready'&&options.focusChanged)return{ok:false,message:'评论输入焦点或草稿已变化，未输入'};
  if(command==='verify-prepared')return{ok:true,value:{prepared:!options.nativeLost}};
  return{ok:true,value:command==='result'?{status:'confirmed',commentId:'123456'}:command==='submit-ready'?{ready:!options.buttonPending}:{}};
 }};
 const primary={id:'primary',platform:'douyin',connectorSessionId:'owner-session',nativeAccountKey:'owner-key'};
 const execute=createCommentExecutor({owner:'owner',session:{},getEvent:()=>({sender:{id:1},accessToken:'not-a-real-token'}),inspectAccountHealth:async(_e,args)=>{order.push('health');healthCalls++;const h=args.accountId===primary.id?{...normal,accountId:primary.id,sessionId:primary.connectorSessionId,nativeAccountKey:primary.nativeAccountKey}:normal;return options.health?.(healthCalls,h)||h;},resolveOperationsIdentity:async()=>{throw Error('Should reuse checked DY UID');},createOperationsWindow:({account:a})=>{order.push(a.id===primary.id?'author-window':'window');return{webContents:guest,isDestroyed:()=>false,destroy:()=>order.push('close')};},sleep:async()=>{}});
 const run=()=>execute({batch:{platform:'douyin',workId:'7777777777777777777',workUrl:'https://www.douyin.com/video/7777777777777777777'},row:{text:'合成正文',commentId:'123456'},account,primary,verifyOnly:!!options.verifyOnly,assertCurrent:async()=>{},beforeCommit:async()=>order.push('commit')});return{run,order};
}
test('comment executor verifies sender and author in separate pages with exactly one commit',async()=>{const f=executorFixture();assert.equal((await f.run()).status,'confirmed');assert.deepEqual(f.order,['health','window','load','ready','ready','ready','prepare','health','submit-ready','commit','submit','result','close','health','author-window','load','open-comments','check-receipt','close']);});
test('sender echo alone is unknown, retains CID and never retries submission',async()=>{for(const opt of [{authorMissing:true},{readError:true},{health:(n,h)=>n===3?{...h,state:'offline'}:h}]){const f=executorFixture(opt),r=await f.run();assert.equal(r.status,'unknown');assert.equal(r.commentId,'123456');assert.notEqual(r.visibility.state,'author-visible');assert.equal(f.order.filter(x=>x==='submit').length,1);assert.equal(f.order.at(-1),opt.health?'health':'close');}});
test('read-only recheck creates only author page and never activates any writing path',async()=>{for(const missing of [true,false]){const f=executorFixture({verifyOnly:true,authorMissing:missing}),r=await f.run();assert.equal(r.status,missing?'unknown':'confirmed');assert.equal(r.commentId,'123456');assert.equal(f.order.filter(x=>x==='author-window').length,1);for(const step of ['window','prepare','native-input','commit','submit','result'])assert(!f.order.includes(step));assert.equal(f.order.at(-1),'close');}});
test('a pending send button expires before durable commit or any click',async()=>{const f=executorFixture({buttonPending:true});await assert.rejects(f.run(),/发送按钮尚未就绪/);assert.equal(f.order.filter(x=>x==='submit-ready').length,10);assert(!f.order.includes('commit'));assert(!f.order.includes('submit'));});
test('native typing targets the verified editor once, verifies text and does not submit on changed focus or lost draft',async()=>{
 const ok=executorFixture({nativeInput:true});assert.equal((await ok.run()).status,'confirmed');assert.equal(ok.order.filter(x=>x==='native-input').length,1);assert(ok.order.indexOf('input-ready')<ok.order.indexOf('native-input'));assert(ok.order.indexOf('verify-prepared')<ok.order.indexOf('commit'));
 for(const options of [{focusChanged:true},{nativeLost:true}]){const f=executorFixture({nativeInput:true,...options});await assert.rejects(f.run(),/未输入|未通过核对/);assert(!f.order.includes('commit'));assert(!f.order.includes('submit'));assert.equal(f.order.filter(x=>x==='native-input').length,options.focusChanged?0:1);}
});
test('offline unknown verification and wrong binding never open a comment page',async()=>{for(const patch of [{state:'offline'},{state:'unknown'},{verificationRequired:true},{sessionId:'other'},{nativeAccountKey:'other'}]){const f=executorFixture({health:(n,h)=>({...h,...patch,message:'需要本人核验'})});await assert.rejects(f.run(),/核验发送账号：需要本人核验/);assert.deepEqual(f.order,['health']);}});
test('session stops being normal after draft preparation: no submission',async()=>{const f=executorFixture({health:(n,h)=>n===2?{...h,state:'offline',message:'登录已失效'}:h});await assert.rejects(f.run(),/提交前复核发送账号：登录已失效/);assert(!f.order.includes('commit'));assert(!f.order.includes('submit'));assert.equal(f.order.at(-1),'close');});
test('page errors retain stage and safe network code without URL credentials',async()=>{const f=executorFixture({loadError:Error('net::ERR_ABORTED (-3) https://example.invalid/?token=secret')});await assert.rejects(f.run(),e=>e.message==='打开原作品：页面网络错误 ERR_ABORTED');assert(!f.order.includes('prepare'));assert.equal(f.order.at(-1),'close');});
test('structured renderer failure retains actionable reason, no fallback submit',async()=>{const f=executorFixture({domError:'官网需要本人登录或验证，已暂停评论'});await assert.rejects(f.run(),/等待评论框加载：官网需要本人登录或验证/);assert(!f.order.includes('prepare'));assert(!f.order.includes('commit'));});
test('only an observed main-frame same-work video-to-note transition admits ERR_ABORTED; listener always removed',async()=>{
 const {EventEmitter}=require('node:events'),{loadCommentWork}=require('../desktop/one-click-comment-executor.cjs');
 const workId='7777777777777777777',batch={platform:'douyin',workId,workUrl:'https://www.douyin.com/video/'+workId};
 for(const [url,inPlace,main,code,allowed] of [
  ['https://www.douyin.com/note/'+workId,false,true,'ERR_ABORTED',true],
  ['https://www.douyin.com/note/8888888888888888888',false,true,'ERR_ABORTED',false],
  ['https://other.invalid/note/'+workId,false,true,'ERR_ABORTED',false],
  ['https://www.douyin.com/note/'+workId,true,true,'ERR_ABORTED',false],
  ['https://www.douyin.com/note/'+workId,false,false,'ERR_ABORTED',false],
  ['https://www.douyin.com/note/'+workId,false,true,'ERR_CONNECTION_RESET',false],
 ]){const guest=new EventEmitter();let loads=0;guest.loadURL=async()=>{loads++;guest.emit('did-start-navigation',{},url,inPlace,main);throw Error(code);};
  if(allowed)await loadCommentWork(guest,batch);else await assert.rejects(loadCommentWork(guest,batch));assert.equal(loads,1);assert.equal(guest.listenerCount('did-start-navigation'),0);
 }
});

test('Bili delayed review uses the author session and only GETs for the original work and reply',async()=>{
 const {createCommentExecutor}=require('../desktop/one-click-comment-executor.cjs');
 const sender={id:'a',connectorSessionId:'sender',nativeAccountKey:'21'},author={id:'p',connectorSessionId:'author',nativeAccountKey:'12'};
 const accounts=[sender,author],calls=[];
 const run=createCommentExecutor({getEvent:()=>({}),session:{fromPartition(part){assert.equal(part,'persist:matrix-bilibili-author');return{};}},
   inspectAccountHealth:async(_,input)=>{const a=accounts.find(a=>a.id===input.accountId);return{state:'normal',accountId:a.id,sessionId:a.connectorSessionId,nativeAccountKey:a.nativeAccountKey};},
   createTransport:async()=>({close(){calls.push('close');},async request(method,path,params){assert.equal(method,'GET');calls.push(path);
     if(path.endsWith('/nav'))return{code:0,data:{isLogin:true,mid:12}};
     if(path.endsWith('/view'))return{code:0,data:{bvid:'BV1234567890',owner:{mid:12},aid:'987'}};
     assert.equal(params.root,'12345');return{code:0,data:{root:{type:1,oid:'987',root:0,parent:0,rpid:'12345',member:{mid:21},content:{message:'合成'}}}};}})});
 const result=await run({account:sender,primary:author,batch:{platform:'bilibili',workId:'BV1234567890'},row:{text:'合成',commentId:'12345'},assertCurrent:async()=>{},verifyOnly:true,beforeCommit:()=>assert.fail('unexpected send')});
 assert.equal(result.visibility.state,'author-visible');assert.deepEqual(calls,['/x/web-interface/nav','/x/web-interface/view','/x/v2/reply/detail','close']);
});
