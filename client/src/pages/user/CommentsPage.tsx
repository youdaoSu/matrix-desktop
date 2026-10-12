import { useOfficialWorkspace } from '@/components/workspace/OfficialWorkspace';
import { OfficialInteractionManager } from '@/components/workspace/OfficialInteractionManager';
import { DouyinCommentMonitorPanel } from '@/components/workspace/DouyinCommentMonitor';
import { InteractionAccountRail, InteractionPostRail, ReplyTemplatePane } from '@/components/workspace/InteractionPanels';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageCircle, RefreshCw, Search } from 'lucide-react';
import type { CommentItem, PlatformType, PlatformAccount } from '@shared/api.interface';
import { axiosForBackend } from '@/api';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@client/src/components/ui/avatar';
import { Badge } from '@client/src/components/ui/badge';
import { Button } from '@client/src/components/ui/button';
import { Card, CardContent } from '@client/src/components/ui/card';
import { Input } from '@client/src/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@client/src/components/ui/select';
import { toast } from 'sonner';

const platformLabels: Record<PlatformType, string> = { douyin: '抖音', xiaohongshu: '小红书', wechat: '视频号', bilibili: 'B站' };
function errorMessage(error: any, fallback: string) { return error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || fallback; }

export default function CommentsPage() {
  const aggregate = useLocation().pathname.endsWith('comments-agg');
  const workspace = useOfficialWorkspace();
  const [account, setAccount] = useState<PlatformAccount | null>(null);
  const [postId, setPostId] = useState('');
  const generation = useRef(0);
  const [items, setItems] = useState<CommentItem[]>([]);
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('all');
  const [replyStatus, setReplyStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  useEffect(() => { setAccount(null); setPostId(''); }, [aggregate]);

  const load = async () => {
    const current = ++generation.current;
    setLoading(true);
    setItems([]);
    try {
      const params: Record<string, string | number | boolean> = { page: 1, pageSize: 100 };
      if (search.trim()) params.keyword = search.trim();
      if (platform !== 'all') params.platform = platform;
      if (account) params.accountId = account.id;
      if (postId) params.postId = postId;
      if (replyStatus !== 'all') params.isReplied = replyStatus === 'replied';
      const response = await axiosForBackend.get('/api/comments', { params });
      if (current === generation.current) setItems(response.data?.data?.items || []);
    } catch (error: any) { if (current === generation.current) toast.error(errorMessage(error, '加载评论记录失败')); }
    finally { if (current === generation.current) setLoading(false); }
  };

  useEffect(() => { void load(); return () => { generation.current++; }; }, [platform, replyStatus, account, postId]);

  return <div className={aggregate ? 'matrix-interaction-layout matrix-comments-aggregate' : 'matrix-interaction-layout matrix-comments-layout'}>{!aggregate && <><InteractionAccountRail platform={platform} selected={account?.id} onSelect={value => { setAccount(value); setPostId(''); }} /><InteractionPostRail account={account} selected={postId} onSelect={setPostId} /></>}<section className="matrix-interaction-content space-y-3">
    <DouyinCommentMonitorPanel />
    <OfficialInteractionManager account={account} kind="comments" />
    <Alert className="border-primary/20 bg-primary/5"><MessageCircle className="h-4 w-4 text-primary" /><AlertDescription>在账号操作面板查看和回复评论。下方列表保留已同步的评论记录。</AlertDescription></Alert>
<div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">评论管理</h1><p className="mt-1 text-sm text-muted-foreground">共 {items.length} 条已同步评论</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => account ? void workspace.openAccount(account, 'comments') : workspace.show('comments')}>官方页面回复</Button><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button></div></div>
    <Card><CardContent className="flex flex-wrap gap-3 p-4"><div className="relative min-w-56 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void load()} placeholder="搜索评论内容或昵称，回车查询" /></div><Select value={platform} onValueChange={value => { setPlatform(value); setAccount(null); setPostId(''); }}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部平台</SelectItem>{Object.entries(platformLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><Select value={replyStatus} onValueChange={setReplyStatus}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="pending">待回复</SelectItem><SelectItem value="replied">已回复</SelectItem></SelectContent></Select><Button onClick={() => void load()}>查询</Button></CardContent></Card>
    <div className="matrix-comment-list" aria-label="评论记录">{loading && <p role="status">正在加载评论记录…</p>}{items.map(item => <article key={item.id} data-comment-id={item.id}><Avatar className="h-8 w-8 shrink-0"><AvatarImage src={item.commenterAvatarUrl} /><AvatarFallback>{(item.commenterNickname || '评').slice(0, 1)}</AvatarFallback></Avatar><div><header><strong>{item.commenterNickname || '匿名用户'}</strong><Badge variant={item.isReplied ? 'secondary' : 'outline'}>{item.isReplied ? '已回复' : '待回复'}</Badge>{item.isSensitive && <Badge variant="destructive">敏感内容</Badge>}</header><p>{item.content}</p>{item.replyContent && <blockquote>已同步回复：{item.replyContent}</blockquote>}<footer><span>{platformLabels[item.platform]}{item.postTitle ? ' · ' + item.postTitle : ''}</span><time>{item.commentedAt ? new Date(item.commentedAt).toLocaleString('zh-CN') : '—'}</time></footer></div></article>)}{!loading && !items.length && <div className="matrix-interaction-empty">暂无真实评论记录。平台评论接口获批并同步后会显示在这里。</div>}</div>
  </section><ReplyTemplatePane /></div>;
}
