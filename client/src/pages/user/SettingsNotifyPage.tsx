import { useEffect, useState } from 'react';
import { Bell, CheckCheck, RefreshCw, Trash2 } from 'lucide-react';
import type { Notification } from '@shared/api.interface';
import { axiosForBackend } from '@/api';
import { Badge } from '@client/src/components/ui/badge';
import { Button } from '@client/src/components/ui/button';
import { Card, CardContent } from '@client/src/components/ui/card';
import { toast } from 'sonner';

function errorMessage(error: any, fallback: string) { return error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || fallback; }
export default function SettingsNotifyPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); try { const response = await axiosForBackend.get('/api/notifications', { params: { page: 1, pageSize: 100 } }); setItems(response.data?.data?.items || []); } catch (error: any) { toast.error(errorMessage(error, '加载通知失败')); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const readAll = async () => { try { await axiosForBackend.post('/api/notifications/read-all'); await load(); toast.success('已全部标记为已读'); } catch (error: any) { toast.error(errorMessage(error, '操作失败')); } };
  const remove = async (id: string) => { try { await axiosForBackend.delete(`/api/notifications/${id}`); await load(); } catch (error: any) { toast.error(errorMessage(error, '删除失败')); } };
  return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">消息通知</h1><p className="mt-1 text-sm text-muted-foreground">显示数据库中的真实系统与业务通知。</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => void readAll()}><CheckCheck className="mr-1 h-4 w-4" />全部已读</Button><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button></div></div><div className="space-y-3">{items.map((item) => <Card key={item.id} className={!item.isRead ? 'border-primary/30 bg-primary/5' : ''}><CardContent className="flex items-start gap-3 p-4"><div className="mt-0.5 rounded-full bg-primary/10 p-2"><Bell className="h-4 w-4 text-primary" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="font-medium">{item.title}</span>{!item.isRead && <Badge>未读</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{item.content || '无详细内容'}</p><div className="mt-2 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString('zh-CN')}</div></div><Button variant="ghost" size="icon" onClick={() => void remove(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></CardContent></Card>)}{!loading && items.length === 0 && <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">暂无通知</CardContent></Card>}</div></div>;
}
