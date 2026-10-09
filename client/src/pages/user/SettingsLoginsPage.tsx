import { useEffect, useState } from 'react';
import { History, RefreshCw } from 'lucide-react';
import type { OperationLog } from '@shared/api.interface';
import { axiosForBackend } from '@/api';
import { Button } from '@client/src/components/ui/button';
import { Card, CardContent } from '@client/src/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@client/src/components/ui/table';
import { toast } from 'sonner';

function errorMessage(error: any, fallback: string) { return error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || fallback; }
export default function SettingsLoginsPage() {
  const [items, setItems] = useState<OperationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); try { const response = await axiosForBackend.get('/api/users/login-logs', { params: { page: 1, pageSize: 100 } }); setItems(response.data?.data?.items || []); } catch (error: any) { toast.error(errorMessage(error, '加载登录记录失败')); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  return <div className="space-y-5"><div className="flex items-center justify-between"><div><h1 className="text-xl font-semibold">登录记录</h1><p className="mt-1 text-sm text-muted-foreground">以下记录来自真实操作日志。</p></div><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button></div><Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>登录时间</TableHead><TableHead>账号</TableHead><TableHead>IP 地址</TableHead><TableHead>详情</TableHead></TableRow></TableHeader><TableBody>{items.map((item) => <TableRow key={item.id}><TableCell>{new Date(item.createdAt).toLocaleString('zh-CN')}</TableCell><TableCell>{item.operatorName || '当前用户'}</TableCell><TableCell>{item.ipAddress || '本机'}</TableCell><TableCell>{item.detail || '登录成功'}</TableCell></TableRow>)}{!loading && items.length === 0 && <TableRow><TableCell colSpan={4} className="h-32 text-center text-muted-foreground"><History className="mx-auto mb-2 h-6 w-6" />暂无登录日志</TableCell></TableRow>}</TableBody></Table></CardContent></Card></div>;
}
