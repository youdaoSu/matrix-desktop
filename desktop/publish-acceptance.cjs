// Publication submission and subsequent moderation are separate outcomes.
// Only existing official evidence authorizes promotion, never upload percent,
// a redirect, an unrecognized JSON response or a user-edited task label.
const reviewRejected = text => /^(?:审核失败|审核未通过|审核不通过|审核驳回|稿件退回|未通过审核)(?:[：:，。\s（(！!]|$)/.test(String(text || '').trim());
const pendingReview = record => record?.kind === 'publish' && record.status === 'confirmed' && record.verification?.state === 'processing';
function normalizePublishAcceptance(record) {
  if (!record || record.kind !== 'publish') return record;
  const accepted = Number.isFinite(Date.parse(record.acceptedAt || ''));
  const rejected = record.resultSource === 'official_work_list' && record.verification?.state === 'rejected' && reviewRejected(record.evidence?.statusText);
  if (!(record.status === 'unknown' && accepted) && !(record.status === 'failed' && rejected)) return record;
  const at = record.acceptedAt || record.verifiedAt || record.verification?.checkedAt;
  return { ...record, status: 'confirmed', acceptedAt: at, completedAt: record.completedAt || at,
    verification: rejected ? record.verification : {...record.verification,state:'processing',checkedAt:record.verification?.checkedAt||at,message:'平台已接收作品，审核结果待确认'},
    message: rejected ? '发布成功；平台审核未通过：' + record.evidence.statusText : '发布成功，等待平台审核；无需重复提交' };
}
module.exports = { reviewRejected, pendingReview, normalizePublishAcceptance };
