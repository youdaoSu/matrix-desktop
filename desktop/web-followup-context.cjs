const { runOfficialDOM } = require('./official-dom.cjs');
const { publishResult } = require('./publish-result.cjs');

async function waitForOwnProfile({ inspect, nativeAccountKey, alive = () => true, timeoutMs = 12000, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const end = now() + timeoutMs; let last, loginSamples = 0;
  while (now() < end && alive()) {
    last = await inspect();
    if (!alive()) throw Error('原作品读取窗口已关闭，未开始追评');
    if (last.profile?.ownIdentity?.key && last.profile.ownIdentity.key !== nativeAccountKey) throw Error('官方本人ID与绑定账号不一致，未读取其他账号作品');
    if (last.authenticated && last.profile?.ownIdentity?.key === nativeAccountKey) return;
    if (last.profile?.accountIssue) throw Error('官方主页显示账号异常，未操作追评或置顶');
    loginSamples = last.profile?.loginVisible && !last.authenticated ? loginSamples + 1 : 0;
    if (loginSamples >= 3) throw Error('官方主页持续显示登录页面，请在账号管理恢复此账号登录');
    await sleep(Math.min(400, Math.max(0, end - now())));
  }
  if (!alive()) throw Error('原作品读取窗口已关闭，未开始追评');
  throw Error(last?.authenticated ? '官方登录仍有效，但本人ID未在主页中识别到，未发送追评；不是判定账号已退出' : '官方主页本人ID与登录尚未读取完成，未发送追评；请稍后重试，不能据此判定已退出');
}

function createWebFollowupContext({ session, inspectPlatformSession, createWindow, createEdgeResultContext, inspectNativeAccount, ownerTimeoutMs = 12000 }) {
  return async (event, input, account) => {
    if (account.platform === 'wechat' && createEdgeResultContext && inspectNativeAccount) {
      const native = await createEdgeResultContext(event, { accessToken: input.accessToken, accountId: account.id, sessionId: account.connectorSessionId });
      try {
        if (native.nativeAccountKey !== account.nativeAccountKey) throw Error('视频号本人ID与原作品账号不一致');
        return { guest: native.guest, close: native.close,
          readWork: parent => runOfficialDOM(native.guest, publishResult, [parent], 'matrix-publish-result'),
          assertOwner: async () => {
            const result = await inspectNativeAccount(event, { accessToken: input.accessToken, accountId: account.id, sessionId: account.connectorSessionId, platform: 'wechat' });
            if (!result.authenticated || result.profile?.ownIdentity?.key !== account.nativeAccountKey) throw Error('视频号官方本人ID尚未确认，未操作追评或置顶');
          },
        };
      } catch (error) { native.close(); throw error; }
    }
    const routes = { wechat: ['https://channels.weixin.qq.com/platform/home', 'https://channels.weixin.qq.com/platform/post/list'], xiaohongshu: ['https://creator.xiaohongshu.com/new/home', 'https://creator.xiaohongshu.com/new/note-manager'], douyin: ['https://creator.douyin.com/creator-micro/home', 'https://creator.douyin.com/creator-micro/content/manage'], bilibili: ['https://member.bilibili.com/platform/home', 'https://member.bilibili.com/platform/upload-manager/article'] };
    const route = routes[account.platform]; if (!route) throw Error('未提供此平台的官方作品读取连接');
    const accountSession = session.fromPartition('persist:matrix-' + account.platform + '-' + account.connectorSessionId), hostname = new URL(route[0]).hostname;
    const windows = [], close = () => { for (const win of windows) if (!win.isDestroyed()) win.destroy(); };
    const make = () => {
      const win = createWindow ? createWindow(accountSession) : new (require('electron').BrowserWindow)({ show: false, width: 1280, height: 900, webPreferences: { session: accountSession, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
      windows.push(win); win.webContents.setAudioMuted(true); win.webContents.setWindowOpenHandler?.(() => ({ action: 'deny' }));
      win.webContents.on?.('will-navigate', (navigation, href) => { try { const url = new URL(href); if (url.protocol !== 'https:' || url.hostname !== hostname) navigation.preventDefault(); } catch { navigation.preventDefault(); } });
      return win;
    };
    try {
      const home = make(), work = make();
      const assertOwner = async () => {
        await home.webContents.loadURL(route[0]);
        await waitForOwnProfile({ inspect: () => inspectPlatformSession(account.platform, accountSession, home.webContents), nativeAccountKey: account.nativeAccountKey, alive: () => !home.isDestroyed() && !work.isDestroyed(), timeoutMs: ownerTimeoutMs });
      };
      await assertOwner(); await work.webContents.loadURL(route[1]);
      return { guest: work.webContents, close, assertOwner, readWork: parent => runOfficialDOM(work.webContents, publishResult, [parent], 'matrix-publish-result') };
    } catch (error) { close(); throw error; }
  };
}
module.exports = { createWebFollowupContext, waitForOwnProfile };
