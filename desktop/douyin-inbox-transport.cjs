const https = require('node:https');
const os = require('node:os');
const { createHash } = require('node:crypto');
const WebSocket = require('ws');
const codec = require('./douyin-inbox-codec.cjs');
const { parseExactJSON } = require('./bilibili-interactions.cjs');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) douyinim/1.2.1 Chrome/130.0.6723.58 Electron/33.2.0 Safari/537.36';
function browserUserAgent(accountSession) {
  const value=accountSession.getUserAgent?.() || UA;
  // Electron includes app.getName() in its UA. Localized product names must be
  // serialized before passing this browser UA to Node HTTP or ws headers.
  // Preserve every ASCII byte and all browser/OS/version tokens; never rewrite
  // cookies or substitute another device identity to handle a header error.
  if(typeof value!=='string'||value.length>4096||/[\x00-\x1f\x7f]/.test(value))throw Error('私信浏览器标识格式异常，请更新软件后重试；原有存档保留');
  try{return value.replace(/[^\x20-\x7e]+/gu,part=>encodeURIComponent(part));}
  catch{throw Error('私信浏览器标识编码异常，请更新软件后重试；原有存档保留');}
}
const AUTH = /^(sessionid|sessionid_ss|sid_tt|sid_guard|uid_tt|uid_tt_ss|sid_ucp_v1|ssid_ucp_v1)$/;
const ALLOWED = /^(sessionid|sessionid_ss|sid_tt|sid_guard|uid_tt|uid_tt_ss|sid_ucp_v1|ssid_ucp_v1|passport_csrf_token|passport_csrf_token_default|odin_tt|ttwid|store-region|store-region-src|passport_assist_user|passport_auth_status|passport_auth_status_ss|__ac_nonce|__ac_signature|msToken|s_v_web_id)$/;
const normalize = c => c.name === 'sid_guard' ? (() => { try { const v = decodeURIComponent(c.value).split('|'); return v.length >= 3 ? v[0] : c.value; } catch { return c.value; } })() : c.value;
// Never surface socket error messages/URLs/reasons: they may contain credentials
// or server payloads. Only these network codes and numeric statuses are public.
const socketCode = e => ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(e?.code) ? e.code : 'UNKNOWN';
const stages = new Set(['wire-bytes', 'frame-envelope', 'frame-headers', 'frame-compression', 'owner-check', 'cursor-control', 'cursor-decode', 'cursor-save', 'cursor-reply', 'payload-dispatch', 'response-decode', 'message-decode', 'cursor-validate', 'message-save', 'post-owner-check', 'qos-ack', 'dispatch']);
const limitedNumber = n => Number.isInteger(n) && n >= 0 && n <= 0xffffffff ? String(n) : '-';
function receiveDiagnostic(trace, error) {
  const storage = /(?:open|write|flush|close|replace)\/(?:EACCES|EPERM|EBUSY|EEXIST|ENOSPC|EIO|ENOENT|EINVAL|EMFILE|ENAMETOOLONG|UNKNOWN)\b/.exec(error?.message || '')?.[0];
  const reasons = new Map([
    ['抖音推送事件存档读取或解密失败，原文件保留；未确认推送','event-archive-read'],['抖音推送事件存档写入失败，原文件保留；未确认推送','event-archive-write'],
    ['抖音推送事件存档加密失败，原文件保留；未确认推送','storage-encrypt'],['抖音推送事件加密存档达到安全容量，未丢弃事件或确认推送','unsupported-capacity'],
    ['未识别推送事件达到上限，需要适配后继续，未丢弃事件','unsupported-capacity'],['抖音消息协议字段不完整','protocol-encode'],
    ['抖音本机聊天达到本轮安全容量，已暂停；不会标记为历史完整','store-count-limit'],['抖音本机聊天存档达到安全容量，历史仍未完整','store-byte-limit'],
    ['抖音会话身份发生冲突，已保留原数据','thread-conflict'],['抖音聊天存档加密失败（encrypt）；原文件未改动，未推进同步游标或确认推送','storage-encrypt'],
    ['抖音消息编号或分页游标无效', 'invalid-id'], ['抖音会话身份字段未识别', 'thread-shape'], ['抖音私信会话不属于当前账号，已停止读取', 'thread-owner'],
    ['抖音消息正文结构未识别', 'message-shape'], ['抖音推送业务载荷尚未识别', 'payload-format'], ['抖音新消息推送缺少可识别正文', 'message-missing'],
    ['抖音推送续传文件标识无效', 'cursor-file'], ['抖音推送消息游标无效', 'cursor-shape'], ['抖音推送续传游标截断', 'cursor-bytes'],
    ['抖音推送压缩格式尚未支持', 'compression-format'], ['抖音推送帧头重复', 'duplicate-header'], ['抖音推送帧头异常', 'header-shape'],
  ]);
  const reason = reasons.get(error?.message) || (storage ? 'storage' : ['frame-envelope', 'response-decode'].includes(trace.stage) ? 'protobuf-wire' : 'unknown');
  return `抖音推送处理暂停（阶段=${stages.has(trace.stage) ? trace.stage : 'dispatch'}；原因=${reason}；协议=${['binary', 'base64', 'pbbp2'].includes(trace.protocol) ? trace.protocol : 'other'}；格式=${['pb', 'text/json', 'json', 'empty'].includes(trace.type) ? trace.type : 'other'}；压缩=${['__lz4', 'identity', 'empty'].includes(trace.encoding) ? trace.encoding : 'other'}；帧=${limitedNumber(trace.frameType)}；命令=${limitedNumber(trace.cmd)}；续传文件=${trace.hasCursorFile === true ? 1 : 0}${storage ? '；存档=' + storage : ''}）；未确认该帧，原存档保留`;
}
function query(deviceId) { return { aid: '339757', app_name: 'aweme_im_desktop', did: deviceId, device_id: deviceId, iid: '0', channel: process.platform === 'win32' ? '0' : '20002', os_version: os.release(), version_code: '1.2.1', version_name: '1.2.1', device_platform: process.platform === 'win32' ? 'windows' : 'mac', device_type: process.arch, device_brand: '' }; }
function wire(url, { headers, body, signal }) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const fail = () => { if (!finished) { finished = true; reject(Error('抖音消息网络连接失败或超时；已有存档保留')); } };
    const req = https.request(url, { method: body ? 'POST' : 'GET', headers, signal, timeout: 15000 }, res => {
      if (res.statusCode !== 200) { res.resume(); finished = true; reject(Error(`抖音消息服务返回 HTTP ${res.statusCode}，请检查官方登录或稍后重试`)); return; }
      let size = 0; const parts = [];
      res.on('data', chunk => { size += chunk.length; if (size > codec.MAX) { req.destroy(); fail(); } else parts.push(chunk); });
      res.on('error', fail);
      res.on('end', () => { if (!finished) { finished = true; resolve(Buffer.concat(parts, size)); } });
    });
    req.on('timeout', () => req.destroy()); req.on('error', fail); if (body) req.write(body); req.end();
  });
}
async function createTransport({ accountSession, publicHandle, assertCurrent, onInvalidated, network = wire, Socket = WebSocket }) {
  let closed = false, baseline, socket, activeRead, readTail = Promise.resolve(), queuedReads = 0; const pending = new Set();
  const end = () => { if (closed) return; closed = true; for (const c of pending) c.abort(); socket?.terminate(); accountSession.cookies.removeListener('changed', cookieListener); };
  const changed = (_event, c) => {
    if (!AUTH.test(c.name) || !/(^|\.)douyin\.com$/.test(c.domain.replace(/^\./, ''))) return;
    const key = `${c.domain}/${c.path}/${c.name}`;
    if (baseline && baseline.get(key) !== normalize(c)) { end(); onInvalidated?.(); }
  };
  // Explicit removed parameter; no cookie values are emitted or persisted.
  const cookieListener = (event, c, cause, removed) => { if (removed && baseline?.has(`${c.domain}/${c.path}/${c.name}`) && AUTH.test(c.name)) { end(); onInvalidated?.(); } else changed(event, c, cause); };
  accountSession.cookies.on('changed', cookieListener);
  const close = () => { end(); accountSession.cookies.removeListener('changed', cookieListener); };
  const credentials = async () => {
    if (closed) throw Error('抖音消息连接已关闭');
    const rows = (await accountSession.cookies.get({ url: 'https://www.douyin.com/' })).filter(c => ALLOWED.test(c.name) && (!c.expirationDate || c.expirationDate > Date.now() / 1000));
    if (!rows.some(c => /^(sessionid|sessionid_ss|sid_tt)$/.test(c.name) && c.value) || rows.some(c => typeof c.value !== 'string' || c.value.length > 8192 || /[\r\n;]/.test(c.value))) throw Error('抖音消息缺少可用官方会话，请到账号管理恢复登录');
    const next = new Map(rows.filter(c => AUTH.test(c.name)).map(c => [`${c.domain}/${c.path}/${c.name}`, normalize(c)]));
    if (baseline && (next.size !== baseline.size || [...next].some(([k, v]) => baseline.get(k) !== v))) { close(); throw Error('抖音登录身份已变化，已停止原账号消息连接'); }
    baseline = next;
    return rows.map(c => `${c.name}=${c.value}`).join('; ');
  };
  function checked(url, body, browserProfile = false, contentType = 'application/x-protobuf') {
    if (closed) return Promise.reject(Error('抖音消息连接已关闭'));
    if (queuedReads >= 4) return Promise.reject(Error('抖音只读请求队列已满，请等待当前同步完成'));
    queuedReads++;
    // History and the separate browser WS identity check share one bounded
    // account-scoped HTTP lane; neither makes the other spuriously fail busy.
    const result = readTail.then(async () => {
      if (closed) throw Error('抖音消息连接已关闭');
      const ctrl = new AbortController(); activeRead = ctrl; pending.add(ctrl); const deadline = setTimeout(() => ctrl.abort(), 18000);
      try { await assertCurrent(); const cookie = await credentials(); if (closed) throw Error('抖音消息连接已关闭');
        const headers = { Accept: body && contentType === 'application/x-protobuf' ? 'x-protobuf' : 'application/json', Cookie: cookie, 'User-Agent': browserProfile ? browserUserAgent(accountSession) : UA, Referer: browserProfile ? 'https://www.douyin.com/' : 'https://imdesktop.douyin.com' };
        if (body) { headers['Content-Type'] = contentType; if (contentType === 'application/x-protobuf') headers['x-ss-stub'] = createHash('md5').update(body).digest('hex'); }
        const bytes = await network(url, { headers, body, signal: ctrl.signal }); await credentials(); await assertCurrent(); if (closed) throw Error('抖音消息连接已关闭'); return bytes;
      } finally { clearTimeout(deadline); ctrl.abort(); pending.delete(ctrl); if (activeRead === ctrl) activeRead = undefined; }
    });
    readTail = result.catch(() => {});
    return result.finally(() => { queuedReads--; });
  }
  let ownUid, ownSecUid, sequence = 1;
  const deviceId = '0'; // Explicit unregistered session fallback, not a fabricated registered device.
  try {
    const url = new URL('https://imdesktop.douyin.com/aweme/v1/web/user/profile/self/'); url.search = new URLSearchParams({ ...query(deviceId), device_platform: process.platform, browser_platform: process.platform === 'win32' ? 'Win32' : 'MacIntel', browser_language: 'zh-CN', cookie_enabled: 'true', browser_online: 'true' });
    let self; const nativeBytes = await checked(url);
    try { self = parseExactJSON(nativeBytes.toString('utf8')); } catch { throw Error('抖音本人身份接口未返回可识别数据，请在账号管理完成官方验证'); }
    // Matrix bindings originate in the official browser, not Douyin Chat's
    // separate app login. A documented browser self-profile is a second normal
    // read path, not a fabricated IM UID, nickname lookup or challenge bypass.
    if (Number(self?.status_code) !== 0 || !self.user || !String(self.user.uid || self.user.user_id_str || self.user.user_id || '').match(/^[1-9]\d*$/)) {
      const nativeCode = Number.isSafeInteger(Number(self?.status_code)) ? Number(self.status_code) : '未知';
      const browser = new URL('https://www.douyin.com/aweme/v1/web/user/profile/self/'); browser.search = new URLSearchParams({ aid: '6383', device_platform: 'webapp', channel: 'channel_pc_web' });
      const browserBytes = await checked(browser, undefined, true);
      try { self = parseExactJSON(browserBytes.toString('utf8')); } catch { throw Error(`抖音网页本人身份未返回可识别数据（聊天应用平台码 ${nativeCode}），需要官方验证`); }
      if (Number(self?.status_code) !== 0 || !self.user) throw Error(`抖音消息本人身份接口未通过（聊天应用平台码 ${nativeCode}，网页平台码 ${Number.isSafeInteger(Number(self?.status_code)) ? Number(self.status_code) : '未知'}），未当成没有消息`);
    }
    const handle = String(self.user.unique_id || self.user.short_id || '');
    if (!publicHandle || handle !== publicHandle) throw Error('抖音消息官方账号标识与绑定账号不一致，请到账号管理核验');
    ownUid = codec.id(self.user.uid || self.user.user_id_str || self.user.user_id, false);
    ownSecUid = /^MS4w[A-Za-z0-9_-]{1,256}$/.test(self.user.sec_uid || '') ? self.user.sec_uid : undefined;
  } catch (error) { close(); throw error; }
  async function json(url, body, browser = true) {
    const bytes = await checked(url, body, browser, 'application/x-www-form-urlencoded;charset=UTF-8'); let data;
    try { data = parseExactJSON(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw Error('抖音只读接口未返回可识别JSON，需要检查官方登录或验证'); }
    if (!data || !Number.isInteger(data.status_code) || data.status_code !== 0) throw Error(`抖音只读接口未通过（平台码 ${Number.isSafeInteger(data?.status_code) ? data.status_code : '未知'}），原有结果保留`);
    return data;
  }
  return {
    ownUid, deviceId, close,
    async sendText(args) {
      const seq = sequence++, sender = require('./douyin-inbox-send.cjs');
      const request = sender.sendRequest({ ...args, ownUid, sequence: seq, deviceId });
      const url = new URL(request.path, 'https://imapi3-normal.zijieapi.com'); url.search = new URLSearchParams(query(deviceId));
      // Exactly one attempt. checked() verifies the actual cookie identity on
      // both sides; a timeout is NOT permission to issue a second send.
      return sender.sendReceipt(await checked(url, request.bytes), seq, args.requestId);
    },
    async read(kind, args) { const seq = sequence++, request = codec.request(kind, { ...args, ownUid }, seq, deviceId); const url = new URL(request.path, 'https://imapi3-normal.zijieapi.com'); url.search = new URLSearchParams(query(deviceId)); return codec.page(kind, await checked(url, request.bytes), seq); },
    async people(pairs) {
      if (!Array.isArray(pairs) || !pairs.length || pairs.length > 50 || pairs.some(p => !/^[1-9]\d{0,18}$/.test(p.uid) || !/^MS4w[A-Za-z0-9_-]{1,256}$/.test(p.secUid))) throw Error('抖音会话联系人资料参数无效');
      // Matrix owns browser sessions, not a separately registered Chat app.
      // Use the browser directory with its actual UA and existing session.
      const url = new URL('https://www.douyin.com/aweme/v1/web/im/user/info/'); url.search = new URLSearchParams({ aid: '6383', device_platform: 'webapp', channel: 'channel_pc_web' });
      const data = await json(url, Buffer.from(new URLSearchParams({ sec_user_ids: JSON.stringify(pairs.map(p => p.secUid)) }).toString()), true);
      if (!Array.isArray(data.data) || data.data.length > 50) throw Error('抖音联系人资料结构尚未识别');
      return data.data.map(user => {
        const uid = codec.id(user.uid, false), match = pairs.find(p => p.uid === uid && p.secUid === user.sec_uid);
        if (!match) throw Error('抖音联系人身份与会话不一致，资料未应用');
        return { uid, secUid: user.sec_uid, name: codec.clean(user.remark_name || user.nickname, 200), nickname: codec.clean(user.nickname, 200), avatarUrl: codec.image(user.avatar_thumb?.url_list?.[0]) };
      }).filter(user => user.name);
    },
    async readWeb(kind, args = {}) {
      const routes = { works: ['aweme/post/', ['cursor']], comments: ['comment/list/', ['workId', 'cursor']], replies: ['comment/list/reply/', ['workId', 'commentId', 'cursor']], followers: ['user/follower/list/', ['cursor', 'offset']] };
      const spec = Object.hasOwn(routes, kind) && routes[kind];
      if (!spec || Object.keys(args).some(k => !spec[1].includes(k)) || Object.values(args).some(v => typeof v !== 'string' || !/^\d{1,19}$/.test(v))) throw Error('不支持的抖音只读分页参数');
      if (['works', 'followers'].includes(kind) && !ownSecUid) {
        const self = await json('https://www.douyin.com/aweme/v1/web/user/profile/self/?aid=6383&device_platform=webapp&channel=channel_pc_web');
        if (codec.id(self.user?.uid, false) !== ownUid || !/^MS4w[A-Za-z0-9_-]{1,256}$/.test(self.user?.sec_uid || '')) throw Error('抖音本人主页身份未通过，未读取他人作品或粉丝');
        ownSecUid = self.user.sec_uid;
      }
      const params = { aid: '6383', device_platform: 'webapp', channel: 'channel_pc_web', count: '20' };
      if (kind === 'works') Object.assign(params, { sec_user_id: ownSecUid, max_cursor: args.cursor || '0' });
      if (kind === 'followers') Object.assign(params, { user_id: ownUid, sec_user_id: ownSecUid, source_type: '1', max_time: args.cursor || '0', min_time: '0', offset: args.offset || '0', gps_access: '0', address_book_access: '0', is_top: '1' });
      if (kind === 'comments') Object.assign(params, { aweme_id: codec.id(args.workId, false), cursor: args.cursor || '0', item_type: '0', cut_version: '1' });
      if (kind === 'replies') Object.assign(params, { item_id: codec.id(args.workId, false), comment_id: codec.id(args.commentId, false), cursor: args.cursor || '0', item_type: '0', cut_version: '1' });
      const url = new URL('https://www.douyin.com/aweme/v1/web/' + spec[0]); url.search = new URLSearchParams(params);
      return json(url);
    },
    async connect({ onFrame, onStatus }) {
      // Matrix accounts are official browser bindings, not registered native
      // Douyin Chat installations. Query the browser's actual connection ID,
      // verify its numeric owner, then use the matching browser Frontier profile.
      // No hardware registration, invented DID, security signature or challenge
      // bypass is attempted. Credentials and the WS URL never leave this module.
      const identityUrl = new URL('https://www.douyin.com/aweme/v1/web/query/user/');
      identityUrl.search = new URLSearchParams({ aid: '6383', device_platform: 'webapp', channel: 'channel_pc_web' });
      let browser; const identityBytes = await checked(identityUrl, undefined, true);
      try { browser = parseExactJSON(identityBytes.toString('utf8')); }
      catch { throw Error('抖音网页推送身份接口未返回可识别数据，请到账号管理完成官方验证'); }
      if (Number(browser?.status_code) !== 0) throw Error(`抖音网页推送身份接口未通过（平台码 ${Number.isSafeInteger(Number(browser?.status_code)) ? Number(browser.status_code) : '未知'}），未创建推送连接`);
      if (codec.id(browser.user_uid, false) !== ownUid) throw Error('抖音网页推送身份与已核验账号不一致，已停止连接');
      const browserDevice = typeof browser.id === 'string' ? browser.id : Number.isSafeInteger(browser.id) ? String(browser.id) : '';
      if (!/^[1-9]\d{0,19}$/.test(browserDevice) || BigInt(browserDevice) > 0xffffffffffffffffn) throw Error('抖音网页未提供有效推送连接编号；不会使用虚构设备编号');
      await assertCurrent(); const cookie = await credentials(); if (closed) throw Error('抖音消息连接已关闭');
      const tokens = [...new Set(cookie.split('; ').filter(row => row.startsWith('sessionid=')).map(row => row.slice(10)).filter(Boolean))];
      if (tokens.length !== 1) throw Error('抖音网页推送缺少唯一登录会话，请到账号管理恢复登录');
      const url = new URL('wss://frontier-im.douyin.com/ws/v2');
      url.search = new URLSearchParams({ aid: '6383', device_platform: 'douyin_pc', fpid: '9', device_id: browserDevice, token: tokens[0], access_key: createHash('md5').update(`9e1bd35ec9db7b8d846de66ed140b1ad9${browserDevice}f8a69f1719916z`).digest('hex') });
      let heartbeat, chain = Promise.resolve(), queued = 0, stopped = false, failed = false;
      const ws = new Socket(url.href, ['binary', 'base64', 'pbbp2'], { maxPayload: codec.MAX, handshakeTimeout: 15000, followRedirects: false, headers: { Cookie: cookie, Origin: 'https://www.douyin.com', Referer: 'https://www.douyin.com/', 'User-Agent': browserUserAgent(accountSession), 'x-support-qos2': '1', 'x-support-ack': '1' } }); socket = ws;
      const fail = (state, detail) => { if (closed || stopped || failed) return; failed = true; clearInterval(heartbeat); onStatus(state, detail); };
      const send = bytes => { if (!closed && !stopped && !failed && ws.readyState === 1) ws.send(bytes); };
      ws.on('open', () => { if (closed || stopped || failed) { ws.terminate(); return; } onStatus('connected'); heartbeat = setInterval(() => send('hi'), 15000); heartbeat.unref?.(); });
      ws.on('message', (data, binary) => {
        if (closed || stopped || failed) return;
        if (data.length <= 2 && ['hi', 'ok'].includes(data.toString())) return;
        if (!binary) {
          if (ws.protocol !== 'base64') { fail('protocol-error', '抖音推送收到未识别的文本帧；已暂停确认，历史存档保留'); ws.close(); return; }
          const encoded = data.toString();
          if (encoded.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) { fail('protocol-error', '抖音推送 Base64 帧格式无效，已暂停确认'); ws.close(); return; }
          data = Buffer.from(encoded, 'base64');
          if (data.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) { fail('protocol-error', '抖音推送 Base64 帧校验失败，已暂停确认'); ws.close(); return; }
        }
        if (++queued > 64) { fail('overloaded', '抖音推送接收队列达到上限；已暂停确认，历史存档保留'); ws.close(); return; }
        const trace = { stage: 'wire-bytes', protocol: ws.protocol };
        const progress = (stage, value) => { trace.stage = stages.has(stage) ? stage : 'dispatch'; if (value) { if (['frame-headers', 'frame-compression'].includes(stage)) { trace.type = value.payloadType || 'empty'; trace.encoding = value.payloadEncoding || 'empty'; trace.frameType = value.frameType ?? 0; trace.hasCursorFile = !!codec.header(value, 'cursor_file_name'); } if ('cmd' in value) trace.cmd = value.cmd; } };
        chain = chain.then(async () => { if (closed || stopped || failed) return; await credentials(); await assertCurrent(); if (!closed && !stopped && !failed) { const frame = codec.frame(Buffer.from(data), progress); progress('dispatch'); await onFrame(frame, send, progress); } }).catch(error => { fail('protocol-error', receiveDiagnostic(trace, error)); ws.close(); }).finally(() => { queued--; });
      });
      ws.on('unexpected-response', (_req, res) => {
        const status = Number.isInteger(res?.statusCode) && res.statusCode >= 100 && res.statusCode <= 599 ? res.statusCode : 'UNKNOWN';
        // A ws unexpected-response listener owns disposal; do not read its body.
        const state = [401, 403].includes(status) ? 'verification-required' : status === 429 ? 'rate-limited' : [400, 404, 426].includes(status) ? 'request-rejected' : 'connection-error';
        fail(state, `抖音推送握手返回 HTTP ${status}；未接通实时推送，历史存档保留${state === 'verification-required' ? '，请到账号管理完成官方登录或验证' : state === 'rate-limited' ? '，已暂停自动重连，请稍后再试' : ''}`); res?.resume?.(); ws.terminate();
      });
      ws.on('error', e => fail('connection-error', `抖音推送网络错误（${socketCode(e)}）；历史存档保留`));
      ws.on('close', code => { clearInterval(heartbeat); if (closed || stopped || failed) return; const safeCode = Number.isInteger(code) && code >= 1000 && code <= 4999 ? code : 'UNKNOWN'; onStatus('disconnected', `抖音推送通道关闭（WebSocket ${safeCode}）；历史存档保留`); });
      return () => { stopped = true; clearInterval(heartbeat); ws.terminate(); };
    },
  };
}
module.exports = { createTransport, query, wire, receiveDiagnostic, browserUserAgent };
