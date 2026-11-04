import { useEffect, useRef, useState } from 'react';
import { getAuthToken, getUser } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CommentBatch, CommentCommand, SingleCommentSource, SingleCommentState } from '@shared/one-click-comments';
import { platformLabels } from './OfficialWorkspace';
import { boundedAccountCheck } from './async-account-checks';

const labels: Record<string,string> = {queued:'尚未发送',sending:'正在发送',sent:'评论已发送',failed:'未发送成功',unknown:'结果待核对',skipped:'已有提交记录，未重复发送',cancelled:'已取消'};
export function SingleWorkCommentEntry({ source, title, locked = false }: { source: SingleCommentSource | null; title?: string; locked?: boolean }) {
  const [open,setOpen]=useState(false);
  return <div className="matrix-interaction-actionbar" aria-label="当前作品操作">
    <Button variant="outline" disabled={locked||!source||!window.matrixDesktop?.oneClickComments} onClick={()=>setOpen(true)}>一键评论</Button>
    <span>{title|| (source?.kind==='receipt'?'已选择原发布任务中的作品':'请先选择有准确编号的作品')}</span>
    {open&&source&&<Dialog open onOpenChange={setOpen}><DialogContent className="matrix-one-click-dialog"><DialogHeader><DialogTitle>评论当前作品</DialogTitle><DialogDescription>使用作品所属账号发送一条评论，先核对作品和正文，再确认发送。</DialogDescription></DialogHeader><SingleCommentForm source={source} locked={locked}/></DialogContent></Dialog>}
  </div>;
}
export function SingleCommentForm({source,locked=false}:{source:SingleCommentSource;locked?:boolean}){
  const [state,setState]=useState<SingleCommentState>(),[text,setText]=useState(''),[preview,setPreview]=useState<CommentBatch>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const live=useRef(true),flight=useRef(false),revision=useRef(0),auth=useRef({owner:getUser()?.id,token:getAuthToken()});
  const current=()=>live.current&&auth.current.owner===getUser()?.id&&auth.current.token===getAuthToken();
  const call=async(command:CommentCommand,args:unknown)=>{if(!current()||!auth.current.token||!window.matrixDesktop?.oneClickComments)throw Error('请在新版远效桌面端登录后操作');const response=await window.matrixDesktop.oneClickComments({accessToken:auth.current.token,command,args});if(!current())throw Error('登录已变化，旧结果不再显示');if(response.error)throw Error(response.error);return response.result;};
  const refresh=async()=>{if(flight.current)return;flight.current=true;const version=revision.current;try{const result=await call('single-state',{source}) as SingleCommentState;if(current()&&version===revision.current){setState(result);setError('');}}catch(e){if(current()&&version===revision.current)setError((e as Error).message);}finally{flight.current=false;}};
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
  const running=state?.batches.some(b=>['running','stopping'].includes(b.status));
  useEffect(()=>{if(!running)return;const timer=setInterval(()=>{if(!document.hidden)void refresh();},2000);return()=>clearInterval(timer);},[running]);
  const valid=preview&&preview.rows[0]?.text===text.trim()?state?.batches.find(b=>b.id===preview.id)||preview:undefined;
  return <div className="matrix-one-click-body">
    {error&&<p role="alert" className="text-destructive">{error}</p>}
    {error&&!state&&source.kind==='receipt'&&<Button variant="outline" disabled={busy||locked} onClick={()=>void recoverSource()}>{busy?'正在读取作品编号…':'重新读取作品编号（不发送）'}</Button>}
    {state?<><p><strong>{state.target.title||state.target.workId}</strong></p><p>发送账号：{state.target.accountName} · {platformLabels[state.target.platform as keyof typeof platformLabels]||state.target.platform}</p><p className="text-xs text-muted-foreground">作品编号：{state.target.workId}</p>
      <label className="block">本条评论<textarea className="mt-2 min-h-28 w-full rounded-md border bg-background p-3" aria-label="本条作品评论" maxLength={500} value={text} disabled={busy||locked||running} onChange={e=>{setText(e.target.value);setPreview(undefined);}}/></label><small>{text.length}/500</small>
      <div className="matrix-one-click-toolbar"><Button disabled={busy||locked||!!running||!text.trim()||!!valid} onClick={()=>{void run('single-preview',{source,text}).then(result=>{if(current()&&result)setPreview(result as CommentBatch);});}}>预览评论</Button></div>
      {valid&&<section aria-label="本条评论预览"><h3>确认本条评论</h3><p>{valid.rows[0].accountName} → {valid.title}</p><p className="whitespace-pre-wrap">{valid.rows[0].text}</p><p>{valid.rows[0].detail}</p><Button disabled={busy||locked||state.running||valid.rows[0].status!=='queued'||!['preview','paused'].includes(valid.status)} onClick={()=>{void run('single-start',{id:valid.id}).then(result=>{if(current()&&result)setPreview(undefined);});}}>确认发送这条评论</Button><Button variant="ghost" disabled={busy||locked} onClick={()=>{void run('single-cancel',{id:valid.id}).then(()=>{if(current())setPreview(undefined);});}}>取消本条预览</Button></section>}
      <section><div className="matrix-one-click-toolbar"><h3>本作品评论记录</h3><Button variant="ghost" disabled={busy} onClick={()=>void refresh()}>刷新结果</Button></div>{state.batches.filter(b=>b.id!==valid?.id).map(b=><article className="rounded border p-3 mb-2" key={b.id}><strong>{labels[b.rows[0]?.status]||'待核对'}</strong><p className="whitespace-pre-wrap">{b.rows[0]?.text}</p><small>{b.rows[0]?.detail}{b.rows[0]?.commentId?` · 评论 ID ${b.rows[0].commentId}`:''}</small></article>)}{!state.batches.length&&<p>暂无本作品的单条评论记录。</p>}</section>
      <p className="text-xs text-muted-foreground">结果未确认时保留原记录，不自动重发。关闭窗口不会撤回已确认的发送。</p>
    </>:!error&&<p role="status">正在核对当前账号和作品…</p>}
  </div>;
}
