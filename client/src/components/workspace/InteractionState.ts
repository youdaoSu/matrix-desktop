import { useEffect } from 'react';
import type { PlatformAccount } from '@shared/api.interface';
import { uiOneOf, useWorkspacePreference } from './WorkspaceUiState';

const platformValue = uiOneOf(['douyin', 'xiaohongshu', 'wechat', 'bilibili'] as const);
export function useInteractionPlatform() { return useWorkspacePreference<string>('interaction.platform', 'douyin', platformValue); }
type Selection = { id: string; session: string } | null;
function selectionValue(value: unknown): value is Selection {
  if (value === null) return true;
  const item = value as Exclude<Selection, null>;
  return !!item && Object.keys(item).length === 2 && typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 160 && typeof item.session === 'string' && item.session.length <= 200;
}
export function useInteractionAccount(platform: string, scope: string, accounts: PlatformAccount[], loaded: boolean) {
  const [selection, setSelection] = useWorkspacePreference<Selection>(`interaction.${scope}.${platform}.account`, null, selectionValue);
  const account = selection ? accounts.find(item => item.id === selection.id && item.platform === platform && (item.connectorSessionId || '') === selection.session) || null : null;
  useEffect(() => { if (loaded && selection && !account) setSelection(null); }, [loaded, selection, account, setSelection]);
  return [account, (item: PlatformAccount | null) => {
    if (!item) setSelection(null);
    else if (item.platform === platform) setSelection({ id: item.id, session: item.connectorSessionId || '' });
  }] as const;
}
