const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pageAction } = require('../desktop/page-actions.cjs');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-page-actions-qa-'));
app.setPath('userData', profile);
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1000, height: 700, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  const run = (command, input) => win.webContents.executeJavaScriptInIsolatedWorld(1001, [{ code: `(${pageAction.toString()})(${JSON.stringify(command)},${JSON.stringify(input)})` }]);
  const js = code => win.webContents.executeJavaScript(code);
  const fixture = async (button = '发布', outcome = '发布成功', baseline = '') => {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<meta charset="utf-8"><form><input id="title" placeholder="标题" value="QA fixture only"><input type="password" value="never-expose"><textarea placeholder="正文">QA body</textarea><button type="button" id="send">${button}</button><button type="button">删除账号</button><button type="button" style="display:none">发布</button></form><div role="status">${baseline}</div><script>let count=0;document.querySelector('#send').onclick=()=>{document.body.dataset.clicks=++count;setTimeout(()=>{document.querySelector('[role=status]').textContent=${JSON.stringify(outcome)}},10)};</script>`));
  };
  let checks = 0;
  try {
    await fixture(); let plan = await run('inspect', { nonce: 'a', kind: 'publish' });
    assert.equal(plan.candidates.length, 1); assert.equal(plan.fields.length, 2); assert.ok(!JSON.stringify(plan).includes('never-expose')); checks++;
    await run('submit', { nonce: 'a', index: 0 }); await new Promise(r => setTimeout(r, 80));
    assert.equal((await run('result', { nonce: 'a' })).status, 'confirmed'); assert.equal(await js('document.body.dataset.clicks'), '1'); checks++;
    await assert.rejects(run('submit', { nonce: 'a', index: 0 })); checks++;
    await fixture(); await run('inspect', { nonce: 'b', kind: 'publish' }); await js("document.querySelector('#title').value='changed'");
    await assert.rejects(run('submit', { nonce: 'b', index: 0 })); assert.equal(await js('document.body.dataset.clicks'), undefined); checks++;
    await fixture(); await run('inspect', { nonce: 'c', kind: 'publish' }); await js("document.querySelector('#send').disabled=true"); await assert.rejects(run('submit', { nonce: 'c', index: 0 })); checks++;
    await fixture(); await run('inspect', { nonce: 'd', kind: 'publish' }); await js("const mask=document.createElement('div');mask.style='position:fixed;inset:0;background:white;z-index:999';document.body.append(mask)"); await assert.rejects(run('submit', { nonce: 'd', index: 0 })); checks++;
    await fixture('发布', '发布成功', '发布成功'); await run('inspect', { nonce: 'e', kind: 'publish' }); await run('submit', { nonce: 'e', index: 0 }); await new Promise(r => setTimeout(r, 80)); assert.equal((await run('result', { nonce: 'e' })).status, 'unknown'); checks++;
    await fixture('发布', '发布失败：请填写标题'); await run('inspect', { nonce: 'f', kind: 'publish' }); await run('submit', { nonce: 'f', index: 0 }); await new Promise(r => setTimeout(r, 80)); assert.equal((await run('result', { nonce: 'f' })).status, 'failed'); checks++;
    for (const [kind, button, outcome] of [['comments','回复','回复成功'], ['messages','发送','发送成功']]) { await fixture(button, outcome); await run('inspect', { nonce: kind, kind }); await run('submit', { nonce: kind, index: 0 }); await new Promise(r => setTimeout(r, 80)); assert.equal((await run('result', { nonce: kind })).status, 'confirmed'); checks++; }
    await fixture(); await assert.rejects(run('submit', { nonce: 'stale', index: 0 })); checks++;
    await fixture(); await js("const v=document.createElement('select');v.innerHTML='<option>仅自己可见</option><option>公开</option>';document.body.append(v)"); await run('inspect', { nonce: 'choice', kind: 'publish' }); await js("document.querySelector('select').selectedIndex=1"); await assert.rejects(run('submit', { nonce: 'choice', index: 0 })); checks++;
    await fixture(); await js("const h=document.createElement('h1');h.textContent='会话 A';document.body.prepend(h)"); await run('inspect', { nonce: 'target', kind: 'publish' }); await js("document.querySelector('h1').textContent='会话 B'"); await assert.rejects(run('submit', { nonce: 'target', index: 0 })); checks++;
    await fixture(); await run('inspect', { nonce: 'label', kind: 'publish' }); await js("document.querySelector('#send').textContent='投稿'"); await assert.rejects(run('submit', { nonce: 'label', index: 0 })); checks++;
    await fixture('发布', '未发布成功，请稍后再试'); await run('inspect', { nonce: 'negative', kind: 'publish' }); await run('submit', { nonce: 'negative', index: 0 }); await new Promise(r => setTimeout(r, 80)); assert.equal((await run('result', { nonce: 'negative' })).status, 'failed'); checks++;
    console.log(JSON.stringify({ realElectronFixtureChecks: checks, externalNetworkOrPlatformActions: false }));
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { win.destroy(); app.exit(process.exitCode || 0); }
});
