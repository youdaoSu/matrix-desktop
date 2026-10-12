export type InteractionKind = 'comments' | 'messages' | 'followers';
export interface VisibleInteraction { platformId: string; author: string; content: string; authorProfileUrl?: string }
export interface InteractionSnapshot {
  source: string; capturedAt: string;
  records: (VisibleInteraction & { id: string; note: string; handled: boolean })[];
}
export function interactionStorageKey(owner: string, account: string, kind: InteractionKind) {
  if (!owner || !account || !['comments', 'messages', 'followers'].includes(kind)) throw Error('请先登录并选择账号');
  return `matrix-interaction-v1:${encodeURIComponent(owner)}:${encodeURIComponent(account)}:${kind}`;
}
// A read replaces the visible snapshot, not a fictitious full-platform sync.
// Missing platform IDs are deliberately never matched by nickname.
export function createInteractionSnapshot(records: VisibleInteraction[], source: string, capturedAt: string, previous?: InteractionSnapshot): InteractionSnapshot {
  const url = new URL(source);
  if (url.protocol !== 'https:' || !Number.isFinite(Date.parse(capturedAt))) throw Error('官方数据来源无效');
  const counts = new Map<string, number>();
  for (const row of records) if (row.platformId) counts.set(row.platformId, (counts.get(row.platformId) || 0) + 1);
  return { source, capturedAt, records: records.slice(0, 100).map((row, index) => {
    const matches = previous?.source === source && row.platformId && counts.get(row.platformId) === 1 ? previous.records.filter(item => item.platformId === row.platformId) : [];
    const old = matches.length === 1 ? matches[0] : undefined;
    let authorProfileUrl: string | undefined;
    try { const profile = new URL(row.authorProfileUrl || ''); if (profile.protocol === 'https:' && profile.hostname === 'www.douyin.com' && /^\/user\/MS4w[a-zA-Z0-9_-]+$/.test(profile.pathname) && !profile.search && !profile.hash) authorProfileUrl = profile.href; } catch {}
    return { platformId: String(row.platformId || '').slice(0, 200), author: String(row.author || '').slice(0, 200), content: String(row.content || '').slice(0, 4000), ...(authorProfileUrl ? { authorProfileUrl } : {}), id: `${capturedAt}:${index}`, note: old?.note || '', handled: old?.handled || false };
  }) };
}
