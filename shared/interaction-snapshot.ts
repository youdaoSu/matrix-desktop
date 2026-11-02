export type InteractionKind = 'comments' | 'messages' | 'followers';
export interface VisibleInteraction {
  platformId: string; author: string; content: string; authorProfileUrl?: string; avatarUrl?: string;
  /** Official rendered label, not a fabricated exact server timestamp. */
  displayTime?: string;
  // Absence means unknown, never "read" or zero unread messages.
  unreadState?: 'unread' | 'read'; unreadCount?: number; unreadCountCapped?: boolean;
}
export function interactionAvatarUrl(value: unknown): string | undefined {
  try {
    const url = new URL(typeof value === 'string' ? value : '');
    if (url.protocol === 'https:' && !url.username && !url.password && url.href.length <= 4096) return url.href;
  } catch { /* No arbitrary protocols or fallback network requests. */ }
}
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
export function createInteractionSnapshot(records: VisibleInteraction[], source: string, capturedAt: string, previous?: InteractionSnapshot, platform?: PlatformType): InteractionSnapshot {
  const url = new URL(source);
  if (url.protocol !== 'https:' || url.username || url.password || !Number.isFinite(Date.parse(capturedAt))) throw Error('官方数据来源无效');
  const domains = { douyin: 'douyin.com', xiaohongshu: 'xiaohongshu.com', wechat: 'weixin.qq.com', bilibili: 'bilibili.com' };
  if (platform && url.hostname !== domains[platform] && !url.hostname.endsWith('.' + domains[platform])) throw Error('互动快照来源与当前账号平台不一致，请重新读取');
  const counts = new Map<string, number>();
  for (const row of records) if (row.platformId) counts.set(row.platformId, (counts.get(row.platformId) || 0) + 1);
  return { source, capturedAt, records: records.slice(0, 100).map((row, index) => {
    const matches = previous?.source === source && row.platformId && counts.get(row.platformId) === 1 ? previous.records.filter(item => item.platformId === row.platformId) : [];
    const old = matches.length === 1 ? matches[0] : undefined;
    let authorProfileUrl: string | undefined;
    try { const profile = new URL(row.authorProfileUrl || ''); if (profile.protocol === 'https:' && profile.hostname === 'www.douyin.com' && /^\/user\/MS4w[a-zA-Z0-9_-]+$/.test(profile.pathname) && !profile.search && !profile.hash) authorProfileUrl = profile.href; } catch {}
    const avatarUrl = interactionAvatarUrl(row.avatarUrl);
    const unreadCount = Number.isInteger(row.unreadCount) && row.unreadCount! >= 0 && row.unreadCount! <= 999999 ? row.unreadCount : undefined;
    const unreadState = row.unreadState === 'unread' && unreadCount !== 0 ? 'unread' : row.unreadState === 'read' && (unreadCount === undefined || unreadCount === 0) ? 'read' : undefined;
    const displayTime = typeof row.displayTime === 'string' ? row.displayTime.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0,100) : '';
    return { platformId: String(row.platformId || '').slice(0, 200), author: String(row.author || '').slice(0, 200), content: String(row.content || '').slice(0, 4000), ...(displayTime ? { displayTime } : {}), ...(authorProfileUrl ? { authorProfileUrl } : {}), ...(avatarUrl ? { avatarUrl } : {}), ...(unreadState ? { unreadState, ...(unreadCount !== undefined ? { unreadCount } : {}), ...(unreadState === 'unread' && row.unreadCountCapped === true ? { unreadCountCapped: true } : {}) } : {}), id: `${capturedAt}:${index}`, note: old?.note || '', handled: old?.handled || false };
  }) };
}
import type { PlatformType } from './api.interface';
