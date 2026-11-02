// A projection of already authorized, in-memory caches. No network, disk,
// collectors, credentials or message bodies are accessed by this module.
export interface RecordSample {
  accountId: string; platform: string; nickname: string; nativeAccountKey?: string;
  works: number | null; comments: number | null; followers: number | null;
  avatarAddresses: number | null; threads: number | null; messages: number | null;
  commentsComplete: boolean; followersVerified: boolean; historyComplete: boolean;
  state: string;
}
export const recordMetricKeys = ['works', 'comments', 'followers', 'avatarAddresses', 'threads', 'messages'] as const;
export type RecordMetric = typeof recordMetricKeys[number];
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
export function summarizeDesktopRecords(samples: readonly RecordSample[]) {
  // Counts from multiple bindings of the same official identity must not add
  // twice. Keep the best available sample per metric, not the sum of archives.
  const identities = new Map<string, RecordSample>();
  for (const source of samples) {
    const key = `${source.platform}/${source.nativeAccountKey || 'binding:' + source.accountId}`;
    const old = identities.get(key), row = { ...source };
    for (const metric of recordMetricKeys) {
      row[metric] = count(row[metric]) ? row[metric] : null;
      if (old && count(old[metric]) && (row[metric] === null || old[metric]! > row[metric]!)) row[metric] = old[metric];
    }
    // Duplicate archives are not proof of a complete roster/history.
    if (old) { row.commentsComplete &&= old.commentsComplete; row.followersVerified &&= old.followersVerified; row.historyComplete &&= old.historyComplete; }
    identities.set(key, row);
  }
  const rows = [...identities.values()];
  const metrics = Object.fromEntries(recordMetricKeys.map(key => {
    const measured = rows.filter(row => row[key] !== null), total = measured.reduce((sum, row) => sum + row[key]!, 0);
    return [key, { value: measured.length && Number.isSafeInteger(total) ? total : null, measured: measured.length, accounts: rows.length }];
  })) as Record<RecordMetric, { value: number | null; measured: number; accounts: number }>;
  return { rows, metrics, duplicateBindings: samples.length - rows.length };
}
export function recordsCsv(rows: readonly RecordSample[]): string {
  // Spreadsheet formula injection protection, including leading whitespace.
  const cell = (value: unknown) => {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[\s\uFEFF]*[=+@-]/u.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const headings = ['平台', '账号', '已缓存作品', '已缓存评论', '已缓存当前/待核对粉丝', '含头像地址', '已缓存会话', '已缓存消息', '同步状态'];
  return '\uFEFF' + [headings, ...rows.map(row => [row.platform, row.nickname, ...recordMetricKeys.map(key => row[key]), row.state])].map(row => row.map(cell).join(',')).join('\r\n');
}
