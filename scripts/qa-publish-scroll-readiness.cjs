// Synthetic Chromium only: reproduce CSS smooth-scroll races without accounts.
const path=require('node:path'),root=path.resolve(__dirname,'..');
if(!process.versions.electron){
 const {spawnSync}=require('node:child_process'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const r=spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename],{cwd:root,windowsHide:true,encoding:'utf8',timeout:30000,env});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status===0&&r.stdout?.includes('scrollReadinessChecks')?0:1);
}else{
 const {app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');
 const {pageAction}=require('../desktop/page-actions.cjs'),{bilibiliTagControl}=require('../desktop/bilibili-tags.cjs');
 app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-scroll-qa-')));app.disableHardwareAcceleration();
 app.whenReady().then(async()=>{let win,html='',checks=0;try{
  const local=session.fromPartition('qa-scroll');await local.protocol.handle('https',()=>new Response(html,{headers:{'content-type':'text/html;charset=utf-8'}}));
  win=new BrowserWindow({show:false,width:1000,height:700,webPreferences:{session:local,contextIsolation:true,sandbox:true}});
  const js=code=>win.webContents.executeJavaScript(code),run=async(fn,command,input)=>{const result=await win.webContents.executeJavaScriptInIsolatedWorld(1001,[{code:`(()=>{try{return {value:(${fn.toString()})(${JSON.stringify(command)},${JSON.stringify(input)})}}catch(error){return {error:error.message}}})()`}]);if(result.error)throw Error(result.error);return result.value;};
  const css='<style>html{scroll-behavior:smooth}body{margin:0;padding-top:1800px;padding-bottom:1200px}input,button{width:300px;height:40px}.tag-container{padding:20px}</style>';
  html=css+'<form><input placeholder="标题" value="QA"><button type="button" onclick="window.clicks=(window.clicks||0)+1">发布</button></form>';
  await win.loadURL('https://creator.xiaohongshu.com/publish/publish');
  await run(pageAction,'inspect',{kind:'publish',nonce:'scroll'});
  assert.equal((await run(pageAction,'validate',{nonce:'scroll',index:0})).ready,true);checks++;
  await js('document.body.insertAdjacentHTML("beforeend",\'<div style="position:fixed;inset:0;z-index:999;background:white">官方弹窗</div>\')');
  await assert.rejects(run(pageAction,'validate',{nonce:'scroll',index:0}),/遮挡/);assert.equal(await js('window.clicks||0'),0);checks+=2;
  html=css+'<div id="tag-container" class="tag-container"><div class="tag-input-wrp"><div class="tag-pre-wrp"></div><input type="text" maxlength="20"></div></div>';
  await win.loadURL('https://member.bilibili.com/platform/upload/video/frame');
  assert.equal((await run(bilibiliTagControl,'prepare',{expected:'测试标签',nonce:'tag'})).prepared,true);checks++;
  assert.equal((await run(bilibiliTagControl,'confirm',{expected:'测试标签',nonce:'tag'})).dispatched,true);checks++;
  console.log(JSON.stringify({scrollReadinessChecks:checks,actualChromium:true,realPlatformActions:false,publishClicks:0}));
 }catch(error){console.error(error);process.exitCode=1;}finally{win?.destroy();app.quit();}});
}
