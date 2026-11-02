// Offline visual fixture of the actual AccountAvatar component and stylesheet.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-account-avatar-qa-'));
  const child = spawnSync(path.join(root, '.desktop-deps/node_modules/electron/dist/electron.exe'), [__filename, profile], { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 60000 });
  process.stdout.write(child.stdout || ''); process.stderr.write(child.stderr || '');
  if (child.error) console.error(child.error.message);
  if (child.status === 0) {
    assert.equal(path.dirname(profile), os.tmpdir()); assert.ok(path.basename(profile).startsWith('matrix-account-avatar-qa-'));
    fs.rmSync(profile, { recursive: true, force: true });
  }
  process.exit(child.status ?? 1);
}
const { app, BrowserWindow } = require('electron'), Module = require('node:module'), ts = require('typescript');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
app.setPath('userData', process.argv[2]); app.disableHardwareAcceleration();
const cache = new Map(), store = new Map();
global.localStorage = { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) };
global.window = { addEventListener() {} };
function load(file) {
  file = path.resolve(root, file); if (cache.has(file)) return cache.get(file).exports;
  const fixture = new Module(file); cache.set(file, fixture);
  fixture.require = name => {
    if (name === '@/api') return { getUser: () => ({ id: 'qa-only-owner' }) };
    if (name === 'react' && file.endsWith('account-observations.ts')) return { useSyncExternalStore: (_subscribe, snapshot) => snapshot() };
    if (name.startsWith('@shared/')) return load('shared/' + name.slice(8) + '.ts');
    if (name.startsWith('.')) {
      const base = path.resolve(path.dirname(file), name), target = ['.tsx', '.ts'].map(ext => base + ext).find(candidate => fs.existsSync(candidate));
      if (target) return load(target);
      if (fs.existsSync(base)) return require(base);
    }
    return require(name);
  };
  fixture._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, file + '.fixture.cjs');
  return fixture.exports;
}
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1050, height: 780, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  win.webContents.session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) }));
  let checks = 0;
  try {
    const { AccountAvatar } = load('client/src/components/workspace/AccountAvatar.tsx');
    const { recordAccountObservation } = load('client/src/components/workspace/account-observations.ts');
    const cases = [
      ['normal', '绑定及健康状态正常', { authStatus: 'authorized', healthStatus: 'normal' }],
      ['offline', '登录过期', { authStatus: 'expired', healthStatus: 'normal' }],
      ['abnormal', '账号异常', { authStatus: 'authorized', healthStatus: 'error' }],
      ['abnormal', '健康状态警告', { authStatus: 'authorized', healthStatus: 'warning' }],
      ['banned', '官方明确封禁', { authStatus: 'authorized', healthStatus: 'normal' }, 'banned'],
      ['offline', '官方返回登录页', { authStatus: 'authorized', healthStatus: 'normal' }, 'offline'],
      ['unknown', '暂时不能核验', { authStatus: 'authorized', healthStatus: 'normal' }, 'unknown'],
      ['offline', '尚未完成绑定', { authStatus: 'pending', healthStatus: 'normal' }],
      ['normal', '暂时读不到，保留最近正常', { authStatus: 'authorized', healthStatus: 'normal' }, 'transient-normal'],
    ];
    const samples = cases.map(([expected, label, fields, observed], index) => {
      const account = { id: 'fixture-' + index, connectorSessionId: 'session-' + index, platform: ['douyin', 'xiaohongshu', 'bilibili', 'wechat'][index % 4], nickname: label, avatarUrl: 'https://avatar.example/fixture.png', ...fields };
      if(observed==='transient-normal'){recordAccountObservation('qa-only-owner',account,{state:'normal',reason:'previous verified state',checkedAt:Date.now()-1000});recordAccountObservation('qa-only-owner',account,{state:'unknown',reason:'temporary read timeout',checkedAt:Date.now()});}
      else if (observed) recordAccountObservation('qa-only-owner', account, { state: observed, reason: 'isolated fixture', checkedAt: Date.now() });
      return `<div class="sample" data-expected="${expected}">${renderToStaticMarkup(React.createElement(AccountAvatar, { account, status: true, size: 'lg' }))}<div><strong>${label}</strong><p>${expected}</p></div></div>`;
    });
    const picture = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'desktop/assets/icon.png')).toString('base64');
    const markup = samples.join('').replaceAll('https://avatar.example/fixture.png', picture);
    const css = fs.readFileSync(path.join(root, 'client/src/workspace.css'), 'utf8');
    const html = `<meta charset="utf-8"><style>:root{--border:#d9dee6;--muted:#f0f2f5;--card:white;--foreground:#1b2536;--muted-foreground:#737d8d}body{font:15px Arial,sans-serif;padding:32px;background:#f7f8fb;color:#172337}h2{margin:0 0 14px}main{display:grid;grid-template-columns:1fr 1fr;gap:20px}.sample{background:white;border:1px solid #e3e7ee;border-radius:12px;padding:18px;display:flex;align-items:center;gap:25px}.sample p{color:#7a8492;font-size:12px;margin-bottom:0}${css}</style><h2>账号状态标识 · 离线隔离样本</h2><p>仅正常显示绿勾；离线/异常/封禁显示红叉并灰化本人头像，平台品牌角标保留。</p><main>${markup}</main>`;
    const documentPath = path.join(app.getPath('userData'), 'avatar-fixture.html');
    fs.writeFileSync(documentPath, html);
    await win.loadFile(documentPath);
    for (let attempt = 0; attempt < 100; attempt++) { if (await win.webContents.executeJavaScript('[...document.images].every(i=>i.complete&&i.naturalWidth>0)')) break; await new Promise(resolve => setTimeout(resolve, 50)); }
    const actual = await win.webContents.executeJavaScript(`(()=>[...document.querySelectorAll('.sample')].map(row=>{const a=row.querySelector('.matrix-account-avatar'),mark=a.querySelector('.matrix-account-session-mark'),photo=a.querySelector(':scope > img');return{expected:row.dataset.expected,state:a.dataset.accountAvailability,mark:mark.textContent,filter:getComputedStyle(photo).filter,markColor:getComputedStyle(mark).backgroundColor,brandFilter:getComputedStyle(a.querySelector('.matrix-account-platform-badge')).filter,label:mark.getAttribute('aria-label')}}))()`);
    assert.equal(actual.length, 9); checks++;
    for (const row of actual) {
      assert.equal(row.state, row.expected); checks++;
      assert.equal(row.mark, row.expected === 'normal' ? '✓' : row.expected === 'unknown' ? '?' : '×'); checks++;
      assert.equal(row.filter, ['normal','unknown'].includes(row.expected) ? 'none' : 'grayscale(1)'); checks++;
      assert.equal(row.brandFilter, 'none'); checks++;
      assert.ok(row.label.startsWith('账号状态：')); checks++;
      if (!['normal', 'unknown'].includes(row.expected)) { assert.equal(row.markColor, 'rgb(228, 82, 82)'); checks++; }
    }
    fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'logs/qa-account-avatar-status.png'), (await win.webContents.capturePage()).toPNG());
    console.log(JSON.stringify({ accountAvatarVisualChecks: checks, actualComponentAndStylesheet: true, syntheticAccountsOnly: true, externalRequests: 0, screenshot: 'logs/qa-account-avatar-status.png' }));
  } catch (error) { console.error(error.message?.slice(0, 300) || error); process.exitCode = 1; }
  finally { win.destroy(); app.exit(process.exitCode || 0); }
});
