// Synthetic protocol/transport/storage tests only. No user profile or platform traffic.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const c = require('../desktop/douyin-inbox-codec.cjs');
const { createStore } = require('../desktop/douyin-inbox-store.cjs');
const { createEngine } = require('../desktop/douyin-inbox-engine.cjs');
const { createTransport, receiveDiagnostic } = require('../desktop/douyin-inbox-transport.cjs');
let checks = 0; const eq = (a, b) => { assert.deepEqual(a, b); checks++; }, ok = value => { assert.ok(value); checks++; };
const ownUid = '9007199254740993', peer = '9007199254740995', threadId = `0:1:${ownUid}:${peer}`, short = '9007199254740999';
const raw = (n, text = `消息${n}`) => ({ conversationId: threadId, conversationShortId: short, conversationType: 1, sender: peer, serverMessageId: (9007199254740993000n + BigInt(n)).toString(), messageType: 7, content: JSON.stringify({ text }), createTime: '1792512000', indexInConversationV2: String(n), version: '1' });
const response = (name, body, seq = 1, cmd = { messagesPerUserInitV2Body: 203, messagesInConversationBody: 301, getRecentStrangerMessage: 2047 }[name]) => c.encode('Response', { cmd, sequenceId: String(seq), statusCode: 0, body: { [name]: body } });
async function until(fn) { for (let n = 0; n < 200; n++) { if (fn()) return; await new Promise(r => setTimeout(r, 5)); } throw Error('Fixture timed out'); }
(async () => {
  for (const kind of ['init', 'history', 'strangers']) { const req = c.request(kind, { id: threadId, shortId: short, type: 1, ownUid }, 99), decoded = c.decode('Request', req.bytes); ok([203, 301, 2047].includes(decoded.cmd)); eq(decoded.sequenceId, '99'); }
  assert.throws(() => c.request('send', {}, 1)); checks++; assert.throws(() => c.thread({ id: '0:1:1:2', shortId: short, type: 1 }, ownUid)); checks++;
  eq(c.message(raw(1), ownUid).id, '9007199254740993001'); eq(c.message(raw(1), ownUid).sender, peer);
  assert.throws(() => c.id(Number(ownUid))); checks++;
  assert.throws(() => c.page('init', response('messagesPerUserInitV2Body', { hasMore: false, nextCursor: '0' }), 2)); checks++;
  assert.throws(() => c.page('init', response('messagesPerUserInitV2Body', { nextCursor: '0' }), 1)); checks++;
  const strangerOk = c.encode('Response', { cmd: 2047, sequenceId: '1', statusCode: 200, body: { getRecentStrangerMessage: { nextStrangerVersion: '0', messages: [], hasMore: false } } }); eq(c.page('strangers', strangerOk, 1).hasMore, false);
  assert.throws(() => c.page('init', c.encode('Response', { cmd: 203, sequenceId: '1', statusCode: 200, body: { messagesPerUserInitV2Body: { nextCursor: '0', hasMore: false } } }), 1)); checks++;
  eq(c.lz4(Buffer.from([0x30, 0x61, 0x62, 0x63])).toString(), 'abc'); assert.throws(() => c.lz4(Buffer.from([0, 0, 0]))); checks++;
  const compressedControl = c.frame(c.encode('Frame', { payloadType: 'text/json', payloadEncoding: '__lz4', payload: Buffer.from([0x30, 0x61, 0x62, 0x63]) }));
  eq(compressedControl.payload.toString(), 'abc'); eq(compressedControl.payloadEncoding, 'identity');
  for (const frame of [{ payloadType: 'pb' }, { payloadType: '', frameType: 16 }, { payloadType: 'text/json', frameType: 32 }]) {
    assert.throws(() => c.frame(c.encode('Frame', { ...frame, payloadEncoding: 'fixture-unknown', payload: Buffer.from('private-control') })), /压缩格式尚未支持/); checks++;
  }
  const values = [{ service: 1, name: 'receive_cursor', value: '18446744073709551615' }]; eq(c.cursors(c.encodeCursors(values)), values);
  assert.throws(() => c.cursors(Buffer.from([0, 1]))); checks++;
  const f = c.frame(c.encode('Frame', { seqid: '18446744073709551614', logid: '18446744073709551613', service: 1, method: 1, headers: [{ key: 'need_ack', value: '1' }], logIdNew: 'fixture', payloadType: 'pb', payload: response('hasNewMessageNotify', { message: raw(151) }, 1, 500) }));
  const ack = c.decode('Frame', c.ack(f)); eq(ack.seqid, '18446744073709551614'); eq(ack.logid, '18446744073709551613'); eq(ack.payload, undefined); eq(ack.payloadType, ''); ok(!ack.headers.some(h => /read/i.test(h.key)));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-dm-qa-')), key = crypto.randomBytes(32);
  const protect = text => { const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv); const bytes = Buffer.concat([cipher.update(text), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), bytes]); };
  const unprotect = data => { const decipher = crypto.createDecipheriv('aes-256-gcm', key, data.subarray(0, 12)); decipher.setAuthTag(data.subarray(12, 28)); return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString(); };
  const config = { directory, scope: ['matrix-user', 'matrix-account', ownUid], protect, unprotect }, store = createStore(config);
  const cryptoFailure=createStore({...config,scope:['crypto-failure','account',ownUid],protect(){throw Error('PRIVATE_NATIVE_CRYPTO_DETAIL');}});
  const originalCryptoState=cryptoFailure.get();assert.throws(()=>cryptoFailure.commit(next=>{next.init.done=true;}),error=>error.message.includes('encrypt')&&!error.message.includes('PRIVATE'));checks++;eq(cryptoFailure.get(),originalCryptoState);
  for(const [message,reason] of [['未识别推送事件达到上限，需要适配后继续，未丢弃事件','unsupported-capacity'],['抖音消息协议字段不完整','protocol-encode'],['抖音本机聊天达到本轮安全容量，已暂停；不会标记为历史完整','store-count-limit'],['抖音本机聊天存档达到安全容量，历史仍未完整','store-byte-limit'],['抖音会话身份发生冲突，已保留原数据','thread-conflict'],['抖音聊天存档加密失败（encrypt）；原文件未改动，未推进同步游标或确认推送','storage-encrypt']])ok(receiveDiagnostic({stage:'message-save'},Error(message)).includes('原因='+reason));
  let frameReceiver, sent = [], historyReads = 0;
  const transport = { ownUid, close() {}, async connect(callbacks) { frameReceiver = callbacks.onFrame; callbacks.onStatus('connected'); return () => {}; }, async read(kind, args) {
    if (kind === 'init') return { hasMore: args.cursor === '0', cursor: args.cursor === '0' ? '2' : '3', conversations: args.cursor === '0' ? [{ conversationId: threadId, conversationShortId: short, conversationType: 1, badgeCount: 9 }] : [], messages: [] };
    if (kind === 'strangers') return { hasMore: false, cursor: '0', messages: [] };
    historyReads++; const end = args.cursor === '0' ? 150 : Number(args.cursor) - 1, start = Math.max(1, end - 49); return { messages: Array.from({ length: end - start + 1 }, (_, i) => raw(start + i)), hasMore: start > 1, cursor: String(start) };
  } };
  const engine = createEngine({ transport, store, assertCurrent: async () => {}, delay: async () => {} }); engine.start(); await until(() => !engine.status().busy);
  assert.equal(engine.status().historyComplete,true,engine.status().error||engine.status().phase);checks++; eq(engine.status().threadCount, 1); eq(engine.status().messageCount, 150); eq(historyReads, 3); eq(engine.status().unread, 9);
  let local = engine.messages(threadId); eq(local.messages.length, 50); eq(local.messages[0].index, '101'); local = engine.messages(threadId, local.before); eq(local.messages[0].index, '51'); local = engine.messages(threadId, local.before); eq(local.messages[0].index, '1'); eq(local.before, undefined); eq(engine.status().unread, 9);
  // A durable snapshot can be reopened without plaintext content or ID rounding.
  const file = path.join(directory, fs.readdirSync(directory)[0]); ok(!fs.readFileSync(file).includes(Buffer.from('消息'))); eq(Object.keys(createStore(config).get().messages).length, 150);
  const different = createStore({ ...config, scope: ['other-matrix-user', 'matrix-account', ownUid] }); eq(Object.keys(different.get().messages).length, 0);
  const beforeFailedWrite = fs.readFileSync(file), revisionBeforeFailure = store.get().revision;
  for (const [operation, stage] of [['openSync', 'open'], ['writeFileSync', 'write'], ['fsyncSync', 'flush'], ['renameSync', 'replace']]) {
    const fileSystem = { ...fs, [operation]() { throw Object.assign(Error('private-path-and-secret-must-not-be-exported'), { code: 'EACCES' }); } };
    const failedWrite = createStore({ ...config, fileSystem });
    let error; try { failedWrite.commit(next => next.init.done = !next.init.done); } catch (e) { error = e.message; }
    ok(error.includes(`${stage}/EACCES`)); eq(error.includes('private-path'), false); eq(failedWrite.get().revision, revisionBeforeFailure); eq(fs.readFileSync(file), beforeFailedWrite);
  }
  assert.throws(() => createStore({ ...config, fileSystem: { ...fs, mkdirSync() { throw Object.assign(Error('private'), { code: 'EPERM' }); } } }), /prepare\/EPERM/); checks++;
  for (const [options, stage] of [
    [{ fileSystem: { ...fs, readFileSync() { throw Object.assign(Error('private-path'), { code: 'EACCES' }); } } }, 'read/EACCES'],
    [{ unprotect() { throw Error('private-decryption-data'); } }, 'decrypt'],
    [{ unprotect() { return '抖音private-not-json'; } }, 'validate'],
  ]) { let message; try { createStore({ ...config, ...options }); } catch (e) { message = e.message; } ok(message.includes(stage)); eq(message.includes('private'), false); eq(fs.readFileSync(file), beforeFailedWrite); }
  const marker = engine.arm(); await frameReceiver({ ...f, payload: response('hasNewMessageNotify', { message: raw(151, marker), badgeCount: 10 }, 1, 500) }, bytes => sent.push(bytes));
  eq(engine.status().messageCount, 151); eq(engine.status().pushCount, 1); ok(engine.status().pushVerifiedAt); eq(sent.length, 1); eq(engine.status().unread, 10);
  await frameReceiver({ ...f, payload: response('hasNewMessageNotify', { message: raw(151, marker), badgeCount: 10 }, 1, 500) }, bytes => sent.push(bytes)); eq(engine.status().pushCount, 1); eq(engine.status().messageCount, 151); eq(sent.length, 2);
  const catchupMarker = engine.arm(), caught = c.message(raw(152, catchupMarker), ownUid);
  store.commit(next => { next.messages[`${threadId}/${caught.id}`] = caught; }); // HTTP won the race after arming.
  eq(engine.status().pushVerifiedAt, undefined);
  await frameReceiver({ ...f, payload: response('hasNewMessageNotify', { message: raw(152, catchupMarker) }, 1, 500) }, () => {});
  ok(engine.status().pushVerifiedAt); eq(engine.status().messageCount, 152);
  const replayMarker = engine.arm();
  await frameReceiver({ ...f, payload: response('hasNewMessageNotify', { message: raw(152, replayMarker) }, 1, 500) }, () => {});
  eq(engine.status().pushVerifiedAt, undefined); // Pre-arm ID cannot verify even if its text changes.
  // Local disk failure must not emit a QoS ACK or advance the message count.
  const oldProtect = config.protect; let failures = 0;
  const failingStore = { get: store.get, commit() { failures++; throw Error('fixture-disk-failure'); } };
  const failed = createEngine({ transport, store: failingStore, assertCurrent: async () => {} });
  failed.start(); await until(() => !failed.status().busy); let before = sent.length;
  await assert.rejects(() => frameReceiver(f, bytes => sent.push(bytes))); checks++; eq(sent.length, before); ok(failures > 0); failed.close(); engine.close();
  // Cookie-bound transport fixture: only pinned endpoints and allowed commands leave it.
  const cookies = new EventEmitter(); cookies.get = async () => [{ name: 'sessionid', domain: '.douyin.com', path: '/', value: 'fixture-session' }, { name: 'uid_tt', domain: '.douyin.com', path: '/', value: 'fixture-uid' }];
  let networkCalls = [], invalidated = 0;
  class FakeSocket extends EventEmitter { static instances = []; constructor(url, protocols, options) { super(); this.url = url; this.options = options; this.protocol = 'pbbp2'; this.readyState = 1; FakeSocket.instances.push(this); setImmediate(() => this.emit('open')); } send(value) { sent.push(value); } terminate() { this.readyState = 3; this.emit('close'); } close() { this.terminate(); } }
  const browserDevice = '18446744073709551614';
  const selfReply = url => new URL(url).pathname === '/aweme/v1/web/query/user/' ? { status_code: 0, user_uid: ownUid, id: browserDevice } : { status_code: 0, user: { uid: ownUid, unique_id: 'fixture-handle' } };
  const client = await createTransport({ accountSession: { cookies }, publicHandle: 'fixture-handle', assertCurrent: async () => {}, onInvalidated: () => invalidated++, Socket: FakeSocket, network: async (url, options) => { networkCalls.push(new URL(url).pathname); if (!options.body) return Buffer.from(JSON.stringify(selfReply(url))); const req = c.decode('Request', options.body); ok([203, 301, 2047].includes(req.cmd)); eq(options.headers['x-ss-stub'], crypto.createHash('md5').update(options.body).digest('hex')); return response('messagesPerUserInitV2Body', { hasMore: false, nextCursor: '0' }, req.sequenceId); } });
  eq(client.ownUid, ownUid); await client.read('init', {}); eq(networkCalls, ['/aweme/v1/web/user/profile/self/', '/v2/message/get_by_user_init']);
  await Promise.all([client.read('init', {}), client.connect({ onFrame: async () => {}, onStatus() {} })]); await new Promise(r => setImmediate(r));
  const socketUrl = new URL(FakeSocket.instances[0].url); eq(socketUrl.hostname, 'frontier-im.douyin.com'); eq(socketUrl.searchParams.get('device_id'), browserDevice); eq(socketUrl.searchParams.get('token'), 'fixture-session'); eq(socketUrl.searchParams.get('aid'), '6383'); eq(socketUrl.searchParams.get('fpid'), '9'); eq(socketUrl.searchParams.get('access_key'), crypto.createHash('md5').update(`9e1bd35ec9db7b8d846de66ed140b1ad9${browserDevice}f8a69f1719916z`).digest('hex')); eq(FakeSocket.instances[0].options.headers.Origin, 'https://www.douyin.com');
  const socketConfig = { accountSession: { cookies }, publicHandle: 'fixture-handle', assertCurrent: async () => {}, Socket: FakeSocket, network: async url => Buffer.from(JSON.stringify(selfReply(url))) };
  {
    let received = 0; const events = [], probe = await createTransport(socketConfig);
    await probe.connect({ onFrame: async frame => { eq(frame.payloadType, 'pb'); received++; }, onStatus: (...event) => events.push(event) }); await new Promise(r => setImmediate(r));
    const socket = FakeSocket.instances.at(-1); socket.protocol = 'base64';
    socket.emit('message', Buffer.from('hi'), true); socket.emit('message', Buffer.from('ok'), false);
    socket.emit('message', Buffer.from(c.encode('Frame', { payloadType: 'pb', payload: Buffer.from([1]) }).toString('base64')), false);
    await until(() => received === 1); eq(events.length, 1); eq(events[0][0], 'connected');
    socket.emit('message', Buffer.from('not valid base64! private'), false); eq(events[1][0], 'protocol-error'); eq(JSON.stringify(events).includes('private'), false); probe.close();
  }
  {
    const diagnostic = receiveDiagnostic({ stage: 'private-secret', protocol: 'secret-protocol', type: 'secret-cookie', encoding: 'secret-message', frameType: 9007199254740993, cmd: 9007199254740993 }, Error('抖音secret-token-and-message'));
    eq(diagnostic.includes('secret'), false); eq(diagnostic.includes('9007199254740993'), false); ok(diagnostic.length < 250);
  }
  // Use the actual engine+transport together: stage reporting must survive
  // socket close, preserve encrypted data and never ACK a rejected frame.
  const stageCases = [
    ['frame-compression', { payloadType: 'pb', payloadEncoding: 'fixture-unknown', payload: Buffer.from('private-body') }, 'compression-format'],
    ['cursor-control', { frameType: 16, payloadType: '', headers: [], payload: Buffer.alloc(0) }, 'cursor-file'],
    ['response-decode', { payloadType: 'pb', payload: Buffer.from([1]) }, 'protobuf-wire'],
    ['message-decode', { payloadType: 'pb', payload: response('hasNewMessageNotify', { message: { ...raw(153, 'private-body'), sender: '0' } }, 1, 500) }, 'invalid-id'],
    ['message-save', { payloadType: 'pb', payload: response('hasNewMessageNotify', { message: raw(153, 'private-body') }, 1, 500) }, 'storage'],
  ];
  for (const [stage, frame, reason] of stageCases) {
    const probe = await createTransport(socketConfig), stageStore = createStore({ ...config, scope: ['stage-fixture', stage, ownUid] }); let deny = false;
    const storage = { get: stageStore.get, commit(change) { if (deny) throw Error('抖音聊天存档写入失败（write/EACCES）；private-path-and-message'); return stageStore.commit(change); } };
    const stageEngine = createEngine({ transport: { ...transport, connect: callbacks => probe.connect(callbacks) }, store: storage, assertCurrent: async () => {}, delay: async () => {} });
    stageEngine.start(); await until(() => !stageEngine.status().busy && stageEngine.status().push === 'connected');
    const revision = stageStore.get().revision, acknowledgements = sent.length; deny = stage === 'message-save';
    FakeSocket.instances.at(-1).emit('message', c.encode('Frame', { ...frame, headers: [...(frame.headers || []), { key: 'need_ack', value: '1' }] }), true);
    await until(() => stageEngine.status().push === 'protocol-error');
    const diagnostic = stageEngine.status().pushError; ok(diagnostic.includes(`阶段=${stage}`)); ok(diagnostic.includes(`原因=${reason}`)); eq(diagnostic.includes('private'), false); ok(diagnostic.length < 250); eq(stageStore.get().revision, revision); eq(sent.length, acknowledgements); stageEngine.close(); probe.close();
  }
  {
    const probe = await createTransport(socketConfig), opaqueStore = createStore({ ...config, scope: ['opaque-control-fixture', 'account', ownUid] });
    const opaqueEngine = createEngine({ transport: { ...transport, connect: callbacks => probe.connect(callbacks) }, store: opaqueStore, assertCurrent: async () => {}, delay: async () => {} });
    opaqueEngine.start(); await until(() => !opaqueEngine.status().busy && opaqueEngine.status().push === 'connected');
    const socket = FakeSocket.instances.at(-1), before = sent.length, frame = c.encode('Frame', { frameType: 1, payloadType: 'text/json', payloadEncoding: 'fixture-unknown', payload: Buffer.from('private-control-content'), headers: [{ key: 'need_ack', value: '1' }] });
    socket.emit('message', frame, true); await until(() => opaqueEngine.status().unsupportedEvents === 1);
    eq(opaqueEngine.status().push, 'connected'); eq(opaqueEngine.status().messageCount, 150); eq(opaqueEngine.status().pushVerifiedAt, undefined); eq(sent.length, before + 1);
    socket.emit('message', frame, true); await until(() => sent.length === before + 2); eq(opaqueEngine.status().unsupportedEvents, 1);
    const stored = opaqueStore.get().protocolEvents[0]; eq(c.decode('Frame', Buffer.from(stored.frame, 'base64')).payload.toString(), 'private-control-content'); eq(Object.values(opaqueEngine.status()).some(value => typeof value === 'string' && value.includes('private-control-content')), false);
    eq(c.decode('Frame', Buffer.from(stored.frame, 'base64')).payloadEncoding, 'fixture-unknown');
    const compressed = c.encode('Frame', { payloadType: 'text/json', payloadEncoding: '__lz4', payload: Buffer.from([0x30, 0x61, 0x62, 0x63]) });
    socket.emit('message', compressed, true); await until(() => opaqueEngine.status().unsupportedEvents === 2);
    const canonical = c.decode('Frame', Buffer.from(opaqueStore.get().protocolEvents[1].frame, 'base64'));
    eq(canonical.payloadEncoding, 'identity'); eq(canonical.payload.toString(), 'abc'); eq(opaqueEngine.status().messageCount, 150);
    const marker = opaqueEngine.arm();
    socket.emit('message', c.encode('Frame', { payloadType: 'pb', payload: response('hasNewMessageNotify', { message: raw(151, marker) }, 1, 500) }), true);
    await until(() => !!opaqueEngine.status().pushVerifiedAt); eq(opaqueEngine.status().messageCount, 151); eq(opaqueEngine.status().pushCount, 1); eq(opaqueEngine.status().unsupportedEvents, 2);
    opaqueEngine.close(); probe.close();
  }
  // Bad identity/challenge/absent device ID never creates a WebSocket or guesses
  // registered hardware identity. The working history API remains independent.
  for (const browser of [{ status_code: 8 }, { status_code: 0, user_uid: peer, id: browserDevice }, { status_code: 0, user_uid: ownUid, id: '0' }, { status_code: 0, user_uid: ownUid, id: '18446744073709551616' }]) {
    const before = FakeSocket.instances.length;
    const probe = await createTransport({ ...socketConfig, network: async url => Buffer.from(JSON.stringify(new URL(url).pathname === '/aweme/v1/web/query/user/' ? browser : selfReply(url))) });
    await assert.rejects(() => probe.connect({ onFrame: async () => {}, onStatus() {} })); checks++; eq(FakeSocket.instances.length, before); probe.close();
  }
  {
    let deviceReads = 0; const before = FakeSocket.instances.length;
    const probe = await createTransport({ ...socketConfig, network: async url => { if (new URL(url).pathname === '/aweme/v1/web/query/user/') { deviceReads++; throw Error('抖音消息服务返回 HTTP 403，需要本人验证'); } return Buffer.from(JSON.stringify(selfReply(url))); } });
    await assert.rejects(() => probe.connect({ onFrame: async () => {}, onStatus() {} }), /HTTP 403/); checks++; eq(deviceReads, 1); eq(FakeSocket.instances.length, before); probe.close();
  }
  {
    const probe = await createTransport({ ...socketConfig, network: async url => Buffer.from(new URL(url).pathname === '/aweme/v1/web/query/user/' ? '抖音secret-cookie-and-message-body-not-json' : JSON.stringify(selfReply(url))) });
    let message; try { await probe.connect({ onFrame: async () => {}, onStatus() {} }); } catch (e) { message = e.message; }
    ok(message.includes('网页推送身份接口未返回可识别数据')); eq(message.includes('secret'), false); probe.close();
    await assert.rejects(() => createTransport({ ...socketConfig, network: async () => Buffer.from('抖音secret-not-json') }), e => e.message.includes('本人身份接口未返回可识别数据') && !e.message.includes('secret')); checks++;
  }
  // Numeric/code-only failures survive close; no URL, cookie, close reason or
  // raw exception text is included, and intentional stops report no failures.
  for (const statusCode of [400, 403, 429, 503]) {
    const events = [], probe = await createTransport(socketConfig); let drained = false;
    await probe.connect({ onFrame: async () => {}, onStatus: (...event) => events.push(event) }); await new Promise(r => setImmediate(r));
    const socket = FakeSocket.instances.at(-1); socket.emit('unexpected-response', {}, { statusCode, resume() { drained = true; } });
    eq(events.length, 2); eq(events[1][0], statusCode === 400 ? 'request-rejected' : statusCode === 403 ? 'verification-required' : statusCode === 429 ? 'rate-limited' : 'connection-error'); ok(events[1][1].includes(`HTTP ${statusCode}`)); ok(drained); probe.close();
  }
  for (const failure of [{ code: 'ECONNRESET', message: 'fixture-session-secret' }, { code: 'UNTRUSTED_SECRET', message: 'https://secret.invalid/?cookie=fixture-session' }]) {
    const events = [], probe = await createTransport(socketConfig);
    await probe.connect({ onFrame: async () => {}, onStatus: (...event) => events.push(event) }); await new Promise(r => setImmediate(r));
    const socket = FakeSocket.instances.at(-1); socket.emit('error', failure); socket.emit('close', 1006, Buffer.from('private-reason'));
    eq(events.length, 2); ok(events[1][1].includes(failure.code === 'ECONNRESET' ? 'ECONNRESET' : 'UNKNOWN')); eq(JSON.stringify(events).includes('secret'), false); probe.close();
  }
  {
    const events = [], probe = await createTransport(socketConfig);
    const stop = await probe.connect({ onFrame: async () => {}, onStatus: (...event) => events.push(event) }); await new Promise(r => setImmediate(r));
    FakeSocket.instances.at(-1).emit('close', 1008, Buffer.from('private-reason'));
    eq(events[1][0], 'disconnected'); ok(events[1][1].includes('1008')); eq(JSON.stringify(events).includes('private-reason'), false);
    const count = events.length; stop(); eq(events.length, count); probe.close();
  }
  {
    const events = [], probe = await createTransport(socketConfig);
    await probe.connect({ onFrame: async () => { throw Error('private-path-secret'); }, onStatus: (...event) => events.push(event) }); await new Promise(r => setImmediate(r));
    FakeSocket.instances.at(-1).emit('message', c.encode('Frame', { payloadType: 'pb', payload: Buffer.from([1]) }), true);
    await until(() => events.length === 2); eq(events[1][0], 'protocol-error'); eq(JSON.stringify(events).includes('secret'), false); probe.close();
  }
  {
    let report; const isolatedStore = createStore({ ...config, scope: ['synthetic-push-error-owner', 'synthetic-account', ownUid] });
    const isolatedEngine = createEngine({ transport: { ...transport, async connect(callbacks) { report = callbacks.onStatus; report('verification-required', '抖音推送握手返回 HTTP 403'); return () => {}; } }, store: isolatedStore, assertCurrent: async () => {}, delay: async () => {} });
    isolatedEngine.start(); await until(() => !isolatedEngine.status().busy); eq(isolatedEngine.status().historyComplete, true); eq(isolatedEngine.status().push, 'verification-required'); ok(isolatedEngine.status().pushError.includes('403')); eq(isolatedEngine.status().error, '');
    report('connected'); await until(() => !isolatedEngine.status().busy); eq(isolatedEngine.status().pushError, ''); eq(isolatedEngine.status().pushVerifiedAt, undefined); isolatedEngine.close();
  }
  cookies.emit('changed', {}, { name: 'sessionid', domain: '.douyin.com', path: '/', value: 'different-session' }, 'explicit', false); eq(invalidated, 1); eq(FakeSocket.instances[0].readyState, 3); await assert.rejects(() => client.read('init', {})); checks++; client.close(); eq(cookies.listenerCount('changed'), 0);
  await assert.rejects(() => createTransport({ accountSession: { cookies }, publicHandle: 'wrong-account', assertCurrent: async () => {}, network: async () => Buffer.from(JSON.stringify({ status_code: 0, user: { uid: ownUid, unique_id: 'fixture-handle' } })) })); checks++;
  let browserReads = [];
  const browserClient = await createTransport({ accountSession: { cookies, getUserAgent: () => 'QA-session-UA' }, publicHandle: 'fixture-handle', assertCurrent: async () => {}, network: async (url, options) => { const u = new URL(url); browserReads.push(u.hostname); if (u.hostname === 'imdesktop.douyin.com') { eq(u.searchParams.get('device_platform'), process.platform); return Buffer.from(JSON.stringify({ status_code: 8 })); } eq(options.headers['User-Agent'], 'QA-session-UA'); eq(options.headers.Referer, 'https://www.douyin.com/'); eq(u.searchParams.get('aid'), '6383'); return Buffer.from(JSON.stringify({ status_code: 0, user: { uid: ownUid, unique_id: 'fixture-handle' } })); } });
  eq(browserClient.ownUid, ownUid); eq(browserReads, ['imdesktop.douyin.com', 'www.douyin.com']); browserClient.close();
  let denialReads = 0;
  await assert.rejects(() => createTransport({ accountSession: { cookies }, publicHandle: 'fixture-handle', assertCurrent: async () => {}, network: async () => { denialReads++; throw Error('抖音消息服务返回 HTTP 403，需要本人验证'); } }), /HTTP 403/); checks++; eq(denialReads, 1);
  // Exercise the production poll, send archive and official history reader.
  {
    const req='55555555-5555-4555-8555-555555555555';let clock=1000000,posts=0,historyReads=0,echoes=[];
    const thread=c.thread(raw(1),ownUid);
    let state={threads:{[threadId]:{...thread,history:{done:true,cursor:'0',pages:1},latestIndex:'0'}},messages:{},init:{done:true,cursor:'0'},strangers:{done:true,cursor:'0'},frontier:{}};
    const engine=createEngine({now:()=>clock,assertCurrent:async()=>{},delay:async()=>{},store:{get:()=>state,commit(fn){const next=structuredClone(state);fn(next);state=next;}},
      transport:{ownUid,sendText:async()=>{posts++;return{state:'unknown',requestId:req};},read:async(kind)=>{if(kind==='history')historyReads++;return{messages:kind==='history'?echoes:[],conversations:[],hasMore:false,cursor:'0'};}}});
    eq((await engine.sendText(threadId,'原消息',req)).state,'unknown');
    echoes=[{...raw(2,'原消息'),sender:peer,ext:{'s:client_message_id':req}},{...raw(3,'错正文'),sender:ownUid,ext:{'s:client_message_id':req}}];
    clock+=60000;engine.poll();await until(()=>historyReads>=1);await new Promise(r=>setTimeout(r,10));eq(state.outbox[req].receipt.state,'unknown');
    echoes=[{...raw(4,'原消息'),sender:ownUid,ext:{'s:client_message_id':req}}];
    clock+=240000;engine.poll();await until(()=>state.outbox[req].receipt.state==='confirmed');eq(engine.reviewedReceipts()[0].messageId,echoes[0].serverMessageId);eq(posts,1);engine.close();
  }
  // Cleanup only the exact fresh fixture directory after validating its root.
  assert.ok(directory.startsWith(path.join(os.tmpdir(), 'matrix-dm-qa-'))); fs.rmSync(directory, { recursive: true });
  console.log(JSON.stringify({ checks, syntheticOnly: true, historyMessages: 150, realIncomingPushVerified: false, outgoingBusinessMessages: 0, markReadRequests: 0, realProfileAccessed: false, codeUploaded: false }));
})().catch(e => { console.error(e); process.exitCode = 1; });
