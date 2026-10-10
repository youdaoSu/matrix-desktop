const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell, webContents } = require('electron');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');

let appUrl = process.env.MATRIX_APP_URL || 'http://localhost:8080';
let serverProcess = null;
let databaseControl = null;

const PLATFORM = Object.freeze({
  douyin: { label: '抖音', home: 'https://creator.douyin.com/', domain: 'douyin.com' },
  xiaohongshu: { label: '小红书', home: 'https://creator.xiaohongshu.com/', domain: 'xiaohongshu.com' },
  wechat: { label: '视频号', home: 'https://channels.weixin.qq.com/', domain: 'weixin.qq.com' },
  bilibili: { label: 'B站', home: 'https://member.bilibili.com/', domain: 'bilibili.com' },
});

let mainWindow;
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

function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const probe = () => {
      const request = http.get(url, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) resolve();
        else retry();
      });
      request.setTimeout(1500, () => request.destroy());
      request.on('error', retry);
    };
    const retry = () => {
      if (Date.now() >= deadline) reject(new Error('内置服务启动超时'));
      else setTimeout(probe, 250);
    };
    probe();
  });
}

function runProcess(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, ...options });
    let output = '';
    child.stdout?.on('data', (data) => { output += data.toString(); });
    child.stderr?.on('data', (data) => { output += data.toString(); });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve(output) : reject(new Error(output.trim() || `${path.basename(file)} 退出代码 ${code}`)));
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
  if (!fs.existsSync(initdb)) throw new Error('安装文件不完整：缺少内置数据库组件，请重新安装矩效。');

  const dataDir = path.join(app.getPath('userData'), 'database');
  const firstRun = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));
  if (firstRun) {
    fs.mkdirSync(dataDir, { recursive: true });
    // SQL_ASCII avoids a PostgreSQL 18 initdb bug on Chinese Windows profiles
    // where localized account metadata is emitted in GBK during UTF-8 setup.
    // The app and postgres-js still exchange application text as UTF-8 bytes.
    await runProcess(initdb, ['-D', dataDir, '-U', 'matrix', '--auth=trust', '--encoding=SQL_ASCII', '--locale=C']);
  }

  let port = 35432;
  while (port < 35452 && !(await canListen(port))) port += 1;
  if (port >= 35452) throw new Error('本地数据库端口被占用，请重启电脑后再试。');
  const databaseLog = path.join(app.getPath('logs'), 'matrix-database.log');
  fs.mkdirSync(path.dirname(databaseLog), { recursive: true });
  await runProcess(pgCtl, ['-D', dataDir, '-l', databaseLog, '-w', 'start', '-o', `-h 127.0.0.1 -p ${port}`]);
  databaseControl = { pgCtl, dataDir, bin, port };

  if (firstRun) {
    const connectionArgs = ['-h', '127.0.0.1', '-p', String(port), '-U', 'matrix'];
    await runProcess(createdb, [...connectionArgs, 'matrix_db']);
    const schemaFile = path.join(process.resourcesPath, 'config', 'database-schema.sql');
    const seedFile = path.join(process.resourcesPath, 'config', 'database-seed.sql');
    await runProcess(psql, [...connectionArgs, '-d', 'matrix_db', '-v', 'ON_ERROR_STOP=1', '-f', schemaFile]);
    await runProcess(psql, [...connectionArgs, '-d', 'matrix_db', '-v', 'ON_ERROR_STOP=1', '-f', seedFile]);
  }
  return `postgresql://matrix@127.0.0.1:${port}/matrix_db`;
}

async function startPackagedServer() {
  if (!app.isPackaged) return;

  const userConfig = path.join(app.getPath('userData'), '.env.local');
  const databaseUrl = await ensureEmbeddedDatabase();
  fs.mkdirSync(path.dirname(userConfig), { recursive: true });
  let config = parseEnvFile(userConfig);
  let serverPort = Number(config.SERVER_PORT || 3210);
  while (serverPort < 3240 && !(await canListen(serverPort))) serverPort += 1;
  if (serverPort >= 3240) throw new Error('本地服务端口被占用，请关闭其他矩效窗口后重试。');
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
  const logPath = path.join(app.getPath('logs'), 'matrix-server.log');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });

  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: runtimeRoot,
    windowsHide: true,
    env: {
      ...process.env,
      ...config,
      NODE_ENV: 'production',
      MATRIX_DESKTOP: '1',
      SERVER_HOST: '127.0.0.1',
      SERVER_PORT: String(port),
      NODE_PATH: nodeModules,
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.pipe(logStream);
  serverProcess.stderr.pipe(logStream);
  serverProcess.once('exit', (code) => {
    if (!app.isQuitting && code !== 0) {
      dialog.showErrorBox('矩效服务已停止', `退出代码：${code}\n日志：${logPath}`);
    }
  });
  await waitForServer(appUrl);
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: '矩效 Matrix',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  });
  win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    const safePartition = /^persist:matrix-(douyin|xiaohongshu|wechat|bilibili)-[a-z0-9-]{16,80}$/i.test(params.partition || '');
    let safeUrl = false;
    try {
      const platform = /^persist:matrix-(douyin|xiaohongshu|wechat|bilibili)-/.exec(params.partition || '')?.[1];
      const target = new URL(params.src);
      const domain = PLATFORM[platform]?.domain;
      safeUrl = target.protocol === 'https:' && Boolean(domain) && (target.hostname === domain || target.hostname.endsWith(`.${domain}`));
    } catch { /* Reject invalid initial URLs. */ }
    if (!safePartition || !safeUrl) event.preventDefault();
  });
  win.webContents.on('did-attach-webview', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//i.test(url)) void contents.loadURL(url);
      return { action: 'deny' };
    });
  });
  win.setMenuBarVisibility(false);
  win.on('page-title-updated', (event) => {
    event.preventDefault();
    win.setTitle('矩效 Matrix');
  });
  win.loadURL(appUrl);
  win.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
  return win;
}

function safeSessionId(value) {
  return typeof value === 'string' && /^[a-z0-9-]{16,80}$/i.test(value);
}

function platformProfileScript() {
  return `(() => {
    const text = (el) => el && (el.getAttribute('title') || el.getAttribute('alt') || el.textContent || '').trim();
    const nicknameSelectors = [
      '[class*=nickname]', '[class*=user-name]', '[class*=username]',
      '[class*=account-name]', '[class*=userName]', '[class*=name]'
    ];
    const avatarSelectors = [
      'img[class*=avatar]', '[class*=avatar] img', 'img[class*=user]', 'header img'
    ];
    let nickname = '';
    for (const selector of nicknameSelectors) {
      const candidate = text(document.querySelector(selector));
      if (candidate && candidate.length <= 80) { nickname = candidate; break; }
    }
    let avatarUrl = '';
    for (const selector of avatarSelectors) {
      const src = document.querySelector(selector)?.src;
      if (src && /^https?:/.test(src)) { avatarUrl = src; break; }
    }
    return {
      nickname,
      avatarUrl,
      pageUrl: location.href,
      title: document.title.trim()
    };
  })()`;
}

const AUTH_COOKIE_NAMES = Object.freeze({
  douyin: ['sessionid', 'sessionid_ss', 'sid_guard'],
  xiaohongshu: ['web_session'],
  wechat: ['sessionid', 'wxuin', 'uin', 'pass_ticket', 'ticket', 'token'],
  bilibili: ['SESSDATA'],
});

function isLoginPage(url) {
  return /(?:login|passport|signin|auth\/login|passport\.bilibili)/i.test(url || '');
}

async function inspectPlatformSession(platform, isolatedSession, contents) {
  const config = PLATFORM[platform];
  const cookies = await isolatedSession.cookies.get({ url: config.home });
  const expectedNames = AUTH_COOKIE_NAMES[platform] || [];
  const cookieNames = new Set(cookies.map((cookie) => cookie.name));
  const hasSessionCookie = expectedNames.some((name) => cookieNames.has(name));
  let profile = { nickname: '', avatarUrl: '', pageUrl: config.home, title: '' };
  if (contents && !contents.isDestroyed()) {
    profile = await contents.executeJavaScript(platformProfileScript(), true);
  }
  const pageUrl = profile.pageUrl || contents?.getURL() || config.home;
  const hasProfile = Boolean(profile.nickname && !/登录|扫码|login|sign in/i.test(profile.nickname));
  const authenticated = !isLoginPage(pageUrl) && (hasSessionCookie || (platform === 'wechat' && hasProfile));
  return { authenticated, hasSessionCookie, profile };
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
      ? { healthy: true, message: `${config.label}登录会话有效` }
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
    title: '保存矩效数据备份',
    defaultPath: path.join(app.getPath('documents'), `矩效备份-${stamp}.backup`),
    filters: [{ name: '矩效数据库备份', extensions: ['backup'] }],
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
    title: '选择矩效数据库备份',
    properties: ['openFile'],
    filters: [{ name: '矩效数据库备份', extensions: ['backup'] }],
  });
  if (selected.canceled || !selected.filePaths[0]) return { cancelled: true };
  const backupPath = selected.filePaths[0];
  const pgRestore = path.join(databaseControl.bin, 'pg_restore.exe');
  if (!fs.existsSync(pgRestore)) return { error: '安装文件不完整：缺少数据库恢复组件' };
  try {
    await runProcess(pgRestore, ['--list', backupPath]);
  } catch {
    return { error: '所选文件不是有效的矩效数据库备份' };
  }
  const confirmation = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: '确认恢复数据库',
    message: '恢复会覆盖当前矩效数据',
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
        const profile = state.profile;
        completed = true;
        resolve({ platform, sessionId, ...profile, nickname: profile.nickname || `${config.label}账号` });
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
        message: '平台登录会话仅保存在本机 Electron 独立分区中。矩效服务端不会接收平台 Cookie。',
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
  return { platform, sessionId, partition, url: config.home, label: config.label };
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
    if (!state.authenticated) {
      return { error: `尚未检测到${config.label}登录状态，请先在上方官方页面完成扫码或账号登录` };
    }
    const profile = state.profile;
    return { platform: input.platform, sessionId: input.sessionId, ...profile, nickname: profile.nickname || `${config.label}账号` };
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
ipcMain.handle('matrix:check-platform-session', (_event, input) => checkPlatformSession(input));
ipcMain.handle('matrix:create-database-backup', () => createDatabaseBackup());
ipcMain.handle('matrix:open-data-folder', () => openDataFolder());
ipcMain.handle('matrix:restore-database-backup', () => restoreDatabaseBackup());

app.whenReady().then(async () => {
  try {
    await startPackagedServer();
    mainWindow = createMainWindow();
  } catch (error) {
    if (error?.message !== 'Missing desktop environment configuration') {
      dialog.showErrorBox('矩效启动失败', error instanceof Error ? error.message : String(error));
    }
    app.quit();
  }
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  app.isQuitting = true;
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
  if (databaseControl) {
    spawnSync(databaseControl.pgCtl, ['-D', databaseControl.dataDir, '-m', 'fast', '-w', 'stop'], {
      windowsHide: true,
      timeout: 15000,
    });
    databaseControl = null;
  }
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow();
});
