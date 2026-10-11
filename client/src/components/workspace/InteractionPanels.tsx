import { useEffect, useState } from 'react';
import { Copy, MessageSquareText, Users, Video } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { ContentPost, MessageTemplate, PlatformAccount } from '@shared/api.interface';
import { axiosForBackend } from '@/api';
import { Button } from '@/components/ui/button';
import { platformLabels } from './OfficialWorkspace';

export function InteractionAccountRail({ platform, selected, onSelect }: { platform: string; selected?: string; onSelect(account: PlatformAccount | null): void }) {
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const abort = new AbortController();
    axiosForBackend.get('/api/platform/accounts', { params: { page: 1, pageSize: 100 }, signal: abort.signal })
      .then(r => { if (!abort.signal.aborted) setAccounts(r.data.data.items); })
      .catch(() => { if (!abort.signal.aborted) setError('账号加载失败，请刷新页面重试'); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, []);
  const visible = accounts.filter(a => platform === 'all' || a.platform === platform);
  return <aside className="matrix-interaction-accounts" aria-label="互动账号列表"><header><Users size={16} />账号列表</header><button className={!selected ? 'is-active' : ''} onClick={() => onSelect(null)}>全部账号<span>{visible.length}</span></button>{visible.map(account => <button key={account.id} className={selected === account.id ? 'is-active' : ''} onClick={() => onSelect(account)}><div><strong>{account.nickname || '未命名账号'}</strong><small>{platformLabels[account.platform]}</small></div><span>{account.authStatus === 'authorized' ? '已绑定' : '待登录'}</span></button>)}{loading && <p role="status">正在加载账号…</p>}{error && <p role="alert">{error}</p>}{!loading && !error && !visible.length && <p>暂无绑定账号</p>}<footer><Link to="/accounts">管理账号</Link></footer></aside>;
}

export function InteractionPostRail({ account, selected, onSelect }: { account: PlatformAccount | null; selected: string; onSelect(id: string): void }) {
  const [items, setItems] = useState<ContentPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  useEffect(() => { setPage(1); }, [account?.id]);
  useEffect(() => {
    const abort = new AbortController();
    setItems([]); setTotal(0); setError('');
    if (!account) { setLoading(false); return () => abort.abort(); }
    setLoading(true);
    axiosForBackend.get('/api/content/posts', { params: { accountId: account.id, status: 'published', page, pageSize: 20 }, signal: abort.signal })
      .then(r => { if (!abort.signal.aborted) { setItems(r.data.data.items); setTotal(r.data.data.total); } })
      .catch(() => { if (!abort.signal.aborted) setError('作品记录加载失败，请重新选择账号重试'); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [account?.id, page]);
  return <aside className="matrix-interaction-posts" aria-label="关联作品列表"><header><Video size={16} /><strong>作品列表</strong><span>{total}</span></header><p className="matrix-post-scope">仅列矩效中已发布的记录；官方作品同步尚未接通，草稿不在此列。</p><button className={!selected ? 'is-active' : ''} onClick={() => onSelect('')}>全部作品的评论</button><div className="matrix-post-list">{loading && <p role="status">加载作品记录…</p>}{error && <p role="alert">{error}</p>}{!account && <div className="matrix-interaction-empty">请先选择浏览账号</div>}{account && !loading && !error && !items.length && <div className="matrix-interaction-empty">暂无已发布的作品记录</div>}{items.map(item => <button key={item.id} data-interaction-post-id={item.id} className={selected === item.id ? 'is-active' : ''} onClick={() => onSelect(item.id)}>{item.coverUrl ? <img src={item.coverUrl} alt="作品封面" /> : <span className="matrix-post-thumbnail"><Video size={22} /></span>}<div><strong>{item.title || '未命名作品'}</strong><small>{item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('zh-CN') : '已发布记录'}</small></div></button>)}</div><footer><Button variant="ghost" size="sm" disabled={!account || page === 1 || loading} onClick={() => setPage(p => p - 1)}>上一页</Button><span>{page}/{Math.max(1, Math.ceil(total / 20))}</span><Button variant="ghost" size="sm" disabled={!account || page * 20 >= total || loading} onClick={() => setPage(p => p + 1)}>下一页</Button></footer></aside>;
}

export function ReplyTemplatePane() {
  const [items, setItems] = useState<MessageTemplate[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const abort = new AbortController();
    axiosForBackend.get('/api/automation/templates', { params: { page: 1, pageSize: 100, templateType: 'text' }, signal: abort.signal })
      .then(r => { if (!abort.signal.aborted) setItems(r.data.data.items); })
      .catch(() => { if (!abort.signal.aborted) setError('话术加载失败，请刷新页面重试'); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, []);
  return <aside className="matrix-reply-template-pane" aria-label="话术库"><header><strong><MessageSquareText size={16} />话术库</strong><Link to="/automation/templates">管理</Link></header><small>点击复制后自行粘贴，不会双击发送或自动发送。</small>{loading && <p role="status">正在加载话术…</p>}{error && <p role="alert">{error}</p>}{!loading && !error && !items.length && <div className="matrix-interaction-empty">暂无保存的话术<Link to="/automation/templates">新增话术</Link></div>}{items.map(item => <article key={item.id}><strong>{item.templateName}</strong><p>{item.content}</p><Button size="sm" variant="outline" disabled={!item.content} onClick={() => void navigator.clipboard.writeText(item.content || '').then(() => toast.success('话术已复制，尚未发送')).catch(() => toast.error('复制失败，请手动复制'))}><Copy size={13} />复制话术</Button></article>)}</aside>;
}
