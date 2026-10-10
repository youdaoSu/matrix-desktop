const assert = require('node:assert/strict');
const { selectUploadInput, registerPersonalAssist } = require('../desktop/personal-assist.cjs');
const video = { nodeId: 1, accept: 'video/mp4,.mov', visible: true, multiple: false };
const image = { nodeId: 2, accept: 'image/png,image/jpeg', visible: true, multiple: true };
assert.equal(selectUploadInput([video, image], 'video', 1), 1);
assert.equal(selectUploadInput([video, image], 'image', 3), 2);
assert.throws(() => selectUploadInput([], 'video', 1));
assert.throws(() => selectUploadInput([video, { ...video, nodeId: 3 }], 'video', 1));
assert.throws(() => selectUploadInput([{ ...video, visible: false }], 'video', 1));
assert.throws(() => selectUploadInput([{ ...image, multiple: false }], 'image', 3));
assert.throws(() => selectUploadInput([image], 'video', 1));
assert.throws(() => selectUploadInput([{ ...video, accept: '' }], 'video', 1));
console.log('8 upload control selection and fail-safe checks passed; no platform uploads performed');
async function testIpc() {
  let handler;
  let authenticated = true;
  let url = 'https://member.bilibili.com/platform/upload/video/frame';
  let file = '/test/video.mp4';
  let dialogs = 0;
  let attached = false;
  let transfers = 0;
  const isolated = {};
  const guest = { id: 22, hostWebContents: { id: 11 }, session: isolated, isDestroyed: () => false, getURL: () => url,
    debugger: { isAttached: () => attached, attach: () => { attached = true; }, detach: () => { attached = false; }, sendCommand: async method => {
      if (method === 'DOM.getDocument') return { root: { nodeId: 1 } };
      if (method === 'DOM.querySelectorAll') return { nodeIds: [2] };
      if (method === 'DOM.resolveNode') return { object: { objectId: 'upload' } };
      if (method === 'Runtime.callFunctionOn') return { result: { value: { accept: 'video/mp4', visible: true, multiple: false } } };
      if (method === 'DOM.setFileInputFiles') transfers++;
      return {};
    } } };
  registerPersonalAssist({ ipcMain: { handle: (_channel, fn) => { handler = fn; } }, dialog: { showOpenDialog: async () => { dialogs++; return { canceled: false, filePaths: [file] }; } }, webContents: { fromId: id => id === 22 ? guest : undefined }, session: { fromPartition: partition => partition.endsWith('a'.repeat(16)) ? isolated : {} }, getWindow: () => ({ webContents: { id: 11 } }), platforms: { bilibili: { domain: 'bilibili.com' } }, inspectPlatformSession: async () => ({ authenticated }), statFile: () => ({ isFile: () => true }) });
  const input = { platform: 'bilibili', sessionId: 'a'.repeat(16), webContentsId: 22, mediaType: 'video' };
  const invoke = changes => handler({ sender: { id: 11 } }, { ...input, ...changes });
  assert.ok((await handler({ sender: { id: 999 } }, input)).error);
  assert.ok((await invoke({ sessionId: 'b'.repeat(16) })).error);
  assert.ok((await invoke({ webContentsId: 99 })).error);
  url = 'https://example.com/upload'; assert.ok((await invoke()).error);
  url = 'https://member.bilibili.com/platform/upload/video/frame'; authenticated = false; assert.ok((await invoke()).error);
  assert.equal(dialogs, 0); assert.equal(transfers, 0);
  authenticated = true; file = '/test/not-media.exe'; assert.ok((await invoke()).error); assert.equal(transfers, 0);
  file = '/test/video.mp4'; const result = await invoke();
  assert.equal(result.uploadStarted, true); assert.equal(transfers, 1); assert.equal(attached, false); assert.equal(result.published, undefined);
  console.log('7 mocked IPC ownership, session, domain, login, file validation and upload-handoff checks passed; no real upload or publishing performed');
}
testIpc().catch(error => { console.error(error); process.exitCode = 1; });
