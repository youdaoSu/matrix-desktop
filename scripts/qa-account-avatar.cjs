// Real React image load/error/retry, entirely synthetic HTTPS/protocol images.
const path=require('node:path'),root=path.resolve(__dirname,'..');require('./qa-console-pipe.cjs').guardQaConsolePipes();
if(!process.versions.electron){const{spawnSync}=require('node:child_process'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const r=spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename],{cwd:root,windowsHide:true,encoding:'utf8',timeout:25000,env});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status===0&&r.stdout?.includes('"accountAvatarReactChecks"')?0:r.status||1);}
else{
 const{app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-avatar-qa-')));app.commandLine.appendSwitch('mute-audio');
 app.whenReady().then(async()=>{let win;const requests={};try{
  const local=session.fromPartition('qa-account-avatar');await local.protocol.handle('https',async request=>{
   const url=new URL(request.url);assert.equal(url.hostname,'avatar.fixture.test');
   if(url.pathname==='/app')return new Response('<meta charset=utf-8><div id=root></div>',{headers:{'content-type':'text/html'}});
   requests[url.pathname]=(requests[url.pathname]||0)+1;
   if(url.pathname==='/retry'&&requests[url.pathname]===1||url.pathname==='/never')return new Response('fixture temporary image error',{status:503,headers:{'cache-control':'no-store'}});
   return new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfU0AAAAASUVORK5CYII=','base64'),{headers:{'content-type':'image/png','cache-control':'no-store'}});
  });
  win=new BrowserWindow({show:false,webPreferences:{session:local,nodeIntegration:true,contextIsolation:false,backgroundThrottling:false}});win.webContents.setAudioMuted(true);await win.loadURL('https://avatar.fixture.test/app');
  const result=await win.webContents.executeJavaScript(`(async()=>{
   const React=require('react'),{createRoot}=require('react-dom/client'),{loadTs}=require(${JSON.stringify(path.join(root,'scripts/qa-load-typescript.cjs'))}),path=require('node:path'),assert=require('node:assert/strict'),cache=new Map();
   cache.set(${JSON.stringify(path.join(root,'client/src/components/workspace/PlatformLogo.tsx'))},{exports:{PlatformLogo:()=>null}});
   cache.set(${JSON.stringify(path.join(root,'client/src/components/workspace/account-observations.ts'))},{exports:{useAccountObservation:()=>({state:'normal',reason:'fixture own account',checkedAt:Date.now()})}});
   const{AccountAvatar}=loadTs('client/src/components/workspace/AccountAvatar.tsx',cache,new Map()),component=createRoot(document.querySelector('#root'));let checks=0;
   const base={id:'owned',platform:'douyin',nickname:'本人',connectorSessionId:'session-a',authStatus:'authorized',healthStatus:'normal'},render=patch=>component.render(React.createElement(AccountAvatar,{account:{...base,...patch},status:true}));
   const pause=ms=>new Promise(r=>setTimeout(r,ms)),until=async(fn,label,ms=6000)=>{const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await pause(20);}throw Error('Avatar QA timeout: '+label);};
   try{
    render({avatarUrl:'https://avatar.fixture.test/retry'});await until(()=>document.querySelector('[data-avatar-load-state=error]'),'initial error');assert.equal(document.querySelector('[data-account-availability]').dataset.accountAvailability,'normal');checks++;
    await until(()=>document.querySelector('[data-avatar-load-state=ready]'),'same URL automatic recovery');assert.ok(document.querySelector('img').naturalWidth);assert.equal(document.querySelector('img').referrerPolicy,'no-referrer');const firstReadyImage=document.querySelector('img');checks+=2;
    render({avatarUrl:'https://avatar.fixture.test/never'});await until(()=>document.querySelector('[data-avatar-load-state=error]'),'persistent error');await pause(4600);assert.ok(document.querySelector('[data-avatar-load-state=error]'));assert.equal(document.querySelector('[data-account-availability]').dataset.accountAvailability,'normal');checks+=2;
    render({connectorSessionId:'session-b',avatarUrl:'https://avatar.fixture.test/retry'});await until(()=>document.querySelector('[data-avatar-load-state=ready]'),'new session does not inherit failed image');assert.notEqual(document.querySelector('img'),firstReadyImage);checks+=2;
    render({avatarUrl:'https://avatar.fixture.test/never'});await until(()=>document.querySelector('[data-avatar-load-state=error]'),'pending retry before replacement');render({id:'different',connectorSessionId:'session-c',avatarUrl:'https://avatar.fixture.test/new-owner'});await until(()=>document.querySelector('[data-avatar-load-state=ready]'),'replacement image');await pause(1200);assert.equal(document.querySelector('img').getAttribute('src'),'https://avatar.fixture.test/new-owner');checks++;
    for(const avatarUrl of['','javascript:alert(1)','https://user:password@avatar.fixture.test/secret']){render({avatarUrl});await until(()=>document.querySelector('[data-avatar-load-state=missing]'),'invalid address fallback');assert.equal(document.querySelectorAll('img').length,0);checks++;}
    return{accountAvatarReactChecks:checks,sameUrlTransientErrorRecovers:true,retriesBounded:true,sessionChangeResetsImageFailure:true,oldRetryCancelledOnAccountChange:true,portraitErrorDoesNotMarkAccountOffline:true,credentialsRejected:true,realPlatformRequests:0};
   }finally{component.unmount();}
  })()`);
  // Chromium may reuse a decoded successful image on the new keyed mount.
  // The first failure and recovery must both reach the fixture; remounting is
  // checked above, while a third network download is optional, never required.
  assert.ok(requests['/retry']>=2&&requests['/retry']<=3);assert.equal(requests['/never'],4);assert.equal(requests['/new-owner'],1);assert.equal(requests['/secret'],undefined);console.log(JSON.stringify({...result,imageRequestCounts:requests}));
 }catch(e){console.error(e);process.exitCode=1;}finally{win?.destroy();app.exit(process.exitCode||0);}});
}
