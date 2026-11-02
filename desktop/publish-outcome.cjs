const {createOperationBudget} = require('./operation-budget.cjs');
const {publishVerification} = require('./publish-result.cjs');
const {normalizePublishAcceptance} = require('./publish-acceptance.cjs');
const safeOutcomeText = value => String(value || '').replace(/(?:cookie|authorization|password|access[_-]?token|refresh[_-]?token|secret|密码|验证码)\s*[:=：]\s*[^\n;；]+/gi, '[敏感信息已移除]').replace(/\bBearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gi, '[认证信息已移除]').replace(/https?:\/\/[^\s<>"']+/gi, '[网址已移除]').slice(0, 400);
function sanitizeOutcomeObservation(value) {
  const date = key => typeof value?.[key] === 'string' && value[key].length <= 40 && Number.isFinite(Date.parse(value[key]));
  const reasons = new Set(['waiting_notice','official_accepted','user_action_required','success_notice','failure_notice','work_list_result','form_validation_failed','observation_error','page_closed','confirmed','rejected','not_found','time_mismatch','missing_time','status_unresolved','ambiguous','processing','visibility_mismatch','not_published','page_not_ready','wrong_page','login_required','identity_mismatch','identity_pending','unsupported','missing_reference','timeout','busy','error']);
  if (!date('startedAt') || !date('deadlineAt') || !Number.isInteger(value.checks) || value.checks < 0 || value.checks > 1000 || !reasons.has(value.lastReason)) return;
  const result = {startedAt: value.startedAt, deadlineAt: value.deadlineAt, checks: value.checks, lastReason: value.lastReason};
  for (const key of ['lastCheckedAt','finishedAt']) if (date(key)) result[key] = value[key];
  if (Number.isFinite(value.elapsedMs) && value.elapsedMs >= 0 && value.elapsedMs <= 180000) result.elapsedMs = Math.round(value.elapsedMs);
  if (typeof value.lastError === 'string') result.lastError = safeOutcomeText(value.lastError);
  if(Number.isInteger(value.workListLoads)&&value.workListLoads>=1&&value.workListLoads<=6){result.workListLoads=value.workListLoads;if(date('lastWorkListLoadAt'))result.lastWorkListLoadAt=value.lastWorkListLoadAt;}
  return result;
}

// Read-only post-click observation. The caller alone owns the one submission.
// No click, upload, retry, private endpoint or guessed receipt is available here.
async function observePublishOutcome({record, readNotice, readValidation, readWorkList, verifyIdentity, write, progress = () => {}, isClosed = () => false, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now, timeoutMs = 60000, intervalMs = 1000, readLimitMs = 5000}) {
  const budget = createOperationBudget(timeoutMs, now), started = now();
  const observation = {startedAt: new Date(started).toISOString(), deadlineAt: new Date(started + timeoutMs).toISOString(), checks: 0, lastReason: 'waiting_notice'};
  record.outcomeObservation = observation;
  const safe = safeOutcomeText;
  const evidence = notice => ({pageUrl: notice.pageUrl, notice: safe(notice.message), observedAt: new Date(now()).toISOString()});
  const read = (action, label) => budget.run(action, label, Math.min(readLimitMs, Math.max(1, started + timeoutMs - now())));
  let lastProgress = -Infinity;
  for (let poll = 0; poll < Math.ceil(timeoutMs / intervalMs); poll++) {
    if (['confirmed','failed'].includes(record.status)) break;
    if (isClosed()) {observation.lastReason = 'page_closed'; observation.lastError = '官方页面已关闭，无法继续读取结果'; break;}
    if (now() >= started + timeoutMs) break;
    await sleep(Math.min(intervalMs, started + timeoutMs - now()));
    try {budget.check();} catch {break;}
    observation.checks++;
    observation.lastCheckedAt = new Date(now()).toISOString();
    let notice;
    try {
      notice = await read(readNotice, '读取官方提交结果');
      if (notice?.needsUserAction) {
        record.message = '官方要求本人处理：' + safe(notice.message) + '；本次结果未确认，不会重复提交';
        record.resultSource = 'official_user_action'; record.checkpoint = 'official_user_action'; record.evidence = evidence(notice);
        observation.lastReason = 'user_action_required'; write(record); break;
      }
      if (notice?.accepted && !record.acceptedAt) {
        record.acceptedAt = new Date(now()).toISOString(); record.checkpoint = 'official_accepted'; record.resultSource = 'official_acceptance_notice'; record.message = safe(notice.message);
        record.verification = {state: 'processing', message: '官方已接收本次提交，审核结果待确认', checkedAt: new Date(now()).toISOString()};
        record.evidence = evidence(notice); observation.lastReason = 'official_accepted'; write(record);
      }
      if (['confirmed', 'failed'].includes(notice?.status)) {
        record.status = notice.status; record.message = safe(notice.message); record.checkpoint = 'official_result'; record.resultSource = notice.source || (notice.status === 'confirmed' ? 'official_success_notice' : 'official_failure_notice'); record.evidence = evidence(notice);
        observation.lastReason = notice.status === 'confirmed' ? 'success_notice' : 'failure_notice'; break;
      }
      // Platform acceptance is a successful handoff, not a failed one-minute
      // publication check. Release the queue now; later reads track review.
      if (notice?.accepted && record.acceptedAt) { observation.lastReason = 'official_accepted'; break; }
      if (notice?.nonterminalNotice && record.message !== safe(notice.message)) {
        record.message = safe(notice.message); record.resultSource = notice.source || 'official_uncertain_notice'; record.evidence = evidence(notice); write(record);
      }
      if (!record.acceptedAt) {
        const checked = await read(readValidation, '读取提交后的官方表单校验');
        if (checked?.inspected && checked.errors?.length) {
          record.status = 'failed'; record.message = '官方表单未通过校验：' + checked.errors.map(error => safe(error.message)).join('；').slice(0, 800);
          record.resultSource = 'official_form_validation'; record.checkpoint = 'official_form_validation'; record.evidence = evidence({...notice, message: record.message}); observation.lastReason = 'form_validation_failed'; break;
        }
      }
    } catch (error) {observation.lastError = safe(error.message);}
    try {
      budget.check();
      const verified = await read(readWorkList, '读取对应官方作品卡片');
      const loaded=verified?.readObservation;
      if(Number.isInteger(loaded?.workListLoads)&&loaded.workListLoads>=1&&loaded.workListLoads<=6&&loaded.workListLoads>=(observation.workListLoads||0)){
        observation.workListLoads=loaded.workListLoads;
        if(typeof loaded.lastWorkListLoadAt==='string'&&loaded.lastWorkListLoadAt.length<=40&&Number.isFinite(Date.parse(loaded.lastWorkListLoadAt)))observation.lastWorkListLoadAt=loaded.lastWorkListLoadAt;
      }
      if (verified?.matched || verified?.rejected) {
        await read(verifyIdentity, '核对本次作品所属账号ID');
        record.status = verified.matched ? 'confirmed' : 'failed'; record.message = verified.message; record.evidence = verified.evidence; record.resultSource = 'official_work_list'; record.checkpoint = 'work_list_result';
        record.verification = {state: verified.matched ? 'confirmed' : 'rejected', message: verified.message, checkedAt: new Date(now()).toISOString()}; observation.lastReason = 'work_list_result'; break;
      }
      if (verified?.reason === 'processing' && verified.pendingReview === true && verified.evidence) {
        await read(verifyIdentity, '核对待审核作品所属账号ID');
        record.acceptedAt ||= new Date(now()).toISOString(); record.checkpoint = 'official_accepted'; record.resultSource = 'official_work_list';
        record.message = '投稿成功，等待平台审核；无需重复提交'; record.evidence = verified.evidence;
        record.verification = publishVerification('processing', new Date(now()).toISOString()); observation.lastReason = 'processing'; write(record); break;
      }
      if (verified?.reason) {observation.lastReason = verified.reason; if (!record.acceptedAt || ['processing','status_unresolved'].includes(verified.reason)) record.verification = publishVerification(verified.reason, new Date(now()).toISOString(),verified.diagnostic);}
    } catch (error) {observation.lastError = safe(error.message);}
    if (now() - lastProgress >= 5000) {
      lastProgress = now();
      try {progress(record.acceptedAt ? '官方已接收，继续观察审核/发布结果（不重复提交）' : `已点击提交，正在观察官方结果 ${Math.floor((now() - started) / 1000)}秒 / ${Math.round(timeoutMs / 1000)}秒`);} catch { /* UI notifications never determine the result. */ }
    }
    try {budget.check();} catch {observation.lastReason = 'observation_error'; break;}
  }
  observation.finishedAt = new Date(now()).toISOString(); observation.elapsedMs = Math.max(0, now() - started);
  if (record.status === 'unknown' && observation.lastReason !== 'user_action_required') {
    const lastNotice = ['official_form_notice','official_uncertain_notice'].includes(record.resultSource) ? record.evidence?.notice : '';
    if (record.acceptedAt) record.message = '投稿成功，等待平台审核；审核结果尚未确认，不会重复提交';
    else if (observation.lastError) record.message = (lastNotice ? '官方最后提示：' + lastNotice + '；' : '') + '已点击提交，但读取官方结果未完成：' + observation.lastError + '；未确认成功或失败，不会重发';
    else if (lastNotice) record.message = '官方最后提示：' + lastNotice + '；尚未确认最终发布结果，不会重发';
    else record.message = `已点击提交，${Math.round(timeoutMs / 1000)}秒观察内未取得最终平台证据；不会重复提交`;
  }
  Object.assign(record, normalizePublishAcceptance(record));
  return record;
}
module.exports = {observePublishOutcome, sanitizeOutcomeObservation};
