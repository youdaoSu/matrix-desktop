import { useCallback, useMemo, useSyncExternalStore, type SetStateAction } from 'react';
import { getAuthToken, getUser } from '@/api';

// Display preferences only. Never put messages, credentials, browser handles,
// pending submissions, confirmations or authoritative account health here.
const prefix = 'matrix-ui:v1:';
const changed = 'matrix:ui-preference-updated';
type Validator<T> = (value: unknown) => value is T;
type Cell<T> = { value: T; subscribers: number; read(): T; write(value: T): void; reload(): void };
const cells = new Map<string, Cell<unknown>>();
export const uiText = (value: unknown): value is string => typeof value === 'string' && value.length <= 500;
export const uiBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
export const uiPage = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 100000;
export const uiDate = (value: unknown): value is string => {
  if (value === '') return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
export const uiOneOf = <T extends string | number>(options: readonly T[]) => (value: unknown): value is T => options.includes(value as T);

function identity() {
  try { const owner = getUser()?.id, token = getAuthToken(); return typeof owner === 'string' && owner && token ? JSON.stringify([owner, token]) : ''; }
  catch { return ''; }
}
function subscribeIdentity(notify: () => void) {
  const storage = (event: StorageEvent) => { if (!event.key || ['matrix_user', 'matrix_token'].includes(event.key)) notify(); };
  window.addEventListener('matrix:auth-updated', notify); window.addEventListener('storage', storage);
  return () => { window.removeEventListener('matrix:auth-updated', notify); window.removeEventListener('storage', storage); };
}
export function useWorkspaceIdentity() { return useSyncExternalStore(subscribeIdentity, identity, () => ''); }

function cellFor<T>(key: string, initial: T, validate: Validator<T>): Cell<T> {
  const existing = cells.get(key); if (existing) return existing as Cell<T>;
  const cell: Cell<T> = {
    value: initial, subscribers: 0,
    read: () => cell.value,
    reload() {
      try { const raw = localStorage.getItem(key); const value: unknown = raw && raw.length <= 8192 ? JSON.parse(raw) : undefined; cell.value = validate(value) ? value : initial; }
      catch { cell.value = initial; }
    },
    write(value) {
      if (!validate(value)) return;
      const raw = JSON.stringify(value); if (raw.length > 8192) return;
      cell.value = value;
      try { localStorage.setItem(key, raw); } catch { /* Retain navigation choices in memory when disk storage is unavailable. */ }
      window.dispatchEvent(new CustomEvent(changed, { detail: key }));
    },
  };
  cell.reload();
  // Retire inactive entries only; two mounted consumers must share one cell.
  if (cells.size >= 512) { const inactive = [...cells].find(([, item]) => item.subscribers === 0); if (inactive) cells.delete(inactive[0]); }
  cells.set(key, cell as Cell<unknown>); return cell;
}

export function useWorkspacePreference<T>(name: string, initial: T, validate: Validator<T>): [T, (next: SetStateAction<T>) => void] {
  const lease = useWorkspaceIdentity();
  const owner: string = lease ? JSON.parse(lease)[0] : '';
  const key = prefix + encodeURIComponent(owner) + ':' + name;
  const cell = useMemo(() => owner ? cellFor(key, initial, validate) : { value: initial, subscribers: 0, read: () => initial, write: () => {}, reload: () => {} }, [key, owner]);
  const subscribe = useCallback((notify: () => void) => {
    cell.subscribers++;
    const local = (event: Event) => { if ((event as CustomEvent).detail === key) notify(); };
    const storage = (event: StorageEvent) => { if (event.key === key || event.key === null) { cell.reload(); notify(); } };
    window.addEventListener(changed, local); window.addEventListener('storage', storage);
    return () => { cell.subscribers--; window.removeEventListener(changed, local); window.removeEventListener('storage', storage); };
  }, [cell, key]);
  const value = useSyncExternalStore(subscribe, cell.read, cell.read);
  return [value, useCallback(next => {
    // A late request from an old route/login may not change the new user's UI.
    if (!lease || identity() !== lease) return;
    cell.write(typeof next === 'function' ? (next as (previous: T) => T)(cell.read()) : next);
  }, [cell, lease])];
}
