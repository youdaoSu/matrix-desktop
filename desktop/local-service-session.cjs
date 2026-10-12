// Chromium permits Secure cookies on trusted loopback HTTP origins, but Electron's
// cookies.get({url: 'http://...'}) filter can omit them. Query the exact local domain
// and retain the root-path cookie; do not relax authentication or forward other sites' cookies.
async function localServiceCsrf(browserSession, origin) {
  const url = new URL(origin);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol)) throw Error('桌面操作需要本机服务');
  const cookies = await browserSession.cookies.get({ domain: url.hostname, name: 'suda-csrf-token' });
  const valid = cookies.filter(cookie => cookie.name === 'suda-csrf-token' && cookie.domain.replace(/^\./, '') === url.hostname && cookie.path === '/' && cookie.value && (cookie.session || cookie.expirationDate === undefined || cookie.expirationDate > Date.now() / 1000));
  if (valid.length !== 1) throw Error('本机服务会话尚未就绪，请刷新矩效页面');
  return valid[0].value;
}
module.exports = { localServiceCsrf };
