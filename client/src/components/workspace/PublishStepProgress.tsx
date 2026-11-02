import type { PublishJob } from './publish-queue';
import { getPublishExecutionStage, publishExecutionStageLabels, type PublishExecutionStage } from './publish-execution-stage';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function PublishTaskStageNote({ job }: { job: PublishJob }) {
  const tooltip = useId();
  const root = useRef<HTMLElement>(null), bubble = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ left: 12, top: 12 });
  useLayoutEffect(() => {
    if (!open || !root.current || !bubble.current) return;
    const target = root.current.getBoundingClientRect(), box = bubble.current.getBoundingClientRect();
    setPosition({ left: Math.max(12, Math.min(target.left, innerWidth - box.width - 12)), top: Math.max(12, Math.min(target.top >= box.height + 12 ? target.top - box.height - 10 : target.bottom + 10, innerHeight - box.height - 12)) });
  }, [open, job.message, job.stage, job.uploadPercent]);
  useEffect(() => { const close = () => setOpen(false); window.addEventListener('scroll', close, true); window.addEventListener('resize', close); return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); }; }, []);
  if (['confirmed','queued'].includes(job.stage)) return null;
  const prefix = job.stage === 'failed' ? job.submission === 'not_submitted' ? '未提交到平台' : job.submission === 'user_confirmed_absent' ? '本人已核实未发布（非官方失败回执）' : '平台明确提示失败' : job.stage === 'unknown' ? '结果尚未确认，勿重复提交' : '';
  const running = ['preparing','uploading','filling','reviewing','confirming','submitting'].includes(job.stage);
  const stage = job.stage === 'paused' ? '已暂停，尚未上传' : publishExecutionStageLabels[getPublishExecutionStage(job)];
  const full = `${stage} · ${prefix ? prefix + ' · ' : ''}${job.message}`;
  const current = running ? job.stage === 'uploading' && Number.isFinite(job.uploadPercent) ? `上传 ${job.uploadPercent}%` : stage : full;
  const content = <span ref={bubble} role="tooltip" id={tooltip} className="matrix-task-stage-bubble" data-visible={open} style={position}>{full}{running && <span>如果长时间停在此步，可查看发布页面辅助处理；请勿重复提交结果不明的作品。</span>}</span>;
  return <small ref={root} className="matrix-task-failure-reason matrix-task-stage-note" data-publish-stage-message={job.stage} data-execution-stage={job.stage === 'paused' ? undefined : getPublishExecutionStage(job)} tabIndex={0} aria-describedby={tooltip} role="status" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } }}><span className="matrix-task-stage-copy">{current}</span>{typeof document === 'undefined' ? content : createPortal(content, document.body)}</small>;
}

export function PublishStepProgress({ job }: { job: PublishJob }) {
  // Historical records do not acquire fabricated completion ticks.
  if (!Array.isArray(job.completedSteps)) return null;
  const current = getPublishExecutionStage(job);
  const steps: PublishExecutionStage[] = ['preparing','uploading','filling', ...(job.config?.covers?.some(cover => cover.index !== 2 || job.platform === 'douyin') ? ['cover' as const] : []), 'reviewing', ...(job.completedSteps.includes('confirming') || current === 'confirming' ? ['confirming' as const] : []), 'submitting'];
  return <ol className="matrix-task-step-progress" aria-label="本次发布步骤">{steps.map(step => {
    const done = job.completedSteps?.includes(step), active = !done && current === step;
    const state = done ? '已完成' : active ? ['failed','attention','unknown','cancelled','interrupted'].includes(job.stage) ? '停在此步' : '进行中' : '未开始';
    return <li key={step} data-publish-step={step} data-step-state={state}><span aria-hidden>{done ? '✓' : active ? '●' : '○'}</span> {publishExecutionStageLabels[step]}<small>{state}</small></li>;
  })}</ol>;
}
