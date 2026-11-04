// A real Chromium DOM in an offline disposable profile, not a logged-in site.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
if (!process.versions.electron) {
  const electron = path.join(__dirname, '../.desktop-deps/node_modules/electron/dist/electron.exe');
  const fixtureEnv={...process.env};delete fixtureEnv.ELECTRON_RUN_AS_NODE;
  const result = require('node:child_process').spawnSync(electron, [__filename], {cwd:path.join(__dirname,'..'),windowsHide:true,encoding:'utf8',timeout:45000,env:fixtureEnv});
  if (result.stdout) process.stdout.write(result.stdout); if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.error || result.status === null ? 1 : result.status);
}
const {app, BrowserWindow, session} = require('electron'), assert = require('node:assert/strict');
const {publishValidation} = require('../desktop/publish-validation.cjs'), {runOfficialDOM} = require('../desktop/official-dom.cjs');
const {syncBilibiliDeclaration,bilibiliDeclaration}=require('../desktop/bilibili-declaration.cjs');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-form-validation-qa-')));
app.whenReady().then(async()=>{
  const isolated=session.fromPartition('matrix-offline-form-validation'),win=new BrowserWindow({show:false,width:1100,height:850,webPreferences:{session:isolated,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  let html='',checks=0;await isolated.protocol.handle('https',()=>new Response(html,{headers:{'Content-Type':'text/html;charset=utf-8'}}));
  // Match the active publishing guest's unthrottled rendering. did-finish-load
  // precedes Chromium's first compositor hit-test surface after a navigation;
  // wait for that surface before exercising trusted pointer input, not a sleep
  // or a retry of the click. Keep the window hidden and all assertions intact.
  const load=async(content,host='creator.douyin.com')=>{html='<meta charset=utf-8><style>input,textarea,select,[role=combobox]{display:block;width:350px;height:35px}</style>'+content;await win.loadURL('https://'+host+(host==='member.bilibili.com'?'/platform/upload/video/frame':'/creator-micro/content/post/video'));await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');};
  const js=code=>win.webContents.executeJavaScript(code),read=input=>runOfficialDOM(win.webContents,publishValidation,[input||{}],'matrix-page-actions');
  try {
    await load('<input aria-label=标题 required><textarea aria-label=简介 required></textarea><button>发布</button><script>window.actions=0;document.querySelector("button").onclick=()=>window.actions++;</script>');
    let value=await read();assert.equal(value.errors.length,2);assert.ok(value.errors.every(x=>x.code==='required'));assert.equal(await js('window.actions'),0);checks+=3;
    await js('document.querySelector("input").value="QA title";document.querySelector("textarea").value="QA body";true');assert.equal((await read()).errors.length,0);checks++;
    await load('<input type=password aria-label=密码 required value=never-export-password><input type=email required value=never-export-email><input autocomplete=one-time-code required><input aria-label=隐藏 required style=display:none><div hidden><input required></div><input aria-label=停用 required disabled>');
    value=await read();assert.equal(value.errors.length,0);assert.ok(!JSON.stringify(value).includes('never-export'));checks+=2;
    await load('<label><input type=radio name=rights required>自制</label><label><input type=radio name=rights checked>转载</label><input type=checkbox aria-label=确认本人版权 required>');
    value=await read();assert.equal(value.errors.length,1);assert.equal(value.errors[0].field,'确认本人版权');checks+=2;
    await load('<input aria-label=标题 value="QA title"><input readonly placeholder="请选择符合您视频内容的创作声明">','member.bilibili.com');
    value=await read();assert.ok(value.errors.some(x=>x.field==='创作声明'&&x.code==='required'));checks++;
    await js('document.querySelector("input[readonly]").value="内容无需标注";true');assert.equal((await read()).errors.length,0);checks++;
    await js('document.body.insertAdjacentHTML("beforeend",document.querySelector("input[readonly]").outerHTML);true');assert.ok((await read()).errors.some(x=>x.code==='ambiguous_required_control'));checks++;
    await load('<input aria-label=标题 value="QA title"><p class=bcc-form-item__error>请选择正确分区</p><textarea>请填写内容，不要导出作者原文</textarea><article><p role=alert>请填写评论</p></article>');
    value=await read();assert.equal(value.errors.length,1);assert.equal(value.errors[0].message,'请选择正确分区');assert.ok(!JSON.stringify(value).includes('作者原文'));checks+=3;
    await load('<input aria-label=标题 value="QA title" aria-invalid=true aria-errormessage=system-error><p id=system-error>标题超过官方限制</p>');
    value=await read();assert.equal(value.errors[0].message,'标题超过官方限制');checks++;
    await load('<input aria-label=标题 required><p role=alert>请选择分区</p>');
    assert.equal((await read({phase:'after_submit',nonce:'no-state',expectedTitle:'QA title'})).inspected,false);checks++;
    await runOfficialDOM(win.webContents,()=>{window.__matrixPageAction={nonce:'qa-nonce',kind:'publish',used:true,url:location.href};return true;},[],'matrix-page-actions');
    // A reset form after a successful navigation is never an explicit failure.
    assert.equal((await read({phase:'after_submit',nonce:'qa-nonce',expectedTitle:'QA title'})).inspected,false);checks++;
    await js('document.querySelector("input").value="QA title";true');value=await read({phase:'after_submit',nonce:'qa-nonce',expectedTitle:'QA title'});assert.equal(value.errors[0].message,'请选择分区');assert.equal(value.inspected,true);checks+=2;
    assert.equal((await read({phase:'after_submit',nonce:'another-nonce',expectedTitle:'QA title'})).inspected,false);checks++;
    await js('document.querySelector("[role=alert]").remove();document.querySelector("input").value="";true');value=await read({phase:'after_submit',nonce:'qa-nonce'});assert.equal(value.errors.length,0);checks++;
    const declarationHtml=(options='<div role=option>内容无需标注</div><div role=option>含AI生成内容</div>')=>`<style>.choice-menu{display:none;background:white;width:350px}.choice-menu [role=option]{padding:12px;cursor:pointer}</style><section class=declaration-field><label>创作声明</label><input readonly placeholder="请选择符合您视频内容的创作声明"><div class=choice-menu>${options}</div></section><button>发布</button><script>window.declarationClicks=0;window.fixtureSubmitClicks=0;window.lastTrusted=false;const input=document.querySelector('input'),menu=document.querySelector('.choice-menu');input.onclick=()=>menu.style.display='block';menu.querySelectorAll('[role=option]').forEach(option=>option.onclick=event=>{window.declarationClicks++;window.lastTrusted=event.isTrusted;input.value=option.textContent;menu.style.display='none';});document.querySelector('button').onclick=()=>window.fixtureSubmitClicks++;</script>`;
    await load(declarationHtml(),'member.bilibili.com');
    await syncBilibiliDeclaration(win.webContents,'含AI生成内容');
    assert.equal(await js('document.querySelector("input").value'),'含AI生成内容');assert.equal(await js('window.lastTrusted'),true);assert.equal(await js('window.declarationClicks'),1);assert.equal(await js('window.fixtureSubmitClicks'),0);checks+=4;
    await syncBilibiliDeclaration(win.webContents,'含AI生成内容');assert.equal(await js('window.declarationClicks'),1);checks++;
    await assert.rejects(()=>syncBilibiliDeclaration(win.webContents,'随意声明'),/按真实内容/);assert.equal(await js('window.declarationClicks'),1);checks+=2;
    await load(declarationHtml('<div role=option>内容无需标注</div><div role=option>内容无需标注</div>'),'member.bilibili.com');
    await js('document.querySelector(".choice-menu").style.display="block";true');await assert.rejects(()=>syncBilibiliDeclaration(win.webContents,'内容无需标注'),/不唯一/);assert.equal(await js('window.declarationClicks'),0);checks+=2;
    await load(declarationHtml(),'member.bilibili.com');await js('document.body.insertAdjacentHTML("beforeend",\'<div style="position:fixed;inset:0;z-index:100;background:white"></div>\');true');await assert.rejects(()=>syncBilibiliDeclaration(win.webContents,'内容无需标注'),/遮挡/);assert.equal(await js('window.declarationClicks'),0);checks+=2;
    await load('<select aria-label=创作声明><option value="">请选择</option><option value=no-label>内容无需标注</option><option value=ai>含AI生成内容</option></select>','member.bilibili.com');await syncBilibiliDeclaration(win.webContents,'内容无需标注');assert.equal(await js('document.querySelector("select").value'),'no-label');checks++;
    await load(declarationHtml(),'creator.douyin.com');await assert.rejects(()=>runOfficialDOM(win.webContents,bilibiliDeclaration,['open',{expected:'内容无需标注'}]),/不是B站官方投稿页/);checks++;
    console.log(JSON.stringify({officialFormValidationChecks:checks,validationReadOnly:true,declarationExactUserChoice:true,trustedElementDerivedEvents:true,resetFormNotRejection:true,credentialsAndAuthoredTextExcluded:true,realPlatformActions:false}));
  } catch(error){console.error(error);process.exitCode=1;}
  finally{win.destroy();app.exit(process.exitCode||0);}
});
