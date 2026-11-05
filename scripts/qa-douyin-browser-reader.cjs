// Synthetic website runtime and sessions only: no real browser profile/network.
const assert = require('node:assert/strict'), vm = require('node:vm'), { EventEmitter } = require('node:events');
const { pageRead, blockedRequest, pageTypeErrorMask, createBrowserReader, endpoints } = require('../desktop/douyin-browser-reader.cjs');
const { initial, readPage } = require('../desktop/douyin-interactions.cjs');
const { projectCommentMedia } = require('../desktop/douyin-creator-preload.cjs');
const { projectFollowerUser } = require('../desktop/douyin-followers-preload.cjs');
let checks = 0; const eq = (a, b) => { assert.deepEqual(a, b); checks++; }, ok = v => { assert.ok(v); checks++; };
const own = '9007199254740993', peer = '9007199254740995', sec = 'MS4wQaOwn';
function fixture() {
  const state = { calls: [], handle: 'qa-handle', uid: own, origin: 'https://www.douyin.com', path: '/user/self', verify: false, wrongAfter: false, camel: true, duplicate: false, status: 0 };
  const data = {
    followers: { statusCode: 0, hasMore: true, recHasMore: false, followList: [{ userId: peer, secUid: 'MS4wQaPeer', nickName: 'QA 粉丝昵称', avatarThumb: { urlList: ['https://image.fixture/avatar'] } }], minTime: '1790000000', offset: 1, total: 2 },
    works: { statusCode: 0, hasMore: false, awemeList: [{ awemeId: '9007199254740000100', desc: 'QA 本人作品', author: { userId: own, nickName: 'QA 本人' } }], maxCursor: '0' },
    comments: { statusCode: 0, hasMore: false, comments: [{ commentId: '9007199254740000200', awemeId: '9007199254740000100', text: 'QA 评论', user: { userId: peer, nickName: 'QA 评论人' }, createTime: 1790000000, replyCommentTotal: 1, replyComment: [{ commentId: '9007199254740000201', text: 'QA 回复', user: { userId: own }, createTime: 1790000000 }] }], cursor: '0' },
    replies: { status_code: 0, has_more: 0, comments: null, cursor: '0', total: 0 },
  };
  const run = async (kind, args) => {
    state.calls.push([kind, args]);
    if (kind === 'self') return { status_code: state.status, user: { uid: state.wrongAfter && state.calls.length > 1 ? peer : state.uid, unique_id: state.handle, sec_uid: sec,...(state.selfMetricSamples?.shift() ?? state.selfMetrics) } };
    return structuredClone(data[kind]);
  };
  // Function source includes its exact endpoint as a real webpack export does.
  const exports = Object.fromEntries(Object.entries(endpoints).map(([kind, route]) => [kind, { read: new Function('run', `return async function(args) { const route = ${JSON.stringify(route)}; return run(${JSON.stringify(kind)}, args); }`)(run) }]));
  const runtime = key => exports[key]; runtime.m = Object.fromEntries(Object.entries(endpoints).map(([key, route]) => [key, new Function(`return ${JSON.stringify(route)}`)]));
  const chunks = []; chunks.push = row => row[2](runtime);
  const context = { URLSearchParams, location: { get origin() { return state.origin; }, get pathname() { return state.path; } }, document: { querySelector: () => null, querySelectorAll: () => state.verify ? [{ name: 'captcha', getBoundingClientRect: () => ({ width: 10 }) }] : [] }, window: { webpackChunkdouyin_web: chunks } };
  let customFetch;
  // Ordinary identity transport is independent of the fixture's webpack API.
  // Existing endpoint-specific fetch fixtures may explicitly replace identity
  // by deleting that fixture module; no production fallback is involved.
  Object.defineProperty(context,'fetch',{get:()=>async(url,options)=>{
    if(String(url).includes(endpoints.self)&&runtime.m.self){state.selfGets=(state.selfGets||0)+1;return {status:200,text:async()=>JSON.stringify(await run('self',{}))};}
    if(customFetch)return customFetch(url,options);
    throw Error('Unconfigured synthetic GET');
  },set:fn=>{customFetch=fn;}});
  context.URL=URL;
  context.TextEncoder=TextEncoder;context.TextDecoder=TextDecoder;
  const read = async (kind, args = {}, extra = {}) => JSON.parse(JSON.stringify(await vm.runInNewContext(`(${pageRead.toString()})(${JSON.stringify({ kind, args, handle: 'qa-handle', ...extra })},(${projectCommentMedia.toString()}))`, context)));
  return { state, data, read, exports, runtime, context };
}
function sourceSession() {
  const cookies = new EventEmitter(); cookies.rows = [{ domain: '.douyin.com', path: '/', name: 'sessionid', value: 'qa-private-cookie', secure: true, httpOnly: true }]; cookies.get = async () => structuredClone(cookies.rows);
  return { cookies, cleared:0, webRequest:{onBeforeRequest(fn){this.before=fn;},onCompleted(fn){this.completed=fn;},onErrorOccurred(fn){this.failed=fn;}},clearStorageData(){throw Error('Bound account storage must not be cleared');} };
}
function managerFixture(options = {}) {
  const source = sourceSession(), pages = [], sessions = [], readerFixture = fixture(); let checksCurrent = 0;
  const reader = createBrowserReader({ idleMs: 100000, timeoutMs: 40, ...options,
    createSession(name) { const s = { name, values: [], cleared: 0, cookies: { async set(c) { s.values.push(c); if (options.beforeCopy) await options.beforeCopy(); } }, webRequest: { onBeforeRequest(fn) { s.before = fn; } }, async clearStorageData() { s.cleared++; } }; sessions.push(s); return s; },
    createWindow(accountSession) { assert.equal(accountSession,source);const wc = new EventEmitter(), win = { accountSession, webContents: wc, destroyed: false, isDestroyed() { return win.destroyed; }, destroy() { win.destroyed = true; }, async loadURL(url) { win.url = url; } }; wc.id=pages.length+1;wc.setAudioMuted = v => wc.muted = v; wc.setWindowOpenHandler = fn => wc.popup = fn; wc.executeJavaScript = code => options.execute ? options.execute(code, readerFixture, wc) : vm.runInNewContext(code, readerFixture.context); pages.push(win); return win; },
  });
  const acquire = (extra={}) => reader.acquire({ accountSession: source, publicHandle: 'qa-handle', ...extra, assertCurrent: async () => { checksCurrent++; if(options.beforeCheck)await options.beforeCheck();if (options.ownerFailed) throw Error('owner changed'); } });
  return { reader, source, pages, sessions, readerFixture, acquire, checksCurrent: () => checksCurrent };
}
(async () => {
  {const sample=fixture();let calls=0;sample.exports.self.read=()=>{calls++;return new Promise(()=>{});};const result=await sample.read('self');eq(result.ownUid,own);eq(calls,0);eq(sample.state.selfGets,1);}
  {const sample=fixture();sample.state.status=-999;const result=await sample.read('followers');eq(result.platformCode,-999);eq(result.code,'API');eq(sample.state.calls.map(row=>row[0]),['self']);eq(sample.state.selfGets,1);}
  {const sample=fixture();sample.data.followers={status_code:-999};const result=await sample.read('followers');eq(result.platformCode,-999);eq(sample.state.calls.map(row=>row[0]),['self','followers']);eq(sample.state.selfGets,1);}
  {const sample=fixture();let discovered=0;sample.context.window.webpackChunkdouyin_web.push=()=>{discovered++;throw Error('No identity SDK lookup');};eq((await sample.read('self')).ok,true);eq(discovered,0);}
  for(const [value,wanted] of [[13763,13763],['13763',13763],[0,0],['0',0],['1.4万',undefined],['1e4',undefined],[-1,undefined],[1.2,undefined],[2147483648,undefined],[null,undefined],[undefined,undefined]]) {
    const sample=fixture();sample.state.selfMetrics={follower_count:value,mplatform_followers_count:999999};const result=await sample.read('self');eq(result.ok,true);eq(result.metrics?.followersCount,wanted);
    eq(sample.state.calls.map(row=>row[0]),['self']);
  }
  {const sample=fixture();sample.state.selfMetrics={followerCount:'13763'};eq((await sample.read('self')).metrics.followersCount,13763);}
  for(const [before,after,wanted] of [[2,2,2],[0,0,0],[13763,13763,13763],[2,3,undefined],[undefined,2,undefined],[2,undefined,undefined]]) {
    const sample=fixture();sample.state.selfMetricSamples=[{follower_count:before},{follower_count:after}];const result=await sample.read('followers',{cursor:'0',offset:'0',sourceType:'1'});eq(result.ok,true);eq(result.data.owner_follower_count,wanted);eq(sample.state.calls.map(row=>row[0]),['self','followers','self']);
  }
  let f = fixture(), out = await f.read('followers', { cursor: '0', offset: '0', sourceType: '2' }); eq(out.ok, true); eq(out.ownUid, own); eq(out.data.followers[0].nickname, 'QA 粉丝昵称'); eq(out.data.min_time, '1790000000'); eq(out.data.rec_has_more, false);
  eq(f.state.calls.map(r => r[0]), ['self', 'followers', 'self']); eq(f.state.calls[1][1].user_id, own); eq(f.state.calls[1][1].source_type, 2);
  eq(out.data.followers[0].avatar_thumb.url_list,['https://image.fixture/avatar']);
  for(const source of [{uid:peer},{uid:peer,desc:'QA normalized biography',follow_time:'1790000000'},{uid:peer,signature:'',follow_time:0},{uid:peer,follow_time:'bad'}]){
    const sample=fixture(),projected=projectFollowerUser(source);sample.data.followers.followList=[projected];const result=await sample.read('followers');eq(result.data.followers[0].followerDetailState,projected.followerDetailState);eq(result.data.followers[0].follow_time,projected.follow_time);
  }
  for(const avatar of [{avatar_thumb:{url_list:'https://image.fixture/string-list'}},{avatar:{url:'https://image.fixture/nested'}},{avatar_168x168:{url_list:['https://image.fixture/sized']}},{avatar_300x300:{src:'https://image.fixture/sized-src'}}]) {const sample=fixture();sample.data.followers.followList=[{userId:peer,nickname:'QA',...avatar}];const result=await sample.read('followers');eq(result.ok,true);eq(result.data.followers[0].avatar_thumb.url_list.length,1);}
  {const sample=fixture();sample.context.document.title='抖音安全验证';const result=await sample.read('followers');eq(result.ok,false);eq(result.code,'VERIFY');eq(sample.state.calls,[]);}
  {const sample=fixture();delete sample.runtime.m.self;delete sample.runtime.m.followers;let gets=0;sample.context.fetch=async url=>{gets++;return {status:200,text:async()=>String(url).includes('/profile/self/')?'{"status_code":0,"user":{"uid":'+own+',"unique_id":"qa-handle","sec_uid":"'+sec+'","follower_count":13763}}':'{"status_code":0,"has_more":false,"followers":[{"uid":'+peer+',"nickname":"QA '+peer+'","avatar_thumb":{"url_list":["https://p1.byteimg.com/qa-numeric-follower"]}}],"min_time":0,"total":13763}'};};const result=await sample.read('followers',{cursor:'0',offset:'0',sourceType:'1'});eq(result.ok,true);eq(result.ownUid,own);eq(result.data.followers[0].uid,peer);eq(result.data.followers[0].nickname,'QA '+peer);eq(result.data.owner_follower_count,13763);eq(result.data.followers[0].avatar_thumb.url_list.length,1);eq(gets,3);}
  for(const avatar of [{avatarThumb:'https://image.fixture/string'},{avatarMedium:{urlList:['https://image.fixture/medium']}},{avatarUrl:'https://image.fixture/direct'},{avatar_uri:'https://p1.byteimg.com/qa-supplied-portrait'}]) {const sample=fixture();sample.data.followers.followList=[{userId:peer,nickname:'QA',...avatar}];const result=await sample.read('followers');eq(result.data.followers[0].avatar_thumb.url_list.length,1);}
  const stage1 = await readPage({ ownUid: own, readWeb: async () => out.data }, { ...initial('followers'), sourceType: '2' }); eq(stage1.complete, false); eq(stage1.next.sourceType, '1'); eq(stage1.next.cursor, '0');
  f.data.followers = { status_code: 0, has_more: 1, followers: [{ uid: peer, nickname: 'QA' }], min_time: '1780000000', offset: 20 };
  out = await f.read('followers', { cursor: '0', offset: '0', sourceType: '1' }); eq(out.ok, true);
  const stage2 = await readPage({ ownUid: own, readWeb: async () => out.data }, stage1.next); eq(stage2.next.cursor, '1780000000'); eq(stage2.complete, false);
  f.data.followers = { statusCode: 0, hasMore: false, followList: null, total: 0 }; eq((await f.read('followers')).data.followers, null);
  out = await f.read('works'); eq(out.ok, true); eq(out.data.aweme_list[0].aweme_id, '9007199254740000100'); eq(out.data.aweme_list[0].author.uid, own);
  out = await f.read('comments', { workId: '9007199254740000100' }); eq(out.data.comments[0].reply_comment[0].cid, '9007199254740000201'); eq(out.data.comments[0].user.nickname, 'QA 评论人');
  eq((await f.read('replies', { workId: '1', commentId: '2' })).data.comments, null);
  for (const [key, val, code] of [['origin', 'https://fixture.test', 'ORIGIN'], ['path', '/chat', 'ORIGIN'], ['verify', true, 'VERIFY'], ['handle', 'other', 'OWNER'], ['uid', 0, 'OWNER'], ['wrongAfter', true, 'OWNER'], ['status', null, 'SHAPE'], ['status', 8, 'API']]) { f = fixture(); f.state[key] = val; eq((await f.read('works')).code, code); }
  f = fixture(); delete f.runtime.m.works; const ordinaryRequests = [];
  f.context.fetch = async (url, options) => { ordinaryRequests.push([url, options]); return { status: 200, text: async () => JSON.stringify(f.data.works) }; };
  eq((await f.read('works')).ok, true); eq(ordinaryRequests.length, 1);
  const direct = new URL(ordinaryRequests[0][0], 'https://www.douyin.com'); eq(direct.pathname, endpoints.works); eq(direct.searchParams.get('sec_user_id'), sec); eq(direct.searchParams.get('max_cursor'), '0'); eq(direct.searchParams.get('aid'), '6383'); eq(ordinaryRequests[0][1].credentials, 'same-origin'); eq(ordinaryRequests[0][1].method, 'GET');
  f.context.fetch = async () => ({ status: 403 }); eq((await f.read('works')).code, 'READ_HTTP');
  f.context.fetch = async () => ({ status: 200, text: async () => '<html>verification</html>' }); eq((await f.read('works')).code, 'READ_JSON');
  for(const [body,classification]of [['',1],['<!doctype html><html>QA denied</html>',2],['{"broken":',3],['for(;;);{"status_code":0}',4],['\u0000QA',5],['QA other text',6]]){
    f.context.fetch=async()=>({status:200,headers:{get:key=>key==='content-type'?'text/html;charset=utf-8':key==='content-encoding'?'br':null},text:async()=>body});
    const result=await f.read('works');eq(result.code,'READ_JSON');eq(result.pageState.responseBodyKind,classification);eq(result.pageState.responseBytes,new TextEncoder().encode(body).length);eq(result.pageState.responseMime,2);eq(result.pageState.responseEncoding,2);eq(JSON.stringify(result).includes(body)&&body.length>10,false);
  }
  f.context.fetch=async()=>({status:200,text:async()=>'\uFEFF'+JSON.stringify(f.data.works)});eq((await f.read('works')).ok,true);
  let rejectedGets = 0; f.context.fetch = async () => { rejectedGets++; return { status: 200, text: async () => JSON.stringify({ status_code: 5 }) }; }; eq((await f.read('works')).platformCode, 5); eq(rejectedGets, 1);
  f = fixture(); delete f.runtime.m.comments; f.context.fetch = async (url, options) => { const u = new URL(url, 'https://www.douyin.com'); eq(u.searchParams.get('aweme_id'), '9007199254740000100'); eq(u.searchParams.get('item_type'), '0'); return { status: 200, text: async () => JSON.stringify(f.data.comments) }; }; eq((await f.read('comments', { workId: '9007199254740000100' })).data.comments[0].text, 'QA 评论');
  f = fixture(); delete f.runtime.m.self; let selfGets = 0;
  f.context.fetch = async (url, options) => { selfGets++; eq(url, '/aweme/v1/web/user/profile/self/?aid=6383&device_platform=webapp&channel=channel_pc_web'); eq(options.method, 'GET'); return { status: 200, text: async () => JSON.stringify({ status_code: 0, user: { uid: own, unique_id: 'qa-handle', sec_uid: sec } }) }; };
  eq((await f.read('works')).ok, true); eq(selfGets, 2);
  f.context.fetch = async () => ({ status: 403 }); eq((await f.read('works')).code, 'PROFILE_HTTP');
  f.context.fetch = async () => ({ status: 200, text: async () => '<html>verify</html>' }); eq((await f.read('works')).code, 'PROFILE_JSON');
  f = fixture(); f.context.fetch = () => { throw Error('must not fall back after platform denial'); }; f.state.status = 8; out = await f.read('works'); eq(out.code, 'API'); eq(out.platformCode, 8);
  f = fixture(); f.exports.duplicate = { ...f.exports.works, read: new Function('return async function(){ const x="/aweme/v1/web/aweme/post/"; return {}; }')() }; f.runtime.m.duplicate = f.runtime.m.works; eq((await f.read('works')).code, 'AMBIGUOUS');
  f = fixture(); f.data.works.awemeList[0].awemeId = Number('9007199254740000100'); eq((await f.read('works')).code, 'SHAPE');
  f = fixture(); eq((await f.read('followers', { offset: '9007199254740993' })).code, 'SHAPE'); eq((await f.read('followers', { sourceType: '3' })).code, 'SHAPE');
  f = fixture(); f.data.followers.followList[0].privateAuth = 'fixture-secret'; ok(!JSON.stringify(await f.read('followers')).includes('fixture-secret'));
  const blocked = ['https://imapi.douyin.com/v1/inbox', 'https://imapi-hl.douyin.com/v1/inbox', 'wss://frontier-im.douyin.com/ws', 'https://www.douyin.com/aweme/v1/web/im/user/info/', 'https://www.douyin.com/aweme/v1/web/comment/publish/', 'https://www.douyin.com/message/send', 'https://www.douyin.com/mark_read', 'https://www.douyin.com/a?is_mark_read=1', 'http://www.douyin.com/a', 'file:///C:/Windows/a'];
  for (const url of blocked) eq(blockedRequest({ url, method: 'GET' }), true);
  for (const url of ['https://www.douyin.com/user/self', ...Object.values(endpoints).map(p => 'https://www.douyin.com' + p), 'https://lf.douyincdn.com/web.js']) eq(blockedRequest({ url, method: 'GET' }), false);
  eq(blockedRequest({ url: 'https://www.douyin.com/a', method: 'POST' }), true);
  for (const url of ['https://www.douyin.com/aweme/v1/web/notice/count/', 'https://www.douyin.com/aweme/v1/web/notice/fans/', 'https://www.douyin.com/notification/read', 'https://www.douyin.com/aweme/v1/web/unrecognized-state-changing-get/', 'https://fixture.test/notification-clear']) eq(blockedRequest({ url, method: 'GET', resourceType: 'xhr' }), true);
  eq(blockedRequest({ url: 'https://www.douyin.com/aweme/v1/web/user/follower/list/', method: 'GET', resourceType: 'xhr' }), false);
  eq(blockedRequest({ url: 'https://fixture.test/telemetry', method: 'GET', resourceType: 'fetch' }), true);
  for(const type of ['xhr','fetch'])for(const url of ['https://lf.douyincdn.com/sdk-glue.js','https://lf3-static.douyinstatic.com/obj/web/assets/own.css','https://p1.byteimg.com/avatar.webp'])eq(blockedRequest({url,method:'GET',resourceType:type}),false);
  for(const url of ['https://www.douyin.com/api/state.js','https://lf.douyincdn.com/notification.js','https://lf.douyincdn.com/sdk.js?mark_read=1','https://lf.douyincdn.com/api/state.js','https://douyincdn.com.fixture.test/a.js','https://lf.douyincdn.com/unrecognized-state'])eq(blockedRequest({url,method:'GET',resourceType:'fetch'}),true);
  eq(blockedRequest({url:'https://lf.douyincdn.com/sdk.js',method:'POST',resourceType:'fetch'}),true);
  let m = managerFixture(), client = await m.acquire(); eq(client.ownUid, own); eq(m.pages.length, 1); eq(m.pages[0].webContents.muted, true); eq(m.pages[0].webContents.popup(), { action: 'deny' }); eq(m.sessions.length,0);eq(m.pages[0].accountSession,m.source);
  eq((await client.readWeb('works', { cursor: '0' })).aweme_list.length, 1); await assert.rejects(() => client.readWeb('self'), /参数/); checks++; await assert.rejects(() => client.readWeb('works', { url: 'https://other' }), /参数/); checks++;
  m.readerFixture.state.selfMetrics={follower_count:13763};eq((await client.readMetrics()).metrics.followersCount,13763);eq((await client.readMetrics()).source,'douyin-self-profile');
  delete m.readerFixture.state.selfMetrics;await assert.rejects(()=>client.readMetrics(),/精确粉丝数/);checks++;
  await assert.rejects(m.acquire, /另一页/); checks++; client.close(); await assert.rejects(() => client.readWeb('works'), /结束/); checks++;
  await assert.rejects(()=>client.readMetrics(),/结束/);checks++;
  client = await m.acquire(); eq(m.pages.length, 1); m.source.cookies.emit('changed', {}, { ...m.source.cookies.rows[0] }, 'explicit', false); eq(m.pages[0].destroyed, false);
  m.source.cookies.rows[0].value = 'qa-replaced'; m.source.cookies.emit('changed', {}, { ...m.source.cookies.rows[0] }, 'explicit', false); eq(m.pages[0].destroyed, true); await assert.rejects(() => client.readWeb('works'), /身份/); checks++; m.reader.close();
  m=managerFixture();client=await m.acquire();
  eq(client.diagnosticSnapshot().stats.followerCollectorGeneration,1);
  await assert.rejects(()=>m.acquire({refreshFollowers:true}),/另一页/);checks++;eq(m.pages[0].destroyed,false);eq(m.pages.length,1);
  client.close();client=await m.acquire();eq(m.pages.length,1);client.close();
  client=await m.acquire({refreshFollowers:true});eq(m.pages.length,2);eq(m.pages[0].destroyed,true);eq(m.pages[1].accountSession,m.source);eq(m.source.cleared,0);eq(m.sessions.length,0);eq(client.diagnosticSnapshot().stats.followerCollectorGeneration,2);client.close();
  client=await m.acquire();eq(m.pages.length,2);eq(client.diagnosticSnapshot().stats.followerCollectorGeneration,2);client.close();
  await assert.rejects(()=>m.acquire({refreshFollowers:'yes'}),/参数/);checks++;eq(m.pages[1].destroyed,false);
  m.reader.close();
  m=managerFixture();client=await m.acquire();client.close();m.reader.close();
  await assert.rejects(()=>m.acquire({refreshFollowers:true}),/关闭/);checks++;eq(m.pages.length,1);
  m = managerFixture({ execute: () => new Promise(() => {}) }); await assert.rejects(m.acquire, /超时/); checks++; eq(m.pages[0].destroyed, true); m.reader.close();
  m=managerFixture({execute(code,f,wc){if(code.startsWith('(()=>{const value=window.__matrixReaderProgress;'))return {phase:'self-body'};const token=/"traceToken":"([a-f0-9-]+)"/.exec(code)?.[1];wc.emit('console-message',{},0,'matrix-read-stage:'+token+':self-body');wc.emit('console-message',{},0,'matrix-read-stage:'+token+':PRIVATE_SECRET');m.source.webRequest.before({webContentsId:wc.id,url:'https://www.douyin.com'+endpoints.self+'?private=NEVER_EXPORTED',method:'GET',resourceType:'xhr'},()=>{});m.source.webRequest.completed({webContentsId:wc.id,url:'https://www.douyin.com'+endpoints.self,statusCode:200});return new Promise(()=>{});}});
  await assert.rejects(m.acquire,error=>/读取本人资料响应正文/.test(error.message)&&/资料GET=1\/1\/0/.test(error.message)&&/HTTP=200/.test(error.message)&&!/PRIVATE_SECRET|NEVER_EXPORTED/.test(error.message));checks++;eq(m.pages[0].destroyed,true);m.reader.close();
  let releaseCheck; m = managerFixture({ beforeCheck: () => new Promise(r => releaseCheck = r) }); const pending = m.acquire(); while (!releaseCheck) await new Promise(r => setImmediate(r)); m.reader.close(); releaseCheck(); await assert.rejects(() => pending, /关闭/); checks++; eq(m.pages.length, 0);eq(m.sessions.length,0);eq(m.source.cleared,0);
  m = managerFixture(); const pendingA = m.acquire(); await assert.rejects(m.acquire, /另一页/); checks++; client = await pendingA; client.close(); m.reader.close(); eq(m.pages[0].destroyed, true);
  let lazyCalls = 0; m = managerFixture({ serviceWaitMs: 1, execute(code, f) { if (code.includes('"kind":"works"') && ++lazyCalls < 3) return { ok: false, code: 'NOT_READY', error: 'QA lazy service' }; return vm.runInNewContext(code, f.context); } }); client = await m.acquire(); eq((await client.readWeb('works', { cursor: '0' })).aweme_list.length, 1); eq(lazyCalls, 3); client.close(); m.reader.close();
  let deniedCalls = 0; m = managerFixture({ serviceWaitMs: 1, execute(code, f) { if (code.includes('"kind":"works"')) { deniedCalls++; return { ok: false, code: 'API', platformCode: 2099, error: 'QA platform denial' }; } return vm.runInNewContext(code, f.context); } }); client = await m.acquire(); await assert.rejects(() => client.readWeb('works', { cursor: '0' }), /作品目录.*2099/); checks++; eq(deniedCalls, 1); client.close(); m.reader.close();
  let challengeCalls=0;m=managerFixture({execute(code,f){if(code.includes('"kind":"followers"')){challengeCalls++;return{ok:false,code:'READ_JSON',error:'未返回JSON',pageState:{scripts:2,workLinks:0,ownLists:0,bodyNodes:8,titleVerification:true,runtime:false}};}return vm.runInNewContext(code,f.context);}});client=await m.acquire();await assert.rejects(()=>client.readWeb('followers',{cursor:'0',offset:'0',sourceType:'1'}),/页面验证.*账号管理.*手动刷新/);checks++;eq(challengeCalls,1);eq(m.pages[0].destroyed,true);client.close();m.reader.close();
  m=managerFixture({execute(code,f){if(code.includes('"kind":"followers"'))return{ok:false,code:'API',error:'尚未识别官网本人主页的粉丝入口 PRIVATE_SECRET'};return vm.runInNewContext(code,f.context);}});client=await m.acquire();await assert.rejects(()=>client.readWeb('followers',{cursor:'0',offset:'0',sourceType:'1'}),/粉丝入口/);checks++;eq(client.diagnosticSnapshot().hint,'follower-entry-missing');eq(client.diagnosticSnapshot().stats.followerStarted,0);eq(JSON.stringify(client.diagnosticSnapshot()).includes('PRIVATE_SECRET'),false);client.close();m.reader.close();
  const score='https://www.douyin.com/web/api/creator/monetize/active_fans/fans_score_info';
  eq(pageTypeErrorMask("TypeError: Cannot read properties of undefined (reading 'title_text')"),1);eq(pageTypeErrorMask("TypeError: Cannot read properties of undefined (reading 'content') PRIVATE_BODY"),2);eq(pageTypeErrorMask('TypeError: PRIVATE_SECRET'),128);eq(pageTypeErrorMask('PRIVATE_SECRET'),0);eq(pageTypeErrorMask(null),0);
  eq(pageTypeErrorMask('TypeError: PRIVATE_FUNCTION is not a function'),256);eq(pageTypeErrorMask("TypeError: Cannot read properties of undefined (reading 'impr_id')"),512);eq(pageTypeErrorMask("TypeError: Cannot read properties of undefined (reading 'PRIVATE_KEY')"),128);
  eq(pageTypeErrorMask("TypeError: Cannot destructure property 'uid' of 'PRIVATE_VALUE' as it is undefined."),32768);eq(pageTypeErrorMask('TypeError: Cannot destructure property "sec_uid" of PRIVATE_VALUE as it is null.'),65536);eq(pageTypeErrorMask("TypeError: Cannot destructure property 'PRIVATE_FIELD' of undefined."),128);
  eq(pageTypeErrorMask("TypeError: Cannot read properties of undefined (reading 'version_code')"),131072);
  try{vm.runInNewContext('const {uid}=undefined');throw Error('Expected synthetic native exception');}catch(error){eq(pageTypeErrorMask(String(error)),32768);}
  const stages=[];m=managerFixture();client=await m.acquire({onDiagnostic:value=>stages.push(value)});eq([...new Set(stages.map(value=>value.stats.followerPrepareStage))],[1,2,3,4,5]);eq(stages.at(-1).stats.followerCollectorGeneration,1);eq(client.diagnosticSnapshot().stats.followerPrepareStage,5);client.close();m.reader.close();
  const failedStages=[];m=managerFixture({execute:()=>new Promise(()=>{})});await assert.rejects(()=>m.acquire({onDiagnostic:value=>failedStages.push(value)}),/超时/);checks++;eq(failedStages.at(-1).stats.followerPrepareStage,6);eq(failedStages.at(-1).stats.followerCollectorGeneration,1);m.reader.close();
  m=managerFixture();client=await m.acquire({onDiagnostic(){throw Error('QA observer failure');}});eq(client.ownUid,own);client.close();m.reader.close();
  m=managerFixture({execute(code,f,wc){if(code.includes('"kind":"followers"'))wc.emit('console-message',{},3,"TypeError: Cannot destructure property 'uid' of 'PRIVATE_VALUE' as it is undefined.");return vm.runInNewContext(code,f.context);}});client=await m.acquire();
  m.pages[0].webContents.emit('console-message',{},3,'TypeError: PRIVATE_EARLY_ERROR');eq(client.diagnosticSnapshot().stats.followerInitTypeErrorMask,0);
  await client.readWeb('followers',{cursor:'0',offset:'0',sourceType:'1'});eq(client.diagnosticSnapshot().stats.followerInitTypeErrorMask,32768);eq(JSON.stringify(client.diagnosticSnapshot()).includes('PRIVATE_'),false);client.close();m.reader.close();
  m=managerFixture();client=await m.acquire();m.pages[0].webContents.emit('console-message',{},3,"TypeError: Cannot read properties of undefined (reading 'title_text') PRIVATE_BODY");eq(client.diagnosticSnapshot().stats.pageJsTypeErrorMask,1);eq(JSON.stringify(client.diagnosticSnapshot()).includes('PRIVATE_BODY'),false);
  m.source.webRequest.before({webContentsId:m.pages[0].webContents.id,url:score+'?is_pc=true',method:'GET',resourceType:'fetch'},()=>{});m.source.webRequest.completed({webContentsId:m.pages[0].webContents.id,url:score+'?is_pc=true',statusCode:200});eq(client.diagnosticSnapshot().stats.fanIndexStarted,1);eq(client.diagnosticSnapshot().stats.fanIndexCompleted,1);eq(client.diagnosticSnapshot().stats.fanIndexStatus,200);client.close();m.reader.close();
  // A native-scoped permission can initiate only a previously unrequested
  // empty list. Any observed start/completion/failure/block disables it.
  for(const prior of ['none','started','completed','failed','blocked']){
    const permissions=[];m=managerFixture({requireFollowerResponses:true,execute(code,f){if(code.includes('"kind":"followers"')){permissions.push(code.includes('"allowFollowerInitialScroll":true'));return {ok:true,ownUid:own,data:{followers:[],has_more:true,min_time:'0',offset:'0'}};}return vm.runInNewContext(code,f.context);}});client=await m.acquire();
    const details={webContentsId:m.pages[0].webContents.id,url:'https://www.douyin.com'+endpoints.followers,method:'GET',resourceType:'xhr'};
    if(prior==='started')m.source.webRequest.before(details,()=>{});
    if(prior==='completed')m.source.webRequest.completed({...details,statusCode:200});
    if(prior==='failed')m.source.webRequest.failed({...details,error:'net::ERR_FAILED'});
    if(prior==='blocked')m.source.webRequest.before({...details,url:details.url+'?mark_read=1'},()=>{});
    await client.readWeb('followers',{cursor:'0',offset:'0',sourceType:'1'});eq(permissions,[prior==='none']);client.close();m.reader.close();
  }
  const evidence=[];m=managerFixture({initializationEvidence:e=>evidence.push(e)});client=await m.acquire();const asset='https://lf-douyin-pc-web.douyinstatic.com/obj/web/client-entry.1234abcd.js';
  m.pages[0].webContents.emit('console-message',{},3,'TypeError: PRIVATE_BODY',1,asset);eq(evidence,[{generation:1,phase:'page-startup',category:'type-error',line:1,column:0,mask:128,source:asset}]);eq(JSON.stringify(evidence).includes('PRIVATE'),false);
  m.pages[0].webContents.emit('console-message',{},3,'TypeError: PRIVATE_BODY',1,asset+'?cookie=PRIVATE');m.pages[0].webContents.emit('console-message',{},3,'TypeError: PRIVATE_BODY',1,'https://www.douyin.com/user/PRIVATE');m.pages[0].webContents.emit('console-message',{},1,'TypeError: PRIVATE_BODY',1,asset);eq(evidence.length,1);
  await client.readWeb('followers',{cursor:'0',offset:'0',sourceType:'1'});m.pages[0].webContents.emit('console-message',{},3,'ReferenceError: PRIVATE_VARIABLE',2,asset);eq(evidence.at(-1).phase,'follower-starting');eq(evidence.at(-1).category,'reference-error');eq(evidence.at(-1).mask,0);client.close();m.reader.close();
  m=managerFixture({initializationEvidence(){throw Error('Synthetic observer failure');}});client=await m.acquire();m.pages[0].webContents.emit('console-message',{},3,'TypeError: PRIVATE',1,asset);eq(client.ownUid,own);client.close();m.reader.close();
  // Explicit identity checks wait for the current lease, then precede new
  // background reads. The existing view/cursor stays intact throughout.
  {
    const q=managerFixture();const held=await q.acquire();const page=q.pages[0];
    let admitted=false;const first=q.acquire({priorityIdentity:true}).then(c=>{admitted=true;return c;});
    await assert.rejects(q.acquire(),/正在读取另一页/);checks++;
    await new Promise(resolve=>setTimeout(resolve,150));eq(admitted,false);eq(page.destroyed,false);
    held.close();const a=await first;eq(admitted,true);eq(q.pages.length,1);eq(a.ownUid,own);
    let secondAdmitted=false;const second=q.acquire({priorityIdentity:true}).then(c=>{secondAdmitted=true;return c;});
    await new Promise(resolve=>setTimeout(resolve,150));eq(secondAdmitted,false);
    a.close();const b=await second;b.close();const ordinary=await q.acquire();ordinary.close();eq(q.pages.length,1);q.reader.close();
  }
  {
    let clock=0;const q=managerFixture({now:()=>clock});const held=await q.acquire();
    const waiting=q.acquire({priorityIdentity:true});clock=6001;
    await assert.rejects(waiting,/等待已结束/);checks++;held.close();
    const after=await q.acquire();after.close();eq(q.pages.length,1);q.reader.close();
  }
  {
    const opts={};const q=managerFixture(opts);const held=await q.acquire();
    const waiting=q.acquire({priorityIdentity:true});opts.ownerFailed=true;
    await assert.rejects(waiting,/owner changed/);checks++;opts.ownerFailed=false;held.close();
    const after=await q.acquire();after.close();q.reader.close();
  }
  {
    const q=managerFixture();const held=await q.acquire();const waiting=q.acquire({priorityIdentity:true});
    q.reader.close();await assert.rejects(waiting,/已关闭/);checks++;held.close();
  }
  {
    const q=managerFixture();q.readerFixture.state.verify=true;
    await assert.rejects(q.acquire({priorityIdentity:true}),/验证/);checks++;
    eq(q.pages.length,1);eq(q.readerFixture.state.selfGets||0,0);q.reader.close();
  }
  eq(blockedRequest({url:score+'?is_pc=true',method:'GET',resourceType:'fetch'}),false);
  for(const request of [{url:score+'?is_pc=true',method:'POST'},{url:score+'?is_pc=false',method:'GET'},{url:score+'?is_pc=true&mark_read=1',method:'GET'},{url:score+'/?is_pc=true',method:'GET'},{url:score+'?is_pc=true',method:'HEAD'}])eq(blockedRequest({...request,resourceType:'fetch'}),true);
  console.log(JSON.stringify({ checks, syntheticRuntimeOnly: true, exactOwnerIds: true, nativeImInitialization: false, boundEnvironmentReused:true, scopedRequestGuards:true, accountStorageNotCopiedOrCleared:true, outgoingMessages: 0, markRead: 0, realAccountAccessed: false }));
})().catch(e => { console.error(e); process.exitCode = 1; });
