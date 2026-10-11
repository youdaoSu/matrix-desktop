import { OfficialActionButton, platformLabels, useOfficialWorkspace } from '@/components/workspace/OfficialWorkspace';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Plus, Save, UploadCloud } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { PlatformAccount } from '@shared/api.interface';
import { parseTopics, publishSyncFields, syncPublishConfig, validatePublishConfig, type PublishConfig, type PublishSyncField } from '@shared/publish-config';
import { axiosForBackend, getAuthToken } from '@/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const empty = (): PublishConfig => ({ title: '', body: '', topics: [], comment: '', options: {} });
const fieldLabels = { title: '标题', body: '简介', topics: '话题', comment: '追评' };
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const message = (e: any) => e?.response?.data?.error?.message || e?.response?.data?.message || e?.message || '操作失败';
type State = { note: string; prepared?: boolean; locked?: boolean; followup?: string };
export default function ContentCreateRealPage() {
  const workspace = useOfficialWorkspace(), navigate = useNavigate();
  const workspaceRef = useRef(workspace); workspaceRef.current = workspace;
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]), [selected, setSelected] = useState<string[]>([]);
  const [common, setCommon] = useState<PublishConfig>(empty), [configs, setConfigs] = useState<Record<string, PublishConfig>>({});
  const [fields, setFields] = useState<PublishSyncField[]>([...publishSyncFields]);
  const [topicText, setTopicText] = useState('');
  const [mediaType, setMediaType] = useState<'text' | 'image' | 'video'>('video'), [media, setMedia] = useState<MatrixMediaSelection>();
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [dragging, setDragging] = useState(false);
  const [states, setStates] = useState<Record<string, State>>({}), [recommendations, setRecommendations] = useState<string[]>([]);
  const lock = useRef(false), live = useRef(true), uploaded = useRef(new Map<string, string>());
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    axiosForBackend.get('/api/platform/accounts', { params: { page: 1, pageSize: 100, authStatus: 'authorized' } }).then(r => { if (!cancelled) setAccounts(r.data?.data?.items || []); }).catch(e => { if (!cancelled) setError(message(e)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const targets = () => accounts.filter(a => selected.includes(a.id));
  const changeState = (id: string, patch: Partial<State>) => setStates(current => ({ ...current, [id]: { ...current[id], ...patch } as State }));
  const changeConfig = (id: string, patch: Partial<PublishConfig>) => {
    setConfigs(current => ({ ...current, [id]: { ...(current[id] || empty()), ...patch } }));
    changeState(id, { prepared: false, note: '配置已修改，需重新同步到官方表单' });
  };
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try { await action(); } catch (e) { if (live.current) { setError(message(e)); toast.error(message(e)); } }
    finally { lock.current = false; if (live.current) setBusy(false); }
  };
  const importMedia = (files?: File[]) => run(async () => {
    const inferred = files?.length ? (files.every(file => /\.(png|jpe?g|webp)$/i.test(file.name)) ? 'image' : files.length === 1 && /\.(mp4|mov|webm|mkv)$/i.test(files[0].name) ? 'video' : undefined) : mediaType;
    if (!inferred || inferred === 'text') throw Error('请拖入一个视频或一组图片，不支持混合素材');
    if (!window.matrixDesktop?.importMedia) throw Error('请使用最新版矩效桌面端');
    if (Object.values(states).some(s => s.locked) && !window.confirm('已有账号提交过作品。更换素材将新建发布配置，请先核对官方结果，避免重复发布。')) return;
    const result = files ? await window.matrixDesktop.importMedia(files, inferred) : await window.matrixDesktop.chooseMedia(inferred);
    if (result.error) throw Error(result.error);
    if (result.selection) { setMediaType(inferred); setMedia(result.selection); setStates({}); uploaded.current.clear(); toast.success('素材已导入；点击上传并同步后交给所选平台'); }
  });
  const syncRight = () => {
    if (!selected.length || !fields.length) return toast.error('请选择右侧账号及需要同步的字段');
    if (targets().some(a => states[a.id]?.locked)) return toast.error('有账号已提交过本次作品，请先核对结果');
    setConfigs(current => Object.fromEntries([...Object.entries(current).filter(([id]) => !selected.includes(id)), ...selected.map(id => [id, syncPublishConfig(common, current[id], fields)])]));
    for (const id of selected) changeState(id, { prepared: false, note: '已同步至右侧，尚未上传' });
    toast.success(`已同步至 ${selected.length} 个账号；平台专属设置保持不变`);
  };
  const assertCurrent = (token: string | null) => { if (!live.current || !token || getAuthToken() !== token) throw Error('页面已关闭或矩效账号已切换，操作已停止'); };
  const openTarget = async (account: PlatformAccount, config: PublishConfig, token: string | null) => {
    if (!account.connectorSessionId) throw Error('请先通过本机官方登录绑定该账号');
    assertCurrent(token);
    if (!await workspaceRef.current.openAccount(account, 'publish', false, [config.title, config.body].filter(Boolean).join('\n\n'), { title: config.title, body: config.body, media })) throw Error('无法打开账号页面');
    for (let attempt = 0; attempt < 100; attempt++) {
      assertCurrent(token); const publisher = workspaceRef.current.publisher(account.id);
      if (publisher) { try { publisher.input(); return publisher; } catch {} }
      await delay(300);
    }
    throw Error('账号页面未就绪，请检查登录状态后重试');
  };
  const prepare = () => run(async () => {
    if (!targets().length) throw Error('请先选择账号');
    for (const account of targets()) {
      const config = configs[account.id] || common;
      if (validatePublishConfig(config)) throw Error(validatePublishConfig(config)!);
      if (await workspaceRef.current.openAccount(account, 'publish', false, [config.title, config.body].filter(Boolean).join('\n\n'), { title: config.title, body: config.body, media })) changeState(account.id, { note: '页面已准备 · 未发布' });
    }
    toast.info('已准备账号页面，尚未上传或发布');
  });
  const uploadAndSync = () => run(async () => {
    if (!targets().length || !media || mediaType === 'text') throw Error('请先导入视频或图片并选择账号');
    const token = getAuthToken();
    for (const account of targets()) {
      assertCurrent(token);
      if (states[account.id]?.locked) { changeState(account.id, { note: '已提交过，跳过自动重发' }); continue; }
      const config = configs[account.id];
      try {
        if (!config) throw Error('请先点击“同步至右侧”');
        const validation = validatePublishConfig(config); if (validation) throw Error(validation);
        changeState(account.id, { note: '打开官方发布表单…', prepared: false });
        const publisher = await openTarget(account, config, token); await publisher.open(mediaType);
        let input: MatrixPageActionInput | undefined;
        for (let attempt = 0; attempt < 60; attempt++) { assertCurrent(token); try { input = workspaceRef.current.publisher(account.id)?.input(); if (input) break; } catch {} await delay(300); }
        if (!input) throw Error('官方发布页未就绪');
        const stamp = `${input.webContentsId}:${media.id}`;
        if (uploaded.current.get(account.id) !== stamp) {
          changeState(account.id, { note: '正在把素材交给官方上传控件…' });
          const result = await window.matrixDesktop!.uploadMedia({ ...input, mediaType, selectionId: media.id });
          if (result.error || !result.uploadStarted) throw Error(result.error || '上传未开始');
          uploaded.current.set(account.id, stamp);
        }
        let result: MatrixPublishSyncResult = {};
        for (let attempt = 0; attempt < 15; attempt++) {
          assertCurrent(token); result = await window.matrixDesktop!.syncPublishForm({ ...input, command: 'fill', form: config });
          if (result.error || result.filled?.length || !result.unresolved?.length) break;
          changeState(account.id, { note: '素材已交给平台，等待编辑表单加载…' }); await delay(1000);
        }
        if (result.error) throw Error(result.error);
        const missing = result.unresolved || [];
        changeState(account.id, { prepared: true, note: missing.length ? `需在官方页面补全：${missing.join('；')}` : `素材已交给平台，文案已同步${result.topicsAsText ? '（话题以 #文本填入，请确认官方话题匹配）' : ''}；请核对封面、上传进度及必填项` });
      } catch (e) { changeState(account.id, { prepared: false, note: message(e) }); }
    }
  });
  const readTopics = () => run(async () => {
    const account = targets()[0]; if (!account) throw Error('请先选择账号并打开官方发布页的话题推荐');
    const input = workspaceRef.current.publisher(account.id)?.input(); if (!input) throw Error('请先打开该账号的官方发布页及话题推荐面板');
    const result = await window.matrixDesktop!.syncPublishForm({ ...input, command: 'topics' }); if (result.error) throw Error(result.error);
    setRecommendations(result.topics || []); if (!result.topics?.length) toast.info('未检测到官方推荐话题，请打开官方话题选择面板后重试');
  });
  const publish = () => run(async () => {
    const chosen = targets();
    if (!chosen.length || chosen.length > 20) throw Error('请选择 1 至 20 个账号');
    if (chosen.some(a => states[a.id]?.locked)) throw Error('有账号已提交或结果待核对，请取消勾选，避免重复发布');
    if (chosen.some(a => !states[a.id]?.prepared)) throw Error('请先为所有所选账号执行“上传并同步到官方表单”');
    const token = getAuthToken(), entries: MatrixPublishEntry[] = [];
    for (const account of chosen) {
      assertCurrent(token); const input = workspaceRef.current.publisher(account.id)?.input(); if (!input) throw Error(`${account.nickname}的页面已关闭`);
      const plan = await window.matrixDesktop!.inspectPageAction({ ...input, kind: 'publish' }); if ('error' in plan) throw Error(`${account.nickname}：${plan.error}`);
      if (plan.candidates.length !== 1) throw Error(`${account.nickname}存在多个提交按钮，请核对后单独提交`);
      entries.push({ ...input, nonce: plan.nonce, index: plan.candidates[0].index });
    }
    assertCurrent(token); const result = await window.matrixDesktop!.submitPublishBatch(entries);
    if (result.error) throw Error(result.error); if (result.cancelled) return;
    for (const item of result.results || []) {
      const receipt = item.receipt;
      changeState(item.accountId, { locked: !!item.mayHaveSubmitted || !!receipt, note: receipt ? `${receipt.status === 'confirmed' ? '官方页面提示成功' : receipt.status === 'failed' ? '官方提示失败' : '结果待核对，勿重复提交'}：${receipt.message}` : item.error || '未提交' });
      const comment = configs[item.accountId]?.comment.trim();
      if (receipt?.status === 'confirmed' && comment) {
        try {
          await axiosForBackend.post('/api/personal/tasks', { requestId: receipt.id, accountIds: [item.accountId], kind: 'comment', title: `作品追评：${configs[item.accountId].title || '本次作品'}`.slice(0, 200), content: comment });
          changeState(item.accountId, { followup: '追评已保存待办；需定位该作品后确认发送，未自动追评' });
        } catch (e) { changeState(item.accountId, { followup: `追评待办保存失败：${message(e)}。文案仍保留，请勿重新发布作品。` }); }
      }
    }
    for (const id of result.remaining || []) changeState(id, { note: '前一个账号失败或结果不明，本账号未提交' });
    window.dispatchEvent(new Event('matrix:page-actions-updated')); window.dispatchEvent(new Event('matrix:personal-tasks-updated'));
  });
  const save = () => run(async () => {
    if (!targets().length || validatePublishConfig(common)) throw Error('请填写标题或简介并选择账号');
    await axiosForBackend.post('/api/content/posts', { title: common.title.trim() || undefined, content: [common.body, common.topics.map(t => '#' + t).join(' ')].filter(Boolean).join('\n'), mediaType, accountIds: selected, status: 'draft' });
    toast.success('已保存通用文案草稿；本机素材和右侧专属配置未保存'); navigate('/publish/drafts');
  });
  return <div className="matrix-publish-editor">{error && <p role="alert" className="matrix-publish-alert">{error}</p>}
    <div className="matrix-publish-columns"><section className="matrix-publish-common"><header><strong>通用配置</strong><span>素材 → 同步至右侧 → 上传 → 核对发布</span></header><div className="matrix-publish-form">
      <div className={`matrix-media-guidance matrix-dropzone ${dragging ? 'is-dragging' : ''}`} aria-label="拖入视频或图片" onDragOver={e => { e.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (!busy) void importMedia(Array.from(e.dataTransfer.files)); }}><UploadCloud size={28} /><strong>{media ? media.files.map(f => f.name).join('、') : '把视频或图片拖到这里'}</strong><p>{media ? `${media.files.length} 个文件 · ${(media.files.reduce((sum, f) => sum + f.size, 0) / 1048576).toFixed(1)} MB · 已导入本机素材` : '拖入即导入；一个视频或最多 9 张图片。点击上传并同步后传给所选平台。'}</p><div className="flex justify-center gap-2"><Button disabled={busy || mediaType === 'text'} onClick={() => void importMedia()}>{media ? '更换本机素材' : '选择本机素材'}</Button><OfficialActionButton intent="publish">进入官方发布页</OfficialActionButton></div></div>
      <div className="matrix-publish-field"><Label htmlFor="publish-media-type">内容类型</Label><Select value={mediaType} disabled={busy || Object.values(states).some(s => s.locked)} onValueChange={v => { setMediaType(v as typeof mediaType); setMedia(undefined); setStates({}); uploaded.current.clear(); }}><SelectTrigger id="publish-media-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="video">视频</SelectItem><SelectItem value="image">图文</SelectItem><SelectItem value="text">文本草稿</SelectItem></SelectContent></Select></div>
      <div className="matrix-publish-field"><Label htmlFor="publish-title">通用标题</Label><Input id="publish-title" value={common.title} disabled={busy} maxLength={500} onChange={e => setCommon({ ...common, title: e.target.value })} placeholder="请输入作品标题" /></div>
      <div className="matrix-publish-field"><Label htmlFor="publish-content">通用简介</Label><Textarea id="publish-content" value={common.body} disabled={busy} maxLength={20000} onChange={e => setCommon({ ...common, body: e.target.value })} placeholder="请输入正文或作品简介" /></div>
      <div className="matrix-publish-field"><Label htmlFor="publish-topics">标签 / 话题</Label><div><Input id="publish-topics" disabled={busy} value={topicText} onChange={e => { setTopicText(e.target.value); setCommon({ ...common, topics: parseTopics(e.target.value) }); }} placeholder="#健身 #日常（空格或逗号分隔）" /><small>{common.topics.map(t => '#' + t).join(' ')} · 最多 15 个，不静默截断</small><Button variant="outline" size="sm" disabled={busy} onClick={() => void readTopics()}>读取官方推荐话题</Button><div className="matrix-topic-chips">{recommendations.map(t => <button disabled={busy} key={t} onClick={() => { const topics = [...new Set([...common.topics, t])]; setCommon({ ...common, topics }); setTopicText(topics.join(' ')); }}>#{t}</button>)}</div></div></div>
      <div className="matrix-publish-field"><Label htmlFor="publish-comment">发布后追评</Label><div><Textarea id="publish-comment" disabled={busy} maxLength={2000} value={common.comment} onChange={e => setCommon({ ...common, comment: e.target.value })} placeholder="作品发布后要追加的评论" /><small>官方提示成功后生成追评待办。尚未接通自动定位新作品，不会向不确定的作品自动发表评论。</small></div></div>
      <div className="matrix-sync-fields">{publishSyncFields.map(f => <label key={f}><Checkbox disabled={busy} checked={fields.includes(f)} onCheckedChange={checked => setFields(current => checked ? [...current, f] : current.filter(v => v !== f))} />{fieldLabels[f]}</label>)}</div><Button disabled={busy} onClick={syncRight}>同步至右侧 <ArrowRight size={15} /></Button><small className="matrix-sync-caption">只同步勾选字段，各账号可单独修改；素材由所选账号复用。</small>
    </div></section><section className="matrix-publish-accounts"><header><strong>平台和账号配置</strong><span>已选 {selected.length} 个账号</span></header><div className="matrix-publish-account-list">{loading && <p role="status">正在加载账号…</p>}
      {accounts.map(a => <article key={a.id} className="matrix-account-publish-config" data-publish-account={a.id}><label className="matrix-publish-account"><Checkbox disabled={busy} checked={selected.includes(a.id)} onCheckedChange={checked => { setSelected(ids => checked ? [...new Set([...ids, a.id])] : ids.filter(id => id !== a.id)); if (checked && !configs[a.id]) setConfigs(current => ({ ...current, [a.id]: syncPublishConfig(common, undefined, publishSyncFields) })); }} /><div><strong>{a.nickname || '未命名账号'}</strong><small>{platformLabels[a.platform]} · {a.groupName || '默认分组'}</small></div><span>{states[a.id]?.locked ? '已提交 / 待核对' : states[a.id]?.note === '页面已准备 · 未发布' ? '页面已准备 · 未发布' : '未发布'}</span></label>
        {selected.includes(a.id) && configs[a.id] && <div className="matrix-account-publish-fields">{(['title', 'body', 'comment'] as const).map(f => <label key={f}>{fieldLabels[f]}<Textarea aria-label={`${a.nickname}-${fieldLabels[f]}`} disabled={busy || states[a.id]?.locked} value={configs[a.id][f]} onChange={e => changeConfig(a.id, { [f]: e.target.value })} /></label>)}<label>标签 / 话题<Input aria-label={`${a.nickname}-话题`} disabled={busy || states[a.id]?.locked} defaultValue={configs[a.id].topics.join(' ')} key={configs[a.id].topics.join('|')} onBlur={e => changeConfig(a.id, { topics: parseTopics(e.target.value) })} /></label>
          <details><summary>{platformLabels[a.platform]}专属选项（按官方控件同步）</summary>{([['category', a.platform === 'bilibili' ? '分区' : '内容分类'], ['originality', '创作类型'], ['visibility', '可见范围']] as const).map(([key, label]) => <label key={key}>{label}<Input disabled={busy || states[a.id]?.locked} aria-label={`${a.nickname}-${label}`} value={configs[a.id].options[key] || ''} placeholder="留空保留官方设置；填写官方选项名称" onChange={e => changeConfig(a.id, { options: { ...configs[a.id].options, [key]: e.target.value } })} /></label>)}<small>封面、定时及非标准选项需在官方表单核对。未匹配的控件会提示补全。</small></details>
          {states[a.id]?.note && <p role="status">{states[a.id].note}</p>}{states[a.id]?.followup && <p>{states[a.id].followup}<Button size="sm" variant="outline" onClick={() => navigate('/engage/batch-tasks')}>查看追评待办</Button></p>}
        </div>}</article>)}
      {!loading && !accounts.length && <div className="matrix-publish-no-account"><Plus size={32} /><p>还没有已绑定账号</p><Button onClick={() => navigate('/accounts')}>添加账号</Button></div>}
    </div></section></div><footer className="matrix-publish-footer"><Button variant="outline" disabled={busy} onClick={() => { if (!window.confirm('新建发布配置？官方页面和已提交结果不会撤回，请先核对，避免重复发布。')) return; setCommon(empty()); setTopicText(''); setConfigs({}); setSelected([]); setStates({}); setMedia(undefined); uploaded.current.clear(); }}>新建发布</Button><Button variant="outline" disabled={busy || loading} onClick={() => void save()}><Save size={14} />存为草稿</Button><Button variant="outline" disabled={busy || loading} onClick={() => void prepare()}>为所选账号准备发布</Button><Button variant="outline" disabled={busy || loading || !media} onClick={() => void uploadAndSync()}>上传并同步到官方表单</Button><Button disabled={busy || loading} onClick={() => void publish()}>{busy ? '处理中…' : `一键发布（${selected.length}）`}</Button></footer>
  </div>;
}
