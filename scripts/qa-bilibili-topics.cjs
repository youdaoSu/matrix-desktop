// Actual Chromium + local synthetic official controls/responses. No live account.
const path=require('node:path'),root=path.resolve(__dirname,'..'),assert=require('node:assert/strict');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
if(!process.versions.electron){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const r=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:60000});
 process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status===0&&r.stdout.includes('bilibiliTopicChecks')?0:r.status||1);
}else{
 const {app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),os=require('node:os');
 const {syncBilibiliTags}=require('../desktop/bilibili-tags.cjs'),{createOperationBudget}=require('../desktop/operation-budget.cjs');
 app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-topic-qa-')));app.commandLine.appendSwitch('mute-audio');app.disableHardwareAcceleration();
 app.whenReady().then(async()=>{let win,html='',settings={},checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
  try{
   const local=session.fromPartition('qa-topics-only');
   await local.protocol.handle('https',async request=>{
    const url=new URL(request.url);
    if(url.pathname.startsWith('/platform/upload/video'))return new Response(html,{headers:{'Content-Type':'text/html;charset=utf-8'}});
    assert.equal(request.method,'GET');assert.equal(url.hostname,'member.bilibili.com');
    const custom=url.pathname==='/x/app/h5/archive/tag/info';assert(custom||url.pathname==='/x/vupre/web/topic/tag/check');
    if(custom&&settings.customDelay)await new Promise(r=>setTimeout(r,settings.customDelay));
    return new Response(JSON.stringify({code:0,data:{code:custom?(settings.customCode||0):(settings.topicCode??-1)}}),{headers:{'Content-Type':'application/json'}});
   });
   win=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{session:local,sandbox:true,contextIsolation:true,backgroundThrottling:false}});
   const js=s=>win.webContents.executeJavaScript(s);
   const load=async(options={})=>{
    settings=options;
    html=`<meta charset=utf-8><style>body{padding:20px}input{width:250px;height:30px}.tag-container{padding:12px}.tag-more{cursor:pointer;padding:10px}.label-item-v2-content{display:inline-block;padding:4px}.topic-dialog .dialog{position:fixed;inset:50px;background:white;border:1px solid;padding:20px;z-index:100}.topic-card{height:45px;padding:8px;border:1px solid;cursor:pointer}.modal-footer{padding:10px}button{padding:12px}.overlay{position:fixed;inset:0;background:white;z-index:9999}</style>
     <div class="tag-container" id="tag-container"><div class="tag-input-wrp"><div class="tag-pre-wrp"><div class="label-item-v2-container">${options.existingTopic?'<i class="topic-icon"></i>':''}<p class="label-item-v2-content">保留标签</p></div></div><input id="tag" type="text"></div><div class="tag-topic-wrp"><div class="tag-more">搜索更多话题 &gt;</div></div></div><button id="publish">立即投稿</button><p role="alert" id="notice"></p>
     <script>const options=${JSON.stringify(options)};window.actions={enter:0,open:0,search:0,select:0,confirm:0,publish:0};window.query='';
     const chip=name=>{const n=document.createElement('div');n.className='label-item-v2-container';const i=document.createElement('i');i.className='topic-icon';const p=document.createElement('p');p.className='label-item-v2-content';p.textContent=name;n.append(i,p);document.querySelector('.tag-pre-wrp').prepend(n);};
     document.querySelector('#publish').onclick=()=>actions.publish++;document.addEventListener('keydown',e=>{if(e.key==='Enter')actions.publish++});
     document.querySelector('#tag').onkeydown=async e=>{if(e.key!=='Enter')return;e.stopPropagation();actions.enter++;const tag=e.target.value;await Promise.all([fetch('/x/app/h5/archive/tag/info?tag_name='+encodeURIComponent(tag)).then(r=>r.json()),fetch('/x/vupre/web/topic/tag/check?tag='+encodeURIComponent(tag)).then(r=>r.json())]);e.target.value='';};
     const open=()=>{actions.open++;const wrapper=document.createElement('div');wrapper.className='topic-dialog';wrapper.innerHTML='<div class="dialog"><div class="topic-dialog-title">参与话题</div><div class="topic-dialog-search"><input placeholder="请输入" type="text"></div><div class="dialog-list"></div><div class="modal-footer"><button class="submit-add">确定</button><button class="submit-cancel">取消</button></div></div>';document.body.append(wrapper);let selected=null,timer;
      wrapper.querySelector('input').oninput=e=>{actions.search++;query=e.target.value;clearTimeout(timer);timer=setTimeout(()=>{const names=options.names||['程序员'];const list=wrapper.querySelector('.dialog-list');list.replaceChildren();names.forEach(name=>{const row=document.createElement('div');row.className='dialog-item';row.innerHTML='<span class="check-radio-v2-box"></span>';const card=document.createElement('div');card.className='topic-card'+(options.createOnly?' create-card':'');const label=document.createElement('div');label.className='topic-tag-name';label.textContent=name;card.append(label);if(options.activity){const i=document.createElement('i');i.className='topic-activity-icon';card.append(i);}row.append(card);list.append(row);card.onclick=()=>{actions.select++;list.querySelectorAll('.check-radio-v2-box-checked').forEach(n=>n.classList.remove('check-radio-v2-box-checked'));row.querySelector('span').classList.add('check-radio-v2-box-checked');selected=name;};});if(options.overlay)document.body.insertAdjacentHTML('beforeend','<div class="overlay">需要本人确认</div>');},500);};
      wrapper.querySelector('.submit-add').onclick=()=>{actions.confirm++;if(selected&&!options.noCommit){chip(selected);wrapper.remove();}};wrapper.querySelector('.submit-cancel').onclick=()=>wrapper.remove();};
     document.querySelector('.tag-more').onclick=open;if(options.preopen)open();
     </script>`;
    await win.loadURL('https://member.bilibili.com/platform/upload/video/frame');
   };
   const sync=(extra={})=>syncBilibiliTags(win.webContents,['保留标签','程序员'],createOperationBudget(6000),{waitMs:2500,topicWaitMs:1300,...extra});
   await load({customDelay:180});let result=await sync();eq(result.selected,['程序员','保留标签']);eq(await js('actions'),{enter:1,open:1,search:1,select:1,confirm:1,publish:0});eq(await js('query'),'程序员');
   await sync();eq(await js('actions.enter'),1);eq(await js('document.querySelectorAll(".topic-dialog").length'),0);
   for(const [options,pattern] of [
    [{customCode:-400},/校验未通过/],
    [{existingTopic:true},/已选其他话题/],
    [{names:['程序员学英语']},/尚未确认/],
    [{names:['程序员','程序员']},/多个同名/],
    [{createOnly:true},/尚未确认/],
    [{activity:true},/活动要求/],
    [{preopen:true},/标签输入框被弹窗遮挡/],
    [{overlay:true},/遮挡/],
    [{noCommit:true},/尚未确认/],
   ]){
    await load(options);await assert.rejects(sync(),pattern);checks++;eq(await js('actions.publish'),0);eq(await js('[...document.querySelectorAll(".label-item-v2-content")].map(n=>n.textContent)'),['保留标签']);
    if(!options.noCommit)eq(await js('actions.confirm'),0);
    if(options.preopen)eq(await js('actions.enter'),0);
   }
   await load();let owners=0;await assert.rejects(sync({assertCurrent:async()=>{if(++owners===5)await js('document.querySelector(".topic-dialog-search input").value="本人修改"');}}),/已变化/);checks++;eq(await js('actions.confirm'),0);eq(await js('actions.publish'),0);
   eq(win.webContents.debugger.listenerCount('message'),0);
   console.log(JSON.stringify({bilibiliTopicChecks:checks,realPlatformRequests:0,visibleWindows:0,publicationClicks:0}));
  }catch(error){console.error(error);process.exitCode=1;}finally{win?.destroy();app.exit(process.exitCode||0);}
 });
}
