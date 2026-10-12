export const preferenceDefaults = {
  startupPage: '/dashboard', maskAccountDetails: false, retainInteractionSnapshots: true,
  unreadBadges: true, dueReminders: true, publishAlerts: true, desktopAlerts: false,
};
export type AppPreferences = typeof preferenceDefaults;
export const startupPages = ['/dashboard', '/accounts', '/publish/create', '/engage/comments', '/publish/tasks'];
export function preferenceKey(owner: string) { return 'matrix-app-preferences-v1:' + encodeURIComponent(owner); }
export function normalizePreferences(value: unknown): AppPreferences {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const result = { ...preferenceDefaults };
  for (const key of Object.keys(result) as (keyof AppPreferences)[]) {
    if (key === 'startupPage') { if (startupPages.includes(String(input[key]))) result.startupPage = String(input[key]); }
    else if (typeof input[key] === 'boolean') result[key] = input[key] as boolean;
  }
  return result;
}
export function interactionSnapshotKeys(keys: string[], owner: string) {
  const prefix = 'matrix-interaction-v1:' + encodeURIComponent(owner) + ':';
  return owner ? keys.filter(key => key.startsWith(prefix) && /:(comments|messages|followers)$/.test(key)) : [];
}
