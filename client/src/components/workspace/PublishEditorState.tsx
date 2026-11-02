import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode, type SetStateAction } from 'react';
import { getUser } from '@/api';

// Session memory only: opaque upload handles and cover selections survive routes,
// but must not become executable data restored from localStorage after restart.
function createStore() {
  const values = new Map<string, unknown>(), listeners = new Map<string, Set<() => void>>();
  return {
    get<T>(key: string, initial: () => T): T { if (!values.has(key)) values.set(key, initial()); return values.get(key) as T; },
    set<T>(key: string, value: T) { values.set(key, value); for (const listener of listeners.get(key) || []) listener(); },
    subscribe(key: string, listener: () => void) { const group = listeners.get(key) || new Set(); group.add(listener); listeners.set(key, group); return () => { group.delete(listener); }; },
  };
}
const Context = createContext<ReturnType<typeof createStore> | null>(null);
export function PublishEditorStateProvider({ children }: { children: ReactNode }) {
  const owner = getUser()?.id;
  const store = useMemo(createStore, [owner]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function usePublishEditorState<T>(key: string, initial: T | (() => T)): [T, (next: SetStateAction<T>) => void] {
  const store = useContext(Context);
  if (!store) throw Error('发布编辑状态尚未初始化');
  const read = () => store.get(key, () => typeof initial === 'function' ? (initial as () => T)() : initial);
  const value = useSyncExternalStore(listener => store.subscribe(key, listener), read, read);
  return [value, next => store.set(key, typeof next === 'function' ? (next as (previous: T) => T)(read()) : next)];
}
export function usePublishEditorValue<T>(key: string, initial: () => T): T {
  const store = useContext(Context);
  if (!store) throw Error('发布编辑状态尚未初始化');
  return store.get(key, initial);
}
