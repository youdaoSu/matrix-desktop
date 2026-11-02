const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'..');
async function test(){
 const assert=require('node:assert/strict'),React=require('react'),{createRoot}=require('react-dom/client'),{loadTs}=require('./qa-load-typescript.cjs');
 const cache=new Map(),overrides=new Map(),stub=(f,exports)=>cache.set(path.join(root,f),{exports});
 let owner='qa-owner',jobs=[],calls=0,checks=0;
 stub('client/src/components/workspace/PublishQueue.tsx',{usePublishQueue:()=>({jobs})});
 stub('client/src/components/workspace/WorkspaceUiState.tsx',{useWorkspaceIdentity:()=>owner});
 stub('client/src/components/ui/button.tsx',{Button:({variant,size,children,...props})=>React.createElement('button',props,children)});
 overrides.set('react-router-dom',{Link:({to,children,...props})=>React.createElement('a',{href:to,...props},children)});
 window.matrixDesktop=new Proxy({},{get(){calls++;throw Error('Read-only records page must not call platform actions');}});
 const Page=loadTs('client/src/pages/user/ModerationRecordsPage.tsx',cache,overrides).default,{moderationOf}=loadTs('client/src/components/workspace/publish-moderation.ts',cache,overrides),component=createRoot(document.getElementById('root'));
 const pause=()=>new Promise(r=>setTimeout(r,30)),render=async()=>{component.render(React.createElement(Page));await pause();await pause();};
 const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},rows=()=>[...document.querySelectorAll('[data-moderation-row]')],button=s=>[...document.querySelectorAll('button')].find(n=>n.textContent===s);
 const stamp=new Date().toISOString(),sample=(id,extra={})=>({id:String(id),title:'QA '+id,nickname:'QA account',accountId:'qa-account',platform:'douyin',updatedAt:stamp,stage:'failed',...extra}),verify=state=>({state,checkedAt:stamp,message:'Official fixture '+state});
 try{
  eq(moderationOf(sample(1)).state,'not-submitted');eq(moderationOf(sample(1,{receiptId:'r',verification:verify('not_found')})).state,'unknown');
  eq(moderationOf(sample(1,{receiptId:'r',verification:verify('timeout')})).state,'unknown');eq(moderationOf(sample(1,{verification:verify('rejected')})).state,'not-submitted');
  eq(moderationOf(sample(1,{receiptId:'r',verification:{...verify('rejected'),checkedAt:'invalid'}})).state,'unknown');
  eq(moderationOf(sample(1,{receiptId:'r',verification:verify('processing')})).state,'unknown');
  jobs=[sample(1,{stage:'confirmed',receiptId:'r1',acceptedAt:stamp,verification:verify('processing')}),sample(2,{receiptId:'r2',verification:verify('rejected')}),sample(3,{stage:'confirmed',receiptId:'r3',verification:verify('confirmed')}),sample(4),sample(5,{receiptId:'r5',verification:verify('timeout'),platform:'bilibili'})];
  await render();eq(rows().length,5);eq(calls,0);assert.match(rows()[0].textContent,/平台待审核/);assert.match(rows()[1].textContent,/官方提示未通过/);assert.match(rows()[2].textContent,/已确认发布/);assert.match(rows()[3].textContent,/尚无提交证明/);assert.match(rows()[4].textContent,/审核结果待核对/);checks+=5;
  const select=document.querySelector('[aria-label="审核状态筛选"]');select.value='rejected';select.dispatchEvent(new Event('change',{bubbles:true}));await pause();eq(rows().length,1);assert.match(rows()[0].textContent,/QA 2/);checks++;
  select.value='';select.dispatchEvent(new Event('change',{bubbles:true}));await pause();const platforms=document.querySelector('[aria-label="审核平台筛选"]');platforms.value='bilibili';platforms.dispatchEvent(new Event('change',{bubbles:true}));await pause();eq(rows().length,1);assert.match(rows()[0].textContent,/QA 5/);checks++;
  platforms.value='';platforms.dispatchEvent(new Event('change',{bubbles:true}));await pause();jobs=Array.from({length:103},(_,i)=>sample(i+1));await render();eq(rows().length,50);button('下一页').click();await pause();eq(rows().length,50);button('下一页').click();await pause();eq(rows().length,3);eq(button('下一页').disabled,true);
  jobs=[sample(1)];await render();eq(rows().length,1);assert.match(document.body.innerText,/第 1\/1 页/);checks++;
  owner='qa-other';jobs=[];await render();eq(rows().length,0);eq(document.querySelector('select').value,'');assert.ok(!document.body.innerText.includes('QA account'));checks++;eq(calls,0);
  return {moderationChecks:checks,realReact:true,officialEvidenceOnly:true,notFoundAndUploadFailureNotViolations:true,pagingAndOwnerIsolation:true,platformActions:calls};
 }finally{component.unmount();}
}
module.exports={test};
if(require.main===module||process.versions.electron&&process.type!=='renderer'){
 if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const r=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename],{cwd:root,encoding:'utf8',windowsHide:true,env,timeout:60000});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exitCode=r.status??1;}
 else{const {app,BrowserWindow,session}=require('electron'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-moderation-ui-'));app.setPath('userData',profile);app.disableHardwareAcceleration();const timer=setTimeout(()=>app.exit(1),45000);app.whenReady().then(async()=>{let win;try{session.defaultSession.webRequest.onBeforeRequest((r,done)=>done({cancel:!r.url.startsWith('data:')}));win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:true,contextIsolation:false,sandbox:false,backgroundThrottling:false}});await win.loadURL('data:text/html,<div id="root"></div>');console.log(JSON.stringify(await win.webContents.executeJavaScript('require('+JSON.stringify(__filename)+').test()')));}catch(e){console.error(e);process.exitCode=1;}finally{clearTimeout(timer);win?.destroy();app.exit(process.exitCode||0);}});}
}
