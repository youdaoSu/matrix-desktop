// Compile the designer's code-native C mark locally. No network or real profile.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const root = path.resolve(__dirname, '..'), brand = require('../desktop/brand.json');
function svg() {
  const i = brand.icon;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320"><title>${brand.name}</title><rect x="4" y="4" width="312" height="312" rx="${i.radius - 4}" fill="${i.background}" stroke="${i.border}" stroke-width="8"/><g transform="${i.transform}" fill="${i.foreground}">${i.paths.map(d => `<path d="${d}"/>`).join('')}</g></svg>\n`;
}
function dib(size, rgba) {
  const maskStride = Math.ceil(size / 32) * 4, pixels = size * size * 4;
  const data = Buffer.alloc(40 + pixels + maskStride * size);
  data.writeUInt32LE(40, 0);data.writeInt32LE(size, 4);data.writeInt32LE(size * 2, 8);
  data.writeUInt16LE(1, 12);data.writeUInt16LE(32, 14);data.writeUInt32LE(pixels, 20);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const from = (y * size + x) * 4, row = size - 1 - y, to = 40 + (row * size + x) * 4;
    data[to] = rgba[from + 2];data[to + 1] = rgba[from + 1];data[to + 2] = rgba[from];data[to + 3] = rgba[from + 3];
    if (!rgba[from + 3]) data[40 + pixels + row * maskStride + (x >> 3)] |= 0x80 >> (x & 7);
  }
  return data;
}
function ico(frames) {
  frames = frames.map(frame => ({ size: frame.size, data: dib(frame.size, frame.rgba) }));
  let offset = 6 + frames.length * 16;
  const header = Buffer.alloc(offset);header.writeUInt16LE(1, 2);header.writeUInt16LE(frames.length, 4);
  frames.forEach(({ size, data }, n) => {
    const at = 6 + n * 16;header[at] = header[at + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, at + 4);header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8);header.writeUInt32LE(offset, at + 12);offset += data.length;
  });
  return Buffer.concat([header, ...frames.map(frame => frame.data)]);
}
module.exports = { svg, ico };
const invoked = process.argv.some(argument => path.resolve(argument) === __filename);
if (invoked && !process.versions.electron) {
  const { spawnSync } = require('node:child_process'), env = { ...process.env };delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(path.join(root, '.desktop-deps/node_modules/electron/dist/electron.exe'), [__filename], { cwd: root, windowsHide: true, env, encoding: 'utf8', timeout: 30000 });
  process.stdout.write(result.stdout || '');process.stderr.write(result.stderr || '');process.exit(result.status ?? 1);
} else if (invoked && process.versions.electron) {
  const { app, BrowserWindow } = require('electron');
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'yuanxiao-icon-build-')));app.disableHardwareAcceleration();
  app.whenReady().then(async () => {
    let win;
    try {
      win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
      win.webContents.session.webRequest.onBeforeRequest((request, done) => done({ cancel: /^https?:/.test(request.url) }));
      await win.loadURL('data:text/html,<html><body></body></html>');
      const source = svg(), sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256, 512];
      const rendered = await win.webContents.executeJavaScript(`(async()=>{const image=new Image();image.src='data:image/svg+xml;base64,'+${JSON.stringify(Buffer.from(source).toString('base64'))};await image.decode();return ${JSON.stringify(sizes)}.map(size=>{const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d');ctx.drawImage(image,0,0,size,size);return{size,data:c.toDataURL('image/png').split(',')[1],rgba:size<=256?Array.from(ctx.getImageData(0,0,size,size).data):[]};});})()`);
      const frames = rendered.map(frame => ({ size: frame.size, png: Buffer.from(frame.data, 'base64'), rgba: frame.rgba }));
      // Generated assets, all derived from the single reviewed vector definition.
      fs.writeFileSync(path.join(root, 'desktop/assets/icon.svg'), source);
      fs.writeFileSync(path.join(root, 'client/public/favicon.svg'), source);
      fs.writeFileSync(path.join(root, 'desktop/assets/icon.png'), frames.find(frame => frame.size === 512).png);
      fs.writeFileSync(path.join(root, 'desktop/assets/icon.ico'), ico(frames.filter(frame => frame.size <= 256)));
      console.log(JSON.stringify({ generated: ['icon.svg', 'icon.png', 'icon.ico', 'favicon.svg'], sizes, networkRequests: 0 }));
    } finally { win?.destroy(); }
  }).then(() => app.exit(0), error => { console.error(error);app.exit(1); });
}
