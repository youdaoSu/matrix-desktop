// Explicit text send only. No arbitrary command, peer, body, URL or read receipt.
const c = require('./douyin-inbox-codec.cjs');
const clientId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function reason(value) {
  if (typeof value !== 'string' || value.length > 4096) return '';
  const display=(v,depth=0)=>{
    if(depth>6)return '';
    if(typeof v==='string'){try{const parsed=JSON.parse(v);return typeof parsed==='string'?parsed:display(parsed,depth+1);}catch{return v;}}
    if(!v||typeof v!=='object'||Array.isArray(v))return '';
    for(const field of ['tips','status_msg','msg_content','message']){const found=display(v[field],depth+1);if(found)return found;}return '';
  };
  const message = display(value);
  if (typeof message !== 'string' || /cookie|token|authorization|password|sessionid|https?:|[A-Za-z0-9_-]{64}/i.test(message)) return '';
  return c.clean(message, 240);
}
function sendRequest({ thread, ownUid, text, requestId, sequence, deviceId = '0', now = Date.now() }) {
  const t = c.thread(thread, ownUid);
  if (!clientId(requestId) || typeof text !== 'string' || !text.trim() || text.length > 2000 || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(text)) throw Error('私信正文需为1–2000字，且不能包含控制字符');
  // Same verified cookie-authenticated envelope as history, separately typed.
  const envelope = c.decode('Request', c.request('init', { cursor: '0' }, sequence, deviceId).bytes);
  const content = JSON.stringify({ aweType: 700, type: 0, richTextInfos: [], text });
  return { path: '/v1/message/send', bytes: c.encode('Request', { ...envelope, cmd: 100, inboxType: 0, body: { sendMessageBody: { conversationId: t.id, conversationType: t.type, conversationShortId: t.shortId, content, messageType: 7, clientMessageId: requestId, ext: { 's:mentioned_users': '', 's:client_message_id': requestId, 's:stime': `${now}.${String(now % 10000).padStart(4, '0')}` } } } }) };
}
function sendReceipt(bytes, sequence, requestId) {
  const r = c.decode('Response', bytes), b = r.body?.sendMessageBody;
  const unknown = message => ({ state: 'unknown', requestId, message });
  if (r.cmd !== 100 || r.sequenceId !== String(sequence) || b?.clientMessageId && b.clientMessageId !== requestId) return unknown('发送回执与当前请求不一致；结果未确认，请先核对，勿重复发送');
  const code = Number.isInteger(r.statusCode) ? r.statusCode : undefined;
  let check = b?.checkCode && /^\d+$/.test(b.checkCode) ? b.checkCode : undefined;
  try { const inner = JSON.parse(b?.checkMessage); if (Number.isSafeInteger(inner.status_code) && inner.status_code > 0) check = String(inner.status_code); } catch {}
  const detail = reason(b?.checkMessage) || reason(r.errorDesc);
  const suffix = `（平台码 ${code ?? '未提供'}${b?.status !== undefined ? '，发送码 ' + b.status : ''}${check ? '，审核码 ' + check : ''}）`;
  const labels = { 1: '当前账号不在此会话中', 2: '会话权限检查未通过', 3: '内容检查未通过', 4: '内容仅本人可见，未确认对方收到', 5: '平台已阻止当前用户发送' };
  if (code !== undefined && code !== 0 || b && Number.isInteger(b.status) && b.status !== 0 || check === '8610') return { state: 'failed', requestId, message: (detail && detail !== 'OK' ? detail : labels[b?.status] || '平台拒绝发送') + suffix + (b?.status===3?'；抖音审核拒绝，未确认投递，不会自动重发，请在官方会话核对':'') };
  let messageId; try { messageId = c.id(b?.serverMessageId, false); } catch {}
  if (code !== 0 || !b || b.status !== 0 || !messageId || b.isAsyncSend || check && !['0','8101'].includes(check)) return unknown((detail && detail !== 'OK' ? detail : '平台尚未确认投递，可能正在审核；请先核对，勿重复发送') + suffix);
  return { state: 'confirmed', requestId, messageId, message: '平台已确认发送' + suffix };
}
module.exports = { clientId, reason, sendRequest, sendReceipt };
