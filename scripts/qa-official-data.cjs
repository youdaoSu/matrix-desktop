const assert = require('node:assert/strict');
const { registerOfficialData } = require('../desktop/official-data.cjs');
const fs = require('node:fs'), ts = require('typescript'), Module = require('node:module');
const m = new Module('interaction-fixture');
m._compile(ts.transpileModule(fs.readFileSync('shared/interaction-snapshot.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, 'interaction-fixture');
const { createInteractionSnapshot: snapshot, interactionStorageKey: key } = m.exports;
const date = '2026-10-12T01:00:00.000Z', source = 'https://creator.douyin.com/comments';
const rows = [{ platformId: '1', author: '同名', content: 'A' }, { platformId: '', author: '同名', content: 'B' }];
const before = snapshot(rows, source, date); before.records.forEach(row => { row.note = '本地备注'; row.handled = true; });
const after = snapshot(rows, source, date, before);
assert.equal(after.records[0].note, '本地备注'); assert.equal(after.records[1].note, '');
assert.equal(after.records[1].handled, false);
assert.notEqual(key('a', 'b:c', 'comments'), key('a:b', 'c', 'comments'));
assert.notEqual(key('u1', 'a', 'comments'), key('u2', 'a', 'comments'));
assert.notEqual(key('u1', 'a', 'comments'), key('u1', 'a', 'messages'));
assert.throws(() => key('', 'a', 'comments'));
assert.throws(() => snapshot(rows, 'file:///tmp/a', date));
assert.throws(() => snapshot(rows, source, 'invalid'));
assert.equal(snapshot([rows[0], rows[0]], source, date, before).records[0].note, '');
assert.equal(snapshot(rows, source + '/other', date, before).records[0].note, '');
assert.equal(snapshot(Array.from({ length: 200 }, () => rows[0]), source, date).records.length, 100);
console.log(JSON.stringify({ interactionSnapshotAssertions: 12 }));
const unreadRows = [
  { ...rows[0], avatarUrl: 'https://p3.douyinpic.com/qa-avatar.png', unreadState: 'unread', unreadCount: 3 },
  { ...rows[1], unreadState: 'unread', unreadCount: 99, unreadCountCapped: true },
  { ...rows[1], unreadState: 'read', unreadCount: 0 },
  { ...rows[1] },
];
const observed = snapshot(unreadRows, source, date);
assert.equal(observed.records[0].avatarUrl, unreadRows[0].avatarUrl);
assert.equal(observed.records[0].unreadCount, 3);
assert.equal(observed.records[1].unreadCountCapped, true);
assert.equal(observed.records[2].unreadState, 'read');
assert.equal(observed.records[3].unreadState, undefined);
assert.equal(observed.records[3].unreadCount, undefined);
observed.records[0].handled = true;
assert.equal(observed.records[0].unreadState, 'unread');
assert.equal(snapshot(unreadRows, source, date, observed).records[0].unreadState, 'unread');
for (const avatarUrl of ['javascript:alert(1)', 'file:///secret', 'http://example.com/a.png', 'https://user:password@example.com/a.png', 'data:image/svg+xml,<svg/>']) assert.equal(snapshot([{ ...rows[0], avatarUrl }], source, date).records[0].avatarUrl, undefined);
for (const unreadCount of [-1, 0.1, NaN, Infinity, 1000000, '3']) assert.equal(snapshot([{ ...rows[0], unreadCount }], source, date).records[0].unreadCount, undefined);
assert.equal(snapshot([{ ...rows[0], unreadState: 'unread', unreadCount: 0 }], source, date).records[0].unreadState, undefined);
assert.equal(snapshot([{ ...rows[0], unreadState: 'read', unreadCount: 3 }], source, date).records[0].unreadState, undefined);
assert.throws(() => snapshot(rows, 'https://user:password@example.com/comments', date));
assert.equal(snapshot([rows[0]], source, date, observed).records[0].unreadState, undefined);
console.log(JSON.stringify({ readOnlyUnreadAndAvatarSnapshotChecks: 23, inferredReadStates: false }));
for (const [platform, domain] of Object.entries({ douyin: 'douyin.com', xiaohongshu: 'xiaohongshu.com', wechat: 'weixin.qq.com', bilibili: 'bilibili.com' })) {
  assert.equal(snapshot(rows, `https://creator.${domain}/comments`, date, undefined, platform).records.length, 2);
  assert.throws(() => snapshot(rows, `https://creator.${domain}.evil.invalid/comments`, date, undefined, platform));
  assert.throws(() => snapshot(rows, 'https://example.invalid/comments', date, undefined, platform));
}
assert.throws(() => snapshot(rows, source, date, undefined, 'xiaohongshu'));
console.log(JSON.stringify({ snapshotPlatformSourceIsolationChecks: 13 }));
const timed=snapshot([{...rows[0],displayTime:'今天 12:00'},{...rows[1],displayTime:'\u0000 昨天\u0007 '},{...rows[1],displayTime:123}],source,date);
assert.equal(timed.records[0].displayTime,'今天 12:00');assert.equal(timed.records[1].displayTime,'昨天');assert.equal(timed.records[2].displayTime,undefined);
assert.equal(snapshot([{...rows[0],displayTime:'x'.repeat(300)}],source,date).records[0].displayTime.length,100);
console.log(JSON.stringify({officialRenderedTimeChecks:4,inferredExactTime:false}));
(async () => {
  let handler, userId = 'u1', url = 'https://creator.douyin.com/publish', nonce, calls = 0, deny = false;
  const guest = { id: 1, getURL: () => url, isDestroyed: () => false, executeJavaScriptInIsolatedWorld: async (_world, code) => {
    calls++; const input = JSON.parse(code[0].code.match(/,(\{"field".*?\})\); \} catch/)[1]);
    nonce = input.nonce; return { nonce, items: [{ index: 0, label: '真实选项' }], applied: true };
  } };
  registerOfficialData({ ipcMain: { handle: (name, fn) => { assert.equal(name, 'matrix:official-data'); handler = fn; } }, context: async () => { if (deny) throw Error('wrong owner'); return { guest, auth: { userId } }; } });
  const read = () => handler({}, { accountId: 'a', command: 'options', field: '音乐' });
  const choose = patch => handler({}, { accountId: 'a', command: 'select-option', field: '音乐', nonce, index: 0, ...patch });
  await read(); assert.equal((await choose()).applied, true);
  assert.ok((await choose()).error);
  await read(); userId = 'u2'; assert.ok((await choose()).error); userId = 'u1';
  await read(); assert.ok((await choose({ accountId: 'b' })).error);
  await read(); assert.ok((await choose({ index: -1 })).error);
  await read(); assert.ok((await choose({ index: 1 })).error);
  await read(); url += '/other'; assert.ok((await choose()).error);
  url = 'https://creator.douyin.com/home'; assert.ok((await read()).error);
  deny = true; const count = calls; assert.ok((await read()).error); assert.equal(calls, count);
  assert.ok((await handler({}, { command: 'send-message' })).error);
  console.log(JSON.stringify({ officialDataGuardAssertions: 11, platformWrites: 0 }));
})().catch(error => { console.error(error); process.exitCode = 1; });
