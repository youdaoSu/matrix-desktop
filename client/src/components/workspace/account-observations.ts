import { useSyncExternalStore } from 'react';
import { getUser } from '@/api';
import type { AccountAvailability, AccountObservation } from '@shared/account-availability';
import { accountAppearance } from '@shared/account-availability';
import type { PlatformAccount } from '@shared/api.interface';

type Identity = { id?: string; connectorSessionId?: string };
type Stored = AccountObservation & { key: string };
const allowed = new Set<AccountAvailability>(['normal', 'offline', 'abnormal', 'banned', 'unknown']);
const owners = new Map<string, Map<string, AccountObservation>>();
const listeners = new Set<() => void>();
let revision = 0;
const emit = () => { revision++; listeners.forEach(listener => listener()); };
const storageKey = (owner: string) => 'matrix-account-observations:' + owner;
const identityKey = (account: Identity) => account.id ? account.id + ':' + (account.connectorSessionId || 'oauth') : '';
const currentOwner = () => typeof window === 'undefined' ? '' : getUser()?.id || '';
function records(owner: string) {
  if (owners.has(owner)) return owners.get(owner)!;
  const items = new Map<string, AccountObservation>();
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey(owner)) || '[]');
    if (Array.isArray(stored)) for (const item of stored.slice(-200)) {
      if (typeof item?.key === 'string' && item.key.length < 200 && allowed.has(item.state) && typeof item.reason === 'string' && item.reason.length <= 200 && Number.isFinite(item.checkedAt) && item.checkedAt <= Date.now() + 5000) items.set(item.key, { state: item.state, reason: item.reason, checkedAt: item.checkedAt, ...(Number.isFinite(item.lastAttemptAt)&&item.lastAttemptAt<=Date.now()+5000?{lastAttemptAt:item.lastAttemptAt}:{}), ...(typeof item.transientReason==='string'?{transientReason:item.transientReason.slice(0,200)}:{}) });
    }
  } catch { /* Invalid cosmetic status data never establishes an authorized session. */ }
  owners.set(owner, items); return items;
}
export function recordAccountObservation(owner: string, account: Identity, observation: AccountObservation) {
  const key = identityKey(account);
  if (!owner || owner !== currentOwner() || !key || !allowed.has(observation.state) || !Number.isFinite(observation.checkedAt) || observation.checkedAt > Date.now() + 5000) return;
  const items = records(owner), previous = items.get(key);
  if (previous && Math.max(previous.checkedAt,previous.lastAttemptAt||0) > observation.checkedAt) return;
  // An unavailable page/network is not a new account state. Keep the last
  // explicit result and its ORIGINAL time, alongside the latest read issue.
  const next = observation.state === 'unknown' && previous && previous.state !== 'unknown'
    ? {...previous,lastAttemptAt:observation.checkedAt,transientReason:observation.reason.slice(0,200)}
    : { ...observation, reason: observation.reason.slice(0, 200), lastAttemptAt:observation.checkedAt };
  items.delete(key); items.set(key, next);
  while (items.size > 200) items.delete(items.keys().next().value!);
  try { localStorage.setItem(storageKey(owner), JSON.stringify([...items].map(([key, value]): Stored => ({ key, ...value })))); } catch { /* Rendering still uses the current in-memory observation. */ }
  emit();
}
export function useAccountObservation(account: Identity) {
  const owner = currentOwner(), key = identityKey(account);
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => owner && key ? records(owner).get(key) : undefined, () => undefined);
}
export function useAccountAvailabilityCounts(accounts: PlatformAccount[]) {
  const owner=currentOwner();
  useSyncExternalStore(listener=>{listeners.add(listener);return()=>{listeners.delete(listener);};},()=>owner+':'+revision,()=>owner+':0');
  return accounts.reduce((counts,account)=>{const state=accountAppearance(account,owner?records(owner).get(identityKey(account)):undefined).state;counts[state]++;return counts;},{normal:0,offline:0,abnormal:0,banned:0,unknown:0});
}
export function recordLoginObservation(owner: string, account: Identity & { platform: string; nickname: string }, result: MatrixDesktopLoginResult | MatrixDesktopErrorResult, checkedAt = Date.now()) {
  if ('error' in result) {
    if (result.pendingProfile) return;
    recordAccountObservation(owner, account, { checkedAt, state: result.accountIssue?.kind === 'banned' ? 'banned' : result.accountIssue ? 'abnormal' : result.loginRequired ? 'offline' : 'unknown', reason: result.accountIssue?.message || (result.loginRequired ? '官方页面要求重新登录' : '当前官方状态暂时无法核验') });
  } else {
    const same = result.platform === account.platform && result.sessionId === account.connectorSessionId && result.nickname.trim() === account.nickname.trim();
    recordAccountObservation(owner, account, { checkedAt, state: same ? 'normal' : 'abnormal', reason: same ? '已在当前官方后台核验同一账号的登录状态' : '当前官方账号与绑定账号不一致，请在账号管理重新核验' });
  }
}
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  const owner = currentOwner(); if (!owner || event.key !== storageKey(owner)) return;
  owners.delete(owner); emit();
});
