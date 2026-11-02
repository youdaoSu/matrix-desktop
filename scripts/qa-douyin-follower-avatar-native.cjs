// Actual Electron Session.fetch; disposable profile and local protocol only.
const path=require('node:path'),root=path.resolve(__dirname,'..');require('./qa-console-pipe.cjs').guardQaConsolePipes();
if(!process.versions.electron){
  const {spawnSync}=require('node:child_process'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const result=spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename,...process.argv.slice(2)],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:45000});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status??1);
}else{
  const {app,session}=require('electron'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-follower-avatar-native-'));app.setPath('userData',directory);app.commandLine.appendSwitch('mute-audio');
  const moduleRoot=process.argv[2]==='--packaged'?process.argv[3]:root;
  if(process.argv[2]==='--packaged')assert(path.isAbsolute(moduleRoot)&&moduleRoot.endsWith('.asar'));
  const {createFollowerAvatarLookup}=require(path.join(moduleRoot,'desktop/douyin-follower-avatar.cjs'));
  app.whenReady().then(async()=>{let reader;try{
    let checks=0,requests=0,blocked=0,mode='ok',cookieRequests=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
    const account={id:'qa',platform:'douyin',connectorSessionId:'12345678-1234-1234-1234-123456789abc',nativeAccountKey:'qa-owner'},row={platformId:'9007199254740993123',platformUserId:'9007199254740993123',authorProfileUrl:'https://www.douyin.com/user/MS4wQA_TARGET'};
    const source=session.fromPartition('qa-follower-avatar-native');
    await source.cookies.set({url:'https://www.douyin.com/',domain:'.douyin.com',path:'/',name:'sessionid',value:'QA_ONLY',secure:true});
    source.webRequest.onBeforeRequest((details,done)=>{const u=new URL(details.url),allowed=details.method==='GET'&&u.origin==='https://www.douyin.com'&&['/aweme/v1/web/user/profile/self/','/aweme/v1/web/user/profile/other/'].includes(u.pathname);if(!allowed)blocked++;done({cancel:!allowed});});
    source.protocol.handle('https',request=>{
      requests++;const url=new URL(request.url);eq(request.method,'GET');eq(url.origin,'https://www.douyin.com');eq(request.headers.get('authorization'),null);
      if((request.headers.get('cookie')||'').includes('sessionid=QA_ONLY'))cookieRequests++;
      if(mode==='denied')return new Response('denied',{status:403});
      if(url.pathname==='/aweme/v1/web/user/profile/self/')return Response.json({status_code:0,user:{uid:'123',unique_id:'qa-owner'}});
      eq(url.pathname,'/aweme/v1/web/user/profile/other/');eq(url.searchParams.get('sec_user_id'),'MS4wQA_TARGET');
      return new Response('{"status_code":0,"user":{"uid":9007199254740993123,"sec_uid":"MS4wQA_TARGET","avatar_thumb":{"url_list":["https://p1.byteimg.com/qa/avatar.webp"]}}}');
    });
    reader=createFollowerAvatarLookup({session:{fromPartition:partition=>{eq(partition,'persist:matrix-douyin-'+account.connectorSessionId);return source;}},gapMs:0});
    eq(await reader.read({account,row,assertCurrent:async()=>{}}),['https://p1.byteimg.com/qa/avatar.webp']);eq(requests,2);eq(blocked,0);
    // Custom protocol dispatch can omit browser-generated Cookie headers;
    // real session-cookie inclusion is verified separately below on loopback.
    mode='denied';await assert.rejects(()=>reader.read({account,row,assertCurrent:async()=>{}}),/HTTP 403/);checks++;const before=requests;
    await assert.rejects(()=>reader.read({account,row,assertCurrent:async()=>{}}),/HTTP 403/);checks++;eq(requests,before);
    const http=require('node:http');let included=false;
    const server=http.createServer((req,res)=>{included=(req.headers.cookie||'').includes('qa_local_cookie=QA_LOCAL');res.writeHead(200,{'content-type':'application/json'});res.end('{"ok":true}');});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{const url='http://127.0.0.1:'+server.address().port+'/cookie-proof';await source.cookies.set({url,name:'qa_local_cookie',value:'QA_LOCAL',path:'/'});source.webRequest.onBeforeRequest((details,done)=>done({cancel:details.url!==url}));const response=await source.fetch(url,{method:'GET',credentials:'include',redirect:'error'});eq(response.status,200);await response.text();eq(included,true);}finally{await new Promise(resolve=>server.close(resolve));}
    console.log(JSON.stringify({followerAvatarNativeChecks:checks,realElectronSessionFetch:true,realChromiumCookieInclusion:true,onlyLocalFixtures:true,publicProfileGets:requests,noDeniedFallback:true,packaged:moduleRoot!==root,realProfileTouched:false,externalPlatformRequests:0,privateSdkCalls:0}));
  }catch(error){console.error(error);process.exitCode=1;}finally{reader?.close();app.exit(process.exitCode||0);}});
}
