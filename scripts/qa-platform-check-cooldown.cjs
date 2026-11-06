const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPlatformCheckCooldown } = require('../desktop/platform-check-cooldown.cjs');
const { registerScopedRequestPolicy, registerScopedRequestObserver } = require('../desktop/douyin-scoped-request-policy.cjs');
const { loadTs } = require('./qa-load-typescript.cjs');
const { registerAccountHealth } = require('../desktop/account-health.cjs');

(async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'yuanxiao-cooldown-'));
  const file = path.join(folder, 'cooldown.json');
  let clock = 1000;
  const create = () => createPlatformCheckCooldown({ file, now: () => clock });
  const cooldown = create();
  const event = { url: 'https://creator.douyin.com/passport/login/', statusCode: 429, resourceType: 'xhr' };
  for (const patch of [{ statusCode: 403 }, { url: 'https://unrelated.invalid/api/login' }, { url: 'https://creator.douyin.com/logo.png', resourceType: 'image' }]) {
    cooldown.observe('douyin', { ...event, ...patch });
    assert.equal(cooldown.get('douyin'), undefined);
  }
  cooldown.observe('douyin', event);
  const limited = cooldown.get('douyin');
  assert.equal(limited.retryAt, 3601000);
  assert.equal(cooldown.get('bilibili'), undefined);
  assert.deepEqual(create().get('douyin'), limited);
  clock += 5000;
  cooldown.observe('douyin', event);
  assert.equal(cooldown.get('douyin').retryAt, limited.retryAt);
  cooldown.observe('douyin', { ...event, responseHeaders: { 'Retry-After': ['7200'] } });
  assert.equal(cooldown.get('douyin').retryAt, clock + 7200000);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8'))), ['douyin']);

  const handlers = {};
  const source = { webRequest: Object.fromEntries(['onBeforeRequest', 'onCompleted', 'onErrorOccurred'].map(name => [name, callback => { handlers[name] = callback; }])) };
  let observed = 0;
  const stopObserver = registerScopedRequestObserver(source, () => observed++);
  const stopPage = registerScopedRequestPolicy(source, 1, { blocks: () => true });
  let decision;
  handlers.onBeforeRequest({ webContentsId: 1 }, value => { decision = value; });
  assert.equal(decision.cancel, true);
  stopPage();
  handlers.onCompleted(event);
  assert.equal(observed, 1);
  stopObserver();
  assert.equal(handlers.onCompleted, null);
  const nextStop = registerScopedRequestObserver(source, () => observed++);
  stopObserver();
  handlers.onCompleted(event);
  assert.equal(observed, 2);
  nextStop();

  const ipc = {};
  let opened = 0;
  registerAccountHealth({
    ipcMain: { handle: (name, handler) => { ipc[name] = handler; } },
    getWindow: () => ({ webContents: { id: 7 } }),
    authenticate: async () => ({ userId: 'fixture', account: { id: 'fixture-account', platform: 'douyin', connectorSessionId: 'fixture-session-0001' } }),
    platforms: { douyin: {} }, platformCheckCooldown: cooldown,
    createWindow: () => { opened++; throw Error('A limited account must not open a page'); },
  });
  for (const purpose of [undefined, 'publish-identity']) {
    const result = await ipc['matrix:inspect-account-health']({ sender: { id: 7 } }, { accountId: 'fixture-account', purpose });
    assert.equal(result.state, 'unknown');
    assert.equal(result.rateLimited, true);
    assert.equal(result.retryAt, cooldown.get('douyin').retryAt);
  }
  assert.equal(opened, 0);

  const { createAutoBinding } = loadTs('client/src/components/workspace/auto-binding.ts');
  let detected = 0;
  const runner = createAutoBinding({
    now: () => clock, confirmationMilliseconds: 0,
    isCurrent: () => true,
    detect: async () => { detected++; return { ...cooldown.get('douyin'), error: '限流暂停' }; },
    persist: async () => { throw Error('No binding while limited'); },
    detected() {}, saved() {}, failed() {}, saving() {},
  });
  await runner.run();
  for (let i = 0; i < 50; i++) { clock += 1000; await runner.run(); await runner.run(false); }
  assert.equal(detected, 1);
  runner.dispose();
  clock = cooldown.get('douyin').retryAt;
  assert.equal(create().get('douyin'), undefined);
  console.log(JSON.stringify({ passed: true, persistedCooldown: true, retryAfterRespected: true, duplicate429DoesNotExtend: true, limitedPageLoads: opened, bindingDetectionsDuringCooldown: detected, realPlatformRequests: 0, fixture: folder }));
})().catch(error => { console.error(error); process.exitCode = 1; });
