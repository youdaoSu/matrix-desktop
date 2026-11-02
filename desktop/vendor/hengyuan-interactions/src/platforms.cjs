'use strict';

// Creator-page navigation only. These public destinations are not API integrations;
// successful login and continued availability have not been verified by this project.
const PLATFORMS = Object.freeze([
  { id: 'xiaohongshu', name: '小红书', short: '红', color: '#e95167', homeUrl: 'https://creator.xiaohongshu.com/new/home', publishUrl: 'https://creator.xiaohongshu.com/publish/publish?from=menu', domains: ['xiaohongshu.com'] },
  { id: 'douyin', name: '抖音', short: '抖', color: '#303744', homeUrl: 'https://creator.douyin.com/creator-micro/home', publishUrl: 'https://creator.douyin.com/creator-micro/content/upload', domains: ['douyin.com'] },
  { id: 'channels', name: '视频号', short: '视', color: '#de8a36', homeUrl: 'https://channels.weixin.qq.com/platform', publishUrl: 'https://channels.weixin.qq.com/platform/post/create', domains: ['weixin.qq.com'] },
  { id: 'bilibili', name: '哔哩哔哩', short: 'B', color: '#4d9eba', homeUrl: 'https://member.bilibili.com/platform/home', publishUrl: 'https://member.bilibili.com/platform/upload/video/frame', domains: ['bilibili.com'] },
  { id: 'kuaishou', name: '快手', short: '快', color: '#dd6935', homeUrl: 'https://cp.kuaishou.com/profile', publishUrl: 'https://cp.kuaishou.com/article/publish/video?tabType=1', domains: ['kuaishou.com'] },
  { id: 'wechat', name: '微信公众号', short: '微', color: '#4e9467', homeUrl: 'https://mp.weixin.qq.com/', publishUrl: 'https://mp.weixin.qq.com/', domains: ['weixin.qq.com'] },
].map(platform => Object.freeze({ ...platform, domains: Object.freeze(platform.domains) })));

function getPlatform(id) {
  const platform = PLATFORMS.find(item => item.id === id);
  if (!platform) throw new Error('请选择支持的平台。');
  return platform;
}

module.exports = { PLATFORMS, getPlatform };
