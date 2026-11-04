// Actual sandboxed Electron preload + first inline fetch/XHR, synthetic HTTPS
// plus one loopback-only HTTP redirect. No real accounts/platform requests.
const path = require('node:path'), root = path.resolve(__dirname, '..');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const r = require('node:child_process').spawnSync(path.join(root, '.desktop-deps/node_modules/electron/dist/electron.exe'), [__filename], { cwd: root, env, windowsHide: true, encoding: 'utf8', timeout: 90000 });
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || ''); process.exit(r.status ?? 1);
} else {
  const { app, BrowserWindow, session } = require('electron'), fs = require('node:fs'), os = require('node:os'), assert = require('node:assert/strict');
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-creator-response-'))); app.commandLine.appendSwitch('mute-audio');
  app.whenReady().then(async () => {
    let checks = 0, reader; const windows = [], requests = [], eq = (a, b) => { assert.deepEqual(a, b); checks++; };
    const own = '9007199254740993', work = '9007199254740000100', work2 = '9007199254740000101', comment = '9007199254740000200', peer = '9007199254740995', longCursor = '9007199254740994';
    const source = session.fromPartition('qa-creator-normal-response'), workPath = '/janus/douyin/creator/pc/work_list', commentPath = '/web/api/third_party/aweme/api/comment/read/aweme/v1/web/comment/list/select/';
    const workQuery = workPath + '?status=0&scene=star_atlas&count=12&max_cursor=';
    const legacyReference = 'qa.official-summary-reference', legacyPath = '/aweme/v1/creator/comment/list'; let raceRequests = 0;
    const encryptedComment = 'qa.encrypted-comment+reference/==', encryptedPeer = 'qa.encrypted-author+reference/==', encryptedReply = 'qa.encrypted-reply+reference/==';
    const json = value => Response.json(value);
    // Electron 44 protocol.handle + webRequest can expose the initial 302
    // status alongside the final JSON body. Do not teach the product to trust
    // that malformed response. Exercise a real 302 -> 200 on loopback and pass
    // its final response through the synthetic HTTPS endpoint instead.
    const redirectRequests=[];
    const redirectServer=require('node:http').createServer((req,res)=>{
      redirectRequests.push(req.url);
      if(req.method!=='GET'){res.writeHead(405);res.end();return;}
      if(req.url==='/redirect'){res.writeHead(302,{Location:'/summary'});res.end();return;}
      if(req.url==='/summary'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({status_code:0,item_list:[{item_id:work,sec_item_id:legacyReference}]}));return;}
      res.writeHead(404);res.end();
    });
    await new Promise((resolve,reject)=>{redirectServer.once('error',reject);redirectServer.listen(0,'127.0.0.1',resolve);});
    const commentMarkup = '<div role="tab" aria-selected="true">评论管理</div><div class="comment-item-qa"><button class="load-reply-qa">查看1条回复</button></div><button aria-label="下一页">下一页</button><span class="back-text-qa">内容管理</span>';
    const mountComment = `window.mountComment=(id,selected=true)=>{document.body.innerHTML=${JSON.stringify(commentMarkup)};const tab=document.querySelector('[role=tab]');tab.setAttribute('aria-selected',String(selected));const load=()=>fetch('${commentPath}?aweme_id='+id+'&cursor=0');if(selected)load();tab.onclick=()=>{tab.setAttribute('aria-selected','true');load();};const row=document.querySelector('.comment-item-qa');row.__reactFiber$fixture={memoizedProps:{comment:{cid:'${comment}',text:'QA根评论'}}};document.querySelector('button').onclick=()=>{const x=new XMLHttpRequest();x.open('GET','/aweme/v1/creator/comment/reply/list?comment_id=${comment}&cursor=0');x.send();};document.querySelector('[aria-label]').onclick=()=>fetch('${commentPath}?aweme_id='+id+'&cursor=${longCursor}');document.querySelector('span').onclick=()=>{history.pushState(null,'','/creator-micro/content/manage');window.mountCards();};};`;
    const mountCards = `window.mountCards=()=>{document.body.innerHTML='<button aria-label="下一页">下一页</button>';document.querySelector('button').onclick=()=>fetch('${workQuery}${longCursor}');for(const id of ['${work}','${work2}']){const row=document.createElement('div');row.className='video-card-content-qa';row.__reactFiber$fixture={memoizedProps:{item:{aweme_id:id,author:{uid:'${own}'}}}};row.innerHTML='<span>评论</span>';row.querySelector('span').onclick=()=>{const url='/creator-micro/work-management/work-detail/'+id+'?enter_from=content'+(id==='${work2}'?'':'&tabKey=commentManagement');if(id==='${work2}')window.open(url,'_blank');else{history.pushState(null,'',url);window.mountComment(id);}};document.body.append(row);}};`;
    source.protocol.handle('https', req => {
      const u = new URL(req.url); assert.equal(u.origin, 'https://creator.douyin.com'); requests.push([req.method, u.pathname]);
      if(u.pathname==='/qa-rendered-comment.png')return new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64'),{headers:{'content-type':'image/png'}});
      if(u.pathname==='/aweme/v1/creator/user/info/')return json({status_code:0,uid:own,user_profile:{unique_id:'qa-own'},privateToken:'QA_DO_NOT_PROJECT_IDENTITY'});
      if (u.pathname === workPath) {
        const cursor = u.searchParams.get('max_cursor') || '0';
        if(u.searchParams.get('count')!=='12')return json({status_code:0,aweme_list:[{item_id:work}],has_more:true,max_cursor:'0'});
        if (u.searchParams.get('status') === '4') return json({ status_code: 0, aweme_list: [], has_more: true, max_cursor: '0' });
        if (u.searchParams.get('status') === '3') return json({ status_code: 5 });
        if (u.searchParams.get('qa_phase') === 'bootstrap' || cursor === '25') return json({ status_code: 0, aweme_list: ['23', '25'].includes(cursor) ? [{ item_id: work }] : [], has_more: true, max_cursor: cursor === '24' ? longCursor : cursor });
        if (cursor === '26') return json({ status_code: 5, status_msg: '请先登录' });
        if (cursor === '10') return json({ status_code: 5, aweme_list: [], has_more: false, max_cursor: '0' });
        if (cursor === '11') return json({ status_code: 0, aweme_list: [], max_cursor: '0' });
        if (cursor === '12') return json({ status_code: 0, aweme_list: [], has_more: true });
        if (cursor === '13') return json({ status_code: 0, aweme_list: null, has_more: false, max_cursor: '0' });
        if (cursor === '14') return json({ status_code: 0, aweme_list: [{ item_id: work, author: { uid: peer } }], has_more: false, max_cursor: '0' });
        if (cursor === '15') return json({ status_code: 0, aweme_list: [], has_more: false });
        if (cursor === '16') return json({ status_code: 0, aweme_list: [{ item_id: 0.5 }], has_more: false });
        if(cursor==='27')return new Response('{"status_code":0,"aweme_list":[{"item_id":'+work+',"desc":"QA literal '+work+'"}],"has_more":false,"max_cursor":0}',{headers:{'content-type':'application/json'}});
        if(cursor==='28')return new Response('{'+work+':1,"status_code":0,"aweme_list":[],"has_more":false,"max_cursor":0}',{headers:{'content-type':'application/json'}});
        if (cursor === '17') return json({ aweme_list: [], has_more: false });
        if (cursor === '18') { const first = ++raceRequests === 1; const result = { status_code: first ? 0 : 5, aweme_list: [], has_more: false }; return first ? new Promise(resolve => setTimeout(() => resolve(json(result)), 120)) : json(result); }
        if (cursor === '19') return json({ status_code: 0, data: { status_code: 5, aweme_list: [], has_more: false } });
        if (cursor === '20') return json({ status_code: 5, status_msg: '请先登录', aweme_list: [], has_more: false });
        if (cursor === '21') return json({ status_code: 5, status_msg: 'cookie=qa-private; token=qa-secret; https://private.test/' });
        return json({ status_code: 0, aweme_list: [{ item_id: cursor === '0' ? work : work2, desc: 'QA 本人作品',metrics:{play_count:cursor==='0'?'1200':cursor==='29'?'1.2万':cursor==='30'?null:0,comment_count:cursor==='0'?'12':cursor==='29'?'1.2万':cursor==='30'?-1:0,private_field:'PRIVATE_NOT_PROJECTED'} }], has_more: cursor === '0', max_cursor: cursor === '0' ? longCursor : '0' });
      }
      if(u.pathname===commentPath&&u.searchParams.has('qa_numeric'))return new Response('{"status_code":0,"comments":[{"cid":'+comment+',"aweme_id":'+work+',"text":'+JSON.stringify('QA quoted '+work+' \\"literal\\"')+',"user":{"uid":'+peer+',"nickname":"QA昵称"},"reply_comment_total":0}],"has_more":false,"cursor":0}',{headers:{'content-type':'application/json'}});
      if(u.pathname===commentPath&&u.searchParams.has('qa_media')){const mode=u.searchParams.get('qa_media'),url='https://p1.byteimg.com/qa-sticker.gif',media=mode==='camel'?{imageList:[{originUrl:{urlList:[url]}}]}:mode==='serialized'?{stickerInfo:JSON.stringify({animateUrl:url,skey:'PRIVATE_MEDIA_KEY'})}:mode==='missing'?{sticker:{id:'PRIVATE_MEDIA_ID',skey:'PRIVATE_MEDIA_KEY'}}:{sticker:{url_list:[url],skey:'PRIVATE_MEDIA_KEY'}};return json({status_code:0,comments:[{cid:comment,text:'[图片表情]',user:{uid:peer},...media,reply_comment_total:1,reply_comment:[{cid:'9007199254740000290',text:'[图片表情]',user:{uid:peer},...media}]}],has_more:false,cursor:0});}
      if (u.pathname === commentPath) { const first = u.searchParams.get('cursor') === '0'; return json({ status_code: 0, comments: [{ cid: u.searchParams.has('qa_opaque') ? encryptedComment : first ? comment : '9007199254740000203', text: 'QA根评论', image_list:[{origin_url:{url_list:['https://p1.byteimg.com/qa-comment.gif']},thumb_url:{url_list:['https://p1.byteimg.com/qa-comment-thumb.jpg']},skey:'PRIVATE_NEVER_EXPORTED'}], user: { uid: peer, nickname: 'QA昵称' }, reply_comment_total: first ? 1 : 0, ...(u.searchParams.has('qa_preview') ? { reply_comment: [{ cid: '9007199254740000290', text: 'QA新版内嵌回复', user: { uid: peer, nickname: 'QA回复昵称' } }] } : {}) }], has_more: first, cursor: first ? longCursor : '0' }); }
      if (u.pathname === '/aweme/v1/creator/comment/reply/list') return json({ status_code: 0, comment_info_list: [{ comment_id: u.searchParams.get('comment_id') === encryptedComment ? encryptedReply : '9007199254740000201', text: 'QA子评论', user_info: { user_id: u.searchParams.get('comment_id') === encryptedComment ? encryptedPeer : peer, screen_name: 'QA子昵称' } }], has_more: false, cursor: '0' });
      if (u.pathname.replace(/\/$/, '') === '/web/api/creator/data/item/summarize') {
        if(u.searchParams.has('qa_unresolved_redirect'))return new Response(JSON.stringify({status_code:0,item_list:[{item_id:work,sec_item_id:legacyReference}]}),{status:302,headers:{'content-type':'application/json'}});
        if (u.searchParams.has('qa_redirect')) return fetch('http://127.0.0.1:'+redirectServer.address().port+'/redirect').then(response=>{assert.equal(response.status,200);assert.equal(response.redirected,true);return response;});
        if (u.searchParams.has('qa_summary_error')) return json({ status_code: 5, status_msg: '请求参数错误' });
        if (u.searchParams.has('qa_secret_error')) return json({ status_code: 5, status_msg: 'cookie=qa-private; token=qa-secret' });
        const variant=u.searchParams.get('qa_summary_variant');if(variant){const ref='qa.summary-'+variant,row={item_id:work,sec_item_id:ref};if(variant==='numeric')return new Response('{"status_code":0,"item_list":[{"item_id":'+work+',"sec_item_id":'+JSON.stringify(ref)+'}]}',{headers:{'content-type':'application/json'}});return json({status_code:0,item_list:variant==='opaque'?[{item_id:ref,sec_item_id:ref}]:variant==='multiple'?[{item_id:work2,sec_item_id:'qa.other-summary'},row]:variant==='duplicate'?[row,row]:variant==='wrong'?[{item_id:work2,sec_item_id:ref}]:variant==='mismatchedOpaque'?[{item_id:'qa.other-opaque',sec_item_id:ref}]:variant==='unsafe'?[{item_id:9007199254740994,sec_item_id:ref}]:[]});}
        return json({ status_code: 0, item_list: [{ item_id: work, ...(!u.searchParams.has('qa_missing_ref') ? { sec_item_id: legacyReference } : {}) }] });
      }
      if (u.pathname === legacyPath) {
        if (u.searchParams.get('item_id') === work) return new Promise(resolve => setTimeout(() => resolve(json({ status_code: 5, status_msg: '参数不合法' })), 120));
        if(u.searchParams.has('qa_ref'))return json({status_code:0,comment_info_list:[{comment_id:u.searchParams.get('qa_ref'),text:'QA旧版标识格式',user_info:{user_id:u.searchParams.get('qa_ref'),screen_name:'QA昵称'},reply_count:0}],has_more:false,cursor:'0'});
        return json({ status_code: 0, comment_info_list: [{ comment_id: u.searchParams.has('qa_opaque') ? encryptedComment : '9007199254740000204', text: 'QA旧作品评论', user_info: { user_id: u.searchParams.get('qa_author') === 'missing' ? undefined : u.searchParams.get('qa_author') === 'invalid' ? 'invalid; unsafe' : u.searchParams.has('qa_opaque') ? encryptedPeer : peer, screen_name: 'QA旧作品昵称' }, reply_count: u.searchParams.has('qa_opaque') ? 1 : 0, ...(u.searchParams.has('qa_preview') ? { reply_list: [{ comment_id: encryptedReply, text: 'QA完整内嵌回复', user_info: { user_id: encryptedPeer, screen_name: 'QA回复昵称' } }] } : {}) }], has_more: false, cursor: '0' });
      }
      let html;
      if (u.pathname === '/creator-micro/content/manage') html = `<button aria-label="下一页">下一页</button><script>window.firstObserver=!!window.__matrixCreatorObservedPages;window.firstFetch=fetch('${workQuery}0').then(r=>r.json());${mountComment}${mountCards}window.mountCards();window.bootstrapWorks=async n=>{await fetch('${workQuery}'+n+'&qa_phase=bootstrap').then(r=>r.json());setTimeout(()=>fetch('${workQuery}'+n),350);await new Promise(r=>setTimeout(r,30));};</script>`;
      else {
        const target = u.pathname.split('/').at(-1); assert.ok([work, work2].includes(target));
        html = `<body><script>window.firstObserver=!!window.__matrixCreatorObservedPages;${mountComment}${mountCards}window.mountComment('${target}',${u.searchParams.get('tabKey') === 'commentManagement'});</script>`;
      }
      return new Response(html, { headers: { 'content-type': 'text/html;charset=utf-8', 'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'; connect-src 'self'" } });
    });
    const createWindow = s => { const w = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { session: s, preload: path.join(root, 'desktop/douyin-creator-preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } }); windows.push(w); return w; };
    try {
      const { createCreatorReader, creatorPage, navigateOwnedComment } = require('../desktop/douyin-creator-reader.cjs');
      reader = createCreatorReader({ acquireIdentity: async () => ({ ownUid: own, verify: async () => {}, check: async () => {}, close() {} }), createWindow, waitMs: 5, requireResponses: true });
      const client = await reader.acquire({ accountSession: source, publicHandle:'qa-own',assertCurrent: async () => {} });
      eq(await windows[0].webContents.executeJavaScript('window.firstObserver'), true);
      eq(await windows[0].webContents.executeJavaScript('window.firstFetch.then(r=>r.aweme_list[0].item_id)'), work);
      const a = await client.readWeb('works', { cursor: '0' }); eq(a.aweme_list[0].aweme_id, work); eq(a.aweme_list[0].author.uid, own); eq(a.max_cursor, longCursor); eq(a.has_more, true);
      const b = await client.readWeb('works', { cursor: longCursor }); eq(b.aweme_list[0].aweme_id, work2); eq(b.has_more, false);
      eq(a.aweme_list[0].metrics,{comment_count:12,play_count:1200});eq(b.aweme_list[0].metrics,{comment_count:0,play_count:0});eq(Number.isFinite(Date.parse(a.aweme_list[0].metrics_observed_at)),true);eq(JSON.stringify(a).includes('PRIVATE_NOT_PROJECTED'),false);
      for(const cursor of ['29','30']){await windows[0].webContents.executeJavaScript(`fetch('${workQuery}${cursor}').then(r=>r.json()).then(()=>new Promise(r=>setTimeout(r,30)))`);eq((await client.readWeb('works',{cursor})).aweme_list[0].metrics,undefined);}
      await windows[0].webContents.executeJavaScript(`(()=>{const unused=new XMLHttpRequest();unused.open('GET','${workQuery}0');})()`);
      eq((await client.readWeb('works', { cursor: '0' })).aweme_list[0].aweme_id, work);
      // Official scheduled-preview/failed-tab responses must not replace the
      // all-works inventory at the same cursor. No privilege/signature changes.
      for (const params of ['status=4&scene=star_atlas&count=12', 'status=3&scene=star_atlas&count=12', 'status=0&scene=mix&count=12', 'scene=star_atlas&count=12','status=0&scene=star_atlas&count=1','status=0&scene=star_atlas&count=18','status=0&scene=star_atlas','status=0&scene=star_atlas&count=12&count=1']) {
        await windows[0].webContents.executeJavaScript(`fetch('${workPath}?${params}&max_cursor=0').then(r=>r.json()).then(()=>new Promise(r=>setTimeout(r,30)))`);
        eq((await client.readWeb('works', { cursor: '0' })).aweme_list[0].aweme_id, work);
      }
      for (const n of [22, 23, 24]) {
        await windows[0].webContents.executeJavaScript(`window.bootstrapWorks(${n})`);
        const pending = await windows[0].webContents.executeJavaScript(`(${creatorPage.toString()})(${JSON.stringify({ kind: 'works', ownUid: own, cursor: String(n), requireResponses: true })})`);
        eq(pending.waiting, true); eq(/分页待就绪/.test(pending.detail), true);
        const before = requests.length, settled = await client.readWeb('works', { cursor: String(n) });
        eq(settled.aweme_list[0].aweme_id, work2); eq(settled.has_more, false);
        eq(requests.length - before, 1); // Only the fixture website's scheduled GET.
      }
      await windows[0].webContents.executeJavaScript('window.bootstrapWorks(26)');
      await assert.rejects(() => client.readWeb('works', { cursor: '26' }), /平台码 5.*请先登录/); checks++;
      const c = await client.readWeb('comments', { workId: work, cursor: '0' }); eq(c.comments[0].user.nickname, 'QA昵称'); eq(c.has_more, true); eq(c.cursor, longCursor);
      eq(c.comments[0].image_list,[{url_list:['https://p1.byteimg.com/qa-comment.gif','https://p1.byteimg.com/qa-comment-thumb.jpg']}]);eq(JSON.stringify(c).includes('PRIVATE_NEVER_EXPORTED'),false);
      const c2 = await client.readWeb('comments', { workId: work, cursor: longCursor }); eq(c2.comments[0].cid, '9007199254740000203'); eq(c2.has_more, false);
      for(const mode of ['camel','serialized','sticker','missing']){
        await windows[1].webContents.executeJavaScript(`fetch('${commentPath}?aweme_id=${work}&cursor=0&qa_media=${mode}').then(r=>r.json()).then(()=>new Promise(r=>setTimeout(r,50)))`);
        const media=await client.readWeb('comments',{workId:work,cursor:'0'});eq(JSON.stringify(media).includes('PRIVATE_MEDIA'),false);
        for(const row of [media.comments[0],media.comments[0].reply_comment[0]]){if(mode==='missing'){eq(row.image_list,undefined);eq(row.imageReadHint.includes('sticker=object'),true);}else eq(row.image_list,[{url_list:['https://p1.byteimg.com/qa-sticker.gif']}]);}
      }
      // Exact rendered comment attachments may hydrate after the normal GET.
      // An unrelated row or avatar must never become this comment's image.
      const hydrated='https://creator.douyin.com/qa-rendered-comment.png';
      await windows[1].webContents.executeJavaScript(`(()=>{const node=document.querySelector('.comment-item-qa');node.__reactFiber$fixture.memoizedProps.comment.text='[图片表情]';node.style.cssText='display:block;width:200px;height:100px';node.insertAdjacentHTML('beforeend','<img alt="头像" src="${hydrated}?avatar" width="30" height="30"><img alt="图片表情" src="${hydrated}" width="30" height="30">');})()`);
      const renderedMedia=await client.readWeb('comments',{workId:work,cursor:'0'});eq(renderedMedia.comments[0].image_list,[{url_list:[hydrated]}]);eq(renderedMedia.comments[0].reply_comment[0].image_list,undefined);
      await windows[1].webContents.executeJavaScript(`document.querySelector('.comment-item-qa').__reactFiber$fixture.memoizedProps.comment.cid='999';true`);
      eq((await client.readWeb('comments',{workId:work,cursor:'0'})).comments[0].image_list,undefined);
      await windows[1].webContents.executeJavaScript(`const node=document.querySelector('.comment-item-qa');node.__reactFiber$fixture.memoizedProps.comment.cid='${comment}';node.__reactFiber$fixture.memoizedProps.comment.text='changed';true`);
      eq((await client.readWeb('comments',{workId:work,cursor:'0'})).comments[0].image_list,undefined);
      await windows[1].webContents.executeJavaScript(`document.querySelectorAll('.comment-item-qa img').forEach(i=>i.remove());true`);
      await windows[1].webContents.executeJavaScript(`fetch('${commentPath}?aweme_id=${work}&cursor=0&qa_numeric=1').then(r=>r.json())`);
      const numeric=await client.readWeb('comments',{workId:work,cursor:'0'});eq(numeric.comments[0].cid,comment);eq(numeric.comments[0].user.uid,peer);eq(numeric.comments[0].text,'QA quoted '+work+' \\"literal\\"');eq(numeric.comments[0].aweme_id,work);
      const d = await client.readWeb('replies', { workId: work, commentId: comment, cursor: '0' }); eq(d.comments[0].user.nickname, 'QA子昵称'); eq(d.has_more, false);
      eq(await windows[1].webContents.executeJavaScript('window.firstObserver'), true);
      eq(requests.some(([, route]) => route.startsWith('/creator-micro/work-management/work-detail/')), false);
      eq((await client.readWeb('comments', { workId: work2, cursor: '0' })).comments[0].aweme_id, work2);
      eq(windows.length, 2); eq(new URL(windows[1].webContents.getURL()).pathname.endsWith('/' + work2), true);
      eq(new URL(windows[1].webContents.getURL()).searchParams.has('tabKey'), false);
      eq(await windows[1].webContents.executeJavaScript("document.querySelector('[role=tab]').getAttribute('aria-selected')"), 'true');
      const beforePopups = requests.length;
      for (const url of ['https://untrusted.invalid/', 'https://creator.douyin.com/creator-micro/work-management/work-detail/' + work + '?tabKey=commentManagement', 'https://creator.douyin.com/creator-micro/work-management/work-detail/' + work2 + '?tabKey=commentManagement&mark_read=1']) {
        await windows[1].webContents.executeJavaScript(`window.open(${JSON.stringify(url)},'_blank');true`);
      }
      eq(requests.length, beforePopups); eq(windows.length, 2);
      eq((await client.readWeb('comments', { workId: work, cursor: '0' })).comments[0].aweme_id, work);
      await windows[1].webContents.executeJavaScript(`(async()=>{const old=fetch('${legacyPath}?item_id=${work}&cursor=0');await fetch('/web/api/creator/data/item/summarize?item_id=${work}').then(r=>r.json());await fetch('${legacyPath}?item_id=${legacyReference}&cursor=0').then(r=>r.json());await old;await new Promise(r=>setTimeout(r,40));})()`);
      const legacy = await client.readWeb('comments', { workId: work, cursor: '0' }); eq(legacy.comments[0].user.nickname, 'QA旧作品昵称'); eq(legacy.has_more, false);
      await windows[1].webContents.executeJavaScript(`fetch('${legacyPath}?item_id=qa.unproven-reference&cursor=0').then(r=>r.json())`);
      await assert.rejects(() => client.readWeb('comments', { workId: work, cursor: '0' }), /摘要关联/); checks++;
      // Official cached-summary variant: the selected rendered component has
      // the exact numeric work + opaque reference pair. No extra summary GET.
      const renderedProof = { itemId: work, commentItemId: 'qa.cached-summary-reference', resolvingItemId: false, newComment: false };
      const cached = async (props, setup = '') => windows[1].webContents.executeJavaScript(`(async()=>{document.querySelector('.comment-item-qa').__reactFiber$fixture={memoizedProps:${JSON.stringify(props)}};${setup};await fetch('${legacyPath}?item_id=qa.cached-summary-reference&cursor=0').then(r=>r.json());await new Promise(r=>setTimeout(r,250));})()`);
      for (const bad of [{ ...renderedProof, itemId: work2 }, { ...renderedProof, resolvingItemId: true }, { ...renderedProof, newComment: true }, { ...renderedProof, commentItemId: 'qa.other-reference' }]) {
        await cached(bad);
        await assert.rejects(() => client.readWeb('comments', { workId: work, cursor: '0' }), /摘要关联.*作品摘要/); checks++;
      }
      await cached(renderedProof, `document.querySelector('.comment-item-qa').style.visibility='hidden'`);
      await assert.rejects(() => client.readWeb('comments', { workId: work, cursor: '0' }), /摘要关联/); checks++;
      await windows[1].webContents.executeJavaScript(`document.querySelector('.comment-item-qa').style.visibility='visible'`);
      await cached(renderedProof, `document.querySelector('.comment-item-qa').__reactFiber$fixture.return={memoizedProps:${JSON.stringify({ ...renderedProof, commentItemId: 'qa.conflicting-reference' })}}`);
      await assert.rejects(() => client.readWeb('comments', { workId: work, cursor: '0' }), /摘要关联/); checks++;
      await cached(renderedProof);
      eq((await client.readWeb('comments', { workId: work, cursor: '0' })).comments[0].user.nickname, 'QA旧作品昵称');
      eq(await windows[1].webContents.executeJavaScript(`window.__matrixCreatorObservedPages.summaries.get('${work}')`), '官网已选中评论组件关联作品引用');
      // No root rows exist yet, but the selected tab's visible controlled
      // panel already carries the exact official legacy component props.
      await windows[1].webContents.executeJavaScript(`(()=>{const panel=document.createElement('section');panel.id='qa-active-comment-panel';panel.style.minHeight='20px';panel.__reactFiber$fixture={memoizedProps:${JSON.stringify({...renderedProof,commentItemId:'qa.panel-summary-reference'})}};document.body.append(panel);document.querySelector('[role=tab]').setAttribute('aria-controls',panel.id);document.querySelector('.comment-item-qa').__reactFiber$fixture=undefined;})()`);
      await windows[1].webContents.executeJavaScript(`fetch('${legacyPath}?item_id=qa.panel-summary-reference&cursor=0').then(r=>r.json())`);
      eq((await client.readWeb('comments',{workId:work,cursor:'0'})).comments[0].user.nickname,'QA旧作品昵称');
      await windows[1].webContents.executeJavaScript(`(()=>{const panel=document.querySelector('#qa-active-comment-panel');panel.__reactFiber$fixture=undefined;fetch('${legacyPath}?item_id=qa.delayed-summary-reference&cursor=0');setTimeout(()=>{panel.__reactFiber$fixture={memoizedProps:${JSON.stringify({...renderedProof,commentItemId:'qa.delayed-summary-reference'})}};},700);})()`);
      eq((await client.readWeb('comments',{workId:work,cursor:'0'})).comments[0].user.nickname,'QA旧作品昵称');
      await windows[1].webContents.executeJavaScript(`document.querySelector('#qa-active-comment-panel').remove();document.querySelector('[role=tab]').removeAttribute('aria-controls');`);
      await windows[1].webContents.executeJavaScript(`(async()=>{await fetch('${legacyPath}?item_id=qa.cached-summary-reference&cursor=0&qa_opaque=1').then(r=>r.json());const row=document.querySelector('.comment-item-qa');row.__reactFiber$fixture={memoizedProps:{comment:{comment_id:${JSON.stringify(encryptedComment)},text:'QA旧作品评论'}}};row.querySelector('button').onclick=()=>fetch('/aweme/v1/creator/comment/reply/list?comment_id='+encodeURIComponent(${JSON.stringify(encryptedComment)})+'&cursor=0');await new Promise(r=>setTimeout(r,30));})()`);
      const encrypted = await client.readWeb('comments', { workId: work, cursor: '0' });
      eq(encrypted.comments[0].cid, encryptedComment); eq(encrypted.comments[0].user.uid, encryptedPeer); eq(encrypted.comments[0].referenceKind, 'legacy');
      eq(encrypted.comments[0].user.nickname, 'QA旧作品昵称'); eq(encrypted.comments[0].reply_comment_total, 1);
      await assert.rejects(() => client.readWeb('replies', { workId: work, commentId: 'qa.unobserved-comment', cursor: '0' }), /不属于.*根评论/); checks++;
      const encryptedChild = await client.readWeb('replies', { workId: work, commentId: encryptedComment, cursor: '0' });
      eq(encryptedChild.comments[0].cid, encryptedReply); eq(encryptedChild.comments[0].user.uid, encryptedPeer); eq(encryptedChild.has_more, false);
      for(const reference of ['-legacy==','_legacy','/legacy+','=old','v1:old%2Bref','a','#'+'a'.repeat(64),'@'+'b'.repeat(64),'"'+'c'.repeat(64),'legacy;value','legacy\\value']){
        await windows[1].webContents.executeJavaScript(`fetch('${legacyPath}?item_id=qa.cached-summary-reference&cursor=0&qa_ref='+encodeURIComponent(${JSON.stringify(reference)})).then(r=>r.json())`);
        const variant=await client.readWeb('comments',{workId:work,cursor:'0'});eq(variant.comments[0].cid,reference);eq(variant.comments[0].user.uid,reference);eq(variant.comments[0].referenceKind,'legacy');
        await windows[1].webContents.executeJavaScript(`(()=>{const row=document.querySelector('.comment-item-qa');row.__reactFiber$fixture={memoizedProps:{comment:{comment_id:${JSON.stringify(reference)},text:'QA旧版标识格式'}}};row.querySelector('button').onclick=()=>fetch('/aweme/v1/creator/comment/reply/list?comment_id='+encodeURIComponent(${JSON.stringify(reference)})+'&cursor=0');})()`);
        eq((await client.readWeb('replies',{workId:work,commentId:reference,cursor:'0'})).comments[0].cid,'9007199254740000201');
      }
      const beforeEmbedded = requests.length;
      await windows[1].webContents.executeJavaScript(`fetch('${legacyPath}?item_id=qa.cached-summary-reference&cursor=0&qa_opaque=1&qa_preview=1').then(r=>r.json())`);
      const embedded = await client.readWeb('comments', { workId: work, cursor: '0' });
      eq(embedded.comments[0].reply_comment[0].cid, encryptedReply); eq(embedded.comments[0].reply_comment_complete, true); eq(requests.length - beforeEmbedded, 1);
      await windows[1].webContents.executeJavaScript(`fetch('${commentPath}?aweme_id=${work}&cursor=0&qa_preview=1').then(r=>r.json())`);
      const newEmbedded = await client.readWeb('comments', { workId: work, cursor: '0' }); eq(newEmbedded.comments[0].reply_comment[0].cid, '9007199254740000290'); eq(newEmbedded.comments[0].reply_comment_complete, true);
      await windows[1].webContents.executeJavaScript(`fetch('${commentPath}?aweme_id=${work}&cursor=0&qa_opaque=1').then(r=>r.json())`);
      await assert.rejects(() => client.readWeb('comments', { workId: work, cursor: '0' }), /评论标识未识别/); checks++;
      await windows[1].webContents.executeJavaScript(`fetch('${legacyPath}?item_id=qa.cached-summary-reference&cursor=0&qa_author=missing').then(r=>r.json())`);
      const anonymous = await client.readWeb('comments', { workId: work, cursor: '0' });
      eq(anonymous.comments[0].user.uid, ''); eq(anonymous.comments[0].user.identityUnavailable, true); eq(anonymous.comments[0].user.nickname, 'QA旧作品昵称');
      await windows[1].webContents.executeJavaScript(`fetch('${legacyPath}?item_id=qa.cached-summary-reference&cursor=0&qa_author=invalid').then(r=>r.json())`);
      await assert.rejects(() => client.readWeb('comments', { workId: work, cursor: '0' }), /作者标识未识别/); checks++;
      await windows[1].webContents.executeJavaScript(`(async()=>{const data=await fetch('/web/api/creator/data/item/summarize?item_id=${work}&qa_redirect=1').then(r=>r.json());await fetch('${legacyPath}?item_id='+encodeURIComponent(data.item_list[0].sec_item_id)+'&cursor=0').then(r=>r.json());await new Promise(r=>setTimeout(r,30));})()`);
      eq((await client.readWeb('comments', { workId: work, cursor: '0' })).comments[0].user.nickname, 'QA旧作品昵称');
      const summaryState = await windows[1].webContents.executeJavaScript(`window.__matrixCreatorObservedPages.summaries.get('${work}')`);
      eq(summaryState, '作品摘要已关联旧版引用'); eq(summaryState.includes(legacyReference), false);
      eq(redirectRequests,['/redirect','/summary']);
      // The ordinary trailing-slash URL remains observed without inventing
      // any requests or allowing a raw redirect response as successful data.
      await windows[1].webContents.executeJavaScript(`fetch('/web/api/creator/data/item/summarize/?item_id=${work}').then(r=>r.json()).then(()=>new Promise(r=>setTimeout(r,30)))`);
      eq(await windows[1].webContents.executeJavaScript(`window.__matrixCreatorObservedPages.summaries.get('${work}')`),'作品摘要已关联旧版引用');
      await windows[1].webContents.executeJavaScript(`fetch('/web/api/creator/data/item/summarize?item_id=${work}&qa_unresolved_redirect=1').then(r=>r.json()).then(()=>new Promise(r=>setTimeout(r,30)))`);
      eq(await windows[1].webContents.executeJavaScript(`window.__matrixCreatorObservedPages.summaries.get('${work}')`),'作品摘要：官方读取请求返回 HTTP 302');
      for(const variant of ['numeric','opaque','multiple','duplicate','wrong','mismatchedOpaque','unsafe','empty']){
        const allowed=['numeric','opaque','multiple'].includes(variant);
        await windows[1].webContents.executeJavaScript(`fetch('/web/api/creator/data/item/summarize?item_id=${work}&qa_summary_variant=${variant}').then(r=>r.json()).then(()=>new Promise(r=>setTimeout(r,30)))`);
        const state=await windows[1].webContents.executeJavaScript(`window.__matrixCreatorObservedPages.summaries.get('${work}')`);eq(state==='作品摘要已关联旧版引用',allowed);eq(state.includes('qa.summary-'),false);
        if(allowed){await windows[1].webContents.executeJavaScript(`fetch('${legacyPath}?item_id=qa.summary-${variant}&cursor=0').then(r=>r.json())`);eq((await client.readWeb('comments',{workId:work,cursor:'0'})).comments[0].user.nickname,'QA旧作品昵称');}
      }
      for (const [flag, pattern] of [['qa_summary_error', /旧版评论.*参数不合法.*作品摘要.*平台码 5.*请求参数错误/], ['qa_missing_ref', /参数不合法.*未提供旧版评论引用/], ['qa_secret_error', /参数不合法.*敏感字段，已隐藏/]]) {
        await windows[1].webContents.executeJavaScript(`(async()=>{await fetch('/web/api/creator/data/item/summarize?item_id=${work}&${flag}=1').then(r=>r.json());await fetch('${legacyPath}?item_id=${work}&cursor=0').then(r=>r.json());await new Promise(r=>setTimeout(r,30));})()`);
        await assert.rejects(() => client.readWeb('comments', { workId: work, cursor: '0' }), error => { eq(/qa-secret|qa-private|cookie=|token=/.test(error.message), false); return pattern.test(error.message); }); checks++;
      }
      const call = n => windows[0].webContents.executeJavaScript(`fetch('${workQuery}${n}').then(r=>r.json()).then(()=>new Promise(r=>setTimeout(r,30)))`);
      await call(27);const numericWork=await client.readWeb('works',{cursor:'27'});eq(numericWork.aweme_list[0].aweme_id,work);eq(numericWork.aweme_list[0].desc,'QA literal '+work);
      await windows[0].webContents.executeJavaScript(`fetch('${workQuery}28').then(r=>r.text()).then(()=>new Promise(r=>setTimeout(r,30)))`);await assert.rejects(()=>client.readWeb('works',{cursor:'28'}),/业务状态码/);checks++;
      for (const [n, pattern] of [[10, /平台码 5.*官网未提供错误说明/], [11, /结束标记/], [12, /游标/], [14, /作者不属于/], [16, /作品编号/], [17, /业务状态码/], [19, /平台码 5/], [20, /作品目录（作品列表，数字编号）.*请先登录/]]) { await call(n); await assert.rejects(() => client.readWeb('works', { cursor: String(n) }), pattern); checks++; }
      await windows[0].webContents.executeJavaScript("fetch('/aweme/v1/creator/user/info/').then(r=>r.json()).then(()=>new Promise(r=>setTimeout(r,30)))");eq(await windows[0].webContents.executeJavaScript('JSON.stringify([...window.__matrixCreatorObservedPages.identities.values()]).includes("QA_DO_NOT_PROJECT_IDENTITY")'),false);await assert.rejects(()=>client.readWeb('works',{cursor:'14'}),error=>error.code==='OWNED_CATALOG_AUTHOR_MISMATCH'&&/CREATOR_ID_SAME/.test(error.message));checks++;
      await call(21); await assert.rejects(() => client.readWeb('works', { cursor: '21' }), error => { eq(/cookie|token|https:|qa-private|qa-secret/.test(error.message), false); return /敏感字段，已隐藏/.test(error.message); }); checks++;
      for (const n of [13, 15]) { await call(n); const e = await client.readWeb('works', { cursor: String(n) }); eq(e.aweme_list, []); eq(e.has_more, false); }
      await windows[0].webContents.executeJavaScript(`Promise.all([fetch('${workQuery}18'),fetch('${workQuery}18')]).then(()=>new Promise(r=>setTimeout(r,30)))`);
      await assert.rejects(() => client.readWeb('works', { cursor: '18' }), /平台码 5/); checks++;
      const navigate = input => windows[0].webContents.executeJavaScript(`(()=>{try{return (${navigateOwnedComment.toString()})(${JSON.stringify(input)})}catch(e){return {error:e.message}}})()`);
      eq(/身份无效/.test((await navigate({ workId: work, ownUid: '' })).error), true);
      await windows[0].webContents.executeJavaScript(`document.querySelector('.video-card-content-qa').__reactFiber$fixture.memoizedProps.item.author.uid='${peer}'`);
      eq(/作者不属于/.test((await navigate({ workId: work, ownUid: own })).error), true);
      await windows[0].webContents.executeJavaScript(`(()=>{const card=document.querySelector('.video-card-content-qa');card.__reactFiber$fixture.memoizedProps.item.author.uid='${own}';const duplicate=card.cloneNode(true);duplicate.id='duplicate';duplicate.__reactFiber$fixture=card.__reactFiber$fixture;document.body.append(duplicate);})()`);
      eq(/卡片不唯一/.test((await navigate({ workId: work, ownUid: own })).error), true);
      await windows[0].webContents.executeJavaScript("document.querySelector('#duplicate').remove();document.querySelector('.video-card-content-qa').style.height='40px';document.querySelector('.video-card-content-qa span').remove();");
      const beforeMissing = requests.length, missing = await navigate({ workId: work, ownUid: own });
      eq(missing.waiting, true); eq(/唯一评论入口/.test(missing.detail), true); eq(requests.length, beforeMissing);
      eq(await windows[0].webContents.executeJavaScript('location.pathname'), '/creator-micro/content/manage');
      await windows[0].webContents.executeJavaScript("document.querySelector('.video-card-content-qa').classList.add('video-card-new-disabled-qa')");
      const disabled = await navigate({ workId: work, ownUid: own }); eq(disabled.unavailable, true); eq(/暂不支持/.test(disabled.detail), true);
      await windows[0].webContents.executeJavaScript("document.querySelector('.video-card-content-qa').classList.remove('video-card-new-disabled-qa')");
      // Dedicated fresh inventory and latest-comment windows cannot reload or
      // mutate either historical window, even when heads are checked twice.
      const oldInventory=await windows[0].webContents.executeJavaScript('JSON.stringify([...window.__matrixCreatorObservedPages.pages.keys()])'),oldComments=await windows[1].webContents.executeJavaScript('JSON.stringify([...window.__matrixCreatorObservedPages.pages.keys()])');
      eq((await client.readInventoryHead()).aweme_list[0].aweme_id,work);eq(windows.length,3);
      eq((await client.readLatest(work)).comments[0].cid,comment);eq(windows.length,4);eq((await client.readLatest(work)).comments[0].cid,comment);eq(windows.length,4);
      eq(windows[2].isDestroyed(),true);eq(windows.filter(w=>!w.isDestroyed()).map(w=>w.webContents.getBackgroundThrottling()),[true,true,false]);
      eq(await windows[0].webContents.executeJavaScript('JSON.stringify([...window.__matrixCreatorObservedPages.pages.keys()])'),oldInventory);eq(await windows[1].webContents.executeJavaScript('JSON.stringify([...window.__matrixCreatorObservedPages.pages.keys()])'),oldComments);
      await call(25); const beforeTimeout = requests.length, started = Date.now();
      await assert.rejects(() => client.readWeb('works', { cursor: '25' }), /尚未读取完成.*记录1.*还有下一页.*游标未前进/); checks++;
      eq(requests.length, beforeTimeout); eq(Date.now() - started >= 14000 && Date.now() - started < 18000, true);
      eq(await windows[0].webContents.executeJavaScript('typeof require'), 'undefined');
      eq(requests.every(([method]) => method === 'GET'), true); eq(requests.some(([, route]) => /notice|mark_read|\/send/.test(route)), false);
      eq(windows.filter(w=>!w.isDestroyed()).every(w => !w.isVisible() && w.webContents.isAudioMuted()), true);
      // A committed terminal catalog can retire its native window while the
      // actual sandboxed historical comment DOM and observed pages survive.
      await client.readWeb('works',{cursor:'0'});eq(client.releaseCompletedCatalog(),false);
      await client.readWeb('works',{cursor:longCursor});
      const heldCommentPages=await windows[1].webContents.executeJavaScript('JSON.stringify([...window.__matrixCreatorObservedPages.pages.keys()])');
      eq(client.releaseCompletedCatalog(),true);eq(windows[0].isDestroyed(),true);eq(windows[1].isDestroyed(),false);eq(client.hasOwnedWork(work),true);
      client.close();eq(windows.filter(w=>!w.isDestroyed()).every(w=>w.webContents.getBackgroundThrottling()),true);
      const resumed=await reader.acquire({accountSession:source,publicHandle:'qa-own',assertCurrent:async()=>{}});eq(windows.length,4);
      eq(await windows[1].webContents.executeJavaScript('JSON.stringify([...window.__matrixCreatorObservedPages.pages.keys()])'),heldCommentPages);
      eq((await resumed.readWeb('works',{cursor:'0'})).aweme_list[0].aweme_id,work);eq(windows.length,5);eq(resumed.releaseCompletedCatalog(),false);
      resumed.close();reader.close();eq(windows.every(w=>w.isDestroyed()),true);
      console.log(JSON.stringify({ checks, realSandboxedElectronPreload: true, firstInlineFetchObserved: true, normalGetResponseOnly: true, exactServerCursor: true, realPlatformRequests: 0, businessSends: 0, readReceipts: 0 }));
    } catch (e) { console.error(e); process.exitCode = 1; } finally { reader?.close(); for (const w of windows) if (!w.isDestroyed()) w.destroy(); redirectServer.closeAllConnections();await new Promise(resolve=>redirectServer.close(resolve));app.exit(process.exitCode || 0); }
  });
}
