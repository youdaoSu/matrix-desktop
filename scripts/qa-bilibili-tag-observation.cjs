const path=require('node:path'),root=path.resolve(__dirname,'..'),assert=require('node:assert/strict');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
const {createBilibiliTagObservation}=require('../desktop/bilibili-tag-observation.cjs');
if(!process.versions.electron){
 (async()=>{
  const {EventEmitter}=require('node:events');let checks=0,disabled=0,url='https://member.bilibili.com/platform/upload/video/frame',calls=[];
  const events=new EventEmitter(),guest={debugger:events,getURL:()=>url,isDestroyed:()=>false};
  let responseBody={code:0,data:{code:-400,msg:'SECRET_TOKEN_PRIVATE_TEXT'}};
  const send=async(method,args)=>{calls.push([method,args]);if(method==='Network.getResponseBody')return{body:JSON.stringify(responseBody)};return{};};
  const observation=await createBilibiliTagObservation(guest,send,async()=>{disabled++});
  observation.begin('程序员');
  const emit=(method,params)=>events.emit('message',{},method,params);
  const request=(id,target,method='GET')=>emit('Network.requestWillBeSent',{requestId:id,request:{method,url:target,headers:{Cookie:'SECRET_COOKIE'},postData:'SECRET_BODY'}});
  const target='https://api.bilibili.com/x/vupre/web/topic/tag/check?tag='+encodeURIComponent('程序员');
  request('private','https://api.bilibili.com/x/space/myinfo');request('post',target,'POST');request('other',target.replace('api.bilibili.com','api.bilibili.com.evil.invalid'));request('wrong',target.replace(encodeURIComponent('程序员'),'other'));request('duplicate',target+'&tag=other');
  assert.match(observation.describe(),/未观察/);assert.equal(calls.length,1);checks+=2;
  request('wanted',target);emit('Network.responseReceived',{requestId:'wanted',response:{url:target,status:200,headers:{'Set-Cookie':'SECRET_COOKIE'}}});emit('Network.loadingFinished',{requestId:'wanted',encodedDataLength:120});await observation.drain();
  assert.match(observation.describe(),/HTTP 200，返回码 0，校验码 -400/);assert(!/SECRET|https:|Cookie|程序员/.test(observation.describe()));assert.equal(calls.filter(x=>x[0]==='Network.getResponseBody').length,1);checks+=3;
  observation.begin('程序员');request('large',target);emit('Network.responseReceived',{requestId:'large',response:{url:target,status:200}});emit('Network.loadingFinished',{requestId:'large',encodedDataLength:70000});assert.match(observation.describe(),/限额/);assert.equal(calls.length,2);checks+=2;
  observation.begin('程序员');request('redirect',target);request('redirect','https://other.invalid/private');emit('Network.loadingFinished',{requestId:'redirect',encodedDataLength:2});assert.match(observation.describe(),/跳转/);assert.equal(calls.length,2);checks+=2;
  observation.begin('程序员');for(let i=0;i<30;i++)request('bounded'+i,target);assert.equal(observation.describe().split('；').length,8);checks++;
  observation.begin('程序员');request('failure',target);emit('Network.loadingFailed',{requestId:'failure',errorText:'net::ERR_CONNECTION_RESET'});assert.match(observation.describe(),/ERR_CONNECTION_RESET/);checks++;
  assert.deepEqual(observation.rejection(),{topicSearchAllowed:false});checks++;
  observation.begin('程序员');assert.equal(observation.rejection(),null);checks++;
  responseBody={code:0,data:{code:-1,content:'SECRET_PRIVATE_TEXT'}};
  request('topic',target);emit('Network.responseReceived',{requestId:'topic',response:{url:target,status:200}});emit('Network.loadingFinished',{requestId:'topic',encodedDataLength:80});await observation.drain();
  assert.deepEqual(observation.rejection(),{pendingTopicDecision:true});checks++;
  const customTarget='https://member.bilibili.com/x/app/h5/archive/tag/info?tag_name='+encodeURIComponent('程序员');
  request('custom',customTarget);assert.deepEqual(observation.rejection(),{pendingTopicDecision:true});checks++;
  responseBody={code:0,data:{code:0}};emit('Network.responseReceived',{requestId:'custom',response:{url:customTarget,status:200}});emit('Network.loadingFinished',{requestId:'custom',encodedDataLength:40});await observation.drain();
  assert.deepEqual(observation.rejection(),{topicSearchAllowed:true});assert(!/SECRET|http|程序员/.test(JSON.stringify(observation.rejection())));checks+=2;
  await observation.close();assert.equal(events.listenerCount('message'),0);assert.equal(disabled,1);assert.equal(observation.describe(),'本轮未观察到对应标签校验请求');checks+=3;
  url='https://other.invalid/';await assert.rejects(createBilibiliTagObservation(guest,send,()=>{}),/投稿页/);checks++;
  const {spawnSync}=require('node:child_process'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:30000});
  assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/bilibiliPassiveNativeChecks/);console.log(JSON.stringify({bilibiliPassiveObservationChecks:checks,native:JSON.parse(child.stdout.trim()),realPlatformRequests:0}));
 })().catch(error=>{console.error(error);process.exitCode=1;});
}else{
 const {app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),os=require('node:os');
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-bili-tag-observation-'));app.setPath('userData',profile);app.commandLine.appendSwitch('mute-audio');
 app.whenReady().then(async()=>{let win;try{
  let localRequests=0;const local=session.fromPartition('qa-bilibili-tag-observation');
  await local.protocol.handle('https',request=>{const url=new URL(request.url);localRequests++;if(url.hostname==='member.bilibili.com'&&url.pathname==='/platform/upload/video/frame')return new Response('<meta charset=utf-8><p>synthetic editor</p>',{headers:{'Content-Type':'text/html'}});assert.equal(url.hostname,'member.bilibili.com');assert.equal(request.method,'GET');return new Response(JSON.stringify({code:0,data:{code:-400,msg:'PRIVATE_RESPONSE_TEXT'}}),{headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'https://member.bilibili.com'}});});
  win=new BrowserWindow({show:false,webPreferences:{session:local,sandbox:true,contextIsolation:true}});await win.loadURL('https://member.bilibili.com/platform/upload/video/frame');
  const {withOfficialDOM}=require('../desktop/official-dom.cjs');
  let result;await withOfficialDOM(win.webContents,'matrix-passive-tag-fixture',async({send,evaluate,stopNetworkObservation})=>{
   const observer=await createBilibiliTagObservation(win.webContents,send,stopNetworkObservation);
   try{observer.begin('程序员');await evaluate(async()=>{await(await fetch('/x/vupre/web/topic/tag/check?tag='+encodeURIComponent('程序员'))).json();});const deadline=Date.now()+2000;while(Date.now()<deadline&&!observer.describe().includes('校验码')){await new Promise(resolve=>setTimeout(resolve,20));await observer.drain();}result=observer.describe();assert.match(result,/HTTP 200，返回码 0，校验码 -400/);assert(!result.includes('PRIVATE'));}finally{await observer.close();}
  });
  assert.equal(win.webContents.debugger.listenerCount('message'),0);assert.equal(localRequests,2);console.log(JSON.stringify({bilibiliPassiveNativeChecks:4,diagnostic:result,localProtocolOnly:true,extraRequests:0,visibleWindows:0,realPlatformRequests:0}));
 }catch(error){console.error(error);process.exitCode=1;}finally{win?.destroy();app.exit(process.exitCode||0);}});
}
