import { normalizePublishWorkReference } from '@shared/publish-work-reference';
import { boundedAccountCheck } from './async-account-checks';

// Separate read-only queue: never delays publish completion, retries a submit,
// or automatically starts a restored comment intention.
export function createReferenceCollection(deps: { current():boolean; collect(receipt:MatrixPageActionReceipt):Promise<{error?:string;receipt?:MatrixPageActionReceipt}>; apply(receipt:MatrixPageActionReceipt):void; delayMs?:number }) {
  const tasks = new Map<string, { receipt:MatrixPageActionReceipt; attempts:number; next:number; version:number; settled?:boolean; bindingChanged?:boolean }>(), accounts = new Set<string>(), bindings=new Map<string,string>();
  let disposed=false, active=0, timer:ReturnType<typeof setTimeout>|undefined;
  const valid=()=>!disposed&&deps.current();
  function pump() {
    if(!valid())return;
    if(timer){clearTimeout(timer);timer=undefined;}
    const at=Date.now();
    for(const [id,task] of tasks){
      if(active>=2)break;
      if(task.settled||task.attempts>=3||task.next>at||accounts.has(task.receipt.accountId))continue;
      task.attempts++; task.next=Infinity; active++;accounts.add(task.receipt.accountId);
      const requested=task.receipt, version=task.version;
      void boundedAccountCheck(()=>deps.collect(requested),50000,'作品编号读取超时；原发布状态保留').then(result=>{
        if(!valid()||task.settled||task.version!==version)return;
        if(result.receipt?.id===id&&result.receipt.accountId===requested.accountId&&result.receipt.attemptId===requested.attemptId&&result.receipt.platform===requested.platform){task.receipt=result.receipt;deps.apply(result.receipt);}
      }).catch(()=>{}).finally(()=>{
        active--;accounts.delete(task.receipt.accountId);
        if(!valid())return;
        // Retain the terminal marker: a delayed snapshot must not enqueue the
        // same successful/conflicting receipt again after this read completes.
        if(task.settled||normalizePublishWorkReference(task.receipt.platform,task.receipt.evidence)||task.receipt.referenceCollection?.state==='conflict'||task.receipt.status==='failed'){task.settled=true;task.next=Infinity;}
        else if(task.bindingChanged){task.bindingChanged=false;task.attempts=0;task.next=0;}
        else task.next=Date.now()+(deps.delayMs??15000)*2**(task.attempts-1);
        pump();
      });
    }
    // One clock snapshot prevents a future task becoming due between the
    // selection and timer scan, then disappearing from both branches.
    const next=[...tasks.values()].filter(task=>task.attempts<3&&Number.isFinite(task.next)&&task.next>at).map(task=>task.next);
    if(next.length)timer=setTimeout(pump,Math.max(50,Math.min(...next)-at));
  }
  return {
    bindingUpdated(accountId:string,signature:string){
      if(!valid()||!accountId||!signature||bindings.get(accountId)===signature)return;
      bindings.set(accountId,signature);
      // An old missing-identity failure must not remain exhausted after the
      // normal account observer has actually persisted that identity. Re-arm
      // once per changed binding, not on every avatar/statistics refresh.
      for(const task of tasks.values())if(!task.settled&&task.receipt.accountId===accountId){task.version++;if(task.next===Infinity)task.bindingChanged=true;else{task.attempts=0;task.next=0;}}
      pump();
    },
    enqueue(receipts:MatrixPageActionReceipt[]){
      if(!valid())return;
      for(const receipt of receipts){
        if(receipt.kind!=='publish')continue;
        const previous=tasks.get(receipt.id);
        if(previous&&(previous.receipt.accountId!==receipt.accountId||previous.receipt.attemptId!==receipt.attemptId||previous.receipt.platform!==receipt.platform))continue;
        const settled=receipt.status==='failed'||!!normalizePublishWorkReference(receipt.platform,receipt.evidence)||receipt.referenceCollection?.state==='conflict';
        // Bound session bookkeeping too; never evict a running/queued read.
        // The native durable receipt remains authoritative after an eviction.
        if(!previous&&tasks.size>=512){const old=[...tasks].find(([,task])=>task.settled||(task.attempts>=3&&Number.isFinite(task.next)));if(old)tasks.delete(old[0]);else continue;}
        if(settled){if(previous){previous.receipt=receipt;previous.settled=true;previous.version++;previous.next=Infinity;}else tasks.set(receipt.id,{receipt,attempts:3,next:Infinity,version:0,settled:true});continue;}
        if(!(receipt.status==='confirmed'||receipt.acceptedAt))continue;
        if(!previous)tasks.set(receipt.id,{receipt,attempts:0,next:0,version:0});
      }
      pump();
    },
    dispose(){disposed=true;if(timer)clearTimeout(timer);tasks.clear();bindings.clear();},
  };
}
