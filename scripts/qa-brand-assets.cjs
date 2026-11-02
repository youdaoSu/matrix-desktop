// Bundled brand artwork only. Disposable renderer; every external request is blocked.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), ts = require('typescript'), Module = require('node:module');
const load = file => { const m = new Module(file); m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file); return m.exports; };
const { officialPlatformLogos } = load('client/src/components/workspace/platform-logo-assets.ts');
const { extraPlatformLogos } = load('client/src/components/workspace/extra-platform-logo-assets.ts');
const catalog = require('../desktop/account-platforms.json');
const logos = { ...officialPlatformLogos, ...extraPlatformLogos, wechat_mcn: officialPlatformLogos.wechat };
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-brand-artwork-qa-')));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1200, height: 610, webPreferences: { sandbox: true, contextIsolation: true } });
  let externalRequests = 0;
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => { externalRequests++; callback({ cancel: true }); });
  try {
    assert.equal(catalog.length, 29);
    assert.equal(catalog.filter(entry => logos[entry.id]).length, 28);
    assert.ok(!logos.custom);
    assert.match(logos.baijiahao.source, /^https:\/\/pic\.rmb\.bdstatic\.com\//);
    assert.match(logos.buyin.source, /bitbug_favicon\.ico$/);
    for (const asset of Object.values(logos)) {
      const match = /^data:image\/(?:png|x-icon|svg\+xml);base64,([A-Za-z0-9+/]*={0,2})$/.exec(asset.src);
      assert.ok(match, 'Brand assets must contain intact base64, not truncated tool output');
      assert.equal(Buffer.from(match[1], 'base64').toString('base64'), match[1]);
    }
    const cards = catalog.map(entry => `<article><span>${entry.label}</span>${logos[entry.id] ? `<img data-platform="${entry.id}" src="${logos[entry.id].src}">` : '<small>自定义，无固定品牌</small>'}</article>`).join('');
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<meta charset=utf-8><style>body{font:14px sans-serif;background:#f5f5f6;padding:16px;display:grid;grid-template-columns:repeat(6,1fr);gap:12px}article{background:white;border:1px solid #ddd;border-radius:8px;display:flex;align-items:center;gap:10px;padding:12px;min-height:60px}img{width:40px;height:40px;object-fit:contain}img[data-platform=baijiahao],img[data-platform=jd_creator]{object-fit:cover;object-position:left center}span{flex:1}</style>${cards}`));
    const result = await win.webContents.executeJavaScript(`Promise.all([...document.querySelectorAll('img')].map(async image=>{try{await image.decode();return{platform:image.dataset.platform,loaded:image.naturalWidth>0,width:image.naturalWidth,height:image.naturalHeight}}catch{return{platform:image.dataset.platform,loaded:false}}}))`);
    const screenshot = await win.webContents.capturePage(); fs.writeFileSync('logs/qa-bundled-brand-artwork.png', screenshot.toPNG());
    console.log(JSON.stringify({ bundledBrandArtwork: result, externalRequests, realAccountsModified: false }));
    assert.ok(result.every(item => item.loaded), 'Every original brand image must decode offline');
    assert.equal(externalRequests, 0);
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
