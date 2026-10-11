// Read only the current account's rendered profile, never cookies or arbitrary page state.
// Kept self-contained so the same code is exercised in a real Chromium test page.
function readPlatformProfile(platform) {
  const visible = el => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).opacity !== '0';
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const valid = value => value && value.length <= 80 && !/^(?:登录|立即登录|扫码登录|退出登录|注册|创作服务平台|账号管理|个人中心|创作者中心|手机号|验证码|昵称|用户名|加载中[.…]*|小红书账号|抖音账号|视频号账号|B站账号)$/.test(value);
  const own = {
    xiaohongshu: ['.creator-header .user-name', '.user-info .name', '.user-info .nickname', '.user .name', '.user .user-name'],
    douyin: ['[class*=userInfo] [class*=nickname]', '[class*=user-info] [class*=user-name]'],
    wechat: ['.finder-nickname', '.finder-info .nickname', '.account-info .name'],
    bilibili: ['.header-entry-mini .nickname', '.header-avatar-wrap .nickname', '.user-info .nickname'],
  };
  const selectors = [
    ...(own[platform] || []),
    'header [class*=nickname]', 'header [class*=user-name]', 'header [class*=userName]',
    '[class*=user-info] [class*=name]', '[class*=userInfo] [class*=name]',
    '[class*=account-info] [class*=name]', '[class*=accountInfo] [class*=name]',
    '[class*=nickname]', '[class*=user-name]', '[class*=username]', '[class*=account-name]', '[class*=userName]',
  ];
  let nickname = '', ownerElement;
  for (const selector of selectors) {
    for (const el of document.querySelectorAll(selector)) {
      // A comment, follower, conversation or work card is not the signed-in account.
      if (!visible(el) || el.closest('main article, [class*=comment], [class*=message-item], [class*=follower-item], [class*=note-item], [class*=video-card], [class*=author-info]')) continue;
      const candidate = normalize(el.getAttribute('title') || el.getAttribute('data-nickname') || el.textContent);
      if (valid(candidate)) { nickname = candidate; ownerElement = el; break; }
    }
    if (nickname) break;
  }
  const owner = ownerElement?.closest('header, [class*=user-info], [class*=userInfo], [class*=account-info], .user');
  let avatarUrl = '';
  for (const selector of ['img[class*=avatar]', '[class*=avatar] img', 'img[class*=user]']) {
    const image = [...(owner || document).querySelectorAll(selector)].find(visible);
    if (image && /^https?:/.test(image.src)) { avatarUrl = image.src; break; }
  }
  return { nickname, avatarUrl, pageUrl: location.href, title: document.title.trim(),
    loginVisible: [...document.querySelectorAll('input')].some(el => visible(el) && /密码|验证码|手机号|password|one-time-code/.test([el.type, el.placeholder, el.autocomplete].join(' '))),
  };
}

function bindingProfile(profile, label) {
  if (!profile.nickname?.trim()) return { error: `已登录${label}，正在读取账号昵称。请停留在官方首页；如长时间未识别，可展开右上角头像菜单后重试。`, pendingProfile: true };
  return { ...profile, nickname: profile.nickname.trim() };
}

module.exports = { readPlatformProfile, bindingProfile };
