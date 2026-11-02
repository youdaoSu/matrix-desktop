import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import type { FollowerRecord, PlatformAccount } from '@shared/api.interface';
import { axiosForBackend } from '@/api';
import { InteractionAccountRail } from '@/components/workspace/InteractionPanels';
import { OfficialInteractionManager } from '@/components/workspace/OfficialInteractionManager';
import { InteractionLiveFeed } from '@/components/workspace/InteractionLiveFeed';
import { InteractionEmpty, InteractionTools, useInteractionFilters } from '@/components/workspace/InteractionUi';
import { useInteractionAccount, useInteractionPlatform } from '@/components/workspace/InteractionState';
import { uiText, useWorkspaceIdentity, useWorkspacePreference } from '@/components/workspace/WorkspaceUiState';
import { useOwnerRequest } from '@/components/workspace/use-owner-request';
import { platformLabels } from '@/components/workspace/OfficialWorkspace';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function FollowersPage() {
  const [platform, setPlatform] = useInteractionPlatform();
  const filters = useInteractionFilters(platform, 'followers');
  const accounts = filters.accounts;
  const [account, setAccount] = useInteractionAccount(platform, 'followers', accounts, filters.loaded);
  const accountId = account?.id || 'all';
  const lease = useWorkspaceIdentity();
  const readScope = `${lease}/${platform}/${accountId}/${account?.connectorSessionId || ''}`;
  const [snapshot, setSnapshot] = useState<{ scope: string; items: FollowerRecord[] }>({ scope: '', items: [] });
  const followers = snapshot.scope === readScope ? snapshot.items : [];
  const setFollowers = (items: FollowerRecord[]) => setSnapshot({ scope: readScope, items });
  const [search, setSearch] = useWorkspacePreference(`interaction.followers.${platform}.search`, '', uiText);
  const [selectedId, setSelectedId] = useState('');
  const [readStatus, setReadStatus] = useState<{ scope: string; loading: boolean; error: string }>({ scope: '', loading: true, error: '' });
  const loading = readStatus.scope !== readScope || readStatus.loading;
  const error = readStatus.scope === readScope ? readStatus.error : '';
  const generation = useRef(0);
  const beginRequest = useOwnerRequest();
  const load = async () => {
    if (!filters.loaded || platform === 'douyin') return;
    const request = beginRequest(); if (!request.authorized) { request.finish(); return; }
    window.dispatchEvent(new CustomEvent('matrix:interaction-refresh-request', { detail: { kind: 'followers' } }));
    const current = ++generation.current;
    setReadStatus({ scope: readScope, loading: true, error: '' }); setFollowers([]); setSelectedId('');
    try {
      const params = { page: 1, pageSize: 100, ...(search.trim() ? { keyword: search.trim() } : {}), platform, ...(accountId !== 'all' ? { accountId } : {}) };
      const followerResponse = await axiosForBackend.get('/api/platform/followers', { params, signal: request.signal });
      if (request.current() && current === generation.current) {
        const allowed = new Set(accounts.filter(item => accountId === 'all' || item.id === accountId).map(item => item.id));
        const items = followerResponse.data?.data?.items;
        if (!Array.isArray(items)) throw Error('粉丝响应不完整');
        setFollowers(items.filter((item: FollowerRecord) => allowed.has(item.accountId)));
      }
    } catch { if (request.current() && current === generation.current) { setReadStatus({ scope: readScope, loading: false, error: '粉丝记录加载失败，请刷新重试' }); toast.error('粉丝记录加载失败'); } }
    finally { request.finish(); if (request.current() && current === generation.current) setReadStatus(previous => previous.scope === readScope ? { ...previous, loading: false } : previous); }
  };
  useEffect(() => { setFollowers([]); setSelectedId(''); void load(); return () => { generation.current++; }; }, [platform, accountId, account?.connectorSessionId, filters.loaded, lease]);
  const selected = followers.find(follower => follower.id === selectedId && follower.platform === platform && accounts.some(item => item.id === follower.accountId));
  return <div data-interaction-view="followers" data-interaction-platform={platform} className="matrix-interaction-layout matrix-followers-layout">
    <InteractionAccountRail platform={platform} selected={account?.id} onPlatformChange={setPlatform} onSelect={setAccount} />
    <section className="matrix-interaction-content">
      <div className="matrix-interaction-toolbar"><h1>粉丝管理</h1></div>
      <InteractionLiveFeed kind="followers" syncPlatform platform={platform} account={accounts.find(item => item.id === accountId)} />
      {platform !== 'douyin' && <InteractionTools title="本机历史粉丝与手动读取工具（非实时来源）">
      <div className="matrix-interaction-toolbar"><strong>历史粉丝筛选</strong><div className="matrix-interaction-search"><Search size={15} /><Input aria-label="搜索粉丝" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => event.key === 'Enter' && void load()} placeholder="搜索本机历史昵称 / 标签" /></div><Button variant="outline" onClick={() => void load()}>查询历史</Button><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw size={14} />刷新历史</Button></div>
      <div className="matrix-follower-browser">
        <section className="matrix-follower-list" aria-label="粉丝记录">
          {loading && <p role="status">正在加载粉丝…</p>}{error && <p role="alert">{error}</p>}
          {followers.map(follower => <button key={follower.id} data-follower-id={follower.id} className={selectedId === follower.id ? 'is-active' : ''} onClick={() => setSelectedId(follower.id)}><Avatar><AvatarImage src={follower.avatarUrl} /><AvatarFallback>{(follower.nickname || '粉').slice(0, 1)}</AvatarFallback></Avatar><div><strong>{follower.nickname || '未命名粉丝'}</strong><small>{follower.followerPlatformId}</small></div>{follower.isMutual && <Badge variant="secondary">互关</Badge>}</button>)}
          {!loading && !error && !followers.length && <InteractionEmpty>暂无已同步粉丝</InteractionEmpty>}
          <footer className="matrix-interaction-rail-footer">本次历史记录: {loading || error ? '—' : followers.length}<small>本次最多加载 100 条，不代表平台粉丝总数</small></footer>
        </section>
        <section className="matrix-follower-profile" aria-label="粉丝详情">
          {selected ? <><div className="matrix-follower-profile-title"><Avatar><AvatarImage src={selected.avatarUrl} /><AvatarFallback>{(selected.nickname || '粉').slice(0, 1)}</AvatarFallback></Avatar><strong>{selected.nickname || '未命名粉丝'}</strong></div><dl><dt>平台 ID</dt><dd>{selected.followerPlatformId}</dd><dt>平台 / 所属账号</dt><dd>{platformLabels[selected.platform]} · {accounts.find(account => account.id === selected.accountId)?.nickname || '未知账号'}</dd><dt>关注时间</dt><dd>{selected.followedAt ? new Date(selected.followedAt).toLocaleString('zh-CN') : '未同步'}</dd><dt>地区</dt><dd>{selected.location || '未同步'}</dd><dt>标签</dt><dd>{selected.tags?.join('、') || '未设置'}</dd><dt>备注</dt><dd>{selected.remark || '未设置'}</dd></dl><p className="matrix-interaction-hint">此处为已同步记录；关注、取关和私信操作请核对官方账号页面。</p></> : <InteractionEmpty>选择粉丝查看详情 · 尚未读取到主页链接</InteractionEmpty>}
        </section>
      </div>
      <InteractionTools title="官方页面粉丝快照工作台"><OfficialInteractionManager account={accounts.find(account => account.id === accountId)} kind="followers" /></InteractionTools>
      </InteractionTools>}
    </section>
  </div>;
}
