export interface FollowupTask<T> { key: string; accountId: string; value: T }

// Publication has already succeeded. Followups must not keep the publisher's
// queue busy, overlap the same account, or replay after restart/owner changes.
export function createPublishFollowupScheduler<T,R>(deps: {
  current(): boolean;
  run(task: FollowupTask<T>): Promise<R>;
  started(task: FollowupTask<T>): void;
  result(task: FollowupTask<T>, result: R): void;
  failed(task: FollowupTask<T>, message: string, timedOut: boolean): void;
  stopped(task: FollowupTask<T>): void;
  timeoutMs?: number;
}) {
  const pending: FollowupTask<T>[] = [], seen = new Set<string>(), accounts = new Set<string>(), cancels = new Set<() => void>();
  let disposed=false,stopped=false;
  const current=()=>!disposed&&deps.current();
  const pump=()=>{
    if(!current()||stopped)return;
    while(accounts.size<2){
      const index=pending.findIndex(task=>!accounts.has(task.accountId));if(index<0)return;
      const [task]=pending.splice(index,1);accounts.add(task.accountId);deps.started(task);
      let timer:ReturnType<typeof setTimeout>|undefined,finished=false,begun=false;
      const finish=(action?:()=>void)=>{
        if(finished)return;finished=true;clearTimeout(timer);cancels.delete(cancel);accounts.delete(task.accountId);
        if(current())action?.();pump();
      };
      const cancel=()=>finish();cancels.add(cancel);
      timer=setTimeout(()=>finish(()=>deps.failed(task,'追评等待超过上限，请只核对原评论；作品无需重发，也不会自动重复发送',true)),deps.timeoutMs??60000);
      void Promise.resolve().then(()=>{if(!current()||finished||stopped)throw Error('后续追评已停止');begun=true;return deps.run(task);}).then(value=>finish(()=>deps.result(task,value)),error=>finish(()=>stopped&&!begun?deps.stopped(task):deps.failed(task,error instanceof Error?error.message:'追评处理失败，请核对原评论',false)));
    }
  };
  return {
    get running(){return accounts.size>0;},
    enqueue(task:FollowupTask<T>){if(!current()||stopped||seen.has(task.key))return false;seen.add(task.key);pending.push(task);pump();return true;},
    resume(){if(disposed)return;stopped=false;pump();},
    stop(){stopped=true;for(const task of pending.splice(0))if(current())deps.stopped(task);},
    dispose(){disposed=true;pending.splice(0);for(const cancel of [...cancels])cancel();},
  };
}
