const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { resolveWechatUpload } = require('../desktop/wechat-upload.cjs');
const { createEdgePageGuest } = require('../desktop/edge-publish.cjs');
(async () => {
  for (const mode of ['ok','foreign','multiple','multi-mode','multi-mismatch','bad-mode','wrong-node','missing-node','missing','click-error','setup-error','before-click']) {
    const events = new EventEmitter(), calls = [], guest = { debugger: events };
    const send = async (method, params) => {
      calls.push({ method, params });
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'owned' } } };
      if (method === 'Page.setInterceptFileChooserDialog' && params.enabled) {
        if (mode === 'setup-error') throw Error('setup timed out');
        if (mode === 'before-click') events.emit('message', {}, 'Page.fileChooserOpened', { frameId: 'owned', backendNodeId: 999, mode: 'selectSingle' });
      }
      if (method === 'DOM.resolveNode') return { object: mode === 'missing-node' ? {} : { objectId: 'actual-choice' } };
      if (method === 'Runtime.callFunctionOn') {
        assert.deepEqual(params.arguments,[{value:['multi-mode','multi-mismatch'].includes(mode)}]);
        assert.ok(params.functionDeclaration.includes('this.multiple===expectMultiple'));
        assert.ok(params.functionDeclaration.includes('!this.webkitdirectory'));
        return { result: { value: !['wrong-node','multi-mismatch'].includes(mode) } };
      }
      return {};
    };
    const context = { send, resetFileChooser: () => send('Page.setInterceptFileChooserDialog', { enabled: false }), evaluate: async (_fn, _args, _returnByValue, execution) => {
      if (_args[0]?.probe === true) { assert.equal(execution,undefined);return {ready:true,opened:false}; }
      assert.equal(execution.userGesture, true);
      if (mode === 'click-error') throw Error('button changed');
      if (mode !== 'missing') events.emit('message', {}, 'Page.fileChooserOpened', { frameId: mode === 'foreign' ? 'foreign' : 'owned', backendNodeId: 123, mode: mode === 'bad-mode' ? 'directory' : ['multi-mode','multi-mismatch'].includes(mode) ? 'selectMultiple' : 'selectSingle' });
      if (mode === 'multiple') events.emit('message', {}, 'Page.fileChooserOpened', { frameId: 'owned', backendNodeId: 124, mode: 'selectSingle' });
      return { opened: true };
    } };
    if (['ok','before-click','multi-mode'].includes(mode)) assert.deepEqual(await resolveWechatUpload(guest, context, { timeoutMs: 8 }), { backendNodeId: 123 });
    else await assert.rejects(resolveWechatUpload(guest, context, { timeoutMs: 8 }));
    assert.equal(events.listenerCount('message'), 0);
    assert.deepEqual(calls.at(-1), { method: 'Page.setInterceptFileChooserDialog', params: { enabled: false } });
    assert.equal(calls.some(call => call.method === 'DOM.setFileInputFiles'), false);
  }
  for (const reason of ['视频号官方上传页面布局尚未就绪（视口 2x2）','视频号官方上传入口尚未就绪','视频号官方上传按钮不唯一','视频号官方上传按钮被遮挡']) {
    const events=new EventEmitter(),calls=[];
    await assert.rejects(resolveWechatUpload({debugger:events},{send:async method=>{calls.push(method);},evaluate:async()=>{throw Error(reason);}}),error=>error.message===reason);
    assert.equal(calls.length,0);assert.equal(events.listenerCount('message'),0);
  }
  // The native event bridge accepts only the bounded chooser metadata; it
  // never opens a renderer IPC route for arbitrary protocol events or scripts.
  let notify, alive = true, mutateUrl = false;
  const native = { guestId: 'qa-guest', url: 'https://channels.weixin.qq.com/platform/post/create', transport: {
    on: callback => { notify = callback; }, request: async (_command, input) => { if (mutateUrl) native.url += '/changed'; return {}; },
  } };
  const adapter = createEdgePageGuest(native, () => alive), forwarded = [];
  adapter.debugger.on('message', (...args) => forwarded.push(args));
  notify({ event: 'dom-event', method: 'Network.requestWillBeSent', parameters: { cookie: 'never-forward-cookie' } });
  notify({ event: 'dom-event', method: 'Page.fileChooserOpened', parameters: { frameId: 'qa-frame', backendNodeId: -1, mode: 'selectSingle' } });
  assert.equal(forwarded.length, 0);
  notify({ event: 'dom-event', method: 'Page.fileChooserOpened', parameters: { frameId: 'qa-frame', backendNodeId: 42, mode: 'selectSingle', files: ['never-forward-path'], cookie: 'never-forward-cookie' } });
  assert.deepEqual(forwarded[0][2], { frameId: 'qa-frame', backendNodeId: 42, mode: 'selectSingle' });
  assert.ok(!JSON.stringify(forwarded).includes('never-forward'));
  assert.throws(() => adapter.debugger.on('Network', () => {}));
  await assert.rejects(adapter.debugger.sendCommand('Network.getAllCookies'));
  mutateUrl = true;
  await assert.rejects(adapter.debugger.sendCommand('Page.setInterceptFileChooserDialog', { enabled: true }));
  await adapter.debugger.sendCommand('Page.setInterceptFileChooserDialog', { enabled: false });
  alive = false;
  notify({ event: 'dom-event', method: 'Page.fileChooserOpened', parameters: { frameId: 'qa-frame', backendNodeId: 43, mode: 'selectSingle' } });
  assert.equal(forwarded.length, 1);
  console.log(JSON.stringify({ wechatChooserUnitChecks: 'passed', foreignDuplicateAndStaleEventsBlocked: true, cancellationCleanupBounded: true, noPathsOrCredentialsForwarded: true, realPlatformActions: false }));
})().catch(error => { console.error(error); process.exitCode = 1; });
