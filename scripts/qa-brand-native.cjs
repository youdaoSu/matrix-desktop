// REAL native decoders and React rendering, disposable profile only.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process'), env = { ...process.env };delete env.ELECTRON_RUN_AS_NODE;
  if (process.platform === 'win32') {
    const windows = spawnSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', ['-NoProfile', '-File', path.join(root, 'scripts/qa-brand-windows.ps1')], { windowsHide: true, encoding: 'utf8', timeout: 20000 });
    process.stdout.write(windows.stdout || '');process.stderr.write(windows.stderr || '');assert.equal(windows.status, 0);
  }
  const result = spawnSync(path.join(root, '.desktop-deps/node_modules/electron/dist/electron.exe'), [__filename], { cwd: root, windowsHide: true, env, encoding: 'utf8', timeout: 30000 });
  process.stdout.write(result.stdout || '');process.stderr.write(result.stderr || '');process.exit(result.status ?? 1);
}
const { app, BrowserWindow, nativeImage } = require('electron'), { brand, configureBrand } = require('../desktop/brand.cjs');
const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'yuanxiao-brand-qa-'));
configureBrand(app, ['--matrix-user-data-dir=' + isolated]);app.disableHardwareAcceleration();
assert.equal(app.getName(), brand.name);assert.equal(app.getPath('userData'), isolated);assert.equal(app.getPath('sessionData'), isolated);
app.whenReady().then(async () => {
  let win;
  try {
    const png = nativeImage.createFromPath(path.join(root, 'desktop/assets/icon.png'));assert.equal(png.isEmpty(), false);assert.deepEqual(png.getSize(), { width: 512, height: 512 });
    const ico = fs.readFileSync(path.join(root, 'desktop/assets/icon.ico'));
    for (let n = 0; n < ico.readUInt16LE(4); n++) {
      const at = 6 + n * 16, offset = ico.readUInt32LE(at + 12), length = ico.readUInt32LE(at + 8), size = ico[at] || 256;
      const dib=ico.subarray(offset,offset+length);let purple=0;for(let pixel=40;pixel<40+size*size*4;pixel+=4)if(dib[pixel]>120&&dib[pixel]>dib[pixel+2]*1.4&&dib[pixel+2]>dib[pixel+1]*1.1)purple++;assert(purple>size*size*.18);
    }
    win = new BrowserWindow({ show: false, icon: png, title: brand.name, webPreferences: { nodeIntegration: true, contextIsolation: false } });
    win.webContents.session.webRequest.onBeforeRequest((request, done) => done({ cancel: /^https?:/.test(request.url) }));
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<title>远效</title><div id="root"></div>'));
    const result = await win.webContents.executeJavaScript(`(async()=>{const React=require(${JSON.stringify(path.join(root, 'node_modules/react'))}),{createRoot}=require(${JSON.stringify(path.join(root, 'node_modules/react-dom/client'))}),{loadTs}=require(${JSON.stringify(path.join(root, 'scripts/qa-load-typescript.cjs'))});const Mark=loadTs('client/src/components/AppBrandMark.tsx',new Map()).default;const c=createRoot(document.getElementById('root'));c.render(React.createElement(Mark,{size:48}));await new Promise(r=>setTimeout(r,60));const s=document.querySelector('svg');return{paths:s.querySelectorAll('path').length,width:s.getBoundingClientRect().width,mark:s.getAttribute('data-app-brand'),color:s.querySelector('g').getAttribute('fill')};})()`);
    assert.deepEqual(result, { paths: 2, width: 48, mark: 'yuanxiao-c', color: '#6242D9' });assert.equal(win.getTitle(), brand.name);
    console.log(JSON.stringify({ actualNativeRasterFrames: 10, actualReactMark: result, originalProfileTouched: false, name: app.getName() }));
  } finally { win?.destroy(); }
}).then(() => app.exit(0), error => { console.error(error);app.exit(1); });
