const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readPlatformProfile, bindingProfile } = require('../desktop/platform-profile.cjs');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-profile-qa-')));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  let checks = 0;
  const fixture = async (html, expected, platform = 'xiaohongshu') => {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const result = await win.webContents.executeJavaScript(`(${readPlatformProfile.toString()})(${JSON.stringify(platform)})`);
    assert.equal(result.nickname, expected); checks++; return result;
  };
  try {
    await fixture('<div class="user"><span class="name">小健身 🏋️</span></div>', '小健身 🏋️');
    await fixture('<div class="user-info"><span class="name">我的账号</span></div>', '我的账号');
    await fixture('<span class="user-name" title="完整账号名称">完整账…</span>', '完整账号名称');
    await fixture('<span class="user-name" style="display:none">旧账号</span><span class="user-name">新账号</span>', '新账号');
    await fixture('<span class="user-name">登录</span><span class="user-name">真实昵称</span>', '真实昵称');
    await fixture('<div class="comment"><span class="nickname">别人的评论</span></div><header><span class="nickname">本人</span></header>', '本人');
    await fixture('<div class="comment"><span class="nickname">别人的评论</span></div>', '');
    await fixture('<main><article><span class="nickname">作品作者</span></article></main>', '');
    await fixture('<span class="nickname">小红书账号</span>', '');
    await fixture('<span class="nickname">登录火星的猫</span>', '登录火星的猫');
    await fixture('<span class="nickname">  阿明\n 健身  </span>', '阿明 健身');
    await fixture('<header><span class="userName">抖音昵称</span></header>', '抖音昵称', 'douyin');
    await fixture('<div class="finder-nickname">视频号昵称</div>', '视频号昵称', 'wechat');
    await fixture('<div class="header-entry-mini"><span class="nickname">B站昵称</span></div>', 'B站昵称', 'bilibili');
    assert.equal((await fixture('<input placeholder="手机号"><header><span class="user-name">旧昵称</span></header>', '旧昵称')).loginVisible, true); checks++;
    assert.equal(bindingProfile({ nickname: '' }, '小红书').pendingProfile, true); checks++;
    assert.equal(bindingProfile({ nickname: '  我的小红书  ' }, '小红书').nickname, '我的小红书'); checks++;
    console.log(JSON.stringify({ profileRecognitionChecks: checks, realPlatformData: false }));
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { win.destroy(); app.exit(process.exitCode || 0); }
});
