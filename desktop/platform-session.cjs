// Cookie names only: never expose platform credentials to the renderer or logs.
const AUTH_COOKIE_NAMES = Object.freeze({
  douyin: ['sessionid', 'sessionid_ss', 'sid_guard'],
  xiaohongshu: ['web_session', 'access-token-creator.xiaohongshu.com'],
  wechat: ['sessionid', 'wxuin', 'uin', 'pass_ticket', 'ticket', 'token'],
  bilibili: ['SESSDATA'],
});
function isLoginPage(rawUrl) {
  try {
    const url = new URL(rawUrl);
    // A return URL containing /login in the query is not itself a login page.
    return /(^|\.)(passport|login)\./i.test(url.hostname) || /(?:^|\/)(?:login(?:\.html)?|signin|passport)(?:\/|$)/i.test(url.pathname) || /(?:^#|\/)(?:login|signin)(?:[/?]|$)/i.test(url.hash);
  } catch { return true; }
}
function classifySession(platform, cookies, profile, pageUrl, now = Date.now()) {
  const expected = AUTH_COOKIE_NAMES[platform] || [];
  const hasSessionCookie = cookies.some(cookie => expected.includes(cookie.name) && Boolean(cookie.value) && (!cookie.expirationDate || cookie.expirationDate > now / 1000));
  const hasProfile = Boolean(profile.nickname && !/登录|扫码|login|sign in/i.test(profile.nickname));
  return { authenticated: !isLoginPage(pageUrl) && !profile.loginVisible && (hasSessionCookie || (platform === 'wechat' && hasProfile)), hasSessionCookie, profile };
}
module.exports = { classifySession, isLoginPage };
