import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, RefreshCw, Trash2, Image, Video } from 'lucide-react';
import { toast } from 'sonner';
import type { ContentPost, PlatformAccount } from '@shared/api.interface';
import { axiosForBackend } from '@/api';
import { platformLabels, useOfficialWorkspace } from '@/components/workspace/OfficialWorkspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

type Row = { id: string; title: string; content: string; saved: boolean; error?: string; media?: MatrixMediaSelection };
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
  const lock = useRef(false);
  const generation = useRef(0);
  const load = async () => {
    const current = ++generation.current;
    setLoading(true); setLoadError('');
    try {
      const [a, d] = await Promise.all([
        axiosForBackend.get('/api/platform/accounts', { params: { page: 1, pageSize: 100 } }),
        axiosForBackend.get('/api/content/posts', { params: { status: 'draft', page: 1, pageSize: 100 } }),
      ]);
      if (current === generation.current) { setAccounts(a.data.data.items); setDrafts(d.data.data.items); }
    } catch (error) { if (current === generation.current) setLoadError(message(error)); }
    finally { if (current === generation.current) setLoading(false); }
  };
  useEffect(() => { void load(); return () => { generation.current++; }; }, []);
  const change = (id: string, patch: Partial<Row>) => setRows(items => items.map(row => row.id === id ? { ...row, ...patch } : row));
  const choose = async (row: Row) => {
    if (lock.current) return;
    if (!window.matrixDesktop?.chooseMedia) return toast.info('请在最新版桌面端选择素材');
    lock.current = true; setBusy(true);
    try {
      const result = await window.matrixDesktop.chooseMedia(mediaType);
      if (result.error) throw new Error(result.error);
      if (result.selection) change(row.id, { media: result.selection });
    } catch (error) { toast.error(message(error)); }
    finally { lock.current = false; setBusy(false); }
  };
  const prepareRow = async (row: Row) => {
    if (lock.current) return;
    const targets = accounts.filter(account => selected.includes(account.id));
    if (!targets.length) return toast.error('请先选择账号');
    if (targets.some(account => !account.connectorSessionId)) return toast.error('请先通过本机官方登录绑定所选账号');
    if (!row.title.trim() && !row.content.trim()) return toast.error('请先填写本条内容的标题或正文');
    lock.current = true; setBusy(true);
    try {
      let opened = 0;
      for (const account of targets) if (await workspace.openAccount(account, 'publish', false, [row.title, row.content].filter(Boolean).join('\n\n'), { title: row.title, body: row.content, media: row.media?.mediaType === mediaType ? row.media : undefined })) opened++;
      toast.info(`已准备 ${opened}/${targets.length} 个账号的本条内容；尚未上传或发表`);
    } finally { lock.current = false; setBusy(false); }
  };
  const save = async () => {
    if (lock.current) return;
    if (!selected.length) return toast.error('请先选择账号');
    const pending = rows.filter(row => !row.saved);
    if (!pending.length) return toast.info('当前所有内容已保存，请新增内容');
    if (pending.some(row => !row.title.trim() && !row.content.trim())) return toast.error('每条内容请至少填写标题或正文');
    lock.current = true; setBusy(true);
    let saved = 0;
    for (const row of pending) {
      try {
        await axiosForBackend.post('/api/content/posts', { title: row.title.trim(), content: row.content.trim(), mediaType, accountIds: selected, status: 'draft' });
        change(row.id, { saved: true, error: undefined }); saved++;
      } catch (error) { change(row.id, { error: message(error) }); }
    }
    lock.current = false; setBusy(false); await load();
    if (saved) toast.success(`已保存 ${saved} 条内容的账号草稿；尚未发布`);
    if (saved !== pending.length) toast.error('部分内容保存失败，可单独重试；已保存的内容不会重复提交');
  };
  const open = async (draft: ContentPost) => {
    const account = accounts.find(item => item.id === draft.accountId);
    if (!account?.connectorSessionId) return toast.error('请先通过本机官方登录绑定该账号');
    await workspace.openAccount(account, 'publish', false, [draft.title, draft.content].filter(Boolean).join('\n\n'), { title: draft.title || '', body: draft.content || '' });
  };
  return <div className="matrix-batch-editor">
    <div className="matrix-batch-columns">
      <section className="matrix-batch-common">
        <header><strong>批量{mediaType === 'image' ? '图文' : '视频'}通用配置</strong><span>{rows.length} 条内容</span></header>
        <p className="matrix-batch-notice">为所选账号保存本地草稿，不会自动发表。离开页面会丢失尚未保存的编辑。上传素材、核对文案和正式发表仍需在内嵌账号页面完成。</p>
        {loadError && <p role="alert" className="p-2 text-destructive">{loadError}</p>}
        <div className="matrix-batch-row-list">
          {rows.map((row, index) => <article className="matrix-batch-row" key={row.id}>
            <span className="matrix-batch-row-number">{index + 1}</span>
            <div className="matrix-batch-media">{mediaType === 'image' ? <Image size={26} /> : <Video size={26} />}<strong>{mediaType === 'image' ? '图文素材' : '视频素材'}</strong><small className="break-all">{row.media?.mediaType === mediaType ? row.media.files.map(file => file.name).join('、') : '本条素材供所选账号复用'}</small><Button size="sm" variant="outline" disabled={busy} onClick={() => void choose(row)}>选择素材</Button><small>素材选择不随文案草稿保存</small></div>
            <div className="matrix-batch-fields"><div className="flex items-center justify-between"><strong>内容 {index + 1}{row.saved ? ' · 已保存为草稿' : ''}</strong><Button aria-label={`移除内容${index + 1}`} variant="ghost" size="icon" disabled={busy || rows.length === 1} onClick={() => setRows(items => items.filter(item => item.id !== row.id))}><Trash2 size={16} /></Button></div>
              <Input aria-label={`内容${index + 1}标题`} maxLength={500} placeholder="作品标题" disabled={busy || row.saved} value={row.title} onChange={event => change(row.id, { title: event.target.value })} />
              <Textarea aria-label={`内容${index + 1}正文`} maxLength={20000} placeholder="正文、简介或话题" disabled={busy || row.saved} value={row.content} onChange={event => change(row.id, { content: event.target.value })} />
              {row.error && <p role="alert" className="text-destructive">{row.error}</p>}
              <Button size="sm" variant="outline" disabled={busy || loading} onClick={() => void prepareRow(row)}>为所选账号准备本条</Button>
            </div>
          </article>)}
        </div>
        <div className="matrix-batch-add"><Button variant="outline" disabled={busy || rows.length >= 50} onClick={() => setRows(items => [...items, newRow()])}><Plus size={15} />新增内容</Button></div>
      </section>
      <section className="matrix-batch-accounts">
        <header><strong>平台和账号配置</strong><span>已选 {selected.length} 个账号</span></header>
        <div className="matrix-publish-account-list">{accounts.map(account => <label key={account.id} className="matrix-publish-account"><Checkbox disabled={busy} checked={selected.includes(account.id)} onCheckedChange={checked => setSelected(ids => checked ? [...new Set([...ids, account.id])] : ids.filter(id => id !== account.id))} /><div><strong>{account.nickname || '未命名账号'}</strong><small>{platformLabels[account.platform]}</small></div><span>未发布</span></label>)}{loading && <p role="status">加载账号及草稿…</p>}{!loading && !accounts.length && <div className="matrix-publish-no-account"><Plus size={32} /><p>请先绑定自己的账号</p><Button variant="outline" onClick={() => workspace.show('manage')}>添加账号</Button></div>}</div>
        <div className="matrix-batch-saved"><h2>待发表草稿</h2><p>最近 100 条本地草稿中的{mediaType === 'image' ? '图文' : '视频'}；不是平台发布记录。</p>{drafts.filter(item => item.mediaType === mediaType).map(draft => <article key={draft.id}><div><strong>{draft.title || '未命名内容'}</strong><small>{platformLabels[draft.platform]} · {draft.accountNickname} · 本地草稿，未发布</small></div><Button variant="outline" size="sm" disabled={busy} onClick={() => void open(draft)}>准备该账号发表</Button></article>)}{!loading && !drafts.some(item => item.mediaType === mediaType) && <p>暂无已保存草稿</p>}</div>
      </section>
    </div>
    <footer className="matrix-publish-footer"><Button variant="outline" disabled={loading || busy} onClick={() => void load()}><RefreshCw size={15} />刷新草稿</Button><span>草稿保存、素材上传 ≠ 作品已发表</span><Button disabled={busy || loading} onClick={() => void save()}>{busy ? '保存中…' : '批量保存草稿'}</Button></footer>
  </div>;
}
