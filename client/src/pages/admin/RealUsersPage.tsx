import { useEffect, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import type { AppUser } from '@shared/api.interface';
import { adminAxios } from '@/api';
import { Badge } from '@client/src/components/ui/badge';
import { Button } from '@client/src/components/ui/button';
import { Card, CardContent } from '@client/src/components/ui/card';
import { Input } from '@client/src/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@client/src/components/ui/table';
import { toast } from 'sonner';

const PAGE_SIZE = 100;
function msg(error: any, fallback: string) { return error?.response?.data?.error?.message || error?.response?.data?.message || fallback; }
type UserPage = { items: AppUser[]; total: number; page: number; query: string };

export default function RealUsersPage() {
  const [result, setResult] = useState<UserPage>();
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const visible = result?.page === page && result.query === query ? result : undefined;

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    void adminAxios.get('/api/admin/users', { params: { page, pageSize: PAGE_SIZE, keyword: query || undefined } }).then(response => {
      const data = response.data?.data;
      if (!Array.isArray(data?.items) || !Number.isSafeInteger(data?.total) || data.total < 0 || data.page !== page || data.pageSize !== PAGE_SIZE || data.items.length > PAGE_SIZE || data.items.length > data.total) throw Error('用户列表响应不完整');
      if (active) setResult({ items: data.items, total: data.total, page, query });
    }).catch(err => { if (active) { setError(msg(err, '加载用户失败，请重试')); toast.error(msg(err, '加载用户失败')); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, query, refresh]);

  const search = () => { const next = keyword.trim(); if (next === query && page === 1) setRefresh(value => value + 1); else { setQuery(next); setPage(1); } };
  const toggle = async (id: string) => { try { await adminAxios.post(`/api/admin/users/${id}/toggle-status`); setRefresh(value => value + 1); toast.success('用户状态已更新'); } catch (error: any) { toast.error(msg(error, '更新失败')); } };
  const reset = async (id: string) => { try { const response = await adminAxios.post(`/api/admin/users/${id}/reset-password`); const password = response.data?.data?.temporaryPassword; toast.success(`临时密码：${password}（仅显示本次，请立即安全告知用户）`, { duration: 15000 }); } catch (error: any) { toast.error(msg(error, '重置失败')); } };

  return <div className="space-y-5"><div><h1 className="text-xl font-semibold">用户管理</h1><p className="mt-1 text-sm text-muted-foreground">{visible ? `${query ? '符合筛选' : '数据库中'} ${visible.total} 个用户；本页 ${visible.items.length} 个${error ? '（上次读取结果）' : ''}` : '用户数量尚未读取'}</p></div>
    {error && <p role="alert">{error}{visible ? '；显示上次结果。' : '；用户数量未知。'}</p>}
    <Card><CardContent className="flex gap-2 p-4"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} placeholder="搜索用户名、昵称或联系方式" /></div><Button onClick={search}>查询</Button><Button variant="outline" aria-label="刷新用户列表" disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button></CardContent></Card>
    <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>用户</TableHead><TableHead>联系方式</TableHead><TableHead>会员</TableHead><TableHead>账号额度</TableHead><TableHead>状态</TableHead><TableHead>注册时间</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{visible?.items.map(item => <TableRow key={item.id}><TableCell><div className="font-medium">{item.nickname || item.username}</div><div className="text-xs text-muted-foreground">{item.username}</div></TableCell><TableCell>{item.email || item.phone || '—'}</TableCell><TableCell>{item.vipPlanName || '未开通'}</TableCell><TableCell>{item.maxAccounts}</TableCell><TableCell><Badge variant={item.status === 'active' ? 'default' : 'destructive'}>{item.status === 'active' ? '正常' : '禁用'}</Badge></TableCell><TableCell>{new Date(item.createdAt).toLocaleDateString('zh-CN')}</TableCell><TableCell><div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => void toggle(item.id)}>{item.status === 'active' ? '禁用' : '启用'}</Button><Button size="sm" variant="ghost" onClick={() => void reset(item.id)}>重置密码</Button></div></TableCell></TableRow>)}{!visible?.items.length && <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">{loading ? '正在读取用户…' : error ? '读取失败，请重试' : '没有符合条件的用户'}</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
    <div className="flex items-center justify-end gap-3 text-sm"><Button variant="outline" disabled={page === 1 || loading} onClick={() => setPage(value => value - 1)}>上一页</Button><span>第 {page} / {visible ? Math.max(1, Math.ceil(visible.total / PAGE_SIZE)) : '—'} 页</span><Button variant="outline" disabled={!visible || loading || page * PAGE_SIZE >= visible.total} onClick={() => setPage(value => value + 1)}>下一页</Button></div>
  </div>;
}
