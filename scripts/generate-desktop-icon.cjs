const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.whenReady().then(async () => {
  const root = path.resolve(__dirname, '..');
  const svg = fs.readFileSync(path.join(root, 'client', 'public', 'favicon.svg'), 'utf8');
  const outputDir = path.join(root, 'desktop', 'assets');
  fs.mkdirSync(outputDir, { recursive: true });
  const win = new BrowserWindow({
    show: false,
    width: 512,
    height: 512,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true, contextIsolation: true, sandbox: true },
  });
  const html = `<!doctype html><style>
    html,body{margin:0;width:512px;height:512px;background:transparent;overflow:hidden}
    .icon{box-sizing:border-box;position:absolute;inset:24px;border-radius:112px;
      display:flex;align-items:center;justify-content:center;
      background:linear-gradient(145deg,#1268ef,#6f64ec);box-shadow:inset 0 0 0 8px rgba(255,255,255,.16)}
    svg{width:330px;height:330px;filter:drop-shadow(0 18px 24px rgba(8,32,96,.28))}
  </style><div class="icon">${svg}</div>`;
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  fs.writeFileSync(path.join(outputDir, 'icon.png'), image.toPNG());
  win.destroy();
  app.quit();
});
