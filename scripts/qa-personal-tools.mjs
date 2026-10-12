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
    await navigate(`/publish/${suffix}`, "!!document.querySelector('.matrix-platform-config-panel') && ![...document.querySelectorAll('button')].find(el=>el.innerText==='批量保存草稿')?.disabled");
    await evaluate("[...document.querySelectorAll('.matrix-workspace-tabs > button')].find(el=>el.getClientRects().length&&el.innerText.includes('收起账号页面'))?.click();true");
    await wait("!document.querySelector('.matrix-main-integrated') && !!document.querySelector('.matrix-batch-columns')", 'Native batch editor did not become visible');
    assert.equal(await evaluate("(() => { const columns=document.querySelector('.matrix-batch-columns').getBoundingClientRect(); const common=document.querySelector('.matrix-batch-common').getBoundingClientRect(); const accounts=document.querySelector('.matrix-batch-accounts').getBoundingClientRect(); const footer=document.querySelector('.matrix-publish-footer').getBoundingClientRect(); return Math.abs(common.width/columns.width-.6)<.01 && Math.abs(accounts.width/columns.width-.4)<.01 && footer.bottom<=innerHeight+1 && footer.height>0; })()"), true); checks++;
    await click('选择账号'); await wait("document.querySelectorAll('[data-publish-account] [role=checkbox]:not([disabled])').length === 4", 'Batch account picker missing');
    await evaluate("[...document.querySelectorAll('[data-publish-account] [role=checkbox]:not([disabled])')].slice(0,2).forEach(el=>el.click());");
    await click('确定');
    const title = `${run}_${suffix}`;
    await fill('[aria-label="内容1标题"]', title); await click('新增内容');
    await fill('[aria-label="内容2标题"]', `${title}_2`); await click('批量保存草稿');
    await wait("document.querySelector('.matrix-page-content').innerText.split('已保存为草稿').length === 3 && !![...document.querySelectorAll('button')].find(el=>el.innerText==='批量保存草稿' && !el.disabled)", 'Batch drafts not saved'); checks++;
    const getCount = () => evaluate(`(async()=>{const token=localStorage.getItem('matrix_token')||sessionStorage.getItem('matrix_token');const r=await fetch('/api/content/posts?status=draft&page=1&pageSize=100',{headers:{Authorization:'Bearer '+token,'x-suda-csrf-token':decodeURIComponent(document.cookie.split('; ').find(x=>x.startsWith('suda-csrf-token='))?.slice(16)||'')}}).then(r=>r.json());const items=r.data.items.filter(item=>item.title?.startsWith(${JSON.stringify(title)}));return {count:items.length,qaTitles:r.data.items.filter(item=>item.title?.startsWith('QA_tools_')).map(item=>item.title),draft:items.every(item=>item.status==='draft')};})()`);
    const first = await getCount(); assert.equal(first.count, 4, JSON.stringify(first)); assert.equal(first.draft, true); checks++;
    await click('批量保存草稿'); assert.equal((await getCount()).count, 4); checks++;
    assert.equal(await evaluate("[...document.querySelectorAll('.matrix-batch-media button')].filter(el=>el.innerText==='选择素材').length"), 2); checks++;
    await click('为所选账号准备本条');
    await wait(`document.querySelectorAll('.matrix-prepared-text').length===2 && [...document.querySelectorAll('.matrix-draft-helper textarea')].filter(el=>el.value===${JSON.stringify(title)}).length===2`, 'Batch row did not hand off separate title/body preparation to both selected accounts'); checks++;
    await click('收起账号页面');
    await wait("!document.querySelector('.matrix-main-integrated')", 'Account pages did not collapse before native layout checks');
    await navigate(`/publish/${suffix}`, `document.querySelector('.matrix-page-content')?.textContent.includes(${JSON.stringify(title)})`); checks++;
    const capture = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`logs/qa-${suffix}.png`, Buffer.from(capture.data, 'base64'));
  }
  await navigate('/engage/batch-tasks', "!!document.querySelector('[data-matrix-personal-tasks]') && !document.querySelector('[role=status]')");
  await navigate('/publish/stats', "!!document.querySelector('[data-matrix-publish-stats]') && !document.querySelector('[role=status]')");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.matrix-task-metrics article strong')].map(el=>el.innerText)"), ['0','0','—','0','0 / 0']); checks++;
  const statsCapture=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync('logs/qa-publish-stats.png',Buffer.from(statsCapture.data,'base64'));
  for (const route of ['comments-agg','messages-agg']) {
    await navigate(`/engage/${route}`, `!!document.querySelector('.matrix-${route.startsWith('comments') ? 'comments' : 'messages'}-aggregate') && !document.querySelector('.matrix-interaction-accounts')`);
    assert.equal(await evaluate("Math.abs(document.querySelector('.matrix-reply-template-pane').getBoundingClientRect().width-300)<1"), true); checks++;
    if (route === 'messages-agg') { assert.equal(await evaluate("(() => { const panel=document.querySelector('.matrix-message-panel'), sessions=document.querySelector('.matrix-message-sessions'); return !!panel && !!sessions && Math.abs(sessions.getBoundingClientRect().width/panel.getBoundingClientRect().width-.35)<.01; })()"), true); checks++; }
  }
  await navigate('/engage/followers', "!!document.querySelector('.matrix-followers-layout') && !!document.querySelector('.matrix-interaction-accounts')");
  assert.equal(await evaluate("Math.abs(document.querySelector('.matrix-interaction-accounts').getBoundingClientRect().width-280)<1"), true); checks++;
  await navigate('/engage/batch-tasks', "!!document.querySelector('[data-matrix-personal-tasks]') && !document.querySelector('[role=status]')");
  await click('新建待办'); await wait("document.querySelectorAll('[role=dialog] fieldset input[type=checkbox]').length === 4", 'Task account picker missing');
  await evaluate("[...document.querySelectorAll('[role=dialog] fieldset input[type=checkbox]')].slice(0,2).forEach(el=>el.click())");
  await fill('#personal-task-title', `${run}_task`); await fill('#personal-task-content', 'QA manual content');
  await fill('#personal-task-due', '2026-01-01T10:00'); await click('保存个人待办');
  await wait(`!document.querySelector('[role=dialog]') && document.querySelector('.matrix-page-content')?.innerText.includes(${JSON.stringify(`${run}_task`)})`, 'Task UI did not save'); checks++;
  const savedTasks = (await api('GET', '/api/personal/tasks?pageSize=100')).body.data.items.filter(t=>t.title===`${run}_task`);
  assert.equal(savedTasks.length, 2); assert.ok(savedTasks.every(t=>t.status==='pending')); checks++;
  await evaluate(`localStorage.setItem('qa_task_id',${JSON.stringify(savedTasks[0].id)})`);
  await navigate('/engage/batch-tasks', `document.querySelector('.matrix-page-content')?.innerText.includes(${JSON.stringify(`${run}_task`)})`); checks++;
  await evaluate("document.querySelector('[data-task-id=\"'+localStorage.getItem('qa_task_id')+'\"] button:nth-of-type(3)').click()");
  await wait("!!document.querySelector('#personal-task-note')", 'Task editor missing');
  await fill('#personal-task-content', 'QA manual edited'); await fill('#personal-task-note', 'QA reviewed'); await click('保存个人待办');
  await wait("!document.querySelector('[role=dialog]') && document.querySelector('.matrix-page-content')?.innerText.includes('QA manual edited')", 'Task edit not saved'); checks++;
  await evaluate("window.confirm=()=>false;document.querySelector('[data-task-id=\"'+localStorage.getItem('qa_task_id')+'\"] button:nth-of-type(4)').click()");
  assert.equal((await api('GET', '/api/personal/tasks?pageSize=100')).body.data.items.find(t=>t.id===savedTasks[0].id).status, 'pending'); checks++;
  await evaluate("window.confirm=()=>true;document.querySelector('[data-task-id=\"'+localStorage.getItem('qa_task_id')+'\"] button:nth-of-type(4)').click()");
  await wait(`!document.querySelector('[data-task-id="${savedTasks[0].id}"]')`, 'Completed manual task stayed pending');
  assert.equal((await api('GET', '/api/personal/tasks?pageSize=100')).body.data.items.find(t=>t.id===savedTasks[0].id).status, 'done'); checks++;
  await navigate('/analytics/notify-monitor', "!!document.querySelector('[data-matrix-personal-tasks]') && !document.querySelector('[role=status]')");
  await wait(`document.querySelector('.matrix-page-content')?.innerText.includes(${JSON.stringify(`${run}_task`)})`, 'Due reminder task missing'); checks++;
  const taskCapture=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync('logs/qa-personal-tasks.png',Buffer.from(taskCapture.data,'base64'));
  await navigate('/analytics/account-monitor', "!!document.querySelector('[data-matrix-account-health]') && !![...document.querySelectorAll('button')].find(el=>el.innerText==='检查当前页会话'&&!el.disabled)");
  await click('检查当前页会话'); await wait("document.querySelector('.matrix-page-content')?.innerText.split('未检测到').length === 5", 'Fresh sessions should not claim healthy login'); checks++;
  await navigate('/publish/drafts', "!!document.querySelector('[data-matrix-content-records]') && !document.querySelector('[role=status]')");
  await fill('[aria-label="搜索本地草稿"]', `${run}_batch-video`); await click('搜索');
  await wait("document.querySelectorAll('[data-post-id]').length===4", 'Draft search or filtering failed'); checks++;
  await evaluate("document.querySelector('[data-post-id] details').open=true;true");
  await click('编辑草稿'); await wait("!!document.querySelector('#content-record-title')", 'Draft editor missing');
  await fill('#content-record-body','QA persisted edit');await click('保存草稿修改');
  await wait("!document.querySelector('[role=dialog]') && document.querySelector('.matrix-page-content')?.innerText.includes('QA persisted edit')", 'Draft edit failed'); checks++;
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
