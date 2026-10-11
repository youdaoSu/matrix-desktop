import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, FileText, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import type { ContentPost, PlatformAccount } from '@shared/api.interface';
import { axiosForBackend } from '@/api';
import { OfficialActionButton, platformLabels, useOfficialWorkspace } from '@/components/workspace/OfficialWorkspace';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const statusLabels: Record<string, string> = { draft: '草稿', scheduled: '定时中', publishing: '发布中', published: '已发布', failed: '失败', reviewing: '审核中' };
function errorMessage(error: any) { return error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || '操作失败，请重试'; }
export default function ContentRecordsPage() {
  const { pathname } = useLocation();
  const draftsOnly = pathname.endsWith('/drafts');
  const workspace = useOfficialWorkspace();
  const [items, setItems] = useState<ContentPost[]>([]);
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const [platform, setPlatform] = useState('all');
  const [query, setQuery] = useState('');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<ContentPost | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const generation = useRef(0), lock = useRef(false);
  const load = useCallback(async () => {
    const current = ++generation.current; setLoading(true); setError('');
    try {
      const r = await axiosForBackend.get('/api/content/posts', { params: { page, pageSize: 20, keyword,
        ...(draftsOnly || status !== 'all' ? { status: draftsOnly ? 'draft' : status } : {}), ...(platform !== 'all' ? { platform } : {}) } });
      if (current === generation.current) { setItems(r.data.data.items); setTotal(r.data.data.total); }
    } catch (e) { if (current === generation.current) { setError(errorMessage(e)); setItems([]); } }
    finally { if (current === generation.current) setLoading(false); }
  }, [page, status, platform, keyword, draftsOnly]);
  useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);
  useEffect(() => {
    let active = true;
    axiosForBackend.get('/api/platform/accounts', { params: { page: 1, pageSize: 100 } }).then(r => { if (active) setAccounts(r.data.data.items); }).catch(e => { if (active) toast.error(errorMessage(e)); });
    return () => { active = false; };
  }, []);
  const edit = (item: ContentPost) => { setEditing(item); setTitle(item.title || ''); setContent(item.content || ''); };
  const save = async () => {
    if (!editing || lock.current) return;
    if (!title.trim() && !content.trim()) { toast.error('标题和正文不能同时为空'); return; }
    lock.current = true; setBusy(true);
    try { await axiosForBackend.put(`/api/content/posts/${editing.id}`, { title, content }); setEditing(null); await load(); toast.success('草稿已更新；未发布'); }
    catch (e) { toast.error(errorMessage(e)); }
    finally { lock.current = false; setBusy(false); }
  };
  const remove = async (item: ContentPost) => {
    if (lock.current || !window.confirm(`删除本地草稿「${item.title || '未命名'}」？不会删除官方平台作品；本地删除不可撤销。`)) return;
    lock.current = true; setBusy(true);
    try { await axiosForBackend.delete(`/api/content/posts/${item.id}`); if (items.length === 1 && page > 1) setPage(p => p - 1); else await load(); toast.success('本地草稿已删除'); }
    catch (e) { toast.error(errorMessage(e)); }
    finally { lock.current = false; setBusy(false); }
  };
  const continueDraft = async (item: ContentPost) => {
    const account = accounts.find(a => a.id === item.accountId);
    if (!account) { toast.error('该草稿的账号已解绑或不在当前账号列表中'); return; }
    await workspace.openAccount(account, 'publish', false, [item.title, item.content].filter(Boolean).join('\n\n'));
  };
  return <div className="space-y-5" data-matrix-content-records>
    <Alert><FileText className="h-4 w-4" /><AlertDescription>本地草稿可编辑、搜索和继续处理。素材上传及最终发表在内嵌官方页面完成；保存草稿不代表发布，草稿监控不读取平台云端草稿。</AlertDescription></Alert>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">{draftsOnly ? '本地草稿箱' : '发布中心'}</h1><p className="text-sm text-muted-foreground">共 {total} 条 · 每页 20 条</p></div><div className="flex flex-wrap gap-2"><OfficialActionButton intent="publish">官方页面发布</OfficialActionButton><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw size={15} />刷新</Button><Button asChild><Link to="/publish/create"><Plus size={15} />新建草稿</Link></Button></div></div>
    <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); setKeyword(query); setPage(1); }}><Input aria-label="搜索本地草稿" className="max-w-xs" placeholder="搜索标题或正文" value={query} onChange={e => setQuery(e.target.value)} /><Button variant="outline" type="submit">搜索</Button><select aria-label="内容平台筛选" className="rounded-md border bg-background p-2 text-sm" value={platform} onChange={e => { setPlatform(e.target.value); setPage(1); }}><option value="all">全部平台</option>{Object.entries(platformLabels).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select>{!draftsOnly && <select aria-label="内容状态筛选" className="rounded-md border bg-background p-2 text-sm" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="all">全部状态</option>{Object.entries(statusLabels).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select>}</form>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}{loading && <p role="status">加载中…</p>}
    {items.map(item => <Card key={item.id} data-post-id={item.id}><CardContent className="space-y-3 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{item.title || '未命名内容'}</strong><Badge variant={item.status === 'failed' ? 'destructive' : 'outline'}>{statusLabels[item.status] || item.status}</Badge></div><p className="text-xs text-muted-foreground">{platformLabels[item.platform]} · {item.accountNickname || '原账号已解绑'} · {item.mediaType === 'video' ? '视频' : item.mediaType === 'image' ? '图文' : '文本'} · {new Date(item.createdAt).toLocaleString('zh-CN')}</p><p className="max-h-28 overflow-auto whitespace-pre-wrap text-sm">{item.content || '未填写正文'}</p>{item.failReason && <p className="text-sm text-destructive">{item.failReason}</p>}<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void navigator.clipboard.writeText([item.title, item.content].filter(Boolean).join('\n\n')).then(() => toast.success('文案已复制')).catch(() => toast.error('复制失败，请手动选择文案'))}><Copy size={14} />复制文案</Button>{item.status === 'draft' && <><Button variant="outline" disabled={busy} onClick={() => edit(item)}>编辑草稿</Button><Button disabled={busy} onClick={() => void continueDraft(item)}>继续到账号页面</Button><Button variant="ghost" disabled={busy} onClick={() => void remove(item)}><Trash2 size={14} />删除本地草稿</Button></>}</div></CardContent></Card>)}
    {!loading && !error && !items.length && <Card><CardContent className="p-8 text-center text-muted-foreground">暂无符合条件的真实内容记录</CardContent></Card>}
    <div className="flex items-center justify-end gap-3 text-sm"><Button variant="outline" disabled={page === 1 || loading} onClick={() => setPage(p => p - 1)}>上一页</Button><span>第 {page} / {Math.max(1, Math.ceil(total / 20))} 页</span><Button variant="outline" disabled={page * 20 >= total || loading} onClick={() => setPage(p => p + 1)}>下一页</Button></div>
    <Dialog open={!!editing} onOpenChange={value => { if (!value && !busy) setEditing(null); }}><DialogContent><DialogHeader><DialogTitle>编辑本地草稿</DialogTitle></DialogHeader><label className="space-y-1 text-sm"><span>标题</span><Input id="content-record-title" maxLength={500} value={title} onChange={e => setTitle(e.target.value)} /></label><label className="space-y-1 text-sm"><span>正文</span><textarea id="content-record-body" className="min-h-40 w-full rounded-md border bg-background p-3" maxLength={20000} value={content} onChange={e => setContent(e.target.value)} /></label><Button disabled={busy} onClick={() => void save()}>{busy ? '保存中…' : '保存草稿修改'}</Button></DialogContent></Dialog>
  </div>;
}
