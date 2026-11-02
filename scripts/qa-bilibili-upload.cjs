const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { resolveBilibiliUpload } = require('../desktop/bilibili-upload.cjs');
(async () => {
  let checks = 0;
  for (const mode of ['ok', 'foreign', 'wrong-node', 'missing', 'click-error', 'setup-error']) {
    const debuggerEvents = new EventEmitter(), calls = [];
    const guest = { debugger: debuggerEvents };
    const send = async (method, params) => {
      calls.push({ method, params });
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'owned' } } };
      if (method === 'Page.setInterceptFileChooserDialog' && params.enabled && mode === 'setup-error') throw Error('setup timed out');
      if (method === 'DOM.resolveNode') return { object: { objectId: 'actual-choice' } };
      if (method === 'Runtime.callFunctionOn') return { result: { value: mode !== 'wrong-node' } };
      return {};
    };
    const context = { send, resetFileChooser: () => send('Page.setInterceptFileChooserDialog', { enabled: false }), evaluate: async (_fn, _args, _returnByValue, execution) => {
      assert.equal(execution.userGesture, true);
      if (mode === 'click-error') throw Error('button changed');
      if (mode !== 'missing') debuggerEvents.emit('message', {}, 'Page.fileChooserOpened', { frameId: mode === 'foreign' ? 'foreign' : 'owned', backendNodeId: 123 });
      return { opened: true };
    } };
    if (mode === 'ok') assert.deepEqual(await resolveBilibiliUpload(guest, context, { timeoutMs: 8 }), { backendNodeId: 123 });
    else await assert.rejects(resolveBilibiliUpload(guest, context, { timeoutMs: 8 }));
    assert.equal(debuggerEvents.listenerCount('message'), 0);
    assert.deepEqual(calls.at(-1), { method: 'Page.setInterceptFileChooserDialog', params: { enabled: false } });
    assert.equal(calls.some(c => c.method === 'DOM.setFileInputFiles'), false);
    checks += 4;
  }
  console.log(JSON.stringify({ bilibiliChooserDeadlineAndOwnershipChecks: checks, realUploads: 0 }));
})().catch(error => { console.error(error); process.exitCode = 1; });
