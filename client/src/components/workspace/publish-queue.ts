import type { PlatformAccount } from '@shared/api.interface';
import type { PublishConfig } from '@shared/publish-config';
import { isPublishExecutionStage, publishExecutionStageLabels, type PublishExecutionStage } from './publish-execution-stage';
import { collectPublishPreflight, publishPreflightMessage } from '@shared/publish-preflight';
import { completedDraftPublications, draftPublicationRefs, draftReceiptKey, normalizeDraftPublication, type PublishDraftOrigin, type PublishDraftPublication } from './publish-draft-completion';
import { normalizePublishTaskControls, publishTaskControlsError, type PublishTaskControls } from '@shared/publish-task-controls';
import { normalizePublishWorkReference, type PublishWorkReference } from '@shared/publish-work-reference';
import { createPublishFollowupScheduler } from './publish-followup-scheduler';
import { boundedAccountCheck } from './async-account-checks';

export type PublishStage = 'paused' | 'scheduled' | 'queued' | 'preparing' | 'uploading' | 'filling' | 'reviewing' | 'confirming' | 'submitting' | 'confirmed' | 'attention' | 'failed' | 'unknown' | 'cancelled' | 'interrupted';
export const publishStageLabels: Record<PublishStage, string> = { paused: '已暂停，尚未上传', scheduled: '等待本机定时', queued: '排队中', preparing: '准备账号页面', uploading: '上传素材', filling: '填入作品信息', reviewing: '等待官方表单就绪', confirming: '提交前复核', submitting: '正在提交', confirmed: '发布成功', attention: '待补全 / 验证', failed: '发布失败', unknown: '发布结果未确认', cancelled: '已停止', interrupted: '任务已中断' };
export const activePublishStages: PublishStage[] = ['scheduled', 'queued', 'preparing', 'uploading', 'filling', 'reviewing', 'confirming', 'submitting'];
export const publishOutcomeLabel=(job:Pick<PublishJob,'stage'|'verification'|'acceptedAt'>&Partial<Pick<PublishJob,'message'>>)=>{
  if(job.stage==='attention'){
    const message=job.message||'';
    if(/验证码|验证身份|身份验证|人脸验证|滑块验证|扫码验证|本人验证/.test(message))return '待官网验证';
    if(/标签|话题/.test(message))return '待完成标签';
    if(/遮挡|弹窗/.test(message))return '待处理页面遮挡';
    if(/填写|补全|封面/.test(message))return '待补全作品信息';
    return '待处理';
  }
  return job.stage!=='unknown'?publishStageLabels[job.stage]:job.verification?.state==='processing'?Number.isFinite(Date.parse(job.acceptedAt||''))?'投稿成功，等待审核':'平台处理中，结果待核对':job.verification?'核对已结束，结果未确认':'发布结果未确认';
};
export const publishReviewLabel=(job:Pick<PublishJob,'stage'|'verification'>)=>job.stage==='confirmed'?(job.verification?.state==='processing'?'待审核':job.verification?.state==='rejected'?'审核未通过':''):'';
export interface PublishFollowupState { status:'pending'|'running'|'save_failed'|'confirmed'|'failed'|'unknown';message:string;receiptId?:string;commentId?:string;commentText?:string;commentDeleted?:boolean;commentManagement?:MatrixPageActionReceipt['commentManagement'];retryable?:boolean;pinResult?:{status:'confirmed'|'failed'|'unknown'|'cancelled';message:string} }
export function publishFollowupReceipt(receipt:MatrixPageActionReceipt):PublishFollowupState {
  const pin=receipt.pinResult;
  const management=receipt.commentManagement;
  return {status:receipt.status==='submitting'?'unknown':receipt.status,message:receipt.message,receiptId:receipt.id,...(typeof receipt.commentId==='string'?{commentId:receipt.commentId}:{}),...(typeof receipt.summary==='string'?{commentText:receipt.summary.slice(0,2000)}:{}),commentDeleted:receipt.commentDeleted===true,...(management&&['unpin','delete'].includes(management.operation)&&['confirmed','failed','unknown'].includes(management.status)&&management.commentId===receipt.commentId&&typeof management.message==='string'?{commentManagement:{...management,message:management.message.slice(0,500)}}:{}),retryable:receipt.retryable===true,...(pin&&['confirmed','failed','unknown','cancelled'].includes(pin.status)&&typeof pin.message==='string'?{pinResult:{status:pin.status,message:pin.message.slice(0,500)}}:{})};
}
export interface PublishJob {
  id: string; batchId: string; batchName?: string; accountId: string; nickname: string; platform: PlatformAccount['platform']; title: string;
  files: string[]; stage: PublishStage; message: string; createdAt: string; updatedAt: string; executionStartedAt?: string; completedAt?: string; uploadPercent?: number;
  executionStage?: PublishExecutionStage;
  completedSteps?: PublishExecutionStage[];
  history: { at: string; stage: PublishStage; message: string; executionStage?: PublishExecutionStage }[]; receiptId?: string;
  config?: PublishConfig; mediaType?: 'image' | 'video'; retryOf?: string;
  attemptId?: string; attemptNumber?: number; lastAttemptAt?: string;
  attempts?: { attemptId?: string; batchId: string; stage: PublishStage; message: string; receiptId?: string; endedAt: string }[];
  avatarUrl?: string; thumbnail?: string; recoveryId?: string; recoveryWarning?: string;
  submission?: 'not_submitted' | 'rejected' | 'user_confirmed_absent' | 'uncertain' | 'confirmed'; autoRetries?: number;
  resultCheckOnly?: boolean;
  acceptedAt?: string;
  workReference?: PublishWorkReference;
  referenceCollection?: MatrixPageActionReceipt['referenceCollection'];
  workReferenceConflict?: boolean;
  followup?: PublishFollowupState;
  withdrawal?: { status: 'confirmed' | 'failed' | 'unknown'; message: string; receiptId?: string };
  diagnostic?: { at: string; controls: string[] };
  verification?: MatrixPublishVerification;
  mediaObservation?: { at: string; value: MatrixPublishObservation; stored: boolean; warning?: string };
  // Display evidence only after restart. Only the current in-memory guest and
  // matching attempt below may authorize continuation without another upload.
  mediaHandoff?: { at: string; state: 'confirmed' | 'uncertain' };
  draftPublication?: PublishDraftPublication;
  draftCleanupComplete?: boolean;
  draftCleanupWarning?: string;
}
export interface PublishRequest { account: PlatformAccount; config: PublishConfig; media: MatrixMediaSelection; draft?: PublishDraftOrigin; originalRecoveryId?: string }
type Dependencies = {
  current(): boolean; changed(jobs: PublishJob[]): void; sleep(ms: number): Promise<void>;
  remember?(request: PublishRequest): Promise<{ error?: string; recoveryId?: string; thumbnail?: string }>;
  prepare(request: PublishRequest, signal?: AbortSignal): Promise<MatrixPageActionInput>;
  upload(input: MatrixPageActionInput, media: MatrixMediaSelection): Promise<{ error?: string; uploadStarted?: boolean; handoffUncertain?: boolean }>;
  cover?(input: MatrixPageActionInput, cover: { id: string; name: string; index: number }): Promise<{ error?: string; uploadStarted?: boolean; coverConfirmed?: boolean }>;
  fill(input: MatrixPageActionInput, config: PublishConfig): Promise<MatrixPublishSyncResult>;
  progress(input: MatrixPageActionInput): Promise<MatrixPublishSyncResult>;
  describe?(input: MatrixPageActionInput): Promise<MatrixPublishSyncResult>;
  verifyManual?(job:PublishJob):Promise<void>;
  inspect(input: MatrixPageActionInput): Promise<MatrixPageActionPlan | MatrixDesktopErrorResult>;
  submit(entries: MatrixPublishEntry[], batchId: string): ReturnType<NonNullable<Window['matrixDesktop']>['submitPublishBatch']>;
  followup(request: PublishRequest, receipt: MatrixPageActionReceipt): Promise<PublishFollowupState | void>;
  followupTimeoutMs?:number;
  completedDraft?(reference: PublishDraftPublication): void;
  preparationTimeoutMs?: Partial<Record<PublishStage | 'remember' | 'cover' | 'diagnostic' | 'uploadingTotal' | 'reviewingTotal' | 'observationIdle', number>>;
};

export const publishObservationLabels: Record<MatrixPublishObservation['state'], string> = {
  upload_failed: '官方提示上传失败', uploading: '官方显示上传中', processing: '官方显示媒体处理中',
  waiting_layout: '官方编辑器尺寸尚未就绪，未进入下一步',
  waiting_editor: '等待识别官方编辑器', waiting_media: '尚未识别到官方上传完成信号', waiting_preview: '尚未识别到唯一已解码封面', ambiguous_cover: '识别到多个封面候选',
  cover_ready: '已识别封面，提交按钮尚未就绪', submit_ready: '已识别媒体和提交按钮（尚未发布）', waiting_submit: '等待识别提交按钮',
};
export function publishObservationSummary(value: MatrixPublishObservation) {
  const reasons = {no_bounds:'没有有效尺寸',hidden_style:'样式隐藏',disabled:'控件禁用',hidden_ancestor:'上层隐藏',transparent_ancestor:'上层透明',hidden_animation:'隐藏动画'};
  const probe = value.probe;
  return `${publishObservationLabels[value.state]}；处理信号 ${value.busySignals.length}，视频输入 ${value.attachedVideoInputs}，视频解码 ${value.decodedMedia}/${value.mediaElements}，封面解码 ${value.decodedCoverImages}/${value.coverImages}，封面容器 ${value.coverContainers}，可用提交按钮 ${value.enabledSubmitButtons}${probe ? `；视口 ${probe.viewportWidth}×${probe.viewportHeight}，组件根 ${probe.componentRoots}，封面候选 ${probe.matchedCovers}，视频候选 ${probe.matchedVideos}${probe.rejectedCoverReasons.length ? `，封面过滤原因：${probe.rejectedCoverReasons.map(reason=>reasons[reason]).join('、')}` : ''}` : ''}`;
}
function recoverVerification(value: MatrixPublishVerification | undefined): MatrixPublishVerification | undefined {
  const states=['confirmed','rejected','not_found','time_mismatch','missing_time','status_unresolved','ambiguous','processing','visibility_mismatch','not_published','page_not_ready','wrong_page','login_required','identity_mismatch','identity_pending','unsupported','missing_reference','timeout','busy','error'];
  // The main process retains bounded concrete official reasons (up to 800
  // characters plus a label). A 300-character display-only limit erased valid
  // checks after restart while the original receipt still held the reason.
  if(!value||!states.includes(value.state)||!Number.isFinite(Date.parse(value.checkedAt))||typeof value.message!=='string'||value.message.length>1000)return undefined;
  return {state:value.state,message:value.message,checkedAt:value.checkedAt};
}
function recoverProbe(probe: MatrixPublishProbe | undefined): MatrixPublishProbe | undefined {
  if (!probe) return undefined;
  const counters = ['componentRoots','viewportWidth','viewportHeight','matchedCovers','matchedVideos'] as const;
  const reasons = ['no_bounds','hidden_style','disabled','hidden_ancestor','transparent_ancestor','hidden_animation'];
  if (typeof probe.documentVisible !== 'boolean' || !Array.isArray(probe.rejectedCoverReasons) || probe.rejectedCoverReasons.length > reasons.length || probe.rejectedCoverReasons.some(reason=>!reasons.includes(reason)) || !counters.every(key=>Number.isSafeInteger(probe[key]) && probe[key]>=0 && probe[key]<=10000)) return undefined;
  return { ...Object.fromEntries(counters.map(key=>[key,probe[key]])), documentVisible:probe.documentVisible, rejectedCoverReasons:[...new Set(probe.rejectedCoverReasons)].sort() } as MatrixPublishProbe;
}
function recoverMediaObservation(value: unknown): PublishJob['mediaObservation'] {
  const item = value as PublishJob['mediaObservation'], observed = item?.value;
  const counters = ['attachedVideoInputs', 'mediaElements', 'decodedMedia', 'coverContainers', 'coverImages', 'decodedCoverImages', 'enabledSubmitButtons'] as const;
  if (!item || !Number.isFinite(Date.parse(item.at)) || observed?.version !== 1 || !Object.prototype.hasOwnProperty.call(publishObservationLabels, observed.state) || typeof observed.editorReady !== 'boolean' || !Array.isArray(observed.busySignals) || observed.busySignals.some(signal => !['media_notice','upload_notice','progress_bar'].includes(signal)) || !counters.every(key => Number.isSafeInteger(observed[key]) && observed[key] >= 0 && observed[key] <= 10000) || observed.uploadPercent !== undefined && (!Number.isInteger(observed.uploadPercent) || observed.uploadPercent < 0 || observed.uploadPercent > 100)) return undefined;
  return { at: item.at, stored: item.stored === true, value: { version: 1, state: observed.state, editorReady: observed.editorReady, busySignals: [...new Set(observed.busySignals)], ...Object.fromEntries(counters.map(key => [key, observed[key]])), ...(observed.uploadPercent !== undefined ? { uploadPercent: observed.uploadPercent } : {}), ...(recoverProbe(observed.probe) ? {probe:recoverProbe(observed.probe)} : {}) } as MatrixPublishObservation, ...(typeof item.warning === 'string' ? { warning: item.warning.slice(0,160) } : {}) };
}

export const transientPublishError = (message: string) => !/验证码|验证身份|本人验证|请先.*登录|登录.*失效|频繁|风控|限额|素材.*失效|素材.*修改|素材.*移动|请.*选择|官方定时|多个提交按钮|已交付|交付结果未确认|不会重复执行|阶段超时/.test(message)
  && /Could not find node|Cannot find context|Cannot find object|Execution context was destroyed|尚未就绪|已重建|页面未就绪|无法唯一识别官方素材上传入口|上传入口尚未|网络.*(?:超时|中断)|ERR_NETWORK_CHANGED/i.test(message);
function receiptSubmission(receipt: MatrixPageActionReceipt): PublishJob['submission'] {
  if (receipt.status === 'confirmed') return 'confirmed';
  if (receipt.status !== 'failed') return 'uncertain';
  // A person's own-list check is not a platform rejection or proof that no
  // click happened. Retain that distinction in the row and exported report.
  if (receipt.resultSource === 'user_confirmed_not_published') return 'user_confirmed_absent';
  if(receipt.manualVerification)return 'rejected';
  return receipt.clicked === false ? 'not_submitted' : 'rejected';
}
const knownFailedResult = (job: PublishJob) => job.stage==='failed'&&!!job.receiptId&&['not_submitted','rejected','user_confirmed_absent'].includes(job.submission||'');
export function canRetryPublishJob(job: PublishJob) {
  // Login can fail before prepare() returns any publisher/input. There is no
  // upload to resume in that state, so a fresh same-row attempt is safe after
  // the user restores the official login. Do not apply this to later phases.
  if (job.stage === 'attention' && job.executionStage === 'preparing' && job.submission === 'not_submitted' && !job.receiptId) return true;
  if (['cancelled', 'interrupted'].includes(job.stage)) return job.submission === 'not_submitted' && !job.receiptId && !job.history.some(step => ['confirming','submitting','confirmed','unknown'].includes(step.stage));
  return job.stage === 'failed' && (job.submission === 'not_submitted' || job.submission === 'rejected' || job.submission === 'user_confirmed_absent' || (!job.submission && Boolean(job.receiptId)));
}
export const canStartPausedJob = (job: PublishJob) => job.stage === 'paused' && job.submission === 'not_submitted' && !job.receiptId && !job.history.some(step => ['confirming','submitting','confirmed','unknown'].includes(step.stage));

// Data from local storage is display-only: never restart an interrupted external action.
export function recoverPublishJobs(value: unknown): PublishJob[] {
  if (!Array.isArray(value)) return [];
  return value.filter(job => job && typeof job.id === 'string' && typeof job.batchId === 'string' && typeof job.accountId === 'string' && typeof job.nickname === 'string' && typeof job.message === 'string' && Array.isArray(job.files) && job.files.every((file: unknown) => typeof file === 'string') && Object.prototype.hasOwnProperty.call(publishStageLabels, job.stage) && Array.isArray(job.history)).map(job => {
    job = { ...job, completedSteps: Array.isArray(job.completedSteps) ? [...new Set(job.completedSteps.filter(isPublishExecutionStage))] : undefined, mediaHandoff: ['confirmed','uncertain'].includes(job.mediaHandoff?.state) && Number.isFinite(Date.parse(job.mediaHandoff.at)) ? {at:job.mediaHandoff.at,state:job.mediaHandoff.state} : undefined, mediaObservation: recoverMediaObservation(job.mediaObservation), diagnostic: typeof job.diagnostic?.at === 'string' && Number.isFinite(Date.parse(job.diagnostic.at)) && Array.isArray(job.diagnostic.controls) ? { at: job.diagnostic.at, controls: job.diagnostic.controls.filter((line: unknown) => typeof line === 'string').slice(0, 35).map((line: string) => line.slice(0, 700)) } : undefined };
    job.verification=recoverVerification(job.verification);
    job.acceptedAt=typeof job.acceptedAt==='string'&&Number.isFinite(Date.parse(job.acceptedAt))?job.acceptedAt:undefined;
    if(job.stage==='unknown'&&job.acceptedAt&&job.verification?.state==='processing')job={...job,stage:'confirmed',submission:'confirmed',completedAt:job.completedAt||job.acceptedAt,message:'发布成功，等待平台审核；无需重复提交'};
    job.workReference = job.stage === 'confirmed' || job.acceptedAt ? normalizePublishWorkReference(job.platform,job.workReference) : undefined;
    job.referenceCollection = ['confirmed','pending','conflict'].includes(job.referenceCollection?.state||'')&&typeof job.referenceCollection?.message==='string'&&Number.isFinite(Date.parse(job.referenceCollection.checkedAt))?{state:job.referenceCollection.state,message:job.referenceCollection.message.slice(0,500),checkedAt:job.referenceCollection.checkedAt}:undefined;
    job.workReferenceConflict = job.workReferenceConflict === true || undefined;
    if(job.followup?.status==='running')job.followup={...job.followup,status:'unknown',message:'软件关闭时追评仍在执行，请先核对原评论；作品不会重发，也不会自动重复追评'};
    job.draftPublication=normalizeDraftPublication(job.draftPublication);
    job.draftCleanupComplete=!!job.draftPublication&&job.draftCleanupComplete===true;
    job.draftCleanupWarning=typeof job.draftCleanupWarning==='string'&&job.draftCleanupWarning.length<=300?job.draftCleanupWarning:undefined;
    const mayHaveSubmitted = job.receiptId || ['confirming','submitting','unknown','confirmed'].includes(job.stage) || job.history.some((step: { stage?: string }) => ['confirming','submitting','confirmed','unknown'].includes(step?.stage || ''));
    job.batchName = typeof job.batchName === 'string' ? job.batchName.replace(/[\u0000-\u001f]/g, '').slice(0,80) : undefined;
    if (job.stage === 'paused' && mayHaveSubmitted) return { ...job, stage: 'unknown', submission: 'uncertain', message: '暂停记录包含历史提交信号，请先核对原结果，不能作为未上传任务启动' };
    if (activePublishStages.includes(job.stage)) return { ...job, stage: 'interrupted', uploadPercent: undefined, submission: mayHaveSubmitted ? 'uncertain' : 'not_submitted', message: mayHaveSubmitted ? '上次提交中断，请先核对官方结果；不会自动重发。' : '软件关闭前尚未提交；不会自动重发，可重新准备发布。' };
    // An in-memory editor cannot be resumed after restart. A known unsubmitted
    // orphan offers an explicit retry of THIS row, never an automatic new task.
    // Keep any confirming/submitting history or uncertain receipt protected.
    if (job.stage === 'attention' && !mayHaveSubmitted && (job.submission === 'not_submitted' || transientPublishError(job.message) || /官方上传.*尚未就绪/.test(job.message))) return { ...job, stage: 'failed', submission: 'not_submitted', message: `准备发布失败，尚未提交：${job.message}` };
    return {...job,verification:recoverVerification(job.verification)};
  });
}

export function createPublishQueue(deps: Dependencies, initial: PublishJob[] = []) {
  let jobs = initial, running = false, stopped = false, disposed = false;
  let executionAbort: AbortController | undefined;
  let pendingGroups: { jobs: PublishJob[]; independent: boolean }[] = [];
  const pendingSubmissions = new Map<string, string | undefined>();
  const manualFollowups=new Map<string,symbol>();
  const isSubmissionPending = (id: string) => pendingSubmissions.has(id) && jobs.some(job=>job.id===id && job.attemptId===pendingSubmissions.get(id));
  const activeRetry = (id: string) => jobs.find(job => (job.id === id && (job.attemptNumber || 1) > 1 || job.retryOf === id) && activePublishStages.includes(job.stage));
  const belongsTo = (job: PublishJob, batch: PublishJob[]) => batch.some(item => item.id === job.id && item.attemptId === job.attemptId);
  const requests = new Map<string, PublishRequest>(), inputs = new Map<string, MatrixPageActionInput>();
  const pausedSaveTimers = new Map<ReturnType<typeof setTimeout>, () => void>();
  const handedOffAttempts = new Map<string, string | undefined>();
  const coverStates = new Map<string, Map<number, 'confirmed' | 'uncertain'>>();
  const hasRequestedCovers = (job: PublishJob) => job.config?.covers?.some(cover => cover.index !== 2 || job.platform === 'douyin');
  const hasRetainedPreparation = (id: string) => {
    const job = jobs.find(item => item.id === id);
    return Boolean(!disposed && deps.current() && job && ['failed','attention'].includes(job.stage) && job.submission === 'not_submitted' && !job.receiptId && job.mediaHandoff?.state === 'confirmed' && inputs.has(id) && requests.has(id) && handedOffAttempts.has(id) && handedOffAttempts.get(id) === job.attemptId && ![...(coverStates.get(id)?.values() || [])].includes('uncertain'));
  };
  const canContinuePreparation = (id: string) => !running && hasRetainedPreparation(id);
  const reconcileDepartedEditor=async(job:PublishJob,message:string)=>{
    const current=jobs.find(item=>belongsTo(item,[job]));
    if(!current||current.receiptId||!['douyin','xiaohongshu'].includes(current.platform)||current.mediaHandoff?.state!=='confirmed'||!current.completedSteps?.includes('filling')||!/请先在当前账号打开官方发布表单|页面识别等待超时/.test(message))return false;
    inputs.delete(job.id);requests.delete(job.id);handedOffAttempts.delete(job.id);coverStates.delete(job.id);
    update(job.id,'unknown','官方编辑器已离开或无法识别，可能已由本人发布；先核对官网结果，不重传或继续提交',{submission:'uncertain',uploadPercent:undefined,resultCheckOnly:true});
    if(deps.verifyManual)try{await boundedAccountCheck(()=>deps.verifyManual!(current));}
    catch(error){if(!disposed&&deps.current()&&jobs.some(item=>belongsTo(item,[job])&&item.stage==='unknown'))update(job.id,'unknown','官网结果核对暂未完成：'+(error instanceof Error?error.message:'读取失败'),{submission:'uncertain'});}
    return true;
  };
  const emit = () => deps.changed([...jobs]);
  const freshDraftReceipts = new Map<string, string>(), notifyingDrafts = new Set<string>();
  const observeDraftReceipt = (job: PublishJob, receipt: MatrixPageActionReceipt) => {
    if(receipt.manualVerification||['processing','rejected'].includes(receipt.verification?.state||''))return; // Keep drafts during moderation or read-only verification.
    if (receipt.status === 'confirmed' && receipt.kind === 'publish' && receipt.id && receipt.taskId === job.id && receipt.accountId === job.accountId && receipt.platform === job.platform && job.attemptId && receipt.attemptId === job.attemptId) freshDraftReceipts.set(job.id, draftReceiptKey(receipt.attemptId, receipt.id));
  };
  const completeDrafts = () => {
    if (disposed || !deps.current() || !deps.completedDraft) return;
    for (const reference of completedDraftPublications(jobs, freshDraftReceipts)) {
      if (notifyingDrafts.has(reference.publicationId) || disposed || !deps.current()) continue;
      notifyingDrafts.add(reference.publicationId);
      try {
        deps.completedDraft(reference);
        if (disposed || !deps.current()) return;
        // Persist only the processed marker. Draft bookkeeping must not rewrite
        // original execution timestamps/history or re-order old task records.
        jobs = jobs.map(job => job.draftPublication?.publicationId === reference.publicationId ? { ...job, draftCleanupComplete: true, draftCleanupWarning: undefined } : job);
        emit();
      } catch (error) {
        const reason = /QuotaExceeded|quota|空间|配额/i.test(String((error as Error)?.name)+' '+String((error as Error)?.message)) ? '本机存储空间或配额不足' : /损坏/.test(String((error as Error)?.message)) ? '本地草稿数据格式损坏' : /SecurityError|访问受限/.test(String((error as Error)?.name)) ? '本地存储访问受限' : '本地存储操作未完成';
        jobs = jobs.map(job => job.draftPublication?.publicationId === reference.publicationId ? { ...job, draftCleanupWarning: `草稿清理未确认：${reason}，请到本地草稿箱核对；发布成功结果未改动。` } : job);
        emit();
      }
      finally { notifyingDrafts.delete(reference.publicationId); }
    }
  };
  const update = (id: string, stage: PublishStage, message: string, patch: Partial<PublishJob> = {}) => {
    const index = jobs.findIndex(job => job.id === id); if (index < 0) return;
    const job = jobs[index], executionStage = patch.executionStage || (isPublishExecutionStage(stage) ? stage : job.executionStage);
    // A fresh official success receipt is terminal for this attempt. A delayed
    // transport/processing message cannot turn it back into failure/unknown.
    if (job.stage === 'confirmed' && stage !== 'confirmed') return;
    const sameStage = job.stage === stage && job.message === message && job.executionStage === executionStage;
    const samePatch = Object.entries(patch).every(([key,value]) => {
      const previous = job[key as keyof PublishJob];
      return Object.is(previous,value) || typeof previous === 'object' && previous !== null && typeof value === 'object' && value !== null && JSON.stringify(previous) === JSON.stringify(value);
    });
    // Polling still runs; only a real phase/progress/receipt change is published
    // to React and persisted. Repeated 42% is not a new task update or history.
    if (sameStage && samePatch) return;
    const at = new Date().toISOString();
    const executionStartedAt = job.executionStartedAt || (stage === 'preparing' ? at : undefined);
    const completedAt = ['confirmed','failed','cancelled','interrupted'].includes(stage) ? patch.completedAt || (job.stage === stage ? job.completedAt : undefined) || at : Object.prototype.hasOwnProperty.call(patch,'completedAt') ? patch.completedAt : job.completedAt;
    jobs = [...jobs];
    jobs[index] = { ...job, ...patch, stage, message, executionStage, executionStartedAt, completedAt, updatedAt:at, history:sameStage ? job.history : [...job.history,{at,stage,message,executionStage}].slice(-40) };
    emit();
  };
  const guard = () => { if (disposed || stopped || !deps.current()) throw Error('任务已停止或登录用户已切换'); };
  type FollowupValue={jobId:string;attemptId?:string;receipt:MatrixPageActionReceipt;request:PublishRequest};
  const currentFollowup=(value:FollowupValue)=>jobs.find(job=>job.id===value.jobId&&job.attemptId===value.attemptId&&job.receiptId===value.receipt.id&&job.stage==='confirmed'&&!publishReviewLabel(job)&&!job.workReferenceConflict);
  const followups=createPublishFollowupScheduler<FollowupValue,PublishFollowupState|void>({
    current:()=>!disposed&&deps.current(),timeoutMs:deps.followupTimeoutMs,
    run:async task=>{if(!currentFollowup(task.value))throw Error('原发布记录已变化，未发送追评');return deps.followup(task.value.request,task.value.receipt);},
    started:task=>{const job=currentFollowup(task.value);if(job&&job.followup?.status!=='confirmed')update(job.id,job.stage,job.message,{followup:{status:'running',message:'正在独立处理追评，其他发布任务可继续'}});},
    result:(task,value)=>{const job=currentFollowup(task.value);if(job&&job.followup?.status!=='confirmed')update(job.id,job.stage,job.message,{followup:value||{status:'pending',message:'追评待发表，已保存待办；尚未发送'}});},
    failed:(task,message,timedOut)=>{const job=currentFollowup(task.value);if(job&&job.followup?.status!=='confirmed')update(job.id,job.stage,job.message,{followup:{status:timedOut?'unknown':'save_failed',message:timedOut?message:'追评未完成：'+message.slice(0,400)+'；作品无需重发'}});},
    stopped:task=>{const job=currentFollowup(task.value);if(job)update(job.id,job.stage,job.message,{followup:{status:'pending',message:'后续追评已停止，尚未发送；可单独处理追评，作品无需重发'}});},
  });
  const enqueueFollowup=(job:PublishJob,receipt:MatrixPageActionReceipt)=>{
    if(receipt.verification?.state==='processing'&&job.followup?.status==='pending'&&job.followup.message!=='等待平台审核通过，追评尚未发送')update(job.id,job.stage,job.message,{followup:{...job.followup,message:'等待平台审核通过，追评尚未发送'}});
    if(receipt.manualVerification||['processing','rejected'].includes(receipt.verification?.state||''))return; // No comments before moderation completes.
    const request=requests.get(job.id);if(disposed||stopped||!deps.current()||!request?.config.comment.trim()||job.stage!=='confirmed'||job.workReferenceConflict||job.followup?.status==='confirmed'||['unknown','failed','save_failed'].includes(job.followup?.status||''))return;
    followups.enqueue({key:[job.id,job.attemptId,receipt.id,job.workReference?.workId||'pending-reference'].join(':'),accountId:job.accountId,value:{jobId:job.id,attemptId:job.attemptId,receipt,request:structuredClone(request)}});
  };
  const complete = (job: PublishJob, step: PublishExecutionStage) => {
    const current = jobs.find(item => belongsTo(item, [job]));
    if (current && !current.completedSteps?.includes(step)) update(job.id, current.stage, current.message, { completedSteps: [...(current.completedSteps || []), step] });
  };
  const observe = (job: PublishJob, result: MatrixPublishSyncResult) => {
    const mediaObservation = recoverMediaObservation({ at: result.observationAt || new Date().toISOString(), value: result.observation, stored: result.observationStored, warning: result.observationWarning });
    const current = jobs.find(item => belongsTo(item, [job]));
    if (!current || !mediaObservation || JSON.stringify([current.mediaObservation?.value, current.mediaObservation?.stored, current.mediaObservation?.warning]) === JSON.stringify([mediaObservation.value, mediaObservation.stored, mediaObservation.warning])) return;
    update(job.id, current.stage, current.message, { mediaObservation });
  };
  // Bound every pre-submit await, including IPC promises that never settle.
  // Abort local preparation loops too; a late result cannot resume this attempt.
  const bounded = <T,>(stage: PublishStage | 'remember' | 'cover' | 'diagnostic', action: (signal: AbortSignal) => Promise<T>, deadline = Infinity, platformLimit?:number): Promise<T> => {
    guard();
    const parent = executionAbort!.signal, child = new AbortController();
    const limits = { remember: 15000, preparing: 90000, uploading: 45000, filling: 20000, reviewing: 20000, cover: 90000, diagnostic: 4000 };
    const timeout = Math.min(deadline - Date.now(), deps.preparationTimeoutMs?.[stage] ?? platformLimit ?? limits[stage as keyof typeof limits] ?? 45000);
    if (timeout <= 0) return Promise.reject(Error(`${publishStageLabels[stage as PublishStage] || stage}阶段总等待超时，尚未提交；不会自动重复执行`));
    return new Promise<T>((resolve, reject) => {
      let finished = false;
      const finish = (fn: () => void) => { if (finished) return; finished = true; clearTimeout(timer); parent.removeEventListener('abort', abort); fn(); };
      const abort = () => finish(() => { child.abort(); reject(Error('任务已停止或登录用户已切换')); });
      const timer = setTimeout(() => finish(() => { child.abort(); reject(Error(`${stage === 'remember' ? '保存素材' : stage === 'cover' ? '处理封面' : stage === 'diagnostic' ? '读取诊断' : publishStageLabels[stage]}阶段超时，已停止本次操作；不会自动重复执行`)); }), timeout);
      parent.addEventListener('abort', abort, { once: true });
      if (parent.aborted) { abort(); return; }
      try { Promise.resolve(action(child.signal)).then(value => finish(() => resolve(value)), error => finish(() => reject(error))); }
      catch (error) { finish(() => reject(error)); }
    });
  };
  async function recover<T>(job: PublishJob, stage: PublishStage, action: (signal: AbortSignal) => Promise<T>, deadline = Infinity, executionStage?: PublishExecutionStage): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      guard();
      try { const result = await bounded(stage, action, deadline,stage==='filling'&&job.platform==='bilibili'?95000:undefined); guard(); return result; }
      catch (error) {
        guard(); const message = error instanceof Error ? error.message : String(error);
        const safeHomeNavigationRetry = stage === 'preparing' && /^视频号官方首页导航超时，尚未上传或提交/.test(message);
        if (attempt >= 2 || !(transientPublishError(message) || safeHomeNavigationRetry)) throw error;
        const retries = (jobs.find(item => item.id === job.id)?.autoRetries || 0) + 1;
        update(job.id, stage, `临时错误，自动恢复 ${attempt + 1}/2：${message}`, { autoRetries: retries, ...(executionStage ? { executionStage } : {}) });
        await deps.sleep(1500 * (attempt + 1));
      }
    }
  }
  async function submit(batchJobs: PublishJob[]) {
    const entries: MatrixPublishEntry[] = [];
    for (const job of batchJobs) {
      try {
        guard(); const input = inputs.get(job.id); if (!input) throw Error('官方页面已失效，请重新准备发布');
        const current = jobs.find(item => belongsTo(item, [job]));
        if (hasRequestedCovers(job) && !current?.completedSteps?.includes('cover')) throw Error('请求的封面步骤尚未完成；请继续剩余步骤，不能跳过封面直接发表');
        update(job.id, 'reviewing', '检查当前官方表单、上传结果和提交按钮');
        let progress: MatrixPublishSyncResult = {};
        const reviewDeadline = Date.now() + (deps.preparationTimeoutMs?.reviewingTotal ?? 90000);
        for (let attempt = 0; attempt < 60; attempt++) {
          progress = await recover(job, 'reviewing', async () => { const result = await deps.progress(input); if (result.error) throw Error(result.error); return result; }, reviewDeadline); guard();
          observe(job, progress);
          if (progress.validationErrors?.length) break;
          if (progress.uploadError || progress.ready && !progress.processing) break;
          await deps.sleep(1000);
        }
        if (progress.uploadError || progress.validationErrors?.length || !progress.ready || progress.processing) {
          const reason = progress.uploadError || (progress.validationErrors?.length ? '官方表单校验未通过：' + progress.validationErrors.join('；') : progress.processing ? '官方仍显示上传或处理中，等待超时，未点击发表' : '未识别到唯一可用的发表按钮，未点击发表');
          update(job.id, 'failed', `检查发布表单：${reason}`, { submission: 'not_submitted' }); continue;
        }
        const result = await recover(job, 'reviewing', async () => { const result = await deps.inspect({ ...input, taskId: job.id, attemptId: job.attemptId, expectedTitle: job.title, expectedVisibility: job.config?.options.visibility }); if ('error' in result && transientPublishError(result.error)) throw Error(result.error); return result; }); guard();
        if('error' in result&&await reconcileDepartedEditor(job,result.error))continue;
        if ('error' in result || result.candidates.length !== 1) {
          update(job.id, 'attention', `检查发布表单：${'error' in result ? result.error : result.candidates.length === 0 ? '未识别到可用的发布按钮，尚未提交' : '存在多个提交按钮，请在官方页面核对'}`, { submission:'not_submitted' });
          continue;
        }
        complete(job, 'reviewing');
        entries.push({ ...input, nonce: result.nonce, index: result.candidates[0].index });
      } catch (error) {
        guard();
        // Nothing has been submitted here. An account-scoped read/check error
        // must not mark other prepared accounts failed or discard their plans.
        if(await reconcileDepartedEditor(job,error instanceof Error?error.message:''))continue;
        update(job.id, 'failed', `检查发布表单：${error instanceof Error ? error.message : '官方表单检查失败，尚未提交'}`, { submission:'not_submitted' });
      }
    }
    if (!entries.length) return;
    batchJobs = batchJobs.filter(job => entries.some(entry => entry.accountId === job.accountId));
    guard();
    for (const job of batchJobs) update(job.id, 'submitting', '发布检查已通过，正在向平台提交');
    const submittedJobs = [...batchJobs];
    const unsettled = (job: PublishJob) => jobs.some(current=>belongsTo(current,[job])&&current.stage!=='confirmed'&&!knownFailedResult(current));
    for (const job of submittedJobs) pendingSubmissions.set(job.id,job.attemptId);
    try {
      let result: Awaited<ReturnType<Dependencies['submit']>>;
      try { result = await deps.submit(entries, batchJobs[0].batchId); }
      catch { for (const job of batchJobs.filter(unsettled)) update(job.id, 'unknown', '提交连接中断，无法确定平台结果；请核对官方页面，勿重复提交', { submission: 'uncertain' }); return; }
      // A failed progress event may already have allowed a new same-row attempt
      // to queue while this IPC was still pending. Late results belong only to
      // their original attempt, never to the replacement occupying the same ID.
      batchJobs = batchJobs.filter(job=>jobs.some(current=>belongsTo(current,[job])));
      if (!batchJobs.length) return;
      // A transport error after invoking submit is never safe to blindly retry.
      if (result.error) { for (const job of batchJobs.filter(unsettled)) update(job.id, 'unknown', result.error, { submission: 'uncertain' }); return; }
      if (result.cancelled) { for (const job of batchJobs.filter(unsettled)) update(job.id, 'attention', '本次提交已停止；尚未执行的账号可继续，不会重新上传素材'); return; }
      for (const item of result.results || []) {
        const job = batchJobs.find(job => job.accountId === item.accountId); if (!job) continue;
        const receipt = item.receipt;
        if (receipt) {
          if (receipt.taskId && receipt.taskId !== job.id || receipt.attemptId && receipt.attemptId !== job.attemptId || receipt.accountId && receipt.accountId !== job.accountId || receipt.platform && receipt.platform !== job.platform) {
            if(unsettled(job))update(job.id,'unknown','收到的回执与本条任务、执行次数或账号不一致，未套用结果；请核对官方作品，勿重发',{submission:'uncertain'}); continue;
          }
          const currentJob=jobs.find(current=>current.id===job.id&&current.attemptId===job.attemptId)||job;
          if(currentJob.stage==='confirmed'&&receipt.status!=='confirmed')continue;
          if(knownFailedResult(currentJob)&&currentJob.receiptId===receipt.id&&!['failed','confirmed'].includes(receipt.status))continue;
          if (receipt.status === 'confirmed') complete(job, 'submitting');
          observeDraftReceipt(job, receipt);
          const previousRef=normalizePublishWorkReference(job.platform,currentJob.workReference),incomingRef=(receipt.status==='confirmed'||receipt.acceptedAt)?normalizePublishWorkReference(job.platform,receipt.evidence):undefined;
          const workReferenceConflict=currentJob.workReferenceConflict||Boolean(previousRef&&incomingRef&&previousRef.workId!==incomingRef.workId);
          update(job.id, receipt.status === 'submitting' ? 'unknown' : receipt.status, receipt.message, { receiptId: receipt.id, completedAt: receipt.completedAt, acceptedAt: receipt.acceptedAt, verification:recoverVerification(receipt.verification), submission: receiptSubmission(receipt), workReference:previousRef||incomingRef,referenceCollection:receipt.referenceCollection,workReferenceConflict:workReferenceConflict||undefined });
          const confirmed=jobs.find(current=>current.id===job.id&&current.attemptId===job.attemptId);
          if(receipt.status==='confirmed'&&confirmed)enqueueFollowup(confirmed,receipt);
        } else {
          if(!unsettled(job))continue;
          const knownPreclickFailure = !item.mayHaveSubmitted && item.error && /遮挡|已变化|尚未就绪|超时|未识别|不唯一/.test(item.error) && !/验证码|本人验证|登录|封禁/.test(item.error);
          update(job.id, item.mayHaveSubmitted ? 'unknown' : knownPreclickFailure ? 'failed' : 'attention', item.error || '未提交，请核对后继续', { submission: item.mayHaveSubmitted ? 'uncertain' : 'not_submitted' });
        }
      }
      for (const accountId of result.remaining || []) { const job = batchJobs.find(job => job.accountId === accountId); if (job&&unsettled(job)) update(job.id, 'attention', '前一账号失败或结果不明，本账号未提交'); }
      const reported = new Set([...(result.results || []).map(item => item.accountId), ...(result.remaining || [])]);
      for (const job of batchJobs.filter(job => !reported.has(job.accountId)&&unsettled(job))) update(job.id, 'unknown', '平台提交回执缺失，不能确定结果；请核对官方作品列表，勿重发', { submission: 'uncertain' });
    } finally {
      for (const job of submittedJobs) if (pendingSubmissions.get(job.id) === job.attemptId) pendingSubmissions.delete(job.id);
      emit();
    }
  }
  async function executePlatform(batchJobs: PublishJob[], mode: 'prepare' | 'review' | 'continue') {
    try {
      if (mode !== 'review') for (const job of batchJobs) {
        guard(); const request = requests.get(job.id)!;
        if (mode === 'prepare' && request.config.schedule?.mode === 'local') {
          const due = Date.parse(request.config.schedule.at || '');
          if (!Number.isFinite(due)) throw Error('本机定时时间无效');
          update(job.id, 'scheduled', `计划 ${new Date(due).toLocaleString()} 开始准备，保持软件运行；检查通过后自动提交`);
          while (Date.now() < due) { guard(); await deps.sleep(Math.min(2000, due - Date.now())); }
        }
        if (mode === 'prepare') update(job.id, 'preparing', '在后台准备独立账号发布页面，可切换其他模块');
        try {
          if (jobs.some(other => other.id !== job.id && other.accountId === job.accountId && (other.stage === 'unknown' || other.stage === 'interrupted' && other.submission !== 'not_submitted' || inputs.has(other.id) && (other.stage === 'attention' || other.stage === 'failed' && other.mediaHandoff)))) throw Error('同账号另一个任务待核对或补全，本任务未提交，不会覆盖它的官方编辑器');
          let input = inputs.get(job.id);
          const completed = (step: PublishExecutionStage) => jobs.find(item => belongsTo(item,[job]))?.completedSteps?.includes(step) === true;
          if (mode === 'prepare' && deps.remember) {
            try { const saved = await bounded('remember', () => deps.remember!(request)); guard(); update(job.id, 'preparing', '已保留发布配置，正在准备账号页面', { recoveryId: saved.recoveryId, thumbnail: saved.thumbnail, recoveryWarning: saved.error }); }
            catch { guard(); update(job.id, 'preparing', '正在准备账号页面', { recoveryWarning: '本地素材引用保存失败，重启后需要重新选择' }); }
          }
          if (mode === 'prepare') {
            input = { ...await recover(job, 'preparing', signal => deps.prepare(request, signal)), taskId: job.id, attemptId: job.attemptId }; guard(); inputs.set(job.id, input);
            complete(job, 'preparing');
            update(job.id, 'uploading', '正在将所选素材交给官方上传控件');
            await recover(job, 'uploading', async signal => {
              update(job.id, 'uploading', '正在将所选素材交给官方上传控件', {mediaHandoff:{at:new Date().toISOString(),state:'uncertain'}});
              const upload = await deps.upload(input!, request.media); guard();
              if (signal.aborted) throw Error('素材交付操作已超时，迟到结果不会改变本条任务');
              if (!upload.uploadStarted && !upload.handoffUncertain) update(job.id,'uploading','官方控件尚未接收素材',{mediaHandoff:undefined});
              if (upload.error || !upload.uploadStarted || upload.handoffUncertain) throw Error(upload.uploadStarted || upload.handoffUncertain ? `素材已交付或交付结果未确认，已停止，不会自动重传：${upload.error || '等待官方上传结果'}` : upload.error || '上传未开始');
              handedOffAttempts.set(job.id,job.attemptId);
              update(job.id,'uploading','素材已交付官方控件，正在核对上传和媒体准备状态',{mediaHandoff:{at:new Date().toISOString(),state:'confirmed'}});
            }); guard();
          }
          if (!input || handedOffAttempts.get(job.id) !== job.attemptId) throw Error('本次素材交付会话不可恢复，不会重新上传或提交');
          const hasCovers = (request.config.covers || []).some(cover => cover.index !== 2 || request.account.platform === 'douyin');
          if (!completed('uploading') || mode === 'continue') {
            // Rechecking a retained upload is not another upload. Keep the
            // reached cover/fill phase and completed steps when following up.
            const mediaStage = completed('uploading') ? 'reviewing' : 'uploading';
            const mediaExecutionStage = completed('uploading') ? jobs.find(item => belongsTo(item,[job]))?.executionStage || 'reviewing' : 'uploading';
            update(job.id,mediaStage,'素材已经交付，继续核对官方上传和媒体状态；不会重新上传',{executionStage:mediaExecutionStage,completedAt:undefined});
            let stagnant = 0, readySamples = 0, lastProgress: string | undefined, unprovenSince: number | undefined;
            const recognitionMilestones = new Set<string>();
            const uploadDeadline = Date.now() + (deps.preparationTimeoutMs?.uploadingTotal ?? 600000);
            for (let attempt = 0; attempt < 300; attempt++) {
              guard(); const progress = await recover(job, mediaStage, async () => { const result = await deps.progress(input); if (result.error) throw Error(result.error); return result; }, uploadDeadline, mediaExecutionStage); guard();
              observe(job, progress);
              if (progress.uploadError) throw Error('上传素材失败：' + progress.uploadError);
              const fingerprint = JSON.stringify([progress.uploadPercent, progress.ready, progress.coverReady, progress.editorReady, progress.processing]);
              stagnant = fingerprint === lastProgress ? stagnant + 1 : 0; lastProgress = fingerprint;
              const unproven = progress.observation && ['waiting_layout','waiting_editor','waiting_media','waiting_preview','ambiguous_cover','waiting_submit'].includes(progress.observation.state);
              if (unproven) {
                const observation = progress.observation!;
                // Credit each genuine readiness milestone only once. Button
                // flicker/count oscillation cannot keep an idle task alive.
                const milestones = [observation.editorReady && 'editor', ...(['mediaElements','decodedMedia','coverContainers','coverImages','decodedCoverImages'] as const).filter(key=>observation[key]===1).map(key=>key)].filter(Boolean) as string[];
                if (milestones.some(key=>!recognitionMilestones.has(key))) unprovenSince = Date.now();
                milestones.forEach(key=>recognitionMilestones.add(key));
                unprovenSince ??= Date.now();
                if (Date.now() - unprovenSince >= (deps.preparationTimeoutMs?.observationIdle ?? 90000)) throw Error(`页面识别等待超时：${publishObservationSummary(progress.observation!)}；未观察到官方处理信号，不能判定为转码中；素材不会自动重传`);
              } else unprovenSince = undefined;
              if (!progress.observation && !progress.ready && !progress.processing && stagnant >= 15) throw Error('官方上传页面连续无进展，已停止等待；素材不会自动重传，请检查网络或官方提示');
              if (typeof progress.uploadPercent === 'number') update(job.id, mediaStage, progress.uploadPercent === 100 && progress.processing ? '素材上传100%，官方仍在转码 / 生成封面，尚未进入下一步' : `官方上传进度 ${progress.uploadPercent}%`, { uploadPercent: progress.uploadPercent,executionStage:mediaExecutionStage });
              if (typeof progress.uploadPercent !== 'number') update(job.id, mediaStage, progress.processing ? '官方正在上传或处理素材（平台未提供百分比）' : progress.observation ? publishObservationLabels[progress.observation.state] : '等待官方确认素材上传完成（平台未提供百分比）', { uploadPercent: undefined,executionStage:mediaExecutionStage });
              // A stale/contradictory readiness boolean must not skip an
              // explicit incomplete percentage or native busy observation.
              const incompletePercent=progress.uploadPercent!==undefined&&(!Number.isFinite(progress.uploadPercent)||progress.uploadPercent<100||progress.uploadPercent>100);
              const observedBusy=progress.observation&&(['uploading','processing','upload_failed'].includes(progress.observation.state)||progress.observation.busySignals.length>0);
              const editorMissing=progress.editorReady===false||progress.observation?.editorReady===false;
              const readyForNextStep = !progress.processing && !incompletePercent && !observedBusy && !editorMissing && (progress.mediaReady ?? (hasCovers ? progress.coverReady ?? progress.ready : progress.ready));
              readySamples = readyForNextStep ? readySamples + 1 : 0;
              if (readySamples >= 2) {
                complete(job, 'uploading');
                break;
              }
              if (attempt === 299) throw Error('等待上传或转码超时，请查看官方页面；不会自动重传');
              await deps.sleep(2000);
            }
          }
          if (!completed('filling')) {
            update(job.id, 'filling', '官方媒体预览已就绪，正在填写标题、简介和可见范围（尚未发布）');
            const form = await recover(job, 'filling', async () => { const result = await deps.fill(input, request.config); if (result.error) throw Error(result.error); return result; }); guard();
            if (form.unresolved?.length) {
              const fields: Record<string,string> = { title:'标题',body:'简介',visibility:'可见范围',category:'分类 / 分区',originality:'创作类型',tags:'标签',shortTitle:'短标题' };
              throw Error('填写作品信息未完成，请在官方页面补全：' + form.unresolved.map(reason => reason.replace(/^(title|body|visibility|category|originality|tags|shortTitle)(?=：)/, key => fields[key])).join('；'));
            }
            complete(job, 'filling');
          }
          // Filling can trigger a new validation/media pass. Re-read fresh facts,
          // but never re-upload or call fill repeatedly to conceal the failure.
          if (hasCovers && !completed('cover')) {
            update(job.id, 'reviewing', '作品信息已填入，确认官方封面编辑器就绪后再处理封面', { executionStage:'cover' });
            let coverSamples = 0;
            const deadline = Date.now() + (deps.preparationTimeoutMs?.reviewingTotal ?? 90000);
            for (let attempt = 0; attempt < 60; attempt++) {
              const progress = await recover(job, 'reviewing', () => deps.progress(input), deadline, 'cover'); guard(); observe(job, progress);
              if (progress.error || progress.uploadError || progress.validationErrors?.length) throw Error(progress.error || progress.uploadError || '官方表单校验未通过：' + progress.validationErrors!.join('；'));
              coverSamples = !progress.processing && (progress.coverReady ?? progress.ready) ? coverSamples + 1 : 0;
              if (coverSamples >= (request.account.platform === 'wechat' ? 2 : 1)) break;
              if (attempt === 59) throw Error('作品信息已填入，但官方封面编辑器未就绪，未处理封面或发表');
              await deps.sleep(1000);
            }
          }
          for (const cover of request.config.covers || []) {
            if (cover.index === 2 && request.account.platform !== 'douyin') continue;
            const states = coverStates.get(job.id) || new Map<number,'confirmed'|'uncertain'>(); coverStates.set(job.id,states);
            if (states.get(cover.index) === 'confirmed') continue;
            if (states.get(cover.index) === 'uncertain') throw Error(`封面 ${cover.index} 交付结果未确认，不会重复上传；请先核对官方封面`);
            guard(); update(job.id, 'reviewing', `正在处理封面：${cover.name}`, { executionStage: 'cover' });
            states.set(cover.index,'uncertain');
            const result = await bounded('cover', () => deps.cover?.(input, cover) || Promise.resolve(undefined)); guard();
            if (!result?.uploadStarted) states.delete(cover.index);
            if (result?.error || !result?.uploadStarted) throw Error(result?.error || '请在官方页面上传封面并核对裁剪');
            if (!result.coverConfirmed) throw Error('封面已上传但官方裁剪尚未确认，不会提前发布');
            states.set(cover.index,'confirmed');
          }
          if (hasCovers) complete(job, 'cover');
          const review = [request.config.schedule?.mode === 'official' ? `请在官方页面设置定时发布时间：${request.config.schedule.at}` : ''].filter(Boolean);
          if (review.length) throw Error(review.join('；'));
        } catch (error) {
          guard();
          // Early form failures must not hide cover/time requests: resume does not
          // re-upload or overwrite the user's manual edits in the official page.
          const pending = [
            request.config.covers?.length ? `请一并核对封面：${request.config.covers.filter(cover => cover.index !== 2 || request.account.platform === 'douyin').map(cover => cover.name).join('、')}` : '',
            request.config.schedule?.mode === 'official' ? `请一并设置官方定时：${request.config.schedule.at}` : '',
          ].filter(Boolean);
          const message = error instanceof Error ? error.message : '需要查看官方页面';
          if(await reconcileDepartedEditor(job,message))continue;
          // Retain bounded, read-only control metadata to diagnose DOM changes
          // without cookies, input values, arbitrary HTML or another upload.
          const input = inputs.get(job.id);
          let diagnostic: PublishJob['diagnostic'];
          if (deps.describe && input && !/验证码|登录|封禁|验证身份/.test(message)) {
            try {
              const details = await bounded('diagnostic', () => deps.describe!(input)); guard();
              const control = (c: MatrixPublishControlDiagnostic) => [c.tag, c.role, c.className, c.label].filter(value => typeof value === 'string').map(value => value!.slice(0, 160)).join(' | ');
              const controls = [
                ...(details.coverControls || []).slice(0, 15).map(c => [c.text, control(c), ...(c.parents || []).slice(0, 2).map(control)].join(' ← ')),
                ...(details.controls || []).slice(0, 20).map(control),
              ].map(value => value.slice(0, 700));
              if (controls.length) diagnostic = { at: new Date().toISOString(), controls };
            } catch { guard(); /* A diagnostic failure cannot hide the original error or hold the queue. */ }
          }
          const blockedUi = /窗口已最小化|封面(?:预览|编辑入口).*遮挡|未唯一识别对应封面编辑入口/.test(message);
          const requiresPerson = !blockedUi && /验证码|验证|登录|账号状态尚未就绪|请.*选择|请.*补全|请.*核对裁剪|封面.*(?:确认|入口)|官方定时|多个提交按钮|素材.*(?:失效|修改|移动)|已交付|交付结果未确认|限额|频繁|风控|同账号.*待核对/.test(message);
          const reached = jobs.find(item => belongsTo(item, [job]))?.executionStage || 'preparing';
          const reason = /Could not find node|Cannot find (?:context|object)|Execution context was destroyed/.test(message) ? `官方页面控件已失效（${message}）` : message;
          const specific = `${publishExecutionStageLabels[reached]}：${reason}`;
          update(job.id, requiresPerson ? 'attention' : 'failed', [requiresPerson ? specific : `尚未提交，可重发：${specific}`, ...pending].join('；'), { submission: 'not_submitted', diagnostic });
        }
      }
      guard();
      const currentJobs = jobs.filter(job => belongsTo(job, batchJobs));
      await submit(currentJobs.filter(job => mode === 'review' ? job.stage === 'attention' : activePublishStages.includes(job.stage)));
    } catch (error) {
      for (const job of jobs.filter(job => belongsTo(job, batchJobs) && activePublishStages.includes(job.stage))) update(job.id, job.stage === 'submitting' ? 'unknown' : stopped || disposed || !deps.current() ? 'cancelled' : 'failed', error instanceof Error ? error.message : '任务停止', { submission: job.stage === 'submitting' ? 'uncertain' : 'not_submitted' });
    }
  }
  async function execute(batchJobs: PublishJob[], mode: 'prepare' | 'review' | 'continue') {
    running = true; stopped = false;
    executionAbort = new AbortController();
    const byPlatform = new Map<PublishJob['platform'], PublishJob[]>();
    for (const job of batchJobs) {
      const lane = byPlatform.get(job.platform) || [];
      lane.push(job);
      byPlatform.set(job.platform, lane);
    }
    try {
      // Keep the per-work barrier. One platform's slow editor or receipt
      // cannot hold up the other platforms' submission of this work.
      await Promise.allSettled([...byPlatform.values()].map(lane => executePlatform(lane, mode)));
    } finally {
      if (stopped) for (const job of jobs.filter(job => belongsTo(job, batchJobs) && job.stage === 'attention')) update(job.id, 'cancelled', '已停止后续提交，不撤回官方已收到的内容');
      for (const job of jobs.filter(job => belongsTo(job, batchJobs) && activePublishStages.includes(job.stage))) update(job.id, 'attention', '本批次尚未提交完成，请查看官方页面后继续');
      completeDrafts();
      running = false;
      const succeeded = batchJobs.every(item => jobs.some(job => belongsTo(job, [item]) && job.stage === 'confirmed'));
      let next;
      while (pendingGroups.length) {
        const group = pendingGroups.shift()!;
        if (!stopped && !disposed && deps.current() && (succeeded || group.independent)) { next = group; break; }
        for (const job of group.jobs) update(job.id, 'cancelled', '本作品所属批次未完成或已停止，本作品未上传、未提交');
      }
      if (next) void execute(next.jobs, 'prepare');
      emit();
    }
  }
  const rememberPaused = async (job: PublishJob, peers: PublishJob[]) => {
    if (!deps.remember || disposed || !deps.current()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const saved = await Promise.race([deps.remember(requests.get(job.id)!), new Promise<never>((_, reject) => { const cancel = () => reject(Error('保存素材引用已结束')); timer = setTimeout(() => reject(Error('保存素材引用超时')), deps.preparationTimeoutMs?.remember ?? 15000); pausedSaveTimers.set(timer, cancel); })]);
      if (disposed || !deps.current()) return;
      for (const peer of peers) if (jobs.some(item => belongsTo(item,[peer]) && item.stage === 'paused')) update(peer.id, 'paused', '已暂停，尚未打开平台或上传；点击开始发布后执行', { recoveryId: saved.recoveryId, thumbnail: saved.thumbnail, recoveryWarning: saved.error });
    } catch { if (!disposed && deps.current()) for (const peer of peers) if (jobs.some(item => belongsTo(item,[peer]) && item.stage === 'paused')) update(peer.id, 'paused', '已暂停，尚未上传；本地素材引用未保存，重启后需重新选择素材', { recoveryWarning: '素材引用保存未确认；原文件未改动' }); }
    finally { if (timer) { clearTimeout(timer); pausedSaveTimers.delete(timer); } }
  };
  const launch = (groups: PublishRequest[][], retryOf?: string, controls?: PublishTaskControls) => {
    const controlsError = publishTaskControlsError(controls); if (controlsError) throw Error(controlsError);
    const settings = normalizePublishTaskControls(controls);
    if (running && !retryOf) throw Error('已有发布任务正在处理，请先查看进度');
    if (!groups.length || groups.reduce((sum, group) => sum + group.length, 0) > 100 || groups.some(group => !group.length || group.length > 20 || new Set(group.map(item => item.account.id)).size !== group.length)) throw Error('每条作品请选择 1 至 20 个不同账号，一次最多 100 个发布任务');
    if (disposed || !deps.current()) throw Error('请先登录远效');
    const items = groups.flat();
    const validation = collectPublishPreflight(items);
    if (validation.length) throw Error(validation.map(publishPreflightMessage).join('；'));
    followups.resume();
    if (retryOf && activeRetry(retryOf)) throw Error('这条任务已在重发或排队，请勿重复点击');
    if (retryOf && jobs.filter(job => activePublishStages.includes(job.stage)).length + items.length > 100) throw Error('重发排队已达到 100 条，请等待部分任务完成');
    if (jobs.some(job => job.id !== retryOf && inputs.has(job.id) && (job.stage === 'attention' || job.stage === 'failed' && job.mediaHandoff) && items.some(item => item.account.id === job.accountId))) throw Error('该账号还有待处理的发布，请先继续或结束旧任务，避免覆盖表单');
    const now = new Date().toISOString();
    const batches = groups.map(group => {
      const batchId = crypto.randomUUID();
      return group.map(item => {
        const previous = retryOf ? jobs.find(job => job.id === retryOf) : undefined;
        const id = previous?.id || crypto.randomUUID(), oldRequest = requests.get(id);
        const originalMedia = oldRequest?.media.id === item.media.id || !!item.originalRecoveryId && item.originalRecoveryId === previous?.recoveryId;
        const comparable = (config: PublishConfig | undefined) => JSON.stringify(item.originalRecoveryId ? { ...config, covers: config?.covers?.map(cover => ({ index: cover.index, name: cover.name })) || [] } : config);
        const draftPublication = previous && originalMedia && previous.mediaType === item.media.mediaType && JSON.stringify(previous.files) === JSON.stringify(item.media.files.map(file => file.name)) && comparable(previous.config) === comparable(item.config) ? normalizeDraftPublication(previous.draftPublication) : undefined;
        requests.set(id, structuredClone(item)); freshDraftReceipts.delete(id); inputs.delete(id); handedOffAttempts.delete(id); coverStates.delete(id);
        return { ...previous, id, batchId, batchName: previous?.batchName || settings.batchName, attemptId: crypto.randomUUID(), attemptNumber: (previous?.attemptNumber || (previous ? 1 : 0)) + 1, lastAttemptAt: now, executionStartedAt: undefined,
          executionStage: 'queued' as const, completedSteps: [], diagnostic: undefined, verification: undefined, acceptedAt: undefined, workReference:undefined,referenceCollection:undefined,workReferenceConflict:undefined,resultCheckOnly:undefined,mediaObservation: undefined, mediaHandoff: undefined, draftPublication, draftCleanupComplete: undefined, draftCleanupWarning: undefined,
          attempts: previous ? [...(previous.attempts || []), { attemptId: previous.attemptId, batchId: previous.batchId, stage: previous.stage, message: previous.message, receiptId: previous.receiptId, endedAt: previous.updatedAt }].slice(-40) : [],
          accountId: item.account.id, nickname: item.account.nickname || '未命名账号', avatarUrl: item.account.avatarUrl || previous?.avatarUrl, platform: item.account.platform, title: item.config.title, config: structuredClone(item.config), mediaType: item.media.mediaType, files: item.media.files.map(file => file.name), stage: 'queued' as const, submission: 'not_submitted' as const, message: running ? '已加入独立重发队列，等待执行；其他任务不受影响' : previous ? '正在重发，更新本条记录' : '已加入后台队列', createdAt: previous?.createdAt || now, updatedAt: now, history: previous?.history || [], receiptId: undefined, completedAt: undefined, uploadPercent: undefined, autoRetries: 0, withdrawal: undefined, followup: item.config.comment.trim() ? { status: 'pending' as const, message: '等待作品发布成功，追评尚未发送' } : undefined };
      });
    });
    if (!retryOf) { const references = draftPublicationRefs(items, batches.flat()); for (const job of batches.flat()) job.draftPublication = references.get(job.id); }
    jobs = retryOf ? jobs.map(job => job.id === retryOf ? batches[0][0] : job) : [...jobs, ...batches.flat()];
    if (!retryOf && settings.initialState === 'paused') {
      jobs = jobs.map(job => batches.flat().some(item => item.id === job.id) ? { ...job, stage: 'paused', executionStage: undefined, message: '已暂停，尚未打开平台或上传；正在保存本地素材引用' } : job);
      emit();
      const saves = new Map<string, PublishJob[]>();
      for (const job of batches.flat()) { const request = requests.get(job.id)!; const key = JSON.stringify([request.media.id, request.config.covers || []]); saves.set(key, [...(saves.get(key) || []), job]); }
      const pending = [...saves.values()];
      const worker = async () => { while (pending.length && !disposed && deps.current()) { const peers = pending.shift()!; await rememberPaused(peers[0], peers); } };
      void Promise.all([worker(), worker(), worker(), worker()]); return batches[0][0].batchId;
    }
    const groupsToRun = batches.map(group => ({ jobs: group, independent: Boolean(retryOf) }));
    if (running) pendingGroups.push(...groupsToRun);
    else { pendingGroups.push(...groupsToRun.slice(1)); void execute(batches[0], 'prepare'); }
    emit(); return batches[0][0].batchId;
  };
  return {
    get running() { return running; }, get jobs() { return jobs; },
    start(items: PublishRequest[], controls?: PublishTaskControls) { return launch([items], undefined, controls); },
    startMany(groups: PublishRequest[][], controls?: PublishTaskControls) { return launch(groups, undefined, controls); },
    startPaused(id: string, replacement?: PublishRequest) {
      if (disposed || !deps.current()) throw Error('登录用户已变化，未启动任务');
      const job = jobs.find(item => item.id === id);
      if (!job || !canStartPausedJob(job)) throw Error('只能启动明确尚未上传、尚未提交的暂停任务');
      if (jobs.filter(item => activePublishStages.includes(item.stage)).length >= 100) throw Error('当前执行和排队任务已达到100条，请等待部分任务结束');
      const request = replacement || requests.get(id);
      if (!request || request.account.id !== job.accountId || request.account.platform !== job.platform) throw Error('请恢复本条暂停任务的账号和素材');
      const validation = collectPublishPreflight([request]); if (validation.length) throw Error(validation.map(publishPreflightMessage).join('；'));
      requests.set(id, structuredClone(request));
      update(id, 'queued', running ? '本条暂停任务已加入独立队列，其他任务不受影响' : '已手动开始本条暂停任务', { config: structuredClone(request.config), files: request.media.files.map(file => file.name), mediaType: request.media.mediaType, lastAttemptAt: new Date().toISOString() });
      const ready = jobs.find(item => item.id === id)!;
      if (running) pendingGroups.push({ jobs: [ready], independent: true }); else void execute([ready], 'prepare');
    },
    resume(batchId: string) {
      if (running || disposed || !deps.current()) throw Error('当前无法继续发布');
      const pending = jobs.filter(job => job.batchId === batchId && job.stage === 'attention');
      if (!pending.length || pending.some(job => !inputs.has(job.id))) throw Error('没有可继续的本次会话，请核对平台结果后重新准备');
      void execute(pending, 'review');
    },
    canContinuePreparation,
    hasRetainedPreparation,
    isSubmissionPending,
    continuePreparation(id: string, options: { automaticCover?: boolean } = {}) {
      if (!canContinuePreparation(id)) throw Error('没有可安全继续的本次素材交付会话；不会重复上传或提交');
      let job = jobs.find(item => item.id === id)!;
      if (options.automaticCover) {
        const request = requests.get(id)!;
        if (job.mediaType !== 'video' || request.media.mediaType !== 'video' || isSubmissionPending(id)) throw Error('只能为明确未提交的视频改用自动封面');
        const config = { ...request.config, covers: [] };
        requests.set(id, { ...request, config });
        update(id, job.stage, '已改用平台自动封面，只继续本条未提交记录，不重新上传视频', { config, draftPublication: undefined, completedSteps: job.completedSteps?.filter(step => step !== 'cover') });
        job = jobs.find(item => item.id === id)!;
      }
      void execute([job], 'continue');
    },
    canResume(batchId: string) { const pending = jobs.filter(job => job.batchId === batchId && job.stage === 'attention'); return !running && pending.length > 0 && pending.every(job => inputs.has(job.id)); },
    discard(batchId: string) {
      if (running) throw Error('请先停止正在运行的任务');
      for (const job of jobs.filter(job => job.batchId === batchId && job.stage === 'attention')) { inputs.delete(job.id); requests.delete(job.id); handedOffAttempts.delete(job.id); coverStates.delete(job.id); update(job.id, 'cancelled', '已结束未提交的任务，不会撤回官方已收到的内容'); }
    },
    retry(id: string, replacement?: PublishRequest) {
      if (isSubmissionPending(id)) throw Error('本条提交回执仍在返回，请等待本次执行结束，不能提前重发');
      const job = jobs.find(job => job.id === id);
      if (!job || !canRetryPublishJob(job)) throw Error('仅未提交、明确失败或本人已核实未发布可重发；结果不明请先核对');
      const request = replacement || requests.get(id);
      if (!request) throw Error('请重新选择原素材后重试');
      if (request.account.id !== job.accountId || request.account.platform !== job.platform) throw Error('重试账号不一致');
      return launch([request].map(item => [item]), id);
    },
    activeRetry,
    retryRequest(id: string) { return requests.get(id); },
    trackFollowupOperation(value:Pick<PublishJob,'id'|'attemptId'|'receiptId'>){
      const job=jobs.find(job=>job.id===value.id&&job.attemptId===value.attemptId&&job.receiptId===value.receiptId&&job.stage==='confirmed');
      if(disposed||!deps.current()||!job||manualFollowups.has(job.id)||job.followup?.status==='running')throw Error('这条追评正在处理或所属发布记录已变化，请等待原操作结果');
      const lease=Symbol();manualFollowups.set(job.id,lease);emit();
      return()=>{if(manualFollowups.get(job.id)!==lease)return;manualFollowups.delete(job.id);if(!disposed&&deps.current())emit();};
    },
    hasFollowupOperation(id:string){return manualFollowups.has(id);},
    setFollowupIntent(value:Pick<PublishJob,'id'|'attemptId'|'receiptId'>,comment:string,pinComment:boolean){
      const job=jobs.find(item=>item.id===value.id&&item.attemptId===value.attemptId&&item.receiptId===value.receiptId&&item.stage==='confirmed');
      if(disposed||!deps.current()||!job||!job.config||!comment.trim()||comment.length>2000||manualFollowups.has(job.id)||['running','unknown','confirmed'].includes(job.followup?.status||''))throw Error('原作品或追评状态已变化，不能覆盖；请先核对原评论');
      update(job.id,job.stage,job.message,{config:{...job.config,comment:comment.trim(),pinComment},followup:{status:'pending',message:'已为原作品设置追评意图，尚未发表'}});
      return jobs.find(item=>item.id===job.id)!;
    },
    remove(id: string) {
      const job = jobs.find(job => job.id === id);
      if (job && (manualFollowups.has(id)||job.followup?.status==='running'||isSubmissionPending(id) || activePublishStages.includes(job.stage) || running && jobs.some(item => item.batchId === job.batchId && activePublishStages.includes(item.stage)))) throw Error('任务或追评运行中，不能删除记录');
      requests.delete(id); freshDraftReceipts.delete(id); inputs.delete(id); handedOffAttempts.delete(id); coverStates.delete(id); jobs = jobs.filter(job => job.id !== id); emit();
    },
    beginManualVerification(id:string,attemptId:string){
      const job=jobs.find(item=>item.id===id&&item.attemptId===attemptId);
      if(disposed||!deps.current()||running||!job||job.receiptId||!['failed','attention','interrupted','unknown'].includes(job.stage)||!['douyin','xiaohongshu'].includes(job.platform)||!job.mediaHandoff)throw Error('原任务仍在执行或已变化，未启动手动结果核对');
      inputs.delete(id);requests.delete(id);handedOffAttempts.delete(id);coverStates.delete(id);
      update(id,'unknown','已报告官网发布；正在只读核对原作品，禁止重传或继续提交',{submission:'uncertain',uploadPercent:undefined,completedAt:undefined,resultCheckOnly:true});
    },
    verificationFailed(id:string,attemptId:string|undefined,message:string){const job=jobs.find(item=>item.id===id&&item.attemptId===attemptId&&item.stage==='unknown');if(job)update(job.id,job.stage,job.message,{verification:{state:job.verification?.state==='processing'?'processing':/超时/.test(message)?'timeout':'error',message:(job.verification?.state==='processing'?'投稿已提交，审核结果暂未更新：':'')+message.slice(0,300),checkedAt:new Date().toISOString()}});},
    operationReceipt(receipt: MatrixPageActionReceipt) {
      if (receipt.kind === 'publish') {
        const job = jobs.find(job => job.id === receipt.taskId && job.accountId === receipt.accountId && job.platform === receipt.platform);
        const verification=recoverVerification(receipt.verification);
        if (!job || job.attemptId && receipt.attemptId !== job.attemptId || job.stage === 'confirmed' && receipt.status !== 'confirmed') return;
        // A late unknown/submitting snapshot must not revoke a definite
        // failure and hide its explicit retry action. Fresh positive evidence
        // may still correct an older failed record before the user retries.
        if(knownFailedResult(job)&&job.receiptId===receipt.id&&!['failed','confirmed'].includes(receipt.status))return;
        if(job.resultCheckOnly&&!receipt.manualVerification)return;
        const previousRef=normalizePublishWorkReference(job.platform,job.workReference), incomingRef=(receipt.status==='confirmed'||receipt.acceptedAt)?normalizePublishWorkReference(job.platform,receipt.evidence):undefined;
        const conflict=job.workReferenceConflict || Boolean(previousRef&&incomingRef&&previousRef.workId!==incomingRef.workId);
        const workReference=previousRef||incomingRef;
        observeDraftReceipt(job, receipt);
        if (job.receiptId === receipt.id && job.stage === receipt.status && job.message===receipt.message && job.acceptedAt===receipt.acceptedAt && JSON.stringify(job.verification)===JSON.stringify(verification) && JSON.stringify(job.workReference)===JSON.stringify(workReference) && JSON.stringify(job.referenceCollection)===JSON.stringify(receipt.referenceCollection) && Boolean(job.workReferenceConflict)===Boolean(conflict) && (!receipt.completedAt || job.completedAt === receipt.completedAt)) { completeDrafts();if(receipt.status==='confirmed')enqueueFollowup(job,receipt);return; }
        update(job.id, receipt.status === 'submitting' ? 'unknown' : receipt.status, receipt.message, { receiptId: receipt.id, completedAt: receipt.completedAt, acceptedAt: receipt.acceptedAt, verification, submission: receiptSubmission(receipt), workReference, referenceCollection:receipt.referenceCollection, workReferenceConflict:conflict||undefined,resultCheckOnly:job.resultCheckOnly||receipt.manualVerification||undefined, ...(conflict?{followup:{status:'unknown',message:'同一条发布回执出现不同作品ID，已停止关联追评；作品不会重发，请核对官方回执'}}:{}) });
        completeDrafts();
        const confirmed=jobs.find(current=>current.id===job.id&&current.attemptId===job.attemptId);if(receipt.status==='confirmed'&&confirmed)enqueueFollowup(confirmed,receipt);
        return;
      }
      const job = jobs.find(job => job.id === receipt.taskId && job.accountId === receipt.accountId && job.platform === receipt.platform && job.stage === 'confirmed');
      if (!job || !['comments', 'withdraw'].includes(receipt.kind) || job.attemptId&&receipt.attemptId!==job.attemptId) return;
      const key = receipt.kind === 'comments' ? 'followup' : 'withdrawal';
      if(key==='followup'&&(receipt.followupOf&&receipt.followupOf!==job.receiptId||job.followup?.status==='confirmed'&&receipt.status!=='confirmed'))return;
      if (job[key]?.receiptId === receipt.id && job[key]?.status === receipt.status &&job[key]?.message===receipt.message &&(key!=='followup'||JSON.stringify(job.followup?.pinResult)===JSON.stringify(receipt.pinResult)&&job.followup?.commentId===receipt.commentId&&job.followup?.commentText===receipt.summary&&job.followup?.commentDeleted===(receipt.commentDeleted===true)&&JSON.stringify(job.followup?.commentManagement)===JSON.stringify(receipt.commentManagement))) return;
      update(job.id, job.stage, job.message, { [key]: key==='followup'?publishFollowupReceipt(receipt):{ status: receipt.status === 'submitting' ? 'unknown' : receipt.status, message: receipt.message, receiptId: receipt.id } });
    },
    get followupsRunning(){return followups.running||manualFollowups.size>0;},
    stop() { stopped = true; followups.stop();executionAbort?.abort(); },
    dispose() { disposed = true; stopped = true; followups.dispose();manualFollowups.clear();freshDraftReceipts.clear(); for (const [timer, cancel] of pausedSaveTimers) { clearTimeout(timer); cancel(); } pausedSaveTimers.clear(); executionAbort?.abort(); },
    submittedProgress(event: { batchId: string; accountId: string; status: string; message: string }) {
      const job = jobs.find(job => job.batchId === event.batchId && job.accountId === event.accountId);
      // Display-only progress has no linked receipt/attempt proof. Only the
      // structured submit response or owned journal may finalize this row.
      if (job && isSubmissionPending(job.id) && activePublishStages.includes(job.stage) && ['submitting', 'confirmed', 'failed', 'unknown'].includes(event.status)) update(job.id, 'submitting', event.status === 'submitting' ? event.message : `官方阶段反馈：${event.message}；正在读取本条最终回执`, { submission: 'uncertain' });
    },
  };
}
