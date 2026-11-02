import { useEffect, useId, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { getAuthToken } from '@/api';
import { applyPublishExtraction, extractPublishTopics, type PublishExtractionData, type PublishExtractionOptions } from '@shared/publish-extraction';
import type { PublishConfig } from '@shared/publish-config';

export function usePublishAutoExtract({ enabled, options, media, config, change, blocked, revision = 0 }: {
  enabled: boolean; options: PublishExtractionOptions; media?: MatrixMediaSelection; config: PublishConfig;
  change: Dispatch<SetStateAction<PublishConfig>>; blocked: boolean; revision?: number;
}) {
  const current = useRef(config); current.current = config;
  const [status, setStatus] = useState({ pending: false, text: '' });
  const token = getAuthToken();
  useEffect(() => {
    if (!enabled || !media || blocked) { setStatus({ pending: false, text: '' }); return; }
    let cancelled = false, timeout: ReturnType<typeof setTimeout> | undefined;
    const baseline = current.current;
    const valid = () => !cancelled && Boolean(token) && getAuthToken() === token;
    const apply = (data: PublishExtractionData) => {
      if (!valid()) return;
      change(previous => valid() ? applyPublishExtraction(previous, baseline, media.files[0]?.name || '', data, options) : previous);
      const notes = [...(data.notices || []), ...(options.topics ? extractPublishTopics(baseline.body.trim() ? baseline.body : data.body || '').warnings : [])];
      setStatus({ pending: false, text: ['提取完成：仅填充空白项，已有内容保留', ...(data.cover ? [`已读取封面：${data.cover.name}`] : []), ...notes].join('；') });
    };
    // Filename and an existing description do not require native disk access.
    const nativeOptions = { body: options.body && !baseline.body.trim(), cover: options.cover && !baseline.covers?.length && media.mediaType === 'video' };
    if (!nativeOptions.body && !nativeOptions.cover) { apply({}); return () => { cancelled = true; }; }
    setStatus({ pending: true, text: '正在读取同目录同名简介和封面…' });
    const run = async () => {
      try {
        if (!token || !window.matrixDesktop?.extractPublishMedia) throw Error('当前桌面版本尚不支持同名文件提取，请更新；未读取简介或封面');
        const result = await Promise.race([
          window.matrixDesktop.extractPublishMedia({ accessToken: token, selectionId: media.id, options: nativeOptions }),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(Error('读取同名文件超时，原内容保留；可点击重新提取')), 8000); }),
        ]);
        if (result.error) throw Error(result.error);
        apply(result);
      } catch (error) {
        if (valid()) {
          // Native sidecars can fail independently of filename extraction.
          change(previous => valid() ? applyPublishExtraction(previous, baseline, media.files[0]?.name || '', {}, options) : previous);
          setStatus({ pending: false, text: (error as Error).message });
        }
      } finally { if (timeout) clearTimeout(timeout); }
    };
    void run();
    return () => { cancelled = true; if (timeout) clearTimeout(timeout); };
  }, [enabled, options.cover, options.title, options.body, options.topics, media?.id, blocked, token, revision]);
  return status;
}

const choices = [
  ['cover', '封面：读取同名文件', '优先读取同目录同名图片，也识别“视频名封面”“视频名-封面”等命名；支持 .jpg / .jpeg / .png / .webp。多个候选需手动选择。'],
  ['title', '标题：使用文件名', '自动去掉扩展名，将文件名填入空标题。'],
  ['body', '简介：读取同名文件', '自动读取同目录的同名 .txt / .text / .md；支持 UTF-8、UTF-16 和 GB18030。'],
  ['topics', '话题：简介中提取', '从简介中的 #话题1 #话题2 提取，一个话题一个标签；同名简介中的话题移入标签栏，避免重复。'],
] as const;
export function PublishAutoExtract({ enabled, toggle, options, change, disabled, status, retry }: {
  enabled: boolean; toggle(enabled: boolean): void; options: PublishExtractionOptions; change(options: PublishExtractionOptions): void;
  disabled: boolean; status: { pending: boolean; text: string }; retry(): void;
}) {
  const id = useId(), [open, setOpen] = useState(false), closing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const anchor = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 16, top: 16, maxHeight: 450 });
  const show = () => { clearTimeout(closing.current); setOpen(true); };
  const hideSoon = () => { closing.current = setTimeout(() => setOpen(false), 200); };
  const within = (target: EventTarget | null) => target instanceof Node && (anchor.current?.contains(target) || panel.current?.contains(target));
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect(); if (!rect || !panel.current) return;
      const above = Math.max(0, rect.top - 16), below = Math.max(0, innerHeight - rect.bottom - 16);
      // Always above the text trigger; scroll the bubble instead of covering
      // the rest of the extraction row or flipping below it.
      const maxHeight = Math.max(40, Math.min(innerHeight * .7, above));
      const height = Math.min(panel.current.scrollHeight + 2, maxHeight);
      const top = Math.max(8, rect.top - height - 8);
      setPosition({ left: Math.max(8, Math.min(rect.left, innerWidth - Math.min(430, innerWidth - 72) - 8)), top: Math.max(8, top), maxHeight });
    };
    place(); window.addEventListener('resize', place); document.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); document.removeEventListener('scroll', place, true); };
  }, [open]);
  useEffect(() => () => clearTimeout(closing.current), []);
  return <div className="matrix-auto-extract" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } }}>
    <div className="matrix-auto-extract-control"><input className="matrix-auto-extract-master" type="checkbox" aria-label="自动提取" checked={enabled} onChange={event => toggle(event.target.checked)} disabled={disabled} /><button ref={anchor} type="button" aria-label="自动提取设置" aria-expanded={open} aria-haspopup="dialog" aria-controls={id} onMouseEnter={show} onMouseLeave={hideSoon} onFocus={show} onBlur={event => { if (!within(event.relatedTarget)) setOpen(false); }} onClick={show}>自动提取</button></div>
    {open && createPortal(<div ref={panel} style={position} id={id} role="dialog" aria-label="自动提取设置" className="matrix-auto-extract-popover" onMouseEnter={show} onMouseLeave={hideSoon} onBlur={event => { if (!within(event.relatedTarget)) setOpen(false); }}><strong>选择文件后自动识别并填充对应内容</strong>{choices.map(([key, label, description]) => <label key={key}><input type="checkbox" aria-label={label} checked={options[key]} disabled={disabled} onChange={event => change({ ...options, [key]: event.target.checked })} /><span>{label}<small>{description}</small></span></label>)}<small>只读取所选素材的同目录同名文件，不扫描其他目录。已有手动文案和自定义封面保留；不会分析视频语音或用 AI 猜写内容。</small></div>, document.body)}
    {enabled && status.text && <p role="status" data-publish-extraction-status={status.pending ? 'reading' : 'complete'}>{status.text}{!status.pending && <button type="button" disabled={disabled} onClick={retry}>重新提取</button>}</p>}
  </div>;
}
