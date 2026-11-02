// Isolated React fixture. No real reminders, network or desktop notifications.
const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),root=path.resolve(__dirname,'..');
async function run(){
 const assert=require('node:assert/strict'),React=require('react'),{createRoot}=require('react-dom/client'),{loadTs}=require('./qa-load-typescript.cjs'),overrides=new Map();
 let owner='one',token='one-token',requests=[],notifies=0,checks=0;const originalTimeout=globalThis.setTimeout;
 globalThis.setTimeout=(fn,ms,...args)=>originalTimeout(fn,ms===20000?80:ms,...args);
 Object.defineProperty(document,'hidden',{configurable:true,value:false});window.matrixDesktop={systemSettings:async()=>{notifies++;}};
 const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};},eq=(a,b)=>{assert.deepEqual(a,b);checks++;},pause=()=>new Promise(r=>originalTimeout(r,25));
 const until=async fn=>{for(let i=0;i<80&&!fn();i++)await pause();assert.ok(fn(),'fixture timed out: '+document.body.textContent);};
 overrides.set('@/api',{getUser:()=>({id:owner}),getAuthToken:()=>token,axiosForBackend:{get:(_url,opts)=>{const d=defer();requests.push({...d,signal:opts.signal});return d.promise;}}});
 overrides.set('@/contexts/AppPreferences',{useAppPreferences:()=>({dueReminders:true,desktopAlerts:true,unreadBadges:true})});overrides.set('@/components/workspace/OfficialWorkspace',{useOfficialWorkspace:()=>({hide(){}})});overrides.set('react-router-dom',{Link:({children,...props})=>React.createElement('a',props,children)});
 const Page=loadTs('client/src/components/notification/PersonalTaskReminder.tsx',new Map(),overrides).default,mounted=createRoot(document.getElementById('root')),respond=(r,total)=>r.resolve({data:{data:{total}}});
 try{mounted.render(React.createElement(Page));await until(()=>requests.length===1);respond(requests[0],3);await until(()=>document.body.textContent.includes('3 条到期待办'));eq(notifies,1);
 window.dispatchEvent(new CustomEvent('matrix:personal-tasks-updated'));await until(()=>requests.length===2);owner='two';token='two-token';window.dispatchEvent(new CustomEvent('matrix:auth-updated'));await until(()=>requests.length===3);eq(document.body.textContent.includes('3 条到期待办'),false);respond(requests[1],88);await pause();eq(document.body.textContent.includes('88'),false);respond(requests[2],-1);await pause();await until(()=>document.body.textContent.includes('提醒不可用'));eq(notifies,1);
 window.dispatchEvent(new CustomEvent('matrix:personal-tasks-updated'));await until(()=>requests.length===4);respond(requests[3],0);await until(()=>document.body.textContent.includes('待办提醒'));eq(document.body.textContent.includes('提醒不可用'),false);
 window.dispatchEvent(new CustomEvent('matrix:personal-tasks-updated'));await until(()=>requests.length===5);await until(()=>document.body.textContent.includes('提醒不可用'));eq(requests[4].signal.aborted,true);window.dispatchEvent(new CustomEvent('matrix:personal-tasks-updated'));await until(()=>requests.length===6);respond(requests[5],2);await until(()=>document.body.textContent.includes('2 条到期待办'));eq(notifies,2);return{personalReminderChecks:checks,syntheticOnly:true,realRequests:0};
 }finally{mounted.unmount();globalThis.setTimeout=originalTimeout;delete window.matrixDesktop;}
}
module.exports={run};
if(require.main===module||process.versions.electron&&process.type!=='renderer'){
 if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const r=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename],{encoding:'utf8',windowsHide:true,env,timeout:60000});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status??1);}
 else{const{app,BrowserWindow,session}=require('electron');app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'yuanxiao-reminder-qa-')));app.disableHardwareAcceleration();app.whenReady().then(async()=>{let win;try{session.defaultSession.webRequest.onBeforeRequest((d,cb)=>cb({cancel:!d.url.startsWith('data:')}));win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:true,contextIsolation:false,sandbox:false,backgroundThrottling:false}});await win.loadURL('data:text/html,<div id="root"></div>');console.log(JSON.stringify(await win.webContents.executeJavaScript('require('+JSON.stringify(__filename)+').run()')));}catch(e){console.error(e);process.exitCode=1;}finally{win?.destroy();app.exit(process.exitCode||0);}});}
}
