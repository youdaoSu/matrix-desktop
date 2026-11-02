import type { PlatformAccount } from '@shared/api.interface';
import { canRetryPublishJob, canStartPausedJob, type PublishJob, type PublishRequest } from './publish-queue';
import { publishMediaSupportError } from '@shared/publish-capabilities';

type RetryMediaDependencies = {
  account: PlatformAccount;
  assertCurrent(): void;
  previous?: PublishRequest;
  restore(id: string, skipCovers: boolean): ReturnType<NonNullable<Window['matrixDesktop']>['restorePublishMedia']>;
  choose(type: 'video' | 'image'): ReturnType<NonNullable<Window['matrixDesktop']>['chooseMedia']>;
  notify(message: string): void;
};

// Recover handles, never submit here. A native picker is explicit consent to
// replace an unavailable reference; cancelling leaves the original task intact.
export async function retryPublishMaterial(job: PublishJob, deps: RetryMediaDependencies, options: { automaticCover?: boolean } = {}): Promise<PublishRequest> {
  deps.assertCurrent();
  if (!canRetryPublishJob(job) && !canStartPausedJob(job)) throw Error('提交结果不确定，不能直接重发，请先核对官方结果');
  if (!job.config || !job.mediaType) throw Error('缺少发布配置，请返回发布页重新选择素材和账号');
  const unsupported = publishMediaSupportError(deps.account.platform, job.mediaType);
  if (unsupported) throw Error(unsupported);
  if (options.automaticCover && (job.mediaType !== 'video' || !canRetryPublishJob(job))) throw Error('只能为明确未提交或已核实失败的视频改用自动封面');
  const config = options.automaticCover ? { ...job.config, covers: [] } : job.config;
  const skipCovers = !config.covers?.length;
  if (job.recoveryId) {
    const restored = await deps.restore(job.recoveryId, skipCovers);
    deps.assertCurrent();
    if (!restored.error) {
      if (!restored.selection) throw Error('原素材或发布配置不可用');
      return { account: deps.account, config: { ...config, covers: skipCovers ? [] : restored.covers }, media: restored.selection, originalRecoveryId: job.recoveryId };
    }
    // Auth/ownership/IPC errors never fall through to a picker or a retry.
    if (restored.code !== 'PUBLISH_MEDIA_RESELECT_REQUIRED') throw Error(restored.error);
    deps.notify(`${restored.error}；请选择原素材，取消选择不会重发`);
  } else if (deps.previous) {
    return { ...deps.previous, account: deps.account, config: { ...config, covers: skipCovers ? [] : deps.previous.config.covers } };
  } else {
    deps.notify('这是旧版任务，没有保留本地素材引用；请重新选择原素材，取消选择不会重发');
  }
  deps.assertCurrent();
  const picked = await deps.choose(job.mediaType);
  deps.assertCurrent();
  if (picked.error) throw Error(picked.error);
  if (!picked.selection) throw Error('已取消选择素材，未重发');
  if (picked.selection.mediaType !== job.mediaType || !picked.selection.files.length || job.mediaType === 'video' && picked.selection.files.length !== 1) throw Error('所选素材与原任务类型不一致，未重发');
  const covers: NonNullable<PublishRequest['config']['covers']> = [];
  for (const cover of config.covers || []) {
    deps.notify(`请重新选择原封面：${cover.name}`);
    deps.assertCurrent();
    const selected = await deps.choose('image');
    deps.assertCurrent();
    if (selected.error) throw Error(selected.error);
    if (!selected.selection) throw Error('已取消选择封面，未重发');
    if (selected.selection.mediaType !== 'image' || selected.selection.files.length !== 1) throw Error('请为该封面选择一张图片，未重发');
    covers.push({ id: selected.selection.id, name: selected.selection.files[0].name, index: cover.index });
  }
  return { account: deps.account, config: { ...config, covers }, media: picked.selection };
}
