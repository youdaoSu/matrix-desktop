import { useEffect, useRef, useState } from 'react';
import { getAuthToken, getUser } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CommentBatch, CommentCommand, CommentRow, CommentSet, CommentSnapshot, SingleCommentSource, SingleCommentState } from '@shared/one-click-comments';
import { OneClickComments } from './OneClickComments';
import { platformLabels, useOfficialWorkspace } from './OfficialWorkspace';
import { boundedAccountCheck } from './async-account-checks';
import { useInteractionAccountCheck, AccountCheckNotice } from './InteractionAccountGate';

const labels: Record<string,string> = {queued:'尚未发送',sending:'正在发送',sent:'评论已发送',failed:'未发送成功',unknown:'结果待核对',skipped:'已有提交记录，未重复发送',cancelled:'已取消'};
const resultLabel=(b:CommentBatch)=>{
  const r=b.rows[0];
  if(r?.commentId&&['sent','unknown'].includes(r.status))return r.visibility?.state==='author-visible'?'作者可见，已核对':r.visibility?.state==='not-observed'?'已提交，作者视角暂未读到':'已提交，作者可见性未核对';
  return labels[r?.status]||'待核对';
};
function ReviewTiming({row}:{row:CommentRow}){
  const time=(at:number)=>new Date(at).toLocaleTimeString('zh-CN');
  const progress=row.reviewProgress;
  const checkedAt=row.visibility?.checkedAt;
  return <div className="text-xs text-muted-foreground">
    {checkedAt&&<span>上次核对 {time(checkedAt)}。 </span>}
    {progress&&(progress.nextAt?<span>后台自动复核 {progress.attempts}/3，{progress.nextAt<=Date.now()?'等待账号空闲':`预计 ${time(progress.nextAt)}`}。</span>:<span>已到本轮三次自动复核上限。</span>)}
  </div>;
}
export function SingleWorkCommentEntry({source,title,locked=false,autoOpen=false,onAutoOpen}:{source:SingleCommentSource|null;title?:string;locked?:boolean;autoOpen?:boolean;onAutoOpen?():void}){
  const [open,setOpen]=useState(false);
  const ready=!!source&&!!window.matrixDesktop?.oneClickComments&&!locked;
  useEffect(()=>{
    if(autoOpen&&ready){setOpen(true);onAutoOpen?.();}
  },[autoOpen,ready,onAutoOpen]);
  return <div className="matrix-interaction-actionbar" aria-label="当前作品操作">
    <Button variant="outline" disabled={!ready} onClick={()=>setOpen(true)}>一键评论</Button>
    <span>{title|| (source?.kind==='receipt'?'已选择原发布任务中的作品':'请先选择有准确编号的作品')}</span>
    {open&&source&&<Dialog open onOpenChange={setOpen}><DialogContent className="matrix-one-click-dialog"><DialogHeader><DialogTitle>评论当前作品</DialogTitle><DialogDescription>可选一个账号发送单条，或从评论集为多个同平台账号随机分配正文。核对预览后再确认发送。</DialogDescription></DialogHeader><SingleCommentForm source={source} locked={locked}/></DialogContent></Dialog>}
  </div>;
}
export function SingleCommentForm({source,locked=false}:{source:SingleCommentSource;locked?:boolean}){
  const workspace=useOfficialWorkspace();
  const [state,setState]=useState<SingleCommentState>(),[text,setText]=useState(''),[preview,setPreview]=useState<CommentBatch>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [senderChoice,setSenderChoice]=useState<{id:string;binding:string}|null>(null);
  const [batchOpen,setBatchOpen]=useState(false);
  const [sets,setSets]=useState<CommentSet[]>([]),[setId,setSetId]=useState(''),[candidate,setCandidate]=useState(''),[setsLoaded,setSetsLoaded]=useState(false),[manageSets,setManageSets]=useState(false);
  const live=useRef(true),flight=useRef(false),revision=useRef(0),auth=useRef({owner:getUser()?.id,token:getAuthToken()});
  const current=()=>live.current&&auth.current.owner===getUser()?.id&&auth.current.token===getAuthToken();
  const call=async(command:CommentCommand,args:unknown)=>{if(!current()||!auth.current.token||!window.matrixDesktop?.oneClickComments)throw Error('请在新版远效桌面端登录后操作');const response=await window.matrixDesktop.oneClickComments({accessToken:auth.current.token,command,args});if(!current())throw Error('登录已变化，旧结果不再显示');if(response.error)throw Error(response.error);return response.result;};
  const refresh=async()=>{if(flight.current)return;flight.current=true;const version=revision.current;try{const result=await call('single-state',{source}) as SingleCommentState;if(current()&&version===revision.current){setState(result);setError('');}}catch(e){if(current()&&version===revision.current)setError((e as Error).message);}finally{flight.current=false;}};
  const loadSets=async()=>{
    if(flight.current||locked)return;flight.current=true;setBusy(true);
    try{const result=await call('snapshot',{}) as CommentSnapshot;if(current()){setSets(result.sets);setSetId('');setCandidate('');setSetsLoaded(true);setError('');}}
    catch(e){if(current())setError((e as Error).message);}finally{flight.current=false;if(current())setBusy(false);}
  };
  const recoverSource=async()=>{
    if(flight.current||locked||source.kind!=='receipt'||!current())return;
    flight.current=true;setBusy(true);revision.current++;
    try{
      const api=window.matrixDesktop,token=auth.current.token;
      if(!api?.collectPublishReference||!token)throw Error('请使用新版远效桌面版核对作品');
      const result=await boundedAccountCheck(()=>api.collectPublishReference({accessToken:token,receiptId:source.receiptId}));
      if(!current())return;
      if(result.error)throw Error(result.error);
      if(result.receipt?.id!==source.receiptId||result.receipt.accountId!==source.accountId||result.receipt.kind!=='publish')throw Error('返回的作品不属于原任务，未采用');
      window.dispatchEvent(new Event('matrix:page-actions-updated'));
      const next=await call('single-state',{source}) as SingleCommentState;
      if(current()){setState(next);setError('');}
    }catch(e){if(current())setError((e as Error).message);}finally{flight.current=false;if(current())setBusy(false);}
  };
  const run=async(command:CommentCommand,args:unknown)=>{if(flight.current||locked)return;flight.current=true;setBusy(true);revision.current++;try{
    const result=await call(command,args);
    // Retain the acknowledged operation even if the subsequent read fails.
    // A running row keeps bounded polling active and cannot be submitted again.
    if(current()&&result&&typeof result==='object'&&'rows'in result){const batch=result as CommentBatch;setState(previous=>previous?{...previous,batches:[batch,...previous.batches.filter(b=>b.id!==batch.id)]}:previous);}
    try{const next=await call('single-state',{source}) as SingleCommentState;if(current()){setState(next);setError('');}}catch(e){if(current())setError((e as Error).message);}
    return result;
  }catch(e){if(current())setError((e as Error).message);}finally{flight.current=false;if(current())setBusy(false);}};
  useEffect(()=>{live.current=true;void refresh();return()=>{live.current=false;revision.current++;};},[]);
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>;
    const updated=()=>{
      clearTimeout(timer);
      if(!current())return;
      if(flight.current)timer=setTimeout(updated,500);
      else void refresh();
    };
    window.addEventListener('matrix:comment-review-updated',updated);
    return ()=>{clearTimeout(timer);window.removeEventListener('matrix:comment-review-updated',updated);};
  },[]);
  const running=state?.batches.some(b=>['running','stopping'].includes(b.status));
  useEffect(()=>{if(!running)return;const timer=setInterval(()=>{if(!document.hidden)void refresh();},2000);return()=>clearInterval(timer);},[running]);
  const primary=workspace.accounts.find(a=>a.id===source.accountId);
  const senderBinding=(a:typeof workspace.accounts[number])=>JSON.stringify([a.id,a.platform,a.connectorSessionId,a.nativeAccountKey]);
  const eligible=state&&primary?.nativeAccountKey&&primary.connectorSessionId?workspace.accounts.filter(a=>a.id!==source.accountId&&a.platform===state.target.platform&&!!a.connectorSessionId&&!!a.nativeAccountKey&&a.nativeAccountKey!==primary.nativeAccountKey&&a.connectorSessionId!==primary.connectorSessionId):[];
  const sender=eligible.find(a=>a.id===senderChoice?.id&&senderBinding(a)===senderChoice.binding);
  const senderCheck=useInteractionAccountCheck(sender);
  const context=JSON.stringify([source,sender?senderBinding(sender):null,text.trim()]),latestContext=useRef(context),previewContext=useRef('');latestContext.current=context;
  useEffect(()=>{if(senderChoice&&!sender){setSenderChoice(null);setPreview(undefined);}},[senderChoice,sender]);
  const valid=senderCheck.normal&&sender&&preview&&previewContext.current===context&&preview.rows[0]?.accountId===sender.id&&preview.rows[0]?.text===text.trim()?state?.batches.find(b=>b.id===preview.id)||preview:undefined;
  return <div className="matrix-one-click-body">
    {error&&<p role="alert" className="text-destructive">{error}</p>}
    {error&&!state&&source.kind==='receipt'&&<Button variant="outline" disabled={busy||locked} onClick={()=>void recoverSource()}>{busy?'正在读取作品编号…':'重新读取作品编号（不发送）'}</Button>}
    {state?<><p><strong>{state.target.title||state.target.workId}</strong></p><p>作品账号：{state.target.accountName} · {platformLabels[state.target.platform as keyof typeof platformLabels]||state.target.platform}</p><p className="text-xs text-muted-foreground">作品编号：{state.target.workId}</p>
      <Button variant="outline" disabled={busy||locked} onClick={()=>setBatchOpen(true)}>批量随机评论</Button>
      {batchOpen&&<OneClickComments batchTarget={{source,target:state.target,locked}} close={()=>setBatchOpen(false)}/>}
      <label className="block">发送账号<select className="mt-2 block w-full" aria-label="选择发送账号" value={sender?.id||''} disabled={busy||locked||running||state.running} onChange={e=>{const account=eligible.find(a=>a.id===e.target.value);setSenderChoice(account?{id:account.id,binding:senderBinding(account)}:null);setPreview(undefined);}}><option value="">请选择一个发送账号</option>{eligible.map(a=><option key={a.id} value={a.id}>{a.nickname||a.id} · {platformLabels[a.platform]} · 远效 ID {a.id.slice(0,8)}</option>)}</select></label>
      {!eligible.length&&<p role="status">{workspace.loadingAccounts?'正在读取已绑定账号…':workspace.accountError?'账号列表读取失败，请在账号管理核对后重试。':'暂无其他已绑定的同平台账号，请到账号管理添加或核对绑定。'}</p>}
      {sender&&<p>本次发送：{sender.nickname||sender.id} · {platformLabels[sender.platform]} · 远效 ID {sender.id.slice(0,8)}</p>}
      {sender&&<AccountCheckNotice check={senderCheck}/>}
      {senderCheck.normal&&<><section aria-label="评论集候选"><div className="matrix-one-click-toolbar"><Button variant="outline" disabled={busy||locked||running} onClick={()=>void loadSets()}>{setsLoaded?'刷新评论集':'从评论集选择'}</Button><Button variant="ghost" disabled={busy||locked||running} onClick={()=>setManageSets(true)}>管理评论集</Button></div>
        {setsLoaded&&<><select aria-label="选择候选评论集" value={setId} disabled={busy||locked||running} onChange={e=>{setSetId(e.target.value);setCandidate('');}}><option value="">选择评论集</option>{sets.map(s=><option key={s.id} value={s.id}>{s.name}（{s.comments.length}条）</option>)}</select>{!sets.length&&<p>暂无评论集，可通过“管理评论集”新建。</p>}{setId&&<select aria-label="选择候选评论" value={candidate} disabled={busy||locked||running} onChange={e=>setCandidate(e.target.value)}><option value="">选择一条正文</option>{sets.find(s=>s.id===setId)?.comments.map((comment,i)=><option key={i} value={String(i)}>{comment}</option>)}</select>}<Button variant="outline" disabled={busy||locked||running||candidate===''||!sets.find(s=>s.id===setId)?.comments[Number(candidate)]} onClick={()=>{const value=sets.find(s=>s.id===setId)?.comments[Number(candidate)];if(value){setText(value);setPreview(undefined);}}}>填入正文</Button><small>填入后可以修改；发送前仍需预览并确认这一条。</small></>}
      </section>
      {manageSets&&<OneClickComments close={()=>{setManageSets(false);setSetsLoaded(false);setSets([]);setSetId('');setCandidate('');}}/>}
      <label className="block">本条评论<textarea className="mt-2 min-h-28 w-full rounded-md border bg-background p-3" aria-label="本条作品评论" maxLength={500} value={text} disabled={busy||locked||running} onChange={e=>{setText(e.target.value);setPreview(undefined);}}/></label><small>{text.length}/500</small>
      <div className="matrix-one-click-toolbar"><Button disabled={busy||locked||!!running||!sender||!text.trim()||!!valid} onClick={()=>{if(!sender)return;const captured=context;void run('single-preview',{source,text,senderAccountId:sender.id}).then(result=>{if(current()&&result&&latestContext.current===captured){previewContext.current=captured;setPreview(result as CommentBatch);}});}}>预览评论</Button></div>
      {valid&&<section aria-label="本条评论预览"><h3>确认本条评论</h3><p>{valid.rows[0].accountName} · {platformLabels[state.target.platform as keyof typeof platformLabels]} · 远效 ID {valid.rows[0].accountId.slice(0,8)} → {valid.title}</p><p className="whitespace-pre-wrap">{valid.rows[0].text}</p><p>{valid.rows[0].detail}</p><Button disabled={busy||locked||state.running||valid.rows[0].status!=='queued'||!['preview','paused'].includes(valid.status)} onClick={()=>{void run('single-start',{id:valid.id}).then(result=>{if(current()&&result)setPreview(undefined);});}}>确认发送这条评论</Button><Button variant="ghost" disabled={busy||locked} onClick={()=>{void run('single-cancel',{id:valid.id}).then(()=>{if(current())setPreview(undefined);});}}>取消本条预览</Button></section>}
      </>}
      <section><div className="matrix-one-click-toolbar"><h3>本作品评论记录</h3><Button variant="ghost" disabled={busy} onClick={()=>void refresh()}>刷新结果</Button></div>{state.batches.filter(b=>b.id!==valid?.id).map(b=><article className="rounded border p-3 mb-2" key={b.id}><strong>{b.rows[0]?.accountName} · {resultLabel(b)}</strong><p className="whitespace-pre-wrap">{b.rows[0]?.text}</p><small>{b.rows[0]?.status==='sent'&&!b.rows[0]?.visibility?'旧记录仅核对发送页回显，尚未核对作者可见性':b.rows[0]?.detail}{b.rows[0]?.commentId?` · 评论 ID ${b.rows[0].commentId}`:''}</small>{b.rows[0]&&<ReviewTiming row={b.rows[0]}/>}{b.rows[0]?.commentId&&['sent','unknown'].includes(b.rows[0].status)&&<div><Button variant="outline" disabled={busy||locked||state.running} onClick={()=>void run('single-recheck',{id:b.id})}>{busy?'正在只读复核…':'复核作者可见性'}</Button></div>}</article>)}{!state.batches.length&&<p>暂无本作品的单条评论记录。</p>}</section>
      <p className="text-xs text-muted-foreground">已提交且有评论 ID 的记录会在后台自动复核，最多三次。可切换页面，稍后回来看结果。</p>
    </>:!error&&<p role="status">正在核对当前账号和作品…</p>}
  </div>;
}
