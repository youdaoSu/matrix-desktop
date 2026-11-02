// User-approved, read-only platform verification; never clicks publish/retry or sends messages.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const port=process.argv[2]||'9491';
const targets=await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(3000)}).then(response=>response.json());
const target=targets.find(target=>target.type==='page'&&target.url.startsWith('http://127.0.0.1:3210/app/'));
assert.ok(target,'Installed application target missing');
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
let seq=0;const pending=new Map();
socket.addEventListener('message',event=>{const message=JSON.parse(event.data),item=pending.get(message.id);if(item){clearTimeout(item.timer);pending.delete(message.id);message.error?item.reject(Error(message.error.message)):item.resolve(message.result);}});
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'));},45000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error('Installed result check failed');return result.result.value;};
try{
  const before=await evaluate(`(()=>{const owner=JSON.parse(localStorage.getItem('matrix_user')||sessionStorage.getItem('matrix_user'));if(!owner?.id)throw Error('Login required');return JSON.parse(localStorage.getItem('matrix-publish-progress:'+owner.id)||'[]').length})()`);
  const verification=await evaluate(`(async()=>{const token=localStorage.getItem('matrix_token')||sessionStorage.getItem('matrix_token');const listed=await window.matrixDesktop.listPageActions(token);const rows=listed.items.filter(receipt=>receipt.kind==='publish'&&receipt.nickname==='Siyu肆'&&receipt.summary.startsWith('薄肌重启计划第十二天')&&receipt.visibility==='仅自己可见');const results=[];for(const platform of ['douyin','xiaohongshu']){const row=rows.find(row=>row.platform===platform);if(!row)throw Error('Original receipt missing');const result=await window.matrixDesktop.verifyPublishResult({accessToken:token,receiptId:row.id});results.push({platform,status:result.receipt?.status,error:result.error,privateVerified:result.receipt?.evidence?.visibility==='仅自己可见'});}window.dispatchEvent(new Event('matrix:page-actions-updated'));return results})()`);
  assert.equal(verification.length,2);assert.ok(verification.every(result=>result.status==='confirmed'&&result.privateVerified),'Original private submissions not both confirmed');
  await evaluate("location.hash='#/publish/tasks';true");
  let ui;
  for(let attempt=0;attempt<100;attempt++){
    ui=await evaluate(`(()=>{const rows=[...document.querySelectorAll('[data-publish-job]')];const successes=rows.filter(row=>row.querySelector('.matrix-task-account')?.innerText.includes('Siyu肆')&&row.querySelector('.matrix-task-identity')?.innerText.includes('薄肌重启计划第十二天')&&row.querySelector('.matrix-task-status')?.innerText.includes('发布成功'));return{rows:rows.length,successes:successes.length,successHasVerifyOrRetry:successes.some(row=>[...row.querySelectorAll('.matrix-task-status button')].some(button=>/核对|重发|刷新状态/.test(button.innerText)))}})()`);
    if(ui.successes===2)break;await new Promise(resolve=>setTimeout(resolve,200));
  }
  assert.equal(ui.rows,before);assert.equal(ui.successes,2);assert.equal(ui.successHasVerifyOrRetry,false);
  const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  fs.writeFileSync('logs/installed-rc22-publish-success.png',Buffer.from(shot.data,'base64'));
  console.log(JSON.stringify({originalPrivatePublications:verification,recordsBefore:before,recordsAfter:ui.rows,successfulUiRows:ui.successes,noSuccessRetryOrVerifyButton:!ui.successHasVerifyOrRetry,newPlatformPosts:0,actualPostsOrMessagesSent:false}));
}finally{socket.close();}
