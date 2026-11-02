// Fresh silent/offline Electron profile, production submit/observer code. No
// installed app, backend, actual platform account, upload or real post is used.
const path = require('node:path'), fs = require('node:fs'), os = require('node:os');
const root = path.resolve(__dirname, '..');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
if (!process.versions.electron) {
  const {spawnSync} = require('node:child_process');
  const cached = path.join(root, '.desktop-deps/node_modules/electron/dist/electron.exe');
  const result = spawnSync(fs.existsSync(cached) ? cached : require('electron'), [__filename], {cwd: root, windowsHide: true, encoding: 'utf8', timeout: 60000});
  process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
  if (result.error) console.error(result.error.message); process.exitCode = result.status ?? 1;
} else {
  const {app, BrowserWindow, session} = require('electron'), assert = require('node:assert/strict'), {randomUUID} = require('node:crypto');
  const {registerPageActions, createJournal} = require('../desktop/page-actions.cjs');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-delayed-result-qa-'));
  app.setPath('userData', profile); app.disableHardwareAcceleration(); app.commandLine.appendSwitch('mute-audio');
  app.whenReady().then(async () => {
    let owner, browser; const guard = setTimeout(() => {console.error('Delayed offline observation fixture exceeded 50s'); app.exit(1);}, 50000);
    try {
      owner = new BrowserWindow({show: false});
      const sessionId = randomUUID(), isolated = session.fromPartition('persist:matrix-douyin-' + sessionId);
      const html = '<meta charset=utf-8><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'"><form><input placeholder="标题" value="QA delayed synthetic result"><textarea placeholder="简介">QA inert local fixture</textarea><button type=button id=publish>发布</button></form><div role=status id=result></div><script>window.fixtureClicks=0;publish.onclick=()=>{window.fixtureClicks++;setTimeout(()=>result.textContent="发布成功",25000)};</script>';
      let externalRequests = 0;
      await isolated.protocol.handle('https', request => {const url = new URL(request.url); if (url.hostname !== 'creator.douyin.com') {externalRequests++; return new Response('', {status: 403});} return new Response(html, {headers: {'content-type':'text/html; charset=utf-8'}});});
      isolated.webRequest.onBeforeRequest((request, callback) => {const allowed = request.url.startsWith('https://creator.douyin.com/'); if (!allowed) externalRequests++; callback({cancel: !allowed});});
      browser = new BrowserWindow({show: false, width: 1000, height: 700, webPreferences: {session: isolated, sandbox: true, contextIsolation: true}}); browser.webContents.setAudioMuted(true);
      await browser.loadURL('https://creator.douyin.com/creator-micro/content/post/video');
      const real = browser.webContents, guest = {id: real.id, hostWebContents: owner.webContents, session: isolated, debugger: real.debugger, isDestroyed: () => real.isDestroyed(), getURL: () => real.getURL()};
      const handlers = {}, journal = createJournal(path.join(profile, 'qa-observations'));
      registerPageActions({ipcMain: {handle: (name, handler) => handlers[name] = handler}, dialog: {showMessageBox: async () => ({response: 1})}, webContents: {fromId: id => id === guest.id ? guest : null}, session: {fromPartition: name => {assert.equal(name, 'persist:matrix-douyin-' + sessionId); return isolated;}}, getWindow: () => owner, platforms: {douyin: {domain: 'douyin.com', label: 'QA inert fixture'}}, inspectPlatformSession: async () => ({authenticated: true, profile: {nickname:'QA fixture owner', ownIdentity:{key:'qa-fixed-own-id'}}}), authenticate: async () => ({userId:'qa-disposable-owner',account:{platform:'douyin',connectorSessionId:sessionId,nickname:'QA fixture owner',nativeAccountKey:'qa-fixed-own-id'}}), journal});
      const event = {sender: owner.webContents}, input = {platform:'douyin',accountId:randomUUID(),sessionId,webContentsId:guest.id,accessToken:'qa-inert-token',kind:'publish',taskId:randomUUID(),attemptId:randomUUID(),expectedTitle:'QA delayed synthetic result'};
      const plan = await handlers['matrix:inspect-page-action'](event, input); assert.ok(plan.nonce, plan.error);
      console.log(JSON.stringify({delayedOfflineObservation:'started',expectedNoticeAfterMs:25000,realPlatformActions:false}));
      const submitted = await handlers['matrix:submit-page-action'](event, {...input,nonce:plan.nonce,index:0});
      assert.equal(submitted.receipt?.status, 'confirmed', submitted.error); assert.equal(submitted.receipt.resultSource,'official_success_notice'); assert.equal(submitted.receipt.clicked,true);
      assert.ok(submitted.receipt.outcomeObservation.elapsedMs >= 24000); assert.ok(submitted.receipt.outcomeObservation.elapsedMs < 45000); assert.ok(submitted.receipt.outcomeObservation.checks >= 15);
      assert.equal(await real.executeJavaScript('window.fixtureClicks'),1); assert.equal(externalRequests,0); assert.equal(journal.list('qa-disposable-owner').length,1);
      console.log(JSON.stringify({delayedOfflineResultChecks:10,actualMainSubmitAndChromiumObserver:true,noticeObservedAfterFormer20sCutoff:true,elapsedMs:submitted.receipt.outcomeObservation.elapsedMs,polls:submitted.receipt.outcomeObservation.checks,fixtureClicks:1,externalRequests,actualPlatformPosts:false,userDataUntouched:true}));
    } catch (error) {console.error(error); process.exitCode = 1;}
    finally {clearTimeout(guard);browser?.destroy();owner?.destroy();app.exit(process.exitCode || 0);}
  });
}
