const protobuf = require('protobufjs');
const path = require('node:path');
const root = protobuf.loadSync(path.join(__dirname, 'vendor/douyin-im/im.proto'));
const type = name => root.lookupType(`im_proto.${name}`);
const MAX = 4 * 1024 * 1024;
function id(value, zero = true) {
  const s = typeof value === 'string' ? value : Number.isSafeInteger(value) ? String(value) : '';
  if (!/^\d{1,19}$/.test(s) || BigInt(s) > 9223372036854775807n || !zero && BigInt(s) === 0n) throw Error('抖音消息编号或分页游标无效');
  return BigInt(s).toString();
}
const clean = (s, max = 1000) => typeof s === 'string' ? s.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, max) : '';
const image = raw => { try { const u = new URL(raw); if (u.protocol === 'https:' && !u.username && !u.password && u.href.length <= 4096) return u.href; } catch {} };
function encode(name, value) { const t = type(name), obj = t.fromObject(value), error = t.verify(obj); if (error) throw Error('抖音消息协议字段不完整'); return Buffer.from(t.encode(obj).finish()); }
function decode(name, bytes) { if (!bytes?.length || bytes.length > MAX) throw Error('抖音消息数据包大小异常'); const t = type(name); return t.toObject(t.decode(bytes), { longs: String, enums: Number, bytes: Buffer }); }
// Deliberately no generic command/body API: these are the only HTTP operations.
const specs = Object.freeze({ init: [203, 1, '/v2/message/get_by_user_init', 'messagesPerUserInitV2Body'], history: [301, 0, '/v1/message/get_by_conversation', 'messagesInConversationBody'], strangers: [2047, 1, '/v1/message/get_recent_stranger_message', 'getRecentStrangerMessage'] });
function request(kind, args, sequence, deviceId = '0') {
  const spec = specs[kind]; if (!spec) throw Error('不支持的抖音只读操作');
  let body;
  if (kind === 'init') body = { cursor: id(args.cursor || '0') };
  else if (kind === 'strangers') body = { latestStrangerVersion: '0', earliestStrangerVersion: id(args.cursor || '0'), source: 'code_up', newUser: 0, bizInfo: '' };
  else { const t = thread(args, args.ownUid); body = { conversationId: t.id, conversationType: t.type, conversationShortId: t.shortId, direction: args.direction === 'newer' ? 2 : 1, anchorIndex: id(args.cursor || '0'), limit: 50 }; }
  return { path: spec[2], bytes: encode('Request', { cmd: spec[0], sequenceId: id(String(sequence)), sdkVersion: '1.2.1', token: '', refer: 3, inboxType: spec[1], buildNumber: 'eb11b84dd0eb26ae22321b53426d3f976b920862', body: { [spec[3]]: body }, deviceId: id(deviceId), devicePlatform: process.platform === 'win32' ? 'windows' : 'mac', versionCode: '1.2.1', headers: {}, authType: 1, biz: 'douyin_im_pc', access: 'cpp_sdk' }) };
}
function page(kind, bytes, sequence) {
  const r = decode('Response', bytes), spec = specs[kind];
  if (!spec || r.cmd !== spec[0] || r.sequenceId !== String(sequence)) throw Error('抖音只读响应与当前请求不匹配');
  if (r.statusCode !== 0 && !(kind === 'strangers' && r.statusCode === 200)) throw Error(`抖音拒绝读取消息（平台码 ${Number.isInteger(r.statusCode) ? r.statusCode : '未知'}），请在账号管理检查官方登录或验证`);
  const b = r.body?.[spec[3]];
  if (!b || typeof b.hasMore !== 'boolean' || b.messages && (!Array.isArray(b.messages) || b.messages.length > 5000) || b.conversations && (!Array.isArray(b.conversations) || b.conversations.length > 5000)) throw Error('抖音消息分页结构未识别；未当成空列表');
  return { ...b, cursor: id(kind === 'strangers' ? b.nextStrangerVersion : b.nextCursor ?? '0') };
}
function thread(raw, ownUid) {
  const conversationId = raw.conversationId ?? raw.id, shortId = id(raw.conversationShortId ?? raw.shortId, false), t = raw.conversationType ?? raw.type;
  if (typeof conversationId !== 'string' || conversationId.length > 160 || ![1, 2].includes(t)) throw Error('抖音会话身份字段未识别');
  let peer = '';
  if (t === 1) { const parts = /^0:1:(\d+):(\d+)$/.exec(conversationId); if (!parts || ![parts[1], parts[2]].includes(id(ownUid, false))) throw Error('抖音私信会话不属于当前账号，已停止读取'); peer = parts[1] === ownUid ? parts[2] : parts[1]; }
  else if (!/^\d+$/.test(conversationId)) throw Error('抖音群聊会话格式未识别');
  const core = raw.conversationCoreInfo || {};
  const result = { id: conversationId, shortId, type: t, peer, name: clean(core.name || raw.name, 200) || (peer ? `用户 ${peer}` : `群聊 ${shortId}`) };
  result.nameSource = core.name || raw.name ? 'conversation' : 'fallback';
  if (peer) {
    const participants = [...(raw.firstPageParticipants?.participants || []), ...(raw.strangerInfo?.participants || []), ...(raw.userInfo ? [raw.userInfo] : [])];
    const person = participants.find(p => String(p.userId || '') === peer);
    if (person && /^MS4w[A-Za-z0-9_-]{1,256}$/.test(person.secUid || '')) result.peerSecUid = person.secUid;
    if (person && clean(person.alias, 200)) { result.name = clean(person.alias, 200); result.nameSource = 'alias'; }
  } else if (image(core.icon)) result.avatarUrl = image(core.icon);
  if (Number.isSafeInteger(raw.badgeCount) && raw.badgeCount >= 0) result.unread = raw.badgeCount;
  return result;
}
function message(raw, ownUid) {
  const t = thread(raw, ownUid), messageId = id(raw.serverMessageId, false), sender = id(raw.sender, false);
  if (typeof raw.content !== 'string' || Buffer.byteLength(raw.content) > 256 * 1024 || !Number.isInteger(raw.messageType)) throw Error('抖音消息正文结构未识别');
  const display = require('./douyin-inbox-content.cjs').displayContent(raw.content, raw.messageType, raw.status ?? 0,{ownUid});
  const stamp = raw.createTime ? id(raw.createTime) : '0', n = Number(stamp), ms = stamp.length <= 10 ? n * 1000 : n;
  return { id: messageId, threadId: t.id, shortId: t.shortId, type: t.type, sender, ...(/^MS4w[A-Za-z0-9_-]{1,256}$/.test(raw.secSender || '') ? {senderSecUid:raw.secSender} : {}), direction: sender === ownUid ? 'outbound' : 'inbound', messageType: raw.messageType, ...display, rawContent: raw.content, at: ms >= 946684800000 && ms < 4102444800000 ? new Date(ms).toISOString() : '', index: id(raw.indexInConversationV2 ?? raw.indexInConversation ?? '0'), version: id(raw.version || '0'), status: raw.status ?? 0 };
}
function lz4(input) {
  // Raw LZ4 block. A bounded independent decoder; no allocations from peer sizes.
  const out = Buffer.alloc(MAX); let i = 0, o = 0;
  const length = base => { let n = base; if (base === 15) { let b; do { if (i >= input.length) throw Error('抖音压缩消息截断'); b = input[i++]; n += b; if (n > MAX) throw Error('抖音压缩消息超过限制'); } while (b === 255); } return n; };
  while (i < input.length) {
    const token = input[i++], literal = length(token >> 4);
    if (i + literal > input.length || o + literal > MAX) throw Error('抖音压缩消息字面量越界'); input.copy(out, o, i, i + literal); i += literal; o += literal;
    if (i === input.length) break;
    if (i + 2 > input.length) throw Error('抖音压缩消息偏移截断'); const offset = input.readUInt16LE(i); i += 2;
    const count = length(token & 15) + 4;
    if (!offset || offset > o || o + count > MAX) throw Error('抖音压缩消息引用越界'); for (let k = 0; k < count; k++) { out[o] = out[o - offset]; o++; }
  }
  return out.subarray(0, o);
}
function frame(bytes, progress = () => {}) {
  progress('frame-envelope'); const f = decode('Frame', bytes); progress('frame-headers', f);
  if ((f.headers || []).length > 64 || (f.headers || []).some(h => h.key.length > 100 || h.value.length > 1024)) throw Error('抖音推送帧头异常');
  const names = new Set(); for (const h of f.headers || []) { if (names.has(h.key)) throw Error('抖音推送帧头重复'); names.add(h.key); }
  progress('frame-compression', f);
  if (f.payloadEncoding === '__lz4') { f.payload = lz4(f.payload || Buffer.alloc(0)); f.payloadEncoding = 'identity'; }
  else if (f.payloadEncoding && f.payloadEncoding !== 'identity' && (f.payloadType === 'pb' || [16, 32].includes(f.frameType))) throw Error('抖音推送压缩格式尚未支持');
  // An opaque non-chat event is not a Response or cursor packet. Do not apply
  // the PB compression allowlist to its encoding label or decode its contents.
  // Preserve that label and the bounded payload together for encrypted storage.
  // Unknown encodings on packets we DO interpret still fail before any ACK.
  return f;
}
const header = (f, name) => (f.headers || []).find(h => h.key === name)?.value;
function ack(f) { if (header(f, 'need_ack') !== '1' || header(f, 'is_ack') === '1') return; return encode('Frame', { seqid: f.seqid, logid: f.logid, service: f.service, method: f.method, headers: [{ key: 'is_ack', value: '1' }, { key: 'ack_id', value: f.logIdNew || '' }, { key: 'ack_code', value: '0' }], payloadType: '', logIdNew: f.logIdNew || '' }); }
function cursors(bytes) {
  const rows = []; let offset = 0;
  while (offset < bytes.length) { const n = bytes[offset + 5], end = offset + 14 + n; if (rows.length >= 128 || bytes.length - offset < 14 || !n || end > bytes.length) throw Error('抖音推送续传游标截断'); rows.push({ service: bytes.readUInt32BE(offset + 1), name: new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset + 6, offset + 6 + n)), value: bytes.readBigUInt64BE(offset + 6 + n).toString() }); offset = end; }
  return rows;
}
function encodeCursors(rows) { return Buffer.concat(rows.map(r => { const name = Buffer.from(r.name); if (!name.length || name.length > 255 || !/^\d{1,20}$/.test(r.value) || BigInt(r.value) > 0xffffffffffffffffn) throw Error('抖音推送续传游标无效'); const b = Buffer.alloc(14 + name.length); b.writeUInt32BE(r.service, 1); b[5] = name.length; name.copy(b, 6); b.writeBigUInt64BE(BigInt(r.value), 6 + name.length); return b; })); }
module.exports = { MAX, id, encode, decode, request, page, thread, message, frame, header, ack, cursors, encodeCursors, lz4, clean, image };
