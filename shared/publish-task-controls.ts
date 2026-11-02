export interface PublishTaskControls {
  batchName: string;
  initialState: 'execute' | 'paused';
}
export const defaultPublishTaskControls = (batchName = '单条分发'): PublishTaskControls => ({ batchName, initialState: 'execute' });
export function normalizePublishTaskControls(value: unknown, batchName = '单条分发'): PublishTaskControls {
  const input = value as Partial<PublishTaskControls> | undefined;
  return { batchName: typeof input?.batchName === 'string' ? input.batchName.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 80) : batchName, initialState: input?.initialState === 'paused' ? 'paused' : 'execute' };
}
export function publishTaskControlsError(value: unknown): string | undefined {
  const input = value as Record<string, unknown> | undefined;
  if (!input) return;
  if (typeof input.batchName !== 'string' || !input.batchName.trim() || input.batchName.length > 80 || /[\u0000-\u001f]/.test(input.batchName)) return '请填写1至80字的批次名称';
  if (!['execute', 'paused'].includes(String(input.initialState))) return '任务初始状态无效';
  if (input.pinWork || input.deleteLocalFiles || input.deletePreviousWork) return '当前版本未接通作品置顶或自动删除，未创建任务；不会忽略这些附加操作后发布';
}
