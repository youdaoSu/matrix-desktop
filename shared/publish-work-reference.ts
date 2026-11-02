import type { PlatformType } from './api.interface';

export interface PublishWorkReference {
  workId: string;
  workUrl: string;
  workReferenceSource: 'official_title_link' | 'official_work_card';
}

// Display/navigation reference only, never permission to send a comment. The
// native journal and fresh same-account ownership check remain authoritative.
export function normalizePublishWorkReference(platform: PlatformType, value: unknown): PublishWorkReference | undefined {
  if (!value || typeof value !== 'object') return;
  const input = value as Record<string, unknown>;
  if (!['official_title_link','official_work_card'].includes(input.workReferenceSource as string) || typeof input.workId !== 'string' || typeof input.workUrl !== 'string' || input.workUrl.length > 2048) return;
  if(platform==='wechat')return input.workReferenceSource==='official_work_card'&&/^[1-9]\d{9,24}$/.test(input.workId)&&input.workUrl==='https://channels.weixin.qq.com/platform/post/list'?{workId:input.workId,workUrl:input.workUrl,workReferenceSource:'official_work_card'}:undefined;
  if(input.workReferenceSource!=='official_title_link')return;
  const formats: Partial<Record<PlatformType, [string, RegExp]>> = {
    bilibili: ['www.bilibili.com', /^\/video\/(BV[0-9A-Za-z]{10})\/?$/],
    douyin: ['www.douyin.com', /^\/video\/([1-9]\d{9,24})\/?$/],
    xiaohongshu: ['www.xiaohongshu.com', /^\/(?:explore|discovery\/item)\/([a-f0-9]{24})\/?$/],
  };
  try {
    const url = new URL(input.workUrl), format = formats[platform];
    if (!format || url.protocol !== 'https:' || url.hostname !== format[0] || url.username || url.password || url.port || url.search || url.hash) return;
    const match = format[1].exec(url.pathname);
    if (match?.[1] === input.workId) return { workId: match[1], workUrl: url.origin + url.pathname, workReferenceSource: 'official_title_link' };
  } catch { /* An arbitrary URL or title is not a stable platform work ID. */ }
}
