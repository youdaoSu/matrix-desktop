import { useEffect, useState } from 'react';
import type { PlatformAccount } from '@shared/api.interface';
import { createInteractionSnapshot, interactionStorageKey, type InteractionKind, type InteractionSnapshot } from '@shared/interaction-snapshot';
import { getAuthToken, getUser } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useOfficialWorkspace, platformLabels } from './OfficialWorkspace';
import { loadPublishAccounts } from './publish-preferences';
import { DouyinCommentAction } from './DouyinCommentAction';
import { useAppPreferences } from '@/contexts/AppPreferences';
import { useScopedOperation, type ScopedOperationLease } from './use-scoped-operation';

const names = { comments: '评论', messages: '私信会话', followers: '粉丝' };
export function OfficialInteractionManager({ account, kind }: { account?: PlatformAccount | null; kind: InteractionKind }) {
  return <InteractionWorkspace key={getUser()?.id || 'signed-out'} account={account} kind={kind} />;
}
function InteractionWorkspace({ account, kind }: { account?: PlatformAccount | null; kind: InteractionKind }) {
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]), [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const owner = getUser()?.id || '', token = getAuthToken();
  const listOperation = useScopedOperation('interaction-account-list');
  useEffect(() => {
    if (account) return; // Parent already supplies its selected bound account.
    let alive = true;
    const load = async () => {
      listOperation.cancel(); let request: ScopedOperationLease | undefined;
      try {
        request = listOperation.begin(); if (!request) return;
        const items = await request.wait(() => loadPublishAccounts({signal: request!.signal}));
        if (!alive || !request.current()) return;
        setAccounts(items); setSelected(id => items.some(item => item.id === id && item.connectorSessionId) ? id : ''); setError('');
      } catch (error) { if (alive && (!request || request.current())) setError(error instanceof Error ? error.message : '本机账号加载失败，请刷新页面'); }
      finally { request?.finish(); }
    };
    void load(); window.addEventListener('matrix:accounts-updated', load);
    return () => { alive = false; listOperation.cancel(); window.removeEventListener('matrix:accounts-updated', load); };
  }, [account, owner, token, listOperation.begin, listOperation.cancel]);
  const current = account || accounts.find(item => item.id === selected);
  return <section className="matrix-official-interaction rounded-lg border bg-background p-4 space-y-3" aria-label={`官方${names[kind]}管理`}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">个人账号 · {names[kind]}工作台</h2>{!account && <select aria-label={`选择${names[kind]}账号`} className="max-w-72 rounded border p-2" value={selected} onChange={event => setSelected(event.target.value)}><option value="">选择已绑定账号</option>{accounts.filter(item => item.connectorSessionId).map(item => <option key={item.id} value={item.id}>{platformLabels[item.platform]} · {item.nickname}</option>)}</select>}</div>
    <p className="text-xs text-muted-foreground">读取已登录官方页面中可识别的当前可见记录，不是全量同步。备注和“已处理”仅属于本地工作清单，不等于平台已回复、已读或已关注。</p>
    {kind === 'messages' && <p className="text-xs text-muted-foreground">此处读取、搜索、筛选、备注和本地已处理均不打开官方会话、不发送已读操作。未读仅显示页面明确提供的标记；无法识别时显示“未读状态未获取”。打开官网具体会话或前往回复时，平台可能自行标为已读，尚待真实核验。</p>}
    {error && <p role="alert">{error}</p>}
    {current && owner ? <AccountInteractions key={`${owner}:${current.id}:${current.platform}:${kind}`} account={current} owner={owner} kind={kind} /> : <p className="text-sm text-muted-foreground">{listOperation.busy ? '正在加载已绑定账号…' : '请先选择账号。'}</p>}
  </section>;
}

function AccountInteractions({ account, owner, kind }: { account: PlatformAccount; owner: string; kind: InteractionKind }) {
  const preferences = useAppPreferences();
  const workspace = useOfficialWorkspace();
  const [snapshot, setSnapshot] = useState<InteractionSnapshot>();
  const [clearOpen, setClearOpen] = useState(false);
  const [message, setMessage] = useState(''), [query, setQuery] = useState(''), [pendingOnly, setPendingOnly] = useState(false), [unreadOnly, setUnreadOnly] = useState(false), [draft, setDraft] = useState('');
  const operation = useScopedOperation(`${account.id}:${account.connectorSessionId}:${kind}`), busy = operation.busy;
  const storageKey = interactionStorageKey(owner, account.id, kind);
  useEffect(() => {
    const cleared = (event?: Event) => {
      const clearedKey = (event as CustomEvent<{key?: string}> | undefined)?.detail?.key;
      if (clearedKey && clearedKey !== storageKey) return;
      if (getUser()?.id !== owner) return;
      try { if (!localStorage.getItem(storageKey)) { operation.cancel(); setSnapshot(undefined); setMessage('已清除本地快照，先前读取结果不会恢复快照。'); } }
      catch { setMessage('无法确认本地快照是否已清除，请检查本机存储'); }
    };
    window.addEventListener('matrix:interaction-snapshots-cleared', cleared);
    const storageChanged = (event: StorageEvent) => { if (event.storageArea === localStorage && (event.key === storageKey || event.key === null) && event.newValue === null) cleared(); };
    window.addEventListener('storage', storageChanged);
    return () => { window.removeEventListener('matrix:interaction-snapshots-cleared', cleared); window.removeEventListener('storage', storageChanged); };
  }, [storageKey, owner, operation.cancel]);
  useEffect(() => {
    operation.cancel();
    if (!preferences.retainInteractionSnapshots) { setSnapshot(undefined); return; }
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const value = JSON.parse(saved) as InteractionSnapshot;
        if (!Array.isArray(value.records) || value.records.length > 100) throw Error('快照格式错误');
        const validated = createInteractionSnapshot(value.records, value.source, value.capturedAt, undefined, account.platform);
        validated.records = validated.records.map((row, index) => ({ ...row, note: String(value.records[index].note || '').slice(0, 500), handled: value.records[index].handled === true }));
        // Re-enabling retention must not overwrite a newer temporary snapshot
        // or its unsaved notes with an older saved copy.
        setSnapshot(current => current || validated);
      }
    } catch { setMessage('本地快照无法读取，请重新读取官方页面。'); }
    return () => operation.cancel();
  }, [storageKey, preferences.retainInteractionSnapshots, operation.cancel, account.platform]);
  const read = async () => {
    let request: ScopedOperationLease | undefined;
    try {
      request = operation.begin(); if (!request) return; setMessage('');
      if (!window.matrixDesktop?.officialData) throw Error('请使用支持互动工作台的新版桌面端');
      const page = workspace.page(account.id);
      if (!page) throw Error('请先打开该账号的官方页面，进入对应列表后再读取');
      const result = await request.wait(() => window.matrixDesktop!.officialData({ ...page(), command: 'read-interactions', kind }));
      if (!request.current() || getUser()?.id !== owner) return;
      if (result.error) throw Error(result.error);
      const validated = createInteractionSnapshot(result.records || [], result.source!, result.capturedAt!, undefined, account.platform);
      setSnapshot(previous => createInteractionSnapshot(validated.records, validated.source, validated.capturedAt, previous, account.platform));
      setMessage('已读取当前页面快照，尚未保存到本机。无唯一 ID 的记录不会按昵称合并。');
    } catch (error) { if (!request || request.current()) setMessage(error instanceof Error ? error.message : '读取失败'); }
    finally { request?.finish(); }
  };
  const patch = (id: string, value: { note?: string; handled?: boolean }) => setSnapshot(current => current && ({ ...current, records: current.records.map(row => row.id === id ? { ...row, ...value } : row) }));
  return <>
    {account.platform === 'douyin' && kind !== 'followers' && <p className="text-xs text-muted-foreground">{kind === 'comments' ? '抖音：先在官方内容管理中点击某条作品的评论入口，待评论显示后返回这里读取。每次只读取当前作品页面。' : '抖音：先在官方抖音网页点击“消息”，展开会话列表后返回这里读取。仅包含当前加载的会话名称和最近消息预览，不是完整聊天记录。'}</p>}
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => void workspace.openAccount(account, kind === 'followers' ? 'manage' : kind)}>打开账号页面 · {names[kind]}</Button>
      <Button disabled={busy} onClick={() => void read()}>{busy ? '读取中…' : '读取当前可见记录'}</Button>
      {busy && <Button variant="outline" onClick={() => { operation.cancel(); setMessage('已停止等待读取，已有快照和备注保留；不会修改平台未读状态。'); }}>停止等待读取</Button>}
      <Button variant="outline" disabled={!snapshot || busy || !preferences.retainInteractionSnapshots} onClick={() => { try { if (!preferences.retainInteractionSnapshots) throw Error('本地互动快照保存已关闭'); if (getUser()?.id !== owner) throw Error('登录用户已变化'); localStorage.setItem(storageKey, JSON.stringify(snapshot)); setMessage('当前快照及备注已保存到本机，按远效用户和平台账号区分。'); } catch { setMessage('本地保存失败，请检查可用存储空间和登录状态'); } }}>保存本地快照</Button>
      <Button variant="outline" onClick={() => setClearOpen(true)}>清除本地快照</Button>
    </div>
    <Dialog open={clearOpen} onOpenChange={setClearOpen}><DialogContent><DialogHeader><DialogTitle>清除本地快照？</DialogTitle><DialogDescription>仅清除此账号此模块的本地快照和备注，无法恢复。不会删除平台评论、私信或粉丝。清除后，尚未返回的读取也不会恢复快照。</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setClearOpen(false)}>取消</Button><Button variant="destructive" onClick={() => { try { if (getUser()?.id !== owner) throw Error('登录用户已变化'); localStorage.removeItem(storageKey); operation.cancel(); setSnapshot(undefined); setClearOpen(false); window.dispatchEvent(new CustomEvent('matrix:interaction-snapshots-cleared', {detail: {key: storageKey}})); setMessage('已清除本地快照，官方数据未修改。'); } catch { setMessage('清除失败'); } }}>确认清除本地快照</Button></div></DialogContent></Dialog>
    {message && <p role="status" className="text-sm text-orange-700">{message}</p>}
    {snapshot && <><small className="block break-all text-muted-foreground">{snapshot.source} · {new Date(snapshot.capturedAt).toLocaleString()} · 当前快照 {snapshot.records.length} 条（非全部）</small><div className="flex flex-wrap gap-3 items-center"><Input className="flex-1 min-w-48" aria-label="搜索本地互动记录" placeholder="搜索昵称、内容、备注" value={query} onChange={event => setQuery(event.target.value)} /><label className="whitespace-nowrap text-sm"><input type="checkbox" checked={pendingOnly} onChange={event => setPendingOnly(event.target.checked)} />仅待处理</label>{kind === 'messages' && <label className="whitespace-nowrap text-sm"><input type="checkbox" aria-label="仅显示已获取未读标记的快照" checked={unreadOnly} onChange={event => setUnreadOnly(event.target.checked)} />仅平台未读</label>}</div><div className="max-h-96 overflow-auto divide-y">{snapshot.records.filter(row => (!pendingOnly || !row.handled) && (!unreadOnly || row.unreadState === 'unread') && `${row.author} ${row.content} ${row.note}`.includes(query)).map(row => <article key={row.id} className="space-y-2 py-3" data-snapshot-unread={kind === 'messages' ? row.unreadState || 'unknown' : undefined}><div className="flex justify-between items-center gap-2"><div className="flex items-center gap-2"><Avatar className="h-9 w-9 shrink-0"><AvatarImage src={row.avatarUrl} alt={`${row.author}头像`} referrerPolicy="no-referrer" /><AvatarFallback>{row.author.slice(0, 1)}</AvatarFallback></Avatar><strong>{row.author}</strong>{kind === 'messages' && (row.unreadState ? <Badge variant={row.unreadState === 'unread' ? 'default' : 'secondary'}>{row.unreadState === 'unread' ? `平台未读${row.unreadCount !== undefined ? ` ${row.unreadCount}${row.unreadCountCapped ? '+' : ''}` : ''}` : '平台已读'}</Badge> : <small className="text-muted-foreground">未读状态未获取</small>)}</div><label className="text-sm whitespace-nowrap"><input type="checkbox" checked={row.handled} onChange={event => patch(row.id, { handled: event.target.checked })} />本地已处理</label></div>{row.content && <p className="text-sm whitespace-pre-wrap break-words">{row.content}</p>}<small className="text-muted-foreground">{row.platformId ? `平台记录 ID：${row.platformId}` : '未识别唯一 ID，重新读取不会继承备注'}</small><Input aria-label={`备注-${row.id}`} placeholder="本地备注 / 标签（保存后保留）" maxLength={500} value={row.note} onChange={event => patch(row.id, { note: event.target.value })}/>{kind==='comments'&&account.platform==='douyin'&&row.authorProfileUrl&&/^https:\/\/www\.douyin\.com\/video\/\d+$/.test(snapshot.source)&&<DouyinCommentAction accountId={account.id} author={row.author} authorProfileUrl={row.authorProfileUrl} comment={row.content}/>}</article>)}</div></>}
    {kind !== 'followers' && <div className="space-y-2 border-t pt-3"><Textarea aria-label="互动回复草稿" maxLength={2000} placeholder="回复草稿；不会自动选择收件人或发送" value={draft} onChange={event => setDraft(event.target.value)} /><Button variant="outline" disabled={!draft.trim()} onClick={() => void workspace.openAccount(account, kind, false, draft)}>带草稿前往官方回复</Button><p className="text-xs text-muted-foreground">请在官方页面核对具体评论或收件人，再填写并确认发送。平台限制、验证码和发送结果以官方页面为准。</p></div>}
  </>;
}
