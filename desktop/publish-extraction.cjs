const fs = require('node:fs/promises');
const path = require('node:path');
const { constants } = require('node:fs');

const maxBytes = 1024 * 1024;
async function safeCompanion(file, directory, limit) {
  const before = await fs.lstat(file);
  if (!before.isFile() || before.isSymbolicLink() || before.size <= 0 || before.size > limit) throw Error('同名文件为空、过大或不是普通文件，未提取');
  if (path.dirname(await fs.realpath(file)) !== await fs.realpath(directory)) throw Error('同名文件不在素材目录，未提取');
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size !== before.size || stat.mtimeMs !== before.mtimeMs || stat.ino !== before.ino) throw Error('同名文件已变化，未提取');
    const bytes = Buffer.alloc(Math.min(limit + 1, stat.size + 1));
    let read = 0;
    while (read < bytes.length) { const result = await handle.read(bytes, read, bytes.length - read, read); if (!result.bytesRead) break; read += result.bytesRead; }
    const after = await handle.stat(), current = await fs.lstat(file);
    if (read !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || current.isSymbolicLink() || current.ino !== stat.ino || current.mtimeMs !== stat.mtimeMs) throw Error('同名文件读取时已变化，未提取');
    return { bytes: bytes.subarray(0, read), stat };
  } finally { await handle.close(); }
}
function decodeText(bytes) {
  let text;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder('utf-16le', { fatal: true }).decode(bytes);
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder('utf-16be', { fatal: true }).decode(bytes);
  else { try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { text = new TextDecoder('gb18030', { fatal: true }).decode(bytes); } }
  text = text.replace(/^\uFEFF/u, '').replace(/\r\n?/g, '\n').trim();
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)) throw Error('同名简介不是可识别的文本，未填入');
  if (text.length > 20000) throw Error('同名简介超过20000字，未截断，请缩短后重新提取');
  return text;
}
async function readPublishCompanions(source, options) {
  const directory = path.dirname(source), stem = path.basename(source, path.extname(source)).toLowerCase();
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const notices = [], result = { notices };
  function select(extensions, label, coverSuffix = false) {
    const eligible = entries.filter(item => extensions.includes(path.extname(item.name).toLowerCase()));
    const base = item => path.basename(item.name, path.extname(item.name)).toLowerCase();
    let matches = eligible.filter(item => base(item) === stem);
    if (!matches.length && coverSuffix) {
      const names = new Set(['封面','-封面','_封面',' 封面','（封面）','(封面)'].map(suffix => stem + suffix));
      matches = eligible.filter(item => names.has(base(item)));
      if (new Set(matches.map(base)).size > 1) { notices.push('存在多个封面命名候选，请手动选择封面'); return; }
    }
    if (!matches.length) { notices.push(`未找到同名${label}（${extensions.join(' / ')}）`); return; }
    matches.sort((a, b) => extensions.indexOf(path.extname(a.name).toLowerCase()) - extensions.indexOf(path.extname(b.name).toLowerCase()));
    if (matches.length > 1 && path.extname(matches[0].name).toLowerCase() === path.extname(matches[1].name).toLowerCase()) { notices.push(`存在不唯一的同名${label}，未提取`); return; }
    if (matches.length > 1) notices.push(`有多个同名${label}，优先读取${path.extname(matches[0].name).toLowerCase()}`);
    return path.join(directory, matches[0].name);
  }
  if (options.body === true) {
    const file = select(['.txt', '.text', '.md'], '简介');
    if (file) { try { result.body = decodeText((await safeCompanion(file, directory, maxBytes)).bytes); if (!result.body) notices.push('同名简介为空，未填入'); } catch (error) { notices.push(error.code ? '同名简介暂不可读取，原内容保留' : error.message); } }
  }
  if (options.cover === true) {
    const file = select(['.jpg', '.jpeg', '.png', '.webp'], '封面', true);
    if (file) { try {
      const { bytes, stat } = await safeCompanion(file, directory, 20 * 1024 * 1024);
      const ext = path.extname(file).toLowerCase();
      const valid = ext === '.png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : ext === '.webp' ? bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP' : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      if (!valid) throw Error('同名封面不是有效图片格式，未提取');
      result.cover = { mediaType: 'image', paths: [file], files: [{ name: path.basename(file), size: stat.size, modified: stat.mtimeMs }] };
    } catch (error) { notices.push(error.code ? '同名封面暂不可读取，原封面保留' : error.message); } }
  }
  return result;
}
module.exports = { readPublishCompanions, decodeText };
