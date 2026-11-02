import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { getUser } from '@/api';
import { parseTopics } from '@shared/publish-config';

const joined = (values: readonly string[]) => JSON.stringify(values);
const unique = (values: readonly string[]) => [...new Set(values)];
const recentKey = (owner: string) => `matrix-publish-recent-topics:${owner}`;
function readRecent(owner?: string): string[] {
  if (!owner) return [];
  try { const value: unknown = JSON.parse(localStorage.getItem(recentKey(owner)) || '[]'); return Array.isArray(value) ? unique(value.filter((item): item is string => typeof item === 'string' && item.length > 0 && item.length <= 40 && parseTopics(item).length === 1)).slice(0, 50) : []; } catch { return []; }
}

// Pending text is included in onChange on every keystroke. Publishing or route
// changes cannot lose the last token merely because Enter/blur hasn't fired.
export function PublishTopicInput({ id, label, value, change, disabled = false,maxTags=15,maxTagLength=40 }: { id: string; label?: string; value: string[]; change(value: string[]): void; disabled?: boolean;maxTags?:number;maxTagLength?:number }) {
  const [tags, setTags] = useState(value), [draft, setDraft] = useState(''), [open, setOpen] = useState(false), [storageIssue, setStorageIssue] = useState('');
  const owner = typeof getUser === 'function' ? getUser()?.id : undefined;
  const [history, setHistory] = useState<{ owner?: string; values: string[] }>(() => ({ owner, values: readRecent(owner) }));
  const root = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null), composing = useRef(false), emitted = useRef(joined(value));
  const popupId = useId(), signature = joined(value);
  useEffect(() => { if (signature !== emitted.current) { emitted.current = signature; setTags(value); setDraft(''); } }, [signature]);
  useEffect(() => { setHistory({ owner, values: readRecent(owner) }); setStorageIssue(''); setOpen(false); }, [owner]);
  const full = unique([...tags, ...parseTopics(draft)]), invalid = full.length > maxTags ? `话题最多${maxTags}个，请移除多余项；不会静默丢弃。` : full.some(tag => tag.length > maxTagLength) ? `每个话题最多${maxTagLength}字，请修改超长项。` : '';
  const emit = (next: string[], pending: string) => { setTags(next); setDraft(pending); const all = unique([...next, ...parseTopics(pending)]); emitted.current = joined(all); change(all); };
  const remember = (next: string[]) => {
    if (!owner || (typeof getUser === 'function' ? getUser()?.id : undefined) !== owner || next.length > maxTags || next.some(tag => tag.length > maxTagLength)) return;
    const values = unique([...next, ...readRecent(owner)]).slice(0, 50);
    try { localStorage.setItem(recentKey(owner), JSON.stringify(values)); setHistory({ owner, values }); setStorageIssue(''); } catch { setStorageIssue('最近话题未能保存；当前话题和发布内容不受影响。'); }
  };
  const commit = () => { if (disabled || composing.current) return; emit(full, ''); remember(full); };
  const edit = (text: string, compose = composing.current) => {
    if (disabled) return;
    setOpen(true);
    if (compose) { emit(tags, text); return; }
    const parts = parseTopics(text), trailing = /[\s#,，;；、]$/u.test(text);
    if (trailing || parts.length > 1) { const complete = trailing ? parts : parts.slice(0, -1), pending = trailing ? '' : parts[parts.length - 1]; const next = unique([...tags, ...complete]); emit(next, pending); if (complete.length) remember(next); }
    else emit(tags, text);
  };
  const candidates = history.owner === owner ? history.values.filter(tag =>tag.length<=maxTagLength&& !full.includes(tag) && (!draft || tag.toLowerCase().includes(draft.replace(/^#+/, '').toLowerCase()))) : [];
  return <div ref={root} className="matrix-topic-editor" onBlur={event => { if (!root.current?.contains(event.relatedTarget as Node)) { commit(); setOpen(false); } }}>
    <div className={`matrix-topic-input ${disabled ? 'is-disabled' : ''}`} onClick={() => { if (!disabled) { input.current?.focus(); setOpen(true); } }}>
      {tags.map(tag => <span className={`matrix-topic-token ${tag.length > maxTagLength ? 'is-invalid' : ''}`} key={tag}><span>#{tag}</span><button type="button" disabled={disabled} aria-label={`移除话题 ${tag}`} onMouseDown={event => event.preventDefault()} onClick={event => { event.stopPropagation(); emit(tags.filter(item => item !== tag), draft); }}><X size={12} /></button></span>)}
      <input ref={input} id={id} aria-label={label} disabled={disabled} value={draft} aria-describedby={invalid ? `${popupId}-error` : undefined} aria-expanded={open && candidates.length > 0} aria-controls={open && candidates.length ? popupId : undefined} autoComplete="off" placeholder={tags.length ? '继续添加话题' : '输入话题，回车、空格或逗号添加'} onFocus={() => setOpen(true)} onChange={event => edit(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={event => { composing.current = false; edit(event.currentTarget.value, false); }} onKeyDown={event => {
        if (event.nativeEvent.isComposing || composing.current || event.keyCode === 229) return;
        if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); commit(); }
        else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
        else if (event.key === 'Backspace' && !draft && tags.length) emit(tags.slice(0, -1), '');
      }} />
    </div>
    {invalid && <small id={`${popupId}-error`} className="matrix-topic-error" role="alert">{invalid}</small>}
    {storageIssue && <small role="status">{storageIssue}</small>}
    {open && candidates.length > 0 && !disabled && <section className="matrix-topic-recent" id={popupId} aria-label="最近使用话题"><header>最近使用 · 本地记录</header><div>{candidates.map(tag => <button type="button" key={tag} onMouseDown={event => event.preventDefault()} onClick={() => { const next = unique([...tags, tag]); emit(next, draft); remember(unique([...next, ...parseTopics(draft)])); input.current?.focus(); }}>#{tag}</button>)}</div><small>只来自当前远效账号的本地使用记录，不代表平台热门话题。</small></section>}
  </div>;
}
