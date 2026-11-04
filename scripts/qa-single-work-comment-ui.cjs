const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
async function run(){
 const assert=require('node:assert/strict'),React=require('./qa-operations-paths.cjs').projectRequire('react'),{createRoot}=require('./qa-operations-paths.cjs').projectRequire('react-dom/client'),{loadTs}=require('./qa-operations-load-typescript.cjs');
 const cache=new Map(),overrides=new Map(),stub=(file,exports)=>cache.set(path.join(root,file),{exports});let owner='owner',calls=[],checks=0,release,failRead=false;
 stub('client/src/api/index.ts',{getAuthToken:()=> 'token-'+owner,getUser:()=>({id:owner})});
 stub('client/src/components/workspace/OfficialWorkspace.tsx',{platformLabels:{douyin:'抖音'}});
 const state={target:{accountId:'a',accountName:'合成账号',platform:'douyin',workId:'7777777777777777777',title:'合成作品',workUrl:'https://www.douyin.com/video/7777777777777777777'},running:false,batches:[]};
 window.matrixDesktop={oneClickComments:async input=>{calls.push(structuredClone(input));const{command,args}=input;if(command==='single-state')return{result:structuredClone(state)};if(command==='single-preview'){const b={id:'preview-'+calls.length,mode:'single',platform:'douyin',title:'合成作品',status:'preview',rows:[{accountId:'a',accountName:'合成账号',text:args.text,status:'queued',detail:'未发送'}]};state.batches.unshift(b);return{result:structuredClone(b)};}if(command==='single-start'){await new Promise(r=>release=r);state.batches[0].status='completed';state.batches[0].rows[0].status='sent';state.batches[0].rows[0].commentId='mock-comment';return{result:structuredClone(state.batches[0])};}if(command==='single-cancel'){state.batches[0].status='cancelled';state.batches[0].rows[0].status='cancelled';return{result:true};}throw Error('Unexpected command');}};
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
  ui.render(React.createElement(SingleCommentForm,{source}));await until(()=>document.querySelector('textarea'));assert.equal(calls.length,1);assert.equal(document.querySelectorAll('input[type=checkbox]').length,0);checks+=2;
  input('人工确认的合成评论');await until(()=>!button('预览评论').disabled);button('预览评论').click();await until(()=>button('确认发送这条评论'));assert.equal(calls.filter(c=>c.command==='single-start').length,0);assert(document.body.textContent.includes('合成账号'));checks+=2;
  input('重新编辑后的正文');await until(()=>!button('确认发送这条评论'));button('预览评论').click();await until(()=>button('确认发送这条评论'));assert.equal(state.batches[0].rows[0].text,'重新编辑后的正文');checks++;
  button('确认发送这条评论').click();button('确认发送这条评论').click();await until(()=>release);assert.equal(calls.filter(c=>c.command==='single-start').length,1);assert.equal(button('确认发送这条评论').disabled,true);checks+=2;release();await until(()=>document.body.textContent.includes('合成结果读取暂时失败'));assert(document.body.textContent.includes('正在发送'));checks++;await until(()=>document.body.textContent.includes('mock-comment'));assert(document.body.textContent.includes('评论已发送'));assert.equal(calls.filter(c=>c.command==='single-start').length,1);checks+=2;
  // A late successful callback after logout must not paint old data or issue
  // the follow-up state request under a new user's token.
  input('第二条待核对正文');await until(()=>!button('预览评论').disabled);button('预览评论').click();await until(()=>button('确认发送这条评论'));release=undefined;button('确认发送这条评论').click();await until(()=>release);const at=calls.length;owner='new-owner';release();await new Promise(r=>setTimeout(r,100));assert.equal(calls.length,at);checks++;
  assert.equal(calls.some(c=>['preview','start','save-set'].includes(c.command)),false);checks++;
  // Missing work IDs are repaired by an explicit read of the exact original
  // receipt, never by guessing a title or submitting a comment.
  owner='owner';let ready=false,referenceReads=0;
  window.matrixDesktop.oneClickComments=async value=>value.command==='single-state'&&!ready?{error:'缺少已核实作品编号'}:nativeCall(value);
  window.matrixDesktop.collectPublishReference=async value=>{referenceReads++;assert.equal(value.receiptId,'original-receipt');ready=true;return{receipt:{id:'original-receipt',accountId:'a',kind:'publish',status:'confirmed'}};};
  const sends=calls.filter(c=>c.command==='single-start').length;
  ui.render(React.createElement(SingleCommentForm,{key:'receipt-recovery',source:{kind:'receipt',accountId:'a',receiptId:'original-receipt'}}));
  await until(()=>button('重新读取作品编号（不发送）'));assert.equal(document.querySelector('textarea'),null);checks++;
  button('重新读取作品编号（不发送）').click();await until(()=>document.querySelector('textarea'));
  assert.equal(referenceReads,1);assert.equal(calls.filter(c=>c.command==='single-start').length,sends);assert(!document.querySelector('[role=alert]'));checks+=3;
  return{passed:true,checks,realReact:true,realPlatformSends:0};
 }finally{ui.unmount();}
}
module.exports={run};
if(require.main===module||process.versions.electron&&process.type!=='renderer'){
 if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const r=require('node:child_process').spawnSync(require('./qa-operations-paths.cjs').electron,[__filename],{env,encoding:'utf8',windowsHide:true,timeout:60000});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status??1);}
 else{const{app,BrowserWindow,session}=require('electron');app.setPath('userData',fs.mkdtempSync(path.join(require('node:os').tmpdir(),'yuanxiao-single-comment-')));app.disableHardwareAcceleration();const watchdog=setTimeout(()=>app.exit(1),45000);app.whenReady().then(async()=>{let win;try{session.defaultSession.webRequest.onBeforeRequest((d,done)=>done({cancel:!d.url.startsWith('data:')}));win=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{nodeIntegration:true,contextIsolation:false,sandbox:false,backgroundThrottling:false}});await win.loadURL('data:text/html,<div id="root"></div>');console.log(JSON.stringify(await win.webContents.executeJavaScript('require('+JSON.stringify(__filename)+').run()')));}catch(e){console.error(e);process.exitCode=1;}finally{clearTimeout(watchdog);win?.destroy();app.exit(process.exitCode||0);}});}
}
