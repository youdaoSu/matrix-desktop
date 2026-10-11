import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ContentPost, PlatformAccount } from '@shared/api.interface';
import { axiosForBackend } from '@/api';
import { platformLabels, useOfficialWorkspace } from '@/components/workspace/OfficialWorkspace';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';

type Row = { id: string; title: string; content: string; saved: boolean; error?: string };
const newRow = (): Row => ({ id: crypto.randomUUID(), title: '', content: '', saved: false });
const message = (error: any) => error?.response?.data?.message || error?.message || '操作失败，请重试';

export default function BatchDraftPage() {
  const { pathname } = useLocation();
  const mediaType = pathname.endsWith('batch-image') ? 'image' : 'video';
  const workspace = useOfficialWorkspace();
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const [drafts, setDrafts] = useState<ContentPost[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true); setLoadError('');
    try {
      const [a, d] = await Promise.all([
        axiosForBackend.get('/api/platform/accounts', { params: { page: 1, pageSize: 100 } }),
        axiosForBackend.get('/api/content/posts', { params: { status: 'draft', page: 1, pageSize: 100 } }),
      ]);
      setAccounts(a.data.data.items); setDrafts(d.data.data.items);
    } catch (error) { setLoadError(message(error)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const change = (id: string, patch: Partial<Row>) => setRows(items => items.map(row => row.id === id ? { ...row, ...patch } : row));
  const save = async () => {
    if (busy) return;
    if (!selected.length) return toast.error('请先选择账号');
    const pending = rows.filter(row => !row.saved);
    if (!pending.length) return toast.info('当前所有内容已保存，请新增内容');
    if (pending.some(row => !row.title.trim() && !row.content.trim())) return toast.error('每条内容请至少填写标题或正文');
    setBusy(true);
    let saved = 0;
    for (const row of pending) {
      try {
        await axiosForBackend.post('/api/content/posts', { title: row.title.trim(), content: row.content.trim(), mediaType, accountIds: selected, status: 'draft' });
        change(row.id, { saved: true, error: undefined }); saved++;
      } catch (error) { change(row.id, { error: message(error) }); }
    }
    setBusy(false); await load();
    if (saved) toast.success(`已保存 ${saved} 条内容的账号草稿；尚未发布`);
    if (saved !== pending.length) toast.error('部分内容保存失败，可单独重试；已保存的内容不会重复提交');
  };
  const open = async (draft: ContentPost) => {
    const account = accounts.find(item => item.id === draft.accountId);
    if (!account?.connectorSessionId) return toast.error('请先通过本机官方登录绑定该账号');
    await workspace.openAccount(account, 'publish', false, [draft.title, draft.content].filter(Boolean).join('\n\n'));
  };
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-semibold">批量{mediaType === 'image' ? '图文' : '视频'}准备</h1><Button variant="outline" disabled={loading || busy} onClick={() => void load()}><RefreshCw size={15} />刷新草稿</Button></div>
    <Alert><AlertDescription>一次整理多条内容，为所选账号分别保存真实草稿，再逐账号上传素材、核对并发表。这里不会自动发布或把草稿标记成发布成功。未保存的编辑内容离开页面后会丢失。</AlertDescription></Alert>
    {loadError && <div role="alert" className="text-destructive">{loadError}</div>}
    <Card><CardHeader><CardTitle className="text-base">目标账号</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-3">{accounts.map(account => <label key={account.id} className="flex items-center gap-2 rounded-lg border p-3"><Checkbox disabled={busy} checked={selected.includes(account.id)} onCheckedChange={checked => setSelected(ids => checked ? [...ids, account.id] : ids.filter(id => id !== account.id))} />{platformLabels[account.platform]} · {account.nickname}</label>)}{!loading && !accounts.length && <p className="text-muted-foreground">请先绑定自己的账号</p>}</CardContent></Card>
    {rows.map((row, index) => <Card key={row.id}><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">内容 {index + 1}{row.saved ? ' · 已保存为草稿' : ''}</CardTitle><Button aria-label={`移除内容${index + 1}`} variant="ghost" size="icon" disabled={busy || rows.length === 1} onClick={() => setRows(items => items.filter(item => item.id !== row.id))}><Trash2 size={16} /></Button></CardHeader><CardContent className="space-y-3"><Input aria-label={`内容${index + 1}标题`} maxLength={500} placeholder="标题" disabled={busy || row.saved} value={row.title} onChange={event => change(row.id, { title: event.target.value })} /><Textarea aria-label={`内容${index + 1}正文`} maxLength={20000} placeholder="正文" disabled={busy || row.saved} value={row.content} onChange={event => change(row.id, { content: event.target.value })} />{row.error && <p role="alert" className="text-destructive">{row.error}</p>}</CardContent></Card>)}
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || rows.length >= 50} onClick={() => setRows(items => [...items, newRow()])}><Plus size={15} />新增内容</Button><Button disabled={busy || loading} onClick={() => void save()}>{busy ? '保存中…' : '批量保存草稿'}</Button></div>
    <Card><CardHeader><CardTitle className="text-base">待发表草稿（最近 100 条本地草稿中的{mediaType === 'image' ? '图文' : '视频'}）</CardTitle></CardHeader><CardContent className="space-y-2">{drafts.filter(item => item.mediaType === mediaType).map(draft => <div key={draft.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div><strong>{draft.title || '未命名内容'}</strong><p className="text-sm text-muted-foreground">{platformLabels[draft.platform]} · {draft.accountNickname} · 本地草稿，未发布</p></div><Button variant="outline" onClick={() => void open(draft)}>准备该账号发表</Button></div>)}{!loading && !drafts.some(item => item.mediaType === mediaType) && <p className="text-muted-foreground">暂无已保存草稿</p>}</CardContent></Card>
  </div>;
}
