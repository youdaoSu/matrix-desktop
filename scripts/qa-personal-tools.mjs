// Only the explicitly isolated workspace regression server may run these UI writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const [debugPort, base] = process.argv.slice(2);
if (base !== 'http://127.0.0.1:3291') throw new Error('Personal tools QA requires the isolated workspace test server');
const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(r => r.json());
const target = targets.find(item => item.type === 'page' && item.url.startsWith(base));
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let next = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const msg = JSON.parse(event.data); const item = pending.get(msg.id);
  if (!item) return;
  clearTimeout(item.timer); pending.delete(msg.id);
  if (msg.error) item.reject(new Error(msg.error.message)); else item.resolve(msg.result);
});
function call(method, params = {}) {
  const id = ++next;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function wait(expression, label) {
  const end = Date.now() + 20000;
  while (Date.now() < end) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 100)); }
  throw new Error(label);
}
async function navigate(route, ready) { await call('Page.navigate', { url: `${base}/app/#${route}` }); await wait(ready, `Route not ready: ${route}`); }
async function fill(selector, value) {
  await evaluate(`(() => {const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('Input missing'); Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
}
async function click(text) { await evaluate(`(() => { const el=[...document.querySelectorAll('button')].find(el => el.getClientRects().length && el.innerText === ${JSON.stringify(text)}); if(!el || el.disabled) throw new Error('Button unavailable'); el.click();})()`); }
async function api(method, path, body, admin = false) {
  return evaluate(`(async()=>{const token=localStorage.getItem(${JSON.stringify(admin ? 'matrix_admin_token' : 'matrix_token')})||sessionStorage.getItem('matrix_token');const csrf=decodeURIComponent(document.cookie.split('; ').find(x=>x.startsWith('suda-csrf-token='))?.slice(16)||'');const r=await fetch(${JSON.stringify(path)},{method:${JSON.stringify(method)},headers:{Authorization:'Bearer '+token,'x-suda-csrf-token':csrf,'content-type':'application/json'},${body === undefined ? '' : `body:${JSON.stringify(JSON.stringify(body))},`}});return {status:r.status,body:await r.json()};})()`);
}
const run = `QA_tools_${Date.now()}`;
let checks = 0;
try {
  await call('Page.enable');
  for (const suffix of ['keywords', 'welcome', 'offline', 'templates']) {
    await navigate(`/automation/${suffix}`, "!!document.querySelector('#reply-tool-name') && ![...document.querySelectorAll('button')].find(el=>el.innerText==='保存配置')?.disabled");
    const title = `${run}_${suffix}`;
    await fill('#reply-tool-name', title); await fill('#reply-tool-content', 'QA reply draft');
    if (suffix === 'keywords') await fill('#reply-tool-keywords', 'QA key');
    await click('保存配置');
    await wait(`document.querySelector('.matrix-page-content').innerText.includes(${JSON.stringify(title)}) && document.querySelector('#reply-tool-name').value === ''`, 'Configuration not saved'); checks++;
    await navigate(`/automation/${suffix}`, `document.querySelector('.matrix-page-content')?.innerText.includes(${JSON.stringify(title)})`); checks++;
    await click('编辑配置'); await fill('#reply-tool-content', 'QA reply changed'); await click('保存配置');
    await wait("document.querySelector('.matrix-page-content').innerText.includes('QA reply changed') && document.querySelector('#reply-tool-name').value === ''", 'Configuration not edited'); checks++;
    if (suffix === 'keywords') await fill('[aria-label="用于测试的消息"]', 'hello QA key');
    await click(suffix === 'templates' ? '使用文案' : '测试并生成建议');
    await wait("document.querySelector('[aria-label=\"回复建议\"]')?.value === 'QA reply changed'", 'Rule suggestion missing'); checks++;
    if (suffix === 'templates') { const capture = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync('logs/qa-reply-tools.png', Buffer.from(capture.data, 'base64')); }
    // Accept deletion only in this disposable database/profile, never in the user's application.
    await evaluate('window.confirm = () => true;'); await click('删除配置');
    await wait(`!document.querySelector('.matrix-page-content').innerText.includes(${JSON.stringify(title)})`, 'Configuration not deleted'); checks++;
  }
  for (const suffix of ['batch-video', 'batch-image']) {
    await navigate(`/publish/${suffix}`, "document.querySelectorAll('.matrix-page-content [role=checkbox]').length === 4 && ![...document.querySelectorAll('button')].find(el=>el.innerText==='批量保存草稿')?.disabled");
    await evaluate("[...document.querySelectorAll('.matrix-page-content [role=checkbox]')].slice(0,2).forEach(el=>el.click());");
    const title = `${run}_${suffix}`;
    await fill('[aria-label="内容1标题"]', title); await click('新增内容');
    await fill('[aria-label="内容2标题"]', `${title}_2`); await click('批量保存草稿');
    await wait("document.querySelector('.matrix-page-content').innerText.split('已保存为草稿').length === 3 && !![...document.querySelectorAll('button')].find(el=>el.innerText==='批量保存草稿' && !el.disabled)", 'Batch drafts not saved'); checks++;
    const getCount = () => evaluate(`(async()=>{const token=localStorage.getItem('matrix_token')||sessionStorage.getItem('matrix_token');const r=await fetch('/api/content/posts?status=draft&page=1&pageSize=100',{headers:{Authorization:'Bearer '+token,'x-suda-csrf-token':decodeURIComponent(document.cookie.split('; ').find(x=>x.startsWith('suda-csrf-token='))?.slice(16)||'')}}).then(r=>r.json());const items=r.data.items.filter(item=>item.title?.startsWith(${JSON.stringify(title)}));return {count:items.length,qaTitles:r.data.items.filter(item=>item.title?.startsWith('QA_tools_')).map(item=>item.title),draft:items.every(item=>item.status==='draft')};})()`);
    const first = await getCount(); assert.equal(first.count, 4, JSON.stringify(first)); assert.equal(first.draft, true); checks++;
    await click('批量保存草稿'); assert.equal((await getCount()).count, 4); checks++;
    await navigate(`/publish/${suffix}`, `document.querySelector('.matrix-page-content')?.innerText.includes(${JSON.stringify(title)})`); checks++;
    const capture = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`logs/qa-${suffix}.png`, Buffer.from(capture.data, 'base64'));
  }
  await navigate('/admin/codes', "!!document.querySelector('[data-matrix-real-codes]') && !![...document.querySelectorAll('button')].find(el=>el.innerText==='批量生成' && !el.disabled)");
  assert.equal(await evaluate("document.body.innerText.includes('张三') || document.body.innerText.includes('B20250901')"), false); checks++;
  await click('批量生成'); await wait("!!document.querySelector('#code-count')", 'Code generation form missing');
  await fill('#code-count', '2'); await fill('#code-prefix', 'UIQA'); await click('生成并保存正式授权码');
  await wait("document.querySelectorAll('[role=dialog] code').length === 2", 'Real codes not generated');
  const generated = await evaluate("[...document.querySelectorAll('[role=dialog] code')].map(el=>el.innerText)");
  const stored = (await api('GET', '/api/admin/codes?page=1&pageSize=100', undefined, true)).body.data.items;
  assert.ok(generated.every(code => stored.some(item => item.code === code && item.status === 'unused'))); checks++;
  const newUser = `qa_activation_${Date.now()}`;
  assert.equal((await api('POST', '/api/auth/register', { username: newUser, password: 'QaActivate123!', email: `${newUser}@local.test` })).status, 201);
  const login = (await api('POST', '/api/auth/login', { username: newUser, password: 'QaActivate123!' })).body.data;
  await evaluate(`localStorage.setItem('matrix_token',${JSON.stringify(login.token)});localStorage.setItem('matrix_user',${JSON.stringify(JSON.stringify(login.user))});`);
  await navigate('/activate', "!!document.querySelector('#activation-code')");
  await fill('#activation-code', 'NOT-A-REAL-CODE'); await click('验证并激活');
  await wait("document.querySelector('[role=alert]')?.innerText.includes('激活码不存在')", 'Missing code cause was hidden'); checks++;
  await fill('#activation-code', generated[0]); await click('验证并激活');
  await wait("document.body.innerText.includes('激活成功')", 'Admin-generated code could not activate'); checks++;
  const activated = (await api('GET', '/api/auth/me')).body.data;
  assert.equal(activated.vipStatus, 'active');
  const after = (await api('GET', '/api/admin/codes?page=1&pageSize=100', undefined, true)).body.data.items;
  assert.equal(after.find(item => item.code === generated[0]).status, 'used'); checks++;
  await call('Page.reload'); await wait("!!document.querySelector('#activation-code')", 'Activation reload failed');
  await fill('#activation-code', generated[0]); await click('验证并激活');
  await wait("document.querySelector('[role=alert]')?.innerText.includes('激活码已被使用')", 'Used code cause was hidden');
  assert.equal((await api('GET', '/api/auth/me')).body.data.vipExpiresAt, activated.vipExpiresAt); checks++;
  const unused = after.find(item => item.code === generated[1]);
  await api('POST', `/api/admin/codes/${unused.id}/disable`, {}, true);
  await fill('#activation-code', generated[1]); await click('验证并激活');
  await wait("document.querySelector('[role=alert]')?.innerText.includes('激活码已作废')", 'Disabled code cause was hidden'); checks++;
  console.log(JSON.stringify({ personalTools: checks, activationLifecycleChecks: 7, isolatedDatabase: true, platformActionsPerformed: false }));
} finally { socket.close(); }
