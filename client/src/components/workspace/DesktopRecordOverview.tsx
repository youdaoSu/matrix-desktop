import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Database, Download, Inbox, MessageCircle, Users } from 'lucide-react';
import type { DouyinInteractionRow } from '@shared/douyin-interactions';
import { Button } from '@/components/ui/button';
import { useOfficialWorkspace, platformLabels } from './OfficialWorkspace';
import { useDouyinInteractionCache, interactionStatus } from './DouyinInteractionData';
import { useDouyinInboxCache, inboxAccountStatus } from './DouyinInbox';
import { summarizeDesktopRecords, recordsCsv, type RecordSample } from './desktop-record-summary';

const followerCounts = new WeakMap<DouyinInteractionRow[], { followers: number; avatars: number }>();
function countFollowers(rows: DouyinInteractionRow[]) {
  let value = followerCounts.get(rows);
  if (!value) { let followers = 0, avatars = 0; for (const row of rows) if (row.isCurrentFollower !== false) { followers++; if (row.avatarUrl || row.avatarUrls?.length) avatars++; } value = { followers, avatars }; followerCounts.set(rows, value); }
  return value;
}
const display = (value: number | null) => value === null ? '—' : value.toLocaleString('zh-CN');
export default memo(function DesktopRecordOverview({ compact = false }: { compact?: boolean }) {
  const { accounts } = useOfficialWorkspace(), interactions = useDouyinInteractionCache(), inbox = useDouyinInboxCache();
  const summary = useMemo(() => summarizeDesktopRecords(accounts.filter(account => account.platform === 'douyin' && account.connectorSessionId).map(account => {
    const commentEntry = interactions.entry(account, 'comments'), followerEntry = interactions.entry(account, 'followers');
    // A failed first request can leave an empty placeholder entry. That is not
    // an observed empty cache and must remain unknown, not become a false zero.
    const comments = commentEntry && (commentEntry.baseline !== undefined || commentEntry.progress) ? commentEntry : undefined;
    const followers = followerEntry && (followerEntry.baseline !== undefined || followerEntry.progress || followerEntry.followerPanelSync) ? followerEntry : undefined;
    const result = inbox.rows[account.id];
    const status = result?.accountId === account.id && result.sessionId === account.connectorSessionId && result.status?.ownUid === account.nativeAccountKey ? result.status : undefined;
    const roster = followers ? countFollowers(followers.rows) : undefined;
    return { accountId: account.id, platform: account.platform, nickname: account.nickname || '未命名账号', nativeAccountKey: account.nativeAccountKey,
      works: comments?.works.length ?? null, comments: comments?.rows.length ?? null, followers: roster?.followers ?? null, avatarAddresses: roster?.avatars ?? null,
      threads: status?.threadCount ?? null, messages: status?.messageCount ?? null, commentsComplete: comments?.complete === true, followersVerified: followers?.followerRosterVerified === true, historyComplete: status?.historyComplete === true,
      state: `评论：${commentEntry?.error ? interactionStatus(commentEntry.error) : comments ? comments.complete ? '本轮可访问记录已读完' : '部分缓存 / 读取中' : '尚未载入'}；粉丝：${followerEntry?.error ? interactionStatus(followerEntry.error) : followers ? followers.followerRosterVerified ? '完整名单已核对' : '可访问名单，非全量证明' : '尚未载入'}；私信：${status ? inboxAccountStatus(result).label : '尚未载入'}`,
    } satisfies RecordSample;
  })), [accounts, interactions, inbox]);
  const exportCounts = () => {
    const url = URL.createObjectURL(new Blob([recordsCsv(summary.rows)], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = '远效-本机采集统计.csv'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const cards = [{ key: 'works', label: '已缓存作品', icon: Database }, { key: 'comments', label: '已缓存评论', icon: MessageCircle }, { key: 'followers', label: '已缓存粉丝', icon: Users }, { key: 'messages', label: '已缓存私信', icon: Inbox }] as const;
  return <section className="matrix-data-panel" aria-label="桌面真实采集记录" data-desktop-record-overview>
    <header className="matrix-data-heading"><div><span className="matrix-eyebrow">LOCAL OBSERVATIONS</span><h2>桌面采集实况</h2><p>直接统计当前用户、当前绑定的已有缓存，不为这块概览新开采集页。</p></div><Button asChild variant="ghost" size="sm"><Link to="/settings/capabilities">功能与数据来源<ArrowUpRight size={14} /></Link></Button></header>
    <div className="matrix-record-metrics">{cards.map(({ key, label, icon: Icon }) => { const metric = summary.metrics[key]; return <div key={key}><span><Icon size={16} />{label}</span><strong>{display(metric.value)}</strong><small>抖音 {metric.measured}/{metric.accounts} 个账号有缓存</small></div>; })}</div>
    <p className="matrix-data-note">与下方数据库记录分开统计，不相加；粉丝缓存不等于主页粉丝总量，含头像地址也不代表图片已显示。未载入显示“—”，已载入的空缓存才显示 0。{summary.duplicateBindings > 0 ? ` ${summary.duplicateBindings} 个重复绑定未重复累加。` : ''}</p>
    {!compact && <><div className="matrix-data-actions"><span>按账号核对采集范围</span><Button size="sm" variant="outline" disabled={!summary.rows.length} onClick={exportCounts}><Download size={14} />导出统计 CSV</Button></div><div className="matrix-data-table-scroll"><table><thead><tr><th>账号</th><th>作品 / 评论</th><th>粉丝 / 含头像地址</th><th>会话 / 消息</th><th>采集状态</th></tr></thead><tbody>{summary.rows.map(row => <tr key={row.accountId}><th scope="row">{row.nickname}<small>{platformLabels[row.platform as keyof typeof platformLabels]}</small></th><td>{display(row.works)} / {display(row.comments)}</td><td>{display(row.followers)} / {display(row.avatarAddresses)}</td><td>{display(row.threads)} / {display(row.messages)}</td><td>{row.state}</td></tr>)}</tbody></table>{!summary.rows.length && <p className="matrix-data-note">尚无已绑定的抖音采集账号；其他平台没有在此适配，不按 0 冒充已同步。</p>}</div></>}
  </section>;
});
