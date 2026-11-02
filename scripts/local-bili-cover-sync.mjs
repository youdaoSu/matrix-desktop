// Scoped real-editor diagnostics for the user-authorized original Bilibili test.
// No final publish click. Never operates on another account/record/material.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { coverControl } = createRequire(import.meta.url)('../desktop/upload-controls.cjs');
const command = process.argv[2] || 'describe';
assert.ok(['describe', 'finish', 'save-after-sync'].includes(command));
const targets = await fetch('http://127.0.0.1:9491/json/list').then(r => r.json());
async function connect(target) {
  assert.ok(target);
  const ws = new WebSocket(target.webSocketDebuggerUrl), pending = new Map(); let seq = 0;
  await new Promise((r,j) => { ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true}); });
  ws.addEventListener('message',e => { const m=JSON.parse(e.data),p=pending.get(m.id);if(!p)return;clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result); });
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('Diagnostic timeout'));},12000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async(expression,contextId)=>{const r=await call('Runtime.evaluate',{expression,contextId,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;};
  return {ws,call,evaluate};
}
const main=await connect(targets.find(t=>t.type==='page'&&t.url.startsWith('http://127.0.0.1:3210/app/')));
let guest;
try {
  const identity=await main.evaluate(`(async()=>{let f=document.querySelector('.matrix-shell');f=f[Object.keys(f).find(k=>k.startsWith('__reactFiber'))];let w,q;for(;f;f=f.return){const v=f.memoizedProps?.value;if(v?.publisher&&v?.openAccount)w=v;if(v?.queue?.start)q=v.queue;}const j=q?.jobs.find(j=>j.id==='8d63d090-92cb-4da6-8510-08dcb6031517');if(q.running||j?.submission!=='not_submitted'||j.receiptId||j.platform!=='bilibili'||j.title!=='薄肌重启计划第十二天·自测1826'||j.config?.options.visibility!=='仅自己可见')throw Error('Not the idle unsubmitted private diagnostic');const a=w.accounts.find(a=>a.id===j.accountId&&a.nickname==='sky肆宇'&&a.platform==='bilibili'),p=a&&w.publisher(a.id,true),i=p?.input();if(!i)throw Error('Owned publisher missing');const login=await window.matrixDesktop.completePlatformLogin({platform:a.platform,sessionId:a.connectorSessionId,webContentsId:i.webContentsId});if(login.error||login.nickname!==a.nickname)throw Error('Official identity mismatch');return{taskId:j.id,attemptId:j.attemptId,nickname:a.nickname};})()`);
  const guests=targets.filter(t=>t.type==='webview'&&t.url==='https://member.bilibili.com/platform/upload/video/frame');assert.equal(guests.length,1);
  guest=await connect(guests[0]);
  const {frameTree}=await guest.call('Page.getFrameTree');
  const {executionContextId}=await guest.call('Page.createIsolatedWorld',{frameId:frameTree.frame.id,worldName:'matrix-upload-controls'});
  const guard=`if(location.href!=='https://member.bilibili.com/platform/upload/video/frame'||![...document.querySelectorAll('input')].some(e=>e.value==='薄肌重启计划第十二天·自测1826'))throw Error('Wrong editor');const files=[...document.querySelectorAll('input[type=file]')].flatMap(e=>[...e.files]);if(!files.some(f=>f.name==='薄肌重启计划第十二天.mp4'&&f.size===13924772)||!files.some(f=>f.name==='薄肌重启计划第十二天.jpg'&&f.size===1683898))throw Error('Wrong diagnostic media');`;
  let result;
  if(command==='describe') result=await guest.evaluate(`(()=>{${guard}const visible=e=>e.getClientRects().length&&getComputedStyle(e).display!=='none';const dialogs=[...document.querySelectorAll('.videoup-confirm-modal')].filter(visible);return{dialogs:dialogs.map(d=>({text:d.innerText,controls:[...d.querySelectorAll('button,[role=button],div,span')].filter(e=>visible(e)&&(e.innerText||'').trim().length<30&&![...e.children].some(c=>c.innerText===e.innerText)).map(e=>({tag:e.tagName,className:e.className,text:e.innerText.trim()}))})),work:window.__matrixCoverWork?{index:window.__matrixCoverWork.index,uploaded:window.__matrixCoverWork.uploaded,confirmClicked:window.__matrixCoverWork.confirmClicked}:null};})()`,executionContextId);
  else {
    // A separate CDP session cannot access the app's isolated nonce/work state.
    // Complete only the normally rendered prompt as an operator would; do not
    // inject a fake work acknowledgement into the product's isolated world.
    if(command==='finish') await guest.evaluate(`(()=>{${guard}const visible=e=>e.getClientRects().length&&getComputedStyle(e).display!=='none';const prompts=[...document.querySelectorAll('.videoup-confirm-modal')].filter(e=>visible(e)&&e.querySelector('.modal-header')?.textContent.trim()==='检测到个人空间封面（16:9）未修改'&&/4:3封面/.test(e.innerText));if(prompts.length!==1)throw Error('No unique cover sync prompt');const buttons=[...prompts[0].querySelectorAll('.modal-footer span')].filter(e=>visible(e)&&e.textContent.trim()==='确认同步');if(buttons.length!==1)throw Error('No unique cover sync action');buttons[0].click();return true;})()`,executionContextId);
    else await guest.evaluate(`(()=>{${guard}const visible=e=>e.getClientRects().length&&getComputedStyle(e).display!=='none';if([...document.querySelectorAll('.videoup-confirm-modal')].some(visible))throw Error('Unresolved cover confirmation');const buttons=[...document.querySelectorAll('.cover-editor-button > .button.submit')].filter(e=>visible(e)&&e.textContent.trim()==='完成');if(buttons.length!==1)throw Error('No unique cover save');buttons[0].click();return true;})()`,executionContextId);
    for(let n=0;n<25;n++){result=await guest.evaluate(`(()=>{if(![...document.querySelectorAll('input')].some(e=>e.value==='薄肌重启计划第十二天·自测1826'))throw Error('Editor title changed');const visible=e=>e.getClientRects().length&&getComputedStyle(e).display!=='none';return{coverConfirmed:![...document.querySelectorAll('.cover-editor.bcc-dialog__wrap,.videoup-confirm-modal')].some(visible)&&[...document.querySelectorAll('.cover-module-main img:not(.add-icon)')].some(e=>e.naturalWidth>0),normalOfficialCoverPromptClicked:true};})()`,executionContextId);if(result.coverConfirmed)break;await new Promise(r=>setTimeout(r,350));}
    assert.equal(result.coverConfirmed,true,'Cover has not been acknowledged by the official editor');
  }
  const evidence={...identity,command,result,checkedAt:new Date().toISOString(),filesReuploaded:false,finalPublishClicked:false};
  fs.writeFileSync('logs/rc36-bilibili-cover-'+command+'.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{guest?.ws.close();main.ws.close();}
