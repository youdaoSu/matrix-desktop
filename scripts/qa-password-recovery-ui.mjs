// Exercises only the disposable recovery server and a new Electron profile.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
export async function recoveryUi({base,profile,user,password,getCode}) {
  assert.equal(base,'http://127.0.0.1:3296');assert.match(user.username,/^recover_/);assert.ok(user.email.endsWith('@local.test'));
  const child=spawn(path.resolve('.desktop-deps/node_modules/electron/dist/electron.exe'),['desktop/main.cjs','--remote-debugging-port=9396','--matrix-user-data-dir='+path.join(profile,'ui'),'--mute-audio'],{windowsHide:true,stdio:'ignore',env:{...process.env,MATRIX_APP_URL:base+'/app/#/forgot-password'}});
  let ws,seq=0;const pending=new Map();const pause=ms=>new Promise(r=>setTimeout(r,ms));
  async function wait(fn,label){const end=Date.now()+20000;while(Date.now()<end){if(await fn())return;await pause(70);}throw Error(label);}
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('Isolated UI timeout: '+method));},15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error('Isolated recovery UI evaluation failed');return r.result?.value;};
  const fill=async(id,value)=>evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});if(!e)throw Error('Input missing');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const click=async label=>evaluate(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&e.innerText.trim()===${JSON.stringify(label)});if(!e||e.disabled)throw Error('Button unavailable');e.click();})()`);
  try{
    let target;await wait(async()=>{try{const ts=await fetch('http://127.0.0.1:9396/json/list',{signal:AbortSignal.timeout(1000)}).then(r=>r.json());target=ts.find(t=>t.type==='page'&&t.url.startsWith(base+'/app/'));return!!target;}catch{return false;}},'Isolated Electron unavailable');
    ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
    ws.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(!p)return;clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);});
    await wait(()=>evaluate("!!document.getElementById('recovery-email')&&document.body.innerText.includes('验证码只发送到账号原来绑定的邮箱')"),'Recovery page/SMTP status not ready');
    await call('Emulation.setDeviceMetricsOverride',{width:400,height:1100,deviceScaleFactor:1,mobile:false});
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    assert.equal(await evaluate("document.getElementById('recovery-password').type==='password'&&document.getElementById('recovery-confirmation').type==='password'"),true);
    assert.equal(await evaluate("document.querySelector('button[type=submit]').disabled"),true);
    fs.mkdirSync('logs',{recursive:true});const image=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync('logs/qa-password-recovery.png',Buffer.from(image.data,'base64'));
    await fill('recovery-username',user.username);await fill('recovery-email',user.email);await click('获取验证码');
    await wait(()=>evaluate("document.body.innerText.includes('请求已受理')&&document.body.innerText.includes('秒后重试')"),'Code request/countdown did not render');
    const code=await getCode();await fill('recovery-code',code);await fill('recovery-password',password);await fill('recovery-confirmation','wrong-confirmation');await click('验证并重置密码');
    await wait(()=>evaluate("document.body.innerText.includes('两次输入的新密码不一致')"),'Mismatch was not blocked in UI');
    await fill('recovery-confirmation',password);await click('验证并重置密码');
    await wait(()=>evaluate("location.hash==='#/login'&&document.body.innerText.includes('密码已重置')"),'Reset did not return to login');
    assert.equal(await evaluate("document.getElementById('username').value"),user.username);
    assert.equal(await evaluate("document.getElementById('password').value"),'');
    assert.equal(await evaluate(`JSON.stringify(localStorage).includes(${JSON.stringify(password)})||JSON.stringify(sessionStorage).includes(${JSON.stringify(password)})`),false);
    console.log(JSON.stringify({recoveryUiChecks:8,realRecoveryApiAndTlsFixture:true,narrowLayoutFits:true,resetReturnsToLogin:true,passwordNotPersistedInBrowser:true,realMailboxesUsed:false}));
  }finally{
    if(ws?.readyState===WebSocket.OPEN){try{await call('Browser.close');}catch{}}ws?.close();
    if(child.exitCode===null)child.kill();
  }
}
