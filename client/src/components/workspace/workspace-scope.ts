import type { PlatformType } from '@shared/api.interface';

export type WorkspaceIntent = 'manage' | 'publish' | 'comments' | 'messages' | 'withdraw';

// Only feature pages own official browsers. The dashboard, settings and docs do not.
export function workspaceScope(pathname: string): string | null {
  return pathname === '/accounts' || /^\/(publish|engage|automation|analytics)(\/|$)/.test(pathname) ? pathname : null;
}

export function workspaceIntent(scope: string | null): WorkspaceIntent {
  if (scope?.startsWith('/publish')) return 'publish';
  if (scope && /comment|batch-tasks|account-operations/.test(scope)) return 'comments';
  if (scope && /message|keywords|welcome|offline/.test(scope)) return 'messages';
  return 'manage';
}

export function foregroundTabId(platform: PlatformType, sessionId: string, scope: string) {
  return `${platform}-${sessionId}${scope === '/accounts' ? '' : '-module-' + scope.slice(1).replace(/\//g, '-')}`;
}
