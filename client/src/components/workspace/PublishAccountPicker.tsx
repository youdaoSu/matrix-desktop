import { useState } from 'react';
import { Music2, BookOpen, Tv, Video, Search, X, Trash2 } from 'lucide-react';
import type { PlatformAccount, PlatformType } from '@shared/api.interface';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { platformLabels } from './OfficialWorkspace';
import { readPublishPreferences, savePublishPreferences } from './publish-preferences';
import { toast } from 'sonner';

export function PublishPlatformIcon({ platform }: { platform: PlatformType }) {
  const Icon = { douyin: Music2, xiaohongshu: BookOpen, bilibili: Tv, wechat: Video }[platform];
  return <span className={`matrix-publish-platform-icon ${platform}`} title={platformLabels[platform]}><Icon size={20} /></span>;
}
export function PublishAccountAvatar({ account }: { account: PlatformAccount }) {
  return <span className="matrix-publish-avatar">{account.avatarUrl ? <img src={account.avatarUrl} alt="" onError={event => { event.currentTarget.style.visibility = 'hidden'; }} /> : <span>{(account.nickname || '账').slice(0, 1)}</span>}<PublishPlatformIcon platform={account.platform} /></span>;
}
export const selectablePublishAccount = (account: PlatformAccount) => account.authStatus === 'authorized' && Boolean(account.connectorSessionId);

export function PublishAccountPicker({ accounts, selected, mediaType, onConfirm, onClose }: {
  accounts: PlatformAccount[]; selected: string[]; mediaType: string; onConfirm(ids: string[]): void; onClose(): void;
}) {
  const [tab, setTab] = useState('按分组'), [query, setQuery] = useState(''), [online, setOnline] = useState(false);
  const [draft, setDraft] = useState(() => selected.filter(id => accounts.some(account => account.id === id && selectablePublishAccount(account))));
  const [lists, setLists] = useState(() => readPublishPreferences().lists), [saving, setSaving] = useState(false), [listName, setListName] = useState('');
  const chosen = accounts.filter(account => draft.includes(account.id));
  const filtered = accounts.filter(account => (!online || account.authStatus === 'authorized') && (!query.trim() || [account.nickname, account.accountRemark, account.platformUserId].some(value => value?.toLowerCase().includes(query.trim().toLowerCase()))));
  const groups = new Map<string, PlatformAccount[]>();
  for (const account of filtered) {
    const keys = tab === '按标签' ? (account.tags?.length ? account.tags : ['未设置标签']) : [tab === '按平台' ? platformLabels[account.platform] : account.groupName || '默认分组'];
    for (const key of keys) groups.set(key, [...(groups.get(key) || []), account]);
  }
  const toggle = (ids: string[], checked: boolean) => setDraft(current => checked ? [...new Set([...current, ...ids])] : current.filter(id => !ids.includes(id)));
  const saveList = () => {
    if (!listName.trim() || !draft.length) return toast.error('请填写列表名称并选择账号');
    if (lists.length >= 30) return toast.error('最多保存 30 个常用列表，请先删除不用的列表');
    const next = [...lists, { id: crypto.randomUUID(), name: listName.trim(), ids: [...draft] }];
    try { savePublishPreferences({ lists: next }); setLists(next); setSaving(false); setListName(''); toast.success('已保存到当前矩效用户的常用列表'); } catch { toast.error('本机存储空间不足，列表未保存'); }
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="matrix-publish-picker">
    <div className="matrix-picker-heading"><DialogTitle>选择账号</DialogTitle><DialogDescription>以下列出已绑定的媒体平台账号 · {mediaType === 'image' ? '图文' : mediaType === 'text' ? '文案草稿' : '视频'}发布以官方支持为准</DialogDescription></div>
    <div className="matrix-picker-body"><div className="matrix-picker-main">
      <div className="matrix-picker-tools"><div role="tablist" aria-label="账号分组方式">{['按分组', '按标签', '按平台', '常用列表'].map(name => <button role="tab" aria-selected={tab === name} className={tab === name ? 'is-active' : ''} key={name} onClick={() => setTab(name)}>{name}</button>)}</div><div className="matrix-picker-search"><Input aria-label="搜索发布账号" placeholder="搜索账号昵称/备注/id" value={query} onChange={event => setQuery(event.target.value)} /><Search size={16} /></div><label title="仅根据最近的授权记录筛选；发布前仍会校验登录状态"><Checkbox checked={online} onCheckedChange={value => setOnline(Boolean(value))} />在线</label><label title="验证码由平台决定，矩效不会跳过安全验证"><Checkbox disabled />不弹验证</label></div>
      <div className="matrix-picker-groups" role="tabpanel">{tab === '常用列表' ? <>{!lists.length && <p className="matrix-picker-empty">尚无常用列表。选择账号后，点击右侧「保存列表」。</p>}{lists.map(list => {
        const matches = filtered.filter(account => list.ids.includes(account.id) && selectablePublishAccount(account));
        return <div className="matrix-picker-saved-list" key={list.id}><div><strong>{list.name}</strong><small>{matches.length} 个当前可选账号 / 原列表 {list.ids.length} 个</small></div><Button variant="outline" disabled={!matches.length} onClick={() => toggle(matches.map(account => account.id), true)}>加入已选</Button><Button variant="ghost" aria-label={`删除常用列表${list.name}`} onClick={() => { try { const next = lists.filter(item => item.id !== list.id); savePublishPreferences({ lists: next }); setLists(next); } catch { toast.error('列表删除失败'); } }}><Trash2 size={16} /></Button></div>;
      })}</> : <>{!groups.size && <p className="matrix-picker-empty">没有匹配账号；可调整搜索条件，或先到账号管理绑定账号。</p>}{[...groups].map(([group, items]) => {
        const available = items.filter(selectablePublishAccount).map(account => account.id), count = available.filter(id => draft.includes(id)).length;
        return <section key={group}><label className="matrix-picker-group-name"><Checkbox aria-label={`选择分组${group}`} disabled={!available.length} checked={count > 0 && count < available.length ? 'indeterminate' : available.length > 0 && count === available.length} onCheckedChange={value => toggle(available, Boolean(value))} />{group}（{items.length}）</label><div className="matrix-picker-grid">{items.map(account => <label key={account.id} className="matrix-picker-account" data-publish-account={account.id}><Checkbox aria-label={`选择账号${account.nickname || account.id}`} disabled={!selectablePublishAccount(account)} checked={draft.includes(account.id)} onCheckedChange={value => toggle([account.id], Boolean(value))} /><PublishAccountAvatar account={account} /><span><strong>{account.nickname || '未命名账号'}</strong><small>{account.platformUserId || '平台 ID 尚未识别'}</small>{account.accountRemark && <small>{account.accountRemark}</small>}<small>{account.authStatus !== 'authorized' ? '需重新登录' : !account.connectorSessionId ? '需在本机登录绑定' : '已授权 · 发布前校验'}</small></span></label>)}</div></section>;
      })}</>}</div>
    </div><aside className="matrix-picker-selected"><div><span>已选：{chosen.length}</span><button aria-label="清空已选账号" disabled={!draft.length} onClick={() => setDraft([])}><Trash2 size={15} /></button><button className="matrix-picker-save" disabled={!draft.length} onClick={() => setSaving(value => !value)}>保存列表</button></div>{saving && <div className="matrix-picker-list-name"><Input aria-label="常用列表名称" maxLength={40} placeholder="输入列表名称" value={listName} onChange={event => setListName(event.target.value)} /><Button size="sm" onClick={saveList}>保存</Button></div>}<ul>{chosen.map(account => <li key={account.id}><PublishAccountAvatar account={account} /><span>{account.nickname || '未命名账号'}<small>{platformLabels[account.platform]}</small></span><button aria-label={`移除已选${account.nickname || account.id}`} onClick={() => toggle([account.id], false)}><X size={15} /></button></li>)}</ul></aside></div>
    <footer><span>“在线”是最近授权记录；平台验证不能跳过。取消不会修改原有选择。</span><Button variant="outline" onClick={onClose}>取消</Button><Button onClick={() => { onConfirm(draft); onClose(); }}>确定</Button></footer>
  </DialogContent></Dialog>;
}
