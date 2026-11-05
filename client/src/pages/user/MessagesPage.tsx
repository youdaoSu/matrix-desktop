import { InteractionAccountGate } from '@/components/workspace/InteractionAccountGate';
import { useOfficialWorkspace } from '@/components/workspace/OfficialWorkspace';
import { OfficialInteractionManager } from '@/components/workspace/OfficialInteractionManager';
import { InteractionLiveFeed } from '@/components/workspace/InteractionLiveFeed';
import { DouyinInboxView } from '@/components/workspace/DouyinInbox';
import { InteractionAccountRail, ReplyTemplatePane } from '@/components/workspace/InteractionPanels';
import { InteractionAggregateFilters, InteractionEmpty, InteractionPlatformSelect, InteractionTools, useInteractionFilters, exportInteractionRecords } from '@/components/workspace/InteractionUi';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { RefreshCw, Search } from 'lucide-react';
import type { MessageItem, MessageSession, PlatformType, PlatformAccount } from '@shared/api.interface';
import { axiosForBackend, getAuthToken, getUser } from '@/api';
import { Avatar, AvatarFallback, AvatarImage } from '@client/src/components/ui/avatar';
import { Badge } from '@client/src/components/ui/badge';
import { Button } from '@client/src/components/ui/button';
import { Card } from '@client/src/components/ui/card';
import { Input } from '@client/src/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useInteractionAccount, useInteractionPlatform } from '@/components/workspace/InteractionState';
import { uiBoolean, uiText, useWorkspaceIdentity, useWorkspacePreference } from '@/components/workspace/WorkspaceUiState';
import { useOwnerRequest } from '@/components/workspace/use-owner-request';

const platformLabels: Record<PlatformType, string> = { douyin: '抖音', xiaohongshu: '小红书', wechat: '视频号', bilibili: 'B站' };
function errorMessage(error: any, fallback: string) { return error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || fallback; }

export default function MessagesPage() {
  const aggregate = useLocation().pathname.endsWith('messages-agg');
  const workspace = useOfficialWorkspace();
  const [platform, setPlatform] = useInteractionPlatform();
  const scope = aggregate ? 'messages-agg' : 'messages';
  const filters = useInteractionFilters(platform, scope);
  const [account, setAccount] = useInteractionAccount(platform, scope, filters.accounts, filters.loaded);
  const generation = useRef(0);
  const lease = useWorkspaceIdentity();
  const readScope = `${lease}/${scope}/${platform}/${account?.id || ''}/${account?.connectorSessionId || ''}/${account?.nativeAccountKey || ''}`;
  const [snapshot, setSnapshot] = useState<{ scope: string; items: MessageSession[] }>({ scope: '', items: [] });
  const sessions = snapshot.scope === readScope ? snapshot.items : [];
  const setSessions = (items: MessageSession[]) => setSnapshot({ scope: readScope, items });
  const [messageView, setMessageView] = useState<{ key: string; items: MessageItem[]; loading: boolean; error?: string }>({ key: '', items: [], loading: false });
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useWorkspacePreference(`interaction.${scope}.${platform}.search`, '', uiText);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<{scope:string;message:string}>();
  const [onlyUnread, setOnlyUnread] = useWorkspacePreference(`interaction.${scope}.${platform}.unread`, false, uiBoolean);
  const beginRequest = useOwnerRequest();

  const loadSessions = async () => {
    if (!filters.loaded || platform === 'douyin') { setLoading(!filters.loaded && platform !== 'douyin'); setSessionError(undefined); return; }
    const request = beginRequest(); if (!request.authorized) { request.finish(); setLoading(false); setSessionError({scope:readScope,message:'请先登录后读取历史会话'}); return; }
    window.dispatchEvent(new CustomEvent('matrix:interaction-refresh-request', { detail: { kind: 'messages' } }));
    const current = ++generation.current;
    setLoading(true); setSessionError(undefined);
    setSessions([]); setMessageView({key:'',items:[],loading:false}); setSelectedId('');
    try {
      const params: Record<string, string | number> = { page: 1, pageSize: 100 };
      if (search.trim()) params.keyword = search.trim();
      params.platform = platform;
      if (account) params.accountId = account.id;
      const response = await axiosForBackend.get('/api/messages/sessions', { params, signal: request.signal });
      if (!Array.isArray(response.data?.data?.items)) throw Error('历史会话响应不完整');
      const next = (response.data.data.items as MessageSession[]).filter(item => item.platform === platform && (!account || item.accountId === account.id));
      if (!request.current() || current !== generation.current) return;
      setSessions(next);
      setSelectedId((current) => next.some((session) => session.id === current) ? current : (next[0]?.id || ''));
    } catch (error: any) { if (request.current() && current === generation.current) { const message=errorMessage(error, '加载私信会话失败'); setSessionError({scope:readScope,message}); toast.error(message); } }
    finally { request.finish(); if (request.current() && current === generation.current) setLoading(false); }
  };

  useEffect(() => { setSessions([]); setMessageView({key:'',items:[],loading:false}); setSelectedId(''); void loadSessions(); return () => { generation.current++; }; }, [platform, account?.id, account?.connectorSessionId, account?.nativeAccountKey, filters.loaded, lease, aggregate]);
  useEffect(() => {
    if (!selectedId || !sessions.some(item => item.id === selectedId)) { setMessageView({key:'',items:[],loading:false}); return; }
    const abort = new AbortController();
    const key = `${readScope}/${selectedId}`;
    const owner = getUser()?.id, token = getAuthToken();
    const current = () => !abort.signal.aborted && owner === getUser()?.id && token === getAuthToken();
    setMessageView({key,items:[],loading:true});
    axiosForBackend.get(`/api/messages/sessions/${selectedId}/messages`, { params: { page: 1, pageSize: 100 }, signal: abort.signal })
      .then(response => { if (!Array.isArray(response.data?.data?.items)) throw Error('历史消息响应不完整'); if (current()) setMessageView({key,items:[...response.data.data.items].reverse(),loading:false}); })
      .catch(error => { if (current()) { const message=errorMessage(error, '加载会话消息失败'); setMessageView({key,items:[],loading:false,error:message}); toast.error(message); } });
    return () => abort.abort();
  }, [selectedId, readScope, snapshot.scope]);
  const visibleSessions = sessions.filter(session => session.platform === platform && (!account || session.accountId === account.id) && (!onlyUnread || session.unreadCount > 0) && (!aggregate || filters.matches(session.accountId, session.lastMessageAt)));
  const selected = visibleSessions.find(session => session.id === selectedId);
  const currentMessages = messageView.key === `${readScope}/${selectedId}` ? messageView : {items:[],loading:true,error:undefined};
  const changePlatform = setPlatform;

  return <div data-interaction-view={aggregate ? 'messages-agg' : 'messages'} data-interaction-platform={platform} className={aggregate ? 'matrix-interaction-layout matrix-messages-aggregate' : 'matrix-interaction-layout matrix-messages-layout'}>{!aggregate && <InteractionAccountRail platformOnly platform={platform} selected={account?.id} onPlatformChange={changePlatform} onSelect={setAccount} />}<section className="matrix-interaction-content">
    <div className="matrix-interaction-toolbar"><h1>{aggregate ? '私信聚合' : '私信管理'} · {platformLabels[platform as PlatformType]}</h1>{aggregate && <InteractionPlatformSelect value={platform} onChange={changePlatform} allowAll={false} />}</div>
    {aggregate && <div className="matrix-interaction-toolbar"><InteractionAggregateFilters filter={filters} accountId={account?.id} onAccount={setAccount} /><small>分组筛选自动读取记录；日期仅筛选下方有平台时间的本机历史会话</small></div>}
    {platform === 'douyin' ? <SelectedInboxGate account={account}><DouyinInboxView accounts={filters.accounts} accountId={account?.id} matches={aggregate ? id => !filters.group || filters.visibleAccounts.some(item => item.id === id) : undefined} /></SelectedInboxGate> : <InteractionLiveFeed kind="messages" syncPlatform platform={platform} account={account} matches={aggregate ? id => !filters.group || filters.visibleAccounts.some(item => item.id === id) : undefined} />}
    {platform !== 'douyin' && <InteractionTools title="本机历史会话与手动读取工具（非实时来源）">
    <div className="matrix-interaction-toolbar"><strong>历史会话</strong><label><input type="checkbox" checked={onlyUnread} onChange={event => { setOnlyUnread(event.target.checked); setSelectedId(''); setMessageView({key:'',items:[],loading:false}); }} />历史会话有未读</label><small>{sessions.length ? `本机历史未读: ${sessions.reduce((count, session) => count + session.unreadCount, 0)}` : '本机历史未读状态未获取'}</small><Button variant="outline" onClick={() => account ? void workspace.openAccount(account, 'messages') : workspace.show('messages')}>官方页面发私信</Button><Button variant="outline" disabled={loading} onClick={() => void loadSessions()}><RefreshCw size={14} />刷新历史</Button><Button variant="outline" disabled={!visibleSessions.length} onClick={() => exportInteractionRecords('sessions', visibleSessions)}>导出会话记录</Button></div>
    <Card className="matrix-message-panel flex overflow-hidden">
      <div className="matrix-message-sessions flex shrink-0 flex-col border-r"><div className="matrix-interaction-search border-b"><Search size={15} /><Input aria-label="搜索会话" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => event.key === 'Enter' && void loadSessions()} placeholder="搜索对话，回车查询" /></div><div className="flex-1 overflow-auto">
        {visibleSessions.map((session) => <button key={session.id} onClick={() => setSelectedId(session.id)} className={cn('flex w-full gap-3 border-b p-3 text-left hover:bg-muted/50', selectedId === session.id && 'bg-primary/5')}><Avatar className="h-10 w-10"><AvatarImage src={session.userAvatarUrl} /><AvatarFallback>{(session.userNickname || '用').slice(0, 1)}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{session.userNickname || '匿名用户'}</span>{session.unreadCount > 0 && <Badge>{session.unreadCount}</Badge>}</div><div className="mt-1 truncate text-xs text-muted-foreground">{session.lastMessage || '暂无消息'}</div><div className="mt-1 text-[11px] text-muted-foreground">{platformLabels[session.platform]}</div></div></button>)}
        {loading && <p role="status">正在加载会话…</p>}{!loading && sessionError?.scope===readScope && <p role="alert">历史会话读取失败：{sessionError.message}；不能判断是否有记录。</p>}{!loading && sessionError?.scope!==readScope && visibleSessions.length === 0 && <InteractionEmpty>暂无已同步会话</InteractionEmpty>}
      </div><footer className="matrix-interaction-rail-footer">对话数: {loading || sessionError?.scope===readScope ? '—' : `${visibleSessions.length} / ${sessions.length}`}<small>本次最多加载 100 个</small></footer></div>
      <div className="flex min-w-0 flex-1 flex-col">{selected ? <><div className="flex items-center gap-3 border-b p-4"><Avatar className="h-9 w-9"><AvatarImage src={selected.userAvatarUrl} /><AvatarFallback>{(selected.userNickname || '用').slice(0, 1)}</AvatarFallback></Avatar><div><div className="font-medium">{selected.userNickname || '匿名用户'}</div><div className="text-xs text-muted-foreground">{platformLabels[selected.platform]} · 只读同步会话</div></div></div><div className="flex-1 space-y-3 overflow-auto bg-muted/20 p-5">{currentMessages.items.map((message: MessageItem) => <div key={message.id} className={cn('flex', message.direction === 'outbound' ? 'justify-end' : 'justify-start')}><div className={cn('max-w-[72%] rounded-lg px-3 py-2 text-sm', message.direction === 'outbound' ? 'bg-primary text-primary-foreground' : 'border bg-card')}><div>{message.content || (message.mediaUrl ? '[媒体消息]' : '空消息')}</div><div className={cn('mt-1 text-[10px]', message.direction === 'outbound' ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{message.sentAt ? new Date(message.sentAt).toLocaleString('zh-CN') : ''}</div></div></div>)}{currentMessages.loading && <p role="status">正在读取会话消息…</p>}{!currentMessages.loading && currentMessages.error && <p role="alert">历史消息读取失败：{currentMessages.error}；不能判断是否有消息。</p>}{!currentMessages.loading && !currentMessages.error && currentMessages.items.length === 0 && <InteractionEmpty>该会话暂无消息记录</InteractionEmpty>}</div><div className="border-t p-3 text-center text-xs text-muted-foreground">平台发送接口尚未获批；请核对收件人后在官方页面发送</div></> : <InteractionEmpty>选择会话查看消息；个人账号可展开下方官方页面快照工作台。</InteractionEmpty>}</div>
    </Card>
    <InteractionTools title="官方页面快照与私信工作台"><OfficialInteractionManager account={account} kind="messages" /></InteractionTools>
    </InteractionTools>}
  </section><ReplyTemplatePane /></div>;
}

function SelectedInboxGate({account,children}:{account?:PlatformAccount|null;children:React.ReactNode}){return account?<InteractionAccountGate account={account}>{children}</InteractionAccountGate>:<>{children}</>;}
