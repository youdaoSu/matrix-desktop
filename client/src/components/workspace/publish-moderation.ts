import type { PublishJob } from './publish-queue';
export type ModerationState='processing'|'rejected'|'published'|'unknown'|'not-submitted';
export const moderationLabels:Record<ModerationState,string>={processing:'平台待审核',rejected:'官方提示未通过',published:'已确认发布',unknown:'审核结果待核对','not-submitted':'尚无提交证明'};
export function moderationOf(job:PublishJob){
 const v=job.verification,checked=!!job.receiptId&&typeof v?.checkedAt==='string'&&Number.isFinite(Date.parse(v.checkedAt));
 const accepted=job.stage==='confirmed'||typeof job.acceptedAt==='string'&&Number.isFinite(Date.parse(job.acceptedAt));
 let state:ModerationState;
 if(checked&&v?.state==='rejected')state='rejected';
 else if(checked&&v?.state==='processing'&&accepted)state='processing';
 else if(accepted&&(!v||checked&&v.state==='confirmed'))state='published';
 else if(job.receiptId||accepted)state='unknown';
 else state='not-submitted';
 return {state,label:moderationLabels[state],checkedAt:checked?v!.checkedAt:undefined,detail:checked?v!.message:'尚无可用的官方审核回执；上传失败不等于内容违规。',canCheck:!!job.receiptId&&(state==='processing'||state==='unknown')};
}
