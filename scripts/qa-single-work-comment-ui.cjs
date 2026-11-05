const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
async function run(){
 const assert=require('node:assert/strict'),React=require('./qa-operations-paths.cjs').projectRequire('react'),{createRoot}=require('./qa-operations-paths.cjs').projectRequire('react-dom/client'),{loadTs}=require('./qa-operations-load-typescript.cjs');
 const cache=new Map(),overrides=new Map(),stub=(file,exports)=>cache.set(path.join(root,file),{exports});let owner='owner',calls=[],checks=0,release,failRead=false;
 stub('client/src/api/index.ts',{getAuthToken:()=> 'token-'+owner,getUser:()=>({id:owner})});
 const workspace={accounts:[{id:'a',nickname:'作品账号',platform:'douyin',connectorSessionId:'primary-session',nativeAccountKey:'primary-native'},{id:'b',nickname:'发送乙',platform:'douyin',connectorSessionId:'sender-b',nativeAccountKey:'native-b'},{id:'c',nickname:'发送丙',platform:'douyin',connectorSessionId:'sender-c',nativeAccountKey:'native-c'},{id:'alias',platform:'douyin',connectorSessionId:'alias-session',nativeAccountKey:'primary-native'},{id:'wrong-platform',platform:'bilibili',connectorSessionId:'bili-session',nativeAccountKey:'bili-native'},{id:'unbound',platform:'douyin'}]};
 stub('client/src/components/workspace/OfficialWorkspace.tsx',{platformLabels:{douyin:'抖音',bilibili:'B站'},useOfficialWorkspace:()=>workspace});
 const state={target:{accountId:'a',accountName:'合成账号',platform:'douyin',workId:'7777777777777777777',title:'合成作品',workUrl:'https://www.douyin.com/video/7777777777777777777'},running:false,batches:[]};
 window.matrixDesktop={oneClickComments:async input=>{calls.push(structuredClone(input));const{command,args}=input;if(command==='snapshot')return{result:{sets:[{id:'set-a',name:'合成评论集',comments:['候选正文一','候选正文二']}],batches:[],running:false}};if(command==='single-state')return{result:structuredClone(state)};if(command==='single-preview'){const b={id:'preview-'+calls.length,mode:'single',platform:'douyin',title:'合成作品',status:'preview',rows:[{accountId:args.senderAccountId,accountName:workspace.accounts.find(a=>a.id===args.senderAccountId).nickname,text:args.text,status:'queued',detail:'未发送'}]};state.batches.unshift(b);return{result:structuredClone(b)};}if(command==='single-start'){await new Promise(r=>release=r);state.batches[0].status='completed';state.batches[0].rows[0].status='sent';state.batches[0].rows[0].commentId='mock-comment';return{result:structuredClone(state.batches[0])};}if(command==='single-cancel'){state.batches[0].status='cancelled';state.batches[0].rows[0].status='cancelled';return{result:true};}throw Error('Unexpected command');}};
 let healthMode='normal',healthCalls=0;
 window.matrixDesktop.inspectAccountHealth=async({accountId})=>{healthCalls++;const a=workspace.accounts.find(a=>a.id===accountId);return{state:healthMode,accountId,sessionId:a.connectorSessionId,nativeAccountKey:a.nativeAccountKey,message:'合成账号需要登录'};};
 overrides.set('react-router-dom',{Link:({to,children})=>React.createElement('a',{href:to},children)});
 const {SingleCommentForm}=loadTs('client/src/components/workspace/SingleWorkComment.tsx',cache,overrides),ui=createRoot(document.getElementById('root'));
 const source={kind:'cached-work',accountId:'a',workId:state.target.workId};
 const nativeCall=window.matrixDesktop.oneClickComments;
 window.matrixDesktop.oneClickComments=async input=>{
  if(input.command==='single-state'&&failRead){failRead=false;return{error:'合成结果读取暂时失败'};}
  const reply=await nativeCall(input);
  if(input.command==='single-start'&&owner==='owner'){
    failRead=true;
    // Start acknowledged a running row; server completes before the next read.
    return{result:{...reply.result,status:'running',rows:reply.result.rows.map(row=>({...row,status:'sending',commentId:undefined}))}};
  }
  return reply;
 };
 const until=async fn=>{for(let i=0;i<450;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('UI condition timed out');};
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
 const input=text=>{const node=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(node,text);node.dispatchEvent(new Event('input',{bubbles:true}));};
 try{
  ui.render(React.createElement(SingleCommentForm,{source}));await until(()=>document.querySelector('[aria-label="选择发送账号"]'));assert.equal(calls.length,1);assert.equal(document.querySelectorAll('input[type=checkbox]').length,0);checks+=2;
  const chooseSender=id=>{const select=document.querySelector('[aria-label="选择发送账号"]');select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));};
  assert.deepEqual([...document.querySelector('[aria-label="选择发送账号"]').options].map(o=>o.value),['','b','c']);assert.equal(document.querySelector('[aria-label="选择发送账号"]').value,'');checks+=2;
  assert.equal(document.querySelector('textarea'),null);assert.equal(healthCalls,0);checks+=2;
  chooseSender('b');await until(()=>document.querySelector('textarea')&&document.body.textContent.includes('本次发送：发送乙'));
  input('人工确认的合成评论');await until(()=>button('预览评论')&&!button('预览评论').disabled);button('预览评论').click();await until(()=>button('确认发送这条评论'));assert.equal(calls.filter(c=>c.command==='single-start').length,0);assert(document.body.textContent.includes('合成账号'));checks+=2;
  assert.equal(calls.find(c=>c.command==='single-preview').args.senderAccountId,'b');checks++;
  chooseSender('c');await until(()=>!button('确认发送这条评论'));assert.equal(calls.filter(c=>c.command==='single-start').length,0);checks++;
  chooseSender('b');await until(()=>button('预览评论')&&!button('预览评论').disabled);button('预览评论').click();await until(()=>button('确认发送这条评论'));
  button('从评论集选择').click();await until(()=>document.querySelector('[aria-label="选择候选评论集"]'));
  const choose=(label,value)=>{const select=document.querySelector('[aria-label="'+label+'"]');select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));};
  choose('选择候选评论集','set-a');await until(()=>document.querySelector('[aria-label="选择候选评论"]'));choose('选择候选评论','1');await until(()=>!button('填入正文').disabled);button('填入正文').click();await until(()=>document.querySelector('textarea').value==='候选正文二');
  assert.equal(button('确认发送这条评论'),undefined);assert.equal(calls.filter(c=>c.command==='single-start').length,0);assert.equal(calls.filter(c=>c.command==='snapshot').length,1);checks+=3;
  input('重新编辑后的正文');await until(()=>!button('确认发送这条评论'));button('预览评论').click();await until(()=>button('确认发送这条评论'));assert.equal(state.batches[0].rows[0].text,'重新编辑后的正文');checks++;
  button('确认发送这条评论').click();button('确认发送这条评论').click();await until(()=>release);assert.equal(calls.filter(c=>c.command==='single-start').length,1);assert.equal(button('确认发送这条评论').disabled,true);checks+=2;release();await until(()=>document.body.textContent.includes('合成结果读取暂时失败'));assert(document.body.textContent.includes('正在发送'));checks++;await until(()=>document.body.textContent.includes('mock-comment'));assert(document.body.textContent.includes('已提交，作者可见性未核对'));assert(!document.body.textContent.includes('评论已发送'));assert.equal(calls.filter(c=>c.command==='single-start').length,1);checks+=2;
  const originalHandler=window.matrixDesktop.oneClickComments;
  window.matrixDesktop.oneClickComments=async value=>{if(value.command==='single-recheck'){calls.push(structuredClone(value));const b=state.batches.find(b=>b.id===value.args.id);b.rows[0].status='unknown';b.rows[0].visibility={state:'not-observed',checkedAt:1000};b.rows[0].detail='作者视角未读到，不重发';return{result:structuredClone(b)};}return originalHandler(value);};
  button('复核作者可见性').click();await until(()=>document.body.textContent.includes('已提交，作者视角暂未读到'));assert.equal(calls.filter(c=>c.command==='single-recheck').length,1);assert.equal(calls.filter(c=>c.command==='single-start').length,1);checks+=2;
  // The global runtime finishes while this form is idle. No button press.
  state.batches[0].rows[0].visibility={state:'author-visible',checkedAt:Date.now()};
  state.batches[0].rows[0].status='sent';
  window.dispatchEvent(new Event('matrix:comment-review-updated'));
  await until(()=>document.body.textContent.includes('作者可见，已核对'));
  assert.equal(calls.filter(c=>c.command==='single-recheck').length,1);assert.equal(calls.filter(c=>c.command==='single-start').length,1);checks+=2;
  // A late successful callback after logout must not paint old data or issue
  // the follow-up state request under a new user's token.
  input('第二条待核对正文');await until(()=>button('预览评论')&&!button('预览评论').disabled);button('预览评论').click();await until(()=>button('确认发送这条评论'));release=undefined;button('确认发送这条评论').click();await until(()=>release);const at=calls.length;owner='new-owner';release();await new Promise(r=>setTimeout(r,100));assert.equal(calls.length,at);checks++;
  assert.equal(calls.some(c=>['preview','start','save-set'].includes(c.command)),false);checks++;
  // Missing work IDs are repaired by an explicit read of the exact original
  // receipt, never by guessing a title or submitting a comment.
  owner='owner';let ready=false,referenceReads=0;
  window.matrixDesktop.oneClickComments=async value=>value.command==='single-state'&&!ready?{error:'缺少已核实作品编号'}:nativeCall(value);
  window.matrixDesktop.collectPublishReference=async value=>{referenceReads++;assert.equal(value.receiptId,'original-receipt');ready=true;return{receipt:{id:'original-receipt',accountId:'a',kind:'publish',status:'confirmed'}};};
  const sends=calls.filter(c=>c.command==='single-start').length;
  ui.render(React.createElement(SingleCommentForm,{key:'receipt-recovery',source:{kind:'receipt',accountId:'a',receiptId:'original-receipt'}}));
  await until(()=>button('重新读取作品编号（不发送）'));assert.equal(document.querySelector('textarea'),null);checks++;
  button('重新读取作品编号（不发送）').click();await until(()=>document.querySelector('[aria-label="选择发送账号"]'));
  assert.equal(referenceReads,1);assert.equal(calls.filter(c=>c.command==='single-start').length,sends);assert(!document.querySelector('[role=alert]'));checks+=3;
  // A binding refresh during an in-flight preview cannot re-enable its old confirmation.
  chooseSender('b');await until(()=>document.querySelector('textarea'));input('绑定变更前的正文');await until(()=>button('预览评论')&&!button('预览评论').disabled);
  let releasePreview;window.matrixDesktop.oneClickComments=async value=>{if(value.command==='single-preview')await new Promise(r=>releasePreview=r);return nativeCall(value);};
  button('预览评论').click();await until(()=>releasePreview);workspace.accounts=workspace.accounts.map(a=>a.id==='b'?{...a,connectorSessionId:'new-b-session'}:a);
  ui.render(React.createElement(SingleCommentForm,{key:'receipt-recovery',source:{kind:'receipt',accountId:'a',receiptId:'original-receipt'}}));await until(()=>document.querySelector('[aria-label="选择发送账号"]').value==='');releasePreview();await new Promise(r=>setTimeout(r,100));
  assert.equal(button('确认发送这条评论'),undefined);assert.equal(calls.filter(c=>c.command==='single-start').length,sends);checks+=2;
   healthMode='offline';chooseSender('c');await until(()=>button('重新核验账号'));assert.equal(document.querySelector('textarea'),null);assert.equal(button('预览评论'),undefined);assert.equal(calls.filter(c=>c.command==='single-start').length,sends);checks+=3;
   const healthBefore=healthCalls;await new Promise(r=>setTimeout(r,70));assert.equal(healthCalls,healthBefore);checks++;
   healthMode='normal';button('重新核验账号').click();await until(()=>document.querySelector('textarea'));assert.equal(healthCalls,healthBefore+1);assert.equal(button('确认发送这条评论'),undefined);checks+=2;
   // The work page opens the batch dialog independently of the single sender.
   const batchCalls=[];
   const batch={id:'mock-batch',status:'preview',title:state.target.title,workId:state.target.workId,createdAt:Date.now(),rows:[
    {id:'row-b',accountId:'b',accountName:'发送乙',status:'queued',text:'候选正文二'},
    {id:'row-c',accountId:'c',accountName:'发送丙',status:'queued',text:'候选正文一'}
   ]};
   window.matrixDesktop.oneClickComments=async request=>{
    if(request.command==='snapshot'||request.command==='single-state')return nativeCall(request);
    batchCalls.push(request);
    if(request.command==='preview')return{result:batch};
    if(request.command==='start')return{result:{...batch,status:'running'}};
    throw Error('Unexpected batch command');
   };
   const oldBatchButton=button('批量随机评论');
   ui.render(React.createElement(SingleCommentForm,{key:'batch-work',source}));
   await until(()=>button('批量随机评论')&&button('批量随机评论')!==oldBatchButton);
   button('批量随机评论').click();
   await until(()=>document.querySelector('[aria-label="选择评论集"]')?.options.length===2);
   choose('选择评论集','set-a');
   const boxes=[...document.querySelectorAll('input[type=checkbox]')];
   assert.equal(boxes.length,2);
   for(const box of boxes){box.click();await new Promise(r=>setTimeout(r,20));}
   await until(()=>button('预览 2 个账号的评论')&&!button('预览 2 个账号的评论').disabled);
   button('预览 2 个账号的评论').click();
   await until(()=>button('确认并执行本批评论'));
   assert.deepEqual(batchCalls.map(c=>[c.command,c.args]),[['preview',{source,setId:'set-a',accountIds:['b','c']}]]);
   assert.deepEqual([...document.querySelectorAll('.matrix-one-click-preview article p')].map(p=>p.textContent),['候选正文二','候选正文一']);
   button('确认并执行本批评论').click();
   await until(()=>batchCalls.length===2);
   assert.deepEqual(batchCalls[1].args,{id:'mock-batch'});
   assert.equal(batchCalls[1].command,'start');
   checks+=5;
   return{passed:true,checks,realReact:true,realPlatformSends:0};
 }finally{ui.unmount();}
}
module.exports={run};
if(require.main===module||process.versions.electron&&process.type!=='renderer'){
 if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const r=require('node:child_process').spawnSync(require('./qa-operations-paths.cjs').electron,[__filename],{env,encoding:'utf8',windowsHide:true,timeout:60000});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status??1);}
 else{const{app,BrowserWindow,session}=require('electron');app.setPath('userData',fs.mkdtempSync(path.join(require('node:os').tmpdir(),'yuanxiao-single-comment-')));app.disableHardwareAcceleration();const watchdog=setTimeout(()=>app.exit(1),45000);app.whenReady().then(async()=>{let win;try{session.defaultSession.webRequest.onBeforeRequest((d,done)=>done({cancel:!d.url.startsWith('data:')}));win=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{nodeIntegration:true,contextIsolation:false,sandbox:false,backgroundThrottling:false}});await win.loadURL('data:text/html,<div id="root"></div>');console.log(JSON.stringify(await win.webContents.executeJavaScript('require('+JSON.stringify(__filename)+').run()')));}catch(e){console.error(e);process.exitCode=1;}finally{clearTimeout(watchdog);win?.destroy();app.exit(process.exitCode||0);}});}
}
