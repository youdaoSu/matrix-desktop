const debugPort = process.argv[2] || '9899';
const base = process.argv[3] || 'http://127.0.0.1:3210';

const page = await fetch(`${base}/app/`);
const csrf = /suda-csrf-token=([^;]+)/.exec(page.headers.get('set-cookie') || '')?.[1];
const loginResponse = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie: `suda-csrf-token=${csrf}`, 'x-suda-csrf-token': csrf },
  body: JSON.stringify({ username: 'demo', password: 'user123456' }),
});
const login = (await loginResponse.json()).data;
if (!login?.token) throw new Error('QA user login failed');

async function targets() {
  return fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
}
const target = (await targets()).find((item) => item.type === 'page' && item.url.includes('/app/'));
if (!target) throw new Error('Matrix window not found');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 1;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message.result);
    pending.delete(message.id);
  }
});
function call(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}
async function evaluate(expression) {
  const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response?.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response?.result?.value;
}
async function waitFor(expression, message, attempts = 120) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}

await call('Runtime.enable');
await evaluate(`localStorage.setItem('matrix_token', ${JSON.stringify(login.token)}); localStorage.setItem('matrix_user', ${JSON.stringify(JSON.stringify(login.user))}); location.href = location.origin + '/app/#/accounts'; true`);
await waitFor("location.hash==='#/accounts' && document.querySelector('.matrix-official-deck')?.hidden===false", '统一账号列表未加载');
const platforms = [
  { key: 'douyin', label: '抖音', host: 'creator.douyin.com' },
  { key: 'xiaohongshu', label: '小红书', host: 'creator.xiaohongshu.com' },
  { key: 'wechat', label: '视频号', host: 'channels.weixin.qq.com' },
  { key: 'bilibili', label: 'B站', host: 'member.bilibili.com' },
];
const results = [];
for (const platform of platforms) {
  await evaluate(`(() => { const button = [...document.querySelectorAll('.matrix-add-platforms button')].find(item => item.getClientRects().length && item.innerText.includes(${JSON.stringify(platform.label)})); if (!button) throw new Error('可见平台入口不存在'); button.click(); return true; })()`);
  await waitFor("!!document.querySelector('webview')", `${platform.label}内嵌官方授权 webview 未创建`);
  await waitFor("document.querySelector('.matrix-official-deck')?.hidden === false && document.body.innerText.includes('我已登录，完成绑定')", `${platform.label}内嵌工作区未显示`);
  const loginReady = platform.key === 'xiaohongshu'
    ? "document.body.innerText.includes('短信登录') && document.querySelectorAll('input').length >= 2"
    : "document.querySelectorAll('[class*=qr i],[id*=qr i],img[alt*=二维码],img[alt*=扫码]').length > 0";
  await waitFor(`(async()=>{try{return await document.querySelector('webview').executeJavaScript(${JSON.stringify(loginReady)});}catch{return false;}})()`, `${platform.label}官方登录入口未加载`, 450);

  let guest;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const domain = platform.key === 'wechat' ? 'weixin.qq.com' : platform.host.split('.').slice(-2).join('.');
    guest = (await targets()).find((item) => item.type === 'webview' && item.url.includes(domain));
    if (guest) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!guest) throw new Error(`${platform.label}官方站点未在内嵌 webview 中加载`);
  const state = await evaluate(`(() => {
    const view = document.querySelector('webview');
    return {
      src: view.getAttribute('src'),
      partition: view.getAttribute('partition'),
      toolbar: document.body.innerText.includes('我已登录，完成绑定'),
    };
  })()`);
  const topLevelPlatformWindow = (await targets()).some((item) => item.type === 'page' && item.url.includes(platform.host));
  if (topLevelPlatformWindow) throw new Error(`${platform.label}错误地打开成了独立窗口`);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const guardResult = await evaluate(`(async () => {
    const view = document.querySelector('webview');
    const partition = view.getAttribute('partition');
    const sessionId = partition.replace(/^persist:matrix-[^-]+-/, '');
    return window.matrixDesktop.completePlatformLogin({
      platform: ${JSON.stringify(platform.key)},
      sessionId,
      webContentsId: view.getWebContentsId(),
    });
  })()`);
  if (!guardResult?.error?.includes('尚未检测到')) throw new Error(`${platform.label}未登录时没有阻止绑定：${JSON.stringify({ guardResult, state, guestUrl: guest.url })}`);
  results.push({ platform: platform.label, embedded: true, guestUrl: guest.url, ...state });
  await evaluate("document.querySelector('.matrix-account-tab.is-active .matrix-tab-close')?.click(); true");
  await waitFor("!document.querySelector('webview')", `${platform.label}内嵌窗口未正确关闭`);
  await evaluate("document.querySelector('.matrix-workspace-tabs > button')?.click(); true");
}
console.log(JSON.stringify({ passed: platforms.length * 7, results }, null, 2));
socket.close();
