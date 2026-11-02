// Native-equivalent closed-root reads in real offline Chromium. All HTTPS
// requests are served locally by this disposable session's protocol handler.
const path = require('node:path'), root = path.resolve(__dirname, '..');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process'), env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(path.join(root, '.desktop-deps/node_modules/electron/dist/electron.exe'), [__filename], { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 30000, env });
  process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
  if(result.status!==0)process.exit(result.status??1);
  // Keep the observed Douyin list-entry/navigation checks in the release gate,
  // not just a standalone renderer test that might otherwise be skipped.
  const entry=spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[path.join(root,'scripts/qa-official-data-renderer.cjs')],{cwd:root,windowsHide:true,encoding:'utf8',timeout:30000,env});
  process.stdout.write(entry.stdout||'');process.stderr.write(entry.stderr||'');if(entry.error)console.error(entry.error.message);process.exit(entry.status??1);
} else {
  const { app, BrowserWindow } = require('electron'), fs = require('node:fs'), os = require('node:os'), assert = require('node:assert/strict');
  const { runOfficialDOM } = require('../desktop/official-dom.cjs'), { officialData } = require('../desktop/official-data.cjs');
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-interaction-dom-qa-'))); app.commandLine.appendSwitch('mute-audio');
  app.whenReady().then(async () => {
    let win, checks = 0, requests = 0, html = '';
    const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
    try {
      win = new BrowserWindow({ show: false, width: 900, height: 700, webPreferences: { sandbox: true, contextIsolation: true } }); win.webContents.setAudioMuted(true);
      win.webContents.session.protocol.handle('https', () => { requests++; return new Response('<meta charset=utf-8>' + html, { headers: { 'content-type': 'text/html;charset=utf-8' } }); });
      const read = kind => runOfficialDOM(win.webContents, officialData, ['read-interactions', { kind }], 'qa-readonly-interactions', { operationTimeoutMs: 5000 });
      for (const kind of ['comments', 'messages', 'followers']) {
        const attr = kind === 'messages' ? 'data-conversation-id' : kind === 'comments' ? 'data-comment-id' : 'data-follower-id';
        const content = kind === 'messages' ? 'last-message' : 'comment-content';
        const body = `<div ${attr}=qa-id data-unread-count=3><b class=nickname>QA闭合组件昵称</b><p class=${content}>QA真实DOM样本</p></div>`;
        html = `<div id=host></div><script>window.activations=0;for(const name of ['click','focusin','scroll'])document.addEventListener(name,()=>window.activations++);const root=document.querySelector('#host').attachShadow({mode:'closed'});root.innerHTML=${JSON.stringify(body)};window.qaRoot=root;</script>`;
        await win.loadURL('https://channels.weixin.qq.com/platform/qa-only-list'); const before = requests;
        let result; for (let i = 0; i < 3; i++) result = await read(kind);
        eq(result.records.length, 1); eq(result.records[0].author, 'QA闭合组件昵称'); eq(result.records[0].platformId, 'qa-id'); eq(result.partial, true);
        if (kind === 'messages') { eq(result.records[0].unreadState, 'unread'); eq(result.records[0].unreadCount, 3); }
        eq(requests, before); eq(await win.webContents.executeJavaScript('window.activations'), 0); eq(await win.webContents.executeJavaScript('window.qaRoot.querySelector("[data-unread-count]").getAttribute("data-unread-count")'), '3');
      }
      for (const [kind, heading, empty] of [['comments', '评论列表', '暂无评论'], ['messages', '私信列表', '暂无私信'], ['followers', '粉丝列表', '暂无粉丝']]) {
        html = `<h1>${heading}</h1><div class=empty-list>${empty}</div>`; await win.loadURL('https://channels.weixin.qq.com/platform/qa-only-list'); eq((await read(kind)).records, []);
        html = `<div data-conversation-id=user-content><span class=nickname>QA用户</span><p class=last-message>${empty}</p></div>`; await win.loadURL('https://channels.weixin.qq.com/platform/qa-only-list');
        if (kind === 'messages') eq((await read(kind)).records.length, 1); else { await assert.rejects(read(kind), /没有识别到/); checks++; }
      }
      for (const [body, expected] of [['<div aria-busy=true>加载中</div>', /仍在加载/], ['<div role=alert>没有权限查看列表</div>', /访问权限/], ['<input type=password>', /要求登录/], ['<p>空白不是没有数据</p>', /没有识别到/]]) {
        html = body; await win.loadURL('https://channels.weixin.qq.com/platform/qa-only-list'); await assert.rejects(read('messages'), expected); checks++;
      }
      console.log(JSON.stringify({ actualChromiumInteractionReadChecks: checks, authorClosedRootsReadable: true, noClickOrFocusOrScroll: true, noNetworkDuringRead: true, unreadFixtureUnchanged: true, emptyAndLoginAndLoadingDistinguished: true, realPlatformRequests: 0 }));
    } catch (error) { console.error(error); process.exitCode = 1; }
    finally { win?.destroy(); app.exit(process.exitCode || 0); }
  });
}
