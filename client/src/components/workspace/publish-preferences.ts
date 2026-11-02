import { axiosForBackend, getAuthToken, getUser } from '@/api';
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
export async function loadPublishAccounts(options: {signal?: AbortSignal} = {}): Promise<PlatformAccount[]> {
  const owner = getUser()?.id, token = getAuthToken(), controller = new AbortController();
  if (!owner || !token) throw Error('请先登录远效后读取账号列表');
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, {once: true});
  if (options.signal?.aborted) cancel();
  const timer = setTimeout(cancel, 20000);
  const current = () => {
    if (controller.signal.aborted) throw Error('账号列表读取已取消或超时，请重试');
    if (getUser()?.id !== owner || getAuthToken() !== token) throw Error('登录用户已变化，已停止读取旧账号列表');
  };
  try {
    // An insertion/deletion between offset pages can duplicate one account and
    // omit another. Deduplicating at the end hid that omission. Retry the whole
    // read at most once, under the SAME cancellation/20-second deadline; never
    // publish a partially coherent list as a complete account snapshot.
    for (let snapshot = 0; snapshot < 2; snapshot++) {
      const items: PlatformAccount[] = [], ids = new Set<string>();
      let expectedTotal: number | undefined;
      for (let page = 1; ; page++) {
        current();
        let interrupted: (() => void) | undefined;
        const cancelled = new Promise<never>((_, reject) => { interrupted = () => reject(Error('账号列表读取已取消或超时，请重试')); controller.signal.addEventListener('abort', interrupted, { once: true }); });
        let response;
        try { response = await Promise.race([axiosForBackend.get('/api/platform/accounts', { params: { page, pageSize: 100 }, signal: controller.signal }), cancelled]); }
        finally { if (interrupted) controller.signal.removeEventListener('abort', interrupted); }
        current();
        const data = response.data?.data;
        if (!Array.isArray(data?.items) || data.items.length > 100 || !Number.isSafeInteger(data.total) || data.total < 0 || data.items.some((item: PlatformAccount | null) => !item || typeof item.id !== 'string' || !item.id.trim())) throw Error('账号列表响应不完整，请重试');
        if (expectedTotal !== undefined && expectedTotal !== data.total) break;
        expectedTotal = data.total;
        const nextIds = new Set<string>(data.items.map((item: PlatformAccount) => item.id));
        if (nextIds.size !== data.items.length || [...nextIds].some(id => ids.has(id))) break;
        if (items.length + data.items.length > data.total) throw Error('账号列表响应不完整，请重试');
        items.push(...data.items); for (const id of nextIds) ids.add(id);
        if (items.length === data.total) return items;
        if (data.items.length < 100) throw Error('账号列表分页不完整，已保留原数据，请刷新重试');
        if (page >= 100) throw Error('账号数量超过单次加载上限，请联系管理员');
      }
    }
    throw Error('账号列表在加载时持续变化，分页结果不一致；已保留原数据，请稍后刷新');
  } catch (error) { current(); throw error; }
  finally { clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); }
}
