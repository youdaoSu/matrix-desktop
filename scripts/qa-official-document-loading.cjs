// Fresh hidden Electron webview, loopback fixtures only. No installed app,
// account profile, debug port, official network request or publication.
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
if (!process.versions.electron) {
  const cached = path.join(root, '.desktop-deps/node_modules/electron/dist/electron.exe');
  const result = require('node:child_process').spawnSync(fs.existsSync(cached) ? cached : require('electron'), [__filename], { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 30000 });
  process.stdout.write(result.stdout || '');process.stderr.write(result.stderr || '');
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
} else {
  const { app, BrowserWindow, ipcMain } = require('electron');
  require('../desktop/audio-policy.cjs').registerSilentAudio({ app });
  app.setPath('userData', fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'matrix-load-state-qa-')));
  let win, server;
  app.whenReady().then(async () => {
    const assert = require('node:assert/strict');
    server = require('node:http').createServer((request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (request.url === '/widget') { setTimeout(() => response.end('<p>late widget</p>'), 250); return; }
      response.end('<style>body{margin:0;background:#246}main{height:4000px}</style><main>QA official page</main><script>addEventListener("scroll",()=>{if(document.querySelector("iframe"))return;const f=document.createElement("iframe");f.src="/widget";f.style="position:absolute;top:700px";document.body.append(f)},{once:true})</script>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    win = new BrowserWindow({ show: false, width: 1000, height: 700, webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false, webviewTag: true, backgroundThrottling: false } });
    const timeout = setTimeout(() => app.exit(1), 20000);
    try {
      const result = new Promise((resolve, reject) => ipcMain.once('qa-document-loading-result', (_event, data) => data.error ? reject(Error(data.error)) : resolve(data)));
      const hostScript = `
        const assert = require('node:assert/strict');
        const {observeOfficialDocumentLoading} = require(${JSON.stringify(path.join(root,'scripts/qa-load-typescript.cjs'))}).loadTs('client/src/components/workspace/official-document-loading.ts',new Map(),new Map());
        const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
        const until = async predicate => {for(let i=0;i<200;i++){if(predicate())return;await sleep(20);}throw Error('Webview fixture timeout');};
        (async()=>{
          let checks=0;const synthetic=new EventTarget(), states=[];
          const detach=observeOfficialDocumentLoading(synthetic,state=>states.push(state));
          const emit=(name,props={})=>synthetic.dispatchEvent(Object.assign(new Event(name),props));
          emit('did-start-navigation',{isMainFrame:true,isInPlace:false});assert.deepEqual(states.at(-1),{loading:true,ready:false});checks++;
          emit('dom-ready');assert.deepEqual(states.at(-1),{loading:false,ready:true});checks++;
          for(const props of [{isMainFrame:false},{isMainFrame:true,isInPlace:true}]){const n=states.length;emit('did-start-navigation',props);emit('did-start-loading');assert.equal(states.length,n);checks++;}
          emit('did-fail-load',{isMainFrame:false,errorCode:-2});assert.equal(states.at(-1).ready,true);checks++;
          emit('did-fail-load',{isMainFrame:true,errorCode:-3});assert.equal(states.at(-1).ready,true);checks++;
          emit('did-start-navigation',{isMainFrame:true,isInPlace:false});emit('did-stop-loading');assert.equal(states.at(-1).loading,true);checks++;
          emit('did-fail-load',{isMainFrame:true,errorCode:-2});assert.deepEqual(states.at(-1),{loading:false,ready:false});checks++;
          const n=states.length;detach();emit('dom-ready');assert.equal(states.length,n);checks++;
          const view=document.createElement('webview');view.style='display:flex;width:100%;height:650px';
          const observed=[];let starts=0,documents=0;observeOfficialDocumentLoading(view,state=>{observed.push(state);document.getElementById('mask').hidden=!state.loading;});
          view.addEventListener('did-start-loading',()=>starts++);
          view.addEventListener('did-start-navigation',event=>{if(event.isMainFrame&&!event.isInPlace)documents++;});
          view.src=${JSON.stringify(origin)};document.body.append(view);
          await until(()=>observed.at(-1)?.ready);await sleep(100);
          const oldId=view.getWebContentsId(),beforeStarts=starts,beforeDocuments=documents;observed.length=0;
          await view.executeJavaScript('window.scrollTo(0,750)');
          await until(()=>starts>beforeStarts);await sleep(450);
          assert.ok(starts>beforeStarts,'Scrolling child widget reproduces generic loading event');checks++;
          assert.ok(!observed.some(state=>state.loading),'No full-page mask during subframe loading');checks++;
          assert.equal(document.getElementById('mask').hidden,true);checks++;
          assert.equal(view.getWebContentsId(),oldId);checks++;
          assert.equal(documents,beforeDocuments);checks++;
          assert.ok(await view.executeJavaScript('scrollY')>=700);checks++;
          await view.loadURL(${JSON.stringify(origin+'/next')});
          assert.ok(observed.some(state=>state.loading),'Real main document navigation still shows loading');checks++;
          await until(()=>observed.at(-1)?.ready);assert.equal(document.getElementById('mask').hidden,true);checks++;
          require('electron').ipcRenderer.send('qa-document-loading-result',{checks,subframeScrollReproduced:true,noReloadOrScrollReset:true,realPlatformActions:false});
        })().catch(error=>require('electron').ipcRenderer.send('qa-document-loading-result',{error:error.stack}));
      `;
      await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<div id="mask" hidden>Loading</div><script>'+hostScript+'</script>'));
      const data = await result;assert.ok(data.checks >= 17);console.log(JSON.stringify(data));
    } catch (error) { console.error(error.stack);process.exitCode = 1; }
    finally { clearTimeout(timeout);win?.destroy();server?.close();app.exit(process.exitCode || 0); }
  }).catch(error => { console.error(error.stack);app.exit(1); });
}
