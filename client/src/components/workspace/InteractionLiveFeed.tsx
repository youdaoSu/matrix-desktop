import { useEffect, useRef, useState } from 'react';
import { getAuthToken, getUser } from '@/api';
import type { PlatformAccount } from '@shared/api.interface';
import { createInteractionSnapshot, type InteractionKind, type InteractionSnapshot } from '@shared/interaction-snapshot';
import { useAppPreferences } from '@/contexts/AppPreferences';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { AccountAvatar } from './AccountAvatar';
import { useOfficialWorkspace, platformLabels } from './OfficialWorkspace';
import { loadPublishAccounts } from './publish-preferences';
import { createInteractionRefresh, type InteractionRefreshState } from './interaction-refresh';
import { InteractionEmpty, exportInteractionRecords, interactionPlatform } from './InteractionUi';
import { DouyinMessageSource } from './DouyinMessageSource';
import { BilibiliInteractionFeed } from './BilibiliInteractionFeed';
import { DouyinInteractionFeed } from './DouyinInteractionFeed';
import { uiBoolean, uiText, useWorkspacePreference } from './WorkspaceUiState';

const labels = { comments: '评论', messages: '私信', followers: '粉丝' };
const storageKey = (owner: string, account: PlatformAccount, kind: InteractionKind) => `matrix-interaction-live-v2:${encodeURIComponent(owner)}:${account.id}:${account.connectorSessionId}:${kind}`;
type Entry = { sessionId?: string; snapshot?: InteractionSnapshot; status?: InteractionRefreshState };

// This is the primary feed, not a separate manual snapshot pane. All data is
// from owned rendered lists; no fabricated full-history or unread guarantees.
type Props = { kind: InteractionKind; platform?: string; account?: PlatformAccount | null; syncPlatform?: boolean; matches?(accountId: string, timestamp?: string): boolean; commentView?: 'work' | 'aggregate'; workId?: string };
export function InteractionLiveFeed(props: Props) {
  if (props.platform === 'douyin' && props.kind !== 'messages') return <DouyinInteractionFeed key={`${getUser()?.id || 'signed-out'}:${getAuthToken() || ''}:${props.kind}`} kind={props.kind} account={props.account} matches={props.matches} commentView={props.commentView} workId={props.workId} />;
  // These adapters do not yet prove a stable per-work association. Keep their
  // working aggregate entry, but never present an account snapshot as a
  // selected work's comments. Linked local history remains in CommentsPage.
  if (props.kind === 'comments' && props.commentView === 'work') return <InteractionEmpty>{!props.account ? '请先选择账号，再选择作品查看评论' : !props.workId ? '请选择左侧作品查看评论' : '仅展示下方已准确关联此作品的历史评论；官网采集记录尚未关联作品，不混入此列表'}</InteractionEmpty>;
  if (props.platform === 'bilibili') return <BilibiliInteractionFeed key={`${getUser()?.id || 'signed-out'}:${getAuthToken() || ''}:${props.kind}`} kind={props.kind} account={props.account} matches={props.matches} />;
  return <OwnedInteractionLiveFeed key={`${getUser()?.id || 'signed-out'}:${getAuthToken() || ''}`} {...props} />;
}
function OwnedInteractionLiveFeed({ kind, platform = 'douyin', account, syncPlatform = true, matches }: Props) {
  const workspace = useOfficialWorkspace(), preferences = useAppPreferences();
  const owner = getUser()?.id || '', token = getAuthToken();
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]), [loadError, setLoadError] = useState('');
  const [entries, setEntries] = useState<Record<string, Entry>>({}), [automatic, setAutomatic] = useState(preferences.retainInteractionSnapshots);
  const [query, setQuery] = useWorkspacePreference(`interaction.live.${kind}.${platform}.query`, '', uiText);
  const [unreadOnly, setUnreadOnly] = useWorkspacePreference(`interaction.live.${kind}.${platform}.unread`, false, uiBoolean);
  const [saveError, setSaveError] = useState('');
  // Selecting an avatar filters the display, not the platform's collection.
  // A stale selected account must never widen a platform filter.
  const targets = accounts.filter(item => item.connectorSessionId && item.platform === interactionPlatform(platform) && (syncPlatform || !account || item.id === account.id));
  const displayed = targets.filter(item => !account || item.id === account.id);
  const latest = useRef({ workspace, targets, owner, token, automatic, preferences });
  latest.current = { workspace, targets, owner, token, automatic, preferences };
  const refresh = useRef<ReturnType<typeof createInteractionRefresh<PlatformAccount, () => MatrixPageActionInput>> | undefined>(undefined);
  useEffect(() => {
    const abort = new AbortController(); let sequence = 0;
    setAccounts([]); setEntries({}); setLoadError('');
    const load = async () => {
      const id = ++sequence;
      try {
        const rows = await loadPublishAccounts({ signal: abort.signal });
        if (!abort.signal.aborted && getUser()?.id === owner && sequence === id) { setAccounts(rows); setLoadError(''); }
      } catch (error) { if (!abort.signal.aborted && sequence === id) setLoadError(error instanceof Error ? error.message : '互动账号加载失败'); }
    };
    const profile = (event: Event) => {
      const detail = (event as CustomEvent<{ ownerId: string; account: PlatformAccount }>).detail;
      if (!abort.signal.aborted && getUser()?.id === owner && detail?.ownerId === owner) setAccounts(previous => previous.map(item => item.id === detail.account?.id && item.connectorSessionId === detail.account.connectorSessionId ? detail.account : item));
    };
    void load(); window.addEventListener('matrix:accounts-updated', load); window.addEventListener('matrix:account-profile-updated', profile);
    return () => { abort.abort(); sequence++; window.removeEventListener('matrix:accounts-updated', load); window.removeEventListener('matrix:account-profile-updated', profile); };
  }, [owner, token]);
  useEffect(() => {
    let alive = true;
    const current = () => alive && getUser()?.id === owner && getAuthToken() === token;
    const scheduler = createInteractionRefresh<PlatformAccount, () => MatrixPageActionInput>({
      kind, current,
      paused: () => !latest.current.automatic || latest.current.workspace.jobsLocked,
      accounts: () => latest.current.targets,
      page: item => latest.current.workspace.interactionPage(item.id, kind),
      read: async (page, item) => {
        if (!window.matrixDesktop?.officialData) throw Error('自动读取需要新版远效桌面端；当前浏览器不具备官方账号会话');
        const input = page();
        if (input.accountId !== item.id || input.platform !== item.platform || input.sessionId !== item.connectorSessionId) throw Error('官方列表会话已变化，未读取其他账号');
        return window.matrixDesktop.officialData({ ...input, accessToken: token || '', command: 'read-interactions', kind });
      },
      result: (item, value) => {
        const validated = createInteractionSnapshot(value.records!, value.source!, value.capturedAt!, undefined, item.platform);
        setEntries(previous => {
          const prior = previous[item.id]?.sessionId === item.connectorSessionId ? previous[item.id]?.snapshot : undefined;
          const snapshot = createInteractionSnapshot(validated.records, validated.source, validated.capturedAt, prior, item.platform);
          return { ...previous, [item.id]: { ...previous[item.id], sessionId: item.connectorSessionId, snapshot } };
        });
      },
      status: (item, status) => setEntries(previous => ({ ...previous, [item.id]: { ...(previous[item.id]?.sessionId === item.connectorSessionId ? previous[item.id] : {}), sessionId: item.connectorSessionId, status } })),
    });
    refresh.current = scheduler;
    const tick = () => { void scheduler.tick(); };
    const requested = (event: Event) => { if ((event as CustomEvent<{ kind?: string }>).detail?.kind === kind) { setAutomatic(true); window.setTimeout(() => void scheduler.tick(true), 0); } };
    const cleared = (event: Event) => {
      const key = (event as CustomEvent<{ key?: string }>).detail?.key;
      if (key && !latest.current.targets.some(item => key === storageKey(owner, item, kind))) return;
      scheduler.invalidate(); setAutomatic(false); setEntries({});
    };
    tick(); const timer = window.setInterval(tick, 1000);
    window.addEventListener('focus', tick); document.addEventListener('visibilitychange', tick);
    window.addEventListener('matrix:interaction-refresh-request', requested); window.addEventListener('matrix:interaction-snapshots-cleared', cleared);
    return () => { alive = false; scheduler.dispose(); if (refresh.current === scheduler) refresh.current = undefined; window.clearInterval(timer); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick); window.removeEventListener('matrix:interaction-refresh-request', requested); window.removeEventListener('matrix:interaction-snapshots-cleared', cleared); };
  }, [owner, token, kind]);
  const retention = useRef(preferences.retainInteractionSnapshots);
  useEffect(() => {
    if (retention.current !== preferences.retainInteractionSnapshots && !preferences.retainInteractionSnapshots) { refresh.current?.invalidate(); setAutomatic(false); setEntries({}); }
    retention.current = preferences.retainInteractionSnapshots;
  }, [preferences.retainInteractionSnapshots]);
  const identities = targets.map(item => `${item.id}:${item.connectorSessionId}`).join('|');
  useEffect(() => {
    if (!preferences.retainInteractionSnapshots || getUser()?.id !== owner) return;
    const restored: Record<string, Entry> = {};
    for (const item of targets) {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey(owner, item, kind)) || 'null');
        if (saved?.sessionId !== item.connectorSessionId || !Array.isArray(saved.snapshot?.records) || saved.snapshot.records.length > 100) continue;
        const snapshot = createInteractionSnapshot(saved.snapshot.records, saved.snapshot.source, saved.snapshot.capturedAt, saved.snapshot, item.platform);
        restored[item.id] = { sessionId: item.connectorSessionId, snapshot };
      } catch { /* Never promote invalid or another session's cache to live data. */ }
    }
    setEntries(previous => { const next = { ...previous }; for (const [id, entry] of Object.entries(restored)) if (!next[id]?.snapshot || next[id]?.sessionId !== entry.sessionId) next[id] = entry; return next; });
  }, [identities, owner, kind, preferences.retainInteractionSnapshots]);
  useEffect(() => {
    if (!preferences.retainInteractionSnapshots || getUser()?.id !== owner) return;
    try {
      for (const item of targets) { const entry = entries[item.id]; if (entry?.snapshot && entry.sessionId === item.connectorSessionId) localStorage.setItem(storageKey(owner, item, kind), JSON.stringify({ sessionId: item.connectorSessionId, snapshot: entry.snapshot })); }
      setSaveError('');
    } catch { setSaveError('本机快照保存失败，当前结果仍可查看；请检查可用存储空间'); }
  }, [entries, identities, preferences.retainInteractionSnapshots, owner, kind]);
  const rows = displayed.flatMap(item => {
    const entry = entries[item.id];
    return entry?.sessionId === item.connectorSessionId && entry.snapshot ? entry.snapshot.records.map(row => ({ ...row, account: item, source: entry.snapshot!.source, capturedAt: entry.snapshot!.capturedAt })) : [];
  }).filter(row => (!unreadOnly || row.unreadState === 'unread') && (!matches || matches(row.account.id, undefined)) && `${row.author} ${row.content} ${row.account.nickname}`.toLowerCase().includes(query.toLowerCase()));
  const blocked = workspace.jobsLocked;
  return <section className="matrix-live-interactions" aria-label={`实时${labels[kind]}列表`}>
    <header className="matrix-interaction-toolbar"><strong>{labels[kind]}自动同步</strong><label><input type="checkbox" checked={automatic} onChange={event => setAutomatic(event.target.checked)} />自动更新</label><Button variant="outline" disabled={blocked} onClick={() => { setAutomatic(true); window.setTimeout(() => void refresh.current?.tick(true), 0); }}>立即刷新官方数据</Button><Button variant="outline" disabled={!rows.length} onClick={() => exportInteractionRecords(kind, rows)}>导出当前记录</Button></header>
    <p className="matrix-interaction-hint">{syncPlatform && `${platformLabels[platform] || '当前平台'}账号分别同步，点左侧头像只切换查看，不中断其他账号同步。`}每10秒只读已连接、已加载的官方列表，结果直接显示在这里。尚不等于全量历史同步；未读标记仅按官网明确显示，不会打开会话、点击已读或自动回复。{kind === 'messages' && '抖音自动连接创作者消息摘要，不点击网页版聊天入口；只显示已加载的摘要，不伪造完整聊天记录。'}</p>
    {blocked && <p role="status">发布任务运行中，暂停新的互动读取，保留已有结果。</p>}
    {(loadError || saveError) && <p role="alert">{loadError || saveError}</p>}
    {kind === 'messages' && syncPlatform && accounts.filter(item => item.platform === 'douyin' && item.connectorSessionId).slice(0, 6).map(item => <DouyinMessageSource key={`${item.id}:${item.connectorSessionId}`} account={item} enabled={platform === 'douyin' && automatic && !blocked} visible={platform === 'douyin'} />)}
    {kind === 'messages' && syncPlatform && platform === 'douyin' && targets.length > 6 && <p role="status">当前批次最多连接6个抖音账号，其他账号暂未连接；不会把未连接账号显示成没有消息。</p>}
    <div className="matrix-live-account-statuses">{targets.map(item => {
      const entry = entries[item.id]?.sessionId === item.connectorSessionId ? entries[item.id] : undefined;
      return <div key={item.id} data-live-account={item.id} data-live-phase={entry?.status?.phase || 'waiting'}><AccountAvatar account={item} size="sm" status /><div><strong>{item.nickname} · {platformLabels[item.platform]}</strong><small>{entry?.status?.message || '准备连接官方列表…'}{entry?.snapshot && ` · 上次成功读取 ${new Date(entry.snapshot.capturedAt).toLocaleString('zh-CN')}，${entry.snapshot.records.length}条`}</small>{entry?.snapshot && <small>读取来源：{entry.snapshot.source}</small>}{entry?.status?.phase === 'error' && entry.status.nextAt && <small>将于 {new Date(entry.status.nextAt).toLocaleTimeString('zh-CN')} 自动重试；已有结果不会清空。</small>}</div><Button size="sm" variant="outline" disabled={blocked} onClick={() => void workspace.openAccount(item, kind === 'followers' ? 'manage' : kind)}>连接官方页面</Button></div>;
    })}</div>
    <div className="matrix-interaction-toolbar"><Input aria-label={`搜索自动同步${labels[kind]}`} value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索昵称、内容或账号" />{kind === 'messages' && <label><input type="checkbox" checked={unreadOnly} onChange={event => setUnreadOnly(event.target.checked)} />仅平台未读</label>}<small>已读取 {rows.length} 条（每账号最多100条已加载记录）</small></div>
    <div className="matrix-live-records">{rows.map(row => <article key={`${row.account.id}:${row.id}`} data-live-record={row.platformId || row.id}><Avatar><AvatarImage src={row.avatarUrl} referrerPolicy="no-referrer" /><AvatarFallback>{row.author.slice(0, 1)}</AvatarFallback></Avatar><div><header><strong>{row.author}</strong>{kind === 'messages' && <Badge variant={row.unreadState === 'unread' ? 'default' : 'secondary'}>{row.unreadState === 'unread' ? `平台未读${row.unreadCount !== undefined ? ` ${row.unreadCount}${row.unreadCountCapped ? '+' : ''}` : ''}` : row.unreadState === 'read' ? '平台已读' : '未读状态未获取'}</Badge>}</header>{row.content && <p>{row.content}</p>}<small>{platformLabels[row.account.platform]} · {row.account.nickname}{row.displayTime && ` · 官网时间 ${row.displayTime}`}{row.platformId && ` · 平台记录ID ${row.platformId}`}</small></div></article>)}</div>
    {!rows.length && <InteractionEmpty>{targets.length ? '暂无已成功读取的记录；请查看上方各账号的连接状态。读取失败不代表没有评论、私信或粉丝。' : '正在加载已绑定互动账号，或当前筛选没有账号。'}</InteractionEmpty>}
  </section>;
}
