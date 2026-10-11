import type { PublishJob } from './publish-queue';

export interface TaskFilter { text?: string; platform?: string; account?: string; stage?: string; mediaType?: string; start?: string; end?: string; batch?: string }
export function localDay(value: string | Date) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function filterPublishJobs(jobs: PublishJob[], filter: TaskFilter) {
  const includes = (value: string, query = '') => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  return jobs.filter(job => includes([job.title, job.config?.body, ...job.files].join(' '), filter.text)
    && includes(`${job.nickname} ${job.accountId}`, filter.account)
    && (!filter.platform || job.platform === filter.platform) && (!filter.stage || job.stage === filter.stage)
    && (!filter.mediaType || job.mediaType === filter.mediaType) && (!filter.batch || job.batchId === filter.batch)
    && (!filter.start || localDay(job.createdAt) >= filter.start) && (!filter.end || localDay(job.createdAt) <= filter.end));
}
export const successRate = (success: number, total: number) => total ? `${(100 * success / total).toFixed(2)}%` : '—';
export function publishReport(jobs: PublishJob[], today = localDay(new Date())) {
  const metrics = (items: PublishJob[]) => ({ total: items.length, success: items.filter(job => job.stage === 'confirmed').length,
    today: items.filter(job => localDay(job.createdAt) === today).length,
    todaySuccess: items.filter(job => localDay(job.createdAt) === today && job.stage === 'confirmed').length });
  const accounts = new Map<string, PublishJob[]>(), days = new Map<string, PublishJob[]>();
  for (const job of jobs) {
    const key = `${job.platform}:${job.accountId}`, day = localDay(job.createdAt);
    accounts.set(key, [...(accounts.get(key) || []), job]);
    if (day) days.set(day, [...(days.get(day) || []), job]);
  }
  return { ...metrics(jobs), accounts: [...accounts.values()].map(items => ({ accountId: items[0].accountId, platform: items[0].platform, nickname: items[0].nickname, ...metrics(items) })),
    days: [...days].sort(([a], [b]) => b.localeCompare(a)).map(([date, items]) => ({ date, ...metrics(items) })) };
}
