import { useMemo } from 'react';
import { useOfficialWorkspace } from './OfficialWorkspace';
import { useDouyinInteractionData } from './DouyinInteractionData';
import type { PlatformAccount } from '@shared/api.interface';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { uiPage, uiText, useWorkspacePreference } from './WorkspaceUiState';
import { commentCountsByWork } from './comment-counts';
import { orderDouyinWorks } from '@shared/douyin-work-order';
export { DouyinInteractionDataProvider as DouyinCommentMonitorProvider } from './DouyinInteractionData';

// The management page chooses one stable work ID, not a title or a comment's
// incidental presence. Zero-comment and currently unavailable works stay listed.
export function DouyinCommentWorkRail({ account, selected, onSelect }: { account: PlatformAccount | null; selected: string; onSelect(id: string): void }) {
  const workspaceLocked = useOfficialWorkspace().jobsLocked;
  const data = useDouyinInteractionData('comments'), entry = account ? data.entry(account, 'comments') : undefined;
  const counts = useMemo(() => commentCountsByWork(entry?.rows || []), [entry?.rows]);
  const scope = `${account?.id || 'none'}.${account?.connectorSessionId || ''}.${account?.nativeAccountKey || ''}`;
  const [query, setQuery] = useWorkspacePreference(`interaction.comments.douyin.works.${scope}.query`, '', uiText);
  const [page, setPage] = useWorkspacePreference(`interaction.comments.douyin.works.${scope}.page`, 1, uiPage);
  const works = orderDouyinWorks(entry?.works || []).filter(w => `${w.title} ${w.platformId}`.toLowerCase().includes(query.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(works.length / 20)), currentPage = Math.min(page, totalPages);
  return <aside className="matrix-interaction-posts" aria-label="关联作品列表">
    <header><strong>作品列表</strong><span title={entry?.progress?.catalogReadError || (entry?.progress?.worksCatalogComplete === true ? '本轮作品目录已读至末页，评论继续独立同步' : '当前已发现的作品数量，并非账号作品总数')}>{entry?.works.length || 0}{entry?.progress?.catalogReadError?' · 目录暂停':entry && !entry.complete && entry.progress?.worksCatalogComplete !== true ? ' · 目录读取中' : ''}</span><Button size="sm" variant="ghost" disabled={!account || workspaceLocked || entry?.phase === '已请求刷新，已有缓存保留'} onClick={()=>{if(account){data.refresh(account,'comments');setQuery('');setPage(1);}}}>刷新作品</Button></header>
    {account && <Input aria-label="搜索抖音作品" placeholder="搜索标题或作品编号" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} />}
    <div className="matrix-post-list">{!account ? <p className="matrix-interaction-empty">请先选择账号，再选择作品查看评论</p> : <>{works.slice((currentPage - 1) * 20, currentPage * 20).map(work => <button type="button" key={work.platformId} data-interaction-post-id={work.platformId} aria-pressed={selected === work.platformId} className={selected === work.platformId ? 'is-active' : ''} onClick={() => onSelect(work.platformId)}>{work.coverUrl ? <img src={work.coverUrl} alt="作品封面" loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.hidden = true; }} /> : <span className="matrix-post-thumbnail">作品</span>}<div><strong>{work.title || '作品 ' + work.platformId}</strong><small title={work.readError}>{counts.get(work.platformId) || 0} 条已缓存评论{work.readError ? ' · 获取失败' : work.readComplete ? ' · 本轮已同步' : ' · 同步中'}</small></div></button>)}{!works.length && <p className="matrix-interaction-empty">{query ? '没有符合搜索的作品' : entry?.error ? '作品获取失败，已缓存的作品仍会保留' : entry?.complete ? '该账号暂无作品' : '正在读取作品列表…'}</p>}</>}</div>
    {works.length > 20 && <footer><Button size="sm" variant="ghost" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>上一页</Button><span>{currentPage}/{totalPages}</span><Button size="sm" variant="ghost" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>下一页</Button></footer>}</aside>;
}

// Uses the same owner-scoped monitor as the primary comments list. No hidden
// persistent webview, nickname identity check, separate scan or manual restart.
export function DouyinCommentMonitorPanel({ account }: { account?: PlatformAccount | null }) {
  const workspace = useOfficialWorkspace(), data = useDouyinInteractionData('comments');
  const accounts = workspace.accounts.filter(a => a.platform === 'douyin' && a.connectorSessionId && (!account || a.id === account.id));
  const allWorks = accounts.flatMap(a => {const entry=data.entry(a,'comments'),counts=commentCountsByWork(entry?.rows||[]);return orderDouyinWorks(entry?.works||[]).map(w=>({...w,account:a,entry,count:counts.get(w.platformId)||0}));});
  const [page,setPage]=useWorkspacePreference(`interaction.comments.monitor.${account?.id||'all'}.${account?.connectorSessionId||''}.page`,1,uiPage);
  const totalPages=Math.max(1,Math.ceil(allWorks.length/100)),currentPage=Math.min(page,totalPages),works=allWorks.slice((currentPage-1)*100,currentPage*100);
  if (!allWorks.length) return null;
  return <section aria-label="抖音作品评论监控" className="space-y-2">
    <h2 className="font-semibold">作品评论监控</h2><p className="text-sm text-muted-foreground">{allWorks.length} 个本机缓存作品 · 每页最多展示 100 个，不增加重复采集</p>
    {works.length ? works.map(w => <article key={w.account.id + '/' + w.platformId} className="flex gap-3 rounded border p-3 text-sm">{w.coverUrl && <img src={w.coverUrl} alt="作品封面" loading="lazy" referrerPolicy="no-referrer" className="h-20 w-16 shrink-0 rounded object-cover" onError={e => { e.currentTarget.hidden = true; }} />}<div><a href={`https://creator.douyin.com/creator-micro/work-management/work-detail/${w.platformId}`} target="_blank" rel="noreferrer" aria-label={'查看作品首页：' + (w.title || w.platformId)}><strong>{w.title || '作品 ' + w.platformId}</strong></a><small className="block text-muted-foreground" title={w.readError}>{w.account.nickname} · 已缓存 {w.count} 条评论{w.readError ? ' · 此作品无法读取，悬停查看原因' : w.readComplete ? ' · 本轮读取完成，持续监控' : w.entry?.error ? ' · 同步暂停，已有评论保留' : ' · 正在同步'}{w.entry?.newCount ? ' · 该账号发现新评论 ' + w.entry.newCount + '条' : ''}</small></div></article>) : <p className="text-sm text-muted-foreground">作品读取成功后自动加入监控，结果直接显示在评论管理。</p>}
    {totalPages>1&&<footer className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>上一页</Button><span>{currentPage}/{totalPages}</span><Button size="sm" variant="outline" disabled={currentPage===totalPages} onClick={()=>setPage(currentPage+1)}>下一页</Button></footer>}
  </section>;
}
