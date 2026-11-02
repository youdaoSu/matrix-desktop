// Actual sandboxed Electron windows sharing ONE disposable bound QA session.
// No real accounts, imported cookies, user profiles or platform networking.
const path=require('node:path'),root=path.resolve(__dirname,'..');
if(!process.versions.electron){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const result=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename,...process.argv.slice(2)],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:60000});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status??1);
}else{
 const {app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');
 let moduleRoot=root;
 if(process.argv[2]){assert.equal(process.argv[2],'--packaged');moduleRoot=path.join(root,'release-next/win-unpacked/resources/app.asar');assert.equal(require('node:crypto').createHash('sha256').update(require('original-fs').readFileSync(moduleRoot)).digest('hex'),process.argv[3]);}
 app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-bound-context-qa-')));app.commandLine.appendSwitch('mute-audio');app.on('window-all-closed',()=>{});
 app.whenReady().then(async()=>{
  let checks=0,browser,creator,sourceGuard;const windows=[],eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
  const own='9007199254740993',peer='9007199254740995',work='9007199254740000100',cid='9007199254740000200',source=session.fromPartition('persist:qa-bound-context'),requests=[];
  const original=source.webRequest.onBeforeRequest.bind(source.webRequest);source.webRequest.onBeforeRequest=fn=>{sourceGuard=fn;return original(fn);};
  const json=value=>Response.json(value),html=value=>new Response(value,{headers:{'content-type':'text/html;charset=utf-8'}});
  source.protocol.handle('https',request=>{
   const u=new URL(request.url);assert(['www.douyin.com','creator.douyin.com'].includes(u.hostname));requests.push([request.method,u.pathname]);
   if(u.pathname==='/fixture/seed')return html('<script>localStorage.setItem("qa-existing-origin-state","KEEP");document.title="QA normal account";</script>');
   if(u.pathname==='/user/self')return html('<script>document.title=localStorage.getItem("qa-existing-origin-state")==="KEEP"?"QA normal account":"安全验证";</script>');
   if(u.pathname==='/aweme/v1/web/user/profile/self/')return json({status_code:0,user:{uid:own,unique_id:'qa-bound',sec_uid:'MS4wQaBound',follower_count:1}});
   if(u.pathname==='/aweme/v1/web/user/follower/list/')return json({status_code:0,followers:[{uid:peer,nickname:'QA follower',avatar_thumb:{url_list:['https://p1.byteimg.com/qa-avatar']}}],has_more:false,min_time:0,total:1});
   if(u.pathname==='/creator-micro/content/manage')return html('<div class="video-card-content-qa"><span>评论</span></div><script>const c=document.querySelector("div");c.__reactFiber$fixture={memoizedProps:{item:{aweme_id:"'+work+'",author:{uid:"'+own+'"}}}};c.querySelector("span").onclick=()=>{location.href="/creator-micro/work-management/work-detail/'+work+'?enter_from=content&tabKey=commentManagement";};fetch("/janus/douyin/creator/pc/work_list?status=0&scene=star_atlas&count=12&max_cursor=0");</script>');
   if(u.pathname==='/janus/douyin/creator/pc/work_list')return json({status_code:0,aweme_list:[{item_id:work,author:{uid:own},desc:'QA work'}],has_more:false,max_cursor:0});
   if(u.pathname==='/creator-micro/work-management/work-detail/'+work)return html('<div role="tab" aria-selected="true">评论管理</div><script>fetch("/web/api/third_party/aweme/api/comment/read/aweme/v1/web/comment/list/select/?aweme_id='+work+'&cursor=0");</script>');
   if(u.pathname==='/web/api/third_party/aweme/api/comment/read/aweme/v1/web/comment/list/select/')return json({status_code:0,comments:[{cid,text:'QA fresh comment',user:{uid:peer,nickname:'QA'},create_time:1792760400,reply_comment_total:0}],has_more:false,cursor:0});
   throw Error('Unexpected fixture request; no outgoing transport');
  });
  const make=(s,preload)=>{eq(s,source);const win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{session:s,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,...(preload?{preload:path.join(moduleRoot,'desktop/douyin-creator-preload.cjs')}:{})}});windows.push(win);return win;};
  try{
   await source.cookies.set({url:'https://www.douyin.com/',name:'sessionid',value:'QA_ONLY',domain:'.douyin.com',path:'/',secure:true});
   const foreground=make(source);await foreground.loadURL('https://www.douyin.com/fixture/seed');
   browser=require(path.join(moduleRoot,'desktop/douyin-browser-reader.cjs')).createBrowserReader({createSession(){throw Error('Fresh cookie-only contexts forbidden');},createWindow:s=>make(s)});
   const options={accountSession:source,publicHandle:'qa-bound',assertCurrent:async()=>{}};
   let identity=await browser.acquire(options);eq(identity.ownUid,own);const profileWindow=windows[1];eq(await profileWindow.webContents.executeJavaScript('localStorage.getItem("qa-existing-origin-state")'),'KEEP');eq(await profileWindow.webContents.executeJavaScript('document.title'),'QA normal account');
   eq((await identity.readWeb('followers',{cursor:'0',offset:'0',sourceType:'1'})).followers[0].uid,peer);identity.close();
   creator=require(path.join(moduleRoot,'desktop/douyin-creator-reader.cjs')).createCreatorReader({acquireIdentity:browser.acquire,requireResponses:true,createWindow:s=>make(s,true),waitMs:10});
   const client=await creator.acquire(options);eq((await client.readWeb('works',{cursor:'0'})).aweme_list[0].aweme_id,work);eq((await client.readWeb('comments',{workId:work,cursor:'0'})).comments[0].text,'QA fresh comment');
   const blocked=(win,url,method='GET')=>{let cancel;sourceGuard({webContentsId:win.webContents.id,url,method,resourceType:'xhr'},result=>cancel=result.cancel);return cancel;};
   eq(blocked(profileWindow,'https://www.douyin.com/mark_read'),true);eq(blocked(windows[2],'https://creator.douyin.com/notification/read'),true);eq(blocked(foreground,'https://www.douyin.com/mark_read'),false);
   client.close();creator.close();eq(blocked(profileWindow,'https://www.douyin.com/mark_read'),true);eq(foreground.isDestroyed(),false);browser.close();eq(sourceGuard,null);
   eq(await foreground.webContents.executeJavaScript('localStorage.getItem("qa-existing-origin-state")'),'KEEP');eq((await source.cookies.get({url:'https://www.douyin.com/'})).some(cookie=>cookie.name==='sessionid'&&cookie.value==='QA_ONLY'),true);
   eq(requests.every(([method])=>method==='GET'),true);eq(requests.some(([,p])=>/mark_read|notification|message|publish/.test(p)),false);
   // If the normal bound environment itself presents a genuine challenge,
   // stop before profile/follower GETs. Never switch to another environment.
   await foreground.webContents.executeJavaScript('localStorage.setItem("qa-existing-origin-state","CHALLENGE")');const beforeChallenge=requests.length;
   browser=require(path.join(moduleRoot,'desktop/douyin-browser-reader.cjs')).createBrowserReader({createWindow:s=>make(s)});
   await assert.rejects(()=>browser.acquire(options),/页面验证/);checks++;eq(requests.slice(beforeChallenge).map(([,p])=>p),['/user/self']);eq(windows.at(-1).isDestroyed(),true);eq(foreground.isDestroyed(),false);eq(sourceGuard,null);
   await foreground.webContents.executeJavaScript('localStorage.setItem("qa-existing-origin-state","KEEP")');
   console.log(JSON.stringify({boundContextNativeChecks:checks,actualSandboxedWindows:true,foregroundOriginStateReusedWithoutCopy:true,followerAndFreshCommentReads:true,profileAndCreatorGuardsCoexist:true,closingOneReaderDoesNotDisableSiblingGuard:true,originalForegroundWindowAndStoragePreserved:true,realVerificationStillStops:true,realPlatformRequests:0,realUserProfileTouched:false,businessWrites:0,markReadRequests:0}));
  }catch(error){console.error(error);process.exitCode=1;}finally{creator?.close();browser?.close();for(const win of windows)if(!win.isDestroyed())win.destroy();app.exit(process.exitCode||0);}
 });
}
