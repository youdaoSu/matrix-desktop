// Private native-process adapter. This is not an IPC/script bridge exposed to pages.
const { runOfficialDOM } = require('./official-dom.cjs');
const { EventEmitter } = require('node:events');
const DOM_METHODS = new Set(['Page.enable', 'Page.setInterceptFileChooserDialog', 'Page.getFrameTree', 'Page.createIsolatedWorld', 'DOM.getDocument', 'DOM.resolveNode', 'DOM.setFileInputFiles', 'Runtime.callFunctionOn', 'Runtime.evaluate', 'Runtime.releaseObject', 'Input.dispatchMouseEvent']);
function createEdgePageGuest(native, alive) {
  let attached = false;
  const events = new EventEmitter();
  native.transport.on(message => {
    const params = message.parameters;
    if (!alive() || message.event !== 'dom-event' || message.method !== 'Page.fileChooserOpened' || !params || typeof params.frameId !== 'string' || !params.frameId || params.frameId.length > 128 || !Number.isSafeInteger(params.backendNodeId) || params.backendNodeId <= 0 || !['selectSingle','selectMultiple'].includes(params.mode)) return;
    events.emit('message', {}, message.method, { frameId: params.frameId, backendNodeId: params.backendNodeId, mode: params.mode });
  });
  const send = async (method, parameters = {}) => {
    if (!DOM_METHODS.has(method)) throw Error('仅允许官方可见控件操作，不读取凭据或调用平台网络接口');
    if (!alive()) throw Error('内嵌账号页面已经关闭');
    const expectedUrl = native.url;
    const result = await native.transport.request('dom', { method, parameters, expectedUrl });
    const cleanup = method === 'Page.setInterceptFileChooserDialog' && parameters.enabled === false;
    if (!alive() || !cleanup && native.url !== expectedUrl) throw Error('官方页面正在切换，请等待新的编辑器');
    return result;
  };
  return {
    id: 'edge:' + native.guestId, engine: 'webview2', getURL: () => native.url, isDestroyed: () => !alive(),
    debugger: { isAttached: () => attached, attach: () => { attached = true; }, sendCommand: send,
      on(name, listener) { if (name !== 'message') throw Error('仅允许官方文件选择事件'); events.on(name, listener); },
      removeListener(name, listener) { events.removeListener(name, listener); },
    },
    async executeJavaScriptInIsolatedWorld(world, scripts) {
      if (!Array.isArray(scripts) || scripts.length !== 1 || typeof scripts[0].code !== 'string') throw Error('只允许远效生成的单个控件脚本');
      const { frameTree } = await send('Page.getFrameTree');
      const { executionContextId } = await send('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: 'matrix-edge-' + world });
      const result = await send('Runtime.evaluate', { expression: scripts[0].code, contextId: executionContextId, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error('当前官方控件无法读取，请重新打开编辑器');
      return result.result?.value;
    },
  };
}
function openWechatPublishEntry(mediaType, roots = []) {
  const query = selector => [...new Set([document, ...roots].flatMap(root => [...root.querySelectorAll(selector)]))];
  const visible = el => { const rect=el.getBoundingClientRect(),style=getComputedStyle(el); return el.isConnected&&!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&rect.width>0&&rect.height>0&&style.display!=='none'&&style.visibility!=='hidden'; };
  if (/\/platform\/post\/create(?:\/|$)/.test(location.pathname)) return { opened: true };
  // On the official home only: never confuse a final submit with this entry.
  if (!/^\/platform(?:\/home)?\/?$/.test(location.pathname)) throw Error('请先进入视频号官方首页，不会在已有表单中点击发表');
  const labels = mediaType === 'video' ? ['发表视频', '发布视频'] : ['发表图文', '发布图文'];
  const entries = query('button,a,[role=button]').filter(el => visible(el)&&labels.includes((el.innerText||el.getAttribute('aria-label')||'').trim()));
  if (!entries.length) return { waiting: true };
  if (entries.length !== 1) throw Error('视频号发布入口不唯一，请在官方页面核对');
  // Homepage links/buttons are navigational; an editable publish form must not exist.
  if (query('textarea,[contenteditable=true],input[type=file]').some(visible)) throw Error('页面已有编辑内容，未点击发布入口');
  entries[0].click(); return { navigating: true };
}
async function openEdgePublishEntry(guest, mediaType) {
  return runOfficialDOM(guest, openWechatPublishEntry, [mediaType], 'matrix-edge-publish-entry');
}
module.exports = { createEdgePageGuest, openWechatPublishEntry, openEdgePublishEntry };
