const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events'),{PassThrough,Writable}=require('node:stream');
const {registerEdgeEmbed}=require('../desktop/edge-embed.cjs');
const statusEvents=[],handlers=new Map(),sender={id:7,send(name,event){if(name==='matrix:edge-status')statusEvents.push(event);}},children=[];let clock=10000,profileReads=0,checks=0;
const nativeProfile={nickname:'本人的视频号',avatarUrl:'https://example.com/own.jpg',pageUrl:'https://channels.weixin.qq.com/platform/home',loginVisible:false};
const api=registerEdgeEmbed({ipcMain:{handle:(name,handler)=>handlers.set(name,handler)},getWindow:()=>({isDestroyed:()=>false,webContents:sender,getNativeWindowHandle:()=>Buffer.from('0100000000000000','hex')}),
  userData:fs.mkdtempSync(path.join(os.tmpdir(),'matrix-edge-bridge-qa-')),helperPath:__filename,now:()=>clock,
  authenticate:async(token,account)=>{if(!['qa-a','qa-b'].includes(token))throw Error('auth failed');return {userId:token,account:account?{platform:'wechat',connectorSessionId:'fixture-session-0001',nickname:'本人的视频号'}:undefined};},
  spawnHost:(_file,args,options)=>{
    assert.equal(options.windowsHide,true);assert.equal(args.length,2);const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();
    const emit=message=>child.stdout.write(JSON.stringify(message)+'\n');child.emitStatus=url=>emit({event:'status',url,title:'官方页',ready:true});
    child.stdin=new Writable({write(chunk,_encoding,done){const message=JSON.parse(chunk.toString());if(message.command==='close'){setImmediate(()=>child.emit('exit',0));done();return;}
      if(message.command==='profile'){profileReads++;emit({id:message.id,result:nativeProfile});}else emit({id:message.id,result:{ok:true}});done();}});
    children.push(child);setImmediate(()=>{emit({event:'ready',engine:'webview2',embedded:true});child.emitStatus('https://channels.weixin.qq.com/login.html');});return child;
  },
});
const call=(name,input,event={sender})=>handlers.get('matrix:edge-'+name)(event,{accessToken:'qa-a',...input});
(async()=>{
  assert.ok((await call('open',{platform:'bilibili',sessionId:'fixture-session-0001'})).error);checks++;
  assert.ok((await call('open',{platform:'wechat',sessionId:'../escape'})).error);checks++;
  assert.ok((await call('open',{platform:'wechat',sessionId:'fixture-session-0001'},{sender:{id:8}})).error);checks++;
  const opened=await call('open',{platform:'wechat',sessionId:'fixture-session-0001'});assert.equal(opened.embedded,true);checks++;
  const id=opened.guestId;
  assert.ok((await call('control',{guestId:id,command:'bounds',x:0,y:0,width:100,height:100,accessToken:'qa-b'})).error);checks++;
  assert.ok((await call('control',{guestId:id,command:'profile',script:'read anything'})).error);checks++;
  assert.ok((await call('control',{guestId:id,command:'navigate',url:'https://weixin.qq.com.evil.invalid/'})).error);checks++;
  assert.ok((await call('control',{guestId:id,command:'bounds',x:NaN,y:0,width:100,height:100})).error);checks++;
  assert.equal((await call('control',{guestId:id,command:'bounds',x:10,y:10,width:100,height:100,visible:true})).ok,true);checks++;
  assert.ok((await call('bind',{guestId:id})).error);assert.equal(profileReads,0);checks+=2;
  children[0].emitStatus('https://channels.weixin.qq.com/platform/home');
  const pending=await call('bind',{guestId:id});assert.equal(pending.pendingProfile,true);checks++;
  clock+=3100;const bound=await call('bind',{guestId:id});assert.equal(bound.nickname,nativeProfile.nickname);assert.equal(bound.sessionId,'fixture-session-0001');checks+=2;
  nativeProfile.nickname='';assert.equal((await call('bind',{guestId:id})).pendingProfile,true);checks++;
  nativeProfile.nickname='本人的视频号';clock+=5000;assert.equal((await call('bind',{guestId:id})).pendingProfile,true);checks++;
  clock+=2999;assert.equal((await call('bind',{guestId:id})).pendingProfile,true);checks++;
  clock+=1;assert.equal((await call('bind',{guestId:id})).nickname,nativeProfile.nickname);checks++;
  const publishInput={platform:'wechat',sessionId:'fixture-session-0001',accountId:'qa-account',edgeGuestId:id,webContentsId:0,accessToken:'qa-a'};
  await api.resolveContext({sender},publishInput);checks++;
  children[0].emitStatus('https://channels.weixin.qq.com/platform/post/create');nativeProfile.pageUrl='https://channels.weixin.qq.com/platform/post/create';nativeProfile.nickname='';
  assert.equal((await api.resolveContext({sender},publishInput)).nickname,'本人的视频号');checks++;
  await assert.rejects(api.resolveContext({sender},{...publishInput,accountId:'another-account'}),/尚未就绪/);checks++;
  clock+=600001;await assert.rejects(api.resolveContext({sender},publishInput),/尚未就绪/);checks++;
  nativeProfile.nickname='本人的视频号';await api.resolveContext({sender},publishInput);
  nativeProfile.accountIssue={kind:'banned',message:'您的账号已被封禁'};await assert.rejects(api.resolveContext({sender},publishInput),/状态异常/);delete nativeProfile.accountIssue;nativeProfile.nickname='';await assert.rejects(api.resolveContext({sender},publishInput),/尚未就绪/);checks+=2;
  children[0].emitStatus('https://channels.weixin.qq.com/login.html');assert.equal((await call('bind',{guestId:id})).loginLoop,true);checks++;
  children[0].emitStatus('https://channels.weixin.qq.com/platform/home');nativeProfile.pageUrl='https://channels.weixin.qq.com/platform/home';nativeProfile.nickname='本人的视频号';
  assert.equal(statusEvents.at(-1).loginLoop,true);checks++;
  await call('bind',{guestId:id});clock+=3100;assert.equal((await call('bind',{guestId:id})).nickname,nativeProfile.nickname);assert.equal(statusEvents.at(-1).loginLoop,false);checks+=2;
  children[0].emitStatus('https://channels.weixin.qq.com/login.html');nativeProfile.nickname='';
  children[0].emitStatus('https://channels.weixin.qq.com/platform/post/create');await assert.rejects(api.resolveContext({sender},publishInput),/尚未就绪/);checks++;
  assert.equal((await call('control',{guestId:id,command:'close'})).ok,true);assert.equal(api.count(),0);checks+=2;
  assert.ok((await call('bind',{guestId:id})).error);checks++;
  api.close();console.log(JSON.stringify({edgeOwnershipAndStableBindingChecks:checks,arbitraryRendererScriptsAllowed:false,credentialsRead:false,realAccountsModified:false}));
})().catch(error=>{api.close();console.error(error);process.exitCode=1;});
