import { useEffect, useState } from 'react';
import { CreditCard, KeyRound, RefreshCw, UserCheck, Users } from 'lucide-react';
import type { AdminDashboardStats } from '@shared/api.interface';
import { adminAxios } from '@/api';
import { Button } from '@client/src/components/ui/button';
import { Card, CardContent } from '@client/src/components/ui/card';
import { toast } from 'sonner';

const empty: AdminDashboardStats = { totalUsers: 0, activeVipUsers: 0, todayNewUsers: 0, expiringSoon: 0, totalCodes: 0, usedCodes: 0, totalAccounts: 0 };
export default function RealDashboardPage() {
  const [stats, setStats] = useState(empty); const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); try { const response = await adminAxios.get('/api/admin/dashboard/stats'); setStats(response.data?.data || empty); } catch (error: any) { toast.error(error?.response?.data?.error?.message || '加载运营数据失败'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const cards = [{ label: '用户总数', value: stats.totalUsers, icon: Users }, { label: '有效会员', value: stats.activeVipUsers, icon: UserCheck }, { label: '今日新增用户', value: stats.todayNewUsers, icon: Users }, { label: '即将到期', value: stats.expiringSoon, icon: CreditCard }, { label: '授权码总数', value: stats.totalCodes, icon: KeyRound }, { label: '已用授权码', value: stats.usedCodes, icon: KeyRound }, { label: '绑定账号', value: stats.totalAccounts, icon: UserCheck }];
  return <div className="space-y-5"><div className="flex items-center justify-between"><div><h1 className="text-xl font-semibold">运营总览</h1><p className="mt-1 text-sm text-muted-foreground">全部指标来自真实数据库。</p></div><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, icon: Icon }) => <Card key={label}><CardContent className="p-5"><div className="flex items-center justify-between text-sm text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4" /></div><div className="mt-3 text-3xl font-bold">{value.toLocaleString()}</div></CardContent></Card>)}</div></div>;
}
