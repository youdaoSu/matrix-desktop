const path = require('node:path');
const fs = require('node:fs');

// Use the site's visible upload control; never call undocumented platform APIs.
function selectUploadInput(inputs, mediaType, count) {
  const candidates = inputs.filter(item => {
    const accept = (item.accept || '').toLowerCase();
    return item.visible && (count === 1 || item.multiple) &&
      (mediaType === 'video' ? /video|mp4|mov|webm|mkv/.test(accept) : /image|png|jpg|jpeg|webp/.test(accept));
  });
  if (candidates.length !== 1) throw new Error('无法唯一识别官方素材上传入口，请直接使用官方页面的上传按钮');
  return candidates[0].nodeId;
}

function registerPersonalAssist({ ipcMain, dialog, webContents, session, getWindow, platforms, inspectPlatformSession, statFile = fs.statSync }) {
  const busy = new Set();
  ipcMain.handle('matrix:upload-media', async (event, input) => {
    let contents;
    let attached = false;
    let acquired = false;
    try {
      const window = getWindow();
      if (!window || event.sender.id !== window.webContents.id) throw new Error('仅允许矩效主窗口操作');
      const config = platforms[input?.platform];
      if (!config || !['video', 'image'].includes(input.mediaType)) throw new Error('不支持的平台或素材类型');
      contents = webContents.fromId(input.webContentsId);
      const partition = `persist:matrix-${input.platform}-${input.sessionId}`;
      if (!/^[a-z0-9-]{16,80}$/i.test(input.sessionId || '') || !contents || contents.isDestroyed() ||
          contents.hostWebContents?.id !== window.webContents.id || contents.session !== session.fromPartition(partition)) throw new Error('账号会话不一致');
      if (busy.has(contents.id)) throw new Error('正在处理上传，请勿重复操作');
      busy.add(contents.id);
      acquired = true;
      const validatePage = async () => {
        const url = new URL(contents.getURL());
        if (url.protocol !== 'https:' || !(url.hostname === config.domain || url.hostname.endsWith(`.${config.domain}`)) ||
            !/upload|publish|post\/create/.test(url.pathname)) throw new Error('请先进入该账号的官方内容发布页面');
        if (!(await inspectPlatformSession(input.platform, contents.session, contents)).authenticated) throw new Error('请先完成当前账号的官方登录');
      };
      await validatePage();
      const extensions = input.mediaType === 'video' ? ['mp4', 'mov', 'webm', 'mkv'] : ['jpg', 'jpeg', 'png', 'webp'];
      const selected = await dialog.showOpenDialog(window, { title: '选择上传到当前账号的素材', filters: [{ name: input.mediaType === 'video' ? '视频' : '图片', extensions }], properties: input.mediaType === 'image' ? ['openFile', 'multiSelections'] : ['openFile'] });
      if (selected.canceled || !selected.filePaths.length) return { cancelled: true };
      if (selected.filePaths.length > 9) throw new Error('一次最多选择 9 张图片');
      for (const file of selected.filePaths) {
        if (!extensions.includes(path.extname(file).slice(1).toLowerCase()) || !statFile(file).isFile()) throw new Error('素材格式不支持');
      }
      await validatePage();
      if (contents.debugger.isAttached()) throw new Error('当前页面正在被调试，请改用官方上传按钮');
      contents.debugger.attach('1.3'); attached = true;
      const command = (method, params = {}) => contents.debugger.sendCommand(method, params);
      const { root } = await command('DOM.getDocument');
      const { nodeIds } = await command('DOM.querySelectorAll', { nodeId: root.nodeId, selector: 'input[type="file"]' });
      const inputs = [];
      for (const nodeId of nodeIds) {
        const { object } = await command('DOM.resolveNode', { nodeId });
        try {
          const { result } = await command('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: 'function(){return {accept:this.accept,multiple:this.multiple,visible:!this.disabled};}', returnByValue: true });
          inputs.push({ nodeId, ...result.value });
        } finally { await command('Runtime.releaseObject', { objectId: object.objectId }); }
      }
      const nodeId = selectUploadInput(inputs, input.mediaType, selected.filePaths.length);
      await command('DOM.setFileInputFiles', { nodeId, files: selected.filePaths });
      return { uploadStarted: true, count: selected.filePaths.length, filenames: selected.filePaths.map(file => path.basename(file)) };
    } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
    finally {
      if (attached && contents && !contents.isDestroyed()) { try { contents.debugger.detach(); } catch { /* Guest may be closing. */ } }
      if (contents && acquired) busy.delete(contents.id);
    }
  });
}
module.exports = { registerPersonalAssist, selectUploadInput };
