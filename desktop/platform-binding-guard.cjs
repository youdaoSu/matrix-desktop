// Only an explicitly registered binding document is paused. Account editors,
// saved drafts and health-check windows never enter this registry.
const STOP_EVENT = 'matrix-stop-binding-rate-observer';
function observeLoginRateNotice(stopEvent, duration = 10 * 60000) {
  return new Promise(resolve => {
    const frequency = /^(?:(?:提示|温馨提示|安全提示)[：:]?\s*)?(?:(?:您的?|当前)?(?:访问|操作|请求|登录|获取验证码)(?:次数)?(?:过于|太|过)?频繁|请求过多|Too many requests|Rate limit(?: exceeded)?)(?:[，。！!：:\s]|$)/i;
    const excluded = 'article,script,style,textarea,input,[contenteditable=true],[class*=comment],[class*=message-item],[class*=conversation],[class*=video-card],[class*=note-item],[data-comment-id],[data-conversation-id]';
    let observer, timer, finished = false;
    const finish = limited => {
      if (finished) return;
      finished = true; observer?.disconnect(); clearTimeout(timer);
      window.removeEventListener(stopEvent, stop); window.removeEventListener('pagehide', stop);
      resolve(limited === true);
    };
    const stop = () => finish(false);
    const scan = () => {
      for (const node of document.querySelectorAll('div,span,p,[role=alert],[role=alertdialog]')) {
        const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length > 200 || !frequency.test(text) || node.closest(excluded) || node.querySelector(excluded) || !node.getClientRects().length) continue;
        let shown = true;
        for (let parent = node; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') { shown = false; break; }
        }
        if (shown) { finish(true); return; }
      }
    };
    window.addEventListener(stopEvent, stop, { once: true });
    window.addEventListener('pagehide', stop, { once: true });
    observer = new MutationObserver(scan);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    timer = setTimeout(stop, duration);
    scan();
  });
}

function createPlatformBindingGuard({ cooldown, platforms, notify = () => {} }) {
  const bindings = new Map();
  const official = (platform, value) => {
    try { const url = new URL(value), domain = platforms[platform]?.domain; return url.protocol === 'https:' && !url.username && !url.password && domain && (url.hostname === domain || url.hostname.endsWith('.' + domain)); } catch { return false; }
  };
  const current = state => bindings.get(state.contents.id) === state && !state.contents.isDestroyed();
  async function pause(state, limit) {
    if (!current(state) || state.paused || !official(state.platform, state.contents.getURL())) return;
    state.paused = true;
    notify({ webContentsId: state.contents.id, ...limit });
    // This unloads the official QR SDK and its polling timers, retaining the
    // partition's cookies and storage. Never refresh automatically after denial.
    try { await state.contents.loadURL('about:blank'); } catch { /* The renderer still receives the protection state. */ }
  }
  function limitPlatform(platform, limit = cooldown.get(platform)) {
    if (!limit) return;
    for (const state of bindings.values()) if (state.platform === platform) void pause(state, limit);
  }
  function arm(state) {
    if (!current(state)) return;
    const limit = cooldown.get(state.platform);
    if (limit) { void pause(state, limit); return; }
    state.paused = false;
    const frames = state.contents.mainFrame?.framesInSubtree || [state.contents.mainFrame];
    for (const frame of frames) {
      if (!frame || frame.detached || !official(state.platform, frame.url) || state.frames.has(frame)) continue;
      state.frames.add(frame);
      const source = `(${observeLoginRateNotice.toString()})(${JSON.stringify(STOP_EVENT)})`;
      let observed;
      try { observed = frame === state.contents.mainFrame && state.contents.executeJavaScriptInIsolatedWorld
        ? state.contents.executeJavaScriptInIsolatedWorld(991, [{ code: source }]) : frame.executeJavaScript(source); }
      catch { state.frames.delete(frame); continue; }
      Promise.resolve(observed).then(limited => {
        state.frames.delete(frame);
        try {
          if (limited === true && current(state) && !state.paused && !frame.detached && official(state.platform, frame.url)) limitPlatform(state.platform, cooldown.limit(state.platform));
        } catch { /* A frame may detach between resolving and processing its result. */ }
      }, () => { state.frames.delete(frame); });
    }
  }
  function end(contents, sessionId) {
    const state = bindings.get(contents.id);
    if (!state || state.sessionId !== sessionId) return;
    bindings.delete(contents.id);
    contents.removeListener('dom-ready', state.arm);
    contents.removeListener('did-frame-finish-load', state.arm);
    contents.removeListener('will-navigate', state.navigate);
    contents.removeListener('will-redirect', state.navigate);
    contents.removeListener('destroyed', state.end);
    if (contents.isDestroyed()) return;
    for (const frame of contents.mainFrame?.framesInSubtree || [contents.mainFrame]) {
      if (!frame || frame.detached || !official(state.platform, frame.url)) continue;
      const code = `window.dispatchEvent(new Event(${JSON.stringify(STOP_EVENT)})); true`;
      try {
        const result = frame === contents.mainFrame && contents.executeJavaScriptInIsolatedWorld
          ? contents.executeJavaScriptInIsolatedWorld(991, [{ code }]) : frame.executeJavaScript(code);
        Promise.resolve(result).catch(() => {});
      } catch { /* An unloading frame has already disconnected its observer. */ }
    }
  }
  function track(platform, sessionId, contents) {
    let state = bindings.get(contents.id);
    if (state && (state.sessionId !== sessionId || state.platform !== platform)) return;
    if (!state) {
      if (!official(platform, contents.getURL())) return;
      state = { contents, platform, sessionId, paused: false, frames: new WeakSet() };
      state.arm = () => arm(state);
      state.navigate = event => { if (cooldown.get(platform)) { event.preventDefault(); limitPlatform(platform); } };
      state.end = () => end(contents, sessionId);
      bindings.set(contents.id, state);
      contents.on('dom-ready', state.arm);
      contents.on('did-frame-finish-load', state.arm);
      contents.on('will-navigate', state.navigate);
      contents.on('will-redirect', state.navigate);
      contents.once('destroyed', state.end);
    }
    arm(state);
  }
  return { track, end, limitPlatform };
}
module.exports = { createPlatformBindingGuard, observeLoginRateNotice };
