// Fully synthetic account/session/HTTP fixtures. No real profile, platform,
// messages, comments, follows, mark-read requests or account data are touched.
const assert = require('node:assert/strict'), { EventEmitter } = require('node:events');
const { readPage, initial, registerDouyinInteractions } = require('../desktop/douyin-interactions.cjs');
const { createTransport } = require('../desktop/douyin-inbox-transport.cjs');
const { createEngine, mergeThread } = require('../desktop/douyin-inbox-engine.cjs');
const c = require('../desktop/douyin-inbox-codec.cjs');
const { commentIdentifier } = require('../desktop/douyin-comment-identifiers.cjs');
let checks = 0; const eq = (a, b) => { assert.deepEqual(a, b); checks++; }, ok = v => { assert.ok(v); checks++; };
const own = '9007199254740993', peer = '9007199254740995', sec = 'MS4wQaOwn', peerSec = 'MS4wQaPeer', work = n => String(9007199254740100000n + BigInt(n));
const user = { uid: peer, sec_uid: peerSec, nickname: 'QA 真昵称', avatar_thumb: { url_list: ['https://image.fixture.test/avatar'] }, signature: 'QA 签名', create_time: 1 };
const row = (n, w = work(1)) => ({ cid: String(9007199254740200000n + BigInt(n)), aweme_id: w, text: `QA 评论 ${n}`, create_time: 1792512000, user });
let webCalls = [];
const client = { ownUid: own, async readWeb(kind, args) {
  webCalls.push([kind, structuredClone(args)]);
  if (kind === 'works') return args.cursor === '0' ? { aweme_list: [1, 2].map(n => ({ aweme_id: work(n), author: { uid: own }, desc: `QA 作品 ${n}` })), has_more: 1, max_cursor: '2' } : { aweme_list: [{ aweme_id: work(3), author: { uid: own }, desc: 'QA 作品 3' }], has_more: 0, max_cursor: '0' };
  if (kind === 'comments' && args.workId === work(1)) return args.cursor === '0' ? { comments: [{ ...row(1), reply_comment_total: 3, reply_comment: [row(11)] }], has_more: 1, cursor: '20' } : { comments: [row(2)], has_more: 0, cursor: '21' };
  if (kind === 'comments' && args.workId === work(2)) return { comments: null, has_more: false, cursor: '0' };
  if (kind === 'comments') return { comments: [row(3, work(3))], has_more: 0, cursor: '1' };
  if (kind === 'replies') return args.cursor === '0' ? { comments: [row(11), row(12)], has_more: 1, cursor: '2', total: 3 } : { comments: [row(13)], has_more: 0, cursor: '3', total: 3 };
  return args.cursor === '0' ? { followers: [user], has_more: 1, min_time: '1790000000', max_time: '1799999999', offset: 1, total: 2, myself_user_id: own } : { followers: [{ ...user, uid: '9007199254740997', nickname: 'QA 第二个粉丝' }], has_more: 0, total: 2, myself_user_id: own };
} };
const reject = async (fn, pattern) => { await assert.rejects(fn, pattern); checks++; };
(async () => {
  let state = initial('comments'), result, all = new Map(), discovered = new Map();
  for (let n = 0; n < 20; n++) { const before = structuredClone(state); result = await readPage(client, state); eq(state, before); for (const work of result.works) discovered.set(work.platformId, work.title); for (const record of result.records) all.set(`${record.workId}/${record.platformId}`, record); state = result.next; if (result.complete) break; }
  eq(result.complete, true); eq(state.worksDone, 3); eq(state.rootPages, 4); eq(state.replyPages, 2); eq(state.pages, 8); eq(all.size, 6);
  eq(discovered.size, 3); eq(discovered.get(work(2)), 'QA 作品 2'); eq([...all.values()].some(r => r.workId === work(2)), false);
  eq(all.get(`${work(1)}/${row(11).cid}`).parentPlatformId, row(1).cid); eq(all.get(`${work(3)}/${row(3).cid}`).workTitle, 'QA 作品 3'); eq(all.get(`${work(1)}/${row(1).cid}`).author, user.nickname);
  eq(webCalls.map(([kind]) => kind), ['works', 'comments', 'replies', 'replies', 'comments', 'comments', 'works', 'comments']);
  const firstFans = await readPage(client, initial('followers')); eq(firstFans.complete, false); eq(firstFans.next.cursor, '1790000000'); eq(firstFans.records[0].displayTime, undefined); // Registration time is NOT follow time.
  const lastFans = await readPage(client, firstFans.next); eq(lastFans.complete, true); eq(lastFans.records[0].author, 'QA 第二个粉丝'); eq(webCalls.at(-1)[1], { cursor: '1790000000', offset: '1', sourceType: '1' });
  for (const bad of [
    { aweme_list: [{ aweme_id: work(1), author: { uid: peer } }], has_more: 0 },
    { aweme_list: [], has_more: 1, max_cursor: '0' }, { aweme_list: [] },
  ]) await reject(() => readPage({ ...client, readWeb: async () => bad }, initial('comments')));
  for (const bad of [
    { followers: [user], has_more: 1, min_time: '0', offset: 0 },
    { followers: [user], has_more: 0, myself_user_id: peer },
    { total: 100, has_more: 0 }, { followers: [], has_more: 2 },
  ]) await reject(() => readPage({ ...client, readWeb: async () => bad }, initial('followers')));
  eq((await readPage({ ...client, readWeb: async () => ({ followers: null, total: 0, has_more: 0 }) }, initial('followers'))).complete, true);
  {let page=initial('followers');for(let n=0;n<3;n++){const next=await readPage({...client,readWeb:async()=>({followers:[{...user,uid:String(100+n)}],has_more:n<2,min_time:'0',offset:String(n+1),myself_user_id:own,owner_follower_count:3})},page);page=next.next;if(n===2){eq(next.followerRosterVerified,true);eq(next.currentFollowerIds,['100','101','102']);}}}
  const stage = (await readPage(client, initial('comments'))).next;
  const encryptedRoot = 'qa.encrypted-root+reference/==', encryptedPeer = 'qa.encrypted-peer+reference/==', encryptedChild = 'qa.encrypted-child+reference/==';
  for (const bad of ['', 'https://private.test', 'cookie=value; other=value', '12345678901234567890', 'x'.repeat(513), 9007199254740994]) eq(commentIdentifier(bad, true), '');
  eq(commentIdentifier(encryptedRoot), ''); eq(commentIdentifier(encryptedRoot, true), encryptedRoot);
  for (const reference of ['-legacy==', '_legacy', '/legacy+', '=old', 'v1:old%2Bref', 'a', '#'+ 'a'.repeat(64), '@'+ 'b'.repeat(64), 'legacy\\value', 'legacy;value', '\"'+ 'c'.repeat(64)]) { eq(commentIdentifier(reference, true), reference); eq(commentIdentifier(reference, false), ''); }
  for (const bad of ['data:secret', 'javascript:alert', 'file:/private', '\nlegacy', 'legacy\n', 'legacy\u0000value']) eq(commentIdentifier(bad, true), '');
  const legacyClient = { ...client, readWeb: async kind => ({ comments: [{ ...row(1), cid: kind === 'comments' ? encryptedRoot : encryptedChild, referenceKind: 'legacy', user: { ...user, uid: encryptedPeer, referenceKind: 'legacy' }, reply_comment_total: kind === 'comments' ? 1 : 0 }], has_more: false, cursor: '0' }) };
  const legacyRoot = await readPage(legacyClient, stage); eq(legacyRoot.records[0].platformId, encryptedRoot); eq(legacyRoot.records[0].platformUserId, encryptedPeer); eq(legacyRoot.records[0].author, user.nickname); eq(legacyRoot.next.works[0].replies[0].id, encryptedRoot);
  const legacyReply = await readPage(legacyClient, legacyRoot.next); eq(legacyReply.records[0].platformId, encryptedChild); eq(legacyReply.records[0].parentPlatformId, encryptedRoot); eq(legacyReply.next.worksDone, 1);
  const embeddedPage = { comments: [{ ...row(1), reply_comment_total: 1, reply_comment: [row(2)], reply_comment_complete: true }], has_more: false };
  const embedded = await readPage({ ...client, readWeb: async () => embeddedPage }, stage);
  eq(embedded.records.length, 2); eq(embedded.records[1].parentPlatformId, row(1).cid); eq(embedded.next.worksDone, 1); eq(embedded.next.replyPages, 0);
  await reject(() => readPage({ ...client, readWeb: async () => ({ ...embeddedPage, comments: [{ ...embeddedPage.comments[0], reply_comment_total: 2 }] }) }, stage), /内嵌回复数量/);
  await reject(() => readPage({ ...client, readWeb: async () => ({ comments: [{ ...row(1), cid: encryptedRoot }], has_more: false }) }, stage), /评论标识无效/);
  const anonymous = await readPage({ ...client, readWeb: async () => ({ comments: [{ ...row(1), user: { uid: '', nickname: '平台保留昵称', identityUnavailable: true } }], has_more: false }) }, stage);
  eq(anonymous.records[0].platformUserId, ''); eq(anonymous.records[0].authorIdentityAvailable, false); eq(anonymous.records[0].author, '平台保留昵称');
  await reject(() => readPage({ ...client, readWeb: async () => ({ followers: [{ uid: '', identityUnavailable: true }], has_more: false }) }, initial('followers')));
  const gated = { ...client, readWeb: async () => { const e = Error('官网当前作品状态暂不支持查看详情数据'); e.code = 'OWNED_WORK_UNAVAILABLE'; throw e; } };
  const skipped = await readPage(gated, stage);
  eq(skipped.complete, false); eq(skipped.records, []); eq(skipped.next.works[0].id, work(2)); eq(skipped.next.worksDone, 0); eq(skipped.progress.worksFailed, 1); ok(skipped.works[0].readError); eq(skipped.works[0].readComplete, undefined); eq(stage.works[0].id, work(1));
  const accessible = await readPage(client, skipped.next); eq(accessible.works[0].readComplete, true); eq(accessible.works[0].platformId, work(2)); eq(accessible.next.worksDone, 1);
  const unsupported=await readPage({...client,readWeb:async()=>{throw Object.assign(Error('官方评论标识未识别（字符串格式未支持）'),{code:'OWNED_COMMENT_SCHEMA_UNSUPPORTED'});}},stage);
  eq(unsupported.works[0].readError,'官方评论标识未识别（字符串格式未支持）');eq(unsupported.works[0].readComplete,undefined);eq(unsupported.next.works[0].id,work(2));eq(unsupported.next.worksDone,0);eq(unsupported.progress.worksFailed,1);
  for (const message of ['HTTP 403', '平台码5；参数不合法', '官网当前作品状态暂不支持查看详情数据']) await reject(() => readPage({ ...client, readWeb: async () => { throw Error(message); } }, stage));
  await reject(() => readPage({ ...client, readWeb: async () => ({ comments: [row(1, work(2))], has_more: 0 }) }, stage), /作品编号/);
  await reject(() => readPage({ ...client, readWeb: async () => ({ comments: [row(1)], has_more: 1, cursor: '0' }) }, stage), /未前进/);
  await reject(() => readPage(client, { ...initial('comments'), pages: 10000 }), /10000页/);
  const repeated = { ...firstFans.next, cursor: '0',offset:'0' }; await reject(() => readPage(client, repeated), /循环/);
  // Only repeated typed NOT_READY with zero observed requests backs off.
  // A real page or an initiated request restores the original cadence.
  let idleState=initial('followers');let pendingRequests=0;
  const idleClient={ownUid:own,followerUi:true,diagnosticSnapshot:()=>({stats:{followerStarted:pendingRequests}}),readWeb:async()=>{throw Object.assign(Error('QA未就绪'),{readerCode:'NOT_READY'});}};
  for(const delay of [10000,10000,30000,30000,30000,60000,60000]){const old=structuredClone(idleState),waiting=await readPage(idleClient,idleState);eq(waiting.pollAfterMs,delay);eq(waiting.followerPending,true);eq(waiting.complete,false);eq(waiting.next.cursor,'0');eq(idleState,old);idleState=waiting.next;}
  pendingRequests=1;const activeWait=await readPage(idleClient,idleState);eq(activeWait.pollAfterMs,10000);eq(activeWait.next.followerIdleReads,0);
  const recoveredFans=await readPage({...idleClient,readWeb:async()=>({status_code:0,followers:[],has_more:false,min_time:'0',total:0,owner_follower_count:0})},idleState);eq(recoveredFans.next.followerIdleReads,0);eq(recoveredFans.complete,true);
  await reject(()=>readPage({...idleClient,readWeb:async()=>{throw Error('HTTP 403');}},idleState),/403/);
  // Authenticated main-process continuation boundary and idempotent replay.
  let clock = 10000, owner = 'qa-owner', uid = own, failOnce = false, changedDuringRead = false, made = 0, closed = 0, handler,imageHandler,followerWaiting=false,failPreparation=false;const diagnosticEvents=[],transportOptions=[];
  const account = { id: '00000000-0000-4000-8000-000000000001', platform: 'douyin', connectorSessionId: '00000000-0000-4000-8000-000000000002', nativeAccountKey: 'qa-handle' }, webContents = {};
  const authenticate = async (_token, id) => { if (id !== account.id) throw Error('账号不属于本人'); return { userId: owner, account: { ...account } }; };
  registerDouyinInteractions({ ipcMain: { handle(name, fn) { if(name==='matrix:douyin-interaction-image'){imageHandler=fn;return;}eq(name, 'matrix:douyin-interactions'); handler = fn; } }, getWindow: () => ({ webContents }), authenticate, diagnostics:{record(scope,event){diagnosticEvents.push(event);}},session: { fromPartition(partition) { eq(partition, 'persist:matrix-douyin-' + account.connectorSessionId); return {}; } }, now: () => clock, transportFactory: async options => { made++;transportOptions.push(options);if(failPreparation){options.onDiagnostic?.({stats:{followerPrepareStage:4,followerCollectorGeneration:8,followerInitTypeErrorMask:32768}});throw Error('准备官网采集页超时');} return { ...client, ownUid: uid, followerUi:true,diagnosticSnapshot:()=>({hint:'follower-list-missing',stats:{followerCollectorGeneration:7,followerDomPanels:1,followerDomRows:0,fanIndexStarted:1,pageJsTypeErrorMask:512}}),close() { closed++; }, async readWeb(kind, args) { if (changedDuringRead) owner = 'qa-other-owner';if(kind==='followers'&&followerWaiting)throw Object.assign(Error('等待官网粉丝面板渲染成员'),{readerCode:'NOT_READY'}); if (failOnce) { failOnce = false; throw Error('抖音只读接口未通过（平台码 500）'); } return client.readWeb(kind, args); } }; } });
  eq(typeof imageHandler,'function');
  const input = { accessToken: 'qa-token', accountId: account.id, kind: 'comments' }, event = { sender: webContents };
  ok((await handler({ sender: {} }, input)).error); eq(made, 0);
  for (const extra of [{ url: 'https://other.fixture.test' }, { workId: work(1) }, { kind: 'messages' },{refreshFollowers:true},{kind:'followers',refreshFollowers:'yes'},{kind:'followers',refreshFollowers:true,cursor:'invalid'},{kind:'followers',refreshFollowers:true,command:'cache'}]) { ok((await handler(event, { ...input, ...extra })).error); eq(made, 0); }
  let p = await handler(event, input); ok(p.nextCursor); eq(p.progress.worksFound, 2); eq(p.progress.worksCatalogComplete,false);
  clock += 5000; p = await handler(event, { ...input, cursor: p.nextCursor }); eq(p.progress.worksFound,3); eq(p.progress.worksCatalogComplete,true); eq(p.records,[]); const cursorA = p.nextCursor;
  clock += 5000; p = await handler(event, { ...input, cursor: cursorA }); eq(p.records[0].platformId, row(1).cid); const cursorB = p.nextCursor, calls = webCalls.length;
  clock += 5000; const replay = await handler(event, { ...input, cursor: cursorA }); eq(replay, p); eq(webCalls.length, calls);
  clock += 5000; owner = 'qa-different'; ok((await handler(event, { ...input, cursor: cursorB })).error); owner = 'qa-owner';
  clock += 5000; ok((await handler(event, { ...input, kind: 'followers', cursor: cursorB })).error);
  clock += 5000; uid = peer; ok((await handler(event, { ...input, cursor: cursorB })).error); uid = own;
  clock += 16000; failOnce = true; ok((await handler(event, { ...input, cursor: cursorB })).error.includes('500'));
  clock += 16000; p = await handler(event, { ...input, cursor: cursorB }); eq(p.works[0].platformId, work(2)); eq(p.works[0].readComplete, true); eq(p.complete, false); // New production policy previews another work before draining the first thread.
  clock += 5000; ok((await handler(event, { ...input, cursor: cursorA })).error); // Retired after advancing B.
  clock += 16000; changedDuringRead = true; ok((await handler(event, { ...input, cursor: p.nextCursor })).error); changedDuringRead = false; owner = 'qa-owner';
  clock += 31 * 60 * 1000; ok((await handler(event, { ...input, cursor: p.nextCursor })).error); eq(closed, made);
  eq(transportOptions.every(options=>options.refreshFollowers===undefined),true);
  eq(diagnosticEvents.some(event=>event.stats?.followerRefreshRequested),false);
  clock+=16000;followerWaiting=true;const pending=await handler(event,{...input,kind:'followers',refreshFollowers:true});eq(pending.error,undefined);eq(pending.complete,false);eq(pending.followerPending,true);ok(pending.nextCursor);eq(pending.records,[]);eq(transportOptions.at(-1).refreshFollowers,true);eq(transportOptions.at(-1).publicHandle,account.nativeAccountKey);
  const pendingEvent=diagnosticEvents.at(-1);eq(pendingEvent.code,'page-not-ready');eq(pendingEvent.stats.followerDomPanels,1);eq(pendingEvent.stats.fanIndexStarted,1);eq(pendingEvent.stats.pageJsTypeErrorMask,512);eq(pendingEvent.hint,'follower-list-missing');followerWaiting=false;
  eq(diagnosticEvents.find(event=>event.stage==='prepare'&&event.stats?.followerRefreshRequested&&event.code==='read-ok').stats,{followerRefreshRequested:true});
  eq(diagnosticEvents.find(event=>event.code==='collector-recreated').stats,{followerRefreshRequested:true,followerCollectorGeneration:7});
  clock+=16000;await handler(event,{...input,kind:'followers',cursor:pending.nextCursor});eq(transportOptions.at(-1).refreshFollowers,undefined);
  eq(diagnosticEvents.filter(event=>event.code==='collector-recreated').length,1);
  eq(transportOptions.filter(options=>options.kind==='comments').every(options=>options.onDiagnostic===undefined),true);
  clock+=16000;failPreparation=true;const preparation=await handler(event,{...input,kind:'followers'});eq(preparation.error.includes('超时'),true);eq(diagnosticEvents.at(-1).stage,'准备官网采集页');eq(diagnosticEvents.at(-1).code,'timeout');eq(diagnosticEvents.at(-1).stats,{followerPrepareStage:4,followerCollectorGeneration:8,followerInitTypeErrorMask:32768});failPreparation=false;
  // Real transport construction, injected read-only HTTPS only. No signing,
  // external requests or registered-device/token manufacture in this fixture.
  const cookies = new EventEmitter(); cookies.get = async () => [{ name: 'sessionid', domain: '.douyin.com', path: '/', value: 'qa-private-session' }];
  let paths = [], invalidProfile = false;
  const transport = await createTransport({ accountSession: { cookies }, publicHandle: 'qa-handle', assertCurrent: async () => {}, network: async (url, options) => {
    const u = new URL(url); paths.push(u.pathname);
    if (u.pathname.endsWith('/profile/self/')) return Buffer.from(JSON.stringify({ status_code: 0, user: { uid: own, unique_id: 'qa-handle', sec_uid: sec } }));
    if (u.pathname.endsWith('/im/user/info/')) { eq(u.hostname, 'www.douyin.com'); eq(u.searchParams.get('aid'), '6383'); eq(options.headers.Referer, 'https://www.douyin.com/'); eq(JSON.parse(new URLSearchParams(options.body.toString()).get('sec_user_ids')), [peerSec]); ok(options.headers['Content-Type'].startsWith('application/x-www-form-urlencoded')); return Buffer.from(JSON.stringify({ status_code: 0, data: [{ ...user, uid: invalidProfile ? own : peer }] })); }
    eq(options.body, undefined); eq(u.hostname, 'www.douyin.com'); if (u.pathname.endsWith('/follower/list/')) { eq(u.searchParams.get('user_id'), own); eq(u.searchParams.get('sec_user_id'), sec); }
    return Buffer.from(JSON.stringify({ status_code: 0, followers: [] }));
  } });
  const profiles = await transport.people([{ uid: peer, secUid: peerSec }]); eq(profiles[0].name, user.nickname); eq(profiles[0].uid, peer); invalidProfile = true; await reject(() => transport.people([{ uid: peer, secUid: peerSec }]), /身份与会话不一致/);
  await transport.readWeb('followers', { cursor: '0', offset: '0' }); const requestsBeforeInvalid = paths.length;
  for (const [kind, args] of [['publish', {}], ['followers', { user_id: peer }], ['comments', { workId: '1;delete', cursor: '0' }]]) await reject(() => transport.readWeb(kind, args));
  eq(paths.length, requestsBeforeInvalid); transport.close(); eq(cookies.listenerCount('changed'), 0);
  // Participant alias and profile lookup are keyed by UID+secUID, never nickname.
  const threadId = `0:1:${own}:${peer}`, shortId = '9007199254740999', rawThread = { conversationId: threadId, conversationShortId: shortId, conversationType: 1, firstPageParticipants: { participants: [{ userId: own, alias: '不得当成对方昵称', secUid: sec }, { userId: peer, secUid: peerSec }] } };
  const mapped = c.thread(rawThread, own); eq(mapped.peerSecUid, peerSec); eq(mapped.nameSource, 'fallback');
  eq(c.thread({ ...rawThread, firstPageParticipants: { participants: [{ userId: own, alias: '不得泄漏备注', secUid: sec }] } }, own).peerSecUid, undefined);
  let local = { threads: {}, messages: {}, init: { cursor: '0', done: false }, strangers: { cursor: '0', done: false }, frontier: {}, revision: 0 };
  const store = { get: () => local, commit(fn) { const next = structuredClone(local); fn(next); next.revision++; local = next; } };
  const fixture = { ownUid: own, close() {}, async connect({ onStatus }) { onStatus('connected'); return () => {}; }, async people(pairs) { eq(pairs, [{ uid: peer, secUid: peerSec }]); return profiles; }, async read(kind) { return kind === 'init' ? { conversations: [rawThread], messages: [], hasMore: false, cursor: '0' } : { messages: [], hasMore: false, cursor: '0' }; } };
  const engine = createEngine({ transport: fixture, store, assertCurrent: async () => {}, delay: async () => {} }); engine.start();
  for (let n = 0; n < 100 && engine.status().busy; n++) await new Promise(r => setTimeout(r, 1));
  eq(engine.status().historyComplete, true); eq(engine.threads()[0].name, user.nickname); eq(engine.threads()[0].avatarUrl, user.avatar_thumb.url_list[0]);
  eq(engine.status().profileNames, { total: 1, resolved: 1, missingSecUid: 0 });
  await engine.resume(); for (let n = 0; n < 100 && engine.status().busy; n++) await new Promise(r => setTimeout(r, 1)); // Fresh names are cached for one hour.
  eq(engine.status().profileNames.resolved, 1);
  store.commit(next => mergeThread(next, c.thread({ id: threadId, shortId, type: 1 }, own))); eq(engine.threads()[0].name, user.nickname); engine.close();
  console.log(JSON.stringify({ douyinInteractionChecks: checks, allOwnedWorksAndReplyPages: true, exactIdsAndOwnerBoundContinuations: true, retryAndReplayPreserveProgress: true, sourceTypeOneUsesMinTime: true, contactNamesByUidAndSecUid: true, realPlatformRequests: 0, businessWrites: 0, markReadRequests: 0, realUserProfileTouched: false }));
})().catch(e => { console.error(e); process.exitCode = 1; });
