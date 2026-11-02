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
  const readFriendly = () => win.webContents.executeJavaScriptInIsolatedWorld(1003, [{ code: officialDataScript('read-interactions', {kind:'messages'}) }]);
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
    // The fixture's deliberately present password input is an explicit login
    // state. Remove it before asserting the distinct unsupported-layout path.
    await js('document.querySelector("input[type=password]").remove()');
    const friendly = await win.webContents.executeJavaScriptInIsolatedWorld(1003, [{ code: officialDataScript('read-interactions', { kind: 'comments' }) }]);
    assert.match(friendly.error, /当前页没有识别到/); assert.equal(friendly.records, undefined); checks += 2;
    await fixture(select); await run('options', { field: '音乐', nonce: 'covered' }); await js("const mask=document.createElement('div');mask.style='position:fixed;inset:0;z-index:999;background:white';document.body.append(mask)"); await assert.rejects(run('select-option', { nonce: 'covered', index: 0 })); checks++;
    assert.equal(await js('!!window.published'), false); checks++;
    // Offline replicas of observed public DOM structure; no real network or private data.
    let observedHtml = '<div class="comment-item-test"><div class="comment-main-test"><div class="username-test">QA 作者</div><div class="time-test">今天</div><div class="text-test">QA 评论正文</div><button>删除</button></div></div>';
    let interceptedRequests = 0;
    await win.webContents.session.protocol.handle('https', () => { interceptedRequests++; return new Response('<meta charset=utf-8>' + observedHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } }); });
    await win.loadURL('https://creator.douyin.com/creator-micro/work-management/work-detail/qa-only');
    result = await run('read-interactions', { kind: 'comments' }); assert.equal(result.records.length, 1); assert.equal(result.records[0].content, 'QA 评论正文'); assert.equal(result.records[0].platformId, ''); checks += 3;
    await win.loadURL('https://creator.douyin.com/other'); await assert.rejects(run('read-interactions', { kind: 'comments' })); checks++;
    observedHtml = '<div data-e2e=im-dialog><div data-e2e=conversation-item><div class=conversationConversationItemtitle>QA 会话</div><pre class=ConversationItemHinttextBox>QA 预览</pre></div><div data-e2e=conversation-item><div class=conversationConversationItemtitle>QA 无预览</div><div>2小时内在线</div></div></div><div data-e2e=conversation-item><div class=conversationConversationItemtitle>无关区块</div></div>';
    await win.loadURL('https://www.douyin.com/jingxuan');
    result = await run('read-interactions', { kind: 'messages' }); assert.equal(result.records.length, 2); assert.equal(result.records[0].content, 'QA 预览'); assert.equal(result.records[1].content, ''); assert.equal(result.records[0].platformId, ''); checks += 4;
    observedHtml = '<style>.avatar{width:20px;height:20px}</style><div data-conversation-id=unread data-unread-count=3 tabindex=0><img class=avatar src="https://p3.douyinpic.com/qa-avatar.png"><span class=nickname>QA unread</span><span class=last-message>still unread</span></div><div data-conversation-id=unknown><span class=nickname>QA unknown</span><span class=last-message>unknown not read</span></div><div data-conversation-id=capped><span class=nickname>QA capped</span><span class=last-message>many unread</span><span data-unread-badge>99+</span></div><div data-conversation-id=explicit-read data-unread-count=0><span class=nickname>QA read</span><span class=last-message>known read</span></div><div data-conversation-id=dot><span class=nickname>QA dot</span><span class=last-message>count unknown</span><span aria-label="未读">●</span></div><div data-conversation-id=hidden><span class=nickname>QA hidden badge</span><span class=last-message>do not infer</span><span class=unread-count style=display:none>8</span></div><script>window.activationCount=0;document.addEventListener("click",()=>{window.activationCount++;document.querySelector("[data-unread-count]").setAttribute("data-unread-count","0")});for(const event of ["focusin","scroll"])document.addEventListener(event,()=>window.activationCount++);</script>';
    await win.loadURL('https://www.douyin.com/qa-unread-fixture');
    await new Promise(resolve => setTimeout(resolve, 150));
    const networkBeforeRead = interceptedRequests;
    for (let read = 0; read < 3; read++) result = await run('read-interactions', { kind: 'messages' });
    assert.equal(result.records.length, 6); checks++;
    assert.equal(result.records[0].avatarUrl, 'https://p3.douyinpic.com/qa-avatar.png'); checks++;
    assert.equal(result.records[0].unreadState, 'unread'); assert.equal(result.records[0].unreadCount, 3); checks+=2;
    assert.equal(result.records[1].unreadState, undefined); assert.equal(result.records[1].unreadCount, undefined); checks+=2;
    assert.equal(result.records[2].unreadCount, 99); assert.equal(result.records[2].unreadCountCapped, true); checks+=2;
    assert.equal(result.records[3].unreadState, 'read'); assert.equal(result.records[3].unreadCount, 0); checks+=2;
    assert.equal(result.records[4].unreadState, 'unread'); assert.equal(result.records[4].unreadCount, undefined); checks+=2;
    assert.equal(result.records[5].unreadState, undefined); checks++;
    assert.equal(await js('window.activationCount'), 0); assert.equal(await js('document.querySelector("[data-unread-count]").getAttribute("data-unread-count")'), '3'); checks+=2;
    assert.equal(interceptedRequests, networkBeforeRead); checks++;
    observedHtml = '<div data-e2e=im-dialog><div data-e2e=conversation-item><div class=conversationConversationItemtitle>QA official-only structure</div></div></div>';
    await win.loadURL('https://example.org/'); await assert.rejects(run('read-interactions', { kind: 'messages' })); checks++;
    const enter = () => run('open-message-list', { kind: 'messages' });
    observedHtml = '<header><button id=entry aria-label=消息 onclick="window.entryClicks=(window.entryClicks||0)+1;document.querySelector(\'#list\').hidden=false">消息</button></header><div id=list data-e2e=im-dialog hidden><div data-e2e=conversation-item data-unread-count=3 onclick="window.conversationClicks=(window.conversationClicks||0)+1;this.dataset.unreadCount=0"><b class=conversationConversationItemtitle>QA 未读会话</b><p class=ConversationItemHinttextBox>QA 预览</p></div></div>';
    await win.loadURL('https://www.douyin.com/user/self');
    assert.equal((await enter()).clicked, true); assert.equal((await enter()).clicked, false); checks+=2;
    result=await run('read-interactions',{kind:'messages'});assert.equal(result.records[0].unreadCount,3);assert.equal(await js('window.entryClicks'),1);assert.equal(await js('window.conversationClicks||0'),0);checks+=3;
    observedHtml='<header><button onclick="window.clicks=(window.clicks||0)+1">消息</button></header>';
    await win.loadURL('https://www.douyin.com/user/self');assert.equal((await enter()).clicked,true);assert.equal((await enter()).retryable,false);assert.equal(await js('window.clicks'),1);checks+=3;
    for(const body of ['<article><button>消息</button></article>','<header><button>消息</button><button>消息</button></header>','<div data-e2e=conversation-item><header><button>消息</button></header></div>']){
      observedHtml=body+'<script>window.clicks=0;document.addEventListener("click",()=>window.clicks++)</script>';await win.loadURL('https://www.douyin.com/user/self');assert.ok((await enter()).error);assert.equal(await js('window.clicks'),0);checks+=2;
    }
    observedHtml='<header><button>消息</button></header><div style="position:fixed;inset:0;z-index:10;background:white">QA 遮挡</div>';await win.loadURL('https://www.douyin.com/user/self');assert.match((await enter()).error,/遮挡/);checks++;
    observedHtml='<input type=password>';await win.loadURL('https://www.douyin.com/user/self');assert.equal((await enter()).retryable,false);checks++;
    await win.loadURL('https://example.org/');await assert.rejects(enter());checks++;
    const foreignEntry=await win.webContents.executeJavaScriptInIsolatedWorld(1003,[{code:officialDataScript('open-message-list',{kind:'messages'})}]);assert.match(foreignEntry.error,/仅用于抖音/);checks++;
    // Public-source observed creator summary card structure, not its unsafe
    // per-conversation/history-click branch. Offline replica, no real account.
    const creatorCard = '<li class=semi-list-item data-message-id=qa-message data-unread-count=7 onclick="window.creatorClicks++;this.dataset.unreadCount=0"><img class=avatar style="width:20px;height:20px" src="https://p3.douyinpic.com/qa.png"><b class=item-header-name-qa>QA 摘要作者</b><p class=text-qa>QA 消息摘要</p><time class=item-header-time-qa>今天 12:00</time></li>';
    observedHtml='<ul>'+creatorCard+'</ul><script>window.creatorClicks=0;window.creatorEvents=0;for(const name of ["focusin","scroll"])document.addEventListener(name,()=>window.creatorEvents++);</script>';
    const creatorUrl='https://creator.douyin.com/creator-micro/data/following/chat';
    await win.loadURL(creatorUrl);const creatorRequests=interceptedRequests;
    for(let i=0;i<3;i++)result=await run('read-interactions',{kind:'messages'});
    assert.equal(result.records.length,1);assert.equal(result.records[0].content,'QA 消息摘要');assert.equal(result.records[0].author,'QA 摘要作者');assert.equal(result.records[0].displayTime,'今天 12:00');assert.equal(result.records[0].platformId,'qa-message');checks+=5;
    assert.equal(result.records[0].unreadCount,7);assert.equal(result.records[0].unreadState,'unread');assert.equal(result.conversationSelected,false);assert.equal(result.sourceMode,'creator_message_feed');checks+=4;
    assert.equal(await js('window.creatorClicks'),0);assert.equal(await js('window.creatorEvents'),0);assert.equal(await js('document.querySelector("li").dataset.unreadCount'),'7');assert.equal(interceptedRequests,creatorRequests);checks+=4;
    await js('document.querySelector("li").removeAttribute("data-message-id")');result=await run('read-interactions',{kind:'messages'});assert.equal(result.records[0].platformId,'');checks++;
    await js('document.querySelector("time").style.display="none"');assert.match((await readFriendly()).error,/没有识别到/);checks++;
    observedHtml='<ul>'+creatorCard.replace('data-unread-count=7','')+'</ul><article class=semi-list-item><b class=item-header-name-qa>QA 不相关文章</b><p class=text-qa>不是会话</p><time class=item-header-time-qa>今天</time></article>';
    await win.loadURL(creatorUrl);result=await run('read-interactions',{kind:'messages'});assert.equal(result.records.length,1);assert.equal(result.records[0].unreadState,undefined);checks+=2;
    for(const marker of ['<div class=StackLayoutStackChatHeadertitle>QA 具体联系人</div>','<div data-e2e=msg-input><div class=messageEditorinputArea contenteditable=true></div></div>']){
      observedHtml='<ul>'+creatorCard+'</ul>'+marker;await win.loadURL(creatorUrl);assert.match((await readFriendly()).error,/具体会话/);checks++;
    }
    observedHtml='<ul>'+creatorCard+'</ul>';await win.loadURL('https://creator.douyin.com/creator-micro/home');assert.match((await readFriendly()).error,/消息摘要列表/);checks++;
    observedHtml='<h2>私信列表</h2><div class=empty-list>暂无私信</div>';await win.loadURL(creatorUrl);assert.equal((await run('read-interactions',{kind:'messages'})).records.length,0);checks++;
    observedHtml='<div aria-busy=true>加载中</div>';await win.loadURL(creatorUrl);assert.match((await readFriendly()).error,/仍在加载/);checks++;
    console.log(JSON.stringify({ officialDataElectronAssertions: checks, readDoesNotActivateConversation: true, unreadFixtureUnchanged: true, readMakesNoNetworkRequests: true, realPlatformUnreadVerified: false, realPlatformWrites: false })); app.exit(0);
  } catch (error) { console.error({ completedAssertions: checks }, error); app.exit(1); }
});
