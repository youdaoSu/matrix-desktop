import type { PlatformType } from './api.interface';

export type AccountSite = 'manage' | 'front';
// Fixed official entry points, not caller-supplied URLs or guessed own-profile IDs.
export const accountSites: Record<PlatformType, Record<AccountSite, string>> = {
  douyin: { manage: 'https://creator.douyin.com/', front: 'https://www.douyin.com/' },
  xiaohongshu: { manage: 'https://creator.xiaohongshu.com/', front: 'https://www.xiaohongshu.com/explore' },
  bilibili: { manage: 'https://member.bilibili.com/', front: 'https://www.bilibili.com/' },
  wechat: { manage: 'https://channels.weixin.qq.com/', front: 'https://channels.weixin.qq.com/web/pages/home' },
};

export function accountSiteForUrl(platform: PlatformType, raw: string): AccountSite | undefined {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return;
    if (platform === 'wechat') {
      if (url.hostname !== 'channels.weixin.qq.com') return;
      return /^\/web(?:\/|$)/.test(url.pathname) ? 'front' : 'manage';
    }
    if (url.hostname === new URL(accountSites[platform].manage).hostname) return 'manage';
    if (url.hostname === new URL(accountSites[platform].front).hostname) return 'front';
  } catch { /* An unrelated or invalid URL is not an account site. */ }
}
