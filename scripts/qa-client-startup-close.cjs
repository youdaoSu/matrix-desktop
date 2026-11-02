// Execute current main lifecycle functions with REAL disposable BrowserWindows.
// Only inert local fixture HTML, no app backend/profile/platform or posts.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'..');require('./qa-console-pipe.cjs').guardQaConsolePipes();
if(!process.versions.electron){const{spawnSync}=require('node:child_process'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const result=spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename],{cwd:root,windowsHide:true,encoding:'utf8',timeout:20000,env});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status??1);}
const{app,BrowserWindow}=require('electron'),http=require('node:http'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-real-close-qa-')));app.disableHardwareAcceleration();app.on('window-all-closed',()=>{});
let server,win;const responses=[];
app.whenReady().then(async()=>{
 server=http.createServer((request,response)=>{if(request.url==='/delay'){responses.push(response);return;}response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>QA loading</title><img src="/delay">');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+'/';
 const source=fs.readFileSync(path.join(root,'desktop/main.cjs'),'utf8'),syntax=ts.createSourceFile('main.cjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),names=['watchMainWindowClose','startupWindowClosing','handleStartupFailure'],declarations=syntax.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.includes(node.name?.text));assert.equal(declarations.length,3);
 const observed=[];
 for(const mode of ['native-close','devtools-close','genuine-failure']){
  const events=[],dialogs=[];let quits=0;win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true}});
 const context={mainWindow:win,closingMainWindows:new WeakSet(),app:{isQuitting:false,quit(){this.isQuitting=true;quits++;}},dialog:{showErrorBox:(title,message)=>dialogs.push({title,message}),showMessageBox:async(_win,options)=>dialogs.push(options)},setImmediate,Error,AbortController};vm.createContext(context);vm.runInContext(declarations.map(node=>node.getText(syntax)).join('\n'),context);context.watchMainWindowClose(win);
  win.on('close',()=>events.push('close'));win.on('closed',()=>events.push('closed'));win.webContents.on('did-fail-load',(_e,code)=>events.push('failed:'+code));
  if(mode==='genuine-failure'){
   await win.loadURL('http://127.0.0.1:1/').catch(error=>context.handleStartupFailure(error));assert.equal(dialogs.length,1);assert.equal(quits,1);win.destroy();
  }else{
   const waiting=win.loadURL(url).catch(error=>{events.push('load-rejected');return context.handleStartupFailure(error);});
   await new Promise(resolve=>setTimeout(resolve,100));
   if(mode==='native-close')win.close();else{win.webContents.debugger.attach('1.3');void win.webContents.debugger.sendCommand('Page.close').catch(()=>{});}
   await waiting;await new Promise(resolve=>setTimeout(resolve,25));
   assert.equal(dialogs.length,0,mode+' must not show startup error: '+JSON.stringify({events,dialogs}));assert.equal(quits,1);assert.equal(win.isDestroyed(),true);
  }
  observed.push({mode,events,dialogs:dialogs.length,quits});win=null;
 }
 // A hidden collector prevents window-all-closed, but must not prevent a
 // completed main-window close from requesting the normal cleanup path.
 const collector=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true}});
 try{let quits=0;win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true}});await win.loadURL('data:text/html,<h1>Loaded main</h1>');const context={closingMainWindows:new WeakSet(),app:{isQuitting:false,quit(){this.isQuitting=true;quits++;}}};vm.createContext(context);vm.runInContext(declarations.find(n=>n.name.text==='watchMainWindowClose').getText(syntax),context);context.watchMainWindowClose(win);win.close();await new Promise(r=>setTimeout(r,25));assert.equal(win.isDestroyed(),true);assert.equal(collector.isDestroyed(),false);assert.equal(quits,1);observed.push({mode:'loaded-main-with-hidden-collector',quits});win=null;}finally{collector.destroy();}
 console.log(JSON.stringify({actualEarlyCloseLifecycle:true,observed,realUserDataTouched:false,officialActions:false}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{if(win&&!win.isDestroyed())win.destroy();responses.forEach(response=>response.destroy());server?.closeAllConnections();server?.close();app.exit(process.exitCode||0);});
