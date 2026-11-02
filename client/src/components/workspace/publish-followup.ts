import type { PublishConfig } from '@shared/publish-config';
import type { PlatformAccount } from '@shared/api.interface';
import { publishFollowupReceipt, type PublishFollowupState } from './publish-queue';
import { supportsPublishFollowup } from '@shared/publish-followup-capabilities';

export async function requestPublishFollowup(request:{account:PlatformAccount;config:PublishConfig},receipt:MatrixPageActionReceipt,deps:{
  accessToken:string;assertCurrent():void;
  desktop():NonNullable<Window['matrixDesktop']>;
  saveTask(input:{requestId:string;accountIds:string[];kind:'comment';title:string;content:string}):Promise<unknown>;
  updated(kind:'receipts'|'tasks'):void;
}):Promise<PublishFollowupState>{
  deps.assertCurrent();
  if(supportsPublishFollowup(request.account.platform)){
    const desktop=deps.desktop();if(!desktop.publishFollowup)return{status:'failed',message:'请使用新版远效桌面端处理追评；作品无需重发',retryable:true};
    try{
      const result=await desktop.publishFollowup({accessToken:deps.accessToken,accountId:request.account.id,receiptId:receipt.id,requestId:crypto.randomUUID(),operation:'start',comment:request.config.comment,pin:request.config.pinComment===true});deps.assertCurrent();
      if(result.receipt){
        const child=result.receipt;
        if(child.kind!=='comments'||child.accountId!==request.account.id||child.platform!==request.account.platform||child.followupOf!==receipt.id||child.taskId!==receipt.taskId||child.attemptId!==receipt.attemptId)return{status:'unknown',message:'追评回执与原发布记录不一致，未套用；请核对原评论，作品无需重发'};
        deps.updated('receipts');return publishFollowupReceipt(child);
      }
      if(result.pending)return{status:'pending',message:result.message||'追评待准确定位作品ID；作品无需重发'};
      return{status:'failed',message:result.error||'追评尚未开始，请核对原发布回执',retryable:true};
    }catch{return{status:'unknown',message:'追评连接中断或所属用户已切换，请核对原评论；不会重发作品或自动重复追评'};}
  }
  try{
    await deps.saveTask({requestId:receipt.id,accountIds:[request.account.id],kind:'comment',title:`作品追评：${request.config.title||'本次作品'}`.slice(0,140),content:request.config.comment});deps.assertCurrent();deps.updated('tasks');
    return{status:'pending',message:'此平台自动追评尚未接入，文案已保留待办；尚未发表或置顶'};
  }catch{return{status:'save_failed',message:'追评待办保存失败，原文仍在发布记录；作品无需重发'};}
}
