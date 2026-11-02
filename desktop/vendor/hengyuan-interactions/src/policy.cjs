'use strict';

const path = require('node:path');

function isAllowedUrl(value, domains) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      (!url.port || url.port === '443') && domains.some(domain =>
        url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  } catch { return false; }
}

function resolveRendererPath(root, requestUrl) {
  const url = new URL(requestUrl);
  if (url.protocol !== 'orangecat:' || url.hostname !== 'app') throw new Error('Unknown application origin');
  const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  if (relative.includes('\0') || relative.includes('\\')) throw new Error('Invalid resource path');
  const resolved = path.resolve(root, `.${relative}`);
  if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('Resource outside application');
  return resolved;
}

module.exports = { isAllowedUrl, resolveRendererPath };
