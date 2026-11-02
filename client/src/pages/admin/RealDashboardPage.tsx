import { useCallback, useEffect, useRef, useState } from 'react';
import { CreditCard, KeyRound, RefreshCw, UserCheck, Users } from 'lucide-react';
import type { AdminDashboardStats } from '@shared/api.interface';
import { adminAxios } from '@/api';
import { Button } from '@client/src/components/ui/button';
import { Card, CardContent } from '@client/src/components/ui/card';
import { toast } from 'sonner';

const fields: (keyof AdminDashboardStats)[] = ['totalUsers','activeVipUsers','todayNewUsers','expiringSoon','totalCodes','usedCodes','totalAccounts'];
const validStats = (value: unknown): value is AdminDashboardStats => !!value && typeof value === 'object' && fields.every(field => Number.isSafeInteger((value as AdminDashboardStats)[field]) && (value as AdminDashboardStats)[field] >= 0);
export default function RealDashboardPage() {
  const [stats, setStats] = useState<AdminDashboardStats>(); const [loading, setLoading] = useState(true); const [failed, setFailed] = useState(false); const revision=useRef(0);
  const load = useCallback(async () => { const current=++revision.current;setLoading(true);try { const response = await adminAxios.get('/api/admin/dashboard/stats');if(!validStats(response.data?.data))throw Error('统计响应不完整');if(current!==revision.current)return;setStats(response.data.data);setFailed(false); } catch { if(current!==revision.current)return;setFailed(true);toast.error('加载运营数据失败，请重试'); } finally { if(current===revision.current)setLoading(false); } },[]);
  useEffect(() => { void load(); return()=>{revision.current++;}; }, [load]);
  const cards = [{ label: '用户总数', value: stats?.totalUsers, icon: Users }, { label: '有效会员', value: stats?.activeVipUsers, icon: UserCheck }, { label: '今日新增用户', value: stats?.todayNewUsers, icon: Users }, { label: '即将到期', value: stats?.expiringSoon, icon: CreditCard }, { label: '授权码总数', value: stats?.totalCodes, icon: KeyRound }, { label: '已用授权码', value: stats?.usedCodes, icon: KeyRound }, { label: '绑定账号', value: stats?.totalAccounts, icon: UserCheck }];
  return <div className="space-y-5"><div className="flex items-center justify-between"><div><h1 className="text-xl font-semibold">运营总览</h1><p className="mt-1 text-sm text-muted-foreground">指标来自服务端数据库；读取失败不会当作零。</p></div><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button></div>{failed&&<p role="alert">{stats?'读取失败，当前显示上次结果；请重试。':'统计读取失败，数据未知；请重试。'}</p>}<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, icon: Icon }) => <Card key={label}><CardContent className="p-5"><div className="flex items-center justify-between text-sm text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4" /></div><div className="mt-3 text-3xl font-bold">{value===undefined?'—':value.toLocaleString()}</div></CardContent></Card>)}</div></div>;
}
