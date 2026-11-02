import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, FileText, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
import { draftPreferences, localDraftStorageIssue, readLocalDrafts, removeLocalDraft, setDraftPreferences } from '@/components/workspace/local-publish-drafts';
import { uiOneOf, uiPage, uiText, useWorkspacePreference } from '@/components/workspace/WorkspaceUiState';

const statusLabels: Record<string, string> = { draft: '草稿', scheduled: '定时中', publishing: '发布中', published: '已发布', failed: '失败', reviewing: '审核中' };
function errorMessage(error: any) { return error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || '操作失败，请重试'; }
export default function ContentRecordsPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [localDrafts, setLocalDrafts] = useState(readLocalDrafts), [preferences, setPreferences] = useState(draftPreferences);
  const [storageIssue, setStorageIssue] = useState(localDraftStorageIssue);
  useEffect(() => { const update = () => { setLocalDrafts(readLocalDrafts()); setPreferences(draftPreferences()); setStorageIssue(localDraftStorageIssue()); }; window.addEventListener('matrix:local-drafts', update); return () => window.removeEventListener('matrix:local-drafts', update); }, []);
  const draftsOnly = pathname.endsWith('/drafts');
  const workspace = useOfficialWorkspace();
  const [items, setItems] = useState<ContentPost[]>([]);
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [total, setTotal] = useState(0);
  const uiScope = `records.${pathname}`;
  const [page, setPage] = useWorkspacePreference(`${uiScope}.page`, 1, uiPage);
  const [status, setStatus] = useWorkspacePreference(`${uiScope}.status`, 'all', uiOneOf(['all', ...Object.keys(statusLabels)]));
  const [platform, setPlatform] = useWorkspacePreference(`${uiScope}.platform`, 'all', uiOneOf(['all', ...Object.keys(platformLabels)]));
  const [query, setQuery] = useWorkspacePreference(`${uiScope}.query`, '', uiText);
  const [keyword, setKeyword] = useWorkspacePreference(`${uiScope}.keyword`, '', uiText);
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
    await workspace.openAccount(account, 'publish', false, [item.title, item.content].filter(Boolean).join('\n\n'), { title: item.title || '', body: item.content || '' });
  };
  return <div className="space-y-5" data-matrix-content-records>
    {draftsOnly && storageIssue && <Alert variant="destructive" role="alert"><AlertDescription>{storageIssue}</AlertDescription></Alert>}
    {draftsOnly && <div className="matrix-draft-preferences"><label><input type="checkbox" role="switch" checked={preferences.auto} onChange={event => setDraftPreferences({ auto: event.target.checked })} />自动保存{preferences.auto ? '已开启' : '已关闭'}</label><label><input type="checkbox" role="switch" checked={preferences.retain} onChange={event => setDraftPreferences({ retain: event.target.checked })} />发布后保留草稿</label><small>单条、批量视频、批量图文分别自动保存；在对应页面清空数据会同步删除该编辑草稿，不影响其他页面。重新打开磁盘草稿需重新选择素材 / 封面。</small><Button variant="outline" disabled={!localDrafts.length} onClick={() => { if (window.confirm(`清空 ${localDrafts.length} 条自动保存的本地编辑草稿？不删除平台作品，也不删除下方通过保存按钮创建的文案记录。`)) for (const draft of localDrafts) removeLocalDraft(draft.id); }}>清空自动保存草稿</Button></div>}
    <Alert><FileText className="h-4 w-4" /><AlertDescription>本地草稿可编辑、搜索和继续处理。素材上传及最终发表在内嵌官方页面完成；保存草稿不代表发布，草稿监控不读取平台云端草稿。</AlertDescription></Alert>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">{draftsOnly ? '本地草稿箱' : '发布中心'}</h1><p className="text-sm text-muted-foreground">{draftsOnly ? `自动保存 ${localDrafts.length} 条 · 手动保存 ${total} 条（每页 20 条）` : `共 ${total} 条 · 每页 20 条`}</p></div><div className="flex flex-wrap gap-2"><OfficialActionButton intent="publish">官方页面发布</OfficialActionButton><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw size={15} />刷新</Button><Button asChild><Link to="/publish/create"><Plus size={15} />新建草稿</Link></Button></div></div>
    <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); setKeyword(query); setPage(1); }}><Input aria-label="搜索本地草稿" className="max-w-xs" placeholder="搜索标题或正文" value={query} onChange={e => setQuery(e.target.value)} /><Button variant="outline" type="submit">搜索</Button><select aria-label="内容平台筛选" className="rounded-md border bg-background p-2 text-sm" value={platform} onChange={e => { setPlatform(e.target.value); setPage(1); }}><option value="all">全部平台</option>{Object.entries(platformLabels).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select>{!draftsOnly && <select aria-label="内容状态筛选" className="rounded-md border bg-background p-2 text-sm" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="all">全部状态</option>{Object.entries(statusLabels).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select>}</form>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}{loading && <p role="status">加载中…</p>}
    <div className="matrix-draft-table-wrap"><table className="matrix-draft-table"><thead><tr><th>标题</th><th>类型</th><th>保存时间</th><th>已选账号</th><th>内容</th><th>操作</th></tr></thead><tbody>{draftsOnly && localDrafts.filter(draft => (!keyword || [draft.title, draft.config.body, ...(draft.rows || []).map(row => row.title + row.content)].join(' ').includes(keyword)) && (platform === "all" || draft.accounts.some(account => account.platform === platform))).map(draft => <tr key={draft.id} data-local-draft-id={draft.id} data-draft-source={draft.source || 'single'}><td><strong>{draft.title}</strong><small>自动保存 / 本机编辑草稿{draft.rows ? ` · ${draft.rows.length} 条内容` : ''}</small></td><td>{draft.source === 'batch-video' ? '批量视频' : draft.source === 'batch-image' ? '批量图文' : draft.mediaType === "image" ? "图文" : draft.mediaType === "video" ? "单篇视频" : "文本"}</td><td>{new Date(draft.updatedAt).toLocaleString("zh-CN")}</td><td>{draft.accounts.map(account => <small key={account.id}>{account.nickname}</small>)}</td><td><p>{draft.config.body}</p><small>{draft.files.join("、")}</small><small>{draft.config.topics.map(topic => "#" + topic).join(" ")}</small></td><td><details><summary>☷ 操作</summary><div className="matrix-draft-actions"><Button size="sm" onClick={() => navigate(draft.source === 'batch-video' || draft.source === 'batch-image' ? `/publish/${draft.source}` : "/publish/create", { state: { localDraft: draft } })}>继续编辑</Button><Button size="sm" variant="ghost" onClick={() => { if (window.confirm("删除这条本地编辑草稿？不影响平台作品。")) removeLocalDraft(draft.id); }}>删除编辑草稿</Button></div></details></td></tr>)}{items.map(item => <tr key={item.id} data-post-id={item.id}><td><strong>{item.title || "未命名内容"}</strong><small>{statusLabels[item.status] || item.status}</small></td><td>{item.mediaType === "video" ? "单篇视频" : item.mediaType === "image" ? "图文" : "文本"}</td><td>{new Date(item.createdAt).toLocaleString("zh-CN")}</td><td><span className="matrix-draft-account-avatar">{(item.accountNickname || "?").slice(0, 1)}</span><small>{item.accountNickname || "原账号已解绑"} · {platformLabels[item.platform]}</small></td><td><div className="matrix-draft-content">{item.coverUrl && <img src={item.coverUrl} alt="内容封面" />}<p>{item.content || "未填写正文"}</p></div>{item.failReason && <small className="text-destructive">{item.failReason}</small>}</td><td><details><summary aria-label={`操作${item.title || "未命名草稿"}`}>☷ 操作</summary><div className="matrix-draft-actions"><Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText([item.title, item.content].filter(Boolean).join("\n\n")).then(() => toast.success("文案已复制")).catch(() => toast.error("复制失败"))}>复制文案</Button>{item.status === "draft" && <><Button size="sm" variant="outline" disabled={busy} onClick={() => edit(item)}>编辑草稿</Button><Button size="sm" disabled={busy} onClick={() => void continueDraft(item)}>继续到账号页面</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => void remove(item)}>删除本地草稿</Button></>}</div></details></td></tr>)}</tbody></table></div>
    {!loading && !error && !items.length && (!draftsOnly || !localDrafts.length) && <Card><CardContent className="p-8 text-center text-muted-foreground">暂无符合条件的真实内容记录</CardContent></Card>}
    <div className="flex items-center justify-end gap-3 text-sm"><Button variant="outline" disabled={page === 1 || loading} onClick={() => setPage(p => p - 1)}>上一页</Button><span>第 {page} / {Math.max(1, Math.ceil(total / 20))} 页</span><Button variant="outline" disabled={page * 20 >= total || loading} onClick={() => setPage(p => p + 1)}>下一页</Button></div>
    <Dialog open={!!editing} onOpenChange={value => { if (!value && !busy) setEditing(null); }}><DialogContent><DialogHeader><DialogTitle>编辑本地草稿</DialogTitle></DialogHeader><label className="space-y-1 text-sm"><span>标题</span><Input id="content-record-title" maxLength={500} value={title} onChange={e => setTitle(e.target.value)} /></label><label className="space-y-1 text-sm"><span>正文</span><textarea id="content-record-body" className="min-h-40 w-full rounded-md border bg-background p-3" maxLength={20000} value={content} onChange={e => setContent(e.target.value)} /></label><Button disabled={busy} onClick={() => void save()}>{busy ? '保存中…' : '保存草稿修改'}</Button></DialogContent></Dialog>
  </div>;
}
