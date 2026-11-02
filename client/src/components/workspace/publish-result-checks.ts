import type { PublishJob } from './publish-queue';
import { boundedAccountCheck } from './async-account-checks';

// One automatic read for uncertain attempts; fresh accepted submissions with
// a configured comment get at most three spaced moderation reads. Unrelated
// receipt events never reset either budget. Explicit refresh remains available.
export function createPublishResultChecks(deps: {
  current(): boolean;
  job(id: string): PublishJob | undefined;
  verify(receipt: MatrixPageActionReceipt): Promise<{ receipt?: MatrixPageActionReceipt; error?: string }>;
  apply(receipt: MatrixPageActionReceipt): void;
  failed(id: string, attemptId: string | undefined, message: string): void;
  timeoutMs?: number;
  reviewDelaysMs?: readonly number[];
}) {
  const seen = new Set<string>(), pending = new Map<string, MatrixPageActionReceipt>();
  const reviewTimers=new Map<string,ReturnType<typeof setTimeout>>(),reviewReads=new Map<string,number>();
  const reviewDelays=(deps.reviewDelaysMs??[30000,60000,120000]).slice(0,3);
  let disposed = false, active = 0;
  const current = () => !disposed && deps.current();
  const key = (receipt: MatrixPageActionReceipt) => JSON.stringify([receipt.id, receipt.taskId, receipt.attemptId, receipt.accountId, receipt.platform]);
  const belongs = (receipt: MatrixPageActionReceipt) => {
    const job = receipt.taskId ? deps.job(receipt.taskId) : undefined;
    return job && job.receiptId === receipt.id && job.attemptId === receipt.attemptId && job.accountId === receipt.accountId && job.platform === receipt.platform && (job.stage === 'unknown' || job.stage === 'interrupted' && job.submission === 'uncertain' || job.stage==='confirmed'&&job.verification?.state==='processing');
  };
  const scheduleReview=(receipt:MatrixPageActionReceipt)=>{
    const job=receipt.taskId?deps.job(receipt.taskId):undefined,id=key(receipt),index=reviewReads.get(id)??0;
    const age=Date.now()-Date.parse(receipt.createdAt);
    // Only fresh, accepted submissions with an existing comment intent get
    // three spaced read-only checks. Errors, old/manual records and exhausted
    // attempts cannot turn receipt events into an unbounded polling loop.
    if(!current()||!job||!belongs(receipt)||receipt.manualVerification||receipt.status!=='confirmed'||receipt.verification?.state!=='processing'||receipt.checkpoint==='verification_finished'||!job.config?.comment.trim()||!Number.isFinite(age)||age<0||age>30*60000||index>=reviewDelays.length||reviewTimers.has(id))return;
    reviewReads.set(id,index+1);
    reviewTimers.set(id,setTimeout(()=>{reviewTimers.delete(id);if(current()&&belongs(receipt)){pending.set(id,receipt);pump();}},reviewDelays[index]));
  };
  const pump = () => {
    while (current() && active < 2 && pending.size) {
      const [id, receipt] = pending.entries().next().value!;
      pending.delete(id);
      if (!belongs(receipt)) continue;
      active++;
      void (async () => {
        try {
          const result = await boundedAccountCheck(() => deps.verify(receipt), deps.timeoutMs ?? 55000);
          if (!current() || !belongs(receipt)) return;
          if (result.receipt?.kind === 'publish' && key(result.receipt) === id) {deps.apply(result.receipt);scheduleReview(result.receipt);}
          else deps.failed(receipt.taskId!, receipt.attemptId, result.error || '核对返回的记录不属于本条尝试；本次等待已结束，请核对原作品');
        } catch (error) {
          if (current() && belongs(receipt)) deps.failed(receipt.taskId!, receipt.attemptId, error instanceof Error ? error.message : '本次核对已结束，未确认官方结果');
        } finally { active--; pump(); }
      })();
    }
  };
  return {
    enqueue(receipts: MatrixPageActionReceipt[]) {
      if (!current()) return;
      for (const receipt of receipts) {
        if (receipt.kind !== 'publish' || !['unknown', 'submitting','confirmed'].includes(receipt.status) || !belongs(receipt)) continue;
        const id = key(receipt);
        if (seen.has(id)) continue;
        seen.add(id);
        if(receipt.status==='confirmed')scheduleReview(receipt);else pending.set(id, receipt);
      }
      pump();
    },
    dispose() { disposed = true; pending.clear(); seen.clear();for(const timer of reviewTimers.values())clearTimeout(timer);reviewTimers.clear();reviewReads.clear(); },
  };
}
