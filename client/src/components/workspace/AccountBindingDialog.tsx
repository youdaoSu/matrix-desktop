import { useState } from 'react';
import type { AccountGroup, PlatformType } from '@shared/api.interface';
import catalog from '../../../../desktop/account-platforms.json';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PlatformLogo } from './PlatformLogo';

export function AccountBindingDialog({ groups, onCore, onWorkspace, onClose }: {
  groups: AccountGroup[]; onCore(platform: PlatformType, groupId?: string): void;
  onWorkspace(provider: string): void; onClose(): void;
}) {
  const [provider, setProvider] = useState('douyin'), [groupId, setGroupId] = useState('');
  const entry = catalog.find(item => item.id === provider)!;
  const bind = () => entry.core ? onCore(entry.id as PlatformType, groupId || groups.find(g => g.isDefault)?.id) : onWorkspace(entry.id);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="matrix-media-account-dialog">
    <DialogHeader><DialogTitle>添加媒体账号</DialogTitle><DialogDescription>使用对应平台的官方登录页；图标展示与是否支持自动绑定、自动发布分别标明。</DialogDescription></DialogHeader>
    <section><h3>选择媒体平台</h3><div className="matrix-media-platform-grid">{catalog.map(item => <button key={item.id} type="button" data-bind-provider={item.id} aria-pressed={provider === item.id} className={provider === item.id ? 'is-selected' : ''} onClick={() => setProvider(item.id)} title={item.core ? '本人登录后自动识别' : item.pending || '独立官方会话；自动识别、自动发布尚待适配'}><PlatformLogo platform={item.id} size={32} /><strong>{item.label}</strong></button>)}</div></section>
    <section><h3>添加到分组</h3><select aria-label="绑定账号添加到分组" data-bind-group-select value={groupId} disabled={!entry.core} onChange={event => setGroupId(event.target.value)}><option value="">默认分组</option>{groups.filter(group => !group.isDefault).map(group => <option key={group.id} value={group.id}>{group.groupName}</option>)}</select><small>{entry.core ? '默认加入默认分组，也可选择已有分组；重新授权不会移动原账号。' : '该平台目前使用独立登录工作区；尚未核验本人身份，不加入已绑定账号分组。'}</small></section>
    <div className="matrix-media-bind-status" role="status">{entry.core ? '官方页面确认已登录并读到稳定本人信息后，约 3 秒自动绑定；平台验证码和网络等待时间不包含在内。' : entry.pending ? entry.pending : '可以在远效内打开独立官方工作区。保存工作区不代表已登录，不代表自动发布已接通。'}</div>
    <DialogFooter><span>使用本机网络 · 不导入其他软件的 Cookie</span><Button variant="outline" onClick={onClose}>取消</Button><Button data-open-bind-provider onClick={bind}>{entry.core ? '打开登录页面添加' : entry.pending ? '查看接入状态' : entry.custom ? '设置自定义平台' : '打开官方工作区'}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
