import { useEffect, useRef, useState } from 'react';
import type { PlatformAccount } from '@shared/api.interface';
import type { DouyinInteractionRow } from '@shared/douyin-interactions';
import { getAuthToken, getUser } from '@/api';
import { useWorkspaceIdentity } from './WorkspaceUiState';
import { enqueueImagePreview } from './image-preview-queue';

export function useInteractionImage({ account, row, kind, target, imageIndex, urls }: { account?: PlatformAccount; row: DouyinInteractionRow; kind: 'comments' | 'followers'; target: 'avatar' | 'comment-image'; imageIndex?: number; urls: string[] }) {
  const lease = useWorkspaceIdentity(), host = useRef<HTMLSpanElement>(null), owner = getUser()?.id, token = getAuthToken();
  const scope = JSON.stringify([lease, account?.id, account?.connectorSessionId, account?.nativeAccountKey, row.platformId, row.platformUserId, row.authorProfileUrl, row.workId, target, imageIndex, urls]);
  // Native code resolves only this cached row's exact official profile; no
  // renderer URL is sent. A stuck roster must not permanently block avatars.
  const supplement = kind === 'followers' && target === 'avatar' && row.platformId === row.platformUserId && /^https:\/\/www\.douyin\.com\/user\/MS4w[A-Za-z0-9_-]{1,250}\/?$/.test(row.authorProfileUrl || '');
  const available = !!account?.connectorSessionId && !!account?.nativeAccountKey && !!window.matrixDesktop?.douyinInteractionImage && (urls.length > 0 || supplement);
  const [near, setNear] = useState({ scope: '', visible: false }), [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState({ scope: '', dataUrl: '', error: '', warning: '', busy: false });
  const deferred = useRef({ scope: '', count: 0 });
  useEffect(() => {
    if (!available) return;
    let alive = true;
    if (typeof IntersectionObserver === 'undefined') { setNear({ scope, visible: true }); return; }
    const observer = new IntersectionObserver(entries => { if (alive && entries.some(entry => entry.isIntersecting)) { setNear({ scope, visible: true }); observer.disconnect(); } }, { rootMargin: '160px' });
    if (host.current) observer.observe(host.current);
    return () => { alive = false; observer.disconnect(); };
  }, [scope, available]);
  useEffect(() => {
    if (!available || near.scope !== scope || !near.visible || !account || !owner || !token) return;
    let alive = true, retryTimer: ReturnType<typeof setTimeout> | undefined;
    const previewAbort = new AbortController();
    if (deferred.current.scope !== scope) deferred.current = { scope, count: 0 };
    const current = () => alive && owner === getUser()?.id && token === getAuthToken();
    setSnapshot({ scope, dataUrl: '', error: '', warning: '', busy: true });
    const admitted = enqueueImagePreview(async () => {
      if (!current()) return;
      try {
        const result = await window.matrixDesktop!.douyinInteractionImage({ accessToken: token, accountId: account.id, kind, recordId: row.platformId, ...(kind === 'comments' ? { workId: row.workId } : {}), target, ...(target === 'comment-image' ? { imageIndex } : {}) });
        if (!current()) return;
        if (result.error) {
          // Only a native, typed readiness result can defer a read. Denials,
          // identity conflicts and malformed responses never auto-retry.
          if (result.retryAfterMs === 2000 && deferred.current.count < 3) {
            deferred.current.count++;
            retryTimer = setTimeout(() => { if (current()) setAttempt(value => value + 1); }, 2000);
          }
          throw Error(result.error);
        }
        if (result.accountId !== account.id || result.sessionId !== account.connectorSessionId || !result.attachment || !/^data:image\/(?:png|jpeg|gif|webp);base64,/.test(result.attachment.dataUrl) || !Number.isSafeInteger(result.attachment.bytes) || result.attachment.bytes < 1 || result.attachment.bytes > 8 * 1024 * 1024) throw Error('互动图片预览结果未通过校验');
        setSnapshot({ scope, dataUrl: result.attachment.dataUrl, error: '', warning: result.attachment.cacheWarning?.slice(0, 200) || '', busy: false });
      } catch (error) { if (current()) setSnapshot({ scope, dataUrl: '', error: error instanceof Error ? error.message.slice(0, 200) : '互动图片预览失败', warning: '', busy: false }); }
    }, previewAbort.signal);
    if (!admitted) setSnapshot({ scope, dataUrl: '', error: '图片预览队列繁忙，请稍后再试', warning: '', busy: false });
    return () => { alive = false; previewAbort.abort(); clearTimeout(retryTimer); };
  }, [scope, available, near.scope, near.visible, attempt]);
  const image = snapshot.scope === scope ? snapshot : { dataUrl: '', error: '', warning: '', busy: false };
  return { ...image, host, available, near: near.scope === scope && near.visible, retry: () => setAttempt(value => value + 1) };
}
