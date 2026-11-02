// Actual React text/mention rendering. Local HTTPS fixtures only; no artwork
// downloaded from a third party, real profile access or account operations.
const path=require('node:path'),root=path.resolve(__dirname,'..');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
async function run(){
 const assert=require('node:assert/strict'),React=require('react'),{createRoot}=require('react-dom/client'),{loadTs}=require('./qa-load-typescript.cjs');let checks=0;
 const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},cache=new Map();
 localStorage.setItem('matrix-public-douyin-emoji:v2',JSON.stringify({version:2,at:Date.now(),entries:[{name:'赞',img:'qa-thumb'},{name:'玫瑰',img:'qa-rose'},{name:'星星眼',img:'https://p3-pc-sign.douyinpic.com/qa-stars'},{name:'失效',img:'qa-missing'}]}));
 const {DouyinInlineText}=loadTs('client/src/components/workspace/DouyinInlineText.tsx',cache),component=createRoot(document.getElementById('root'));
 const until=async test=>{for(let n=0;n<200;n++){if(test())return;await new Promise(r=>setTimeout(r,5));}throw Error('Inline emoji fixture timeout');};
 try{
  component.render(React.createElement('p',null,React.createElement(DouyinInlineText,{text:'[赞][赞][赞] 谢谢[玫瑰]'})));
  await until(()=>document.querySelectorAll('img').length===4&&[...document.querySelectorAll('img')].every(img=>img.naturalWidth>0));
  eq(document.querySelector('p').textContent,' 谢谢');eq([...document.querySelectorAll('img')].map(img=>img.alt),['[赞]','[赞]','[赞]','[玫瑰]']);eq(document.querySelector('img').referrerPolicy,'no-referrer');eq(document.querySelector('img').getBoundingClientRect().width,24);
  component.render(React.createElement('p',null,React.createElement(DouyinInlineText,{text:'我去好燃[星星眼][星星眼]'})));await until(()=>document.querySelectorAll('img').length===2&&[...document.querySelectorAll('img')].every(img=>img.naturalWidth>0));eq(document.querySelector('p').textContent,'我去好燃');eq([...document.querySelectorAll('img')].map(img=>img.alt),['[星星眼]','[星星眼]']);
  component.render(React.createElement('p',null,React.createElement(DouyinInlineText,{text:'原文[未知] [失效]'})));await until(()=>document.querySelector('p').textContent==='原文[未知] [失效]');eq(document.querySelectorAll('img').length,0);
  component.render(React.createElement('p',null,React.createElement('span',{className:'matrix-inbox-mention'},React.createElement(DouyinInlineText,{text:'@所有人'})),React.createElement(DouyinInlineText,{text:'谢谢[玫瑰]'})));await until(()=>document.querySelector('img')?.naturalWidth>0);eq(document.querySelector('.matrix-inbox-mention').textContent,'@所有人');eq(document.querySelector('p').textContent,'@所有人谢谢');
  eq(Object.keys(JSON.parse(localStorage.getItem('matrix-public-douyin-emoji:v2'))).sort(),['at','entries','version']);
  return{inlineEmojiUiChecks:checks,repeatedShortcodesAndAdjacentText:true,mentionTextPreserved:true,failedImageRetainsLiteral:true,credentialsOrBodiesCached:false,externalRequests:0,realBusinessWrites:0};
 }finally{component.unmount();}
}
module.exports={run};
if(!process.versions.electron){const{spawnSync}=require('node:child_process'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const result=spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename],{cwd:root,windowsHide:true,env,encoding:'utf8',timeout:35000});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status??1);}
else if(process.type!=='renderer'){
 const{app,BrowserWindow}=require('electron'),fs=require('node:fs'),os=require('node:os'),pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64');
 app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-inline-emoji-')));app.whenReady().then(async()=>{let win;try{
  win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false}});const origin='https://emoji.fixture.test/',cdn='https://sf3-cdn-tos.douyinstatic.com/obj/ies-douyin-opencn/emoji/';
  win.webContents.session.webRequest.onBeforeRequest((request,done)=>done({cancel:request.url!==origin&&!request.url.startsWith(cdn+'qa-')&&request.url!=='https://p3-pc-sign.douyinpic.com/qa-stars'}));
  win.webContents.session.protocol.handle('https',request=>request.url===origin?new Response('<div id="root"></div>',{headers:{'content-type':'text/html'}}):request.url.includes('qa-missing')?new Response('',{status:404}):new Response(pixel,{headers:{'content-type':'image/png'}}));
  await win.loadURL(origin);await win.webContents.insertCSS(fs.readFileSync(path.join(root,'client/src/workspace.css'),'utf8'));console.log(JSON.stringify(await win.webContents.executeJavaScript(`require(${JSON.stringify(__filename)}).run()`)));
 }catch(error){console.error(error);process.exitCode=1;}finally{win?.destroy();app.quit();}});
}
