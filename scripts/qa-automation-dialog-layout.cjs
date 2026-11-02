// Actual Radix dialog + application-built CSS. Synthetic data only; no platform IPC.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {root,electron}=require('./qa-operations-paths.cjs');
async function mount(){
 const {projectRequire}=require('./qa-operations-paths.cjs'),React=projectRequire('react'),{createRoot}=projectRequire('react-dom/client'),{MemoryRouter}=projectRequire('react-router-dom'),{loadTs}=require('./qa-operations-load-typescript.cjs');
 const cache=new Map(),{InteractionAutomationTable}=loadTs('client/src/pages/user/InteractionAutomationTable.tsx',cache),{OperationsKeywordRoutes}=loadTs('client/src/pages/user/OperationsKeywordRoutes.tsx',cache);
 let changes=0;const data={accounts:[],rules:[],batch:{tasks:[]},settings:{policy:{paused:true},modes:[]},keywordRoutes:{rules:[],hits:[],totalHits:0}},run=()=>{changes++;throw Error('Fixture must not save or send');};
 function Fixture(){const [open,setOpen]=React.useState(true);return React.createElement(MemoryRouter,null,React.createElement(InteractionAutomationTable,{section:'dm',data,busy:false,error:'',refresh:run,open:run,edit:run,toggle:run,remove:run,stop:run,panel:open?React.createElement(OperationsKeywordRoutes,{data,busy:false,run}):undefined,panelTitle:'关键词分配',onClose:()=>setOpen(false)}));}
 const mounted=createRoot(document.getElementById('root'));mounted.render(React.createElement(Fixture));window.fixtureChanges=()=>changes;window.fixtureUnmount=()=>mounted.unmount();
}
module.exports={mount};
if(require.main===module&& !process.versions.electron){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const r=require('node:child_process').spawnSync(electron,[__filename,...process.argv.slice(2)],{env,encoding:'utf8',windowsHide:true,timeout:120000});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status??1);
}else if(process.versions.electron&&process.type!=='renderer'){
 const {app,BrowserWindow,session}=require('electron');
 const profile=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'matrix-dialog-layout-'));app.setPath('userData',profile);app.disableHardwareAcceleration();app.commandLine.appendSwitch('mute-audio');
 const timer=setTimeout(()=>{console.error('Fixture deadline exceeded');app.exit(1);},100000);
 app.whenReady().then(async()=>{let win;try{
  const args=process.argv.slice(2),at=args.indexOf('--asset-root'),assetRoot=at<0?path.join(root,'dist/client'):path.resolve(args[at+1]);
  const index=fs.readFileSync(path.join(assetRoot,'index.html'),'utf8'),styles=[...index.matchAll(/href="(\/?assets\/[^"?#]+\.css)"/g)].map(m=>m[1].replace(/^\//,''));
  let css=styles.map(name=>fs.readFileSync(path.join(assetRoot,name),'utf8')).join('\n');
  if(!styles.length){
   const bundle=index.match(/src="\/?(assets\/[^"?#]+\.js)"/)[1],ts=require('./qa-operations-paths.cjs').projectRequire('typescript'),script=ts.createSourceFile(bundle,fs.readFileSync(path.join(assetRoot,bundle),'utf8'),ts.ScriptTarget.Latest,true),found=[];
   function visit(n){if(ts.isBinaryExpression(n)&&ts.isPropertyAccessExpression(n.left)&&n.left.name.text==='textContent'&&ts.isNoSubstitutionTemplateLiteral(n.right)&&n.right.text.length)found.push(n.right.text);ts.forEachChild(n,visit);}
   visit(script.statements[0]);assert.equal(found.length,1,'Expected single built CSS injection');css=found[0];styles.push(bundle+'#injected-style');
  }
  assert(css.includes('.ops-automation-dialog'));assert(css.includes('translate:'));
  if(args.includes('--candidate-css'))css+='\n'+fs.readFileSync(path.join(root,'client/src/pages/user/account-operations.css'),'utf8');
  session.defaultSession.webRequest.onBeforeRequest((details,done)=>done({cancel:!details.url.startsWith('data:')}));
  win=new BrowserWindow({show:false,width:1360,height:960,webPreferences:{nodeIntegration:true,contextIsolation:false,sandbox:false,backgroundThrottling:false,offscreen:true}});
  await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<html lang="zh-CN"><head><style>'+css+'</style></head><body><div id="root"></div></body></html>'));
  const errors=[];win.webContents.on('console-message',(_e,level,message)=>{if(level>=3)errors.push(message);});
  await win.webContents.executeJavaScript('require('+JSON.stringify(__filename)+').mount()');
  const wait=()=>new Promise(r=>setTimeout(r,350)),samples=[];let checks=0;const ok=(value,message)=>{assert(value,message);checks++;};
  for(const [width,height,zoom] of [[1360,960,1],[1360,960,1.25],[440,720,1],[900,500,1],[1360,960,1.5]]){
   win.setSize(width,height);win.webContents.setZoomFactor(zoom);await wait();
   const sample=await win.webContents.executeJavaScript(`(()=>{const d=document.querySelector('[role=dialog]'),body=d?.querySelector('[data-automation-dialog-body]'),close=d?.querySelector('[data-slot=dialog-close]'),footer=d?.querySelector('.ops-automation-dialog-footer button');if(!d||!body||!close||!footer)throw Error('Missing real dialog');const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}},hit=e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};return{viewport:{w:innerWidth,h:innerHeight},dialog:rect(d),close:rect(close),footer:rect(footer),closeHit:hit(close),footerHit:hit(footer),scrollHeight:body.scrollHeight,clientHeight:body.clientHeight,bodyWidth:body.clientWidth,bodyScrollWidth:body.scrollWidth,translate:getComputedStyle(d).translate,transform:getComputedStyle(d).transform}})()`);
   samples.push({width,height,zoom,...sample});const {dialog:d,viewport:v}=sample;
   ok(Math.abs(d.x+d.w/2-v.w/2)<2&&Math.abs(d.y+d.h/2-v.h/2)<2,'Dialog not centered: '+JSON.stringify(samples.at(-1)));
   ok(d.x>=8&&d.y>=8&&d.right<=v.w-8&&d.bottom<=v.h-8,'Dialog outside viewport');
   ok(sample.closeHit&&sample.footerHit,'Exit controls not hittable');
   ok(sample.scrollHeight>sample.clientHeight&&sample.clientHeight>40,'Long form must scroll internally');
   ok(sample.bodyScrollWidth<=sample.bodyWidth+1,'Form overflows horizontally');
   const scroll=await win.webContents.executeJavaScript(`(()=>{const b=document.querySelector('[data-automation-dialog-body]');b.scrollTop=b.scrollHeight;return{top:b.scrollTop,bottom:document.querySelector('.ops-automation-dialog-footer').getBoundingClientRect().bottom}})()`);
   ok(scroll.top>0&&scroll.bottom<=v.h,'Scroll and fixed footer failed');
  }
  const out=path.join(root,'qa-output/automation-dialog-layout');fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'dialog-zoom150.png'),(await win.webContents.capturePage()).toPNG());
  // Activate the actual DOM close handler after checking pointer hit testing at every size.
  await win.webContents.executeJavaScript("document.querySelector('[data-slot=dialog-close]').click()");await wait();
  ok(await win.webContents.executeJavaScript("!document.querySelector('[role=dialog]')"),'Close button did not close');
  ok(await win.webContents.executeJavaScript('fixtureChanges()===0'),'Unexpected configuration action');ok(errors.length===0,'Renderer errors: '+errors.join(';'));
  await win.webContents.executeJavaScript('fixtureUnmount()');
  const report={passed:true,checks,styles,assetRoot,candidateCss:args.includes('--candidate-css'),samples,realPlatformActions:0,settingsChanged:0};fs.writeFileSync(path.join(out,args.includes('--candidate-css')?'candidate-report.json':'built-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(error){console.error(error);process.exitCode=1;}finally{clearTimeout(timer);win?.destroy();app.exit(process.exitCode||0);}});
}
