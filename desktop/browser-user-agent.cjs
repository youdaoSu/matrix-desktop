// Use the actual Chromium/OS identity, stable across application RC releases.
// Localized product names are not valid Node HTTP header characters.
function chromiumUserAgent(value, productName) {
  const original = String(value || '');
  const escaped = String(productName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const agent = original.replace(new RegExp('\\s+' + escaped + '/[^\\s]+', 'g'), '').replace(/\s+Electron\/[^\s]+/g, '');
  if (!/^[\x20-\x7e]+$/.test(agent) || !/\bChrome\/\d+(?:\.\d+){3}\b/.test(agent)) throw Error('实际 Chromium 浏览器标识无效，未更换设备或内核版本');
  return agent;
}
module.exports = { chromiumUserAgent };
