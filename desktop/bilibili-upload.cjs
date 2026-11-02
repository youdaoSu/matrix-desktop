// Bilibili has several video inputs, including a library fallback that accepts
// files without starting an upload. Resolve the input opened by the official
// upload button instead of guessing from input visibility or DOM order.
function openBilibiliUpload(_input, componentRoots = []) {
  const query = selector => [...new Set([document, ...componentRoots].flatMap(root => [...root.querySelectorAll(selector)]))];
  const hitAt = (x, y) => {
    let hit = document.elementFromPoint(x, y);
    for (let depth = 0; hit && depth < 8; depth++) {
      const root = componentRoots.find(root => root.host === hit) || hit.shadowRoot;
      if (!root) return hit;
      const deeper = root.elementFromPoint?.(x, y);
      if (!deeper || deeper === hit) return null;
      hit = deeper;
    }
    return null;
  };
  const containsHit = (entry, hit) => {
    for (let depth = 0; hit && depth < 8; depth++, hit = hit.getRootNode?.().host) if (entry === hit || entry.contains(hit)) return true;
    return false;
  };
  const visible = el => {
    if (!el?.isConnected) return false;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false;
    for (let p = el; p; p = p.parentElement || p.getRootNode().host) {
      const s = getComputedStyle(p); if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    }
    return true;
  };
  const entries = query('.bcc-upload-wrapper').filter(el => visible(el) && [...el.querySelectorAll('.upload-btn')].some(button => visible(button) && button.textContent.trim() === '上传视频'));
  if (entries.length !== 1) throw Error('B站官方上传按钮不存在或不唯一，未交付素材');
  const entry = entries[0]; entry.scrollIntoView({ block: 'center', behavior: 'instant' });
  const r = entry.getBoundingClientRect(), hit = hitAt(r.x + r.width / 2, r.y + r.height / 2);
  if (!containsHit(entry, hit)) throw Error('B站官方上传按钮被遮挡，未交付素材');
  entry.click();
  return { opened: true };
}

async function resolveBilibiliUpload(guest, context, options = {}) {
  const { send, evaluate } = context;
  const { frameTree } = await send('Page.getFrameTree');
  const frameId = frameTree.frame.id;
  let timer, chooser, failure, intercept = false;
  // Resolve errors as data until awaited so an early click failure cannot leave
  // a rejected timer promise or an interception listener behind.
  const event = new Promise(resolve => {
    chooser = params => resolve({ params }); failure = error => resolve({ error });
    timer = setTimeout(() => failure(Error('未捕获B站官方上传按钮的文件选择事件，未交付素材')), options.timeoutMs || 3000);
  });
  const onMessage = (_event, method, params) => {
    if (method === 'Page.fileChooserOpened') {
      if (params.frameId !== frameId || !Number.isInteger(params.backendNodeId)) failure(Error('B站文件选择来源已变化，未交付素材'));
      else chooser(params);
    }
  };
  guest.debugger.on('message', onMessage);
  try {
    await send('Page.enable');
    intercept = true;
    await send('Page.setInterceptFileChooserDialog', { enabled: true });
    await evaluate(openBilibiliUpload, [{}], true, { userGesture: true });
    const result = await event; if (result.error) throw result.error;
    const { backendNodeId } = result.params;
    const { object } = await send('DOM.resolveNode', { backendNodeId });
    if (!object?.objectId) throw Error('B站官方文件选择控件已失效，未交付素材');
    try {
      const checked = await send('Runtime.callFunctionOn', {
        objectId: object.objectId, returnByValue: true,
        functionDeclaration: 'function(){return this.isConnected&&!this.disabled&&this.tagName==="INPUT"&&this.type==="file"&&/video|mp4|mov|webm|mkv/i.test(this.accept||"")}',
      });
      if (checked.exceptionDetails || checked.result?.value !== true) throw Error('B站官方文件选择控件不匹配，未交付素材');
    } finally { try { await send('Runtime.releaseObject', { objectId: object.objectId }); } catch {} }
    return { backendNodeId };
  } finally {
    clearTimeout(timer); guest.debugger.removeListener('message', onMessage);
    if (intercept) await (context.resetFileChooser ? context.resetFileChooser() : send('Page.setInterceptFileChooserDialog', { enabled: false }));
  }
}
module.exports = { openBilibiliUpload, resolveBilibiliUpload };
