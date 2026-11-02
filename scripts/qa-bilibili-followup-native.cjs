const path=require('node:path'),root=path.resolve(__dirname,'..');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
if(!process.versions.electron){const {spawnSync}=require('node:child_process'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const r=spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename,...(process.argv.includes('--qa-failure-exit')?['--qa-failure-exit']:[])],{cwd:root,windowsHide:true,encoding:'utf8',timeout:30000,env});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');const complete=(r.stdout||'').split(/\r?\n/).some(line=>{try{const v=JSON.parse(line);return v.nativeBilibiliFollowupTransportChecks===23&&v.realLoopbackRequests===2&&v.policyChanged===false&&v.realPlatformNetwork===false;}catch{return false;}});process.exit(r.status===0&&complete?0:1);}
else{
 const {app,session}=require('electron'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');
 const {createBilibiliFollowupTransport}=require('../desktop/bilibili-followup-transport.cjs');
 app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-bili-followup-native-qa-')));app.commandLine.appendSwitch('mute-audio');
 app.whenReady().then(async()=>{
  const local=session.fromPartition('qa-followup-synthetic-only'),seen=[];let client,networkClient,server;
  try{
   if(process.argv.includes('--qa-failure-exit'))throw Error('QA_EXPECTED_FAILURE_BEFORE_NETWORK');
   await local.protocol.handle('https',request=>{assert.equal(new URL(request.url).hostname,'api.bilibili.com');seen.push({url:request.url,cookie:request.headers.get('cookie'),referer:request.headers.get('referer'),method:request.method,body:request.text()});return new Response('{"code":0}',{headers:{'content-type':'application/json'}});});
   // The underlying jar deliberately differs: credentials:omit plus explicit
   // snapshot headers must not silently select another signed-in identity.
   await local.cookies.set({url:'https://api.bilibili.com/',name:'SESSDATA',value:'QA_jar_B_not_selected',secure:true});
   const chosen=[{name:'SESSDATA',value:'QA_snapshot_A_not_real_credential'},{name:'bili_jct',value:'qa_csrf_01234567890123456789012345'}];
   client=await createBilibiliFollowupTransport({accountSession:{cookies:{get:async()=>chosen},fetch:local.fetch.bind(local)},workId:'BV1qa0000001',assertCurrent:async()=>{}});
   assert.deepEqual(await client.request('GET','/x/web-interface/nav'),{code:0});assert.equal(seen.length,1);assert.equal(seen[0].cookie,'SESSDATA=QA_snapshot_A_not_real_credential; bili_jct=qa_csrf_01234567890123456789012345');
   assert.deepEqual(await client.request('POST','/x/v2/reply/top',{type:'1',oid:'123',rpid:'456',action:'1'}),{code:0});assert.equal(seen.length,2);assert.equal(new URLSearchParams(await seen[1].body).get('csrf'),chosen[1].value);assert.equal(new URL(seen[1].url).search,'');
   for(const request of seen)assert.equal(request.referer,'https://www.bilibili.com/');
   // Custom protocol handlers do not exercise Chromium's HTTP referrer check.
   // Use a real cross-origin loopback connection as well, with synthetic cookies.
   const networkSeen=[];let sourceOrigin;
   server=require('node:http').createServer((req,res)=>{let body='';req.on('data',chunk=>{body+=chunk;});req.on('end',()=>{networkSeen.push({referer:req.headers.referer,cookie:req.headers.cookie,method:req.method,body});res.writeHead(200,{'content-type':'application/json','access-control-allow-origin':sourceOrigin});res.end('{"code":0}');});});
   await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
   sourceOrigin=`http://localhost:${server.address().port}`;
   const destination=`http://127.0.0.1:${server.address().port}/`;
   await assert.rejects(local.fetch(destination,{headers:{Referer:sourceOrigin+'/video/BV1qa0000001/'},signal:AbortSignal.timeout(5000)}),/ERR_BLOCKED_BY_CLIENT/);
   assert.equal(networkSeen.length,0);
   networkClient=await createBilibiliFollowupTransport({accountSession:{cookies:{get:async()=>chosen},fetch:(url,options)=>{
    assert.equal(options.referrerPolicy,undefined);
    const source=new URL(options.headers.Referer);assert.equal(source.origin,'https://www.bilibili.com');
    return local.fetch(destination+new URL(url).pathname.slice(1),{...options,headers:{...options.headers,Origin:sourceOrigin,Referer:sourceOrigin+source.pathname}});
   }},workId:'BV1qa0000001',assertCurrent:async()=>{}});
   assert.deepEqual(await networkClient.request('GET','/x/web-interface/nav'),{code:0});
   assert.deepEqual(await networkClient.request('POST','/x/v2/reply/top',{type:'1',oid:'123',rpid:'456',action:'1'}),{code:0});
   assert.equal(networkSeen.length,2);
   for(const request of networkSeen){assert.equal(request.referer,sourceOrigin+'/');assert.equal(request.cookie,'SESSDATA=QA_snapshot_A_not_real_credential; bili_jct=qa_csrf_01234567890123456789012345');}
   assert.equal(new URLSearchParams(networkSeen[1].body).get('csrf'),chosen[1].value);
   console.log(JSON.stringify({nativeBilibiliFollowupTransportChecks:23,actualElectronSessionFetch:true,defaultPolicyOriginReferer:true,snapshotCookieNotOtherJar:true,csrfOnlyInRequestBody:true,realLoopbackRequests:networkSeen.length,fullPathBlockedBeforeDispatch:true,policyChanged:false,realPlatformNetwork:false}));
  }catch(error){console.error(error);process.exitCode=1;}finally{client?.close();networkClient?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}app.quit();}
 });
}
