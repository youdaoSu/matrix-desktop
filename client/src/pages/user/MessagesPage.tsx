import { useOfficialWorkspace } from '@/components/workspace/OfficialWorkspace';
import { OfficialInteractionManager } from '@/components/workspace/OfficialInteractionManager';
import { InteractionAccountRail, ReplyTemplatePane } from '@/components/workspace/InteractionPanels';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Inbox, RefreshCw, Search } from 'lucide-react';
import type { MessageItem, MessageSession, PlatformType, PlatformAccount } from '@shared/api.interface';
import { axiosForBackend } from '@/api';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@client/src/components/ui/avatar';
import { Badge } from '@client/src/components/ui/badge';
import { Button } from '@client/src/components/ui/button';
import { Card } from '@client/src/components/ui/card';
import { Input } from '@client/src/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@client/src/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const platformLabels: Record<PlatformType, string> = { douyin: '抖音', xiaohongshu: '小红书', wechat: '视频号', bilibili: 'B站' };
function errorMessage(error: any, fallback: string) { return error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || fallback; }

export default function MessagesPage() {
  const aggregate = useLocation().pathname.endsWith('messages-agg');
  const workspace = useOfficialWorkspace();
  const [account, setAccount] = useState<PlatformAccount | null>(null);
  const generation = useRef(0);
  const [sessions, setSessions] = useState<MessageSession[]>([]);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('all');
  const [loading, setLoading] = useState(true);
  useEffect(() => { setAccount(null); }, [aggregate]);

  const loadSessions = async () => {
    const current = ++generation.current;
    setLoading(true);
    setSessions([]); setMessages([]); setSelectedId('');
    try {
      const params: Record<string, string | number> = { page: 1, pageSize: 100 };
      if (search.trim()) params.keyword = search.trim();
      if (platform !== 'all') params.platform = platform;
      if (account) params.accountId = account.id;
      const response = await axiosForBackend.get('/api/messages/sessions', { params });
      const next = (response.data?.data?.items || []) as MessageSession[];
      if (current !== generation.current) return;
      setSessions(next);
      setSelectedId((current) => next.some((session) => session.id === current) ? current : (next[0]?.id || ''));
    } catch (error: any) { if (current === generation.current) toast.error(errorMessage(error, '加载私信会话失败')); }
    finally { if (current === generation.current) setLoading(false); }
  };

  useEffect(() => { void loadSessions(); return () => { generation.current++; }; }, [platform, account]);
  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    const abort = new AbortController();
    setMessages([]);
    axiosForBackend.get(`/api/messages/sessions/${selectedId}/messages`, { params: { page: 1, pageSize: 100 }, signal: abort.signal })
      .then(response => { if (!abort.signal.aborted) setMessages([...(response.data?.data?.items || [])].reverse()); })
      .catch(error => { if (!abort.signal.aborted) toast.error(errorMessage(error, '加载会话消息失败')); });
    return () => abort.abort();
  }, [selectedId]);
  const selected = sessions.find((session) => session.id === selectedId);

  return <div className={aggregate ? 'matrix-interaction-layout matrix-messages-aggregate' : 'matrix-interaction-layout matrix-messages-layout'}>{!aggregate && <InteractionAccountRail platform={platform} selected={account?.id} onSelect={setAccount} />}<section className="matrix-interaction-content space-y-3">
    <OfficialInteractionManager account={account} kind="messages" />
    <Alert className="border-primary/20 bg-primary/5"><Inbox className="h-4 w-4 text-primary" /><AlertDescription>通过账号操作面板查看和发送私信。下方展示已同步的会话记录。</AlertDescription></Alert>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">私信管理</h1><p className="mt-1 text-sm text-muted-foreground">共 {sessions.length} 个真实会话</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => account ? void workspace.openAccount(account, 'messages') : workspace.show('messages')}>官方页面发私信</Button><Button variant="outline" disabled={loading} onClick={() => void loadSessions()}><RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button></div></div>
    <Card className="matrix-message-panel flex overflow-hidden">
      <div className="matrix-message-sessions flex shrink-0 flex-col border-r"><div className="space-y-2 border-b p-3"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void loadSessions()} placeholder="搜索会话" /></div><Select value={platform} onValueChange={value => { setPlatform(value); setAccount(null); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部平台</SelectItem>{Object.entries(platformLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="flex-1 overflow-auto">
        {sessions.map((session) => <button key={session.id} onClick={() => setSelectedId(session.id)} className={cn('flex w-full gap-3 border-b p-3 text-left hover:bg-muted/50', selectedId === session.id && 'bg-primary/5')}><Avatar className="h-10 w-10"><AvatarImage src={session.userAvatarUrl} /><AvatarFallback>{(session.userNickname || '用').slice(0, 1)}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{session.userNickname || '匿名用户'}</span>{session.unreadCount > 0 && <Badge>{session.unreadCount}</Badge>}</div><div className="mt-1 truncate text-xs text-muted-foreground">{session.lastMessage || '暂无消息'}</div><div className="mt-1 text-[11px] text-muted-foreground">{platformLabels[session.platform]}</div></div></button>)}
        {!loading && sessions.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">暂无真实私信会话</div>}
      </div></div>
      <div className="flex min-w-0 flex-1 flex-col">{selected ? <><div className="flex items-center gap-3 border-b p-4"><Avatar className="h-9 w-9"><AvatarImage src={selected.userAvatarUrl} /><AvatarFallback>{(selected.userNickname || '用').slice(0, 1)}</AvatarFallback></Avatar><div><div className="font-medium">{selected.userNickname || '匿名用户'}</div><div className="text-xs text-muted-foreground">{platformLabels[selected.platform]} · 只读同步会话</div></div></div><div className="flex-1 space-y-3 overflow-auto bg-muted/20 p-5">{messages.map((message) => <div key={message.id} className={cn('flex', message.direction === 'outbound' ? 'justify-end' : 'justify-start')}><div className={cn('max-w-[72%] rounded-lg px-3 py-2 text-sm', message.direction === 'outbound' ? 'bg-primary text-primary-foreground' : 'border bg-card')}><div>{message.content || (message.mediaUrl ? '[媒体消息]' : '空消息')}</div><div className={cn('mt-1 text-[10px]', message.direction === 'outbound' ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{message.sentAt ? new Date(message.sentAt).toLocaleString('zh-CN') : ''}</div></div></div>)}{messages.length === 0 && <div className="flex h-full items-center justify-center text-sm text-muted-foreground">该会话暂无消息记录</div>}</div><div className="border-t p-3 text-center text-xs text-muted-foreground">平台发送接口尚未获批，当前为安全只读模式</div></> : <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">选择一个会话查看真实消息</div>}</div>
    </Card>
  </section><ReplyTemplatePane /></div>;
}
