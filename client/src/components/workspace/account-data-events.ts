import { useEffect } from 'react';
import { getAuthToken, getUser } from '@/api';

const eventName = 'matrix:account-data-updated';
// Emitted only after an owner-scoped observation has actually been persisted.
// No profile values, credentials or unverified metric totals travel in events.
export function notifyAccountDataUpdated(ownerId: string) {
  if (typeof window !== 'undefined' && ownerId && getUser()?.id === ownerId) window.dispatchEvent(new CustomEvent(eventName, { detail: { ownerId } }));
}
export function useAccountDataRefresh(refresh: () => void | Promise<void>) {
  const ownerId = getUser()?.id, token = getAuthToken();
  useEffect(() => {
    if (!ownerId || !token) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const current = () => getUser()?.id === ownerId && getAuthToken() === token;
    const updated = (event: Event) => {
      if (!current() || (event as CustomEvent<{ ownerId?: string }>).detail?.ownerId !== ownerId) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = undefined; if (current()) void refresh(); }, 200);
    };
    window.addEventListener(eventName, updated);
    return () => { if (timer) clearTimeout(timer); window.removeEventListener(eventName, updated); };
  }, [refresh, ownerId, token]);
}
