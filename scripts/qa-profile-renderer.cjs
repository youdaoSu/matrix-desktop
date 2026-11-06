const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readPlatformProfile, bindingProfile } = require('../desktop/platform-profile.cjs');
const { runOfficialDOM } = require('../desktop/official-dom.cjs');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-profile-qa-')));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  let checks = 0;
  const fixture = async (html, expected, platform = 'xiaohongshu') => {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const result = await win.webContents.executeJavaScript(`(${readPlatformProfile.toString()})(${JSON.stringify(platform)})`);
    assert.equal(result.nickname, expected); checks++; return result;
  };
  try {
    for (const message of ['访问太频繁，请稍后再试', '操作过于频繁，请稍后重试', '登录频繁，请稍后再试', 'Too many requests']) {
      const limited = await fixture(`<div class="user"><span class="name">本人</span></div><div role="alert">${message}</div>`, '本人');
      assert.equal(limited.rateLimited, true); checks++;
      assert.equal(bindingProfile(limited, '平台').rateLimited, true); checks++;
    }
    const classless = await fixture('<main>' + '普通登录说明'.repeat(100) + '</main><div class="message">访问太频繁，请稍后再试</div>', '');
    assert.equal(classless.rateLimited, true); checks++;
    for (const html of ['<article><div role="alert">访问太频繁，请稍后再试</div></article>', '<div><article>访问太频繁，请稍后再试</article></div>', '<div role="alert" style="display:none">访问太频繁，请稍后再试</div>', '<div class="comment-item"><div class="error">访问太频繁，请稍后再试</div></div>']) {
      const unrelated = await fixture('<div class="user"><span class="name">本人</span></div><main>' + '普通内容'.repeat(70) + '</main>' + html, '本人');
      assert.equal(unrelated.rateLimited, undefined); checks++;
    }
    const shortContent = await fixture('<article>访问太频繁，请稍后再试</article>', '');
    assert.equal(shortContent.rateLimited, undefined); checks++;
    const errorPage = await fixture('<p>访问太频繁，请稍后再试</p>', '');
    assert.equal(errorPage.rateLimited, true); checks++;
    await fixture('<div class="user"><span class="name">小健身 🏋️</span></div>', '小健身 🏋️');
    await fixture('<div class="user-info"><span class="name">我的账号</span></div>', '我的账号');
    await fixture('<span class="user-name" title="完整账号名称">完整账…</span>', '完整账号名称');
    await fixture('<span class="user-name" style="display:none">旧账号</span><span class="user-name">新账号</span>', '新账号');
    await fixture('<span class="user-name">登录</span><span class="user-name">真实昵称</span>', '真实昵称');
    await fixture('<div class="comment"><span class="nickname">别人的评论</span></div><header><span class="nickname">本人</span></header>', '本人');
    await fixture('<div class="comment"><span class="nickname">别人的评论</span></div>', '');
    for (const container of ['data-conversation-id=123', 'data-follower-id=123', 'data-e2e=conversation-item', 'class=sessionItem', 'class=fansItem', 'class=fans-item']) {
      await fixture(`<div ${container}><span class=nickname>互动对象，非本人</span></div>`, '');
      await fixture(`<div ${container}><span class=nickname>互动对象，非本人</span></div><header><span class=nickname>本人账号</span></header>`, '本人账号');
    }
    await fixture('<main><article><span class="nickname">作品作者</span></article></main>', '');
    await fixture('<span class="nickname">小红书账号</span>', '');
    await fixture('<span class="nickname">登录火星的猫</span>', '登录火星的猫');
    await fixture('<span class="nickname">  阿明\n 健身  </span>', '阿明 健身');
    await fixture('<header><span class="userName">抖音昵称</span></header>', '抖音昵称', 'douyin');
    await fixture('<div class="finder-nickname">视频号昵称</div>', '视频号昵称', 'wechat');
    // The observed editor sidebar renders the owner without a nested .name.
    await fixture('<div class="common-menu-item account-info default"><img class="avatar"><span>视频号本人</span></div>', '视频号本人', 'wechat');
    await fixture('<div class="common-menu-item account-info default" title="账号信息"><img class="avatar"><span>视频号本人</span><div class="common-dialog changeAccount-dialog" style="display:none">切换账号：其他视频号</div></div>', '视频号本人', 'wechat');
    await fixture('<div class="common-menu-item account-info default"><svg><title>账号图标</title></svg><span>视频号本人</span><div class="common-dialog changeAccount-dialog" style="opacity:0">选择其他视频号</div></div>', '视频号本人', 'wechat');
    await fixture('<div class="common-menu-item account-info default"><span style="display:none">旧昵称</span><span>视频号本人</span><div class="common-dialog changeAccount-dialog">另一个已绑定账号</div></div>', '视频号本人', 'wechat');
    await fixture('<div class="common-menu-item account-info default"><span>其他本人账号</span><div class="common-dialog changeAccount-dialog">视频号本人</div></div>', '其他本人账号', 'wechat');
    await fixture('<article><div class="common-menu-item account-info default">作品作者，非本人</div></article>', '', 'wechat');
    await fixture('<div class="comment"><div class="common-menu-item account-info default">评论者，非本人</div></div>', '', 'wechat');
    await fixture('<div class="header-entry-mini"><span class="nickname">B站昵称</span></div>', 'B站昵称', 'bilibili');
    await fixture('<div class="home-top-msg"><span class="home-top-msg-name">本人B站昵称</span></div>', '本人B站昵称', 'bilibili');
    assert.equal((await fixture('<input placeholder="手机号"><header><span class="user-name">旧昵称</span></header>', '旧昵称')).loginVisible, true); checks++;
    assert.equal(bindingProfile({ nickname: '' }, '小红书').pendingProfile, true); checks++;
    assert.equal(bindingProfile({ nickname: '  我的小红书  ' }, '小红书').nickname, '我的小红书'); checks++;
    const ban = await fixture('<header><span class="nickname">本人账号</span></header><div role="alert">您的账号已被永久封禁，请申诉。</div>', '本人账号');
    assert.equal(ban.accountIssue.kind, 'banned'); assert.equal(bindingProfile(ban, '抖音').accountIssue.kind, 'banned'); checks += 2;
    const restricted = await fixture('<header><span class="nickname">本人账号</span></header><div role="alertdialog">当前账号已被限制发布。</div>', '本人账号');
    assert.equal(restricted.accountIssue.kind, 'restricted'); checks++;
    for (const html of ['<div role=alert>如果您的账号已被封禁，请阅读说明。</div>', '<div role=alert>如何处理账号封禁</div>', '<div role=alert>当前账号没有被封禁</div>', '<div role=alert style="display:none">您的账号已被永久封禁。</div>', '<article><div role=alert>您的账号已被永久封禁。</div></article>', '<div class=comment><div role=alert>您的账号已被永久封禁。</div></div>']) {
      assert.equal((await fixture(html, '')).accountIssue, undefined); checks++;
    }
    assert.equal((await fixture('<div role=alert>账号状态异常</div>', '')).accountIssue.kind, 'abnormal'); checks++;
    await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<article><div id=comment-host></div></article><div id=owner-host></div><script>document.querySelector("#comment-host").attachShadow({mode:"closed"}).innerHTML="<span class=finder-nickname>Comment author, not owner</span>";window.ownerRoot=document.querySelector("#owner-host").attachShadow({mode:"closed"});window.ownerRoot.innerHTML="<span class=finder-nickname>Closed component owner</span>";</script>'));
    const closedOwner=()=>runOfficialDOM(win.webContents,readPlatformProfile,['wechat'],'qa-closed-owner');
    assert.equal((await closedOwner()).nickname,'Closed component owner');checks++;
    await win.webContents.executeJavaScript('document.querySelector("#owner-host").style.opacity="0"');
    assert.equal((await closedOwner()).nickname,'','Hidden owner and a shadow-root comment cannot supply identity');checks++;
    await win.webContents.executeJavaScript('document.querySelector("#owner-host").style.opacity="1";window.ownerRoot.innerHTML+="<input type=password><div role=alert>您的账号已被封禁。</div>"');
    const guardedOwner=await closedOwner();assert.equal(guardedOwner.loginVisible,true);assert.equal(guardedOwner.accountIssue.kind,'banned');checks+=2;
    let officialHtml='';await win.webContents.session.protocol.handle('https',()=>new Response(officialHtml,{headers:{'content-type':'text/html; charset=utf-8'}}));
    const ownHome=async(html,url='https://creator.douyin.com/creator-micro/home')=>{officialHtml=html;await win.loadURL(url);return win.webContents.executeJavaScript(`(${readPlatformProfile.toString()})('douyin')`);};
    const homeBody=(name='Fixture renamed owner',counter='粉丝指数 209')=>`<section><div>${name}</div><span>抖音号：74320758532</span><div>关注 5</div><div>${counter}</div><div>获赞 303</div></section>`;
    let own=await ownHome(homeBody());assert.equal(own.nickname,'Fixture renamed owner');assert.equal(own.ownIdentity.key,'74320758532');assert.equal(own.metrics.followingCount,5);assert.equal(own.metrics.likesCount,303);assert.equal(own.metrics.followersCount,undefined);checks+=5;
    const selfBody='<section><h1>QA 网页本人</h1><div><span>抖音号：</span><span>74320758532</span></div></section><div data-e2e=im-dialog><div data-e2e=conversation-item><span class=nickname>QA 会话非本人</span><span>抖音号：wrong_id</span></div></div>';
    own=await ownHome(selfBody,'https://www.douyin.com/user/self');assert.equal(own.nickname,'QA 网页本人');assert.equal(own.ownIdentity.key,'74320758532');checks+=2;
    for(const url of ['https://www.douyin.com/user/other','https://www.douyin.com/']){assert.equal((await ownHome(selfBody,url)).ownIdentity,undefined);checks++;}
    for(const body of [`<article>${selfBody}</article>`,`<div data-e2e=im-dialog>${selfBody}</div>`,selfBody.replace('74320758532','不可识别 123')]){assert.equal((await ownHome(body,'https://www.douyin.com/user/self')).ownIdentity,undefined);checks++;}
    own=await ownHome(homeBody('New name','粉丝数 1.2万'));assert.equal(own.nickname,'New name');assert.equal(own.metrics.followersCount,undefined,'Rounded counters cannot establish exact follower deltas');checks+=2;
    own=await ownHome(homeBody('New name','粉丝数 12023'));assert.equal(own.metrics.followersCount,12023);checks++;
    // OWN portrait is a sibling of the handle/counter text column. CSS class
    // case and picture srcset must not force initials or select a video author.
    const portrait='https://portrait.fixture.test/own.png';
    const card=avatar=>`<main><div class=profile-card>${avatar}${homeBody()}</div><article><img class=avatar src=https://portrait.fixture.test/other.png width=80 height=80></article></main>`;
    for(const avatar of [`<div class=AvatarWrap><img src=${portrait} width=80 height=80></div>`,`<img class=UserAvatar src=${portrait} width=80 height=80>`,`<div aria-label=本人头像 style="width:80px;height:80px;background-image:url('${portrait}')"></div>`,`<picture class=Avatar><source srcset=${portrait}><img width=80 height=80></picture>`]){own=await ownHome(card(avatar));assert.equal(own.avatarUrl,portrait);assert.equal(own.ownIdentity.key,'74320758532');checks+=2;}
    own=await ownHome(card(`<img class=Avatar src=${portrait} width=80 height=80 style=display:none>`));assert.equal(own.avatarUrl,'');checks++;
    own=await ownHome(card(`<div role=dialog><img class=Avatar src=${portrait} width=80 height=80></div>`));assert.equal(own.avatarUrl,'');checks++;
    own=await ownHome(card(`<img class=Avatar src=${portrait} width=80 height=80><img class=Avatar src=https://portrait.fixture.test/ambiguous.png width=80 height=80>`));assert.equal(own.avatarUrl,'');checks++;
    for(const src of ['data:image/svg+xml,placeholder','javascript:void(0)','https://user:password@portrait.fixture.test/private.png']){own=await ownHome(card(`<img class=Avatar src="${src}" width=80 height=80>`));assert.equal(own.avatarUrl,'');checks++;}
    own=await ownHome(card('<img class=logo src=https://portrait.fixture.test/logo.png width=80 height=80>'));assert.equal(own.avatarUrl,'');checks++;
    own=await ownHome(`<main><div class=profile-card>${homeBody()}<div><span>抖音号：other_handle</span><img class=Avatar src=${portrait} width=80 height=80></div></div></main>`);assert.equal(own.avatarUrl,'');checks++;
    own=await ownHome(`<header><span class=nickname>QA本人</span><img class=Avatar src=${portrait} width=80 height=80></header>`);assert.equal(own.avatarUrl,portrait);checks++;
    own=await ownHome(card(`<img class=Avatar src=${portrait} width=80 height=80>`),'https://creator.douyin.com/creator-micro/content/manage');assert.equal(own.avatarUrl,'');checks++;
    own=await ownHome(`<div class=profile-card><div class=Avatar id=portrait-host></div>${homeBody()}</div><script>document.querySelector('#portrait-host').attachShadow({mode:'closed'}).innerHTML='<img src="${portrait}" width="80" height="80">';</script>`);
    own=await runOfficialDOM(win.webContents,readPlatformProfile,['douyin'],'qa-closed-portrait');assert.equal(own.avatarUrl,portrait);checks++;
    for(const url of ['https://creator.douyin.com/creator-micro/content/manage','https://www.douyin.com/user/other','https://creator.douyin.com/creator-micro/home/other']){assert.equal((await ownHome(homeBody(),url)).ownIdentity,undefined);checks++;}
    for(const body of [`<article>${homeBody()}</article>`,`<div class=comment>${homeBody()}</div>`,`<div style=display:none>${homeBody()}</div>`]){assert.equal((await ownHome(body)).ownIdentity,undefined);checks++;}
    own=await fixture('<div class=finder-info><span class=finder-nickname>本人视频号</span><p>关注者 762</p></div>','本人视频号','wechat');assert.equal(own.metrics.followersCount,762);checks++;
    const idHome=async(html,platform,url)=>{officialHtml=html;await win.loadURL(url);return win.webContents.executeJavaScript(`(${readPlatformProfile.toString()})(${JSON.stringify(platform)})`);};
    own=await idHome('<div class=home-top-msg><span class=home-top-msg-name>Bili own renamed</span><a href=https://space.bilibili.com/123456>个人空间</a></div>','bilibili','https://account.bilibili.com/account/home');assert.equal(own.ownIdentity.key,'123456');checks++;
    own=await idHome('<div class=home-top-msg><span class=home-top-msg-name>Bili own renamed</span><a href=https://space.bilibili.com/123456>空间</a><a href=https://space.bilibili.com/654321>另一个账号</a></div>','bilibili','https://account.bilibili.com/account/home');assert.equal(own.ownIdentity,undefined);checks++;
    own=await idHome('<div class=finder-info><span class=finder-nickname>本人视频号</span><p>视频号ID：sphOwnPublicId</p></div>','wechat','https://channels.weixin.qq.com/platform');assert.equal(own.ownIdentity.key,'sphOwnPublicId');checks++;
    own=await idHome('<header class=user-info><span class=nickname>XHS own</span><p>小红书号：12345678</p></header>','xiaohongshu','https://creator.xiaohongshu.com/home');assert.equal(own.ownIdentity.key,'12345678');checks++;
    own=await idHome('<header><span class=nickname>XHS own</span></header><section><span>XHS own</span><p>小红书账号: 49338181231</p><p>关注数 0 粉丝数 6 获赞与收藏 27</p></section>','xiaohongshu','https://creator.xiaohongshu.com/new/home');assert.equal(own.ownIdentity.key,'49338181231');assert.equal(own.nickname,'XHS own');checks+=2;
    own=await idHome('<header><span class=nickname>XHS own</span></header><section><p>小红书账号: 49338181231</p><p>0 关注数 6 粉丝数 27 获赞与收藏</p></section>','xiaohongshu','https://creator.xiaohongshu.com/new/home');assert.equal(own.ownIdentity.key,'49338181231');assert.equal(own.nickname,'XHS own');checks+=2;
    own=await idHome('<header><span class=nickname>XHS own</span></header><section><p>小红书账号: 49338181231</p><p>0 关注数 6 粉丝数</p></section><section><p>小红书账号: 987654321</p><p>1 关注数 3 粉丝数</p></section>','xiaohongshu','https://creator.xiaohongshu.com/new/home');assert.equal(own.ownIdentity,undefined);checks++;
    own=await idHome('<header><span class=nickname>XHS own</span></header><section><p>小红书账号: 49338181231</p><p>其他资料</p></section>','xiaohongshu','https://creator.xiaohongshu.com/new/home');assert.equal(own.ownIdentity,undefined);checks++;
    const xhsCounters=(rows)=>'<header><span class=nickname>XHS own</span></header><section><p>小红书账号: 49338181231</p>'+rows+'</section>';
    own=await idHome(xhsCounters('<div><span>0</span><span>关注数</span></div><div><span>6</span><span>粉丝数</span></div><div><span>27</span><span>获赞与收藏</span></div>'),'xiaohongshu','https://creator.xiaohongshu.com/new/home');assert.equal(own.metrics.followersCount,6);assert.equal(own.metrics.followingCount,0);assert.equal(own.metrics.likesCount,undefined);checks+=3;
    own=await idHome(xhsCounters('<div>关注数 0</div><div>粉丝数 6</div><div>获赞 27</div>'),'xiaohongshu','https://creator.xiaohongshu.com/new/home');assert.deepEqual(own.metrics,{followingCount:0,followersCount:6,likesCount:27});checks++;
    own=await idHome(xhsCounters('<div>0 关注数 6 粉丝数 27 获赞与收藏</div>'),'xiaohongshu','https://creator.xiaohongshu.com/new/home');assert.equal(own.metrics.followersCount,undefined);checks++;
    for(const wrap of ['article','div class=comment','div role=dialog','div class=note-card','div class=recommend']){const tag=wrap.split(' ')[0];own=await idHome(`<header><span class=nickname>XHS own</span></header><${wrap}><span>XHS own</span><p>小红书账号: 49338181231</p><p>关注数 0 粉丝数 6</p></${tag}>`,'xiaohongshu','https://creator.xiaohongshu.com/new/home');assert.equal(own.ownIdentity,undefined);checks++;}
    for(const url of ['https://creator.xiaohongshu.com/new/note-manager','https://creator.xiaohongshu.com/publish/publish','https://www.xiaohongshu.com/user/profile/abcdef0123456789abcdef01']){own=await idHome('<header><span class=nickname>XHS own</span></header><section><span>XHS own</span><p>小红书账号: 49338181231</p><p>关注数 0 粉丝数 6</p></section>','xiaohongshu',url);assert.equal(own.ownIdentity,undefined);checks++;}
    own=await idHome('<article><div class=user-info><span class=nickname>Other XHS</span><p>小红书号：12345678</p></div></article>','xiaohongshu','https://creator.xiaohongshu.com/home');assert.equal(own.ownIdentity,undefined);checks++;
    await win.webContents.session.protocol.unhandle('https');
    console.log(JSON.stringify({ profileRecognitionChecks: checks, realPlatformData: false }));
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { win.destroy(); app.exit(process.exitCode || 0); }
});
