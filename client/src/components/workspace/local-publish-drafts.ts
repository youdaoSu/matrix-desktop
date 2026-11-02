import { getUser } from '@/api';
import { publishSyncFields, type PublishConfig, type PublishSyncField } from '@shared/publish-config';
import type { PlatformType } from '@shared/api.interface';
import { normalizePublishTaskControls, type PublishTaskControls } from '@shared/publish-task-controls';
import { normalizePublishExtraction, type PublishExtractionOptions } from '@shared/publish-extraction';
export interface LocalPublishDraft {
  ownerId?: string;
  revisionId?: string;
  id: string; title: string; updatedAt: string; config: PublishConfig; configs: Record<string, PublishConfig>;
  mediaType: 'text' | 'video' | 'image'; files: string[];
  accounts: { id: string; nickname: string; platform: PlatformType }[];
  source?: 'single' | 'batch-video' | 'batch-image';
  rows?: { id: string; title: string; content: string; topics?: string; comment?: string; files: string[] }[];
  batchSettings?: { field: 'title' | 'content' | 'topics' | 'comment'; text: string; taskControls?: PublishTaskControls };
  singleSettings?: { syncFields: PublishSyncField[]; overrides: Record<string, string[]>; autoExtract: boolean; extraction?: PublishExtractionOptions; taskControls?: PublishTaskControls };
}
export function hasDraftContent(config: PublishConfig, files: string[] = [], accountIds: string[] = []) {
  return Boolean(config.title.trim() || config.body.trim() || config.topics.length || config.comment.trim() || config.covers?.length || files.length || accountIds.length || Object.values(config.options || {}).some(Boolean) || Object.values(config.extras || {}).some(Boolean) || config.schedule && config.schedule.mode !== 'now');
}
const key = (suffix: string) => `matrix-local-publish-${suffix}:${getUser()?.id || 'anonymous'}`;
const record = (value: unknown): value is Record<string, any> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown) => typeof value === 'string' ? value : '';
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const revisionId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
// These are display names, not paths or executable media/cover handles.
const names = (value: unknown) => strings(value).map(name => name.split(/[\\/]/).pop() || '').filter(Boolean);
function draftConfig(value: unknown): PublishConfig | undefined {
  if (!record(value) || ['title', 'body', 'comment'].some(field => value[field] !== undefined && typeof value[field] !== 'string')) return;
  const options = record(value.options) ? value.options : {};
  const schedule = record(value.schedule) && ['now', 'official', 'local'].includes(value.schedule.mode) ? { mode: value.schedule.mode as 'now' | 'official' | 'local', ...(typeof value.schedule.at === 'string' ? { at: value.schedule.at } : {}) } : undefined;
  return { title: text(value.title), body: text(value.body), comment: text(value.comment), topics: strings(value.topics),
    options: Object.fromEntries(['category', 'visibility', 'originality'].flatMap(field => typeof options[field] === 'string' ? [[field, options[field]]] : [])),
    ...(schedule ? { schedule } : {}), ...(typeof value.pinComment === 'boolean' ? { pinComment: value.pinComment } : {}),
    ...(record(value.extras) ? { extras: Object.fromEntries(Object.entries(value.extras).filter(([, item]) => typeof item === 'string')) as Record<string, string> } : {}),
  };
}
export function normalizeLocalDraft(value: unknown, requireOwner = false): LocalPublishDraft | undefined {
  if (!record(value) || !text(value.id) || !text(value.updatedAt) || !Array.isArray(value.accounts) || !Array.isArray(value.files) || !['text', 'video', 'image'].includes(value.mediaType)) return;
  const ownerId = getUser()?.id;
  if (value.ownerId !== undefined && value.ownerId !== ownerId || requireOwner && (!ownerId || value.ownerId !== ownerId)) return;
  const config = draftConfig(value.config); if (!config) return;
  const source = ['single', 'batch-video', 'batch-image'].includes(value.source) ? value.source as LocalPublishDraft['source'] : 'single';
  if (source === 'batch-video' && value.mediaType !== 'video' || source === 'batch-image' && value.mediaType !== 'image') return;
  const configs = Object.fromEntries(Object.entries(record(value.configs) ? value.configs : {}).flatMap(([id, candidate]) => { const normalized = draftConfig(candidate); return normalized ? [[id, normalized]] : []; }));
  const accounts: LocalPublishDraft['accounts'] = value.accounts.filter(account => record(account) && text(account.id) && ['douyin', 'xiaohongshu', 'wechat', 'bilibili'].includes(account.platform)).map(account => ({ id: account.id, nickname: text(account.nickname), platform: account.platform }));
  const rows = Array.isArray(value.rows) ? value.rows.filter(row => record(row) && text(row.id)).map(row => ({ id: row.id, title: text(row.title), content: text(row.content), topics: text(row.topics), comment: text(row.comment), files: names(row.files) })) : undefined;
  const batchSettings = record(value.batchSettings) && ['title', 'content', 'topics', 'comment'].includes(value.batchSettings.field) ? { field: value.batchSettings.field as NonNullable<LocalPublishDraft['batchSettings']>['field'], text: text(value.batchSettings.text), ...(record(value.batchSettings.taskControls) ? { taskControls: normalizePublishTaskControls(value.batchSettings.taskControls, '批量分发') } : {}) } : undefined;
  const settings = record(value.singleSettings) ? value.singleSettings : {}, allowedOverrides = ['title','body','topics','comment','options','covers','schedule','pinComment','extras'];
  const overrideCandidates = record(settings.overrides) ? settings.overrides : Object.fromEntries(Object.entries(configs).map(([id, config]) => [id, Object.keys(config)]));
  const singleSettings: LocalPublishDraft['singleSettings'] = source === 'single' ? { syncFields: Array.isArray(settings.syncFields) ? publishSyncFields.filter(field => settings.syncFields.includes(field)) : [...publishSyncFields], overrides: Object.fromEntries(Object.entries(overrideCandidates).map(([id, fields]) => [id, [...new Set(strings(fields).filter(field => allowedOverrides.includes(field)))]])), autoExtract: settings.autoExtract === true, ...(record(settings.extraction) ? { extraction: normalizePublishExtraction(settings.extraction) } : {}), ...(record(settings.taskControls) ? { taskControls: normalizePublishTaskControls(settings.taskControls) } : {}) } : undefined;
  return { ...(ownerId ? { ownerId } : {}), ...(revisionId(value.revisionId) ? { revisionId: value.revisionId } : {}), id: value.id, title: text(value.title) || config.title, updatedAt: value.updatedAt, mediaType: value.mediaType, source, config, configs, files: names(value.files), accounts, ...(rows ? { rows } : {}), ...(batchSettings ? { batchSettings } : {}), ...(singleSettings ? { singleSettings } : {}) };
}
function storedItems(): unknown[] {
  const raw = localStorage.getItem(key('drafts'));
  if (raw === null) return [];
  try { const items: unknown = JSON.parse(raw); if (Array.isArray(items)) return items; } catch { /* Never replace damaged original storage with an empty draft array. */ }
  throw Error('本地草稿数据格式损坏，已停止写入以保留原数据；请先导出备份并联系开发者');
}
export function readLocalDrafts(): LocalPublishDraft[] {
  try { return storedItems().flatMap(item => { const draft = normalizeLocalDraft(item); return draft ? [draft] : []; }); } catch { return []; }
}
export function localDraftStorageIssue(): string | undefined {
  try { const invalid = storedItems().filter(item => !normalizeLocalDraft(item)).length; return invalid ? `${invalid} 条本地草稿格式异常，原数据已保留且未载入编辑器。请先在“设置 → 数据与备份”导出备份，再联系开发者恢复。` : undefined; }
  catch (error) { return (error as Error).message; }
}
export function draftPreferences() {
  try { const value = JSON.parse(localStorage.getItem(key('preferences')) || '{}'); return { auto: typeof value?.auto === 'boolean' ? value.auto : true, retain: typeof value?.retain === 'boolean' ? value.retain : true }; } catch { return { auto: true, retain: true }; }
}
export function setDraftPreferences(patch: { auto?: boolean; retain?: boolean }) { localStorage.setItem(key('preferences'), JSON.stringify({ ...draftPreferences(), ...patch })); window.dispatchEvent(new Event('matrix:local-drafts')); }
export function saveLocalDraft(draft: LocalPublishDraft) {
  const safe = normalizeLocalDraft(draft); if (!safe) throw Error('草稿格式不正确，未覆盖原草稿');
  // Preserve unreadable sibling entries for recovery rather than silently erase
  // them during an unrelated auto-save. Only valid projections reach editors.
  const items = storedItems(); localStorage.setItem(key('drafts'), JSON.stringify([safe, ...items.filter(item => !record(item) || item.id !== draft.id)])); window.dispatchEvent(new Event('matrix:local-drafts'));
}
export function removeLocalDraft(id: string, expectedTime?: string, expectedRevisionId?: string) {
  const items = storedItems(); localStorage.setItem(key('drafts'), JSON.stringify(items.filter(item => !record(item) || item.id !== id || expectedTime && item.updatedAt !== expectedTime || expectedRevisionId && item.revisionId !== expectedRevisionId))); window.dispatchEvent(new Event('matrix:local-drafts'));
}

export interface LocalDraftRevision { ownerId: string; id: string; updatedAt: string; revisionId: string }
export interface LocalDraftRevisionState {
  ownerId?: string;
  current?: { id: string; signature: string; updatedAt: string; revisionId?: string };
}
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : record(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
function revisionSignature(draft: LocalPublishDraft, transientIdentity?: unknown) {
  const safe = normalizeLocalDraft(draft); if (!safe) throw Error('草稿格式不正确，未覆盖原草稿');
  const { updatedAt: _at, revisionId: _revision, title: _displayTitle, accounts, ...content } = safe;
  const covers = (config: PublishConfig) => config.covers?.map(cover => [cover.id, cover.index, cover.name]) || [];
  // Media/cover identities are session-only change detectors. This signature
  // must never be written to localStorage or restored as an executable handle.
  return JSON.stringify(canonical([content, accounts.map(account => [account.id, account.platform]).sort((a,b)=>a[0].localeCompare(b[0])), transientIdentity ?? null, covers(draft.config), Object.fromEntries(Object.entries(draft.configs).map(([id, config]) => [id, covers(config)]))]));
}
export function createLocalDraftRevision(draft?: LocalPublishDraft): LocalDraftRevisionState {
  const state: LocalDraftRevisionState = { ownerId: getUser()?.id };
  const safe = draft && normalizeLocalDraft(draft);
  if (safe) state.current = { id: safe.id, signature: revisionSignature(safe), updatedAt: safe.updatedAt, revisionId: safe.revisionId };
  return state;
}
export function matchingLocalDraftRevision(draft: LocalPublishDraft, state: LocalDraftRevisionState, transientIdentity?: unknown): LocalDraftRevision | undefined {
  const ownerId = getUser()?.id, previous = state.current;
  if (!ownerId || state.ownerId !== ownerId || !previous || previous.id !== draft.id || !revisionId(previous.revisionId) || previous.signature !== revisionSignature(draft, transientIdentity)) return;
  return { ownerId, id: previous.id, updatedAt: previous.updatedAt, revisionId: previous.revisionId };
}
export function commitLocalDraftRevision(draft: LocalPublishDraft, state: LocalDraftRevisionState, transientIdentity?: unknown, force = false): LocalDraftRevision {
  const ownerId = getUser()?.id;
  if (!ownerId || state.ownerId !== ownerId) throw Error('登录用户已变化，未将旧编辑内容保存到其他账号');
  const signature = revisionSignature(draft, transientIdentity), previous = state.current;
  const unchanged = previous?.id === draft.id && previous.signature === signature;
  const current = !force && matchingLocalDraftRevision(draft, state, transientIdentity);
  // An unchanged editor must not recreate a draft intentionally removed after
  // successful publication (or manually removed elsewhere). Real edits or an
  // explicit Save action can create a new revision again.
  if (current) return current;
  const next = { ownerId, id: draft.id, updatedAt: !force && unchanged && Number.isFinite(Date.parse(previous.updatedAt)) ? previous.updatedAt : new Date().toISOString(), revisionId: crypto.randomUUID() };
  saveLocalDraft({ ...draft, ...next });
  // A quota/damaged-storage failure must not advance the remembered revision.
  state.current = { id: next.id, signature, updatedAt: next.updatedAt, revisionId: next.revisionId };
  return next;
}
