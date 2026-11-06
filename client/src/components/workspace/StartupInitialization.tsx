import { useEffect, useRef, useState } from 'react';
import { axiosForBackend, getAuthToken, getUser } from '@/api';
import type { PlatformAccount } from '@shared/api.interface';
import { recordAccountObservation } from './account-observations';
import { boundedAccountCheck } from './async-account-checks';
import { createAccountHealthRefresh } from './account-health-refresh';
import type { AccountAvailability } from '@shared/account-availability';
import { loadPublishAccounts } from './publish-preferences';
import { notifyAccountDataUpdated } from './account-data-events';
export function StartupInitialization({onList,onAccount,paused=false}:{onList(accounts:PlatformAccount[]):void;onAccount(account:PlatformAccount):void;paused?:boolean}){
  const token=getAuthToken(),owner=getUser()?.id;
  const pausedRef=useRef(paused);pausedRef.current=paused;
  const [progress,setProgress]=useState({busy:false,total:0,done:0,normal:0,metrics:0,errors:0,message:''}),[visible,setVisible]=useState(true);
  useEffect(()=>{
    if(!token||!owner||!window.matrixDesktop?.inspectAccountHealth)return;
    let disposed=false,initialCycle=true;const current=()=>!disposed&&getAuthToken()===token&&getUser()?.id===owner;
    setVisible(true);setProgress({busy:true,total:0,done:0,normal:0,metrics:0,errors:0,message:'加载账号与本地状态…'});
    const refresh=createAccountHealthRefresh<PlatformAccount>({
      current,paused:()=>pausedRef.current,load:signal=>loadPublishAccounts({signal}),onList,
      onStart:(total,initial)=>{initialCycle=initial;if(initial)setProgress({busy:true,total,done:0,normal:0,metrics:0,errors:0,message:'后台校验绑定与官方可读指标'});},
      check:async account=>{
          if(!current())return 'unknown';let health:MatrixAccountHealth|undefined,verified=false,followersRead=false,state:AccountAvailability='unknown';
          try{
            health=await boundedAccountCheck(()=>window.matrixDesktop!.inspectAccountHealth({accessToken:token,accountId:account.id}),35000,'官方账号登录核验超时，将自动后台重试');if(!current())return 'unknown';
            if(health.error)throw Error(health.error);
            if(health.accountId!==account.id||health.sessionId!==account.connectorSessionId)throw Error('绑定检查结果不匹配');
            if(health.state==='normal'&&health.nickname){
              const saved=await boundedAccountCheck(()=>axiosForBackend.post(`/api/platform/accounts/${account.id}/desktop-observation`,{sessionId:account.connectorSessionId,nickname:health!.nickname,avatarUrl:health!.avatarUrl,nativeAccountKey:health!.nativeAccountKey,metrics:health!.metrics,metricEvidence:health!.metricEvidence,metricsError:health!.metricsError,observedAt:health!.checkedAt}),12000,'账号资料保存超时，尚未确认同步，可稍后核对');
              if(!current())return 'unknown';
              const updated=saved.data?.data;if(updated?.id!==account.id||updated.connectorSessionId!==account.connectorSessionId)throw Error('账号资料同步结果不匹配，已忽略');
              onAccount(updated);
              window.dispatchEvent(new CustomEvent('matrix:account-profile-updated',{detail:{ownerId:owner,account:updated}}));
              notifyAccountDataUpdated(owner);verified=true;
              // A preserved previous sample is not a successful fresh read.
              // The server keeps that sample on failure; count only this
              // native observation's exact value, proof and timestamp here.
              followersRead=!health.metricsError&&!!health.metricEvidence&&Number.isSafeInteger(health.metrics?.followersCount)&&Date.parse(updated.metricsObservedAt||'')===health.checkedAt;
            }
            state=health.state||'unknown';recordAccountObservation(owner,account,{state,reason:health.message||'检查已结束',checkedAt:health.checkedAt||Date.now()});
          }catch(error){if(current())recordAccountObservation(owner,account,{state:'unknown',reason:(error as Error).message.slice(0,200),checkedAt:Date.now()});}
          finally{if(current()&&initialCycle)setProgress(value=>({...value,done:value.done+1,normal:value.normal+Number(verified),metrics:value.metrics+Number(followersRead),errors:value.errors+Number(!verified)}));}
          if(health?.rateLimited)return {state,minimumDelayMs:Math.max(60*60000,(health.retryAt||0)-Date.now())};
          return health?.verificationRequired?{state,minimumDelayMs:60*60000}:state;
      },
      onFinish:(initial,error)=>{if(current()&&initial)setProgress(value=>({...value,busy:false,message:error?`初始化检查未完成：${(error as Error).message.slice(0,160)}；保留原数据，稍后自动重试`:'启动检查完成；后续自动后台刷新，未读状态和发布任务未改动'}));},
    });
    void refresh.tick();const timer=window.setInterval(()=>void refresh.tick(),10000),updated=()=>void refresh.tick(true),focused=()=>void refresh.tick();
    window.addEventListener('matrix:accounts-updated',updated);window.addEventListener('focus',focused);
    return()=>{disposed=true;refresh.dispose();window.clearInterval(timer);window.removeEventListener('matrix:accounts-updated',updated);window.removeEventListener('focus',focused);};
  },[token,owner,onList,onAccount]);
  useEffect(()=>{if(progress.busy||!progress.message)return;const timer=window.setTimeout(()=>setVisible(false),8000);return()=>window.clearTimeout(timer);},[progress.busy,progress.message]);
  if(!token||!progress.message||!visible)return null;
  return <aside role="status" aria-label="启动初始化" className="matrix-startup-initialization" style={{position:'fixed',top:64,right:16,zIndex:35,pointerEvents:'none',maxWidth:440,padding:'6px 12px',border:'1px solid var(--border)',borderRadius:8,background:'var(--card)',fontSize:11,color:'var(--muted-foreground)'}}>
    {progress.busy?'正在初始化':'初始化检查'} · {progress.done}/{progress.total} 个账号 · 正常 {progress.normal} · 可读粉丝数 {progress.metrics} · 待核验 {progress.errors}<br/>{progress.message}{progress.busy&&progress.total>0&&<progress aria-label="初始化账号检查进度" max={progress.total} value={progress.done} style={{width:'100%'}}/>}
  </aside>;
}
