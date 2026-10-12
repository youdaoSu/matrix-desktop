const { app, BrowserWindow } = require('electron');
const { officialData, officialDataScript } = require('../desktop/official-data.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-official-data-qa-')));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
  const fixture = html => win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<meta charset=utf-8>' + html + '<button id=publish onclick="window.published=true">发布</button><input type=password value=secret>'));
  const run = (command, input = {}) => win.webContents.executeJavaScriptInIsolatedWorld(1003, [{ code: `(${officialData.toString()})(${JSON.stringify(command)},${JSON.stringify(input)})` }]);
  const js = code => win.webContents.executeJavaScript(code);
  let checks = 0;
  const select = '<label for=music>音乐</label><select id=music><option value="">请选择</option><option value=a>曲目 A</option><option value=b>曲目 B</option><option disabled value=c>不可选</option></select>';
  try {
    await fixture(select); let result = await run('options', { field: '音乐', nonce: 'a' });
    assert.deepEqual(result.items.map(row => row.label), ['曲目 A', '曲目 B']); checks++;
    assert.equal((await run('select-option', { nonce: 'a', index: 1 })).applied, true); assert.equal(await js('document.querySelector("select").value'), 'b'); checks += 2;
    await assert.rejects(run('select-option', { nonce: 'a', index: 0 })); checks++;
    await run('options', { field: '音乐', nonce: 'b' }); await js('document.querySelector("select").value="a"'); await assert.rejects(run('select-option', { nonce: 'b', index: 1 })); checks++;
    await fixture(select); await run('options', { field: '音乐', nonce: 'c' }); await js('document.querySelectorAll("option")[1].textContent="changed"'); await assert.rejects(run('select-option', { nonce: 'c', index: 0 })); checks++;
    await fixture(select); await run('options', { field: '音乐', nonce: 'd' }); await js('document.querySelector("select").disabled=true'); await assert.rejects(run('select-option', { nonce: 'd', index: 0 })); checks++;
    await fixture('<select aria-label=音乐><option value=a>A</option></select>'.repeat(2)); await assert.rejects(run('options', { field: '音乐' })); checks++;
    await fixture('<button aria-label=音乐 onclick="window.wrong=true">音乐</button>'); await assert.rejects(run('open-options', { field: '音乐' })); assert.equal(await js('!!window.wrong'), false); checks += 2;
    await fixture('<div role=combobox aria-label=合集 aria-controls=list tabindex=0>合集</div><div id=list role=listbox><div role=option onclick="this.setAttribute(\'aria-selected\',\'true\')">系列 A</div><div role=option style=display:none>隐藏</div></div>');
    assert.equal((await run('options', { field: '合集', nonce: 'e' })).items.length, 1); checks++;
    assert.equal((await run('select-option', { nonce: 'e', index: 0 })).applied, true); checks++;
    await run('options', { field: '合集', nonce: 'f' }); await js('document.getElementById("list").remove()'); await assert.rejects(run('select-option', { nonce: 'f', index: 0 })); checks++;
    await fixture('<h2 id=label>商品</h2><div role=dialog aria-labelledby=label><div role=option>商品 A</div></div>');
    assert.equal((await run('options', { field: '商品', nonce: 'g' })).items[0].label, '商品 A'); checks++;
    const unknown = await run('select-option', { nonce: 'g', index: 0 }); assert.equal(unknown.applied, false); assert.equal(unknown.requiresReview, true); checks += 2;
    for (const [kind, attr, body] of [['comments','data-comment-id','comment-content'], ['messages','data-conversation-id','last-message'], ['followers','data-follower-id','unused']]) {
      await fixture(`<div ${attr}=123><span class=nickname>真实昵称</span><span class=${body}>真实内容<span style=display:none>hidden-secret</span></span></div><div ${attr}=456 style=display:none><span class=nickname>隐藏</span><span class=${body}>隐藏内容</span></div>`);
      result = await run('read-interactions', { kind }); assert.equal(result.records.length, 1); assert.equal(result.records[0].author, '真实昵称'); assert.equal(result.partial, true); assert.ok(!JSON.stringify(result.records).includes('secret')); checks += 4;
    }
    await fixture('<div>没有可识别列表</div>'); await assert.rejects(run('read-interactions', { kind: 'comments' })); checks++;
    const friendly = await win.webContents.executeJavaScriptInIsolatedWorld(1003, [{ code: officialDataScript('read-interactions', { kind: 'comments' }) }]);
    assert.match(friendly.error, /当前页没有识别到/); assert.equal(friendly.records, undefined); checks += 2;
    await fixture(select); await run('options', { field: '音乐', nonce: 'covered' }); await js("const mask=document.createElement('div');mask.style='position:fixed;inset:0;z-index:999;background:white';document.body.append(mask)"); await assert.rejects(run('select-option', { nonce: 'covered', index: 0 })); checks++;
    assert.equal(await js('!!window.published'), false); checks++;
    // Offline replicas of observed public DOM structure; no real network or private data.
    let observedHtml = '<div class="comment-item-test"><div class="comment-main-test"><div class="username-test">QA 作者</div><div class="time-test">今天</div><div class="text-test">QA 评论正文</div><button>删除</button></div></div>';
    await win.webContents.session.protocol.handle('https', () => new Response('<meta charset=utf-8>' + observedHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
    await win.loadURL('https://creator.douyin.com/creator-micro/work-management/work-detail/qa-only');
    result = await run('read-interactions', { kind: 'comments' }); assert.equal(result.records.length, 1); assert.equal(result.records[0].content, 'QA 评论正文'); assert.equal(result.records[0].platformId, ''); checks += 3;
    await win.loadURL('https://creator.douyin.com/other'); await assert.rejects(run('read-interactions', { kind: 'comments' })); checks++;
    observedHtml = '<div data-e2e=im-dialog><div data-e2e=conversation-item><div class=conversationConversationItemtitle>QA 会话</div><pre class=ConversationItemHinttextBox>QA 预览</pre></div><div data-e2e=conversation-item><div class=conversationConversationItemtitle>QA 无预览</div><div>2小时内在线</div></div></div><div data-e2e=conversation-item><div class=conversationConversationItemtitle>无关区块</div></div>';
    await win.loadURL('https://www.douyin.com/jingxuan');
    result = await run('read-interactions', { kind: 'messages' }); assert.equal(result.records.length, 2); assert.equal(result.records[0].content, 'QA 预览'); assert.equal(result.records[1].content, ''); assert.equal(result.records[0].platformId, ''); checks += 4;
    await win.loadURL('https://example.org/'); await assert.rejects(run('read-interactions', { kind: 'messages' })); checks++;
    console.log(JSON.stringify({ officialDataElectronAssertions: checks, realPlatformWrites: false })); app.exit(0);
  } catch (error) { console.error({ completedAssertions: checks }, error); app.exit(1); }
});
