// Real installed account diagnostics. No mocks, cookie writes, auth overrides,
// direct platform API calls, or automatic final-submit confirmation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { publishVisibility } = createRequire(import.meta.url)('../desktop/publish-visibility.cjs');

const [command = 'state', platform = 'wechat'] = process.argv.slice(2);
assert.ok(['state', 'open', 'progress', 'plan', 'structure', 'native-state', 'reauth', 'manage', 'native-entry', 'native-profile', 'native-root-home', 'seed', 'start', 'stop', 'test-state', 'read-private', 'cover-state', 'report', 'cancel-native-preparation'].includes(command));
assert.ok(['douyin', 'xiaohongshu', 'wechat', 'bilibili'].includes(platform));
const targets = await fetch((await import('./local-installed-debug.mjs')).installedDebugUrl, { signal: AbortSignal.timeout(3000) }).then(r => r.json());
const target = targets.find(t => t.type === 'page' && t.url.startsWith('http://127.0.0.1:3210/app/'));
assert.ok(target, 'Installed Matrix diagnostic page missing');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data), task = pending.get(message.id);
  if (!task) return;
  pending.delete(message.id); clearTimeout(task.timer);
  message.error ? task.reject(Error(message.error.message)) : task.resolve(message.result);
});
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timed out')); }, 45000);
  pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description?.slice(0, 220) || 'Installed diagnostic failed');
  return result.result?.value;
};
const context = `function context(kind){const element=document.querySelector('.matrix-shell');if(!element)throw Error('Please log in to Matrix');let fiber=element[Object.keys(element).find(k=>k.startsWith('__reactFiber'))];for(;fiber;fiber=fiber.return){const value=fiber.memoizedProps?.value;if(kind==='workspace'&&typeof value?.openAccount==='function'&&typeof value?.publisher==='function')return value;if(kind==='queue'&&typeof value?.queue?.start==='function')return value;}throw Error('Workspace context unavailable')}`;
const account = `const workspace=context('workspace');const selected=workspace.accounts.filter(a=>a.platform===${JSON.stringify(platform)}&&a.connectorSessionId);const account=selected.find(a=>a.nickname==='Siyu肆')||selected[0];if(!account)throw Error('No bound account for this platform');`;
const input = `const publisher=workspace.publisher(account.id,true);if(!publisher)throw Error('Publish page not prepared');const input=publisher.input();`;
try {
  if (command === 'manage') {
    await evaluate("location.hash='#/accounts';true");
    for(let attempt=0;attempt<100;attempt++){if(await evaluate(`(()=>{${context};return context('workspace').scope==='/accounts'})()`))break;await new Promise(r=>setTimeout(r,100));}
    console.log(JSON.stringify(await evaluate(`(async()=>{${context};${account}if(context('queue').queue.running)throw Error('Queue active');return{opened:await workspace.openAccount(account,'manage'),platform:account.platform,reconnect:false};})()`)));
  } else if (command === 'native-entry') {
    assert.equal(platform,'wechat');
    console.log(JSON.stringify(await evaluate(`(async()=>{${context};${account}${input}if(context('queue').queue.running)throw Error('Queue active');const result=await window.matrixDesktop.openEdgePublishEntry({...input,mediaType:'video'});return{...result,uploads:0,finalSubmissions:0};})()`)));
  } else if (command === 'native-profile' || command === 'native-root-home') {
    assert.equal(platform,'wechat');
    console.log(JSON.stringify(await evaluate(`(async()=>{${context};if(context('queue').queue.running)throw Error('Queue active');const background=document.querySelector('[data-edge-publish-job]'),foreground=document.querySelector('[data-edge-guest-id]');const guestId=background?.getAttribute('data-edge-publish-job')||foreground?.getAttribute('data-edge-guest-id');if(!guestId)throw Error('No native guest');const accessToken=localStorage.getItem('matrix_token')||sessionStorage.getItem('matrix_token');${command === 'native-root-home' ? "if(!background)throw Error('Only unedited diagnostic background page may navigate');const n=await window.matrixDesktop.controlEdgeGuest({guestId,accessToken,command:'navigate',url:'https://channels.weixin.qq.com/platform'});if(n.error)throw Error(n.error);await new Promise(r=>setTimeout(r,4000));" : ''}const result=await window.matrixDesktop.bindEdgeGuest({guestId,accessToken});return{background:!!background,...result};})()`)));
  } else if (command === 'cancel-native-preparation') {
    const result=await evaluate(`(async()=>{${context};const q=context('queue').queue,test=window.__matrixCorePrivateCheck;if(!test?.jobs.wechat)throw Error('No owned Wechat test');const active=q.jobs.filter(j=>['scheduled','queued','preparing','uploading','filling','reviewing','confirming','submitting'].includes(j.stage));if(active.length!==1||active[0].id!==test.jobs.wechat||active[0].stage!=='preparing')throw Error('Not the unuploaded native test; no close sent');test.wechatBlockedReason='本人已扫码登录，但独立后台发布页持续无法通过本人身份就绪校验，尚未上传；本次核验已主动停止';q.stop();const views=[...document.querySelectorAll('[data-edge-publish-job]')].map(e=>e.getAttribute('data-edge-publish-job')).filter(Boolean);if(views.length!==1)throw Error('Native test guest is not unique');const accessToken=localStorage.getItem('matrix_token')||sessionStorage.getItem('matrix_token');const closed=await window.matrixDesktop.controlEdgeGuest({guestId:views[0],accessToken,command:'close'});if(closed.error)throw Error(closed.error);return{onlyUnuploadedTestStopped:true,foregroundLoginPreserved:true,platform:'wechat'};})()`);
    console.log(JSON.stringify(result));
  } else if (command === 'report') {
    const report=await evaluate(`(()=>{${context};const q=context('queue').queue,test=window.__matrixCorePrivateCheck;if(!test)throw Error('No test run');const jobs=q.jobs.filter(j=>Object.values(test.jobs).includes(j.id));if(q.running||jobs.some(j=>['scheduled','queued','preparing','uploading','filling','reviewing','confirming','submitting'].includes(j.stage)))throw Error('Verification still running');return {title:test.title,startedAt:test.createdAt,checkedAt:new Date().toISOString(),installedVersion:'2.10.0-rc.29',realPlatformPages:true,syntheticDocuments:false,finalSubmissionTriggeredByTest:false,verifiedNewPublications:jobs.filter(j=>j.stage==='confirmed').length,originalRecordsRetained:q.jobs.length-jobs.length,jobs:jobs.map(j=>({taskId:j.id,platform:j.platform,stage:j.stage,message:j.message,submission:j.submission,history:j.history})),latestReadOnlyVisibility:window.__matrixCorePrivateEvidence?{platform:window.__matrixCorePrivateEvidence.platform,visibility:window.__matrixCorePrivateEvidence.visibility,titleMatches:window.__matrixCorePrivateEvidence.titleMatches}:undefined,wechatBlockedReason:test.wechatBlockedReason};})()`);
    assert.equal(report.verifiedNewPublications,0);
    assert.ok(report.jobs.every(j=>j.submission==='not_submitted'));
    fs.mkdirSync('logs',{recursive:true});
    fs.writeFileSync('logs/core-publish-live-20261015.json',JSON.stringify(report,null,2));
    console.log(JSON.stringify({report:'logs/core-publish-live-20261015.json',originalRecordsRetained:report.originalRecordsRetained,testRecords:report.jobs.length,newPublications:report.verifiedNewPublications,allNewTestsNotSubmitted:true}));
  } else if (command === 'cover-state') {
    assert.notEqual(platform, 'wechat');
    const result=await evaluate(`(async()=>{${context};${account}${input}const view=[...document.querySelectorAll('webview')].find(v=>{try{return v.getWebContentsId()===input.webContentsId}catch{return false}});if(!view)throw Error('Owned guest missing');return await view.executeJavaScript(${JSON.stringify(`(()=>{const visible=e=>!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';return{dialogs:[...document.querySelectorAll('[role=dialog],[class*=crop],[class*=Crop],[class^=container-]')].filter(e=>visible(e)&&/封面|裁剪/.test(e.innerText)).map(e=>({className:e.className,role:e.getAttribute('role'),text:e.innerText.slice(0,280)})).slice(0,8),buttons:[...document.querySelectorAll('button,[role=button]')].filter(e=>visible(e)&&/^(确定|确认|完成|保存封面|确认封面|应用|暂不设置|设置横封面)$/.test(e.innerText.trim())).map(e=>({text:e.innerText.trim(),disabled:e.disabled,ariaDisabled:e.getAttribute('aria-disabled'),className:e.className,parent:e.parentElement.className}))}})()`)});})()`);
    const work = await evaluate(`(async()=>{${context};${account}${input}const view=[...document.querySelectorAll('webview')].find(v=>{try{return v.getWebContentsId()===input.webContentsId}catch{return false}});return await view.executeJavaScript('(()=>{const w=window.__matrixCoverWork;return w?{index:w.index,uploaded:w.uploaded,confirmClicked:w.confirmClicked,beforePreviewPresent:!!w.before}:null})()');})()`);
    console.log(JSON.stringify({platform,...result,work}));
  } else if (command === 'read-private') {
    assert.notEqual(platform, 'wechat');
    const result = await evaluate(`(async()=>{${context};${account}${input}const test=window.__matrixCorePrivateCheck;if(!test)throw Error('No current private test');const view=[...document.querySelectorAll('webview')].find(v=>{try{return v.getWebContentsId()===input.webContentsId}catch{return false}});if(!view)throw Error('Owned guest missing');const observed=await view.executeJavaScript(${JSON.stringify(`(expected=>{const visibility=(${publishVisibility.toString()})('read',{platform:${JSON.stringify(platform)},expected:'仅自己可见'});const matching=[...document.querySelectorAll('input,textarea')].filter(e=>e.getClientRects().length&&e.value===expected);return{...visibility,titleMatches:matching.length===1,url:location.origin+location.pathname}})`)}+'('+JSON.stringify(test.title)+')');const evidence={platform:account.platform,nickname:account.nickname,title:test.title,...observed,checkedAt:Date.now()};window.__matrixCorePrivateEvidence=evidence;return evidence;})()`);
    assert.equal(result.visibility, '仅自己可见'); assert.equal(result.titleMatches, true);
    console.log(JSON.stringify(result));
  } else if (command === 'test-state') {
    console.log(JSON.stringify(await evaluate(`(()=>{${context};const q=context('queue').queue,test=window.__matrixCorePrivateCheck;return {running:q.running,title:test?.title,jobs:q.jobs.filter(j=>Object.values(test?.jobs||{}).includes(j.id)).map(j=>({id:j.id,platform:j.platform,stage:j.stage,message:j.message,uploadPercent:j.uploadPercent,submission:j.submission,history:j.history.slice(-3)}))}})()`)));
  } else if (command === 'seed') {
    const prepared = await evaluate("!!window.__matrixCorePrivateCheck");
    assert.equal(prepared, false, 'Private test already prepared; reuse it instead of duplicating');
    const imports = {};
    for (const [type, file] of [['video', 'C:/Users/10985/Desktop/新媒体/健身/第十二天/薄肌重启计划第十二天.mp4'], ['image', 'C:/Users/10985/Desktop/新媒体/健身/第十二天/薄肌重启计划第十二天.jpg']]) {
      assert.ok(fs.statSync(file).isFile());
      const id = 'matrix-private-check-' + type;
      await evaluate(`(()=>{const input=document.createElement('input');input.type='file';input.id=${JSON.stringify(id)};input.hidden=true;document.body.append(input);return true})()`);
      const handle = await call('Runtime.evaluate', { expression: `document.getElementById(${JSON.stringify(id)})`, returnByValue: false });
      await call('DOM.setFileInputFiles', { objectId: handle.result.objectId, files: [file] });
      await call('Runtime.releaseObject', { objectId: handle.result.objectId });
      imports[type] = await evaluate(`(async()=>{const element=document.getElementById(${JSON.stringify(id)});try{const result=await window.matrixDesktop.importMedia([...element.files],${JSON.stringify(type)});if(result.error)throw Error(result.error);window.__matrixCorePrivateAssets=window.__matrixCorePrivateAssets||{};window.__matrixCorePrivateAssets[${JSON.stringify(type)}]=result.selection;return{files:result.selection.files.map(f=>({name:f.name,size:f.size}))};}finally{element.remove();}})()`);
    }
    const result = await evaluate(`(()=>{const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()).replace(':','');window.__matrixCorePrivateCheck={title:'薄肌重启计划第十二天·自测'+clock,createdAt:new Date().toISOString(),jobs:{}};return{title:window.__matrixCorePrivateCheck.title,visibility:'仅自己可见',finalConfirmationAutomatic:false}})()`);
    console.log(JSON.stringify({ ...result, imports, uploads: 0, submissions: 0 }));
  } else if (command === 'start') {
    const result = await evaluate(`(()=>{${context};${account}const q=context('queue').queue,test=window.__matrixCorePrivateCheck,assets=window.__matrixCorePrivateAssets;if(!test||!assets?.video||!assets.image)throw Error('Prepare the authorized private-test media first');if(q.running)throw Error('A publish task is already running');if(test.jobs[account.platform])throw Error('This platform already has a test record; do not create a duplicate');const config={title:test.title,body:'仅自己可见的发布功能验证，不作公开发布。',topics:[],comment:'',options:{visibility:'仅自己可见'},covers:[{id:assets.image.id,name:assets.image.files[0].name,index:1}],schedule:{mode:'now'}};const batchId=q.start([{account,config,media:assets.video}]);const job=q.jobs.find(j=>j.batchId===batchId&&j.accountId===account.id);test.jobs[account.platform]=job.id;return{platform:account.platform,nickname:account.nickname,taskId:job.id,title:test.title,visibility:config.options.visibility,finalConfirmationAutomatic:false};})()`);
    console.log(JSON.stringify(result));
  } else if (command === 'stop') {
    const result = await evaluate(`(()=>{${context};const q=context('queue').queue,test=window.__matrixCorePrivateCheck;if(!test)throw Error('Not this private test');const active=q.jobs.filter(j=>['scheduled','queued','preparing','uploading','filling','reviewing','confirming','submitting'].includes(j.stage));if(active.some(j=>!Object.values(test.jobs).includes(j.id)))throw Error('Another task is active; no stop sent');q.stop();return{testStopRequested:true,active:active.map(j=>({platform:j.platform,stage:j.stage}))}})()`);
    console.log(JSON.stringify(result));
  } else if (command === 'native-state') {
    console.log(JSON.stringify(await evaluate(`(()=>{const rows=[];for(const element of document.querySelectorAll('[data-edge-publish-job],[data-edge-guest-id]')){let fiber=element[Object.keys(element).find(k=>k.startsWith('__reactFiber'))];for(;fiber;fiber=fiber.return){if(fiber.memoizedProps?.tab?.platform!=='wechat')continue;let state=fiber.memoizedState;for(;state;state=state.next){const value=state.memoizedState;if(value&&typeof value==='object'&&typeof value.url==='string'&&typeof value.ready==='boolean')rows.push({url:value.url,title:value.title,ready:value.ready,error:value.error,loginLoop:value.loginLoop});}break;}}return rows;})()`)));
  } else if (command === 'reauth') {
    assert.equal(platform, 'wechat');
    await call('Page.bringToFront');
    await evaluate(`(()=>{${context};const w=context('workspace');if(context('queue').queue.running)throw Error('Publish task running');for(const tab of w.tabs.filter(t=>t.platform==='wechat'&&t.background))w.close(tab.id);location.hash='#/accounts';return true;})()`);
    for(let attempt=0;attempt<100;attempt++) { if(await evaluate(`(()=>{${context};return context('workspace').scope==='/accounts'})()`))break;await new Promise(r=>setTimeout(r,100)); }
    console.log(JSON.stringify(await evaluate(`(async()=>{${context};${account}const opened=await workspace.openAccount(account,'manage',true);return {platform:account.platform,nickname:account.nickname,officialLoginOpened:opened};})()`)));
  } else if (command === 'state') {
    const result = await evaluate(`(async()=>{${context};const w=context('workspace'),q=context('queue');return {route:location.hash,accounts:w.accounts.map(a=>({platform:a.platform,nickname:a.nickname,localSession:!!a.connectorSessionId,status:a.authStatus})),running:q.queue.running,jobs:q.jobs.map(j=>({id:j.id,platform:j.platform,title:j.title,stage:j.stage,message:j.message,submission:j.submission})),tabs:w.tabs.map(t=>({id:t.id,platform:t.platform,nickname:t.nickname,intent:t.intent,background:!!t.background})),nativePages:[...document.querySelectorAll('[data-edge-guest-id]')].map(e=>({url:e.getAttribute('data-edge-url')}))};})()`);
    console.log(JSON.stringify(result));
  } else if (command === 'open') {
    await call('Page.bringToFront');
    const result = await evaluate(`(async()=>{${context};${account}const queue=context('queue').queue;if(queue.running)throw Error('Another publish task is running');const cover=[...document.querySelectorAll('.matrix-additional-workspaces header button')].find(b=>b.innerText.includes('收起'));if(cover)cover.click();location.hash='#/publish/tasks';const opened=await workspace.openAccount(account,'publish',false,undefined,undefined,true);return{platform:account.platform,nickname:account.nickname,opened};})()`);
    assert.equal(result.opened, true);
    let outcome;
    for (let attempt = 0; attempt < 150; attempt++) {
      outcome = await evaluate(`(()=>{${context};${account}try{${input}return{ready:true};}catch{return{ready:false}}})()`);
      if (outcome.ready) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.equal(outcome.ready, true, 'Owned official page did not become ready');
    const opened = await evaluate(`(async()=>{${context};${account}${input}await publisher.open('video',true);return{platform:account.platform,editorOpened:true,uploads:0,submissions:0}})()`);
    console.log(JSON.stringify(opened));
  } else if (command === 'progress' || command === 'plan') {
    const result = await evaluate(`(async()=>{${context};${account}${input}const result=await window.matrixDesktop.${command === 'progress' ? "syncPublishForm({...input,command:'progress'})" : "inspectPageAction({...input,kind:'publish',expectedVisibility:'仅自己可见'})"};const {nonce,...safe}=result;return safe;})()`);
    console.log(JSON.stringify({ platform, ...result }));
  } else {
    assert.notEqual(platform, 'wechat', 'Native WebView2 does not expose arbitrary DOM execution to the renderer');
    const result = await evaluate(`(async()=>{${context};${account}${input}const view=[...document.querySelectorAll('webview')].find(v=>{try{return v.getWebContentsId()===input.webContentsId}catch{return false}});if(!view)throw Error('Owned guest missing');return await view.executeJavaScript(${JSON.stringify(`(()=>{const visible=e=>!!e.getClientRects().length;return{url:location.origin+location.pathname,title:document.title,inputs:[...document.querySelectorAll('input,textarea,[contenteditable=true],select')].map(e=>({type:e.type||e.tagName.toLowerCase(),placeholder:e.getAttribute('placeholder'),label:e.getAttribute('aria-label'),accept:e.getAttribute('accept'),maximum:e.getAttribute('maxlength'),visible:visible(e)})).slice(0,60),actions:[...document.querySelectorAll('button,[role=button]')].filter(visible).map(e=>(e.innerText||e.getAttribute('aria-label')||'').trim()).filter(t=>t&&t.length<40).slice(0,70),privacyLabels:[...document.querySelectorAll('label,[role=radio],[role=combobox]')].filter(visible).map(e=>(e.innerText||e.getAttribute('aria-label')||'').trim()).filter(t=>/可见|自己|私密|所有人|好友/.test(t)).slice(0,20)}})()`)});})()`);
    fs.mkdirSync('logs', { recursive: true });
    fs.writeFileSync(`logs/core-${platform}-editor-structure.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ platform, ...result }));
  }
} finally { socket.close(); }
