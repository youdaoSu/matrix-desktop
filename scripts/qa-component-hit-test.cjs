// Real Chromium geometry/shadow-root checks in a new disposable profile.
// All HTTPS is served by this fixture handler. No official request or upload.
if (!process.versions.electron) {
  const path=require('node:path'),{spawnSync}=require('node:child_process');
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const result=spawnSync(path.resolve('.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename],{windowsHide:true,encoding:'utf8',timeout:60000,env});
  process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.error)console.error(result.error.message);process.exit(result.status??1);
}
const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {openWechatUpload}=require('../desktop/wechat-upload.cjs');
const {openBilibiliUpload}=require('../desktop/bilibili-upload.cjs');
const {coverControl,openCoverWithInput}=require('../desktop/upload-controls.cjs');
const {pageAction}=require('../desktop/page-actions.cjs');
const {withOfficialDOM}=require('../desktop/official-dom.cjs');
const {publishForm}=require('../desktop/publish-form.cjs');
require('./qa-console-pipe.cjs').guardQaConsolePipes({exit:code=>app.exit(code)});
require('../desktop/audio-policy.cjs').registerSilentAudio({app});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-component-hit-qa-'));app.setPath('userData',profile);app.disableHardwareAcceleration();
let win,checks=0;
app.whenReady().then(async()=>{
 try {
  const isolated=session.fromPartition('qa-component-hit-'+Date.now());
  await isolated.protocol.handle('https',request=>new Response('<meta charset=utf-8><body style="margin:0">',{headers:{'content-type':'text/html;charset=utf-8'}}));
  win=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{session:isolated,sandbox:true,contextIsolation:true,backgroundThrottling:false}});
  const js=code=>win.webContents.executeJavaScript(code);
  const run=(fn,args)=>withOfficialDOM(win.webContents,'qa-component-hit',ctx=>ctx.evaluate(fn,args));
  async function fixture(depth,cover=false,icon=false,platform='wechat') {
   await win.loadURL(platform==='bilibili'?'https://member.bilibili.com/platform/upload/video/frame':'https://channels.weixin.qq.com/platform/post/create');
   await js(`(()=>{window.qaClicks=0;window.qaCoverClicks=0;let container=document.body;for(let i=0;i<${depth};i++){const host=document.createElement('x-creator-'+i);host.style.display='block';container.append(host);container=host.attachShadow({mode:'closed'});}window.qaRoot=container;
    const style=document.createElement('style');style.textContent='.ant-upload{width:400px;height:100px;margin:20px;position:relative}.vertical-cover-wrap{position:relative;width:100px;height:110px;margin:20px}.vertical-img-wrap,img{width:100px;height:110px}.edit{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}';container.append(style);
    const upload=document.createElement('div');upload.className=${JSON.stringify(platform==='bilibili'?'bcc-upload-wrapper ant-upload':'ant-upload ant-upload-btn')};upload.innerHTML=${JSON.stringify(platform==='bilibili'?'<span class=upload-btn>上传视频</span>':'上传时长8小时内，大小不超过20GB')};upload.onclick=()=>window.qaClicks++;container.append(upload);window.qaEntry=upload;
    ${icon?"const icon=document.createElement('x-upload-icon');icon.style='position:absolute;inset:0';upload.append(icon);icon.attachShadow({mode:'closed'}).innerHTML='<span style=\"display:block;width:100%;height:100%\">+</span>';":""}
    ${cover?"const c=document.createElement('div');c.className='vertical-cover-wrap img-popover-wrap';c.innerHTML='<div class=vertical-img-wrap><img class=\"vertical-img-size cover-img-vertical\" src=\"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==\"><span class=edit>编辑</span></div>';c.onclick=()=>window.qaCoverClicks++;container.append(c);window.qaCover=c;":""}
   })()`);
  }
  const viewport=async(width,height)=>{
   // Windows enforces a minimum top-level window size. Override only the
   // disposable document metrics to test a genuinely tiny CSS viewport.
   await withOfficialDOM(win.webContents,'qa-component-hit',ctx=>ctx.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false}));
   for(let attempt=0;attempt<30;attempt++){
    if(await js(`innerWidth===${width}&&innerHeight===${height}`))return;
    await new Promise(resolve=>setTimeout(resolve,50));
   }
   throw Error('Disposable Chromium viewport override did not reach its document');
  };
  await fixture(0);await viewport(100,100);
  await assert.rejects(()=>run(openWechatUpload,[{probe:true}]),/布局尚未就绪.*视口/);assert.equal(await js('window.qaClicks'),0);checks+=2;
  await withOfficialDOM(win.webContents,'qa-component-hit',ctx=>ctx.send('Emulation.clearDeviceMetricsOverride'));
  for(const depth of [0,1,2,3]) {
   await fixture(depth);await js("window.qaEntry.style.opacity='0'");
   await assert.rejects(()=>run(openWechatUpload,[{probe:true}]),/尚未就绪.*候选 1，可见 0/);assert.equal(await js('window.qaClicks'),0);checks+=2;
   await js("window.qaEntry.style.opacity='1'");
   assert.equal((await run(openWechatUpload,[{probe:true}])).ready,true);assert.equal(await js('window.qaClicks'),0);checks+=2;
   await js("{const duplicate=window.qaEntry.cloneNode(true);window.qaRoot.append(duplicate)}");
   await assert.rejects(()=>run(openWechatUpload,[{probe:true}]),/不唯一（2 个）/);assert.equal(await js('window.qaClicks'),0);checks+=2;
   await fixture(depth);assert.equal((await run(openWechatUpload,[{}])).opened,true);assert.equal(await js('window.qaClicks'),1);checks+=2;
   for(const mask of ['outer','inner','portal']) {
    await fixture(depth);
    await js(`(()=>{let parent=${mask==='inner'?'window.qaRoot':'document.body'};${mask==='portal'?"const host=document.createElement('x-mask-portal');host.style='position:fixed;inset:0;z-index:999';document.body.append(host);parent=host.attachShadow({mode:'closed'});":""}const mask=document.createElement('div');mask.style='position:fixed;inset:0;z-index:999;background:white';parent.append(mask);})()`);
    await assert.rejects(()=>run(openWechatUpload,[{}]),/遮挡/);assert.equal(await js('window.qaClicks'),0);checks+=2;
   }
   await fixture(depth,false,true);assert.equal((await run(openWechatUpload,[{}])).opened,true);assert.equal(await js('window.qaClicks'),1);checks+=2;
   await fixture(depth,true);assert.equal((await withOfficialDOM(win.webContents,'qa-component-hit',ctx=>openCoverWithInput(ctx,{platform:'wechat',index:1}))).opened,true);assert.equal(await js('window.qaCoverClicks'),1);checks+=2;
   await fixture(depth,true);await js("const mask=document.createElement('div');mask.style='position:fixed;inset:0;z-index:999;background:white';window.qaRoot.append(mask)");
   await assert.rejects(()=>run(coverControl,['open',{platform:'wechat',index:1}]),/遮挡/);assert.equal(await js('window.qaCoverClicks'),0);checks+=2;
   await fixture(depth,false,true,'bilibili');assert.equal((await run(openBilibiliUpload,[{}])).opened,true);assert.equal(await js('window.qaClicks'),1);checks+=2;
   await fixture(depth,false,true,'bilibili');await js("const mask=document.createElement('div');mask.style='position:fixed;inset:0;z-index:999;background:white';window.qaRoot.append(mask)");
   await assert.rejects(()=>run(openBilibiliUpload,[{}]),/遮挡/);assert.equal(await js('window.qaClicks'),0);checks+=2;
   // A final submit is only a synthetic DOM click. Test the exact isolated-world
   // saved nonce and revalidation path, not just the shared geometry routine.
   await fixture(depth);
   await js(`(()=>{window.qaSubmits=0;const button=document.createElement('button');button.style='position:relative;width:180px;height:70px';button.textContent='发表';button.onclick=()=>window.qaSubmits++;window.qaRoot.append(button);const icon=document.createElement('x-publish-icon');icon.style='position:absolute;inset:0';button.append(icon);icon.attachShadow({mode:'closed'}).innerHTML='<span style="display:block;width:100%;height:100%">+</span>';})()`);
   const nonce='fixture-submit-'+depth;
   assert.equal((await run(pageAction,['inspect',{kind:'publish',nonce}])).candidates.length,1);checks++;
   await js("{const mask=document.createElement('div');mask.id='qa-submit-mask';mask.style='position:fixed;inset:0;z-index:999;background:white';window.qaRoot.append(mask)}");
   const blocked=await run(pageAction,['submit-checked',{nonce,index:0}]);assert.equal(blocked.rejectedBeforeClick,true);assert.equal(await js('window.qaSubmits'),0);checks+=2;
   await js("window.qaRoot.querySelector('#qa-submit-mask').remove()");
   assert.equal((await run(pageAction,['submit-checked',{nonce,index:0}])).clicked,true);assert.equal(await js('window.qaSubmits'),1);checks+=2;
   await assert.rejects(()=>run(pageAction,['submit-checked',{nonce,index:0}]),/已提交/);assert.equal(await js('window.qaSubmits'),1);checks+=2;
  }
  // An author-created shadow root is valid on DIV/SPAN too; restricting roots
  // to hyphenated custom tags hides genuine cover/video controls from progress.
  for(const hostTag of ['div','span']) {
   await fixture(0,true);
   await js(`(()=>{const host=document.createElement(${JSON.stringify(hostTag)});host.style.display='block';document.body.append(host);const root=host.attachShadow({mode:'closed'});const style=document.createElement('style');style.textContent='.vertical-cover-wrap{width:100px;height:110px}.vertical-img-wrap,img{width:100px;height:110px}';root.append(style,window.qaCover);document.body.insertAdjacentHTML('beforeend','<input placeholder="标题"><button>发表</button>');})()`);
   const result=await run(publishForm,['progress',{platform:'wechat'}]);
   assert.equal(result.observation.coverContainers,1,'Author roots on '+hostTag+' must not hide the official cover');
   assert.equal(result.mediaReady,true);assert.equal(result.coverReady,true);assert.ok(result.observation.probe.componentRoots>0);assert.equal(result.observation.probe.matchedCovers,1);checks+=5;
   await js("window.qaCover.style.opacity='0'");
   const hidden=await run(publishForm,['progress',{platform:'wechat'}]);
   assert.equal(hidden.observation.coverContainers,0);assert.equal(hidden.observation.probe.matchedCovers,1);assert.deepEqual(hidden.observation.probe.rejectedCoverReasons,['transparent_ancestor']);assert.equal(hidden.mediaReady,false);checks+=4;
   await js("window.qaCover.style.opacity='1'");
  }
  // A visible cover label can still lie beneath the creator's sticky header.
  // It needs normal scrolling, not clicking through or removing the header.
  await win.loadURL('https://creator.douyin.com/creator-micro/content/post/video');
  await js(`document.body.innerHTML='<style>body{margin:0;height:1800px}.coverControl-qa{margin-top:200px;position:relative;width:180px;height:200px}.cover-qa{position:relative;width:180px;height:150px}.cover-qa img{width:180px;height:150px}.select-qa{position:absolute;inset:0}.title-qa{position:absolute;top:20px;left:10px;width:100px;height:20px}header{position:fixed;left:0;right:0;top:0;height:90px;background:white;z-index:999}</style><header>创作者导航</header><div class=coverControl-qa><div class=cover-qa><img src=before.png><div class=select-qa><span class=title-qa>选择封面</span></div></div><span class=cover-tip-qa>竖封面3:4</span></div><button id=publish>发布</button>';window.qaCoverClicks=0;window.qaSubmits=0;document.querySelector('.title-qa').onclick=()=>window.qaCoverClicks++;document.querySelector('#publish').onclick=()=>window.qaSubmits++;scrollTo(0,170);true`);
  const initiallyBlocked=await js(`(()=>{const r=document.querySelector('.title-qa').getBoundingClientRect();return r.top>0&&r.bottom<innerHeight&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2).tagName==='HEADER'})()`);
  assert.equal(initiallyBlocked,true);checks++;
  assert.equal((await run(coverControl,['open',{platform:'douyin',index:1}])).opened,true);assert.equal(await js('window.qaCoverClicks'),1);assert.equal(await js('window.qaSubmits'),0);checks+=3;
  await run(()=>{delete window.__matrixCoverWork;return true;},[]);
  await js(`const mask=document.createElement('div');mask.id='cover-foreign-mask';mask.style='position:fixed;inset:0;z-index:1000;background:white';document.body.append(mask);true`);
  await assert.rejects(()=>run(coverControl,['open',{platform:'douyin',index:1}]),/遮挡/);assert.equal(await js('window.qaCoverClicks'),1);assert.equal(await js('window.qaSubmits'),0);checks+=3;
  await fixture(0,true);
  await viewport(100,100);
  const tinyForm=await run(publishForm,['progress',{platform:'wechat'}]);
  assert.equal(tinyForm.ready,false,'A decoded cover cannot authorize a form in an unusable tiny viewport');
  assert.equal(tinyForm.observation.state,'waiting_layout');checks+=2;
  console.log(JSON.stringify({componentHitChecks:checks,realChromium:true,closedAndNestedRoots:true,realOverlaysStillBlocked:true,realProfileRead:false,realPlatformActions:false}));
 } catch(error){console.error({completedChecks:checks},error);process.exitCode=1;}
 finally{win?.destroy();app.exit(process.exitCode||0);}
});
