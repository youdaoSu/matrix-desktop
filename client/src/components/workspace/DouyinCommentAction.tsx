import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useOfficialWorkspace } from './OfficialWorkspace';

export function DouyinCommentAction({ accountId, author, authorProfileUrl, comment }: { accountId: string; author: string; authorProfileUrl: string; comment: string }) {
  const workspace = useOfficialWorkspace();
  const [open,setOpen] = useState(false), [busy,setBusy] = useState(false), [message,setMessage] = useState('');
  const [body,setBody] = useState(''), [success,setSuccess] = useState('发了'), [failure,setFailure] = useState('关注，看私信哈');
  const [receipt,setReceipt] = useState<(MatrixPageActionReceipt & { followCleanup?: string; messageStatus?: string; replyStatus?: string })>();
  const execute = async (cleanup = false) => {
    setBusy(true); setMessage('');
    try {
      const page = workspace.page(accountId);
      if (!page || !window.matrixDesktop?.douyinCommentWorkflow) throw Error('请先打开本账号的原视频评论页');
      const result = await window.matrixDesktop.douyinCommentWorkflow({ ...page(), ...(cleanup ? { operation:'cleanup' as const, recordId:receipt?.id } : { author,authorProfileUrl,comment,message:body,successReply:success,failedReply:failure }) });
      if (result.receipt) setReceipt(result.receipt);
      if (result.error) throw Error(result.error);
      if (result.cancelled) setMessage('已取消，本次未执行');
      else setMessage(result.receipt?.message || '请核对官方页面');
      window.dispatchEvent(new Event('matrix:page-actions-updated'));
    } catch(error) { setMessage(error instanceof Error ? error.message : '处理失败，请核对'); }
    finally { setBusy(false); }
  };
  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}>发送资料并回复 · 结束取消关注</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent><DialogHeader><DialogTitle>处理 {author} 的这条评论</DialogTitle><DialogDescription>原评论：{comment}。临时关注并发送一条私信，按官方显示结果回复，结束时取消关注。结果不明确时保留待核对记录。</DialogDescription></DialogHeader>
      <label className="space-y-1 text-sm">指定私信<Textarea aria-label="评论资料私信正文" value={body} maxLength={2000} onChange={e=>setBody(e.target.value)} disabled={busy}/></label>
      <label className="space-y-1 text-sm">发送成功后的回复<Textarea value={success} maxLength={2000} onChange={e=>setSuccess(e.target.value)} disabled={busy}/></label>
      <label className="space-y-1 text-sm">官方显示发送失败后的回复<Textarea value={failure} maxLength={2000} onChange={e=>setFailure(e.target.value)} disabled={busy}/></label>
      <Button disabled={busy||!body.trim()||!success.trim()||!failure.trim()} onClick={()=>void execute()}>{busy?'正在处理，请留意官方验证':'核对并执行这一次'}</Button>
      {message&&<p role="status">{message}</p>}
      {receipt&&<p className="text-xs text-muted-foreground">私信：{receipt.messageStatus||receipt.status} · 回复：{receipt.replyStatus||'待核对'} · 取消关注：{receipt.followCleanup==='confirmed'?'已确认':'待处理'}</p>}
      {receipt?.followCleanup==='pending'&&<Button variant="destructive" disabled={busy} onClick={()=>void execute(true)}>恢复取消关注</Button>}
    </DialogContent></Dialog>
  </>;
}
