// Use the observed official button and the file input it actually opens. A
// hidden video/library input is not proof that its change handler uploads media.
function openWechatUpload(input, componentRoots = []) {
  if (location.hostname !== 'channels.weixin.qq.com' || !/^\/platform\/post\/create\/?$/.test(location.pathname)) throw Error('请先打开视频号官方视频编辑器，未交付素材');
  // A hidden/resizing native host is not an overlay. Wait within the caller's
  // existing pre-handoff deadline, without arming or clicking a file chooser.
  if (innerWidth < 320 || innerHeight < 240) throw Error(`视频号官方上传页面布局尚未就绪（视口 ${innerWidth}x${innerHeight}），未交付素材`);
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
    if (!el?.isConnected || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false;
    for (let p = el; p; p = p.parentElement || p.getRootNode().host) {
      const s = getComputedStyle(p); if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    }
    return true;
  };
  const existingMedia = query('input[type=file]').some(el => el.files?.length > 0) || query('video').some(el => el.currentSrc || el.src) || query('.vertical-cover-wrap.img-popover-wrap').filter(visible).some(el => [...el.querySelectorAll('img')].some(img => visible(img) && img.complete && img.naturalWidth > 0));
  if (existingMedia) throw Error('当前视频号编辑器已有素材，未重复交付或覆盖');
  const candidates = query('.ant-upload.ant-upload-btn');
  const rendered = candidates.filter(visible);
  const entries = rendered.filter(el => /^上传时长/.test((el.innerText || '').trim()));
  // Navigation and a hidden file input can exist before the rendered upload
  // entry. Only this zero-match, pre-click state is safe for the caller's
  // bounded readiness retry. Ambiguity and real masks must remain hard stops.
  if (entries.length === 0) throw Error(`视频号官方上传入口尚未就绪（候选 ${candidates.length}，可见 ${rendered.length}，标签匹配 0），未交付素材`);
  if (entries.length !== 1) throw Error(`视频号官方上传按钮不唯一（${entries.length} 个），未交付素材`);
  const entry = entries[0]; entry.scrollIntoView({ block: 'center', behavior: 'instant' });
  const r = entry.getBoundingClientRect(), hit = hitAt(r.x + r.width / 2, r.y + r.height / 2);
  if (!containsHit(entry, hit)) {
    // Capture the exact pre-click geometry, not a later screenshot after a
    // menu/animation has disappeared. Only bounded public control metadata:
    // no text, values, URLs, input files, cookies or page globals.
    const shape = node => node ? `${node.tagName || 'node'}.${typeof node.className === 'string' ? node.className.replace(/[^a-zA-Z0-9_ -]/g, '').slice(0, 70) : ''}` : 'none';
    const pos = [r.x,r.y,r.width,r.height].map(value => Math.round(value)).join(',');
    throw Error(`视频号官方上传按钮被遮挡，未交付素材（控件 ${pos}；视口 ${innerWidth}x${innerHeight}；命中 ${shape(hit)}）`);
  }
  if (input?.probe === true) return { ready: true, opened: false };
  entry.click(); return { opened: true };
}

async function resolveWechatUpload(guest, context, { timeoutMs = 3000 } = {}) {
  if (!guest.debugger?.on || !guest.debugger?.removeListener) throw Error('视频号官方上传事件连接未准备好，未交付素材');
  const { send, evaluate } = context;
  // Do not intercept or arm a chooser while the editor is still rendering.
  // Probe and click both re-resolve the current document; no stale node reuse.
  await evaluate(openWechatUpload, [{ probe: true }]);
  const { frameTree } = await send('Page.getFrameTree'), frameId = frameTree?.frame?.id;
  if (typeof frameId !== 'string' || !frameId) throw Error('视频号官方编辑器文档未确认，未交付素材');
  let timer, complete, intercepted = false, active = false, eventError, count = 0;
  const event = new Promise(resolve => { complete = resolve; timer = setTimeout(() => resolve({ error: Error('未捕获视频号官方上传按钮的文件选择事件，未交付素材') }), timeoutMs); });
  const onMessage = (_event, method, params) => {
    if (!active || method !== 'Page.fileChooserOpened') return;
    let reason;
    if (++count !== 1) reason = `产生多个文件选择事件（${count} 次）`;
    else if (params?.frameId !== frameId) reason = '文件选择不属于当前主文档';
    else if (!Number.isSafeInteger(params.backendNodeId) || params.backendNodeId <= 0) reason = '文件选择控件标识无效';
    else if (!['selectSingle','selectMultiple'].includes(params.mode)) reason = '文件选择模式不受支持';
    if (reason) { eventError = Error(`视频号${reason}，未交付素材`); complete({ error: eventError }); }
    else complete({ params });
  };
  guest.debugger.on('message', onMessage);
  try {
    await send('Page.enable');
    intercepted = true;
    await send('Page.setInterceptFileChooserDialog', { enabled: true });
    active = true;
    await evaluate(openWechatUpload, [{}], true, { userGesture: true });
    const result = await event; if (result.error || eventError) throw result.error || eventError;
    const { backendNodeId } = result.params;
    const { object } = await send('DOM.resolveNode', { backendNodeId });
    if (!object?.objectId) throw Error('视频号官方文件选择控件已失效，未交付素材');
    try {
      // A task still supplies exactly one selected video. A multi-capable
      // official input is valid only when its real DOM attribute agrees with
      // the chooser event; a directory/foreign/stale input remains forbidden.
      const checked = await send('Runtime.callFunctionOn', { objectId: object.objectId, returnByValue: true,
        arguments: [{ value: result.params.mode === 'selectMultiple' }],
        functionDeclaration: 'function(expectMultiple){return this.isConnected&&!this.disabled&&this.tagName==="INPUT"&&this.type==="file"&&this.files.length===0&&!this.webkitdirectory&&this.multiple===expectMultiple&&/video|mp4|mov|webm|mkv/i.test(this.accept||"")}' });
      if (checked.exceptionDetails || checked.result?.value !== true || eventError) throw eventError || Error('视频号官方文件选择控件不匹配，未交付素材');
    } finally { try { await send('Runtime.releaseObject', { objectId: object.objectId }); } catch {} }
    return { backendNodeId };
  } finally {
    active = false; clearTimeout(timer); guest.debugger.removeListener('message', onMessage);
    if (intercepted) await (context.resetFileChooser ? context.resetFileChooser() : send('Page.setInterceptFileChooserDialog', { enabled: false }));
  }
}
module.exports = { openWechatUpload, resolveWechatUpload };
