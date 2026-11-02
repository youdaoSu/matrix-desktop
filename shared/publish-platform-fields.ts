import type { PlatformType } from './api.interface';
import type { PublishConfig } from './publish-config';

export interface PublishExtraField { label: string; kind?: 'toggle'; hint?: string; choices?: string[]; required?: boolean }
// Observed official labels, not an automatic content classification. The
// publisher must verify that the chosen option still exists in the real form.
export const bilibiliCreationDeclarations = ['内容无需标注','含AI生成内容','含虚构演绎内容','内容含营销信息','个人观点，仅供参考','内容为转载'];
// Visible publisher-requested defaults, NOT a content classifier. Preserve every
// explicit declaration (including unknown values, which validation must reject).
export function bilibiliDeclarationValue(config: Pick<PublishConfig, 'options' | 'extras'>, value = config.extras?.['创作声明']): string {
  return value?.trim() ? value : config.options.originality === '转载' ? '内容为转载' : '内容无需标注';
}
export function withPublishPlatformDefaults(platform: PlatformType, config: PublishConfig): PublishConfig {
  if (platform !== 'bilibili' || config.extras?.['创作声明']?.trim()) return config;
  return { ...config, extras: { ...config.extras, 创作声明: bilibiliDeclarationValue(config) } };
}
const mention: PublishExtraField[] = [
  { label: '@用户', hint: '填写昵称或 UID；需在官方搜索结果中确认，纯文本不等于有效 @' },
  { label: '@位置', choices: ['末尾', '开头'] },
];
const declaration: PublishExtraField = { label: '内容声明', hint: '填写官方声明名称，如 AI 生成；发布前在官方页面确认' };
// This is a configuration/request schema, not a claim of API or account entitlement.
// Dynamic choices come only from the authenticated official editor, never fabricated lists.
export const publishPlatformFields: Record<PlatformType, { titleLimit: number; descriptionLimit: number; fields: PublishExtraField[] }> = {
  xiaohongshu: { titleLimit: 20, descriptionLimit: 1000, fields: [
    ...mention, { label: '地理位置' }, { label: '添加到合集' }, { label: '店铺商品', hint: '填写商品名称或商品 ID；需具备店铺权限并在官方页面选择' },
    { label: '原创声明', kind: 'toggle' }, declaration, { label: '关联群聊' }, { label: '允许合拍', kind: 'toggle' },
  ] },
  douyin: { titleLimit: 30, descriptionLimit: 1000, fields: [
    ...mention, { label: '官方活动', hint: '填写活动名称，需在官方候选项中确认；与普通话题分别处理' },
    { label: '添加标签 / 挂载', hint: '填写小程序、商品等挂载目标；以账号权限为准' }, { label: '音乐', hint: '填写音乐名称或 ID；需核对版权、音量和官方曲目' },
    { label: '星图任务' }, { label: '申请关联热点' }, { label: '添加到合集' }, declaration, { label: '地理位置' },
    { label: '允许保存', kind: 'toggle' }, { label: '允许合拍', kind: 'toggle' }, { label: '允许评论', kind: 'toggle' },
  ] },
  // Primary official videoup asset index.a0b85e27.js, desc_editor max:2e3,
  // inspected2026-10-20 (SHA256d8340e512c7b2ceb68119d9b420a435146252e4dec9eea519293eb1b1200a39d).
  // A different template textarea defaults250; that is NOT the work editor.
  bilibili: { titleLimit: 80, descriptionLimit: 2000, fields: [
    { label: '转载来源', hint: '选择转载时必填原作地址或来源，需在官方来源控件确认' }, { label: '参与话题 / 活动' },
    { label: '允许二创', kind: 'toggle' }, { label: '未经作者允许禁止转载', kind: 'toggle' }, { label: '创作声明', required:true, choices:bilibiliCreationDeclarations, hint:'默认内容无需标注；如含 AI、虚构演绎、营销等内容，请按实际情况修改。类型为转载且声明留空时使用内容为转载，提交前仍核验官网是否接受。' },
    { label: '启用充电面板', kind: 'toggle', hint: '需要账号已加入充电计划' }, { label: '水印', kind: 'toggle' },
    { label: '杜比音效', kind: 'toggle' }, { label: 'Hi-Res 无损音质', kind: 'toggle' },
    { label: '关闭弹幕', kind: 'toggle' }, { label: '关闭评论', kind: 'toggle' }, { label: '开启精选评论', kind: 'toggle' },
    { label: '添加到合集' }, { label: '同步动态', kind: 'toggle' },
  ] },
  wechat: { titleLimit: 100, descriptionLimit: 2000, fields: [
    { label: '短标题', hint: '可选，最多16字；主标题完整保留在视频描述首行，不会截断' }, ...mention,
    { label: '地理位置' }, { label: '添加到合集' }, { label: '活动' }, { label: '扩展链接', hint: '文章或链接目标，以账号开放能力为准' },
    { label: '商品', hint: '填写商品名称或 ID，需在官方页面选择有权推广的商品' },
    { label: '原创声明', kind: 'toggle' }, declaration, { label: '允许评论', kind: 'toggle' },
    { label: '允许下载', kind: 'toggle' }, { label: '允许转发', kind: 'toggle' },
  ] },
};
export function validatePlatformConfig(platform: PlatformType, config: PublishConfig): string | null {
  const schema = publishPlatformFields[platform];
  if (config.title.length > 500) return '标题超过本地安全上限500字，请调整后发布（不会截断）';
  if (config.body.length > schema.descriptionLimit) return `简介超过当前配置上限 ${schema.descriptionLimit} 字，请调整后发布`;
  if(platform==='bilibili'&&(config.topics.length>10||config.topics.some(topic=>topic.length>20)))return 'B站最多10个标签，每个最多20字，请调整后发布（不会截断）';
  if (platform === 'wechat' && (config.extras?.['短标题'] || '').length > 16) return '视频号短标题最多16字，请调整后发布（不会截断）';
  if (platform === 'wechat' && [config.title.trim(), config.body, config.topics.map(tag => '#' + tag).join(' ')].filter(Boolean).join('\n').length > schema.descriptionLimit) return '视频号标题、简介和话题合计超过视频描述上限，请调整后发布（不会截断）';
  if (platform === 'bilibili' && config.options.originality === '转载' && !config.extras?.['转载来源']?.trim()) return 'B站转载作品请填写转载来源';
  if (platform === 'bilibili' && config.extras?.['创作声明'] && !bilibiliCreationDeclarations.includes(config.extras['创作声明'])) return '请选择已支持的B站创作声明，实际选项仍需官网核验';
  if (config.extras && (Object.keys(config.extras).length > 40 || Object.entries(config.extras).some(([key, value]) => key.length > 50 || typeof value !== 'string' || value.length > 1000))) return '平台扩展配置格式或长度不正确';
  return null;
}
// Static UI limits are references, not proof of what the current account's
// official editor accepts. Native maxlength/official validation remain hard
// gates; never truncate a title or weaken those real platform checks.
export function publishTitleNotice(platform: PlatformType, title: string): string | undefined {
  const reference = publishPlatformFields[platform]?.titleLimit;
  return reference && title.length > reference ? `当前标题${title.length}字，超过本地参考值${reference}字；不在本地拦截或截断，以官方输入框和校验结果为准。` : undefined;
}
