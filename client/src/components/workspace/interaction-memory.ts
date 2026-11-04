// These limits measure serialized record payload, not total JavaScript heap.
export const interactionEntryBytes = 32 * 1024 * 1024;
export const interactionTotalBytes = 128 * 1024 * 1024;
const encoder = new TextEncoder();

export function interactionRowBytes(row: object): number {
  return encoder.encode(JSON.stringify(row)).length;
}

// Do not allocate one giant JSON string plus a second UTF-8 buffer for a roster.
export function interactionRowsBytes(rows: readonly object[]): number {
  if (rows.length > 50000) throw Error('本轮达到读取容量上限，已有结果保留，尚未全部读取');
  let bytes = 2;
  for (let i = 0; i < rows.length; i++) {
    bytes += interactionRowBytes(rows[i]) + (i ? 1 : 0);
    if (bytes > interactionEntryBytes) throw Error('本轮达到读取容量上限，已有结果保留，尚未全部读取');
  }
  return bytes;
}

export function assertInteractionBudget(entries: ReadonlyMap<string, { bytes: number }>, id: string, bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes < 2 || bytes > interactionEntryBytes) throw Error('本轮达到读取容量上限，已有结果保留，尚未全部读取');
  let total = bytes;
  for (const [key, entry] of entries) if (key !== id) total += entry.bytes;
  if (total > interactionTotalBytes) throw Error('互动缓存达到内存预算，本轮读取暂停；已有记录和本地存档保留');
}

export function retainInteractionKeys(collection: Map<string, unknown> | Set<string>, valid: ReadonlySet<string>) {
  for (const key of collection.keys()) if (!valid.has(key)) collection.delete(key);
}
