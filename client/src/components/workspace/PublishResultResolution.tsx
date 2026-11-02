import {useState} from 'react';
import {getAuthToken,getUser} from '@/api';
import {Button} from '@/components/ui/button';
import type {PublishJob} from './publish-queue';
export function PublishResultResolution({job,onResolved}:{job:PublishJob;onResolved(receipt:MatrixPageActionReceipt):void}){
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const rename=job.verification?.state==='identity_mismatch',canEnd=['not_found','not_published'].includes(job.verification?.state||'');
  if(job.stage!=='unknown'||!job.receiptId||!window.matrixDesktop?.resolvePublishReceipt||!rename&&!canEnd)return null;
  const resolve=async()=>{
    if(busy)return;const token=getAuthToken(),owner=getUser()?.id,receiptId=job.receiptId!;if(!token)return;setBusy(true);setMessage('');
    try{
      const result=await window.matrixDesktop!.resolvePublishReceipt({accessToken:token,receiptId,kind:rename?'identity_rename':'not_published'});
      if(getAuthToken()!==token||getUser()?.id!==owner)return;
      if(result.error)setMessage(result.error);else if(!result.cancelled&&result.receipt?.id===receiptId)onResolved(result.receipt);
    }catch{if(getAuthToken()===token&&getUser()?.id===owner)setMessage('本条核对未完成，未自动重发');}finally{setBusy(false);}
  };
  return <div className="text-xs"><Button size="sm" variant="outline" disabled={busy} aria-label={`${rename?'核对历史更名':'本人核实未发布'} ${job.nickname} ${job.title}`} onClick={()=>void resolve()}>{busy?'正在核对…':rename?'核对历史更名':'本人核实未发布'}</Button>{message&&<p role="status">{message}</p>}</div>;
}
