import { useEffect, useState } from 'react';
import { Copy, Download, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { ActivationCode, VipPlan } from '@shared/api.interface';
import { adminAxios } from '@/api';
import { getAuthError } from '@/components/auth/AuthComponents';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';

const statuses = { unused: '未使用', used: '已使用', disabled: '已作废' };
const date = (value?: string) => value ? new Date(value).toLocaleString('zh-CN') : '—';
const mask = (code: string) => code.length > 8 ? `${code.slice(0, 4)}****${code.slice(-4)}` : code;

export default function RealCodesPage() {
  const [items, setItems] = useState<ActivationCode[]>([]);
  const [plans, setPlans] = useState<VipPlan[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [planId, setPlanId] = useState('');
  const [duration, setDuration] = useState(30);
  const [quota, setQuota] = useState(5);
  const [count, setCount] = useState(1);
  const [prefix, setPrefix] = useState('');
  const [remark, setRemark] = useState('');
  const [generated, setGenerated] = useState<ActivationCode[]>([]);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    Promise.all([
      adminAxios.get('/api/admin/codes', { params: { page, pageSize: 20, ...(status ? { status } : {}), ...(query ? { keyword: query } : {}) }, signal: controller.signal }),
      adminAxios.get('/api/admin/plans', { signal: controller.signal }),
    ]).then(([codes, planResponse]) => {
      setItems(codes.data.data.items); setTotal(codes.data.data.total); setPlans(planResponse.data.data);
    }).catch(e => { if (!controller.signal.aborted) setError(getAuthError(e, '授权码加载失败，请重试')); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, status, query, refresh]);
  const start = () => {
    const plan = plans.find(item => item.status === 'active');
    if (!plan) return toast.error('请先在套餐管理中创建并启用套餐');
    setPlanId(plan.id); setDuration(plan.durationDays); setQuota(plan.maxAccounts); setCount(1); setPrefix(''); setRemark(''); setGenerated([]); setOpen(true);
  };
  const generate = async () => {
    if (busy) return;
    if (!planId || !Number.isInteger(count) || count < 1 || count > 10000 || !Number.isInteger(duration) || duration < 1 || !Number.isInteger(quota) || quota < 1) return toast.error('请选择套餐，并输入有效的数量、天数和账号额度');
    setBusy(true);
    try {
      const response = await adminAxios.post('/api/admin/codes/generate', { planId, count, durationDays: duration, maxAccounts: quota, prefix: prefix.trim().toUpperCase(), remark: remark.trim() || undefined });
      setGenerated(response.data.data); setRefresh(value => value + 1);
      toast.success('授权码已生成并保存到数据库');
    } catch (e) { toast.error(getAuthError(e, '生成失败，未生成本地样本码')); }
    finally { setBusy(false); }
  };
  const copy = async (code: string) => {
    try { await navigator.clipboard.writeText(code); toast.success('已复制完整授权码'); }
    catch { toast.error('复制失败，请手动复制'); }
  };
  const disable = async (id: string) => {
    if (busy || !window.confirm('作废该未使用授权码？此操作不可撤销。')) return;
    setBusy(true);
    try { await adminAxios.post(`/api/admin/codes/${id}/disable`); setRefresh(value => value + 1); toast.success('授权码已作废'); }
    catch (e) { toast.error(getAuthError(e, '作废失败')); }
    finally { setBusy(false); }
  };
  const exportCodes = (codes: ActivationCode[]) => {
    const rows = [['授权码', '套餐', '天数', '账号额度', '状态'], ...codes.map(item => [item.code, item.planName || '', String(item.durationDays), String(item.maxAccounts), statuses[item.status]])];
    const csv = '\uFEFF' + rows.map(row => row.map(value => `"${(/^[=+@\-]/.test(value) ? "'" + value : value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `matrix-codes-${Date.now()}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  return <div className="space-y-5" data-matrix-real-codes="true">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">授权码管理</h1><p className="mt-1 text-sm text-muted-foreground">仅显示数据库中的正式授权码，不生成本地样本码</p></div><div className="flex gap-2"><Button variant="outline" disabled={loading || busy} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={15} />刷新</Button><Button disabled={loading || busy} onClick={start}><Plus size={15} />批量生成</Button></div></div>
    {error && <div role="alert" className="rounded-lg border border-destructive/30 p-3 text-destructive">{error}</div>}
    <Card><CardContent className="flex flex-wrap items-center gap-3 p-4"><Badge variant="outline">符合筛选的真实授权码：{total}</Badge><select aria-label="授权码状态" className="rounded-md border bg-background p-2" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">全部状态</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><Input className="max-w-xs" aria-label="搜索正式授权码" placeholder="授权码或批次号" value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setQuery(keyword.trim()); setPage(1); } }} /><Button variant="outline" onClick={() => { setQuery(keyword.trim()); setPage(1); }}>查询</Button><Button variant="outline" disabled={!items.length} onClick={() => exportCodes(items)}><Download size={15} />导出当前页</Button></CardContent></Card>
    <Card><CardContent className="p-0"><Table><TableHeader><TableRow>{['授权码', '套餐', '天数 / 额度', '状态', '绑定用户', '生成时间', '操作'].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{items.map(item => <TableRow key={item.id}><TableCell className="font-mono">{mask(item.code)}</TableCell><TableCell>{item.planName || '—'}</TableCell><TableCell>{item.durationDays} 天 / {item.maxAccounts} 个</TableCell><TableCell><Badge variant={item.status === 'used' ? 'secondary' : 'outline'}>{statuses[item.status]}</Badge></TableCell><TableCell>{item.username || '—'}</TableCell><TableCell>{date(item.createdAt)}</TableCell><TableCell><div className="flex gap-2"><Button variant="ghost" size="sm" aria-label="复制正式授权码" onClick={() => void copy(item.code)}><Copy size={14} />复制</Button>{item.status === 'unused' && <Button variant="ghost" size="sm" disabled={busy} onClick={() => void disable(item.id)}>作废</Button>}</div></TableCell></TableRow>)}{!items.length && <TableRow><TableCell colSpan={7} className="h-28 text-center text-muted-foreground">{loading ? '正在加载真实授权码…' : error ? '加载失败，请刷新重试' : '暂无正式授权码，请先批量生成'}</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
    <div className="flex items-center justify-end gap-3 text-sm"><Button variant="outline" disabled={page === 1 || loading} onClick={() => setPage(value => value - 1)}>上一页</Button><span>第 {page} / {Math.max(1, Math.ceil(total / 20))} 页</span><Button variant="outline" disabled={page * 20 >= total || loading} onClick={() => setPage(value => value + 1)}>下一页</Button></div>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent className="max-h-[85vh] overflow-auto"><DialogHeader><DialogTitle>{generated.length ? '正式授权码已生成' : '批量生成正式授权码'}</DialogTitle></DialogHeader>{generated.length ? <div className="space-y-3"><p className="text-sm text-muted-foreground">以下 {generated.length} 条已保存到数据库，可以复制给本软件的用户激活。请妥善保管完整授权码。</p>{generated.map(item => <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border p-3"><code>{item.code}</code><Button variant="outline" size="sm" onClick={() => void copy(item.code)}>复制完整码</Button></div>)}<Button variant="outline" onClick={() => exportCodes(generated)}>导出本批次</Button></div> : <div className="space-y-3"><label className="block text-sm">套餐<select aria-label="生成授权码套餐" className="mt-1 w-full rounded-md border bg-background p-2" disabled={busy} value={planId} onChange={e => { setPlanId(e.target.value); const plan = plans.find(item => item.id === e.target.value); if (plan) { setDuration(plan.durationDays); setQuota(plan.maxAccounts); } }}>{plans.filter(item => item.status === 'active').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{[{ id: 'code-count', label: '生成数量（1–10000）', value: count, set: setCount }, { id: 'code-duration', label: '有效天数', value: duration, set: setDuration }, { id: 'code-quota', label: '账号额度', value: quota, set: setQuota }].map(field => <div key={field.id}><Label htmlFor={field.id}>{field.label}</Label><Input id={field.id} type="number" min={1} disabled={busy} value={field.value} onChange={e => field.set(Number(e.target.value))} /></div>)}<div><Label htmlFor="code-prefix">前缀（可选）</Label><Input id="code-prefix" maxLength={20} disabled={busy} value={prefix} onChange={e => setPrefix(e.target.value)} /></div><div><Label htmlFor="code-remark">备注（可选）</Label><Input id="code-remark" maxLength={200} disabled={busy} value={remark} onChange={e => setRemark(e.target.value)} /></div><Button className="w-full" disabled={busy} onClick={() => void generate()}>{busy ? '正在保存到数据库…' : '生成并保存正式授权码'}</Button></div>}</DialogContent></Dialog>
  </div>;
}
