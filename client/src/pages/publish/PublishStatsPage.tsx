import { useState } from 'react';
import { usePublishQueue } from '@/components/workspace/PublishQueue';
import { platformLabels } from '@/components/workspace/OfficialWorkspace';
import { filterPublishJobs, publishReport, successRate, type TaskFilter } from '@/components/workspace/publish-report';

export default function PublishStatsPage() {
  const { jobs } = usePublishQueue();
  const [filter, setFilter] = useState<TaskFilter>({}), [page, setPage] = useState(1), [pageSize, setPageSize] = useState(20);
  const change = (key: keyof TaskFilter, value: string) => { setFilter(previous => ({ ...previous, [key]: value })); setPage(1); };
  const report = publishReport(filterPublishJobs(jobs, filter));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(report.accounts.length / pageSize)));
  const cards = [['创建总数', report.total], ['成功总数', report.success], ['成功率', successRate(report.success, report.total)], ['账号数', report.accounts.length], ['今日创建/成功', `${report.today} / ${report.todaySuccess}`]];
  return <div className="matrix-task-statistics" data-matrix-publish-stats>
    <section><header><h1>任务统计</h1><div className="matrix-task-filters">
      <select aria-label="统计筛选平台" value={filter.platform || ''} onChange={event => change('platform', event.target.value)}><option value="">筛选平台</option>{Object.entries(platformLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <input aria-label="统计搜索账号" placeholder="搜索账号昵称、矩效账号 ID" value={filter.account || ''} onChange={event => change('account', event.target.value)} />
      <div className="matrix-task-date"><input aria-label="统计开始日期" type="date" value={filter.start || ''} max={filter.end} onChange={event => change('start', event.target.value)} /><span>→</span><input aria-label="统计结束日期" type="date" min={filter.start} value={filter.end || ''} onChange={event => change('end', event.target.value)} /></div>
    </div></header>
    <div className="matrix-task-metrics">{cards.map(([label, value]) => <article key={label}><p>{label}</p><strong>{value}</strong></article>)}</div>
    <p className="matrix-task-scope">当前用户本机保留的任务，按创建日期统计；重试单独计数。成功指官方页面提示成功，不代表审核通过。删除任务记录会减少统计，不影响平台作品。</p></section>
    <section><h2>账号统计</h2><div className="matrix-task-table-scroll"><table><thead><tr>{['平台', '账号', '创建数', '成功数', '成功率', '今日创建/成功'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>
      {report.accounts.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(account => <tr key={`${account.platform}:${account.accountId}`}><td>{platformLabels[account.platform]}</td><td><div className="matrix-task-account"><span className={`matrix-task-avatar platform-${account.platform}`}>{account.nickname.slice(0, 1)}</span><div>{account.nickname}<small title={account.accountId}>矩效 ID：{account.accountId}</small></div></div></td><td>{account.total}</td><td>{account.success}</td><td>{successRate(account.success, account.total)}</td><td>{account.today} / {account.todaySuccess}</td></tr>)}
      {!report.accounts.length && <tr><td colSpan={6} className="matrix-task-empty">暂无符合筛选条件的任务</td></tr>}
    </tbody></table></div><footer className="matrix-task-pagination"><button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>‹</button><span>{currentPage}</span><button disabled={currentPage * pageSize >= report.accounts.length} onClick={() => setPage(currentPage + 1)}>›</button><select aria-label="每页账号数量" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[20, 50, 100].map(size => <option key={size} value={size}>{size} 条/页</option>)}</select></footer></section>
    <section><h2>分日统计</h2><table><thead><tr>{['日期', '创建数', '成功数', '成功率'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{report.days.map(day => <tr key={day.date}><td>{day.date}</td><td>{day.total}</td><td>{day.success}</td><td>{successRate(day.success, day.total)}</td></tr>)}{!report.days.length && <tr><td colSpan={4} className="matrix-task-empty">暂无日期数据</td></tr>}</tbody></table></section>
  </div>;
}
