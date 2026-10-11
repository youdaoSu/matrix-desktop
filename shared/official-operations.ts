import type { PlatformType } from './api.interface';
export type OfficialIntent = 'manage' | 'publish' | 'comments' | 'messages' | 'withdraw';
const homes: Record<PlatformType, string> = {
  douyin: 'https://creator.douyin.com/', xiaohongshu: 'https://creator.xiaohongshu.com/',
  wechat: 'https://channels.weixin.qq.com/', bilibili: 'https://member.bilibili.com/',
};
const publish: Record<PlatformType, string> = {
  douyin: 'https://creator.douyin.com/creator-micro/content/upload',
  xiaohongshu: 'https://creator.xiaohongshu.com/publish/publish?from=homepage&target=video',
  wechat: 'https://channels.weixin.qq.com/platform',
  bilibili: 'https://member.bilibili.com/platform/upload/video/frame',
};
export function officialOperation(platform: PlatformType, intent: OfficialIntent): { url: string; instruction: string } {
  if (intent === 'withdraw') return { url: platform === 'douyin' ? 'https://creator.douyin.com/creator-micro/content/manage' : homes[platform], instruction: '在官方作品管理中找到并打开准确的作品，核对账号、标题和发布时间，再使用官方下架或设为私密操作。下架不等于删除作品；平台未提供下架入口时请使用官方 APP。' };
  if (intent === 'publish') return { url: publish[platform], instruction: platform === 'wechat' ? '进入视频号后台后点击发表视频；上传本人素材，核对后自行发表。' : '上传本人选定的素材；核对标题、正文和账号后，在官方页面确认发表。' };
  if (intent === 'comments') return {
    url: platform === 'douyin' ? 'https://creator.douyin.com/creator-micro/content/manage' : homes[platform],
    instruction: platform === 'douyin' ? '在作品列表选择本人作品的评论入口。这里不会自动选择评论对象或发送回复。' : '在官方后台找到本人作品的评论管理；网页端入口和可用权限以当前账号为准，找不到时请用官方 APP。',
  };
  if (intent === 'messages') return {
    url: platform === 'douyin' ? 'https://www.douyin.com/' : platform === 'bilibili' ? 'https://message.bilibili.com/' : homes[platform],
    instruction: platform === 'douyin' ? '进入抖音网页版后打开消息入口，选择允许联系的会话；发送由本人确认。网页版无聊天功能时请用官方 APP。' : platform === 'bilibili' ? '在 B站消息页面选择本人会话；核对对象和文案后自行发送。' : '请检查官方后台是否向当前账号提供私信入口；没有网页端入口时需用官方 APP，矩效不能通过登录补开权限。',
  };
  return { url: homes[platform], instruction: '在官方后台查看与管理当前账号。' };
}
