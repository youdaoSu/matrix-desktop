import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getAuthToken, getUser } from '@/api';
import { newRequestId } from '@shared/request-id';
import { newestInteractionsFirst } from '@shared/interaction-order';
import { interactionAvatarInitial } from '@shared/interaction-avatar';
import type { DouyinInteractionRow } from '@shared/douyin-interactions';
import type { PlatformAccount } from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useOfficialWorkspace } from './OfficialWorkspace';
import { InteractionEmpty } from './InteractionUi';
import { uiPage, uiText, useWorkspacePreference } from './WorkspaceUiState';
import { useDouyinInteractionData, douyinInteractionKey, interactionStatus, type DouyinKind } from './DouyinInteractionData';
import { useInteractionImage } from './use-interaction-image';
import { DouyinInlineText } from './DouyinInlineText';
import { DouyinFollowerControls } from './DouyinFollowerSessions';
import { createInteractionProjection } from './interaction-projection';

type CommentRow = DouyinInteractionRow & { accountId: string; accountNickname: string };
const rowKey = (r: CommentRow, id = r.platformId) => JSON.stringify([r.accountId,r.workId,id]);
export function InteractionAvatar({ row, account, kind = 'comments' }: { row: DouyinInteractionRow; account?: PlatformAccount; kind?: DouyinKind }) {
  const urls = [...new Set([row.avatarUrl, ...(row.avatarUrls || [])].filter((v): v is string => !!v))];
  const picture = useInteractionImage({ account, row, kind, target: 'avatar', urls });
  const signature = urls.join('\n');
  const [attempt, setAttempt] = useState({ signature, index: 0 });
  const [decodeError, setDecodeError] = useState('');
  const index = attempt.signature === signature ? attempt.index : 0;
  return <Avatar ref={picture.host} title={picture.dataUrl && decodeError===picture.dataUrl ? '头像图片已读取，但当前格式无法显示' : picture.error || picture.warning || (picture.busy ? !urls.length ? '正在用所属账号补读公开头像' : '正在读取头像' : !picture.dataUrl && !urls.length ? picture.available ? '进入可见区域后补读公开头像；名单同步状态单独保留' : row.avatarReadHint || '本条缓存未包含头像地址；等待官网名单成功同步后补齐' : undefined)}><AvatarImage key={signature+'/'+index+'/'+picture.dataUrl.slice(-24)} src={picture.available ? picture.dataUrl || undefined : urls[index]} referrerPolicy="no-referrer" onLoadingStatusChange={status => { if(status!=='error')return;if(picture.available&&picture.dataUrl)setDecodeError(picture.dataUrl);else if(!picture.available&&index<urls.length)setAttempt({signature,index:index+1}); }}/><AvatarFallback>{interactionAvatarInitial(row.author)}</AvatarFallback></Avatar>;
}
function CommentPicture({ urls, row, account, imageIndex }: { urls: string[]; row: DouyinInteractionRow; account: PlatformAccount; imageIndex: number }) {
  const picture=useInteractionImage({account,row,kind:'comments',target:'comment-image',imageIndex,urls});
  const signature = urls.join('\n'), [attempt,setAttempt] = useState({ signature, index: 0 });
  const [decodeError,setDecodeError]=useState('');
  const index = attempt.signature === signature ? attempt.index : 0;
  if(picture.available)return <span ref={picture.host} style={{display:'block',maxWidth:240,minHeight:32}}>{picture.dataUrl?<>{decodeError===picture.dataUrl?<small role="status">图片已读取，但当前格式无法显示</small>:<img src={picture.dataUrl} alt="评论图片或图片表情" style={{maxWidth:240,maxHeight:240,objectFit:'contain',borderRadius:8}} onError={()=>setDecodeError(picture.dataUrl)}/>}{picture.warning&&<small>{picture.warning}</small>}</>:picture.error?<><small role="status">{picture.error}</small>{!/(?:HTTP\s*(?:401|403|429)|没有权限|未授权)/.test(picture.error)&&<Button size="sm" variant="outline" onClick={picture.retry}>重试图片预览</Button>}</>:<small>{picture.near?'正在读取评论图片…':'图片进入视野后自动预览'}</small>}</span>;
  return urls[index] ? <img src={urls[index]} alt="评论图片或图片表情" loading="lazy" referrerPolicy="no-referrer" style={{maxWidth:240,maxHeight:240,objectFit:'contain',borderRadius:8}} onError={()=>setAttempt({signature,index:index+1})}/> : <small role="status">评论图片加载失败，平台附件地址可能已过期</small>;
}
function CommentItem({ row, account, childrenRows = [],replyPausedReason }: { row: CommentRow; account: PlatformAccount; childrenRows?: CommentRow[];replyPausedReason?:string }) {
  const data=useDouyinInteractionData('comments');
  const [expanded,setExpanded] = useState(false),[replying,setReplying] = useState(false),[draft,setDraft] = useState('');
  const [liked,setLiked] = useState(row.liked),[count,setCount] = useState(row.likeCount),[pending,setPending] = useState(false),[message,setMessage] = useState(''),[uncertain,setUncertain] = useState(false);
  const busy = useRef(false), alive=useRef(true);
  const latestRow=useRef(row);latestRow.current=row;
  const [estimate,setEstimate]=useState<number>();
  const projection=useRef<{liked:boolean;baseCount:number|undefined;count:number;at:number}|undefined>(undefined);
  const [posted,setPosted] = useState<CommentRow[]>([]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{if(!busy.current){const p=projection.current;if(p&&Date.now()-p.at<15000&&row.likeCount===p.baseCount)return;projection.current=undefined;setEstimate(undefined);setLiked(row.liked);setCount(row.likeCount);}},[row.liked,row.likeCount]);
  useEffect(()=>{if(estimate===undefined)return;const timer=window.setTimeout(()=>{projection.current=undefined;setEstimate(undefined);setCount(latestRow.current.likeCount);},15000);return()=>window.clearTimeout(timer);},[estimate]);
  const act = async (command: 'like' | 'reply') => {
    if (busy.current || uncertain || !window.matrixDesktop?.douyinInteractions) return;
    const token = getAuthToken(), owner = getUser()?.id;
    if (!token || !owner) return;
    const desiredLiked = liked !== true;
    busy.current=true;setPending(true);setMessage('');
    try {
      const result = await window.matrixDesktop.douyinInteractions({ command, accessToken: token, accountId: account.id, kind: 'comments', workId: row.workId, commentId: row.platformId, requestId: newRequestId(), ...(command === 'like' ? { liked: desiredLiked } : { text: draft.trim() }) });
      if(!alive.current||getUser()?.id!==owner||getAuthToken()!==token)return;
      if(result.error)throw Error(result.error);
      if(result.accountId!==account.id||result.sessionId!==account.connectorSessionId)throw Error('账号已变化，结果未确认，请核对原评论');
      const receipt = result.receipt;
      if(!receipt)throw Error('评论操作结果未确认，请核对原评论，勿重复提交');
      if(command==='like'&&receipt.state==='confirmed'&&receipt.liked!==undefined&&(typeof receipt.liked!=='boolean'||receipt.liked!==desiredLiked))throw Error('官网返回的点赞状态与本次目标不一致，结果未确认，请核对原评论');
      setMessage(receipt.message);setUncertain(receipt.state==='unknown');
      if(receipt.state==='confirmed'){
        data.acceptAction?.(account,result);
        if(command==='like'){
          setLiked(desiredLiked);
          if(typeof receipt.likeCount==='number'&&Number.isSafeInteger(receipt.likeCount)&&receipt.likeCount>=0){projection.current=undefined;setEstimate(undefined);setCount(receipt.likeCount);}
          else{
            const cached=latestRow.current.likeCount,nativeEstimate=receipt.likeCountEstimate,previous=projection.current;
            const projected=previous&&previous.liked!==desiredLiked&&previous.baseCount===cached?previous.count+(desiredLiked?1:-1):nativeEstimate;
            if(typeof projected==='number'&&Number.isSafeInteger(projected)&&projected>=0){projection.current={liked:desiredLiked,baseCount:cached,count:projected,at:Date.now()};setEstimate(projected);setMessage(receipt.message+'；约计数量为本次操作后的临时预估，等待官网核对');}
            else{projection.current=undefined;setEstimate(undefined);if(typeof cached==='number'&&Number.isSafeInteger(cached)&&cached>=0)setCount(cached);setMessage(receipt.message+'；点赞数量以下次官网同步为准');}
          }
        }
        else{if(result.records?.length)setPosted(previous=>[...previous,...result.records!.filter(r=>r.workId===row.workId).map(r=>({...r,accountId:account.id,accountNickname:account.nickname}))]);setDraft('');setReplying(false);setExpanded(true);}
      }
    }catch(e){if(alive.current){const text=e instanceof Error?e.message:'操作结果未确认，请核对原评论';setMessage(text);if(/未确认/.test(text))setUncertain(true);}}
    finally{busy.current=false;if(alive.current)setPending(false);}
  };
  const children = [...new Map([...posted,...childrenRows].map(r=>[r.platformId,r])).values()];
  const replies = Math.max(row.replyCount || 0, children.length);
  const replyEntry=data.entry(account,'comments'),activeReply=replyEntry?.pendingReply;
  const replyLoading=!replyEntry?.error&&activeReply?.workId===row.workId&&activeReply?.commentId===row.platformId;
  const expandReplies=()=>{
    const opening=!expanded;setExpanded(opening);
    if(opening&&children.length<replies&&!row.parentPlatformId&&!['complete','partial'].includes(row.repliesReadState||''))data.requestReplies?.(account,row);
  };
  return <div className="matrix-comment-thread"><article><InteractionAvatar row={row} account={account}/><div><strong>{row.author}</strong>{(!row.images?.length || !/^\[(?:图片|图片表情|表情)\]$/.test(row.content)) && <p><span title={row.imageReadHint||(/^\[(?:图片|图片表情|表情)\]$/.test(row.content)?'官网当前响应尚未提供可用附件地址，原评论已保留；重新同步该作品可补读':undefined)}><DouyinInlineText text={row.content}/></span></p>}{!row.images?.length&&/^\[(?:图片|图片表情|表情)\]$/.test(row.content)&&<small role="status">{row.imageReadHint||'图片表情附件地址尚未获取，原评论已保留'}</small>}{row.images?.map((image,i)=><CommentPicture key={i} urls={image.urls} row={row} account={account} imageIndex={i}/>)}<small>{row.accountNickname}{row.workTitle?' · '+row.workTitle:''}{row.parentPlatformId?' · 评论回复':''}{row.displayTime?' · '+new Date(row.displayTime).toLocaleString('zh-CN'):''}</small>
    <div className="matrix-comment-actions"><Button size="sm" variant="ghost" aria-pressed={liked} disabled={pending||uncertain} title={estimate!==undefined?'本次确认操作后的临时预估数量，等待官网精确计数':liked===undefined?'官网先核验再点赞；已经点赞不重复操作，无法核验则不执行':undefined} onClick={()=>void act('like')}>{liked===undefined?'核验并点赞':liked?'取消点赞':'点赞'}{estimate!==undefined?' · 约 '+estimate:count===undefined?'':' · '+count}</Button><Button size="sm" variant="ghost" disabled={pending||uncertain} onClick={()=>setReplying(v=>!v)}>回复</Button>{replies>0&&<Button size="sm" variant="ghost" aria-expanded={expanded} onClick={expandReplies}>{expanded?'收起回复':`展开回复（${children.length}/${replies}）`}</Button>}</div>
    {replying&&<form onSubmit={e=>{e.preventDefault();void act('reply');}}><textarea aria-label={'回复 '+row.author} maxLength={500} value={draft} disabled={pending||uncertain} onChange={e=>setDraft(e.target.value)} placeholder={'回复 '+row.author+'…'}/><Button type="submit" size="sm" disabled={pending||uncertain||!draft.trim()}>{pending?'提交中…':'发送回复'}</Button></form>}
    {message&&<p role="status">{message}</p>}{uncertain&&<Button type="button" variant="outline" size="sm" onClick={()=>{setUncertain(false);setMessage('请先核对官网结果，再执行新的操作');}}>已核对官网结果</Button>}
  </div></article>{expanded&&<div className="matrix-comment-children">{children.map(child=><CommentItem key={child.platformId} row={child} account={account} replyPausedReason={replyPausedReason}/>)}{children.length<replies&&<><small role="status">{replyLoading?'正在优先读取本条评论的回复，已有内容和断点保留':row.repliesReadState==='partial'?row.repliesReadReason||'官网回复列表已到末页，部分内容尚不能确认':row.repliesReadState==='complete'?`本轮可访问回复已到末页，当前筛选显示 ${children.length} 条`:replyPausedReason?'回复同步已暂停：'+replyPausedReason:`已缓存 ${children.length} 条回复，其余仍在后台同步，不会判定为没有回复。`}</small>{data.requestReplies&&!row.parentPlatformId&&row.repliesReadState!=='complete'&&<Button size="sm" variant="ghost" disabled={replyLoading} onClick={()=>data.requestReplies?.(account,row)}>{replyLoading?'回复读取中…':'继续读取本条回复'}</Button>}</>}</div>}</div>;
}

export function DouyinInteractionFeed({ kind, account, matches, commentView = 'aggregate', workId = '' }: { kind: DouyinKind; account?: PlatformAccount | null; matches?(id: string): boolean; commentView?: 'work' | 'aggregate'; workId?: string }) {
  const workspace = useOfficialWorkspace(), data = useDouyinInteractionData(kind);
  const accounts = workspace.accounts.filter(a => a.platform === 'douyin' && a.connectorSessionId && (!account || a.id === account.id) && (!matches || matches(a.id)));
  const singleWork = kind === 'comments' && commentView === 'work';
  const [syncRequest,setSyncRequest]=useState({account:'',sequence:0});
  const syncAccount=kind==='followers'?accounts.find(a=>a.id===(account?.id||syncRequest.account)):undefined;
  useEffect(() => { data.prioritize(account ?? null, singleWork ? workId : '', kind); return () => data.prioritize(undefined, '', kind); }, [account?.id, account?.connectorSessionId, account?.nativeAccountKey, workId, singleWork, kind, data.prioritize]);
  const viewScope = kind === 'comments' ? `comments.${commentView}` : kind;
  const accountScope = `${account?.id || 'all'}.${account?.connectorSessionId || ''}.${account?.nativeAccountKey || ''}`;
  const [query, setQuery] = useWorkspacePreference(`interaction.${viewScope}.douyin.${accountScope}.paged.query`, '', uiText);
  const [selectedFollower, setSelectedFollower] = useState('');
  const followerDetailId=useId();
  const followerTrigger=useRef<HTMLButtonElement|null>(null),followerClose=useRef<HTMLButtonElement|null>(null);
  const [profileBusy,setProfileBusy]=useState(false);
  const closeFollower=()=>{setSelectedFollower('');queueMicrotask(()=>{if(followerTrigger.current?.isConnected)followerTrigger.current.focus();});};
  const [page, setPage] = useWorkspacePreference(`interaction.${viewScope}.douyin.${accountScope}.${singleWork ? workId : 'all-works'}.paged.page`, 1, uiPage);
  const [projectRows] = useState(() => createInteractionProjection<DouyinInteractionRow>());
  const allRows = projectRows(JSON.stringify([getUser()?.id,getAuthToken()]),kind,accounts.map(a=>({accountId:a.id,accountNickname:a.nickname,sessionId:a.connectorSessionId,nativeKey:a.nativeAccountKey,rows:data.entry(a,kind)?.rows})));
  const accountRowCounts=useMemo(()=>{const counts=new Map<string,number>();for(const row of allRows)counts.set(row.accountId,(counts.get(row.accountId)||0)+1);return counts;},[allRows]);
  const selectedWork = singleWork && account ? data.entry(account, 'comments')?.works.find(w => w.platformId === workId) : undefined;
  // Management never widens an empty/unknown selection to all works. Aggregate
  // deliberately ignores both the saved management work ID and legacy filters.
  const rows = useMemo(()=>{
    const needle=query.toLowerCase();
    const filtered=!singleWork&&!needle?allRows:allRows.filter(r=>(!singleWork||!!account?.id&&!!selectedWork?.platformId&&r.workId===selectedWork.platformId)&&(!needle||[r.author,r.content,r.workTitle||''].join(' ').toLowerCase().includes(needle)));
    return kind==='comments'?newestInteractionsFirst(filtered):filtered;
  },[allRows,kind,singleWork,account?.id,selectedWork?.platformId,query]);
  const {rootRows,childrenByRoot}=useMemo(()=>{
    const childrenByRoot=new Map<string,CommentRow[]>();
    if(kind!=='comments')return {rootRows:rows,childrenByRoot};
    const rowIds=new Set(rows.map(r=>rowKey(r)));
    for(const row of rows)if(row.parentPlatformId){const id=rowKey(row,row.parentPlatformId),children=childrenByRoot.get(id)||[];children.push(row);childrenByRoot.set(id,children);}
    return {rootRows:rows.filter(r=>!r.parentPlatformId||!rowIds.has(rowKey(r,r.parentPlatformId))),childrenByRoot};
  },[rows,kind]);
  const pageCount = Math.max(1, Math.ceil(rootRows.length / 100)), currentPage = Math.min(page, pageCount), displayed = rootRows.slice((currentPage - 1) * 100, currentPage * 100);
  const follower = kind === 'followers' && selectedFollower ? rows.find(r => r.accountId + '/' + r.platformId === selectedFollower) : undefined;
  useEffect(()=>{setSelectedFollower('');setProfileBusy(false);},[accountScope,kind,query,currentPage]);
  useEffect(()=>{
    if(!follower)return;followerClose.current?.focus();
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();closeFollower();}};
    document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);
  },[follower?.accountId,follower?.platformId]);
  const detailText=(field:'signature'|'followTime')=>{
    if(!follower)return '';
    const value=field==='signature'?follower.content:follower.displayTime&&Number.isFinite(Date.parse(follower.displayTime))?new Date(follower.displayTime).toLocaleString('zh-CN'):undefined,state=follower.followerDetailState?.[field];
    if(value)return value+(state==='cached'?'（此前同步记录）':'');
    return state==='empty'?'当前名单明确返回空值':state==='invalid'?'字段格式尚未识别，未猜测内容':'当前同步记录未包含此字段，尚未获取';
  };
  const followerDetails=follower && <section id={followerDetailId} className="matrix-douyin-follower-detail" aria-label="抖音粉丝详情"><div className="flex items-center justify-between gap-2"><strong>{follower.author}</strong><Button ref={followerClose} variant="ghost" size="sm" aria-label="关闭粉丝详情" onClick={closeFollower}>关闭</Button></div><dl><dt>所属账号</dt><dd>{follower.accountNickname}</dd><dt>平台 UID</dt><dd>{follower.platformUserId}</dd><dt>简介</dt><dd>{detailText('signature')}</dd><dt>关注时间</dt><dd>{detailText('followTime')}</dd>{follower.firstObservedAt&&<><dt>本机首次记录（非关注时间）</dt><dd>{new Date(follower.firstObservedAt).toLocaleString('zh-CN')}</dd></>}</dl>{follower.authorProfileUrl && <Button variant="ghost" disabled={profileBusy} onClick={async()=>{if(profileBusy)return;setProfileBusy(true);try{await workspace.openDouyinProfile(follower.accountId,follower.authorProfileUrl!);}finally{setProfileBusy(false);}}}>{profileBusy?'正在打开账号内主页…':'查看官方主页'}</Button>}</section>;
  const accountById=new Map(accounts.map(account=>[account.id,account])),accountErrors=new Map<string,string|undefined>(),workErrors=new Map<string,string|undefined>();
  for(const bound of accounts){const entry=data.entry(bound,kind);accountErrors.set(bound.id,entry?.error);for(const work of entry?.works||[])if(work.readError)workErrors.set(bound.id+'/'+work.platformId,work.readError);}
  return <section className="matrix-live-interactions" aria-label={'抖音分页' + (kind === 'comments' ? '评论' : '粉丝')}>
    {syncAccount&&<DouyinFollowerControls key={[getUser()?.id,syncAccount.id,syncAccount.connectorSessionId,syncAccount.nativeAccountKey].join('/')} account={syncAccount} request={syncRequest.account===syncAccount.id?syncRequest.sequence:0} completed={data.entry(syncAccount,'followers')?.followerPanelSync?.status==='complete'}/>}
    <div className="matrix-interaction-toolbar" aria-label="账号获取状态">{accounts.map(a => {
      const e = data.entry(a, kind), reading = data.readings?.includes(douyinInteractionKey(a, kind)) || data.reading === douyinInteractionKey(a, kind);
      const siblingKey=douyinInteractionKey(a,kind==='comments'?'followers':'comments'),queued=!reading&&!!e&&e.nextAt<=Date.now()&&(data.readings?.includes(siblingKey)||data.reading===siblingKey);
      const failed = e?.works.filter(w => w.readError) || [];
      const visibleCount=accountRowCounts.get(a.id)||0;
      const label = workspace.jobsLocked ? '等待发布任务完成' : kind==='followers'&&e?.followerPanelSync?e.followerPanelSync.status==='complete'?'官网可访问名单已读完':e.followerPanelSync.status==='running'?'官网分页同步中':'官网分页已暂停':e?.error ? visibleCount && interactionStatus(e.error) === '获取失败' ? '部分获取' : interactionStatus(e.error) : e?.progress?.catalogReadError ? '部分获取' : e?.waitingForAccount&&!reading||queued?'等待账号空闲':kind==='followers'&&e?.followerPending?reading?'检查官网名单':'等待官网名单':reading || !e ? '获取中' : failed.length ? '部分获取' : kind==='followers'&&e.complete&&!e.followerRosterVerified?'部分获取':visibleCount ? e.complete ? '已同步' : '同步中' : e.complete ? kind === 'comments' ? e.works.length ? '暂无评论' : '暂无作品' : '暂无粉丝' : '获取中';
      return <small key={a.id} role="status" aria-label={a.nickname + (kind === 'comments' ? '评论' : '粉丝') + '获取状态'} title={e?.error || e?.progress?.catalogReadError || (failed.length ? `${failed.length}个作品无法读取：${failed[0].readError}；其他可访问作品继续同步` : e?.phase || label)}>{a.nickname} · {label}{visibleCount ? ' · ' + visibleCount + '条' : ''}{e?.error&&interactionStatus(e.error)==='需要验证' && <> · <a href="#/accounts">到账号管理完成验证</a></>}<Button size="sm" variant="ghost" disabled={workspace.jobsLocked||kind==='comments'&&e?.phase==='已请求刷新，已有缓存保留'} onClick={()=>kind==='followers'?setSyncRequest(previous=>({account:a.id,sequence:previous.sequence+1})):data.refresh(a,kind)}>{e?.error&&interactionStatus(e.error)==='需要验证'?'验证后重试':kind==='followers'?'刷新粉丝':'刷新评论'}</Button></small>;
    })}</div>
    {workspace.accountError && <p role="alert">{workspace.accountError}</p>}
    {singleWork && selectedWork && <header className="matrix-interaction-toolbar" aria-label="当前作品"><strong>{selectedWork.title || '作品 ' + selectedWork.platformId}</strong><a href={`https://creator.douyin.com/creator-micro/work-management/work-detail/${selectedWork.platformId}`} target="_blank" rel="noreferrer">查看官方作品</a><small title={selectedWork.readError}>{selectedWork.readError ? '该作品获取失败，缓存评论保留' : selectedWork.readComplete ? '本轮可访问评论已同步' : '正在同步该作品评论'}</small></header>}
    {(!singleWork || selectedWork) && (allRows.length > 0 || selectedWork) && <div className="matrix-interaction-toolbar"><Input aria-label="搜索抖音分页结果" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder={kind === 'comments' ? singleWork ? '搜索该作品的昵称或评论' : '搜索全部作品的昵称、评论或标题' : '搜索粉丝昵称'} /><small>{singleWork ? '该作品' : kind === 'comments' ? '全部作品' : ''} {rows.length} 条已缓存记录</small></div>}
    <div className="matrix-live-records" aria-label="抖音已同步互动记录">{displayed.map(row => {const bound=accountById.get(row.accountId)!,expanded=selectedFollower===row.accountId+'/'+row.platformId;return kind==='comments'?<CommentItem key={[row.accountId,bound.connectorSessionId,bound.nativeAccountKey,row.workId,row.platformId].join('/')} row={row} account={bound} childrenRows={childrenByRoot.get(rowKey(row))||[]} replyPausedReason={accountErrors.get(row.accountId)||workErrors.get(row.accountId+'/'+row.workId)}/>:<article key={row.accountId + '/' + row.platformId}><InteractionAvatar row={row} account={bound} kind="followers"/><div className="matrix-follower-row-content"><header><button type="button" aria-expanded={expanded} aria-controls={expanded?followerDetailId:undefined} onClick={event => {followerTrigger.current=event.currentTarget;const id=row.accountId+'/'+row.platformId;if(expanded)closeFollower();else{setProfileBusy(false);setSelectedFollower(id);}}}><strong>{row.author}</strong></button></header>{row.content && <p>{row.content}</p>}<small>{row.accountNickname}{row.displayTime ? ' · ' + new Date(row.displayTime).toLocaleString('zh-CN') : ''}</small>{expanded&&followerDetails}</div></article>;})}</div>
    {!rows.length && <InteractionEmpty>{singleWork ? !account ? '请先选择账号，再选择作品查看评论' : !workId ? '请选择左侧作品查看评论' : !selectedWork ? '当前作品尚未读取或已不可访问，不会显示其他作品的评论' : selectedWork.readError ? '该作品评论获取失败，已有缓存保留，原因可悬停作品状态查看' : query ? '该作品没有符合搜索的已缓存评论' : selectedWork.readComplete ? '该作品暂无可访问的评论' : '正在同步该作品评论，尚不能判断为零评论' : accounts.some(a => data.entry(a, kind)?.error || data.entry(a, kind)?.works.some(w => w.readError)) ? '部分数据未能获取，原因可悬停账号状态查看。' : allRows.length ? '没有符合筛选的记录' : accounts.every(a => data.entry(a, kind)?.complete) ? '暂无记录' : '正在获取…'}</InteractionEmpty>}
    {pageCount > 1 && <footer className="matrix-interaction-actionbar"><Button variant="outline" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>上一页</Button><span>第 {currentPage}/{pageCount} 页</span><Button variant="outline" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>下一页</Button></footer>}
  </section>;
}
