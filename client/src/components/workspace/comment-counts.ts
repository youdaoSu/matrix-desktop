import type { DouyinInteractionRow } from '@shared/douyin-interactions';

// One account's cache only. Counts are cached rows (including replies), not an
// official total, and must never be shared by bare work ID across accounts.
export function commentCountsByWork(rows: readonly Pick<DouyinInteractionRow, 'workId'>[]) {
  const counts = new Map<string, number>();
  for (const row of rows) { const id = row.workId; if (id) counts.set(id, (counts.get(id) || 0) + 1); }
  return counts;
}
