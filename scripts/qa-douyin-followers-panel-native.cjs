// A synthetic reproduction of the verified undefined-label/placeholder layout.
// Uses disposable sandboxed Electron pages, never the installed user profile.
const path = require('node:path'), root = path.resolve(__dirname, '..');
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const result = require('node:child_process').spawnSync(path.join(root, '.desktop-deps/node_modules/electron/dist/electron.exe'), [__filename, ...process.argv.slice(2)], { cwd: root, env, windowsHide: true, encoding: 'utf8', timeout: 70000 });
  process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || ''); process.exit(result.status ?? 1);
} else {
  const { app, BrowserWindow, session } = require('electron'), fs = require('node:fs'), os = require('node:os'), assert = require('node:assert/strict');
  let moduleRoot = root;
  if (process.argv[2]) { assert.equal(process.argv[2], '--packaged'); moduleRoot = path.join(root, 'release-next/win-unpacked/resources/app.asar'); assert.equal(require('node:crypto').createHash('sha256').update(require('original-fs').readFileSync(moduleRoot)).digest('hex'), process.argv[3]); }
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-followers-panel-qa-'))); app.commandLine.appendSwitch('mute-audio'); app.on('window-all-closed', () => {});
  app.whenReady().then(async () => {
    const { createBrowserReader } = require(path.join(moduleRoot, 'desktop/douyin-browser-reader.cjs'));
    const { initial, readPage } = require(path.join(moduleRoot, 'desktop/douyin-interactions.cjs'));
    const own = '9007199254740993', windows = [], s = session.fromPartition('qa-followers-panel');
    // protocol.handle is local transport and does not emit real HTTP webRequest
    // completion on this Electron build. Deliver that synthetic event explicitly.
    let completed;const onCompleted=s.webRequest.onCompleted.bind(s.webRequest);s.webRequest.onCompleted=(...args)=>{completed=args.at(-1);return onCompleted(...args);};
    let mode = 'placeholder', reader, checks = 0, reads = 0;const fixtureTransportErrors=[];
    const eq = (a, b) => { assert.deepEqual(a, b); checks++; };
    s.protocol.handle('https', request => {try{
      const url = new URL(request.url); eq(url.origin, 'https://www.douyin.com'); eq(request.method, 'GET');
      if (url.pathname.includes('/profile/self/')) return Response.json({ status_code: 0, user: { uid: own, unique_id: 'qa-panel', sec_uid: 'MS4wQaPanel', follower_count: mode.startsWith('empty') ? 0 : mode === 'appended' ? 1203 : 3, aweme_count: 0 } });
      if (['/avatar.webp','/placeholder.webp'].includes(url.pathname)) return new Response(null, { status: 204 });
      if(url.pathname==='/web/api/creator/monetize/active_fans/fans_score_info'){eq(url.searchParams.get('is_pc'),'true');if(mode==='score-denied'){completed?.({webContentsId:windows.at(-1).webContents.id,url:url.href,statusCode:403,method:'GET',resourceType:'fetch'});return new Response(null,{status:403});}return Response.json({title_text:'QA fans index',explanation_info:'QA configuration',content:[]});}
      if (url.pathname === '/fixture-members') { reads++; const index = Number(url.searchParams.get('index'));const person=n=>({uid:String(201+n),nickname:'QA member '+n,sec_uid:'MS4wQaMember'+n,...(mode==='mutual-marked'?{avatarUri:'https://www.douyin.com/avatar.webp'}:{}),...(mode.startsWith('component-avatar')?{avatarUri:'only-an-official-resource-key'}:{}),...(mode==='component-avatar-thumb'?{avatar_thumb:{url_list:['https://www.douyin.com/placeholder.webp']}}:{})});return Response.json(mode==='appended'?Array.from({length:Math.min(100,1203-index*100)},(_,n)=>person(index*100+n)):person(index)); }
      assert.equal(url.pathname, '/user/self');
      const html = `<main><button id="fans">粉丝 ${mode.startsWith('empty') ? 0 : mode === 'appended' ? 1203 : 3}</button><button id="notice">新增粉丝</button></main><script>
      window.actionClicks=0;window.noticeClicks=0;document.querySelector('#notice').onclick=()=>window.noticeClicks++;
      document.querySelector('#fans').onclick=async()=>{${mode.startsWith('score-')?`const score=await fetch('/web/api/creator/monetize/active_fans/fans_score_info?is_pc=true').then(response=>response.status===200?response.json():undefined).catch(()=>undefined);window.scoreTitle=score.title_text;`:''}const box=document.createElement('section');box.innerHTML='<header><span ${mode === 'following' ? 'role="tab" aria-selected="true"' : ''}>关注 (5)</span><span>undefined (${mode.startsWith('empty') ? 0 : 3})</span></header><div id="members"></div><button id="next">下一页</button>';document.body.appendChild(box);
      ${mode.startsWith('initial-scroll')||['mutual-marked','marked-following','marked-other-owner'].includes(mode)?`box.setAttribute('data-e2e','user-fans-container');box.__reactFiber$qa={memoizedProps:{children:{props:{activeTab:${mode==='marked-following'?0:1},isSelf:true,currentUserInfo:{uid:'${mode==='marked-other-owner'?'9007199254740995':own}'},userList:${mode==='initial-scroll-unrendered'?'[{uid:"201"}]':'[]'},searchVal:${mode==='initial-scroll-search'?'"QA"':'""'}}}}};`:''}
      const members=box.querySelector('#members');let index=0;
      ${mode.startsWith('initial-scroll-footer-')?`const footer=document.createElement('footer');footer.setAttribute('data-e2e','user-fans-footer');footer.textContent=${JSON.stringify({'initial-scroll-footer-empty':'','initial-scroll-footer-loading':'','initial-scroll-footer-network':'网络异常','initial-scroll-footer-no-fans':'你还没有粉丝','initial-scroll-footer-login':'请先登录','initial-scroll-footer-verify':'请完成安全验证','initial-scroll-footer-other':'A QA member said 请先登录'}[mode]||'')};if(${JSON.stringify(mode)}==='initial-scroll-footer-loading')footer.appendChild(document.createElement('span'));box.appendChild(footer);`:''}
      const load=async()=>{${mode.startsWith('empty') ? `members.innerHTML='<p>你还没有粉丝</p>';if(${mode==='empty-recommendation'}){const recommendation=document.createElement('a');recommendation.href='/user/MS4wQaRecommendation';recommendation.textContent='QA recommendation';recommendation.__reactFiber$qa={memoizedProps:{user:{uid:'999',sec_uid:'MS4wQaRecommendation',nickname:'QA recommendation'}}};members.appendChild(recommendation);}return;` : ''}
        const value=await fetch('/fixture-members?index='+index).then(response=>response.json());${mode==='appended'?'':'members.innerHTML="";'}for(const user of (Array.isArray(value)?value:[value])){const row=document.createElement('article');row.innerHTML='<div class="photo" style="width:40px;height:40px;${['css-avatar','sibling-avatar'].includes(mode) ? 'background-image:url(https://www.douyin.com/avatar.webp)' : ''}"></div><span>'+${mode === 'wrong-name' ? "'Different rendered name'" : 'user.nickname'}+'</span><div class="operations"><div><span>${mode==='mutual-marked'?'互相关注':'回关'}</span></div><div><span>${mode === 'not-fans' ? '取消关注' : '移除'}</span></div></div>';
        ${mode==='appended'?`const details=document.createElement('div');details.className='details';while(row.firstChild)details.appendChild(row.firstChild);row.appendChild(details);for(let a=0;a<2;a++){const link=document.createElement('a');link.href='/user/'+user.sec_uid;link.textContent=user.nickname;row.appendChild(link);}`:''}if(${JSON.stringify(mode)}==='sibling-avatar'){const label=row.querySelector('span'),link=document.createElement('a');link.href='/user/'+user.sec_uid;link.textContent=user.nickname;label.replaceWith(link);}row.__reactFiber$qa={memoizedProps:{user}};
        ${mode.startsWith('component-avatar')?`const photo=row.querySelector('.photo');if(${JSON.stringify(mode)}!=='component-avatar-unmarked')photo.setAttribute('data-e2e','live-avatar');const avatarProps={src:${mode==='component-avatar-unsafe'?JSON.stringify('javascript:alert(1)'):JSON.stringify('//www.douyin.com/avatar.webp')},alt:${mode==='component-avatar-wrong-alt'?JSON.stringify('Other member头像'):'user.nickname+"头像"'},uid:${mode==='component-avatar-foreign'?JSON.stringify('999'):'user.uid'}};photo.__reactFiber$qa={memoizedProps:{'data-e2e':'live-avatar'},return:{memoizedProps:avatarProps,return:${mode==='component-avatar-ambiguous'?`{memoizedProps:{...avatarProps,src:'https://www.douyin.com/different.webp'}}`:'null'}}};if(${JSON.stringify(mode)}==='component-avatar-css')photo.style.backgroundImage='url(https://www.douyin.com/placeholder.webp)';`:''}
        for(const button of row.querySelectorAll('button'))button.onclick=()=>window.actionClicks++;members.appendChild(row);}index++;
        ${mode === 'ambiguous' ? `if(!document.querySelector('#duplicate')){const other=box.cloneNode(true);other.id='duplicate';document.body.appendChild(other);}` : ''}
      };box.querySelector('#next').onclick=load;${mode.startsWith('initial-scroll')?`window.initialScrolls=0;box.addEventListener('scroll',()=>{if(index===0){window.initialScrolls++;${mode==='initial-scroll'?'load();':''}}});`:'load();'}};</script>`;
      return new Response(html, { headers: { 'content-type': 'text/html;charset=utf-8' } });
    }catch(error){fixtureTransportErrors.push(String(error));return new Response(null,{status:500});}});
    const options = { accountSession: s, publicHandle: 'qa-panel', assertCurrent: async () => {} };
    function make() {
      reader = createBrowserReader({ requireFollowerResponses: true, serviceWaitMs: 10, createWindow: source => {
        const win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { session: source, preload: path.join(moduleRoot, 'desktop/douyin-followers-preload.cjs'), additionalArguments: ['--matrix-follower-dom-only'], sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } }); windows.push(win); return win;
      } });
    }
    try {
      await s.cookies.set({ url: 'https://www.douyin.com/', domain: '.douyin.com', name: 'sessionid', value: 'QA_ONLY', path: '/', secure: true });
      for (const current of ['initial-scroll','component-avatar','component-avatar-css','component-avatar-thumb','component-avatar-wrong-alt','component-avatar-foreign','component-avatar-ambiguous','component-avatar-unsafe','component-avatar-unmarked','placeholder', 'score-header', 'mutual-marked', 'css-avatar', 'sibling-avatar', 'empty', 'empty-recommendation', 'appended']) {
        mode = current; make(); const client = await reader.acquire(options); let state = initial('followers'), result; const rows = [], before = reads;
        for (let index = 0; index < (mode.startsWith('empty') ? 1 : mode === 'appended' ? 13 : 3); index++) { result = await readPage(client, state); state = result.next; rows.push(...result.records); }
        eq(result.complete, true); eq(result.followerRosterVerified, true); eq(result.currentFollowerIds, mode.startsWith('empty') ? [] : mode === 'appended' ? Array.from({length:1203},(_,n)=>String(201+n)) : ['201', '202', '203']);
        eq(reads - before, mode.startsWith('empty') ? 0 : mode === 'appended' ? 13 : 3);
        if(mode==='initial-scroll')eq(await windows.at(-1).webContents.executeJavaScript('window.initialScrolls'),1);
        if(mode==='appended')eq(await windows.at(-1).webContents.executeJavaScript('window.__matrixFollowerObserved.domCandidateCards'),500);
        eq(rows.every(row => ['component-avatar','component-avatar-css','component-avatar-thumb','css-avatar','mutual-marked','sibling-avatar'].includes(mode) ? row.avatarUrl === 'https://www.douyin.com/avatar.webp' : !row.avatarUrl), true);
        eq(await windows.at(-1).webContents.executeJavaScript('window.actionClicks'), 0); eq(await windows.at(-1).webContents.executeJavaScript('window.noticeClicks'), 0);
        client.close(); reader.close();
      }
      for (const current of ['following', 'score-denied', 'marked-following', 'marked-other-owner', 'not-fans', 'wrong-name', 'ambiguous']) {
        mode = current; make(); const client = await reader.acquire(options);
        await assert.rejects(() => client.readWeb('followers', { cursor: '0', offset: '0', sourceType: '1' }), current==='score-denied'?/HTTP 403/:(current === 'following'||current === 'marked-following') ? /关注列表/ : current === 'marked-other-owner' ? /编号不一致/ : current === 'ambiguous' ? /不唯一/ : /尚未加载|尚未识别|等待/); checks++;
        eq(await windows.at(-1).webContents.executeJavaScript('window.actionClicks'), 0); eq(await windows.at(-1).webContents.executeJavaScript('window.noticeClicks'), 0);
        client.close(); reader.close();
      }
      for(const current of ['initial-scroll-stalled','initial-scroll-search','initial-scroll-unrendered']){
        mode=current;make();const client=await reader.acquire(options),before=reads;
        const result=await readPage(client,initial('followers'));eq(result.followerPending,true);eq(result.complete,false);eq(result.records,[]);eq(reads,before);
        eq(await windows.at(-1).webContents.executeJavaScript('window.initialScrolls'),mode==='initial-scroll-stalled'?1:0);
        const again=await readPage(client,result.next);eq(again.followerPending,true);eq(await windows.at(-1).webContents.executeJavaScript('window.initialScrolls'),mode==='initial-scroll-stalled'?1:0);
        eq(client.diagnosticSnapshot().stats.followerInitialScrolls,mode==='initial-scroll-stalled'?1:0);eq(client.diagnosticSnapshot().stats.followerPanelUserListCount,mode==='initial-scroll-unrendered'?1:0);
        client.close();reader.close();
      }
      for(const [current,mask]of [['empty',1],['loading',65],['network',4],['no-fans',2],['other',0],['login',8],['verify',16]]){
        mode='initial-scroll-footer-'+current;make();const client=await reader.acquire(options),before=reads;
        if(current==='login'||current==='verify'){await assert.rejects(()=>readPage(client,initial('followers')),current==='verify'?/完成.*验证/:/先登录/);checks++;}
        else {const result=await readPage(client,initial('followers'));eq(result.followerPending,true);eq(result.complete,false);eq(result.records,[]);}
        const stats=client.diagnosticSnapshot().stats;eq(stats.followerDomFooterCount,1);eq(stats.followerDomFooterStateMask,mask);eq(stats.followerDomPanelChildCount,4);eq(reads,before);
        if(windows.at(-1).isDestroyed())eq(current,'verify');else {eq(await windows.at(-1).webContents.executeJavaScript('window.actionClicks'),0);eq(await windows.at(-1).webContents.executeJavaScript('window.noticeClicks'),0);}client.close();reader.close();
      }
      eq(fixtureTransportErrors,[]);
      console.log(JSON.stringify({ followerPanelNativeChecks: checks, undefinedLabelNeverUsedAsIdentity: true, exactOwnFansEntryAndFollowerRowControlsRequired: true, noImagePlaceholderRowsSupported: true, suppliedCssAvatarOnly: true, suppliedAvatarComponentSrcPreferred:true,wrongAltForeignUidAndAmbiguousSourcesRejected:true,resourceKeysNotTurnedIntoGuessedUrls:true,followingAndAmbiguousPanelsRejected: true, zeroCountRequiresExplicitEmptyFansFooter: true, realProfileTouched: false, realPlatformRequests: 0, readReceipts: 0, followerActions: 0 }));
    } catch (error) { console.error(mode, error); process.exitCode = 1; } finally { reader?.close(); for (const win of windows) if (!win.isDestroyed()) win.destroy(); app.exit(process.exitCode || 0); }
  });
}
