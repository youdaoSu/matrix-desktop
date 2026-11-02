// One component-local immutable projection. No global body/credential cache,
// persistence or inferred membership; provider arrays are immutable snapshots.
type Source<T> = { accountId: string; accountNickname: string; sessionId?: string; nativeKey?: string; rows?: readonly T[] };
export function createInteractionProjection<T extends { isCurrentFollower?: boolean }>() {
  let previous: { lease: string; kind: string; sources: Source<T>[]; rows: (T & { accountId: string; accountNickname: string })[] } | undefined;
  return (lease: string, kind: 'comments' | 'followers', sources: readonly Source<T>[]) => {
    if (previous && previous.lease === lease && previous.kind === kind && previous.sources.length === sources.length && sources.every((source, index) => {
      const before = previous!.sources[index];
      return source.accountId === before.accountId && source.accountNickname === before.accountNickname && source.sessionId === before.sessionId && source.nativeKey === before.nativeKey && source.rows === before.rows;
    })) return previous.rows;
    const rows = sources.flatMap(source => (source.rows || []).filter(row => kind !== 'followers' || row.isCurrentFollower !== false).map(row => ({ ...row, accountId: source.accountId, accountNickname: source.accountNickname })));
    previous = { lease, kind, sources: sources.map(source => ({ ...source })), rows };
    return rows;
  };
}
