import { useState, type CSSProperties } from 'react';
import { officialPlatformLogos } from './platform-logo-assets';
import { extraPlatformLogos } from './extra-platform-logo-assets';
import catalog from '../../../../desktop/account-platforms.json';

const logoLabels: Record<string, string> = { ...Object.fromEntries(catalog.map(entry => [entry.id, entry.label])), bilibili: 'B站' };
const logos: Record<string, { src: string }> = { ...officialPlatformLogos, ...extraPlatformLogos, wechat_mcn: officialPlatformLogos.wechat };

/** The platform's own artwork, not a generic UI icon. Account photos stay separate. */
export function PlatformLogo({ platform, size = 24, className = '' }: { platform: string; size?: number; className?: string }) {
  const [failedPlatform, setFailedPlatform] = useState<string>();
  const label = logoLabels[platform] || '自定义平台', asset = logos[platform];
  return <span className={`matrix-platform-logo ${className}`} data-platform-logo={platform} role="img" aria-label={`${label} Logo`} title={label} style={{ '--platform-logo-size': `${size}px` } as CSSProperties}>
    {asset && failedPlatform !== platform ? <img src={asset.src} alt="" aria-hidden="true" draggable={false} onError={() => setFailedPlatform(platform)} /> : <span title={platform === 'custom' ? '自定义平台没有固定品牌 Logo' : '官方 Logo 待核验'}>{platform === 'custom' ? '自定义' : label}</span>}
  </span>;
}
