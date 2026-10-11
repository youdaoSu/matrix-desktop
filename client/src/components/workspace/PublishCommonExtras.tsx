import { toast } from 'sonner';
import type { PublishConfig } from '@shared/publish-config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function PublishCovers({ config, change, disabled }: { config: PublishConfig; change(config: PublishConfig): void; disabled: boolean }) {
  const choose = async (index: number) => {
    try {
      if (!window.matrixDesktop) throw Error('请在桌面端选择封面');
      const result = await window.matrixDesktop.chooseMedia('image');
      if (result.error) throw Error(result.error); if (!result.selection) return;
      if (result.selection.files.length !== 1) throw Error('每个封面请选择一张图片');
      change({ ...config, covers: [...(config.covers || []).filter(cover => cover.index !== index), { id: result.selection.id, name: result.selection.files[0].name, index }] });
    } catch (error) { toast.error((error as Error).message); }
  };
  return <>{[1, 2].map(index => <div className="matrix-publish-field" key={index}><label>通用封面{index === 2 ? '2' : ''}：</label><div className="flex items-center flex-wrap gap-2"><Button aria-label={`上传通用封面${index}`} className="matrix-cover-upload" variant="outline" disabled={disabled} onClick={() => void choose(index)}><span>＋</span>{config.covers?.find(cover => cover.index === index)?.name || '上传'}</Button>{config.covers?.some(cover => cover.index === index) && <Button size="sm" variant="ghost" disabled={disabled} onClick={() => change({ ...config, covers: config.covers?.filter(cover => cover.index !== index) })}>清除封面</Button>}<small>{index === 2 ? '仅尝试同步抖音的第二封面，其他平台跳过' : '上传至官方封面控件后，需核对裁剪效果'}</small></div></div>)}</>;
}
export function PublishSchedule({ config, change, disabled }: { config: PublishConfig; change(config: PublishConfig): void; disabled: boolean }) {
  return <div className="matrix-publish-field"><label>发布时间：</label><div><div className="flex flex-wrap gap-4 py-2">{([['now', '立即发布'], ['official', '定时发布'], ['local', '本机定时']] as const).map(([mode, label]) => <label className="flex gap-2 items-center" key={mode}><input type="radio" name="publish-time" checked={(config.schedule?.mode || 'now') === mode} disabled={disabled} onChange={() => change({ ...config, schedule: { ...config.schedule, mode } })} />{label}</label>)}</div>{config.schedule && config.schedule.mode !== 'now' && <><Input type="datetime-local" aria-label="计划发布时间" value={config.schedule.at || ''} disabled={disabled} onChange={event => change({ ...config, schedule: { mode: config.schedule!.mode, at: event.target.value } })} /><small>{config.schedule.mode === 'local' ? '保持矩效运行，到时开始上传准备；正式提交仍需确认。退出后不会自动恢复。' : '先上传和填入内容，再提示你在官方表单设置该时间；不会把未设置定时的作品立即提交。'}</small></>}</div></div>;
}
