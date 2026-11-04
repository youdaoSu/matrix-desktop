const fs=require('node:fs'),path=require('node:path');
async function renderTests(){
 const assert=require('node:assert/strict'),React=require('./qa-operations-paths.cjs').projectRequire('react'),{createRoot}=require('./qa-operations-paths.cjs').projectRequire('react-dom/client'),{loadTs}=require('./qa-operations-load-typescript.cjs');
 const {OperationsOwnFans}=loadTs('client/src/pages/user/OperationsOwnFans.tsx');let calls=[],checks=0;
 const data={accounts:[{id:'owner',platform:'douyin',role:'primary',name:'本人账号'},{id:'member',platform:'douyin',role:'member',name:'协作号'},{id:'xhs',platform:'xiaohongshu',role:'primary',name:'其他平台'}]};
 const mounted=createRoot(document.getElementById('root')),wait=()=>new Promise(r=>setTimeout(r,50)),button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
 const props={data,busy:false,run:async(command,args)=>{calls.push({command,args});if(command==='own-fan-preview')return{...args,token:'fixed-token',recipients:[{id:'MS4wFan',uid:'123',name:'合成粉丝'}],scanned:3,excluded:1,unknown:1,nextOffset:3,sourceTotal:3};return true;}};
 function input(label,value){const element=document.querySelector('[aria-label="'+label+'"]');const prototype=element.tagName==='SELECT'?HTMLSelectElement.prototype:element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,value);element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));}
 try{
 mounted.render(React.createElement(OperationsOwnFans,props));await wait();
 assert.equal(document.querySelectorAll('select option').length,2);checks++;assert.equal(calls.length,0);checks++;assert.equal(document.querySelector('option[value=owner]').textContent,'本人账号 · 抖音');checks++;
 input('粉丝批次发送账号','owner');await wait();input('粉丝批次文案','合成问候');await wait();input('每批粉丝人数','3');input('粉丝逐条间隔','12');input('粉丝批次间隔','120');await wait();
 button('核对未联系粉丝，不发送').click();await wait();assert.equal(calls.length,1);assert.equal(calls[0].args.batchSize,3);assert.equal(calls[0].args.intervalSeconds,12);assert.equal(calls[0].args.batchGapSeconds,120);checks+=4;
 assert(document.body.textContent.includes('待核对历史 1 位'));checks++;window.confirm=()=>false;button('开始分批发送').click();await wait();assert.equal(calls.length,1);checks++;
 window.confirm=()=>true;button('开始分批发送').click();await wait();assert.equal(calls[1].command,'own-fan-start');assert.equal(calls[1].args.token,'fixed-token');checks+=2;
 data.ownFanPlan={id:'plan',accountId:'owner',status:'waiting',cursor:3,total:8,sent:2,skipped:1,remaining:5,working:false,nextAt:'2026-11-02T13:30:00Z',detail:'等待下一批',nextOffset:8};mounted.render(React.createElement(OperationsOwnFans,props));await wait();assert(document.body.textContent.includes('平台确认发送 2'));assert(document.body.textContent.includes('最早继续时间'));checks+=2;button('暂停并保留进度').click();await wait();assert.equal(calls.at(-1).command,'own-fan-pause');checks++;
 data.ownFanPlan.status='paused';mounted.render(React.createElement(OperationsOwnFans,props));await wait();button('继续未处理的粉丝').click();await wait();assert.equal(calls.at(-1).command,'own-fan-resume');checks++;
 return{checks,realReact:true,realPlatformSends:0};
 }finally{mounted.unmount();}
}
module.exports={renderTests};
if(require.main===module||process.versions.electron&&process.type!=='renderer'){
 if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const r=require('node:child_process').spawnSync(require('./qa-operations-paths.cjs').electron,[__filename],{env,encoding:'utf8',windowsHide:true,timeout:60000});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status??1);}
 else{const {app,BrowserWindow,session}=require('electron');app.setPath('userData',fs.mkdtempSync(path.join(require('node:os').tmpdir(),'yuanxiao-own-fan-ui-')));app.disableHardwareAcceleration();const watchdog=setTimeout(()=>app.exit(1),45000);app.whenReady().then(async()=>{let win;try{session.defaultSession.webRequest.onBeforeRequest((d,done)=>done({cancel:!d.url.startsWith('data:')}));win=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{nodeIntegration:true,contextIsolation:false,sandbox:false,backgroundThrottling:false}});await win.loadURL('data:text/html,<div id="root"></div>');console.log(JSON.stringify(await win.webContents.executeJavaScript('require('+JSON.stringify(__filename)+').renderTests()')));}catch(e){console.error(e);process.exitCode=1;}finally{clearTimeout(watchdog);win?.destroy();app.exit(process.exitCode||0);}});}
}
