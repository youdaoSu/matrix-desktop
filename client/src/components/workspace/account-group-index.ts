import type { AccountGroup, PlatformAccount } from '@shared/api.interface';

// Index one account list once, retaining the legacy name/default fallback and
// exact input order. An explicit groupId always takes precedence over a name.
export function indexAccountsByGroup(accounts: PlatformAccount[], groups: AccountGroup[]) {
  const result = new Map<string, PlatformAccount[]>(), names = new Map<string, string[]>();
  const defaults: string[] = [];
  for (const group of groups) { result.set(group.id, []); const ids = names.get(group.groupName) || []; ids.push(group.id); names.set(group.groupName, ids); if (group.isDefault) defaults.push(group.id); }
  for (const account of accounts) {
    const named = typeof account.groupName === 'string' ? names.get(account.groupName) || [] : [];
    const ids = account.groupId ? [account.groupId] : account.groupName ? named : [...new Set([...named, ...defaults])];
    for (const id of ids) result.get(id)?.push(account);
  }
  return result;
}
