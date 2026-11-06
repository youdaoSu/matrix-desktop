const path=require('node:path'),root=path.resolve(__dirname,'..');
if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const result=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:60000});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.error)console.error(result.error.message);process.exit(result.status??1);}
const {app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {cipher}=require('../desktop/account-operations-crypto.cjs');
const {configureEncryptedWorkspace}=require('../desktop/vendor/hengyuan-interactions/src/workspace-data.cjs');
const {OperationsStudio}=require('../desktop/account-operations-studio.cjs');
const {InteractionStore}=require('../desktop/vendor/hengyuan-interactions/src/interaction-store.cjs');
const {createDomRuntime}=require('../desktop/account-operations-dom-runtime.cjs');
const {createOutreachRuntime}=require('../desktop/account-operations-outreach-runtime.cjs');
const {createBrowserHost}=require('../desktop/account-operations-browser-host.cjs');
const {validateOutreachRelations}=require('../desktop/vendor/hengyuan-interactions/src/outreach.cjs');
const {followScript}=require('../desktop/own-fan-follow.cjs');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-own-fan-welcome-'));
app.setPath('userData',path.join(folder,'browser'));app.disableHardwareAcceleration();
app.on('window-all-closed',()=>{});
let stage='ready';const watchdog=setTimeout(()=>{console.error(JSON.stringify({stage,error:'native fixture watchdog'}));app.exit(1);},45000);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 const directory=path.join(folder,'workspace');fs.mkdirSync(directory);const key=crypto.randomBytes(32),unregister=configureEncryptedWorkspace({directory,codecFor:name=>cipher(key,'synthetic/'+name)});
 const studio=new OperationsStudio({directory}),id=crypto.randomUUID(),a={id,name:'Synthetic owner',platform:'douyin',binding:'synthetic-binding'};
 studio.configure([a]);studio.saveTeams([{id,role:'primary'}]);
 const store=new InteractionStore(directory,{...cipher(key,'synthetic-interactions'),getAccount:key=>studio.getAccount(key)});
 const fans=Array.from({length:4},(_,i)=>({id:'MS4wFan_'+i,uid:String(9000+i),name:'Synthetic '+i,profileUrl:'https://www.douyin.com/user/MS4wFan_'+i,firstSeenAt:'2026-01-01T00:00:00.000Z'}));
 let dom,runtime,host,clock=0,wall=Date.now(),followClicks=0,applications=0,sends=0,sourceComplete=true,changedSnapshot=false;const windows=[];
 const source=session.fromPartition('persist:synthetic-welcome');
 await source.protocol.handle('https',request=>{
  const url=new URL(request.url);assert.equal(url.hostname,'www.douyin.com');if(url.pathname==='/favicon.ico')return new Response(null,{status:204});const index=Number(url.pathname.split('_').at(-1));const fan=fans[index];assert(fan);
  const body='<meta charset=utf-8><main><section><h1>Synthetic recipient</h1><button id=dm>私信</button><button id=follow>关注</button></section></main><script>'+`const props={userInfo:{uid:'${fan.uid}',secUid:'${fan.id}',secret:${index===1?1:0},followStatus:0},isLogin:true,selfInfo:{info:{uid:'101'}}};for(const n of [document.querySelector('h1'),document.querySelector('#dm')])n['__reactFiber$fixture']={memoizedProps:props,return:null};document.querySelector('#follow').onclick=()=>{document.title='follow-click';${index===3?`const dialog=document.createElement('div');dialog.setAttribute('role','dialog');dialog.textContent='申请好友';const confirm=document.createElement('button');confirm.textContent='发送申请';confirm.onclick=()=>document.title='application-click';dialog.append(confirm);document.body.append(dialog);`:`document.querySelector('#follow').textContent='互相关注';`}};`+'</script>';
  return new Response(body,{headers:{'content-type':'text/html'}});
 });
 try{
  host=createBrowserHost({getAccount:key=>studio.getAccount(key),verifyOwner:async()=>({id}),getExpectedIdentity:async()=> '101',verifyIntent:context=>dom.canOperation(context),notify:event=>dom.receive(event),createWindow:()=>{const win=new BrowserWindow({show:false,webPreferences:{session:source,nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});win.webContents.on('page-title-updated',(_event,title)=>{if(title==='follow-click')followClicks++;if(title==='application-click')applications++;});windows.push(win);return win;}});
  dom=createDomRuntime({directory,studio,store,call:request=>host.command(request),now:Date.now});dom.registerNativeIdentity(id,'101');
  const refreshDirectory=async args=>{const items=args.ids?fans.filter(f=>args.ids.includes(f.id)):fans.slice(args.offset||0,(args.offset||0)+(args.limit||50));return{primaryAccountId:id,accountId:id,ownerIdentity:'101',readerIdentity:'101',ownerProfileUrl:'https://www.douyin.com/user/MS4wOwner',nativeDirectoryProof:{kind:'native-cache-v1',scopeHash:crypto.createHash('sha256').update(a.binding).digest('hex'),verifiedAt:new Date().toISOString()},items,total:fans.length,complete:sourceComplete,capturedAt:changedSnapshot&&args.offset?'2026-01-02T00:00:00.000Z':'2026-01-01T00:00:00.000Z',contactHistory:{items:items.map(f=>({id:f.id,uid:f.uid,status:'eligible'}))}};};
  runtime=createOutreachRuntime({directory,studio,store,dom,refreshDirectory,reserve(){throw Error('No real message sending');},release(){},canRun:()=>true,canWrite:()=>true,now:Date.now});runtime.fanPlan.mono=()=>clock;
  runtime.fanPlan.sendTask=async taskId=>{
   const task=runtime.tasks.get(taskId);sends++;
   if(!task.followupOf&&task.recipientId!==fans[2].id){
    if(task.recipientId===fans[0].id){await dom.proxy.withOperation('prepare',async()=>{runtime.tasks.beginSend(taskId,{recipientId:fans[0].uid});runtime.tasks.finishSend(taskId,{status:'failed',failure:{outcome:'not-sent',scope:'task',code:'recipient-restricted',stage:'receipt',evidence:'platform-rejection:synthetic-thread:client:synthetic-client',detail:'Synthetic platform rejection'}});},{accountId:id,outreachId:taskId,intentExpiresAt:wall+60000});}
    else runtime.tasks.recordFailure(taskId,{outcome:'not-sent',scope:'task',code:'task-error',stage:'preflight',detail:'Synthetic explicit preflight failure'});
    return;
   }
   const fan=fans.find(f=>f.id===task.recipientId);
   await dom.proxy.withOperation('prepare',async()=>{runtime.tasks.beginSend(taskId,{recipientId:fan.uid});runtime.tasks.finishSend(taskId,{status:'sent',receipt:'platform:synthetic-'+taskId});},{accountId:id,outreachId:taskId,intentExpiresAt:wall+60000});
  };
  const args={accountId:id,text:'Synthetic welcome',offset:0,scanLimit:500,scanAll:true,followOnFailure:true,batchSize:2,intervalSeconds:5,batchGapSeconds:30};
  const preview=await runtime.command('own-fan-preview',args);assert.equal(preview.recipientCount,4);runtime.command('own-fan-start',{token:preview.token,acknowledge:true});
  for(let i=0;i<16&&runtime.fanPlan.snapshot().status!=='completed';i++){stage='tick-'+i;await runtime.fanPlan.tick();const state=runtime.fanPlan.snapshot();assert.notEqual(state.status,'paused',state.detail);clock+=30000;}
  assert.equal(runtime.fanPlan.snapshot().status,'completed');assert.equal(runtime.fanPlan.snapshot().sent,2);assert.equal(runtime.fanPlan.snapshot().friendRequired,2);assert.equal(followClicks,2);assert.equal(applications,0);assert.equal(sends,5);
  const next=await runtime.command('own-fan-preview',{...args,text:'Changed welcome'});assert.equal(next.recipientCount,0);assert.equal(next.excluded,4);
  sourceComplete=false;await assert.rejects(()=>runtime.command('own-fan-preview',args),/尚未完整同步/);sourceComplete=true;
  for(let i=4;i<1001;i++)fans.push({id:'MS4wFan_'+i,uid:String(9000+i),name:'Synthetic '+i,profileUrl:'https://www.douyin.com/user/MS4wFan_'+i,firstSeenAt:'2026-01-01T00:00:00.000Z'});
  const all=await runtime.command('own-fan-preview',args);assert.equal(all.scanned,1001);assert.equal(all.recipientCount,997);assert.equal(all.recipients.length,50);
  changedSnapshot=true;await assert.rejects(()=>runtime.command('own-fan-preview',args),/名单已变化/);changedSnapshot=false;
  validateOutreachRelations(studio.snapshot(),{...store.snapshot(),externalAttempts:store.getExternalAttempts()});
  const child=studio.snapshot().outreach.find(t=>t.followupOf);assert(child);assert.throws(()=>runtime.tasks.createOwnFanFollowup(child.followupOf));
  const reopened=new InteractionStore(directory,{...cipher(key,'synthetic-interactions'),getAccount:key=>studio.getAccount(key)});validateOutreachRelations(new OperationsStudio({directory}).snapshot(),{...reopened.snapshot(),externalAttempts:reopened.getExternalAttempts()});
  // The actual profile reader must reject a mismatched sender before Follow.
  const test=new BrowserWindow({show:false,webPreferences:{session:source,sandbox:true,contextIsolation:true,nodeIntegration:false}});windows.push(test);await test.loadURL(fans[0].profileUrl);
  await test.webContents.executeJavaScript("for(const n of [document.querySelector('h1'),document.querySelector('#dm')])n['__reactFiber$fixture'].memoizedProps.selfInfo.info.uid='999';true");
  const result=await test.webContents.executeJavaScript(followScript({...studio.snapshot().outreach.find(t=>t.recipientId===fans[0].id),senderBinding:{identity:'101'}},fans[0],'follow'));
  assert.equal(result.state,'identity-unverified');assert.equal(await test.webContents.executeJavaScript("document.querySelector('#follow').textContent"),'关注');test.close();
  await delay(150);assert.equal(host.resources().length,0,'Finalized follow helper pages must be released');
  console.log(JSON.stringify({passed:true,actualElectron:true,realNativeHostAndWorkerProxy:true,strictSenderAndRecipientIdentity:true,linkedOneRetry:true,privateFollowApplicationSkipped:true,applicationDialogNotSubmitted:true,applicationsSent:applications,followClicks,syntheticMessageExecutions:sends,permanentExclusionAfterReopen:true,helperWindowsReleased:true,realPlatformRequests:0}));
 }finally{runtime?.close();dom?.close();await host?.close();for(const win of windows)if(!win.isDestroyed())win.destroy();unregister();}
}).then(()=>{clearTimeout(watchdog);app.quit();}).catch(error=>{console.error(stage,error);clearTimeout(watchdog);app.exit(1);});
