import type { PlatformType } from '@shared/api.interface';
import { accountSiteForUrl, type AccountSite } from '@shared/account-sites';

export function AccountSiteNavigation({ platform, url, nickname, open }: {
  platform: PlatformType; url: string; nickname: string; open(site: AccountSite): void;
}) {
  const current = accountSiteForUrl(platform, url);
  return <div className="matrix-intent-bar" aria-label="账号前后台切换"><div>
    {(['manage', 'front'] as const).map(site => <button key={site} type="button"
      className={current === site ? 'is-active' : ''} aria-pressed={current === site}
      onClick={() => open(site)}>{site === 'manage' ? '账号后台' : '平台前台'}</button>)}
  </div><span>{nickname}</span></div>;
}
