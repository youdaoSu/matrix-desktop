export const accountDragType = 'application/x-matrix-account-ids';
export function encodeAccountDrag(owner: string, ids: string[]) {
  return JSON.stringify({ owner, ids: [...new Set(ids)] });
}
export function decodeAccountDrag(text: string, owner: string, knownIds: string[]): string[] {
  try {
    if (text.length > 15000) return [];
    const value = JSON.parse(text);
    if (!owner || value.owner !== owner || !Array.isArray(value.ids) || !value.ids.length || value.ids.length > 100) return [];
    if (value.ids.some((id: unknown) => typeof id !== 'string' || !knownIds.includes(id))) return [];
    return [...new Set<string>(value.ids)];
  } catch { return []; }
}
