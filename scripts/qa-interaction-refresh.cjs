// Inert account/page fixtures only. No browser, server, profile or platform IO.
const assert = require('node:assert/strict');
const { loadTs } = require('./qa-load-typescript.cjs');
const { createInteractionRefresh } = loadTs('client/src/components/workspace/interaction-refresh.ts');
const { createInteractionOwnerVerifier } = require('../desktop/interaction-owner.cjs');
let checks = 0;
const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const a = { id: 'qa-a', platform: 'douyin', connectorSessionId: 'qa-session-a' };
const b = { id: 'qa-b', platform: 'bilibili', connectorSessionId: 'qa-session-b' };
const data = (account = a, kind = 'messages') => ({ accountId: account.id, sessionId: account.connectorSessionId, platform: account.platform, kind, records: [{ platformId: 'qa-record', author: 'QA', content: 'preview', unreadState: 'unread', unreadCount: 3 }], source: 'https://www.douyin.com/qa-fixture', capturedAt: '2026-10-19T10:00:00.000Z' });
function fixture(patch = {}) {
  let now = 100000, current = true, paused = false, accounts = [a], page = {}, calls = 0;
  const results = [], states = [];
  let read = async (_page, account) => { calls++; return data(account); };
  const deps = { kind: 'messages', current: () => current, paused: () => paused, accounts: () => accounts, page: () => page, now: () => now,
    read: (...args) => read(...args), result: (account, value) => results.push({ account, value }), status: (account, value) => states.push({ account, value }), ...patch };
  return { runner: createInteractionRefresh(deps), results, states, get calls() { return calls; }, set read(value) { read = value; }, set now(value) { now = value; }, set current(value) { current = value; }, set paused(value) { paused = value; }, set accounts(value) { accounts = value; }, set page(value) { page = value; } };
}
(async () => {
  let f = fixture(); await f.runner.tick(); eq(f.calls, 1); eq(f.results[0].value.records[0].unreadCount, 3); eq(f.states.at(-1).value.phase, 'live');
  await f.runner.tick(); eq(f.calls, 1); f.now = 110000; await f.runner.tick(); eq(f.calls, 2);
  f.paused = true; await f.runner.tick(true); eq(f.calls, 2); f.paused = false; await f.runner.tick(true); eq(f.calls, 3);
  f = fixture(); f.page = undefined; await f.runner.tick(); eq(f.calls, 0); eq(f.results.length, 0); eq(f.states.at(-1).value.phase, 'waiting');
  f.page = {}; f.now = 102000; await f.runner.tick(); eq(f.calls, 1);
  f = fixture(); await f.runner.tick(); f.read = async () => ({ error: '官方要求登录' }); await f.runner.tick(true); eq(f.results.length, 1); eq(f.states.at(-1).value.phase, 'error'); eq(f.states.at(-1).value.message, '官方要求登录'); eq(f.states.at(-1).value.nextAt, 115000);
  f.now = 115000; await f.runner.tick(); eq(f.states.at(-1).value.nextAt, 145000); f.now = 145000; await f.runner.tick(); eq(f.states.at(-1).value.nextAt, 205000);
  f.now = 205000; await f.runner.tick(); eq(f.states.at(-1).value.nextAt, 325000);
  for (const patch of [{ accountId: b.id }, { sessionId: b.connectorSessionId }, { platform: 'wechat' }, { kind: 'comments' }, { records: undefined }, { source: undefined }, { capturedAt: undefined }]) {
    f = fixture(); f.read = async () => ({ ...data(), ...patch }); await f.runner.tick(); eq(f.results.length, 0); eq(f.states.at(-1).value.phase, 'error');
  }
  let release; f = fixture(); f.read = () => new Promise(resolve => release = resolve); const first = f.runner.tick(); await new Promise(resolve => setImmediate(resolve)); await f.runner.tick(true); eq(f.runner.running, true);
  f.runner.invalidate(); release(data()); await first; eq(f.results.length, 0); eq(f.runner.running, false);
  f = fixture({ timeoutMs: 5 }); f.read = () => new Promise(resolve => release = resolve); await f.runner.tick(); eq(f.states.at(-1).value.phase, 'error'); release(data()); await new Promise(resolve => setImmediate(resolve)); eq(f.results.length, 0);
  for (const change of [x => x.current = false, x => x.accounts = [b], x => x.accounts = [{ ...a, connectorSessionId: 'qa-rebound' }], x => x.runner.dispose()]) {
    f = fixture(); f.read = () => new Promise(resolve => release = resolve); const work = f.runner.tick(); await new Promise(resolve => setImmediate(resolve)); change(f); release(data()); await work; eq(f.results.length, 0);
  }
  let active = 0, peak = 0, releases = [];
  f = fixture(); f.accounts = [a, b, { ...a, id: 'qa-c' }]; f.read = (_page, account) => { active++; peak = Math.max(peak, active); return new Promise(resolve => releases.push(() => { active--; resolve(data(account)); })); };
  const multi = f.runner.tick(); await new Promise(resolve => setImmediate(resolve)); eq(releases.length, 2); releases.shift()(); await new Promise(resolve => setImmediate(resolve)); eq(releases.length, 2); releases.splice(0).forEach(resolve => resolve()); await multi; eq(peak, 2); eq(f.results.length, 3);
  f = fixture(); f.accounts = [a, b]; f.read = async (_page, account) => account.id === a.id ? { error: 'A不可用' } : data(account); await f.runner.tick(); eq(f.results.length, 1); eq(f.results[0].account.id, b.id);
  // Main-process stable-ID proof: no matching by mutable display name.
  let now = 0, healthCalls = 0;
  const input = { accountId: a.id, platform: a.platform, sessionId: a.connectorSessionId, accessToken: 'qa-only' };
  const ctx = { auth: { userId: 'qa-owner', account: { ...a, nativeAccountKey: 'douyin:qa-native-id' } } };
  let health = async () => { healthCalls++; return { state: 'normal', accountId: a.id, sessionId: a.connectorSessionId, nativeAccountKey: 'douyin:qa-native-id' }; };
  const verify = createInteractionOwnerVerifier({ now: () => now, inspectAccountHealth: (...args) => health(...args) });
  eq(await verify({}, input, ctx), ctx); eq(healthCalls, 1); await verify({}, input, ctx); eq(healthCalls, 1); now = 45000; await verify({}, input, ctx); eq(healthCalls, 2);
  now = 90000; health = async () => ({ state: 'normal', accountId: a.id, sessionId: a.connectorSessionId, nativeAccountKey: 'douyin:other' });
  await assert.rejects(verify({}, input, ctx)); checks++;
  await assert.rejects(verify({}, input, { ...ctx, observedNativeAccountKey: 'douyin:other' })); checks++;
  for (const account of [{ ...ctx.auth.account, nativeAccountKey: undefined }, { ...ctx.auth.account, id: b.id }, { ...ctx.auth.account, connectorSessionId: 'other' }, { ...ctx.auth.account, platform: 'bilibili' }]) { await assert.rejects(verify({}, input, { auth: { ...ctx.auth, account } })); checks++; }
  eq(await verify({}, input, { ...ctx, observedNativeAccountKey: ctx.auth.account.nativeAccountKey }), { ...ctx, observedNativeAccountKey: ctx.auth.account.nativeAccountKey });
  console.log(JSON.stringify({ interactionRefreshAndOwnerChecks: checks, automaticReadOnlyCadence: true, failedReadPreservesSnapshot: true, twoAccountWorkers: true, foreignOwnerOrSessionIgnored: true, readTimeoutBounded: true, stableIdRequired: true, platformRequests: 0, realProfileTouched: false }));
})().catch(error => { console.error(error); process.exitCode = 1; });
