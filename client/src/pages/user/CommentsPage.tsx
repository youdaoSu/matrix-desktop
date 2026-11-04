import { useOfficialWorkspace } from '@/components/workspace/OfficialWorkspace';
import { OfficialInteractionManager } from '@/components/workspace/OfficialInteractionManager';
import { InteractionLiveFeed } from '@/components/workspace/InteractionLiveFeed';
import { DouyinCommentWorkRail } from '@/components/workspace/DouyinCommentMonitor';
import { InteractionAccountRail, InteractionPostRail, ReplyTemplatePane } from '@/components/workspace/InteractionPanels';
import { InteractionAggregateFilters, InteractionEmpty, InteractionPlatformSelect, InteractionStatusTabs, InteractionTools, useInteractionFilters, exportInteractionRecords } from '@/components/workspace/InteractionUi';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { RefreshCw, Search } from 'lucide-react';
import type { CommentItem, PlatformType, PlatformAccount } from '@shared/api.interface';
import { axiosForBackend, getAuthToken, getUser } from '@/api';
import { Avatar, AvatarFallback, AvatarImage } from '@client/src/components/ui/avatar';
import { Badge } from '@client/src/components/ui/badge';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import { toast } from 'sonner';
import { useInteractionAccount, useInteractionPlatform } from '@/components/workspace/InteractionState';
import { uiOneOf, uiText, useWorkspaceIdentity, useWorkspacePreference } from '@/components/workspace/WorkspaceUiState';
import { useOwnerRequest } from '@/components/workspace/use-owner-request';
import { SingleWorkCommentEntry } from '@/components/workspace/SingleWorkComment';
import { useDouyinInteractionData } from '@/components/workspace/DouyinInteractionData';
import type { SingleCommentSource, SingleCommentState } from '@shared/one-click-comments';

const platformLabels: Record<PlatformType, string> = { douyin: '抖音', xiaohongshu: '小红书', wechat: '视频号', bilibili: 'B站' };
function errorMessage(error: any, fallback: string) { return error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || fallback; }

export default function CommentsPage() {
  const location = useLocation();
  const aggregate = location.pathname.endsWith('comments-agg');
  const workspace = useOfficialWorkspace();
  const [platform, setPlatform] = useInteractionPlatform();
  const scope = aggregate ? 'comments-agg' : 'comments';
  const filters = useInteractionFilters(platform, scope);
  const [account, setAccount] = useInteractionAccount(platform, scope, filters.accounts, filters.loaded);
  const [postId, setPostId] = useWorkspacePreference(`interaction.${scope}.${platform}.${account?.id || 'all'}.${account?.connectorSessionId || ''}.${account?.nativeAccountKey || ''}.post`, '', uiText);
  const generation = useRef(0);
  const lease = useWorkspaceIdentity();
  const readScope = `${lease}/${scope}/${platform}/${account?.id || ''}/${account?.connectorSessionId || ''}/${account?.nativeAccountKey || ''}`;
  const [snapshot, setSnapshot] = useState<{ scope: string; items: CommentItem[] }>({ scope: '', items: [] });
  const items = snapshot.scope === readScope ? snapshot.items : [];
  const setItems = (items: CommentItem[]) => setSnapshot({ scope: readScope, items });
  const [search, setSearch] = useWorkspacePreference(`interaction.${scope}.${platform}.search`, '', uiText);
  const [replyStatus, setReplyStatus] = useWorkspacePreference(`interaction.${scope}.${platform}.reply`, 'all', uiOneOf(['all', 'pending', 'replied']));
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<{ scope: string; message: string }>();
  const beginRequest = useOwnerRequest();
  const commentData=useDouyinInteractionData('comments');
  const imported=useRef('');
  useEffect(()=>{
    const params=new URLSearchParams(location.search||''),id=params.get('commentReceipt'),accountId=params.get('commentAccount'),wantedPlatform=params.get('commentPlatform');
    if(aggregate||!id||id.length>120||!accountId||!['douyin','xiaohongshu','bilibili'].includes(wantedPlatform||'')||!filters.loaded)return;
    const importKey=`${lease}/${location.search}`;if(imported.current===importKey)return;
    if(platform!==wantedPlatform){setPlatform(wantedPlatform!);return;}
    const target=filters.accounts.find(a=>a.id===accountId&&a.platform===wantedPlatform);if(!target)return;
    if(account?.id!==target.id){setAccount(target);return;}
    setPostId('receipt:'+id);imported.current=importKey;
  },[location.search,aggregate,lease,platform,filters.loaded,filters.accounts,account?.id]);
  const targetScope=`${readScope}/${postId}`;
  const [receiptTarget,setReceiptTarget]=useState<{scope:string;target?:SingleCommentState['target'];error?:string}>();
  const [targetRetry,setTargetRetry]=useState(0);
  useEffect(()=>{
    if(aggregate||!account||!postId.startsWith('receipt:'))return;
    let cancelled=false;const owner=getUser()?.id,accessToken=getAuthToken();
    const current=()=>!cancelled&&owner===getUser()?.id&&accessToken===getAuthToken();
    setReceiptTarget({scope:targetScope});
    void(async()=>{
      try{
        if(!owner||!accessToken||!window.matrixDesktop?.oneClickComments)throw Error('请在新版远效桌面端登录后读取作品');
        const response=await window.matrixDesktop.oneClickComments({accessToken,command:'single-state',args:{source:{kind:'receipt',accountId:account.id,receiptId:postId.slice(8)}}});
        if(response.error)throw Error(response.error);
        const target=(response.result as SingleCommentState)?.target;
        if(!target||target.accountId!==account.id||target.platform!==platform||!target.workId)throw Error('原任务的作品归属未核实');
        if(current())setReceiptTarget({scope:targetScope,target});
      }catch(e){if(current())setReceiptTarget({scope:targetScope,error:errorMessage(e,'读取原任务作品失败')});}
    })();
    return()=>{cancelled=true;};
  },[targetScope,aggregate,targetRetry]);
  const resolvedTarget=receiptTarget?.scope===targetScope?receiptTarget:undefined;
  const selectedWorkId=postId.startsWith('receipt:')?resolvedTarget?.target?.workId||'':postId;
  const chosenWork=account&&platform==='douyin'?commentData.entry(account,'comments')?.works.find(w=>w.platformId===selectedWorkId):undefined;
  const commentSource:SingleCommentSource|null=account&&postId.startsWith('receipt:')?{kind:'receipt',accountId:account.id,receiptId:postId.slice(8)}:account&&chosenWork&&/^[1-9]\d{9,18}$/.test(postId)?{kind:'cached-work',accountId:account.id,workId:postId}:null;

  const load = async () => {
    if (!filters.loaded) return;
    if (platform === 'douyin' || !aggregate && (!account || !postId || postId.startsWith('receipt:'))) { setLoading(false); setItems([]); setReadError(undefined); return; }
    const request = beginRequest(); if (!request.authorized) { request.finish(); setLoading(false); setReadError({scope:readScope,message:'请先登录后读取历史评论'}); return; }
    window.dispatchEvent(new CustomEvent('matrix:interaction-refresh-request', { detail: { kind: 'comments' } }));
    const current = ++generation.current;
    setLoading(true); setReadError(undefined);
    setItems([]);
    try {
      const params: Record<string, string | number | boolean> = { page: 1, pageSize: 100 };
      if (search.trim()) params.keyword = search.trim();
      params.platform = platform;
      if (account) params.accountId = account.id;
      if (!aggregate && postId) params.postId = postId;
      if (replyStatus !== 'all') params.isReplied = replyStatus === 'replied';
      const response = await axiosForBackend.get('/api/comments', { params, signal: request.signal });
      if (!Array.isArray(response.data?.data?.items)) throw Error('历史评论响应不完整');
      if (request.current() && current === generation.current) setItems(response.data.data.items.filter((item: CommentItem) => item.platform === platform && (!account || item.accountId === account.id)));
    } catch (error: any) { if (request.current() && current === generation.current) { const message=errorMessage(error, '加载评论记录失败'); setReadError({scope:readScope,message}); toast.error(message); } }
    finally { request.finish(); if (request.current() && current === generation.current) setLoading(false); }
  };

  useEffect(() => { setItems([]); void load(); return () => { generation.current++; }; }, [platform, replyStatus, account?.id, account?.connectorSessionId, account?.nativeAccountKey, postId, filters.loaded, lease, aggregate]);

  const changePlatform = setPlatform;
  const visibleItems = items.filter(item => item.platform === platform && (!account || item.accountId === account.id) && (aggregate ? filters.matches(item.accountId, item.commentedAt) : !!account && !!postId && item.postId === postId));
  return <div data-interaction-view={aggregate ? 'comments-agg' : 'comments'} data-interaction-platform={platform} className={aggregate ? 'matrix-interaction-layout matrix-comments-aggregate' : 'matrix-interaction-layout matrix-comments-layout'}>{!aggregate && <><InteractionAccountRail platform={platform} selected={account?.id} onPlatformChange={changePlatform} onSelect={setAccount} allowAll={false} />{platform === 'douyin' ? <DouyinCommentWorkRail account={account} selected={selectedWorkId} onSelect={setPostId} /> : <InteractionPostRail account={account} selected={postId} onSelect={setPostId} />}</>}<section className="matrix-interaction-content">
    <div className="matrix-interaction-toolbar"><h1>{aggregate ? '评论聚合' : '评论管理'}</h1>{aggregate && <InteractionPlatformSelect value={platform} onChange={changePlatform} />}</div>
    {!aggregate&&<SingleWorkCommentEntry key={targetScope} source={commentSource} title={resolvedTarget?.target?.title||chosenWork?.title} locked={workspace.jobsLocked||postId.startsWith('receipt:')&&!resolvedTarget?.target}/>}
    {!aggregate&&postId.startsWith('receipt:')&&(resolvedTarget?.error?<p role="alert">{resolvedTarget.error} <Button variant="ghost" onClick={()=>setTargetRetry(n=>n+1)}>重新读取作品</Button></p>:!resolvedTarget?.target?<p role="status">正在定位原任务作品…</p>:<p className="text-xs text-muted-foreground">已关联原发布任务 · 作品编号：{resolvedTarget.target.workId}</p>)}
    {aggregate && <div className="matrix-interaction-toolbar"><InteractionAggregateFilters filter={filters} accountId={account?.id} onAccount={setAccount} /><small>分组筛选自动读取记录；日期与回复状态仅适用于有相应平台字段的历史记录</small></div>}
    <InteractionLiveFeed kind="comments" syncPlatform platform={platform} account={account} commentView={aggregate ? 'aggregate' : 'work'} workId={aggregate ? undefined : selectedWorkId} matches={aggregate ? id => !filters.group || filters.visibleAccounts.some(item => item.id === id) : undefined} />
    {platform !== 'douyin' && <InteractionTools title="本机历史评论与手动读取工具（非实时来源）">
    <div className="matrix-interaction-toolbar"><strong>历史评论筛选</strong><InteractionStatusTabs value={replyStatus} onChange={setReplyStatus} /><div className="matrix-interaction-search"><Search size={15} /><Input aria-label="搜索评论" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => event.key === 'Enter' && void load()} placeholder="搜索本机历史关键词 / 昵称" /></div><Button variant="outline" onClick={() => void load()}>查询历史</Button></div>
    <div className="matrix-interaction-actionbar"><Button variant="outline" onClick={() => account ? void workspace.openAccount(account, 'comments') : workspace.show('comments')}>官方页面回复</Button><Button variant="outline" disabled title="批量回复平台接口尚未接通，不会修改本地状态冒充回复成功">批量回复</Button><Button variant="outline" disabled={!visibleItems.length} onClick={() => exportInteractionRecords('comments', visibleItems)}>导出记录</Button><span>已显示 {visibleItems.length} / {items.length} 条 · 最多 100 条</span><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw size={14} />刷新</Button></div>
    <div className="matrix-comment-list" aria-label="评论记录">{loading && <p role="status">正在加载评论记录…</p>}{visibleItems.map(item => <article key={item.id} data-comment-id={item.id}><Avatar className="h-8 w-8 shrink-0"><AvatarImage src={item.commenterAvatarUrl} /><AvatarFallback>{(item.commenterNickname || '评').slice(0, 1)}</AvatarFallback></Avatar><div><header><strong>{item.commenterNickname || '匿名用户'}</strong><Badge variant={item.isReplied ? 'secondary' : 'outline'}>{item.isReplied ? '已回复' : '待回复'}</Badge>{item.isSensitive && <Badge variant="destructive">敏感内容</Badge>}</header><p>{item.content}</p>{item.replyContent && <blockquote>已同步回复：{item.replyContent}</blockquote>}<footer><span>{platformLabels[item.platform]}{item.postTitle ? ' · ' + item.postTitle : ''}</span><time>{item.commentedAt ? new Date(item.commentedAt).toLocaleString('zh-CN') : '—'}</time></footer></div></article>)}{!loading && readError?.scope===readScope && <p role="alert">历史评论读取失败：{readError.message}；不能判断是否有记录。</p>}{!loading && readError?.scope!==readScope && !visibleItems.length && <InteractionEmpty>暂无已同步评论。个人账号可展开下方工作台，读取官方页面当前可见记录。</InteractionEmpty>}</div>
    <InteractionTools title="官方页面快照与回复工作台"><OfficialInteractionManager account={account} kind="comments" /></InteractionTools>
    </InteractionTools>}
  </section><ReplyTemplatePane /></div>;
}
