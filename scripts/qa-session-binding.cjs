const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const { classifySession, isLoginPage } = require('../desktop/platform-session.cjs');
const fixture = new Module('binding-test');
fixture._compile(ts.transpileModule(fs.readFileSync(require.resolve('../client/src/components/workspace/auto-binding.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, 'binding-test.cjs');
const { createAutoBinding } = fixture.exports;
let checks = 0;
const cookie = name => ({ name, value: 'fixture-only' });
const profile = { nickname: 'QA creator' };
for (const name of ['web_session', 'access-token-creator.xiaohongshu.com']) {
  assert.equal(classifySession('xiaohongshu', [cookie(name)], profile, 'https://creator.xiaohongshu.com/home').authenticated, true); checks++;
}
for (const name of ['a1', 'webId', 'customerClientId', 'x-user-id-creator.xiaohongshu.com', 'galaxy_creator_session_id']) {
  assert.equal(classifySession('xiaohongshu', [cookie(name)], profile, 'https://creator.xiaohongshu.com/home').authenticated, false); checks++;
}
for (const url of ['https://creator.xiaohongshu.com/login', 'https://creator.xiaohongshu.com/#/login', 'https://channels.weixin.qq.com/login.html', 'https://passport.bilibili.com/login']) { assert.equal(isLoginPage(url), true); checks++; }
assert.equal(isLoginPage('https://creator.xiaohongshu.com/home?redirect=/login'), false); checks++;
assert.equal(classifySession('xiaohongshu', [cookie('access-token-creator.xiaohongshu.com')], profile, 'https://creator.xiaohongshu.com/login').authenticated, false); checks++;
assert.equal(classifySession('xiaohongshu', [cookie('web_session')], { ...profile, loginVisible: true }, 'https://creator.xiaohongshu.com/home').authenticated, false); checks++;
for (const patch of [{ value: '' }, { expirationDate: 1 }]) { assert.equal(classifySession('xiaohongshu', [{ ...cookie('web_session'), ...patch }], profile, 'https://creator.xiaohongshu.com/home').authenticated, false); checks++; }
(async () => {
  let loggedIn = false, saves = 0, bound = 0, error = '', current = true, failSave = false, release;
  let gate = null;
  const login = { platform: 'xiaohongshu', sessionId: 'fixture-session-0001', nickname: 'QA creator', pageUrl: 'https://creator.xiaohongshu.com/home' };
  const options = { detect: async () => { if (gate) await gate; return loggedIn ? login : { error: '尚未检测到登录' }; }, persist: async () => { saves++; if (failSave) throw Error('保存失败'); return { id: 'qa-account' }; }, isCurrent: () => current, detected: () => {}, saved: () => bound++, failed: e => { error = e; }, saving: () => {} };
  let runner = createAutoBinding(options);
  await runner.run(); assert.equal(saves, 0); assert.equal(error, ''); checks++;
  await runner.run(false); assert.equal(error, '尚未检测到登录'); checks++;
  loggedIn = true; gate = new Promise(resolve => { release = resolve; });
  const pending = runner.run(); await runner.run(false); await runner.run(); release(); await pending; gate = null;
  assert.equal(saves, 1); assert.equal(bound, 1); checks++;
  await runner.run(); await runner.run(false); assert.equal(saves, 1); checks++;
  runner = createAutoBinding(options); failSave = true; await runner.run(); const failedCount = saves;
  await runner.run(); assert.equal(saves, failedCount); assert.equal(error, '保存失败'); checks++;
  failSave = false; await runner.run(false); assert.equal(saves, failedCount + 1); assert.equal(bound, 2); checks++;
  runner = createAutoBinding(options); current = false; await runner.run(); assert.equal(saves, failedCount + 1); checks++;
  current = true; gate = new Promise(resolve => { release = resolve; }); const changing = runner.run(); current = false; release(); await changing; gate = null; assert.equal(saves, failedCount + 1); checks++;
  current = true; runner = createAutoBinding(options); runner.dispose(); await runner.run(); assert.equal(saves, failedCount + 1); checks++;
  let waiting = '', profileReady = false;
  const profileRunner = createAutoBinding({ ...options, waiting: message => { waiting = message; }, detect: async () => profileReady ? login : { error: '正在读取昵称', pendingProfile: true } });
  const beforeProfile = saves;
  await profileRunner.run(); assert.equal(saves, beforeProfile); assert.equal(waiting, '正在读取昵称'); checks++;
  profileReady = true; await profileRunner.run(); assert.equal(saves, beforeProfile + 1); assert.equal(waiting, ''); checks++;
  const emptyName = createAutoBinding({ ...options, detect: async () => ({ ...login, nickname: '  ' }) });
  await emptyName.run(); assert.equal(saves, beforeProfile + 1); checks++;
  console.log(JSON.stringify({ sessionAndAutoBindingChecks: checks, realAccountsModified: false }));
})().catch(error => { console.error(error); process.exitCode = 1; });
