const { createHash, randomUUID } = require('node:crypto');
const { createOperationBudget } = require('./operation-budget.cjs');

// Independently implemented read-only adapter. These are web-session endpoints,
// not an official OAuth grant or a guarantee of all platform history. No SDK
// code is bundled. In particular there is no acknowledgement/send endpoint.
const ROUTES = Object.freeze({
  nav: ['https://api.bilibili.com/x/web-interface/nav', []],
  video: ['https://api.bilibili.com/x/web-interface/view', ['bvid']],
  comments: ['https://api.bilibili.com/x/v2/reply', ['type', 'oid', 'pn', 'ps', 'sort', 'nohot']],
  replies: ['https://api.bilibili.com/x/v2/reply/reply', ['type', 'oid', 'root', 'pn', 'ps']],
  followers: ['https://api.bilibili.com/x/relation/fans', ['vmid', 'pn', 'ps']],
  messages: ['https://api.vc.bilibili.com/session_svr/v1/session_svr/get_sessions', ['session_type', 'size', 'build', 'mobi_app', 'begin_ts']],
});
const decimal = value => typeof value === 'string' && /^\d{1,25}$/.test(value) ? value : Number.isSafeInteger(value) && value >= 0 ? String(value) : undefined;
const count = value => { const id = decimal(value); return id && Number.isSafeInteger(Number(id)) ? Number(id) : undefined; };
const clean = (value, max = 4000) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, max) : '';
const https = value => { try { const u = new URL(value); if (u.protocol === 'http:') u.protocol = 'https:'; if (u.protocol === 'https:' && !u.username && !u.password && u.href.length <= 4096) return u.href; } catch {} };
const stamp = value => { const n = count(value); return n !== undefined && n > 0 && n < 4102444800 ? new Date(n * 1000).toISOString() : undefined; };

// JSON.parse normally rounds large comment IDs before a reviver can see them.
// Quote integer tokens only outside strings, preserving exact IDs and cursors.
function parseExactJSON(text) {
  let out = '', quoted = false, escaped = false;
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (quoted) { out += c; i++; if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue; }
    if (c === '"') { quoted = true; out += c; i++; continue; }
    if (c === '-' || /[0-9]/.test(c)) {
      const token = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i))?.[0];
      if (token) { out += /^-?\d+$/.test(token) && !Number.isSafeInteger(Number(token)) ? JSON.stringify(token) : token; i += token.length; continue; }
    }
    out += c; i++;
  }
  return JSON.parse(out);
}

async function createReadTransport({ accountSession, assertCurrent, timeoutMs = 10000 }) {
  let closed = false, initial, inFlight;
  const credential = async () => {
    const rows = await accountSession.cookies.get({ url: 'https://api.bilibili.com/' });
    const candidates = rows.filter(row => row.name === 'SESSDATA' && (!row.expirationDate || row.expirationDate > Date.now() / 1000));
    if (candidates.length !== 1 || typeof candidates[0].value !== 'string' || !candidates[0].value || candidates[0].value.length > 4096 || /[\u0000-\u0020\u007f;,]/.test(candidates[0].value)) throw Error('B站官方登录未就绪，请到账号管理恢复登录');
    const value = candidates[0].value, hash = createHash('sha256').update(value).digest('hex');
    if (initial && hash !== initial) throw Error('B站登录会话已变化，本次读取已停止');
    initial = hash; return value;
  };
  return {
    close() { closed = true; inFlight?.abort(); initial = undefined; },
    async read(route, params = {}) {
      const spec = Object.hasOwn(ROUTES, route) && ROUTES[route];
      if (!spec || !params || Object.keys(params).some(key => !spec[1].includes(key)) || Object.values(params).some(value => typeof value !== 'string' || value.length > 80)) throw Error('不支持的只读数据请求');
      if (closed || inFlight) throw Error('本次只读连接已结束或正在读取');
      const controller = new AbortController(); inFlight = controller; let timer;
      const check = () => { if (closed || controller.signal.aborted) throw Error('B站只读请求超时或已停止'); };
      const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Error('B站只读请求超时，请稍后重试；未改变平台未读状态')); }, timeoutMs); });
      try {
        return await Promise.race([(async () => {
          await assertCurrent(); check(); const value = await credential(); check();
          const url = new URL(spec[0]); url.search = new URLSearchParams(params).toString();
          const response = await accountSession.fetch(url.href, { method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal,
            headers: { Accept: 'application/json', Cookie: `SESSDATA=${value}`, Referer: 'https://www.bilibili.com/' } });
          check();
          if (response.status !== 200 || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) throw Error('B站未返回数据JSON，可能需要登录或本人完成官方验证');
          const reader = response.body?.getReader(); if (!reader) throw Error('B站响应正文不可读取');
          let size = 0; const chunks = [];
          while (true) { check(); const part = await reader.read(); check(); if (part.done) break; size += part.value.length; if (size > 2 * 1024 * 1024) { void reader.cancel().catch(() => {}); throw Error('B站单页数据过大，已停止读取'); } chunks.push(Buffer.from(part.value)); }
          const result = parseExactJSON(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size)));
          check(); await credential(); await assertCurrent(); check();
          if (!result || typeof result !== 'object' || Array.isArray(result) || !Number.isInteger(result.code)) throw Error('B站数据结构未识别，不会将其当作空列表');
          if (result.code !== 0) throw Error(`B站拒绝读取（错误码 ${result.code}）${[-101, -111].includes(result.code) ? '，请恢复官方登录' : [-352, -412, -509].includes(result.code) ? '，请稍后重试或本人完成官方验证' : '，当前数据尚不可读取'}`);
          return result.data;
        })(), deadline]);
      } catch (error) {
        // Do not relay native fetch exceptions, headers or platform bodies.
        if (/^B站|^不支持的只读/.test(error?.message || '')) throw error;
        throw Error('B站只读连接失败，请检查网络或官方登录；原有记录已保留');
      } finally { clearTimeout(timer); controller.abort(); if (inFlight === controller) inFlight = undefined; }
    },
  };
}

function commentRow(row, workId, parentPlatformId) {
  const id = decimal(row?.rpid_str ?? row?.rpid), mid = decimal(row?.member?.mid);
  if (!id || !mid || typeof row.content?.message !== 'string') throw Error('B站评论编号或正文结构未识别，未冒充读取完成');
  return { platformId: id, author: clean(row.member.uname, 200) || `UID ${mid}`, authorProfileUrl: `https://space.bilibili.com/${mid}`, avatarUrl: https(row.member.avatar), content: clean(row.content.message), displayTime: stamp(row.ctime), workId, ...(parentPlatformId ? { parentPlatformId } : {}) };
}

// One server page per call. Continuations are retained in the main process,
// not a caller-supplied URL/MID. A failed page leaves its cursor retriable.
async function readInteractionPage({ client, state, nativeAccountKey }) {
  const nav = await client.read('nav');
  if (nav?.isLogin !== true || decimal(nav.mid) !== nativeAccountKey) throw Error('B站当前本人UID与绑定账号不一致，未读取其他账号的数据');
  const next = structuredClone(state); let records, source, complete = false, total;
  if (state.kind === 'messages') {
    source = ROUTES.messages[0];
    const data = await client.read('messages', { session_type: '4', size: '20', build: '0', mobi_app: 'web', ...(state.begin ? { begin_ts: state.begin } : {}) });
    if (!data || !Array.isArray(data.session_list) || ![0, 1].includes(data.has_more)) throw Error('B站会话分页结构未识别，未当成没有消息');
    records = data.session_list.map(row => {
      const id = decimal(row.talker_id), type = count(row.session_type); if (!id || type === undefined) throw Error('B站会话ID未识别');
      const unread = count(row.unread_count), info = row.account_info || {}; let content = '';
      if (row.last_msg?.msg_type === 1) { try { const body = typeof row.last_msg.content === 'string' ? JSON.parse(row.last_msg.content) : row.last_msg.content; content = clean(body?.content); } catch {} }
      return { platformId: `${type}:${id}`, author: clean(info.name, 200) || `UID ${id}`, avatarUrl: https(info.pic_url), content: content || (row.last_msg ? '非文本消息（仅会话摘要）' : '暂无可读取的消息摘要'), displayTime: stamp(row.last_msg?.timestamp), ...(unread === undefined ? {} : { unreadState: unread ? 'unread' : 'read', unreadCount: unread }) };
    });
    complete = data.has_more === 0;
    if (!complete) { const cursor = decimal(data.session_list.at(-1)?.session_ts); if (!cursor || state.begin && BigInt(cursor) >= BigInt(state.begin)) throw Error('B站会话分页未前进，保留已有结果，未宣称全量'); next.begin = cursor; }
  } else if (state.kind === 'followers') {
    source = ROUTES.followers[0];
    const data = await client.read('followers', { vmid: nativeAccountKey, pn: String(state.page), ps: '50' }); total = count(data?.total);
    if (!data || !Array.isArray(data.list) || total === undefined) throw Error('B站粉丝分页结构未识别，粉丝总数不等于已获取的粉丝名单');
    records = data.list.map(row => { const id = decimal(row?.mid); if (!id) throw Error('B站粉丝UID未识别'); return { platformId: id, author: clean(row.uname, 200) || `UID ${id}`, avatarUrl: https(row.face), authorProfileUrl: `https://space.bilibili.com/${id}`, content: clean(row.sign), displayTime: stamp(row.mtime) }; });
    if (!records.length && total > (state.page - 1) * 50) throw Error('B站粉丝列表提前结束，平台可能限制可访问范围；不是获取了全部粉丝');
    complete = state.page * 50 >= total; next.page++;
  } else {
    source = ROUTES.comments[0];
    const video = await client.read('video', { bvid: state.workId });
    const aid = decimal(video?.aid);
    if (!aid || video.bvid !== state.workId || decimal(video.owner?.mid) !== nativeAccountKey) throw Error('B站作品编号或作者UID不属于当前绑定账号，未读取评论');
    if (state.children.length) {
      const child = state.children[0];
      const data = await client.read('replies', { type: '1', oid: aid, root: child.id, pn: String(child.page), ps: '20' });
      const size = count(data?.page?.size), childTotal = count(data?.page?.count);
      if (childTotal === undefined || size !== 20 || !(Array.isArray(data.replies) || data.replies === null && childTotal === 0)) throw Error('B站子评论分页结构未识别');
      records = (data.replies || []).map(row => commentRow(row, state.workId, child.id));
      if (!records.length && childTotal > (child.page - 1) * 20) throw Error('B站子评论提前结束，当前结果不完整');
      if (child.page * 20 >= childTotal) next.children.shift(); else next.children[0].page++;
      complete = next.rootEnded && !next.children.length;
    } else {
      const data = await client.read('comments', { type: '1', oid: aid, pn: String(state.page), ps: '20', sort: '0', nohot: '1' });
      const roots = count(data?.page?.count), size = count(data?.page?.size); total = count(data?.page?.acount);
      if (roots === undefined || size !== 20 || !(Array.isArray(data.replies) || data.replies === null && roots === 0)) throw Error('B站评论分页结构未识别，未当成没有评论');
      const rootsOnPage = [...(data.replies || [])];
      const pinned = state.page === 1 ? data.upper?.top : undefined;
      if (pinned && !rootsOnPage.some(row => decimal(row.rpid_str ?? row.rpid) === decimal(pinned.rpid_str ?? pinned.rpid))) rootsOnPage.unshift(pinned);
      records = rootsOnPage.map(row => commentRow(row, state.workId));
      if (!records.length && roots > (state.page - 1) * 20) throw Error('B站评论提前结束，当前结果不完整');
      next.children = rootsOnPage.filter(row => count(row.rcount) > 0).map(row => ({ id: decimal(row.rpid_str ?? row.rpid), page: 1 }));
      next.rootEnded = state.page * 20 >= roots; next.page++; complete = next.rootEnded && !next.children.length;
    }
  }
  const stage = state.kind === 'comments' ? state.children.length ? 'child:' + state.children[0].id : 'roots' : state.kind;
  const signature = records.length ? createHash('sha256').update(records.map(row => row.platformId).join(':')).digest('hex') : undefined;
  if (signature && state.lastStage === stage && state.lastSignature === signature) throw Error('B站返回了重复分页，已停止并保留记录，未宣称获取全部');
  next.lastStage = stage; next.lastSignature = signature;
  const after = await client.read('nav');
  if (after?.isLogin !== true || decimal(after.mid) !== nativeAccountKey) throw Error('读取期间B站本人UID已变化，本页结果已丢弃');
  return { records, source, complete, ...(total !== undefined ? { total } : {}), next };
}

function registerBilibiliInteractions({ ipcMain, getWindow, authenticate, session, createTransport = createReadTransport, now = Date.now }) {
  const continuations = new Map(), busy = new Set(), nextAllowed = new Map();
  ipcMain.handle('matrix:bilibili-interactions', async (event, input) => {
    let client, scope, acquired = false, ended = false;
    const budget = createOperationBudget(45000);
    try {
      const host = getWindow(); if (!host || host.isDestroyed?.() || event.sender !== host.webContents) throw Error('仅允许远效主窗口读取互动数据');
      if (!input || !['comments', 'messages', 'followers'].includes(input.kind)) throw Error('互动类型无效');
      const auth = await budget.run(() => authenticate(input.accessToken, input.accountId), '核对互动数据所属账号', 8000), account = auth.account;
      if (!account || account.id !== input.accountId || account.platform !== 'bilibili' || !/^[a-z0-9-]{16,80}$/i.test(account.connectorSessionId || '') || !decimal(account.nativeAccountKey)) throw Error('请先在账号管理绑定并核实B站本人UID');
      scope = [auth.userId, account.id, account.connectorSessionId, account.nativeAccountKey].join(':');
      if (busy.has(scope)) throw Error('此B站账号正在读取另一页互动数据，请稍候');
      if ((nextAllowed.get(scope) || 0) > now()) throw Error('读取过于频繁，请稍后重试；保留已有结果');
      for (const [id, value] of continuations) if (value.expires <= now()) continuations.delete(id);
      while (continuations.size >= 256) continuations.delete(continuations.keys().next().value);
      if (nextAllowed.size > 256) for (const [id, value] of nextAllowed) if (value <= now()) nextAllowed.delete(id);
      let state;
      if (input.cursor !== undefined) {
        const previous = typeof input.cursor === 'string' && continuations.get(input.cursor);
        if (!previous || previous.scope !== scope || previous.state.kind !== input.kind || previous.expires <= now() || input.kind === 'comments' && previous.state.workId !== input.workId) throw Error('分页凭据已过期或不属于本账号与作品，请重新读取');
        state = previous.state;
      } else {
        if (input.kind === 'comments' && !/^BV[0-9A-Za-z]{10}$/.test(input.workId || '')) throw Error('请填写本人作品的准确BV号，不按同名标题猜测');
        state = { kind: input.kind, page: 1, children: [], rootEnded: false, ...(input.kind === 'comments' ? { workId: input.workId } : {}) };
      }
      busy.add(scope); acquired = true;
      const assertCurrent = async () => { budget.check(); if (ended) throw Error('本次互动读取已结束'); const fresh = await budget.run(() => authenticate(input.accessToken, input.accountId), '再次确认互动账号', 8000); if (ended || [fresh.userId, fresh.account?.id, fresh.account?.connectorSessionId, fresh.account?.nativeAccountKey].join(':') !== scope || fresh.account?.platform !== 'bilibili') throw Error('账号绑定已变化，停止读取'); };
      client = await budget.run(() => createTransport({ accountSession: session.fromPartition('persist:matrix-bilibili-' + account.connectorSessionId), assertCurrent }).then(value => { if (ended) { value.close(); throw Error('本次互动读取已结束'); } return value; }), '准备本次只读连接', 5000);
      const result = await budget.run(() => readInteractionPage({ client, state, nativeAccountKey: account.nativeAccountKey }), '读取本页互动数据', 30000); await assertCurrent();
      let nextCursor;
      if (!result.complete) { nextCursor = randomUUID(); continuations.set(nextCursor, { scope, state: result.next, expires: now() + 10 * 60 * 1000 }); }
      nextAllowed.set(scope, now() + 1000);
      return { records: result.records, source: result.source, complete: result.complete, nextCursor, total: result.total, capturedAt: new Date(now()).toISOString(), accountId: account.id, sessionId: account.connectorSessionId, platform: 'bilibili', kind: input.kind,
        coverage: input.kind === 'messages' ? '会话列表与最新消息摘要，不含完整聊天历史' : '当前账号可访问的分页列表，不含被删除、隐藏或平台限制返回的数据' };
    } catch (error) {
      if (scope) nextAllowed.set(scope, now() + 15000);
      const message = error?.message || '';
      return { error: message.length <= 250 && /[\u4e00-\u9fff]/.test(message) && !/(?:cookie|sessdata|authorization|password|token)/i.test(message) ? message : '互动数据读取失败；保留已获取记录，不代表没有数据' };
    } finally { ended = true; client?.close(); if (acquired) busy.delete(scope); }
  });
}
module.exports = { registerBilibiliInteractions, createReadTransport, readInteractionPage, parseExactJSON };
