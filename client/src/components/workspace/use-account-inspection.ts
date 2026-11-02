import { useEffect, useRef } from 'react';
import { axiosForBackend, getAuthToken, getUser } from '@/api';
import type { PlatformType } from '@shared/api.interface';
import { recordAccountObservation, recordLoginObservation } from './account-observations';
import { boundedAccountCheck } from './async-account-checks';
import { notifyAccountDataUpdated } from './account-data-events';

export function useAccountInspection(input: { enabled: boolean; accountId?: string; sessionId: string; platform: PlatformType; nickname: string; nativeAccountKey?:string;
  read(): Promise<MatrixDesktopLoginResult | MatrixDesktopErrorResult> }) {
  const reader = useRef(input.read); reader.current = input.read;
  const savedSnapshot = useRef<{owner:string;accountId:string;sessionId:string;signature:string;at:number} | undefined>(undefined);
  useEffect(() => {
    if (!input.enabled || !input.accountId) return;
    const owner = getUser()?.id, token = getAuthToken(), identity = { id: input.accountId, connectorSessionId: input.sessionId };
    let disposed = false, pending = false, nextCheck = 0;
    const current = () => !disposed && owner && owner === getUser()?.id && token && token === getAuthToken();
    const check = async () => {
      if (!current() || pending || Date.now() < nextCheck) return;
      pending = true; const checkedAt = Date.now(); nextCheck = checkedAt + 10000;
      try {
        const result = await boundedAccountCheck(()=>reader.current(),8000,'官方账号资料读取超时，已结束等待'); if (!current()) return;
        if ('error' in result && result.pendingProfile) { nextCheck = Date.now() + 1000; return; }
        if(!('error' in result)&&result.platform===input.platform&&result.sessionId===input.sessionId){
          const key=result.ownIdentity?.source==='official_own_homepage'?result.ownIdentity.key:undefined,sameId=Boolean(key&&key===input.nativeAccountKey);
          if(key&&input.nativeAccountKey&&!sameId){recordAccountObservation(owner,identity,{checkedAt,state:'abnormal',reason:'官网账号ID与绑定ID不同，未改昵称或绑定'});return;}
          const profileChanged=result.nickname!==input.nickname||Boolean(key&&!input.nativeAccountKey);
          const hasProfileData=typeof result.avatarUrl==='string'||Object.values(result.metrics||{}).some(value=>typeof value==='number');
          const sameContext=savedSnapshot.current?.owner===owner&&savedSnapshot.current.accountId===input.accountId&&savedSnapshot.current.sessionId===input.sessionId;
          const signature=JSON.stringify([result.nickname,key,result.avatarUrl,result.metrics?.followersCount,result.metrics?.followingCount,result.metrics?.likesCount]);
          const needsSave=!sameContext||savedSnapshot.current?.signature!==signature||checkedAt-savedSnapshot.current.at>=60000;
          if((profileChanged||sameId&&hasProfileData)&&needsSave){
            if(!sameId&&result.nickname!==input.nickname){recordAccountObservation(owner,identity,{checkedAt,state:'unknown',reason:'昵称已变化，但没有同一平台账号ID的依据，请核对绑定'});return;}
            const metricEvidence=result.metricEvidence||(key&&Number.isSafeInteger(result.metrics?.followersCount)?{source:'rendered-own-counter' as const}:undefined);
            const saved=await boundedAccountCheck(()=>axiosForBackend.post(`/api/platform/accounts/${input.accountId}/desktop-observation`,{sessionId:input.sessionId,nickname:result.nickname,avatarUrl:result.avatarUrl,nativeAccountKey:key,metrics:result.metrics,metricEvidence,metricsError:result.metricsError,observedAt:checkedAt}),8000,'账号资料保存超时，尚未确认同步');
            if(!current())return;
            const account=saved.data?.data;if(account?.id!==input.accountId||account.connectorSessionId!==input.sessionId)throw Error('账号同步结果不匹配');
            savedSnapshot.current={owner,accountId:input.accountId,sessionId:input.sessionId,signature,at:checkedAt};
            window.dispatchEvent(new CustomEvent('matrix:account-profile-updated',{detail:{ownerId:owner,account}}));
            notifyAccountDataUpdated(owner);
            recordAccountObservation(owner,identity,{checkedAt,state:'normal',reason:'官网账号ID核验一致，账号资料已同步'});return;
          }
        }
        recordLoginObservation(owner, { ...identity, platform: input.platform, nickname: input.nickname }, result, checkedAt);
      } catch (error) { if (current()) recordAccountObservation(owner, identity, { checkedAt, state: 'unknown', reason: `账号检查未完成：${(error as Error).message.slice(0,140)}；不据此判断封禁或离线` }); }
      finally { pending = false; }
    };
    void check(); const timer = window.setInterval(() => void check(), 1000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [input.enabled, input.accountId, input.sessionId, input.platform, input.nickname,input.nativeAccountKey]);
}
