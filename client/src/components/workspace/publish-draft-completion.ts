import type { LocalDraftRevision } from './local-publish-drafts';
import type { PublishJob, PublishRequest } from './publish-queue';

export interface PublishDraftOrigin extends LocalDraftRevision { retain?: boolean; accountIds: string[]; rowId?: string; rowIds?: string[] }
export interface PublishDraftPublication extends LocalDraftRevision { retain: false; publicationId: string; targetCount: number; rowId: string }
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 200;
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const base = (value: any) => value && text(value.ownerId) && text(value.id) && uuid(value.revisionId) && typeof value.updatedAt === 'string' && value.updatedAt.length <= 40 && Number.isFinite(Date.parse(value.updatedAt)) && value.retain === false;
const list = (value: unknown, max: number): string[] | undefined => Array.isArray(value) && value.length > 0 && value.length <= max && value.every(text) && new Set(value).size === value.length ? [...value].sort() : undefined;
export function normalizeDraftPublication(value: unknown): PublishDraftPublication | undefined {
  const item = value as PublishDraftPublication;
  if (!base(item) || !uuid(item.publicationId) || !Number.isInteger(item.targetCount) || item.targetCount < 1 || item.targetCount > 100 || !text(item.rowId)) return;
  return { ownerId: item.ownerId, id: item.id, updatedAt: item.updatedAt, revisionId: item.revisionId, retain: false, publicationId: item.publicationId, targetCount: item.targetCount, rowId: item.rowId };
}
// Only a full original row x account set can acquire cleanup eligibility.
// Partial/legacy origins do not block publication, but never authorize deletion.
export function draftPublicationRefs(requests: PublishRequest[], jobs: PublishJob[]) {
  const result = new Map<string, PublishDraftPublication>();
  if (requests.length !== jobs.length) return result;
  const groups = new Map<string, { origin: PublishDraftOrigin; accounts: string[]; rows: string[]; items: { job: PublishJob; rowId: string }[]; coherent: boolean }>();
  requests.forEach((request, index) => {
    const origin = request.draft; if (!base(origin)) return;
    const accounts = list(origin!.accountIds, 20), rows = origin!.rowIds === undefined ? ['single'] : list(origin!.rowIds, 50);
    const rowId = origin!.rowIds === undefined ? origin!.rowId === undefined ? 'single' : undefined : origin!.rowId;
    if (!accounts || !rows || !rowId || !rows.includes(rowId) || !accounts.includes(request.account.id)) return;
    const key = JSON.stringify([origin!.ownerId, origin!.id, origin!.revisionId, origin!.updatedAt]);
    const group = groups.get(key) || { origin: origin!, accounts, rows, items: [], coherent: true };
    group.coherent &&= JSON.stringify(accounts) === JSON.stringify(group.accounts) && JSON.stringify(rows) === JSON.stringify(group.rows);
    group.items.push({ job: jobs[index], rowId }); groups.set(key, group);
  });
  for (const group of groups.values()) {
    const targetCount = group.accounts.length * group.rows.length;
    if (!group.coherent || targetCount > 100 || group.items.length !== targetCount || new Set(group.items.map(({ job, rowId }) => JSON.stringify([rowId, job.accountId]))).size !== targetCount) continue;
    const publicationId = crypto.randomUUID();
    for (const { job, rowId } of group.items) result.set(job.id, { ownerId: group.origin.ownerId, id: group.origin.id, updatedAt: group.origin.updatedAt, revisionId: group.origin.revisionId, retain: false, publicationId, targetCount, rowId });
  }
  return result;
}
export const draftReceiptKey = (attemptId: string | undefined, receiptId: string | undefined) => JSON.stringify([attemptId, receiptId]);
export function completedDraftPublications(jobs: PublishJob[], freshReceipts: Map<string, string>): PublishDraftPublication[] {
  const groups = new Map<string, PublishJob[]>();
  for (const job of jobs) { const ref = normalizeDraftPublication(job.draftPublication); if (ref) groups.set(ref.publicationId, [...(groups.get(ref.publicationId) || []), job]); }
  const result: PublishDraftPublication[] = [];
  for (const members of groups.values()) {
    const ref = normalizeDraftPublication(members[0].draftPublication)!;
    if (members.length !== ref.targetCount || members.some(job => job.draftCleanupComplete || job.stage !== 'confirmed' || job.submission !== 'confirmed' || !text(job.attemptId) || !text(job.receiptId) || freshReceipts.get(job.id) !== draftReceiptKey(job.attemptId, job.receiptId))) continue;
    if (new Set(members.map(job => job.id)).size !== ref.targetCount || new Set(members.map(job => job.receiptId)).size !== ref.targetCount || new Set(members.map(job => JSON.stringify([job.draftPublication!.rowId, job.accountId]))).size !== ref.targetCount) continue;
    if (members.some(job => { const other = normalizeDraftPublication(job.draftPublication)!; return other.ownerId !== ref.ownerId || other.id !== ref.id || other.updatedAt !== ref.updatedAt || other.revisionId !== ref.revisionId || other.targetCount !== ref.targetCount; })) continue;
    result.push(ref);
  }
  return result;
}
