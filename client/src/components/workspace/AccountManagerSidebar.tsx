import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight, GripVertical, MoreVertical, Plus, RefreshCw, Search, Users } from 'lucide-react';
import type { AccountGroup, PlatformAccount, PlatformType } from '@shared/api.interface';
import {accountMetricSourceLabel} from '@shared/account-metrics';
import { axiosForBackend, getUser } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useOfficialWorkspace } from './OfficialWorkspace';
import { AccountAvatar, accountPlatformMeta } from './AccountAvatar';
import { AccountBindingDialog } from './AccountBindingDialog';
import { groupLabelColor, groupLabelForeground, groupLabelPalette } from './account-group-colors';
import { accountDragType, decodeAccountDrag, encodeAccountDrag } from './account-group-drag';
import { openPlatformDirectory } from './AdditionalPlatformWorkspaces';
import { accountAppearance } from '@shared/account-availability';
import { useAccountObservation } from './account-observations';
import { uiOneOf, uiText, useWorkspacePreference } from './WorkspaceUiState';
import { indexAccountsByGroup } from './account-group-index';
import { useOwnerRequest } from './use-owner-request';

type GroupAction = { kind: 'new' | 'rename' | 'delete' | 'color'; group?: AccountGroup };
type AccountAction = { kind: 'detail' | 'remark' | 'move' | 'reauthorize' | 'unbind'; account: PlatformAccount };
const palette = groupLabelPalette;
export const accountBelongsToGroup = (account: PlatformAccount, group: AccountGroup) => account.groupId ? account.groupId === group.id : account.groupName === group.groupName || (group.isDefault && !account.groupName);

export function AccountManagerSidebar() {
  const workspace = useOfficialWorkspace(), { pathname } = useLocation();
  const route = useRef(pathname); route.current = pathname;
  const owner = getUser()?.id || '';
  const [groups, setGroups] = useState<AccountGroup[]>([]), [groupError, setGroupError] = useState('');
  const [query, setQuery] = useWorkspacePreference('accounts.search', '', uiText);
  const [platform, setPlatform] = useWorkspacePreference<PlatformType | 'all'>('accounts.platform', 'all', uiOneOf(['all', 'douyin', 'xiaohongshu', 'wechat', 'bilibili']));
  const [collapsed, setCollapsed] = useState<string[]>(() => { try { const stored = JSON.parse(localStorage.getItem('matrix-account-collapse:' + owner) || '[]'); return Array.isArray(stored) ? stored.filter(id => typeof id === 'string') : []; } catch { return []; } });
  const [dropTarget, setDropTarget] = useState(''), [busy, setBusy] = useState(false), [opening, setOpening] = useState(false), [selected, setSelected] = useState<string[]>([]);
  const [binding, setBinding] = useState(false), [groupAction, setGroupAction] = useState<GroupAction>(), [accountAction, setAccountAction] = useState<AccountAction>();
  const [name, setName] = useState(''), [color, setColor] = useState(palette[0]), [remark, setRemark] = useState(''), [targetGroup, setTargetGroup] = useState('');
  const detailAccount=accountAction?(workspace.accounts.find(account=>account.id===accountAction.account.id&&account.connectorSessionId===accountAction.account.connectorSessionId)||accountAction.account):undefined;
  const detailObservation = useAccountObservation(detailAccount || {});
  const detailAppearance = detailAccount ? accountAppearance(detailAccount, detailObservation) : undefined;
  const writeLock = useRef(false);
  const beginGroupRequest = useOwnerRequest();
  const loadGroups = async () => {
    const request=beginGroupRequest();
    if (!request.authorized) { request.finish(); setGroupError('请登录后读取分组'); return; }
    try { const response = await axiosForBackend.get('/api/platform/groups',{signal:request.signal}); if (!Array.isArray(response.data?.data)) throw Error('分组响应不完整'); if(request.current()){setGroups(response.data.data);setGroupError('');} }
    catch { if(request.current()) setGroupError('分组加载失败，原列表保留，请刷新重试'); }
    finally { request.finish(); }
  };
  useEffect(() => {
    setGroups([]); setGroupError(''); void loadGroups(); const refresh = () => void loadGroups();
    window.addEventListener('matrix:accounts-updated', refresh);
    return () => window.removeEventListener('matrix:accounts-updated', refresh);
  }, [owner]);
  useEffect(() => { try { localStorage.setItem('matrix-account-collapse:' + owner, JSON.stringify(collapsed)); } catch { /* Saving UI preferences is optional. */ } }, [collapsed, owner]);
  useEffect(() => { setSelected(current => current.filter(id => workspace.accounts.some(a => a.id === id))); }, [workspace.accounts]);
  const refreshAll = () => { void workspace.refreshAccounts(); void loadGroups(); };
  const changed = () => window.dispatchEvent(new Event('matrix:accounts-updated'));
  const write = async (operation: () => Promise<void>) => {
    if (writeLock.current || getUser()?.id !== owner || route.current !== '/accounts') return;
    writeLock.current = true; setBusy(true);
    try { await operation(); changed(); }
    catch (failure: any) { toast.error(failure?.response?.data?.message || failure?.response?.data?.error?.message || failure?.message || '操作未完成，请重试'); }
    finally { writeLock.current = false; setBusy(false); setDropTarget(''); }
  };
  const openGroupAction = (kind: GroupAction['kind'], group?: AccountGroup) => { setName(kind === 'new' ? '' : group?.groupName || ''); setColor(groupLabelColor(group?.color)); setGroupAction({ kind, group }); };
  const saveGroup = () => void write(async () => {
    if (!groupAction) return;
    const { kind, group } = groupAction;
    if (kind === 'new') await axiosForBackend.post('/api/platform/groups', { groupName: name.trim(), sortOrder: 1 + Math.max(0, ...groups.map(g => g.sortOrder)) });
    else if (kind === 'color') await axiosForBackend.put('/api/platform/groups/' + group!.id, { color });
    else if (kind === 'rename' && !group?.isDefault) await axiosForBackend.put('/api/platform/groups/' + group!.id, { groupName: name.trim() });
    else if (kind === 'delete' && !group?.isDefault) await axiosForBackend.delete('/api/platform/groups/' + group!.id);
    else throw Error('默认分组不能修改名称或删除');
    setGroupAction(undefined); toast.success(kind === 'delete' ? '分组已删除，账号已移回默认分组' : '分组已保存');
  });
  const move = (ids: string[], group: AccountGroup) => void write(async () => {
    const owned = ids.filter(id => workspace.accounts.some(a => a.id === id && !accountBelongsToGroup(a, group)));
    if (!owned.length) return;
    const response = await axiosForBackend.post('/api/platform/groups/move-accounts', { accountIds: owned, groupId: group.id });
    if (response.data?.data?.moved !== owned.length) throw Error('移动结果不完整，请刷新核对');
    setCollapsed(current => current.filter(id => id !== group.id)); setSelected([]); toast.success(`${owned.length} 个账号已移至「${group.groupName}」`);
  });
  const openAll = async (group: AccountGroup) => {
    if (opening || route.current !== '/accounts') return;
    const all = workspace.accounts.filter(a => accountBelongsToGroup(a, group)), eligible = all.filter(a => a.connectorSessionId);
    if (!eligible.length) return toast.info('该分组暂无可在本机打开的账号');
    setOpening(true); let count = 0;
    try { for (const account of eligible) { if (route.current !== '/accounts' || getUser()?.id !== owner) break; if (await workspace.openAccount(account, 'manage')) count++; } if (route.current === '/accounts') toast.info(`已打开 ${count} / ${all.length} 个账号；不会自动发布或发送消息`); }
    finally { setOpening(false); }
  };
  const openAccountAction = (kind: AccountAction['kind'], account: PlatformAccount) => { setRemark(account.accountRemark || ''); setTargetGroup(account.groupId || groups.find(g => accountBelongsToGroup(account, g))?.id || ''); setAccountAction({ kind, account }); };
  const saveAccount = () => void write(async () => {
    if (!accountAction) return; const { kind, account } = accountAction;
    if (kind === 'remark') await axiosForBackend.put('/api/platform/accounts/' + account.id, { accountRemark: remark });
    else if (kind === 'move') { const group = groups.find(g => g.id === targetGroup); if (!group) throw Error('请选择目标分组'); const response = await axiosForBackend.post('/api/platform/groups/move-accounts', { accountIds: [account.id], groupId: group.id }); if (response.data?.data?.moved !== 1) throw Error('账号移动未完成'); }
    else if (kind === 'unbind') { await axiosForBackend.delete('/api/platform/accounts/' + account.id); workspace.tabs.filter(t => t.accountId === account.id && !t.background).forEach(t => workspace.close(t.id)); }
    else if (kind === 'reauthorize') { if (!await workspace.openAccount(account, 'manage', true)) throw Error('请在本机绑定该账号'); }
    setAccountAction(undefined); toast.success(kind === 'unbind' ? '账号已解绑，平台账号本身不会被删除' : kind === 'reauthorize' ? '请在官方页面完成本人验证' : '账号设置已保存');
  });
  const active = workspace.tabs.find(t => t.id === workspace.activeId)?.accountId;
  const filtered = useMemo(() => { const term=query.trim().toLowerCase(); return workspace.accounts.filter(a => (platform === 'all' || a.platform === platform) && [a.nickname, a.accountRemark, accountPlatformMeta[a.platform]?.label].some(text => (text || '').toLowerCase().includes(term))); }, [workspace.accounts, platform, query]);
  const sortedGroups = useMemo(() => [...groups].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.sortOrder - b.sortOrder), [groups]);
  const allByGroup = useMemo(() => indexAccountsByGroup(workspace.accounts, sortedGroups), [workspace.accounts, sortedGroups]);
  const filteredByGroup = useMemo(() => indexAccountsByGroup(filtered, sortedGroups), [filtered, sortedGroups]);
  return <aside className="matrix-manager-rail" data-account-management>
    <header><Button onClick={() => setBinding(true)}><Plus size={15} />添加账号</Button><Button variant="outline" size="icon" aria-label="刷新账号和分组" disabled={workspace.loadingAccounts || busy} onClick={refreshAll}><RefreshCw size={15} className={workspace.loadingAccounts ? 'animate-spin' : ''} /></Button></header>
    <div className="px-3 pb-2"><Button asChild variant="outline" className="w-full"><Link to="/accounts/automation">主账号与协作分工</Link></Button></div>
    <div className="matrix-manager-search"><Search size={15} /><Input aria-label="搜索管理账号" placeholder="昵称 / 备注 / 平台" value={query} onChange={event => setQuery(event.target.value)} /></div>
    <div className="matrix-manager-filter"><select aria-label="筛选管理账号平台" value={platform} onChange={event => setPlatform(event.target.value as PlatformType | 'all')}><option value="all">全部平台</option>{Object.entries(accountPlatformMeta).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}</select><span>{filtered.length} / {workspace.accounts.length} 个账号</span></div>
    <div className="matrix-manager-groups">
      {(groupError || workspace.accountError) && <button className="matrix-manager-load-error" onClick={refreshAll}>{groupError || workspace.accountError}</button>}
      {sortedGroups.map(group => {
        const all = allByGroup.get(group.id) || [], rows = filteredByGroup.get(group.id) || [];
        const expanded = !collapsed.includes(group.id);
        const headingColor = groupLabelColor(group.color);
        return <section key={group.id} data-account-group={group.id} data-default-group={group.isDefault} className={`matrix-manager-group ${dropTarget === group.id ? 'is-drop-target' : ''}`} style={{ '--group-color': group.color || palette[0], '--group-heading-color': headingColor, '--group-heading-foreground': groupLabelForeground(headingColor) } as React.CSSProperties}
          onDragOver={event => { if (!busy && event.dataTransfer.types.includes(accountDragType)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(group.id); } }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(''); }}
          onDrop={event => { event.preventDefault(); setDropTarget(''); if (busy) return; const ids = decodeAccountDrag(event.dataTransfer.getData(accountDragType), owner, workspace.accounts.map(a => a.id)); if (ids.length) move(ids, group); else toast.error('请拖动当前用户的已绑定账号'); }}>
          <div className="matrix-manager-group-heading"><button className="matrix-manager-group-toggle" aria-expanded={expanded} aria-label={`${expanded ? '收起' : '展开'}分组${group.groupName}`} onClick={() => setCollapsed(current => expanded ? [...current, group.id] : current.filter(id => id !== group.id))}>{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<strong>{group.groupName}</strong><small>{all.length}</small></button>
            <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`${group.groupName}分组菜单`} disabled={busy || opening}><MoreVertical size={15} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="matrix-account-context-menu">
              {!group.isDefault && <DropdownMenuItem onSelect={() => openGroupAction('rename', group)}>修改名称</DropdownMenuItem>}
              {!group.isDefault && <DropdownMenuItem onSelect={() => openGroupAction('delete', group)} className="text-destructive">删除</DropdownMenuItem>}
              <DropdownMenuItem disabled={!all.length || opening} onSelect={() => void openAll(group)}>打开所有账号</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openGroupAction('color', group)}>设置颜色</DropdownMenuItem>
            </DropdownMenuContent></DropdownMenu>
          </div>
          {expanded && <div className="matrix-manager-group-accounts">{rows.map(account => <div key={account.id} data-manager-account={account.id} className={`matrix-manager-account ${active === account.id ? 'is-active' : ''} ${selected.includes(account.id) ? 'is-selected' : ''}`} draggable={!busy}
            onDragStart={event => { event.dataTransfer.setData(accountDragType, encodeAccountDrag(owner, selected.includes(account.id) ? selected : [account.id])); event.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDropTarget('')}>
            <button className="matrix-manager-select" aria-label={`选择移动账号${account.nickname}`} title="选中多个账号后拖动，可一起移动" aria-pressed={selected.includes(account.id)} onClick={() => setSelected(current => current.includes(account.id) ? current.filter(id => id !== account.id) : [...current, account.id])}><GripVertical size={14} /></button>
            <button className="matrix-manager-account-open" onClick={() => void workspace.openAccount(account, 'manage')} title={`打开${account.nickname}官方后台`}><AccountAvatar account={account} status /><span><strong>{account.nickname || '未命名账号'}</strong><small>{account.accountRemark || accountPlatformMeta[account.platform].label}</small></span></button>
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`${account.nickname}账号菜单`}><MoreVertical size={14} /></Button></DropdownMenuTrigger><DropdownMenuContent className="matrix-account-context-menu" align="start">
              <DropdownMenuItem onSelect={() => openAccountAction('detail', account)}>账号详情</DropdownMenuItem><DropdownMenuItem onSelect={() => openAccountAction('remark', account)}>编辑备注</DropdownMenuItem><DropdownMenuItem onSelect={() => openAccountAction('move', account)}>移动分组</DropdownMenuItem><DropdownMenuItem onSelect={() => openAccountAction('reauthorize', account)}>重新授权</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" disabled={workspace.jobsLocked} onSelect={() => openAccountAction('unbind', account)}>解绑账号</DropdownMenuItem>
            </DropdownMenuContent></DropdownMenu>
          </div>)}{!rows.length && <p className="matrix-manager-group-empty">{all.length ? '没有匹配账号' : '暂无账号，可拖到此分组'}</p>}</div>}
        </section>;
      })}
      {!groups.length && !groupError && <p className="matrix-manager-group-empty">正在准备账号分组…</p>}
    </div>
    <footer><div><button onClick={() => setCollapsed(collapsed.length ? [] : groups.map(g => g.id))}>{collapsed.length ? '展开所有' : '收起所有'}</button><Button variant="outline" size="sm" onClick={() => openGroupAction('new')}><Plus size={13} />添加分组</Button></div><small>{selected.length ? `已选 ${selected.length} 个 · 拖到目标分组` : '拖动账号到分组 · 登录会话保存在本机'}</small></footer>

    {binding && <AccountBindingDialog groups={groups} onClose={() => setBinding(false)} onCore={(platform, groupId) => { setBinding(false); void workspace.bindAccount(platform, groupId); }} onWorkspace={provider => { setBinding(false); openPlatformDirectory(provider); }} />}
    <Dialog open={!!groupAction} onOpenChange={open => { if (!open && !busy) setGroupAction(undefined); }}><DialogContent><DialogHeader><DialogTitle>{groupAction?.kind === 'new' ? '添加分组' : groupAction?.kind === 'rename' ? '修改名称' : groupAction?.kind === 'color' ? '设置颜色' : '删除分组'}</DialogTitle><DialogDescription>{groupAction?.kind === 'delete' ? `删除「${groupAction.group?.groupName}」后，账号移回默认分组，不会解绑或删除平台账号。` : '分组设置保存到本地数据库，重新启动仍会保留。'}</DialogDescription></DialogHeader>
      {['new', 'rename'].includes(groupAction?.kind || '') && <Input aria-label="分组名称" maxLength={100} autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="请输入分组名称" />}
      {groupAction?.kind === 'color' && <div className="matrix-group-color-picker"><span style={{ backgroundColor: color, color: groupLabelForeground(color) }}>{groupAction.group?.groupName}</span><div>{palette.map(value => <button key={value} aria-label={`分组颜色${value}`} aria-pressed={color === value} style={{ backgroundColor: value, color: groupLabelForeground(value) }} onClick={() => setColor(value)}>{color === value ? '✓ 分组栏' : '分组栏'}</button>)}</div><p className="text-xs text-muted-foreground mb-3">颜色用于整条分组标题栏，不改变账号行背景。</p><label>自定义栏位颜色<input aria-label="自定义分组颜色" type="color" value={color} onChange={event => setColor(event.target.value)} /></label></div>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setGroupAction(undefined)}>取消</Button><Button variant={groupAction?.kind === 'delete' ? 'destructive' : 'default'} disabled={busy || (['new', 'rename'].includes(groupAction?.kind || '') && !name.trim())} onClick={saveGroup}>{busy ? '正在保存…' : groupAction?.kind === 'delete' ? '确认删除' : '保存'}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!accountAction} onOpenChange={open => { if (!open && !busy) setAccountAction(undefined); }}><DialogContent><DialogHeader><DialogTitle>{{ detail: '账号详情', remark: '编辑备注', move: '移动分组', reauthorize: '重新授权', unbind: '解绑账号' }[accountAction?.kind || 'detail']}</DialogTitle><DialogDescription>{accountAction?.account.nickname} · {accountAction && accountPlatformMeta[accountAction.account.platform].label}</DialogDescription></DialogHeader>
      {accountAction?.kind === 'detail' && <div className="matrix-manager-account-detail"><AccountAvatar account={accountAction.account} size="lg" status /><div><strong>{accountAction.account.nickname}</strong><p>平台账号标识：{accountAction.account.nativeAccountKey || "暂未采集（不是远效内部ID）"}</p><p>分组：{accountAction.account.groupName || '默认分组'}</p><p>备注：{accountAction.account.accountRemark || '未设置'}</p><p>账号状态：{detailAppearance?.label}</p><small>{detailAppearance?.reason}。粉丝与作品数据以官方后台为准。</small></div></div>}
      {accountAction?.kind === 'detail' && detailAccount && <div className="text-sm text-muted-foreground" aria-label="账号绑定与核验时间"><p>首次绑定：{new Date(detailAccount.bindTime||detailAccount.createdAt).toLocaleString('zh-CN')}</p><p>最近核验正常：{detailAccount.lastVerifiedAt?new Date(detailAccount.lastVerifiedAt).toLocaleString('zh-CN'):'尚未留存'}</p><p>绑定与登录会话保存在本机；后台自动更新状态，不会因刷新、改名而重置首次绑定时间。</p></div>}
      {accountAction?.kind === 'detail' && detailAccount && <div className="text-sm text-muted-foreground" aria-label="账号真实粉丝采集"><p>粉丝数：{detailAccount.metricsObservedAt?detailAccount.followersCount.toLocaleString():'暂未采集到可信的精确粉丝数'}</p><p>较上次采集：{typeof detailAccount.followersChange==='number'?`${detailAccount.followersChange>0?'+':''}${detailAccount.followersChange}`:'暂无两次同口径的可比数据'}</p>{detailAccount.metricsObservedAt&&<small>采集时间：{new Date(detailAccount.metricsObservedAt).toLocaleString('zh-CN')}；来源：{accountMetricSourceLabel(detailAccount.metricsSource)}；不是今日增量，不把缩写或已读取名单条数当总数。</small>}{detailAccount.metricsError&&<p>最近计数检查：{detailAccount.metricsError}；已有可信采样仍保留。</p>}</div>}
      {accountAction?.kind === 'remark' && <Input aria-label="账号备注" maxLength={100} value={remark} onChange={event => setRemark(event.target.value)} placeholder="可填写用途、负责人或其他说明" />}
      {accountAction?.kind === 'move' && <select className="matrix-group-move-select" aria-label="移动到分组" value={targetGroup} onChange={event => setTargetGroup(event.target.value)}>{groups.map(group => <option key={group.id} value={group.id}>{group.groupName}</option>)}</select>}
      {accountAction?.kind === 'reauthorize' && <p className="text-sm text-muted-foreground">使用当前账号的独立官方会话重新登录；分组和备注不变。本人验证需要你在官方页面完成。</p>}
      {accountAction?.kind === 'unbind' && <p className="text-sm text-muted-foreground">仅移除远效内的绑定记录。不会删除平台账号、已发布作品或本地浏览器会话；任务运行中不能解绑。</p>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setAccountAction(undefined)}>{accountAction?.kind === 'detail' ? '关闭' : '取消'}</Button>{accountAction?.kind !== 'detail' && <Button variant={accountAction?.kind === 'unbind' ? 'destructive' : 'default'} disabled={busy || (accountAction?.kind === 'unbind' && workspace.jobsLocked)} onClick={saveAccount}>{busy ? '处理中…' : accountAction?.kind === 'unbind' ? '确认解绑' : accountAction?.kind === 'reauthorize' ? '打开官方登录' : '保存'}</Button>}</DialogFooter></DialogContent></Dialog>
  </aside>;
}
