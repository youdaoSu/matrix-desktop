import { getAuthToken, getUser } from '@/api';
import type { OperationsCommand, OperationsResult } from '@shared/account-operations';
let identity='', workspaceId='';
export function operationsSession() {
  const accessToken=getAuthToken()||'',next=JSON.stringify([getUser()?.id,accessToken]);
  if(next!==identity){identity=next;workspaceId=crypto.randomUUID();}
  return {accessToken,workspaceId};
}
export async function operationsCall(command:OperationsCommand,args?:unknown,accountIds?:string[]):Promise<unknown> {
  const session=operationsSession();if(!session.accessToken||!window.matrixDesktop?.accountOperations)throw Error('账号运营需要远效桌面版及已登录账号');
  const result:OperationsResult=await window.matrixDesktop.accountOperations({...session,command,args,accountIds});
  if(operationsSession().workspaceId!==session.workspaceId)throw Error('当前登录已改变，旧结果已丢弃');
  if(result.error)throw Error(result.error);return result.result;
}
