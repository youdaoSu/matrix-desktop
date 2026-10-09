import { useEffect, useState } from 'react';
import { Crown, KeyRound, Users } from 'lucide-react';
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
export default function SettingsVipPage() {
  const [status, setStatus] = useState<VipStatus | null>(null);
  const [plans, setPlans] = useState<VipPlan[]>([]);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const load = async () => { try { const [statusResponse, plansResponse] = await Promise.all([axiosForBackend.get('/api/vip/status'), axiosForBackend.get('/api/vip/plans')]); setStatus(statusResponse.data?.data || null); setPlans(plansResponse.data?.data || []); } catch (error: any) { toast.error(errorMessage(error, '加载会员信息失败')); } };
  useEffect(() => { void load(); }, []);
  const activate = async () => { if (!code.trim()) return; setLoading(true); try { await axiosForBackend.post('/api/auth/activate', { code: code.trim() }); setCode(''); await load(); toast.success('授权码激活成功'); } catch (error: any) { toast.error(errorMessage(error, '授权码激活失败')); } finally { setLoading(false); } };
  return <div className="space-y-5"><Alert className="border-primary/20 bg-primary/5"><Crown className="h-4 w-4 text-primary" /><AlertDescription>会员状态、套餐和账号额度均来自真实数据库；当前没有在线支付，套餐只能通过管理员生成的授权码激活。</AlertDescription></Alert><div><h1 className="text-xl font-semibold">VIP 状态</h1><p className="mt-1 text-sm text-muted-foreground">查看真实会员状态与账号额度。</p></div><Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-card"><CardContent className="grid gap-4 p-6 md:grid-cols-4"><div><div className="text-xs text-muted-foreground">当前套餐</div><div className="mt-1 text-lg font-semibold">{status?.planName || '未开通'}</div></div><div><div className="text-xs text-muted-foreground">会员状态</div><div className="mt-1"><Badge variant={status?.status === 'active' ? 'default' : 'outline'}>{status?.status === 'active' ? '有效' : status?.status === 'expired' ? '已过期' : '未激活'}</Badge></div></div><div><div className="text-xs text-muted-foreground">到期时间</div><div className="mt-1 font-medium">{status?.expiresAt ? new Date(status.expiresAt).toLocaleDateString('zh-CN') : '—'}</div><div className="text-xs text-muted-foreground">剩余 {status?.remainingDays || 0} 天</div></div><div><div className="text-xs text-muted-foreground">账号额度</div><div className="mt-1 flex items-center gap-1 font-medium"><Users className="h-4 w-4" />{status?.currentAccounts || 0} / {status?.maxAccounts || 0}</div></div></CardContent></Card><Card><CardHeader><CardTitle className="text-base">授权码激活</CardTitle></CardHeader><CardContent className="flex max-w-2xl gap-2"><Input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="输入管理员发放的授权码" /><Button disabled={loading || !code.trim()} onClick={() => void activate()}><KeyRound className="mr-1 h-4 w-4" />{loading ? '激活中…' : '立即激活'}</Button></CardContent></Card><div><h2 className="mb-3 font-semibold">可用套餐</h2><div className="grid gap-4 md:grid-cols-3">{plans.map((plan) => <Card key={plan.id}><CardHeader><CardTitle className="text-base">{plan.name}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div className="text-2xl font-bold">¥{plan.price}</div><div className="text-muted-foreground">有效期 {plan.durationDays} 天</div><div className="text-muted-foreground">最多 {plan.maxAccounts} 个账号</div><div className="text-muted-foreground">{plan.description || '暂无说明'}</div></CardContent></Card>)}{plans.length === 0 && <div className="text-sm text-muted-foreground">管理员尚未配置可用套餐</div>}</div></div></div>;
}
