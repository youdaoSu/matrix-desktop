// Synthetic conversations, real React/provider/view and CSS, no platform calls.
const path=require('node:path'),fs=require('node:fs'),root=path.resolve(__dirname,'..');
async function run(count,verifyWindow){
 const assert=require('node:assert/strict'),React=require('react'),{createRoot}=require('react-dom/client'),{loadTs}=require('./qa-load-typescript.cjs'),cache=new Map();
 const stub=(name,exports)=>cache.set(path.join(root,name),{exports});let checks=0,view=false,refresh,rendered=0,reads=0;
 const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
 stub('client/src/api/index.ts',{getUser:()=>({id:'perf-owner'}),getAuthToken:()=> 'perf-token'});
 stub('client/src/components/ui/button.tsx',{Button:({children,size,variant,...props})=>React.createElement('button',props,children)});
 const saved=new Map();stub('client/src/components/workspace/WorkspaceUiState.ts',{useWorkspaceIdentity:()=> 'perf-owner',uiText:()=>true,useWorkspacePreference:(key,fallback)=>{const [value,setValue]=React.useState(saved.get(key)||fallback);return[value,next=>{saved.set(key,next);setValue(next);}];}});
 const account={id:'perf-account',platform:'douyin',nickname:'Synthetic',connectorSessionId:'perf-session',nativeAccountKey:'synthetic-key'},accounts=[account];
 const threads=Array.from({length:count},(_,i)=>({id:String(i+1),type:1,peer:String(i+100),name:'Synthetic conversation '+String(i).padStart(5,'0'),count:1,unread:0,complete:true,messageRevision:1,lastMessage:'Synthetic preview',lastAt:new Date(1800000000000-i*1000).toISOString()}));
 window.matrixDesktop={douyinInbox:async input=>{if(input.command==='stop')return{stopped:true};if(input.command==='messages'){reads++;return{accountId:account.id,sessionId:account.connectorSessionId,messages:[]};}assert.equal(input.command,'watch');return{accountId:account.id,sessionId:account.connectorSessionId,threads:structuredClone(threads),status:{revision:1,threadCount:count,messageCount:count,phase:'fixture',push:'connected',historyComplete:true}};}};
 const {DouyinInboxProvider,DouyinInboxView}=loadTs('client/src/components/workspace/DouyinInbox.tsx',cache);
 function Fixture(){const[,setTick]=React.useState(0);refresh=()=>setTick(n=>n+1);rendered++;return React.createElement(DouyinInboxProvider,{accounts},view?React.createElement(DouyinInboxView,{accounts}):React.createElement('p',null,'Synthetic other route'));}
 const mount=createRoot(document.getElementById('root')),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const until=async predicate=>{const end=performance.now()+15000;while(!predicate()){if(performance.now()>end)throw Error('Synthetic UI did not settle');await sleep(20);}};
 let previous=performance.now(),maxGapMs=0;const beat=setInterval(()=>{const at=performance.now();maxGapMs=Math.max(maxGapMs,at-previous);previous=at;},16);
 try{
  mount.render(React.createElement(Fixture));await until(()=>!!refresh);await sleep(80);const measurements=[];
  for(let iteration=0;iteration<3;iteration++){
   maxGapMs=0;previous=performance.now();const at=performance.now();view=true;refresh();await until(()=>document.querySelector('.matrix-inbox-chat aside button'));await sleep(60);
   const host=document.querySelector('.matrix-inbox-chat aside');measurements.push({mountMs:Math.round(performance.now()-at),maxGapMs:Math.round(maxGapMs),buttons:host.querySelectorAll('button').length,nodes:host.querySelectorAll('*').length,scrollHeight:host.scrollHeight});
   if(verifyWindow){assert(host.querySelectorAll('button').length<=40,'Conversation DOM must stay bounded');checks++;host.scrollTop=host.scrollHeight;host.dispatchEvent(new Event('scroll'));await until(()=>host.textContent.includes(threads[count-1].name));eq(host.querySelectorAll('button').length<=40,true);const last=[...host.querySelectorAll('button')].find(b=>b.textContent.includes(threads[count-1].name));last.click();await until(()=>document.querySelector('.matrix-inbox-thread-header')?.textContent.includes(threads[count-1].name));eq(reads,iteration+1);}
   if(verifyWindow){
    const selectedKey=host.querySelector('button[aria-pressed="true"]')?.dataset.conversationKey;
    host.querySelector('button[aria-pressed="true"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));
    await until(()=>document.activeElement?.dataset?.conversationKey==='perf-account|1');eq(document.querySelector('.matrix-inbox-thread-header').textContent.includes(threads[count-1].name),true);
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));await until(()=>document.activeElement?.dataset?.conversationKey===selectedKey);eq(host.querySelectorAll('button').length<=40,true);
   }
   view=false;refresh();await until(()=>!document.querySelector('.matrix-inbox-chat'));await sleep(50);
  }
  return{count,measurements,checks,rendered,realPlatformRequests:0,realSends:0};
 }finally{clearInterval(beat);mount.unmount();window.matrixDesktop=undefined;}
}
module.exports={run};
if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const result=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename,...process.argv.slice(2)],{env,cwd:root,windowsHide:true,encoding:'utf8',timeout:90000});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status??1);}
else if(process.type!=='renderer'){
 const {app,BrowserWindow}=require('electron');app.setPath('userData',fs.mkdtempSync(path.join(require('node:os').tmpdir(),'matrix-inbox-list-performance-')));app.disableHardwareAcceleration();app.commandLine.appendSwitch('mute-audio');
 app.whenReady().then(async()=>{let win;const timer=setTimeout(()=>app.exit(1),80000);try{win=new BrowserWindow({show:false,width:1300,height:900,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false}});win.webContents.session.webRequest.onBeforeRequest((r,done)=>done({cancel:!r.url.startsWith('data:')}));await win.loadURL('data:text/html,<div id="root"></div>');await win.webContents.insertCSS(fs.readFileSync(path.join(root,'client/src/workspace.css'),'utf8'));const count=Number(process.argv.find(a=>/^--count=/.test(a))?.split('=')[1]||5000);assertCount(count);console.log(JSON.stringify(await win.webContents.executeJavaScript(`require(${JSON.stringify(__filename)}).run(${count},${process.argv.includes('--verify-window')})`)));}catch(error){console.error(error?.stack||String(error));process.exitCode=1;}finally{clearTimeout(timer);win?.destroy();app.exit(process.exitCode||0);}});
}
function assertCount(count){if(!Number.isInteger(count)||count<100||count>20000)throw Error('Invalid synthetic count');}
