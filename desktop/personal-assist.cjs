const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { publishForm } = require('./publish-form.cjs');

// Self-contained so the same check can run in the guest renderer and unit tests.
function isEditableTarget(el) {
  if (!el || el.disabled || el.readOnly) return false;
  const bounds = el.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return false;
  const label = [el.placeholder, el.name, el.id, el.getAttribute('aria-label'), el.autocomplete].join(' ');
  if (/password|one-time-code|username|email|tel|search|密码|验证码|手机号|邮箱|搜索|身份证/i.test(label)) return false;
  return el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text') || el.isContentEditable === true;
}

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
  const selections = new Map();
  let choosing = false;
  const extensionsFor = type => type === 'video' ? ['mp4', 'mov', 'webm', 'mkv'] : ['jpg', 'jpeg', 'png', 'webp'];
  const describeFiles = (files, type) => {
    if (!files.length || files.length > (type === 'video' ? 1 : 9)) throw new Error('请选择一个视频或最多 9 张图片');
    return files.map(file => {
      const stat = statFile(file);
      if (!extensionsFor(type).includes(path.extname(file).slice(1).toLowerCase()) || !stat.isFile()) throw new Error('素材格式不支持');
      return { name: path.basename(file), size: stat.size, modified: stat.mtimeMs };
    });
  };
  ipcMain.handle('matrix:import-media', async (event, input) => {
    try {
      if (event.sender.id !== getWindow()?.webContents.id) throw new Error('仅允许矩效主窗口导入素材');
      if (!['video', 'image'].includes(input?.mediaType) || !Array.isArray(input?.paths) || input.paths.some(file => typeof file !== 'string' || !path.isAbsolute(file))) throw new Error('请拖入本机的视频或图片文件');
      const paths = [...new Set(input.paths)], files = describeFiles(paths, input.mediaType), id = randomUUID();
      selections.set(id, { owner: event.sender.id, mediaType: input.mediaType, paths, files });
      if (selections.size > 32) selections.delete(selections.keys().next().value);
      return { selection: { id, mediaType: input.mediaType, files } };
    } catch (error) { return { error: error.message }; }
  });
  ipcMain.handle('matrix:sync-publish-form', async (event, input) => {
    let guest;
    let acquired = false;
    try {
      if (event.sender.id !== getWindow()?.webContents.id) throw new Error('仅允许矩效主窗口同步');
      const config = platforms[input?.platform];
      guest = webContents.fromId(input?.webContentsId);
      if (!config || !/^[a-z0-9-]{16,80}$/i.test(input.sessionId || '') || !guest || guest.isDestroyed() || guest.hostWebContents?.id !== event.sender.id || guest.session !== session.fromPartition(`persist:matrix-${input.platform}-${input.sessionId}`)) throw new Error('账号会话不一致');
      if (busy.has(guest.id)) throw new Error('当前账号正在处理操作');
      busy.add(guest.id); acquired = true;
      const url = new URL(guest.getURL());
      if (url.protocol !== 'https:' || !(url.hostname === config.domain || url.hostname.endsWith('.' + config.domain)) || !/upload|publish|post\/create|post\/video/.test(url.pathname)) throw new Error('请先在当前账号打开官方发布表单');
      if (!(await inspectPlatformSession(input.platform, guest.session, guest)).authenticated) throw new Error('请先登录当前平台账号');
      if (!['fill', 'topics'].includes(input.command)) throw new Error('同步操作无效');
      if (input.command === 'fill') {
        const form = input.form;
        if (!form || typeof form.title !== 'string' || typeof form.body !== 'string' || form.title.length > 500 || form.body.length > 20000 || !Array.isArray(form.topics) || form.topics.length > 15 || form.topics.some(t => typeof t !== 'string' || !t.trim() || t.length > 40) || !form.options || Object.entries(form.options).some(([key, value]) => !['category', 'visibility', 'originality'].includes(key) || typeof value !== 'string' || value.length > 100)) throw new Error('发布配置格式或长度不正确');
      }
      if (guest.getURL() !== url.href) throw new Error('官方页面已切换，请重新同步');
      return await guest.executeJavaScriptInIsolatedWorld(1002, [{ code: `(${publishForm.toString()})(${JSON.stringify(input.command)},${JSON.stringify({ ...input.form, platform: input.platform })})` }]);
    } catch (error) { return { error: error.message }; }
    finally { if (guest && acquired) busy.delete(guest.id); }
  });
  ipcMain.handle('matrix:choose-media', async (event, input) => {
    let acquired = false;
    try {
      const window = getWindow();
      if (!window || event.sender.id !== window.webContents.id) throw new Error('仅允许矩效主窗口选择素材');
      if (!['video', 'image'].includes(input?.mediaType)) throw new Error('请选择视频或图片类型');
      if (choosing) throw new Error('素材选择窗口已经打开');
      choosing = true; acquired = true;
      const selected = await dialog.showOpenDialog(window, { title: '选择供所选账号复用的素材（此时不会上传）', filters: [{ name: input.mediaType === 'video' ? '视频' : '图片', extensions: extensionsFor(input.mediaType) }], properties: input.mediaType === 'image' ? ['openFile', 'multiSelections'] : ['openFile'] });
      if (selected.canceled || !selected.filePaths.length) return { cancelled: true };
      const files = describeFiles(selected.filePaths, input.mediaType), id = randomUUID();
      // Only the opaque handle reaches the renderer. Paths remain in main-process memory.
      selections.set(id, { owner: event.sender.id, mediaType: input.mediaType, paths: selected.filePaths, files });
      if (selections.size > 32) selections.delete(selections.keys().next().value);
      return { selection: { id, mediaType: input.mediaType, files } };
    } catch (error) { return { error: error.message }; }
    finally { if (acquired) choosing = false; }
  });
  ipcMain.handle('matrix:insert-draft', async (event, input) => {
    let contents;
    let acquired = false;
    try {
      const window = getWindow();
      if (!window || event.sender.id !== window.webContents.id) throw new Error('仅允许矩效主窗口操作');
      const config = platforms[input?.platform];
      if (!config || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 20000) throw new Error('文案不能为空或超过 20000 字符');
      contents = webContents.fromId(input.webContentsId);
      if (!/^[a-z0-9-]{16,80}$/i.test(input.sessionId || '') || !contents || contents.isDestroyed() ||
          contents.hostWebContents?.id !== window.webContents.id || contents.session !== session.fromPartition(`persist:matrix-${input.platform}-${input.sessionId}`)) throw new Error('账号会话不一致');
      if (busy.has(contents.id)) throw new Error('当前账号正在处理操作，请稍后再试');
      busy.add(contents.id); acquired = true;
      const pageUrl = contents.getURL();
      const url = new URL(pageUrl);
      if (url.protocol !== 'https:' || !(url.hostname === config.domain || url.hostname.endsWith(`.${config.domain}`)) || /login|passport|signin/i.test(url.pathname + url.hostname)) throw new Error('请先进入已登录账号的官方操作页面');
      if (!(await inspectPlatformSession(input.platform, contents.session, contents)).authenticated) throw new Error('请先完成当前账号的官方登录');
      const editable = await contents.executeJavaScript(`(${isEditableTarget.toString()})(document.activeElement)`);
      if (!editable) throw new Error('请先在官方页面点击要填入的标题、正文或回复输入框；不处理登录框或跨域内嵌框');
      if (contents.getURL() !== pageUrl) throw new Error('页面已切换，请重新选择输入框');
      contents.focus();
      await contents.insertText(input.text);
      return { inserted: true, sent: false };
    } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
    finally { if (contents && acquired) busy.delete(contents.id); }
  });
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
      let selected;
      if (input.selectionId) {
        const saved = selections.get(input.selectionId);
        if (!saved || saved.owner !== event.sender.id || saved.mediaType !== input.mediaType) throw new Error('素材选择已失效，请返回发布编辑页重新选择');
        if (JSON.stringify(describeFiles(saved.paths, saved.mediaType)) !== JSON.stringify(saved.files)) throw new Error('本地素材已修改，请重新选择后上传');
        selected = { filePaths: saved.paths, canceled: false };
      } else selected = await dialog.showOpenDialog(window, { title: '选择上传到当前账号的素材', filters: [{ name: input.mediaType === 'video' ? '视频' : '图片', extensions: extensionsFor(input.mediaType) }], properties: input.mediaType === 'image' ? ['openFile', 'multiSelections'] : ['openFile'] });
      if (selected.canceled || !selected.filePaths.length) return { cancelled: true };
      describeFiles(selected.filePaths, input.mediaType);
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
module.exports = { registerPersonalAssist, selectUploadInput, isEditableTarget };
