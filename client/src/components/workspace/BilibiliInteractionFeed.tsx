import { useEffect, useRef, useState } from 'react';
import { getAuthToken, getUser } from '@/api';
import type { PlatformAccount } from '@shared/api.interface';
import type { InteractionKind } from '@shared/interaction-snapshot';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AccountAvatar } from './AccountAvatar';
import { useOfficialWorkspace } from './OfficialWorkspace';
import { loadPublishAccounts } from './publish-preferences';
import { exportInteractionRecords, InteractionEmpty } from './InteractionUi';
import { uiText, useWorkspacePreference } from './WorkspaceUiState';

type Read = Awaited<ReturnType<NonNullable<Window['matrixDesktop']>['bilibiliInteractions']>>;
type Row = NonNullable<Read['records']>[number];
type Entry = { session: string; nativeKey?: string; rows: Row[]; pages: number; cursor?: string; complete?: boolean; total?: number; message: string; at?: string; source?: string; workId: string; error?: string };
const labels = { comments: '评论', messages: '私信会话', followers: '粉丝' };

// No official page navigation and no mark-read operation. Data remains scoped
// to the signed-in Matrix user + connector + stable platform UID. No inbox
// payload is persisted silently in localStorage or sent to our backend.
export function BilibiliInteractionFeed({ kind, account, matches }: { kind: InteractionKind; account?: PlatformAccount | null; matches?(id: string): boolean }) {
  const workspace = useOfficialWorkspace(), owner = getUser()?.id || '', token = getAuthToken() || '';
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]), [entries, setEntries] = useState<Record<string, Entry>>({});
  const [automatic, setAutomatic] = useState(true), [workId, setWorkId] = useState(''), [error, setError] = useState('');
  const [workInput, setWorkInput] = useWorkspacePreference('interaction.comments.bilibili.workInput', '', uiText);
  const [query, setQuery] = useWorkspacePreference(`interaction.live.${kind}.bilibili.query`, '', uiText);
  const latest = useRef({ accounts, entries, workId, automatic, locked: workspace.jobsLocked });
  latest.current = { accounts, entries, workId, automatic, locked: workspace.jobsLocked };
  const busy = useRef(new Set<string>()), generation = useRef(0);
  useEffect(() => {
    const abort = new AbortController(); let sequence = 0;
    const load = async () => { const seq = ++sequence; try { const rows = await loadPublishAccounts({ signal: abort.signal }); if (!abort.signal.aborted && sequence === seq && getUser()?.id === owner && getAuthToken() === token) setAccounts(rows.filter(row => row.platform === 'bilibili' && row.connectorSessionId)); } catch { if (!abort.signal.aborted) setError('B站账号加载失败，请检查远效登录'); } };
    void load(); window.addEventListener('matrix:accounts-updated', load);
    return () => { abort.abort(); window.removeEventListener('matrix:accounts-updated', load); };
  }, [owner, token]);
  useEffect(() => { generation.current++; busy.current.clear(); setEntries({}); setError(''); return () => { generation.current++; }; }, [owner, token, kind, workId]);
  const run = async (target: PlatformAccount, resume: boolean) => {
    const epoch = generation.current, identity = `${target.id}:${target.connectorSessionId}:${target.nativeAccountKey}`;
    const current = () => generation.current === epoch && getUser()?.id === owner && getAuthToken() === token && latest.current.accounts.some(row => `${row.id}:${row.connectorSessionId}:${row.nativeAccountKey}` === identity);
    if (busy.current.has(identity) || latest.current.locked || kind === 'comments' && !workId || !current()) return;
    busy.current.add(identity);
    const candidate = latest.current.entries[target.id], old = candidate?.session === target.connectorSessionId && candidate.nativeKey === target.nativeAccountKey && candidate.workId === workId ? candidate : undefined;
    let entry: Entry = resume && old ? { ...old, error: undefined } : { session: target.connectorSessionId!, nativeKey: target.nativeAccountKey, rows: [], pages: 0, workId, message: '正在只读核对本人UID…' };
    const publish = () => { if (current()) { const saved = { ...entry, rows: [...entry.rows] }; latest.current.entries = { ...latest.current.entries, [target.id]: saved }; setEntries(previous => ({ ...previous, [target.id]: saved })); } };
    // Keep previous records visible until the first new page succeeds.
    setEntries(previous => ({ ...previous, [target.id]: { ...(old?.session === target.connectorSessionId ? old : entry), message: '正在读取官方分页数据…', error: undefined } }));
    try {
      if (!window.matrixDesktop?.bilibiliInteractions) throw Error('当前安装版尚未接入B站分页读取，需要更新桌面端');
      for (let page = 0; page < 10 && current() && !latest.current.locked; page++) {
        const result = await window.matrixDesktop.bilibiliInteractions({ accessToken: token, accountId: target.id, kind, ...(kind === 'comments' ? { workId } : {}), ...(entry.cursor ? { cursor: entry.cursor } : {}) });
        if (!current()) return;
        if (result.error) throw Error(result.error);
        if (result.accountId !== target.id || result.sessionId !== target.connectorSessionId || result.platform !== 'bilibili' || result.kind !== kind || !Array.isArray(result.records) || !result.source || !result.capturedAt || typeof result.complete !== 'boolean' || !result.complete && !result.nextCursor) throw Error('返回结果的账号或分页信息不一致，本页已丢弃');
        const rows = new Map(entry.rows.map(row => [row.platformId, row])); for (const row of result.records) rows.set(row.platformId, row);
        if (rows.size > 5000) throw Error('本轮已达到5000条内存保护上限，请先导出；尚不能宣称已取全');
        entry = { ...entry, rows: [...rows.values()], pages: entry.pages + 1, cursor: result.nextCursor, complete: result.complete, total: result.total ?? entry.total, source: result.source, at: result.capturedAt, message: result.complete ? `本轮可访问分页已读完；${result.coverage}` : `已读取${entry.pages + 1}页，继续分页中…` }; publish();
        if (result.complete) break;
        await new Promise(resolve => window.setTimeout(resolve, 1200));
      }
      if (!entry.complete) { entry.message = '本批次读取结束，仍有后续分页；点击“继续读取”，不是全量完成'; publish(); }
    } catch (failure) {
      if (current()) { const kept = entry.pages ? entry : old?.session === target.connectorSessionId ? old : entry; entry = { ...kept, complete: false, message: '读取未完成，已有记录已保留', error: failure instanceof Error ? failure.message : '读取失败' }; publish(); }
    } finally { if (generation.current === epoch) busy.current.delete(identity); }
  };
  const runner = useRef(run); runner.current = run;
  const identities = accounts.map(row => `${row.id}:${row.connectorSessionId}:${row.nativeAccountKey}`).join('|');
  useEffect(() => {
    const tick = () => { if (!latest.current.automatic || latest.current.locked || kind === 'comments' && !latest.current.workId) return; for (const target of latest.current.accounts.slice(0, 2)) { const prior = latest.current.entries[target.id]; if (prior?.cursor && !prior.complete) continue; void runner.current(target, false); } };
    tick(); const timer = window.setInterval(tick, 60000); return () => window.clearInterval(timer);
  }, [identities, kind, workId, automatic]);
  const validEntries = accounts.map(target => ({ target, entry: entries[target.id] })).filter(({ target, entry }) => entry?.session === target.connectorSessionId && entry.nativeKey === target.nativeAccountKey && entry.workId === workId);
  const rows = validEntries.filter(({ target }) => (!account || target.id === account.id) && (!matches || matches(target.id))).flatMap(({ target, entry }) => entry.rows.map(row => ({ ...row, accountId: target.id, accountNickname: target.nickname })) ).filter(row => `${row.author} ${row.content}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="matrix-live-interactions" aria-label={`B站分页${labels[kind]}`}>
    <header className="matrix-interaction-toolbar"><strong>B站{labels[kind]} · 分页读取</strong><label><input type="checkbox" checked={automatic} onChange={event => setAutomatic(event.target.checked)} />每分钟自动更新（前2个账号）</label><Button variant="outline" disabled={!rows.length} onClick={() => exportInteractionRecords(kind, rows)}>导出已读取记录</Button></header>
    <p className="matrix-interaction-hint">网页会话适配，待真实账号验证，不等同于官方开放API。独立读取绑定账号的数据，不需要先打开官网列表。只读请求，不打开聊天、不发送消息、不调用标记已读接口。{kind === 'messages' ? '这里只读取会话列表和最新一条摘要，并非完整聊天历史。' : kind === 'comments' ? '评论包括一级和子评论；只计算当前账号可访问的数据，隐藏、删除及平台限制内容不能保证获取。' : '读取实际粉丝名单，不把粉丝总数或粉丝画像冒充名单；平台限制的范围可能无法读取。'}最多每批10页，未完成可继续；窗口关闭后需重新读取。</p>
    {kind === 'comments' && <form className="matrix-interaction-toolbar" onSubmit={event => { event.preventDefault(); const value = workInput.trim(); if (!/^BV[0-9A-Za-z]{10}$/.test(value)) { setError('请输入本人作品准确BV号，例如BV号本身，不使用标题匹配'); return; } setError(''); if (value === workId) for (const target of accounts) void run(target, false); else setWorkId(value); }}><Input aria-label="读取评论的B站BV号" value={workInput} onChange={event => setWorkInput(event.target.value)} placeholder="本人作品的BV号" /><Button type="submit" disabled={workspace.jobsLocked}>读取这条作品评论</Button></form>}
    {(error || workspace.jobsLocked) && <p role={error ? 'alert' : 'status'}>{error || '发布任务运行中，暂停新的互动读取。'}</p>}
    <div className="matrix-live-account-statuses">{accounts.map(target => { const saved = entries[target.id], entry = saved?.session === target.connectorSessionId && saved.workId === workId ? saved : undefined; return <div key={`${target.id}:${target.connectorSessionId}`}><AccountAvatar account={target} size="sm" status /><div><strong>{target.nickname} · B站</strong><small>{entry?.message || (kind === 'comments' ? '等待本人作品BV号' : '等待首次读取')}</small>{entry?.at && <small>{entry.pages}页 · 累计{entry.rows.length}条{entry.total !== undefined ? ` · 平台报告总数${entry.total}（不保证全部可访问）` : ''} · {new Date(entry.at).toLocaleString('zh-CN')}</small>}{entry?.error && <small role="alert">{entry.error}</small>}</div><Button variant="outline" disabled={workspace.jobsLocked || kind === 'comments' && !workId} onClick={() => void run(target, Boolean(entry?.cursor))}>{entry?.cursor ? '继续读取' : '重新读取'}</Button></div>; })}</div>
    <div className="matrix-interaction-toolbar"><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索已读取昵称或内容" aria-label="搜索B站分页结果" /><small>当前筛选{rows.length}条</small></div>
    <div className="matrix-live-records">{rows.map(row => <article key={`${row.accountId}:${row.platformId}`}><Avatar><AvatarImage src={row.avatarUrl} referrerPolicy="no-referrer" /><AvatarFallback>{row.author.slice(0, 1)}</AvatarFallback></Avatar><div><header><strong>{row.author}</strong>{row.unreadState && <small>{row.unreadState === 'unread' ? `平台未读 ${row.unreadCount}` : '平台已读'}</small>}</header><p>{row.content}</p><small>{row.accountNickname} · ID {row.platformId}{row.parentPlatformId ? ` · 回复评论 ${row.parentPlatformId}` : ''}{row.displayTime ? ` · ${row.displayTime}` : ''}</small></div></article>)}</div>
    {!rows.length && <InteractionEmpty>尚无成功读取的记录。读取失败或尚未填写BV号，不代表平台没有数据。</InteractionEmpty>}
  </section>;
}
