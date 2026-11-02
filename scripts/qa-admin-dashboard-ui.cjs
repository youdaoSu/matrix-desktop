// Disposable React/Electron fixture; all administrative responses are synthetic.
const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),root=path.resolve(__dirname,'..');
async function run(){
 const assert=require('node:assert/strict'),React=require('react'),{createRoot}=require('react-dom/client'),{loadTs}=require('./qa-load-typescript.cjs'),cache=new Map(),overrides=new Map();let calls=[],errors=0,checks=0;
 const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};},eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
 overrides.set('@/api',{adminAxios:{get:()=>{const d=defer();calls.push(d);return d.promise;}}});overrides.set('sonner',{toast:{error:()=>{errors++;}}});
 const Wrap=({children,...props})=>React.createElement('div',props,children);overrides.set('@client/src/components/ui/card',{Card:Wrap,CardContent:Wrap});overrides.set('@client/src/components/ui/button',{Button:({children,variant,...props})=>React.createElement('button',props,children)});
 const Page=loadTs('client/src/pages/admin/RealDashboardPage.tsx',cache,overrides).default,mounted=createRoot(document.getElementById('root')),pause=()=>new Promise(r=>setTimeout(r,30)),values=()=>[...document.querySelectorAll('.text-3xl')].map(n=>n.textContent),button=()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('刷新'));
 const value={totalUsers:0,activeVipUsers:2,todayNewUsers:0,expiringSoon:1,totalCodes:4,usedCodes:1,totalAccounts:3};
 const until=async(predicate)=>{for(let attempt=0;attempt<100;attempt++){if(predicate())return;await pause();}assert.fail('Admin dashboard fixture did not reach the expected request/render state');};
 try{
  mounted.render(React.createElement(Page));await until(()=>calls.length===1);eq(values(),Array(7).fill('—'));calls[0].reject(Error('synthetic failure'));await until(()=>document.body.innerText.includes('数据未知'));eq(values(),Array(7).fill('—'));assert.match(document.body.innerText,/数据未知/);checks++;
  button().click();await until(()=>calls.length===2);calls[1].resolve({data:{data:value}});await until(()=>values()[0]==='0');eq(values(),['0','2','0','1','4','1','3']);eq(document.querySelector('[role="alert"]'),null);
  button().click();await until(()=>calls.length===3);calls[2].resolve({data:{data:{totalUsers:77}}});await until(()=>document.body.innerText.includes('显示上次结果'));eq(values(),['0','2','0','1','4','1','3']);assert.match(document.body.innerText,/显示上次结果/);checks++;
  button().click();button().click();await until(()=>calls.length===5);eq(calls.length,5);calls[4].resolve({data:{data:{...value,totalUsers:8}}});await until(()=>values()[0]==='8');calls[3].resolve({data:{data:{...value,totalUsers:999}}});await pause();eq(values()[0],'8');eq(document.querySelector('[role="alert"]'),null);eq(errors,2);
  return{adminDashboardChecks:checks,unknownDistinctFromZero:true,staleResponseIgnored:true,syntheticOnly:true,realRequests:0};
 }finally{mounted.unmount();}
}
module.exports={run};
if(require.main===module||process.versions.electron&&process.type!=='renderer'){
 if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const result=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename],{encoding:'utf8',windowsHide:true,env,timeout:60000});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status??1);}
 else{const {app,BrowserWindow,session}=require('electron');app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'yuanxiao-admin-qa-')));app.disableHardwareAcceleration();app.whenReady().then(async()=>{let win;try{session.defaultSession.webRequest.onBeforeRequest((d,cb)=>cb({cancel:!d.url.startsWith('data:')}));win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:true,contextIsolation:false,sandbox:false,backgroundThrottling:false}});await win.loadURL('data:text/html,<div id="root"></div>');console.log(JSON.stringify(await win.webContents.executeJavaScript('require('+JSON.stringify(__filename)+').run()')));}catch(error){console.error(error);process.exitCode=1;}finally{win?.destroy();app.exit(process.exitCode||0);}});}
}
