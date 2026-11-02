// Independent profile worker ordering, cache, timeout recovery and cancellation.
const assert = require('node:assert/strict');
const { createEngine, mergeThread } = require('../desktop/douyin-inbox-engine.cjs');
const c = require('../desktop/douyin-inbox-codec.cjs');
let checks = 0; const eq = (a, b) => { assert.deepEqual(a, b); checks++; };
const own = '9007199254740993', peer = '9007199254740995', id = `0:1:${own}:${peer}`;
const raw = (uid = peer) => ({ id: `0:1:${own}:${uid}`, shortId: uid, type: 1, firstPageParticipants: { participants: [{ userId: uid, secUid: 'MS4wQa' + uid }] } });
const until = async fn => { for (let n = 0; n < 300; n++) { if (fn()) return; await new Promise(r => setImmediate(r)); } throw Error('Synthetic worker did not settle'); };
function setup(overrides = {}, saved = [], clock = () => Date.now()) {
  let local = { threads: {}, messages: {}, init: { cursor: '0', done: false }, strangers: { cursor: '0', done: false }, frontier: {}, revision: 0 }, calls = [], reads = [];
  for (const t of saved) mergeThread(local, c.thread(t, own));
  const store = { get: () => local, commit(fn) { const next = structuredClone(local); fn(next); next.revision++; local = next; } };
  const engine = createEngine({ store, assertCurrent: async () => {}, delay: async () => {}, now: clock, transport: { ownUid: own, close() {}, async connect() { return () => {}; }, async people(pairs) { calls.push(pairs); return pairs.map(p => ({ ...p, name: 'QA 姓名 ' + p.uid })); }, async read(kind, args) { reads.push(kind); return kind === 'init' ? { conversations: [raw()], hasMore: false, cursor: '0' } : { messages: [], hasMore: false, cursor: '0' }; }, ...overrides } });
  return { engine, store, calls, reads };
}
(async () => {
  let releasePage, batches = 0;
  let q = setup({ async people(pairs) { batches++; return pairs.map(p => ({ ...p, name: 'QA 提前取得' })); }, async read(kind, args) {
    if (kind === 'init' && args.cursor === '0') return { conversations: [raw()], hasMore: true, cursor: '2' };
    if (kind === 'init') return new Promise(resolve => releasePage = () => resolve({ conversations: [], hasMore: false, cursor: '3' }));
    return { messages: [], hasMore: false, cursor: '0' };
  } });
  q.engine.start(); await until(() => releasePage && q.engine.threads()[0]?.name === 'QA 提前取得'); eq(q.engine.status().busy, true); eq(q.engine.status().historyComplete, false); eq(batches, 1); releasePage(); await until(() => !q.engine.status().busy); eq(q.engine.status().historyComplete, true); q.engine.close();
  const saved = Array.from({ length: 70 }, (_, n) => raw(String(BigInt(peer) + BigInt(n * 2))));
  q = setup({}, saved); const priority = saved.at(-1).id; q.engine.messages(priority); q.engine.start(); await until(() => !q.engine.status().busy && !q.engine.status().profileBusy);
  eq(q.calls[0].length, 50); eq(q.calls[0][0].uid, saved.at(-1).shortId); eq(q.calls.length, 2); eq(q.engine.status().profileNames.resolved, 70); await q.engine.resume(); await until(() => !q.engine.status().busy); eq(q.calls.length, 2); q.engine.close();
  let time = 100000, failures = 0; q = setup({ async people() { failures++; throw Error('QA profile unavailable'); } }, [raw()], () => time);
  q.engine.start(); await until(() => !q.engine.status().busy && !q.engine.status().profileBusy); eq(q.engine.status().historyComplete, true); eq(q.engine.status().error, ''); eq(q.engine.status().profileError, 'QA profile unavailable'); eq(failures, 1);
  q.engine.messages(id); await q.engine.resume(); await until(() => !q.engine.status().busy); eq(failures, 1); time += 60001; q.engine.messages(id); await until(() => !q.engine.status().profileBusy); eq(failures, 2); q.engine.close();
  let emptyCalls = 0; q = setup({ async people() { emptyCalls++; return []; } }, [raw()]); q.engine.start(); await until(() => !q.engine.status().busy && !q.engine.status().profileBusy); eq(emptyCalls, 1); q.engine.messages(id); await until(() => !q.engine.status().profileBusy); eq(emptyCalls, 1); eq(q.engine.status().profileNames.resolved, 0); q.engine.close();
  let releaseNames; q = setup({ people: pairs => new Promise(resolve => releaseNames = () => resolve(pairs.map(p => ({ ...p, name: 'QA late forbidden' })))) }, [raw()]); q.engine.messages(id); await until(() => !!releaseNames); q.engine.close(); const before = structuredClone(q.store.get()); releaseNames(); await until(() => !q.engine.status().profileBusy); eq(q.store.get(), before);
  q = setup({ async people(pairs) { return [{ ...pairs[0], uid: '123', name: 'QA other user' }]; } }, [raw()]); q.engine.start(); await until(() => !q.engine.status().busy && !q.engine.status().profileBusy); eq(q.engine.status().profileNames.resolved, 0); eq(q.engine.status().historyComplete, true); q.engine.close();
  q=setup({async read(kind){return kind==='init'?{hasMore:false,cursor:'0',conversations:[{id:'700',shortId:'701',type:2,name:'QA群'}],messages:[{conversationId:'700',conversationShortId:'701',conversationType:2,serverMessageId:'702',sender:peer,secSender:'MS4wQaGroupMember',content:'{"text":"QA群正文"}',messageType:7,indexInConversation:'1'}]}:{messages:[],hasMore:false,cursor:'0'};}});
  q.engine.start();await until(()=>!q.engine.status().busy&&!q.engine.status().profileBusy);const groupMessage=q.engine.messages('700').messages[0];eq(groupMessage.senderName,'QA 姓名 '+peer);eq(groupMessage.senderSecUid,undefined);eq(groupMessage.rawContent,undefined);eq(q.calls.some(batch=>batch.some(p=>p.uid===peer&&p.secUid==='MS4wQaGroupMember')),true);eq(q.engine.threads()[0].messageRevision>0,true);q.engine.close();
  console.log(JSON.stringify({ checks, nameBeforeDirectoryEnd: true, selectedThreadFirst: true, oneWorkerPerAccount: true, historyIndependentOfNameFailure: true, negativeCacheAndLateResultGuards: true, realNetwork: 0, sends: 0, markRead: 0 }));
})().catch(e => { console.error(e); process.exitCode = 1; });
