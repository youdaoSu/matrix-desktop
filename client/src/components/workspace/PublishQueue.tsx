import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import type { PlatformAccount } from '@shared/api.interface';
import { toast } from 'sonner';
import { axiosForBackend, getAuthToken, getUser } from '@/api';
import { Button } from '@/components/ui/button';
import { OfficialWorkspaceProvider, platformLabels, useOfficialWorkspace } from './OfficialWorkspace';
import { activePublishStages, canRetryPublishJob, canStartPausedJob, createPublishQueue, publishStageLabels, publishOutcomeLabel, publishReviewLabel, recoverPublishJobs, type PublishJob, type PublishRequest } from './publish-queue';
import { draftPreferences, removeLocalDraft } from './local-publish-drafts';
import { filterPublishJobs, isTaskFilter, type TaskFilter } from './publish-report';
import { uiBoolean, useWorkspacePreference } from './WorkspaceUiState';
import { readAppPreferences } from '@/contexts/AppPreferences';
import { PublishEditorStateProvider } from './PublishEditorState';
import { PublishTaskAvatar, PublishTaskMedia } from './PublishTaskAssets';
import { PublishTaskDetail } from './PublishTaskDetail';
import { publishJobTiming } from './publish-timing';
import { retryPublishMaterial } from './publish-retry-material';
import { bilibiliCreationDeclarations, bilibiliDeclarationValue } from '@shared/publish-platform-fields';
import { PublishTaskStageNote } from './PublishStepProgress';
import { PublishErrorFeedback } from './PublishErrorFeedback';
import { PublishResultResolution } from './PublishResultResolution';
import { boundedAccountCheck } from './async-account-checks';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { requestPublishFollowup } from './publish-followup';
import { supportsPublishFollowup } from '@shared/publish-followup-capabilities';
import { PublishFollowupEditor } from './PublishFollowupEditor';
import { createReferenceCollection } from './publish-reference-collection';
import { createPublishResultChecks } from './publish-result-checks';
import { verifyPublishJob } from './verify-publish-job';

type Queue = ReturnType<typeof createPublishQueue>;
const Context = createContext<{ queue: Queue; jobs: PublishJob[]; stop(): void } | null>(null);
export function usePublishQueue() { const value = useContext(Context); if (!value) throw Error('发布队列未初始化'); return value; }
export function WorkspaceSession() {
  return <PublishEditorStateProvider><OfficialWorkspaceProvider><PublishQueueProvider><Outlet /></PublishQueueProvider></OfficialWorkspaceProvider></PublishEditorStateProvider>;
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
    const desktop = () => { assert(); if (!window.matrixDesktop) throw Error('请使用最新版远效桌面版'); return window.matrixDesktop; };
    const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
    let initial: PublishJob[] = [];
    try { initial = recoverPublishJobs(JSON.parse(localStorage.getItem(key) || '[]')); } catch { /* Corrupt display history is not executable. */ }
    const previousStages = new Map(initial.map(job => [job.id, job.stage]));
    const runner = createPublishQueue({
      current, sleep,
      remember: request => desktop().rememberPublishMedia({ accessToken: token!, selectionId: request.media.id, covers: request.config.covers || [] }),
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
      prepare: async (request, signal) => {
        const check = () => { assert(); if (signal?.aborted) throw Error('本次发布准备已停止'); };
        check();
        if (!await workspaceRef.current.openAccount(request.account, 'publish', false, undefined, undefined, true, signal)) throw Error('无法准备官方发布页');
        let prepared: ReturnType<typeof workspace.publisher>;
        for (let attempt = 0; attempt < 150; attempt++) {
          check(); const publisher = workspaceRef.current.publisher(request.account.id, true);
          if (publisher) {
            try {
              publisher.input();
              prepared = publisher; break;
            } catch { /* Wait for the guest's DOM readiness; bounded below. */ }
          }
          await sleep(300);
        }
        if (!prepared) throw Error('官方页面未就绪，请检查网络或登录状态');
        // open() owns its bounded editor wait. Do not swallow its failure and
        // navigate 150 times, which used to multiply the native wait into minutes.
        check(); await prepared.open(request.media.mediaType, true, signal); check();
        await sleep(500);
        for (let attempt = 0; attempt < 100; attempt++) {
          check();
          try { const ready = workspaceRef.current.publisher(request.account.id, true); if (ready) return ready.input(); } catch { /* Wait only; do not navigate again. */ }
          await sleep(100);
        }
        throw Error('官方发布连接尚未准备好，已停止本次准备');
      },
      upload: (input, media) => desktop().uploadMedia({ ...input, mediaType: media.mediaType, selectionId: media.id }),
      cover: (input, cover) => desktop().uploadMedia({ ...input, mediaType: 'image', selectionId: cover.id, coverIndex: cover.index }),
      fill: (input, form) => desktop().syncPublishForm({ ...input, command: 'fill', form }),
      progress: input => desktop().syncPublishForm({ ...input, command: 'progress' }),
      describe: input => desktop().syncPublishForm({ ...input, command: 'describe' }),
      inspect: input => desktop().inspectPageAction({ ...input, kind: 'publish' }),
      verifyManual:async job=>{
        const result=await verifyPublishJob(desktop(),token!,job);
        assert();if(result.error)throw Error(result.error);if(result.receipt)runner.operationReceipt(result.receipt);
      },
      submit: async (entries, batchId) => {
        const result = await desktop().submitPublishBatch(entries, batchId);
        // Apply the structured submission response immediately. A separate
        // work-list check may take 55s and must not keep all retries busy.
        const pending = (result.results || []).flatMap(item => item.receipt?.status === 'unknown' ? [item.receipt] : []);
        if(current())referenceCollection.enqueue((result.results||[]).flatMap(item=>item.receipt?[item.receipt]:[]));
        if (pending.length && current()) setTimeout(() => { if (current()) resultChecks.enqueue(pending); }, 0);
        return result;
      },
      completedDraft: reference => { if (current() && reference.ownerId === userId && reference.retain === false && draftPreferences().retain === false) removeLocalDraft(reference.id, reference.updatedAt, reference.revisionId); },
      followup: async (request, receipt) => {
        return requestPublishFollowup(request,receipt,{accessToken:token!,assertCurrent:assert,desktop,saveTask:input=>axiosForBackend.post('/api/personal/tasks',input),updated:kind=>window.dispatchEvent(new Event(kind==='receipts'?'matrix:page-actions-updated':'matrix:personal-tasks-updated'))});
      },
    }, initial);
    setJobs(initial); setQueue(runner);
    const referenceCollection=createReferenceCollection({current,collect:receipt=>desktop().collectPublishReference({accessToken:token!,receiptId:receipt.id}),apply:receipt=>runner.operationReceipt(receipt)});
    const resultChecks = createPublishResultChecks({current,job:id=>runner.jobs.find(job=>job.id===id),verify:receipt=>{
      const job=runner.jobs.find(job=>job.id===receipt.taskId);
      if(!job)throw Error('原任务已不存在，未读取其他作品');
      return verifyPublishJob(desktop(),token!,job,receipt);
    },apply:receipt=>{runner.operationReceipt(receipt);referenceCollection.enqueue([receipt]);},failed:(id,attemptId,message)=>runner.verificationFailed(id,attemptId,message)});
    const refreshReceipts = async () => {
      if (!current() || !window.matrixDesktop) return;
      try {
        const result = await window.matrixDesktop.listPageActions(token!);
        if (current()) for (const receipt of [...(result.items || [])].reverse()) runner.operationReceipt(receipt);
        if(current()&&window.matrixDesktop.collectPublishReference)referenceCollection.enqueue((result.items||[]).filter(receipt=>runner.jobs.some(job=>job.id===receipt.taskId&&(!job.attemptId||job.attemptId===receipt.attemptId))));
        if(current())resultChecks.enqueue(result.items || []);
      } catch { /* Keep last verified state on read failure. */ }
    };
    const unsubscribe = window.matrixDesktop?.onPublishProgress?.(event => {
      if (!current()) return;
      runner.submittedProgress(event);
      // Read the owned, durable receipt immediately for this completed item;
      // a status-only notification cannot itself prove publication success.
      if (['confirmed','failed'].includes(event.status)) void refreshReceipts();
    });
    void refreshReceipts(); window.addEventListener('matrix:page-actions-updated', refreshReceipts);
    let reviewTimer:ReturnType<typeof setTimeout>;
    const reviewPending=async()=>{
      if(!current()||!window.matrixDesktop?.oneClickComments)return;
      let next=60000;
      try{
        if(!runner.running&&!runner.followupsRunning){
          const reply=await desktop().oneClickComments({accessToken:token!,command:'auto-review'});
          if(!current())return;
          const review=reply.result as {checked?:string;nextInMs?:number}|undefined;
          if(review?.checked==='comment')window.dispatchEvent(new Event('matrix:comment-review-updated'));
          if(review?.checked==='followup'||review?.checked==='page')await refreshReceipts();
          if(Number.isFinite(review?.nextInMs))next=Math.max(3000,Math.min(60000,review!.nextInMs!));
        }
      }catch{/* Keep the last result and allow the next authenticated tick. */}
      if(current())reviewTimer=setTimeout(reviewPending,next);
    };
    reviewTimer=setTimeout(reviewPending,5000);
    const referenceBindingUpdated=(event:Event)=>{
      const detail=(event as CustomEvent<{ownerId?:string;account?:{id?:string;connectorSessionId?:string;nativeAccountKey?:string}}>).detail,account=detail?.account;
      if(!current()||detail?.ownerId!==userId||!account?.id||!account.connectorSessionId||!account.nativeAccountKey)return;
      referenceCollection.bindingUpdated(account.id,JSON.stringify([account.connectorSessionId,account.nativeAccountKey]));
      void refreshReceipts();
    };
    window.addEventListener('matrix:account-profile-updated',referenceBindingUpdated);
    const cancel = () => {
      runner.stop();
      for (const id of new Set(runner.jobs.filter(job => activePublishStages.includes(job.stage)).map(job => job.batchId))) void window.matrixDesktop?.cancelPublishBatch?.(id, token || '');
    };
    const beforeUnload = (event: BeforeUnloadEvent) => { if (runner.running||runner.followupsRunning) { event.preventDefault(); event.returnValue = ''; } };
    const identityCheck = setInterval(() => { if (!current()) cancel(); }, 1000);
    window.addEventListener('beforeunload', beforeUnload);
    return () => { cancel(); disposed = true; clearTimeout(reviewTimer); resultChecks.dispose(); referenceCollection.dispose(); runner.dispose(); unsubscribe?.(); clearInterval(identityCheck); window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('matrix:page-actions-updated', refreshReceipts);window.removeEventListener('matrix:account-profile-updated',referenceBindingUpdated); workspaceRef.current.lockJobs(false); };
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
  const paused = jobs.filter(canStartPausedJob).length;
  return <Button size="sm" variant="outline" onClick={() => { workspace.hide(); navigate('/publish/tasks'); }}>发布进度{queue.running ? ` · ${jobs.filter(job => activePublishStages.includes(job.stage)).length} 个处理中` : queue.followupsRunning ? ' · 追评处理中' : attention ? ` · ${attention} 个待处理` : paused ? ` · ${paused} 个已暂停` : ''}</Button>;
}
export function PublishQueuePanel() {
  const { jobs, queue, stop } = usePublishQueue(), workspace = useOfficialWorkspace();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [detailId, setDetailId] = useState<string>();
  const detailButton = useRef<HTMLButtonElement | null>(null);
  const retryLocks = useRef(new Set<string>());
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const followupLocks=useRef(new Set<string>());
  const [followupActions,setFollowupActions]=useState<Set<string>>(new Set());
  const [followupErrors,setFollowupErrors]=useState<Record<string,string>>({});
  const [editingFollowup,setEditingFollowup]=useState<PublishJob|undefined>(undefined);
  const [managingFollowup,setManagingFollowup]=useState<{job:PublishJob;operation:'unpin'|'delete';owner:string|undefined}>();
  const [retryDeclarations,setRetryDeclarations]=useState<Record<string,string>>({});
  const settingsOwner=getUser()?.id;
  useEffect(()=>{setRetryDeclarations({});setManagingFollowup(undefined);},[settingsOwner]);
  const declarationKey=(job:PublishJob)=>`${job.id}:${job.attemptId || 'legacy'}`;
  const retryDeclaration=(job:PublishJob)=>bilibiliDeclarationValue(job.config || {options:{}}, retryDeclarations[declarationKey(job)] ?? job.config?.extras?.['创作声明']);
  const verificationLocks=useRef(new Set<string>());
  const [verifying,setVerifying]=useState<Set<string>>(new Set());
  const retryBlocked = (job: PublishJob) => retrying.has(job.id) || Boolean(queue.activeRetry(job.id)) || queue.isSubmissionPending(job.id);
  const [filter, setFilter] = useWorkspacePreference<TaskFilter>('publish.tasks.filter', {}, isTaskFilter);
  const [pin, setPin] = useWorkspacePreference('publish.tasks.pinRunning', false, uiBoolean);
  const [selected, setSelected] = useState<string[]>([]), [settings, setSettings] = useState(false);
  const [confirmation, setConfirmation] = useState<{ kind: 'remove' | 'retry' | 'discard'; items: PublishJob[]; batchId?: string }>();
  const refreshAccounts = workspace.refreshAccounts;
  useEffect(() => { void refreshAccounts(); }, [refreshAccounts]);
  const change = (key: keyof TaskFilter, value: string) => setFilter(previous => ({ ...previous, [key]: value }));
  const visible = filterPublishJobs(jobs, filter).slice().sort((a, b) => (pin ? Number(activePublishStages.includes(b.stage)) - Number(activePublishStages.includes(a.stage)) : 0) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const chosen = visible.filter(job => selected.includes(job.id));
  const removeJobs = (items: PublishJob[], approved = false) => {
    if (!items.length || items.some(job => activePublishStages.includes(job.stage) || retryBlocked(job))) return;
    if(items.some(job=>job.followup?.status==='running'||queue.hasFollowupOperation(job.id))){toast.info('这条记录的追评仍在执行，请等原评论回执返回后再删除；其他记录不受影响');return;}
    if (!approved) { setConfirmation({ kind: 'remove', items }); return; }
    try { for (const job of items) queue.remove(job.id); setSelected([]); toast.success('任务记录已删除，平台作品未改动'); } catch (error) { toast.error((error as Error).message); }
  };
  const exportJobs = () => {
    const blob = new Blob([JSON.stringify({ scope: '当前用户本机筛选后的任务；非平台实时数据', exportedAt: new Date().toISOString(), tasks: visible }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = `远效任务记录-${Date.now()}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const retryChosen = async (items = chosen, approved = false) => {
    if (!items.length || items.some(job => !canRetryPublishJob(job) || retryBlocked(job) || queue.hasRetainedPreparation(job.id))) return;
    if (!approved) { setConfirmation({ kind: 'retry', items }); return; }
    for (const job of items) await retry(job);
    setSelected([]);
  };
  const currentAccount = async (job: PublishJob): Promise<PlatformAccount> => {
    const response = await axiosForBackend.get('/api/platform/accounts', { params: { page: 1, pageSize: 100 } });
    const account = (response.data?.data?.items || []).find((account: PlatformAccount) => account.id === job.accountId && account.platform === job.platform);
    if (!account?.connectorSessionId) throw Error('该账号已解绑，请先重新绑定账号'); return account;
  };
  const followupAction=async(job:PublishJob,operation:'start'|'verify'|'pin'|'unpin'|'delete')=>{
    if(followupLocks.current.has(job.id)||job.followup?.status==='running')return;
    const token=getAuthToken(),owner=getUser()?.id;
    const current=()=>getAuthToken()===token&&getUser()?.id===owner;
    let release:(()=>void)|undefined;
    followupLocks.current.add(job.id);setFollowupActions(previous=>new Set(previous).add(job.id));setFollowupErrors(previous=>({...previous,[job.id]:''}));
    try{
      if(operation!=='verify'&&publishReviewLabel(job))throw Error('作品已提交，待审核通过后再处理追评或置顶；不会重发作品');
      if(!supportsPublishFollowup(job.platform)||job.stage!=='confirmed'||!job.receiptId||!token||!window.matrixDesktop?.publishFollowup)throw Error('需要新版桌面端、成功发布回执和原绑定账号，未发送追评');
      if(['unpin','delete'].includes(operation)&&(!job.followup?.commentId||job.platform!=='bilibili'||job.followup.commentDeleted))throw Error('缺少可管理的原B站评论，未操作');
      release=queue.trackFollowupOperation(job);
      const account=await boundedAccountCheck(()=>currentAccount(job),12000,'读取追评所属账号超时，尚未开始发送');if(!current())return;
      const result=await boundedAccountCheck(()=>window.matrixDesktop!.publishFollowup({accessToken:token,accountId:account.id,receiptId:job.receiptId!,requestId:operation==='verify'?undefined:crypto.randomUUID(),operation,...(['unpin','delete'].includes(operation)?{expectedCommentId:job.followup?.commentId,expectedComment:job.followup?.commentText??job.config?.comment?.trim()}:{}),comment:job.config?.comment,pin:job.config?.pinComment===true}),60000,'追评连接等待超时，请只核对原评论；不要重发作品或重复追评');
      if(!current())return;
      if(result.receipt){const child=result.receipt;if(child.kind!=='comments'||child.followupOf!==job.receiptId||child.taskId!==job.id||child.attemptId!==job.attemptId||child.accountId!==job.accountId||child.platform!==job.platform)throw Error('收到的追评回执不属于这条原作品，未套用');queue.operationReceipt(child);}
      window.dispatchEvent(new Event('matrix:page-actions-updated'));
      if(result.error)throw Error(result.error);
      if(result.pending)setFollowupErrors(previous=>({...previous,[job.id]:result.message||'尚未取得准确作品ID，未发送追评'}));
    }catch(error){if(current())setFollowupErrors(previous=>({...previous,[job.id]:error instanceof Error?error.message:'追评连接失败，请核对原评论，勿重复发送'}));}
    finally{release?.();followupLocks.current.delete(job.id);if(current())setFollowupActions(previous=>{const next=new Set(previous);next.delete(job.id);return next;});}
  };
  const operate = async (job: PublishJob, kind: 'comments' | 'withdraw') => {
    if (busy) return; setBusy(true);
    try {
      if(kind==='comments'&&publishReviewLabel(job))throw Error('作品已提交，审核尚未通过，未发送追评');
      const account = await currentAccount(job);
      if (await workspace.openAccount(account, kind, false, kind === 'comments' ? job.config?.comment || '' : undefined)) {
        workspace.linkTask(job.accountId, { id: job.id, title: job.title, kind,attemptId:job.attemptId });
        toast.info(`请找到作品「${job.title || '未填写标题'}」核对后操作；${kind === 'comments' ? '追评' : '下架'}结果独立记录`);
      }
    } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); }
  };
  const retryMaterial = async (job: PublishJob, automaticCover = false): Promise<PublishRequest> => {
    if (!canRetryPublishJob(job) && !canStartPausedJob(job)) throw Error('提交结果不确定，不能直接重发，请先核对官方结果');
    const token = getAuthToken(), userId = getUser()?.id, desktop = window.matrixDesktop;
    if (!token || !userId || !desktop) throw Error('请使用已登录的最新版远效桌面版');
    const assertCurrent = () => { if (getAuthToken() !== token || getUser()?.id !== userId) throw Error('登录用户已切换，未重发'); };
    const account = await currentAccount(job);
    assertCurrent();
    const request = await retryPublishMaterial(job, { account, assertCurrent, previous: queue.retryRequest(job.id),
      restore: (recoveryId, skipCovers) => desktop.restorePublishMedia({ accessToken: token, recoveryId, skipCovers }),
      choose: type => desktop.chooseMedia(type), notify: message => toast.info(message),
    }, { automaticCover });
    // Account sessions may be rebound while a native picker is open.
    const fresh = await currentAccount(job);
    assertCurrent();
    if (fresh.connectorSessionId !== account.connectorSessionId) throw Error('账号登录会话已变化，请重新点击原记录重发');
    return { ...request, account: fresh };
  };
  const beginPaused = async (job: PublishJob) => {
    if (!canStartPausedJob(job) || retryLocks.current.has(job.id)) return;
    retryLocks.current.add(job.id); setRetrying(new Set(retryLocks.current));
    try {
      const request = await retryMaterial(job);
      if (queue.jobs.find(item => item.id === job.id)?.attemptId !== job.attemptId) throw Error('任务已变化，未启动旧记录');
      queue.startPaused(job.id, request); workspace.hide(); toast.success('已开始本条暂停任务；其他任务保持原状态');
    } catch (error) { toast.error((error as Error).message); }
    finally { retryLocks.current.delete(job.id); setRetrying(new Set(retryLocks.current)); }
  };
  const retry = async (job: PublishJob, automaticCover = false) => {
    if (retryLocks.current.has(job.id) || queue.activeRetry(job.id)) return;
    if (queue.hasRetainedPreparation(job.id)) { toast.info('该条素材已经交付，请继续剩余步骤，不需要重传'); return; }
    retryLocks.current.add(job.id); setRetrying(new Set(retryLocks.current));
    try {
      const declaration=retryDeclaration(job);
      if(job.platform==='bilibili'&&!bilibiliCreationDeclarations.includes(declaration))throw Error('请先在本条记录选择真实的B站创作声明；未恢复素材或上传');
      const prepared=job.platform==='bilibili'&&job.config?{...job,config:{...job.config,extras:{...job.config.extras,创作声明:declaration}}}:job;
      const request=await retryMaterial(prepared, automaticCover);
      if(queue.jobs.find(item=>item.id===job.id)?.attemptId!==job.attemptId)throw Error('本条记录已进入另一次执行，旧重发操作未套用');
      queue.retry(job.id, request);
      workspace.hide(); toast.success('重发已入队，将更新原来的这条记录');
    } catch (error) { toast.error(`${job.nickname}：${(error as Error).message}`); } finally { retryLocks.current.delete(job.id); setRetrying(new Set(retryLocks.current)); }
  };
  const verifyResult = async (job: PublishJob) => {
    if(verificationLocks.current.has(job.id))return;
    verificationLocks.current.add(job.id);setVerifying(new Set(verificationLocks.current));
    const token=getAuthToken(),userId=getUser()?.id;
    try {
      if (!window.matrixDesktop || !token) throw Error('请使用已登录的远效桌面版');
      if(!job.receiptId&&(!job.attemptId||!['douyin','xiaohongshu'].includes(job.platform)))throw Error('缺少可核对的原尝试信息');
      if(!job.receiptId)queue.beginManualVerification(job.id,job.attemptId!);
      const result = await boundedAccountCheck(()=>verifyPublishJob(window.matrixDesktop!,token,job));
      if(getAuthToken()!==token||getUser()?.id!==userId)return;
      if (result.error) throw Error(result.error);
      if (result.receipt) {queue.operationReceipt(result.receipt);window.dispatchEvent(new Event('matrix:page-actions-updated'));}
      if (result.receipt?.status === 'confirmed') toast.success('发布成功');
      else if(result.receipt?.status==='failed')toast.error(result.receipt.message);
      else toast.info(result.receipt?.verification?.message||'本次未能确认官方结果，原记录保留，未重新发布');
    } catch (error) { if(getAuthToken()===token&&getUser()?.id===userId){queue.verificationFailed(job.id,job.attemptId,(error as Error).message);toast.error((error as Error).message);} } finally { verificationLocks.current.delete(job.id);setVerifying(new Set(verificationLocks.current)); }
  };
  const continueJob = (job: PublishJob) => {
    try { queue.continuePreparation(job.id); workspace.hide(); toast.info('只继续本条记录剩余的准备步骤，不重新上传视频；已完成的步骤不重做'); }
    catch (error) { toast.error((error as Error).message); }
  };
  const time = (value?: string) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
  return <section className="matrix-task-records" data-publish-progress>
    <div className="matrix-task-filters">
      <input aria-label="搜索任务内容" placeholder="搜索标题、描述、文件名" value={filter.text || ''} onChange={event => change('text', event.target.value)} />
      <select aria-label="筛选平台" value={filter.platform || ''} onChange={event => change('platform', event.target.value)}><option value="">筛选平台</option>{Object.entries(platformLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <input aria-label="搜索任务账号" placeholder="搜索账号名称、远效 ID" value={filter.account || ''} onChange={event => change('account', event.target.value)} />
      <select aria-label="请选择状态" value={filter.stage || ''} onChange={event => change('stage', event.target.value)}><option value="">请选择状态</option>{Object.entries(publishStageLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <select aria-label="作品类型" value={filter.mediaType || ''} onChange={event => change('mediaType', event.target.value)}><option value="">作品类型</option><option value="video">视频</option><option value="image">图文</option></select>
      <div className="matrix-task-date"><input aria-label="开始日期" type="date" value={filter.start || ''} max={filter.end} onChange={event => change('start', event.target.value)} /><span>→</span><input aria-label="结束日期" type="date" value={filter.end || ''} min={filter.start} onChange={event => change('end', event.target.value)} /></div>
      <select aria-label="批次筛选" value={filter.batch || ''} onChange={event => change('batch', event.target.value)}><option value="">批次筛选</option>{[...new Set(jobs.map(job => job.batchId))].reverse().map(id => <option key={id} value={id}>{jobs.find(job => job.batchId === id)?.batchName || time(jobs.find(job => job.batchId === id)?.createdAt)} · {id.slice(0, 6)}</option>)}</select>
      <label className="matrix-task-pin"><input type="checkbox" checked={pin} onChange={event => setPin(event.target.checked)} />置顶[正在发布]</label>
    </div>
    <div className="matrix-task-list">
      {!visible.length && <div className="matrix-task-empty">{jobs.length ? '没有符合筛选条件的任务' : '暂无一键发布任务，点击发布后将在这里显示具体进度。'}</div>}
      {visible.map(job => {
        const { started, duration, includesQueue } = publishJobTiming(job);
        const guest = workspace.tabs.find(tab => tab.background && tab.accountId === job.accountId);
        const retainedPreparation = queue.hasRetainedPreparation(job.id);
        return <article key={job.id} data-publish-job={job.id} className="matrix-task-row">
          <input type="checkbox" aria-label={`选择任务 ${job.title || job.id}`} checked={selected.includes(job.id)} onChange={event => setSelected(ids => event.target.checked ? [...ids, job.id] : ids.filter(id => id !== job.id))} />
          <PublishTaskMedia key={`${job.id}:${job.thumbnail?.length || 0}`} thumbnail={job.thumbnail} type={job.mediaType} count={job.files.length} title={job.title} />
          <div className="matrix-task-identity"><div className="matrix-task-account"><PublishTaskAvatar nickname={job.nickname} platform={job.platform} url={workspace.accounts.find(account => account.id === job.accountId)?.avatarUrl || job.avatarUrl} /><div>{workspace.accounts.find(account=>account.id===job.accountId)?.nickname || job.nickname}<small>{platformLabels[job.platform]} · 远效 ID {job.accountId.slice(0, 8)}</small></div></div><p>{job.title || '未填写标题'}</p></div>
          <div className="matrix-task-status">
            <p>发布：<span className={job.stage === 'confirmed' ? 'is-success' : job.stage === 'failed' ? 'is-failed' : 'is-pending'}>● {['preparing','uploading','filling','reviewing','confirming','submitting'].includes(job.stage) ? '正在发布' : publishOutcomeLabel(job)}</span>
              {job.stage === 'queued' && queue.activeRetry(job.id) && <small>重发已排队</small>}
              {canStartPausedJob(job) && <Button className="matrix-task-retry" size="sm" variant="outline" disabled={retryLocks.current.has(job.id)} onClick={() => void beginPaused(job)}>{retrying.has(job.id) ? '恢复素材…' : '开始发布'}</Button>}
              {retainedPreparation ? <Button className="matrix-task-retry" size="sm" variant="outline" disabled={!queue.canContinuePreparation(job.id)} title="保留原官方编辑器；未完成字段按本条保存配置填写，已完成步骤不会重做，检查通过后自动提交" onClick={() => continueJob(job)}>继续剩余步骤</Button> : canRetryPublishJob(job) && <Button className="matrix-task-retry" size="sm" variant="outline" disabled={retryBlocked(job)} onClick={() => void retry(job)}>{queue.isSubmissionPending(job.id) ? '等待回执' : retrying.has(job.id) ? '恢复素材…' : queue.activeRetry(job.id)?.stage === 'queued' ? '已排队' : queue.activeRetry(job.id) ? '重发中' : '重发'}</Button>}
              {(job.stage === 'unknown'||job.stage==='confirmed'&&job.verification?.state==='processing') && !!job.receiptId && <Button className="matrix-task-retry" size="sm" variant="outline" disabled={verifying.has(job.id)} aria-label={`刷新状态 ${job.nickname} ${job.title || job.id}`} onClick={() => void verifyResult(job)}>{verifying.has(job.id)?'核验中…':job.stage==='confirmed'?'刷新审核状态':'刷新状态'}</Button>}
              {!job.receiptId&&!!job.attemptId&&!!job.mediaHandoff&&['douyin','xiaohongshu'].includes(job.platform)&&['failed','attention','interrupted','unknown'].includes(job.stage)&&<Button size="sm" variant="outline" disabled={queue.running||verifying.has(job.id)} onClick={()=>void verifyResult(job)}>{verifying.has(job.id)?'核验中…':'官网已发布，核对结果'}</Button>}
            </p>
            <PublishTaskStageNote job={job} />
            {guest && ['preparing','uploading','filling','reviewing','confirming','submitting','attention','failed'].includes(job.stage) && <button type="button" className="matrix-task-page-link" onClick={() => workspace.select(guest.id)}>查看发布页面</button>}
            {job.platform==='bilibili'&&canRetryPublishJob(job)&&!retainedPreparation&&<label className="block text-xs my-2">创作声明（仅本条，可在重发前修改）<select aria-label={`重发创作声明 ${job.id}`} className="block max-w-full border rounded px-2 py-1 mt-1" disabled={retryBlocked(job)} value={retryDeclaration(job)} onChange={event=>setRetryDeclarations(current=>({...current,[declarationKey(job)]:event.target.value}))}><option value="">使用默认声明</option>{bilibiliCreationDeclarations.map(value=><option key={value} value={value}>{value}</option>)}</select><small>留空默认内容无需标注；含 AI、虚构演绎、营销等内容请修改。转载类型默认内容为转载。</small></label>}
            {job.verification && job.stage!=='confirmed' && <p className="text-xs text-muted-foreground" role="status" data-result-check={job.verification.state}>最近核验：{job.verification.message}<small>（{time(job.verification.checkedAt)}）</small></p>}
            {job.stage==='unknown'&&job.verification?.state!=='processing'&&<p className="text-xs text-muted-foreground" data-result-next-step>自动核对有等待上限，不会无限轮询。未找到作品不等于失败；可查看官方页面、手动刷新，或在本人核实未发布后结束原尝试。</p>}
            <PublishResultResolution job={job} onResolved={receipt=>queue.operationReceipt(receipt)} />
            {publishReviewLabel(job)&&<p role="status">审核：{publishReviewLabel(job)}{job.verification?.state==='rejected'&&<small>{job.verification.message}</small>}</p>}
            {job.stage==='confirmed'&&!publishReviewLabel(job)&&job.receiptId&&['douyin','xiaohongshu','bilibili'].includes(job.platform)&&<Button size="sm" variant="outline" aria-label={`一键评论 ${job.id}`} disabled={workspace.jobsLocked} onClick={()=>navigate('/engage/comments?'+new URLSearchParams({commentReceipt:job.receiptId!,commentAccount:job.accountId,commentPlatform:job.platform,commentOpen:'1'}).toString())}>一键评论</Button>}
            {job.stage==='confirmed'&&!publishReviewLabel(job)&&supportsPublishFollowup(job.platform)&&!job.config?.comment?.trim()&&<Button size="sm" variant="outline" aria-label={`添加追评 ${job.id}`} disabled={followupActions.has(job.id)} onClick={()=>setEditingFollowup(job)}>添加追评</Button>}
            <p>追评：<span title={job.followup?.message} className={job.followup?.status === 'confirmed' ? 'is-success' : ['failed','save_failed'].includes(job.followup?.status || '') ? 'is-failed' : ''}>{job.followup?.commentDeleted?'已删除（发表历史保留）':job.followup ? ({ pending: '待发表',running:'正在追评', save_failed: '待办保存失败', confirmed: '已发表', failed: '发表失败', unknown: '结果待核对' }[job.followup.status]) : job.config?.comment ? '等待作品发布' : '—'}</span>
              {job.stage === 'confirmed' && job.followup?.status === 'failed' && <Button className="matrix-task-retry" size="sm" variant="outline" title="只处理追评，不会重发作品" disabled={supportsPublishFollowup(job.platform)?followupActions.has(job.id):busy||queue.running} onClick={() => void (supportsPublishFollowup(job.platform)?followupAction(job,'start'):operate(job, 'comments'))}>重发追评</Button>}
            </p>
            {job.followup?.pinResult && <small title={job.followup.pinResult.message}>置顶：{({confirmed:'已确认',failed:'未完成',unknown:'结果待核对',cancelled:'未置顶'}[job.followup.pinResult.status])} · {job.followup.pinResult.message}</small>}
            {job.platform==='bilibili' && job.followup?.status==='confirmed' && !!job.followup.commentId && !job.followup.commentDeleted && job.config?.pinComment && ['unknown','failed'].includes(job.followup.pinResult?.status || '') && <Button size="sm" variant="outline" disabled={followupActions.has(job.id)||job.followup.commentManagement?.status==='unknown'} onClick={()=>void followupAction(job,'pin')}>继续置顶</Button>}
            {job.followup?.commentManagement&&<small role="status">评论管理：{job.followup.commentManagement.message}</small>}
            {job.followup?.commentId && <small>平台评论ID：{job.followup.commentId}</small>}
            {followupErrors[job.id] && <small role="alert">{followupErrors[job.id]}</small>}
            {followupActions.has(job.id)&&<small role="status">正在独立处理追评／置顶；其他作品任务可继续</small>}
            {job.withdrawal && <p>下架：{({ confirmed: '下架 / 私密成功', failed: '下架失败', unknown: '结果待核对' }[job.withdrawal.status])}</p>}
            {typeof job.uploadPercent === 'number' && job.stage === 'uploading' && <div>{job.uploadPercent}%<progress aria-label={`${job.nickname}官方上传进度`} max={100} value={job.uploadPercent} /></div>}
          </div>
          <div className="matrix-task-timing"><p>创建：{time(job.createdAt)}</p><p>执行：{started ? time(started) : includesQueue ? '未记录' : '—'}</p><p>完成：{duration === undefined ? '—' : `${includesQueue ? '总用时（含排队）' : '用时'} ${Math.floor(duration / 60)}分${duration % 60}秒`}</p></div>
          <div className="matrix-task-actions"><div><span>{job.config?.schedule?.mode === 'local' ? '本机定时' : job.config?.schedule?.mode === 'official' ? '平台定时' : '即时'}</span> <span>{job.mediaType === 'image' ? '图文' : '视频'}</span></div><p title={job.files.join('、')}>文件：{job.files.join('、')}</p>
          <div className="matrix-task-row-links"><button className="matrix-task-link" aria-label={`查看任务详情 ${job.title || job.id}`} onClick={event => { detailButton.current = event.currentTarget; setDetailId(job.id); }}>详情</button><details><summary>更多⌄</summary><div>
            {!retainedPreparation && canRetryPublishJob(job) && <Button size="sm" disabled={retryBlocked(job)} onClick={() => void retry(job)}>重新发送作品</Button>}
            {job.mediaType === 'video' && !!job.config?.covers?.length && (retainedPreparation || canRetryPublishJob(job)) && <Button size="sm" variant="outline" disabled={retryBlocked(job) || retainedPreparation && !queue.canContinuePreparation(job.id)} onClick={() => { if (retainedPreparation) { try { queue.continuePreparation(job.id, { automaticCover: true }); workspace.hide(); toast.info('本条改用自动封面，继续剩余步骤；不重新上传视频'); } catch (error) { toast.error((error as Error).message); } } else void retry(job, true); }}>{retainedPreparation ? '使用自动封面继续' : '使用自动封面重发'}</Button>}
            {job.stage === 'confirmed' && <>{job.config?.comment && job.followup?.status !== 'confirmed' && <Button size="sm" variant="outline" disabled={supportsPublishFollowup(job.platform)?followupActions.has(job.id)||job.followup?.status==='running':busy||queue.running} onClick={() => void (supportsPublishFollowup(job.platform)?followupAction(job,job.followup?.status==='unknown'?'verify':'start'):operate(job, 'comments'))}>{supportsPublishFollowup(job.platform)?(job.followup?.status==='unknown'?'只核对追评结果':'处理追评（按作品ID）'):'处理追评（官方核对）'}</Button>}{supportsPublishFollowup(job.platform)&&job.followup?.status==='confirmed'&&!job.followup.commentDeleted&&job.config?.pinComment&&job.followup.pinResult?.status!=='confirmed'&&<Button size="sm" variant="outline" disabled={followupActions.has(job.id)||job.followup.commentManagement?.status==='unknown'} onClick={()=>void followupAction(job,'pin')}>仅处理置顶（不重发追评）</Button>}<Button size="sm" variant="outline" disabled={busy || queue.running || job.withdrawal?.status === 'confirmed'} onClick={() => void operate(job, 'withdraw')}>下架作品（官方核对）</Button></>}
            <Button size="sm" variant="ghost" disabled={busy || activePublishStages.includes(job.stage) || retryBlocked(job)} onClick={() => removeJobs([job])}>删除任务记录</Button>
            {job.platform==='bilibili'&&job.followup?.status==='confirmed'&&!job.followup.commentDeleted&&<>
              <Button size="sm" variant="outline" disabled={followupActions.has(job.id)} onClick={()=>void followupAction(job,'verify')}>只核对追评与置顶（不发送）</Button>
              {job.followup.commentId&&<>
                <Button size="sm" variant="outline" disabled={followupActions.has(job.id)||job.followup.commentManagement?.status==='unknown'} onClick={()=>setManagingFollowup({job,operation:'unpin',owner:getUser()?.id})}>取消原追评置顶</Button>
                <Button size="sm" variant="outline" disabled={followupActions.has(job.id)||job.followup.commentManagement?.status==='unknown'} onClick={()=>setManagingFollowup({job,operation:'delete',owner:getUser()?.id})}>删除原追评</Button>
                <small>已发表正文暂不支持原地修改；删除后重发不是编辑，会产生新评论，原互动无法保留。</small>
              </>}
            </>}
            {job.followup && <Button size="sm" variant="ghost" onClick={() => navigate('/engage/manual-tasks')}>查看追评待办</Button>}
            {guest && <Button size="sm" variant="outline" onClick={() => workspace.select(guest.id)}>查看官方页面</Button>}
            <PublishErrorFeedback job={job} />
          </div></details></div></div>
          {!retainedPreparation && queue.canResume(job.batchId) && <div className="matrix-task-resume"><Button size="sm" variant="outline" onClick={() => setConfirmation({ kind: 'discard', items: [job], batchId: job.batchId })}>结束未提交任务</Button><Button size="sm" onClick={() => { try { queue.resume(job.batchId); } catch (error) { toast.error((error as Error).message); } }}>已补全，继续本批次</Button></div>}
        </article>;
      })}
    </div>
    <footer className="matrix-task-footer">
      <Button variant="outline" disabled={!chosen.length || chosen.some(job => !canRetryPublishJob(job) || retryBlocked(job) || queue.hasRetainedPreparation(job.id))} onClick={() => void retryChosen()}>批量重发</Button>
      <Button variant="outline" disabled={!chosen.length || chosen.some(job => activePublishStages.includes(job.stage) || retryBlocked(job) || job.followup?.status==='running'||queue.hasFollowupOperation(job.id)) || busy} onClick={() => removeJobs(chosen)}>批量删除</Button>
      <Button variant="outline" disabled={!queue.running&&!queue.followupsRunning} onClick={stop}>停止后续任务</Button>
      <Button variant="outline" disabled={!visible.length} onClick={exportJobs}>导出记录</Button>
      <span>已选择：{chosen.length}</span><button className="matrix-task-link" onClick={() => setSelected(chosen.length === visible.length ? [] : visible.map(job => job.id))}>{chosen.length && chosen.length === visible.length ? '取消全选' : '全选'}</button>
      <span className="matrix-task-footer-spacer" />
      <Button variant="outline" disabled={!visible.length || queue.running || busy || visible.some(job => activePublishStages.includes(job.stage)||job.followup?.status==='running'||queue.hasFollowupOperation(job.id))} onClick={() => removeJobs(visible)}>清空筛选记录</Button>
      <Button variant="outline" onClick={() => setSettings(value => !value)}>任务设置</Button>
    </footer>{editingFollowup&&<PublishFollowupEditor job={editingFollowup} close={()=>setEditingFollowup(undefined)} submit={(comment,pin)=>{try{const job=queue.setFollowupIntent(editingFollowup,comment,pin);setEditingFollowup(undefined);void followupAction(job,'start');}catch(error){toast.error(error instanceof Error?error.message:'原追评状态已变化');}}}/>}
    <Dialog open={!!managingFollowup} onOpenChange={open=>{if(!open)setManagingFollowup(undefined);}}><DialogContent><DialogHeader><DialogTitle>{managingFollowup?.operation==='delete'?'删除原追评':'取消原追评置顶'}</DialogTitle><DialogDescription>仅处理下面的原评论 ID。不会操作后来手动重发的评论，也不会重新发布作品或追评。</DialogDescription></DialogHeader><p>{managingFollowup?.job.nickname} · {managingFollowup?.job.title}</p><p>评论 ID：{managingFollowup?.job.followup?.commentId}</p><p className="whitespace-pre-wrap break-words">{managingFollowup?.job.followup?.commentText??managingFollowup?.job.config?.comment}</p><p>{managingFollowup?.operation==='delete'?'删除不可撤销，原评论及其关联互动可能无法恢复；本地发表记录保留。':'只取消这条原评论的置顶，保留正文。若官方置顶已是其他评论，不会操作它。'}</p><DialogFooter><Button variant="outline" onClick={()=>setManagingFollowup(undefined)}>取消</Button><Button disabled={!managingFollowup||followupActions.has(managingFollowup.job.id)} onClick={()=>{const action=managingFollowup;setManagingFollowup(undefined);if(!action)return;if(action.owner!==getUser()?.id){toast.error('登录用户已变化，未操作评论');return;}void followupAction(action.job,action.operation);}}>{managingFollowup?.operation==='delete'?'确认删除原追评':'确认取消置顶'}</Button></DialogFooter></DialogContent></Dialog>
    {settings && <div className="matrix-task-settings"><strong>任务执行规则</strong><p>临时页面错误最多自动恢复两次；已交付的素材不因填表错误重复上传。验证码、频控、缺少必填项不会盲目重试。</p><p>尚未提交或平台明确失败可重发；提交结果不明必须核对，避免重复作品。原素材与封面未移动或修改时，重启后仍可恢复。点击发布、重发或继续即执行发布，检查通过后自动提交，不再弹出最终确认。关闭软件不自动恢复或重发任务。</p><Button variant="outline" onClick={() => setSettings(false)}>关闭说明</Button></div>}
    <Dialog open={!!confirmation} onOpenChange={open => { if (!open) setConfirmation(undefined); }}><DialogContent><DialogHeader><DialogTitle>{confirmation?.kind === 'retry' ? '批量重发作品' : confirmation?.kind === 'discard' ? '结束未提交任务' : '删除本地任务记录'}</DialogTitle><DialogDescription>{confirmation?.kind === 'retry' ? `只重发所选的 ${confirmation.items.length} 条未提交或明确失败作品，原记录保留。提交结果不确定的任务不会重发。` : confirmation?.kind === 'discard' ? '只停止后续提交，不删除或撤回平台已经收到的内容。' : `只删除 ${confirmation?.items.length || 0} 条本地记录。不会删除平台作品、撤回评论，独立回执和追评待办仍保留。`}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirmation(undefined)}>取消</Button><Button disabled={confirmation?.kind === 'discard' ? busy || queue.running : confirmation?.items.some(job => retryBlocked(job))} onClick={() => { const action = confirmation; setConfirmation(undefined); if (!action) return; if (action.kind === 'remove') removeJobs(action.items, true); else if (action.kind === 'retry') void retryChosen(action.items, true); else { try { queue.discard(action.batchId!); } catch (error) { toast.error((error as Error).message); } } }}>确认</Button></DialogFooter></DialogContent></Dialog>
    <PublishTaskDetail job={jobs.find(job => job.id === detailId)} avatarUrl={workspace.accounts.find(account => account.id === jobs.find(job => job.id === detailId)?.accountId)?.avatarUrl} onClose={() => setDetailId(undefined)} onReturnFocus={() => detailButton.current?.focus()} />
  </section>;
}
