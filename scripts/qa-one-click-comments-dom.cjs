const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const r=require('node:child_process').spawnSync(require('./qa-operations-paths.cjs').electron,[__filename],{env,encoding:'utf8',windowsHide:true,timeout:60000});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status??1);}
else{
 const {app,BrowserWindow,session}=require('electron'),{publicCommentDom}=require('../desktop/one-click-comment-dom.cjs');app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'yuanxiao-comment-dom-')));app.disableHardwareAcceleration();const watchdog=setTimeout(()=>app.exit(1),45000);
 app.whenReady().then(async()=>{let win;let checks=0;try{
  const isolated=session.fromPartition('comment-fixture-'+Date.now());let html='',redirectHtml='';isolated.protocol.handle('https',request=>new Response(redirectHtml&&new URL(request.url).pathname.startsWith('/video/')?redirectHtml:html,{headers:{'Content-Type':'text/html;charset=utf-8'}}));isolated.webRequest.onBeforeRequest((d,done)=>done({cancel:!d.url.startsWith('https:')}));
  win=new BrowserWindow({show:false,width:900,height:700,webPreferences:{session:isolated,nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  const xhs='012345678901234567890123',uid='abcdefabcdefabcdefabcdef';let args;
  const fixture=async(platform,extra='')=>{args={platform,workId:platform==='douyin'?'7777777777777777777':xhs,identity:platform==='douyin'?'23456789':uid,text:'合成评论，不访问平台',nonce:'fixture-nonce'};
    html=`<meta charset="utf-8"><style>p[contenteditable]{width:300px;height:70px;border:1px solid black}span.wchsYBpK{display:inline-block;padding:15px}</style>`+(platform==='douyin'?`<div class="comment-input-inner-container"><p contenteditable="true"></p><div class="commentInput-right-ct"><span class="wchsYBpK">发送</span></div></div><div id="rows"></div><script>document.querySelector('span').onclick=()=>{window.clicks=(window.clicks||0)+1;const r=document.createElement('div');r.dataset.e2e='comment-item';r.innerHTML='<div class="FduGc_lz"><div class="Sh1Da424">合成评论，不访问平台</div></div>';r.__reactFiber$test={memoizedProps:{comment:{cid:'10001',user:{uid:'23456789'},text:'合成评论，不访问平台',reply_id:'0'}}};document.getElementById('rows').append(r);};</script>`:`<div class="user side-bar-component"><a href="/user/profile/${uid}">我</a></div><div class="interaction-container"><div class="engage-bar-container"><p id="content-textarea" class="content-input" contenteditable="true"></p><button class="btn submit">发送</button></div><div id="rows"></div></div><script>document.querySelector('button').onclick=()=>{window.clicks=(window.clicks||0)+1;document.getElementById('rows').innerHTML='<div class="comment-item" id="comment-10001"><div class="author"><a class="name" data-user-id="${uid}">合成账号</a></div><div class="content">合成评论，不访问平台</div></div>';};</script>`)+extra;
    if(platform==='douyin')html=html.replace('<div id="rows">','<div id="rows" data-e2e="comment-list" style="min-height:1px">');
    await win.loadURL(platform==='douyin'?'https://www.douyin.com/video/'+args.workId:'https://www.xiaohongshu.com/explore/'+xhs);};
  const raw=command=>win.webContents.executeJavaScript(`(${publicCommentDom.toString()})(${JSON.stringify(command)},${JSON.stringify(args)})`);
  const run=async command=>{const result=await raw(command);if(command==='prepare'&&result.requiresNativeInput){await raw('input-ready');await win.webContents.insertText(args.text);return raw('verify-prepared');}return result;};
  for(const platform of ['douyin','xiaohongshu']){
    await fixture(platform);assert.equal((await run('prepare')).prepared,true);assert.equal(await win.webContents.executeJavaScript('window.clicks||0'),0);assert.equal((await run('submit')).clicked,true);assert.equal((await run('result')).commentId,'10001');await assert.rejects(run('submit'));assert.equal(await win.webContents.executeJavaScript('window.clicks'),1);checks+=6;
    if(platform==='xiaohongshu'){
      args.commentId='10001';assert.equal((await run('open-comments')).ready,true);assert.equal((await run('check-receipt')).visible,true);
      args.identity='another-user';assert.equal((await run('check-receipt')).visible,false);assert.equal(await win.webContents.executeJavaScript('window.clicks'),1);checks+=4;
    }
    await fixture(platform);await win.webContents.executeJavaScript("document.querySelector('[contenteditable]').textContent='原草稿'");await assert.rejects(run('prepare'));assert.equal(await win.webContents.executeJavaScript("document.querySelector('[contenteditable]').textContent"),'原草稿');checks+=2;
    await fixture(platform);await run('prepare');await win.webContents.executeJavaScript("document.querySelector('[contenteditable]').textContent='变化后的内容'");await assert.rejects(run('submit'));checks++;
    await fixture(platform);await run('prepare');await win.webContents.executeJavaScript("const m=document.createElement('div');m.style='position:fixed;inset:0;background:white;z-index:1000';document.body.append(m)");await assert.rejects(run('submit'));assert.equal(await win.webContents.executeJavaScript('window.clicks||0'),0);checks+=2;
    await fixture(platform);args.workId='wrong';await assert.rejects(run('prepare'));checks++;
  }
  await fixture('xiaohongshu','<div class="reply-content">回复另一个用户</div>');await win.webContents.executeJavaScript("document.querySelector('.engage-bar-container').append(document.querySelector('.reply-content'))");await assert.rejects(run('prepare'));checks++;
  await fixture('xiaohongshu');args.identity='wrong';await assert.rejects(run('prepare'));checks++;
  await fixture('douyin');assert.equal((await run('ready')).ready,true);assert.equal(await win.webContents.executeJavaScript('window.clicks||0'),0);checks+=2;
  await win.webContents.executeJavaScript("document.querySelector('.comment-input-inner-container').style.display='none'");assert.equal((await run('ready')).ready,false);checks++;
  await fixture('douyin');await win.webContents.executeJavaScript("document.querySelector('[contenteditable]').textContent='原草稿'");
  const script=require('../desktop/one-click-comment-executor.cjs').commentDomScript('prepare',args),captured=await win.webContents.executeJavaScript(script);
  assert.equal(captured.ok,false);assert.equal(captured.message,'评论输入框已有其他草稿，未覆盖');assert.equal(await win.webContents.executeJavaScript('window.clicks||0'),0);checks+=3;
  await fixture('douyin');await win.webContents.executeJavaScript("window.inputs=[];document.querySelector('[contenteditable]').addEventListener('input',e=>inputs.push({nativeInput:e instanceof InputEvent,type:e.inputType,data:e.data}))");
  await run('prepare');assert.deepEqual(await win.webContents.executeJavaScript('inputs'),[{nativeInput:true,type:'insertText',data:args.text}]);checks++;
  assert.equal((await run('submit-ready')).ready,true);assert.equal(await win.webContents.executeJavaScript('window.clicks||0'),0);checks+=2;
  await fixture('douyin','<input id="other">');assert.equal((await raw('prepare')).requiresNativeInput,true);await win.webContents.executeJavaScript("document.getElementById('other').focus()");await assert.rejects(raw('input-ready'));assert.equal(await win.webContents.executeJavaScript('document.getElementById("other").value'),'');checks+=3;
  // A real Chromium navigation, collapsed note panel and lazy Draft editor.
  await fixture('douyin');
  html=html.replace('<div class="comment-input-inner-container">','<main data-e2e="note-detail"><button data-e2e="feed-comment-icon">评论</button></main><div class="comment-input-inner-container" style="display:none">').replace('<p contenteditable="true"></p>','<span class="RXtfhfhu">留下你的精彩评论吧</span>')+`<script>
  document.getElementById('rows').style.display='none';
  document.querySelector('button').onclick=()=>{window.opens=(window.opens||0)+1;document.querySelector('.comment-input-inner-container').style.display='block';document.getElementById('rows').style.display='block';};
  document.querySelector('.RXtfhfhu').onclick=e=>{window.activations=(window.activations||0)+1;e.target.outerHTML='<p contenteditable="true"></p>';};
  document.querySelector('.wchsYBpK').onclick=()=>{window.clicks=(window.clicks||0)+1;const r=document.createElement('div');r.dataset.e2e='comment-item';r.innerHTML='<div class="FduGc_lz"><div class="Sh1Da424">合成评论，不访问平台</div></div>';r.__reactFiber$test={memoizedProps:{comment:{cid:'10001',user:{uid:'23456789'},text:'合成评论，不访问平台',reply_id:'0'}}};document.getElementById('rows').append(r);document.querySelector('.comment-input-inner-container').style.display='none';};
  </script>`;
  redirectHtml=`<script>location.replace('/note/${args.workId}')</script>`;
  const {loadCommentWork}=require('../desktop/one-click-comment-executor.cjs');
  await loadCommentWork(win.webContents,{platform:'douyin',workId:args.workId,workUrl:'https://www.douyin.com/video/'+args.workId});
  for(let i=0;i<50&&(win.webContents.isLoadingMainFrame()||!win.webContents.getURL().includes('/note/'));i++)await new Promise(r=>setTimeout(r,20));
  assert.equal(new URL(win.webContents.getURL()).pathname,'/note/'+args.workId);checks++;
  assert.equal((await run('ready')).ready,false);assert.equal((await run('ready')).ready,true);assert.equal((await run('ready')).ready,true);checks+=3;
  assert.deepEqual(await win.webContents.executeJavaScript('({opens,activations,clicks:window.clicks||0})'),{opens:1,activations:1,clicks:0});checks++;
  await run('prepare');await run('submit');assert.equal((await run('result')).commentId,'10001');assert.equal(await win.webContents.executeJavaScript('window.clicks'),1);checks+=2;
  redirectHtml='';
  // Receipt reads work without a composer, nonce state or input events.
  args.commentId='10001';
  await win.webContents.executeJavaScript('delete window.__yuanxiaoPublicComment;document.querySelector(".comment-input-inner-container").remove()');
  assert.equal((await run('open-comments')).ready,true);assert.equal((await run('check-receipt')).visible,true);checks+=2;
  for(const patch of [{commentId:'20002'},{identity:'9999'},{text:'其他正文'}]){const old={...args};Object.assign(args,patch);assert.equal((await run('check-receipt')).visible,false);args=old;checks++;}
  await win.webContents.executeJavaScript('document.querySelector(".Sh1Da424").textContent="尚未匹配的回显"');assert.equal((await run('check-receipt')).visible,false);assert.equal(await win.webContents.executeJavaScript('window.clicks'),1);checks+=2;
  await fixture('douyin');args.commentId='10001';assert.equal((await run('open-comments')).ready,true);assert.equal((await run('check-receipt')).visible,false);assert.equal(await win.webContents.executeJavaScript('!!window.__yuanxiaoPublicComment'),false);assert.equal(await win.webContents.executeJavaScript('document.activeElement===document.querySelector("[contenteditable]")'),false);checks+=4;
  await fixture('douyin','<iframe src="https://fixture.invalid/captcha"></iframe>');await assert.rejects(run('ready'));assert.equal(await win.webContents.executeJavaScript('window.clicks||0'),0);checks+=2;
  console.log(JSON.stringify({checks,realChromium:true,network:'all HTTPS served by local fixture',realPlatformSends:0}));
 }catch(e){console.error(e);process.exitCode=1;}finally{clearTimeout(watchdog);win?.destroy();app.exit(process.exitCode||0);}});
}
