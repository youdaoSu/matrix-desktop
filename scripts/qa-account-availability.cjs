const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), Module = require('node:module');
let owner = 'owner-a'; const storage = new Map(), subscriptions = new Set(); let notifications = 0;
global.localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) };
global.window = { addEventListener() {} };
function compile(file, dependencies = {}) {
  const fixture = new Module(file);
  fixture.require = name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name);
  fixture._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file + '.fixture.cjs');
  return fixture.exports;
}
const policy = compile('shared/account-availability.ts');
const states = compile('client/src/components/workspace/account-observations.ts', { '@shared/account-availability':policy, '@/api': { getUser: () => ({ id: owner }) }, react: { useSyncExternalStore: (subscribe, get) => { if (!subscriptions.size) subscriptions.add(subscribe(() => notifications++)); return get(); } } });
let checks = 0;
const healthy = { authStatus: 'authorized', healthStatus: 'normal' }, first = { id: 'account-a', connectorSessionId: 'session-a', platform: 'douyin', nickname: 'Fixture owner' }, second = { ...first, id: 'account-b', connectorSessionId: 'session-b' };
const appearance = (account, state) => policy.accountAppearance(account, state, Date.now());
assert.equal(appearance(healthy).icon, 'check'); checks++;
for (const patch of [{ authStatus: 'pending' }, { authStatus: 'expired' }, { authStatus: 'error' }, { healthStatus: 'warning' }, { healthStatus: 'error' }, { authExpiresAt: new Date(Date.now() - 1000).toISOString() }]) {
  const result = appearance({ ...healthy, ...patch }); assert.equal(result.icon, 'error'); assert.equal(result.grayscale, true); checks += 2;
}
for (const account of [{ authStatus: 'authorized' }, { ...healthy, authExpiresAt: 'invalid-date' }]) { assert.equal(appearance(account).icon, 'unknown'); checks++; }
const observation = state => ({ state, reason: 'fixture only', checkedAt: Date.now() });
for (const state of ['offline', 'abnormal', 'banned']) { const result = appearance(healthy, observation(state)); assert.equal(result.icon, 'error'); assert.equal(result.grayscale, true); checks += 2; }
assert.equal(appearance(healthy, observation('banned')).label, '已封禁'); checks++;
assert.equal(appearance(healthy, observation('unknown')).icon, 'unknown'); checks++;
assert.equal(appearance({ ...healthy, healthStatus: 'error' }, observation('normal')).icon, 'error'); checks++;
assert.equal(appearance(healthy, { ...observation('normal'), checkedAt: Date.now() - 86400001 }).state, 'unknown'); checks++;
for (const [platform, url] of [['wechat', 'https://channels.weixin.qq.com/login.html'], ['bilibili', 'https://passport.bilibili.com/login'], ['xiaohongshu', 'https://creator.xiaohongshu.com/#/login'], ['douyin', 'https://creator.douyin.com/login']]) { assert.equal(policy.officialLoginUrl(platform, url), true); checks++; }
for (const url of ['https://creator.douyin.com/home?return=/login', 'https://attacker.example/login', 'http://creator.douyin.com/login', 'https://user:password@creator.douyin.com/login']) { assert.equal(policy.officialLoginUrl('douyin', url), false); checks++; }
assert.equal(states.useAccountObservation(first), undefined); checks++;
states.recordAccountObservation(owner, first, observation('offline'));
assert.equal(states.useAccountObservation(first).state, 'offline'); checks++;
assert.equal(states.useAccountObservation(second), undefined); checks++;
assert.ok(notifications > 0); checks++;
owner = 'owner-b'; assert.equal(states.useAccountObservation(first), undefined); checks++;
states.recordAccountObservation('owner-a', first, observation('normal')); assert.equal(states.useAccountObservation(first), undefined); checks++;
owner = 'owner-a'; assert.equal(states.useAccountObservation(first).state, 'offline'); checks++;
assert.equal(states.useAccountObservation({ ...first, connectorSessionId: 'new-session' }), undefined); checks++;
const before = states.useAccountObservation(first);
states.recordAccountObservation(owner, first, { ...observation('normal'), checkedAt: before.checkedAt - 1 });
assert.equal(states.useAccountObservation(first).state, 'offline'); checks++;
states.recordLoginObservation(owner, first, { error: 'fixture loading', pendingProfile: true }); assert.equal(states.useAccountObservation(first).state, 'offline'); checks++;
states.recordLoginObservation(owner, first, { platform: 'douyin', sessionId: 'session-a', nickname: 'Somebody else' }); assert.equal(states.useAccountObservation(first).state, 'abnormal'); checks++;
states.recordLoginObservation(owner, first, { error: 'fixture account ban', accountIssue: { kind: 'banned', message: '官方明确提示封禁' } }); assert.equal(states.useAccountObservation(first).state, 'banned'); checks++;
states.recordLoginObservation(owner, first, { platform: 'douyin', sessionId: 'session-a', nickname: first.nickname }); assert.equal(states.useAccountObservation(first).state, 'normal'); checks++;
const lastNormal=states.useAccountObservation(first);states.recordLoginObservation(owner, first, { error: 'fixture network error' }); assert.equal(states.useAccountObservation(first).state, 'normal');assert.equal(states.useAccountObservation(first).checkedAt,lastNormal.checkedAt);assert.match(states.useAccountObservation(first).transientReason,/暂时无法核验/);checks+=3;
states.recordLoginObservation(owner, first, { error: 'fixture login', loginRequired: true }); assert.equal(states.useAccountObservation(first).state, 'offline'); checks++;
assert.ok(!JSON.stringify([...storage.values()]).includes('accessToken')); checks++;
states.recordLoginObservation(owner,first,{error:'another network error'});assert.equal(states.useAccountObservation(first).state,'offline');checks++;
const reloaded = compile('client/src/components/workspace/account-observations.ts', { '@shared/account-availability':policy, '@/api': { getUser: () => ({ id: owner }) }, react: { useSyncExternalStore: (_subscribe, get) => get() } });
assert.equal(reloaded.useAccountObservation(first).state, 'offline'); checks++;
assert.ok(reloaded.useAccountObservation(first).lastAttemptAt);assert.ok(reloaded.useAccountObservation(first).transientReason);assert.equal(appearance(healthy,observation('unknown')).grayscale,false);checks+=3;
console.log(JSON.stringify({ accountAvailabilityChecks: checks, crossAccountAndOwnerIsolation: true, reauthorizationRecovery: true, statusesPersistLocally: true, realUserDataTouched: false }));
