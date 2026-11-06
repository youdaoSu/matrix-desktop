// Electron permits only one webRequest listener per session/event. Route every
// collector guard through this registry so profile and creator windows cannot
// overwrite each other's policy. Ordinary foreground tabs remain untouched.
const sessions = new WeakMap();
function sessionState(source) {
  if (!source?.webRequest) throw Error('官方会话请求策略参数无效');
  let state = sessions.get(source);
  if (!state) {
    state = { pages: new Map(), observers: new Set() };
    source.webRequest.onBeforeRequest((details, callback) => {
      const policy = state.pages.get(details.webContentsId);
      let cancel = false;
      if (policy) { try { cancel = policy.blocks(details) !== false; } catch { cancel = true; } }
      try { policy?.observe?.(details, 'start', cancel); } catch {}
      callback({ cancel });
    });
    source.webRequest.onCompleted?.(details => {
      for (const observer of state.observers) { try { observer(details); } catch {} }
      try { state.pages.get(details.webContentsId)?.observe?.(details, 'end'); } catch {}
      try { state.pages.get(details.webContentsId)?.completed?.(details); } catch {}
    });
    source.webRequest.onErrorOccurred?.(details => {
      try { state.pages.get(details.webContentsId)?.observe?.(details, 'failed'); } catch {}
      try { state.pages.get(details.webContentsId)?.failed?.(details); } catch {}
    });
    sessions.set(source, state);
  }
  return state;
}
function releaseState(source, state) {
  if (sessions.get(source) !== state) return;
  if (state.pages.size || state.observers.size) return;
  source.webRequest.onBeforeRequest(null);
  source.webRequest.onCompleted?.(null);
  source.webRequest.onErrorOccurred?.(null);
  sessions.delete(source);
}
function registerScopedRequestObserver(source, observer) {
  if (typeof observer !== 'function') throw Error('官方会话响应观察器无效');
  const state = sessionState(source);
  state.observers.add(observer);
  return () => { state.observers.delete(observer); releaseState(source, state); };
}
function registerScopedRequestPolicy(source, webContentsId, { blocks, completed, failed, observe }) {
  if (!Number.isInteger(webContentsId) || webContentsId <= 0 || typeof blocks !== 'function') throw Error('采集页只读策略参数无效');
  const state = sessionState(source);
  if (state.pages.has(webContentsId)) throw Error('采集页只读策略已注册，未覆盖现有规则');
  const policy = { blocks, completed, failed, observe };
  state.pages.set(webContentsId, policy);
  return () => {
    if (state.pages.get(webContentsId) !== policy) return;
    state.pages.delete(webContentsId);
    releaseState(source, state);
  };
}
module.exports = { registerScopedRequestPolicy, registerScopedRequestObserver };
