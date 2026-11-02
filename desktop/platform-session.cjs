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
  let ownHomepage=false;try{const url=new URL(pageUrl);ownHomepage=platform==='douyin'&&url.protocol==='https:'&&url.hostname==='creator.douyin.com'&&/^\/creator-micro\/home\/?$/.test(url.pathname)&&profile.ownIdentity?.source==='official_own_homepage'&&/^[A-Za-z0-9_.-]{2,80}$/.test(profile.ownIdentity.key||'');}catch{}
  return { authenticated: !isLoginPage(pageUrl) && !profile.loginVisible && !profile.accountIssue && !profile.verificationRequired && (hasSessionCookie || ((platform === 'wechat'||ownHomepage) && hasProfile)), hasSessionCookie, profile };
}
module.exports = { classifySession, isLoginPage };
