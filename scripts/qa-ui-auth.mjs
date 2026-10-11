import fs from 'node:fs';
const debugPort = process.argv[2] || '9333';
const base = process.argv[3] || 'http://127.0.0.1:3210';

const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
const target = targets.find((item) => item.type === 'page' && item.url.startsWith('http://127.0.0.1'));
if (!target) throw new Error('QA browser target not found');

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const errors = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message.result);
    pending.delete(message.id);
  } else if (message.method === 'Runtime.exceptionThrown') {
    errors.push(message.params?.exceptionDetails?.text || 'Runtime exception');
  } else if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
    errors.push(message.params?.args?.map((arg) => arg.value || arg.description).join(' ') || 'Console error');
  }
});

function call(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}

async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result?.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result?.result?.value;
}

async function waitFor(expression, message) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}

async function navigate(hash) {
  await call('Page.navigate', { url: `${base}/app/#${hash}` });
  await waitFor("document.readyState === 'complete' && !!document.querySelector('form')", `页面未加载：${hash}`);
}

async function submit(username, password) {
  await evaluate(`(() => {
    const inputs = document.querySelectorAll('input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(inputs[0], ${JSON.stringify(username)});
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(inputs[1], ${JSON.stringify(password)});
    inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('form').requestSubmit();
    return true;
  })()`);
}

await call('Runtime.enable');
await call('Page.enable');
await navigate('/login');
await evaluate("localStorage.clear(); true");
if (!(await evaluate("Math.abs(document.querySelector('.matrix-auth-compact main').getBoundingClientRect().width-400)<1"))) throw new Error('Login form geometry does not match the compact 400px layout');
fs.mkdirSync('logs', { recursive: true });
const loginCapture = await call('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('logs/qa-auth-login.png', Buffer.from(loginCapture.data, 'base64'));

await submit('demo', 'wrong-password');
await waitFor("!!document.querySelector('[role=alert]') && !document.querySelector('button[type=submit]').disabled", '错误密码未显示提示或请求未结束');

await submit('demo', 'user123456');
await waitFor("location.hash === '#/dashboard' && localStorage.getItem('matrix_token')", '普通用户界面登录失败');
const userPage = await evaluate("document.body.innerText.includes('工作台') || document.body.innerText.includes('账号')");
if (!userPage) throw new Error('普通用户登录后未显示工作区');

await navigate('/admin/login');
await submit('admin', 'admin123456');
await waitFor("location.hash === '#/admin/dashboard' && localStorage.getItem('matrix_admin_token')", '管理员界面登录失败');
const adminPage = await evaluate("document.body.innerText.includes('管理')");
if (!adminPage) throw new Error('管理员登录后未显示后台');

socket.close();
if (errors.length) throw new Error(`浏览器运行错误：${JSON.stringify(errors)}`);
console.log(JSON.stringify({ passed: 5, checks: ['登录页400px布局', '错误密码提示', '普通用户登录', '普通用户工作区', '管理员登录'] }, null, 2));
