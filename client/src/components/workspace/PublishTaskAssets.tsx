import { useState } from 'react';
import { ImageIcon, Video } from 'lucide-react';
import type { PlatformType } from '@shared/api.interface';
import { PublishPlatformIcon } from './PublishAccountPicker';

export function PublishTaskAvatar({ nickname, platform, url }: { nickname: string; platform: PlatformType; url?: string }) {
  const [failedUrl, setFailedUrl] = useState('');
  let safe = false;
  try { const parsed = new URL(url || ''); safe = parsed.protocol === 'https:' && !parsed.username && !parsed.password; } catch { /* Show a labelled fallback. */ }
  return <span className={`matrix-task-avatar platform-${platform}`}>
    {safe && failedUrl !== url ? <img src={url} alt={`${nickname}账号头像`} referrerPolicy="no-referrer" onError={() => setFailedUrl(url || '')} /> : <span aria-label={`${nickname}头像暂不可用`}>{(nickname || '账').slice(0, 1)}</span>}
    <PublishPlatformIcon platform={platform} />
  </span>;
}
export function PublishTaskMedia({ thumbnail, type, count, title }: { thumbnail?: string; type?: 'image' | 'video'; count: number; title: string }) {
  const [failed, setFailed] = useState(false);
  const safe = thumbnail && thumbnail.length <= 120030 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(thumbnail);
  const Icon = type === 'image' ? ImageIcon : Video;
  return <div className="matrix-task-media" title={title}>
    {safe && !failed ? <img src={thumbnail} alt={`${title || '作品'}${type === 'image' ? '图文预览' : '视频封面'}`} onError={() => setFailed(true)} /> : <div className="matrix-task-media-missing"><Icon size={25} /><span>预览暂不可用</span></div>}
    <small>{type === 'image' ? '图文' : '视频'}{count > 1 ? ` · ${count} 张` : ''}</small>
  </div>;
}
