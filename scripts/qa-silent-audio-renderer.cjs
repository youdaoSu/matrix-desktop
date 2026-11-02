const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, webContents } = require('electron');
const { registerSilentAudio } = require('../desktop/audio-policy.cjs');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-silent-audio-'));
app.setPath('userData', profile);
registerSilentAudio({ app });

app.whenReady().then(async () => {
  const windows = [];
  try {
    assert.equal(app.commandLine.hasSwitch('mute-audio'), true);
    const main = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, webviewTag: true } });
    windows.push(main);
    assert.equal(main.webContents.isAudioMuted(), true);
    await main.loadURL('data:text/html,<title>Silent isolated fixture</title><webview src="data:text/html,Silent%20guest"></webview>');
    assert.equal(main.webContents.isAudioMuted(), true);
    let guest;
    for (let i = 0; i < 100; i++) {
      guest = webContents.getAllWebContents().find(contents => contents.getType() === 'webview');
      if (guest && !guest.isLoading()) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(guest, 'Isolated webview was not created');
    assert.equal(guest.isAudioMuted(), true);
    await guest.loadURL('data:text/html,Silent%20navigation');
    assert.equal(guest.isAudioMuted(), true);
    const hidden = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
    windows.push(hidden);
    assert.equal(hidden.webContents.isAudioMuted(), true);
    console.log(JSON.stringify({ isolatedElectronAudioChecks: 7, mainAndGuestAndHiddenWindowsMuted: true, navigationPreservesMute: true, mediaPlaybackStarted: false }));
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally {
    for (const win of windows) if (!win.isDestroyed()) win.destroy();
    // A fresh temporary QA profile only; never open or remove the user's data.
    app.exit(process.exitCode || 0);
  }
});
