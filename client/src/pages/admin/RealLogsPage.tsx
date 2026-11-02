import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { OperationLog } from '@shared/api.interface';
import { adminAxios } from '@/api';
import { Button } from '@client/src/components/ui/button';
import { Card, CardContent } from '@client/src/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@client/src/components/ui/table';
import { toast } from 'sonner';

const PAGE_SIZE = 100;
type LogPage = { items: OperationLog[]; total: number; page: number };

export default function RealLogsPage() {
  const [result, setResult] = useState<LogPage>();
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const visible = result?.page === page ? result : undefined;

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    void adminAxios.get('/api/admin/logs', { params: { page, pageSize: PAGE_SIZE } }).then(response => {
      const data = response.data?.data;
      if (!Array.isArray(data?.items) || !Number.isSafeInteger(data?.total) || data.total < 0 || data.page !== page || data.pageSize !== PAGE_SIZE || data.items.length > PAGE_SIZE || data.items.length > data.total) throw Error('日志响应不完整');
      if (active) setResult({ items: data.items, total: data.total, page });
    }).catch(err => { if (active) { const message = err?.response?.data?.error?.message || '加载日志失败，请重试'; setError(message); toast.error(message); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, refresh]);

  return <div className="space-y-5"><div className="flex items-center justify-between"><div><h1 className="text-xl font-semibold">操作日志</h1><p className="mt-1 text-sm text-muted-foreground">{visible ? `数据库中 ${visible.total} 条；本页 ${visible.items.length} 条${error ? '（上次读取结果）' : ''}` : '日志数量尚未读取'}</p></div><Button variant="outline" disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button></div>
    {error && <p role="alert">{error}{visible ? '；显示上次结果。' : '；日志数量未知。'}</p>}
    <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>时间</TableHead><TableHead>操作者</TableHead><TableHead>动作</TableHead><TableHead>对象</TableHead><TableHead>详情</TableHead><TableHead>IP</TableHead></TableRow></TableHeader><TableBody>{visible?.items.map(item => <TableRow key={item.id}><TableCell>{new Date(item.createdAt).toLocaleString('zh-CN')}</TableCell><TableCell>{item.operatorName || item.operatorType}</TableCell><TableCell>{item.action}</TableCell><TableCell>{item.targetType || '—'}</TableCell><TableCell>{item.detail || '—'}</TableCell><TableCell>{item.ipAddress || '—'}</TableCell></TableRow>)}{!visible?.items.length && <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">{loading ? '正在读取日志…' : error ? '读取失败，请重试' : '暂无操作日志'}</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
    <div className="flex items-center justify-end gap-3 text-sm"><Button variant="outline" disabled={page === 1 || loading} onClick={() => setPage(value => value - 1)}>上一页</Button><span>第 {page} / {visible ? Math.max(1, Math.ceil(visible.total / PAGE_SIZE)) : '—'} 页</span><Button variant="outline" disabled={!visible || loading || page * PAGE_SIZE >= visible.total} onClick={() => setPage(value => value + 1)}>下一页</Button></div>
  </div>;
}
