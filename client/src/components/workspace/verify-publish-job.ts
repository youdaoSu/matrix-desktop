import type { PublishJob } from './publish-queue';

type ResultReader = Pick<NonNullable<Window['matrixDesktop']>, 'verifyPublishResult' | 'verifyManualPublish'>;

// Both startup recovery and explicit refresh must supply the original caption
// for a manual receipt. Neither path uploads media or submits a publication.
export function verifyPublishJob(reader: ResultReader, accessToken: string, job: PublishJob, receipt?: MatrixPageActionReceipt) {
  if (receipt && (receipt.kind !== 'publish' || receipt.id !== job.receiptId || receipt.taskId !== job.id || receipt.attemptId !== job.attemptId || receipt.accountId !== job.accountId || receipt.platform !== job.platform)) throw Error('核验回执不属于本条原尝试');
  const manual = receipt ? receipt.manualVerification === true : job.resultCheckOnly === true || !job.receiptId;
  if (job.receiptId && (!manual || job.stage === 'confirmed' || job.workReference)) return reader.verifyPublishResult({ accessToken, receiptId: job.receiptId });
  if (!job.attemptId || !['douyin', 'xiaohongshu'].includes(job.platform)) throw Error('原尝试信息不完整，未重新发布');
  const startedAt = job.lastAttemptAt || job.history.find(step => step.stage === 'preparing')?.at || job.createdAt;
  return reader.verifyManualPublish({ accessToken, accountId: job.accountId, taskId: job.id, attemptId: job.attemptId, platform: job.platform as 'douyin' | 'xiaohongshu', expectedTitle: job.title, body: job.config?.body, topics: job.config?.topics, startedAt, visibility: job.config?.options.visibility, expectedWorkId: job.workReference?.workId });
}
