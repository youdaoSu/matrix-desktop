import { useEffect,useState } from 'react';
import { getAuthToken,getUser } from '@/api';
import { Button } from '@/components/ui/button';
import type { PublishJob } from './publish-queue';
import { boundedAccountCheck } from './async-account-checks';
const sources:Record<string,string>={official_work_list:'本人官网作品列表匹配',official_success_notice:'本次提交后的官方成功提示',official_failure_notice:'本次提交后的官方失败提示',official_acceptance_notice:'官方确认接收，尚未确认发布成功',dom_click_ack:'仅确认点击了提交按钮',official_notice:'官方页面提示',unknown:'没有最终平台证据',legacy_unclassified:'历史回执，证据来源未分类',user_confirmed_rename:'本人确认历史更名（非发布成功回执）',user_confirmed_not_published:'本人官网核实未发布（非官方失败回执）'};
sources.official_acceptance_notice='平台已接收投稿，等待审核';
sources.official_form_validation='官方表单校验未通过（非作品审核结果）';
sources.official_user_action='官方要求本人验证或处理，结果仍未确认';
sources.official_form_notice='官方填写提示，需结合本条表单判断';
sources.official_uncertain_notice='官方网络或频控提示，不能据此认定未发布';
export function PublishTrace({job}:{job:PublishJob}){
  const [trace,setTrace]=useState<MatrixPublishTrace>(),[error,setError]=useState(''),[exporting,setExporting]=useState(false);
  const token=getAuthToken(),owner=getUser()?.id;
  useEffect(()=>{let active=true;setTrace(undefined);setError('');if(!token||!job.receiptId||!window.matrixDesktop?.readPublishTrace)return;
    void boundedAccountCheck(()=>window.matrixDesktop!.readPublishTrace({accessToken:token,receiptId:job.receiptId!}),12000).then(value=>{if(active&&getAuthToken()===token&&getUser()?.id===owner){if(value.error)setError(value.error);else setTrace(value);}}).catch(()=>{if(active&&getUser()?.id===owner)setError('本机提交溯源读取失败，不改变发布结果');});return()=>{active=false;};
  },[token,owner,job.receiptId,job.updatedAt]);
  const exportTrace=async()=>{
    if(exporting||!token)return;setExporting(true);const owner=getUser()?.id;
    try{
      const official=job.receiptId&&window.matrixDesktop?.readPublishTrace?await boundedAccountCheck(()=>window.matrixDesktop!.readPublishTrace({accessToken:token,receiptId:job.receiptId!}),12000):undefined;
      const media=job.attemptId&&window.matrixDesktop?.readPublishEvidence?await boundedAccountCheck(()=>window.matrixDesktop!.readPublishEvidence({accessToken:token,taskId:job.id,attemptId:job.attemptId!}),12000):undefined;
      if(getAuthToken()!==token||getUser()?.id!==owner)return;
      const draftLifecycle=job.draftPublication?{source:'本机草稿清理判定，不是平台发布证据',draftId:job.draftPublication.id,revisionId:job.draftPublication.revisionId,updatedAt:job.draftPublication.updatedAt,publicationId:job.draftPublication.publicationId,targetCount:job.draftPublication.targetCount,rowId:job.draftPublication.rowId,status:job.draftCleanupWarning?'needs_attention':job.draftCleanupComplete?'processed':'awaiting_all_targets',warning:job.draftCleanupWarning,scope:'判定已处理不代表一定删除；仍受保留偏好、当前草稿版本及全部目标回执保护'}:undefined;
      const bundle={schemaVersion:1,exportedAt:new Date().toISOString(),taskId:job.id,attemptId:job.attemptId,attemptNumber:job.attemptNumber,platform:job.platform,receiptId:job.receiptId,currentStatus:job.stage,currentMessage:job.message,verification:job.verification,
        officialSubmissionTrace:official||{scope:'尚无本次提交回执；不能据此认定作品已提交'},mediaObservations:media?.items||[],mediaReadError:media?.error,draftLifecycle,
        postPublishOperations:{scope:'发布后的独立操作结果；追评或置顶失败不改变作品发布成功，也不应重发作品',followup:job.followup,withdrawal:job.withdrawal},
        workReference:job.workReference,referenceCollection:job.referenceCollection,
        workflowHistory:{source:'本机编辑器阶段记录，不单独证明平台发布成功',items:job.history.filter(item=>!job.lastAttemptAt||item.at>=job.lastAttemptAt)},
        notes:['上传100%或视频可预览不等于发布成功','点击提交不等于平台已接收','已接收或审核中不等于审核完成','缺少证据的历史记录不会补造结果','报告仅保存在本机，不自动上传开发者']};
      const url=URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'})),anchor=document.createElement('a');anchor.href=url;anchor.download=`YuanXiao-publish-trace-${job.id.slice(0,8)}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch{setError('溯源导出未完成，请稍后重试；原记录未改动');}finally{setExporting(false);}
  };
  const observation=trace?.outcomeObservation,status=trace?.status||job.stage;
  const pendingReview=status==='unknown'&&Number.isFinite(Date.parse(job.acceptedAt||''))&&job.verification?.state==='processing';
  return <section aria-label="发布结果溯源" className="matrix-detail-execution"><h3>发布结果溯源</h3><p>{sources[trace?.resultSource||'unknown']||'历史来源未分类'}；{pendingReview?'当前状态：投稿成功，等待审核':'最终状态：'+(({confirmed:'发布成功',failed:'发布失败',unknown:'结果未确认',submitting:'正在提交'} as Record<string,string>)[status]||status)}</p><p className="matrix-detail-scope">上传完成、平台接收、发布成功分别核验。旧记录没有采集到的证据不补造。</p>{error&&<p role="status">{error}</p>}
    {observation&&<p className="text-xs" data-publish-outcome-observation>本次实际观察 {observation.checks} 次 · {Math.round((observation.elapsedMs||0)/1000)}秒 · 最后读取状态：{observation.lastReason}{observation.lastError?`；读取错误：${observation.lastError}`:''}</p>}
    {!!observation?.workListLoads&&<p className="text-xs" data-work-list-load-count>实际发起官网作品列表加载 {observation.workListLoads} 次；只读核验，不代表每次加载成功，不重复提交</p>}
    {trace?.evidence&&<p className="break-all text-xs">官方依据：{trace.evidence.pageUrl} · {trace.evidence.publishedAt||trace.evidence.observedAt} {trace.evidence.notice}</p>}
    {trace?.evidence?.statusText&&<p className="break-all text-xs" data-official-work-status>作品卡片状态：{trace.evidence.statusText}</p>}
    {trace?.evidence?.timePrecision&&<p className="text-xs">官网时间精度：{trace.evidence.timePrecision==='second'?'秒级':'分钟级（保留分钟取整误差）'}</p>}
    {trace?.evidence?.workId&&['official_title_link','official_work_card'].includes(trace.evidence.workReferenceSource||'')&&<p className="break-all text-xs" data-official-work-reference>官网卡片作品编号：{trace.evidence.workId} · {trace.evidence.workUrl}（本人官方作品卡片读取；不是本次提交的服务器回执）</p>}
    {trace?.resultSource==='official_work_list'&&trace.evidence&&<p className="text-xs" data-official-work-visibility>官网卡片可见范围：{trace.evidence.visibility||'未读取到独立权限标识，不以请求值补造'}{trace.evidence.visibilitySource==='same_work_thumbnail_link'?'（已核对同一作品编号的封面链接权限标记）':''}</p>}
    <Button variant="outline" size="sm" disabled={exporting} onClick={()=>void exportTrace()}>{exporting?'正在导出…':'导出完整发布溯源'}</Button>
    {!!trace?.items?.length&&<ol className="matrix-detail-timeline">{trace.items.map(item=><li key={item.sequence}><small>{new Date(item.at).toLocaleString('zh-CN')}{item.timeInferred?'（历史推断时间）':''}</small><strong>{sources[item.resultSource]||item.checkpoint}</strong><p>{item.message}</p>{item.clicked!==undefined&&<small>提交点击：{item.clicked?'已确认点击，不代表平台接收':'明确未点击'}</small>}{item.verification&&<p>{item.verification.message}</p>}</li>)}</ol>}
  </section>;
}
