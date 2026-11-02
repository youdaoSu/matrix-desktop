// Fresh disposable Chromium storage only. Synthetic documents do not load the
// client, start a database, connect platform accounts, or touch installed data.
const path = require('node:path'), fs = require('node:fs'), os = require('node:os');
const assert = require('node:assert/strict'), http = require('node:http');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process');
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(path.resolve(__dirname, '../.desktop-deps/node_modules/electron/dist/electron.exe'), [__filename], { windowsHide: true, encoding: 'utf8', timeout: 30000, env });
  process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
  if (result.error) console.error(result.error.message);
  process.exitCode = result.error || result.status !== 0 ? 1 : 0;
} else {
  const { app, BrowserWindow, session } = require('electron');
  const { localClientOrigin, prepareClientOrigin, migrateClientStorage } = require('../desktop/client-storage-origin.cjs');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-origin-qa-'));
  app.setPath('userData', profile); app.disableHardwareAcceleration();
  let win, server, checks = 0, hits = 0, passed = false;
  app.whenReady().then(async () => {
    for (const port of [0, 3209, 3240, NaN, 3210.5, 'https://example.org']) { assert.throws(() => localClientOrigin(port)); checks++; }
    const ports = [];
    for (let candidate = 3210; candidate < 3240 && ports.length < 3; candidate++) {
      const probe = require('node:net').createServer();
      if (await new Promise(resolve => { probe.once('error', () => resolve(false)); probe.listen(candidate, '127.0.0.1', () => probe.close(() => resolve(true))); })) ports.push(candidate);
    }
    assert.equal(ports.length, 3);
    const [oldPort, newPort, thirdPort] = ports;
    let state = prepareClientOrigin(profile, oldPort, newPort);
    assert.equal(state.origin, localClientOrigin(oldPort)); checks++;
    assert.equal(prepareClientOrigin(profile, newPort, thirdPort).origin, state.origin); checks++;
    const options = { show: false, webPreferences: { nodeIntegration: false, sandbox: true, contextIsolation: true } };
    win = new BrowserWindow(options); const protocol = session.defaultSession.protocol;
    async function seed(origin, entries, sessionValue) {
      protocol.handle('http', () => new Response('<!doctype html><title>QA inert</title>', { headers: { 'Content-Type': 'text/html' } }));
      try { await win.loadURL(origin + '/qa-seed'); await win.webContents.executeJavaScript(`((entries) => { localStorage.clear(); for (const [key,value] of entries) localStorage.setItem(key,value); sessionStorage.setItem('matrix_token',${JSON.stringify(sessionValue || '')}); })(${JSON.stringify(entries)})`); }
      finally { protocol.unhandle('http'); }
    }
    const snapshot = [
      ['matrix_token', 'QA-disposable-remembered-login'], ['matrix_user', '{"id":"qa-owner-a"}'],
      ['matrix-local-publish-drafts:qa-owner-a', '[{"id":"qa-draft-a","updatedAt":"2026-10-19","title":"中文草稿"}]'],
      ['matrix-publish-progress:qa-owner-b', '[{"id":"qa-task-b","stage":"unknown"}]'],
      ['matrix-theme:qa-owner-a', 'dark'], ['matrix-future-version', 'preserved'],
    ];
    await seed(localClientOrigin(oldPort), [...snapshot, ['foreign-app-key', 'not-Matrix']], 'QA-session-only-login');
    await seed(localClientOrigin(newPort), [['matrix_token', 'QA-obsolete-other-owner'], ['matrix-local-publish-drafts:old', 'stale'], ['unrelated-key', 'keep']]);
    // A real listener on the OLD port must receive ZERO requests, even while
    // its origin is used to read this same disposable browser profile's storage.
    server = http.createServer((_request, response) => { hits++; response.end('FOREIGN PAGE MUST NOT LOAD'); });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(oldPort, '127.0.0.1', resolve); });
    await migrateClientStorage(win, state, localClientOrigin(newPort) + '/app/');
    const stored = await win.webContents.executeJavaScript('Object.fromEntries(Object.entries(localStorage))');
    for (const [key, value] of snapshot) { assert.equal(stored[key], value); checks++; }
    assert.equal(stored['foreign-app-key'], undefined); assert.equal(stored['unrelated-key'], 'keep'); assert.equal(stored['matrix-local-publish-drafts:old'], undefined); assert.equal(hits, 0); checks += 4;
    assert.equal(await win.webContents.executeJavaScript('sessionStorage.getItem("matrix_token")'), ''); checks++;
    assert.equal(prepareClientOrigin(profile, oldPort, thirdPort).origin, localClientOrigin(newPort)); checks++;
    assert.deepEqual(await migrateClientStorage(win, state, localClientOrigin(newPort) + '/app/'), { migrated: false }); checks++;
    // Returning to an older origin must not resurrect explicitly cleared auth,
    // drafts or tasks. Non-remembered sessions are never promoted to localStorage.
    await seed(localClientOrigin(newPort), [['matrix-theme', 'light'], ['matrix-new-state', 'latest']], 'QA-not-remembered');
    await migrateClientStorage(win, state, localClientOrigin(oldPort) + '/app/');
    const returned = await win.webContents.executeJavaScript('Object.fromEntries(Object.entries(localStorage))');
    assert.equal(returned.matrix_token, undefined); assert.equal(returned.matrix_user, undefined); assert.equal(returned['matrix-local-publish-drafts:qa-owner-a'], undefined); assert.equal(returned['matrix-publish-progress:qa-owner-b'], undefined); assert.equal(returned['matrix-new-state'], 'latest'); assert.equal(returned['foreign-app-key'], 'not-Matrix'); assert.equal(hits, 0); checks += 7;
    assert.equal(fs.readFileSync(state.file, 'utf8').includes('QA-'), false); checks++;
    assert.equal(await session.defaultSession.protocol.isProtocolHandled('http'), false); checks++;
    for (const url of ['http://localhost:3211/app/', 'https://127.0.0.1:3211/app/', 'http://127.0.0.1:3211/app/?token=x']) { await assert.rejects(() => migrateClientStorage(win, state, url)); checks++; }
    // A failed write retains the authoritative source marker and never lets
    // startup silently continue with a partly imported empty target.
    const priorOrigin = state.origin;
    const failingWindow = { webContents: { session: win.webContents.session, isDestroyed: () => false, getURL: () => '', stop: () => {} }, loadURL: async () => { throw Error('QA must not leak credentials'); } };
    await assert.rejects(() => migrateClientStorage(failingWindow, state, localClientOrigin(thirdPort) + '/app/'), error => /原始数据已保留/.test(error.message) && !error.message.includes('credentials')); checks++;
    assert.equal(state.origin, priorOrigin); assert.equal(prepareClientOrigin(profile, thirdPort, oldPort).origin, priorOrigin); checks += 2;
    let stopped = 0;
    const stalledWindow = { webContents: { ...failingWindow.webContents, stop: () => stopped++ }, loadURL: () => new Promise(() => {}) };
    await assert.rejects(() => migrateClientStorage(stalledWindow, state, localClientOrigin(thirdPort) + '/app/', { timeoutMs: 30 }), /原始数据已保留/);
    assert.equal(stopped, 1); assert.equal(state.origin, priorOrigin); checks += 3;
    await seed(localClientOrigin(thirdPort), [['matrix-rollback-sentinel', 'keep-on-failure'], ['unrelated-key', 'unchanged']]);
    const failingCopy = { loadURL: url => win.loadURL(url), webContents: { session: win.webContents.session, isDestroyed: () => win.webContents.isDestroyed(), getURL: () => win.webContents.getURL(), stop: () => win.webContents.stop(), executeJavaScript: async code => {
      if (code.includes('const replace = values')) await win.webContents.executeJavaScript(`(() => { const actual = Storage.prototype.setItem; let rejected = false; Storage.prototype.setItem = function(key,value) { if (!rejected && key === 'matrix-theme') { rejected = true; throw new DOMException('QA quota failure', 'QuotaExceededError'); } return actual.call(this,key,value); }; })()`);
      return win.webContents.executeJavaScript(code);
    } } };
    await assert.rejects(() => migrateClientStorage(failingCopy, state, localClientOrigin(thirdPort) + '/app/'), /原始数据已保留/);
    const rolledBack = await win.webContents.executeJavaScript('Object.fromEntries(Object.entries(localStorage))');
    assert.deepEqual(rolledBack, { 'matrix-rollback-sentinel': 'keep-on-failure', 'unrelated-key': 'unchanged' });
    assert.equal(state.origin, priorOrigin); assert.equal(prepareClientOrigin(profile, thirdPort, oldPort).origin, priorOrigin); checks += 4;
    await migrateClientStorage(win, state, localClientOrigin(thirdPort) + '/app/');
    assert.equal(await win.webContents.executeJavaScript('localStorage.getItem("matrix-new-state")'), 'latest'); checks++;
    protocol.handle('http', () => new Response('QA existing handler'));
    await assert.rejects(() => migrateClientStorage(win, state, localClientOrigin(newPort) + '/app/'), /原始数据已保留/);
    assert.equal(await protocol.isProtocolHandled('http'), true); protocol.unhandle('http'); checks += 2;
    const invalidProfile = path.join(profile, 'invalid'); fs.mkdirSync(invalidProfile);
    for (const saved of ['not JSON QA-secret', JSON.stringify({version:2,origin:localClientOrigin(oldPort)}), JSON.stringify({version:1,origin:'https://example.org'})]) {
      fs.writeFileSync(path.join(invalidProfile,'client-storage-origin.json'),saved);
      assert.throws(()=>prepareClientOrigin(invalidProfile,oldPort,newPort),error=>/配置异常/.test(error.message)&&!error.message.includes('QA-secret')); checks++;
    }
    console.log(JSON.stringify({ clientStorageOriginChecks: checks, realChromiumStorage: true, oldOriginNetworkRequests: hits, ownerScopedDraftsAndTasksPreserved: true, deletionAndLogoutNotResurrected: true, sessionOnlyAuthNotRemembered: true, secretsNotPersistedByMain: true, realUserDataTouched: false, officialActions: false }));
    passed = true;
  }).catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    if (win && !win.isDestroyed()) win.destroy();
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    app.quit();
  });
  app.on('will-quit', () => { if (!passed) console.error('Disposable storage fixture retained: ' + profile); });
}
