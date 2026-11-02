import { useEffect, useState } from 'react';
import { getUser } from '@/api';
import { normalizePreferences, preferenceKey, type AppPreferences } from '@shared/app-preferences';
export function readAppPreferences(): AppPreferences {
  try { const owner = getUser()?.id; return normalizePreferences(owner ? JSON.parse(localStorage.getItem(preferenceKey(owner)) || '{}') : {}); }
  catch { return normalizePreferences({}); }
}
export function saveAppPreferences(patch: Partial<AppPreferences>) {
  const owner = getUser()?.id;
  if (!owner) throw Error('请先登录远效');
  localStorage.setItem(preferenceKey(owner), JSON.stringify(normalizePreferences({ ...readAppPreferences(), ...patch })));
  window.dispatchEvent(new Event('matrix:preferences-updated'));
}
export function useAppPreferences() {
  const [preferences, setPreferences] = useState(readAppPreferences);
  useEffect(() => {
    const update = () => setPreferences(readAppPreferences());
    window.addEventListener('matrix:preferences-updated', update);
    window.addEventListener('storage', update);
    return () => { window.removeEventListener('matrix:preferences-updated', update); window.removeEventListener('storage', update); };
  }, []);
  return preferences;
}
