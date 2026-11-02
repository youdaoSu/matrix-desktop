import { useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import type { PublishTaskControls as Controls } from '@shared/publish-task-controls';
import { Input } from '@/components/ui/input';

export function PublishTaskControls({ value, change, disabled }: { value: Controls; change(value: Controls): void; disabled: boolean }) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (details.current && !details.current.contains(event.target as Node)) details.current.open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && details.current?.open) { details.current.open = false; details.current.querySelector('summary')?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, []);
  return <details ref={details} className="matrix-distribution-controls" onToggle={() => { if (disabled && details.current) details.current.open = false; }}>
    <summary aria-label="分发任务设置" aria-disabled={disabled} onClick={event => { if (disabled) event.preventDefault(); }}><ChevronDown size={16} />任务设置</summary>
    <section aria-label="创建任务控制"><header><strong>创建任务控制</strong><label>批次名称<Input aria-label="分发批次名称" maxLength={80} value={value.batchName} disabled={disabled} onChange={event => change({ ...value, batchName: event.target.value })} /></label></header>
      <div className="matrix-distribution-options"><fieldset disabled={disabled}><legend>创建任务初始状态</legend>{([['execute', '执行'], ['paused', '暂停']] as const).map(([state, label]) => <label key={state}><input type="radio" name="distribution-initial-state" value={state} checked={value.initialState === state} onChange={() => change({ ...value, initialState: state })} />{label}</label>)}<small>暂停仅创建记录并保存素材引用，不打开平台或上传；到任务记录点击“开始发布”。</small></fieldset>
        <fieldset disabled><legend>附加操作</legend><label><input type="checkbox" checked={false} readOnly />作品置顶</label><small>平台作品置顶尚未接通，不会自动操作。</small><label><input type="checkbox" checked={false} readOnly />发布后删除文件</label><small>安全清理尚未接通，保留原视频和封面。</small><label><input type="checkbox" checked={false} readOnly />删除上一篇作品</label><small>尚未接通精确作品定位，不删除平台作品。</small></fieldset></div>
    </section>
  </details>;
}
