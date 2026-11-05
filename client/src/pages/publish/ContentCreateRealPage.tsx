import { OfficialActionButton, useOfficialWorkspace } from '@/components/workspace/OfficialWorkspace';
import { usePublishQueue } from '@/components/workspace/PublishQueue';
import { requestPublishFollowup } from '@/components/workspace/publish-followup';
import { PublishAccountPanel } from '@/components/workspace/PublishAccountPanel';
import { loadPublishAccounts } from '@/components/workspace/publish-preferences';
import { PublishCovers, PublishSchedule } from '@/components/workspace/PublishCommonExtras';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Save, UploadCloud } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { PlatformAccount } from '@shared/api.interface';
import { parseTopics, publishSyncFields, validatePublishConfig, type PublishConfig } from '@shared/publish-config';
import { syncPublishToPlatform } from '@shared/publish-sync';
import { axiosForBackend, getAuthToken } from '@/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { commitLocalDraftRevision, createLocalDraftRevision, draftPreferences, hasDraftContent, matchingLocalDraftRevision, normalizeLocalDraft, removeLocalDraft, type LocalPublishDraft } from '@/components/workspace/local-publish-drafts';
import { usePublishEditorState, usePublishEditorValue } from '@/components/workspace/PublishEditorState';
import { collectPublishPreflight, type PublishPreflightIssue } from '@shared/publish-preflight';
import { PublishValidationErrors } from '@/components/workspace/PublishValidationErrors';
import { PublishPreflightStatus, usePublishMediaCheck } from '@/components/workspace/PublishPreflightStatus';
import { withPublishPlatformDefaults } from '@shared/publish-platform-fields';
import { defaultPublishTaskControls, publishTaskControlsError } from '@shared/publish-task-controls';
import { PublishTaskControls } from '@/components/workspace/PublishTaskControls';
import { PublishMediaPreview } from '@/components/workspace/PublishMediaPreview';
import { PublishTopicInput } from '@/components/workspace/PublishTopicInput';
import { normalizePublishExtraction } from '@shared/publish-extraction';
import { PublishAutoExtract, usePublishAutoExtract } from '@/components/workspace/PublishAutoExtract';

const empty = (): PublishConfig => ({ title: '', body: '', topics: [], comment: '', options: {} });
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const message = (e: any) => e?.response?.data?.error?.message || e?.response?.data?.message || e?.message || '操作失败';
type State = { note: string; prepared?: boolean; locked?: boolean; followup?: string };
export default function ContentCreateRealPage() {
  const workspace = useOfficialWorkspace(), navigate = useNavigate();
  const candidate = useLocation().state?.localDraft;
  const restored = useMemo(() => { const draft = normalizeLocalDraft(candidate, true); return draft?.source === 'single' ? draft : undefined; }, [candidate, getAuthToken()]);
  const restoredVersion = restored ? JSON.stringify([restored.id, restored.updatedAt, restored.revisionId || 'legacy']) : '';
  const draftId = usePublishEditorValue('single:draft-id', () => ({ current: restored?.id || crypto.randomUUID() })), draftStamp = usePublishEditorValue('single:draft-stamp', () => ({ current: restored?.updatedAt || '' }));
  const draftRevision = usePublishEditorValue('single:draft-revision', () => createLocalDraftRevision(restored));
  const restoredStamp = usePublishEditorValue('single:restored-stamp', () => ({ current: restoredVersion }));
  const restoring = Boolean(restored && restoredStamp.current !== restoredVersion);
  const [fileNames, setFileNames] = usePublishEditorState<string[]>('single:file-names', restored?.files || []);
  const { queue } = usePublishQueue();
  const overrides = usePublishEditorValue('single:overrides', () => ({ current: new Map<string, Set<string>>(Object.entries(restored?.singleSettings?.overrides || {}).map(([id, fields]) => [id, new Set(fields)])) }));
  const workspaceRef = useRef(workspace); workspaceRef.current = workspace;
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]), [selected, setSelected] = usePublishEditorState<string[]>('single:selected', restored?.accounts.map(account => account.id) || []);
  const [common, setCommon] = usePublishEditorState<PublishConfig>('single:common', restored?.config || empty), [configs, setConfigs] = usePublishEditorState<Record<string, PublishConfig>>('single:configs', restored?.configs || {});
  const fields = [...publishSyncFields];
  const [topicText, setTopicText] = usePublishEditorState('single:topics-text', restored?.config.topics.join(' ') || '');
  const [autoExtract, setAutoExtract] = usePublishEditorState('single:auto-extract', restored?.singleSettings?.autoExtract || false);
  const [extraction, setExtraction] = usePublishEditorState('single:extraction-options', () => normalizePublishExtraction(restored?.singleSettings?.extraction));
  const [extractionRevision, setExtractionRevision] = useState(0);
  const [taskControls, setTaskControls] = usePublishEditorState('single:task-controls', restored?.singleSettings?.taskControls || defaultPublishTaskControls());
  const [mediaType, setMediaType] = usePublishEditorState<'text' | 'image' | 'video'>('single:media-type', restored?.mediaType || 'video'), [media, setMedia] = usePublishEditorState<MatrixMediaSelection | undefined>('single:media', undefined);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [dragging, setDragging] = useState(false);
  const [validationIssues, setValidationIssues] = useState<PublishPreflightIssue[]>([]);
  const mediaCheck = usePublishMediaCheck('single');
  useEffect(() => { setValidationIssues([]); }, [common, configs, selected, media, mediaType, taskControls]);
  const [states, setStates] = usePublishEditorState<Record<string, State>>('single:states', {}), [recommendations, setRecommendations] = useState<string[]>([]);
  const extractionStatus = usePublishAutoExtract({ enabled: autoExtract, options: extraction, media, config: common, change: setCommon, blocked: busy || Object.values(states).some(state => state.locked || state.prepared), revision: extractionRevision });
  const lock = useRef(false), live = useRef(true), uploaded = usePublishEditorValue('single:uploaded', () => ({ current: new Map<string, string>() }));
  useEffect(() => {
    if (!restored || !restoring) return;
    restoredStamp.current = restoredVersion;
    draftId.current = restored.id; draftStamp.current = restored.updatedAt;
    draftRevision.current = createLocalDraftRevision(restored).current;
    setFileNames(restored.files);
    setCommon(restored.config); setConfigs(restored.configs); setSelected(restored.accounts.map(account => account.id)); setTopicText(restored.config.topics.join(' ')); setMediaType(restored.mediaType); setMedia(undefined); setStates({}); uploaded.current.clear();
    overrides.current = new Map(Object.entries(restored.singleSettings?.overrides || {}).map(([id, fields]) => [id, new Set(fields)]));
    setAutoExtract(restored.singleSettings?.autoExtract || false);
    setExtraction(normalizePublishExtraction(restored.singleSettings?.extraction));
    setTaskControls(restored.singleSettings?.taskControls || defaultPublishTaskControls());
  }, [restored?.id, restored?.updatedAt, restored?.revisionId]);
  const snapshot = (): LocalPublishDraft => ({ id: draftId.current, source: 'single', updatedAt: draftStamp.current || new Date().toISOString(), title: common.title || '单条发布编辑草稿', config: common, configs, mediaType, files: media?.files.map(file => file.name) || fileNames, accounts: accounts.filter(account => selected.includes(account.id)).map(account => ({ id: account.id, nickname: account.nickname || '未命名账号', platform: account.platform })), singleSettings: { syncFields: fields, overrides: Object.fromEntries([...overrides.current].map(([id, fields]) => [id, [...fields]])), autoExtract, extraction, taskControls } });
  const meaningful = () => hasDraftContent(common, media?.files.map(file => file.name) || fileNames, selected) || Object.values(configs).some(config => hasDraftContent(config)) || autoExtract || Object.values(extraction).some(value => value !== true) || taskControls.initialState !== 'execute' || taskControls.batchName !== '单条分发' || publishSyncFields.some(field => !fields.includes(field)) || [...overrides.current.values()].some(fields => fields.size > 0);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    if (loading || restoring || !draftPreferences().auto) return;
    try {
      if (!meaningful()) { removeLocalDraft(draftId.current); draftStamp.current = ''; draftRevision.current = undefined; return; }
      draftStamp.current = commitLocalDraftRevision(snapshot(), draftRevision, media?.id).updatedAt;
    } catch (error) { toast.error(message(error)); }
  }, [common, configs, selected, accounts, media, mediaType, fileNames, loading, restoring, autoExtract, extraction, taskControls]);
  useEffect(() => {
    let cancelled = false;
    loadPublishAccounts().then(items => { if (!cancelled) setAccounts(items); }).catch(e => { if (!cancelled) setError(message(e)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const targets = () => accounts.filter(a => selected.includes(a.id));
  const changeState = (id: string, patch: Partial<State>) => setStates(current => ({ ...current, [id]: { ...current[id], ...patch } as State }));
  const changeConfig = (id: string, patch: Partial<PublishConfig>) => {
    overrides.current.set(id, new Set([...(overrides.current.get(id) || []), ...Object.keys(patch)]));
    setConfigs(current => ({ ...current, [id]: { ...(current[id] || empty()), ...patch } }));
    changeState(id, { prepared: false, note: '配置已修改，需重新同步到官方表单' });
  };
  const clearEditor = () => {
    removeLocalDraft(draftId.current);
    draftId.current = crypto.randomUUID(); draftStamp.current = '';
    draftRevision.current = undefined;
    setFileNames([]);
    setCommon(empty()); setTopicText(''); setConfigs({}); overrides.current.clear(); setAutoExtract(false); setExtraction(normalizePublishExtraction(undefined)); setTaskControls(defaultPublishTaskControls()); setSelected([]); setStates({}); setMedia(undefined); uploaded.current.clear();
    // A continued draft's display-only filenames must not recreate it after clear.
    navigate('/publish/create', { replace: true, state: null });
    toast.success('本页编辑数据和对应本地草稿已清空；其他页面、任务记录未改动');
  };
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try { await action(); } catch (e) { if (live.current) { setError(message(e)); toast.error(message(e)); } }
    finally { lock.current = false; if (live.current) setBusy(false); }
  };
  const importMedia = (files?: File[]) => run(async () => {
    const token = getAuthToken();
    const inferred = files?.length ? (files.every(file => /\.(png|jpe?g|webp)$/i.test(file.name)) ? 'image' : files.length === 1 && /\.(mp4|mov|webm|mkv)$/i.test(files[0].name) ? 'video' : undefined) : mediaType;
    if (!inferred || inferred === 'text') throw Error('请拖入一个视频或一组图片，不支持混合素材');
    if (!window.matrixDesktop?.importMedia) throw Error('请使用最新版远效桌面端');
    if (Object.values(states).some(s => s.locked) && !window.confirm('已有账号提交过作品。更换素材将新建发布配置，请先核对官方结果，避免重复发布。')) return;
    const result = files ? await window.matrixDesktop.importMedia(files, inferred) : await window.matrixDesktop.chooseMedia(inferred);
    assertCurrent(token);
    if (result.error) throw Error(result.error);
    if (result.selection) { setMediaType(inferred); setMedia(result.selection); setFileNames(result.selection.files.map(file => file.name)); setStates({}); uploaded.current.clear(); toast.success('素材已导入；点击一键发布后自动上传'); }
  });
  const syncRight = () => {
    if (!selected.length) return toast.error('请先选择右侧账号');
    if (targets().some(a => states[a.id]?.locked)) return toast.error('有账号已提交过本次作品，请先核对结果');
    setConfigs(current => Object.fromEntries([...Object.entries(current).filter(([id]) => !selected.includes(id)), ...targets().map(account => [account.id, syncPublishToPlatform(account.platform, common, current[account.id])])]));
    for (const id of selected) overrides.current.delete(id);
    for (const id of selected) changeState(id, { prepared: false, note: '已同步至右侧，尚未上传' });
    toast.success(`已同步至 ${selected.length} 个账号；平台专属设置保持不变`);
  };
  const assertCurrent = (token: string | null) => { if (!live.current || !token || getAuthToken() !== token) throw Error('页面已关闭或远效账号已切换，操作已停止'); };
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
      const config = withPublishPlatformDefaults(account.platform, configs[account.id] || common);
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
      const savedConfig = configs[account.id];
      const config = savedConfig && withPublishPlatformDefaults(account.platform, savedConfig);
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
        if (config.covers?.length) missing.push('封面：高级手动流程请在官方页面上传并核对裁剪，或使用后台一键发布流程');
        if (config.schedule && config.schedule.mode !== 'now') missing.push(`定时：${config.schedule.at}，高级手动流程不会自动等待或设置定时，请在官方页面确认`);
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
  const publishManually = () => run(async () => {
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
          const account=chosen.find(account=>account.id===item.accountId);if(!account)throw Error('追评账号与原发布账号不一致');
          const result=await requestPublishFollowup({account,config:configs[item.accountId]},receipt,{accessToken:token!,assertCurrent:()=>assertCurrent(token),desktop:()=>window.matrixDesktop!,saveTask:input=>axiosForBackend.post('/api/personal/tasks',input),updated:kind=>window.dispatchEvent(new Event(kind==='receipts'?'matrix:page-actions-updated':'matrix:personal-tasks-updated'))});
          assertCurrent(token);changeState(item.accountId, { followup: result.message+(result.pinResult?'；'+result.pinResult.message:'') });
        } catch (e) { changeState(item.accountId, { followup: `追评待办保存失败：${message(e)}。文案仍保留，请勿重新发布作品。` }); }
      }
    }
    for (const id of result.remaining || []) changeState(id, { note: '前一个账号失败或结果不明，本账号未提交' });
    window.dispatchEvent(new Event('matrix:page-actions-updated')); window.dispatchEvent(new Event('matrix:personal-tasks-updated'));
  });
  const save = () => run(async () => {
    if (!meaningful()) throw Error('本页暂无编辑内容');
    draftStamp.current = commitLocalDraftRevision(snapshot(), draftRevision, media?.id, true).updatedAt;
    toast.success('本页内容与账号配置已保存到同一条本地草稿；尚未发布'); navigate('/publish/drafts');
  });
  const publish = () => void run(async () => {
      if (extractionStatus.pending) throw Error('正在提取同名文件，请稍候；尚未创建发布任务');
      setValidationIssues([]);
      const controlsError = publishTaskControlsError(taskControls); if (controlsError) { setValidationIssues([{ field: 'taskControls', message: controlsError }]); return; }
      if (busy || queue.running) throw Error('已有任务正在处理，请查看发布进度');
      const savedRevision = matchingLocalDraftRevision(snapshot(), draftRevision, media?.id);
      const origin = savedRevision && draftPreferences().retain === false ? { ...savedRevision, retain: false as const, accountIds: [...selected] } : undefined;
      const requests = targets().map(account => {
        if (states[account.id]?.locked || states[account.id]?.prepared) throw Error('该账号已手动上传或提交，请用高级操作核对，避免重复上传');
        const config = withPublishPlatformDefaults(account.platform, syncPublishToPlatform(account.platform, common, configs[account.id], overrides.current.get(account.id)));
        return { account, config, media, expectedMediaType: mediaType === 'text' ? undefined : mediaType, ...(origin ? { draft: origin } : {}) };
      });
      const issues = collectPublishPreflight(requests);
      if (targets().length !== selected.length) issues.push({ field: 'account', message: '部分已选账号已不可用，请重新选择账号' });
      if (mediaType === 'text') issues.push({ field: 'media', message: '文本仅可保存草稿，请选择视频或图文后发布' });
      if (issues.length) { setValidationIssues(issues); return; }
      const token = getAuthToken(), desktop = window.matrixDesktop;
      if (!token || !desktop?.validatePublishMedia) throw Error('当前桌面版本不支持发布前素材校验，请更新后重试；尚未创建任务');
      const mediaIssues = await mediaCheck.check(requests, input => desktop.validatePublishMedia({ ...input, accessToken: token }), () => live.current && getAuthToken() === token);
      if (mediaIssues.length) { setValidationIssues(mediaIssues); return; }
      if (queue.jobs.some(job => ['unknown', 'interrupted'].includes(job.stage) && selected.includes(job.accountId)) && !window.confirm('所选账号有结果待核对或中断的旧任务。请先核对官方是否已收到，避免重复发布。确定这是需要新发布的作品吗？')) return;
      queue.start(requests.map(request => ({ ...request, media: request.media! })), taskControls); workspace.hide(); navigate('/publish/tasks');
      toast.success(taskControls.initialState === 'paused' ? '已创建暂停任务，尚未打开平台或上传；请在任务记录点击开始发布。' : '已加入后台发布队列，检查通过后自动提交，可继续使用其他模块。');
  });
  return <div className="matrix-publish-editor"><PublishValidationErrors issues={validationIssues} /><PublishPreflightStatus progress={mediaCheck.progress} cancel={mediaCheck.cancel} />{error && <p role="alert" className="matrix-publish-alert">{error}</p>}
    <div className="matrix-publish-columns"><section className="matrix-publish-common"><header><strong>通用配置</strong><span>填好素材与文案 → 一键发布 → 查看进度</span></header><div className="matrix-publish-form">
      <div className={`matrix-media-guidance matrix-dropzone ${media ? 'has-preview' : ''} ${dragging ? 'is-dragging' : ''}`} aria-label="拖入视频或图片" onDragOver={e => { e.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (!busy) void importMedia(Array.from(e.dataTransfer.files)); }}>{media ? <PublishMediaPreview media={media} disabled={busy} replace={() => void importMedia()} remove={() => { if (Object.values(states).some(state => state.locked || state.prepared) && !window.confirm('只移除本页素材，不撤回已经上传或提交的作品。确认继续？')) return; setMedia(undefined); setFileNames([]); setStates({}); uploaded.current.clear(); }} onCover={cover => setCommon(current => ({ ...current, covers: [...(current.covers || []).filter(item => item.index !== 1), cover] }))} /> : <><UploadCloud size={28} /><strong>把视频或图片拖到这里</strong><p>拖入即导入；一个视频或最多 9 张图片。点击一键发布后自动上传，可切换其他页面。</p><div className="flex justify-center gap-2"><Button disabled={busy || mediaType === 'text'} onClick={() => void importMedia()}>选择本机素材</Button><OfficialActionButton intent="publish">进入官方发布页</OfficialActionButton></div></>}</div>
      <PublishAutoExtract enabled={autoExtract} toggle={setAutoExtract} options={extraction} change={setExtraction} disabled={busy || Object.values(states).some(state => state.locked || state.prepared)} status={extractionStatus} retry={() => setExtractionRevision(value => value + 1)} />
      <div className="matrix-publish-field"><Label htmlFor="publish-media-type">内容类型</Label><Select value={mediaType} disabled={busy || Object.values(states).some(s => s.locked)} onValueChange={v => { setMediaType(v as typeof mediaType); setMedia(undefined); setFileNames([]); setStates({}); uploaded.current.clear(); }}><SelectTrigger id="publish-media-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="video">视频</SelectItem><SelectItem value="image">图文</SelectItem><SelectItem value="text">文本草稿</SelectItem></SelectContent></Select></div>
      <PublishCovers config={common} change={setCommon} disabled={busy} />
      <div className="matrix-publish-field"><Label htmlFor="publish-title">通用标题</Label><div><Input id="publish-title" value={common.title} disabled={busy} maxLength={500} onChange={e => setCommon({ ...common, title: e.target.value })} placeholder="请输入作品标题" /><small className="text-right">{common.title.length} / 500 · 同步时按官方标题限制检查</small></div></div>
      <div className="matrix-publish-field"><Label htmlFor="publish-content">通用简介</Label><div><Textarea id="publish-content" value={common.body} disabled={busy} maxLength={20000} onChange={e => setCommon({ ...common, body: e.target.value })} placeholder="请输入正文或作品简介" /><small className="text-right">{common.body.length} / 20000</small><small>话题请在下方标签栏填写，避免重复。</small></div></div>
      <div className="matrix-publish-field"><Label htmlFor="publish-topics">标签 / 话题</Label><div><PublishTopicInput id="publish-topics" value={common.topics} disabled={busy} change={topics => { setTopicText(topics.join(' ')); setCommon({ ...common, topics }); }} /><small>最多15个话题，每个最多40字；回车、空格或逗号确认，一个话题一个标签。</small><Button variant="outline" size="sm" disabled={busy} onClick={() => void readTopics()}>读取官方推荐话题</Button><div className="matrix-topic-chips">{recommendations.map(t => <button disabled={busy} key={t} onClick={() => { const topics = [...new Set([...common.topics, t])]; setCommon({ ...common, topics }); setTopicText(topics.join(' ')); }}>#{t}</button>)}</div></div></div>
      <PublishSchedule config={common} change={setCommon} disabled={busy} />
      <div className="matrix-publish-field"><Label htmlFor="publish-comment">发布后追评</Label><div><Textarea id="publish-comment" disabled={busy} maxLength={2000} value={common.comment} onChange={e => setCommon({ ...common, comment: e.target.value })} placeholder="作品发布后要追加的评论" /><label className="flex gap-2 items-center text-sm py-2"><input type="checkbox" aria-label="通用追评置顶" checked={common.pinComment===true} disabled={busy||!common.comment.trim()} onChange={e=>setCommon({...common,pinComment:e.target.checked})}/>置顶本条追评（B站、小红书、视频号网页适配）</label><details><summary className="text-xs cursor-pointer">追评历史记录</summary>{[...new Set(queue.jobs.map(job => job.config?.comment).filter(Boolean))].slice(-10).map(comment => <button type="button" className="block text-left text-xs p-2 border-b" key={comment} onClick={() => setCommon({ ...common, comment: comment! })}>{comment}</button>)}</details><small>追评和置顶仅按原作品ID、本人账号ID及本条评论ID独立执行；网页能力仍需真实核验，官网没有入口时如实提示，不重发作品或重复评论。</small></div></div>
      <Button variant="outline" disabled={busy} onClick={clearEditor}>清空</Button> <Button disabled={busy || extractionStatus.pending} onClick={syncRight}>同步至右侧 <ArrowRight size={15} /></Button><small className="matrix-sync-caption">一次同步全部通用信息，仅填入各平台支持的项目；平台专属设置保留。一键发布也会自动同步，并保留右侧手动修改。</small>
    </div></section><section className="matrix-publish-accounts"><PublishAccountPanel accounts={accounts} selected={selected} configs={configs} common={common} onSelect={setSelected} onInit={(id, config) => setConfigs(current => ({ ...current, [id]: config }))} onChange={changeConfig} disabled={busy} loading={loading} mediaType={mediaType} states={states} /></section></div><footer className="matrix-publish-footer"><Button variant="outline" disabled={busy} onClick={() => { if (!window.confirm('新建发布配置？官方页面和已提交结果不会撤回，请先核对，避免重复发布。')) return; draftId.current = crypto.randomUUID(); draftStamp.current = ''; setFileNames([]); setCommon(empty()); setTopicText(''); setConfigs({}); overrides.current.clear(); setSelected([]); setStates({}); setMedia(undefined); setTaskControls(defaultPublishTaskControls()); uploaded.current.clear(); }}>新建发布</Button><Button variant="outline" disabled={busy || loading} onClick={() => void save()}><Save size={14} />存为草稿</Button><details><summary className="cursor-pointer text-sm">高级操作（手动准备）</summary><div className="flex gap-2 py-2"><Button variant="outline" disabled={busy || loading || queue.running} onClick={() => void prepare()}>为所选账号准备发布</Button><Button variant="outline" disabled={busy || loading || !media || queue.running} onClick={() => void uploadAndSync()}>上传并同步到官方表单</Button><Button variant="outline" disabled={busy || loading || queue.running} onClick={() => void publishManually()}>提交已准备的表单</Button></div></details><span className="matrix-distribution-submit"><Button disabled={busy || loading || queue.running} onClick={publish}>{queue.running ? '后台发布中，请查看进度' : taskControls.initialState === 'paused' ? `创建暂停任务（${selected.length}）` : `一键发布（${selected.length}）`}</Button><PublishTaskControls value={taskControls} change={setTaskControls} disabled={busy || loading || queue.running} /></span></footer>
  </div>;
}
