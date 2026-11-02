import { toast } from 'sonner';
import type { PublishConfig } from '@shared/publish-config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useId } from 'react';
import { PublishCoverThumbnail } from './PublishMediaPreview';

export function PublishCovers({ config, change, disabled, platform }: { config: PublishConfig; change(config: PublishConfig): void; disabled: boolean; platform?: string }) {
  const radioName = useId(), custom = Boolean(config.covers?.length);
  const choose = async (index: number) => {
    try {
      if (!window.matrixDesktop) throw Error('请在桌面端选择封面');
      const result = await window.matrixDesktop.chooseMedia('image');
      if (result.error) throw Error(result.error); if (!result.selection) return;
      if (result.selection.files.length !== 1) throw Error('每个封面请选择一张图片');
      change({ ...config, covers: [...(config.covers || []).filter(cover => cover.index !== index), { id: result.selection.id, name: result.selection.files[0].name, index }] });
    } catch (error) { toast.error((error as Error).message); }
  };
  return <><div className="matrix-publish-field"><label>{platform ? '' : '通用'}封面：</label><div><div className="flex flex-wrap gap-4 py-2"><label className="flex gap-2 items-center"><input type="radio" name={radioName} checked={!custom} disabled={disabled} onChange={() => change({ ...config, covers: [] })} />平台自动封面（默认）</label><label className="flex gap-2 items-center"><input type="radio" name={radioName} checked={custom} disabled={disabled} onChange={() => { if (!custom) void choose(1); }} />自定义封面</label></div><small>{custom ? '已选择自定义图片，发布时才处理封面上传和裁剪。' : '使用平台从视频生成的封面，不打开封面编辑器、不上传额外图片；视频、文案及发布结果仍正常检查。'}</small></div></div>{custom && (!platform || platform === 'douyin' ? [1, 2] : [1]).map(index => { const cover = config.covers?.find(cover => cover.index === index); return <div className="matrix-publish-field" key={index}><label>自定义封面{index === 2 ? '2' : ''}：</label><div className="flex items-center flex-wrap gap-2"><Button aria-label={`上传${platform ? '' : '通用'}封面${index}`} className="matrix-cover-upload" variant="outline" disabled={disabled} onClick={() => void choose(index)}>{cover ? <PublishCoverThumbnail id={cover.id} name={cover.name} /> : <span>＋</span>}<span>{cover?.name || '上传'}</span></Button>{cover && <Button size="sm" variant="ghost" disabled={disabled} onClick={() => change({ ...config, covers: config.covers?.filter(cover => cover.index !== index) })}>清除封面</Button>}<small>{index === 2 ? '仅同步抖音的第二封面，其他平台跳过' : '自动上传并确认官方裁剪；无法确认时停止，不提前发布'}</small></div></div>; })}</>;
}
export function PublishSchedule({ config, change, disabled }: { config: PublishConfig; change(config: PublishConfig): void; disabled: boolean }) {
  const radioName = useId();
  return <div className="matrix-publish-field"><label>发布时间：</label><div><div className="flex flex-wrap gap-4 py-2">{([['now', '立即发布'], ['official', '定时发布'], ['local', '本机定时']] as const).map(([mode, label]) => <label className="flex gap-2 items-center" key={mode}><input type="radio" name={radioName} checked={(config.schedule?.mode || 'now') === mode} disabled={disabled} onChange={() => change({ ...config, schedule: { ...config.schedule, mode } })} />{label}</label>)}</div>{config.schedule && config.schedule.mode !== 'now' && <><Input type="datetime-local" aria-label="计划发布时间" value={config.schedule.at || ''} disabled={disabled} onChange={event => change({ ...config, schedule: { mode: config.schedule!.mode, at: event.target.value } })} /><small>{config.schedule.mode === 'local' ? '保持远效运行，到时开始上传准备，检查通过后自动提交，不再二次确认。退出后不会自动恢复。' : '先上传和填入内容，再提示你在官方表单设置该时间；不会把未设置定时的作品立即提交。'}</small></>}</div></div>;
}
