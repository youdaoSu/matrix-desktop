// An encrypted, exact-binding owner index lets the normal authenticated Matrix
// UI open its own previously verified archive before the network is available.
// It is not a platform login proof and is never used for network requests.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { createStore } = require('./douyin-inbox-store.cjs');
const { id } = require('./douyin-inbox-codec.cjs');
const ioCode = error => ['EACCES', 'EPERM', 'ENOENT', 'EIO', 'EBUSY', 'ENOSPC', 'EMFILE', 'ENFILE', 'EISDIR'].includes(error?.code) ? error.code : 'unknown';
function boundArchive({ userData, safeStorage, binding, userId, accountId, ownUid, io = fs }) {
  if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === 'basic_text') throw Error('本机安全加密不可用，不会明文保存私信');
  const directory = path.join(userData, 'douyin-inbox'), key = crypto.createHash('sha256').update(binding).digest('hex'), file = path.join(directory, key + '.owner.bin');
  let saved, stage = 'stat';
  try {
    let stat;
    try { stat = io.lstatSync(file); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    if (stat) {
      stage = 'file';
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 8192) throw Error();
      stage = 'read'; const bytes = io.readFileSync(file);
      stage = 'decrypt'; const plain = safeStorage.decryptString(bytes);
      stage = 'json'; const value = JSON.parse(plain);
      stage = 'version'; if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) throw Error();
      stage = 'binding'; if (value.binding !== key) throw Error();
      stage = 'owner'; saved = id(value.ownUid, false);
    }
  } catch (error) {
    // Fixed diagnostic codes only. Never forward OS paths, decrypted index
    // fields, owner IDs or a native crypto exception into the renderer/logs.
    let detail = ['stat', 'read'].includes(stage) ? '/' + ioCode(error) : '';
    if (stage === 'decrypt') {
      // A fresh synthetic round trip distinguishes a generally unavailable
      // backend from an older ciphertext failure; it does not recover or
      // replace keys and never writes or decrypts any additional archive.
      try { detail = safeStorage.decryptString(safeStorage.encryptString('matrix-cache-health-v1')) === 'matrix-cache-health-v1' ? '/roundtrip-ok' : '/roundtrip-failed'; }
      catch { detail = '/roundtrip-failed'; }
    }
    throw Error(`抖音缓存身份索引读取或解密失败（${stage}${detail}），原文件未改动`);
  }
  if (ownUid === undefined && !saved) return;
  const owner = ownUid === undefined ? saved : id(ownUid, false);
  if (saved && saved !== owner) throw Error('抖音官方身份与已缓存绑定不一致，未打开旧聊天存档');
  const store = createStore({ directory, scope: [userId, accountId, owner], protect: text => safeStorage.encryptString(text), unprotect: bytes => safeStorage.decryptString(bytes), fileSystem: io, asyncEngine:true });
  if (!saved) {
    const temporary = path.join(directory, key + '.' + crypto.randomUUID() + '.tmp'); let fd, created = false;
    try {
      const bytes = safeStorage.encryptString(JSON.stringify({ version: 1, binding: key, ownUid: owner }));
      fd = io.openSync(temporary, 'wx', 0o600); created = true; io.writeFileSync(fd, bytes); io.fsyncSync(fd); io.closeSync(fd); fd = undefined; io.renameSync(temporary, file);
    } catch { throw Error('抖音缓存身份索引保存失败，原有聊天存档保留'); }
    finally { if (fd !== undefined) { try { io.closeSync(fd); } catch {} } if (created && io.existsSync(temporary)) { try { io.unlinkSync(temporary); } catch {} } }
  }
  return { ownUid: owner, store };
}
module.exports = { boundArchive };
