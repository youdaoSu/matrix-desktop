const crypto = require('node:crypto');
const zlib = require('node:zlib');
const MAX_PLAIN_BYTES = 24 * 1024 * 1024;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function bindingId(owner, account) {
  const bytes = crypto.createHash('sha256').update(JSON.stringify([owner, account.id, account.platform, account.connectorSessionId, account.nativeAccountKey])).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const h = bytes.toString('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
function cipher(key, owner) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw Error('互动加密密钥不可用，未保存明文');
  const aad = version => Buffer.from(`yuanxiao-interactions-v${version}/` + owner);
  return {
    protect(text) {
      if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_PLAIN_BYTES) throw Error('互动存档超过容量限制，原文件保留');
      const raw = Buffer.from(text, 'utf8');
      let version = 1, plain = raw;
      if (raw.length >= 4096) {
        const compressed = zlib.deflateRawSync(raw, { level: 3 });
        // Only retain compression when its metadata still leaves a useful gain.
        if (compressed.length + 5 < raw.length * 0.9) {
          const metadata = Buffer.alloc(5); metadata[0] = 1; metadata.writeUInt32LE(raw.length, 1);
          plain = Buffer.concat([metadata, compressed]); version = 2;
        }
      }
      const nonce = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, nonce);
      c.setAAD(aad(version));
      const body = Buffer.concat([c.update(plain), c.final()]);
      return Buffer.concat([Buffer.from(`YXOP${version}`), nonce, c.getAuthTag(), body]);
    },
    unprotect(bytes) {
      if (!Buffer.isBuffer(bytes) || bytes.length < 33 || bytes.length > MAX_PLAIN_BYTES + 64) throw Error('互动存档格式或容量无效，原文件保留');
      const format = bytes.subarray(0, 5).toString(), version = format === 'YXOP1' ? 1 : format === 'YXOP2' ? 2 : 0;
      if (!version) throw Error('互动存档版本无效，原文件保留');
      const c = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(5, 17));
      c.setAAD(aad(version)); c.setAuthTag(bytes.subarray(17, 33));
      // Authenticate the complete payload before trusting compression metadata.
      const body = Buffer.concat([c.update(bytes.subarray(33)), c.final()]);
      if (version === 1) {
        if (body.length > MAX_PLAIN_BYTES) throw Error('互动解码容量无效，原文件保留');
        return body.toString('utf8');
      }
      if (body.length < 6 || body[0] !== 1) throw Error('互动压缩格式无效，原文件保留');
      const length = body.readUInt32LE(1);
      if (length < 4096 || length > MAX_PLAIN_BYTES) throw Error('互动解码容量无效，原文件保留');
      const decoded = zlib.inflateRawSync(body.subarray(5), { maxOutputLength: length });
      if (decoded.length !== length) throw Error('互动解码长度不一致，原文件保留');
      return new TextDecoder('utf-8', { fatal: true }).decode(decoded);
    },
  };
}
module.exports = { hash, bindingId, cipher };
