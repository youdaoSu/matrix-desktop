const fs=require('node:fs'),path=require('node:path');const {root,electron}=require('./qa-operations-paths.cjs');
async function renderTests(){
 const assert=require('node:assert/strict'),{projectRequire}=require('./qa-operations-paths.cjs'),React=projectRequire('react'),{createRoot}=projectRequire('react-dom/client'),{MemoryRouter}=projectRequire('react-router-dom'),{loadTs}=require('./qa-operations-load-typescript.cjs');
 let checks=0,calls=[],pending,kind='keyword',notes=[],navigation=[];const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},wait=()=>new Promise(r=>setTimeout(r,60));
 const {InteractionExtraTools,interactionMenuLinkClass}=loadTs('client/src/components/workspace/InteractionExtraTools.tsx');
 const items=[{to:'/engage/account-operations',label:'账号运营'},{to:'/automation/keywords',label:'关键词回复'},{to:'/automation/welcome',label:'欢迎语'},{to:'/automation/offline',label:'离线文案'},{to:'/automation/monitor',label:'同步监控'},{to:'/automation/active-messages',label:'操作待办'},{to:'/automation/templates',label:'消息模板'}];
 const container=document.getElementById('root');let mounted=createRoot(container);
 const table={id:'source-one',ruleName:'合成关键词',ruleType:'keyword',keywords:['求'],matchMode:'contains',replyContent:'合成资料'},account={id:'bound-one',accountId:'backend-one',name:'合成账号',platform:'douyin'};
 const api={get:async(url,options)=>({data:{data:{items:url.includes('/accounts')?[{id:'backend-one',connectorSessionId:'synthetic-session',nickname:'合成账号',platform:'douyin'}]:url.includes('/templates')?[{id:'template-one',templateName:'合成模板',content:'合成文案'}]:[{...table,ruleType:options.params.ruleType}]}}}),post:async(url)=>{if(!url.endsWith('/test'))throw Error('No real configuration saves in fixture');return{data:{data:{hit:true,replyContent:'合成资料'}}};}};
 const overrides=new Map([['@/api',{axiosForBackend:api}],['sonner',{toast:{success:message=>notes.push(message),error:message=>notes.push(message),info:message=>notes.push(message)}}],['@/components/workspace/OfficialWorkspace',{platformLabels:{douyin:'抖音'},useOfficialWorkspace:()=>({openAccount:async()=>{throw Error('No official page opened');}})}],['@/components/workspace/account-operations-client',{operationsCall:async(command,args)=>{calls.push({command,args});if(command==='snapshot'){if(pending)await pending;return{accounts:[account]};}if(command==='save-rule')return{...args,id:'draft-one',revision:1};throw Error('Unexpected operation '+command);}}]]);
 overrides.set('react-router-dom',{...projectRequire('react-router-dom'),useNavigate:()=> (to,options)=>navigation.push({to,args:options.state.automationDraft,owner:options.state.automationDraftOwner})});
 overrides.set('@/components/workspace/WorkspaceUiState',{useWorkspaceIdentity:()=> 'fixture-owner'});
 const ReplyTools=loadTs('client/src/pages/user/ReplyToolsPage.tsx',new Map(),overrides).default;
 const helper=loadTs('client/src/pages/user/reply-tool-plan.ts');
 const reset=async element=>{mounted.unmount();mounted=createRoot(container);mounted.render(element);await wait();await wait();};
 const page=async next=>{kind=next;await reset(React.createElement(MemoryRouter,{initialEntries:['/automation/'+next]},React.createElement(ReplyTools)));};
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
 const input=async(label,value)=>{const el=document.querySelector('[aria-label="'+label+'"]'),proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));await wait();};
 const suggestion=async()=>{button(kind==='templates'?'使用文案':'测试并生成建议').click();await wait();await input('使用回复的账号','backend-one');};
 try{
  await reset(React.createElement(MemoryRouter,{initialEntries:['/engage/account-operations']},React.createElement('div',{className:'matrix-shell','data-module':'engage'},React.createElement('aside',{className:'matrix-module-sidebar'},React.createElement(InteractionExtraTools,{items}),React.createElement('a',{className:interactionMenuLinkClass({isActive:true}),id:'reference-menu'},'参考菜单')))));
  eq(document.querySelector('details').open,true);eq(document.querySelectorAll('nav[aria-label="更多互动工具"] a').length,7);
  const ref=document.querySelector('#reference-menu'),link=document.querySelector('nav a');eq(getComputedStyle(link).display,'flex');eq(link.getBoundingClientRect().height,ref.getBoundingClientRect().height);eq(getComputedStyle(link).backgroundColor,getComputedStyle(ref).backgroundColor);eq(link.getAttribute('aria-current'),'page');
  document.querySelector('summary').click();await wait();eq(document.querySelector('details').open,false);document.querySelector('summary').click();await wait();eq(document.querySelector('details').open,true);
  console.log('fixture: keyword draft');await page('keywords');await suggestion();button('填入新建计划').click();button('填入新建计划')?.click();await wait();await wait();
  let saved=navigation;eq(saved.length,1);eq(saved[0].args.enabled,false);eq(saved[0].args.accountIds,['bound-one']);eq(saved[0].args.match,'contains');eq(saved[0].args.trigger,'message');eq(saved[0].args.keywords,['求']);eq(button('已填入新建计划').disabled,true);
  console.log('fixture: welcome');await page('welcome');await suggestion();button('填入新建计划').click();await wait();await wait();saved=navigation;eq(saved.at(-1).args.trigger,'first-message');eq(saved.at(-1).args.match,'any');eq(saved.at(-1).args.enabled,false);
  console.log('fixture: offline');await page('offline');await suggestion();eq(button('填入新建计划'),undefined);eq(document.body.innerText.includes('关闭远效或电脑断网后'),true);
  console.log('fixture: template');await page('templates');await suggestion();const before=navigation.length;button('填入新建计划').click();await wait();eq(navigation.length,before);await input('新计划关键词','资料,帮助');button('填入新建计划').click();await wait();await wait();eq(navigation.at(-1).args.keywords,['资料','帮助']);
  console.log('fixture: stale guard');await page('keywords');await suggestion();let release;pending=new Promise(resolve=>release=resolve);const beforeStale=navigation.length;button('填入新建计划').click();await wait();await input('回复建议','已更改的合成文案');pending=undefined;release();await wait();eq(navigation.length,beforeStale);
  assert.throws(()=>helper.replyPlanAccount([account,{...account,id:'other'}],'backend-one'));checks++;
  assert.throws(()=>helper.replyToolDraft({...table,matchMode:'fuzzy'},account,'正文',[]));checks++;
  assert.throws(()=>helper.replyToolDraft({...table,ruleType:'offline'},account,'正文',[]));checks++;
  assert.throws(()=>helper.replyToolDraft(table,account,'长'.repeat(2001),[]));checks++;
  eq(calls.every(c=>c.command==='snapshot'),true);eq(navigation.every(c=>!c.args.enabled&&c.to==='/engage/auto-message'&&c.owner==='fixture-owner'),true);eq(helper.readPlanDraft({...navigation[0].args,id:'forged',enabled:true}).enabled,false);eq(helper.readPlanDraft({replyText:[]}),undefined);
  return{passed:true,checks,realReact:true,sharedMenuAppearance:true,draftsOnly:true,sourceConfigurationsUnchanged:true,realPlatformActions:0};
 }finally{mounted.unmount();}
}
module.exports={renderTests};
if(require.main===module&&!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const r=require('node:child_process').spawnSync(electron,[__filename],{env,encoding:'utf8',windowsHide:true,timeout:60000});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status??1);}
else if(process.versions.electron&&process.type!=='renderer'){
 const {app,BrowserWindow,session}=require('electron');app.setPath('userData',fs.mkdtempSync(path.join(require('node:os').tmpdir(),'matrix-tools-ui-')));app.disableHardwareAcceleration();app.commandLine.appendSwitch('mute-audio');const timer=setTimeout(()=>{console.error('Fixture timed out');app.exit(1);},50000);
 app.whenReady().then(async()=>{let win;try{
  const index=fs.readFileSync(path.join(root,'dist/client/index.html'),'utf8'),bundle=index.match(/src="\/?(assets\/[^"?#]+\.js)"/)[1],ts=require('./qa-operations-paths.cjs').projectRequire('typescript'),script=ts.createSourceFile(bundle,fs.readFileSync(path.join(root,'dist/client',bundle),'utf8'),ts.ScriptTarget.Latest,true),styles=[];
  function visit(n){if(ts.isBinaryExpression(n)&&ts.isPropertyAccessExpression(n.left)&&n.left.name.text==='textContent'&&ts.isNoSubstitutionTemplateLiteral(n.right)&&n.right.text.length)styles.push(n.right.text);ts.forEachChild(n,visit);}visit(script.statements[0]);if(styles.length!==1)throw Error('Built CSS unavailable');
  const css=styles[0]+'\n'+fs.readFileSync(path.join(root,'client/src/workspace.css'),'utf8');session.defaultSession.webRequest.onBeforeRequest((d,done)=>done({cancel:!d.url.startsWith('data:')}));
  win=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{nodeIntegration:true,contextIsolation:false,sandbox:false,offscreen:true,backgroundThrottling:false}});win.webContents.on('console-message',(_e,level,message)=>console.log('renderer:',level,message));await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<html><head><style>'+css+'</style></head><body><div id="root"></div></body></html>'));console.log(JSON.stringify(await win.webContents.executeJavaScript('require('+JSON.stringify(__filename)+').renderTests()')));
 }catch(error){console.error(error);process.exitCode=1;}finally{clearTimeout(timer);win?.destroy();app.exit(process.exitCode||0);}});
}
