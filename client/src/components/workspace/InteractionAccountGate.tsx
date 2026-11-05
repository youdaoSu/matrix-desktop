import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getAuthToken, getUser } from '@/api';
import type { PlatformAccount } from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { boundedAccountCheck } from './async-account-checks';

// Live evidence only; cosmetic avatar status never authorizes an operation.
export function useInteractionAccountCheck(account?: PlatformAccount | null) {
  const owner=getUser()?.id,token=getAuthToken();
  const key=JSON.stringify([owner,token,account?.id,account?.platform,account?.connectorSessionId,account?.nativeAccountKey]);
  const [retry,setRetry]=useState(0);
  const [proof,setProof]=useState<{key:string;retry:number;normal:boolean;message:string}>();
  useEffect(()=>{
    let alive=true;
    if(!account)return;
    const current=()=>alive&&getUser()?.id===owner&&getAuthToken()===token;
    const finish=(normal:boolean,message:string)=>{if(current())setProof({key,retry,normal,message});};
    if(!token||!account.connectorSessionId||!account.nativeAccountKey||!window.matrixDesktop?.inspectAccountHealth){finish(false,'账号尚未完成本机绑定，请先到账号管理核验。');return;}
    // Native checks have bounded waits and coalesce identical session checks.
    // Verification or unknown results require explicit retry, never a loop.
    void boundedAccountCheck(()=>window.matrixDesktop!.inspectAccountHealth({accessToken:token,accountId:account.id,purpose:'publish-identity'}),35000,'账号核验超时，请稍后重新核验。').then(result=>{
      const normal=!result.error&&!result.verificationRequired&&result.state==='normal'&&result.accountId===account.id&&result.sessionId===account.connectorSessionId&&result.nativeAccountKey===account.nativeAccountKey;
      finish(normal,normal?'账号状态正常，已核验当前登录身份':result.message||result.error||'当前账号状态尚未核验正常，在线功能暂未开放。');
    }).catch(()=>finish(false,'账号状态读取失败，请检查网络或到账号管理核验；未判定账号被封禁。'));
    return()=>{alive=false;};
  },[key,retry]);
  const matched=proof?.key===key&&proof.retry===retry;
  return{normal:!!account&&matched&&proof.normal,checking:!!account&&!matched,message:matched?proof.message:'正在核验所选账号的官网状态…',refresh:()=>setRetry(n=>n+1)};
}
export function AccountCheckNotice({check}:{check:ReturnType<typeof useInteractionAccountCheck>}){
  return <div className="rounded-md border p-3" role="status"><p>{check.message}</p>{!check.checking&&!check.normal&&<div className="mt-2 flex gap-2"><Button variant="outline" onClick={check.refresh}>重新核验账号</Button><Button asChild variant="outline"><Link to="/accounts">前往账号管理</Link></Button></div>}</div>;
}
export function InteractionAccountGate({account,children}:{account:PlatformAccount;children:ReactNode}){
  const check=useInteractionAccountCheck(account);
  return check.normal?<>{children}</>:<AccountCheckNotice check={check}/>;
}
