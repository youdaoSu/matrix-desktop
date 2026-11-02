// Read-only detail/playback checks on existing tasks. No retry/publish/comment/message actions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const port=process.argv[2]||'9491';
const targets=await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(3000)}).then(response=>response.json());
const target=targets.find(target=>target.type==='page'&&target.url.startsWith('http://127.0.0.1:3210/app/'));
assert.ok(target,'Installed application target missing');
const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
let seq=0;const pending=new Map();
socket.addEventListener('message',event=>{const message=JSON.parse(event.data),item=pending.get(message.id);if(item){clearTimeout(item.timer);pending.delete(message.id);message.error?item.reject(Error(message.error.message)):item.resolve(message.result);}});
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'));},30000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(result.exceptionDetails)throw Error('Installed detail check failed');return result.result.value;};
const wait=async expression=>{for(let attempt=0;attempt<150;attempt++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,200));}throw Error('Detail/media not ready');};
try{
  await evaluate("location.hash='#/publish/tasks';true");await wait("document.querySelectorAll('[data-publish-job]').length>0");
  const before=await evaluate(`(()=>{const owner=JSON.parse(localStorage.getItem('matrix_user')||sessionStorage.getItem('matrix_user'));return JSON.parse(localStorage.getItem('matrix-publish-progress:'+owner.id)||'[]').map(job=>({id:job.id,stage:job.stage,updatedAt:job.updatedAt}))})()`);
  await evaluate("(()=>{const row=[...document.querySelectorAll('[data-publish-job]')].find(row=>row.querySelector('.matrix-task-status')?.innerText.includes('发布成功')&&row.querySelector('.matrix-task-identity')?.innerText.includes('薄肌重启计划第十二天'));if(!row)throw Error('Existing successful video missing');row.querySelector('.matrix-task-row-links > button').click();return true})()");
  await wait("!!document.querySelector('[data-task-detail] video')&&document.querySelector('[data-task-detail] video').readyState>=1");
  await wait("[...document.querySelectorAll('[data-task-detail] .matrix-detail-covers img')].every(image=>image.naturalWidth>0)");
  const info=await evaluate("(()=>{const drawer=document.querySelector('[data-task-detail]'),video=drawer.querySelector('video');return{title:drawer.querySelector('[aria-label=任务标题]').value,readonly:[...drawer.querySelectorAll('input,textarea')].every(field=>field.readOnly),duration:video.duration,coverCount:drawer.querySelectorAll('.matrix-detail-covers img').length,privateVisible:drawer.innerText.includes('仅自己可见'),logs:drawer.querySelectorAll('.matrix-detail-timeline li').length}})()");
  assert.equal(info.title,'薄肌重启计划第十二天');assert.equal(info.readonly,true);assert.ok(info.duration>0&&Number.isFinite(info.duration));assert.ok(info.coverCount>0);assert.equal(info.privateVisible,true);assert.ok(info.logs>0);
  const playback=await evaluate("(async()=>{const video=document.querySelector('[data-task-detail] video');video.muted=true;await video.play();await new Promise(resolve=>setTimeout(resolve,450));const advanced=video.currentTime>0;video.pause();const target=Math.min(3,video.duration/2);await new Promise(resolve=>{video.addEventListener('seeked',resolve,{once:true});video.currentTime=target;setTimeout(resolve,2500);});return{advanced,seeked:Math.abs(video.currentTime-target)<0.2,paused:video.paused}})()");assert.deepEqual(playback,{advanced:true,seeked:true,paused:true});
  await new Promise(resolve=>setTimeout(resolve,700));const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync('logs/installed-rc23-task-detail.png',Buffer.from(shot.data,'base64'));
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await wait("!document.querySelector('[data-task-detail]')");
  const after=await evaluate(`(()=>{const owner=JSON.parse(localStorage.getItem('matrix_user')||sessionStorage.getItem('matrix_user'));return JSON.parse(localStorage.getItem('matrix-publish-progress:'+owner.id)||'[]').map(job=>({id:job.id,stage:job.stage,updatedAt:job.updatedAt}))})()`);assert.deepEqual(after,before);
  console.log(JSON.stringify({installedTaskDetail:true,videoDurationSeconds:Math.round(info.duration),videoPlaybackAndSeeking:playback,readonlyConfig:true,coverPreview:true,privateSettingDisplayed:true,executionLogEntries:info.logs,recordsBefore:before.length,recordsAfter:after.length,taskStateUnchanged:true,externalPlatformActions:false}));
}finally{socket.close();}
