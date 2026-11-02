// Read-only real-editor evidence. No clicks, file handoff, HTTP platform APIs,
// cookies, authentication overrides or publish-plan replacement.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { collectComponentRoots }=createRequire(import.meta.url)('../desktop/official-dom.cjs');
const { uploadControl }=createRequire(import.meta.url)('../desktop/upload-controls.cjs');
const platform=process.argv[2];
const release=process.argv[3]||'rc.32';assert.match(release,/^rc\.\d+$/);const reportTag=release.replace('.','');
const origins={douyin:'https://creator.douyin.com',xiaohongshu:'https://creator.xiaohongshu.com',bilibili:'https://member.bilibili.com'};
assert.ok(Object.hasOwn(origins,platform));
const targets=await fetch((await import('./local-installed-debug.mjs')).installedDebugUrl,{signal:AbortSignal.timeout(3000)}).then(r=>r.json());
const guests=targets.filter(t=>t.type==='webview'&&new URL(t.url).origin===origins[platform]&&(platform!=='bilibili'||new URL(t.url).pathname==='/platform/upload/video/frame'));
assert.equal(guests.length,1,'Guest must be unique for this diagnostic platform');
const socket=new WebSocket(guests[0].webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
let sequence=0;const pending=new Map();
socket.addEventListener('message',event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(!p)return;clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);});
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Read-only diagnostic timeout: '+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
const roots=[];
try{
  const {frameTree}=await call('Page.getFrameTree');
  const {executionContextId}=await call('Page.createIsolatedWorld',{frameId:frameTree.frame.id,worldName:'matrix-upload-controls'});
  const {root}=await call('DOM.getDocument',{depth:-1,pierce:true});
  const ids=collectComponentRoots(root);assert.ok(ids.length<=40);
  for(const backendNodeId of ids){const {object}=await call('DOM.resolveNode',{backendNodeId,executionContextId});if(object?.objectId)roots.push(object.objectId);}
  const result=await call('Runtime.callFunctionOn',{executionContextId,arguments:roots.map(objectId=>({objectId})),returnByValue:true,functionDeclaration:`function(...roots){
    const query=s=>[...new Set([document,...roots].flatMap(r=>[...r.querySelectorAll(s)]))];
    const visible=e=>{if(!e.isConnected||!e.getClientRects().length)return false;for(let p=e;p;p=p.parentElement||p.getRootNode().host){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||s.opacity==='0'||/animate-hide/.test(p.className||''))return false;}return true;};
    const info=e=>({tag:e.tagName,role:e.getAttribute('role'),className:typeof e.className==='string'?e.className:'',text:(e.innerText||e.textContent||'').trim().slice(0,350),visible:visible(e),disabled:!!e.disabled,rect:{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}});
    const work=window.__matrixCoverWork;
    let uploadMatch;try{uploadMatch=(${uploadControl.toString()})({platform:${JSON.stringify(platform)},mediaType:'video',count:1,describe:true},roots);}catch(e){uploadMatch={error:e.message};}
    return{url:location.origin+location.pathname,viewport:{width:innerWidth,height:innerHeight,visibility:document.visibilityState},componentRoots:roots.length,uploadMatch,fileInputs:query('input[type=file]').map(e=>({accept:e.accept,id:e.id,name:e.name,className:e.className,parentClass:e.parentElement?.className,parentText:(e.parentElement?.innerText||'').slice(0,180),files:[...e.files].map(f=>({name:f.name,size:f.size})),visible:visible(e)})),uploadEntries:query('button,[role=button],div,span').filter(e=>visible(e)&&/^(点击上传|上传视频|点击上传视频|立即上传)$/.test((e.innerText||'').trim())&&![...e.children].some(c=>(c.innerText||'').trim()===(e.innerText||'').trim())).slice(0,15).map(info),work:work?{index:work.index,uploaded:work.uploaded,confirmClicked:work.confirmClicked,beforePreviewPresent:!!work.before}:null,
      dialogs:query('[role=dialog],[class*=modal],[class*=Modal],[class*=crop],[class*=Crop]').filter(e=>visible(e)&&/封面|裁剪|失败|错误/.test(e.innerText||'')).map(info).slice(0,20),
      coverElements:query('[class*=cover],[class*=Cover]').filter(e=>visible(e)&&((e.innerText||'').length<150||e.tagName==='IMG')).map(info).slice(0,55),
      coverEntryTree:query('.cover-plugin-preview .default').flatMap(e=>[e,...e.querySelectorAll('span,button,div')]).slice(0,25).map(info),
      buttons:query('button,[role=button],a,.cover-editor-button > .button').filter(e=>visible(e)&&/^(完成|确定|确认|保存|保存封面|确认封面|应用|暂不设置|设置横封面|设置封面|上传封面|更换封面|自定义封面|编辑封面|选择封面|发布|投稿)$/.test((e.innerText||'').trim())).map(info).slice(0,25),
      bilibiliCoverState:${JSON.stringify(platform)}==='bilibili'?{editors:query('.cover-editor').map(e=>({className:e.className,visible:visible(e)})),canvases:query('.cover-editor canvas').map(e=>({width:e.width,height:e.height,visible:visible(e)})),images:query('.cover-module-main img,.cover-editor-panel img').map(e=>({className:e.className,naturalWidth:e.naturalWidth,naturalHeight:e.naturalHeight,visible:visible(e)})),notices:query('[role=alert],[class*=message],[class*=toast]').filter(e=>visible(e)&&e.innerText?.length<300).map(e=>e.innerText),submissionSignals:query('p,span,div').filter(e=>visible(e)&&e.innerText?.length<300&&/投稿成功|发布成功|发布失败|投稿失败|提交失败|成功提交|审核中|请.*(?:标签|分区|标题)|至少.*标签/.test(e.innerText)&&![...e.children].some(c=>c.innerText===e.innerText)).slice(0,25).map(info)}:undefined};
  }`});
  if(result.exceptionDetails)throw Error('Editor read failed');
  const evidence={platform,checkedAt:new Date().toISOString(),...result.result.value};
  fs.writeFileSync('logs/'+reportTag+'-'+platform+'-editor-evidence.json',JSON.stringify(evidence,null,2));
  // Background guests can deliberately have no composited surface. Do not wait
  // for Page.captureScreenshot there; structural evidence is still available.
  console.log(JSON.stringify(evidence));
}finally{for(const objectId of roots)try{await call('Runtime.releaseObject',{objectId});}catch{}socket.close();}
