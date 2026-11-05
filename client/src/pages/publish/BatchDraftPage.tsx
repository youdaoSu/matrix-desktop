import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, Trash2, Image, Video } from 'lucide-react';
import { toast } from 'sonner';
import type { ContentPost, PlatformAccount } from '@shared/api.interface';
import { axiosForBackend, getAuthToken } from '@/api';
import { platformLabels, useOfficialWorkspace } from '@/components/workspace/OfficialWorkspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PublishAccountPanel } from '@/components/workspace/PublishAccountPanel';
import { loadPublishAccounts } from '@/components/workspace/publish-preferences';
import { collectPublishPreflight, type PublishPreflightIssue } from '@shared/publish-preflight';
import { withPublishPlatformDefaults } from '@shared/publish-platform-fields';
import { PublishValidationErrors } from '@/components/workspace/PublishValidationErrors';
import { PublishPreflightStatus, usePublishMediaCheck } from '@/components/workspace/PublishPreflightStatus';
import { usePublishQueue } from '@/components/workspace/PublishQueue';
import { parseTopics, validatePublishConfig, type PublishConfig } from '@shared/publish-config';
import { PublishTopicInput } from '@/components/workspace/PublishTopicInput';
import { usePublishEditorState, usePublishEditorValue } from '@/components/workspace/PublishEditorState';
import { commitLocalDraftRevision, createLocalDraftRevision, draftPreferences, hasDraftContent, matchingLocalDraftRevision, normalizeLocalDraft, removeLocalDraft, type LocalPublishDraft } from '@/components/workspace/local-publish-drafts';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { defaultPublishTaskControls, publishTaskControlsError } from '@shared/publish-task-controls';
import { PublishTaskControls } from '@/components/workspace/PublishTaskControls';
import { PublishMediaPreview } from '@/components/workspace/PublishMediaPreview';

type Row = { id: string; title: string; content: string; topics?: string; comment?: string; files?: string[]; saved: boolean; error?: string; media?: MatrixMediaSelection };
const newRow = (): Row => ({ id: crypto.randomUUID(), title: '', content: '', saved: false });
const message = (error: any) => error?.response?.data?.message || error?.message || '操作失败，请重试';

export default function BatchDraftPage() {
  const { pathname, state } = useLocation();
  const mediaType: 'image' | 'video' = pathname.endsWith('batch-image') ? 'image' : 'video';
  const source = `batch-${mediaType}` as 'batch-video' | 'batch-image';
  const candidate = state?.localDraft;
  const restored = useMemo(() => { const draft = normalizeLocalDraft(candidate, true); return draft?.source === source ? draft : undefined; }, [candidate, source, getAuthToken()]);
  const restoredVersion = restored ? JSON.stringify([restored.id, restored.updatedAt, restored.revisionId || 'legacy']) : '';
  const currentSource = useRef(source); currentSource.current = source;
  const draftId = usePublishEditorValue(`${source}:draft-id`, () => ({ current: restored?.id || crypto.randomUUID() }));
  const draftRevision = usePublishEditorValue(`${source}:draft-revision`, () => createLocalDraftRevision(restored));
  const restoredStamp = usePublishEditorValue(`${source}:restored-stamp`, () => ({ current: restoredVersion }));
  const restoring = Boolean(restored && (draftId.current !== restored.id || restoredStamp.current !== restoredVersion));
  const workspace = useOfficialWorkspace();
  const { queue } = usePublishQueue(), navigate = useNavigate();
  const [preview, setPreview] = usePublishEditorState(`batch-${mediaType}:preview`, false);
  const [mediaPreviewRow, setMediaPreviewRow] = usePublishEditorState(`${source}:media-preview-row`, '');
  const [taskControls, setTaskControls] = usePublishEditorState(`${source}:task-controls`, restored?.batchSettings?.taskControls || defaultPublishTaskControls('批量分发'));
  const [batchField, setBatchField] = usePublishEditorState<'title' | 'content' | 'topics' | 'comment'>(`batch-${mediaType}:field`, restored?.batchSettings?.field || 'title'), [batchText, setBatchText] = usePublishEditorState(`batch-${mediaType}:text`, restored?.batchSettings?.text || '');
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [selected, setSelected] = usePublishEditorState<string[]>(`batch-${mediaType}:selected`, restored?.accounts.map(a => a.id) || []);
  const [configs, setConfigs] = usePublishEditorState<Record<string, PublishConfig>>(`batch-${mediaType}:configs`, restored?.configs || {});
  const [rows, setRows] = usePublishEditorState<Row[]>(`batch-${mediaType}:rows`, () => restored?.rows?.map(row => ({ ...row, saved: false })) || [newRow()]);
  const [drafts, setDrafts] = useState<ContentPost[]>([]);
  const [busy, setBusy] = useState(false);
  const [validationIssues, setValidationIssues] = useState<PublishPreflightIssue[]>([]);
  const mediaCheck = usePublishMediaCheck(source);
  useEffect(() => { setValidationIssues([]); }, [rows, selected, configs]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirmation, setConfirmation] = useState<'clear' | 'publish-uncertain'>();
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
  useEffect(() => {
    if (!restored || !restoring) return;
    draftId.current = restored.id; restoredStamp.current = restoredVersion;
    draftRevision.current = createLocalDraftRevision(restored).current;
    // Restored filenames/row IDs are display data, not proof that another
    // draft's live file selection is the same material. Route-only returns
    // keep session state; explicit restoration of another revision does not.
    setRows(restored.rows?.map(row => ({ ...row, saved: false })) || [newRow()]);
    setSelected(restored.accounts.map(account => account.id)); setConfigs(restored.configs); setBatchField(restored.batchSettings?.field || 'title'); setBatchText(restored.batchSettings?.text || '');
    setTaskControls(restored.batchSettings?.taskControls || defaultPublishTaskControls('批量分发')); setMediaPreviewRow('');
  }, [restored?.id, restored?.updatedAt, restored?.revisionId, source]);
  const snapshot = (): LocalPublishDraft => {
    const config = { title: rows[0]?.title || '', body: rows[0]?.content || '', topics: parseTopics(rows[0]?.topics || ''), comment: rows[0]?.comment || '', options: {} };
    return { id: draftId.current, source, updatedAt: new Date().toISOString(), title: rows.find(row => row.title.trim())?.title || `批量${mediaType === 'image' ? '图文' : '视频'}编辑草稿`, mediaType, config, configs, batchSettings: { field: batchField, text: batchText, taskControls }, files: rows.flatMap(row => row.media?.files.map(file => file.name) || row.files || []), accounts: accounts.filter(account => selected.includes(account.id)).map(account => ({ id: account.id, nickname: account.nickname || '未命名账号', platform: account.platform })), rows: rows.map(row => ({ id: row.id, title: row.title, content: row.content, topics: row.topics, comment: row.comment, files: row.media?.files.map(file => file.name) || row.files || [] })) };
  };
  const meaningful = () => batchText.trim() || rows.some(row => row.title.trim() || row.content.trim() || row.topics?.trim() || row.comment?.trim() || row.media || row.files?.length) || selected.length > 0 || Object.values(configs).some(config => hasDraftContent(config)) || taskControls.initialState !== 'execute' || taskControls.batchName !== '批量分发';
  const transientIdentity = () => rows.some(row => row.media) ? rows.map(row => row.media?.id || null) : undefined;
  useEffect(() => {
    if (loading || restoring || !draftPreferences().auto) return;
    try { if (meaningful()) commitLocalDraftRevision(snapshot(), draftRevision, transientIdentity()); else { removeLocalDraft(draftId.current); draftRevision.current = undefined; } }
    catch (error) { toast.error(message(error)); }
  }, [rows, selected, configs, accounts, batchText, batchField, loading, source, restoring, taskControls]);
  const change = (id: string, patch: Partial<Row>) => setRows(items => items.map(row => row.id === id ? { ...row, saved: false, ...patch } : row));
  const clearPage = () => {
    removeLocalDraft(draftId.current); draftId.current = crypto.randomUUID(); restoredStamp.current = '';
    draftRevision.current = undefined;
    setRows([newRow()]); setConfigs({}); setSelected([]); setBatchText(''); setPreview(false); setMediaPreviewRow(''); setTaskControls(defaultPublishTaskControls('批量分发'));
    navigate(`/publish/${source}`, { replace: true, state: null });
    toast.success('本页编辑数据与对应本地草稿已清空；其他页面、任务记录未改动');
  };
  const choose = async (row: Row) => {
    if (lock.current) return;
    if (!window.matrixDesktop?.chooseMedia) return toast.info('请在最新版桌面端选择素材');
    lock.current = true; setBusy(true);
    try {
      const result = await window.matrixDesktop.chooseMedia(mediaType);
      if (result.error) throw new Error(result.error);
      if (result.selection) { change(row.id, { media: result.selection }); setMediaPreviewRow(row.id); }
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
    if (!meaningful()) return toast.info('本页暂无编辑内容');
    try { commitLocalDraftRevision(snapshot(), draftRevision, transientIdentity(), true); setRows(current => current.map(row => ({ ...row, saved: true }))); toast.success('本页全部内容已保存到同一条本地草稿；尚未发布'); }
    catch (error) { toast.error(message(error)); }
  };
  const open = async (draft: ContentPost) => {
    const account = accounts.find(item => item.id === draft.accountId);
    if (!account?.connectorSessionId) return toast.error('请先通过本机官方登录绑定该账号');
    await workspace.openAccount(account, 'publish', false, [draft.title, draft.content].filter(Boolean).join('\n\n'), { title: draft.title || '', body: draft.content || '' });
  };
  const importFiles = async (files: File[], target?: Row) => {
    if (lock.current || busy || !files.length || !window.matrixDesktop) return;
    const limit = mediaType === 'image' ? 9 : target ? 1 : 50;
    if (files.length > limit) return toast.error(mediaType === 'image' ? '每篇图文最多 9 张图片，不会静默截断' : target ? '替换本条作品时只可拖入一个视频；批量添加请拖到页面顶部' : '一次最多 50 个视频');
    const current = generation.current, token = getAuthToken();
    const stillCurrent = () => generation.current === current && currentSource.current === source && getAuthToken() === token;
    lock.current = true; setBusy(true);
    try {
      const groups = mediaType === 'video' ? files.map(file => [file]) : [files];
      if (!target && rows.filter(row => row.media || row.title || row.content).length + groups.length > 50) throw Error('作品总数不能超过 50 条，请先移除部分作品');
      const additions: Row[] = [];
      for (const group of groups) {
        const result = await window.matrixDesktop.importMedia(group, mediaType);
        if (!stillCurrent()) return;
        if (result.error || !result.selection) throw Error(result.error || '素材未导入');
        if (result.selection.mediaType !== mediaType) throw Error('返回的素材类型与当前发布页面不符，请重新选择');
        additions.push({ ...newRow(), title: group[0].name.replace(/\.[^.]+$/, ''), media: result.selection });
      }
      if (target) { change(target.id, { media: additions[0].media }); setMediaPreviewRow(target.id); }
      else setRows(current => [...current.filter(row => row.media || row.title || row.content), ...additions]);
    } catch (error) { if (stillCurrent()) toast.error(message(error)); }
    finally { lock.current = false; if (generation.current === current) setBusy(false); }
  };
  const publishAll = async (approved = false) => {
    if (lock.current) return;
    lock.current = true;
    const current = generation.current;
    try {
      if (busy || queue.running) throw Error('已有任务正在处理，请查看任务记录');
      setValidationIssues([]);
      const controlsError = publishTaskControlsError(taskControls); if (controlsError) { setValidationIssues([{ field: 'taskControls', message: controlsError }]); return; }
      const targets = accounts.filter(account => selected.includes(account.id));
      const savedRevision = matchingLocalDraftRevision(snapshot(), draftRevision, transientIdentity());
      const origin = savedRevision && draftPreferences().retain === false ? { ...savedRevision, retain: false as const, accountIds: [...selected], rowIds: rows.map(row => row.id) } : undefined;
      const groups = rows.map((row, item) => {
        const config = { title: row.title, body: row.content, topics: parseTopics(row.topics || ''), comment: row.comment || '', options: {} };
        return targets.map(account => {
          const accountConfig = withPublishPlatformDefaults(account.platform, { ...configs[account.id], ...config, options: configs[account.id]?.options || {} });
          return { account, config: accountConfig, media: row.media, expectedMediaType: mediaType, item, ...(origin ? { draft: { ...origin, rowId: row.id } } : {}) };
        });
      });
      const issues = collectPublishPreflight(groups.flat());
      if (!rows.length) issues.push({ field: 'media', message: '请先添加至少一篇作品' });
      if (targets.length !== selected.length) issues.push({ field: 'account', message: '部分已选账号已不可用，请重新选择账号' });
      if (issues.length) { setValidationIssues(issues); return; }
      const token = getAuthToken(), desktop = window.matrixDesktop;
      if (!token || !desktop?.validatePublishMedia) throw Error('当前桌面版本不支持发布前素材校验，请更新后重试；尚未创建任务');
      setBusy(true);
      const mediaIssues = await mediaCheck.check(groups.flat(), input => desktop.validatePublishMedia({ ...input, accessToken: token }), () => generation.current === current && currentSource.current === source && getAuthToken() === token);
      if (mediaIssues.length) { setValidationIssues(mediaIssues); return; }
      if (!approved && queue.jobs.some(job => ['unknown', 'interrupted'].includes(job.stage) && selected.includes(job.accountId))) { setConfirmation('publish-uncertain'); return; }
      queue.startMany(groups.map(group => group.map(request => ({ ...request, media: request.media! }))), taskControls); workspace.hide(); navigate('/publish/tasks'); toast.success(taskControls.initialState === 'paused' ? '已创建暂停任务，尚未打开平台或上传；到任务记录点击开始发布' : '全部作品已进入任务记录，将按作品顺序处理，检查通过后自动提交');
    } catch (error) { if (generation.current === current && currentSource.current === source) toast.error(message(error)); }
    finally { lock.current = false; if (generation.current === current) setBusy(false); }
  };
  return <div className="matrix-batch-editor">
    <PublishValidationErrors issues={validationIssues} />
    <PublishPreflightStatus progress={mediaCheck.progress} cancel={mediaCheck.cancel} />
    <div className="matrix-batch-columns">
      <section className="matrix-batch-common">
        <header><strong>批量{mediaType === 'image' ? '图文' : '视频'}通用配置</strong><span>{rows.length} 条内容</span></header>
        <div className="matrix-batch-toolbar"><strong>批量操作</strong><span className="text-primary">通用</span><span>分发设置：按顺序 · 多对多</span><select aria-label="批量设置字段" value={batchField} onChange={event => setBatchField(event.target.value as typeof batchField)}><option value="title">标题</option><option value="content">简介</option><option value="topics">话题</option><option value="comment">追评</option></select><Input aria-label="批量设置内容" value={batchText} onChange={event => setBatchText(event.target.value)} placeholder="填写后应用到全部作品" /><Button size="sm" variant="outline" disabled={busy} onClick={() => setRows(current => current.map(row => ({ ...row, [batchField]: batchText, saved: false })))}>应用到全部</Button></div>
        <p className="matrix-batch-notice">本页编辑自动同步到本地草稿箱，批量视频与图文分别保存；清空本页数据会删除对应编辑草稿。任务记录与平台作品不受影响。重新打开磁盘草稿时素材需重新选择。</p>
        <p className="matrix-batch-notice">每篇沿用单条发布的队列。不同平台并行处理，同平台按账号顺序提交。当前作品未确认时，后续作品不会上传。</p>
        {mediaType === 'video' && <div className="matrix-batch-drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void importFiles(Array.from(event.dataTransfer.files)); }}><label className="matrix-file-button">添加视频<input type="file" accept=".mp4,.mov,.webm,.mkv" multiple disabled={busy} onChange={event => { void importFiles(Array.from(event.target.files || [])); event.target.value = ''; }} /></label><p>拖入视频文件到这里识别</p><small>支持一次拖入多个视频文件，每个视频一条作品</small></div>}
        {loadError && <p role="alert" className="p-2 text-destructive">{loadError}</p>}
        <div className="matrix-batch-row-list">
          {rows.map((row, index) => <article className="matrix-batch-row" key={row.id}>
            <span className="matrix-batch-row-number">{index + 1}</span>
            <div className={`matrix-batch-media ${row.media && (mediaPreviewRow === row.id || !rows.some(item => item.id === mediaPreviewRow) && index === 0) ? 'has-preview' : ''}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void importFiles(Array.from(event.dataTransfer.files), row); }}>{row.media && (mediaPreviewRow === row.id || !rows.some(item => item.id === mediaPreviewRow) && index === 0) ? <PublishMediaPreview compact media={row.media} disabled={busy} replace={() => void choose(row)} remove={() => change(row.id, { media: undefined, files: [] })} /> : <>{mediaType === 'image' ? <Image size={32} /> : <Video size={26} />}<strong>{mediaType === 'image' ? '点击添加图片' : '视频素材'}</strong><small className="break-all">{row.media?.mediaType === mediaType ? row.media.files.map(file => file.name).join('、') : '本条素材供所选账号复用，可拖入素材'}</small><Button size="sm" variant="outline" disabled={busy} onClick={() => void choose(row)}>选择素材</Button>{row.media && <Button size="sm" variant="outline" onClick={() => setMediaPreviewRow(row.id)}>预览素材</Button>}<small>{mediaType === 'image' ? '每篇最多 9 张图片，不自动删减图片' : '素材选择不随文案草稿保存'}</small></>}</div>
            <div className="matrix-batch-fields"><div className="flex items-center justify-between"><strong>内容 {index + 1}{row.saved ? ' · 已保存为草稿' : ''}</strong><Button aria-label={`移除内容${index + 1}`} variant="ghost" size="icon" disabled={busy || rows.length === 1} onClick={() => setRows(items => items.filter(item => item.id !== row.id))}><Trash2 size={16} /></Button></div>
              <Input aria-label={`内容${index + 1}标题`} maxLength={500} placeholder="作品标题" disabled={busy} value={row.title} onChange={event => change(row.id, { title: event.target.value })} />
              <Textarea aria-label={`内容${index + 1}正文`} maxLength={20000} placeholder="正文、简介或话题" disabled={busy} value={row.content} onChange={event => change(row.id, { content: event.target.value })} />
              <PublishTopicInput id={`batch-topics-${row.id}`} label={`内容${index + 1}话题`} value={parseTopics(row.topics || '')} disabled={busy} change={topics => change(row.id, { topics: topics.join(' ') })} /><Input aria-label={`内容${index + 1}追评`} placeholder="发布后追评（先生成待办，核对作品后发送）" value={row.comment || ''} disabled={busy} onChange={event => change(row.id, { comment: event.target.value })} />
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
        <div className="matrix-distribution-preview"><button onClick={() => setPreview(value => !value)}>› 分发任务预览</button><span>作品：{rows.length} · 账号：{selected.length}</span>{preview && <ol>{rows.flatMap((row, index) => accounts.filter(account => selected.includes(account.id)).map(account => <li key={row.id + account.id}>{index + 1}. {row.title || '未命名作品'} → {account.nickname} · {platformLabels[account.platform]}</li>))}</ol>}</div>
      </section>
    </div>
    <footer className="matrix-publish-footer"><Button variant="outline" disabled={busy || rows.length >= 50} onClick={() => setRows(items => [...items, newRow()])}>增加一篇作品</Button><Button variant="outline" disabled={busy} onClick={() => setConfirmation('clear')}>清空本页数据（{rows.length}）</Button><Button variant="outline" disabled={busy} onClick={() => setSelected([])}>清空已选账号（{selected.length}）</Button><Button variant="outline" disabled={busy} onClick={() => setRows(current => { const next = [...current]; for (let i = next.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [next[i], next[j]] = [next[j], next[i]]; } return next; })}>打乱作品顺序</Button><Button variant="outline" disabled={busy} onClick={() => setPreview(value => !value)}>查看分发预览</Button><Button variant="outline" disabled={busy || loading} onClick={() => void save()}>{busy ? '保存中…' : '批量保存草稿'}</Button><span className="matrix-distribution-submit"><Button disabled={busy || loading || queue.running} onClick={() => publishAll()}>{taskControls.initialState === 'paused' ? '创建暂停任务' : '一键分发'}</Button><PublishTaskControls value={taskControls} change={setTaskControls} disabled={busy || loading || queue.running} /></span></footer>
    <Dialog open={!!confirmation} onOpenChange={open => { if (!open) setConfirmation(undefined); }}><DialogContent><DialogHeader><DialogTitle>{confirmation === 'clear' ? '清空本页编辑数据' : '核对重复发布风险'}</DialogTitle><DialogDescription>{confirmation === 'clear' ? '清空当前页面的作品、账号选择和配置，并同步删除这一条本地编辑草稿。其他发布页面、任务记录、以前保存的文案记录和平台作品不会删除。' : '所选账号有旧任务结果待核对。请确认本次内容不是重复发布，旧任务不会被重发。'}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirmation(undefined)}>取消</Button><Button disabled={busy} onClick={() => { const action = confirmation; setConfirmation(undefined); if (action === 'clear') clearPage(); else publishAll(true); }}>确认</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
