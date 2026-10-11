// Native Electron popup routing in the disposable QA profile, never a real account.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const [port, base] = process.argv.slice(2);
if (base !== 'http://127.0.0.1:3291') throw Error('Isolated QA app required');
const sockets = [], targets = () => fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
async function connect(url) {
  const socket = new WebSocket(url); sockets.push(socket); await new Promise(resolve => socket.addEventListener('open',resolve,{once:true}));
  let id = 0; const pending = new Map();
  const call = (method, params = {}) => new Promise((resolve,reject) => { const key=++id, timer=setTimeout(()=>reject(Error(method+' timeout')),15000); pending.set(key,{resolve,reject,timer}); socket.send(JSON.stringify({id:key,method,params})); });
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Fetch.requestPaused')void call('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html'}],body:Buffer.from('<title>QA official parent</title><input id="draft" value="unsaved parent text">').toString('base64')});});
  return {call,async evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;}};
}
async function wait(fn,label){const end=Date.now()+30000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,150));}throw Error(label);}
let main;
try {
  main=await connect((await targets()).find(t=>t.type==='page'&&t.url.startsWith(base)).webSocketDebuggerUrl);
  await main.call('Page.navigate',{url:base+'/app/#/accounts'});
  await wait(()=>main.evaluate("!![...document.querySelectorAll('.matrix-rail-account')].find(el=>el.innerText.includes('QA douyin'))"),'QA account missing');
  await main.evaluate("[...document.querySelectorAll('.matrix-rail-account')].find(el=>el.innerText.includes('QA douyin')).click();true");
  await wait(()=>main.evaluate("!!document.querySelector('.matrix-official-browser:not([hidden]) webview')"),'Account view missing');
  await new Promise(r=>setTimeout(r,1500));
  const source=(await targets()).find(t=>t.type==='webview'&&t.url.includes('douyin.com'));
  assert.ok(source); const parent=await connect(source.webSocketDebuggerUrl);
  await parent.call('Fetch.enable',{patterns:[{urlPattern:'*'}]});
  await parent.call('Page.navigate',{url:'https://creator.douyin.com/qa-parent'});
  await wait(()=>parent.evaluate("document.querySelector('#draft')?.value==='unsaved parent text'"),'Fixture missing');
  const partition=await main.evaluate("document.querySelector('.matrix-official-browser:not([hidden]) webview').getAttribute('partition')");
  const upperCount=await main.evaluate("document.querySelectorAll('.matrix-workspace-tabs [role=tab]').length");
  await parent.evaluate("window.open('https://creator.douyin.com/qa-child-a','_blank');true");
  await wait(()=>main.evaluate("document.querySelectorAll('.matrix-account-page-tabs [role=tab]').length===2"),'Popup did not create child tab');
  assert.equal(await main.evaluate("document.querySelectorAll('.matrix-workspace-tabs [role=tab]').length"),upperCount);
  assert.equal(await main.evaluate("document.querySelector('.matrix-official-browser:not([hidden]) webview').getAttribute('partition')"),partition);
  assert.equal(await parent.evaluate("location.pathname"),'/qa-parent');
  assert.equal(await parent.evaluate("document.querySelector('#draft').value"),'unsaved parent text');
  await parent.evaluate("window.open('https://creator.douyin.com/qa-child-b','_blank');true");
  await wait(()=>main.evaluate("document.querySelectorAll('.matrix-account-page-tabs [role=tab]').length===3"),'Second popup missing');
  const childSrc=await main.evaluate("document.querySelector('.matrix-official-browser:not([hidden]) webview').getAttribute('src')");
  await main.evaluate("[...document.querySelectorAll('.matrix-rail-account')].find(el=>el.innerText.includes('QA bilibili')).click();true");
  await wait(()=>main.evaluate("document.querySelector('.matrix-official-browser:not([hidden]) webview')?.getAttribute('partition').includes('bilibili')"),'Account switch failed');
  await main.evaluate("[...document.querySelectorAll('.matrix-rail-account')].find(el=>el.innerText.includes('QA douyin')).click();true");
  await wait(()=>main.evaluate(`document.querySelector('.matrix-official-browser:not([hidden]) webview')?.getAttribute('src')===${JSON.stringify(childSrc)}`),'Last child not restored');
  await parent.evaluate("window.open('https://example.com/blocked','_blank');true"); await new Promise(r=>setTimeout(r,200));
  assert.equal(await main.evaluate("document.querySelectorAll('.matrix-account-page-tabs [role=tab]').length"),3);
  assert.equal((await targets()).filter(t=>t.type==='page'&&t.url.includes('creator.douyin.com')).length,0);
  const shot=await main.call('Page.captureScreenshot',{format:'png'});fs.writeFileSync('logs/qa-account-child-tabs.png',Buffer.from(shot.data,'base64'));
  await main.evaluate("document.querySelector('.matrix-account-page-tabs .is-active button[aria-label^=关闭页面]').click();true");
  await wait(()=>main.evaluate("document.querySelectorAll('.matrix-account-page-tabs [role=tab]').length===2"),'Child close failed');
  assert.equal(await parent.evaluate("document.querySelector('#draft').value"),'unsaved parent text');
  await main.evaluate("for(let i=0;i<15;i++)document.querySelector('button[aria-label=在当前账号中新建页面]').click();true");
  await wait(()=>main.evaluate("document.querySelectorAll('.matrix-account-page-tabs [role=tab]').length===12"),'Page limit failed');
  assert.equal(await main.evaluate("document.querySelectorAll('.matrix-official-browser:not([hidden])').length"),1);
  await main.evaluate("document.querySelector('.matrix-workspace-tabs .is-active .matrix-tab-close').click();true");
  await wait(()=>main.evaluate(`![...document.querySelectorAll('webview')].some(el=>el.getAttribute('partition')===${JSON.stringify(partition)})`),'Account close left children mounted');
  console.log(JSON.stringify({accountChildTabChecks:15,isolatedProfile:true,parentPreserved:true,sharedAccountPartition:true,realPlatformActions:false}));
}catch(error){console.error(await main?.evaluate("location.href+' '+document.body.innerText.slice(0,2500)"));throw error;}finally{for(const socket of sockets)socket.close();}
