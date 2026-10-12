import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import type { PlatformAccount } from '@shared/api.interface';
import { toast } from 'sonner';
import { axiosForBackend, getAuthToken, getUser } from '@/api';
import { Button } from '@/components/ui/button';
import { OfficialWorkspaceProvider, platformLabels, useOfficialWorkspace } from './OfficialWorkspace';
import { activePublishStages, createPublishQueue, publishStageLabels, recoverPublishJobs, type PublishJob } from './publish-queue';
import { draftPreferences, removeLocalDraft } from './local-publish-drafts';
import { filterPublishJobs, type TaskFilter } from './publish-report';
import { readAppPreferences } from '@/contexts/AppPreferences';

type Queue = ReturnType<typeof createPublishQueue>;
const Context = createContext<{ queue: Queue; jobs: PublishJob[]; stop(): void } | null>(null);
export function usePublishQueue() { const value = useContext(Context); if (!value) throw Error('发布队列未初始化'); return value; }
export function WorkspaceSession() {
  return <OfficialWorkspaceProvider><PublishQueueProvider><Outlet /></PublishQueueProvider></OfficialWorkspaceProvider>;
}
function PublishQueueProvider({ children }: { children: ReactNode }) {
  const workspace = useOfficialWorkspace(), workspaceRef = useRef(workspace); workspaceRef.current = workspace;
  const [jobs, setJobs] = useState<PublishJob[]>([]), [queue, setQueue] = useState<Queue>();
  const token = getAuthToken(), userId = getUser()?.id;
  useEffect(() => {
    let disposed = false, storageWarning = false;
    const key = `matrix-publish-progress:${userId}`;
    const current = () => !disposed && !!token && getAuthToken() === token && getUser()?.id === userId;
    const assert = () => { if (!current()) throw Error('登录用户已切换，任务停止'); };
    const desktop = () => { assert(); if (!window.matrixDesktop) throw Error('请使用最新版矩效桌面版'); return window.matrixDesktop; };
    const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
    let initial: PublishJob[] = [];
    try { initial = recoverPublishJobs(JSON.parse(localStorage.getItem(key) || '[]')); } catch { /* Corrupt display history is not executable. */ }
    const previousStages = new Map(initial.map(job => [job.id, job.stage]));
    const runner = createPublishQueue({
      current, sleep,
      changed: next => {
        if (disposed) return;
        const changed = next.filter(job => previousStages.has(job.id) && previousStages.get(job.id) !== job.stage && ['confirmed','failed','unknown','attention'].includes(job.stage));
        for (const job of next) previousStages.set(job.id, job.stage);
        const preferences = readAppPreferences();
        if (changed.length && current() && preferences.publishAlerts) {
          toast.info(`${changed.length} 条发布任务有新结果，请查看任务记录`);
          if (preferences.desktopAlerts) void window.matrixDesktop?.systemSettings?.({ command:'notify', category:'publish' });
        }
        setJobs(next); workspaceRef.current.lockJobs(runner.running);
        try { localStorage.setItem(key, JSON.stringify(next)); } catch { if (!storageWarning) { storageWarning = true; toast.error('任务进度保存失败，当前会话仍可查看；请勿关闭软件，并核对操作回执。'); } }
      },
      prepare: async request => {
        assert();
        if (!await workspaceRef.current.openAccount(request.account, 'publish', false, undefined, undefined, true)) throw Error('无法准备官方发布页');
        let opened = false;
        for (let attempt = 0; attempt < 150; attempt++) {
          assert(); const publisher = workspaceRef.current.publisher(request.account.id, true);
          if (publisher) {
            try {
              publisher.input();
              if (!opened) { await publisher.open(request.media.mediaType, true); opened = true; await sleep(500); continue; }
              return publisher.input();
            } catch { /* Wait for the guest's DOM readiness; bounded below. */ }
          }
          await sleep(300);
        }
        throw Error('官方页面未就绪，请检查网络或登录状态');
      },
      upload: (input, media) => desktop().uploadMedia({ ...input, mediaType: media.mediaType, selectionId: media.id }),
      cover: (input, cover) => desktop().uploadMedia({ ...input, mediaType: 'image', selectionId: cover.id, coverIndex: cover.index }),
      fill: (input, form) => desktop().syncPublishForm({ ...input, command: 'fill', form }),
      progress: input => desktop().syncPublishForm({ ...input, command: 'progress' }),
      inspect: input => desktop().inspectPageAction({ ...input, kind: 'publish' }),
      submit: (entries, batchId) => desktop().submitPublishBatch(entries, batchId),
      completed: requests => { if (current() && !draftPreferences().retain) for (const request of requests) if (request.draft && request.draft.accountIds.every(id => requests.some(other => other.account.id === id && other.draft?.id === request.draft!.id))) removeLocalDraft(request.draft.id, request.draft.updatedAt); },
      followup: async (request, receipt) => {
        assert(); await axiosForBackend.post('/api/personal/tasks', { requestId: receipt.id, accountIds: [request.account.id], kind: 'comment', title: `作品追评：${request.config.title || '本次作品'}`.slice(0, 200), content: request.config.comment });
        window.dispatchEvent(new Event('matrix:personal-tasks-updated'));
      },
    }, initial);
    setJobs(initial); setQueue(runner);
    const unsubscribe = window.matrixDesktop?.onPublishProgress?.(event => { if (current()) runner.submittedProgress(event); });
    const refreshReceipts = async () => {
      if (!current() || !window.matrixDesktop) return;
      try { const result = await window.matrixDesktop.listPageActions(token!); if (current()) for (const receipt of [...(result.items || [])].reverse()) runner.operationReceipt(receipt); } catch { /* Keep last verified state on read failure. */ }
    };
    void refreshReceipts(); window.addEventListener('matrix:page-actions-updated', refreshReceipts);
    const cancel = () => {
      runner.stop();
      for (const id of new Set(runner.jobs.filter(job => activePublishStages.includes(job.stage)).map(job => job.batchId))) void window.matrixDesktop?.cancelPublishBatch?.(id, token || '');
    };
    const beforeUnload = (event: BeforeUnloadEvent) => { if (runner.running) { event.preventDefault(); event.returnValue = ''; } };
    const identityCheck = setInterval(() => { if (!current()) cancel(); }, 1000);
    window.addEventListener('beforeunload', beforeUnload);
    return () => { cancel(); disposed = true; runner.dispose(); unsubscribe?.(); clearInterval(identityCheck); window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('matrix:page-actions-updated', refreshReceipts); workspaceRef.current.lockJobs(false); };
  }, [token, userId]);
  if (!queue) return null;
  const stop = () => {
    queue.stop();
    for (const id of new Set(jobs.filter(job => activePublishStages.includes(job.stage)).map(job => job.batchId))) void window.matrixDesktop?.cancelPublishBatch(id, token || '').then(result => { if (result.error) toast.error(result.error); });
    toast.info('已请求停止后续任务；已经提交到平台的操作不会撤回');
  };
  return <Context.Provider value={{ queue, jobs, stop }}>{children}</Context.Provider>;
}
export function PublishProgressButton() {
  const { jobs, queue } = usePublishQueue(), navigate = useNavigate(), workspace = useOfficialWorkspace();
  if (!jobs.length) return null;
  const attention = jobs.filter(job => ['attention', 'unknown', 'interrupted', 'failed'].includes(job.stage)).length;
  return <Button size="sm" variant="outline" onClick={() => { workspace.hide(); navigate('/publish/tasks'); }}>发布进度{queue.running ? ` · ${jobs.filter(job => activePublishStages.includes(job.stage)).length} 个处理中` : attention ? ` · ${attention} 个待处理` : ''}</Button>;
}
export function PublishQueuePanel() {
  const { jobs, queue, stop } = usePublishQueue(), workspace = useOfficialWorkspace();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<TaskFilter>({}), [selected, setSelected] = useState<string[]>([]), [pin, setPin] = useState(false), [settings, setSettings] = useState(false);
  const change = (key: keyof TaskFilter, value: string) => setFilter(previous => ({ ...previous, [key]: value }));
  const visible = filterPublishJobs(jobs, filter).slice().sort((a, b) => (pin ? Number(activePublishStages.includes(b.stage)) - Number(activePublishStages.includes(a.stage)) : 0) || b.createdAt.localeCompare(a.createdAt));
  const chosen = visible.filter(job => selected.includes(job.id));
  const removeJobs = (items: PublishJob[]) => {
    if (queue.running || !items.length || !window.confirm(`只删除 ${items.length} 条矩效任务记录？不会下架或删除平台作品，不撤回评论；独立的操作回执和追评待办仍保留。`)) return;
    try { for (const job of items) queue.remove(job.id); setSelected([]); toast.success('任务记录已删除，平台作品未改动'); } catch (error) { toast.error((error as Error).message); }
  };
  const exportJobs = () => {
    const blob = new Blob([JSON.stringify({ scope: '当前用户本机筛选后的任务；非平台实时数据', exportedAt: new Date().toISOString(), tasks: visible }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = `矩效任务记录-${Date.now()}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const retryChosen = () => {
    if (!chosen.length || chosen.some(job => job.stage !== 'failed') || queue.running || busy) return;
    if (chosen.some(job => !queue.retryRequest(job.id))) { toast.info('部分素材已失效，请在对应任务的“更多”中逐条重新选择素材并重发'); return; }
    if (!window.confirm(`重新发送 ${chosen.length} 条明确失败的作品？将重新上传并逐组确认，原记录保留。`)) return;
    try { queue.startMany(chosen.map(job => [queue.retryRequest(job.id)!])); setSelected([]); workspace.hide(); } catch (error) { toast.error((error as Error).message); }
  };
  const currentAccount = async (job: PublishJob): Promise<PlatformAccount> => {
    const response = await axiosForBackend.get('/api/platform/accounts', { params: { page: 1, pageSize: 100 } });
    const account = (response.data?.data?.items || []).find((account: PlatformAccount) => account.id === job.accountId && account.platform === job.platform);
    if (!account?.connectorSessionId) throw Error('该账号已解绑，请先重新绑定账号'); return account;
  };
  const operate = async (job: PublishJob, kind: 'comments' | 'withdraw') => {
    if (busy) return; setBusy(true);
    try {
      const account = await currentAccount(job);
      if (await workspace.openAccount(account, kind, false, kind === 'comments' ? job.config?.comment || '' : undefined)) {
        workspace.linkTask(job.accountId, { id: job.id, title: job.title, kind });
        toast.info(`请找到作品「${job.title || '未填写标题'}」核对后操作；${kind === 'comments' ? '追评' : '下架'}结果独立记录`);
      }
    } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); }
  };
  const retry = async (job: PublishJob) => {
    if (busy || queue.running || !window.confirm('重新发送这条明确失败的作品？会重新上传和提交，原失败记录保留。')) return;
    setBusy(true);
    try {
      const previous = queue.retryRequest(job.id);
      if (previous) queue.retry(job.id);
      else {
        if (!job.config || !job.mediaType || !window.matrixDesktop) throw Error('缺少发布配置，请返回发布页重新选择素材和账号');
        const account = await currentAccount(job), result = await window.matrixDesktop.chooseMedia(job.mediaType);
        if (result.error) throw Error(result.error); if (!result.selection) return;
        queue.retry(job.id, { account, config: job.config, media: result.selection });
      }
      workspace.hide(); toast.success('重试已加入队列，原失败记录保持不变');
    } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); }
  };
  const time = (value?: string) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
  return <section className="matrix-task-records" data-publish-progress>
    <div className="matrix-task-filters">
      <input aria-label="搜索任务内容" placeholder="搜索标题、描述、文件名" value={filter.text || ''} onChange={event => change('text', event.target.value)} />
      <select aria-label="筛选平台" value={filter.platform || ''} onChange={event => change('platform', event.target.value)}><option value="">筛选平台</option>{Object.entries(platformLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <input aria-label="搜索任务账号" placeholder="搜索账号名称、矩效 ID" value={filter.account || ''} onChange={event => change('account', event.target.value)} />
      <select aria-label="请选择状态" value={filter.stage || ''} onChange={event => change('stage', event.target.value)}><option value="">请选择状态</option>{Object.entries(publishStageLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <select aria-label="作品类型" value={filter.mediaType || ''} onChange={event => change('mediaType', event.target.value)}><option value="">作品类型</option><option value="video">视频</option><option value="image">图文</option></select>
      <div className="matrix-task-date"><input aria-label="开始日期" type="date" value={filter.start || ''} max={filter.end} onChange={event => change('start', event.target.value)} /><span>→</span><input aria-label="结束日期" type="date" value={filter.end || ''} min={filter.start} onChange={event => change('end', event.target.value)} /></div>
      <select aria-label="批次筛选" value={filter.batch || ''} onChange={event => change('batch', event.target.value)}><option value="">批次筛选</option>{[...new Set(jobs.map(job => job.batchId))].reverse().map(id => <option key={id} value={id}>{time(jobs.find(job => job.batchId === id)?.createdAt)} · {id.slice(0, 6)}</option>)}</select>
      <label className="matrix-task-pin"><input type="checkbox" checked={pin} onChange={event => setPin(event.target.checked)} />置顶[正在发布]</label>
    </div>
    <div className="matrix-task-list">
      {!visible.length && <div className="matrix-task-empty">{jobs.length ? '没有符合筛选条件的任务' : '暂无一键发布任务，点击发布后将在这里显示具体进度。'}</div>}
      {visible.map(job => {
        const started = job.history.find(step => step.stage === 'preparing')?.at;
        const finished = job.history.find(step => ['confirmed', 'failed', 'cancelled', 'interrupted'].includes(step.stage))?.at;
        const duration = started && finished ? Math.max(0, Math.round((Date.parse(finished) - Date.parse(started)) / 1000)) : undefined;
        const guest = workspace.tabs.find(tab => tab.background && tab.accountId === job.accountId);
        return <article key={job.id} data-publish-job={job.id} className="matrix-task-row">
          <input type="checkbox" aria-label={`选择任务 ${job.title || job.id}`} checked={selected.includes(job.id)} onChange={event => setSelected(ids => event.target.checked ? [...ids, job.id] : ids.filter(id => id !== job.id))} />
          <div className="matrix-task-media" title={job.files.join('、')}><span>{job.mediaType === 'image' ? '▧' : '▷'}</span><small>{job.mediaType === 'image' ? '图文' : '视频'} · {job.files.length} 个文件</small></div>
          <div className="matrix-task-identity"><div className="matrix-task-account"><span className={`matrix-task-avatar platform-${job.platform}`}>{job.nickname.slice(0, 1)}</span><div>{job.nickname}<small>{platformLabels[job.platform]} · 矩效 ID {job.accountId.slice(0, 8)}</small></div></div><p>{job.title || '未填写标题'}</p></div>
          <div className="matrix-task-status"><p>发布：<span className={job.stage === 'confirmed' ? 'is-success' : job.stage === 'failed' ? 'is-failed' : 'is-pending'}>● {publishStageLabels[job.stage]}</span></p><p>追评：{job.followup ? ({ pending: '待发表', save_failed: '待办保存失败', confirmed: '官方提示成功', failed: '官方提示失败', unknown: '结果待核对' }[job.followup.status]) : job.config?.comment ? '等待作品发布' : '—'}</p>{job.withdrawal && <p>下架：{({ confirmed: '下架 / 私密成功', failed: '下架失败', unknown: '结果待核对' }[job.withdrawal.status])}</p>}{typeof job.uploadPercent === 'number' && job.stage === 'uploading' && <div>{job.uploadPercent}%<progress aria-label={`${job.nickname}官方上传进度`} max={100} value={job.uploadPercent} /></div>}</div>
          <div className="matrix-task-timing"><p>创建：{time(job.createdAt)}</p><p>执行：{time(started)}</p><p>完成：{duration === undefined ? '—' : `用时 ${Math.floor(duration / 60)}分${duration % 60}秒`}</p></div>
          <div className="matrix-task-actions"><div><span>{job.config?.schedule?.mode === 'local' ? '本机定时' : job.config?.schedule?.mode === 'official' ? '平台定时' : '即时'}</span> <span>{job.mediaType === 'image' ? '图文' : '视频'}</span></div><p title={job.files.join('、')}>文件：{job.files.join('、')}</p>
          <details><summary>更多⌄</summary><div>
            {job.stage === 'failed' && <Button size="sm" disabled={busy || queue.running} onClick={() => void retry(job)}>重新发送作品</Button>}
            {job.stage === 'confirmed' && <>{job.config?.comment && job.followup?.status !== 'confirmed' && <Button size="sm" variant="outline" disabled={busy || queue.running} onClick={() => void operate(job, 'comments')}>处理追评（官方核对）</Button>}<Button size="sm" variant="outline" disabled={busy || queue.running || job.withdrawal?.status === 'confirmed'} onClick={() => void operate(job, 'withdraw')}>下架作品（官方核对）</Button></>}
            <Button size="sm" variant="ghost" disabled={busy || activePublishStages.includes(job.stage) || queue.running} onClick={() => removeJobs([job])}>删除任务记录</Button>
            {job.followup && <Button size="sm" variant="ghost" onClick={() => navigate('/engage/batch-tasks')}>查看追评待办</Button>}
            {guest && <Button size="sm" variant="outline" onClick={() => workspace.select(guest.id)}>查看官方页面</Button>}
          </div></details></div>
          <details className="matrix-task-details"><summary>详情 · {job.message}</summary><p>{job.followup?.message}</p><p>{job.withdrawal?.message}</p><ol>{job.history.map((step, index) => <li key={index}>{time(step.at)} · {publishStageLabels[step.stage]} · {step.message}</li>)}</ol></details>
          {queue.canResume(job.batchId) && <div className="matrix-task-resume"><Button size="sm" variant="outline" onClick={() => { if (window.confirm('结束本批次未提交任务？不会删除或撤回官方内容。')) queue.discard(job.batchId); }}>结束未提交任务</Button><Button size="sm" onClick={() => { try { queue.resume(job.batchId); } catch (error) { toast.error((error as Error).message); } }}>已补全，继续本批次</Button></div>}
        </article>;
      })}
    </div>
    <footer className="matrix-task-footer"><Button variant="outline" disabled={!chosen.length || chosen.some(job => job.stage !== 'failed') || busy || queue.running} onClick={retryChosen}>批量重发</Button><Button variant="outline" disabled={!chosen.length || chosen.some(job => activePublishStages.includes(job.stage)) || busy || queue.running} onClick={() => removeJobs(chosen)}>批量删除</Button><Button variant="outline" disabled={!queue.running} onClick={stop}>停止后续任务</Button><Button variant="outline" disabled={!visible.length} onClick={exportJobs}>导出记录</Button><span>已选择：{chosen.length}</span><button className="matrix-task-link" onClick={() => setSelected(chosen.length === visible.length ? [] : visible.map(job => job.id))}>{chosen.length && chosen.length === visible.length ? '取消全选' : '全选'}</button><span className="matrix-task-footer-spacer" /><Button variant="outline" disabled={!visible.length || queue.running || busy || visible.some(job => activePublishStages.includes(job.stage))} onClick={() => removeJobs(visible)}>清空筛选记录</Button><Button variant="outline" onClick={() => setSettings(value => !value)}>任务设置</Button></footer>
    {settings && <div className="matrix-task-settings"><strong>任务执行规则</strong><p>后台逐组发布，切换模块不停止；关闭软件会中断，重启后不会自动重发。每组提交前仍需最终确认。</p><p>仅明确失败可重发。暂不提供运行中修改时间或暂停恢复，以免重复提交。删除记录不删除平台作品，追评和下架分别核对。</p><Button variant="outline" onClick={() => setSettings(false)}>关闭说明</Button></div>}
  </section>;
}
