import type { PublishJob } from './publish-queue';

export const publishExecutionStageLabels = {
  scheduled: '等待定时执行', queued: '等待执行', preparing: '准备账号页面',
  uploading: '上传素材 / 等待转码', filling: '填写作品信息', cover: '处理作品封面',
  reviewing: '检查发布表单', confirming: '提交前复核',
  submitting: '提交发布 / 等待平台结果', confirmed: '发布完成',
} as const;
export type PublishExecutionStage = keyof typeof publishExecutionStageLabels;
export const isPublishExecutionStage = (value: unknown): value is PublishExecutionStage =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(publishExecutionStageLabels, value);

// A failed/stopped outcome is not an execution phase. Old records are display
// only: infer their last real phase from this attempt, never from a prior retry.
export function getPublishExecutionStage(job: Pick<PublishJob, 'stage' | 'executionStage' | 'history' | 'lastAttemptAt' | 'message' | 'submission'>): PublishExecutionStage {
  if (job.stage === 'confirmed') return 'confirmed';
  if (isPublishExecutionStage(job.executionStage)) return job.executionStage;
  if (isPublishExecutionStage(job.stage)) return job.stage;
  if (job.submission === 'not_submitted' && /请在官方页面补全：(?:title|body|visibility|标题|简介|可见范围)[：:]/.test(job.message)) return 'filling';
  const attempt = job.history.filter(step => !job.lastAttemptAt || step.at >= job.lastAttemptAt);
  for (const step of [...attempt].reverse()) {
    if (isPublishExecutionStage(step.executionStage)) return step.executionStage;
    if (isPublishExecutionStage(step.stage)) return step.stage;
  }
  return job.submission === 'uncertain' ? 'submitting' : 'queued';
}
export const publishExecutionStageLabel = (job: Parameters<typeof getPublishExecutionStage>[0]) =>
  publishExecutionStageLabels[getPublishExecutionStage(job)];
