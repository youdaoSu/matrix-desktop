// Real Chromium DOM on synthetic HTTPS only. Never uses installed accounts.
const path = require('node:path'), root = path.resolve(__dirname, '..');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process'), env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(path.join(root, '.desktop-deps/node_modules/electron/dist/electron.exe'), [__filename], { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 45000, env }); process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || ''); process.exit(result.status ?? 1);
} else {
  const { app, BrowserWindow, session } = require('electron'), fs = require('node:fs'), os = require('node:os'), assert = require('node:assert/strict'), { randomUUID } = require('node:crypto');
  const { runOfficialDOM } = require('../desktop/official-dom.cjs'), { webFollowupDom } = require('../desktop/web-followup-dom.cjs');
  const { publishResult } = require('../desktop/publish-result.cjs');
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-web-followup-dom-qa-'))); app.commandLine.appendSwitch('mute-audio');
  app.whenReady().then(async () => {
    let win, checks = 0;
    try {
      const isolated = session.fromPartition('qa-web-followup-' + randomUUID());
      await isolated.protocol.handle('https', () => new Response('<!doctype html><meta charset="utf-8"><style>body{font:16px sans-serif}button,textarea{margin:8px;padding:12px}.comment-content{display:block}article{border:1px solid #ccc;margin:8px;padding:12px}</style><main id="fixture"></main>', { headers: { 'content-type': 'text/html;charset=utf-8' } }));
      win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { session: isolated, nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false } }); win.webContents.setAudioMuted(true);
      const evaluate = expression => win.webContents.executeJavaScript(expression);
      for (const platform of ['xiaohongshu', 'wechat']) {
        const workId = platform === 'xiaohongshu' ? 'abcdef0123456789abcdef01' : '123456789012345', attr = platform === 'xiaohongshu' ? 'data-note-id' : 'data-object-id';
        await win.loadURL(platform === 'xiaohongshu' ? 'https://creator.xiaohongshu.com/note-manager' : 'https://channels.weixin.qq.com/platform/post/list');
        await evaluate(`(()=>{const box=document.querySelector('#fixture');box.innerHTML='<button id="unrelated-send">发送</button><article ${attr}="${workId}"><span>原作品标题</span><button id="open-comments">评论管理</button></article><article ${attr}="wrong-work"><button>评论管理</button></article>';window.fixtureSends=0;window.fixturePins=0;document.querySelector('#unrelated-send').onclick=()=>{throw Error('Must not click page-global send')};document.querySelector('#open-comments').onclick=()=>{const panel=document.createElement('section');panel.setAttribute('role','dialog');panel.setAttribute('${attr}','${workId}');panel.innerHTML='<h2>原作品评论</h2><textarea placeholder="发表评论"></textarea><button id="exact-send">发送</button>';box.append(panel);document.querySelector('#exact-send').onclick=()=>{window.fixtureSends++;const row=document.createElement('article');row.setAttribute('data-comment-id','qa-original-comment');row.innerHTML='<span class="author-tag">作者</span><span data-comment-content></span><time></time><button>置顶评论</button>';row.querySelector('[data-comment-content]').textContent=panel.querySelector('textarea').value;row.querySelector('time').textContent='刚刚';row.querySelector('time').setAttribute('datetime',new Date().toISOString());row.querySelector('button').onclick=()=>{window.fixturePins++;row.setAttribute('data-pinned','true')};panel.append(row);};};return true})()`);
        const input = { platform, workId, nonce: randomUUID(), text: '功能测试追评（仅隔离）' }, dom = (command, patch = {}) => runOfficialDOM(win.webContents, webFollowupDom, [command, { ...input, ...patch }], 'matrix-web-followup');
        assert.equal((await dom('open')).opened, true); checks++;
        assert.equal((await dom('read')).comments.length, 0); checks++;
        await dom('fill'); assert.equal(await evaluate('document.querySelector("textarea").value'), input.text); checks++;
        assert.equal((await dom('comment')).clicked, true); assert.equal(await evaluate('window.fixtureSends'), 1); checks += 2;
        const observed = await dom('read'); assert.equal(observed.comments[0].id, 'qa-original-comment'); assert.ok(Number.isFinite(Date.parse(observed.comments[0].createdAt))); checks += 2;
        assert.equal((await dom('pin', { commentId: 'qa-original-comment' })).clicked, true); assert.equal((await dom('read')).comments[0].pinned, true); assert.equal(await evaluate('window.fixturePins'), 1); checks += 3;
        await assert.rejects(dom('comment'), /已.*发送/); await assert.rejects(dom('pin', { commentId: 'another-comment' }), /评论ID/); await assert.rejects(dom('read', { workId: 'wrongwork000' }), /上下文/); checks += 3;
        await evaluate('document.querySelector("textarea").value="其他手动草稿"'); await assert.rejects(dom('fill'), /其他草稿/); assert.equal(await evaluate('document.querySelector("textarea").value'), '其他手动草稿'); checks += 2;
        await evaluate(`(()=>{const p=document.createElement('section');p.setAttribute('role','dialog');p.textContent='其他作品评论';p.setAttribute('${attr}','another-work');document.body.append(p);return true})()`); await assert.rejects(dom('read'), /其他作品|不唯一/); checks++;
      }
      for(const platform of ['douyin','bilibili','xiaohongshu','wechat']){
        const ids={douyin:'7698319813789470607',bilibili:'BV1s54y1d72u',xiaohongshu:'abcdef0123456789abcdef01',wechat:'123456789012345'},urls={douyin:'https://creator.douyin.com/creator-micro/content/manage',bilibili:'https://member.bilibili.com/platform/upload-manager/article',xiaohongshu:'https://creator.xiaohongshu.com/new/note-manager',wechat:'https://channels.weixin.qq.com/platform/post/list'};
        const date=new Date(),local=new Date(date.getTime()+8*3600000),at=local.toISOString().slice(0,19).replace('T',' ').replaceAll('-','/'),title='QA审核中编号',links={douyin:'https://www.douyin.com/video/'+ids.douyin,bilibili:'https://www.bilibili.com/video/'+ids.bilibili,xiaohongshu:'https://www.xiaohongshu.com/explore/'+ids.xiaohongshu};
        const html=platform==='wechat'?`<article data-object-id="${ids.wechat}"><span>${title}</span><p>${at}</p><button>可见权限</button><button>评论管理</button><span role=status>审核中</span></article>`:`<article class="${platform==='douyin'?'video-card-content-qa':platform==='bilibili'?'article-card':'note-card'}"><a href="${links[platform]}"><span class="${platform==='douyin'?'info-title-text-qa':platform==='xiaohongshu'?'note-card__title':'title'}">${title}</span></a><p>${at}</p><span role=status>审核中</span><button>编辑</button><button>删除</button></article>`;
        await win.loadURL(urls[platform]);await evaluate(`document.querySelector('#fixture').innerHTML=${JSON.stringify(html)};true`);
        const result=await runOfficialDOM(win.webContents,publishResult,[{platform,expectedTitle:title,createdAt:date.toISOString()}],'matrix-publish-result');assert.equal(result.pendingReview,true);assert.equal(result.evidence.workId,ids[platform]);assert.equal(result.matched,false);checks+=3;
      }
      console.log(JSON.stringify({webFollowupRealDomChecks:checks,platforms:['xiaohongshu','wechat'],fourPlatformsPendingReviewIdSaved:true,exactWorkAndAuthorCommentIds:true,noGlobalSendButtonFallback:true,preexistingDraftPreserved:true,pinVerifiedByOriginalCommentMarker:true,noReplay:true,syntheticHttpsOnly:true,realPlatformActions:false}));
    } catch (error) { console.error(error); process.exitCode = 1; } finally { win?.destroy(); app.exit(process.exitCode || 0); }
  });
}
