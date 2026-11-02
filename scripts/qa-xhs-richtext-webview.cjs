// Disposable synthetic embedded guest; never loads a real platform/account.
const path = require('node:path'), root = path.resolve(__dirname, '..');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
if (!process.versions.electron) {
  const {spawnSync} = require('node:child_process'), env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename,...process.argv.slice(2)],{cwd:root,windowsHide:true,encoding:'utf8',timeout:40000,env});
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exit(r.status === 0 && r.stdout?.includes('"xhsRichtextChecks"') ? 0 : r.status || 1);
} else {
  const {app,BrowserWindow,session} = require('electron'), fs = require('node:fs'), os = require('node:os'), assert = require('node:assert/strict');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(),'matrix-xhs-richtext-qa-')); app.setPath('userData',profile); app.commandLine.appendSwitch('mute-audio');
  app.whenReady().then(async () => { let win, checks = 0; try {
    const local = session.fromPartition('qa-xhs-richtext'); let loads = 0;
    await local.protocol.handle('https', () => { loads++; return new Response(`<meta charset=utf-8><style>input{width:300px;height:32px}.tiptap{width:800px;min-height:120px;border:1px solid}p{margin:0}</style><input placeholder="填写标题会有更多赞哦" maxlength=20><div style="height:1000px"></div><div class="tiptap ProseMirror" contenteditable=true data-placeholder="填写正文"><p><br></p></div><button id=publish>发布</button><script>window.submits=0;document.querySelector('#publish').onclick=()=>submits++;</script>`,{headers:{'Content-Type':'text/html; charset=utf-8'}}); });
    win = new BrowserWindow({show:false,width:1000,height:700,webPreferences:{session:local,webviewTag:true,contextIsolation:true,sandbox:true}});
    const attached = new Promise(resolve => win.webContents.once('did-attach-webview',(_,guest) => guest.once('did-finish-load',() => resolve(guest))));
    await win.loadURL('data:text/html,'+encodeURIComponent(`<button id=publish>一键发布</button><section style="position:fixed;left:-20000px;top:0;width:1280px;height:900px"><webview partition="qa-xhs-richtext" src="https://creator.xiaohongshu.com/publish/publish" style="width:1280px;height:900px"></webview></section><script>window.qa={keys:0,publishes:0};document.addEventListener('keydown',()=>qa.keys++);document.addEventListener('keyup',()=>qa.keys++);document.querySelector('#publish').onclick=()=>qa.publishes++;</script>`));
    const guest = await attached, host = code => win.webContents.executeJavaScript(code), js = code => guest.executeJavaScript(code);
    await host('document.querySelector("#publish").focus()');
    const packaged = process.argv.includes('--packaged');
    const load = name => {
      if (!packaged) return require('../desktop/'+name);
      const asar = require(path.join(root,'.desktop-deps/node_modules/@electron/asar')), Module = require('node:module'), filename = path.join(root,'desktop',name), mod = new Module(filename,module);
      mod.filename=filename;mod.paths=module.paths;mod._compile(asar.extractFile(path.join(root,'release-rc214/win-unpacked/resources/app.asar'),'desktop/'+name).toString(),filename);return mod.exports;
    };
    const {runOfficialDOM} = load('official-dom.cjs'), {publishForm} = load('publish-form.cjs');
    const base = {platform:'xiaohongshu',title:'都不要找安稳的工作！！',body:'#就业 #大学生 #校招 #社招',topics:['就业','大学生','校招','社招'],options:{}};
    const fill = form => runOfficialDOM(guest,publishForm,['fill',form],'matrix-publish-form',{backgroundFocus:true});
    let result = await fill(base); assert.deepEqual(result.unresolved,[]); assert.ok(result.filled.includes('body')); checks+=2;
    assert.equal(await js('document.querySelector(".tiptap").innerText'),base.body); assert.equal(await js('document.querySelector("input").value'),base.title); checks+=2;
    result = await fill(base); assert.deepEqual(result.unresolved,[]); assert.equal(await js('document.querySelector(".tiptap").innerText'),base.body); checks+=2;
    result = await fill({...base,body:'#就业方向',topics:['就业']}); assert.deepEqual(result.unresolved,[]); assert.equal(await js('[...document.querySelector(".tiptap").children].map(p=>p.innerText).join("\\n")'),'#就业方向\n#就业'); checks+=2;
    result = await fill({...base,body:'#就业#大学生',topics:['就业','大学生']}); assert.deepEqual(result.unresolved,[]); assert.equal(await js('document.querySelector(".tiptap").innerText'),'#就业#大学生'); checks+=2;
    await js('document.querySelector(".tiptap").innerHTML="<p>正文第一段</p><p>正文第二段</p>"');
    result = await fill({...base,body:'正文第一段\n正文第二段',topics:[]}); assert.deepEqual(result.unresolved,[]); checks++;
    await js('document.querySelector(".tiptap").innerHTML="<p>正文第一段</p><p><br class=ProseMirror-trailingBreak></p><p>正文第二段</p>"');
    result = await fill({...base,body:'正文第一段\n\n正文第二段',topics:[]}); assert.deepEqual(result.unresolved,[]); assert.equal(await js('document.querySelector(".tiptap").children.length'),3); checks+=2;
    await js('document.querySelector(".tiptap").innerHTML="<p>正文第一行<br>正文第二行<br class=ProseMirror-trailingBreak></p>"');
    result = await fill({...base,body:'正文第一行\n正文第二行',topics:[]}); assert.deepEqual(result.unresolved,[]); assert.equal(await js('document.querySelector(".tiptap").children.length'),1); checks+=2;
    await js('const extra=document.createElement("div");extra.contentEditable="true";extra.dataset.placeholder="正文";extra.style="width:100px;height:50px";extra.id="extra";document.body.append(extra)');
    result = await fill(base); assert.ok(result.unresolved.some(item=>item.includes('body：未唯一识别'))); assert.equal(await js('document.querySelector("#extra").innerText'),''); checks+=2;
    assert.deepEqual(await host('qa'),{keys:0,publishes:0}); assert.equal(await host('document.activeElement.id'),'publish'); assert.equal(await js('submits'),0); assert.equal(win.isVisible(),false); assert.equal(loads,1); checks+=5;
    console.log(JSON.stringify({xhsRichtextChecks:checks,packaged,actualEmbeddedOffscreenGuest:true,topicsNotDuplicated:true,exactTopicBoundary:true,hostFocusUnchanged:true,hostKeyboardEvents:0,hostPublishClicks:0,guestPublishClicks:0,realPlatformNetwork:false,realUserDataTouched:false}));
  } catch(error) {console.error(error);process.exitCode=1;} finally {win?.destroy();app.exit(process.exitCode||0);} });
}
