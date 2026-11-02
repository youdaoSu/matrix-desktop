import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import type { PublishJob } from './publish-queue';

export function PublishFollowupEditor({ job, close, submit }: { job: PublishJob; close(): void; submit(comment: string, pin: boolean): void }) {
  const [comment, setComment] = useState(job.config?.comment || ''), [pin, setPin] = useState(job.config?.pinComment === true);
  return <Dialog open onOpenChange={value => { if (!value) close(); }}><DialogContent><DialogHeader><DialogTitle>为原作品设置追评</DialogTitle><DialogDescription>{job.nickname} · {job.title}。只处理这条成功记录的追评，不重新发布作品。未取得准确作品ID、本人ID或评论ID时停止；评论和置顶分别记录结果。</DialogDescription></DialogHeader><Textarea aria-label="原作品追评正文" value={comment} maxLength={2000} onChange={event => setComment(event.target.value)} placeholder="输入要发表在这条原作品下的评论" /><label className="flex gap-2 items-center text-sm"><input type="checkbox" aria-label="原作品追评置顶" checked={pin} onChange={event => setPin(event.target.checked)} />置顶本条追评</label><div className="flex justify-end gap-2"><Button variant="outline" onClick={close}>取消</Button><Button disabled={!comment.trim()} onClick={() => submit(comment.trim(), pin)}>{pin ? '发表追评并置顶' : '发表追评'}</Button></div></DialogContent></Dialog>;
}
