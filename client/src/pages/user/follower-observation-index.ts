import type { DouyinInteractionRow } from '@shared/douyin-interactions';
import type { PlatformAccount } from '@shared/api.interface';

type FollowerObservation = DouyinInteractionRow & { accountId: string; accountNickname: string };
type ObservationMode = 'all' | 'recent' | 'historical';

// Parse each timestamp once per projection. Do not infer a follow or unfollow
// event from observation times or incomplete platform data.
export function projectFollowerObservations(
  accounts: readonly PlatformAccount[],
  getRows: (account: PlatformAccount) => readonly DouyinInteractionRow[],
  mode: ObservationMode,
  search: string,
  now: number,
) {
  let total = 0, current = 0, newlyObserved = 0;
  const selected: { row: FollowerObservation; time: number }[] = [];
  const needle = search.trim().toLocaleLowerCase();
  for (const account of accounts) for (const item of getRows(account)) {
    total++;
    if (item.isCurrentFollower !== false) current++;
    const timestamp = item.firstObservedAt ? Date.parse(item.firstObservedAt) : NaN;
    const recent = Number.isFinite(timestamp) && timestamp <= now && timestamp >= now - 86400000;
    if (recent) newlyObserved++;
    const accountNickname = account.nickname || '未命名账号';
    if ((mode === 'recent' && !recent) || (mode === 'historical' && item.isCurrentFollower !== false) || !(item.author + '\n' + accountNickname).toLocaleLowerCase().includes(needle)) continue;
    selected.push({ row: { ...item, accountId: account.id, accountNickname }, time: Number.isFinite(timestamp) ? timestamp : 0 });
  }
  selected.sort((a, b) => b.time - a.time);
  return { total, current, newlyObserved, filtered: selected.map(item => item.row) };
}
