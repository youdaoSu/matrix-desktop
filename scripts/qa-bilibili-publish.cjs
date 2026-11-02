// Observed Bilibili markup, served entirely from a disposable Electron protocol.
// No real account, network requests, file uploads, or platform submissions.
const path = require('node:path');
const fs = require('node:fs');
if (!process.argv.includes('--fixture-child')) {
  const { spawnSync } = require('node:child_process');
  const executable = path.resolve('.desktop-deps/node_modules/electron/dist/electron.exe');
  const result = spawnSync(executable, [__filename, '--fixture-child'], { cwd: path.resolve(__dirname, '..'), windowsHide: true, encoding: 'utf8', timeout: 55000 });
  process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
  if (result.error) console.error(result.error.message);
  process.exit(result.status ?? 1);
}
const { app, BrowserWindow, session } = require('electron');
const assert = require('node:assert/strict');
const os = require('node:os');
const { runOfficialDOM } = require('../desktop/official-dom.cjs');
const { publishVisibility } = require('../desktop/publish-visibility.cjs');
const { coverControl } = require('../desktop/upload-controls.cjs');
const { pageAction } = require('../desktop/page-actions.cjs');
const { publishForm } = require('../desktop/publish-form.cjs');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-bili-publish-qa-')));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  let checks = 0, html = '';
  const fixtureSession = session.fromPartition('matrix-bili-markup-fixture');
  await fixtureSession.protocol.handle('https', () => new Response(html, { headers: { 'Content-Type': 'text/html;charset=utf-8' } }));
  const win = new BrowserWindow({ show: false, width: 1100, height: 800, webPreferences: { session: fixtureSession, contextIsolation: true, sandbox: true } });
  const js = code => win.webContents.executeJavaScript(code);
  const run = (fn, args) => runOfficialDOM(win.webContents, fn, args, 'qa-bili-publish');
  const privacy = command => run(publishVisibility, [command, { platform: 'bilibili', expected: '仅自己可见' }]);
  const cover = command => run(coverControl, [command, { platform: 'bilibili', index: 1 }]);
  const action = (command, nonce) => run(pageAction, [command, { kind: 'publish', nonce, index: 0 }]);
  const load = async (host = 'member.bilibili.com', pathname = '/platform/upload/video/frame') => {
    html = `<meta charset=utf-8><style>.check-radio-v2-container,.label,.cover-empty-pill,.submit-add,.button{display:inline-block;padding:12px;cursor:pointer}.cover-editor{position:fixed;inset:0;background:white;z-index:10}.cover-module-main img{width:80px;height:60px}</style>
      <input placeholder=标题 value="QA private title"><textarea placeholder=简介>QA only</textarea><input type=password value="never-return-this">
      <div class=form><div class=title><span class=label>更多设置<span class=des>（含声明与权益、视频元素、互动管理等）</span></span></div>
      <div id=settings style=display:none><div class=video-setting-card><div class=video-setting-title>可见范围</div><div class=check-radio-v2-container><span class=check-radio-v2-box-checked></span><span class=check-radio-v2-name>公开可见</span></div><div class=check-radio-v2-container><span class=check-radio-v2-box></span><span class=check-radio-v2-name>仅自己可见</span></div></div></div></div>
      <div class=cover-module-main><div class=cover-empty-pill><img class=add-icon>添加封面</div></div>
      <div class=submit-container><div class=submit-actions><div class=submit-button-anchor><span class=submit-add>立即投稿</span></div></div></div><div role=status></div>
      <div class="cover-editor bcc-dialog__wrap bcc-dialog__wrap-mask" style=display:none><div class=bcc-dialog__body>封面制作<div class=bcc-upload-wrapper>上传封面<input type=file accept="image/png,image/jpeg"></div><div class="cover-editor-button cover-editor-content-right-bottom"><div class=button>取消</div><div class="button submit">完成</div></div></div></div>
      <script>window.submitCount=0;document.querySelector('.label').onclick=()=>document.querySelector('#settings').style.display='block';document.querySelectorAll('.check-radio-v2-container').forEach(r=>r.onclick=()=>document.querySelectorAll('.check-radio-v2-container').forEach(other=>other.firstElementChild.className=other===r?'check-radio-v2-box-checked':'check-radio-v2-box'));document.querySelector('.cover-empty-pill').onclick=()=>document.querySelector('.cover-editor').style.display='block';document.querySelector('.button.submit').onclick=()=>{document.querySelector('.cover-editor').style.display='none';document.querySelector('.cover-module-main').innerHTML='<img src="data:image/png;base64,iVBORw0KGgo=">'};document.querySelector('.submit-add').onclick=()=>{window.submitCount++;document.querySelector('[role=status]').textContent='投稿成功'};</script>`;
    await win.loadURL('https://' + host + pathname);
  };
  try {
    await load();
    await assert.rejects(privacy('read'), /未识别/); checks++;
    assert.equal((await privacy('select')).opened, true); checks++;
    assert.equal((await privacy('read')).visibility, '公开'); checks++;
    assert.equal((await privacy('select')).visibility, '仅自己可见'); checks++;
    assert.equal(await js('window.submitCount'), 0); checks++;
    await load(); await cover('open'); await cover('uploaded');
    await js(`document.querySelector('.button.submit').onclick=()=>{document.querySelector('.cover-editor').style.display='none';document.querySelector('.cover-module-main').innerHTML='<div class=cover-img style="width:100px;height:80px;background-image:url(data:image/png;base64,iVBORw0KGgo=)"></div>'};true`);
    await cover('finish');await cover('finish');await new Promise(r=>setTimeout(r,650));
    assert.equal((await cover('finish')).coverConfirmed,true);checks++;
    assert.equal(await js('window.submitCount'),0);checks++;
    await load(); await privacy('select'); await privacy('select');
    assert.equal((await run(publishForm, ['progress', { platform: 'bilibili' }])).ready, true); checks++;
    const described = await run(publishForm, ['describe', { platform: 'bilibili' }]);
    assert.ok(described.settingsControls.some(c => c.text === '仅自己可见')); checks++;
    assert.ok(!JSON.stringify(described).includes('never-return-this')); checks++;
    assert.equal((await action('inspect', 'bili-good')).candidates.length, 1); checks++;
    assert.deepEqual(await action('validate', 'bili-good'), { ready: true, clicked: false }); checks++;
    await js("document.querySelector('.check-radio-v2-container').click()");
    await assert.rejects(action('submit', 'bili-good'), /选项已变化/); checks++;
    await privacy('select');
    await js("const mask=document.createElement('div');mask.id='mask';mask.style='position:fixed;inset:0;z-index:99;background:white';document.body.append(mask);document.querySelectorAll('.check-radio-v2-container').forEach((r,i)=>r.firstElementChild.className=i===0?'check-radio-v2-box-checked':'check-radio-v2-box');true");
    await assert.rejects(privacy('select'), /被遮挡/); checks++;
    await js("document.querySelector('#mask').remove();document.querySelector('.video-setting-card').insertAdjacentHTML('beforeend','<div class=check-radio-v2-container><span class=check-radio-v2-name>仅自己可见</span></div>')");
    await assert.rejects(privacy('select'), /已变化/); checks++;
    await load();
    await privacy('select'); await privacy('select');
    await js("document.querySelector('#settings').insertAdjacentHTML('beforeend',document.querySelector('.video-setting-card').outerHTML)");
    await assert.rejects(privacy('read'), /不唯一/); checks++;
    await load(); await privacy('select');
    await js("document.querySelectorAll('.check-radio-v2-container')[1].classList.add('disabled')");
    await assert.rejects(privacy('select'), /不可用/); checks++;
    await load();
    assert.equal((await cover('open')).opened, true); checks++;
    await assert.rejects(cover('finish'), /尚未交付/); checks++;
    await cover('uploaded');
    assert.equal((await cover('finish')).waiting, true); checks++;
    assert.equal((await cover('finish')).waiting, true); checks++;
    await new Promise(r => setTimeout(r, 650));
    assert.equal((await cover('finish')).coverConfirmed, true); checks++;
    assert.equal(await js('window.submitCount'), 0); checks++;
    await load(); await cover('open'); await cover('uploaded');
    await js(`document.querySelector('.button.submit').onclick=()=>{document.body.insertAdjacentHTML('beforeend','<div class="videoup-confirm-modal bcc-dialog__wrap" style="position:fixed;inset:0;background:white;z-index:20"><div class=modal-header>检测到个人空间封面（16:9）未修改</div><p>是否将「4:3封面」改动同步？</p><div class=modal-footer><span style="display:inline-block;padding:12px">不同步，手动编辑</span><span style="display:inline-block;padding:12px">确认同步</span></div></div>');document.querySelector('.modal-footer span:last-child').onclick=()=>{window.coverSyncs=(window.coverSyncs||0)+1;document.querySelector('.videoup-confirm-modal').remove();document.querySelector('.cover-editor').style.display='none';document.querySelector('.cover-module-main').innerHTML='<img src="data:image/png;base64,iVBORw0KGgo=">'}};true`);
    assert.equal((await cover('finish')).waiting, true); checks++;
    assert.equal((await cover('finish')).waiting, true); checks++;
    await cover('finish'); await new Promise(r => setTimeout(r, 650));
    assert.equal((await cover('finish')).coverConfirmed, true); checks++;
    assert.equal(await js('window.coverSyncs'), 1); checks++;
    assert.equal(await js('window.submitCount'), 0); checks++;
    await load(); await cover('open'); await cover('uploaded');
    await js(`window.coverSaves=0;document.querySelector('.button.submit').onclick=()=>{window.coverSaves++;if(window.didSync){document.querySelector('.cover-editor').style.display='none';document.querySelector('.cover-module-main').innerHTML='<div class=cover-img style="width:100px;height:80px;background-image:url(data:image/png;base64,iVBORw0KGgo=)"></div>';return;}document.body.insertAdjacentHTML('beforeend','<div class="videoup-confirm-modal bcc-dialog__wrap" style="position:fixed;inset:0;background:white;z-index:20"><div class=modal-header>检测到个人空间封面（16:9）未修改</div><p>同步「4:3封面」</p><div class=modal-footer><span style="display:inline-block;padding:12px">不同步，手动编辑</span><span style="display:inline-block;padding:12px">确认同步</span></div></div>');document.querySelector('.modal-footer span:last-child').onclick=()=>{window.didSync=true;document.querySelector('.videoup-confirm-modal').remove();}};true`);
    await cover('finish');await cover('finish');await cover('finish');await cover('finish');await new Promise(r=>setTimeout(r,650));
    assert.equal((await cover('finish')).coverConfirmed,true);checks++;
    assert.equal(await js('window.coverSaves'),2);checks++;
    assert.equal(await js('window.didSync'),true);checks++;
    assert.equal(await js('window.submitCount'),0);checks++;
    await load(); await cover('open'); await cover('uploaded');
    await js("document.querySelector('.button.submit').onclick=()=>{};true");
    await cover('finish'); await new Promise(r => setTimeout(r, 650));
    assert.equal((await cover('finish')).coverConfirmed, undefined); checks++;
    await load(); await privacy('select'); await privacy('select');
    await action('inspect', 'bili-local-only');
    assert.equal((await action('submit', 'bili-local-only')).clicked, true); checks++;
    await new Promise(r => setTimeout(r, 50));
    const accepted = await action('result', 'bili-local-only');
    assert.equal(accepted.status, 'unknown'); assert.equal(accepted.accepted, true); assert.equal(accepted.source, 'official_acceptance_notice'); checks+=3;
    await js("document.querySelector('[role=status]').textContent='发布成功'"); await new Promise(r=>setTimeout(r,30));
    assert.equal((await action('result','bili-local-only')).status,'confirmed'); checks++;
    assert.equal(await js('window.submitCount'), 1); checks++;
    await assert.rejects(action('submit', 'bili-local-only')); checks++;
    for (const [host, pathname] of [['example.test','/platform/upload/video/frame'], ['member.bilibili.com','/not-an-upload']]) {
      await load(host, pathname);
      assert.equal((await action('inspect', host)).candidates.length, 0); checks++;
    }
    console.log(JSON.stringify({ observedBilibiliMarkupChecks: checks, externalNetwork: false, realUploadsOrPosts: 0 }));
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { win.destroy(); app.exit(process.exitCode || 0); }
});
