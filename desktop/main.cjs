const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell, webContents } = require('electron');
const path = require('node:path');
require('./brand.cjs').configureBrand(app);
const { randomBytes, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const { registerPersonalAssist } = require('./personal-assist.cjs');
const { registerPageActions, createJournal } = require('./page-actions.cjs');
const { classifySession } = require('./platform-session.cjs');
const { readPlatformProfile, bindingProfile } = require('./platform-profile.cjs');
const { readRecoveryMailSettings, registerRecoveryMailSettings } = require('./recovery-settings.cjs');
const { recoverOwnedDatabase, cleanupResources } = require('./database-recovery.cjs');
const { withStartupLease, selectStartupPort } = require('./startup-lease.cjs');
const { waitForOwnedServer } = require('./startup-readiness.cjs');
const { createBoundedServerLog } = require('./bounded-server-log.cjs');
const { prepareClientOrigin, migrateClientStorage } = require('./client-storage-origin.cjs');
require('./audio-policy.cjs').registerSilentAudio({ app });

let appUrl = process.env.MATRIX_APP_URL || 'http://localhost:8080';
let serverProcess = null;
let databaseControl = null;
let clientOriginState = null;
let mainDocumentReady = false;
const windowInteractionLease=require('./window-interaction-lease.cjs').createWindowInteractionLease();
const closingMainWindows = new WeakSet();
function watchMainWindowClose(win) {
  win.on('close', () => closingMainWindows.add(win));
  // Read-only collectors can be invisible BrowserWindows. Their presence must
  // not leave the backend/database alive after the main window really closes.
  win.on('closed', () => { if (!app.isQuitting) { app.isQuitting = true; app.quit(); } });
  // A running job can legitimately prevent unload. That is not a completed
  // normal close, so do not suppress a subsequent genuine startup error.
  win.webContents.on('will-prevent-unload', () => closingMainWindows.delete(win));
}
function startupWindowClosing() {
  return Boolean(app.isQuitting || mainWindow && (mainWindow.isDestroyed() || closingMainWindows.has(mainWindow)));
}
async function handleStartupFailure(error) {
  // Chromium can reject loadURL in a microtask BEFORE its native close event
  // unwinds back into Electron. A modal error here would block that very close.
  // Recheck after one event-loop turn; genuine load failures still report/quit.
  await new Promise(resolve => setImmediate(resolve));
  if (startupWindowClosing()) { if (!app.isQuitting) app.quit(); return; }
  if (error?.message !== 'Missing desktop environment configuration') {
    const message = error instanceof Error ? error.message : String(error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Never block Chromium's still-pending native close with showErrorBox.
      // The asynchronous error dialog is cancelled if its own window closes.
      const win = mainWindow, contents = win.webContents, controller = new AbortController();
      const cancel = () => controller.abort();
      win.once('closed', cancel); contents.once('destroyed', cancel);
      try { await dialog.showMessageBox(win, { type: 'error', title: '远效启动失败', message, buttons: ['关闭远效'], defaultId: 0, cancelId: 0, noLink: true, signal: controller.signal }); }
      catch { /* Window teardown may reject a pending owned dialog. */ }
      finally { win.removeListener('closed', cancel); if (!contents.isDestroyed()) contents.removeListener('destroyed', cancel); }
    } else dialog.showErrorBox('远效启动失败', message);
  }
  if (!app.isQuitting) app.quit();
}
const startupAbort = new AbortController();
function assertStartupActive() {
  if (app.isQuitting || startupAbort.signal.aborted) throw Error('本机服务启动已取消');
}
function stopEmbeddedDatabase() {
  if (!databaseControl) return;
  const result = spawnSync(databaseControl.pgCtl, ['-D', databaseControl.dataDir, '-m', 'fast', '-w', '-t', '12', 'stop'], { windowsHide: true, timeout: 15000 });
  if (result.error || result.status !== 0) throw Error('Database stop not confirmed');
  databaseControl = null;
}
function retainOwnedDatabase(control) {
  databaseControl = control;
  // Ownership verification can finish after an early normal quit. Do not leave
  // that verified late child untracked or run initialization after cancellation.
  if (app.isQuitting || startupAbort.signal.aborted) { stopEmbeddedDatabase(); assertStartupActive(); }
  return control;
}

const PLATFORM = Object.freeze({
  douyin: { label: '抖音', home: 'https://creator.douyin.com/', domain: 'douyin.com' },
  xiaohongshu: { label: '小红书', home: 'https://creator.xiaohongshu.com/', domain: 'xiaohongshu.com' },
  wechat: { label: '视频号', home: 'https://channels.weixin.qq.com/', domain: 'weixin.qq.com' },
  bilibili: { label: 'B站', home: 'https://member.bilibili.com/', domain: 'bilibili.com' },
});

let mainWindow;
const extraPartitions = new Map();
const readPerformance = require('./performance-snapshot.cjs').createPerformanceSnapshot({getMetrics:()=>app.getAppMetrics(),getWindows:()=>BrowserWindow.getAllWindows(),getContents:()=>webContents.getAllWebContents()});
const applyDesktopSettings = require('./settings.cjs').registerDesktopSettings({ app, ipcMain, shell, Notification: require('electron').Notification, getWindow: () => mainWindow, getAppUrl: () => appUrl,readPerformance });
registerRecoveryMailSettings({ app, ipcMain, dialog, shell, getWindow: () => mainWindow, getAppUrl: () => appUrl });
const testUserDataArg = process.argv.find((value) => value.startsWith('--matrix-user-data-dir='));
if (testUserDataArg) app.setPath('userData', testUserDataArg.slice('--matrix-user-data-dir='.length));
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

function parseEnvFile(filePath) {
  const values = {};
  if (!fs.existsSync(filePath)) return values;
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function secureValue(value) {
  return value && !value.startsWith('replace-with') ? value : randomBytes(48).toString('hex');
}

function runProcess(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, ...options });
    let output = '';
    child.stdout?.on('data', (data) => { output += data.toString(); });
    child.stderr?.on('data', (data) => { output += data.toString(); });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve(output);
      else { const error = new Error(output.trim() || `${path.basename(file)} 退出代码 ${code}`); error.exitCode = code; reject(error); }
    });
  });
}

function canListen(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.listen(port, '127.0.0.1', () => tester.close(() => resolve(true)));
  });
}

async function ensureEmbeddedDatabase() {
  const pgRoot = path.join(process.resourcesPath, 'postgres');
  const bin = path.join(pgRoot, 'bin');
  const initdb = path.join(bin, 'initdb.exe');
  const pgCtl = path.join(bin, 'pg_ctl.exe');
  const createdb = path.join(bin, 'createdb.exe');
  const psql = path.join(bin, 'psql.exe');
  if (!fs.existsSync(initdb)) throw new Error('安装文件不完整：缺少内置数据库组件，请重新安装远效。');

  const dataDir = path.join(app.getPath('userData'), 'database');
  const firstRun = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));
  if (firstRun) {
    fs.mkdirSync(dataDir, { recursive: true });
    // SQL_ASCII avoids a PostgreSQL 18 initdb bug on Chinese Windows profiles
    // where localized account metadata is emitted in GBK during UTF-8 setup.
    // The app and postgres-js still exchange application text as UTF-8 bytes.
    await runProcess(initdb, ['-D', dataDir, '-U', 'matrix', '--auth=trust', '--encoding=SQL_ASCII', '--locale=C'], { timeout: 60000 });
  }

  const control = await withStartupLease(app.getPath('appData'), async () => {
    const recovered = await recoverOwnedDatabase({ pgCtl, psql, dataDir, bin, runProcess });
    if (recovered) return retainOwnedDatabase(recovered);
    assertStartupActive();
    const port = await selectStartupPort(35432, 35452, 35432, canListen);
    if (port === null) throw new Error('本地数据库端口已被占用，未停止其他服务；请关闭其他远效窗口后重试。');
    assertStartupActive();
    const databaseLog = path.join(app.getPath('logs'), 'matrix-database.log');
    fs.mkdirSync(path.dirname(databaseLog), { recursive: true });
    await runProcess(pgCtl, ['-D', dataDir, '-l', databaseLog, '-w', '-t', '15', 'start', '-o', `-h 127.0.0.1 -p ${port}`], { timeout: 20000 });
    const started = await recoverOwnedDatabase({ pgCtl, psql, dataDir, bin, runProcess, databaseName: 'postgres' });
    if (!started || started.port !== port) throw Error('内置数据库启动归属未确认，未连接或接管其他数据库');
    return retainOwnedDatabase(started);
  }, { signal: startupAbort.signal });
  assertStartupActive();
  const port = control.port;

  if (firstRun) {
    const connectionArgs = ['-h', '127.0.0.1', '-p', String(port), '-U', 'matrix'];
    await runProcess(createdb, [...connectionArgs, 'matrix_db'], { timeout: 15000 });
    assertStartupActive();
    const schemaFile = path.join(process.resourcesPath, 'config', 'database-schema.sql');
    const seedFile = path.join(process.resourcesPath, 'config', 'database-seed.sql');
    await runProcess(psql, [...connectionArgs, '-d', 'matrix_db', '-v', 'ON_ERROR_STOP=1', '-f', schemaFile], { timeout: 30000 });
    assertStartupActive();
    await runProcess(psql, [...connectionArgs, '-d', 'matrix_db', '-v', 'ON_ERROR_STOP=1', '-f', seedFile], { timeout: 30000 });
  }
  return `postgresql://matrix@127.0.0.1:${port}/matrix_db`;
}

async function startPackagedServer() {
  if (!app.isPackaged) return;

  const userConfig = path.join(app.getPath('userData'), '.env.local');
  const databaseUrl = await ensureEmbeddedDatabase();
  await withStartupLease(app.getPath('appData'), async () => {
  fs.mkdirSync(path.dirname(userConfig), { recursive: true });
  let config = parseEnvFile(userConfig);
  const serverPort = await selectStartupPort(3210, 3240, Number(config.SERVER_PORT), canListen);
  if (serverPort === null) throw new Error('本地服务端口已被占用，未停止其他服务；请关闭其他远效窗口后重试。');
  assertStartupActive();
  clientOriginState = prepareClientOrigin(app.getPath('userData'), config.SERVER_PORT, serverPort);
  config = {
    ...config,
    NODE_ENV: 'production',
    MIAODA_APP_TYPE: '3',
    MIAODA_LOCAL_DEV: '1',
    MATRIX_DESKTOP: '1',
    FORCE_AUTHN_INNERAPI_DOMAIN: `http://127.0.0.1:${serverPort}`,
    MIAODA_CACHE_URL: '',
    SERVER_HOST: '127.0.0.1',
    SERVER_PORT: String(serverPort),
    SUDA_DATABASE_URL: databaseUrl,
    JWT_SECRET: secureValue(config.JWT_SECRET),
    OAUTH_STATE_SECRET: secureValue(config.OAUTH_STATE_SECRET),
    TOKEN_ENCRYPTION_KEY: secureValue(config.TOKEN_ENCRYPTION_KEY),
  };
  fs.writeFileSync(userConfig, Object.entries(config).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', 'utf8');

  const runtimeRoot = path.join(process.resourcesPath, 'app-runtime');
  const serverEntry = path.join(runtimeRoot, 'dist', 'server', 'main.js');
  if (!fs.existsSync(serverEntry)) throw new Error(`缺少内置服务：${serverEntry}`);

  const port = Number(config.SERVER_PORT || 3210);
  // The desktop client uses a HashRouter so all navigation stays on this
  // single local document and never depends on a cloud platform router.
  appUrl = `http://127.0.0.1:${port}/app/`;
  const nodeModules = path.join(process.resourcesPath, 'app.asar', 'node_modules');
  const logDirectory = app.getPath('logs');
  try { fs.mkdirSync(logDirectory, { recursive: true }); } catch {}
  const logStream = createBoundedServerLog({ directory: logDirectory });
  const logPath = logStream.logPath;
  const startupNonce = randomBytes(32).toString('hex');
  let serverReady = false;

  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: runtimeRoot,
    windowsHide: true,
    env: {
      ...process.env,
      ...config,
      NODE_ENV: 'production',
      MATRIX_DESKTOP: '1',
      MATRIX_FEEDBACK_CONFIG_FILE: path.join(app.getPath('userData'), 'feedback-endpoint.json'),
      SERVER_HOST: '127.0.0.1',
      SERVER_PORT: String(port),
      MATRIX_STARTUP_NONCE: startupNonce,
      NODE_PATH: nodeModules,
      ...readRecoveryMailSettings(app.getPath('userData')),
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.pipe(logStream, { end: false });
  serverProcess.stderr.pipe(logStream, { end: false });
  serverProcess.once('close', () => logStream.end());
  serverProcess.once('exit', (code) => {
    if (serverReady && !app.isQuitting && code !== 0) {
      dialog.showErrorBox('远效服务已停止', `退出代码：${code}\n日志：${logPath}`);
    }
  });
  await waitForOwnedServer(appUrl, serverProcess, startupNonce);
  assertStartupActive();
  serverReady = true;
  }, { signal: startupAbort.signal });
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: '远效',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  });
  windowInteractionLease.bind(win);
  applyDesktopSettings(win);
  watchMainWindowClose(win);
  win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.backgroundThrottling = false;
    const extraConfig = extraPartitions.get(params.partition);
    const safePartition = Boolean(extraConfig) || /^persist:matrix-(douyin|xiaohongshu|wechat|bilibili)-[a-z0-9-]{16,80}$/i.test(params.partition || '');
    let safeUrl = false;
    try {
      const platform = /^persist:matrix-(douyin|xiaohongshu|wechat|bilibili)-/.exec(params.partition || '')?.[1];
      const target = new URL(params.src);
      const domain = extraConfig?.domain || PLATFORM[platform]?.domain;
      safeUrl = target.protocol === 'https:' && Boolean(domain) && (target.hostname === domain || target.hostname.endsWith(`.${domain}`));
    } catch { /* Reject invalid initial URLs. */ }
    if (!safePartition || !safeUrl) event.preventDefault();
  });
  win.webContents.on('did-attach-webview', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      // Route official popups to a sibling guest in the same account partition.
      // Never replace the originating editor or create an unisolated native window.
      let allowed = false;
      try {
        const source = new URL(contents.getURL()), target = new URL(url);
        const platform = Object.values(PLATFORM).find(config => source.hostname === config.domain || source.hostname.endsWith(`.${config.domain}`));
        allowed = target.protocol === 'https:' && !target.username && !target.password && Boolean(platform) && (target.hostname === platform.domain || target.hostname.endsWith(`.${platform.domain}`));
      } catch { /* Invalid and nonofficial popup targets remain blocked. */ }
      if (!win.isDestroyed()) win.webContents.send('matrix:official-page-open', { webContentsId: contents.id, url: allowed ? url : '', blocked: !allowed });
      return { action: 'deny' };
    });
  });
  win.setMenuBarVisibility(false);
  win.on('page-title-updated', (event) => {
    event.preventDefault();
    win.setTitle('远效');
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
  return win;
}

function safeSessionId(value) {
  return typeof value === 'string' && /^[a-z0-9-]{16,80}$/i.test(value);
}

const readBilibiliProfile = require('./bilibili-profile.cjs').createBilibiliProfileReader({
  createWindow: accountSession => new BrowserWindow({ show: false, webPreferences: { session: accountSession, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } }),
  readProfile: guest => require('./official-dom.cjs').runOfficialDOM(guest, readPlatformProfile, ['bilibili'], 'matrix-account-profile'),
});
async function inspectPlatformSession(platform, isolatedSession, contents) {
  const config = PLATFORM[platform];
  const pageUrlBefore = contents && !contents.isDestroyed() ? contents.getURL() : config.home;
  const current = new URL(pageUrlBefore);
  if (current.protocol !== 'https:' || !(current.hostname === config.domain || current.hostname.endsWith('.' + config.domain))) return { authenticated: false, hasSessionCookie: false, profile: /^(?:验证码中间页|安全验证|Captcha(?: Verification)?)(?:\s*[-|].*)?$/i.test(contents?.getTitle?.()||'')?{verificationRequired:true}:{} };
  const cookies = await isolatedSession.cookies.get({ url: pageUrlBefore });
  let profile = { nickname: '', avatarUrl: '', pageUrl: config.home, title: '' };
  if (contents && !contents.isDestroyed()) {
    profile = await contents.executeJavaScript(`(${readPlatformProfile.toString()})(${JSON.stringify(platform)})`, true);
  }
  if (contents && platform === 'bilibili' && (!profile.nickname||!profile.ownIdentity?.key) && classifySession(platform, cookies, profile, pageUrlBefore).authenticated) {
    const own = await readBilibiliProfile(isolatedSession, cookies);
    if (own) profile = { ...own, ...(profile.accountIssue?{accountIssue:profile.accountIssue}:{}), pageUrl: pageUrlBefore };
  }
  const pageUrl = profile.pageUrl || contents?.getURL() || config.home;
  if (contents && contents.getURL() !== pageUrlBefore) return { authenticated: false, hasSessionCookie: false, profile };
  return classifySession(platform, cookies, profile, pageUrl);
}

async function checkPlatformSession(input) {
  const config = PLATFORM[input?.platform];
  if (!config || !safeSessionId(input?.sessionId)) {
    return { healthy: false, message: '本地授权会话无效，请重新绑定账号' };
  }
  try {
    const isolatedSession = session.fromPartition(`persist:matrix-${input.platform}-${input.sessionId}`);
    const state = await inspectPlatformSession(input.platform, isolatedSession);
    return state.authenticated
      ? { healthy: true, message: `本机保留${config.label}登录凭据，请打开官方页面确认是否仍有效` }
      : { healthy: false, message: `未检测到${config.label}登录状态，请重新授权` };
  } catch (error) {
    return { healthy: false, message: error instanceof Error ? error.message : String(error) };
  }
}

async function createDatabaseBackup() {
  if (!app.isPackaged || !databaseControl) return { error: '仅正式安装版支持本地数据库备份' };
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const selected = await dialog.showSaveDialog(mainWindow, {
    title: '保存远效数据备份',
    defaultPath: path.join(app.getPath('documents'), `远效备份-${stamp}.backup`),
    filters: [{ name: '远效数据库备份', extensions: ['backup'] }],
  });
  if (selected.canceled || !selected.filePath) return { cancelled: true };
  const pgDump = path.join(databaseControl.bin, 'pg_dump.exe');
  if (!fs.existsSync(pgDump)) return { error: '安装文件不完整：缺少数据库备份组件' };
  try {
    await runProcess(pgDump, [
      '-h', '127.0.0.1', '-p', String(databaseControl.port), '-U', 'matrix',
      '-d', 'matrix_db', '--format=custom', '--no-owner', '--file', selected.filePath,
    ]);
    return { path: selected.filePath };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function openDataFolder() {
  const folder = app.getPath('userData');
  fs.mkdirSync(folder, { recursive: true });
  const error = await shell.openPath(folder);
  return error ? { error } : { path: folder };
}

async function restoreDatabaseBackup() {
  if (!app.isPackaged || !databaseControl) return { error: '仅正式安装版支持恢复数据库备份' };
  const selected = await dialog.showOpenDialog(mainWindow, {
    title: '选择远效数据库备份',
    properties: ['openFile'],
    filters: [{ name: '远效数据库备份', extensions: ['backup'] }],
  });
  if (selected.canceled || !selected.filePaths[0]) return { cancelled: true };
  const backupPath = selected.filePaths[0];
  const pgRestore = path.join(databaseControl.bin, 'pg_restore.exe');
  if (!fs.existsSync(pgRestore)) return { error: '安装文件不完整：缺少数据库恢复组件' };
  try {
    await runProcess(pgRestore, ['--list', backupPath]);
  } catch {
    return { error: '所选文件不是有效的远效数据库备份' };
  }
  const confirmation = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: '确认恢复数据库',
    message: '恢复会覆盖当前远效数据',
    detail: '软件将自动关闭并重启。建议先为当前数据创建一份备份。',
    buttons: ['取消', '确认覆盖并恢复'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  if (confirmation.response !== 1) return { cancelled: true };
  try {
    if (serverProcess && !serverProcess.killed) {
      const stopped = new Promise((resolve) => serverProcess.once('exit', resolve));
      serverProcess.kill();
      await Promise.race([stopped, new Promise((resolve) => setTimeout(resolve, 5000))]);
      serverProcess = null;
    }
    await runProcess(pgRestore, [
      '-h', '127.0.0.1', '-p', String(databaseControl.port), '-U', 'matrix',
      '-d', 'matrix_db', '--clean', '--if-exists', '--no-owner', '--exit-on-error', backupPath,
    ]);
    app.relaunch();
    app.quit();
    return { restored: true };
  } catch (error) {
    app.relaunch();
    app.quit();
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function openPlatformWindow(platform, existingSessionId) {
  const config = PLATFORM[platform];
  if (!config) throw new Error('不支持的平台');
  const sessionId = existingSessionId || randomUUID();
  if (!safeSessionId(sessionId)) throw new Error('本地会话标识无效');

  const partition = `persist:matrix-${platform}-${sessionId}`;
  const isolatedSession = session.fromPartition(partition, { cache: true });
  isolatedSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    title: `${config.label} · 官方登录`,
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  return new Promise((resolve, reject) => {
    let completed = false;
    const finish = async () => {
      try {
        const state = await inspectPlatformSession(platform, isolatedSession, win.webContents);
        if (!state.authenticated) throw new Error(`尚未检测到${config.label}登录状态，请先完成扫码或账号登录`);
        const profile = bindingProfile(state.profile, config.label);
        if ('error' in profile) throw new Error(profile.error);
        completed = true;
        resolve({ platform, sessionId, ...profile });
        win.close();
      } catch (error) {
        dialog.showErrorBox('无法读取账号信息', error instanceof Error ? error.message : String(error));
      }
    };

    const menu = Menu.buildFromTemplate([
      { label: '授权', submenu: [
        { label: '我已在官方页面完成登录，绑定此账号', click: finish },
        { type: 'separator' },
        { label: '重新加载', click: () => win.reload() },
        { label: '取消', click: () => win.close() },
      ] },
      { label: '安全说明', click: () => dialog.showMessageBox(win, {
        type: 'info',
        title: '本地会话安全说明',
        message: '平台登录会话仅保存在本机 Electron 独立分区中。远效服务端不会接收平台 Cookie。',
      }) },
    ]);
    win.setMenu(menu);
    win.loadURL(config.home);
    win.on('closed', () => {
      if (!completed) reject(new Error('用户取消了平台登录'));
    });
  });
}

function preparePlatformSession(platform, existingSessionId) {
  const config = PLATFORM[platform];
  if (!config) throw new Error('不支持的平台');
  const sessionId = existingSessionId || randomUUID();
  if (!safeSessionId(sessionId)) throw new Error('本地会话标识无效');
  const partition = `persist:matrix-${platform}-${sessionId}`;
  const isolatedSession = session.fromPartition(partition, { cache: true });
  isolatedSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'clipboard-sanitized-write');
  });
  return { platform, sessionId, partition, url: config.home, label: config.label, ...(platform === 'wechat' && process.platform === 'win32' ? { engine: 'webview2' } : {}) };
}

async function completeEmbeddedPlatformLogin(input) {
  const config = PLATFORM[input?.platform];
  if (!config) return { error: '不支持的平台' };
  if (!safeSessionId(input?.sessionId) || !Number.isInteger(input?.webContentsId)) {
    return { error: '内嵌授权会话无效，请重新打开官方登录页' };
  }
  const contents = webContents.fromId(input.webContentsId);
  if (!contents || contents.isDestroyed() || contents.getType() !== 'webview') {
    return { error: '官方登录页已关闭，请重新打开' };
  }
  const expectedSession = session.fromPartition(`persist:matrix-${input.platform}-${input.sessionId}`);
  if (contents.session !== expectedSession) {
    return { error: '当前页面与所选账号会话不一致，请重新打开' };
  }
  let currentUrl;
  try {
    currentUrl = new URL(contents.getURL());
  } catch {
    return { error: '授权页面校验失败，请重新打开' };
  }
  const officialHost = currentUrl.hostname === config.domain || currentUrl.hostname.endsWith(`.${config.domain}`);
  if (currentUrl.protocol !== 'https:' || !officialHost) {
    return { error: '授权页面校验失败，请重新打开' };
  }
  try {
    const state = await inspectPlatformSession(input.platform, expectedSession, contents);
    if (state.profile?.accountIssue) return bindingProfile(state.profile, config.label);
    if (!state.authenticated) {
      return { error: `尚未检测到${config.label}登录状态，请先在上方官方页面完成扫码或账号登录`, loginRequired: true };
    }
    const profile = bindingProfile(state.profile, config.label);
    if ('error' in profile) return profile;
    return { platform: input.platform, sessionId: input.sessionId, ...profile };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function safePlatformWindow(platform, sessionId) {
  try {
    return await openPlatformWindow(platform, sessionId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === '用户取消了平台登录') return { cancelled: true };
    return { error: message || '平台窗口打开失败' };
  }
}

ipcMain.handle('matrix:platform-login', (_event, platform) => safePlatformWindow(platform));
ipcMain.handle('matrix:open-account-session', async (_event, input) => {
  return safePlatformWindow(input.platform, input.sessionId);
});
ipcMain.handle('matrix:prepare-platform-login', (_event, input) => {
  try {
    return preparePlatformSession(input?.platform, input?.sessionId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
});
ipcMain.handle('matrix:complete-platform-login', (_event, input) => completeEmbeddedPlatformLogin(input));
ipcMain.handle('matrix:check-platform-session', (event, input) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return { healthy: false, message: '只允许远效主窗口检查本机会话' };
  return checkPlatformSession(input);
});
ipcMain.handle('matrix:create-database-backup', () => createDatabaseBackup());
ipcMain.handle('matrix:open-data-folder', () => openDataFolder());
ipcMain.handle('matrix:restore-database-backup', () => restoreDatabaseBackup());
const authenticateDesktop = require('./desktop-authentication.cjs').createDesktopAuthentication({
  getOrigin:()=>new URL(appUrl).origin,
  getSession:()=>mainWindow.webContents.session,
});
const edgeEmbed = require('./edge-embed.cjs').registerEdgeEmbed({ ipcMain, getWindow: () => mainWindow, authenticate: authenticateDesktop,
  userData: app.getPath('userData'), helperPath: app.isPackaged ? path.join(process.resourcesPath, 'edge-host', 'MatrixEdgeHost.exe') : path.join(__dirname, '..', '.desktop-runtime', 'edge-host', 'MatrixEdgeHost.exe') });
require('./bilibili-interactions.cjs').registerBilibiliInteractions({ ipcMain, getWindow: () => mainWindow, authenticate: authenticateDesktop, session });
const followerLayoutProbe=require('./douyin-follower-layout-probe.cjs').createFollowerLayoutProbe({directory:app.getPath('logs'),version:app.getVersion()});
const douyinPublicAssetManifest=require('./douyin-public-asset-manifest.cjs').createPublicAssetManifest({directory:app.getPath('logs'),version:app.getVersion()});
const douyinFollowerInitEvidence=require('./douyin-follower-init-evidence.cjs').createFollowerInitEvidence({directory:app.getPath('logs'),version:app.getVersion()});
const douyinBrowserReader = require('./douyin-browser-reader.cjs').createBrowserReader({
  requireFollowerResponses:true,
  independentReads:true,
  captureFollowerLayout:input=>followerLayoutProbe.capture(input),
  publicAssetObserver:url=>douyinPublicAssetManifest.record(url),
  initializationEvidence:event=>douyinFollowerInitEvidence.record(event),
  createWindow: accountSession => new BrowserWindow({ show: false, width: 1280, height: 900, skipTaskbar: true,
    webPreferences: { session: accountSession, preload:path.join(__dirname,'douyin-followers-preload.cjs'), additionalArguments:['--matrix-follower-dom-only',...(douyinFollowerInitEvidence.snapshot().enabled?['--matrix-follower-init-sites-rc187']:[])],sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } }),
});
const douyinCreatorReader = require('./douyin-creator-reader.cjs').createCreatorReader({ acquireIdentity: douyinBrowserReader.acquire, requireResponses: true,
  createWindow: accountSession => new BrowserWindow({ show: false, width: 1280, height: 900, skipTaskbar: true,
    webPreferences: { session: accountSession, preload: path.join(__dirname, 'douyin-creator-preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } }),
});
const douyinDiagnostics=require('./douyin-sync-diagnostics.cjs').createSyncDiagnostics({directory:app.getPath('logs')});
let accountOperations;
const douyinInteractions=require('./douyin-interactions.cjs').registerDouyinInteractions({ ipcMain, getWindow: () => mainWindow, authenticate: authenticateDesktop, session, diagnostics:douyinDiagnostics,onComments:event=>accountOperations?.observe(event),
  openFollowerReader:require('./douyin-open-followers.cjs').createOpenFollowerReader({getWindow:()=>mainWindow,webContents,session}),
  followerAvatarProfileReader:options=>douyinBrowserReader.readPublicAvatar(options),
  safeStorage: require('electron').safeStorage, userData: app.getPath('userData'),
  transportFactory: options => options.kind === 'comments' ? douyinCreatorReader.acquire(options) : douyinBrowserReader.acquire(options) });
const douyinInbox = require('./douyin-inbox.cjs').registerDouyinInbox({ ipcMain, getWindow: () => mainWindow, authenticate: authenticateDesktop, session, safeStorage: require('electron').safeStorage, userData: app.getPath('userData'),diagnostics:douyinDiagnostics,historyPaused:()=>windowInteractionLease.paused(),onMessage:event=>accountOperations?.observe(event) });
const operationsBrowserServices=require('./account-operations-native-browser.cjs').createOperationsBrowserServices({BrowserWindow,session,getInbox:()=>douyinInbox,acquireDouyinIdentity:douyinBrowserReader.acquire});
accountOperations=require('./account-operations.cjs').registerAccountOperations({ipcMain,getWindow:()=>mainWindow,authenticate:authenticateDesktop,safeStorage:require('electron').safeStorage,userData:app.getPath('userData'),getInbox:()=>douyinInbox,getInteractions:()=>douyinInteractions,...operationsBrowserServices,paused:()=>windowInteractionLease.paused()});
require('./douyin-public-emoji.cjs').registerPublicEmoji({ipcMain,getWindow:()=>mainWindow});
const accountHealth=require('./account-health.cjs').registerAccountHealth({ipcMain,getWindow:()=>mainWindow,authenticate:authenticateDesktop,session,platforms:PLATFORM,inspectPlatformSession,inspectNative:edgeEmbed.inspectAccountProfile,diagnostics:douyinDiagnostics,
  prepareReadContext:require('./douyin-profile-context.cjs').createProfileContext(),
  readDouyinIdentity:require('./douyin-profile-preload.cjs').readObservedIdentity,
  readDouyinPublishIdentity:options=>require('./douyin-publish-identity.cjs').readPublishIdentity(options,douyinBrowserReader.acquire),
  readDouyinMetrics:options=>require('./douyin-bound-metrics.cjs').readBoundMetrics(options,douyinBrowserReader.acquire),
  createWindow:(accountSession,platform)=>new BrowserWindow({show:false,webPreferences:{session:accountSession,...(platform==='douyin'?{preload:path.join(__dirname,'douyin-profile-preload.cjs')}:{}),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}})});
require('./extra-workspaces.cjs').registerExtraWorkspaces({ ipcMain, getWindow: () => mainWindow, authenticate: authenticateDesktop, userData: app.getPath('userData'),
  prepareSession: item => {
    const partition = `persist:matrix-extra-${item.provider}-${item.sessionId}`;
    extraPartitions.set(partition, { domain: item.domain });
    const isolated = session.fromPartition(partition);
    isolated.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'clipboard-sanitized-write'));
    return { partition, url: item.url };
  },
});
const publishDataDirectory = app.getPath('userData');
const publishJournal = createJournal(path.join(publishDataDirectory, 'operation-records'));
const publishMediaStore = require('./publish-media.cjs').createPublishMediaStore(path.join(publishDataDirectory, 'publish-media'), require('electron').nativeImage);
require('./publish-storage-status.cjs').registerPublishStorageStatus({ ipcMain, getWindow: () => mainWindow, authenticate: authenticateDesktop,
  journal: publishJournal, mediaStore: publishMediaStore, dataDirectory: publishDataDirectory });
const publishPreview = require('./publish-preview.cjs').registerPublishPreview({ ipcMain, getWindow: () => mainWindow, getAppUrl: () => appUrl, authenticate: authenticateDesktop, mediaStore: publishMediaStore });
registerPersonalAssist({ ipcMain, dialog, webContents, session, getWindow: () => mainWindow, platforms: PLATFORM, inspectPlatformSession,
  authenticate: authenticateDesktop,
  mediaStore: publishMediaStore,
  evidenceStore: require('./publish-evidence.cjs').createPublishEvidenceStore(path.join(publishDataDirectory, 'operation-records')),
  resolveEdgeContext: edgeEmbed.resolveContext,
});
registerPageActions({ ipcMain, dialog, webContents, session, getWindow: () => mainWindow, platforms: PLATFORM, inspectPlatformSession,
  journal: publishJournal, authenticate: authenticateDesktop,
  inspectAccountHealth:accountHealth.inspect,
  resolveEdgeContext: edgeEmbed.resolveContext,
  createEdgeResultContext: edgeEmbed.createResultContext,
  inspectNativeAccount: edgeEmbed.inspectAccountProfile,
});

const oneClickComments=require('./one-click-comments.cjs').registerOneClickComments({ipcMain,getWindow:()=>mainWindow,authenticate:authenticateDesktop,journal:publishJournal,userData:app.getPath('userData'),safeStorage:require('electron').safeStorage,session,...operationsBrowserServices,inspectAccountHealth:accountHealth.inspect,getOwnWork:input=>douyinInteractions.findOwnWork(input)});

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;
  try {
    await startPackagedServer();
    if (app.isQuitting) return;
    mainWindow = createMainWindow();
    if (clientOriginState) await migrateClientStorage(mainWindow, clientOriginState, appUrl);
    assertStartupActive();
    await mainWindow.loadURL(appUrl);
    mainDocumentReady = true;
  } catch (error) {
    await handleStartupFailure(error);
  }
});
app.on('window-all-closed', () => app.quit());
let inboxQuitPending=false,inboxQuitDrained=false;
app.on('before-quit', event => {
  app.isQuitting = true;
  startupAbort.abort();
  if(!inboxQuitDrained){
    event.preventDefault();
    if(!inboxQuitPending){
      inboxQuitPending=true;
      // Stop new work immediately, then finish/cancel the existing atomic
      // archive transaction before shutting down the server and database.
      Promise.resolve().then(()=>oneClickComments.close()).then(()=>accountOperations.close()).then(()=>douyinInbox.close()).finally(()=>{inboxQuitDrained=true;app.quit();}).catch(()=>{});
    }
    return;
  }
  const failures = cleanupResources([
    ['window-interaction-lease', () => windowInteractionLease.close()],
    ['douyin-interactions', () => douyinInteractions.close()],
    ['douyin-creator-reader', () => douyinCreatorReader.close()],
    ['douyin-browser-reader', () => douyinBrowserReader.close()],
    ['douyin-inbox', () => douyinInbox.close()],
    ['preview', () => publishPreview.close()],
    ['native-pages', () => edgeEmbed.close()],
    ['local-server', () => { if (serverProcess && !serverProcess.killed) serverProcess.kill(); }],
    ['local-database', stopEmbeddedDatabase],
  ]);
  if (failures.length) { try { fs.appendFileSync(path.join(app.getPath('logs'), 'matrix-lifecycle.log'), JSON.stringify({ at: new Date().toISOString(), failedSteps: failures }) + '\n'); } catch {} }
});
app.on('activate', () => {
  if (gotSingleInstanceLock && mainDocumentReady && !app.isQuitting && BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createMainWindow();
    void mainWindow.loadURL(appUrl).catch(handleStartupFailure);
  }
});
