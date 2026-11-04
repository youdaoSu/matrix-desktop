import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { enqueueImagePreview } from './image-preview-queue';
import { getAuthToken, getUser } from '@/api';
import type { PlatformAccount } from '@shared/api.interface';
import type { DouyinInboxInput, DouyinInboxMessage, DouyinInboxResult, DouyinSendReceipt } from '@shared/douyin-inbox';
import { Button } from '@/components/ui/button';
import { newRequestId } from '@shared/request-id';
import { uiText, useWorkspaceIdentity, useWorkspacePreference } from './WorkspaceUiState';
import { DouyinInlineText } from './DouyinInlineText';
import { InboxConversationList, createConversationProjection } from './InboxConversationList';
import { useInboxScroll } from './use-inbox-scroll';
import { sameInboxSnapshot } from './inbox-snapshot';

type MessagePage = { messages: DouyinInboxMessage[]; before?: string };
type SendDraft = { text: string; requestId: string; receipt?: DouyinSendReceipt };
type CallExtra = Pick<DouyinInboxInput, 'threadId' | 'before' | 'messageId' | 'text' | 'requestId'>;
type InboxContext = { rows: Record<string, DouyinInboxResult>; pages: Map<string, MessagePage>; drafts: Map<string, SendDraft>; call(accountId: string, command: DouyinInboxInput['command'], extra?: CallExtra): Promise<DouyinInboxResult> };
const Context = createContext<InboxContext>({ rows: {}, pages: new Map(), drafts: new Map(), call: async () => ({ error: '聊天接入尚未初始化' }) });
export function useDouyinInboxCache() { return useContext(Context); }
export function inboxAccountStatus(result?: DouyinInboxResult) {
  const s = result?.status, error = result?.error || s?.error || s?.pushError;
  const label = !result?.error&&s?.partialFailure ? '部分来源失败，继续同步' : error ? /权限不足|没有权限|无读取权限|未授权此功能/.test(error) ? '没有权限' : /验证码|本人验证|页面验证|官方验证/.test(error) ? '需要验证' : /缺少.*会话|缺少.*登录|恢复登录|重新登录/.test(error) ? '需要登录' : result?.error ? '获取失败' : s?.error ? '历史获取失败' : '新消息获取失败' : !s ? '连接中' : s.busy ? '同步中' : s.push === 'connected' ? '已连接' : '连接中';
  const detail = [error, s?.phase, s ? `已同步 ${s.threadCount} 个会话、${s.messageCount} 条消息；${s.historyComplete ? '本轮可访问历史已到末页' : '历史尚未全部读取'}` : '', s?.pushVerifiedAt ? '已验证收到实时新消息' : s?.push === 'connected' ? '实时通道已连接，真实新消息尚未验证' : '实时消息尚未连通', s?.profileNames ? `联系人昵称 ${s.profileNames.resolved}/${s.profileNames.total} 已读取；${s.profileNames.missingSecUid} 个缺少联系人资料编号` : '', s?.profileError ? '联系人资料读取暂停：'+s.profileError : '', ...(s?.systemSchemas || []).map(shape=>'系统提示结构：'+shape)].filter(Boolean).join('；');
  return { label, detail };
}
export function inboxHistoryStatus(result: DouyinInboxResult | undefined, complete: boolean) {
  if (result?.error || result?.status?.error) return '显示本地历史；同步已暂停，原因见上方账号提示';
  return complete ? '平台可访问历史已到末页' : '历史仍在同步';
}
export function DouyinInboxProvider({ accounts, children }: { accounts: PlatformAccount[]; children: ReactNode }) {
  const lease = useWorkspaceIdentity(), latest = useRef(accounts); latest.current = accounts;
  const [snapshot, setSnapshot] = useState<{ lease: string; rows: Record<string, DouyinInboxResult> }>({ lease: '', rows: {} });
  const pageCache = useRef({ lease, pages: new Map<string, MessagePage>(), drafts: new Map<string, SendDraft>() });
  if (pageCache.current.lease !== lease) pageCache.current = { lease, pages: new Map(), drafts: new Map() };
  const epoch = useRef(0), owner = getUser()?.id;
  const call = useCallback(async (accountId: string, command: DouyinInboxInput['command'], extra?: CallExtra) => {
    const token = getAuthToken(), user = getUser()?.id, account = latest.current.find(a => a.id === accountId && a.platform === 'douyin'), generation = epoch.current;
    if (!token || !user || !account || !window.matrixDesktop?.douyinInbox) return { error: '抖音聊天接入需要桌面版及已绑定账号' };
    let result: DouyinInboxResult;
    try { result = await window.matrixDesktop.douyinInbox({ command, accessToken: token, accountId, ...extra }); }
    catch { result = { error: command === 'send' ? '发送结果未确认，请核对原会话，勿重复发送' : '抖音聊天连接失败，原有存档保留' }; }
    const current = latest.current.find(a => a.id === accountId);
    if (epoch.current !== generation || getUser()?.id !== user || getAuthToken() !== token || current?.connectorSessionId !== account.connectorSessionId || current?.nativeAccountKey !== account.nativeAccountKey) return { error: command === 'send' ? '账号已切换，发送结果未确认，请核对原会话，勿重复发送' : '账号已切换，旧请求结果已丢弃' };
    if (result.accountId && (result.accountId !== accountId || result.sessionId !== account.connectorSessionId)) return { error: '聊天数据与绑定账号不一致，已拦截' };
    if (command !== 'stop' && command !== 'messages' && command !== 'attachment' && command !== 'send') setSnapshot(current => {
      const previous = current.lease === lease ? current.rows : {};
      const next = result.error ? { ...previous[accountId], ...result } : result;
      if (current.lease === lease && sameInboxSnapshot(previous[accountId], next)) return current;
      const preserved=previous[accountId];
      const stableNext=preserved?.threads&&sameInboxSnapshot(preserved.threads,next.threads)?{...next,threads:preserved.threads}:next;
      return { lease, rows: { ...previous, [accountId]: stableNext } };
    });
    return result;
  }, [lease]);
  const signature = accounts.filter(a => a.platform === 'douyin' && a.connectorSessionId).map(a => `${a.id}/${a.connectorSessionId}`).sort().join('|');
  useEffect(() => {
    const ids = latest.current.filter(a => a.platform === 'douyin' && a.connectorSessionId).map(a => a.id), token = getAuthToken(); let alive = true, pending = false;
    epoch.current++; setSnapshot({ lease, rows: {} });
    const tick = async () => { if (!alive || pending) return; pending = true; try { await Promise.all(ids.map(id => alive ? call(id, 'watch') : Promise.resolve())); } finally { pending = false; } };
    void tick(); const interval = setInterval(() => void tick(), 5000);
    return () => { alive = false; epoch.current++; clearInterval(interval); for (const id of ids) if (token) void window.matrixDesktop?.douyinInbox({ command: 'stop', accessToken: token, accountId: id }).catch(() => {}); };
  }, [signature, lease, call]);
  const value=useMemo(()=>({rows:snapshot.lease===lease&&owner?snapshot.rows:{},pages:pageCache.current.pages,drafts:pageCache.current.drafts,call}),[snapshot,lease,owner,call]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function inboxTextParts(message: DouyinInboxMessage): ReactNode[] {
  const parts: ReactNode[] = []; let offset = 0;
  for (const item of [...(message.mentions || [])].sort((a,b) => a.start - b.start)) {
    if (!Number.isSafeInteger(item.start) || !Number.isSafeInteger(item.length) || item.start < offset || item.length < 1 || item.start + item.length > message.text.length) continue;
    const label=<DouyinInlineText text={message.text.slice(item.start,item.start+item.length)}/>;
    const link=message.contentKind==='system'?safeNoticeLink(item.linkUrl):undefined;
    parts.push(<DouyinInlineText key={'text-'+offset} text={message.text.slice(offset, item.start)}/>, link?<a className="matrix-inbox-mention" key={item.start} href={link} target="_blank" rel="noreferrer">{label}</a>:<span className="matrix-inbox-mention" key={item.start}>{label}</span>); offset = item.start + item.length;
  }
  parts.push(<DouyinInlineText key={'text-'+offset} text={message.text.slice(offset)}/>); return parts;
}
export function safeNoticeLink(value: unknown): string | undefined {
  try {
    if(typeof value!=='string'||value.length>4096)return;
    const u=new URL(value);
    if(u.protocol!=='https:'||u.hostname!=='www.douyin.com'||u.username||u.password||u.port||u.search||u.hash)return;
    if(/^\/user\/MS4w[A-Za-z0-9_-]{1,256}$/.test(u.pathname)||/^\/video\/[1-9]\d{0,18}$/.test(u.pathname))return u.href;
  } catch { /* Unrecognized action metadata remains non-clickable text. */ }
}
export function inboxTimeBreak(previous: DouyinInboxMessage | undefined, current: DouyinInboxMessage) {
  const at = Date.parse(current.at), before = previous ? Date.parse(previous.at) : NaN;
  return Number.isFinite(at) && (!Number.isFinite(before) || at - before >= 5 * 60000);
}
export function isVisibleInboxMessage(message: Pick<DouyinInboxMessage,'status'> & Partial<Pick<DouyinInboxMessage,'messageType'>>) {
  // Also protects older renderer page caches. Control records are not bubbles;
  // unknown normal message types must retain their explicit fallback.
  return message.status!==1&&message.status!==2&&!(typeof message.messageType==='number'&&Number.isSafeInteger(message.messageType)&&message.messageType>=50000);
}
function InboxComposer({ account, threadId, name, scope }: { account: PlatformAccount; threadId: string; name: string; scope: string }) {
  const { drafts, call } = useContext(Context);
  const [draft, setDraft] = useState<SendDraft>(() => drafts.get(scope) || { text: '', requestId: newRequestId() });
  const [sending, setSending] = useState(false), alive = useRef(true), busy = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const update = (value: SendDraft) => { drafts.set(scope, value); if (alive.current) setDraft(value); };
  const submit = async () => {
    if (busy.current || !draft.text.trim() || draft.receipt?.state === 'unknown') return;
    busy.current = true; setSending(true);
    const pending: DouyinSendReceipt = { state: 'unknown', requestId: draft.requestId, message: '正在提交；请勿重复发送' };
    update({ ...draft, receipt: pending });
    try {
      const result = await call(account.id, 'send', { threadId, text: draft.text, requestId: draft.requestId });
      const receipt = result.receipt || { ...pending, message: result.error || '未收到明确回执，请核对原会话，勿重复发送' };
      update(receipt.state === 'confirmed' ? { text: '', requestId: newRequestId(), receipt } : { ...draft, receipt });
    } catch { update({ ...draft, receipt: { ...pending, message: '发送结果未确认，请核对原会话，勿重复发送' } }); }
    finally { busy.current = false; if (alive.current) setSending(false); }
  };
  return <form className="matrix-inbox-composer" aria-label="回复当前会话" onSubmit={e => { e.preventDefault(); void submit(); }}>
    <small>发送账号：{account.nickname} · 接收方：{name}</small>
    <textarea aria-label="私信回复正文" placeholder="输入消息，点击发送" maxLength={2000} value={draft.text} disabled={sending || draft.receipt?.state === 'unknown'} onChange={e => update({ text: e.target.value, requestId: newRequestId() })}/>
    <div><small>{draft.text.length}/2000</small><Button type="submit" disabled={sending || !draft.text.trim() || draft.receipt?.state === 'unknown'}>{sending ? '发送中…' : '发送'}</Button></div>
    {draft.receipt && <p role={draft.receipt.state === 'confirmed' ? 'status' : 'alert'}>{draft.receipt.message}</p>}
    {draft.receipt?.state === 'unknown' && !sending && <Button type="button" variant="outline" size="sm" onClick={() => update({ text: draft.text, requestId: newRequestId() })}>我已核对原会话，重新编辑</Button>}
  </form>;
}

function InboxMessageBody({ message: m, accountId }: { message: DouyinInboxMessage; accountId:string }) {
  const {call} = useContext(Context), host = useRef<HTMLDivElement>(null);
  const [near,setNear]=useState(false),[attempt,setAttempt]=useState(0),[image,setImage]=useState(''),[error,setError]=useState(''),[warning,setWarning]=useState('');
  const picture=m.contentKind==='image'||m.contentKind==='emoji', cover=m.contentKind==='card'&&!!m.cardCoverUrl, preview=picture||cover;
  useEffect(()=>{if(!preview)return;if(typeof IntersectionObserver==='undefined'){setNear(true);return;}const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setNear(true);observer.disconnect();}},{rootMargin:'160px'});if(host.current)observer.observe(host.current);return()=>observer.disconnect();},[preview]);
  useEffect(()=>{if(!preview||!near)return;let current=true;const previewAbort=new AbortController();setImage('');setError('');setWarning('');const admitted=enqueueImagePreview(async()=>{if(!current)return;try{const r=await call(accountId,'attachment',{threadId:m.threadId,messageId:m.id});if(!current)return;if(r.error)throw Error(r.error);if(!r.attachment||!/^data:image\/(?:png|jpeg|gif|webp);base64,/.test(r.attachment.dataUrl))throw Error('图片预览暂未返回');setImage(r.attachment.dataUrl);setWarning(r.attachment.cacheWarning?.slice(0,200)||'');}catch(e){if(current)setError(e instanceof Error?e.message:'图片预览失败');}},previewAbort.signal);if(!admitted)setError('图片预览队列繁忙，请稍后再试');return()=>{current=false;previewAbort.abort();};},[accountId,m.id,m.threadId,m.version,m.mediaUrl,m.cardCoverUrl,preview,near,attempt,call]);
  const genericLabel=/^\[(?:图片|表情)\]$/.test(m.text);
  const mediaOnly = picture && (m.textIsMediaLabel === true || genericLabel) && (!error || genericLabel);
  const renderedPreview=preview&&(image?<img className={cover?'matrix-inbox-card-cover':'matrix-inbox-picture'} src={image} alt={cover?'作品预览':m.contentKind==='emoji'?'表情':'聊天图片'} onError={()=>{setImage('');setError('图片已读取，但当前格式无法显示');}}/>:error?<div className="matrix-inbox-media-error"><small>{error}</small><Button size="sm" variant="outline" onClick={()=>setAttempt(n=>n+1)}>重试图片预览</Button></div>:<small className="matrix-inbox-media-loading">{near?'正在读取图片预览…':'图片进入视野后自动预览'}</small>);
  return <div ref={host} className={'matrix-inbox-message-body kind-' + (m.contentKind || 'text')}>
    {cover&&renderedPreview}<div>{!mediaOnly && inboxTextParts(m)}</div>
    {picture&&renderedPreview}
    {!picture&&m.mediaUrl&&(m.contentKind==='audio'?<audio controls preload="metadata" src={m.mediaUrl} onError={()=>setError('语音暂时无法播放，可能是地址、格式或权限问题')}/>:m.contentKind==='video'?<video controls preload="metadata" src={m.mediaUrl} onError={()=>setError('视频暂时无法播放，可能是地址、格式或权限问题')}/>:null)}
    {!preview&&error&&<small>{error}</small>}
    {preview&&warning&&<small>{warning}</small>}
    {m.linkUrl&&<a href={m.linkUrl} target="_blank" rel="noreferrer">查看卡片详情</a>}{!picture&&m.contentNote&&<small>{m.contentNote}</small>}
  </div>;
}
export function inboxParties(message:DouyinInboxMessage,thread:{id:string;type:number;name:string;peer?:string;avatarUrl?:string},account:PlatformAccount,ownUid?:string){
  const own=message.direction==='outbound'&&(!ownUid||message.sender===ownUid),peer=thread.type===1&&thread.peer===message.sender;
  return {sender:own?`${account.nickname||'当前账号'}（自己）`:message.senderName||(peer?thread.name:'昵称待同步'),senderAvatar:own?account.avatarUrl:message.senderAvatarUrl||(peer?thread.avatarUrl:undefined),receiver:thread.type===2?`${thread.name}（群聊）`:own?thread.name:`${account.nickname||'当前账号'}（自己）`,receiverId:thread.type===2?thread.id:own?thread.peer:ownUid};
}

export function DouyinInboxView({ accounts, accountId, matches }: { accounts: PlatformAccount[]; accountId?: string; matches?: (id: string) => boolean }) {
  const { rows, pages, call } = useContext(Context), lease = useWorkspaceIdentity();
  const visible = accounts.filter(a => a.platform === 'douyin' && (!accountId || a.id === accountId) && (!matches || matches(a.id)));
  const [selected, setSelected] = useWorkspacePreference(`interaction.douyin.inbox.${accountId || 'all'}.selected`, '', uiText);
  const [projectConversations]=useState(()=>createConversationProjection());
  const options=projectConversations(lease,visible.map(account=>({account,threads:rows[account.id]?.threads})));
  const thread = options.find(t => t.selection === selected), revision = thread?.messageRevision ?? (thread ? rows[thread.account.id]?.status?.revision : undefined);
  const [snapshot, setSnapshot] = useState<{ scope: string; messages: DouyinInboxMessage[]; before?: string }>({ scope: '', messages: [] });
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), request = useRef(0);
  const scope = `${lease}/${thread?.account.connectorSessionId || ''}/${thread?.account.nativeAccountKey || ''}/${selected}`, current = useRef(scope); current.current = scope;
  const scroll=useInboxScroll(scope,!!thread);
  const snapshotRef = useRef(snapshot); snapshotRef.current = snapshot;
  const inFlight = useRef(false), loadedRevision = useRef<number | undefined>(undefined);
  const load = async (older = false) => {
    if (!thread || inFlight.current) return; const generation = ++request.current, captured = scope, previous = snapshotRef.current.scope === scope ? snapshotRef.current : undefined;
    if(older)scroll.beforePrepend();
    inFlight.current = true;
    setLoading(true); setError('');
    try {
      let result = await call(thread.account.id, 'messages', { threadId: thread.id, ...(older && previous?.before ? { before: previous.before } : {}) });
      const incoming = [...(result.messages || [])], existing = new Set(previous?.messages.map(m => m.id)), seen = new Set<string>();
      // If more than 50 new messages arrived, bridge the local-cache gap before
      // merging. These are native archive reads, not platform history requests.
      while (!older && previous?.messages.length && result.before && !incoming.some(m => existing.has(m.id)) && !result.error) {
        if (generation !== request.current || current.current !== captured) return;
        if (seen.has(result.before) || seen.size >= 1000) { result = { error: '本机历史分页未前进，已保留原有消息' }; break; }
        seen.add(result.before);
        result = await call(thread.account.id, 'messages', { threadId: thread.id, before: result.before });
        incoming.unshift(...(result.messages || []));
      }
      if (generation !== request.current || current.current !== captured) return;
      if (result.error) setError(result.error);
      else {
        const merged = new Map([...(previous?.messages || []), ...incoming].map(m => [m.id, m]));
        const messages = [...merged.values()].sort((a, b) => {
          const ai = /^\d+$/.test(a.index || '') ? BigInt(a.index) : BigInt(a.id), bi = /^\d+$/.test(b.index || '') ? BigInt(b.index) : BigInt(b.id);
          return ai < bi ? -1 : ai > bi ? 1 : a.id.localeCompare(b.id);
        });
        const page = { messages, before: older || !previous?.messages.length ? result.before : previous.before };
        setSnapshot({ scope: captured, ...page }); pages.set(captured, page); loadedRevision.current = revision;
        if (pages.size > 10) pages.delete(pages.keys().next().value!);
      }
    } finally { if (generation === request.current) { loadedRevision.current = revision; inFlight.current = false; setLoading(false); } }
  };
  useEffect(() => { const cached = pages.get(scope); const restored = cached ? { scope, ...cached } : { scope, messages: [] }; snapshotRef.current = restored; setSnapshot(restored); setError(''); loadedRevision.current = undefined; inFlight.current = false; void load(); return () => { request.current++; inFlight.current = false; }; }, [scope]);
  // A new revision updates only the local copy, never enters/marks a platform conversation.
  useEffect(() => { if (thread && !loading && loadedRevision.current !== revision) void load(); }, [revision, loading]);
  // Keep every cached ID for history anchors/bridging, but build the entire
  // visible timeline (including time separators) without NOT_EXIST/INVISIBLE.
  const messages = snapshot.scope === scope ? snapshot.messages.filter(isVisibleInboxMessage) : [];
  return <section className="matrix-douyin-inbox" aria-label="抖音聊天历史与推送">
    <div className="matrix-interaction-toolbar" aria-label="私信账号获取状态">{visible.map(a => { const status = inboxAccountStatus(rows[a.id]); return <small key={a.id} role="status" aria-label={`${a.nickname}私信获取状态`} title={status.detail}>{a.nickname || '抖音账号'} · {status.label}</small>; })}{!visible.length && <small>暂无已绑定的抖音账号</small>}</div>
    <div className="matrix-inbox-chat"><InboxConversationList key={lease+'/'+accountId} items={options} selected={selected} onSelect={setSelected}/>
      <main>{thread ? <><header className="matrix-inbox-thread-header"><strong>{thread.name}</strong><small>本地查看不会改变抖音未读状态 · {inboxHistoryStatus(rows[thread.account.id], thread.complete)}</small></header><div className="matrix-inbox-timeline" ref={scroll.viewport} style={{overflowAnchor:'none'}}>{snapshot.scope === scope && snapshot.before && <Button size="sm" variant="outline" disabled={loading} onClick={() => void load(true)}>加载更早消息</Button>}<div className="matrix-inbox-bubbles" ref={scroll.bubbles}>{messages.map((m,index) => {const parties=inboxParties(m,thread,thread.account,rows[thread.account.id]?.status?.ownUid),system=m.contentKind==='system';return <div className="matrix-inbox-timeline-entry" key={scope+'/'+m.id}>
        {inboxTimeBreak(messages[index-1],m)&&<time className="matrix-inbox-time-separator" dateTime={m.at}>{new Date(m.at).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time>}
        <article className={system ? 'system' : m.direction} title={`发送者：${parties.sender}（${m.sender}）\n接收方：${parties.receiver}${parties.receiverId?'（'+parties.receiverId+'）':''}\n${m.at ? new Date(m.at).toLocaleString('zh-CN') : '平台时间未识别'}`}>
        {!system&&<div className="matrix-inbox-sender-avatar">{parties.senderAvatar?<img src={parties.senderAvatar} alt={`${parties.sender}的头像`} referrerPolicy="no-referrer"/>:<span>{parties.sender.slice(0,1)}</span>}</div>}
        <div className="matrix-inbox-message-content">{!system&&<header className="matrix-inbox-message-parties" aria-label="消息收发双方"><span>{parties.sender}</span><span className="sr-only">接收方：{parties.receiver}</span></header>}
        <InboxMessageBody key={`${scope}/${m.id}/${m.version}/${m.mediaUrl||''}`} message={m} accountId={thread.account.id}/></div></article></div>;})}</div>{loading && <p role="status">读取本机消息…</p>}{error && <p role="alert">{error}</p>}</div><InboxComposer key={scope} scope={scope} account={thread.account} threadId={thread.id} name={thread.name}/></> : <p>选择会话查看本机缓存；图片和表情进入视野后自动预览，语音、视频不自动播放。</p>}</main>
    </div>
  </section>;
}
