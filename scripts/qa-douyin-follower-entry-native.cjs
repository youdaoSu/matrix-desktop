// Synthetic normal DOM click routing; no real profile, website or actions.
const path=require('node:path'),root=path.resolve(__dirname,'..');
if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const result=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename,...process.argv.slice(2)],{env,windowsHide:true,encoding:'utf8',timeout:60000});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status??1);}
else{
  const fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict'),{app,BrowserWindow,session}=require('electron');let moduleRoot=root;
  if(process.argv[2]){assert.equal(process.argv[2],'--packaged');moduleRoot=path.join(root,'release-next/win-unpacked/resources/app.asar');assert.equal(require('node:crypto').createHash('sha256').update(require('original-fs').readFileSync(moduleRoot)).digest('hex'),process.argv[3]);}
  app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-follower-entry-qa-')));app.on('window-all-closed',()=>{});
  app.whenReady().then(async()=>{
    const {followerPage}=require(path.join(moduleRoot,'desktop/douyin-followers-preload.cjs')),s=session.fromPartition('qa-entry');let html='',win,checks=0,current='';
    const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
    s.protocol.handle('https',request=>{eq(request.url,'https://www.douyin.com/user/self');eq(request.method,'GET');return new Response(html,{headers:{'content-type':'text/html;charset=utf-8'}});});
    try{
      win=new BrowserWindow({show:false,width:800,height:600,webPreferences:{session:s,sandbox:true,contextIsolation:true,nodeIntegration:false}});
      const cases=[
        ['number','<div><span>粉丝</span><span id="target">434</span></div>',true],
        ['formatted','<div><span>粉丝指数</span><strong id="target">1.4万</strong></div>',true],
        ['reverse','<div><b id="target">13,927</b><span>粉丝</span></div>',true],
        ['button','<button id="target">粉丝 434</button>',true],
        ['bubbling','<button id="target"><span>粉丝</span><span>434</span></button>',true],
        ['official-wrapper','<div id="target" data-e2e="user-info-fans"><span>粉丝</span><span onclick="event.stopPropagation()">434</span></div>',true],
        ['foreign','<a href="/user/MS4wForeign"><div><span>粉丝</span><span id="target">434</span></div></a>',false],
        ['foreign-origin','<a href="https://example.invalid/user/self"><div><span>粉丝</span><span id="target">434</span></div></a>',false],
        ['disabled','<button disabled><span>粉丝</span><span id="target">434</span></button>',false],
        ['aria-disabled','<div aria-disabled="true"><span>粉丝</span><span id="target">434</span></div>',false],
        ['ambiguous','<div><span>粉丝</span><span id="target">434</span><span>1</span></div>',false],
        ['duplicate','<div><span>粉丝</span><span id="target">434</span></div><button>粉丝 434</button>',false],
        ['notification','<button id="target">新增粉丝 434</button>',false],
        ['mixed-header','<div><span>粉丝</span><span id="target">434</span><span>关注 8</span></div>',false]
      ];
      for(const [name,content,success]of cases){
        current=name;
        html=`<main>${content}<button id="notice">新增粉丝</button></main><script>window.clicks=0;window.notices=0;document.querySelector('#target').onclick=()=>window.clicks++;document.querySelector('#notice').onclick=()=>window.notices++;</script>`;
        await win.loadURL('https://www.douyin.com/user/self');
        const value=await win.webContents.executeJavaScript(`(()=>{window.__matrixFollowerObserved={version:1,pages:new Map(),order:[],errors:new Map(),pending:new Set(),requested:new Set(),observeTransport:false};return (${followerPage.toString()})({uid:'9007199254740993',offset:'0',cursor:'0',ownerFollowerCount:434})})()`);
        eq(await win.webContents.executeJavaScript('window.clicks'),success?1:0);eq(await win.webContents.executeJavaScript('window.notices'),0);
        eq(await win.webContents.executeJavaScript('Boolean(window.__matrixFollowerObserved.openRequested)'),success);
        if(success){eq(value.waiting,true);eq(await win.webContents.executeJavaScript('/粉丝/.test(window.__matrixFollowerObserved.followerControl.innerText)'),true);}
        else eq(Boolean(value.waiting||value.error),true);
      }
      // Current header props hydrate after the visible counter. Do not create
      // a modal around an incomplete or foreign identity; a later normal
      // read may use the now-hydrated same counter, with exactly one click.
      for(const [name,user,success]of [
        ['hydrating',{},false],['uid-only',{uid:'9007199254740993'},false],
        ['sec-only',{secUid:'MS4wQaOwn'},false],
        ['foreign-uid',{uid:'9007199254740994',secUid:'MS4wQaOwn'},false],
        ['foreign-sec',{uid:'9007199254740993',secUid:'MS4wForeign'},false],
        ['ready',{uid:'9007199254740993',secUid:'MS4wQaOwn'},true]
      ]){
        current='modern-'+name;
        html='<div data-e2e="user-info" id="header"><div data-e2e="user-info-fans" id="target">粉丝 434</div></div><script>window.clicks=0;document.querySelector("#target").onclick=()=>window.clicks++;</script>';
        await win.loadURL('https://www.douyin.com/user/self');
        const run=`(${followerPage.toString()})({uid:'9007199254740993',secUid:'MS4wQaOwn',offset:'0',cursor:'0',ownerFollowerCount:434})`;
        const value=await win.webContents.executeJavaScript(`(()=>{window.__matrixFollowerObserved={version:1,pages:new Map(),order:[],errors:new Map(),pending:new Set(),requested:new Set(),observeTransport:false};document.querySelector('#header').__reactFiber$qa={memoizedProps:{userInfo:${JSON.stringify(user)}}};return ${run}})()`);
        eq(await win.webContents.executeJavaScript('window.clicks'),success?1:0);
        eq(Boolean(value.error),name.startsWith('foreign-'));
        if(name==='hydrating'){
          const hydrated=await win.webContents.executeJavaScript(`(()=>{document.querySelector('#header').__reactFiber$qa.memoizedProps.userInfo={uid:'9007199254740993',sec_uid:'MS4wQaOwn'};return ${run}})()`);
          eq(hydrated.waiting,true);eq(await win.webContents.executeJavaScript('window.clicks'),1);
        }
      }
      console.log(JSON.stringify({followerEntryNativeChecks:checks,normalDomNumberOrBubbledClick:true,foreignDisabledAmbiguousAndNotificationTargetsNotClicked:true,realProfileTouched:false,realPlatformRequests:0}));
    }catch(error){console.error(current,error);process.exitCode=1;}finally{if(win&&!win.isDestroyed())win.destroy();app.exit(process.exitCode||0);}
  });
}
