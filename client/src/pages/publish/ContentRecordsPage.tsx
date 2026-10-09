import { useEffect, useState } from 'react';
import { FileText, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ContentPost, PlatformType } from '@shared/api.interface';
import { axiosForBackend } from '@/api';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Badge } from '@client/src/components/ui/badge';
import { Button } from '@client/src/components/ui/button';
import { Card, CardContent } from '@client/src/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@client/src/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@client/src/components/ui/table';
import { toast } from 'sonner';

const platformLabels: Record<PlatformType, string> = { douyin: '抖音', xiaohongshu: '小红书', wechat: '视频号', bilibili: 'B站' };
const statusLabels: Record<string, string> = { draft: '草稿', scheduled: '定时中', publishing: '发布中', published: '已发布', failed: '失败', reviewing: '审核中' };
function errorMessage(error: any, fallback: string) { return error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || fallback; }

export default function ContentRecordsPage() {
  const [items, setItems] = useState<ContentPost[]>([]);
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: 1, pageSize: 100 };
      if (status !== 'all') params.status = status;
      const response = await axiosForBackend.get('/api/content/posts', { params });
      setItems(response.data?.data?.items || []);
    } catch (error: any) { toast.error(errorMessage(error, '加载内容记录失败')); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [status]);
  const remove = async (id: string) => {
    try { await axiosForBackend.delete(`/api/content/posts/${id}`); await load(); toast.success('内容记录已删除'); }
    catch (error: any) { toast.error(errorMessage(error, '删除失败')); }
  };
  return <div className="space-y-5">
    <Alert className="border-primary/20 bg-primary/5"><FileText className="h-4 w-4 text-primary" /><AlertDescription>以下均为数据库真实记录。发布接口未获批前只能保存草稿，不会显示虚假的平台发布成功。</AlertDescription></Alert>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">发布中心</h1><p className="mt-1 text-sm text-muted-foreground">共 {items.length} 条内容记录</p></div><div className="flex gap-2"><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem>{Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button><Button asChild><Link to="/publish/create"><Plus className="mr-1 h-4 w-4" />新建草稿</Link></Button></div></div>
    <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>标题</TableHead><TableHead>平台</TableHead><TableHead>账号</TableHead><TableHead>类型</TableHead><TableHead>状态</TableHead><TableHead>创建时间</TableHead><TableHead className="w-20">操作</TableHead></TableRow></TableHeader><TableBody>{items.map((item) => <TableRow key={item.id}><TableCell><div className="max-w-md truncate font-medium">{item.title || '未命名内容'}</div>{item.failReason && <div className="mt-1 text-xs text-destructive">{item.failReason}</div>}</TableCell><TableCell>{platformLabels[item.platform]}</TableCell><TableCell>{item.accountNickname || '—'}</TableCell><TableCell>{item.mediaType === 'video' ? '视频' : item.mediaType === 'image' ? '图文' : '文本'}</TableCell><TableCell><Badge variant={item.status === 'failed' ? 'destructive' : 'outline'}>{statusLabels[item.status] || item.status}</Badge></TableCell><TableCell>{new Date(item.createdAt).toLocaleString('zh-CN')}</TableCell><TableCell><Button variant="ghost" size="icon" onClick={() => void remove(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell></TableRow>)}{!loading && items.length === 0 && <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">暂无真实内容记录</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
  </div>;
}
