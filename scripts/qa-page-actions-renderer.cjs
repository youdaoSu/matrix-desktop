const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pageAction } = require('../desktop/page-actions.cjs');
const { publishForm } = require('../desktop/publish-form.cjs');
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
    let publishChecks = 0;
    const sync = (command, config) => win.webContents.executeJavaScriptInIsolatedWorld(1002, [{ code: `(${publishForm.toString()})(${JSON.stringify(command)},${JSON.stringify(config)})` }]);
    for (const platform of ['douyin', 'xiaohongshu', 'wechat', 'bilibili']) {
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<input placeholder="标题"><textarea placeholder="简介"></textarea><input placeholder="验证码"><select aria-label="可见范围"><option value="private">仅自己可见</option><option value="public">公开</option></select><button onclick="window.didPublish=true">发布</button>'));
      const result = await sync('fill', { platform, title: '我的标题', body: '我的简介', topics: platform === 'bilibili' ? [] : ['健身'], options: { visibility: '仅自己可见' } });
      assert.deepEqual(result.filled, ['title', 'body', 'visibility']); assert.equal(result.submitted, false); assert.equal(await js('!!window.didPublish'), false); publishChecks += 3;
      assert.equal(await js('document.querySelectorAll("input")[1].value'), ''); publishChecks++;
    }
    await js('document.querySelector("input").maxLength=2');
    assert.ok((await sync('fill', { title: '不能截断的长标题', body: '', topics: [], options: {} })).unresolved.some(s => s.includes('限制'))); publishChecks++;
    await js('document.body.insertAdjacentHTML("beforeend", "<input placeholder=标题>")');
    assert.ok((await sync('fill', { title: '重复', topics: [], options: {} })).unresolved.some(s => s.includes('未唯一'))); publishChecks++;
    await js('document.body.insertAdjacentHTML("beforeend", "<div class=topic-list><div role=option>#官方推荐</div><div role=option style=display:none>隐藏话题</div></div>")');
    assert.deepEqual((await sync('topics', {})).topics, ['官方推荐']); publishChecks++;
    console.log(JSON.stringify({ publishFormAssertions: publishChecks, localFixturesOnly: true }));
    await fixture(); assert.equal((await sync('progress', {})).ready, true); assert.equal((await sync('progress', {})).uploadPercent, undefined);
    await js('document.body.insertAdjacentHTML("beforeend", "<progress value=35 max=100></progress>")');
    assert.equal((await sync('progress', {})).uploadPercent, 35); assert.equal((await sync('progress', {})).ready, false);
    await js('document.querySelector("progress").value=100'); assert.equal((await sync('progress', {})).ready, true);
    await js('document.querySelector("[role=status]").textContent="上传失败"'); assert.equal((await sync('progress', {})).ready, false); assert.equal((await sync('progress', {})).uploadError, '上传失败');
    await js('document.querySelector("[role=status]").textContent=""; document.querySelector("progress").removeAttribute("value")'); assert.equal((await sync('progress', {})).uploadPercent, undefined);
    console.log(JSON.stringify({ publishProgressAssertions: 8, fabricatedPercentages: false }));
    await fixture('下架', '下架成功'); await js('document.querySelector("form").insertAdjacentHTML("afterbegin","<h1>QA作品</h1>")');
    await assert.rejects(run('inspect', { kind: 'withdraw', nonce: 'wrong', expectedTitle: '其他作品' }));
    await run('inspect', { kind: 'withdraw', nonce: 'withdraw', expectedTitle: 'QA作品' }); await run('submit', { nonce: 'withdraw', index: 0 }); await new Promise(r => setTimeout(r, 80)); assert.equal((await run('result', { nonce: 'withdraw' })).status, 'confirmed');
    await fixture('删除', '删除成功'); await js('document.querySelector("form").insertAdjacentHTML("afterbegin","<h1>QA作品</h1>")'); await assert.rejects(run('inspect', { kind: 'withdraw', nonce: 'no-delete', expectedTitle: 'QA作品' }));
    await fixture('下架', '下架失败'); await js('document.querySelector("form").insertAdjacentHTML("afterbegin","<h1>QA作品</h1>")'); await run('inspect', { kind: 'withdraw', nonce: 'failed-withdraw', expectedTitle: 'QA作品' }); await run('submit', { nonce: 'failed-withdraw', index: 0 }); await new Promise(r => setTimeout(r, 80)); assert.equal((await run('result', { nonce: 'failed-withdraw' })).status, 'failed');
    console.log(JSON.stringify({ withdrawalGuardChecks: 4, realWorksChanged: false }));
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { win.destroy(); app.exit(process.exitCode || 0); }
});
