// Real installed UI acceptance helper. Reuses only the four explicitly authorized
// unsubmitted diagnostic records. Never creates jobs or confirms native dialogs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { publishVisibility } = createRequire(import.meta.url)('../desktop/publish-visibility.cjs');
const { coverControl } = createRequire(import.meta.url)('../desktop/upload-controls.cjs');
const [command = 'state', platform = 'douyin', release = 'rc.32'] = process.argv.slice(2);
assert.match(release,/^rc\.\d+$/);
const version='2.10.0-'+release,reportTag=release.replace('.','');
const reportDate = new Date(Date.now() + 8 * 3600000).toISOString().slice(0,10).replaceAll('-','');
const ids = {
  douyin: '9b1c8791-4051-4009-a605-68326b6913fa',
  xiaohongshu: '80777047-59bb-4ad6-9855-c6d9606645d9',
  bilibili: '8d63d090-92cb-4da6-8510-08dcb6031517',
  wechat: '90ff089c-40e9-407c-9fdb-c3b3b001db23',
};
assert.ok(['state', 'retry', 'privacy', 'stop-unsubmitted', 'end-unsubmitted', 'result', 'receipt', 'describe', 'check-cover-entry', 'check-bili-settings', 'resume-bili-cover'].includes(command));
assert.ok(Object.hasOwn(ids, platform));
const targets = await fetch((await import('./local-installed-debug.mjs')).installedDebugUrl,{signal:AbortSignal.timeout(3000)}).then(r => r.json());
const target = targets.find(t => t.type === 'page' && t.url.startsWith('http://127.0.0.1:3210/app/'));
assert.ok(target, 'Installed diagnostic page unavailable');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const result = JSON.parse(event.data), task = pending.get(result.id);
  if (!task) return;
  pending.delete(result.id); clearTimeout(task.timer);
  result.error ? task.reject(Error(result.error.message)) : task.resolve(result.result);
});
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error('Diagnostic timeout')); }, 45000);
  pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description?.slice(0, 350) || 'Diagnostic failed');
  return result.result?.value;
};
const context = `function context(kind){const e=document.querySelector('.matrix-shell');if(!e)throw Error('Matrix login required');let f=e[Object.keys(e).find(k=>k.startsWith('__reactFiber'))];for(;f;f=f.return){const v=f.memoizedProps?.value;if(kind==='workspace'&&typeof v?.publisher==='function'&&typeof v?.openAccount==='function')return v;if(kind==='queue'&&typeof v?.queue?.start==='function')return v;}throw Error('Missing context')}`;
const owned = `const q=context('queue').queue,w=context('workspace'),j=q.jobs.find(j=>j.id===${JSON.stringify(ids[platform])});if(!j||j.platform!==${JSON.stringify(platform)}||j.title!=='薄肌重启计划第十二天·自测1826'||j.config?.options?.visibility!=='仅自己可见'||!j.recoveryId)throw Error('Unexpected diagnostic record/config');const a=w.accounts.find(a=>a.id===j.accountId&&a.platform===j.platform);if(!a?.connectorSessionId||a.nickname!==j.nickname)throw Error('Bound account changed');`;
try {
  const installed = await evaluate(`(async()=>{const r=await window.matrixDesktop.systemSettings({command:'read'});return r.version;})()`);
  assert.equal(installed, version, 'Requested test build is not installed');
  const recordIds = await evaluate(`(()=>{${context};return context('queue').queue.jobs.map(j=>j.id).sort();})()`);
  assert.equal(new Set(recordIds).size, recordIds.length, 'Duplicate task IDs');
  if (command === 'resume-bili-cover') {
    assert.equal(platform,'bilibili');
    const script=`(()=>{if(location.origin!=='https://member.bilibili.com'||location.pathname!=='/platform/upload/video/frame')throw Error('Wrong editor');const visible=e=>e.getClientRects().length&&getComputedStyle(e).display!=='none';if([...document.querySelectorAll('.cover-editor,.videoup-confirm-modal')].some(visible))throw Error('Cover editor not saved');if(![...document.querySelectorAll('.cover-module-main .cover-img')].some(e=>visible(e)&&getComputedStyle(e).backgroundImage!=='none'))throw Error('No saved main cover');if(![...document.querySelectorAll('input')].some(e=>e.value==='薄肌重启计划第十二天·自测1826'))throw Error('Title changed');if((${publishVisibility.toString()})('read',{platform:'bilibili'}).visibility!=='仅自己可见')throw Error('Private choice changed');return{savedMainCover:true,visibility:'仅自己可见',titleVerified:true}})()`;
    const result=await evaluate(`(async()=>{${context};${owned}if(q.running||j.stage!=='attention'||j.submission!=='not_submitted'||j.receiptId||!q.canResume(j.batchId)||q.jobs.filter(t=>t.batchId===j.batchId).length!==1)throw Error('Not the independent resumable preparation');const p=w.publisher(a.id,true),i=p?.input(),view=i&&[...document.querySelectorAll('webview')].find(v=>{try{return v.getWebContentsId()===i.webContentsId}catch{return false}});if(!view)throw Error('Owned editor missing');const verified=await view.executeJavaScript(${JSON.stringify(script)});q.resume(j.batchId);return{...verified,taskId:j.id,attemptId:j.attemptId,samePreparationResumed:true,noReupload:true,finalConfirmationAutomatic:false};})()`);
    fs.writeFileSync('logs/core-private-'+reportTag+'-bilibili-cover-resume.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  } else if (command === 'check-bili-settings') {
    assert.equal(platform, 'bilibili');
    const script = `(()=>{try{if(location.origin!=='https://member.bilibili.com'||location.pathname!=='/platform/upload/video/frame')throw Error('Unexpected official editor');const title=document.querySelector('input[placeholder*=标题]');if(title?.value!=='薄肌重启计划第十二天·自测1826')throw Error('Unexpected diagnostic title');const modals=[...document.querySelectorAll('.cover-editor.bcc-dialog__wrap')].filter(e=>e.getClientRects().length&&getComputedStyle(e).display!=='none');if(modals.length>1)throw Error('Cover dialog ambiguous');if(modals.length===1){if([...modals[0].querySelectorAll('input[type=file]')].some(e=>e.files.length))throw Error('Unsaved uploaded cover exists');const cancel=[...modals[0].querySelectorAll('.cover-editor-button > .button')].filter(e=>e.innerText.trim()==='取消');if(cancel.length!==1)throw Error('No unique cancel');cancel[0].click();}return (${publishVisibility.toString()})('select',{platform:'bilibili',expected:'仅自己可见'});}catch(error){return{error:error.message}}})()`;
    const result=await evaluate(`(async()=>{${context};${owned}if(q.running||j.submission!=='not_submitted'||j.receiptId)throw Error('Not an idle unsubmitted diagnostic editor');const p=w.publisher(a.id,true),input=p?.input(),view=input&&[...document.querySelectorAll('webview')].find(v=>{try{return v.getWebContentsId()===input.webContentsId}catch{return false}});if(!view)throw Error('Owned guest missing');const login=await window.matrixDesktop.completePlatformLogin({platform:a.platform,sessionId:a.connectorSessionId,webContentsId:input.webContentsId});if(login.error||login.nickname!==a.nickname)throw Error('Official identity not verified');let result;for(let n=0;n<3;n++){result=await view.executeJavaScript(${JSON.stringify(script)});if(result.visibility==='仅自己可见')break;await new Promise(r=>setTimeout(r,350));}if(result?.visibility!=='仅自己可见')throw Error('Private selection not confirmed');return{platform:j.platform,taskId:j.id,nickname:a.nickname,title:j.title,visibility:result.visibility,noFileUploadOrSubmit:true,checkedAt:new Date().toISOString()};})()`);
    fs.writeFileSync('logs/core-private-'+reportTag+'-bilibili-settings.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  } else if (command === 'check-cover-entry') {
    assert.equal(platform,'xiaohongshu');
    const result=await evaluate(`(async()=>{${context};${owned}if(q.running||j.submission!=='not_submitted')throw Error('Only an idle unsubmitted diagnostic editor may be inspected');const p=w.publisher(a.id,true),input=p?.input(),view=input&&[...document.querySelectorAll('webview')].find(v=>{try{return v.getWebContentsId()===input.webContentsId}catch{return false}});if(!view)throw Error('Owned test page missing');const login=await window.matrixDesktop.completePlatformLogin({platform:a.platform,sessionId:a.connectorSessionId,webContentsId:input.webContentsId});if(login.error||login.nickname!==a.nickname)throw Error('Official identity not verified');const script=${JSON.stringify(`(()=>{const privacy=(${publishVisibility.toString()})('read',{platform:'xiaohongshu'});if(privacy.visibility!=='仅自己可见'||![...document.querySelectorAll('input')].some(e=>e.value==='薄肌重启计划第十二天·自测1826'))throw Error('Not the authorized private diagnostic editor');return (${coverControl.toString()})('open',{platform:'xiaohongshu',index:1});})()`)};return{platform:a.platform,taskId:j.id,scope:'open cover editor only; no upload or final submit',result:await view.executeJavaScript(script)};})()`);
    console.log(JSON.stringify(result));
  } else if (command === 'describe') {
    const result=await evaluate(`(async()=>{${context};${owned}if(q.running)throw Error('Wait for the active test before reading editor diagnostics');const p=w.publisher(a.id,true);if(!p)throw Error('No diagnostic publisher');const result=await window.matrixDesktop.syncPublishForm({...p.input(),command:'describe'});if(result.error)throw Error(result.error);return{platform:j.platform,taskId:j.id,checkedAt:new Date().toISOString(),...result};})()`);
    fs.writeFileSync('logs/core-private-'+reportTag+'-'+platform+'-controls.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  } else if (command === 'receipt') {
    const result=await evaluate(`(async()=>{${context};${owned}if(q.running||!j.receiptId)throw Error('Wait for a completed diagnostic receipt');const accessToken=localStorage.getItem('matrix_token')||sessionStorage.getItem('matrix_token');const list=await window.matrixDesktop.listPageActions(accessToken);if(list.error)throw Error(list.error);const matches=(list.items||[]).filter(r=>r.id===j.receiptId&&r.taskId===j.id&&r.attemptId===j.attemptId&&r.accountId===a.id&&r.visibility==='仅自己可见'&&r.expectedTitle===j.title);if(matches.length!==1)throw Error('No unique owned private diagnostic receipt');const r=matches[0];return{platform:j.platform,taskId:j.id,attemptId:j.attemptId,receiptId:r.id,status:r.status,message:r.message,visibility:r.visibility,expectedTitle:r.expectedTitle,evidence:r.evidence,verifiedAt:r.verifiedAt,completedAt:r.completedAt};})()`);fs.writeFileSync('logs/core-private-'+reportTag+'-'+platform+'-receipt.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  } else if (command === 'result') {
    assert.ok(['douyin','xiaohongshu'].includes(platform));
    const result=await evaluate(`(async()=>{${context};${owned}if(q.running||j.stage!=='unknown')throw Error('No idle uncertain diagnostic result to verify');const accessToken=localStorage.getItem('matrix_token')||sessionStorage.getItem('matrix_token');const list=await window.matrixDesktop.listPageActions(accessToken);if(list.error)throw Error(list.error);const matches=(list.items||[]).filter(r=>r.taskId===j.id&&r.attemptId===j.attemptId&&r.accountId===a.id&&r.expectedTitle===j.title&&r.visibility==='仅自己可见');if(matches.length!==1)throw Error('No unique owned receipt');const r=await window.matrixDesktop.verifyPublishResult({accessToken,receiptId:matches[0].id});if(r.error)return{platform:j.platform,taskId:j.id,error:r.error};if(r.receipt?.id!==matches[0].id)throw Error('Wrong receipt');q.operationReceipt(r.receipt);return{platform:j.platform,taskId:j.id,receiptId:r.receipt.id,status:r.receipt.status,message:r.receipt.message,visibility:r.receipt.visibility,evidence:r.receipt.evidence,verifiedAt:r.receipt.verifiedAt};})()`);
    fs.writeFileSync('logs/core-private-'+reportTag+'-'+platform+'-official-result.json',JSON.stringify(result,null,2));
    console.log(JSON.stringify(result));
  } else if (command === 'end-unsubmitted') {
    const result=await evaluate(`(()=>{${context};${owned}if(q.running||j.stage!=='attention'||j.submission!=='not_submitted'||j.receiptId)throw Error('Not an idle unsubmitted diagnostic preparation');const group=q.jobs.filter(item=>item.batchId===j.batchId);if(group.length!==1||group[0].id!==j.id)throw Error('Diagnostic batch is not independent');q.discard(j.batchId);return{taskId:j.id,endedUnsubmittedPreparation:true,records:q.jobs.length};})()`);console.log(JSON.stringify(result));
  } else if (command === 'stop-unsubmitted') {
    const result=await evaluate(`(()=>{${context};${owned}const active=q.jobs.filter(j=>['scheduled','queued','preparing','uploading','filling','reviewing','confirming','submitting'].includes(j.stage));if(active.length!==1||active[0].id!==j.id||j.submission!=='not_submitted'||!['preparing','uploading','filling','reviewing'].includes(j.stage))throw Error('Not the sole unsubmitted diagnostic preparation');context('queue').stop();const p=w.publisher(a.id,true),input=p?.input(),view=input&&[...document.querySelectorAll('webview')].find(v=>{try{return v.getWebContentsId()===input.webContentsId}catch{return false}});view?.stop();return{platform:j.platform,taskId:j.id,stopRequested:true,officialLoadingStopped:!!view,noFinalSubmitRequested:true};})()`);
    console.log(JSON.stringify(result));
  } else if (command === 'retry') {
    await evaluate("location.hash='#/publish/tasks';true");
    for (let i=0;i<100;i++) {
      if (await evaluate(`!!document.querySelector('[data-publish-job="${ids[platform]}"]')`)) break;
      await new Promise(r => setTimeout(r, 100));
    }
    const before = await evaluate(`(()=>{${context};${owned}if(q.running||q.jobs.some(j=>['scheduled','queued','preparing','uploading','filling','reviewing','confirming','submitting'].includes(j.stage)))throw Error('Another task is active');if(j.submission!=='not_submitted'||j.receiptId||!['failed','cancelled','interrupted'].includes(j.stage))throw Error('Not an explicitly unsubmitted retry');if(JSON.stringify(q.jobs.map(j=>j.id).sort())!==${JSON.stringify(JSON.stringify(recordIds))})throw Error('Records changed during check');const buttons=[...document.querySelector('[data-publish-job="${ids[platform]}"]').querySelectorAll('.matrix-task-status button')].filter(b=>b.innerText.trim()==='重发'&&!b.disabled);if(buttons.length!==1)throw Error('No unique enabled row retry');const before={attempt:j.attemptNumber||0,attemptId:j.attemptId};buttons[0].click();return before;})()`);
    console.log(JSON.stringify({ platform, taskId:ids[platform], sameRecordRetryRequested:true, previousAttempt:before, finalConfirmationAutomatic:false }));
  } else if (command === 'privacy') {
    assert.notEqual(platform, 'wechat', 'Native privacy must be read by its guarded product adapter');
    const script = `(expected=>{const privacy=(${publishVisibility.toString()})('read',{platform:${JSON.stringify(platform)},expected:'仅自己可见'});return{...privacy,titleMatches:[...document.querySelectorAll('input,textarea')].filter(e=>e.getClientRects().length&&e.value===expected).length===1,url:location.origin+location.pathname};})`;
    const evidence = await evaluate(`(async()=>{${context};${owned}if(j.stage!=='confirming')throw Error('No final review pending');const p=w.publisher(a.id,true);if(!p)throw Error('Missing owned publisher');const input=p.input(),view=[...document.querySelectorAll('webview')].find(v=>{try{return v.getWebContentsId()===input.webContentsId}catch{return false}});if(!view)throw Error('Owned guest missing');const result=await view.executeJavaScript(${JSON.stringify(script)}+'('+JSON.stringify(j.title)+')');return{platform:j.platform,taskId:j.id,nickname:a.nickname,title:j.title,...result,checkedAt:new Date().toISOString()};})()`);
    assert.equal(evidence.visibility, '仅自己可见'); assert.equal(evidence.titleMatches, true);
    fs.writeFileSync(`logs/core-private-${reportTag}-${platform}-preconfirm.json`, JSON.stringify(evidence,null,2));
    console.log(JSON.stringify(evidence));
  } else {
    const result=await evaluate(`(()=>{${context};const q=context('queue').queue;return{installedVersion:${JSON.stringify(version)},checkedAt:new Date().toISOString(),running:q.running,records:q.jobs.length,historicalSuccesses:q.jobs.filter(j=>['ad23960f-8ad8-4930-a268-53d3d1468b8f','bdb0f327-383d-4746-84ef-75467a73f88e'].includes(j.id)).map(j=>({id:j.id,stage:j.stage,submission:j.submission})),jobs:q.jobs.filter(j=>${JSON.stringify(Object.values(ids))}.includes(j.id)).map(j=>({id:j.id,platform:j.platform,nickname:j.nickname,title:j.title,stage:j.stage,message:j.message,submission:j.submission,attemptNumber:j.attemptNumber,attemptId:j.attemptId,receiptId:j.receiptId,uploadPercent:j.uploadPercent,history:j.history.slice(-8)}))};})()`);
    assert.equal(result.records,recordIds.length);
    assert.ok(result.historicalSuccesses.length===2&&result.historicalSuccesses.every(j=>j.stage==='confirmed'&&j.submission==='confirmed'));
    fs.writeFileSync('logs/core-publish-live-'+reportTag+'-'+reportDate+'.json',JSON.stringify(result,null,2));
    console.log(JSON.stringify(result));
  }
} finally { socket.close(); }
