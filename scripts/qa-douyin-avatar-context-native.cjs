// Real sandboxed own-page fetch context; synthetic protocol and profile only.
const path=require('node:path'),root=path.resolve(__dirname,'..');require('./qa-console-pipe.cjs').guardQaConsolePipes();
if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const r=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename,...process.argv.slice(2)],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:60000});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status??1);}
else{
  const {app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');
  let moduleRoot=root;if(process.argv[2]){assert.equal(process.argv[2],'--packaged');moduleRoot=path.join(root,'release-next/win-unpacked/resources/app.asar');assert.equal(require('node:crypto').createHash('sha256').update(require('original-fs').readFileSync(moduleRoot)).digest('hex'),process.argv[3]);}
  app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-avatar-context-native-')));app.commandLine.appendSwitch('mute-audio');app.on('window-all-closed',()=>{});
  app.whenReady().then(async()=>{
    const {createBrowserReader}=require(path.join(moduleRoot,'desktop/douyin-browser-reader.cjs')),{createFollowerAvatarLookup}=require(path.join(moduleRoot,'desktop/douyin-follower-avatar.cjs'));
    let checks=0,mode='ok',clock=1000,reader,lookup,nativeCalls=0,held,peerReads=0,selfReads=0;const windows=[],requests=[];
    const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},until=async test=>{for(let n=0;n<300;n++){if(test())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Context fixture deadline');};
    const source=session.fromPartition('qa-avatar-context'),account={id:'qa',platform:'douyin',connectorSessionId:'12345678-1234-1234-1234-123456789abc',nativeAccountKey:'qa-context'},row={platformId:'9007199254740993123',platformUserId:'9007199254740993123',authorProfileUrl:'https://www.douyin.com/user/MS4wQA_TARGET'};
    const owner='9007199254740993',avatar='https://p1.byteimg.com/qa/avatar.webp',options={accountSession:source,publicHandle:account.nativeAccountKey,assertCurrent:async()=>{}};
    source.fetch=async()=>{nativeCalls++;throw Error('Native network identity must not be used');};
    source.protocol.handle('https',async request=>{
      const url=new URL(request.url);eq(url.origin,'https://www.douyin.com');eq(request.method,'GET');requests.push(url.pathname);
      if(url.pathname==='/user/self')return new Response('<title>QA</title><div id="qa">own</div><script>window.qaCursor="keep";</script>',{headers:{'content-type':'text/html'}});
      if(url.pathname==='/aweme/v1/web/user/profile/self/'){
        selfReads++;if(mode==='owner-denied')return new Response('Denied',{status:403});
        return mode==='alias'?Response.json({statusCode:0,userInfo:{userId:owner,uniqueId:'qa-context',secUid:'MS4wQA_OWNER'}}):Response.json({status_code:0,user:{uid:mode==='wrong-owner'?'999':owner,unique_id:'qa-context',sec_uid:'MS4wQA_OWNER'}});
      }
      eq(url.pathname,'/aweme/v1/web/user/profile/other/');peerReads++;eq(url.searchParams.get('sec_user_id'),'MS4wQA_TARGET');
      if(mode==='hold')await new Promise(resolve=>held=resolve);
      if(mode==='peer-denied')return new Response('Denied',{status:403});
      if(mode==='peer-platform')return Response.json({status_code:2145,user:{uid:row.platformId}});
      if(mode==='peer-empty')return Response.json({status_code:0});
      if(mode==='peer-conflict')return Response.json({status_code:0,user:{uid:row.platformId,userId:'999',sec_uid:'MS4wQA_TARGET'}});
      if(mode==='alias')return new Response('{"statusCode":0,"userInfo":{"userId":9007199254740993123,"secUid":"MS4wQA_TARGET","avatarUrl":"'+avatar+'"}}');
      return new Response('{"status_code":0,"user":{"uid":'+(mode==='wrong-peer'?'999':row.platformId)+',"sec_uid":"MS4wQA_TARGET","avatar_thumb":{"url_list":["'+avatar+'"]}}}');
    });
    const make=()=>{reader=createBrowserReader({now:()=>clock,requireFollowerResponses:true,createWindow:s=>{eq(s,source);const win=new BrowserWindow({show:false,webPreferences:{session:s,preload:path.join(moduleRoot,'desktop/douyin-followers-preload.cjs'),additionalArguments:['--matrix-follower-dom-only'],sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});windows.push(win);return win;}});lookup=createFollowerAvatarLookup({session:{fromPartition:()=>source},gapMs:0,profileReader:input=>reader.readPublicAvatar(input)});};
    try{
      await source.cookies.set({url:'https://www.douyin.com/',domain:'.douyin.com',path:'/',name:'sessionid',value:'QA_ONLY',secure:true});
      for(const current of ['ok','alias','wrong-peer','peer-denied','peer-platform','peer-empty','peer-conflict']){
        mode=current;make();const client=await reader.acquire(options),win=windows.at(-1),before=windows.length,beforeSelf=selfReads,beforePeer=peerReads;
        if(['ok','alias'].includes(mode)){eq(await lookup.read({account,row,assertCurrent:async()=>{}}),[avatar]);eq(selfReads,beforeSelf);eq(await win.webContents.executeJavaScript('window.qaCursor'),'keep');}
        else{await assert.rejects(()=>lookup.read({account,row,assertCurrent:async()=>{}}));checks++;const count=peerReads;await assert.rejects(()=>lookup.read({account,row,assertCurrent:async()=>{}}));checks++;eq(peerReads,count);}
        eq(peerReads,beforePeer+1);eq(windows.length,before);eq(nativeCalls,0);client.close();lookup.close();reader.close();
      }
      // A public fetch wrapper can fail BEFORE any network request exists.
      // Distinguish that from server denial/slow response, without logging it.
      mode='ok';make();const wrapperClient=await reader.acquire(options),wrapperWin=windows.at(-1),wrapperReads=peerReads;
      await wrapperWin.webContents.executeJavaScript(`{const original=window.fetch;window.fetch=function(url,...args){if(String(url).includes('/user/profile/other/'))return Promise.reject(new TypeError('QA_PRIVATE'));return original.call(this,url,...args);};true;}`);
      await assert.rejects(()=>lookup.read({account,row,assertCurrent:async()=>{}}),error=>error.avatarCode==='avatar-request-not-started'&&!error.message.includes('QA_PRIVATE'));checks++;eq(peerReads,wrapperReads);wrapperClient.close();lookup.close();reader.close();
      mode='ok';make();const client=await reader.acquire(options),win=windows.at(-1);client.close();clock+=31000;await win.webContents.executeJavaScript('window.__matrixFollowerObserved.identity=null');mode='wrong-owner';const beforePeer=peerReads;
      await assert.rejects(()=>lookup.read({account,row,assertCurrent:async()=>{}}),/本人账号与绑定不一致/);checks++;eq(peerReads,beforePeer);eq(nativeCalls,0);lookup.close();reader.close();
      mode='ok';make();const denied=await reader.acquire(options);denied.close();clock+=31000;await windows.at(-1).webContents.executeJavaScript('window.__matrixFollowerObserved.identity=null');mode='owner-denied';const deniedPeer=peerReads;
      await assert.rejects(()=>lookup.read({account,row,assertCurrent:async()=>{}}));checks++;eq(peerReads,deniedPeer);eq(nativeCalls,0);lookup.close();reader.close();
      mode='ok';make();const live=await reader.acquire(options),retained=windows.at(-1);mode='hold';const inFlight=lookup.read({account,row,assertCurrent:async()=>{}});await until(()=>held);live.close();eq(retained.webContents.getBackgroundThrottling(),false);
      await assert.rejects(()=>reader.acquire({...options,refreshFollowers:true}),/正在读取另一页/);checks++;eq(retained.isDestroyed(),false);held();held=undefined;eq(await inFlight,[avatar]);eq(retained.webContents.getBackgroundThrottling(),true);eq(await retained.webContents.executeJavaScript('window.qaCursor'),'keep');lookup.close();reader.close();
      // No existing collector: establish the normal own page once, not a
      // native request/fallback or a second parallel window for every avatar.
      mode='ok';make();const count=windows.length;eq(await lookup.read({account,row,assertCurrent:async()=>{}}),[avatar]);eq(windows.length,count+1);eq(nativeCalls,0);
      const beforeInvalid=peerReads;await assert.rejects(()=>reader.readPublicAvatar({...options,target:{uid:Number(row.platformId),secUid:'MS4wQA_TARGET'}}),/参数无效/);checks++;eq(peerReads,beforeInvalid);
      eq(requests.some(value=>/follower\/list|notice|notification|message|publish|mark_read/.test(value)),false);
      console.log(JSON.stringify({avatarContextNativeChecks:checks,actualSandboxedElectron:true,normalWebsitePageContext:true,sameOwnerProofAndCookieScope:true,camelAndSnakeFields:true,precisionPreserved:true,nativeNetworkRequests:0,existingCursorAndWindowPreserved:true,readOnlyPolicyUnchanged:true,denialsHaveNoAlternateRequest:true,realProfileTouched:false,externalPlatformRequests:0}));
    }catch(error){console.error(error);process.exitCode=1;}finally{lookup?.close();reader?.close();for(const win of windows)if(!win.isDestroyed())win.destroy();app.exit(process.exitCode||0);}
  });
}
