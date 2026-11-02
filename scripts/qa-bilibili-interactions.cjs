// Isolated protocol fixtures only. No Electron profile, platform IO or writes.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { parseExactJSON, createReadTransport, readInteractionPage, registerBilibiliInteractions } = require('../desktop/bilibili-interactions.cjs');
const { waitForOwnProfile } = require('../desktop/web-followup-context.cjs');
let checks = 0;
const eq = (a, b) => { assert.deepEqual(a, b); checks++; };
const rejects = async (action, pattern) => { await assert.rejects(action, pattern); checks++; };
const nav = { isLogin: true, mid: 42 };
const state = kind => ({ kind, page: 1, children: [], rootEnded: false, ...(kind === 'comments' ? { workId: 'BV1jnnE6PEBp' } : {}) });
const row = id => ({ rpid_str: id, member: { mid: 88, uname: 'QA 作者', avatar: 'https://i0.hdslb.com/qa.jpg' }, content: { message: 'QA 评论' }, rcount: 0, ctime: 1792512000 });
function client(data) { const calls = []; return { calls, read: async (route, params) => { calls.push([route, params]); if (route === 'nav') return nav; if (route === 'video') return { aid: 99, bvid: 'BV1jnnE6PEBp', owner: { mid: 42 } }; return typeof data === 'function' ? data(route, params) : data; } }; }
(async () => {
  const exact = parseExactJSON('{"rpid":9999999999999999999,"text":"9999999999999999999 \\\"x\\\"","float":1.25,"safe":42,"nested":[9007199254740992]}');
  eq(exact.rpid, '9999999999999999999'); eq(exact.text, '9999999999999999999 "x"'); eq(exact.safe, 42); eq(exact.float, 1.25); eq(exact.nested[0], '9007199254740992');
  let c = client({ session_list: [{ talker_id: 88, session_type: 1, session_ts: 1000, unread_count: 3, account_info: { name: 'QA 会话' }, last_msg: { msg_type: 1, content: '{"content":"QA 最新摘要"}', timestamp: 1792512000 } }], has_more: 1 });
  let result = await readInteractionPage({ client: c, state: state('messages'), nativeAccountKey: '42' });
  eq(result.records[0].unreadState, 'unread'); eq(result.records[0].unreadCount, 3); eq(result.records[0].content, 'QA 最新摘要'); eq(result.complete, false); eq(result.next.begin, '1000'); eq(c.calls.map(call => call[0]), ['nav', 'messages', 'nav']);
  eq(c.calls[1][1].session_type, '4');
  await rejects(() => readInteractionPage({ client: c, state: { ...state('messages'), begin: '1000' }, nativeAccountKey: '42' }), /分页未前进/);
  for (const data of [{}, { session_list: [], has_more: 1 }, { session_list: [], has_more: undefined }]) await rejects(() => readInteractionPage({ client: client(data), state: state('messages'), nativeAccountKey: '42' }), /结构未识别|分页未前进/);
  c = client({ session_list: [], has_more: 0 }); result = await readInteractionPage({ client: c, state: state('messages'), nativeAccountKey: '42' }); eq(result.complete, true); eq(result.records.length, 0);
  c = client({ list: [{ mid: 88, uname: 'QA 粉丝', sign: 'QA签名', face: 'http://i0.hdslb.com/qa.jpg' }], total: 51 });
  result = await readInteractionPage({ client: c, state: state('followers'), nativeAccountKey: '42' }); eq(result.complete, false); eq(result.next.page, 2); eq(result.records[0].platformId, '88'); eq(result.records[0].avatarUrl, 'https://i0.hdslb.com/qa.jpg'); eq(c.calls[1][1].vmid, '42');
  await rejects(() => readInteractionPage({ client: client({ list: [], total: 51 }), state: state('followers'), nativeAccountKey: '42' }), /提前结束/);
  await rejects(() => readInteractionPage({ client: client({ list: [], total: 0 }), state: state('followers'), nativeAccountKey: '99' }), /本人UID/);
  const root = { ...row('9999999999999999999'), rcount: 21 };
  c = client((route, params) => route === 'comments' ? { page: { size: 20, count: 1, acount: 22 }, replies: [root] } : { page: { size: 20, count: 21 }, replies: [row(params.pn === '1' ? '9999999999999999998' : '9999999999999999997')] });
  result = await readInteractionPage({ client: c, state: state('comments'), nativeAccountKey: '42' }); eq(result.complete, false); eq(result.next.children, [{ id: root.rpid_str, page: 1 }]);
  let child = await readInteractionPage({ client: c, state: result.next, nativeAccountKey: '42' }); eq(child.records[0].parentPlatformId, root.rpid_str); eq(child.complete, false); eq(child.next.children[0].page, 2);
  child = await readInteractionPage({ client: c, state: child.next, nativeAccountKey: '42' }); eq(child.complete, true); eq(child.next.children.length, 0); eq(c.calls.filter(call => call[0] === 'replies').map(call => call[1].pn), ['1', '2']);
  c = client({ page: { size: 20, count: 0, acount: 0 }, replies: null }); result = await readInteractionPage({ client: c, state: state('comments'), nativeAccountKey: '42' }); eq(result.complete, true);
  c = client({ page: { size: 20, count: 0 }, replies: null }); c.read = async route => route === 'nav' ? nav : { aid: 99, bvid: 'BV1jnnE6PEBp', owner: { mid: 999 } };
  await rejects(() => readInteractionPage({ client: c, state: state('comments'), nativeAccountKey: '42' }), /不属于/);
  c = client({ session_list: [], has_more: 0 }); let n = 0; const original = c.read; c.read = async (...args) => args[0] === 'nav' && ++n > 1 ? { isLogin: true, mid: 999 } : original(...args);
  await rejects(() => readInteractionPage({ client: c, state: state('messages'), nativeAccountKey: '42' }), /本页结果已丢弃/);
  // Transport invariants: exact GET-only allowlist, host-bound credentials,
  // redirects refused, no raw response/error leakage, deadlines cancel reads.
  const calls = []; let secret = 'qa-session-value', body = '{"code":0,"data":{"rpid":9999999999999999999}}', httpStatus = 200, type = 'application/json';
  const fakeSession = { cookies: { get: async () => [{ name: 'SESSDATA', value: secret }] }, fetch: async (url, options) => { calls.push({ url, options }); return new Response(body, { status: httpStatus, headers: { 'content-type': type } }); } };
  let current = true;
  let transport = await createReadTransport({ accountSession: fakeSession, assertCurrent: async () => { if (!current) throw Error('账号已切换'); } });
  eq((await transport.read('nav')).rpid, '9999999999999999999'); eq(calls[0].options.method, 'GET'); eq(calls[0].options.redirect, 'error'); eq(calls[0].options.credentials, 'omit'); eq(calls[0].options.body, undefined);
  for (const route of ['update_ack', '/x/v2/reply/add', 'https://evil.test/', 'session_detail']) await rejects(() => transport.read(route), /不支持的只读/);
  await rejects(() => transport.read('followers', { vmid: '42', csrf: 'never' }), /不支持的只读/);
  secret = 'qa-changed'; await rejects(() => transport.read('nav'), /会话已变化/); eq(calls.length, 1); transport.close();
  await rejects(() => transport.read('nav'), /连接已结束/);
  secret = 'qa-session-value'; body = '{"code":-412,"message":"never leak qa-session-value"}'; transport = await createReadTransport({ accountSession: fakeSession, assertCurrent: async () => {} });
  await rejects(() => transport.read('nav'), /错误码 -412/); body = '<html>qa-session-value</html>'; type = 'text/html'; await rejects(() => transport.read('nav'), /未返回数据JSON/); transport.close();
  transport = await createReadTransport({ accountSession: { cookies: { get: async () => new Promise(() => {}) } }, assertCurrent: async () => {}, timeoutMs: 5 }); await rejects(() => transport.read('nav'), /超时/); transport.close();
  // Main-process normal UI authorization + opaque cursor ownership.
  let handler, time = 100000, created = 0, closed = 0, acc = { id: randomUUID(), platform: 'bilibili', nativeAccountKey: '42', connectorSessionId: randomUUID() };
  const host = { webContents: { id: 1 } }, user = randomUUID();
  registerBilibiliInteractions({ ipcMain: { handle: (name, fn) => { eq(name, 'matrix:bilibili-interactions'); handler = fn; } }, getWindow: () => host, authenticate: async () => ({ userId: user, account: acc }), session: { fromPartition: partition => { eq(partition, 'persist:matrix-bilibili-' + acc.connectorSessionId); return {}; } }, now: () => time,
    createTransport: async () => { created++; const adapter = client((_route, params) => ({ list: [{ mid: 87 + Number(params.pn), uname: 'QA' }], total: 51 })); return { ...adapter, close: () => closed++ }; } });
  const event = { sender: host.webContents }, input = { accessToken: 'qa-only', accountId: acc.id, kind: 'followers' };
  result = await handler({ sender: {} }, input); eq(created, 0); assert.match(result.error, /主窗口/); checks++;
  result = await handler(event, { ...input, kind: 'unknown' }); eq(created, 0);
  result = await handler(event, input); eq(result.records[0].platformId, '88'); eq(result.complete, false); assert.ok(result.nextCursor); checks++; const cursor = result.nextCursor;
  eq((await handler(event, input)).records, undefined); time += 16000;
  result = await handler(event, { ...input, cursor }); eq(result.complete, true); eq(created, 2); eq(closed, 2);
  time += 16000; acc = { ...acc, connectorSessionId: randomUUID() }; result = await handler(event, { ...input, cursor }); assert.match(result.error, /分页凭据/); checks++; eq(created, 2);
  // Slow, authenticated own-home readiness is not falsely reported as logout.
  let clock = 0, samples = 0;
  await waitForOwnProfile({ nativeAccountKey: 'own', now: () => clock, sleep: async ms => { clock += ms; }, inspect: async () => (++samples < 10 ? { authenticated: true, profile: {} } : { authenticated: true, profile: { ownIdentity: { key: 'own' } } }) }); eq(samples, 10);
  clock = 0; await rejects(() => waitForOwnProfile({ nativeAccountKey: 'own', timeoutMs: 1000, now: () => clock, sleep: async ms => { clock += ms; }, inspect: async () => ({ authenticated: true, profile: {} }) }), /不是判定账号已退出/);
  clock = 0; await rejects(() => waitForOwnProfile({ nativeAccountKey: 'own', now: () => clock, sleep: async ms => { clock += ms; }, inspect: async () => ({ authenticated: false, profile: { loginVisible: true } }) }), /持续显示登录/);
  await rejects(() => waitForOwnProfile({ nativeAccountKey: 'own', inspect: async () => ({ authenticated: true, profile: { ownIdentity: { key: 'foreign' } } }) }), /本人ID与绑定账号不一致/);
  eq(calls.every(call => call.options.method === 'GET' && !/update_ack|send_msg|session_detail/.test(call.url)), true);
  console.log(JSON.stringify({ bilibiliInteractionChecks: checks, mainProcessReadOnly: true, cursorOwnerBound: true, commentsAndChildrenPaged: true, exactLargeIds: true, noReadAcknowledgements: true, realPlatformRequests: 0, realCommentsSent: 0 }));
})().catch(error => { console.error(error); process.exitCode = 1; });
