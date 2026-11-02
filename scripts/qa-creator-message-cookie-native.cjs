// Actual Electron cookie events in a new disposable session. Synthetic values
// only; no official network, real profile, messages, acknowledgements or sends.
const path=require('node:path'),root=path.resolve(__dirname,'..');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
if(!process.versions.electron){
 const{spawnSync}=require('node:child_process'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const result=spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename,...process.argv.slice(2)],{cwd:root,windowsHide:true,env,encoding:'utf8',timeout:30000});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status??1);
}else{
 const{app,session}=require('electron'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
 let modulePath='../desktop/creator-message-owner.cjs';
 if(process.argv.length>2){assert.equal(process.argv[2],'--packaged');const archive=path.join(root,'release-next/win-unpacked/resources/app.asar'),expected=process.argv[3];assert.match(expected||'',/^[a-f0-9]{64}$/);assert.equal(require('node:crypto').createHash('sha256').update(require('original-fs').readFileSync(archive)).digest('hex'),expected);modulePath=archive+'/desktop/creator-message-owner.cjs';}
 const{createCreatorMessageOwnerVerifier}=require(modulePath);
 app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-creator-cookie-native-')));app.commandLine.appendSwitch('mute-audio');
 app.whenReady().then(async()=>{
  let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},reject=async(fn)=>{await assert.rejects(fn,/登录.*变化|身份.*变化/);checks++;};
  try{
   const isolated=session.fromPartition('qa-creator-cookie-'+randomUUID()),url='https://creator.douyin.com/',events=[];
   isolated.webRequest.onBeforeRequest((r,callback)=>callback({cancel:true}));
   isolated.cookies.on('changed',(_event,_cookie,cause,removed)=>events.push({cause,removed}));
   const settle=()=>new Promise(resolve=>setTimeout(resolve,35));
   const set=async(name,value,extra={})=>{await isolated.cookies.set({url,domain:'.douyin.com',name,value,path:'/',secure:true,httpOnly:true,expirationDate:Date.now()/1000+3600,...extra});await settle();};
   await set('sessionid','qa-synthetic-stable-session');
   const account={id:'qa-native-account',platform:'douyin',connectorSessionId:'qa-native-session',nativeAccountKey:'qa-exact-own-id'},input={accessToken:'qa-only',platform:'douyin',accountId:account.id,sessionId:account.connectorSessionId},ctx={auth:{userId:'qa-owner',account},guest:{session:isolated}};
   let reads=0;
   const verifier=createCreatorMessageOwnerVerifier({fallbackBefore:async()=>{throw Error('No fallback permitted in native-cookie fixture');},inspectAccountHealth:async()=>{reads++;await set('sessionid','qa-synthetic-stable-session',{expirationDate:Date.now()/1000+7200});await set('msToken','qa-device-refresh-'+reads);return{state:'normal',accountId:account.id,sessionId:account.connectorSessionId,nativeAccountKey:account.nativeAccountKey};}});
   let proof=await verifier.begin({},input,ctx);await verifier.verify({},input,proof);eq(reads,1);
   for(let i=0;i<3;i++){proof=await verifier.begin({},input,ctx);await verifier.verify({},input,proof);}eq(reads,1);
   await set('sessionid','qa-synthetic-stable-session',{expirationDate:Date.now()/1000+8000});await verifier.verify({},input,proof);eq(reads,1);
   await set('s_v_web_id','qa-device-A');await set('s_v_web_id','qa-device-B');await verifier.verify({},input,proof);eq(reads,1);
   await set('sessionid','qa-other-account-session');await set('sessionid','qa-synthetic-stable-session');await reject(()=>verifier.verify({},input,proof));
   proof=await verifier.begin({},input,ctx);await verifier.verify({},input,proof);eq(reads,2);
   await set('qa-future-identity-cookie','qa-new-identity-state');await reject(()=>verifier.verify({},input,proof));
   proof=await verifier.begin({},input,ctx);await verifier.verify({},input,proof);eq(reads,3);
   await isolated.cookies.remove(url,'sessionid');await settle();await reject(()=>verifier.verify({},input,proof));
   eq(events.some(event=>event.removed),true);eq(events.some(event=>!event.removed),true);
   // Rebase is allowed ONLY before reading, after another fresh same-owner
   // profile observation. Exercise real Chromium credential events here too.
   await set('sessionid','qa-rebase-start');let rechecks=0;
   const rebase=createCreatorMessageOwnerVerifier({inspectAccountHealth:async()=>{rechecks++;if(rechecks===1)await set('sessionid','qa-rebase-settled');return{state:'normal',accountId:account.id,sessionId:account.connectorSessionId,nativeAccountKey:account.nativeAccountKey};}});
   const rebased=await rebase.begin({},input,ctx);await rebase.verify({},input,rebased);eq(rechecks,2);
   await set('sessionid','qa-foreign-start');let foreignChecks=0;
   const foreign=createCreatorMessageOwnerVerifier({inspectAccountHealth:async()=>{foreignChecks++;if(foreignChecks===1)await set('sessionid','qa-foreign-settled');return{state:'normal',accountId:account.id,sessionId:account.connectorSessionId,nativeAccountKey:foreignChecks===1?account.nativeAccountKey:'qa-other-person-id'};}});
   await assert.rejects(()=>foreign.begin({},input,ctx),/本人账号ID未确认/);checks++;eq(foreignChecks,2);
   await set('sessionid','qa-never-settles-start');let unstableChecks=0;
   const unstable=createCreatorMessageOwnerVerifier({inspectAccountHealth:async()=>{unstableChecks++;await set('sessionid','qa-never-settles-'+unstableChecks);return{state:'normal',accountId:account.id,sessionId:account.connectorSessionId,nativeAccountKey:account.nativeAccountKey};}});
   await reject(()=>unstable.begin({},input,ctx));eq(unstableChecks,2);
   await set('sessionid','qa-page-state-auth');let pageChecks=0;
   const pageState=createCreatorMessageOwnerVerifier({inspectAccountHealth:async()=>{pageChecks++;await set('qa-ordinary-page-state','qa-page-'+pageChecks);return{state:'normal',accountId:account.id,sessionId:account.connectorSessionId,nativeAccountKey:account.nativeAccountKey};}});
   const pageProof=await pageState.begin({},input,ctx);await pageState.verify({},input,pageProof);eq(pageChecks,2);
   await set('qa-ordinary-page-state','qa-changed-during-summary');await reject(()=>pageState.verify({},input,pageProof));
   await set('sid_guard',encodeURIComponent('qa-stable-SID|1000|3600|Thu, 01 Jan 2037 00:00:00 GMT'));let sidChecks=0;
   const sidMetadata=createCreatorMessageOwnerVerifier({inspectAccountHealth:async()=>{sidChecks++;await set('sid_guard',encodeURIComponent('qa-stable-SID|2000|7200|Fri, 02 Jan 2037 00:00:00 GMT'));return{state:'normal',accountId:account.id,sessionId:account.connectorSessionId,nativeAccountKey:account.nativeAccountKey};}});
   const sidProof=await sidMetadata.begin({},input,ctx);await sidMetadata.verify({},input,sidProof);eq(sidChecks,1);
   await set('sid_guard',encodeURIComponent('qa-OTHER-SID|2000|7200|Fri, 02 Jan 2037 00:00:00 GMT'));await reject(()=>sidMetadata.verify({},input,sidProof));
   console.log(JSON.stringify({nativeCreatorCookieChecks:checks,packagedModule:modulePath.includes('app.asar'),electron:process.versions.electron,actualCookieEventCauses:[...new Set(events.map(event=>event.cause))],sameValueExpiryRenewalAccepted:true,sidGuardMetadataRenewalAccepted:true,deviceChallengeRefreshAccepted:true,preReadRebaseRequiresSecondOwnId:true,secondOwnIdMismatchRejected:true,perpetualIdentityChurnBounded:true,ordinaryPageStateNeedsTwoOwnIdObservations:true,unknownStateDuringReadRejected:true,authAtoBtoARejected:true,unknownIdentityCookieRejected:true,logoutRejected:true,realPlatformNetwork:0,realProfileRead:false}));
  }catch(error){console.error(error);process.exitCode=1;}finally{app.exit(process.exitCode||0);}
 });
}
