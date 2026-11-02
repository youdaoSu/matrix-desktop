import { useCallback, useEffect, useRef, useState } from 'react';
import { Crown, KeyRound, RefreshCw, Users } from 'lucide-react';
import type { VipPlan } from '@shared/api.interface';
import { axiosForBackend } from '@/api';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Badge } from '@client/src/components/ui/badge';
import { Button } from '@client/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@client/src/components/ui/card';
import { Input } from '@client/src/components/ui/input';
import { toast } from 'sonner';

interface VipStatus { status: string; planName?: string; planCode?: string; expiresAt?: string; remainingDays: number; maxAccounts: number; currentAccounts: number; durationDays?: number }
function errorMessage(error: any, fallback: string) { return error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || fallback; }
function validStatus(value: any): value is VipStatus { return value && typeof value.status === 'string' && ['planName','planCode'].every(k => value[k] === undefined || typeof value[k] === 'string') && ['remainingDays','maxAccounts','currentAccounts'].every(k => Number.isSafeInteger(value[k]) && value[k] >= 0) && (value.expiresAt === undefined || typeof value.expiresAt === 'string' && Number.isFinite(Date.parse(value.expiresAt))); }
function validPlans(value: any): value is VipPlan[] { return Array.isArray(value) && value.every(plan => plan && ['id','name','price'].every(k => typeof plan[k] === 'string') && ['durationDays','maxAccounts'].every(k => Number.isSafeInteger(plan[k]) && plan[k] >= 0) && (plan.description === undefined || typeof plan.description === 'string')); }

export default function SettingsVipPage() {
  const [status, setStatus] = useState<VipStatus>();
  const [plans, setPlans] = useState<VipPlan[]>();
  const [statusError, setStatusError] = useState('');
  const [plansError, setPlansError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const revision = useRef(0);
  const load = useCallback(async () => {
    const current = ++revision.current; setRefreshing(true); setStatusError(''); setPlansError('');
    const statusRequest = axiosForBackend.get('/api/vip/status').then(response => { const value = response.data?.data; if (!validStatus(value)) throw Error('会员状态响应不完整'); if (current === revision.current) setStatus(value); }).catch(error => { if (current === revision.current) setStatusError(errorMessage(error, '会员状态读取失败')); });
    const plansRequest = axiosForBackend.get('/api/vip/plans').then(response => { const value = response.data?.data; if (!validPlans(value)) throw Error('套餐列表响应不完整'); if (current === revision.current) setPlans(value); }).catch(error => { if (current === revision.current) setPlansError(errorMessage(error, '套餐列表读取失败')); });
    await Promise.all([statusRequest, plansRequest]); if (current === revision.current) setRefreshing(false);
  }, []);
  useEffect(() => { void load(); return () => { revision.current++; }; }, [load]);
  const activate = async () => { if (!code.trim() || loading) return; setLoading(true); try { await axiosForBackend.post('/api/auth/activate', { code: code.trim() }); setCode(''); toast.success('授权码激活请求已成功；正在读取最新会员状态'); void load(); } catch (error: any) { toast.error(error?.response ? errorMessage(error, '授权码激活失败') : '激活结果未确认，请先刷新会员状态，再决定是否重试'); } finally { setLoading(false); } };
  const stateLabel = !status ? '未知' : status.status === 'active' ? '有效' : status.status === 'expired' ? '已过期' : status.status === 'inactive' ? '未激活' : '未知状态';
  return <div className="space-y-5"><Alert className="border-primary/20 bg-primary/5"><Crown className="h-4 w-4 text-primary" /><AlertDescription>会员状态、套餐和账号额度来自数据库；当前没有在线支付，套餐通过管理员生成的授权码激活。</AlertDescription></Alert><div className="flex items-center justify-between"><div><h1 className="text-xl font-semibold">VIP 状态</h1><p className="mt-1 text-sm text-muted-foreground">查看真实会员状态与账号额度。</p></div><Button variant="outline" disabled={refreshing || loading} onClick={() => void load()}><RefreshCw size={15} />刷新</Button></div>
    {statusError && <Alert variant="destructive"><AlertDescription role="alert">会员状态读取失败：{statusError}；{status ? '当前显示上次结果。' : '状态和额度未知。'}</AlertDescription></Alert>}
    {plansError && <Alert variant="destructive"><AlertDescription role="alert">套餐列表读取失败：{plansError}；{plans ? '当前显示上次结果。' : '套餐列表未知。'}</AlertDescription></Alert>}
    <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-card"><CardContent className="grid gap-4 p-6 md:grid-cols-4"><div><div className="text-xs text-muted-foreground">当前套餐</div><div className="mt-1 text-lg font-semibold">{status ? status.planName || '未提供套餐名称' : '—'}</div></div><div><div className="text-xs text-muted-foreground">会员状态</div><div className="mt-1"><Badge variant={status?.status === 'active' ? 'default' : 'outline'}>{stateLabel}</Badge></div></div><div><div className="text-xs text-muted-foreground">到期时间</div><div className="mt-1 font-medium">{status?.expiresAt ? new Date(status.expiresAt).toLocaleDateString('zh-CN') : '—'}</div><div className="text-xs text-muted-foreground">剩余 {status?.remainingDays ?? '—'} 天</div></div><div><div className="text-xs text-muted-foreground">账号额度</div><div className="mt-1 flex items-center gap-1 font-medium"><Users className="h-4 w-4" />{status?.currentAccounts ?? '—'} / {status?.maxAccounts ?? '—'}</div></div></CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">授权码激活</CardTitle></CardHeader><CardContent className="flex max-w-2xl gap-2"><Input value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="输入管理员发放的授权码" /><Button disabled={loading || !code.trim()} onClick={() => void activate()}><KeyRound className="mr-1 h-4 w-4" />{loading ? '激活中…' : '立即激活'}</Button></CardContent></Card><div><h2 className="mb-3 font-semibold">可用套餐</h2><div className="grid gap-4 md:grid-cols-3">{plans?.map(plan => <Card key={plan.id}><CardHeader><CardTitle className="text-base">{plan.name}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div className="text-2xl font-bold">¥{plan.price}</div><div className="text-muted-foreground">有效期 {plan.durationDays} 天</div><div className="text-muted-foreground">最多 {plan.maxAccounts} 个账号</div><div className="text-muted-foreground">{plan.description || '暂无说明'}</div></CardContent></Card>)}{plans?.length === 0 && <div className="text-sm text-muted-foreground">管理员尚未配置可用套餐</div>}{!plans && !plansError && <div className="text-sm text-muted-foreground">正在读取套餐…</div>}</div></div></div>;
}
