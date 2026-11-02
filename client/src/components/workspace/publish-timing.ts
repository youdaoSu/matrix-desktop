import type { PublishJob } from './publish-queue';
const valid = (value?: string) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : undefined;
// Timing survives bounded progress history. Legacy queue time is labelled as
// such rather than presented as a measured execution start.
export function publishJobTiming(job: PublishJob) {
  const attempt = valid(job.lastAttemptAt);
  const history = job.history.filter(step => valid(step.at) && (!attempt || Date.parse(step.at) >= Date.parse(attempt)));
  const recorded = valid(job.executionStartedAt);
  const started = recorded && (!attempt || Date.parse(recorded) >= Date.parse(attempt)) ? recorded : history.find(step => step.stage === 'preparing')?.at;
  const finished = (job.stage === 'confirmed' ? valid(job.acceptedAt) : undefined) || valid(job.completedAt) || (job.submission === 'user_confirmed_absent' ? undefined : [...history].reverse().find(step => ['confirmed','failed','cancelled','interrupted'].includes(step.stage))?.at);
  const baseline = started || attempt || ((job.attemptNumber || 1) === 1 && !job.retryOf ? valid(job.createdAt) : undefined);
  const duration = baseline && finished && Date.parse(finished) >= Date.parse(baseline) ? Math.round((Date.parse(finished) - Date.parse(baseline)) / 1000) : undefined;
  return { started, finished, duration, includesQueue: !started && duration !== undefined };
}
