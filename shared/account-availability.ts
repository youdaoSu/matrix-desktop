import type { PlatformAccount } from './api.interface';

export type AccountAvailability = 'normal' | 'offline' | 'abnormal' | 'banned' | 'unknown';
export interface AccountObservation { state: AccountAvailability; reason: string; checkedAt: number; lastAttemptAt?: number; transientReason?: string }
export type AvailabilityAccount = Pick<PlatformAccount, 'authStatus'> & Partial<Pick<PlatformAccount, 'healthStatus' | 'authExpiresAt'>>;
export function accountAppearance(account: AvailabilityAccount, observation?: AccountObservation, now = Date.now()) {
  const appearance = (state: AccountAvailability, label: string, reason: string) => ({ state, label, reason, grayscale: ['offline','abnormal','banned'].includes(state), icon: state === 'normal' ? 'check' : state === 'unknown' ? 'unknown' : 'error' });
  const expiry = account.authExpiresAt ? Date.parse(account.authExpiresAt) : undefined;
  if (observation?.state === 'banned') return appearance('banned', '已封禁', observation.reason);
  if (account.healthStatus === 'error' || account.healthStatus === 'warning') return appearance('abnormal', '账号异常', '账号健康状态异常，请在官方后台核验；不据此推断封禁');
  if (account.authStatus === 'error') return appearance('abnormal', '授权异常', '账号授权异常，请重新核验官方登录');
  if (account.authStatus === 'expired' || expiry !== undefined && Number.isFinite(expiry) && expiry <= now) return appearance('offline', '离线', '登录授权已失效，请在账号管理重新登录');
  if (account.authStatus === 'pending') return appearance('offline', '未绑定', '尚未完成官方账号识别与绑定');
  if (account.authStatus !== 'authorized' || account.healthStatus !== 'normal' || expiry !== undefined && !Number.isFinite(expiry)) return appearance('unknown', '待核验', '账号状态信息不完整，不能显示正常标识');
  if (observation) {
    if (observation.state === 'normal' && now - observation.checkedAt > 24 * 60 * 60 * 1000) return appearance('unknown', '后台复核中', '上次官方状态检查已超过一天，后台会自动复核；不据此判定离线');
    const labels: Record<AccountAvailability, string> = { normal: '正常', offline: '离线', abnormal: '账号异常', banned: '已封禁', unknown: '待核验' };
    return appearance(observation.state, labels[observation.state], observation.reason);
  }
  return appearance('normal', '正常', '最近绑定与健康状态正常；实时登录状态以打开官方后台后的检查为准');
}
export function officialLoginUrl(platform: string, rawUrl: string) {
  const domains: Record<string, string> = { douyin: 'douyin.com', xiaohongshu: 'xiaohongshu.com', bilibili: 'bilibili.com', wechat: 'weixin.qq.com' };
  try {
    const url = new URL(rawUrl), domain = domains[platform];
    if (!domain || url.protocol !== 'https:' || url.username || url.password || !(url.hostname === domain || url.hostname.endsWith('.' + domain))) return false;
    return /(^|\.)(passport|login)\./i.test(url.hostname) || /(?:^|\/)(?:login(?:\.html)?|signin|passport)(?:\/|$)/i.test(url.pathname) || /(?:^#|\/)(?:login|signin)(?:[/?]|$)/i.test(url.hash);
  } catch { return false; }
}
