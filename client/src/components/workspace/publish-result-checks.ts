import type { PublishJob } from './publish-queue';
import { boundedAccountCheck } from './async-account-checks';

// One automatic read for uncertain attempts; accepted submissions get bounded
// moderation reads independently of any follow-up comment. Unrelated
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
  const reviewTimers=new Map<string,ReturnType<typeof setTimeout>>(),reviewReads=new Map<string,number>(),inFlight=new Set<string>(),reviewStopped=new Set<string>();
  const reviewDelays=(deps.reviewDelaysMs??[15000,30000,60000,120000,300000,600000]).slice(0,6);
  let disposed = false, active = 0;
  const current = () => !disposed && deps.current();
  const key = (receipt: MatrixPageActionReceipt) => JSON.stringify([receipt.id, receipt.taskId, receipt.attemptId, receipt.accountId, receipt.platform]);
  const belongs = (receipt: MatrixPageActionReceipt) => {
    const job = receipt.taskId ? deps.job(receipt.taskId) : undefined;
    return job && job.receiptId === receipt.id && job.attemptId === receipt.attemptId && job.accountId === receipt.accountId && job.platform === receipt.platform && (job.stage === 'unknown' || job.stage === 'interrupted' && job.submission === 'uncertain' || job.stage==='confirmed'&&job.verification?.state==='processing');
  };
  const scheduleReview=(receipt:MatrixPageActionReceipt)=>{
    const job=receipt.taskId?deps.job(receipt.taskId):undefined,id=key(receipt),index=reviewReads.get(id)??0;
    const age=Date.now()-Date.parse(receipt.acceptedAt||receipt.createdAt);
    // Resume recent pending moderation after restart, including last night's
    // work. No re-upload, no comment prerequisite, no retry of an unresolved
    // identity/login read. Repeated events cannot replenish the read budget.
    if(!current()||!job||!belongs(receipt)||receipt.manualVerification||receipt.status!=='confirmed'||receipt.verification?.state!=='processing'||receipt.checkpoint==='verification_finished'||!Number.isFinite(age)||age<0||age>7*86400000||index>=reviewDelays.length||reviewTimers.has(id)||pending.has(id)||inFlight.has(id)||reviewStopped.has(id))return;
    reviewReads.set(id,index+1);
    reviewTimers.set(id,setTimeout(()=>{reviewTimers.delete(id);if(current()&&belongs(receipt)){pending.set(id,receipt);pump();}},reviewDelays[index]));
  };
  const pump = () => {
    while (current() && active < 2 && pending.size) {
      const [id, receipt] = pending.entries().next().value!;
      pending.delete(id);
      if (!belongs(receipt)) continue;
      active++;inFlight.add(id);
      void (async () => {
        let next:MatrixPageActionReceipt|undefined;
        try {
          const result = await boundedAccountCheck(() => deps.verify(receipt), deps.timeoutMs ?? 55000);
          if (!current() || !belongs(receipt)) return;
          if (result.receipt?.kind === 'publish' && key(result.receipt) === id) {deps.apply(result.receipt);next=result.receipt;if(next.checkpoint==='verification_finished')reviewStopped.add(id);}
          else {reviewStopped.add(id);deps.failed(receipt.taskId!, receipt.attemptId, result.error || '核对返回的记录不属于本条尝试；本次等待已结束，请核对原作品');}
        } catch (error) {
          if(current())reviewStopped.add(id);
          if (current() && belongs(receipt)) deps.failed(receipt.taskId!, receipt.attemptId, error instanceof Error ? error.message : '本次核对已结束，未确认官方结果');
        } finally { active--;inFlight.delete(id);if(next)scheduleReview(next);pump(); }
      })();
    }
  };
  return {
    enqueue(receipts: MatrixPageActionReceipt[]) {
      if (!current()) return;
      for (const receipt of receipts) {
        if (receipt.kind !== 'publish' || !['unknown', 'submitting','confirmed'].includes(receipt.status) || !belongs(receipt)) continue;
        const id = key(receipt);
        // An uncertain attempt may later receive its acceptance event. Its
        // one-shot lookup being seen must not suppress moderation scheduling.
        if(receipt.status==='confirmed'){scheduleReview(receipt);continue;}
        if (seen.has(id)) continue;
        seen.add(id);
        pending.set(id, receipt);
      }
      pump();
    },
    dispose() { disposed = true; pending.clear(); seen.clear();for(const timer of reviewTimers.values())clearTimeout(timer);reviewTimers.clear();reviewReads.clear();reviewStopped.clear();inFlight.clear(); },
  };
}
