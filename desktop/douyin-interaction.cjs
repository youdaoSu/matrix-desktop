const { randomUUID } = require('node:crypto');

// Operates only on rendered official controls. No private API or page internals.
function douyinInteraction(command, input = {}) {
  const clean = value => String(value || '').replaceAll(String.fromCharCode(8203), '').trim();
  const visible = e => e && e.isConnected && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';
  const text = e => clean(e?.innerText || e?.textContent);
  const one = elements => { const list = [...elements].filter(visible); if (list.length !== 1) throw Error('官方控件不唯一或尚未加载'); return list[0]; };
  const click = e => { e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); if (!visible(e) || e.disabled || e.getAttribute('aria-disabled') === 'true' || (hit !== e && !e.contains(hit))) throw Error('官方控件被遮挡或不可操作'); if (typeof e.click === 'function') e.click(); else e.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); };
  const verification = [...document.querySelectorAll('input')].some(e => visible(e) && /验证码|one-time-code|captcha/i.test([e.placeholder, e.autocomplete, e.name].join(' ')));
  if (command === 'verification') return { required: verification };
  if (verification) throw Error('请本人完成官方验证，再核对原操作结果；不会重复提交');
  if (location.hostname !== 'www.douyin.com') throw Error('请打开抖音官方网页');
  const canonical = raw => { try { const u = new URL(raw); return u.origin + u.pathname; } catch { return ''; } };
  const comments = () => [...document.querySelectorAll('[data-e2e="comment-item"]')].filter(e => !e.parentElement.closest('[data-e2e="comment-item"]') && visible(e));
  const commentBody = e => text(e.querySelector('.FduGc_lz .Sh1Da424, .FduGc_lz'));
  const commentAuthor = e => [...e.querySelectorAll('a[href*="/user/"]')].find(a => text(a));
  const targetRow = () => one(comments().filter(e => canonical(commentAuthor(e)?.href) === input.authorProfileUrl && commentBody(e) === input.comment));
  if (command === 'comments') { const list = document.querySelector('[data-e2e="comment-list"]'); if (!list) throw Error('评论区尚未加载'); return { records: comments().map(e => ({ platformId: '', author: text(commentAuthor(e)).split('\n')[0], authorProfileUrl: canonical(commentAuthor(e)?.href), content: commentBody(e), displayTime: text(e.querySelector('.VAQA49VP')), replies: [...e.querySelectorAll('[data-e2e="comment-item"]')].filter(r => r !== e).map(r => ({ author: text(commentAuthor(r)), content: commentBody(r) })) })).filter(r => r.author && r.content), ended: /暂时没有更多评论|暂无评论/.test(text(list)), source: location.origin + location.pathname, capturedAt: new Date().toISOString() }; }
  if (command === 'works' || command === 'more-works') {
    if (location.pathname !== '/user/self') throw Error('只读取当前登录账号本人的作品列表');
    const lists = [...document.querySelectorAll('ul[data-e2e="scroll-list"]')].filter(visible);
    const urls = [...new Set(lists.flatMap(list => [...list.querySelectorAll(':scope > li a[href*="/video/"]')].filter(visible).map(a => canonical(a.href))).filter(url => /^https:\/\/www\.douyin\.com\/video\/\d+$/.test(url)))];
    const loaded = document.readyState === 'complete' && (!!lists.length || [...document.querySelectorAll('div,p')].some(e => visible(e) && e.children.length === 0 && text(e) === '暂无内容'));
    const nickname = text(document.querySelector('h1'));
    if (!nickname) throw Error('评论作者主页尚未加载');
    if (!loaded || !nickname) throw Error('作品目录尚未加载');
    if (command === 'more-works') lists.at(-1)?.lastElementChild?.scrollIntoView({ block: 'end' });
    const ended = [...document.querySelectorAll('div,p')].some(e => visible(e) && e.children.length === 0 && /^(暂无内容|暂时没有更多了|没有更多作品|没有更多了)$/.test(text(e)));
    return { nickname, urls: urls.slice(0, 200), capped: urls.length > 200, ended };
  }
  if (command === 'more-comments') { const rows = comments(); (rows.at(-1) || document.querySelector('[data-e2e="comment-list"]'))?.scrollIntoView({ block: 'end' }); return { count: rows.length }; }
  if (command === 'scroll-comments') { const list = document.querySelector('[data-e2e="comment-list"]'); if (!list) throw Error('评论区尚未加载'); list.scrollIntoView({ block: 'center' }); return { opened: true }; }
  if (command === 'profile' || command === 'follow' || command === 'unfollow' || command === 'open-chat') {
    if (canonical(location.href) !== input.authorProfileUrl || !/^\/user\/MS4w/.test(location.pathname)) throw Error('评论作者主页已变化');
    const nickname = text(document.querySelector('h1'));
    if (nickname !== input.author) throw Error('评论作者昵称与主页不一致，请核对');
    const button = one(document.querySelectorAll('[data-e2e="user-info-follow-btn"]'));
    const label = text(button), following = /^(相互关注|互相关注|已关注)$/.test(label), notFollowing = /^(关注|回关)$/.test(label);
    if (!following && !notFollowing) throw Error('关注状态无法确认');
    if (command === 'follow' && !following) click(button);
    if (command === 'unfollow' && following) click(button);
    if (command === 'open-chat') click(one([...document.querySelectorAll('button')].filter(e => text(e) === '私信')));
    return { nickname, following, label };
  }
  if (command === 'chat' || command === 'fill-message' || command === 'send-message' || command === 'message-result') {
    if (canonical(location.href) !== input.authorProfileUrl) throw Error('私信收件人已变化');
    const recipient = text(document.querySelector('.StackLayoutStackChatHeadertitle'));
    if (!recipient) throw Error('私信面板尚未加载');
    if (recipient !== input.author) throw Error('私信收件人已变化');
    const editor = one(document.querySelectorAll('[data-e2e="msg-input"] .messageEditorinputArea[contenteditable="true"]'));
    const outgoing = [...document.querySelectorAll('.MessageBoxContentisFromMe .TextMessageTextpureText')].filter(e => text(e) === input.message);
    if (command === 'chat') return { ready: true, draft: text(editor), count: outgoing.length };
    if (command === 'fill-message') { if (text(editor) && text(editor) !== input.message) throw Error('聊天框已有其他草稿，请先处理'); editor.focus(); const range = document.createRange(); range.selectNodeContents(editor); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.execCommand('insertText', false, input.message); return { filled: text(editor) === input.message }; }
    if (command === 'send-message') { if (text(editor) !== input.message) throw Error('私信正文已变化'); click(one(document.querySelectorAll('[data-e2e="msg-input"] .e2e-send-msg-btn'))); return { clicked: true }; }
    const row = outgoing.at(-1)?.closest('.messageMessageBoxmessageBox');
    const failed = row && [...row.querySelectorAll('[class*="error"],[class*="Error"],[class*="fail"],[class*="Fail"]')].some(visible);
    return { status: outgoing.length <= input.baseline ? 'unknown' : failed ? 'failed' : !text(editor) ? 'confirmed' : 'unknown', outgoingCount: outgoing.length };
  }
  if (command === 'open-reply' || command === 'reply-editor' || command === 'fill-reply' || command === 'send-reply' || command === 'reply-result') {
    if (canonical(location.href) !== input.videoUrl) throw Error('原作品页面已变化');
    const row = targetRow();
    if (command === 'open-reply') {
      if ([...row.querySelectorAll('.Sh1Da424')].some(e => text(e) === input.reply)) throw Error('该评论已有相同回复，请先核对，避免重复发送');
      click(one([...row.querySelectorAll('div,span,button')].filter(e => e.children.length === 0 && text(e) === '回复'))); return { opened: true };
    }
    const editor = [...row.querySelectorAll('[contenteditable="true"]')].find(visible);
    if (command === 'reply-editor') return { ready: !!editor };
    if (command === 'reply-result') return { confirmed: !editor && [...row.querySelectorAll('[data-e2e="comment-item"]')].some(r => commentBody(r) === input.reply && text(commentAuthor(r)).split('\n')[0] === input.ownNickname) };
    if (!editor) throw Error('这条评论的专属回复框未打开');
    if (command === 'fill-reply') { editor.focus(); const range = document.createRange(); range.selectNodeContents(editor); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.execCommand('insertText', false, input.reply); return { filled: text(editor) === input.reply }; }
    if (text(editor) !== input.reply) throw Error('回复正文已变化');
    click(one(editor.closest('.comment-input-inner-container').querySelectorAll('.commentInput-right-ct span.wchsYBpK'))); return { clicked: true };
  }
  throw Error('不支持的抖音操作');
}

function script(command, input) { return `(() => { try { return (${douyinInteraction.toString()})(${JSON.stringify(command)},${JSON.stringify(input)}); } catch(e) { return {error: e.message}; } })()`; }

function registerDouyinInteraction({ ipcMain, context, journal, dialog, busy = new Set(), sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  const inventories = new Map();
  const workflowAccounts = new Set();
  ipcMain.handle('matrix:douyin-comment-scan', async (event, input) => {
    let ctx, acquired = false;
    try {
      ctx = await context(event, input);
      if (input.platform !== 'douyin' || !['inventory','scan'].includes(input.operation)) throw Error('监控参数无效');
      if (busy.has(ctx.guest.id)) throw Error('当前账号页面正在执行操作');
      busy.add(ctx.guest.id); acquired = true;
      const run = async command => { const r = await ctx.guest.executeJavaScriptInIsolatedWorld(1004, [{ code: script(command,{}) }]); if (r.error) throw Error(r.error); return r; };
      const readReady = async command => { const end=Date.now()+10000; while(Date.now()<end){try{return await run(command);}catch(error){if(!error.message.includes('尚未加载'))throw error;await sleep(400);}}throw Error('官方作品或评论加载超时'); };
      if (input.operation === 'inventory') {
        await ctx.guest.loadURL('https://www.douyin.com/user/self'); await sleep(1200);
        let inventory = await readReady('works');
        if (inventory.nickname !== ctx.auth.account.nickname) throw Error('本人主页昵称与绑定账号不同，请先刷新绑定信息');
        for (let page = 0; !inventory.ended && !inventory.capped && page < 20; page++) {
          const previous = inventory.urls.length;
          await run('more-works'); await sleep(1000); inventory = await readReady('works');
          if (inventory.nickname !== ctx.auth.account.nickname) throw Error('本人作品目录已变化');
          if (inventory.urls.length === previous) break;
        }
        inventories.set(ctx.guest.id, { owner: ctx.auth.userId, account: input.accountId, urls: inventory.urls });
        return { ...inventory, partial: !inventory.ended || inventory.capped };
      }
      const inventory = inventories.get(ctx.guest.id);
      if (!inventory || inventory.owner !== ctx.auth.userId || inventory.account !== input.accountId || !inventory.urls.includes(input.videoUrl)) throw Error('请先读取本账号的公开视频目录');
      await ctx.guest.loadURL(input.videoUrl); await sleep(1000); await readReady('scroll-comments'); await sleep(500);
      let snapshot = await readReady('comments');
      for (let page = 0; !snapshot.ended && snapshot.records.length < 100 && page < 5; page++) { const previous = snapshot.records.length; await run('more-comments'); await sleep(900); snapshot = await run('comments'); if (snapshot.records.length === previous) break; }
      return { ...snapshot, partial: !snapshot.ended, capped: snapshot.records.length >= 100 };
    } catch(error) { return { error: error.message }; }
    finally { if (acquired) busy.delete(ctx.guest.id); }
  });
  ipcMain.handle('matrix:douyin-comment-workflow', async (event, input) => {
    let ctx, record, acquired = false, accountKey;
    const run = async (command, values) => {
      let result = await ctx.guest.executeJavaScriptInIsolatedWorld(1004, [{ code: script(command, values) }]);
      if (result.error?.includes('请本人完成官方验证')) {
        if (record) { record.message = result.error; record.needsVerification = true; journal.write(record); }
        ctx.win.webContents.send('matrix:douyin-workflow-progress', { webContentsId: ctx.guest.id, message: result.error, stage: 'verification' });
        const deadline = Date.now() + 180000;
        while (Date.now() < deadline) { await sleep(700); const check = await ctx.guest.executeJavaScriptInIsolatedWorld(1004, [{ code: script('verification', {}) }]); if (!check.required) { result = await ctx.guest.executeJavaScriptInIsolatedWorld(1004, [{ code: script(command, values) }]); break; } }
      }
      if (result.error) throw Error(result.error);
      return result;
    };
    const wait = async (command, values, accept, timeout = 12000) => { const end = Date.now() + timeout; while (Date.now() < end) { try { const result = await run(command, values); if (accept(result)) return result; } catch(error) { if (!error.message.includes('尚未加载')) throw error; } await sleep(300); } throw Error('官方页面未返回明确结果，请核对'); };
    const navigate = async url => { await ctx.guest.loadURL(url); await sleep(1200); };
    const cleanup = async values => {
      const verification = await ctx.guest.executeJavaScriptInIsolatedWorld(1004, [{ code: script('verification', {}) }]);
      if (verification.required) throw Error('本人验证尚未完成，取消关注待处理；完成验证后请恢复取消关注');
      await navigate(values.authorProfileUrl);
      await wait('profile', values, () => true);
      await run('unfollow', values);
      let relation;
      try { relation = await wait('profile', values, r => !r.following, 5000); }
      catch { // Hydration may have replaced the first control; retry only a verified still-following state.
        const current = await run('profile', values); if (!current.following) return;
        await run('unfollow', values); relation = await wait('profile', values, r => !r.following, 5000);
      }
      if (relation.following) throw Error('取消关注未确认');
    };
    try {
      ctx = await context(event, input);
      if (input.platform !== 'douyin') throw Error('当前只支持已适配的抖音页面');
      const key = ctx.auth.userId + ':' + input.accountId;
      if (workflowAccounts.has(key)) throw Error('该账号已在其他页面处理评论，请等待');
      if (busy.has(ctx.guest.id)) throw Error('当前账号正在处理评论');
      workflowAccounts.add(key); accountKey = key;
      busy.add(ctx.guest.id); acquired = true;
      if (input.operation === 'cleanup') {
        record = journal.list(ctx.auth.userId).find(r => r.id === input.recordId && r.accountId === input.accountId && r.followCleanup === 'pending');
        if (!record) throw Error('没有属于此账号的待取消关注记录');
        record.ownerId = ctx.auth.userId;
        await cleanup(record);
        record.followCleanup = 'confirmed'; record.message = '恢复操作已确认取消关注'; journal.write(record); return { receipt: record };
      }
      const videoUrl = new URL(ctx.guest.getURL());
      if (videoUrl.hostname !== 'www.douyin.com' || !/^\/video\/\d+$/.test(videoUrl.pathname)) throw Error('请先打开原视频的评论列表');
      const authorUrl = new URL(input.authorProfileUrl);
      if (authorUrl.protocol !== 'https:' || authorUrl.hostname !== 'www.douyin.com' || !/^\/user\/MS4w[a-zA-Z0-9_-]+$/.test(authorUrl.pathname) || authorUrl.search || authorUrl.hash) throw Error('评论作者链接无效');
      for (const key of ['author','comment','message','successReply','failedReply']) if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > (key === 'author' ? 200 : 2000)) throw Error('请完整填写评论、私信和两种回复文案');
      const values = { author: input.author, authorProfileUrl: authorUrl.origin + authorUrl.pathname, comment: input.comment, message: input.message, videoUrl: videoUrl.origin + videoUrl.pathname, ownNickname: ctx.auth.account.nickname };
      const snapshot = await run('comments', values);
      const targets = snapshot.records.filter(r => r.authorProfileUrl === values.authorProfileUrl && r.content === values.comment);
      if (targets.length !== 1) throw Error('原评论不唯一或已经变化，请重新读取');
      if (targets[0].replies.some(r => [input.successReply,input.failedReply].includes(r.content))) throw Error('原评论已有处理回复，请先核对，避免重复发送');
      if (journal.list(ctx.auth.userId).some(r => r.accountId === input.accountId && r.videoUrl === values.videoUrl && r.authorProfileUrl === values.authorProfileUrl && r.comment === values.comment)) throw Error('该评论已有处理记录，请核对记录，避免重复发送');
      const approval = await dialog.showMessageBox(ctx.win, { type: 'question', title: '确认处理此条评论', message: `${ctx.auth.account.nickname} → ${values.author}`, detail: `原评论：${values.comment}\n私信：${values.message}\n成功回复：${input.successReply}\n失败回复：${input.failedReply}\n\n将临时关注并发送一条私信，结束时取消关注（包括已存在的关注）。`, buttons: ['取消','执行这一次'], defaultId: 0, cancelId: 0, noLink: true });
      if (approval.response !== 1) return { cancelled: true };
      record = { id: randomUUID(), ownerId: ctx.auth.userId, accountId: input.accountId, platform: 'douyin', nickname: ctx.auth.account.nickname, kind: 'messages', button: '评论资料处理', summary: values.message, status: 'submitting', message: '正在处理原评论', createdAt: new Date().toISOString(), ...values, followCleanup: 'pending', replyStatus: 'not_submitted' };
      journal.write(record);
      let messageStatus = 'unknown';
      try {
        await navigate(values.authorProfileUrl);
        await wait('profile', values, () => true);
        await run('follow', values); await wait('profile', values, r => r.following);
        await run('open-chat', values); const chat = await wait('chat', values, r => r.ready);
        values.baseline = chat.count;
        const filled = await run('fill-message', values); if (!filled.filled) throw Error('私信正文未正确填入');
        record.messageStatus = 'submitting'; journal.write(record);
        await run('send-message', values);
        const outcome = await wait('message-result', values, r => r.status !== 'unknown'); messageStatus = outcome.status;
      } catch (error) { record.message = error.message; record.failureReason = error.message; }
      finally {
        record.messageStatus = messageStatus;
        try { await cleanup(values); record.followCleanup = 'confirmed'; }
        catch (error) { record.followCleanup = 'pending'; record.cleanupError = error.message; }
        journal.write(record);
      }
      if (messageStatus === 'confirmed' || messageStatus === 'failed') {
        values.reply = messageStatus === 'confirmed' ? input.successReply : input.failedReply;
        await navigate(values.videoUrl); await wait('scroll-comments', values, r => r.opened);
        await run('open-reply', values); await wait('reply-editor', values, r => r.ready);
        if (!(await run('fill-reply', values)).filled) throw Error('回复未正确填入');
        await run('send-reply', values); await wait('reply-result', values, r => r.confirmed);
        record.replyStatus = 'confirmed'; record.replyText = values.reply;
      }
      record.status = messageStatus; record.completedAt = new Date().toISOString();
      record.message = `${messageStatus === 'confirmed' ? '官方聊天框已显示发送消息' : messageStatus === 'failed' ? '官方显示发送失败' : '私信结果待核对'}；${record.followCleanup === 'confirmed' ? '已确认取消关注' : '取消关注待处理'}；${record.replyStatus === 'confirmed' ? '回复已显示' : '回复待核对'}`;
      if (record.failureReason) record.message += `；原因：${record.failureReason}`;
      journal.write(record); return { receipt: record };
    } catch (error) {
      if (record) { record.status = 'unknown'; record.message = error.message; journal.write(record); }
      return { error: error.message, receipt: record };
    } finally { if (acquired) busy.delete(ctx.guest.id); if (accountKey) workflowAccounts.delete(accountKey); }
  });
}
module.exports = { douyinInteraction, script, registerDouyinInteraction };
