// Full production preload -> native handler -> durable journal -> Chromium
// session.fetch, against synthetic HTTPS only. Not the installed application.
const path=require('node:path'),root=path.resolve(__dirname,'..');
require('../scripts/qa-console-pipe.cjs').guardQaConsolePipes();
if(!process.versions.electron){
 const {spawnSync}=require('node:child_process'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const r=spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename],{cwd:root,windowsHide:true,encoding:'utf8',timeout:40000,env});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status??1);
}else{
 const {app,BrowserWindow,ipcMain,session}=require('electron'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
 const {createJournal}=require('../desktop/page-actions.cjs'),{registerPublishFollowup}=require('../desktop/publish-followup.cjs');
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-rc90-followup-ipc-qa-'));app.setPath('userData',profile);app.commandLine.appendSwitch('mute-audio');
 app.whenReady().then(async()=>{
  let win,checks=0,pinned=false;const calls=[],eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
  try{
   const local=session.fromPartition('qa-followup-ipc-'+randomUUID()),owner=randomUUID();
   // No network fallback exists: all HTTPS in this partition is intercepted.
   await local.protocol.handle('https',async request=>{
    const url=new URL(request.url);eq(url.hostname,'api.bilibili.com');
    const body=new URLSearchParams(request.method==='POST'?await request.text():url.search);
    calls.push({route:url.pathname,method:request.method});
    let data;
    if(url.pathname==='/x/web-interface/nav')data={code:0,data:{isLogin:true,mid:'12345'}};
    else if(url.pathname==='/x/web-interface/view')data={code:0,data:{bvid:'BV1qa0000001',aid:'24680',owner:{mid:'12345'}}};
    else if(url.pathname==='/x/v2/reply/add'){
     eq(body.get('csrf'),'qa_csrf_01234567890123456789012345');eq(body.get('message'),'QA原创追评，未发送');
     eq(journal.find(owner,'followup-'+parent.id).checkpoint,'followup_request_started');
     data={code:0,data:{rpid_str:'998877',reply:reply()}};
    }else if(url.pathname==='/x/v2/reply/detail'){
     eq(body.get('root'),'998877');data={code:0,data:{root:reply()}};
    }else if(url.pathname==='/x/v2/reply'){
     eq(body.get('oid'),'24680');eq(body.get('type'),'1');data={code:0,data:{top:{upper:pinned?reply():null}}};
    }else if(url.pathname==='/x/v2/reply/top'){
     eq(body.get('rpid'),'998877');assert.ok(['0','1'].includes(body.get('action')));checks++;pinned=body.get('action')==='1';data={code:0};
    }else if(url.pathname==='/x/v2/reply/del'){
     eq(body.get('rpid'),'998877');eq(body.get('oid'),'24680');eq(body.get('type'),'1');eq(body.get('csrf'),'qa_csrf_01234567890123456789012345');eq(journal.find(owner,'followup-'+parent.id).checkpoint,'followup_management_started');data={code:0};
    }else throw Error('Unexpected synthetic route');
    return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
   });
   const reply=()=>({rpid_str:'998877',oid:'24680',type:1,mid:'12345',member:{mid:'12345'},root:0,parent:0,content:{message:'QA原创追评，未发送'}});
   await local.cookies.set({url:'https://api.bilibili.com/',name:'SESSDATA',value:'QA_synthetic_not_a_real_credential',secure:true});
   await local.cookies.set({url:'https://api.bilibili.com/',name:'bili_jct',value:'qa_csrf_01234567890123456789012345',secure:true});
   const account={id:randomUUID(),platform:'bilibili',connectorSessionId:randomUUID(),nativeAccountKey:'12345',nickname:'QA本人'};
   const parent={id:randomUUID(),ownerId:owner,kind:'publish',platform:'bilibili',accountId:account.id,sessionId:account.connectorSessionId,nativeAccountKey:account.nativeAccountKey,taskId:randomUUID(),attemptId:randomUUID(),status:'confirmed',createdAt:new Date().toISOString(),evidence:{workId:'BV1qa0000001',workUrl:'https://www.bilibili.com/video/BV1qa0000001',workReferenceSource:'official_title_link'}};
   const journal=createJournal(profile);journal.write(parent);
   win=new BrowserWindow({show:false,webPreferences:{preload:path.join(root,'desktop/preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});win.webContents.setAudioMuted(true);
   win.webContents.session.webRequest.onBeforeRequest((request,callback)=>callback({cancel:!request.url.startsWith('data:')}));
   registerPublishFollowup({ipcMain,getWindow:()=>win,authenticate:async(token,id)=>{if(token!=='qa-only-token'||id!==account.id)throw Error('QA认证失败，未发送');return{userId:owner,account};},session:{fromPartition:name=>{eq(name,'persist:matrix-bilibili-'+account.connectorSessionId);return local;}},journal});
   await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"><p>offline QA</p>'));
   eq(await win.webContents.executeJavaScript('Object.isFrozen(window.matrixDesktop)'),true);
   const input={accessToken:'qa-only-token',accountId:account.id,receiptId:parent.id,requestId:randomUUID(),comment:'QA原创追评，未发送',pin:true};
   const invoke=changes=>win.webContents.executeJavaScript('window.matrixDesktop.publishFollowup('+JSON.stringify({...input,...changes})+')');
   let result=await invoke();eq(result.receipt.status,'confirmed');eq(result.receipt.pinResult.status,'confirmed');eq(result.receipt.commentId,'998877');eq(result.receipt.followupOf,parent.id);eq(result.receipt.attemptId,parent.attemptId);
   const rendered=JSON.stringify(result);eq(/QA_synthetic|qa_csrf_|qa-only-token|nativeAccountKey|sessionId|ownerId/.test(rendered),false);
   const sent=calls.length;await invoke();await invoke({requestId:randomUUID()});eq(calls.length,sent);
   result=await invoke({operation:'verify',requestId:undefined});eq(result.receipt.status,'confirmed');eq(result.receipt.pinResult.status,'confirmed');eq(calls.filter(c=>c.route.endsWith('/add')).length,1);eq(calls.filter(c=>c.route.endsWith('/top')).length,1);
   eq(journal.find(owner,'followup-'+parent.id).commentId,'998877');
   const beforeDenied=calls.length;result=await invoke({accessToken:'qa-wrong-token'});eq(!!result.error,true);eq(calls.length,beforeDenied);
   const manage=operation=>({operation,requestId:randomUUID(),expectedCommentId:'998877',expectedComment:'QA原创追评，未发送'});
   result=await invoke(manage('unpin'));eq(result.receipt.pinResult.status,'cancelled');eq(result.receipt.commentManagement.status,'confirmed');eq(pinned,false);
   result=await invoke(manage('delete'));eq(result.receipt.commentDeleted,true);eq(result.receipt.status,'confirmed');eq(result.receipt.commentManagement.operation,'delete');
   eq(journal.list(owner).find(row=>row.id==='followup-'+parent.id).commentDeleted,true);
   const afterDelete=calls.length;await invoke(manage('delete'));await invoke({operation:'pin',requestId:randomUUID()});await invoke({operation:'start',requestId:randomUUID()});eq(calls.length,afterDelete);eq(calls.filter(c=>c.route.endsWith('/del')).length,1);
   eq(/QA_synthetic|qa_csrf_|qa-only-token|nativeAccountKey|sessionId|ownerId/.test(JSON.stringify(result)),false);
   console.log(JSON.stringify({fullPreloadNativeFollowupChecks:checks,productionPreloadAndHandler:true,actualChromiumFetch:true,writeAheadAndCommentIdPersisted:true,duplicateAndVerifyDoNotSend:true,credentialsNotReturned:true,syntheticHttpsOnly:true,realPlatformNetwork:false}));
  }catch(error){console.error(error);process.exitCode=1;}finally{win?.destroy();ipcMain.removeHandler('matrix:publish-followup');app.exit(process.exitCode||0);}
 });
}
