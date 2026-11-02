// Actual Electron isolated world, synthetic HTTPS protocol, no real profiles.
const path=require('node:path'),root=path.resolve(__dirname,'..');require('./qa-console-pipe.cjs').guardQaConsolePipes();
if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const r=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename,...process.argv.slice(2)],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:60000});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status??1);}
else{
 const {app,BrowserWindow,session}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os');
 let moduleRoot=root;if(process.argv[2]){assert.equal(process.argv[2],'--packaged');moduleRoot=path.join(root,'release-next/win-unpacked/resources/app.asar');assert.equal(require('node:crypto').createHash('sha256').update(require('original-fs').readFileSync(moduleRoot)).digest('hex'),process.argv[3]);}
 app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-independent-read-')));app.commandLine.appendSwitch('mute-audio');app.on('window-all-closed',()=>{});
 app.whenReady().then(async()=>{
  const {createBrowserReader}=require(path.join(moduleRoot,'desktop/douyin-browser-reader.cjs')),{createFollowerAvatarLookup}=require(path.join(moduleRoot,'desktop/douyin-follower-avatar.cjs'));
  let checks=0,mode='ok',reader,lookup;const windows=[],requests=[];const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
  const source=session.fromPartition('qa-independent-reads'),owner='9007199254740993',peer='9007199254740993123',avatar='https://p1.byteimg.com/qa/member.webp';
  const account={id:'qa',platform:'douyin',connectorSessionId:'12345678-1234-1234-1234-123456789abc',nativeAccountKey:'qa-owner'},options={accountSession:source,publicHandle:account.nativeAccountKey,assertCurrent:async()=>{},independent:true},row={platformId:peer,platformUserId:peer,authorProfileUrl:'https://www.douyin.com/user/MS4wQA_PEER'};
  source.fetch=async()=>{throw Error('Native session transport must not be used');};
  source.protocol.handle('https',async request=>{
   const url=new URL(request.url);eq(url.origin,'https://www.douyin.com');eq(request.method,'GET');requests.push({path:url.pathname,query:Object.fromEntries(url.searchParams)});
   if(url.pathname==='/user/self')return new Response('<title>QA</title><script>window.qaCursor="keep";window.fetch=()=>Promise.reject(new TypeError("QA_BROKEN_PUBLIC_WRAPPER"));window.webpackChunkdouyin_web={mustNotUse:true};</script>',{headers:{'content-type':'text/html'}});
   if(url.pathname==='/aweme/v1/web/user/profile/self/'){
    if(mode==='owner-denied')return new Response('denied',{status:403});
    return new Response('{"status_code":0,"user":{"uid":'+owner+',"unique_id":"'+(mode==='owner-mismatch'?'foreign':'qa-owner')+'","sec_uid":"MS4wQA_OWNER","follower_count":2}}');
   }
   if(url.pathname==='/aweme/v1/web/user/follower/list/'){
    if(mode==='roster-denied')return new Response('denied',{status:403});
    if(mode==='roster-platform')return Response.json({status_code:2145});
    if(mode==='roster-html')return new Response('<html>verification</html>');
    if(mode==='roster-redirect')return new Response('',{status:302,headers:{location:'https://www.douyin.com/alternate-not-allowed'}});
    if(mode==='roster-shape')return Response.json({status_code:0,followers:'not-a-list',has_more:0,min_time:'0'});
    if(mode==='oversize')return new Response('x',{headers:{'content-length':String(4*1024*1024+1)}});
    eq(url.searchParams.get('user_id'),owner);eq(url.searchParams.get('sec_user_id'),'MS4wQA_OWNER');eq(url.searchParams.get('source_type'),'1');eq(url.searchParams.get('count'),'20');
    const last=url.searchParams.get('max_time')!=='0';if(last)eq(url.searchParams.get('max_time'),'1790000000');
    return new Response('{"status_code":0,"followers":[{"uid":'+(last?'9007199254740993124':peer)+',"sec_uid":"MS4wQA_PEER","nickname":"QA","avatar_thumb":{"url_list":["'+avatar+'"]}}],"has_more":'+(last?'0':'1')+',"min_time":"'+(last?'1789999999':'1790000000')+'","offset":'+(last?'40':'20')+'}');
   }
   eq(url.pathname,'/aweme/v1/web/user/profile/other/');eq(url.searchParams.get('sec_user_id'),'MS4wQA_PEER');
   if(mode==='avatar-denied')return new Response('denied',{status:403});
   return new Response('{"status_code":0,"user":{"uid":'+peer+',"sec_uid":"'+(mode==='peer-mismatch'?'MS4wFOREIGN':'MS4wQA_PEER')+'","avatar_thumb":{"url_list":["'+avatar+'"]}}}');
  });
  const make=()=>{reader=createBrowserReader({independentReads:true,requireFollowerResponses:true,createWindow:s=>{eq(s,source);const win=new BrowserWindow({show:false,webPreferences:{session:s,sandbox:true,contextIsolation:true,nodeIntegration:false}});windows.push(win);return win;}});lookup=createFollowerAvatarLookup({session:{fromPartition:()=>source},gapMs:0,profileReader:input=>reader.readPublicAvatar({...input,independent:true})});};
  try{
   eq(fs.readFileSync(path.join(moduleRoot,'desktop/main.cjs'),'utf8').includes('independentReads:true'),true);
   await source.cookies.set({url:'https://www.douyin.com/',domain:'.douyin.com',path:'/',name:'sessionid',value:'QA_ONLY',secure:true});
   mode='ok';make();let client=await reader.acquire(options),win=windows.at(-1);eq(client.ownUid,owner);
   const first=await client.readWeb('followers',{cursor:'0',offset:'0',sourceType:'1'});eq(first.followers[0].uid,peer);eq(first.min_time,'1790000000');eq(first.has_more,true);
   const second=await client.readWeb('followers',{cursor:first.min_time,offset:first.offset,sourceType:'1'});eq(second.followers[0].uid,'9007199254740993124');eq(second.has_more,false);eq(await lookup.read({account,row,assertCurrent:async()=>{}}),[avatar]);
   eq(await win.webContents.executeJavaScript('window.qaCursor'),'keep');eq(await win.webContents.executeJavaScript('fetch("/not-called").then(()=>false,()=>true)'),true);client.close();lookup.close();reader.close();
   for(mode of ['owner-denied','owner-mismatch','roster-denied','roster-platform','roster-html','roster-redirect','roster-shape','oversize','avatar-denied','peer-mismatch']){
    make();const before=requests.length;
    if(mode.startsWith('owner-')){await assert.rejects(()=>reader.acquire(options));checks++;eq(requests.slice(before).some(r=>/follower\/list|profile\/other/.test(r.path)),false);}
    else{client=await reader.acquire(options);const count=requests.length;if(mode.startsWith('avatar-')||mode==='peer-mismatch')await assert.rejects(()=>lookup.read({account,row,assertCurrent:async()=>{}}));else await assert.rejects(()=>client.readWeb('followers',{cursor:'0',offset:'0',sourceType:'1'}));checks++;eq(requests.slice(count).filter(r=>/follower\/list|profile\/other/.test(r.path)).length,1);client.close();}
    lookup.close();reader.close();
   }
   eq(requests.some(r=>/notice|notification|message|mark_read|publish/.test(r.path)),false);
   // Custom protocol handlers can omit browser-generated Cookie headers.
   // Prove isolated-world SAME-ORIGIN HttpOnly cookie flow on real loopback,
   // plus absence from a second session. No production request is redirected.
   const http=require('node:http'),observed=[];const server=http.createServer((req,res)=>{assert.equal(req.method,'GET');assert(['/','/cookie-proof'].includes(req.url));if(req.url==='/cookie-proof'){observed.push((req.headers.cookie||'').includes('qa_local=QA_LOCAL'));eq((req.headers.cookie||'').includes('sessionid=QA_ONLY'),false);res.setHeader('content-type','application/json');res.end('{"ok":true}');}else{res.setHeader('content-type','text/html');res.end('<script>window.fetch=()=>Promise.reject(Error("QA broken"));</script>');}});
   await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
   try{const origin='http://127.0.0.1:'+server.address().port;await source.cookies.set({url:origin,name:'qa_local',value:'QA_LOCAL',httpOnly:true,path:'/'});
    for(const s of [source,session.fromPartition('qa-independent-other')]){s.webRequest.onBeforeRequest((d,done)=>done({cancel:!d.url.startsWith(origin+'/')||d.method!=='GET'}));const local=new BrowserWindow({show:false,webPreferences:{session:s,sandbox:true,contextIsolation:true,nodeIntegration:false}});windows.push(local);await local.loadURL(origin+'/');eq(await local.webContents.executeJavaScriptInIsolatedWorld(1001,[{code:'fetch("/cookie-proof",{method:"GET",credentials:"same-origin",redirect:"error"}).then(r=>r.json()).then(v=>v.ok)'}],false),true);local.destroy();s.webRequest.onBeforeRequest(null);}
    eq(observed,[true,false]);
   }finally{await new Promise(resolve=>server.close(resolve));}
   console.log(JSON.stringify({independentReadNativeChecks:checks,brokenWebsiteFetchDoesNotBlockBrowserGet:true,sameAccountSessionAndOrigin:true,normalGetOnly:true,exactOwnerAndPeerProof:true,timeCursorPagination:true,existingWindowAndCursorPreserved:true,denialsNoFallback:true,boundedResponse:true,realProfileTouched:false,externalPlatformRequests:0}));
  }catch(error){console.error(error);process.exitCode=1;}finally{lookup?.close();reader?.close();for(const win of windows)if(!win.isDestroyed())win.destroy();app.exit(process.exitCode||0);}
 });
}
