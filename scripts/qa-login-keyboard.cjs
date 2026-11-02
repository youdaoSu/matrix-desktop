// Actual React login and actual Chromium Tab/Shift+Tab/Enter/Space. Disposable
// profile, synthetic auth response, no server, account, mail or platform access.
const path = require('node:path'), root = path.resolve(__dirname, '..');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
async function run() {
  const React = require('react'), { createRoot } = require('react-dom/client'), { MemoryRouter, Routes, Route } = require('react-router-dom');
  const assert = require('node:assert/strict'), { ipcRenderer } = require('electron'), { loadTs } = require('./qa-load-typescript.cjs'), cache = new Map();
  let checks = 0, posts = 0, saved = '', remembered = true;
  const eq = (a, b) => { assert.deepEqual(a, b); checks++; };
  const api = { logger: { info() {} }, setAuthToken() { saved = 'remembered'; }, setSessionAuthToken() { saved = 'session'; }, setUser(_user, remember) { remembered = remember; }, axiosForBackend: { post: async (url, input) => { eq(url, '/api/auth/login'); eq(input, { username: 'qa-keyboard', password: 'qa-password' }); posts++; if (posts === 1) throw { response: { data: { error: { message: 'QA 登录拒绝' } } } }; return { data: { data: { token: 'qa-token', user: { id: 'qa-owner' } } } }; } } };
  cache.set(path.join(root, 'client/src/contexts/AppPreferences.tsx'), { exports: { readAppPreferences: () => ({ startupPage: '/dashboard' }) } });
  const { default: Login } = loadTs('client/src/pages/auth/LoginPage.tsx', cache, new Map([['@client/src/api', api]]));
  const { default: Layout } = loadTs('client/src/layouts/AuthLayout.tsx', cache);
  const component = createRoot(document.getElementById('root'));
  const until = async fn => { for (let n = 0; n < 200; n++) { if (fn()) return; await new Promise(r => setTimeout(r, 10)); } throw Error('Login fixture timeout'); };
  const press = async (key, shift = false) => { await ipcRenderer.invoke('qa:login-key', { key, shift }); await new Promise(r => setTimeout(r, 30)); };
  const fill = (id, value) => { const input = document.getElementById(id); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); };
  const active = () => document.activeElement;
  const render = key => component.render(React.createElement(MemoryRouter, { key, initialEntries: ['/login'] }, React.createElement(Routes, null,
    React.createElement(Route, { element: React.createElement(Layout) }, React.createElement(Route, { path: '/login', element: React.createElement(Login) }), React.createElement(Route, { path: '/forgot-password', element: React.createElement('h1', null, 'QA 找回页面') }), React.createElement(Route, { path: '/dashboard', element: React.createElement('h1', null, 'QA 已登录') })))));
  try {
    render('first'); await until(() => active()?.id === 'username');
    eq(document.querySelector('label[for=password]').textContent, '密码');
    const recovery = document.querySelector('a[href="/forgot-password"]'), password = document.getElementById('password');
    eq(!!(password.compareDocumentPosition(recovery) & Node.DOCUMENT_POSITION_FOLLOWING), true);
    eq(document.querySelector('[role=checkbox]').getAttribute('aria-checked'), 'true');
    await press('Tab'); eq(active().id, 'password');
    await press('Tab'); eq(active().getAttribute('type'), 'submit'); eq(active().textContent, '登录工作台');
    await press('Tab', true); eq(active().id, 'password'); await press('Tab', true); eq(active().id, 'username');
    await press('Tab'); await press('Tab'); await press('Tab'); eq(active().getAttribute('aria-label'), '显示密码');
    await press('Space'); eq(password.type, 'text'); eq(posts, 0);
    await press('Tab'); eq(active().getAttribute('role'), 'checkbox'); await press('Space'); eq(active().getAttribute('aria-checked'), 'false');
    await press('Tab'); eq(active().getAttribute('href'), '/forgot-password'); await press('Enter'); await until(() => document.body.textContent.includes('QA 找回页面')); eq(posts, 0);
    render('second'); await until(() => active()?.id === 'username');
    await press('Tab'); await press('Enter'); await until(() => document.body.textContent.includes('请输入账号和密码')); eq(posts, 0);
    fill('username', 'qa-keyboard'); fill('password', 'qa-password'); await new Promise(r => setTimeout(r, 30));
    document.getElementById('password').focus(); await press('Enter'); await until(() => document.body.textContent.includes('QA 登录拒绝')); eq(posts, 1); eq(document.querySelector('button[type=submit]').disabled, false);
    document.querySelector('[role=checkbox]').click(); await new Promise(r => setTimeout(r, 30));
    document.getElementById('password').focus(); await press('Enter'); await until(() => document.body.textContent.includes('QA 已登录')); eq(posts, 2); eq(saved, 'session'); eq(remembered, false);
    const { AuthSubmit, AuthPasswordField } = loadTs('client/src/components/auth/AuthComponents.tsx', cache);
    component.render(React.createElement('div', null, React.createElement(AuthPasswordField, { id: 'other-password', label: '其他表单' }), React.createElement(AuthSubmit, null, '其他提交')));
    await until(() => document.getElementById('other-password'));
    eq(document.getElementById('other-password').getAttribute('tabindex'), null); eq(document.querySelector('button[type=submit]').getAttribute('tabindex'), null); eq(document.querySelector('button[aria-label="显示密码"]').tabIndex, 0);
    return { loginKeyboardChecks: checks, actualChromiumKeyEvents: true, primaryOrder: ['username', 'password', 'submit'], shiftTabAndAccessoryControlsAccessible: true, enterSubmits: true, realAccountsUsed: false, realNetworkRequests: 0 };
  } finally { component.unmount(); }
}
module.exports = { run };
if (process.type === 'renderer') module.exports = { run };
else if (!process.versions.electron) { const { spawnSync } = require('node:child_process'), env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; const r = spawnSync(path.join(root, '.desktop-deps/node_modules/electron/dist/electron.exe'), [__filename], { cwd: root, windowsHide: true, env, encoding: 'utf8', timeout: 45000 }); process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || ''); process.exit(r.status ?? 1); }
else {
  const { app, BrowserWindow, ipcMain } = require('electron'), fs = require('node:fs'), os = require('node:os');
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-login-keys-'))); app.commandLine.appendSwitch('mute-audio');
  app.whenReady().then(async () => { let win; try {
    win = new BrowserWindow({ show: false, width: 800, height: 900, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false } });
    win.webContents.session.webRequest.onBeforeRequest((r, done) => done({ cancel: !r.url.startsWith('data:') }));
    ipcMain.handle('qa:login-key', async (event, input) => { if (event.sender !== win.webContents || !['Tab', 'Enter', 'Space'].includes(input.key)) throw Error('Not a fixture key'); win.webContents.focus(); const keyCode = input.key === 'Space' ? ' ' : input.key, modifiers = input.shift ? ['shift'] : []; win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); if (input.key === 'Enter') win.webContents.sendInputEvent({ type: 'char', keyCode: '\r', modifiers }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); return true; });
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<div id="root"></div>')); console.log(JSON.stringify(await win.webContents.executeJavaScript(`require(${JSON.stringify(__filename)}).run()`)));
  } catch (e) { console.error(e); process.exitCode = 1; } finally { ipcMain.removeHandler('qa:login-key'); win?.destroy(); app.exit(process.exitCode || 0); } });
}
