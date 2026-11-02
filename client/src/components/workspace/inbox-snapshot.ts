// IPC snapshots are structured-cloned JSON-like data. Compare all fields rather
// than just the revision: status and errors can change without a store write.
export function sameInboxSnapshot(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) return false;
  const left = Object.keys(a), right = Object.keys(b);
  if (left.length !== right.length) return false;
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
  return left.every(key => Object.prototype.hasOwnProperty.call(y, key) && sameInboxSnapshot(x[key], y[key]));
}
