import type { PublishJob } from './publish-queue';

export interface TaskFilter { text?: string; platform?: string; account?: string; stage?: string; mediaType?: string; start?: string; end?: string; batch?: string }
export function isTaskFilter(value: unknown): value is TaskFilter {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = ['text', 'platform', 'account', 'stage', 'mediaType', 'start', 'end', 'batch'];
  return Object.entries(value).every(([key, item]) => keys.includes(key) && typeof item === 'string' && item.length <= 500);
}
export function localDay(value: string | Date) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function filterPublishJobs(jobs: PublishJob[], filter: TaskFilter) {
  const includes = (value: string, query = '') => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  return jobs.filter(job => includes([job.title, job.config?.body, job.batchName, ...job.files].join(' '), filter.text)
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
  // Streaming counters avoid copying ever-growing job arrays for each item.
  // This path is O(n), including accounts with many years of task history.
  type Counts = ReturnType<typeof metrics>;
  const accounts = new Map<string, { accountId: string; platform: PublishJob['platform']; nickname: string } & Counts>(), days = new Map<string, { date: string } & Counts>();
  const empty = (): Counts => ({ total: 0, success: 0, today: 0, todaySuccess: 0 });
  const add = (value: Counts, job: PublishJob, day: string) => { value.total++; if (job.stage === 'confirmed') value.success++; if (day === today) { value.today++; if (job.stage === 'confirmed') value.todaySuccess++; } };
  for (const job of jobs) {
    const key = `${job.platform}:${job.accountId}`, day = localDay(job.createdAt);
    let account = accounts.get(key);
    if (!account) { account = { accountId: job.accountId, platform: job.platform, nickname: job.nickname, ...empty() }; accounts.set(key, account); }
    add(account, job, day);
    if (day) { let date = days.get(day); if (!date) { date = { date: day, ...empty() }; days.set(day, date); } add(date, job, day); }
  }
  return { ...metrics(jobs), accounts: [...accounts.values()], days: [...days.values()].sort((a, b) => b.date.localeCompare(a.date)) };
}
