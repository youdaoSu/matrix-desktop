import type { PlatformAccount } from './api.interface';
import type { PublishConfig } from './publish-config';
import { publishPlatformFields, bilibiliCreationDeclarations } from './publish-platform-fields';
import { publishMediaSupportError } from './publish-capabilities';

type Media = { id: string; mediaType: 'image' | 'video'; files: { name: string; size: number }[] };
export type PublishPreflightTarget = { account: Pick<PlatformAccount, 'id' | 'nickname' | 'platform' | 'connectorSessionId'>; config: PublishConfig; media?: Media; expectedMediaType?: Media['mediaType']; item?: number };
export interface PublishPreflightIssue { field: string; message: string; accountId?: string; accountName?: string; platform?: PlatformAccount['platform']; item?: number }

// Admission rules for publishing, not draft saving. Incomplete drafts remain
// editable/saveable. Check every target before creating ANY task or browser.
export function collectPublishPreflight(targets: PublishPreflightTarget[], item?: number, now = Date.now()): PublishPreflightIssue[] {
  if (!targets.length) return [{ field: 'account', message: '请至少选择一个已绑定账号', item }];
  if (targets.length > 100) return [{ field: 'account', message: `本次有${targets.length}个发布任务，一次最多100个，请减少作品或账号` }];
  return targets.flatMap(({ account, config, media, expectedMediaType, item: targetItem }) => {
    const issues: PublishPreflightIssue[] = [];
    const add = (field: string, message: string) => issues.push({ field, message, accountId: account.id, accountName: account.nickname || '未命名账号', platform: account.platform, item: targetItem ?? item });
    const schema = publishPlatformFields[account.platform];
    if (!schema) { add('account', '该平台尚未接通此发布流程'); return issues; }
    if (!account.connectorSessionId) add('account', '未绑定本机官方登录会话，请到账号管理完成绑定');
    // The app requires a work title to identify this publication and its result.
    // Channels keeps it in the description; its optional short title stays optional.
    if (!config.title.trim()) add('title', '请填写作品标题');
    if (config.title.length > 500) add('title', `标题为 ${config.title.length} 字，超过本地安全上限500字，不会自动截断`);
    if (config.body.length > schema.descriptionLimit) add('body', `简介为 ${config.body.length} 字，超过本页上限 ${schema.descriptionLimit} 字`);
    const description = [account.platform === 'wechat' ? config.title.trim() : '', config.body, account.platform === 'bilibili' ? '' : config.topics.map(tag => '#' + tag).join(' ')].filter(Boolean).join('\n');
    if (config.body.length <= schema.descriptionLimit && description.length > schema.descriptionLimit) add('body', `实际填写的${account.platform === 'wechat' ? '标题、简介和话题' : '简介和话题'}合计 ${description.length} 字，超过本页上限 ${schema.descriptionLimit} 字`);
    if(account.platform==='bilibili'){
      if(config.topics.length>10||config.topics.some(topic=>!topic.trim()||topic.length>20))add('topics','B站最多10个标签，每个需为1至20字（不会截断）');
    }else if (config.topics.length > 15 || config.topics.some(topic => !topic.trim() || topic.length > 40)) add('topics', '话题最多15个，每个需为1至40字');
    if (config.comment.length > 2000) add('comment', '追评超过2000字');
    if (account.platform === 'wechat' && (config.extras?.['短标题'] || '').length > 16) add('extras.短标题', '视频号短标题超过16字（短标题可不填）');
    if (account.platform === 'bilibili' && config.options.originality === '转载' && !config.extras?.['转载来源']?.trim()) add('extras.转载来源', '选择转载时请填写转载来源');
    if (account.platform === 'bilibili' && !bilibiliCreationDeclarations.includes(config.extras?.['创作声明'] || '')) add('extras.创作声明', '请按实际视频内容选择B站创作声明；尚未创建发布任务');
    if (config.extras && (Object.keys(config.extras).length > 40 || Object.entries(config.extras).some(([key, value]) => !key || key.length > 50 || typeof value !== 'string' || value.length > 1000))) add('extras', '平台扩展配置的数量、名称或长度不符合要求');
    if (config.schedule && (!['now','local','official'].includes(config.schedule.mode) || config.schedule.mode !== 'now' && (!config.schedule.at || !Number.isFinite(Date.parse(config.schedule.at)) || Date.parse(config.schedule.at) <= now))) add('schedule', '请选择有效的未来发布时间');
    if (config.covers && (config.covers.length > 2 || new Set(config.covers.map(cover => cover.index)).size !== config.covers.length || config.covers.some(cover => !cover.id || !cover.name || ![1,2].includes(cover.index)))) add('covers', '封面选择已失效或封面序号重复，请重新选择');
    if (!media?.id || !['image','video'].includes(media.mediaType) || !media.files.length || media.files.length > (media.mediaType === 'video' ? 1 : 9)) add('media', '请选择一个视频或1至9张图片');
    else {
      if (expectedMediaType && media.mediaType !== expectedMediaType) add('media', expectedMediaType === 'video' ? '本条应使用视频，请重新选择视频素材' : '本条应使用图文，请重新选择图片素材');
      const unsupported = publishMediaSupportError(account.platform, media.mediaType);
      if (unsupported) add('media', unsupported);
      if (media.files.some(file => !Number.isFinite(file.size) || file.size <= 0 || !(media.mediaType === 'video' ? /\.(mp4|mov|webm|mkv)$/i : /\.(png|jpe?g|webp)$/i).test(file.name))) add('media', '素材为空或格式不支持，请重新选择视频或图片');
    }
    return issues;
  });
}
export const publishPreflightMessage = (issue: PublishPreflightIssue) => `${issue.item === undefined ? '' : `第${issue.item + 1}篇 · `}${issue.platform ? `${({douyin:'抖音',xiaohongshu:'小红书',wechat:'视频号',bilibili:'B站'})[issue.platform]} · ` : ''}${issue.accountName ? `${issue.accountName}：` : ''}${issue.message}`;

export interface PublishMediaCheckProgress { done: number; total: number }
export interface PublishMediaCheckOptions { signal?: AbortSignal; totalTimeoutMs?: number; onProgress?(progress: PublishMediaCheckProgress): void }
export async function checkPublishMedia(targets: PublishPreflightTarget[], validate: (input: { selectionId: string; covers: { id: string; index: number }[] }) => Promise<{ valid?: true; error?: string }>, isCurrent: () => boolean, timeoutMs = 15000, options: PublishMediaCheckOptions = {}): Promise<PublishPreflightIssue[]> {
  const groups = new Map<string, PublishPreflightTarget[]>();
  const coversFor = (target: PublishPreflightTarget) => (target.config.covers || []).filter(cover => cover.index !== 2 || target.account.platform === 'douyin').map(({ id, index }) => ({ id, index }));
  for (const target of targets) {
    const key = JSON.stringify([target.media?.id, coversFor(target)]);
    groups.set(key, [...(groups.get(key) || []), target]);
  }
  const entries = [...groups.values()], issues: PublishPreflightIssue[] = [];
  const started = performance.now(), totalTimeoutMs = options.totalTimeoutMs ?? 30000;
  const guard = () => {
    if (options.signal?.aborted) throw Error('已取消发布前检查，尚未上传或创建任务');
    if (!isCurrent()) throw Error('发布页或登录用户已变化，未创建任务');
  };
  const failures = (group: PublishPreflightTarget[], message: string) => group.map(target => ({ field: 'media', message, accountId: target.account.id, accountName: target.account.nickname || '未命名账号', platform: target.account.platform, item: target.item }));
  guard();options.onProgress?.({ done:0,total:entries.length });
  for (let index = 0; index < entries.length; index += 4) {
    guard();
    const remainingMs = totalTimeoutMs - (performance.now() - started);
    if (remainingMs <= 0) {
      issues.push(...entries.slice(index).flatMap(group => failures(group, '本地素材检查总等待超时，未创建任务，请重试')));
      break;
    }
    const results = await Promise.all(entries.slice(index, index + 4).map(async group => {
      guard();
      let result, timer: ReturnType<typeof setTimeout> | undefined, abort: (() => void) | undefined;
      try {
        const cancelled = new Promise<never>((_resolve, reject) => {
          abort = () => reject(Error('已取消发布前检查，尚未上传或创建任务'));
          options.signal?.addEventListener('abort', abort, { once:true });
          if (options.signal?.aborted) abort();
        });
        result = await Promise.race([cancelled, validate({ selectionId: group[0].media?.id || '', covers: coversFor(group[0]) }), new Promise<{ error: string }>(resolve => { timer = setTimeout(() => resolve({ error: '本地素材校验超时，未创建任务，请重试' }), Math.min(timeoutMs,remainingMs)); })]);
      }
      catch { guard();result = { error: '本地素材校验连接失败，请重试；尚未创建任务' }; }
      finally { if (timer) clearTimeout(timer); if (abort) options.signal?.removeEventListener('abort',abort); }
      guard();
      if (performance.now() - started >= totalTimeoutMs) return failures(group, '本地素材检查总等待超时，未创建任务，请重试');
      return result?.valid === true && !result.error ? [] : failures(group, result?.error || '本地素材校验未完成，请重试');
    }));
    guard();
    issues.push(...results.flat());
    options.onProgress?.({ done:Math.min(index+4,entries.length),total:entries.length });
  }
  return issues;
}
