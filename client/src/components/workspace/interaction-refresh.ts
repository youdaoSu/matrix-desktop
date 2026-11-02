import type { InteractionKind, VisibleInteraction } from '@shared/interaction-snapshot';

export type InteractionTarget = { id: string; platform: string; connectorSessionId?: string };
export type InteractionRead = { error?: string; records?: VisibleInteraction[]; source?: string; capturedAt?: string; accountId?: string; sessionId?: string; platform?: string; kind?: InteractionKind };
export type InteractionRefreshState = { phase: 'waiting' | 'reading' | 'live' | 'error'; message: string; attemptedAt?: number; nextAt?: number };

// Pure read scheduler: no navigation, clicks, sending, unread writes or login.
// Missing pages and failed reads never replace an earlier successful snapshot.
export function createInteractionRefresh<T extends InteractionTarget, P>(deps: {
  kind: InteractionKind; current(): boolean; paused(): boolean; accounts(): T[];
  page(account: T): P | undefined; read(page: P, account: T): Promise<InteractionRead>;
  result(account: T, result: InteractionRead): void;
  status(account: T, status: InteractionRefreshState): void;
  now?(): number; timeoutMs?: number;
}) {
  const now = deps.now || Date.now, next = new Map<string, { at: number; failures: number }>();
  let disposed = false, running = false, generation = 0;
  const key = (account: T) => `${account.id}:${account.platform}:${account.connectorSessionId}`;
  const current = (account: T, epoch: number) => !disposed && deps.current() && epoch === generation && deps.accounts().some(item => key(item) === key(account));
  return {
    get running() { return running; },
    async tick(force = false) {
      if (disposed || !deps.current() || deps.paused() || running) return;
      running = true; const epoch = generation;
      const targets = deps.accounts().filter(account => account.connectorSessionId);
      const keys = new Set(targets.map(key)); for (const old of next.keys()) if (!keys.has(old)) next.delete(old);
      const queue = targets.filter(account => force || (next.get(key(account))?.at || 0) <= now());
      const worker = async () => {
        while (queue.length && !disposed && deps.current() && !deps.paused() && epoch === generation) {
          const account = queue.shift()!; if (!current(account, epoch)) continue;
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            const page = deps.page(account);
            if (!page) {
              next.set(key(account), { at: now() + 2000, failures: 0 });
              deps.status(account, { phase: 'waiting', message: '尚未连接本模块的官方列表；打开列表后自动读取，不点击具体私信会话。' });
              continue;
            }
            deps.status(account, { phase: 'reading', message: '正在只读更新官方列表…', attemptedAt: now() });
            const result = await Promise.race([Promise.resolve().then(() => deps.read(page, account)), new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(Error('官方列表读取超过20秒，保留上次结果，稍后自动重试')), deps.timeoutMs ?? 20000);
            })]);
            if (!current(account, epoch)) continue;
            if (result.error) throw Error(result.error);
            if (result.accountId !== account.id || result.sessionId !== account.connectorSessionId || result.platform !== account.platform || result.kind !== deps.kind) throw Error('官方读取结果与当前账号或模块不一致，已忽略；请更新桌面端或重新连接列表');
            if (!Array.isArray(result.records) || !result.source || !result.capturedAt) throw Error('官方读取结果缺少来源，未当作空列表');
            deps.result(account, result);
            const at = now() + 10000; next.set(key(account), { at, failures: 0 });
            deps.status(account, { phase: 'live', message: '自动更新中 · 每10秒读取已加载列表', attemptedAt: now(), nextAt: at });
          } catch (error) {
            if (!current(account, epoch)) continue;
            const failures = (next.get(key(account))?.failures || 0) + 1, at = now() + Math.min(120000, 15000 * 2 ** Math.min(failures - 1, 3));
            next.set(key(account), { at, failures });
            deps.status(account, { phase: 'error', message: error instanceof Error ? error.message : '官方列表读取失败；保留上次结果，稍后自动重试', attemptedAt: now(), nextAt: at });
          } finally { clearTimeout(timer); }
        }
      };
      try { await Promise.all([worker(), worker()]); } finally { running = false; }
    },
    invalidate() { generation++; next.clear(); },
    dispose() { disposed = true; generation++; next.clear(); },
  };
}
