// Actual React notice and router, entirely local and read-only.
const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),root=path.resolve(__dirname,'..');
async function run(){
 const assert=require('node:assert/strict'),React=require('react'),{createRoot}=require('react-dom/client'),{MemoryRouter}=require('react-router-dom'),{loadTs}=require('./qa-load-typescript.cjs');
 const Notice=loadTs('client/src/pages/user/InteractionTaskNotice.tsx',new Map(),new Map()).InteractionTaskNotice,mounted=createRoot(document.getElementById('root'));let checks=0;
 try{for(const pageName of ['自动评论','自动私信','批量任务']){mounted.render(React.createElement(MemoryRouter,null,React.createElement(Notice,{pageName})));await new Promise(r=>setTimeout(r,25));const text=document.body.innerText,link=document.querySelector('a');assert.match(text,new RegExp(pageName+' · 人工待办模式'));assert.match(text,/不会因进入本页而发送评论或私信/);assert.match(text,/两处记录不会自动转换/);assert.equal(link.getAttribute('href'),'/engage/account-operations');checks+=4;}return{noticeChecks:checks,routeIsNavigationOnly:true,realRequests:0};}finally{mounted.unmount();}
}
module.exports={run};
if(require.main===module||process.versions.electron&&process.type!=='renderer'){
 if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const result=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename],{encoding:'utf8',windowsHide:true,env,timeout:60000});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status??1);}
 else{const {app,BrowserWindow,session}=require('electron');app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'yuanxiao-notice-qa-')));app.disableHardwareAcceleration();app.whenReady().then(async()=>{let win;try{session.defaultSession.webRequest.onBeforeRequest((d,cb)=>cb({cancel:!d.url.startsWith('data:')}));win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:true,contextIsolation:false,sandbox:false,backgroundThrottling:false}});await win.loadURL('data:text/html,<div id="root"></div>');console.log(JSON.stringify(await win.webContents.executeJavaScript('require('+JSON.stringify(__filename)+').run()')));}catch(error){console.error(error);process.exitCode=1;}finally{win?.destroy();app.exit(process.exitCode||0);}});}
}
