import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { axiosForBackend } from '@/api';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface PublishStats { total: number; statusStats: { status: string; count: number }[]; todayPublished: number }
const labels: Record<string, string> = { draft: '本地草稿', scheduled: '历史定时记录', publishing: '发表中记录', published: '已发布记录', failed: '失败记录', reviewing: '审核中记录' };
export default function PublishStatsPage() {
  const [stats, setStats] = useState<PublishStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setError(''); setStats(null);
    axiosForBackend.get('/api/content/stats', { signal: abort.signal })
      .then(r => { if (!abort.signal.aborted) setStats(r.data.data); })
      .catch(e => { if (!abort.signal.aborted) setError(e?.response?.data?.message || '加载发布统计失败，请重试'); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [refresh]);
  const count = (status: string) => stats?.statusStats.find(item => item.status === status)?.count || 0;
  const finished = count('published') + count('failed');
  const cards = [
    { label: '创建记录总数', value: stats?.total ?? '—', detail: '包含草稿，每个目标账号一条记录' },
    { label: '已发布记录总数', value: stats ? count('published') : '—', detail: '只读取本地 published 状态，不包含人工待办' },
    { label: '记录成功率', value: stats && finished ? (100 * count('published') / finished).toFixed(1) + '%' : '—', detail: '已发布 /（已发布 + 失败）；没有执行记录时不显示成功率' },
  ];
  return <div className="matrix-publish-stats" data-matrix-publish-stats><header><h1>任务统计</h1><Button variant="outline" disabled={loading} onClick={() => setRefresh(n => n + 1)}><RefreshCw size={14} />刷新统计</Button></header><Alert><AlertDescription>统计范围为当前用户的矩效本地发布记录，不是平台实时数据。上传完成、草稿保存及本人确认待办均不算发表成功；当前自动发表和平台回执同步尚未接通。</AlertDescription></Alert>{loading && <p role="status">加载统计…</p>}{error && <p role="alert" className="text-destructive">{error}</p>}<div className="matrix-publish-stat-cards">{cards.map(card => <article key={card.label}><h2>{card.label}</h2><strong>{card.value}</strong><p>{card.detail}</p></article>)}</div><section><h2>状态分布</h2><Table><TableHeader><TableRow><TableHead>记录状态</TableHead><TableHead>记录数量</TableHead><TableHead>占创建记录比例</TableHead></TableRow></TableHeader><TableBody>{stats?.statusStats.map(item => <TableRow key={item.status}><TableCell>{labels[item.status] || item.status}</TableCell><TableCell>{item.count}</TableCell><TableCell>{stats.total ? (100 * item.count / stats.total).toFixed(1) + '%' : '—'}</TableCell></TableRow>)}{stats && !stats.total && <TableRow><TableCell colSpan={3} className="h-28 text-center text-muted-foreground">暂无发布记录</TableCell></TableRow>}</TableBody></Table></section></div>;
}
