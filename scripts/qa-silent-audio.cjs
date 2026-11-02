const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { registerSilentAudio } = require('../desktop/audio-policy.cjs');
const { registerDesktopSettings } = require('../desktop/settings.cjs');

const fakeApp = new EventEmitter();
const switches = [];
fakeApp.commandLine = { appendSwitch: name => switches.push(name) };
registerSilentAudio({ app: fakeApp });
assert.deepEqual(switches, ['mute-audio']);
for (const kind of ['main', 'official-guest', 'hidden-profile', 'popup']) {
  const calls = [];
  fakeApp.emit('web-contents-created', {}, { setAudioMuted: value => calls.push(value) });
  assert.deepEqual(calls, [true], kind);
}

async function checkNotifications() {
  const handlers = new Map(), notifications = [];
  class Notification {
    static isSupported() { return true; }
    constructor(options) { this.options = options; }
    show() { notifications.push(this.options); }
  }
  const contents = { id: 1, getURL: () => 'http://127.0.0.1:3291/app/' };
  registerDesktopSettings({
    app: { getPath: () => 'unused-qa-path', isPackaged: false },
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    shell: {}, Notification, getWindow: () => ({ webContents: contents }),
    getAppUrl: () => 'http://127.0.0.1:3291',
    fileSystem: { readFileSync: () => { throw Error('No preferences in isolated fixture'); } },
  });
  const notify = handlers.get('matrix:system-settings');
  for (const category of ['test', 'publish', 'reminder']) {
    assert.deepEqual(await notify({ sender: contents }, { command: 'notify', category }), { requested: true });
    assert.equal(notifications.at(-1).silent, true);
  }
  assert.ok((await notify({ sender: contents }, { command: 'notify', category: 'invalid' })).error);
  assert.equal(notifications.length, 3);
}

checkNotifications().then(() => {
  const root = path.resolve(__dirname, '..');
  const result = spawnSync(path.join(root, '.desktop-deps/node_modules/electron/dist/electron.exe'), [path.join(__dirname, 'qa-silent-audio-renderer.cjs')], {
    cwd: root, windowsHide: true, encoding: 'utf8', timeout: 30000,
  });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'Isolated Electron silence test failed');
  console.log(JSON.stringify({ silentAudioPolicyChecks: 13, notificationSoundsDisabled: true, realNotificationsShown: false, userDataUntouched: true }));
}).catch(error => { console.error(error); process.exitCode = 1; });
