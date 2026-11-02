// Sort the merged feed BEFORE pagination, never one account at a time.
// Unknown times remain last and stable; IDs are not timestamp substitutes.
export function newestInteractionsFirst<T extends { displayTime?: string }>(rows: readonly T[]): T[] {
  const stamp = (row: T) => {
    if (typeof row.displayTime !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(row.displayTime)) return -Infinity;
    const value = Date.parse(row.displayTime);
    return Number.isFinite(value) ? value : -Infinity;
  };
  return rows.map((row,index)=>({row,index,at:stamp(row)})).sort((a,b)=>a.at===b.at?a.index-b.index:a.at>b.at?-1:1).map(item=>item.row);
}
