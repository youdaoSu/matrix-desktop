const debugPort = process.argv[2] || '9444';
const platforms = [
  ['douyin', 'creator.douyin.com'],
  ['xiaohongshu', 'creator.xiaohongshu.com'],
  ['wechat', 'channels.weixin.qq.com'],
  ['bilibili', 'member.bilibili.com'],
];

async function listTargets() {
  return fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
}

async function connect(target) {
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
  return { socket, call };
}

const mainTarget = (await listTargets()).find((item) => item.type === 'page' && item.url.includes('/app/'));
if (!mainTarget) throw new Error('未找到矩效主窗口');
const main = await connect(mainTarget);
const checks = [];

for (const [platform, hostname] of platforms) {
  await main.call('Runtime.evaluate', {
    expression: `window.__qaPlatformResult = null; window.matrixDesktop.openPlatformLogin(${JSON.stringify(platform)}).then((value) => { window.__qaPlatformResult = value; }).catch((error) => { window.__qaPlatformResult = { rejected: error.message }; })`,
    awaitPromise: false,
  });

  let loginTarget;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    loginTarget = (await listTargets()).find((item) => item.type === 'page' && item.url.includes(hostname));
    if (loginTarget) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!loginTarget) throw new Error(`${platform} 未打开官方登录地址 ${hostname}`);

  checks.push({ platform, hostname, url: loginTarget.url });
  const closeResponse = await fetch(`http://127.0.0.1:${debugPort}/json/close/${loginTarget.id}`);
  if (!closeResponse.ok) throw new Error(`${platform} 登录窗口无法关闭`);
  let cancelResult;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await main.call('Runtime.evaluate', {
      expression: 'window.__qaPlatformResult',
      returnByValue: true,
    });
    cancelResult = response?.result?.value;
    if (cancelResult) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!cancelResult?.cancelled || cancelResult?.rejected) {
    throw new Error(`${platform} 取消登录未正常返回：${JSON.stringify(cancelResult)}`);
  }
}

main.socket.close();
console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
