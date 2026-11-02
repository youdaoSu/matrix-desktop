// Bounded, passive diagnostics for the two tag checks made by the official UI.
// No request replay, cookies, headers, body text, URLs or account data are returned.
const endpoints = new Map([
  ['/x/app/h5/archive/tag/info', ['tag_name', '自定义标签校验']],
  ['/x/vupre/web/topic/tag/check', ['tag', '话题标签校验']],
]);
const code = value => Number.isSafeInteger(value) ? value : typeof value === 'string' && /^-?\d{1,9}$/.test(value) ? Number(value) : undefined;
async function createBilibiliTagObservation(guest, send, disable) {
  if (guest.engine === 'webview2') return null;
  const page = guest.getURL(), parsed = new URL(page);
  if (parsed.origin !== 'https://member.bilibili.com' || !/^\/platform\/upload\/video(?:\/|$)/.test(parsed.pathname)) throw Error('标签诊断只用于当前官方投稿页');
  let expected = '', closed = false, serial = 0;
  const requests = new Map(), work = new Set();
  const alive = () => !closed && !guest.isDestroyed() && guest.getURL() === page;
  const match = value => {
    try {
      const url = new URL(value), definition = endpoints.get(url.pathname);
      if (!definition || !['https://api.bilibili.com', 'https://member.bilibili.com'].includes(url.origin) || url.username || url.password || url.hash || url.searchParams.getAll(definition[0]).length !== 1 || url.searchParams.get(definition[0]) !== expected) return null;
      return definition[1];
    } catch { return null; }
  };
  const listener = (_event, method, params, sessionId) => {
    if (!alive() || !expected || sessionId || !params || typeof params.requestId !== 'string' || params.requestId.length > 128) return;
    const id = params.requestId;
    if (method === 'Network.requestWillBeSent') {
      const label = params.request?.method === 'GET' && match(params.request.url);
      if (requests.has(id)) { requests.get(id).redirected = true; return; }
      if (label && requests.size < 8) requests.set(id, { label, serial, stage: '请求已发出' });
      return;
    }
    const item = requests.get(id);
    if (!item || item.serial !== serial || item.redirected) return;
    if (method === 'Network.responseReceived') {
      if (match(params.response?.url) !== item.label) { item.redirected = true; return; }
      item.status = code(params.response.status); item.stage = '响应已到达';
    } else if (method === 'Network.loadingFailed') {
      item.stage = '网络读取失败';
      if (/^net::ERR_[A-Z_]{1,64}$/.test(params.errorText || '')) item.networkError = params.errorText;
    } else if (method === 'Network.loadingFinished' && item.status !== undefined && !item.reading) {
      item.reading = true;
      if (params.encodedDataLength > 65536) { item.stage = '响应超过诊断限额'; return; }
      const task = (async () => {
        try {
          const reply = await send('Network.getResponseBody', { requestId: id });
          if (!alive() || item.serial !== serial) return;
          if (typeof reply.body !== 'string' || reply.body.length > (reply.base64Encoded ? 90000 : 65536)) { item.stage = '响应超过诊断限额'; return; }
          const text = reply.base64Encoded ? Buffer.from(reply.body, 'base64').toString('utf8') : reply.body;
          if (Buffer.byteLength(text) > 65536) { item.stage = '响应超过诊断限额'; return; }
          const body = JSON.parse(text);
          item.code = code(body?.code); item.detailCode = code(body?.data?.code);
          item.stage = '校验响应已读取';
        } catch { item.stage = '响应无法解析或读取'; }
      })();
      work.add(task); task.finally(() => work.delete(task));
    }
  };
  guest.debugger.on('message', listener);
  try { await send('Network.enable', { maxTotalBufferSize: 262144, maxResourceBufferSize: 65536, maxPostDataSize: 0 }); }
  catch (error) { closed = true; guest.debugger.removeListener('message', listener); await disable(); throw error; }
  return {
    begin(tag) { if (typeof tag !== 'string' || !tag.trim() || tag !== tag.trim() || tag.length > 20) throw Error('标签诊断输入无效'); if (work.size) throw Error('上一条标签诊断尚未结束'); serial++; expected = tag; requests.clear(); },
    async drain() { await Promise.allSettled([...work]); },
    rejection() {
      const entries=[...requests.values()].filter(item=>!item.redirected);
      const failed=entries.find(item=>item.status>=400||item.stage==='网络读取失败'||item.code!==undefined&&item.code!==0||item.detailCode!==undefined&&item.detailCode!==0);
      if(!failed)return null;
      const custom=entries.find(item=>item.label==='自定义标签校验'),topic=entries.find(item=>item.label==='话题标签校验');
      if(topic?.status===200&&topic.code===0&&topic.detailCode===-1&&(!custom||(['请求已发出','响应已到达'].includes(custom.stage)&&!(custom.status>=400)&&!custom.networkError)))return{pendingTopicDecision:true};
      return{topicSearchAllowed:failed===topic&&custom?.status===200&&custom.code===0&&custom.detailCode===0&&topic?.status===200&&topic.code===0&&topic.detailCode===-1};
    },
    describe() {
      if (!requests.size) return '本轮未观察到对应标签校验请求';
      return [...requests.values()].map(item => `${item.label}：${item.redirected ? '发生跳转，未读取内容' : item.stage}${item.status === undefined ? '' : '，HTTP ' + item.status}${item.code === undefined ? '' : '，返回码 ' + item.code}${item.detailCode === undefined ? '' : '，校验码 ' + item.detailCode}${item.networkError ? '，' + item.networkError : ''}`).join('；');
    },
    async close() { closed = true; guest.debugger.removeListener('message', listener); try { await Promise.allSettled([...work]); } finally { requests.clear(); await disable(); } },
  };
}
module.exports = { createBilibiliTagObservation };
