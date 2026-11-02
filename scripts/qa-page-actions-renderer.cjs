const { app, BrowserWindow } = require('electron');
require('./qa-console-pipe.cjs').guardQaConsolePipes({ exit: code => app.exit(code) });
require('../desktop/audio-policy.cjs').registerSilentAudio({ app });
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pageAction } = require('../desktop/page-actions.cjs');
const { publishForm } = require('../desktop/publish-form.cjs');
const { publishVisibility } = require('../desktop/publish-visibility.cjs');
const { publishResult } = require('../desktop/publish-result.cjs');
const { runOfficialDOM, withOfficialDOM } = require('../desktop/official-dom.cjs');
const { uploadControl, coverControl, openCoverWithInput } = require('../desktop/upload-controls.cjs');
const { resolveBilibiliUpload } = require('../desktop/bilibili-upload.cjs');
const {createBilibiliResultReader}=require('../desktop/bilibili-result-reader.cjs');
const {observePublishOutcome}=require('../desktop/publish-outcome.cjs');
const { createPublishMediaStore } = require('../desktop/publish-media.cjs');
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
    for(const notice of ['已提交审核','提交审核成功','等待平台审核','作品等待审核']){
      await fixture('发布',notice);await run('inspect',{nonce:'accepted',kind:'publish'});await run('submit',{nonce:'accepted',index:0});await new Promise(r=>setTimeout(r,80));const received=await run('result',{nonce:'accepted'});assert.equal(received.status,'unknown');assert.equal(received.accepted,true);assert.equal(received.source,'official_acceptance_notice');checks+=3;
      await js("document.querySelector('[role=status]').textContent='发布成功'");await new Promise(r=>setTimeout(r,30));assert.equal((await run('result',{nonce:'accepted'})).status,'confirmed');checks++;
    }
    await fixture('发布','未提交审核成功');await run('inspect',{nonce:'not-accepted',kind:'publish'});await run('submit',{nonce:'not-accepted',index:0});await new Promise(r=>setTimeout(r,80));assert.equal((await run('result',{nonce:'not-accepted'})).status,'failed');checks++;
    for (const notice of ['发布成功后请到作品管理查看','如何确认发布成功？','如果发布成功请等待','视频上传成功','是否发布成功？']) {
      await fixture('发布',notice); await run('inspect',{nonce:'not-a-result',kind:'publish'}); await run('submit',{nonce:'not-a-result',index:0}); await new Promise(r=>setTimeout(r,40)); assert.equal((await run('result',{nonce:'not-a-result'})).status,'unknown'); checks++;
    }
    for (const [notice, property, source] of [['投稿成功，正在审核','accepted','official_acceptance_notice'],['发布成功，请等待审核','accepted','official_acceptance_notice'],['请完成人脸验证','needsUserAction','official_user_action'],['请填写作品标题','nonterminalNotice','official_form_notice'],['网络异常','nonterminalNotice','official_uncertain_notice'],['发布失败：网络超时','nonterminalNotice','official_uncertain_notice']]) {
      await fixture('发布',notice); await run('inspect',{nonce:'nonterminal',kind:'publish'}); await run('submit',{nonce:'nonterminal',index:0}); await new Promise(r=>setTimeout(r,40)); const observed=await run('result',{nonce:'nonterminal'}); assert.equal(observed.status,'unknown'); assert.equal(observed[property],true); assert.equal(observed.source,source); checks+=3;
    }
    await fixture('投稿','投稿成功');
    const biliNotice=(command,input)=>win.webContents.executeJavaScriptInIsolatedWorld(1001,[{code:`(()=>{const location=new URL('https://member.bilibili.com/platform/upload/video/frame');return (${pageAction.toString()})(${JSON.stringify(command)},${JSON.stringify(input)})})()`}]);
    await biliNotice('inspect',{nonce:'bili-ack',kind:'publish'});await biliNotice('submit',{nonce:'bili-ack',index:0});await new Promise(r=>setTimeout(r,40));const biliAck=await biliNotice('result',{nonce:'bili-ack'});assert.equal(biliAck.status,'unknown');assert.equal(biliAck.accepted,true);checks+=2;
    await fixture('投稿','投稿成功，但审核未通过：内容违规');await run('inspect',{nonce:'review-rejected',kind:'publish'});await run('submit',{nonce:'review-rejected',index:0});await new Promise(r=>setTimeout(r,40));assert.equal((await run('result',{nonce:'review-rejected'})).status,'failed');checks++;
    await fixture('发布',''); await run('inspect',{nonce:'changed-editor',kind:'publish'}); await run('submit',{nonce:'changed-editor',index:0}); await new Promise(r=>setTimeout(r,20));
    await js("document.querySelector('#title').value='QA different work';document.querySelector('[role=status]').textContent='发布成功'"); await new Promise(r=>setTimeout(r,30));
    const changedEditor=await run('result',{nonce:'changed-editor'}); assert.equal(changedEditor.status,'unknown'); assert.match(changedEditor.message,/表单内容已变化/); checks+=2;
    await js("document.querySelector('#title').value='QA fixture only';document.querySelector('[role=status]').textContent='发布成功'"); await new Promise(r=>setTimeout(r,30)); assert.equal((await run('result',{nonce:'changed-editor'})).status,'unknown'); checks++;
    await fixture(); await js("document.querySelector('#send').onclick=()=>{document.querySelector('#title').value='';document.querySelector('textarea').value='';document.querySelector('[role=status]').textContent='发布成功'};true"); await run('inspect',{nonce:'valid-empty-reset',kind:'publish'}); await run('submit',{nonce:'valid-empty-reset',index:0}); await new Promise(r=>setTimeout(r,30)); assert.equal((await run('result',{nonce:'valid-empty-reset'})).status,'confirmed'); checks++;
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
    await fixture();await run('inspect',{nonce:'checked-mask',kind:'publish'});
    await js("document.body.insertAdjacentHTML('beforeend','<div id=mask style=\"position:fixed;inset:0;background:white;z-index:999\"></div>')");
    const rejected=await run('submit-checked',{nonce:'checked-mask',index:0});
    assert.equal(rejected.clicked,false);assert.equal(rejected.rejectedBeforeClick,true);assert.match(rejected.error,/遮挡/);assert.equal(await js('document.body.dataset.clicks'),undefined);
    await js("document.getElementById('mask').remove()");assert.equal((await run('submit-checked',{nonce:'checked-mask',index:0})).clicked,true);
    await assert.rejects(run('submit-checked',{nonce:'checked-mask',index:0}));
    await fixture();await assert.rejects(run('submit-checked',{nonce:'missing-nonce',index:0}));
    await run('inspect',{nonce:'checked-change',kind:'publish'});await js("document.querySelector('#title').value='another-title'");assert.equal((await run('submit-checked',{nonce:'checked-change',index:0})).rejectedBeforeClick,true);
    console.log(JSON.stringify({explicitBeforeClickRejectionChecks:8,realPlatformActions:false}));
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
    await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<input placeholder="填写短标题有机会获得更多流量" value="old-invalid-short-title"><div class=input-editor contenteditable=true data-placeholder=添加描述 style="width:500px;height:90px"></div><button onclick="window.didPublish=true">发表</button>'));
    const wechatForm={platform:'wechat',title:'完整标题超过十六字也不能被软件截断1826',body:'原始简介',topics:['健身'],options:{}};
    assert.deepEqual((await sync('fill',wechatForm)).unresolved,[]);
    assert.equal(await js('document.querySelector("input").value'),'');
    assert.equal(await js('document.querySelector(".input-editor").innerText'),wechatForm.title+'\n原始简介\n#健身');
    assert.deepEqual((await sync('fill',{...wechatForm,extras:{短标题:'第十二天'}})).unresolved,[]);
    assert.equal(await js('document.querySelector("input").value'),'第十二天');
    assert.ok((await sync('fill',{...wechatForm,extras:{短标题:'太长的短标题绝不允许软件静默截断1826'}})).unresolved.some(s=>s.includes('16')));
    await js("document.querySelector('.input-editor').textContent='生成中'");
    assert.equal((await sync('progress',{platform:'wechat'})).processing,false);
    assert.equal(await js('!!window.didPublish'),false);
    console.log(JSON.stringify({wechatObservedShortTitleMappingChecks:8,fullTitleRetained:true,realPlatformActions:false}));
    const privacy = (command, input) => runOfficialDOM(win.webContents, publishVisibility, [command, input], 'qa-publish-visibility');
    let privacyChecks = 0;
    // Missing private controls/options cannot fall back to a public submission,
    // including platforms whose real private-post capability is not yet verified.
    for (const platform of ['douyin', 'xiaohongshu', 'wechat', 'bilibili']) {
      await fixture();
      await assert.rejects(privacy('select', { platform, expected: '仅自己可见' })); privacyChecks++;
      await js("document.body.insertAdjacentHTML('beforeend','<select aria-label=可见范围><option>公开</option></select>')");
      await assert.rejects(privacy('select', { platform, expected: '仅自己可见' })); privacyChecks++;
      const unavailable = await sync('fill', { platform, title: 'QA private only', body: '', topics: [], options: { visibility: '仅自己可见' } });
      assert.ok(unavailable.unresolved.some(item => item.includes('visibility'))); assert.ok(!unavailable.filled.includes('visibility')); privacyChecks += 2;
      assert.equal(await js('document.querySelector("select").value'), '公开'); assert.equal(await js('!!document.body.dataset.clicks'), false); privacyChecks += 2;
    }
    await fixture();
    await assert.rejects(privacy('read', { platform: 'douyin' })); privacyChecks++;
    await js(`document.body.insertAdjacentHTML('beforeend', '<div id=privacy><label data-checked=true><input type=checkbox checked>公开</label><label data-checked=false><input type=checkbox>好友可见</label><label data-checked=false><input type=checkbox>仅自己可见</label></div>');document.querySelectorAll('#privacy label').forEach(label=>label.onclick=event=>{event.preventDefault();document.querySelectorAll('#privacy label').forEach(other=>{other.dataset.checked=String(other===label);other.querySelector('input').checked=other===label})})`);
    assert.equal((await privacy('read',{platform:'douyin'})).visibility,'公开');
    assert.equal((await privacy('select',{platform:'douyin',expected:'仅自己可见'})).visibility,'仅自己可见');
    assert.equal(await js('!!document.body.dataset.clicks'),false); privacyChecks += 3;
    await run('inspect',{nonce:'private-radio',kind:'publish'});
    await privacy('select',{platform:'douyin',expected:'公开'});
    await assert.rejects(run('submit',{nonce:'private-radio',index:0})); privacyChecks++;
    await fixture();
    await js(`document.body.insertAdjacentHTML('beforeend','<div class=permission-card-select><div class=d-select-main><div class=d-select-description>公开可见</div></div></div><div class=custom-option><span class=name>仅自己可见</span></div>');document.querySelector('.custom-option').onclick=()=>document.querySelector('.d-select-description').textContent='仅自己可见';true`);
    assert.equal((await privacy('read',{platform:'xiaohongshu'})).visibility,'公开');
    assert.equal((await privacy('select',{platform:'xiaohongshu',expected:'仅自己可见'})).visibility,'仅自己可见'); privacyChecks += 2;
    await run('inspect',{nonce:'private-select',kind:'publish'});
    await js("document.querySelector('.d-select-description').textContent='公开可见'");
    await assert.rejects(run('submit',{nonce:'private-select',index:0})); privacyChecks++;
    await js("document.querySelector('.custom-option').style.display='none'");
    assert.ok((await privacy('select',{platform:'xiaohongshu',expected:'仅自己可见'})).interaction); privacyChecks++;
    await js("document.body.insertAdjacentHTML('beforeend','<div class=permission-card-select>仅自己可见</div>')");
    await assert.rejects(privacy('read',{platform:'xiaohongshu'})); privacyChecks++;
    await fixture();
    await js("document.body.insertAdjacentHTML('beforeend','<span>仅自己可见</span>')");
    await assert.rejects(privacy('read',{platform:'xiaohongshu'})); privacyChecks++;
    console.log(JSON.stringify({ privateVisibilityGuards:privacyChecks, realSubmissions:false }));
    let semanticPrivacyChecks=0;
    for(const platform of ['wechat','bilibili','douyin','xiaohongshu']) {
      await fixture();
      await js(`document.body.insertAdjacentHTML('beforeend','<div role=radiogroup aria-label=可见范围><div role=radio aria-checked=true>公开</div><div role=radio aria-checked=false>仅我可见</div></div>');document.querySelectorAll('[role=radio]').forEach(item=>item.onclick=()=>document.querySelectorAll('[role=radio]').forEach(other=>other.setAttribute('aria-checked',String(other===item))));true`);
      assert.equal((await privacy('read',{platform})).visibility,'公开');
      assert.equal((await privacy('select',{platform,expected:'仅自己可见'})).visibility,'仅自己可见');
      assert.equal(await js('!!document.body.dataset.clicks'),false); semanticPrivacyChecks+=3;
      await js(`document.querySelector('[role=radiogroup]').insertAdjacentHTML('beforeend','<div role=radio aria-checked=false>仅我可见</div>')`);
      await assert.rejects(privacy('select',{platform,expected:'仅自己可见'}));semanticPrivacyChecks++;
    }
    await fixture();
    await js(`document.body.insertAdjacentHTML('beforeend','<div role=combobox tabindex=0 aria-label=作品权限 aria-controls=privacy-list aria-expanded=false aria-valuetext=公开>公开</div><div role=listbox id=privacy-list style=display:none><div role=option>公开</div><div role=option>仅自己可见</div></div>');document.querySelector('[role=combobox]').onclick=()=>{document.querySelector('[role=combobox]').setAttribute('aria-expanded','true');document.querySelector('[role=listbox]').style.display='block'};document.querySelectorAll('[role=option]').forEach(option=>option.onclick=()=>{document.querySelector('[role=combobox]').setAttribute('aria-valuetext',option.innerText);document.querySelector('[role=combobox]').setAttribute('aria-expanded','false');document.querySelector('[role=listbox]').style.display='none'});true`);
    assert.equal((await privacy('select',{platform:'wechat',expected:'仅自己可见'})).opened,true);semanticPrivacyChecks++;
    assert.equal((await privacy('select',{platform:'wechat',expected:'仅自己可见'})).visibility,'仅自己可见');semanticPrivacyChecks++;
    assert.equal(await js('!!document.body.dataset.clicks'),false);semanticPrivacyChecks++;
    await fixture();await js(`document.body.insertAdjacentHTML('beforeend','<div role=combobox aria-label=可见范围 aria-controls=owned aria-valuetext=公开 aria-expanded=true>公开</div><div role=listbox id=unrelated><div role=option>仅自己可见</div></div>')`);
    const unrelated=await privacy('select',{platform:'bilibili',expected:'仅自己可见'});assert.equal(unrelated.waiting,true);assert.equal(unrelated.visibility,'公开');semanticPrivacyChecks+=2;
    console.log(JSON.stringify({explicitSemanticPrivacyChecks:semanticPrivacyChecks,unrelatedMenusIgnored:true,realPlatformWrites:false}));
    await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<meta charset=utf-8><div><div class=cover-qa><img src=before.png><div><span class=title-qa>选择封面</span></div></div><span class=cover-tip-qa>竖封面3:4</span></div><button id=publish>发布</button><div id=designer role=dialog style=display:none>设置竖封面<button id=finish>完成</button></div><div id=optional role=dialog class=verticalSupoortDualCoverModal-qa style=display:none>设置横封面<button id=skip>暂不设置</button></div><script>document.querySelector('.title-qa').onclick=()=>document.querySelector('#designer').style.display='block';document.querySelector('#finish').onclick=()=>{document.querySelector('#designer').style.display='none';document.querySelector('#optional').style.display='block'};document.querySelector('#skip').onclick=()=>{document.querySelector('#optional').style.display='none';document.querySelector('.cover-qa img').src='after.png';document.querySelector('.title-qa').remove()};document.querySelector('#publish').onclick=()=>window.didPublish=true</script>`));
    const cover = command => runOfficialDOM(win.webContents,coverControl,[command,{platform:'douyin',index:1}],'qa-cover-controls');
    const settledCover = async () => { const first=await cover('finish'); if(first.coverConfirmed)return first;await new Promise(resolve=>setTimeout(resolve,650));return cover('finish'); };
    assert.equal((await cover('open')).opened,true);
    assert.equal((await cover('uploaded')).uploadStarted,true);
    assert.equal((await cover('finish')).waiting,true);
    assert.equal((await cover('finish')).waiting,true);
    assert.equal((await settledCover()).coverConfirmed,true);
    assert.equal(await js('!!window.didPublish'),false);
    console.log(JSON.stringify({ coverDesignerConfirmationChecks:6, externalPlatformActions:false }));
    await js(`document.body.innerHTML='<div class=coverControl-qa><div class=cover-qa><img src=same.png></div><div class=controlContainer-qa><span class=cover-tip-qa>竖封面3:4</span></div></div>';true`);
    await withOfficialDOM(win.webContents,'qa-cover-controls',ctx=>ctx.evaluate(()=>{window.__matrixCoverWork={index:1,url:location.href,before:document.querySelector('img').src,uploaded:true,confirmClicked:true};return true}));
    assert.equal((await settledCover()).coverConfirmed,true);
    await withOfficialDOM(win.webContents,'qa-cover-controls',ctx=>ctx.evaluate(()=>{window.__matrixCoverWork={index:1,url:location.href,before:document.querySelector('img').src,uploaded:true,confirmClicked:false};return true}));
    assert.equal((await cover('finish')).coverConfirmed,undefined);
    console.log(JSON.stringify({ stableCoverPreviewAndDedupGuards:2 }));
    for (const hasRole of [true,false]) {
      await js(`document.body.innerHTML='<div class=coverControl-qa><div class=cover-qa><img src=same.png></div><span class=cover-tip-qa>竖封面3:4</span></div><div class="crop animate-hide"><div role=dialog>裁剪封面<button>完成</button></div></div><div id=optional ${hasRole ? 'role=dialog' : ''}><div class=verticalSupoortDualCoverModal-body>设置横封面<button id=skip>暂不设置</button></div></div>';document.querySelector('#skip').onclick=()=>document.querySelector('#optional').style.display='none';true`);
      await withOfficialDOM(win.webContents,'qa-cover-controls',ctx=>ctx.evaluate(()=>{window.__matrixCoverWork={index:1,url:location.href,before:document.querySelector('img').src,uploaded:true,confirmClicked:true};return true}));
      assert.equal((await cover('finish')).waiting,true);
      assert.equal((await settledCover()).coverConfirmed,true);
    }
    console.log(JSON.stringify({nestedOptionalCoverAndClosingAnimationChecks:4,realPlatformActions:false}));
    let resilienceChecks=0;
    await js(`document.body.innerHTML='<div class=coverControl-qa><div class=cover-qa><img src=changed.png></div><span class=cover-tip-qa>竖封面3:4</span></div><div role=dialog style="opacity:0">设置封面<button disabled>完成</button></div>';true`);
    await withOfficialDOM(win.webContents,'qa-cover-controls',ctx=>ctx.evaluate(()=>{window.__matrixCoverWork={index:1,url:location.href,before:'old.png',uploaded:true,confirmClicked:false};return true}));
    assert.equal((await cover('finish')).coverConfirmed,undefined);await new Promise(r=>setTimeout(r,650));assert.equal((await cover('finish')).coverConfirmed,undefined);resilienceChecks+=2;
    // The observed Channels crop panel has its own class; it need not expose
    // role=dialog. A disabled save button during processing is not closure.
    await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<div class="vertical-cover-wrap img-popover-wrap" id=wechat-cover style="width:100px;height:160px"><div class=vertical-img-wrap><img class="vertical-img-size cover-img-vertical" src=before.png width=80 height=80><span>编辑</span></div><div class=tips-wrap><div class=cover-tips>个人主页和分享卡片(3:4)</div></div></div><div class="finder-common-dialog edit-cover-dialog" id=wechat-crop style=display:none>编辑封面<button id=wechat-save>确定</button></div><button id=publish>发表</button><script>document.querySelector('#wechat-cover').onclick=()=>document.querySelector('#wechat-crop').style.display='block';document.querySelector('#wechat-save').onclick=()=>{window.coverSaves=(window.coverSaves||0)+1;document.querySelector('#wechat-save').disabled=true};publish.onclick=()=>window.didPublish=true</script>`));
    const wechatCover=command=>command==='open'?withOfficialDOM(win.webContents,'qa-wechat-cover-closure',context=>openCoverWithInput(context,{platform:'wechat',index:1})):runOfficialDOM(win.webContents,coverControl,[command,{platform:'wechat',index:1}],'qa-wechat-cover-closure');
    assert.equal((await wechatCover('open')).opened,true);assert.equal((await wechatCover('uploaded')).uploadStarted,true);
    assert.equal((await wechatCover('finish')).waiting,true);
    assert.equal((await wechatCover('finish')).coverConfirmed,undefined);
    await new Promise(resolve=>setTimeout(resolve,650));
    assert.equal((await wechatCover('finish')).coverConfirmed,undefined,'Saving Channels cover must wait for the real class-only editor to close');
    assert.equal(await js('window.coverSaves'),1);assert.equal(await js('!!window.didPublish'),false);
    await js("document.querySelector('#wechat-crop').style.display='none'");
    assert.equal((await wechatCover('finish')).waiting,true);await new Promise(resolve=>setTimeout(resolve,650));
    assert.equal((await wechatCover('finish')).coverConfirmed,true);resilienceChecks+=9;
    await js("document.querySelector('#wechat-cover span').remove();document.head.insertAdjacentHTML('beforeend','<style>.vertical-cover-wrap::after{content:\"编辑\"}</style>');document.querySelector('#wechat-save').disabled=false");
    assert.equal((await wechatCover('open')).opened,true,'A CSS-generated Edit affordance must not require an HTML text node');resilienceChecks++;
    await js("document.querySelector('#wechat-crop').style.display='none'");
    await withOfficialDOM(win.webContents,'qa-wechat-cover-closure',ctx=>ctx.evaluate(()=>{delete window.__matrixCoverWork}));
    await js("document.querySelector('#wechat-cover img').className='unrecognized-preview';document.body.insertAdjacentHTML('beforeend','<button id=unrelated-edit>编辑</button>');document.querySelector('#unrelated-edit').onclick=()=>window.wrongEdit=true;true");
    assert.equal((await wechatCover('open')).opened,undefined);assert.equal(await js('!!window.wrongEdit'),false);resilienceChecks+=2;
    await js("document.querySelector('#wechat-crop').style.display='block';document.querySelector('#wechat-crop').insertAdjacentHTML('beforeend','<label>上传封面<input type=file accept=image/jpeg></label>');document.body.insertAdjacentHTML('beforeend','<label>其他图片<input type=file accept=image/png></label>');true");
    await withOfficialDOM(win.webContents,'qa-wechat-cover-upload-scope',ctx=>ctx.evaluate(()=>{window.__matrixCoverWork={index:1};return true}));
    const wechatCoverInput=()=>withOfficialDOM(win.webContents,'qa-wechat-cover-upload-scope',ctx=>ctx.evaluate(uploadControl,[{platform:'wechat',mediaType:'image',count:1,coverIndex:1,describe:true}]));
    assert.equal((await wechatCoverInput()).accept,'image/jpeg','Only the active observed cover dialog owns the cover file input');resilienceChecks++;
    await js("document.querySelector('#wechat-crop').style.display='none'");
    await assert.rejects(wechatCoverInput(),/封面编辑|上传入口/);resilienceChecks++;
    await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<style>#preview{width:120px;height:160px;background:#eee}.operator{display:none}.cover-edit-entry{height:36px;width:100px}</style><div class=cover-plugin-preview><div class="cover cover--ai-layout"><div id=preview class="default column default--ai-cover-layout"><img src=before.png><div class="operator default column center"><div class=cover-edit-stack><div class=cover-edit-entry><span>编辑封面</span></div></div></div></div><button id=ai>一键生成</button></div></div><div role=dialog id=designer style=display:none>封面裁剪<button>完成</button></div><script>preview.onmouseenter=()=>document.querySelector('.operator').style.display='flex';document.querySelector('.cover-edit-entry').onclick=()=>{designer.style.display='block';window.editClicks=(window.editClicks||0)+1};ai.onclick=()=>window.aiClicks=true;</script>`));
    const xhsCover=()=>runOfficialDOM(win.webContents,coverControl,['open',{platform:'xiaohongshu',index:1}],'qa-new-xhs-cover');
    assert.ok((await xhsCover()).hover);assert.equal(await js('window.editClicks'),undefined);resilienceChecks+=2;
    await js("document.querySelector('#preview').dispatchEvent(new MouseEvent('mouseenter'))");
    assert.equal((await xhsCover()).opened,true);assert.equal(await js('window.editClicks'),1);assert.equal(await js('!!window.aiClicks'),false);resilienceChecks+=3;
    await js("delete window.editClicks;const mask=document.createElement('div');mask.style='position:fixed;inset:0;background:white;z-index:999';document.body.append(mask)");
    await withOfficialDOM(win.webContents,'qa-new-xhs-cover',ctx=>ctx.evaluate(()=>{delete window.__matrixCoverWork}));
    await assert.rejects(xhsCover(),/遮挡/);assert.equal(await js('window.editClicks'),undefined);resilienceChecks+=2;
    await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<input placeholder=标题><div id=desc-label>添加视频描述，可添加话题</div><div contenteditable=plaintext-only role=textbox aria-labelledby=desc-label></div><div style="opacity:0"><div contenteditable=true data-placeholder=描述></div></div><input placeholder=验证码><input placeholder=话题搜索>'));
    const semanticBody=await sync('fill',{platform:'wechat',title:'QA title',body:'QA body',topics:[],options:{}});
    assert.deepEqual(semanticBody.unresolved,[]);assert.ok(semanticBody.filled.includes('body'));assert.equal(await js('document.querySelector("[contenteditable]").innerText'),'QA body');assert.equal(await js('document.querySelector("input[placeholder=验证码]").value'),'');resilienceChecks+=4;
    await js("document.body.insertAdjacentHTML('beforeend','<input type=password value=never-export-this><input name=secret value=never-export-that>')");
    const described=await sync('describe',{});assert.ok(described.controls.length);assert.ok(!JSON.stringify(described).includes('never-export'));assert.ok(!described.controls.some(c=>/验证码|secret/.test(c.label)));resilienceChecks+=3;
    const preflight=(command,input)=>runOfficialDOM(win.webContents,pageAction,[command,input],'qa-preflight-resilience');
    await fixture();await preflight('inspect',{nonce:'preflight',kind:'publish'});assert.equal((await preflight('validate',{nonce:'preflight',index:0})).clicked,false);
    await js("const mask=document.createElement('div');mask.style='position:fixed;inset:0;background:white;z-index:999';document.body.append(mask)");
    await assert.rejects(preflight('validate',{nonce:'preflight',index:0}),/遮挡/);assert.equal(await js('document.body.dataset.clicks'),undefined);resilienceChecks+=3;
    console.log(JSON.stringify({coverSettlingSemanticBodyAndPreflightChecks:resilienceChecks,realPlatformActions:false}));
    await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<input class=d-text value="QA private title" style="width:500px;height:30px"><div class=permission-card-select><div class=d-select-description>仅自己可见</div></div><div class=custom-option><div class=name>仅自己可见</div></div>'));
    const settleVisibility = () => runOfficialDOM(win.webContents,publishVisibility,['settle',{platform:'xiaohongshu',expected:'仅自己可见',expectedTitle:'QA private title'}],'qa-visibility-settle');
    const dismiss=await settleVisibility();assert.equal(dismiss.interactionKind,'dismiss-visibility');assert.equal(dismiss.visibility,'仅自己可见');assert.equal(await js('document.querySelector("input").value'),'QA private title');
    await js('document.querySelector("input").value="other title"');await assert.rejects(settleVisibility(),/原作品标题/);
    await js('document.querySelector("input").value="QA private title";document.querySelector(".custom-option").style.display="none"');assert.equal((await settleVisibility()).interaction,undefined);
    await js('document.querySelector(".custom-option").style.display="block";const mask=document.createElement("div");mask.style="position:fixed;inset:0;background:white;z-index:999";document.body.append(mask)');await assert.rejects(settleVisibility(),/遮挡/);
    console.log(JSON.stringify({privateMenuDismissalTargetChecks:6,realPlatformActions:false}));
    await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<style>#preview{width:120px;height:160px;background:#eee}.operator{display:none}#preview:hover .operator{display:flex}.cover-edit-entry{width:100px;height:36px}</style><div class=cover-plugin-preview><div class=cover><div id=preview class=default><div class="operator default"><div class=cover-edit-entry>编辑封面</div></div></div></div></div><div role=dialog id=designer style=display:none>封面裁剪<button>完成</button></div><script>document.querySelector(".cover-edit-entry").onclick=()=>{designer.style.display="block";window.editClicks=(window.editClicks||0)+1}</script>'));
    const focusTrace=[],originalSend=win.webContents.debugger.sendCommand.bind(win.webContents.debugger);
    win.webContents.debugger.sendCommand=(method,params)=>{if(method==='Emulation.setFocusEmulationEnabled')focusTrace.push(params.enabled);return originalSend(method,params)};
    await withOfficialDOM(win.webContents,'qa-hidden-cover',async({evaluate,send})=>{
      assert.equal(await evaluate(()=>document.hasFocus()),true);
      const state=await evaluate(coverControl,['open',{platform:'xiaohongshu',index:1}]);assert.ok(state.hover);
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:500,y:500});
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',...state.hover});await new Promise(r=>setTimeout(r,150));
      assert.equal((await evaluate(coverControl,['open',{platform:'xiaohongshu',index:1}])).opened,true);
    },{backgroundFocus:true});
    assert.equal(await js('window.editClicks'),1);assert.deepEqual(focusTrace,[true,false]);assert.equal(win.isVisible(),false);assert.equal(win.isFocused(),false);
    win.webContents.debugger.sendCommand=originalSend;
    console.log(JSON.stringify({hiddenWindowTrustedCoverInteractionChecks:7,windowShown:false,realPlatformActions:false}));
    await fixture(); await js('document.body.insertAdjacentHTML("beforeend", "<input placeholder=标题>")');
    const extraResult = await sync('fill', { title: '', body: '', topics: [], options: {}, extras: { 音乐: '指定曲目', 允许评论: '关闭', 合集: '' } });
    assert.equal(extraResult.unresolved.length, 2); assert.ok(extraResult.unresolved.some(text => text.includes('指定曲目'))); assert.ok(extraResult.unresolved.some(text => text.includes('关闭'))); assert.equal(extraResult.submitted, false);
    console.log(JSON.stringify({ advancedFieldNotSilentlyDroppedChecks: 4 }));
    await fixture(); await js('document.body.insertAdjacentHTML("beforeend", "<label><input type=checkbox>允许评论</label>")');
    assert.ok((await sync('fill', { extras: { 允许评论: '开启' } })).filled.includes('允许评论')); assert.equal(await js('document.querySelector("input[type=checkbox]").checked'), true);
    assert.ok((await sync('fill', { extras: { 允许评论: '关闭' } })).filled.includes('允许评论')); assert.equal(await js('document.querySelector("input[type=checkbox]").checked'), false);
    await js('document.body.insertAdjacentHTML("beforeend", "<label><input type=checkbox>允许评论</label>")');
    assert.ok((await sync('fill', { extras: { 允许评论: '开启' } })).unresolved.some(value => value.includes('允许评论'))); assert.equal(await js('[...document.querySelectorAll("input[type=checkbox]")].some(el=>el.checked)'), false);
    assert.equal(await js('document.body.dataset.clicks'), undefined);
    console.log(JSON.stringify({ exactBooleanControlChecks: 7 }));
    await fixture(); assert.equal((await sync('progress', {})).ready, true); assert.equal((await sync('progress', {})).uploadPercent, undefined);
    await js('document.body.insertAdjacentHTML("beforeend", "<progress value=35 max=100></progress>")');
    assert.equal((await sync('progress', {})).uploadPercent, 35); assert.equal((await sync('progress', {})).ready, false);
    await js('document.querySelector("progress").value=100'); assert.equal((await sync('progress', {})).ready, true);
    await js('document.querySelector("[role=status]").textContent="上传失败"'); assert.equal((await sync('progress', {})).ready, false); assert.equal((await sync('progress', {})).uploadError, '上传失败');
    await js('document.querySelector("[role=status]").textContent=""; document.querySelector("progress").removeAttribute("value")'); assert.equal((await sync('progress', {})).uploadPercent, undefined);
    await fixture();await js('document.querySelector("#send").disabled=true');
    assert.equal((await sync('progress', {})).ready,false);assert.equal((await sync('progress', {})).coverReady,false);
    await js('document.querySelector("[role=status]").textContent="上传完成"');
    assert.equal((await sync('progress', {})).ready,false);assert.equal((await sync('progress', {})).coverReady,true);
    await js('document.querySelector("[role=status]").textContent="正在转码"');assert.equal((await sync('progress', {})).coverReady,false);
    await js('document.querySelector("[role=status]").textContent="上传失败"');assert.equal((await sync('progress', {})).coverReady,false);
    await js('document.querySelector("[role=status]").textContent="";document.querySelector("#title").remove();document.querySelector("textarea").remove()');assert.equal((await sync('progress', {})).coverReady,false);
    console.log(JSON.stringify({ publishProgressAssertions: 15, fabricatedPercentages: false, coverReadinessIsNotSubmitReadiness:true }));
    await fixture('下架', '下架成功'); await js('document.querySelector("form").insertAdjacentHTML("afterbegin","<h1>QA作品</h1>")');
    await assert.rejects(run('inspect', { kind: 'withdraw', nonce: 'wrong', expectedTitle: '其他作品' }));
    await run('inspect', { kind: 'withdraw', nonce: 'withdraw', expectedTitle: 'QA作品' }); await run('submit', { nonce: 'withdraw', index: 0 }); await new Promise(r => setTimeout(r, 80)); assert.equal((await run('result', { nonce: 'withdraw' })).status, 'confirmed');
    await fixture('删除', '删除成功'); await js('document.querySelector("form").insertAdjacentHTML("afterbegin","<h1>QA作品</h1>")'); await assert.rejects(run('inspect', { kind: 'withdraw', nonce: 'no-delete', expectedTitle: 'QA作品' }));
    await fixture('下架', '下架失败'); await js('document.querySelector("form").insertAdjacentHTML("afterbegin","<h1>QA作品</h1>")'); await run('inspect', { kind: 'withdraw', nonce: 'failed-withdraw', expectedTitle: 'QA作品' }); await run('submit', { nonce: 'failed-withdraw', index: 0 }); await new Promise(r => setTimeout(r, 80)); assert.equal((await run('result', { nonce: 'failed-withdraw' })).status, 'failed');
    console.log(JSON.stringify({ withdrawalGuardChecks: 4, realWorksChanged: false }));
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<meta charset="utf-8"><input placeholder="标题"><textarea placeholder="简介"></textarea><div style="height:50px">上传视频<input id="upload" type="file" accept="video/mp4" style="display:none"></div><xhs-publish-btn></xhs-publish-btn><script>const host=document.querySelector('xhs-publish-btn');const root=host.attachShadow({mode:'closed'});root.innerHTML='<button id="publish">发布</button><div role="status"></div>';root.querySelector('button').onclick=()=>{document.body.dataset.clicks=String(Number(document.body.dataset.clicks||0)+1);root.querySelector('[role=status]').textContent='发布成功'}</script>`));
    let closedChecks = 0;
    const closedRun = (command,input) => runOfficialDOM(win.webContents,pageAction,[command,input],'qa-closed-publish');
    const closedForm = await runOfficialDOM(win.webContents,publishForm,['fill',{ title:'Closed QA',body:'Body QA',topics:[],options:{},platform:'xiaohongshu' }],'qa-closed-form');
    assert.deepEqual(closedForm.filled,['title','body']); assert.equal((await runOfficialDOM(win.webContents,publishForm,['progress',{}],'qa-closed-form')).ready,true); closedChecks += 2;
    assert.equal((await closedRun('inspect',{nonce:'closed',kind:'publish'})).candidates.length,1); closedChecks++;
    await closedRun('submit',{nonce:'closed',index:0}); await new Promise(r=>setTimeout(r,100));
    assert.equal((await closedRun('result',{nonce:'closed'})).status,'confirmed'); assert.equal(await js('document.body.dataset.clicks'),'1'); await assert.rejects(closedRun('submit',{nonce:'closed',index:0})); closedChecks += 3;
    const control = await withOfficialDOM(win.webContents,'qa-upload-control',ctx=>ctx.evaluate(uploadControl,[{mediaType:'video',count:1,describe:true}]));
    assert.equal(control.matched,true); assert.equal(win.webContents.debugger.isAttached(),true); closedChecks += 2;
    // DOM replacement invalidates old object IDs; a fresh lookup works.
    await js("document.querySelector('#upload').outerHTML='<input id=upload type=file accept=video/mp4 style=display:none>'");
    assert.equal((await withOfficialDOM(win.webContents,'qa-upload-control',ctx=>ctx.evaluate(uploadControl,[{mediaType:'video',count:1,describe:true}]))).matched,true); closedChecks++;
    await js("document.body.insertAdjacentHTML('beforeend','<div class=semi-upload>上传封面<input type=file accept=image/png class=semi-upload-hidden-input style=display:none><input type=file accept=image/png class=semi-upload-hidden-input-replace style=display:none><div class=semi-upload-drag-area-main-text>点击上传文件或拖拽文件到这里</div></div>')");
    await withOfficialDOM(win.webContents,'qa-upload-control',async ctx=>{await ctx.evaluate(()=>{window.__matrixCoverWork={index:1}});const matched=await ctx.evaluate(uploadControl,[{mediaType:'image',count:1,coverIndex:1,describe:true}]);assert.equal(matched.matched,true);}); closedChecks++;
    const selectedImage = path.resolve('desktop/assets/icon.png'), stat = fs.statSync(selectedImage), store = createPublishMediaStore(path.join(profile,'publish-media'), require('electron').nativeImage);
    const saved = await store.save('qa-owner',{mediaType:'image',paths:[selectedImage],files:[{name:'icon.png',size:stat.size,modified:stat.mtimeMs}]},[]);
    assert.match(saved.thumbnail,/^data:image\/jpeg;base64,/); assert.ok(saved.thumbnail.length<120030); closedChecks += 2;
    console.log(JSON.stringify({ closedComponentAndPreviewChecks:closedChecks,externalNetworkOrPlatformActions:false }));
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<meta charset=utf-8><div class=permission-card-select><div class=d-select-main><div class=d-select-description>公开可见</div></div></div><x-changing-control></x-changing-control><script>function renew(){const old=document.querySelector('x-changing-control');const next=document.createElement('x-changing-control');next.attachShadow({mode:'closed'}).innerHTML='<span>current component</span>';old.replaceWith(next)}renew();document.querySelector('.d-select-main').onclick=()=>{renew();const option=document.createElement('div');option.className='custom-option';option.innerHTML='<span class=name>仅自己可见</span>';option.onclick=()=>{document.querySelector('.d-select-description').textContent='仅自己可见';renew()};document.body.append(option)}</script>`));
    await withOfficialDOM(win.webContents,'qa-fresh-privacy-roots',async ctx=>{
      assert.ok((await ctx.evaluate(publishVisibility,['select',{platform:'xiaohongshu',expected:'仅自己可见'}])).interaction);
      await ctx.evaluate(()=>{document.querySelector('.d-select-main').click();return true});
      assert.equal(await ctx.evaluate(roots=>roots.length===1&&roots[0].host.isConnected),true);
      await ctx.evaluate(publishVisibility,['select',{platform:'xiaohongshu',expected:'仅自己可见'}]);
      assert.equal((await ctx.evaluate(publishVisibility,['read',{platform:'xiaohongshu'}])).visibility,'仅自己可见');
    });
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<div style="height:100px">上传视频<input type=file accept=".mp4,.mov" style="display:none"><input id=real-upload type=file accept=".mp4,.mov"><input type=file accept=.txt></div>'));
    const biliUpload = () => withOfficialDOM(win.webContents,'qa-bili-uploader',ctx=>ctx.evaluate(uploadControl,[{platform:'bilibili',mediaType:'video',count:1,describe:true}]));
    await assert.rejects(biliUpload(),/无法唯一识别/);
    await js("document.querySelector('input').style.display='inline-block'"); await assert.rejects(biliUpload(),/无法唯一识别/);
    await js("document.querySelectorAll('input[type=file]').forEach(el=>el.style.display='none')"); await assert.rejects(biliUpload(),/无法唯一识别/);
    console.log(JSON.stringify({dynamicClosedComponentPrivacyChecks:3,bilibiliDuplicateUploadGuards:3,realPlatformActions:false}));
    let chooserChecks=0;
    const biliChooser=()=>withOfficialDOM(win.webContents,'qa-bili-chooser',ctx=>resolveBilibiliUpload(win.webContents,ctx,{timeoutMs:150}));
    await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<div class=bcc-upload-wrapper style="height:100px"><div class="upload-btn no-events">上传视频</div><input id=actual-file type=file accept=.mp4 style=display:none></div><input id=decoy type=file accept=.mp4><script>document.querySelector(".bcc-upload-wrapper").onclick=e=>{if(e.target.tagName!=="INPUT")document.querySelector("#actual-file").click()}</script>'));
    const target=await biliChooser();assert.ok(target.backendNodeId);chooserChecks++;
    const actual=await withOfficialDOM(win.webContents,'qa-bili-chooser',async({send})=>{const{object}=await send('DOM.resolveNode',target);return send('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:'function(){return this.id}',returnByValue:true})});
    assert.equal(actual.result.value,'actual-file');chooserChecks++;
    assert.equal(await js('document.querySelector("#decoy").files.length'),0);chooserChecks++;
    await js('document.querySelector(".bcc-upload-wrapper").onclick=null');await assert.rejects(biliChooser(),/未捕获/);assert.equal(win.webContents.debugger.listenerCount('message'),0);chooserChecks+=2;
    await js('document.body.insertAdjacentHTML("beforeend",document.querySelector(".bcc-upload-wrapper").outerHTML)');await assert.rejects(biliChooser(),/不唯一/);assert.equal(win.webContents.debugger.listenerCount('message'),0);chooserChecks+=2;
    console.log(JSON.stringify({bilibiliRealFileChooserResolutionChecks:chooserChecks,filesTransferred:0,realPlatformActions:false}));
    const mediaProgress=()=>withOfficialDOM(win.webContents,'qa-media-step',ctx=>ctx.evaluate(publishForm,['progress',{platform:'douyin'}]));
    await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<input placeholder=标题><textarea placeholder=简介></textarea><div role=progressbar aria-valuenow=45 style="height:12px;width:200px"></div><button disabled>发布</button><div class=ant-form-item-explain-error>请填写标题</div>'));
    let mediaState=await mediaProgress();assert.equal(mediaState.processing,true);assert.equal(mediaState.mediaReady,false);assert.equal(mediaState.uploadPercent,45);assert.deepEqual(mediaState.validationErrors,['请填写标题']);
    await js("document.querySelector('[role=progressbar]').setAttribute('aria-valuenow','100')");
    mediaState=await mediaProgress();assert.equal(mediaState.mediaReady,true,'Upload completion does not depend on filling a required title first');assert.equal(mediaState.ready,false);assert.equal(mediaState.processing,false);
    await js("document.querySelector('[role=progressbar]').remove()");
    mediaState=await mediaProgress();assert.equal(mediaState.mediaReady,false);assert.equal(mediaState.processing,false);assert.equal(mediaState.observation.state,'waiting_media');
    await js("document.body.insertAdjacentHTML('beforeend','<div role=status>上传完成</div>')");assert.equal((await mediaProgress()).mediaReady,true);
    await js("document.querySelector('[role=status]').remove();document.body.insertAdjacentHTML('beforeend','<div role=progressbar style=height:12px;width:200px></div>')");
    mediaState=await mediaProgress();assert.equal(mediaState.processing,true);assert.equal(mediaState.mediaReady,false);assert.equal(mediaState.uploadPercent,undefined);
    console.log(JSON.stringify({separateUploadAndSubmitReadinessChecks:14,preciseOfficialFieldErrors:true,noInventedProgress:true,realPlatformActions:false}));
    // Real DOM text progress is not necessarily an ARIA progressbar. Never
    // read authored titles as progress, round incomplete progress to 100, or
    // let contradictory/indeterminate official indicators authorize a fill.
    await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<input placeholder=标题><textarea placeholder=简介></textarea><div class=upload-panel><span class=progress-text>37%</span></div><button disabled>发布</button>'));
    let textProgress=await mediaProgress();assert.equal(textProgress.uploadPercent,37);assert.equal(textProgress.processing,true);assert.equal(textProgress.mediaReady,false);
    await js('document.querySelector(".progress-text").textContent="99.9%"');textProgress=await mediaProgress();assert.equal(textProgress.uploadPercent,99);assert.equal(textProgress.mediaReady,false);
    await js('document.querySelector(".progress-text").textContent="100%";document.body.insertAdjacentHTML("beforeend","<span class=processing-tip>正在转码</span>")');textProgress=await mediaProgress();assert.equal(textProgress.uploadPercent,100);assert.equal(textProgress.processing,true);assert.equal(textProgress.mediaReady,false);
    await js('document.querySelector(".processing-tip").remove()');textProgress=await mediaProgress();assert.equal(textProgress.mediaReady,true);assert.equal(textProgress.ready,false);
    await js('document.body.insertAdjacentHTML("beforeend","<progress max=100 value=28></progress>")');textProgress=await mediaProgress();assert.equal(textProgress.uploadPercent,undefined);assert.equal(textProgress.processing,true);assert.equal(textProgress.mediaReady,false);
    await js('document.querySelector("progress").value=100');textProgress=await mediaProgress();assert.equal(textProgress.uploadPercent,100);assert.equal(textProgress.mediaReady,true);
    await js('document.querySelector(".progress-text").textContent="120%"');textProgress=await mediaProgress();assert.equal(textProgress.uploadPercent,undefined);assert.equal(textProgress.mediaReady,false);
    await js('document.querySelector("progress").remove();document.querySelector(".progress-text").remove();document.querySelector("textarea").value="上传中 10%";document.body.insertAdjacentHTML("beforeend","<div>100%</div>")');textProgress=await mediaProgress();assert.equal(textProgress.uploadPercent,undefined);assert.equal(textProgress.mediaReady,false);
    await js('document.querySelector("button").disabled=false;document.body.insertAdjacentHTML("beforeend","<div role=progressbar aria-valuemin=0 aria-valuemax=100 style=height:12px;width:200px></div>")');
    for(const invalid of [-1,101]){await js('document.querySelector("[role=progressbar]").setAttribute("aria-valuenow",'+JSON.stringify(String(invalid))+')');textProgress=await mediaProgress();assert.equal(textProgress.processing,true);assert.equal(textProgress.mediaReady,false);assert.equal(textProgress.ready,false);assert.equal(textProgress.uploadPercent,undefined);}
    console.log(JSON.stringify({officialTextProgressChecks:27,conflictingAndInvalidProgressBlocked:true,transcodingAfter100BlocksFill:true,authoredTextNotProgress:true,realPlatformActions:false}));
    let resultChecks = 0;
    const submitted = new Date(); submitted.setSeconds(30, 0);
    const display = new Date(submitted.getTime() + 8 * 3600000).toISOString().slice(0,16).replace('T',' ');
    const receipt = { platform:'xiaohongshu', expectedTitle:'QA result', summary:'QA result\nbody', visibility:'仅自己可见', createdAt:submitted.toISOString() };
    const note = (title='QA result', date=display, badge='仅自己可见') => `<article class="note-card"><div class="note-card__title">${title}</div><div class="permission_msg">${badge}</div><div>${date}</div></article>`;
    const resultFixture = async (html, data=receipt, url='https://creator.xiaohongshu.com/new/note-manager') => {
      await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<meta charset=utf-8>'+html));
      // Local synthetic DOM only; no real network or platform action.
      return js(`(()=>{const location=new URL(${JSON.stringify(url)});return (${publishResult.toString()})(${JSON.stringify(data)})})()`);
    };
    assert.equal((await resultFixture(note())).matched,true);resultChecks++;
    assert.equal((await resultFixture(note(),{...receipt,expectedTitle:undefined})).matched,true);resultChecks++;
    assert.equal((await resultFixture(note('old title'))).matched,false);resultChecks++;
    assert.equal((await resultFixture(note('QA result',display.replace(/^\d{4}/,'2000')))).matched,false);resultChecks++;
    assert.equal((await resultFixture(note()+note())).ambiguous,true);resultChecks++;
    assert.equal((await resultFixture(note('QA result',display,'公开'))).matched,false);resultChecks++;
    assert.equal((await resultFixture(note(),receipt,'https://creator.xiaohongshu.com/publish/publish')).matched,false);resultChecks++;
    assert.equal((await resultFixture(note(),receipt,'https://example.com/new/note-manager')).matched,false);resultChecks++;
    assert.equal((await resultFixture('<div style="display:none">'+note()+'</div>')).matched,false);resultChecks++;
    assert.equal((await resultFixture(note().replace('</article>','<div>发布失败</div></article>'))).matched,false);resultChecks++;
    assert.equal((await resultFixture('<h1>发布成功</h1>')).matched,false);resultChecks++;
    const dy = `<div class="video-card-content-fixture"><div class="video-card-info-fixture"><div class="info-title-text-fixture">QA result #topic</div><div>${display.replace(/(\d{4})-(\d{2})-(\d{2})/,'$1年$2月$3日')}</div></div><span><i></i>私密</span></div>`;
    const dyReceipt={...receipt,platform:'douyin'};
    assert.equal((await resultFixture(dy,dyReceipt,'https://creator.douyin.com/creator-micro/content/manage')).matched,true);resultChecks++;
    assert.equal((await resultFixture(dy.replace('私密','公开'),dyReceipt,'https://creator.douyin.com/creator-micro/content/manage')).matched,false);resultChecks++;
    const combinedDy=dy.replace('QA result #topic','QA result QA description.'),combinedReceipt={...dyReceipt,summary:'QA result\nQA description.\u200b'};
    const dyUrl='https://creator.douyin.com/creator-micro/content/manage';
    assert.equal((await resultFixture(combinedDy,combinedReceipt,dyUrl)).matched,true,'Combined official title/description must match the complete original form');resultChecks++;
    for(const html of [combinedDy.replace('QA description.','QA different description.'),combinedDy.replace('QA description.','QA description. extra'),combinedDy.replace('QA description.','QA description'),'<div style="display:none">'+combinedDy+'</div>']){assert.notEqual((await resultFixture(html,combinedReceipt,dyUrl)).matched,true);resultChecks++;}
    assert.notEqual((await resultFixture(combinedDy,{...combinedReceipt,summary:'Different title\nQA result QA description.'},dyUrl)).matched,true);resultChecks++;
    const pendingDy=await resultFixture(combinedDy.replace('</div><span><i>','<span class=status>等待平台审核</span></div><span><i>'),combinedReceipt,dyUrl);assert.equal(pendingDy.pendingReview,true);assert.equal(pendingDy.matched,false);assert.equal(pendingDy.evidence.statusText,'等待平台审核');resultChecks+=3;
    const topicReceipt={...combinedReceipt,summary:'QA result\nQA description.\n#topic'},topicDy=combinedDy.replace('QA description.','QA description.#topic');
    assert.equal((await resultFixture(topicDy,topicReceipt,dyUrl)).matched,true);resultChecks++;
    for(const label of ['QA description.#different','QA description.#topic extra','QA different description.#topic']){assert.notEqual((await resultFixture(topicDy.replace('QA description.#topic',label),topicReceipt,dyUrl)).matched,true);resultChecks++;}
    const wcReceipt={...receipt,platform:'wechat',visibility:'公开',summary:'短标题\nQA result\nQA body',expectedContent:'QA result\nQA body'};
    const wc=`<header>视频管理</header><div class=work-row><div><span>QA result QA body</span></div><div>${display}</div><span>评论管理</span><span>修改描述和封面</span><span>可见权限</span></div>`;
    const wcUrl='https://channels.weixin.qq.com/platform/post/list',biliUrl='https://member.bilibili.com/platform/upload-manager/article';
    assert.equal((await resultFixture(wc,wcReceipt,wcUrl)).matched,true);resultChecks++;
    assert.equal((await resultFixture(wc,{...wcReceipt,expectedContent:undefined},wcUrl)).matched,true,'Old receipts can match their saved description without a new submit');resultChecks++;
    for(const [html,reason] of [[wc+wc,'ambiguous'],[wc.replace(display,'2000-01-01 00:00'),'time_mismatch'],[wc.replace('QA body','unrelated body'),'not_found'],['<div style="display:none">'+wc+'</div>','not_found'],[wc.replace('修改描述和封面','审核中 修改描述和封面'),'processing']]){assert.equal((await resultFixture(html,wcReceipt,wcUrl)).reason,reason);resultChecks++;}
    assert.equal((await resultFixture(wc,{...wcReceipt,visibility:'仅自己可见'},wcUrl)).reason,'visibility_mismatch');resultChecks++;
    assert.equal((await resultFixture(wc,wcReceipt,'https://channels.weixin.qq.com/platform/post/create')).reason,'wrong_page');resultChecks++;
    const biliReceipt={...receipt,platform:'bilibili'},bili=`<div class=article-card><a class=title href="https://www.bilibili.com/video/BV1QaOnly">QA result</a><div>${display}</div><span class=status>已发布</span><span>仅自己可见</span><button>编辑</button><button>删除</button></div>`;
    assert.equal((await resultFixture(bili,biliReceipt,biliUrl)).matched,true);resultChecks++;
    const pendingCard=await resultFixture(bili.replace('已发布','审核中'),biliReceipt,biliUrl);assert.equal(pendingCard.reason,'processing');assert.equal(pendingCard.pendingReview,true);assert.equal(pendingCard.matched,false);assert.equal(pendingCard.evidence.statusText,'审核中');resultChecks+=4;
    const waitingCard=await resultFixture(bili.replace('已发布','等待平台审核'),biliReceipt,biliUrl);assert.equal(waitingCard.pendingReview,true);assert.equal(waitingCard.rejected,undefined);resultChecks+=2;
    const transcodingCard=await resultFixture(bili.replace('已发布','转码中'),biliReceipt,biliUrl);assert.equal(transcodingCard.reason,'processing');assert.equal(transcodingCard.pendingReview,undefined);resultChecks+=2;
    const rejectedWork=await resultFixture(bili.replace('已发布','审核未通过'),biliReceipt,biliUrl);assert.equal(rejectedWork.rejected,true);assert.equal(rejectedWork.matched,false);resultChecks+=2;
    assert.equal((await resultFixture('<div>全部稿件 0 已发布 0</div>',biliReceipt,biliUrl)).reason,'not_found');resultChecks++;
    assert.equal((await resultFixture(bili+bili,biliReceipt,biliUrl)).reason,'ambiguous');resultChecks++;
    assert.equal((await resultFixture(bili.replace('仅自己可见','公开'),biliReceipt,biliUrl)).reason,'visibility_mismatch');resultChecks++;
    const exactFailure=await resultFixture(bili.replace('已发布','审核未通过：训练动作缺少安全说明'),biliReceipt,biliUrl);
    assert.match(exactFailure.message,/训练动作缺少安全说明/);assert.equal(exactFailure.evidence.statusText,'审核未通过：训练动作缺少安全说明');resultChecks+=2;
    const caption=bili.replace('</div>','<p>本视频介绍审核中、草稿和发布失败等状态</p></div>');
    assert.equal((await resultFixture(caption,biliReceipt,biliUrl)).matched,true,'Explicit published status must not be overridden by caption words');resultChecks++;
    const conflict=bili.replace('已发布</span>','已发布</span><span role=status>审核未通过</span>');assert.equal((await resultFixture(conflict,biliReceipt,biliUrl)).reason,'ambiguous');resultChecks++;
    const precisionReceipt={...biliReceipt,createdAt:new Date(submitted.getTime()-5*60000).toISOString()},seconds=new Date(Date.parse(precisionReceipt.createdAt)+8*3600000).toISOString().slice(0,19).replace('T',' ');
    const precise=await resultFixture(bili.replace(display,seconds),precisionReceipt,biliUrl);assert.equal(precise.evidence.publishedAt,precisionReceipt.createdAt);assert.equal(precise.evidence.timePrecision,'second');resultChecks+=2;
    const earlierSeconds=new Date(Date.parse(precisionReceipt.createdAt)-10000+8*3600000).toISOString().slice(0,19).replace('T',' ');
    assert.equal((await resultFixture(bili.replace(display,earlierSeconds),precisionReceipt,biliUrl)).reason,'time_mismatch','Second-level old work cannot borrow minute-level tolerance');resultChecks++;
    assert.equal((await resultFixture(note('QA result','2026-02-31 12:00'),{...receipt,createdAt:'2026-03-03T04:00:00Z'})).matched,false,'Calendar rollover is not a valid official publication time');resultChecks++;
    const byPlatform=[
      [note().replace('</article>','<span role=status>审核失败（QA具体原因）</span></article>'),receipt,'https://creator.xiaohongshu.com/new/note-manager'],
      [dy.replace(/<\/div>$/,'<span role=status>审核失败（QA具体原因）</span></div>'),dyReceipt,'https://creator.douyin.com/creator-micro/content/manage'],
      [wc.replace(/<\/div>$/,'<span role=status>审核失败（QA具体原因）</span></div>'),wcReceipt,wcUrl],
      [bili.replace('已发布','审核失败（QA具体原因）'),biliReceipt,biliUrl],
    ];
    for(const [html,data,url]of byPlatform){const value=await resultFixture(html,data,url);assert.equal(value.rejected,true);assert.match(value.message,/QA具体原因/);resultChecks+=2;}
    assert.equal((await resultFixture(note().replace('</article>','<p>发布失败排查教程</p></article>'))).reason,'status_unresolved');resultChecks++;
    assert.equal((await resultFixture(bili.replace('已发布','待确认说明'),biliReceipt,biliUrl)).reason,'status_unresolved');resultChecks++;
    const overlayCard=bili.replace('<span class=status>已发布</span>','<div class=cover-state><span>仅自己可见</span><span>00:00:32</span></div>');
    for(const label of ['00:32','00:00:32','仅自己可见00:00:32','仅自己可见 00:32','私密 01:59:59']){
      const value=await resultFixture(overlayCard.replace('<span>仅自己可见</span><span>00:00:32</span>',label),biliReceipt,biliUrl);
      assert.equal(value.matched,true,'An exact Bili thumbnail duration is not an unknown review state');resultChecks++;
    }
    for(const label of ['待确认说明 00:32','定时发布 00:32','审核中 00:32','审核未通过 00:32','仅自己可见 00:99','仅自己可见 00:32 额外状态']){
      const value=await resultFixture(overlayCard.replace('<span>仅自己可见</span><span>00:00:32</span>',label),biliReceipt,biliUrl);
      assert.equal(value.matched,false,'Other state labels cannot borrow the duration exemption');resultChecks++;
    }
    const unknownOverlay=await resultFixture(overlayCard.replace('<span>仅自己可见</span><span>00:00:32</span>','尚未识别的审核状态'),biliReceipt,biliUrl);
    assert.deepEqual(unknownOverlay.diagnostic.statusLabels,['尚未识别的审核状态']);resultChecks++;
    assert.equal((await resultFixture(overlayCard+overlayCard,biliReceipt,biliUrl)).reason,'ambiguous');resultChecks++;
    assert.equal((await resultFixture(overlayCard.replaceAll('仅自己可见','公开'),biliReceipt,biliUrl)).reason,'visibility_mismatch');resultChecks++;
    assert.equal((await resultFixture(overlayCard.replace(display,'2000-01-01 00:00'),biliReceipt,biliUrl)).reason,'time_mismatch');resultChecks++;
    const datedStateCard=overlayCard.replace(`<div>${display}</div>`,`<span class=publication-state>${display}</span>`);
    assert.equal((await resultFixture(datedStateCard,biliReceipt,biliUrl)).matched,true,'The actual Bili publication date can have a state class without being a review badge');resultChecks++;
    const chineseDate=display.replace(/(\d{4})-(\d{2})-(\d{2})/,'$1年$2月$3日')+':30';
    assert.equal((await resultFixture(datedStateCard.replaceAll(display,chineseDate),biliReceipt,biliUrl)).matched,true);resultChecks++;
    assert.equal((await resultFixture(datedStateCard.replaceAll(display,'2000-01-01 00:00'),biliReceipt,biliUrl)).reason,'time_mismatch');resultChecks++;
    for(const prefix of ['审核未通过：','审核中：','待确认：','定时发布：']){
      const value=await resultFixture(datedStateCard.replace(`<span class=publication-state>${display}</span>`,`<span class=publication-state>${prefix}${display}</span>`),biliReceipt,biliUrl);
      assert.equal(value.matched,false,'A date inside another review/schedule label remains a real state');resultChecks++;
    }
    assert.equal((await resultFixture(datedStateCard.replace('</div>','<span class=status>未识别的新状态</span></div>'),biliReceipt,biliUrl)).reason,'status_unresolved');resultChecks++;
    assert.equal((await resultFixture(datedStateCard+datedStateCard,biliReceipt,biliUrl)).reason,'ambiguous');resultChecks++;
    assert.equal((await resultFixture(datedStateCard.replaceAll('仅自己可见','公开'),biliReceipt,biliUrl)).reason,'visibility_mismatch');resultChecks++;
    // Observed public accessibility: title-named image and private badge under
    // the SAME BV cover anchor; separate title link and state-styled timestamp.
    const thumbImage='<img alt="QA result" width=120 height=68 src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2268%22%3E%3Crect width=%22120%22 height=%2268%22 fill=%22gray%22/%3E%3C/svg%3E">';
    const thumbLink='<a class=cover href="https://www.bilibili.com/video/BV1s54y1d72u/">'+thumbImage+'<div class=cover-state><span>仅自己可见</span><span>00:00:32</span></div></a>';
    const actualCard='<div class=article-card>'+thumbLink+'<a class=title href="https://www.bilibili.com/video/BV1s54y1d72u/">QA result</a><span class=publication-state>'+chineseDate+'</span><button>编辑</button><button>删除</button></div>';
    const thumbnailResult=await resultFixture(actualCard,biliReceipt,biliUrl);
    const subtitleCard=actualCard.replace(chineseDate,chineseDate+' 当前字幕: 1（含平台自动生成）');
    assert.equal((await resultFixture(subtitleCard,biliReceipt,biliUrl)).matched,true,'Actual combined publication date/subtitle metadata must not keep an approved work pending');resultChecks++;
    for(const extra of [' 审核中',' 审核未通过',' 未知状态',' 定时发布']){
      assert.notEqual((await resultFixture(subtitleCard.replace('（含平台自动生成）','（含平台自动生成）'+extra),biliReceipt,biliUrl)).matched,true);resultChecks++;
    }
    assert.equal((await resultFixture(subtitleCard.replace('class=title href="https://www.bilibili.com/video/BV1s54y1d72u/"','class=title'),biliReceipt,biliUrl)).reason,'status_unresolved');resultChecks++;
    assert.equal(thumbnailResult.matched,true);assert.equal(thumbnailResult.evidence.workId,'BV1s54y1d72u');assert.equal(thumbnailResult.evidence.visibility,'仅自己可见');assert.equal(thumbnailResult.evidence.visibilitySource,'same_work_thumbnail_link');resultChecks+=4;
    for(const image of [thumbImage.replace('alt=','aria-label='),thumbImage.replace('alt=','title='),'<div role=img aria-label="QA result" style="width:120px;height:68px;background:gray"></div>']){
      assert.equal((await resultFixture(actualCard.replace(thumbImage,image),biliReceipt,biliUrl)).matched,true,'Use the actual title-named image semantics, not one guessed HTML spelling');resultChecks++;
    }
    for(const badLink of ['https://www.bilibili.com/video/BV19M411G7wg/','https://www.bilibili.com.attacker.invalid/video/BV1s54y1d72u/','http://www.bilibili.com/video/BV1s54y1d72u/','https://qa:secret@www.bilibili.com/video/BV1s54y1d72u/','https://www.bilibili.com:8080/video/BV1s54y1d72u/']){
      const value=await resultFixture(actualCard.replace(thumbLink,thumbLink.replace('https://www.bilibili.com/video/BV1s54y1d72u/',badLink)),biliReceipt,biliUrl);
      assert.equal(value.reason,'visibility_mismatch');assert.equal(value.diagnostic.observedVisibility,'unreadable');assert.ok(!JSON.stringify(value).includes('secret'));resultChecks+=3;
    }
    for(const image of [thumbImage.replace('alt="QA result"','alt="other work"'),thumbImage.replace('width=120','style="display:none" width=120'),'',thumbImage.replace('<img ','<img style="opacity:0" ')]){
      assert.equal((await resultFixture(actualCard.replace(thumbImage,image),biliReceipt,biliUrl)).reason,'visibility_mismatch');resultChecks++;
    }
    for(const [open,close]of [['<p>','</p>'],['<div class=caption>','</div>'],['<div class=description>','</div>'],['<button>','</button>'],['<div role=button>','</div>']]){
      assert.equal((await resultFixture(actualCard.replace(thumbLink,open+thumbLink+close),biliReceipt,biliUrl)).reason,'visibility_mismatch','Caption/action links cannot lend a private label');resultChecks++;
    }
    assert.equal((await resultFixture(actualCard.replace('class=title href="https://www.bilibili.com/video/BV1s54y1d72u/"','class=title'),biliReceipt,biliUrl)).reason,'visibility_mismatch','The cover cannot establish a title-linked reference by itself');resultChecks++;
    const scopeConflict=await resultFixture(actualCard.replace('</div>','</div><span class=permission>公开</span>'),biliReceipt,biliUrl);assert.equal(scopeConflict.reason,'ambiguous');resultChecks++;
    const wrongScope=await resultFixture(actualCard.replaceAll('仅自己可见','公开'),biliReceipt,biliUrl);assert.equal(wrongScope.reason,'visibility_mismatch');assert.equal(wrongScope.diagnostic.observedVisibility,'公开');resultChecks+=2;
    assert.equal((await resultFixture(actualCard+actualCard,biliReceipt,biliUrl)).reason,'ambiguous');resultChecks++;
    assert.equal((await resultFixture(actualCard.replace(chineseDate,'2000年01月01日 00:00:00'),biliReceipt,biliUrl)).reason,'time_mismatch');resultChecks++;
    for(const [badge,reason]of [['审核中','processing'],['草稿','not_published'],['审核未通过','rejected'],['未知新状态','status_unresolved']]){
      const value=await resultFixture(actualCard.replace('<button>编辑</button>','<span class=status>'+badge+'</span><button>编辑</button>'),biliReceipt,biliUrl);assert.equal(value.reason,reason);assert.equal(value.matched,false);resultChecks+=2;
    }
    assert.equal((await resultFixture(actualCard.replace('https://www.bilibili.com/video/BV1s54y1d72u/"','https://www.bilibili.com/video/BV1s54y1d72u/?access_token=QA-hidden-query"'),biliReceipt,biliUrl)).matched,true);resultChecks++;
    const otherPlatformDuration=note().replace('</article>','<span class=status>00:32</span></article>');assert.equal((await resultFixture(otherPlatformDuration)).reason,'status_unresolved','The Bili-only exemption must not alter other platform adapters');resultChecks++;
    // Real Chromium DOM + actual parser/reader/observer. A synthetic backend
    // only changes its rendered response on navigation, never on a DOM poll.
    const delayedWindow=new BrowserWindow({show:false,width:1000,height:700,webPreferences:{sandbox:true,contextIsolation:true}});
    let virtual=Date.now(),navigation,loads=0;const began=virtual;
    const delayedRecord={...biliReceipt,status:'unknown',nativeAccountKey:'qa-native-id',sessionId:'aaaaaaaaaaaaaaaa',nickname:'QA owner'};
    const delayedAccount={platform:'bilibili',nativeAccountKey:'qa-native-id',connectorSessionId:'aaaaaaaaaaaaaaaa'};
    const delayedReader=createBilibiliResultReader({record:delayedRecord,account:delayedAccount,now:()=>virtual,
      createWindow:()=>({isDestroyed:()=>delayedWindow.isDestroyed(),destroy:()=>delayedWindow.destroy(),webContents:{
        getURL:()=>biliUrl,isDestroyed:()=>delayedWindow.webContents.isDestroyed(),
        setAudioMuted:value=>delayedWindow.webContents.setAudioMuted(value),
        setWindowOpenHandler:handler=>delayedWindow.webContents.setWindowOpenHandler(handler),on:()=>{},
        loadURL:async url=>{assert.equal(url,biliUrl);loads++;const body=virtual-began>=29000?actualCard:'<h1>全部稿件 0</h1>';navigation=delayedWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(body));await navigation;}
      }}),
      inspectOwner:async()=>({authenticated:true,profile:{nickname:'QA owner',ownIdentity:{key:'qa-native-id'}}}),
      readCard:()=>{
        const parser=new Function('receipt','const location=new URL('+JSON.stringify(biliUrl)+');return ('+publishResult.toString()+')(receipt);');
        return delayedWindow.webContents.executeJavaScript('('+parser.toString()+')('+JSON.stringify(delayedRecord)+')');
      },
    });
    try{
      await observePublishOutcome({record:delayedRecord,now:()=>virtual,sleep:async ms=>{virtual+=ms;await new Promise(resolve=>setImmediate(resolve));if(navigation)await navigation;},readNotice:async()=>({status:'unknown'}),readValidation:async()=>({inspected:true,errors:[]}),readWorkList:()=>delayedReader.read(),verifyIdentity:()=>delayedReader.verifyIdentity(),write:()=>{}});
      assert.equal(delayedRecord.status,'confirmed');assert.equal(delayedRecord.evidence.workId,'BV1s54y1d72u');assert.equal(delayedRecord.evidence.visibility,'仅自己可见');assert.equal(delayedRecord.evidence.visibilitySource,'same_work_thumbnail_link');assert.equal(loads,4);assert.ok(virtual-began<60000);assert.equal(delayedRecord.outcomeObservation.workListLoads,loads);resultChecks+=7;
    }finally{delayedReader.close();}
    const secretFailure=await resultFixture(bili.replace('已发布','审核未通过：Cookie: QA-cookie-secret; Authorization: Bearer QA-auth-secret'),biliReceipt,biliUrl);
    assert.equal(secretFailure.rejected,true);assert.ok(!JSON.stringify(secretFailure).includes('QA-cookie-secret'));assert.ok(!JSON.stringify(secretFailure).includes('QA-auth-secret'));resultChecks+=3;
    const statusNamedTitle=bili.replace('class=title','class="title status-title"').replace('<span class=status>已发布</span>','');
    assert.equal((await resultFixture(statusNamedTitle,biliReceipt,biliUrl)).matched,true,'Title class names cannot become state evidence');resultChecks++;
    const longFailure=await resultFixture(bili.replace('已发布','审核未通过：'+ 'QA长原因'.repeat(130)),biliReceipt,biliUrl);assert.equal(longFailure.rejected,true);assert.ok(longFailure.evidence.statusText.length<=400);resultChecks+=2;
    const captionPrivate=bili.replace('仅自己可见','公开').replace('</div>','<p>文案介绍仅自己可见和私密设置</p></div>');
    assert.equal((await resultFixture(captionPrivate,biliReceipt,biliUrl)).reason,'visibility_mismatch','Caption words are not permission metadata');resultChecks++;
    assert.equal((await resultFixture(bili,{...biliReceipt,visibility:'公开'},biliUrl)).reason,'visibility_mismatch','A public request cannot accept an explicitly private work');resultChecks++;
    assert.equal((await resultFixture(bili.replace('<span>仅自己可见</span>','<p><span>仅自己可见</span></p><span>公开</span>'),biliReceipt,biliUrl)).reason,'visibility_mismatch');resultChecks++;
    assert.equal((await resultFixture(bili.replace('<span>仅自己可见</span>','<button><span>仅自己可见</span></button><span>公开</span>'),biliReceipt,biliUrl)).reason,'visibility_mismatch');resultChecks++;
    assert.equal((await resultFixture(bili.replace('<span>仅自己可见</span>','<span>仅自己可见</span><span>公开</span>'),biliReceipt,biliUrl)).reason,'ambiguous');resultChecks++;
    const scopeUnknown=await resultFixture(wc,wcReceipt,wcUrl);assert.equal(scopeUnknown.evidence.visibility,undefined,'Do not copy requested visibility into unobserved card evidence');resultChecks++;
    assert.equal((await resultFixture(wc.replace('可见权限','可见权限 私密'),wcReceipt,wcUrl)).reason,'visibility_mismatch');resultChecks++;
    assert.equal((await resultFixture(dy.replace('私密','公开').replace(/<\/div>$/,'<p>私密演示教程</p></div>'),dyReceipt,'https://creator.douyin.com/creator-micro/content/manage')).reason,'visibility_mismatch');resultChecks++;
    const linkedBili=bili.replace('BV1QaOnly','BV1s54y1d72u'),workReference=await resultFixture(linkedBili,biliReceipt,biliUrl);
    assert.equal(workReference.evidence.workId,'BV1s54y1d72u');assert.equal(workReference.evidence.workUrl,'https://www.bilibili.com/video/BV1s54y1d72u');assert.equal(workReference.evidence.workReferenceSource,'official_title_link');resultChecks+=3;
    const linkedQuery=await resultFixture(linkedBili.replace('BV1s54y1d72u"','BV1s54y1d72u?access_token=QA-link-secret#fragment"'),biliReceipt,biliUrl);
    assert.equal(linkedQuery.evidence.workId,'BV1s54y1d72u');assert.equal(linkedQuery.evidence.workUrl,'https://www.bilibili.com/video/BV1s54y1d72u');assert.ok(!JSON.stringify(linkedQuery).includes('QA-link-secret'));resultChecks+=3;
    for(const url of ['https://www.bilibili.com.attacker.invalid/video/BV1s54y1d72u/','http://www.bilibili.com/video/BV1s54y1d72u/','https://qa:secret@www.bilibili.com/video/BV1s54y1d72u/','https://www.bilibili.com:8080/video/BV1s54y1d72u/','https://www.bilibili.com/video/BV1QaOnly/']){
      const value=await resultFixture(bili.replace('https://www.bilibili.com/video/BV1QaOnly',url),biliReceipt,biliUrl);assert.equal(value.evidence.workId,undefined);assert.equal(value.evidence.workUrl,undefined);resultChecks+=2;
    }
    const unlinkedBili=bili.replace(/ href="[^"]+"/,'');assert.equal((await resultFixture(unlinkedBili.replace('</div>','<p><a href="https://www.bilibili.com/video/BV1s54y1d72u/">教程链接</a></p></div>'),biliReceipt,biliUrl)).evidence.workId,undefined);resultChecks++;
    const twoLinks=linkedBili.replace('</a>','</a><a class=title href="https://www.bilibili.com/video/BV19M411G7wg/">QA result</a>');assert.equal((await resultFixture(twoLinks,biliReceipt,biliUrl)).reason,'ambiguous');resultChecks++;
    assert.equal((await resultFixture(linkedBili.replace('https://www.','//www.'),biliReceipt,biliUrl)).evidence.workId,'BV1s54y1d72u');resultChecks++;
    assert.equal((await resultFixture(linkedBili.replace('<a class=title','<a style="display:none" class=title'),biliReceipt,biliUrl)).reason,'not_found');resultChecks++;
    const linkedDy=dy.replace('<div class="info-title-text-fixture">QA result #topic</div>','<a class="info-title-text-fixture" href="https://www.douyin.com/video/7521294359430483251?share=QA-secret">QA result #topic</a>');
    const dyReference=await resultFixture(linkedDy,dyReceipt,'https://creator.douyin.com/creator-micro/content/manage');assert.equal(dyReference.evidence.workId,'7521294359430483251');assert.equal(dyReference.evidence.workUrl,'https://www.douyin.com/video/7521294359430483251');resultChecks+=2;
    const linkedNote=note().replace('<div class="note-card__title">QA result</div>','<a href="https://www.xiaohongshu.com/explore/64155afe000000001101000c?xsec_token=QA-note-secret"><div class="note-card__title">QA result</div></a>');
    const noteReference=await resultFixture(linkedNote);assert.equal(noteReference.evidence.workId,'64155afe000000001101000c');assert.ok(!JSON.stringify(noteReference).includes('QA-note-secret'));resultChecks+=2;
    const noSharedScope=bili.replace('<span>仅自己可见</span>','<span style="display:none">仅自己可见</span><span>公开</span>');assert.equal((await resultFixture(noSharedScope,biliReceipt,biliUrl)).reason,'visibility_mismatch');resultChecks++;
    // Author-root metadata is read by the same actual DOM driver as production.
    const rootedResult=async(html,data=biliReceipt,url=biliUrl)=>{
      await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<meta charset=utf-8>'+html));
      const reader=new Function('receipt','componentRoots',`const location=new URL(${JSON.stringify(url)});return (${publishResult.toString()})(receipt,componentRoots);`);
      return runOfficialDOM(win.webContents,reader,[data],'qa-result-component-metadata');
    };
    const rootedCard=linkedBili.replace('<span class=status>已发布</span><span>仅自己可见</span>','<x-work-state></x-work-state>');
    const rootedHtml=rootedCard+'<script>document.querySelector("x-work-state").attachShadow({mode:"closed"}).innerHTML="<span class=status>已发布</span><span>仅自己可见</span>"</script>';
    const rootResult=await rootedResult(rootedHtml);assert.equal(rootResult.matched,true);assert.equal(rootResult.evidence.visibility,'仅自己可见');assert.equal(rootResult.evidence.statusText,'已发布');assert.equal(rootResult.evidence.workId,'BV1s54y1d72u');resultChecks+=4;
    const captionRoot=rootedCard.replace('<x-work-state></x-work-state>','<span class=status>已发布</span><span>公开</span><p><x-caption></x-caption></p>')+'<script>document.querySelector("x-caption").attachShadow({mode:"closed"}).innerHTML="<span>仅自己可见</span>"</script>';
    assert.equal((await rootedResult(captionRoot)).reason,'visibility_mismatch');resultChecks++;
    const actionState=linkedBili.replace('<span class=status>已发布</span>','<span class=status>已发布</span><button><span role=status>审核未通过</span></button>');assert.equal((await resultFixture(actionState,biliReceipt,biliUrl)).matched,true);resultChecks++;
    await fixture();await run('inspect',{nonce:'spa',kind:'publish'});await run('submit',{nonce:'spa',index:0});await new Promise(r=>setTimeout(r,80));await js("location.hash='after-submit'");assert.equal((await run('result',{nonce:'spa'})).status,'confirmed');await assert.rejects(run('submit',{nonce:'spa',index:0}));resultChecks += 2;
    console.log(JSON.stringify({ officialPublishResultChecks:resultChecks,externalPlatformActions:false }));
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { win.destroy(); app.exit(process.exitCode || 0); }
});
