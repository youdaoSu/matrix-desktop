import { useEffect, useState } from 'react';
import type { PlatformAccount, PlatformType } from '@shared/api.interface';
import { PlatformLogo } from './PlatformLogo';
import { accountAppearance } from '@shared/account-availability';
import { useAccountObservation } from './account-observations';

export const accountPlatformMeta = {
  douyin: { label: '抖音', color: '#202027' },
  xiaohongshu: { label: '小红书', color: '#ef3f58' },
  wechat: { label: '视频号', color: '#ef9628' },
  bilibili: { label: 'B站', color: '#fb7299' },
};

function Portrait({url,label,initial}:{url:string;label:string;initial:string}){
  const [phase,setPhase]=useState<'loading'|'ready'|'error'>(url?'loading':'error'),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    if(!url||phase!=='error'||attempt>=2)return;
    const timer=window.setTimeout(()=>{setAttempt(value=>value+1);setPhase('loading');},attempt===0?1000:3000);
    return()=>window.clearTimeout(timer);
  },[url,phase,attempt]);
  return !url||phase==='error'
    ? <span className="matrix-account-avatar-fallback" data-avatar-load-state={url?'error':'missing'} aria-label={`${label}头像暂不可用`}>{initial}</span>
    : <img key={attempt} src={url} alt={`${label}账号头像`} data-avatar-load-state={phase} referrerPolicy="no-referrer" draggable={false} onLoad={()=>setPhase('ready')} onError={()=>setPhase('error')} />;
}

export function AccountAvatar({ account, size = 'md', status = false, className = '' }: {
  account: Pick<PlatformAccount, 'platform' | 'nickname' | 'avatarUrl' | 'authStatus'> & Partial<Pick<PlatformAccount, 'id' | 'connectorSessionId' | 'healthStatus' | 'authExpiresAt' | 'bindTime' | 'createdAt' | 'lastVerifiedAt'>>;
  size?: 'xs' | 'sm' | 'md' | 'lg'; status?: boolean; className?: string;
}) {
  const observation = useAccountObservation(account);
  const appearance = accountAppearance(account, observation);
  const statusTip=[`${appearance.label}：${appearance.reason}`,observation?.checkedAt?`最近状态检查：${new Date(observation.checkedAt).toLocaleString('zh-CN')}`:'',observation?.transientReason?`后台最近读取：${observation.transientReason}；将自动重试`:'',account.bindTime||account.createdAt?`绑定时间：${new Date(account.bindTime||account.createdAt!).toLocaleString('zh-CN')}`:''].filter(Boolean).join('\n');
  let url = '';
  try { const parsed = new URL(account.avatarUrl || ''); if (['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password) { parsed.protocol = 'https:'; url = parsed.href; } } catch { /* Initials stay visible when no valid avatar is available. */ }
  const meta = accountPlatformMeta[account.platform as PlatformType];
  return <span className={`matrix-account-avatar size-${size} ${appearance.grayscale ? 'is-unavailable' : ''} ${className}`} data-account-availability={appearance.state} style={{ '--platform-color': meta.color } as React.CSSProperties}>
    <Portrait key={`${account.id||''}:${account.connectorSessionId||''}:${url}`} url={url} label={account.nickname||meta.label} initial={(account.nickname||meta.label).slice(0,1)}/>
    <i className="matrix-account-platform-badge" title={meta.label}><PlatformLogo platform={account.platform} size={size === 'xs' ? 10 : 16} /></i>
    {status && appearance.grayscale && size !== 'xs' && <span className="matrix-account-offline-label" aria-hidden="true">{appearance.state === 'banned' ? '封禁' : appearance.state === 'unknown' ? '待核验' : '离线'}</span>}
    {status && <i className={`matrix-account-session-mark ${appearance.icon === 'check' ? 'is-authorized' : appearance.icon === 'error' ? 'is-error' : 'is-unknown'}`} role="img" aria-label={`账号状态：${appearance.label}`} title={statusTip}>{appearance.icon === 'check' ? '✓' : appearance.icon === 'error' ? '×' : '?'}</i>}
  </span>;
}
