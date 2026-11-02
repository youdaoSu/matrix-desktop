// Read-only independent checks: one unresponsive account must not serialize
// every later result or keep the whole application in an initializing state.
export async function boundedAccountCheck<T>(action: () => Promise<T>, timeoutMs = 55000, timeoutMessage = '本次核验超时，已结束等待；未确认发布结果，不会重发'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([Promise.resolve().then(action),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error(timeoutMessage)),timeoutMs);})]); }
  finally { if(timer)clearTimeout(timer); }
}
export async function checkAccountsIndependently<T>(items:T[], action:(item:T)=>Promise<void>, current:()=>boolean, concurrency=2) {
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{while(current()){const index=cursor++;if(index>=items.length)return;try{await action(items[index]);}catch{/* The caller owns each account's diagnostic. */}}}));
}
