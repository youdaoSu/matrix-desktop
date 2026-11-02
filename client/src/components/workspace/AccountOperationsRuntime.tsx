import { useEffect } from 'react';
import { getAuthToken } from '@/api';
import type { PlatformAccount } from '@shared/api.interface';
import { useWorkspaceIdentity } from './WorkspaceUiState';
import { operationsCall, operationsSession } from './account-operations-client';

// Lifetime belongs to the signed-in workspace, not the currently visible page.
// Heartbeat carries no message body; changing route never restarts the engine.
export function AccountOperationsRuntime({accounts}:{accounts:PlatformAccount[]}) {
  const lease=useWorkspaceIdentity();
  const signature=accounts.filter(a=>['douyin','xiaohongshu'].includes(a.platform)&&a.connectorSessionId&&a.nativeAccountKey).map(a=>JSON.stringify([a.id,a.connectorSessionId,a.nativeAccountKey,a.nickname])).sort().join('|');
  useEffect(()=>{
    const token=getAuthToken(),api=window.matrixDesktop?.accountOperations;if(!token||!lease||!api)return;
    let alive=true,pending=false,configured=false,lastAttempt=-Infinity;
    const mainHeartbeat=typeof window.matrixDesktop?.onAccountOperationsHeartbeat==='function';
    const ids=accounts.filter(a=>['douyin','xiaohongshu'].includes(a.platform)&&a.connectorSessionId&&a.nativeAccountKey).map(a=>a.id);
    const tick=async()=>{const now=performance.now();if(!alive||pending||now-lastAttempt<10000)return;lastAttempt=now;pending=true;try{if(configured)await operationsCall('heartbeat');else{await operationsCall('configure',{heartbeatMode:mainHeartbeat?'main-event':'renderer-timer'},ids);configured=true;}}catch{configured=false;/* Page exposes native failures without logging private data. */}finally{pending=false;}};
    const unsubscribe=window.matrixDesktop?.onAccountOperationsHeartbeat?.(workspaceId=>{if(workspaceId===operationsSession().workspaceId)void tick();});
    void tick();const timer=setInterval(()=>void tick(),15000);
    return()=>{alive=false;unsubscribe?.();clearInterval(timer);};
  },[signature,lease]);
  // A logout immediately revokes authorization; normal route switches do not.
  useEffect(()=>{const session=operationsSession();return()=>{if(session.accessToken&&operationsSession().workspaceId!==session.workspaceId)void window.matrixDesktop?.accountOperations?.({...session,command:'close'}).catch(()=>{});};},[lease]);
  return null;
}
