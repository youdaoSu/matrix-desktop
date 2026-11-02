import {useCallback, useEffect, useRef, useState} from 'react';
import {getAuthToken, getUser} from '@/api';

type ActiveOperation = {scope: string; owner: string; token: string; controller: AbortController; timer?: ReturnType<typeof setTimeout>};
export interface ScopedOperationLease {
  signal: AbortSignal;
  current(): boolean;
  wait<T>(work: () => Promise<T>): Promise<T>;
  finish(): void;
}

// Bounds renderer waiting even when an IPC cannot be physically cancelled.
// Cancellation never claims that a mutating official command was rolled back;
// it only invalidates its late result. There is no automatic retry here.
export function useScopedOperation(scope: string) {
  const owner = getUser()?.id || '', token = getAuthToken() || '';
  const latestScope = useRef(scope), active = useRef<ActiveOperation | undefined>(undefined), mounted = useRef(true);
  latestScope.current = scope;
  const [busy, setBusy] = useState(false);
  const cancel = useCallback(() => {
    const previous = active.current;
    active.current = undefined;
    if (previous) { clearTimeout(previous.timer); previous.controller.abort(Error('已停止等待当前操作')); }
    if (mounted.current) setBusy(false);
  }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cancel(); }; }, [cancel]);
  useEffect(() => { cancel(); }, [scope, owner, token, cancel]);
  const begin = useCallback((): ScopedOperationLease | undefined => {
    if (active.current) return; // Also guards two clicks before React commits busy.
    const requestOwner = getUser()?.id, requestToken = getAuthToken();
    if (!requestOwner || !requestToken) throw Error('请先登录远效再进行操作');
    const entry: ActiveOperation = {scope: latestScope.current, owner: requestOwner, token: requestToken, controller: new AbortController()};
    active.current = entry; setBusy(true);
    entry.timer = setTimeout(() => entry.controller.abort(Error('等待超过20秒，已停止等待；未完成的官方操作不能视为成功，请核对后再操作')), 20000);
    const current = () => mounted.current && active.current === entry && latestScope.current === entry.scope && getUser()?.id === entry.owner && getAuthToken() === entry.token;
    return {
      signal: entry.controller.signal, current,
      wait: <T,>(work: () => Promise<T>) => new Promise<T>((resolve, reject) => {
        const signal = entry.controller.signal;
        const aborted = () => reject(signal.reason instanceof Error ? signal.reason : Error('已停止等待当前操作'));
        if (signal.aborted || !current()) { aborted(); return; }
        signal.addEventListener('abort', aborted, {once: true});
        // Both handlers stay attached to observe a late IPC rejection safely.
        Promise.resolve().then(() => { if (signal.aborted || !current()) throw Error('当前操作已失效'); return work(); }).then(
          value => { signal.removeEventListener('abort', aborted); resolve(value); },
          error => { signal.removeEventListener('abort', aborted); reject(error); },
        );
      }),
      finish: () => { clearTimeout(entry.timer); if (active.current === entry) { active.current = undefined; if (mounted.current) setBusy(false); } },
    };
  }, []);
  return {busy, begin, cancel};
}
