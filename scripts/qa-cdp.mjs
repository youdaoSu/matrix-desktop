const port = process.argv[2] || '9333';
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
const target = targets.find((item) => item.type === 'page' && item.url.startsWith('http://127.0.0.1'));
if (!target) throw new Error('QA browser page not found');

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
function call(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => {
    const listener = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      socket.removeEventListener('message', listener);
      resolve(message.result);
    };
    socket.addEventListener('message', listener);
  });
}

async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return result?.result?.value;
}

const runtimeEvents = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (['Runtime.exceptionThrown', 'Runtime.consoleAPICalled', 'Log.entryAdded'].includes(message.method)) {
    runtimeEvents.push({ method: message.method, params: message.params });
  }
});
await call('Runtime.enable');
await call('Log.enable');
await call('Page.enable');
await call('Page.reload', { ignoreCache: true });
await new Promise((resolve) => setTimeout(resolve, 3000));

const report = {
  url: await evaluate('location.href'),
  title: await evaluate('document.title'),
  rootHtml: await evaluate("document.getElementById('root')?.innerHTML || ''"),
  bodyText: await evaluate('document.body.innerText'),
  errors: await evaluate("(window.__slardarErrBuf || []).map(e => ({message:e?.message || String(e), stack:e?.stack || ''}))"),
  resources: await evaluate("performance.getEntriesByType('resource').filter(r => r.name.includes('/assets/')).map(r => r.name)"),
  runtimeEvents,
};
console.log(JSON.stringify(report, null, 2));
socket.close();
