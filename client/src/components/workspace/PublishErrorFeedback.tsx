import { useRef, useState } from 'react';
import { axiosForBackend, getAuthToken, getUser } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { sanitizePublishErrorReport, type PublishErrorReport } from '@shared/publish-error-report';
import type { PublishJob } from './publish-queue';
import { getPublishExecutionStage } from './publish-execution-stage';
import { toast } from 'sonner';
export function buildPublishErrorReport(job: PublishJob, version = 'unknown'): PublishErrorReport {
  const excluded = [job.title,job.nickname,job.config?.title,job.config?.body,job.config?.comment,...job.files,...(job.config?.topics || []),...(job.config?.covers || []).map(cover=>cover.name)].filter((value):value is string=>typeof value==='string' && value.length>=2).sort((a,b)=>b.length-a.length);
  const message = (value: string) => excluded.reduce((text,secret)=>text.split(secret).join('[作品或账号内容已移除]'),value);
  const relatedOperations:NonNullable<PublishErrorReport['relatedOperations']>=[];
  if(job.followup&&['failed','save_failed','unknown'].includes(job.followup.status))relatedOperations.push({operation:'followup',status:job.followup.status,message:message(job.followup.message)});
  if(job.followup?.pinResult&&job.followup.pinResult.status!=='confirmed'&&job.followup.pinResult.status!=='cancelled')relatedOperations.push({operation:'pin',status:job.followup.pinResult.status,message:message(job.followup.pinResult.message)});
  return sanitizePublishErrorReport({ schemaVersion: 1, reportId: crypto.randomUUID(), taskId: job.id, attempt: job.attemptNumber || 1,
    platform: job.platform, version, stage: job.stage, executionStage: getPublishExecutionStage(job), submission: job.submission || 'unknown',
    error: job.stage==='confirmed'&&relatedOperations.length?relatedOperations.map(item=>`${item.operation==='pin'?'置顶':'追评'}：${item.message}`).join('；'):message(job.message),relatedOperations,
    updatedAt: job.updatedAt, history: job.history.filter(item => !job.lastAttemptAt || item.at >= job.lastAttemptAt).slice(-20).map(item => ({at:item.at,stage:item.executionStage || item.stage,message:message(item.message)})),
    verification: job.verification ? {state:job.verification.state,message:message(job.verification.message),checkedAt:job.verification.checkedAt} : undefined,
  });
}
export function PublishErrorFeedback({ job }: { job: PublishJob }) {
  const [report, setReport] = useState<PublishErrorReport>(), [sending, setSending] = useState(false), [result, setResult] = useState('');
  const preparing = useRef(false), pending = useRef(false);
  const reportOwner = useRef<{ token: string | null; id?: string } | undefined>(undefined);
  if (!['failed','attention','unknown','interrupted'].includes(job.stage)&&!['failed','save_failed','unknown'].includes(job.followup?.status||'')&&!['failed','unknown'].includes(job.followup?.pinResult?.status||'')) return null;
  const prepare = async (send: boolean) => {
    if (preparing.current) return;preparing.current = true;
    const token = getAuthToken(), owner = getUser()?.id;
    try {
      const info = await window.matrixDesktop?.systemSettings?.({ command: 'read' }).catch(() => undefined);
      if (getAuthToken() !== token || getUser()?.id !== owner) return;
      const next = buildPublishErrorReport(job, info?.version);
      if (send) { reportOwner.current={token,id:owner};setResult('');setReport(next); }
      else { const url = URL.createObjectURL(new Blob([JSON.stringify(next,null,2)],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`YuanXiao-error-${job.id.slice(0,8)}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
    } catch { toast.error('错误报告生成失败，原任务未改动'); } finally { preparing.current = false; }
  };
  const submit = async () => {
    if (!report || pending.current) return;pending.current = true;setSending(true);setResult('');
    const token = getAuthToken(), owner = getUser()?.id;
    try {
      if(!token || !owner || reportOwner.current?.token!==token || reportOwner.current?.id!==owner)throw Error('登录用户已变化，请关闭后重新生成报告');
      const response = await axiosForBackend.post('/api/feedback/publish-errors', { report }, { timeout: 15000 });
      if (getAuthToken() !== token || getUser()?.id !== owner) return;
      const data = response.data?.data;
      if (!data?.accepted || data.reportId !== report.reportId) throw Error('后端未确认接收，请重试或导出报告');
      setResult(`${data.delivery === 'tunnel' ? '开发者反馈后端已接收' : '当前后端已接收（本机后台，不代表远程已送达）'}，回执：${data.id}`);
    } catch (error: any) { if (getAuthToken() === token && getUser()?.id === owner) setResult(error?.response?.data?.message || error?.response?.data?.error?.message || error?.message || '反馈未送达，请重试或导出报告'); }
    finally { pending.current = false;setSending(false); }
  };
  return <>
    <Button size="sm" variant="outline" onClick={() => void prepare(false)}>导出错误报告</Button>
    <Button size="sm" variant="outline" onClick={() => void prepare(true)}>反馈开发者</Button>
    <Dialog open={!!report} onOpenChange={open => { if(!open && !pending.current) setReport(undefined); }}><DialogContent><DialogHeader><DialogTitle>反馈发布错误</DialogTitle><DialogDescription>仅发送下方脱敏报告：软件版本、任务编号、本次阶段及错误。不发送文案、素材、文件路径、截图、Cookie、验证码或密码。由当前后端接收；已配置的 cpolar 入口会通过 HTTPS 投递并等待接收回执。</DialogDescription></DialogHeader>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs" aria-label="脱敏错误报告预览">{JSON.stringify(report,null,2)}</pre>
      {result && <p role="status">{result}</p>}
      <DialogFooter><Button variant="outline" disabled={sending} onClick={() => setReport(undefined)}>关闭</Button><Button disabled={sending || /已接收/.test(result)} onClick={() => void submit()}>{sending ? '正在反馈…' : '确认发送反馈'}</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}
