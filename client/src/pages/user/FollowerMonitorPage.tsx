import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { PlatformAccount } from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { InteractionAccountRail } from '@/components/workspace/InteractionPanels';
import { InteractionEmpty, useInteractionFilters } from '@/components/workspace/InteractionUi';
import { useInteractionAccount, useInteractionPlatform } from '@/components/workspace/InteractionState';
import { useDouyinInteractionData, interactionStatus } from '@/components/workspace/DouyinInteractionData';
import { InteractionAvatar } from '@/components/workspace/DouyinInteractionFeed';
import { useOfficialWorkspace } from '@/components/workspace/OfficialWorkspace';
import { uiText, useWorkspaceIdentity, useWorkspacePreference } from '@/components/workspace/WorkspaceUiState';
import { projectFollowerObservations } from './follower-observation-index';

const modes = ['all', 'recent', 'historical'] as const;
type Mode = typeof modes[number];
const validMode = (value: unknown): value is Mode => modes.includes(value as Mode);
const timeLabel = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN') : '未记录';

export function DouyinFollowerObservations({ accounts }: { accounts: PlatformAccount[] }) {
  const data = useDouyinInteractionData('followers'), workspace = useOfficialWorkspace();
  const [search, setSearch] = useWorkspacePreference('interaction.follower-monitor.search', '', uiText);
  const [mode, setMode] = useWorkspacePreference<Mode>('interaction.follower-monitor.mode', 'all', validMode);
  const [selection, setSelection] = useState({ scope: '', page: 1 });
  const { total, current, newlyObserved, filtered } = projectFollowerObservations(accounts, account => data.entry(account, 'followers')?.rows || [], mode, search, Date.now());
  const scope = accounts.map(account => account.id + '/' + account.connectorSessionId).join('|') + '/' + search + '/' + mode;
  const pages = Math.max(1, Math.ceil(filtered.length / 100)), page = Math.min(pages, selection.scope === scope ? selection.page : 1);
  return <div className="p-4" data-follower-observations>
    <div className="matrix-interaction-toolbar"><h1>粉丝变化记录</h1><span className="matrix-toolbar-spacer" /><Button variant="outline" disabled={workspace.jobsLocked || !accounts.some(account => account.connectorSessionId && account.nativeAccountKey)} onClick={() => accounts.filter(account => account.connectorSessionId && account.nativeAccountKey).forEach(account => data.refresh(account, 'followers'))}>刷新粉丝</Button><Button variant="outline" asChild><Link to="/engage/followers">粉丝管理</Link></Button></div>
    <p className="matrix-interaction-hint">与粉丝管理共享本机加密缓存和只读同步，不重复开启采集。首次采集时间不等于关注时间；未取得完整名单时，缺失成员不会判为取关。不会清除官网新粉丝提醒。</p>
    <div className="matrix-interaction-toolbar" aria-label="粉丝缓存统计"><span>当前及待核对缓存：{current}</span><span>24小时内首次采集：{newlyObserved}</span><span>本轮未在列的历史记录：{total - current}</span></div>
    <p className="matrix-interaction-hint">上述数量只代表本机缓存，不代表平台粉丝总数；首次读取历史粉丝也会计入首次采集。</p>
    <div aria-label="粉丝同步来源">{accounts.map(account => { const entry = data.entry(account, 'followers'); return <p key={account.id} data-monitor-account={account.id} title={entry?.error || entry?.phase}>{account.nickname || '未命名账号'} · {entry?.error ? interactionStatus(entry.error) : entry?.followerRosterVerified ? '本轮名单已核对' : entry?.complete ? '可访问范围有限' : entry?.phase || (account.connectorSessionId ? '等待读取' : '需要登录')}</p>; })}</div>
    {workspace.jobsLocked && <p role="status">后台任务已暂停，已有缓存仍可查看。</p>}
    <div className="matrix-interaction-toolbar"><input className="matrix-interaction-select" aria-label="搜索粉丝变化记录" placeholder="搜索粉丝或所属账号" value={search} onChange={event => { setSearch(event.target.value); setSelection({ scope: '', page: 1 }); }} /><select className="matrix-interaction-select" aria-label="粉丝变化筛选" value={mode} onChange={event => { setMode(event.target.value as Mode); setSelection({ scope: '', page: 1 }); }}><option value="all">全部缓存记录</option><option value="recent">24小时内首次采集</option><option value="historical">本轮未在列的历史记录</option></select><span>{filtered.length} 条</span></div>
    <div className="matrix-live-records" aria-label="粉丝变化记录">{filtered.slice((page - 1) * 100, page * 100).map(row => <article key={row.accountId + '/' + row.platformId} data-observed-follower={row.platformId}><InteractionAvatar row={row} account={accounts.find(account=>account.id===row.accountId)} kind="followers" /><div><strong>{row.author}</strong><p>{row.accountNickname} · {row.isCurrentFollower === false ? '本轮完整名单未见，历史仍保留' : row.isCurrentFollower === true ? '曾在官方名单读取到' : '旧缓存，关系待核对'}</p><small>首次采集：{timeLabel(row.firstObservedAt)} · 最近采集：{timeLabel(row.lastObservedAt)}</small></div></article>)}</div>
    {!filtered.length && <InteractionEmpty>暂无符合条件的粉丝变化记录；没有记录不代表粉丝没有变化。</InteractionEmpty>}
    <div className="matrix-interaction-toolbar"><Button variant="outline" disabled={page === 1} onClick={() => setSelection({ scope, page: page - 1 })}>上一页</Button><span>第 {page}/{pages} 页</span><Button variant="outline" disabled={page === pages} onClick={() => setSelection({ scope, page: page + 1 })}>下一页</Button></div>
  </div>;
}

export default function FollowerMonitorPage() {
  const [platform, setPlatform] = useInteractionPlatform(), filters = useInteractionFilters(platform, 'followers');
  const [account, setAccount] = useInteractionAccount(platform, 'follower-monitor', filters.accounts, filters.loaded), lease = useWorkspaceIdentity();
  const accounts = filters.accounts.filter(item => !account || item.id === account.id);
  return <div data-interaction-view="follower-monitor" data-interaction-platform={platform} className="matrix-interaction-layout matrix-followers-layout">
    <InteractionAccountRail platform={platform} selected={account?.id} onPlatformChange={setPlatform} onSelect={setAccount} />
    <section className="matrix-interaction-content">{platform === 'douyin' ? <DouyinFollowerObservations key={lease} accounts={accounts} /> : <div className="p-4"><h1>粉丝变化记录</h1><p>当前接通抖音可访问的粉丝缓存与只读同步；其他平台暂未接通变化记录，不会创建空跑任务。</p><Button onClick={() => setPlatform('douyin')}>查看抖音粉丝变化</Button><Button variant="outline" asChild><Link to="/engage/followers">粉丝管理</Link></Button></div>}</section>
  </div>;
}
