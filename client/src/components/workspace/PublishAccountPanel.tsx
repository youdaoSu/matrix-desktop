import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import type { PlatformAccount } from '@shared/api.interface';
import { parseTopics, type PublishConfig } from '@shared/publish-config';
import { publishPlatformFields } from '@shared/publish-platform-fields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PublishAccountPicker, PublishAccountAvatar, PublishPlatformIcon } from './PublishAccountPicker';
import { PublishCovers, PublishSchedule } from './PublishCommonExtras';
import { platformLabels } from './OfficialWorkspace';
import { readPublishPreferences, savePublishPreferences } from './publish-preferences';
import { toast } from 'sonner';
import { dynamicField, OfficialOptionPicker } from './OfficialOptionPicker';

function Switch({ checked, disabled, onCheckedChange }: { checked: boolean; disabled?: boolean; onCheckedChange(value: boolean): void }) {
  return <button type="button" role="switch" aria-checked={checked} disabled={disabled} className="matrix-publish-switch" onClick={() => onCheckedChange(!checked)}><span /></button>;
}

export const emptyPublishConfig = (): PublishConfig => ({ title: '', body: '', topics: [], comment: '', options: {} });
export function PublishAccountPanel({ accounts, selected, configs, common, onSelect, onChange, onInit, disabled = false, loading = false, mediaType, batch = false, states = {} }: {
  accounts: PlatformAccount[]; selected: string[]; configs: Record<string, PublishConfig>; common?: PublishConfig;
  onInit(id: string, config: PublishConfig): void; onSelect(ids: string[]): void; onChange(id: string, patch: Partial<PublishConfig>): void;
  disabled?: boolean; loading?: boolean; mediaType: string; batch?: boolean;
  states?: Record<string, { locked?: boolean; note?: string; followup?: string }>;
}) {
  const [picker, setPicker] = useState(false), [activeId, setActiveId] = useState('');
  const [merge, setMerge] = useState(false), [remember, setRemember] = useState(() => readPublishPreferences().remember);
  const chosen = selected.map(id => accounts.find(account => account.id === id)).filter((account): account is PlatformAccount => Boolean(account));
  const active = chosen.find(account => account.id === activeId) || chosen[0];
  const platforms = [...new Set(chosen.map(account => account.platform))];
  const config = active ? configs[active.id] || common || emptyPublishConfig() : emptyPublishConfig();
  const locked = disabled || Boolean(active && states[active.id]?.locked);
  const change = (patch: Partial<PublishConfig>) => {
    if (!active || locked) return;
    const targets = merge ? chosen.filter(account => account.platform === active.platform && !states[account.id]?.locked) : [active];
    for (const account of targets) onChange(account.id, patch);
    if (remember && (patch.options || patch.extras)) {
      try {
        const saved = readPublishPreferences().configs;
        for (const account of targets) {
          const current = { ...(configs[account.id] || emptyPublishConfig()), ...patch };
          saved[account.id] = { options: current.options, extras: current.extras };
        }
        savePublishPreferences({ configs: saved });
      } catch { toast.error('配置已修改，但自动记忆保存失败'); }
    }
  };
  const selectAccounts = (ids: string[]) => {
    const preferences = readPublishPreferences();
    for (const id of ids) if (!configs[id]) onInit(id, { ...(common || emptyPublishConfig()), ...(preferences.remember ? preferences.configs[id] || {} : {}) });
    onSelect(ids);
  };
  const extra = (label: string, value: string) => change({ extras: { ...config.extras, [label]: value } });
  const option = (key: keyof PublishConfig['options'], label: string, values?: string[]) => <div className="matrix-publish-field"><label htmlFor={`account-${key}`}>{label}：</label><div>{values ? <select id={`account-${key}`} aria-label={`${active?.nickname}-${label}`} disabled={locked} value={config.options[key] || ''} onChange={event => change({ options: { ...config.options, [key]: event.target.value } })}><option value="">保持官方设置</option>{values.map(value => <option key={value}>{value}</option>)}</select> : <Input id={`account-${key}`} aria-label={`${active?.nickname}-${label}`} disabled={locked} value={config.options[key] || ''} placeholder="填写当前官方选项名称" maxLength={100} onChange={event => change({ options: { ...config.options, [key]: event.target.value } })} />}<small>只匹配官方现有选项，无法匹配时暂停并提示补全。</small></div></div>;
  return <div className="matrix-platform-config-panel">
    <header className="matrix-platform-config-header"><strong>平台和账号配置<small>（点击平台、账号切换设置）</small></strong><div><label title="开启后，后续修改应用到所有已选同平台账号；已提交账号不变"><Switch checked={merge} disabled={disabled} onCheckedChange={setMerge} />同平台账号合并设置</label><label title="仅记住平台选项；不会保存素材、文案、封面或发布时间"><Switch checked={remember} disabled={disabled} onCheckedChange={value => { try { savePublishPreferences({ remember: value }); setRemember(value); } catch { toast.error('设置保存失败'); } }} />自动记住配置选项</label></div></header>
    <div className="matrix-platform-config-tabs"><Button variant="outline" disabled={disabled || loading} onClick={() => setPicker(true)}><Plus size={15} />选择账号</Button><div role="tablist" aria-label="发布平台">{platforms.map(platform => <button key={platform} role="tab" aria-label={platformLabels[platform]} aria-selected={active?.platform === platform} onClick={() => setActiveId(chosen.find(account => account.platform === platform)!.id)}><PublishPlatformIcon platform={platform} /><sup>{chosen.filter(account => account.platform === platform).length}</sup></button>)}</div></div>
    {loading ? <p role="status" className="p-4">正在加载账号…</p> : !active ? <div className="matrix-reference-account-empty"><button aria-label="添加发布账号" disabled={disabled} onClick={() => setPicker(true)}>＋</button><p>未选择账号，请点击加号按钮选择账号</p></div> : <div className="matrix-platform-config-body">
      <nav aria-label="发布账号">{chosen.filter(account => account.platform === active.platform).map(account => <div key={account.id} className={account.id === active.id ? 'is-active' : ''}><button aria-current={account.id === active.id ? 'true' : undefined} title={account.nickname} onClick={() => setActiveId(account.id)}><PublishAccountAvatar account={account} /><span>{account.nickname || '未命名账号'}</span></button><button disabled={disabled} aria-label={`移除发布账号${account.nickname || account.id}`} onClick={() => onSelect(selected.filter(id => id !== account.id))}><X size={14} /></button></div>)}</nav>
      <div className="matrix-platform-account-form" data-config-account={active.id} data-config-platform={active.platform}>
        <div className="matrix-platform-account-notice">以下设置{merge ? '将应用到已选同平台账号' : '仅对当前账号'} <strong>{active.nickname || '未命名账号'}</strong> 生效</div>
        {batch && <p className="matrix-platform-config-help">标题、简介、话题、追评使用左侧每篇作品的内容；这里的封面、时间及平台选项应用到此账号的全部作品。</p>}
        {!batch && <div className="matrix-publish-field"><label htmlFor="account-title">标题：</label><div><Input id="account-title" aria-label={`${active.nickname}-标题`} value={config.title} disabled={locked} onChange={event => change({ title: event.target.value })} placeholder="请输入" /><small className={config.title.length > publishPlatformFields[active.platform].titleLimit ? 'text-destructive' : 'text-right'}>{config.title.length}/{publishPlatformFields[active.platform].titleLimit}</small></div></div>}
        <PublishCovers platform={active.platform} config={config} disabled={locked} change={next => change({ covers: next.covers })} />
        {!batch && <><div className="matrix-publish-field"><label htmlFor="account-body">简介：</label><div><Textarea id="account-body" aria-label={`${active.nickname}-简介`} value={config.body} disabled={locked} onChange={event => change({ body: event.target.value })} placeholder="请输入作品简介" /><small className="text-right">{config.body.length}/{publishPlatformFields[active.platform].descriptionLimit}</small><small>不要在简介中重复输入带 # 的话题，请使用下方话题功能。</small></div></div><div className="matrix-publish-field"><label htmlFor="account-topics">{active.platform === 'bilibili' ? '标签' : '话题'}：</label><div><Input key={active.id + config.topics.join('|')} id="account-topics" aria-label={`${active.nickname}-话题`} defaultValue={config.topics.join(' ')} disabled={locked} onBlur={event => change({ topics: parseTopics(event.target.value) })} placeholder="输入话题，空格或逗号分隔，离开输入框后应用" /><small>话题搜索与活动候选项需在官方页面选择；这里不生成虚假热门话题。</small></div></div></>}
        {active.platform === 'bilibili' && <>{option('originality', '类型', ['自制', '转载'])}{option('category', '分区')}</>}
        <p className="matrix-platform-config-help">下列配置随任务保存。可唯一识别的官方开关会尝试同步；音乐、商品、合集等动态选项及无法匹配的控件会暂停任务，需在内嵌官方编辑器补全。空白表示保持官方设置。</p>
        {publishPlatformFields[active.platform].fields.map((field, index) => <div className="matrix-publish-field" key={field.label}><label htmlFor={`account-extra-${index}`}>{field.label}：</label><div>{field.kind === 'toggle' ? <div className="matrix-platform-toggle"><label><input id={`account-extra-${index}`} aria-label={`${active.nickname}-${field.label}`} type="checkbox" disabled={locked} checked={config.extras?.[field.label] === '开启'} onChange={event => extra(field.label, event.target.checked ? '开启' : '关闭')} />{config.extras?.[field.label] || '保持官方设置'}</label>{config.extras?.[field.label] && <button disabled={locked} onClick={() => extra(field.label, '')}>恢复默认</button>}</div> : field.choices ? <select id={`account-extra-${index}`} aria-label={`${active.nickname}-${field.label}`} disabled={locked} value={config.extras?.[field.label] || ''} onChange={event => extra(field.label, event.target.value)}><option value="">保持官方设置</option>{field.choices.map(value => <option key={value}>{value}</option>)}</select> : <Input id={`account-extra-${index}`} aria-label={`${active.nickname}-${field.label}`} disabled={locked} value={config.extras?.[field.label] || ''} maxLength={1000} placeholder="填写后在官方页面选择确认" onChange={event => extra(field.label, event.target.value)} />}{field.hint && <small>{field.hint}</small>}</div></div>)}
        <div className="matrix-publish-field"><label>官方动态选项：</label><div className="flex flex-wrap gap-2">{publishPlatformFields[active.platform].fields.filter(field => dynamicField(field.label)).map(field => <OfficialOptionPicker key={active.id + field.label} account={active} field={dynamicField(field.label)!} disabled={locked} onSelect={label => onChange(active.id, { extras: { ...config.extras, [field.label]: label } })} />)}<small>选入当前账号官方页面；后台任务会另行提示核对，不会自动带入其他账号。</small></div></div>
        {active.platform !== 'bilibili' && option('visibility', '权限设置', ['公开', '仅自己可见', ...(active.platform === 'douyin' ? ['好友可见'] : [])])}
        <PublishSchedule config={config} disabled={locked} change={next => change({ schedule: next.schedule })} />
        {!batch && <div className="matrix-publish-field"><label htmlFor="account-comment">追评：</label><div><Textarea id="account-comment" aria-label={`${active.nickname}-追评`} disabled={locked} value={config.comment} maxLength={2000} onChange={event => change({ comment: event.target.value })} /><small>作品确认成功后生成追评待办，不会把待办标为已发表。</small></div></div>}
        {states[active.id]?.note && <p role="status">{states[active.id].note}</p>}{states[active.id]?.followup && <p>{states[active.id].followup}</p>}
      </div>
    </div>}
    {picker && <PublishAccountPicker accounts={accounts} selected={selected} mediaType={mediaType} onConfirm={selectAccounts} onClose={() => setPicker(false)} />}
  </div>;
}
