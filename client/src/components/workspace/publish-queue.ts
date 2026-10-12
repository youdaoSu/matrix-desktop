import type { PlatformAccount } from '@shared/api.interface';
import type { PublishConfig } from '@shared/publish-config';

export type PublishStage = 'scheduled' | 'queued' | 'preparing' | 'uploading' | 'filling' | 'reviewing' | 'confirming' | 'submitting' | 'confirmed' | 'attention' | 'failed' | 'unknown' | 'cancelled' | 'interrupted';
export const publishStageLabels: Record<PublishStage, string> = { scheduled: '等待本机定时', queued: '排队中', preparing: '准备账号页面', uploading: '上传素材', filling: '填入作品信息', reviewing: '等待官方表单就绪', confirming: '等待最终确认', submitting: '正在提交', confirmed: '官方提示成功', attention: '需要处理', failed: '官方提示失败', unknown: '结果待核对', cancelled: '已停止', interrupted: '任务已中断' };
export const activePublishStages: PublishStage[] = ['scheduled', 'queued', 'preparing', 'uploading', 'filling', 'reviewing', 'confirming', 'submitting'];
export interface PublishJob {
  id: string; batchId: string; accountId: string; nickname: string; platform: PlatformAccount['platform']; title: string;
  files: string[]; stage: PublishStage; message: string; createdAt: string; updatedAt: string; uploadPercent?: number;
  history: { at: string; stage: PublishStage; message: string }[]; receiptId?: string;
  config?: PublishConfig; mediaType?: 'image' | 'video'; retryOf?: string;
  followup?: { status: 'pending' | 'save_failed' | 'confirmed' | 'failed' | 'unknown'; message: string; receiptId?: string };
  withdrawal?: { status: 'confirmed' | 'failed' | 'unknown'; message: string; receiptId?: string };
}
export interface PublishRequest { account: PlatformAccount; config: PublishConfig; media: MatrixMediaSelection; draft?: { id: string; updatedAt: string; accountIds: string[] } }
type Dependencies = {
  current(): boolean; changed(jobs: PublishJob[]): void; sleep(ms: number): Promise<void>;
  prepare(request: PublishRequest): Promise<MatrixPageActionInput>;
  upload(input: MatrixPageActionInput, media: MatrixMediaSelection): Promise<{ error?: string; uploadStarted?: boolean }>;
  cover?(input: MatrixPageActionInput, cover: { id: string; name: string; index: number }): Promise<{ error?: string; uploadStarted?: boolean }>;
  fill(input: MatrixPageActionInput, config: PublishConfig): Promise<MatrixPublishSyncResult>;
  progress(input: MatrixPageActionInput): Promise<MatrixPublishSyncResult>;
  inspect(input: MatrixPageActionInput): Promise<MatrixPageActionPlan | MatrixDesktopErrorResult>;
  submit(entries: MatrixPublishEntry[], batchId: string): ReturnType<NonNullable<Window['matrixDesktop']>['submitPublishBatch']>;
  followup(request: PublishRequest, receipt: MatrixPageActionReceipt): Promise<void>;
  completed?(requests: PublishRequest[]): void;
};

// Data from local storage is display-only: never restart an interrupted external action.
export function recoverPublishJobs(value: unknown): PublishJob[] {
  if (!Array.isArray(value)) return [];
  return value.filter(job => job && typeof job.id === 'string' && typeof job.batchId === 'string' && typeof job.accountId === 'string' && typeof job.nickname === 'string' && typeof job.message === 'string' && Array.isArray(job.files) && job.files.every((file: unknown) => typeof file === 'string') && Object.prototype.hasOwnProperty.call(publishStageLabels, job.stage) && Array.isArray(job.history)).map(job => activePublishStages.includes(job.stage)
    ? { ...job, stage: 'interrupted', uploadPercent: undefined, message: '软件或页面上次被关闭，任务未自动恢复。请先核对官方结果，避免重复发布。' } : job);
}

export function createPublishQueue(deps: Dependencies, initial: PublishJob[] = []) {
  let jobs = initial, running = false, stopped = false, disposed = false;
  let pendingGroups: PublishJob[][] = [];
  const requests = new Map<string, PublishRequest>(), inputs = new Map<string, MatrixPageActionInput>();
  const emit = () => deps.changed([...jobs]);
  const update = (id: string, stage: PublishStage, message: string, patch: Partial<PublishJob> = {}) => {
    jobs = jobs.map(job => job.id !== id ? job : { ...job, ...patch, stage, message, updatedAt: new Date().toISOString(), history: job.stage === stage && job.message === message ? job.history : [...job.history, { at: new Date().toISOString(), stage, message }].slice(-40) }); emit();
  };
  const guard = () => { if (disposed || stopped || !deps.current()) throw Error('任务已停止或登录用户已切换'); };
  async function submit(batchJobs: PublishJob[]) {
    const entries: MatrixPublishEntry[] = [];
    for (const job of batchJobs) {
      guard(); const input = inputs.get(job.id); if (!input) throw Error('官方页面已失效，请重新准备发布');
      update(job.id, 'reviewing', '检查当前官方表单、上传结果和提交按钮');
      const progress = await deps.progress(input); guard();
      if (progress.error || progress.uploadError || !progress.ready) { update(job.id, 'attention', progress.error || progress.uploadError || '官方上传 / 转码或表单尚未就绪，请处理后继续'); return; }
      const result = await deps.inspect(input); guard();
      if ('error' in result || result.candidates.length !== 1) {
        update(job.id, 'attention', 'error' in result ? result.error : '存在多个提交按钮，请在官方页面核对');
        return;
      }
      entries.push({ ...input, nonce: result.nonce, index: result.candidates[0].index });
    }
    guard();
    for (const job of batchJobs) update(job.id, 'confirming', '素材和文案已准备；请核对一次最终发布确认');
    let result: Awaited<ReturnType<Dependencies['submit']>>;
    try { result = await deps.submit(entries, batchJobs[0].batchId); }
    catch { for (const job of batchJobs) update(job.id, 'unknown', '提交连接中断，无法确定平台结果；请核对官方页面，勿重复提交'); return; }
    if (result.error) { for (const job of batchJobs) update(job.id, 'attention', result.error); return; }
    if (result.cancelled) { for (const job of batchJobs) update(job.id, 'attention', '未确认提交；可核对官方页面后继续，不会重新上传素材'); return; }
    for (const item of result.results || []) {
      const job = batchJobs.find(job => job.accountId === item.accountId); if (!job) continue;
      const receipt = item.receipt;
      if (receipt) {
        update(job.id, receipt.status === 'submitting' ? 'unknown' : receipt.status, receipt.message, { receiptId: receipt.id });
        const request = requests.get(job.id);
        if (receipt.status === 'confirmed' && request?.config.comment.trim() && deps.current()) {
          try { await deps.followup(request, receipt); update(job.id, 'confirmed', receipt.message, { followup: { status: 'pending', message: '追评待发表，已保存待办；尚未发送' } }); }
          catch { update(job.id, 'confirmed', receipt.message, { followup: { status: 'save_failed', message: '追评待办保存失败，尚未发送；作品无需重发' } }); }
        }
      } else update(job.id, item.mayHaveSubmitted ? 'unknown' : 'attention', item.error || '未提交，请核对后继续');
    }
    for (const accountId of result.remaining || []) { const job = batchJobs.find(job => job.accountId === accountId); if (job) update(job.id, 'attention', '前一账号失败或结果不明，本账号未提交'); }
  }
  async function execute(batchJobs: PublishJob[], resume: boolean) {
    running = true; stopped = false;
    try {
      if (!resume) for (const job of batchJobs) {
        guard(); const request = requests.get(job.id)!;
        if (request.config.schedule?.mode === 'local') {
          const due = Date.parse(request.config.schedule.at || '');
          if (!Number.isFinite(due)) throw Error('本机定时时间无效');
          update(job.id, 'scheduled', `计划 ${new Date(due).toLocaleString()} 开始准备，保持软件运行；提交时仍需确认`);
          while (Date.now() < due) { guard(); await deps.sleep(Math.min(2000, due - Date.now())); }
        }
        update(job.id, 'preparing', '在后台准备独立账号发布页面，可切换其他模块');
        try {
          const input = await deps.prepare(request); guard(); inputs.set(job.id, input);
          update(job.id, 'uploading', '正在将所选素材交给官方上传控件');
          const upload = await deps.upload(input, request.media); guard();
          if (upload.error || !upload.uploadStarted) throw Error(upload.error || '上传未开始');
          let filled = false;
          for (let attempt = 0; attempt < 150; attempt++) {
            guard(); const progress = await deps.progress(input); guard();
            if (progress.error) throw Error(progress.error);
            if (progress.uploadError) throw Error(progress.uploadError);
            if (typeof progress.uploadPercent === 'number') update(job.id, 'uploading', `官方上传进度 ${progress.uploadPercent}%`, { uploadPercent: progress.uploadPercent });
            if (!filled) {
              const result = await deps.fill(input, request.config); guard();
              if (result.error) throw Error(result.error);
              if (!result.unresolved?.length) { filled = true; update(job.id, 'filling', '标题和文案已填入，等待官方页面可提交'); }
              else if (result.filled?.length || attempt >= 14) throw Error('请在官方页面补全：' + result.unresolved.join('；'));
            }
            if (filled && progress.ready) { update(job.id, 'reviewing', '官方表单出现可用提交按钮；最终结果仍以官方提示为准'); break; }
            if (attempt === 149) throw Error('等待上传或转码超时，请查看官方页面；不会自动重传');
            await deps.sleep(2000);
          }
          for (const cover of request.config.covers || []) {
            if (cover.index === 2 && request.account.platform !== 'douyin') continue;
            guard(); const result = await deps.cover?.(input, cover); guard();
            if (result?.error || !result?.uploadStarted) throw Error(result?.error || '请在官方页面上传封面并核对裁剪');
          }
          const review = [request.config.covers?.length ? '请核对封面上传及裁剪结果' : '', request.config.schedule?.mode === 'official' ? `请在官方页面设置定时发布时间：${request.config.schedule.at}` : ''].filter(Boolean);
          if (review.length) throw Error(review.join('；'));
        } catch (error) {
          guard();
          // Early form failures must not hide cover/time requests: resume does not
          // re-upload or overwrite the user's manual edits in the official page.
          const pending = [
            request.config.covers?.length ? `请一并核对封面：${request.config.covers.filter(cover => cover.index !== 2 || request.account.platform === 'douyin').map(cover => cover.name).join('、')}` : '',
            request.config.schedule?.mode === 'official' ? `请一并设置官方定时：${request.config.schedule.at}` : '',
          ].filter(Boolean);
          update(job.id, 'attention', [error instanceof Error ? error.message : '需要查看官方页面', ...pending].join('；'));
        }
      }
      guard();
      const currentJobs = jobs.filter(job => batchJobs.some(item => item.id === job.id));
      if (!resume && currentJobs.some(job => job.stage === 'attention')) {
        for (const job of currentJobs.filter(job => activePublishStages.includes(job.stage))) update(job.id, 'attention', '本批次有账号需要处理，未自动提交；补全后可继续');
      } else await submit(currentJobs);
    } catch (error) {
      for (const job of jobs.filter(job => batchJobs.some(item => item.id === job.id) && activePublishStages.includes(job.stage))) update(job.id, job.stage === 'submitting' ? 'unknown' : 'cancelled', error instanceof Error ? error.message : '任务停止');
    } finally {
      if (stopped) for (const job of jobs.filter(job => batchJobs.some(item => item.id === job.id) && job.stage === 'attention')) update(job.id, 'cancelled', '已停止后续提交，不撤回官方已收到的内容');
      for (const job of jobs.filter(job => batchJobs.some(item => item.id === job.id) && activePublishStages.includes(job.stage))) update(job.id, 'attention', '本批次尚未提交完成，请查看官方页面后继续');
      if (!disposed && deps.current() && jobs.filter(job => batchJobs.some(item => item.id === job.id)).every(job => job.stage === 'confirmed')) { try { deps.completed?.(batchJobs.map(job => requests.get(job.id)!).filter(Boolean)); } catch { /* Draft cleanup cannot turn a successful publication into a failure. */ } }
      running = false;
      if (pendingGroups.length && !stopped && !disposed && deps.current() && jobs.filter(job => batchJobs.some(item => item.id === job.id)).every(job => job.stage === 'confirmed')) {
        void execute(pendingGroups.shift()!, false);
      } else {
        for (const group of pendingGroups) for (const job of group) update(job.id, 'cancelled', '前一组尚未完成或已停止，本作品未上传、未提交');
        pendingGroups = [];
      }
      emit();
    }
  }
  const launch = (groups: PublishRequest[][]) => {
    if (running) throw Error('已有发布任务正在处理，请先查看进度');
    if (!groups.length || groups.reduce((sum, group) => sum + group.length, 0) > 100 || groups.some(group => !group.length || group.length > 20 || new Set(group.map(item => item.account.id)).size !== group.length)) throw Error('每条作品请选择 1 至 20 个不同账号，一次最多 100 个发布任务');
    if (disposed || !deps.current()) throw Error('请先登录矩效');
    const items = groups.flat();
    if (jobs.some(job => job.stage === 'attention' && inputs.has(job.id) && items.some(item => item.account.id === job.accountId))) throw Error('该账号还有待处理的发布，请先继续或结束旧任务，避免覆盖表单');
    const now = new Date().toISOString();
    const batches = groups.map(group => {
      const batchId = crypto.randomUUID();
      return group.map(item => {
        const id = crypto.randomUUID(); requests.set(id, structuredClone(item));
        return { id, batchId, accountId: item.account.id, nickname: item.account.nickname || '未命名账号', platform: item.account.platform, title: item.config.title, config: structuredClone(item.config), mediaType: item.media.mediaType, files: item.media.files.map(file => file.name), stage: 'queued' as const, message: '已加入后台队列', createdAt: now, updatedAt: now, history: [], ...(item.config.comment.trim() ? { followup: { status: 'pending' as const, message: '等待作品发布成功，追评尚未发送' } } : {}) };
      });
    });
    jobs = [...jobs, ...batches.flat()]; pendingGroups = batches.slice(1); emit(); void execute(batches[0], false); return batches[0][0].batchId;
  };
  return {
    get running() { return running; }, get jobs() { return jobs; },
    start(items: PublishRequest[]) { return launch([items]); },
    startMany(groups: PublishRequest[][]) { return launch(groups); },
    resume(batchId: string) {
      if (running || disposed || !deps.current()) throw Error('当前无法继续发布');
      const pending = jobs.filter(job => job.batchId === batchId && job.stage === 'attention');
      if (!pending.length || pending.some(job => !inputs.has(job.id))) throw Error('没有可继续的本次会话，请核对平台结果后重新准备');
      void execute(pending, true);
    },
    canResume(batchId: string) { const pending = jobs.filter(job => job.batchId === batchId && job.stage === 'attention'); return !running && pending.length > 0 && pending.every(job => inputs.has(job.id)); },
    discard(batchId: string) {
      if (running) throw Error('请先停止正在运行的任务');
      for (const job of jobs.filter(job => job.batchId === batchId && job.stage === 'attention')) { inputs.delete(job.id); requests.delete(job.id); update(job.id, 'cancelled', '已结束未提交的任务，不会撤回官方已收到的内容'); }
    },
    retry(id: string, replacement?: PublishRequest) {
      const job = jobs.find(job => job.id === id);
      if (!job || job.stage !== 'failed') throw Error('只有平台明确提示失败的作品可以重发；结果不明请先核对');
      const request = replacement || requests.get(id);
      if (!request) throw Error('请重新选择原素材后重试');
      if (request.account.id !== job.accountId || request.account.platform !== job.platform) throw Error('重试账号不一致');
      const batchId = this.start([request]);
      jobs = jobs.map(item => item.batchId === batchId ? { ...item, retryOf: id } : item); emit(); return batchId;
    },
    retryRequest(id: string) { return requests.get(id); },
    remove(id: string) {
      const job = jobs.find(job => job.id === id);
      if (job && (activePublishStages.includes(job.stage) || running && jobs.some(item => item.batchId === job.batchId && activePublishStages.includes(item.stage)))) throw Error('任务运行中，不能删除记录');
      requests.delete(id); inputs.delete(id); jobs = jobs.filter(job => job.id !== id); emit();
    },
    operationReceipt(receipt: MatrixPageActionReceipt) {
      const job = jobs.find(job => job.id === receipt.taskId && job.accountId === receipt.accountId && job.platform === receipt.platform && job.stage === 'confirmed');
      if (!job || !['comments', 'withdraw'].includes(receipt.kind)) return;
      const key = receipt.kind === 'comments' ? 'followup' : 'withdrawal';
      if (job[key]?.receiptId === receipt.id && job[key]?.status === receipt.status) return;
      update(job.id, job.stage, job.message, { [key]: { status: receipt.status === 'submitting' ? 'unknown' : receipt.status, message: receipt.message, receiptId: receipt.id } });
    },
    stop() { stopped = true; },
    dispose() { disposed = true; stopped = true; },
    submittedProgress(event: { batchId: string; accountId: string; status: string; message: string }) {
      const job = jobs.find(job => job.batchId === event.batchId && job.accountId === event.accountId);
      if (job && activePublishStages.includes(job.stage) && ['submitting', 'confirmed', 'failed', 'unknown'].includes(event.status)) update(job.id, event.status as PublishStage, event.message);
    },
  };
}
