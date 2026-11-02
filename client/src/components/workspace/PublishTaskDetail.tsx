import { useEffect, useState, type ReactNode } from 'react';
import { getAuthToken } from '@/api';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { publishPlatformFields } from '@shared/publish-platform-fields';
import { PublishTaskAvatar, PublishTaskMedia } from './PublishTaskAssets';
import { publishStageLabels, publishObservationSummary, type PublishJob } from './publish-queue';
import { platformLabels } from './OfficialWorkspace';
import { publishExecutionStageLabel, publishExecutionStageLabels } from './publish-execution-stage';
import { PublishStepProgress } from './PublishStepProgress';
import { PublishTrace } from './PublishTrace';

const time = (value?: string) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
const size = (value: number) => `${(value / 1024 / 1024).toFixed(1)} MB`;
const safePreviewUrl = (value?: string) => {
  try { const url = new URL(value || ''); return url.protocol === 'http:' && url.hostname === '127.0.0.1' && /^\/preview\/[A-Za-z0-9_-]{43}\/\d{1,2}$/.test(url.pathname) && !url.search && !url.username && !url.password; } catch { return false; }
};
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="matrix-detail-field"><span>{label}：</span><div>{children}</div></div>;
}
export function PublishTaskDetail({ job, avatarUrl, onClose, onReturnFocus }: { job?: PublishJob; avatarUrl?: string; onClose(): void; onReturnFocus(): void }) {
  const [media, setMedia] = useState<MatrixPublishPreview>(), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [evidence, setEvidence] = useState<MatrixPublishEvidence[]>([]), [evidenceError, setEvidenceError] = useState('');
  const [storageCheck, setStorageCheck] = useState<{jobId: string; token: string}>();
  const [storage, setStorage] = useState<Awaited<ReturnType<NonNullable<Window['matrixDesktop']>['readPublishStorageStatus']>>>();
  const [checkingStorage, setCheckingStorage] = useState(false);
  const token = getAuthToken(), recoveryId = job?.recoveryId, jobId = job?.id;
  const attemptId = job?.attemptId;
  const receiptId = job?.receiptId;
  useEffect(() => {
    let disposed = false;
    setStorage(undefined); setCheckingStorage(false);
    if (!jobId || !token || storageCheck?.jobId !== jobId || storageCheck.token !== token || !window.matrixDesktop?.readPublishStorageStatus) return;
    setCheckingStorage(true);
    void window.matrixDesktop.readPublishStorageStatus({accessToken:token,receiptId,recoveryId}).then(result => {
      if (!disposed && getAuthToken() === token) setStorage(result);
    }).catch(() => { if (!disposed && getAuthToken() === token) setStorage({error:'本地检查失败，任务与平台作品未改动'}); }).finally(() => { if (!disposed) setCheckingStorage(false); });
    return () => { disposed = true; };
  }, [jobId, token, receiptId, recoveryId, storageCheck]);
  useEffect(() => {
    let disposed = false;
    setEvidence([]); setEvidenceError('');
    if (jobId && attemptId && token && window.matrixDesktop?.readPublishEvidence) {
      void window.matrixDesktop.readPublishEvidence({ accessToken: token, taskId: jobId, attemptId }).then(result => {
        if (disposed || getAuthToken() !== token) return;
        setEvidence(result.items || []); setEvidenceError(result.error || '');
      }).catch(() => { if (!disposed) setEvidenceError('本地观测暂不可读取，发布结果未改动。'); });
    }
    return () => { disposed = true; };
  }, [jobId, attemptId, token]);
  useEffect(() => {
    let disposed = false, previewId: string | undefined;
    setMedia(undefined); setError(''); setLoading(false);
    if (!jobId) return;
    if (!recoveryId || !token || !window.matrixDesktop?.previewPublishMedia) { setError('这条历史任务没有可用的本地素材引用，仍可查看配置和日志。'); return; }
    const desktop = window.matrixDesktop;
    setLoading(true);
    void desktop.previewPublishMedia({ accessToken: token, recoveryId }).then(result => {
      previewId = result.previewId;
      if (disposed || getAuthToken() !== token) { if (previewId) void desktop.closePublishPreview(previewId).catch(() => {}); return; }
      if (result.error) setError(result.error); else setMedia(result);
    }).catch(() => { if (!disposed) setError('本地素材预览加载失败，配置和任务记录未改动。'); }).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; if (previewId) void desktop.closePublishPreview(previewId).catch(() => {}); };
  }, [jobId, recoveryId, token]);
  const schema = job && publishPlatformFields[job.platform], config = job?.config;
  const files = media?.files?.filter(file => safePreviewUrl(file.url)) || [], covers = media?.covers?.filter(cover => safePreviewUrl(cover.url)) || [];
  const safePoster = job?.thumbnail && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(job.thumbnail) && job.thumbnail.length <= 120030 ? job.thumbnail : undefined;
  const extras = [...new Set([...(schema?.fields.map(field => field.label) || []), ...Object.keys(config?.extras || {})])];
  const attemptHistory = job?.history.filter(step => !job.lastAttemptAt || step.at >= job.lastAttemptAt) || [];
  return <Sheet open={!!job} onOpenChange={open => { if (!open) onClose(); }}><SheetContent className="matrix-publish-detail" side="right" data-task-detail={job?.id} onOpenAutoFocus={event => { event.preventDefault(); (event.target as HTMLElement).querySelector('button')?.focus(); }} onCloseAutoFocus={event => { event.preventDefault(); onReturnFocus(); }}>
    <SheetHeader><SheetTitle>任务详情</SheetTitle><SheetDescription>本次任务的只读配置与执行记录；查看或关闭不会重新发布。</SheetDescription></SheetHeader>
    {job && <div className="matrix-publish-detail-body">
      <div className="matrix-detail-account"><PublishTaskAvatar nickname={job.nickname} platform={job.platform} url={avatarUrl || job.avatarUrl} /><div><strong>{job.nickname}</strong><small>{platformLabels[job.platform]} · {job.mediaType === 'image' ? '图文' : '视频'}</small></div><span className={`matrix-detail-stage ${job.stage === 'confirmed' ? 'is-success' : job.stage === 'failed' ? 'is-failed' : ''}`}>{publishStageLabels[job.stage]}</span></div>
      {job.verification && <Field label="最近结果核验"><p data-result-check={job.verification.state}>{job.verification.message}<small> · {time(job.verification.checkedAt)}</small></p></Field>}
      <PublishTrace job={job}/>
      {job.workReference && <Field label="平台作品ID"><p data-publish-work-id={job.workReference.workId}>{job.workReference.workId}</p><small>来自本条回执的官方作品链接，不按昵称或同名标题代替。</small></Field>}
      {job.referenceCollection && <Field label="作品编号采集"><p>{job.referenceCollection.message}</p><small>{time(job.referenceCollection.checkedAt)} · 编号补取不改变作品发布结果，不会重发。</small></Field>}
      {job.workReferenceConflict && <p role="alert" className="matrix-detail-warning">同一条回执出现不同作品ID，关联追评已停止；发布成功状态不会因此回退，也不会重发作品。</p>}
      {job.followup&&<section aria-label="独立追评与置顶结果" className="matrix-detail-execution">
        <h3>发布后的独立操作</h3><p className="matrix-detail-scope">追评、置顶结果与作品发布分开记录；操作失败不应重发作品。</p>
        <Field label="追评结果"><p>{job.followup.message}</p></Field>
        {job.followup.commentId&&<Field label="平台评论ID"><p data-followup-comment-id>{job.followup.commentId}</p></Field>}
        {job.followup.receiptId&&<Field label="追评回执"><p>{job.followup.receiptId}</p></Field>}
        {job.followup.pinResult&&<Field label="置顶结果"><p data-followup-pin-result={job.followup.pinResult.status}>{job.followup.pinResult.message}</p></Field>}
        {job.followup.commentManagement&&<Field label="评论管理"><p>{job.followup.commentManagement.message}</p></Field>}
      </section>}
      {job.draftCleanupWarning&&<p role="status" className="matrix-detail-warning" data-draft-cleanup-warning>{job.draftCleanupWarning}</p>}
      <section className="matrix-detail-preview" aria-label="任务素材预览">
        <p className="matrix-detail-scope">本地素材预览：用于核对视频和封面，不代表平台上传完成或发布成功。</p>
        {files.length ? media?.mediaType === 'video' ? <video key={files[0].url} aria-label="任务视频预览" src={files[0].url} crossOrigin="anonymous" controls preload="metadata" poster={safePoster} onError={() => setError('当前视频格式无法在内置播放器解码，配置和任务记录仍可查看。')} /> : <div className="matrix-detail-gallery">{files.map((file, index) => <figure key={file.url}><img src={file.url} crossOrigin="anonymous" alt={`任务图文第 ${index + 1} 张`} /><figcaption>{index + 1}. {file.name}</figcaption></figure>)}</div> : <PublishTaskMedia key={job.id} thumbnail={job.thumbnail} title={job.title} type={job.mediaType} count={job.files.length} />}
        {loading && <p role="status">正在读取本地素材预览…</p>}{error && <p className="matrix-detail-warning" role="status">{error}</p>}
        <div className="matrix-detail-file-list">{files.length ? files.map(file => <span key={file.url}>{file.name} · {size(file.size)}</span>) : job.files.map((name, index) => <span key={index}>{name}</span>)}</div>
      </section>
      <section className="matrix-detail-config" aria-label="本次发布配置">
        <Field label="标题"><div className="matrix-detail-counted"><input aria-label="任务标题" readOnly value={config?.title ?? job.title} /><small>{(config?.title ?? job.title).length}/{schema?.titleLimit || 500}</small></div></Field>
        <Field label="封面">{config?.covers?.length && covers.length ? <div className="matrix-detail-covers">{covers.map(cover => <figure key={cover.url}><img src={cover.url} crossOrigin="anonymous" alt={`任务封面 ${cover.index}`} /><figcaption>{cover.index === 2 ? '封面 2' : '主封面'} · {cover.name}</figcaption></figure>)}</div> : <div className="matrix-detail-value">{config?.covers?.length ? config.covers.map(cover => cover.name).join('、') : '平台自动封面（不上传自定义图片）'}</div>}</Field>
        <Field label="简介"><textarea aria-label="任务简介" readOnly value={config?.body || ''} placeholder="未填写简介" /><small className="matrix-detail-count">{config?.body?.length || 0}/{schema?.descriptionLimit || 20000}</small></Field>
        <Field label={job.platform === 'bilibili' ? '标签' : '话题'}><div className="matrix-detail-tags">{config?.topics?.length ? config.topics.map(topic => <span key={topic}>#{topic}</span>) : <small>未设置</small>}</div></Field>
        <Field label="类型"><div className="matrix-detail-value">{config?.options.originality || '平台默认'}</div></Field>
        <Field label={job.platform === 'bilibili' ? '分区' : '分类'}><div className="matrix-detail-value">{config?.options.category || '未设置'}</div></Field>
        <Field label="可见范围"><div className="matrix-detail-value">{config?.options.visibility || '平台默认（本条未指定）'}</div></Field>
        <Field label="发布时间"><div className="matrix-detail-value">{config?.schedule?.mode === 'local' ? '本机定时' : config?.schedule?.mode === 'official' ? '平台定时' : '立即发布'}{config?.schedule?.at ? ` · ${time(config.schedule.at)}` : ''}</div></Field>
        <Field label="追评文案"><textarea aria-label="任务追评" readOnly value={config?.comment || ''} placeholder="未设置追评" /></Field>
        <Field label="置顶追评"><div className="matrix-detail-value">{config?.pinComment ? '已请求置顶' : '未请求置顶'}</div></Field>
        {!!extras.length && <><h3>平台配置</h3><p className="matrix-detail-scope">以下为保存的配置请求；是否实际应用以官方结果和执行阶段记录为准。</p>{extras.map(label => <Field key={label} label={label}><div className="matrix-detail-value">{config?.extras?.[label] || '未设置（平台默认）'}</div></Field>)}</>}
        {!config && <p className="matrix-detail-warning">该历史任务未保存完整发布配置，不补造缺失的信息。</p>}
      </section>
      <section className="matrix-detail-execution"><h3>任务执行</h3><dl><dt>任务 ID</dt><dd>{job.id}</dd><dt>批次名称</dt><dd>{job.batchName || '历史批次未命名'}</dd><dt>批次 ID</dt><dd>{job.batchId}</dd><dt>创建时间</dt><dd>{time(job.createdAt)}</dd><dt>最近更新</dt><dd>{time(job.updatedAt)}</dd><dt>完成时间</dt><dd>{time(job.completedAt)}</dd><dt>执行次数</dt><dd>{job.attemptNumber || 1}</dd><dt>最新结果</dt><dd>{job.message}</dd>{job.receiptId && <><dt>发布回执</dt><dd>{job.receiptId}</dd></>}{job.followup && <><dt>追评结果</dt><dd>{job.followup.message}</dd></>}{job.withdrawal && <><dt>下架结果</dt><dd>{job.withdrawal.message}</dd></>}{job.recoveryWarning && <><dt>素材提示</dt><dd>{job.recoveryWarning}</dd></>}</dl>
        {!!job.attempts?.length && <details><summary>历史重发（{job.attempts.length} 次）</summary><ol>{job.attempts.map((attempt, index) => <li key={index}>{time(attempt.endedAt)} · {publishStageLabels[attempt.stage]} · {attempt.message}</li>)}</ol></details>}
        {!!job.diagnostic?.controls.length && <details><summary>兼容性诊断（只读控件信息）</summary><p className="matrix-detail-scope">{time(job.diagnostic.at)} · 不包含输入值、密码、验证码或 Cookie。</p><ol>{job.diagnostic.controls.map((line, index) => <li key={index} className="break-all text-xs">{line}</li>)}</ol></details>}
        {(!!evidence.length || job.mediaObservation || evidenceError) && <details><summary>媒体准备观测（不是发布回执）</summary><p className="matrix-detail-scope">仅记录处理信号和控件数量；缺少封面不等于官方转码中。主进程保存的观测在关闭详情或重启后仍可读取，不包含文案、文件路径和登录信息。</p>{job.mediaObservation && <p className="text-xs">{time(job.mediaObservation.at)} · {publishObservationSummary(job.mediaObservation.value)}{job.mediaObservation.warning ? ` · ${job.mediaObservation.warning}` : !job.mediaObservation.stored ? ' · 此样本未保存到主进程' : ''}</p>}{evidenceError && <p className="matrix-detail-warning">{evidenceError}</p>}<ol>{evidence.slice(-12).map((item, index) => <li key={index} className="text-xs">{time(item.at)} · {publishObservationSummary(item.observation)}</li>)}</ol></details>}
        <details><summary>本地任务引用检查（只读）</summary><p className="matrix-detail-scope">仅检查当前登录用户的回执和素材引用；不会上传、重发或修改发布结果。素材引用存在不代表原文件尚未移动。</p><button type="button" disabled={checkingStorage || !token || !window.matrixDesktop?.readPublishStorageStatus} onClick={() => { if(token)setStorageCheck({jobId:job.id,token}); }}>{checkingStorage ? '正在检查…' : '检查本地任务引用'}</button>{storage?.error ? <p role="status">{storage.error}</p> : storage && <dl><dt>当前用户 ID</dt><dd>{storage.userId}</dd><dt>本机读取目录</dt><dd className="break-all">{storage.dataDirectory}</dd><dt>当前用户回执数量</dt><dd>{storage.ownedReceiptCount}</dd>{receiptId && <><dt>本条发布回执</dt><dd>{storage.receiptFound ? storage.receiptStatus === 'confirmed' ? '已确认成功' : '存在（仍需核对平台结果）' : '本机未找到，勿重复提交'}</dd></>}{recoveryId && <><dt>本条素材引用</dt><dd>{storage.mediaReferenceFound ? '存在' : '不可读取，重发时需重新选择'}</dd></>}</dl>}</details>
        <h3>执行阶段</h3>{job.mediaHandoff && <p className="matrix-detail-scope" data-media-handoff={job.mediaHandoff.state}>{time(job.mediaHandoff.at)} · {job.mediaHandoff.state === 'confirmed' ? '素材已交付官方控件；不等于上传或发布成功。' : '素材交付结果尚未确认，不应盲目重复上传。'}</p>}
        {job.mediaObservation&&<div data-upload-observation={job.mediaObservation.value.state}>
          <p>最近官网媒体状态：{publishObservationSummary(job.mediaObservation.value)}</p>
          {job.mediaObservation.value.uploadPercent!==undefined&&<div>{job.mediaObservation.value.uploadPercent}%<progress max={100} value={job.mediaObservation.value.uploadPercent} aria-label="最近读取的官方上传进度" /></div>}
          <p className="matrix-detail-scope">读取时间：{time(job.mediaObservation.at)}；这是最近观测，不是估算进度。上传 100% 后仍需等待官方处理就绪，才会进入下一步。</p>
        </div>}
        <p className="matrix-detail-scope">执行到的阶段：{publishExecutionStageLabel(job)}</p><PublishStepProgress job={job} />{attemptHistory.length ? <ol className="matrix-detail-timeline">{attemptHistory.map((step, index) => <li key={index}><small>{time(step.at)}</small><strong>{step.executionStage ? publishExecutionStageLabels[step.executionStage] : publishStageLabels[step.stage]}</strong><p>{step.message}</p></li>)}</ol> : <p className="matrix-detail-scope">暂无本次阶段记录</p>}
      </section>
    </div>}
  </SheetContent></Sheet>;
}
