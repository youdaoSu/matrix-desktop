import { getUser } from '@/api';
import type { PublishConfig } from '@shared/publish-config';
import type { PlatformType } from '@shared/api.interface';
export interface LocalPublishDraft {
  id: string; title: string; updatedAt: string; config: PublishConfig; configs: Record<string, PublishConfig>;
  mediaType: 'text' | 'video' | 'image'; files: string[];
  accounts: { id: string; nickname: string; platform: PlatformType }[];
}
const key = (suffix: string) => `matrix-local-publish-${suffix}:${getUser()?.id || 'anonymous'}`;
export function readLocalDrafts(): LocalPublishDraft[] {
  try { const data = JSON.parse(localStorage.getItem(key('drafts')) || '[]'); return Array.isArray(data) ? data.filter(draft => draft?.id && draft.config && Array.isArray(draft.accounts) && Array.isArray(draft.files)) : []; } catch { return []; }
}
export function draftPreferences() {
  try { return { auto: true, retain: true, ...JSON.parse(localStorage.getItem(key('preferences')) || '{}') }; } catch { return { auto: true, retain: true }; }
}
export function setDraftPreferences(patch: { auto?: boolean; retain?: boolean }) { localStorage.setItem(key('preferences'), JSON.stringify({ ...draftPreferences(), ...patch })); window.dispatchEvent(new Event('matrix:local-drafts')); }
export function saveLocalDraft(draft: LocalPublishDraft) {
  // Paths, credentials, and reusable upload handles are deliberately not persisted.
  const strip = (config: PublishConfig): PublishConfig => ({ ...config, covers: undefined });
  const safe = { ...draft, config: strip(draft.config), configs: Object.fromEntries(Object.entries(draft.configs).map(([id, config]) => [id, strip(config)])) };
  const items = readLocalDrafts(); localStorage.setItem(key('drafts'), JSON.stringify([safe, ...items.filter(item => item.id !== draft.id)])); window.dispatchEvent(new Event('matrix:local-drafts'));
}
export function removeLocalDraft(id: string, expectedTime?: string) {
  const items = readLocalDrafts(); localStorage.setItem(key('drafts'), JSON.stringify(items.filter(item => item.id !== id || expectedTime && item.updatedAt !== expectedTime))); window.dispatchEvent(new Event('matrix:local-drafts'));
}
