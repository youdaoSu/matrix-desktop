// Public rendered controls, including platform-owned closed web components.
// Never traverses iframe documents or Chromium's user-agent shadow trees.
function collectComponentRoots(node, result = []) {
  for (const root of node.shadowRoots || []) {
    if (!['open','closed'].includes(root.shadowRootType)) continue;
    // Author shadow roots are also valid on built-in hosts such as DIV/SPAN.
    // The tag name is not a boundary: retain only author roots, still never
    // traverse iframe documents or Chromium's private user-agent trees.
    result.push(root.backendNodeId);
    collectComponentRoots(root, result);
  }
  for (const child of node.children || []) collectComponentRoots(child, result);
  return result;
}

const ownedDebuggers = new WeakMap();
async function withOfficialDOM(guest, worldName, callback, options = {}) {
  let lease = ownedDebuggers.get(guest);
  if (lease?.busy || lease?.pending?.size) throw Error('当前官方页面正在处理另一项操作，请稍后继续');
  if (!guest.debugger.isAttached()) {
    guest.debugger.attach('1.3');
    lease = { busy: false, pending: new Set() }; ownedDebuggers.set(guest, lease);
  } else if (!lease) throw Error('当前官方页面调试连接被占用，请稍后继续');
  lease.busy = true;
  const objectIds = [];
  let expired = false;
  let focusEmulated = false;
  const deadline = Date.now() + (options.operationTimeoutMs || 45000);
  const command = async (method, params = {}, recovery = false) => {
    const remaining = recovery ? 2000 : deadline - Date.now();
    if (!recovery && (expired || remaining <= 0)) { expired = true; throw Error('官方页面操作超时，已停止本次操作，不会自动提交'); }
    const pending = Promise.resolve().then(() => guest.debugger.sendCommand(method, params));
    lease.pending.add(pending);
    // A timed-out command may still be executing in Chromium. Keep this guest
    // quarantined until it settles; never free its lock and blindly replay it.
    pending.then(() => lease.pending.delete(pending), () => lease.pending.delete(pending));
    let timer;
    try {
      return await Promise.race([pending, new Promise((_, reject) => {
        timer = setTimeout(() => { expired = true; reject(Error(`官方页面操作超时（${method}），已停止；不会重复执行`)); }, Math.min(remaining, options.commandTimeoutMs || 12000));
      })]);
    } finally { clearTimeout(timer); }
  };
  const send = (method, params) => command(method, params);
  // A timed-out chooser setup may have reached Chromium. This one idempotent
  // teardown is allowed after expiry, with its own short deadline; it cannot
  // click, upload, navigate or submit. Its pending command still quarantines
  // this guest until it actually settles.
  const resetFileChooser = () => command('Page.setInterceptFileChooserDialog', { enabled: false }, true);
  const stopNetworkObservation = () => command('Network.disable', {}, true);
  try {
    if (options.backgroundFocus && guest.engine !== 'webview2') {
      focusEmulated = true;
      await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    }
    const { frameTree } = await send('Page.getFrameTree');
    const { executionContextId } = await send('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName });
    const evaluate = async (fn, args = [], returnByValue = true, execution = {}) => {
      // Opening a platform menu can replace unrelated closed custom elements.
      // Resolve their current roots for EACH evaluation, not for this whole
      // multi-step operation. Never replay a click just because its old root died.
      const roots = [];
      try {
        const { root } = await send('DOM.getDocument', { depth: -1, pierce: true });
        const ids = collectComponentRoots(root);
        if (ids.length > 40) throw Error('官方组件结构过于复杂，未执行操作');
        for (const backendNodeId of ids) {
          const { object } = await send('DOM.resolveNode', { backendNodeId, executionContextId });
          if (object?.objectId) roots.push(object.objectId);
        }
        const result = await send('Runtime.callFunctionOn', {
          executionContextId, functionDeclaration: `function(...args){const roots=args.splice(${args.length});return (${fn.toString()})(...args,roots)}`,
          arguments: [...args.map(value => ({ value })), ...roots.map(objectId => ({ objectId }))], returnByValue, awaitPromise: true, userGesture: execution.userGesture === true,
        });
        if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description?.split('\n')[0] || '官方控件操作失败');
        if (result.result?.objectId) objectIds.push(result.result.objectId);
        return returnByValue ? result.result?.value : result.result;
      } finally {
        for (const objectId of roots) { try { await send('Runtime.releaseObject', { objectId }); } catch { /* A menu/navigation may have removed that root. */ } }
      }
    };
    return await callback({ send, evaluate, resetFileChooser, stopNetworkObservation });
  } finally {
    let cleanupError;
    // Offscreen/minimized task guests otherwise ignore trusted input events.
    // Focus emulation never changes login/permission/visibility selections and
    // is scoped to this owned publish operation, not engagement readers.
    if (focusEmulated) {
      try { await command('Emulation.setFocusEmulationEnabled', { enabled: false }, true); }
      catch { cleanupError = Error('官方页面焦点状态未恢复，已停止本次操作；不会自动重复执行'); }
    }
    for (const objectId of objectIds) { try { await send('Runtime.releaseObject', { objectId }); } catch { /* Navigation invalidated old objects. */ } }
    // Detaching destroys CDP-created isolated worlds, including the inspect nonce
    // and the cover workflow. Keep our connection for this guest's lifetime;
    // release only transient DOM handles. Another client is never detached.
    lease.busy = false;
    if (cleanupError) throw cleanupError;
  }
}

async function runOfficialDOM(guest, fn, args, worldName = 'matrix-official-controls', options) {
  // Fixtures without a Chromium debugger use the same self-contained function.
  if (!guest.debugger) return guest.executeJavaScriptInIsolatedWorld(1001, [{ code: `(${fn.toString()})(${args.map(arg => JSON.stringify(arg)).join(',')})` }]);
  return withOfficialDOM(guest, worldName, context => context.evaluate(fn, args), options);
}
module.exports = { collectComponentRoots, withOfficialDOM, runOfficialDOM };
