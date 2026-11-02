// Real DOM geometry with synthetic messages only, no real account/network.
const path=require('node:path'),root=path.resolve(__dirname,'..');
async function run(){
 const assert=require('node:assert/strict'),{loadTs}=require('./qa-load-typescript.cjs'),{sortInboxConversations,createInboxScrollAnchor}=loadTs('client/src/components/workspace/inbox-timeline.ts');let checks=0;
 const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},near=(a,b)=>{assert(Math.abs(a-b)<2,`${a} != ${b}`);checks++;};
 const rows=[{selection:'a/old',lastAt:'2026-10-21T00:00:00Z'},{selection:'b/new',lastAt:'2026-10-23T00:00:00Z'},{selection:'a/newest',lastAt:'2026-10-24T00:00:00Z'},{selection:'c/unknown'},{selection:'d/timezone',lastAt:'2026-10-24T09:00:00+08:00'}];
 eq(sortInboxConversations(rows).map(x=>x.selection),['d/timezone','a/newest','b/new','a/old','c/unknown']);eq(rows[0].selection,'a/old');
 document.body.innerHTML='<div id="viewport" style="height:240px;width:500px;overflow:auto;overflow-anchor:none"><div id="bubbles"></div></div>';
 const host=document.getElementById('viewport'),body=document.getElementById('bubbles');for(let n=0;n<50;n++){const row=document.createElement('article');row.textContent='QA message '+n;row.style.height='40px';body.append(row);}
 const controller=createInboxScrollAnchor(host,body),observer=new ResizeObserver(controller.resize);host.addEventListener('scroll',controller.scroll);observer.observe(body);controller.afterRender();near(host.scrollTop,host.scrollHeight-host.clientHeight);
 const turn=()=>new Promise(r=>setTimeout(r,30)),waitFor=async predicate=>{for(let n=0;n<100;n++){if(predicate())return;await turn();}throw Error('Synthetic ResizeObserver geometry did not settle');};await turn();body.lastElementChild.style.height='400px';await waitFor(()=>Math.abs(host.scrollTop-host.scrollHeight+host.clientHeight)<2);near(host.scrollTop,host.scrollHeight-host.clientHeight);
 host.scrollTop=400;host.dispatchEvent(new Event('scroll'));const held=body.children[12],offset=()=>held.getBoundingClientRect().top-host.getBoundingClientRect().top,before=offset();
 controller.beforePrepend();const older=document.createElement('article');older.style.height='200px';older.textContent='QA cached older message';body.prepend(older);controller.afterRender();near(offset(),before);await turn();near(offset(),before);
 older.style.height='500px';await waitFor(()=>Math.abs(offset()-before)<2);near(offset(),before);const currentTop=host.scrollTop;body.lastElementChild.style.height='600px';await turn();near(host.scrollTop,currentTop);
 const newer=document.createElement('article');newer.textContent='QA new while reading history';newer.style.height='300px';body.append(newer);controller.afterRender();near(offset(),before);
 host.scrollTop=host.scrollHeight;host.dispatchEvent(new Event('scroll'));newer.style.height='700px';await waitFor(()=>Math.abs(host.scrollTop-host.scrollHeight+host.clientHeight)<2);near(host.scrollTop,host.scrollHeight-host.clientHeight);
 observer.disconnect();host.removeEventListener('scroll',controller.scroll);host.scrollTop=0;createInboxScrollAnchor(host,body).afterRender();near(host.scrollTop,host.scrollHeight-host.clientHeight);
 return{inboxTimelineUiChecks:checks,crossAccountTimeOrder:true,initialLatestAtBottom:true,lateImagesStayAtBottom:true,prependAndHistoryImageAnchorPreserved:true,historyReadingNotForcedDown:true,realRequests:0,realProfileTouched:false};
}
module.exports={run};
if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const result=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:30000});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status??1);}
else if(process.type!=='renderer'){
 const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),os=require('node:os');app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-inbox-timeline-qa-')));app.whenReady().then(async()=>{let win;try{win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false}});win.webContents.session.webRequest.onBeforeRequest((d,cb)=>cb({cancel:!d.url.startsWith('data:')}));await win.loadURL('data:text/html,<div></div>');console.log(JSON.stringify(await win.webContents.executeJavaScript(`require(${JSON.stringify(__filename)}).run()`)));}catch(error){console.error(error);process.exitCode=1;}finally{win?.destroy();app.exit(process.exitCode||0);}});
}
