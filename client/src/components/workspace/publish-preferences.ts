import { axiosForBackend, getUser } from '@/api';
import type { PlatformAccount } from '@shared/api.interface';
import type { PublishConfig } from '@shared/publish-config';
export interface AccountList { id: string; name: string; ids: string[] }
export interface PublishPreferences { lists: AccountList[]; remember: boolean; configs: Record<string, Pick<PublishConfig, 'options' | 'extras'>> }
const key = () => `matrix-publish-preferences:${getUser()?.id || 'anonymous'}`;
export function readPublishPreferences(): PublishPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(key()) || '{}');
    return { lists: Array.isArray(value.lists) ? value.lists.filter((list: AccountList) => typeof list?.id === 'string' && typeof list?.name === 'string' && Array.isArray(list.ids)) : [], remember: value.remember === true, configs: value.configs && typeof value.configs === 'object' ? value.configs : {} };
  } catch { return { lists: [], remember: false, configs: {} }; }
}
export function savePublishPreferences(patch: Partial<PublishPreferences>) {
  localStorage.setItem(key(), JSON.stringify({ ...readPublishPreferences(), ...patch }));
}
export async function loadPublishAccounts(): Promise<PlatformAccount[]> {
  const items: PlatformAccount[] = [];
  for (let page = 1; ; page++) {
    const response = await axiosForBackend.get('/api/platform/accounts', { params: { page, pageSize: 100 } });
    const data = response.data?.data;
    if (!Array.isArray(data?.items)) throw Error('账号列表响应不完整，请重试');
    items.push(...data.items);
    if (items.length >= data.total || data.items.length < 100) return [...new Map(items.map(account => [account.id, account])).values()];
    if (page >= 100) throw Error('账号数量超过单次加载上限，请联系管理员');
  }
}
