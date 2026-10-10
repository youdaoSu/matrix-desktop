import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FileText, Globe2, Layers3, MessageCircle, Moon, Plus, RefreshCw, Send, Sun, Users } from 'lucide-react';
import { axiosForBackend, getUser } from '@/api';
import type { Announcement, ContentPost, PlatformAccount, PlatformType } from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import { platformLabels, useOfficialWorkspace } from '@/components/workspace/OfficialWorkspace';

export default function DashboardPage() {
  const workspace = useOfficialWorkspace();
  const { resolvedTheme, setTheme } = useTheme();
  const user = getUser();
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [drafts, setDrafts] = useState<ContentPost[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [stats, setStats] = useState({ posts: 0, followers: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true);
    setError('');
    const results = await Promise.allSettled([
      axiosForBackend.get('/api/platform/accounts', { params: { page: 1, pageSize: 100 } }),
      axiosForBackend.get('/api/content/drafts', { params: { page: 1, pageSize: 5 } }),
      axiosForBackend.get('/api/analytics/overview'),
      axiosForBackend.get('/api/notifications/announcements', { params: { limit: 3 } }),
    ]);
    if (results[0].status === 'fulfilled') setAccounts(results[0].value.data?.data?.items || []);
    if (results[1].status === 'fulfilled') setDrafts(results[1].value.data?.data?.items || []);
    if (results[2].status === 'fulfilled') {
      const data = results[2].value.data?.data;
      setStats({ posts: Number(data?.totalPosts || 0), followers: Number(data?.totalFollowers || 0) });
    }
    if (results[3].status === 'fulfilled') setAnnouncements(results[3].value.data?.data || []);
    if (results.some(result => result.status === 'rejected')) setError('部分数据暂时无法加载，可以刷新重试。');
    setLoading(false);
  };
  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener('matrix:accounts-updated', refresh);
    return () => window.removeEventListener('matrix:accounts-updated', refresh);
  }, []);
  const metrics = [
    { label: '已绑定账号', value: accounts.length, detail: '个人创作账号集中管理', icon: Users, to: '/accounts', color: 'orange' },
    { label: '内容记录', value: stats.posts, detail: '本地草稿与已同步内容', icon: FileText, to: '/publish/tasks', color: 'blue' },
    { label: '已同步粉丝', value: stats.followers, detail: '尚未同步的指标显示为 0', icon: Layers3, to: '/analytics', color: 'green' },
  ];
  return <div className="matrix-dashboard">
    <div className="matrix-dashboard-heading"><div><span className="matrix-eyebrow">CREATOR WORKSPACE</span><h1>{user?.nickname || user?.username || '创作者'}，欢迎回来</h1><p>整理今天的内容，把每一个账号经营好。</p></div><div><Button variant="ghost" size="icon" title="切换明暗主题" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>{resolvedTheme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</Button><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />刷新</Button><Button onClick={() => workspace.show()}><Globe2 size={15} />打开官方工作区</Button></div></div>
    {error && <div role="alert" className="matrix-dashboard-alert">{error}</div>}
    <div className="matrix-dashboard-metrics">{metrics.map(({ label, value, detail, icon: Icon, to, color }) => <Link to={to} key={label} className="matrix-metric"><div><span>{label}</span><i className={color}><Icon size={20} /></i></div><strong>{loading ? '—' : value.toLocaleString()}</strong><footer>{detail}<ArrowRight size={14} /></footer></Link>)}</div>
    <div className="matrix-dashboard-columns"><div className="matrix-dashboard-primary">
      <section className="matrix-home-panel"><div className="matrix-panel-heading"><div><h2>从创作到互动</h2><p>你的日常运营，在这里开始</p></div><span>个人创作者工作流</span></div><div className="matrix-workflow-cards">
        <button onClick={() => workspace.show()}><span><Users size={20} /></span><small>01 / 连接账号</small><strong>打开官方后台</strong><p>扫码登录，按分组切换账号</p><ArrowRight size={16} /></button>
        <Link to="/publish/create"><span><Send size={20} /></span><small>02 / 内容创作</small><strong>准备发布内容</strong><p>整理草稿，在官方页面发表</p><ArrowRight size={16} /></Link>
        <button onClick={() => workspace.show('comments')}><span><MessageCircle size={20} /></span><small>03 / 粉丝互动</small><strong>回复评论与私信</strong><p>在当前账号的官方页面互动</p><ArrowRight size={16} /></button>
      </div></section>
      <section className="matrix-home-panel"><div className="matrix-panel-heading"><div><h2>最近的草稿</h2><p>本地保存的创作内容</p></div><Link to="/publish/drafts">全部草稿<ArrowRight size={13} /></Link></div>
        {drafts.length ? <div className="matrix-home-drafts">{drafts.map(draft => <div key={draft.id}><span className="matrix-draft-icon"><FileText size={19} /></span><div><strong>{draft.title || '未命名草稿'}</strong><small>{platformLabels[draft.platform]} · {draft.accountNickname || '已绑定账号'}</small></div><time>{new Date(draft.createdAt).toLocaleDateString('zh-CN')}</time><Button size="sm" variant="outline" onClick={() => workspace.show('publish')}>官方发布</Button></div>)}</div> : <div className="matrix-home-empty"><FileText size={30} /><strong>把下一个灵感保存下来</strong><p>创建草稿，整理标题和正文，准备下一次发布。</p><Button asChild variant="outline" size="sm"><Link to="/publish/create"><Plus size={14} />新建草稿</Link></Button></div>}
      </section>
    </div><aside className="matrix-dashboard-secondary">
      <section className="matrix-home-panel"><div className="matrix-panel-heading"><h2>平台账号</h2><Link to="/accounts">管理<ArrowRight size={13} /></Link></div><div className="matrix-home-platforms">{(Object.keys(platformLabels) as PlatformType[]).map(platform => <button key={platform} onClick={() => {
        const account = accounts.find(item => item.platform === platform && item.connectorSessionId);
        if (account) void workspace.openAccount(account);
        else void workspace.bindAccount(platform);
      }}><span className={'matrix-home-platform-icon ' + platform}>{platformLabels[platform].slice(0, 1)}</span><div><strong>{platformLabels[platform]}</strong><small>{accounts.filter(account => account.platform === platform).length} 个账号</small></div><ArrowRight size={15} /></button>)}</div></section>
      <section className="matrix-home-panel matrix-personal-card"><span className="matrix-personal-avatar">{(user?.nickname || user?.username || '用').slice(0, 1)}</span><h2>{user?.nickname || user?.username || '个人用户'}</h2><p>{user?.email || '个人创作者'}</p><div><span>会员状态</span><strong>{user?.vipStatus === 'active' ? (user?.vipPlanName || '已激活') : user?.vipStatus === 'expired' ? '已到期' : '未激活'}</strong></div><div><span>可绑定账号</span><strong>{user?.maxAccounts > 0 ? user.maxAccounts + ' 个' : '以账号权限为准'}</strong></div><Button asChild variant="outline" size="sm"><Link to="/settings/profile">账号设置<ArrowRight size={13} /></Link></Button></section>
      <section className="matrix-home-panel matrix-home-notice"><span className="matrix-eyebrow">LATEST NOTICE</span><h2>{announcements[0]?.title || '让运营更有条理'}</h2><p>{announcements[0]?.summary || '官方工作区保留各账号的页面和登录状态。切换到草稿、评论或私信模块，再回来继续操作。'}</p><Link to="/docs/platforms">查看平台操作说明<ArrowRight size={13} /></Link></section>
    </aside></div>
  </div>;
}
