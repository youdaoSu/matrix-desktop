import { useEffect, useState } from 'react';
import { adminAxios } from '@/api';
import { Button } from '@/components/ui/button';
import type { PublishErrorReport } from '@shared/publish-error-report';
type Item = { id: string; receivedAt: string; reporterId: string; report?: PublishErrorReport };
type Result = { items: Item[]; total: number; page: number };
const PAGE_SIZE = 20;

export default function PublishErrorsPage() {
  const [result, setResult] = useState<Result>();
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const visible = result?.page === page ? result : undefined;
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    void adminAxios.get('/api/admin/publish-errors', { params: { page, pageSize: PAGE_SIZE } }).then(response => {
      const data = response.data?.data;
      if (!Array.isArray(data?.items) || !Number.isSafeInteger(data?.total) || data.total < 0 || data.page !== page || data.pageSize !== PAGE_SIZE || data.items.length > PAGE_SIZE || data.items.length > data.total) throw Error('反馈响应不完整');
      if (active) setResult({ items: data.items, total: data.total, page });
    }).catch(() => { if (active) setError('错误反馈加载失败，请刷新重试'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, refresh]);
  return <section className="space-y-4"><div className="flex items-center justify-between"><div><h1 className="text-xl font-semibold">发布错误反馈</h1><p className="text-sm text-muted-foreground">当前后端已接收的脱敏报告，按接收时间从新到旧；不会触发作品重发。</p></div><Button disabled={loading} onClick={() => setRefresh(value => value + 1)}>刷新反馈</Button></div>
    {error && <p role="alert">{error}{visible ? '；显示本页上次读取结果。' : '；反馈数量未知。'}</p>}
    {visible?.items.map(item => <article key={item.id} className="rounded-lg border bg-card p-4"><div className="flex justify-between"><strong>{item.report?.platform} · {item.report?.executionStage}</strong><small>{new Date(item.receivedAt).toLocaleString('zh-CN')}</small></div><p className="my-2 break-all">{item.report?.error || '历史报告不可解析'}</p><small>版本 {item.report?.version} · 任务 {item.report?.taskId} · 第 {item.report?.attempt} 次 · 回执 {item.id}</small><details className="mt-2"><summary>报告详情</summary><pre className="overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(item.report, null, 2)}</pre></details></article>)}
    {!loading && visible && !visible.items.length && !error && <p>暂无错误反馈。只有用户确认发送并由本后端接收后才会显示。</p>}
    <div className="flex items-center gap-3"><Button disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>上一页</Button><span>第 {page} 页 · 共 {visible ? visible.total : '—'} 条</span><Button disabled={loading || !visible || page * PAGE_SIZE >= visible.total} onClick={() => setPage(value => value + 1)}>下一页</Button></div>
  </section>;
}
