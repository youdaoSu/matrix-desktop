import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ClipboardList, Copy, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { axiosForBackend } from '@/api';
import { platformLabels, useOfficialWorkspace } from '@/components/workspace/OfficialWorkspace';
import { PageActionHistory } from '@/components/workspace/PageActionPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { PersonalTask, PersonalTaskKind, PersonalTaskStatus } from '@shared/personal-tasks';
import { taskKindLabels, taskStatusLabels } from '@shared/personal-tasks';
import type { PlatformAccount } from '@shared/api.interface';

function errorText(error: any) { return error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || '操作失败，请重试'; }
function initialKind(path: string): PersonalTaskKind {
  return path.includes('comment') ? 'comment' : path.includes('message') ? 'message' : path.includes('publish') ? 'publish' : 'review';
}
function localDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value); date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}
export default function PersonalTasksPage() {
  const { pathname } = useLocation();
  const workspace = useOfficialWorkspace();
  const [items, setItems] = useState<PersonalTask[]>([]);
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(pathname.endsWith('/logs') ? 'all' : 'pending');
  const [filterKind, setFilterKind] = useState('all');
  const [dueOnly, setDueOnly] = useState(pathname.includes('notify'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<PersonalTask | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<PersonalTaskKind>('review');
  const [dueAt, setDueAt] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const request = useRef<{ key: string; fingerprint: string } | null>(null);
  const generation = useRef(0);
  const lock = useRef(false);
  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setError('');
    try {
      const response = await axiosForBackend.get('/api/personal/tasks', { params: { page, pageSize: 20,
        ...(status !== 'all' ? { status } : {}), ...(filterKind !== 'all' ? { kind: filterKind } : {}), ...(dueOnly ? { dueOnly: true } : {}) } });
      if (current === generation.current) { setItems(response.data.data.items); setTotal(response.data.data.total); }
    } catch (e) { if (current === generation.current) { setError(errorText(e)); setItems([]); } }
    finally { if (current === generation.current) setLoading(false); }
  }, [page, status, filterKind, dueOnly]);
  useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);
  useEffect(() => {
    let active = true;
    axiosForBackend.get('/api/platform/accounts', { params: { page: 1, pageSize: 100 } }).then(r => { if (active) setAccounts(r.data.data.items); }).catch(e => { if (active) toast.error(errorText(e)); });
    return () => { active = false; };
  }, []);
  const open = (task: PersonalTask | 'new') => {
    setEditing(task); request.current = null;
    setTitle(task === 'new' ? '' : task.title); setContent(task === 'new' ? '' : task.content);
    setNote(task === 'new' ? '' : task.note); setKind(task === 'new' ? initialKind(pathname) : task.kind);
    setChosen(task === 'new' ? [] : task.accountId ? [task.accountId] : []);
    setDueAt(task === 'new' ? '' : localDate(task.dueAt));
  };
  const changed = () => window.dispatchEvent(new Event('matrix:personal-tasks-updated'));
  const save = async () => {
    if (lock.current || !editing) return;
    if (!title.trim() || (editing === 'new' && !chosen.length)) { toast.error('请输入标题并选择账号'); return; }
    lock.current = true; setSaving(true);
    try {
      const date = dueAt ? new Date(dueAt).toISOString() : null;
      if (editing === 'new') {
        const input = { accountIds: [...chosen].sort(), title: title.trim(), content, kind, dueAt: date };
        const fingerprint = JSON.stringify(input);
        if (request.current?.fingerprint !== fingerprint) request.current = { key: crypto.randomUUID(), fingerprint };
        await axiosForBackend.post('/api/personal/tasks', { ...input, requestId: request.current.key });
      } else await axiosForBackend.patch(`/api/personal/tasks/${editing.id}`, { title, content, dueAt: date, note });
      setEditing(null); changed(); await load(); toast.success('待办已保存；未执行平台操作');
    } catch (e) { toast.error(errorText(e)); }
    finally { lock.current = false; setSaving(false); }
  };
  const updateStatus = async (task: PersonalTask, next: PersonalTaskStatus) => {
    if (lock.current) return;
    if (next === 'done' && !window.confirm('你已亲自在官方页面完成操作了吗？此处仅记录你的确认，不代表矩效核验了平台发布或发送结果。')) return;
    if (next === 'cancelled' && !window.confirm('取消这条待办？不会删除官方内容或撤回消息。')) return;
    lock.current = true; setSaving(true);
    try { await axiosForBackend.patch(`/api/personal/tasks/${task.id}`, { status: next }); changed(); await load(); }
    catch (e) { toast.error(errorText(e)); }
    finally { lock.current = false; setSaving(false); }
  };
  const handle = async (task: PersonalTask) => {
    const account = accounts.find(a => a.id === task.accountId);
    if (!account) { toast.error('原账号已解绑或不在当前账号列表中，请重新选择账号'); return; }
    await workspace.openAccount(account, task.kind === 'comment' ? 'comments' : task.kind === 'message' ? 'messages' : task.kind === 'publish' ? 'publish' : 'manage', false, task.content);
  };
  return <div className="space-y-5" data-matrix-personal-tasks>
    <PageActionHistory />
    <Alert><ClipboardList className="h-4 w-4" /><AlertDescription>个人账号人工待办：批量整理文案、设置提醒、打开内嵌账号页面处理。不会后台自动发布、群发或自动评论。完成状态来自你的确认，不是平台回执；提醒仅在矩效运行且已登录时显示。</AlertDescription></Alert>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">个人操作待办</h1><p className="text-sm text-muted-foreground">共 {total} 条 · 每页 20 条</p></div><div className="flex gap-2"><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw size={15} />刷新</Button><Button onClick={() => open('new')}><Plus size={15} />新建待办</Button></div></div>
    <div className="flex flex-wrap gap-3 text-sm"><select aria-label="待办状态筛选" className="rounded-md border bg-background p-2" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="all">全部状态</option>{Object.entries(taskStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select aria-label="待办类型筛选" className="rounded-md border bg-background p-2" value={filterKind} onChange={e => { setFilterKind(e.target.value); setPage(1); }}><option value="all">全部类型</option>{Object.entries(taskKindLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><label className="flex items-center gap-2"><input type="checkbox" checked={dueOnly} onChange={e => { setDueOnly(e.target.checked); setPage(1); }} />只看已到提醒时间的待办</label></div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {loading && <p role="status">加载中…</p>}
    {!loading && !error && !items.length && <Card><CardContent className="p-8 text-center text-muted-foreground">暂无符合条件的待办</CardContent></Card>}
    {items.map(task => <Card key={task.id} data-task-id={task.id}><CardContent className="matrix-record-row"><div className="matrix-record-preview"><ClipboardList size={26} /><small>人工待办 · 无素材预览</small></div><div className="matrix-record-title"><strong>{task.title}</strong><Badge variant="outline">{taskStatusLabels[task.status]}</Badge></div><div className="matrix-record-meta">{platformLabels[task.platform]} · {task.accountNickname || (task.accountId ? '已绑定账号' : '原账号已解绑')} · {taskKindLabels[task.kind]}{task.dueAt && ` · 提醒 ${new Date(task.dueAt).toLocaleString('zh-CN')}`}</div><p className="matrix-record-body">{task.content || '未填写文案'}</p>{task.note && <p className="matrix-record-note">处理备注：{task.note}</p>}<div className="matrix-record-actions"><Button variant="outline" disabled={saving || !task.accountId} onClick={() => void handle(task)}>打开账号处理</Button><Button variant="outline" onClick={() => void navigator.clipboard.writeText(task.content).then(() => toast.success('文案已复制')).catch(() => toast.error('复制失败，请手动选择文案'))}><Copy size={14} />复制文案</Button><Button variant="outline" disabled={saving} onClick={() => open(task)}>编辑待办</Button>{task.status === 'pending' ? <><Button disabled={saving} onClick={() => void updateStatus(task, 'done')}>本人确认已处理</Button><Button variant="ghost" disabled={saving} onClick={() => void updateStatus(task, 'cancelled')}>取消待办</Button></> : <Button variant="ghost" disabled={saving} onClick={() => void updateStatus(task, 'pending')}>重新待办</Button>}</div>{task.completedAt && <p className="matrix-record-receipt">本人确认时间：{new Date(task.completedAt).toLocaleString('zh-CN')}（非平台回执）</p>}</CardContent></Card>)}
    <div className="flex items-center justify-end gap-3 text-sm"><Button variant="outline" disabled={page === 1 || loading} onClick={() => setPage(p => p - 1)}>上一页</Button><span>第 {page} / {Math.max(1, Math.ceil(total / 20))} 页</span><Button variant="outline" disabled={page * 20 >= total || loading} onClick={() => setPage(p => p + 1)}>下一页</Button></div>
    <Dialog open={!!editing} onOpenChange={value => { if (!value && !saving) setEditing(null); }}><DialogContent className="max-h-[85vh] overflow-auto"><DialogHeader><DialogTitle>{editing === 'new' ? '新建个人待办' : '编辑个人待办'}</DialogTitle></DialogHeader><div className="space-y-4">
      {editing === 'new' && <><label className="block space-y-1 text-sm"><span>操作类型</span><select id="personal-task-kind" className="w-full rounded-md border bg-background p-2" value={kind} onChange={e => setKind(e.target.value as PersonalTaskKind)}>{Object.entries(taskKindLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><fieldset className="space-y-2 text-sm"><legend>选择本人的账号（每个账号一条待办，最多 20 个）</legend>{accounts.map(a => <label key={a.id} className="flex items-center gap-2"><input type="checkbox" checked={chosen.includes(a.id)} onChange={e => setChosen(ids => e.target.checked ? [...ids, a.id] : ids.filter(id => id !== a.id))} />{platformLabels[a.platform]} · {a.nickname || '未命名账号'}</label>)}{!accounts.length && <p>请先绑定账号。</p>}</fieldset></>}
      <label className="block space-y-1 text-sm"><span>标题</span><Input id="personal-task-title" maxLength={140} value={title} onChange={e => setTitle(e.target.value)} /></label><label className="block space-y-1 text-sm"><span>文案 / 操作说明</span><textarea id="personal-task-content" className="min-h-28 w-full rounded-md border bg-background p-3" maxLength={20000} value={content} onChange={e => setContent(e.target.value)} /></label><label className="block space-y-1 text-sm"><span>提醒时间（可选；不是定时发布）</span><Input id="personal-task-due" type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} /></label>{editing !== 'new' && <label className="block space-y-1 text-sm"><span>本人处理备注</span><textarea id="personal-task-note" className="w-full rounded-md border bg-background p-2" maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label>}<Button disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存个人待办'}</Button>
    </div></DialogContent></Dialog>
  </div>;
}
