import { Inbox } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { PlatformAccount } from '@shared/api.interface';
import { axiosForBackend } from '@/api';
import { platformLabels } from './OfficialWorkspace';
import { uiBoolean, uiDate, uiText, useWorkspaceIdentity, useWorkspacePreference } from './WorkspaceUiState';
import { getAuthToken, getUser } from '@/api';

export function InteractionEmpty({ children }: { children: ReactNode }) {
  return <div className="matrix-interaction-empty"><Inbox size={42} strokeWidth={1.2} aria-hidden="true" /><span>{children}</span></div>;
}

export function interactionPlatform(value: string): string { return Object.prototype.hasOwnProperty.call(platformLabels, value) ? value : 'douyin'; }
export function InteractionPlatformSelect({ value, onChange }: { value: string; onChange(value: string): void; allowAll?: boolean }) {
  return <select className="matrix-interaction-select" aria-label="互动平台筛选" value={interactionPlatform(value)} onChange={event => onChange(interactionPlatform(event.target.value))}>{Object.entries(platformLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>;
}

export function InteractionStatusTabs({ value, onChange }: { value: string; onChange(value: string): void }) {
  return <div className="matrix-interaction-segments" aria-label="回复状态筛选">{[['all', '所有'], ['pending', '未回复'], ['replied', '已回复']].map(([key, label]) => <button type="button" key={key} aria-pressed={value === key} className={value === key ? 'is-active' : ''} onClick={() => onChange(key)}>{label}</button>)}</div>;
}

export function InteractionTools({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  const [expanded, setExpanded] = useWorkspacePreference(`interaction.tools.${title}`, open, uiBoolean);
  return <details className="matrix-interaction-tools" open={expanded} onToggle={event => { if (event.currentTarget.open !== expanded) setExpanded(event.currentTarget.open); }}><summary>{title}</summary><div>{children}</div></details>;
}

// Group/date filtering is deliberately scoped to the currently loaded records.
export function useInteractionFilters(platform: string, scope = 'aggregate') {
  const lease = useWorkspaceIdentity();
  const [snapshot, setSnapshot] = useState<{ lease: string; accounts: PlatformAccount[]; loaded: boolean }>({ lease: '', accounts: [], loaded: false });
  const accounts = snapshot.lease === lease ? snapshot.accounts : [];
  const loaded = snapshot.lease === lease && snapshot.loaded;
  const [group, setGroup] = useWorkspacePreference(`interaction.${scope}.${platform}.group`, '', uiText);
  const [start, setStart] = useWorkspacePreference(`interaction.${scope}.${platform}.start`, '', uiDate);
  const [end, setEnd] = useWorkspacePreference(`interaction.${scope}.${platform}.end`, '', uiDate);
  const [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    const owner = getUser()?.id, token = getAuthToken(); let sequence = 0;
    const current = (id: number) => !abort.signal.aborted && id === sequence && owner === getUser()?.id && token === getAuthToken();
    const load = () => {
      const id = ++sequence; setError('');
      return axiosForBackend.get('/api/platform/accounts', { params: { page: 1, pageSize: 100 }, signal: abort.signal })
        .then(response => { if (current(id)) setSnapshot({ lease, accounts: response.data.data.items, loaded: true }); })
        .catch(() => { if (current(id)) setError('分组账号加载失败，请刷新互动账号重试'); });
    };
    if (owner && token) void load();
    const changed = () => { void load(); };
    window.addEventListener('matrix:accounts-updated', changed); window.addEventListener('matrix:account-profile-updated', changed);
    return () => { abort.abort(); window.removeEventListener('matrix:accounts-updated', changed); window.removeEventListener('matrix:account-profile-updated', changed); };
  }, [lease]);
  const platformAccounts = accounts.filter(account => account.platform === interactionPlatform(platform));
  useEffect(() => { if (loaded && group && !platformAccounts.some(account => (account.groupName || '默认分组') === group)) setGroup(''); }, [loaded, accounts, platform, group, setGroup]);
  const visibleAccounts = platformAccounts.filter(account => !group || (account.groupName || '默认分组') === group);
  const invalidRange = !!start && !!end && start > end;
  const matches = (accountId: string, timestamp?: string) => {
    if (!visibleAccounts.some(account => account.id === accountId)) return false;
    if (invalidRange) return false;
    if (!start && !end) return true;
    const date = timestamp ? new Date(timestamp) : null;
    if (!date || !Number.isFinite(date.getTime())) return false;
    const day = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    return (!start || day >= start) && (!end || day <= end);
  };
  return { accounts: platformAccounts, loaded, visibleAccounts, group, setGroup, start, setStart, end, setEnd, error, invalidRange, matches };
}

export function InteractionAggregateFilters({ filter, accountId, onAccount }: { filter: ReturnType<typeof useInteractionFilters>; accountId?: string; onAccount(account: PlatformAccount | null): void }) {
  return <><select className="matrix-interaction-select" aria-label="互动分组筛选" value={filter.group} onChange={event => { filter.setGroup(event.target.value); onAccount(null); }}><option value="">全部分组</option>{[...new Set(filter.accounts.map(account => account.groupName || '默认分组'))].map(group => <option value={group} key={group}>{group}</option>)}</select><select className="matrix-interaction-select" aria-label="互动账号筛选" value={accountId || ''} onChange={event => onAccount(filter.accounts.find(account => account.id === event.target.value) || null)}><option value="">全部账号</option>{filter.visibleAccounts.map(account => <option value={account.id} key={account.id}>{account.nickname || '未命名账号'}</option>)}</select><div className="matrix-interaction-dates" title="日期筛选仅在当前已加载记录中生效"><input type="date" aria-label="互动开始日期" value={filter.start} onChange={event => filter.setStart(event.target.value)} /><span>→</span><input type="date" aria-label="互动结束日期" min={filter.start || undefined} value={filter.end} onChange={event => filter.setEnd(event.target.value)} /></div>{(filter.error || filter.invalidRange) && <small role="alert">{filter.error || '结束日期不能早于开始日期'}</small>}</>;
}

export function exportInteractionRecords(kind: string, records: unknown[]) {
  const blob = new Blob([JSON.stringify({ kind, source: '远效已同步记录（当前筛选结果，非平台全量数据）', exportedAt: new Date().toISOString(), records }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `matrix-${kind}-${Date.now()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
