export function operationsAccountLabel(account: { name: string; platform: string }): string {
  const platforms: Record<string, string> = { douyin: '抖音', xiaohongshu: '小红书', bilibili: 'B站', wechat: '视频号' };
  return account.name + ' · ' + (platforms[account.platform] || account.platform || '平台未知');
}
