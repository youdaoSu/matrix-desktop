const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const {createEdgeTransport,officialWechatUrl,safeBounds}=require('../desktop/edge-embed.cjs');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-edge-native-qa-'));
app.setPath('userData',path.join(profile,'electron'));app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  let win,transport,checks=0;
  try{
    win=new BrowserWindow({show:true,x:-20000,y:-20000,width:1280,height:850,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
    await win.loadURL('data:text/html,Matrix%20isolated%20native%20embedding%20QA');
    const hwnd=win.getNativeWindowHandle().readBigUInt64LE().toString();
    const child=spawn(path.resolve('.brand-runtime/edge-host/YuanXiaoEdgeHost.exe'),[hwnd,path.join(profile,'edge')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    transport=createEdgeTransport(child,{timeout:15000});
    const ready=await new Promise((resolve,reject)=>{
      const stages=[];
      const timer=setTimeout(()=>reject(Error('native host startup timeout: '+stages.join(','))),25000);
      child.once('exit',code=>{clearTimeout(timer);reject(Error('native host exited: '+code+'; stages: '+stages.join(',')));});
      transport.on(event=>{if(event.event==='initializing')stages.push(event.stage);if(event.event==='ready'){clearTimeout(timer);resolve(event);}if(event.event==='fatal'){clearTimeout(timer);reject(Error(event.error));}});
    });
    assert.equal(ready.embedded,true);checks++;assert.equal(ready.engine,'webview2');checks++;
    await transport.request('bounds',safeBounds({x:200,y:150,width:850,height:600,visible:true}));checks++;
    let identity;
    for(let attempt=0;attempt<20;attempt++){
      try{identity=await transport.request('profile',{script:'({userAgent:navigator.userAgent,node:typeof window.process,bridge:!!window.chrome?.webview})'});break;}
      catch{await new Promise(resolve=>setTimeout(resolve,250));}
    }
    assert.ok(identity,'official page became ready without changing its security checks');checks++;
    assert.equal(identity.userAgent.includes('Electron'),false);checks++;assert.equal(identity.node,'undefined');checks++;
    await assert.rejects(transport.request('navigate',{url:'file:///C:/Windows/win.ini'}),/仅允许/);checks++;
    for(const invalid of ['https://weixin.qq.com.evil.invalid','http://channels.weixin.qq.com','https://user:pass@channels.weixin.qq.com','javascript:alert(1)']){assert.equal(officialWechatUrl(invalid),false);checks++;}
    for(const valid of ['https://channels.weixin.qq.com/platform/home','https://open.weixin.qq.com/connect/qrconnect']){assert.equal(officialWechatUrl(valid),true);checks++;}
    assert.throws(()=>safeBounds({x:NaN,y:0,width:5,height:8}),/尺寸/);checks++;
    assert.throws(()=>safeBounds({x:0,y:0,width:999999,height:8}),/尺寸/);checks++;
    await transport.request('zoom',{zoom:.7});checks++;
    await transport.request('bounds',{x:0,y:0,width:1,height:1,visible:false});checks++;
    console.log(JSON.stringify({nativeEdgeChecks:checks,embedded:ready.embedded,engine:ready.engine,version:ready.version,userAgentSpoofed:false,realAccountsModified:false,profileOutsideUserData:true}));
  }catch(error){console.error(error);process.exitCode=1;}
  finally{transport?.close();win?.destroy();app.exit(process.exitCode||0);}
});
