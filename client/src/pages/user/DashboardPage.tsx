import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FileText, Layers3, MessageCircle, Moon, Plus, RefreshCw, Send, Sun, Users } from 'lucide-react';
import { axiosForBackend, getAuthToken, getUser } from '@/api';
import { followerPresentation, type FollowerCoverage } from '@shared/account-metrics';
import { useOwnerRequest } from '@/components/workspace/use-owner-request';
import { useAccountDataRefresh } from '@/components/workspace/account-data-events';
import type { Announcement, ContentPost, PlatformAccount, PlatformType } from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import { platformLabels } from '@/components/workspace/OfficialWorkspace';
import { PlatformLogo } from '@/components/workspace/PlatformLogo';
import DesktopRecordOverview from '@/components/workspace/DesktopRecordOverview';

export default function DashboardPage() {
  return <DashboardWorkspace key={getUser()?.id || 'signed-out'} />;
}
function DashboardWorkspace() {
  const { resolvedTheme, setTheme } = useTheme();
  const user = getUser();
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [drafts, setDrafts] = useState<ContentPost[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [stats, setStats] = useState<{posts:number|null;coverage?:FollowerCoverage}>({posts:null});
  const [accountTotal,setAccountTotal]=useState<number|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const beginRequest=useOwnerRequest(),owner=user?.id,token=getAuthToken();
  const load = useCallback(async () => {
    const request=beginRequest();if(!request.authorized){request.finish();setLoading(false);return;}
    setLoading(true);
    setError('');
    const results = await Promise.allSettled([
      axiosForBackend.get('/api/platform/accounts', { params: { page: 1, pageSize: 100 },signal:request.signal }),
      axiosForBackend.get('/api/content/drafts', { params: { page: 1, pageSize: 5 },signal:request.signal }),
      axiosForBackend.get('/api/analytics/overview',{signal:request.signal}),
      axiosForBackend.get('/api/notifications/announcements', { params: { limit: 3 },signal:request.signal }),
    ]);
    request.finish();
    if(!request.current())return;
    if (results[0].status === 'fulfilled') {const data=results[0].value.data?.data,items=Array.isArray(data?.items)?data.items:[];setAccounts(items);setAccountTotal(Number.isSafeInteger(data?.total)&&data.total>=0?data.total:items.length);}
    if (results[1].status === 'fulfilled') setDrafts(Array.isArray(results[1].value.data?.data?.items)?results[1].value.data.data.items:[]);
    if (results[2].status === 'fulfilled') {
      const data = results[2].value.data?.data;
      setStats({ posts: Number.isSafeInteger(data?.totalPosts)&&data.totalPosts>=0?data.totalPosts:null, coverage:data?.followerCoverage });
    }
    if (results[3].status === 'fulfilled') setAnnouncements(Array.isArray(results[3].value.data?.data)?results[3].value.data.data:[]);
    if (results.some(result => result.status === 'rejected')) setError('部分数据暂时无法加载，可以刷新重试。');
    setLoading(false);
  },[beginRequest]);
  useEffect(() => {
    setAccounts([]);setDrafts([]);setAnnouncements([]);setStats({posts:null});setAccountTotal(null);
    void load();
    const refresh = () => void load();
    window.addEventListener('matrix:accounts-updated', refresh);
    return () => window.removeEventListener('matrix:accounts-updated', refresh);
  }, [load,owner,token]);
  useAccountDataRefresh(load);
  const followers=followerPresentation(stats.coverage);
  const metrics = [
    { label: '已绑定账号', value: accountTotal, detail: '个人创作账号集中管理', icon: Users, to: '/accounts', color: 'orange' },
    { label: '内容记录', value: stats.posts, detail: '本地草稿与已同步内容', icon: FileText, to: '/publish/tasks', color: 'blue' },
    { label: '已采集粉丝小计', value: followers.value, detail: followers.detail, icon: Layers3, to: '/analytics/account-data', color: 'green' },
  ];
  return <div className="matrix-dashboard">
    <div className="matrix-dashboard-heading"><div><span className="matrix-eyebrow">CREATOR WORKSPACE</span><h1>{user?.nickname || user?.username || '创作者'}，欢迎回来</h1><p>整理今天的内容，把每一个账号经营好。</p></div><div><Button variant="ghost" size="icon" title="切换明暗主题" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>{resolvedTheme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</Button><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />刷新</Button><Button asChild><Link to="/publish/create"><Plus size={15} />新建作品</Link></Button></div></div>
    {error && <div role="alert" className="matrix-dashboard-alert">{error}</div>}
    <div className="matrix-dashboard-metrics">{metrics.map(({ label, value, detail, icon: Icon, to, color }) => <Link to={to} key={label} className="matrix-metric"><div><span>{label}</span><i className={color}><Icon size={20} /></i></div><strong>{loading || value===null ? '—' : value.toLocaleString()}</strong><footer>{detail}<ArrowRight size={14} /></footer></Link>)}</div>
    <DesktopRecordOverview compact />
    <div className="matrix-dashboard-columns"><div className="matrix-dashboard-primary">
      <section className="matrix-home-panel"><div className="matrix-panel-heading"><div><h2>从创作到互动</h2><p>你的日常运营，在这里开始</p></div><span>个人创作者工作流</span></div><div className="matrix-workflow-cards">
        <Link to="/accounts"><span><Users size={20} /></span><small>01 / 账号管理</small><strong>管理平台账号</strong><p>添加、授权和分组统一管理</p><ArrowRight size={16} /></Link>
        <Link to="/publish/create"><span><Send size={20} /></span><small>02 / 内容创作</small><strong>准备发布内容</strong><p>整理草稿，在官方页面发表</p><ArrowRight size={16} /></Link>
        <Link to="/engage/comments"><span><MessageCircle size={20} /></span><small>03 / 粉丝互动</small><strong>回复评论与私信</strong><p>进入互动模块，集中处理消息</p><ArrowRight size={16} /></Link>
      </div></section>
      <section className="matrix-home-panel"><div className="matrix-panel-heading"><div><h2>最近的草稿</h2><p>本地保存的创作内容</p></div><Link to="/publish/drafts">全部草稿<ArrowRight size={13} /></Link></div>
        {drafts.length ? <div className="matrix-home-drafts">{drafts.map(draft => <div key={draft.id}><span className="matrix-draft-icon"><FileText size={19} /></span><div><strong>{draft.title || '未命名草稿'}</strong><small>{platformLabels[draft.platform]} · {draft.accountNickname || '已绑定账号'}</small></div><time>{new Date(draft.createdAt).toLocaleDateString('zh-CN')}</time><Button asChild size="sm" variant="outline"><Link to="/publish/drafts">查看草稿</Link></Button></div>)}</div> : <div className="matrix-home-empty"><FileText size={30} /><strong>把下一个灵感保存下来</strong><p>创建草稿，整理标题和正文，准备下一次发布。</p><Button asChild variant="outline" size="sm"><Link to="/publish/create"><Plus size={14} />新建草稿</Link></Button></div>}
      </section>
    </div><aside className="matrix-dashboard-secondary">
      <section className="matrix-home-panel"><div className="matrix-panel-heading"><h2>平台账号</h2><Link to="/accounts">管理<ArrowRight size={13} /></Link></div><div className="matrix-home-platforms">{(Object.keys(platformLabels) as PlatformType[]).map(platform => <Link key={platform} to="/accounts"><span className={'matrix-home-platform-icon ' + platform}><PlatformLogo platform={platform} size={34} /></span><div><strong>{platformLabels[platform]}</strong><small>{accounts.filter(account => account.platform === platform).length} 个账号</small></div><ArrowRight size={15} /></Link>)}</div></section>
      <section className="matrix-home-panel matrix-personal-card"><span className="matrix-personal-avatar">{(user?.nickname || user?.username || '用').slice(0, 1)}</span><h2>{user?.nickname || user?.username || '个人用户'}</h2><p>{user?.email || '个人创作者'}</p><div><span>会员状态</span><strong>{user?.vipStatus === 'active' ? (user?.vipPlanName || '已激活') : user?.vipStatus === 'expired' ? '已到期' : '未激活'}</strong></div><div><span>可绑定账号</span><strong>{user?.maxAccounts > 0 ? user.maxAccounts + ' 个' : '以账号权限为准'}</strong></div><Button asChild variant="outline" size="sm"><Link to="/settings/profile">账号设置<ArrowRight size={13} /></Link></Button></section>
      <section className="matrix-home-panel matrix-home-notice"><span className="matrix-eyebrow">LATEST NOTICE</span><h2>{announcements[0]?.title || '让运营更有条理'}</h2><p>{announcements[0]?.summary || '在账号管理绑定账号，在发布模块创作，在粉丝互动处理评论和私信。各模块独立，页面状态和本地草稿会保留。'}</p><Link to="/docs/platforms">查看平台操作说明<ArrowRight size={13} /></Link></section>
    </aside></div>
  </div>;
}
