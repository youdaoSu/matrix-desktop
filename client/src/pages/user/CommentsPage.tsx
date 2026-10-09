import { useEffect, useState } from 'react';
import { MessageCircle, RefreshCw, Search } from 'lucide-react';
import type { CommentItem, PlatformType } from '@shared/api.interface';
import { axiosForBackend } from '@/api';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@client/src/components/ui/avatar';
import { Badge } from '@client/src/components/ui/badge';
import { Button } from '@client/src/components/ui/button';
import { Card, CardContent } from '@client/src/components/ui/card';
import { Input } from '@client/src/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@client/src/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@client/src/components/ui/table';
import { toast } from 'sonner';

const platformLabels: Record<PlatformType, string> = { douyin: '抖音', xiaohongshu: '小红书', wechat: '视频号', bilibili: 'B站' };
function errorMessage(error: any, fallback: string) { return error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || fallback; }

export default function CommentsPage() {
  const [items, setItems] = useState<CommentItem[]>([]);
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('all');
  const [replyStatus, setReplyStatus] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number | boolean> = { page: 1, pageSize: 100 };
      if (search.trim()) params.keyword = search.trim();
      if (platform !== 'all') params.platform = platform;
      if (replyStatus !== 'all') params.isReplied = replyStatus === 'replied';
      const response = await axiosForBackend.get('/api/comments', { params });
      setItems(response.data?.data?.items || []);
    } catch (error: any) { toast.error(errorMessage(error, '加载评论记录失败')); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [platform, replyStatus]);

  return <div className="space-y-5">
    <Alert className="border-primary/20 bg-primary/5"><MessageCircle className="h-4 w-4 text-primary" /><AlertDescription>这里只展示平台接口已经同步的真实评论。当前未获批的回复接口不会伪造“回复成功”。</AlertDescription></Alert>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">评论管理</h1><p className="mt-1 text-sm text-muted-foreground">共 {items.length} 条已同步评论</p></div><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button></div>
    <Card><CardContent className="flex flex-wrap gap-3 p-4"><div className="relative min-w-56 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void load()} placeholder="搜索评论内容或昵称，回车查询" /></div><Select value={platform} onValueChange={setPlatform}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部平台</SelectItem>{Object.entries(platformLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><Select value={replyStatus} onValueChange={setReplyStatus}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="pending">待回复</SelectItem><SelectItem value="replied">已回复</SelectItem></SelectContent></Select><Button onClick={() => void load()}>查询</Button></CardContent></Card>
    <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>评论用户</TableHead><TableHead>平台</TableHead><TableHead className="w-[38%]">评论内容</TableHead><TableHead>关联作品</TableHead><TableHead>状态</TableHead><TableHead>时间</TableHead></TableRow></TableHeader><TableBody>
      {items.map((item) => <TableRow key={item.id}><TableCell><div className="flex items-center gap-2"><Avatar className="h-8 w-8"><AvatarImage src={item.commenterAvatarUrl} /><AvatarFallback>{(item.commenterNickname || '评').slice(0, 1)}</AvatarFallback></Avatar><span>{item.commenterNickname || '匿名用户'}</span></div></TableCell><TableCell>{platformLabels[item.platform]}</TableCell><TableCell><div className="whitespace-pre-wrap text-sm">{item.content}</div>{item.isSensitive && <Badge variant="destructive" className="mt-1">敏感内容</Badge>}</TableCell><TableCell>{item.postTitle || '—'}</TableCell><TableCell>{item.isReplied ? <Badge variant="secondary">已回复</Badge> : <Badge variant="outline">待回复</Badge>}</TableCell><TableCell>{item.commentedAt ? new Date(item.commentedAt).toLocaleString('zh-CN') : '—'}</TableCell></TableRow>)}
      {!loading && items.length === 0 && <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">暂无真实评论记录。平台评论接口获批并同步后会显示在这里。</TableCell></TableRow>}
    </TableBody></Table></CardContent></Card>
  </div>;
}
