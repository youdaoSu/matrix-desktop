// Synthetic profiles only: no real accounts, sends, SDK calls or platform traffic.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createFollowerAvatarLookup,followerAvatarTarget}=require('../desktop/douyin-follower-avatar.cjs');
const {createInteractionCache}=require('../desktop/douyin-interaction-cache.cjs');
const {registerInteractionImages}=require('../desktop/douyin-interaction-image.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const account={id:'qa-account',platform:'douyin',connectorSessionId:'12345678-1234-1234-1234-123456789abc',nativeAccountKey:'qa-owner'};
const row={platformId:'9007199254740993123',platformUserId:'9007199254740993123',author:'QA member',authorProfileUrl:'https://www.douyin.com/user/MS4wQA_TARGET',content:'QA signature',displayTime:'2025-01-01T00:00:00Z',isCurrentFollower:false,membershipCheckedAt:'2026-10-23T00:00:00Z',avatarReadHint:'old missing hint'};
const avatar='https://p1.byteimg.com/qa/avatar.webp',directory=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-follower-avatar-qa-'));
let cookie='QA_ONLY',calls=[],mode='ok',release,lateGuard=false,guardCalls=0,clock=1000;
const source={cookies:{async get(){return [{domain:'.douyin.com',path:'/',name:'sessionid',value:cookie}];}},async fetch(address,options){
  const url=new URL(address);calls.push({url,options});eq(options.method,'GET');eq(options.redirect,'error');eq(options.credentials,'include');eq(options.headers,{Accept:'application/json'});eq(options.body,undefined);eq(url.origin,'https://www.douyin.com');
  if(mode==='hold')await new Promise(resolve=>release=resolve);
  if(mode==='http')return new Response('denied',{status:403});
  if(mode==='html')return new Response('<html>Challenge</html>');
  if(mode==='api')return Response.json({status_code:2145,user:{uid:row.platformId,sec_uid:'MS4wQA_TARGET',avatar_thumb:{url_list:[avatar]}}});
  if(url.pathname==='/aweme/v1/web/user/profile/self/')return Response.json({status_code:0,user:{uid:'123',unique_id:mode==='wrong-owner'?'another-owner':account.nativeAccountKey}});
  eq(url.pathname,'/aweme/v1/web/user/profile/other/');eq(url.searchParams.get('sec_user_id'),'MS4wQA_TARGET');eq(url.searchParams.has('user_id'),false);
  if(mode==='large')return new Response('x',{headers:{'content-length':String(4*1024*1024+1)}});
  return new Response('{"status_code":0,"user":{"uid":'+(mode==='wrong-target'?'999':row.platformId)+',"sec_uid":"'+(mode==='wrong-sec'?'MS4wFOREIGN':'MS4wQA_TARGET')+'","avatar_thumb":{"url_list":["'+(mode==='unsafe'?'https://127.0.0.1/private':avatar)+'"]}}}');
}};
const events=[],session={fromPartition(partition){eq(partition,'persist:matrix-douyin-'+account.connectorSessionId);return source;}};
const guard=async()=>{guardCalls++;if(lateGuard)throw Error('账号绑定已变化');};
const make=()=>createFollowerAvatarLookup({session,now:()=>clock,gapMs:0,onResult:value=>events.push(value)});
const wait=async check=>{for(let n=0;n<500;n++){if(check())return;await new Promise(resolve=>setImmediate(resolve));}throw Error('Fixture deadline');};
(async()=>{let lookup=make(),images;try{
  eq(followerAvatarTarget(row),{uid:row.platformId,secUid:'MS4wQA_TARGET'});
  for(const patch of [{platformUserId:'999'},{workId:'100'},{authorProfileUrl:'https://www.douyin.com/user/MS4wQA_TARGET?token=PRIVATE'},{authorProfileUrl:'https://evil.invalid/user/MS4wQA_TARGET'},{authorProfileUrl:'https://www.douyin.com/user/123'},{platformId:9007199254740993123}])eq(followerAvatarTarget({...row,...patch}),undefined);
  let urls=await lookup.read({account,row,assertCurrent:guard,diagnosticScope:'qa-scope'});eq(urls,[avatar]);eq(calls.length,2);eq(events.at(-1),{scope:'qa-scope',code:'read-ok',avatarSources:1});eq(JSON.stringify(events).includes(row.platformId),false);
  await lookup.read({account,row,assertCurrent:guard});eq(calls.length,3);eq(guardCalls>6,true);
  clock+=31000;await lookup.read({account,row,assertCurrent:guard});eq(calls.length,5);
  lookup.close();await assert.rejects(()=>lookup.read({account,row,assertCurrent:guard}),/未猜测/);checks++;
  for(const current of ['http','html','api','wrong-owner','wrong-target','wrong-sec','unsafe','large']){
    mode=current;lookup=make();const before=calls.length;await assert.rejects(()=>lookup.read({account,row,assertCurrent:guard}));checks++;const after=calls.length;eq(after-before,current==='wrong-target'||current==='wrong-sec'||current==='unsafe'||current==='large'?2:1);
    await assert.rejects(()=>lookup.read({account,row,assertCurrent:guard}));checks++;eq(calls.length,after);lookup.close();
  }
  mode='hold';lookup=make();const a=lookup.read({account,row,assertCurrent:guard}),b=lookup.read({account,row,assertCurrent:guard});eq(a,b);await wait(()=>release);cookie='QA_CHANGED';mode='ok';release();release=undefined;await assert.rejects(()=>a,/官方登录已变化/);checks++;lookup.close();
  mode='hold';lookup=make();const cancelled=lookup.read({account,row,assertCurrent:guard});await wait(()=>release);lateGuard=true;mode='ok';release();release=undefined;await assert.rejects(()=>cancelled);checks++;lateGuard=false;lookup.close();
  // The durable supplement changes avatar fields only, never membership/end proof.
  const config={directory,scope:'qa-owner/qa-account/followers',protect:text=>Buffer.from(text),unprotect:bytes=>bytes.toString('utf8')},cache=createInteractionCache(config);
  cache.merge({records:[row],works:[],complete:false,capturedAt:'2026-10-23T00:00:00Z',progress:{pages:3},followerRosterVerified:false});const before=cache.get();
  const updated=cache.supplementFollowerAvatar(row.platformId,row,[avatar]);eq(updated.avatarUrl,avatar);eq(updated.avatarReadHint,undefined);const after=cache.get();eq(after.complete,before.complete);eq(after.capturedAt,before.capturedAt);eq(after.progress,before.progress);eq(after.records[0].isCurrentFollower,false);eq(after.records[0].membershipCheckedAt,row.membershipCheckedAt);eq(createInteractionCache(config).findRecord(row.platformId).avatarUrl,avatar);
  const file=path.join(directory,fs.readdirSync(directory)[0]),saved=fs.readFileSync(file);cache.supplementFollowerAvatar(row.platformId,row,['https://p1.byteimg.com/ignored']);eq(fs.readFileSync(file),saved);
  assert.throws(()=>cache.supplementFollowerAvatar(row.platformId,{...row,authorProfileUrl:'https://www.douyin.com/user/MS4wOTHER'},[avatar]),/记录已变化/);checks++;
  assert.throws(()=>cache.supplementFollowerAvatar(row.platformId,row,['https://127.0.0.1/private']),/未通过/);checks++;
  // Native image IPC starts from a cached record reference, not a caller URL.
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zy8QAAAAASUVORK5CYII=','base64'),image={dataUrl:'data:image/png;base64,'+png.toString('base64'),bytes:png.length};
  let handler,cached={...row},resolved=0,stored=0,downloads=0;const win={webContents:{}};
  images=registerInteractionImages({ipcMain:{handle(name,fn){handler=fn;}},getWindow:()=>win,authenticate:async()=>({userId:'qa',account}),resolveRecord:()=>cached,resolveFollowerAvatar:async input=>{resolved++;await input.assertCurrent();return[avatar];},storeFollowerAvatar:(scope,id,expected,urls)=>{stored++;eq(id,row.platformId);eq(expected,row);cached={...cached,avatarUrl:urls[0],avatarUrls:urls};},displayImageCache:{get(){},put(){},clearMemory(){}},imageLoader:async(descriptor,check)=>{downloads++;eq(descriptor.urls,[avatar]);await check();return image;}});
  const input={accessToken:'qa-token',accountId:account.id,kind:'followers',recordId:row.platformId,target:'avatar'},event={sender:win.webContents};
  const [r1,r2]=await Promise.all([handler(event,input),handler(event,input)]);eq(r1.attachment,image);eq(r2.attachment,image);eq(resolved,1);eq(stored,1);eq(downloads,1);eq(JSON.stringify(r1).includes(avatar),false);
  eq((await handler(event,{...input,url:row.authorProfileUrl})).attachment,undefined);eq(resolved,1);
  images.close();
  // Production borrows the existing own-page proof, never falls back to a
  // second native self request after a context failure.
  const beforeContext=calls.length;let contextCalls=0;
  lookup=createFollowerAvatarLookup({session,gapMs:0,profileReader:async input=>{contextCalls++;eq(input.accountSession,source);eq(input.publicHandle,account.nativeAccountKey);eq(input.target,{uid:row.platformId,secUid:'MS4wQA_TARGET'});await input.assertCurrent();return{uid:row.platformId,sec_uid:'MS4wQA_TARGET',avatar_thumb:{url_list:[avatar]}};}});
  eq(await lookup.read({account,row,assertCurrent:guard}),[avatar]);eq(contextCalls,1);eq(calls.length,beforeContext);lookup.close();
  lookup=createFollowerAvatarLookup({session,gapMs:0,profileReader:async()=>{throw Object.assign(Error('官网本人资料未通过原采集链路核验'),{avatarCode:'avatar-owner-shape'});}});
  await assert.rejects(()=>lookup.read({account,row,assertCurrent:guard}),/原采集链路/);checks++;eq(calls.length,beforeContext);lookup.close();
  console.log(JSON.stringify({followerAvatarChecks:checks,normalBoundSessionGetsOnly:true,exactOwnerAndTargetUid:true,precisionPreserved:true,oneAtATimeAndSingleflight:true,denialsHaveNoFallback:true,avatarOnlyCacheUpdate:true,rosterMembershipUnchanged:true,existingWebsiteContextPreferred:true,noNativeFallbackAfterContextFailure:true,realProfileTouched:false,realPlatformRequests:0}));
}finally{lookup.close();images?.close();assert.equal(path.dirname(directory),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('matrix-follower-avatar-qa-'));fs.rmSync(directory,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
