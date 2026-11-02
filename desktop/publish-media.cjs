const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');

// Only native-selected files can enter this store. Paths never reach the renderer.
// References, not copies of videos, survive a restart. Every restore checks owner
// and original size/mtime before minting fresh in-memory selection handles.
function createPublishMediaStore(directory, nativeImage) {
  const ownerDirectory = owner => path.join(directory, createHash('sha256').update(String(owner)).digest('hex'));
  const fileFor = (owner, id) => {
    if (!/^[a-f0-9-]{36}$/i.test(id || '')) throw Error('素材记录标识无效');
    return path.join(ownerDirectory(owner), id + '.json');
  };
  return {
    captureFrame(owner, dataUrl, at) {
      if (!owner || typeof dataUrl !== 'string' || dataUrl.length > 6000000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl) || !Number.isFinite(at) || at < 0 || at > 86400) throw Error('视频截帧参数无效');
      const bytes = Buffer.from(dataUrl.slice(23), 'base64');
      if (bytes.length < 12 || bytes[0] !== 255 || bytes[1] !== 216) throw Error('截帧不是有效JPEG图片');
      // Inspect JPEG SOF before native decoding, preventing an oversized frame
      // from allocating arbitrary image memory in the main process.
      let dimensions;
      for (let offset = 2; offset + 3 < bytes.length;) {
        if (bytes[offset++] !== 255) break;
        while (bytes[offset] === 255) offset++;
        const marker = bytes[offset++];
        if (marker === 217 || marker === 218 || offset + 2 > bytes.length) break;
        const length = bytes.readUInt16BE(offset);
        if (length < 2 || offset + length > bytes.length) break;
        if ([192,193,194].includes(marker) && length >= 8) { dimensions = { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) }; break; }
        offset += length;
      }
      if (!dimensions || dimensions.width < 1 || dimensions.height < 1 || dimensions.width > 1920 || dimensions.height > 1080) throw Error('截帧尺寸无效，最多支持1920×1080');
      const image = nativeImage.createFromBuffer(bytes), size = image.getSize();
      if (image.isEmpty() || size.width !== dimensions.width || size.height !== dimensions.height) throw Error('视频截帧解码失败');
      const jpeg = image.toJPEG(90);
      if (!jpeg.length || jpeg.length > 4500000) throw Error('截帧文件过大');
      const frameDirectory = path.join(ownerDirectory(owner), 'frames');
      fs.mkdirSync(frameDirectory, { recursive: true });
      const name = `视频封面-${Math.floor(at * 1000)}ms-${randomUUID()}.jpg`, filename = path.join(frameDirectory, name);
      fs.writeFileSync(filename, jpeg, { flag: 'wx', mode: 0o600 });
      const stat = fs.statSync(filename);
      return { mediaType: 'image', paths: [filename], files: [{ name, size: stat.size, modified: stat.mtimeMs }] };
    },
    async save(owner, media, covers) {
      let thumbnail;
      const source = covers.find(cover => cover.index === 1)?.selection || media;
      try {
        let image = source.mediaType === 'image' ? nativeImage.createFromPath(source.paths[0]) : await nativeImage.createThumbnailFromPath(source.paths[0], { width: 320, height: 180 });
        if (!image.isEmpty()) {
          const size = image.getSize(), scale = Math.min(1, 320 / size.width, 240 / size.height);
          image = image.resize({ width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) });
          const jpeg = image.toJPEG(75);
          if (jpeg.length <= 90000) thumbnail = 'data:image/jpeg;base64,' + jpeg.toString('base64');
        }
      } catch { /* Failed preview decoding must not prevent publishing/retry. */ }
      const id = randomUUID(), filename = fileFor(owner, id);
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, JSON.stringify({ version: 1, media, covers }), { flag: 'wx', mode: 0o600 });
      return { recoveryId: id, thumbnail };
    },
    read(owner, id) {
      let stored;
      try { stored = JSON.parse(fs.readFileSync(fileFor(owner, id), 'utf8')); }
      catch { throw Error('原素材记录不可用，请重新选择素材'); }
      if (stored.version !== 1 || !stored.media || !Array.isArray(stored.covers)) throw Error('素材记录无效');
      return stored;
    },
  };
}
module.exports = { createPublishMediaStore };
