import type { AccountAvailability } from '@shared/account-availability';
import { checkAccountsIndependently } from './async-account-checks';

type AccountIdentity = { id: string; connectorSessionId?: string };
type CheckResult = AccountAvailability | {state:AccountAvailability;minimumDelayMs:number};
// A quiet owner-scoped scheduler. It can only request read-only health checks;
// no browser focus, login, binding, publication or unread mutation is available.
export function createAccountHealthRefresh<T extends AccountIdentity>(deps: {
  current(): boolean; paused(): boolean; load(signal: AbortSignal): Promise<T[]>;
  check(account: T): Promise<CheckResult>;
  onList(accounts: T[]): void; onStart(total: number, initial: boolean): void;
  onFinish(initial: boolean, error?: unknown): void; now?(): number;
}) {
  const now=deps.now||Date.now,controller=new AbortController();
  const next=new Map<string,{at:number;failures:number}>();
  let known:T[]=[],running=false,disposed=false,initialized=false,loadRetryAt=0;
  const key=(account:T)=>account.id+':'+account.connectorSessionId;
  const current=()=>!disposed&&deps.current();
  return {
    get running(){return running;},
    async tick(refreshList=false) {
      if(!current()||running||deps.paused()||!refreshList&&now()<loadRetryAt)return;
      if(initialized&&!refreshList&&known.every(account=>(next.get(key(account))?.at||0)>now()))return;
      running=true;const initial=!initialized;
      try {
        const all=await deps.load(controller.signal);if(!current())return;
        known=all.filter(account=>account.connectorSessionId);deps.onList(all);
        const keys=new Set(known.map(key));for(const old of next.keys())if(!keys.has(old))next.delete(old);
        const due=known.filter(account=>!next.has(key(account))||next.get(key(account))!.at<=now());
        deps.onStart(due.length,initial);initialized=true;loadRetryAt=0;
        await checkAccountsIndependently(due,async account=>{
          let state:AccountAvailability='unknown',minimumDelay=0;
          try{const result=await deps.check(account);state=typeof result==='string'?result:result.state;if(typeof result!=='string'&&Number.isSafeInteger(result.minimumDelayMs)&&result.minimumDelayMs>=0)minimumDelay=Math.min(60*60000,result.minimumDelayMs);}catch{/* The check owns its own cosmetic diagnostic. */}
          if(!current())return;
          const failures=state==='unknown'?(next.get(key(account))?.failures||0)+1:0;
          const delay=state==='normal'?30*60000:state==='unknown'?Math.min(60*60000,5*60000*2**Math.min(failures-1,4)):60*60000;
          next.set(key(account),{at:now()+Math.max(delay,minimumDelay),failures});
        },()=>current()&&!deps.paused(),2);
        if(current())deps.onFinish(initial);
      }catch(error){if(current()){loadRetryAt=now()+60000;deps.onFinish(initial,error);}}
      finally{running=false;}
    },
    dispose(){disposed=true;controller.abort();next.clear();},
  };
}
