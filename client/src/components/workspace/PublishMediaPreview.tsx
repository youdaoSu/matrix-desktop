import { useEffect, useRef, useState } from 'react';
import { getAuthToken } from '@/api';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export const safeLocalPreviewUrl = (value: unknown): value is string => {
  try { const url = new URL(typeof value === 'string' ? value : ''); return url.protocol === 'http:' && url.hostname === '127.0.0.1' && /^\/preview\/[A-Za-z0-9_-]{43}\/\d{1,2}$/.test(url.pathname) && !url.search && !url.hash && !url.username && !url.password; } catch { return false; }
};

export function useLocalPublishPreview(selectionId?: string, expectedType?: 'video' | 'image', count?: number) {
  const [preview, setPreview] = useState<MatrixPublishPreview>(), [error, setError] = useState(''), [loading, setLoading] = useState(false), [revision, setRevision] = useState(0);
  const token = getAuthToken(), current = useRef({ selectionId, token }); current.current = { selectionId, token };
  useEffect(() => {
    let alive = true, expired = false, previewId: string | undefined;
    const desktop = window.matrixDesktop;
    const valid = () => alive && !expired && current.current.selectionId === selectionId && getAuthToken() === token;
    setPreview(undefined); setError(''); setLoading(false);
    if (!selectionId) return;
    if (!token || !desktop?.rememberPublishMedia || !desktop.previewPublishMedia) { setError('当前桌面端不支持本地预览；素材仍保留，可更新后重试'); return; }
    setLoading(true);
    const timer = setTimeout(() => { if (valid()) { expired = true; setError('本地预览读取超时，原素材未改动，可重新加载预览'); setLoading(false); } }, 20000);
    void (async () => {
      const remembered = await desktop.rememberPublishMedia({ accessToken: token, selectionId, covers: [] });
      if (!valid()) return;
      if (remembered.error || !remembered.recoveryId) throw Error(remembered.error || '本地素材引用未生成');
      const result = await desktop.previewPublishMedia({ accessToken: token, recoveryId: remembered.recoveryId });
      previewId = result.previewId;
      if (!valid()) { if (previewId) void desktop.closePublishPreview(previewId).catch(() => {}); return; }
      if (result.error) throw Error(result.error);
      if (expectedType && result.mediaType !== expectedType || !result.files?.length || count !== undefined && result.files.length !== count || result.files.some(file => !safeLocalPreviewUrl(file.url))) throw Error('素材预览来源或文件数量不匹配，未显示其他内容');
      setPreview(result);
    })().catch(reason => { if (previewId) { void desktop.closePublishPreview(previewId).catch(() => {}); previewId = undefined; } if (valid()) setError(reason instanceof Error ? reason.message : '本地预览失败，素材未改动'); }).finally(() => { clearTimeout(timer); if (valid()) setLoading(false); });
    return () => { alive = false; clearTimeout(timer); if (previewId) void desktop?.closePublishPreview(previewId).catch(() => {}); };
  }, [selectionId, expectedType, count, token, revision]);
  return { preview, error, loading, retry: () => setRevision(value => value + 1), failed: setError };
}

export function PublishCoverThumbnail({ id, name }: { id: string; name: string }) {
  const { preview, error, failed } = useLocalPublishPreview(id, 'image', 1);
  return preview?.files?.[0] && !error ? <img className="matrix-editor-cover-thumb" src={preview.files[0].url} crossOrigin="anonymous" alt={`${name}封面预览`} onError={() => failed('封面预览不可用')} /> : <small>{error ? '封面预览暂不可用，原选择保留' : '正在读取封面…'}</small>;
}

export function PublishMediaPreview({ media, disabled, replace, remove, onCover, compact = false }: { media?: MatrixMediaSelection; disabled: boolean; replace(): void; remove(): void; onCover?(cover: { id: string; name: string; index: number }): void; compact?: boolean }) {
  const { preview, error, loading, retry, failed } = useLocalPublishPreview(media?.id, media?.mediaType, media?.files.length);
  const [capturing, setCapturing] = useState(false), [decoded, setDecoded] = useState(false);
  const video = useRef<HTMLVideoElement>(null), current = useRef({ media, token: getAuthToken() }), mounted = useRef(true);
  const token = getAuthToken(); current.current = { media, token };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => setDecoded(false), [media?.id, preview?.previewId]);
  const capture = async () => {
    const element = video.current, source = current.current.media, accessToken = token;
    if (disabled || capturing || !source || !accessToken || !element || !onCover) return;
    setCapturing(true);
    try {
      if (!window.matrixDesktop?.capturePublishFrame) throw Error('截帧功能需要新版远效桌面端');
      if (element.readyState < 2 || !element.videoWidth || !element.videoHeight || element.seeking) throw Error('请等待画面加载或拖动结束后，再截取当前帧');
      element.pause(); element.muted = true;
      const at = element.currentTime, canvas = document.createElement('canvas'), scale = Math.min(1, 1920 / element.videoWidth, 1080 / element.videoHeight);
      canvas.width = Math.max(1, Math.round(element.videoWidth * scale)); canvas.height = Math.max(1, Math.round(element.videoHeight * scale));
      const context = canvas.getContext('2d'); if (!context) throw Error('当前设备无法截取视频画面');
      context.drawImage(element, 0, 0, canvas.width, canvas.height);
      const result = await window.matrixDesktop.capturePublishFrame({ accessToken, selectionId: source.id, at, dataUrl: canvas.toDataURL('image/jpeg', .9) });
      if (!mounted.current || current.current.media?.id !== source.id || getAuthToken() !== accessToken) return;
      if (result.error || result.selection?.mediaType !== 'image' || result.selection.files.length !== 1) throw Error(result.error || '截取的封面未保存');
      onCover({ id: result.selection.id, name: result.selection.files[0].name, index: 1 }); toast.success('当前帧已保存为自定义主封面；尚未上传或发布');
    } catch (reason) { if (mounted.current && current.current.media?.id === source.id && getAuthToken() === accessToken) toast.error(reason instanceof Error ? reason.message : '截帧失败，原素材未改动'); }
    finally { if (mounted.current) setCapturing(false); }
  };
  if (!media) return null;
  return <section className={`matrix-editor-media-preview ${compact ? 'is-compact' : ''}`} aria-label="已选素材预览" data-preview-selection={media.id}>
    {preview?.files?.length && !error ? preview.mediaType === 'video' ? <video key={preview.files[0].url} ref={video} aria-label="发布视频预览" src={preview.files[0].url} crossOrigin="anonymous" controls muted playsInline preload="auto" onLoadedData={() => setDecoded(true)} onSeeking={() => setDecoded(false)} onSeeked={() => setDecoded(true)} onVolumeChange={event => { event.currentTarget.muted = true; }} onError={() => { setDecoded(false); failed('当前视频预览已失效或格式无法解码；可重新加载预览，原素材未被删除'); }} /> : <div className="matrix-editor-image-gallery">{preview.files.map((file, index) => <figure key={file.url}><img src={file.url} crossOrigin="anonymous" alt={`已选图片 ${index + 1}`} onError={() => failed('当前图片预览不可用；可重新加载预览，原素材未被删除')} /><figcaption>{index + 1}. {file.name}</figcaption></figure>)}</div> : null}
    {loading && <p role="status">正在生成本地素材预览…</p>}{error && <p role="status">{error}<Button variant="outline" size="sm" disabled={disabled} onClick={retry}>重新加载预览</Button></p>}
    <p className="matrix-editor-media-filenames">{media.files.map(file => `${file.name} · ${(file.size / 1048576).toFixed(1)} MB`).join('；')}</p>
    <div className="matrix-editor-media-actions">{media.mediaType === 'video' && onCover && <Button variant="outline" disabled={disabled || capturing || !decoded} onClick={() => void capture()}>{capturing ? '正在保存封面…' : '截取当前帧为封面'}</Button>}<Button variant="outline" disabled={disabled || capturing} onClick={replace}>重新上传</Button><Button variant="ghost" disabled={disabled || capturing} onClick={remove}>{media.mediaType === 'video' ? '移除视频' : '移除图片'}</Button></div>
    <small>本地预览不代表已上传平台；移除仅取消本页素材选择，不删除磁盘文件。发布完成前请勿移动、重命名或删除原素材。</small>
  </section>;
}
