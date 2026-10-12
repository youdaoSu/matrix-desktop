import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, Trash2, Image, Video } from 'lucide-react';
import { toast } from 'sonner';
import type { ContentPost, PlatformAccount } from '@shared/api.interface';
import { axiosForBackend } from '@/api';
import { platformLabels, useOfficialWorkspace } from '@/components/workspace/OfficialWorkspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PublishAccountPanel } from '@/components/workspace/PublishAccountPanel';
import { loadPublishAccounts } from '@/components/workspace/publish-preferences';
import { validatePlatformConfig } from '@shared/publish-platform-fields';
import { usePublishQueue } from '@/components/workspace/PublishQueue';
import { parseTopics, validatePublishConfig, type PublishConfig } from '@shared/publish-config';

type Row = { id: string; title: string; content: string; topics?: string; comment?: string; saved: boolean; error?: string; media?: MatrixMediaSelection };
const newRow = (): Row => ({ id: crypto.randomUUID(), title: '', content: '', saved: false });
const message = (error: any) => error?.response?.data?.message || error?.message || '操作失败，请重试';

export default function BatchDraftPage() {
  const { pathname } = useLocation();
  const mediaType = pathname.endsWith('batch-image') ? 'image' : 'video';
  const workspace = useOfficialWorkspace();
  const { queue } = usePublishQueue(), navigate = useNavigate();
  const [preview, setPreview] = useState(false);
  const [batchField, setBatchField] = useState<'title' | 'content' | 'topics' | 'comment'>('title'), [batchText, setBatchText] = useState('');
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [configs, setConfigs] = useState<Record<string, PublishConfig>>({});
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
        loadPublishAccounts(),
        axiosForBackend.get('/api/content/posts', { params: { status: 'draft', page: 1, pageSize: 100 } }),
      ]);
      if (current === generation.current) { setAccounts(a); setDrafts(d.data.data.items); }
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
  const importFiles = async (files: File[], target?: Row) => {
    if (busy || !files.length || !window.matrixDesktop) return;
    if (files.length > (mediaType === 'video' ? 50 : 9)) return toast.error(mediaType === 'video' ? '一次最多 50 个视频' : '每篇图文最多 9 张图片，不会静默截断');
    setBusy(true);
    try {
      const groups = mediaType === 'video' ? files.map(file => [file]) : [files];
      if (!target && rows.filter(row => row.media || row.title || row.content).length + groups.length > 50) throw Error('作品总数不能超过 50 条，请先移除部分作品');
      const additions: Row[] = [];
      for (const group of groups) {
        const result = await window.matrixDesktop.importMedia(group, mediaType);
        if (result.error || !result.selection) throw Error(result.error || '素材未导入');
        additions.push({ ...newRow(), title: group[0].name.replace(/\.[^.]+$/, ''), media: result.selection });
      }
      if (target && additions.length === 1) change(target.id, { media: additions[0].media });
      else setRows(current => [...current.filter(row => row.media || row.title || row.content), ...additions]);
    } catch (error) { toast.error(message(error)); } finally { setBusy(false); }
  };
  const publishAll = () => {
    try {
      if (busy || queue.running) throw Error('已有任务正在处理，请查看任务记录');
      const targets = accounts.filter(account => selected.includes(account.id));
      if (!targets.length || !rows.length) throw Error('请先添加作品并选择账号');
      if (queue.jobs.some(job => ['unknown', 'interrupted'].includes(job.stage) && selected.includes(job.accountId)) && !window.confirm('所选账号有旧任务结果待核对。确定本次作品不是重复发布吗？')) return;
      const groups = rows.map(row => {
        if (!row.media) throw Error(`作品「${row.title || '未命名'}」未选择素材`);
        const config = { title: row.title, body: row.content, topics: parseTopics(row.topics || ''), comment: row.comment || '', options: {} };
        const error = validatePublishConfig(config); if (error) throw Error(error);
        return targets.map(account => {
          const accountConfig = { ...configs[account.id], ...config, options: configs[account.id]?.options || {} };
          const invalid = validatePublishConfig(accountConfig) || validatePlatformConfig(account.platform, accountConfig);
          if (invalid) throw Error(`${account.nickname}：${invalid}`);
          return { account, config: accountConfig, media: row.media! };
        });
      });
      queue.startMany(groups); workspace.hide(); navigate('/publish/tasks'); toast.success('全部作品已进入任务记录，将按作品顺序处理；每组最终提交时需确认');
    } catch (error) { toast.error(message(error)); }
  };
  return <div className="matrix-batch-editor">
    <div className="matrix-batch-columns">
      <section className="matrix-batch-common">
        <header><strong>批量{mediaType === 'image' ? '图文' : '视频'}通用配置</strong><span>{rows.length} 条内容</span></header>
        <div className="matrix-batch-toolbar"><strong>批量操作</strong><span className="text-primary">通用</span><span>分发设置：按顺序 · 多对多</span><select aria-label="批量设置字段" value={batchField} onChange={event => setBatchField(event.target.value as typeof batchField)}><option value="title">标题</option><option value="content">简介</option><option value="topics">话题</option><option value="comment">追评</option></select><Input aria-label="批量设置内容" value={batchText} onChange={event => setBatchText(event.target.value)} placeholder="填写后应用到全部作品" /><Button size="sm" variant="outline" disabled={busy} onClick={() => setRows(current => current.map(row => ({ ...row, [batchField]: batchText, saved: false })))}>应用到全部</Button></div>
        <p className="matrix-batch-notice">一键分发后可切换页面，在任务记录查看各账号进度。每组最终提交需确认；失败或结果不明时停止后续作品。草稿保存只保存文案，素材需重新选择。</p>
        {mediaType === 'video' && <div className="matrix-batch-drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void importFiles(Array.from(event.dataTransfer.files)); }}><label className="matrix-file-button">添加视频<input type="file" accept=".mp4,.mov,.webm,.mkv" multiple disabled={busy} onChange={event => { void importFiles(Array.from(event.target.files || [])); event.target.value = ''; }} /></label><p>拖入视频文件到这里识别</p><small>支持一次拖入多个视频文件，每个视频一条作品</small></div>}
        {loadError && <p role="alert" className="p-2 text-destructive">{loadError}</p>}
        <div className="matrix-batch-row-list">
          {rows.map((row, index) => <article className="matrix-batch-row" key={row.id}>
            <span className="matrix-batch-row-number">{index + 1}</span>
            <div className="matrix-batch-media" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void importFiles(Array.from(event.dataTransfer.files), row); }}>{mediaType === 'image' ? <Image size={32} /> : <Video size={26} />}<strong>{mediaType === 'image' ? '点击添加图片' : '视频素材'}</strong><small className="break-all">{row.media?.mediaType === mediaType ? row.media.files.map(file => file.name).join('、') : '本条素材供所选账号复用，可拖入素材'}</small><Button size="sm" variant="outline" disabled={busy} onClick={() => void choose(row)}>选择素材</Button><small>{mediaType === 'image' ? '每篇最多 9 张图片，不自动删减图片' : '素材选择不随文案草稿保存'}</small></div>
            <div className="matrix-batch-fields"><div className="flex items-center justify-between"><strong>内容 {index + 1}{row.saved ? ' · 已保存为草稿' : ''}</strong><Button aria-label={`移除内容${index + 1}`} variant="ghost" size="icon" disabled={busy || rows.length === 1} onClick={() => setRows(items => items.filter(item => item.id !== row.id))}><Trash2 size={16} /></Button></div>
              <Input aria-label={`内容${index + 1}标题`} maxLength={500} placeholder="作品标题" disabled={busy || row.saved} value={row.title} onChange={event => change(row.id, { title: event.target.value })} />
              <Textarea aria-label={`内容${index + 1}正文`} maxLength={20000} placeholder="正文、简介或话题" disabled={busy || row.saved} value={row.content} onChange={event => change(row.id, { content: event.target.value })} />
              <Input aria-label={`内容${index + 1}话题`} placeholder="标签 / 话题" value={row.topics || ''} disabled={busy} onChange={event => change(row.id, { topics: event.target.value })} /><Input aria-label={`内容${index + 1}追评`} placeholder="发布后追评（先生成待办，核对作品后发送）" value={row.comment || ''} disabled={busy} onChange={event => change(row.id, { comment: event.target.value })} />
              {row.error && <p role="alert" className="text-destructive">{row.error}</p>}
              <Button size="sm" variant="outline" disabled={busy || loading} onClick={() => void prepareRow(row)}>为所选账号准备本条</Button>
            </div>
          </article>)}
        </div>
        <div className="matrix-batch-add"><Button variant="outline" disabled={busy || rows.length >= 50} onClick={() => setRows(items => [...items, newRow()])}><Plus size={15} />新增内容</Button></div>
      </section>
      <section className="matrix-batch-accounts">
        <PublishAccountPanel accounts={accounts} selected={selected} configs={configs} onSelect={setSelected} onInit={(id, config) => setConfigs(current => ({ ...current, [id]: config }))} onChange={(id, patch) => setConfigs(current => ({ ...current, [id]: { title: '', body: '', topics: [], comment: '', options: {}, ...current[id], ...patch } }))} disabled={busy} loading={loading} mediaType={mediaType} batch />
        <details className="matrix-batch-saved"><summary>待发表草稿（最近 100 条）</summary>{drafts.filter(item => item.mediaType === mediaType).map(draft => <article key={draft.id}><div><strong>{draft.title || '未命名内容'}</strong><small>{platformLabels[draft.platform]} · {draft.accountNickname} · 本地草稿，未发布</small></div><Button variant="outline" size="sm" disabled={busy} onClick={() => void open(draft)}>准备该账号发表</Button></article>)}</details>
        <div className="matrix-distribution-preview"><button onClick={() => setPreview(value => !value)}>› 分发任务预览</button><span>作品：{rows.length}　账号：{selected.length}</span>{preview && <ol>{rows.flatMap((row, index) => accounts.filter(account => selected.includes(account.id)).map(account => <li key={row.id + account.id}>{index + 1}. {row.title || '未命名作品'} → {account.nickname} · {platformLabels[account.platform]}</li>))}</ol>}</div>
      </section>
    </div>
    <footer className="matrix-publish-footer"><Button variant="outline" disabled={busy || rows.length >= 50} onClick={() => setRows(items => [...items, newRow()])}>增加一篇作品</Button><Button variant="outline" disabled={busy} onClick={() => { if (window.confirm('清空未提交的作品列表？不会删除已保存草稿或平台作品。')) setRows([newRow()]); }}>清空作品列表（{rows.length}）</Button><Button variant="outline" disabled={busy} onClick={() => setSelected([])}>清空已选账号（{selected.length}）</Button><Button variant="outline" disabled={busy} onClick={() => setRows(current => { const next = [...current]; for (let i = next.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [next[i], next[j]] = [next[j], next[i]]; } return next; })}>打乱作品顺序</Button><Button variant="outline" disabled={busy} onClick={() => setPreview(value => !value)}>查看分发预览</Button><Button variant="outline" disabled={busy || loading} onClick={() => void save()}>{busy ? '保存中…' : '批量保存草稿'}</Button><Button disabled={busy || loading || queue.running} onClick={publishAll}>一键分发</Button></footer>
  </div>;
}
