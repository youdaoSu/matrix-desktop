import assert from 'node:assert/strict';
const port=process.argv[2]||'9392';
const targets=await fetch(`http://127.0.0.1:${port}/json/list`).then(response=>response.json());
const target=targets.find(item=>item.type==='page'&&item.url.includes('/app/'));if(!target)throw Error('isolated Matrix QA target missing');
const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
let sequence=0,checks=0;const pending=new Map();socket.addEventListener('message',event=>{const message=JSON.parse(event.data);const task=pending.get(message.id);if(task){pending.delete(message.id);clearTimeout(task.timer);message.error?task.reject(Error(message.error.message)):task.resolve(message.result);}});
const evaluate=expression=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('isolated directory UI timeout'));},15000);pending.set(id,{timer,resolve:result=>{if(result.exceptionDetails)reject(Error(result.exceptionDetails.text));else resolve(result.result?.value);},reject});socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));});
const wait=async expression=>{for(let attempt=0;attempt<100;attempt++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('isolated directory UI did not become ready');};
try{
  await evaluate("window.dispatchEvent(new Event('matrix:platform-directory'));true");await wait("!document.querySelector('.matrix-additional-workspaces')?.hidden");checks++;
  const counts=await evaluate("(()=>{const buttons=[...document.querySelectorAll('.matrix-additional-workspaces aside .grid button')];return{all:buttons.length,pending:buttons.filter(button=>button.innerText.includes('待核验')).length};})()");assert.equal(counts.all,29);assert.equal(counts.pending,8);checks+=2;
  await evaluate("[...document.querySelectorAll('.matrix-additional-workspaces aside .grid button')].find(button=>button.innerText.includes('京东创作')).click();true");await wait("document.querySelector('.matrix-additional-workspaces').innerText.includes('不使用京东金融')");checks++;
  const noSave=await evaluate("![...document.querySelectorAll('.matrix-additional-workspaces button')].some(button=>button.innerText==='保存并在远效内打开')");assert.equal(noSave,true);checks++;
  await evaluate("[...document.querySelectorAll('.matrix-additional-workspaces aside .grid button')].find(button=>button.innerText.includes('自定义平台')).click();true");
  const created=await evaluate(`(async()=>{const token=localStorage.getItem('matrix_token')||sessionStorage.getItem('matrix_token');const result=await window.matrixDesktop.extraPlatformWorkspaces({command:'add',accessToken:token,provider:'custom',name:'Isolated QA workspace',url:'https://www.example.com/'});if(result.error)throw Error(result.error);return {id:result.item.id,status:result.item.loginStatus};})()`);assert.equal(created.status,'not_verified');checks++;
  await evaluate("document.querySelector('[aria-label=\"刷新更多平台工作区\"]').click();true");await wait("document.querySelector('.matrix-additional-workspaces').innerText.includes('Isolated QA workspace')");checks++;
  await evaluate("[...document.querySelectorAll('.matrix-additional-workspaces aside button')].find(button=>button.innerText.includes('Isolated QA workspace')).click();true");await wait("!!document.querySelector('.matrix-additional-workspaces webview')");checks++;
  const partition=await evaluate("document.querySelector('.matrix-additional-workspaces webview').getAttribute('partition')");assert.match(partition,/^persist:matrix-extra-custom-/);checks++;
  await evaluate("document.querySelector('[aria-label=\"关闭工作区 Isolated QA workspace\"]').click();true");await wait("!document.querySelector('.matrix-additional-workspaces webview')");checks++;
  // Exercise the actual save button, not only direct fixture IPC. A directory
  // rendered correctly while Windows refused to persist it in the real app.
  await evaluate("[...document.querySelectorAll('.matrix-additional-workspaces aside .grid button')].find(button=>button.innerText.includes('快手')).click();true");
  await wait("document.querySelector('.matrix-additional-workspaces h2')?.innerText==='快手'&&[...document.querySelectorAll('.matrix-additional-workspaces button')].some(button=>button.innerText.trim()==='保存并在远效内打开'&&!button.disabled)");checks++;
  await evaluate("[...document.querySelectorAll('.matrix-additional-workspaces button')].find(button=>button.innerText.trim()==='保存并在远效内打开').click();true");
  await wait("!!document.querySelector('.matrix-additional-workspaces webview[partition^=\"persist:matrix-extra-kuaishou-\"]')");checks++;
  const savedStatus=await evaluate("(async()=>{const accessToken=localStorage.getItem('matrix_token')||sessionStorage.getItem('matrix_token');const result=await window.matrixDesktop.extraPlatformWorkspaces({command:'list',accessToken});return result.items.find(item=>item.provider==='kuaishou')?.loginStatus;})()");assert.equal(savedStatus,'not_verified');checks++;
  await evaluate("document.querySelector('[aria-label=\"关闭工作区 快手账号\"]').click();true");await wait("!document.querySelector('.matrix-additional-workspaces webview')");checks++;
  await evaluate("[...document.querySelectorAll('.matrix-additional-workspaces header button')].find(button=>button.innerText.includes('收起')).click();true");await wait("document.querySelector('.matrix-additional-workspaces').hidden");checks++;
  console.log(JSON.stringify({platformDirectoryUiChecks:checks,actualSaveButtonVerified:true,isolatedProfile:true,notAuthorizedAccountCreated:true,realPlatformCredentialsUsed:false,externalWrites:false}));
}finally{socket.close();}
