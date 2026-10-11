const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Runs in an isolated renderer world. Page scripts cannot replace the saved DOM references.
function pageAction(command, input) {
  const visible = el => {
    if (!el?.isConnected || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && s.pointerEvents !== 'none';
  };
  const text = el => (el.innerText || el.getAttribute('aria-label') || el.value || '').trim();
  const fields = () => [...document.querySelectorAll('input,textarea,[contenteditable="true"]')].filter(el => {
    const label = [el.type, el.name, el.id, el.autocomplete, el.placeholder, el.getAttribute('aria-label')].join(' ');
    return visible(el) && !el.readOnly && !/password|one-time-code|username|email|tel|search|hidden|file|checkbox|radio|token|secret|密码|验证码|手机号|邮箱|搜索|身份证|密钥/i.test(label) &&
      (el.tagName === 'TEXTAREA' || el.isContentEditable || (el.tagName === 'INPUT' && ['text', ''].includes(el.type)));
  }).slice(0, 30).map(el => ({ label: (el.getAttribute('aria-label') || el.placeholder || '表单内容').slice(0, 100), value: (el.value ?? el.innerText ?? '').slice(0, 20000) }));
  const labels = { publish: /^(发布|发表|投稿|立即发布|确认发布|发布笔记|发布视频|发表视频|立即投稿)$/, comments: /^(回复|发送|发布评论|发表评论|发送回复)$/, messages: /^(发送|发送消息)$/ };
  const materials = () => [...document.querySelectorAll('input[type="file"]')].flatMap(el => [...(el.files || [])].map(file => ({ name: file.name, size: file.size, modified: file.lastModified })));
  const mediaState = () => [...document.querySelectorAll('video,audio')].map(el => el.currentSrc || el.src || '');
  const contextText = el => (el.closest('form,[role="dialog"],article')?.innerText || el.parentElement?.innerText || '').trim().slice(0, 2000);
  const choices = () => [...document.querySelectorAll('select,input[type="checkbox"],input[type="radio"],[role="checkbox"],[role="radio"],[aria-selected="true"],h1,h2,h3')].filter(visible).map(el => ({ text: text(el).slice(0, 200), value: el.tagName === 'SELECT' ? [...el.selectedOptions].map(option => option.textContent).join(',') : el.checked ?? el.getAttribute('aria-checked') ?? '' }));
  const signals = () => [...document.querySelectorAll('[role="alert"],[role="status"],[class*="toast"],[class*="message-notice"],[class*="Message-notice"],[class*="message-success"],[class*="message-error"],[class*="publish-success"],[class*="publishSuccess"]')].filter(visible).map(text).filter(s => s && s.length < 400);
  const classify = (kind, message) => {
    if (/发布失败|发表失败|投稿失败|发送失败|回复失败|未(?:能)?(?:发布|发表|投稿|发送|回复|评论)成功|操作频繁|频率限制|内容违规|无法发送|超过.*限制|请.*验证|请.*填写/.test(message)) return 'failed';
    if ((kind === 'publish' ? /发布成功|发表成功|投稿成功|提交审核成功|已提交审核/ : kind === 'comments' ? /回复成功|评论成功|发送成功/ : /发送成功|消息已发送/).test(message)) return 'confirmed';
    return null;
  };
  const state = window.__matrixPageAction;
  if (command === 'inspect') {
    if (!labels[input.kind]) throw new Error('不支持的操作类型');
    const buttons = [...document.querySelectorAll('button,[role="button"],input[type="submit"]')].filter(el => visible(el) && labels[input.kind].test(text(el))).slice(0, 20);
    const values = fields();
    const files = materials();
    window.__matrixPageAction = { nonce: input.nonce, kind: input.kind, url: location.href, buttons, labels: buttons.map(text), contexts: buttons.map(contextText), choices: choices(), values, files, media: mediaState(), used: false };
    return { pageUrl: location.protocol === 'https:' ? location.origin + location.pathname : location.protocol + '//test-fixture', fields: values, materials: files, candidates: buttons.map((el, index) => ({ index, label: text(el), context: (el.closest('form,[role="dialog"],article')?.innerText || el.parentElement?.innerText || '').trim().slice(0, 200) })) };
  }
  if (!state || state.nonce !== input.nonce || state.url !== location.href) throw new Error('页面已切换，请重新检查表单');
  if (command === 'submit') {
    if (state.used) throw new Error('这次操作已提交，请先核对结果');
    const button = state.buttons[input.index];
    if (!button || !visible(button) || !labels[state.kind].test(text(button))) throw new Error('提交按钮已变化，请重新检查');
    if (text(button) !== state.labels[input.index] || contextText(button) !== state.contexts[input.index] || JSON.stringify(choices()) !== JSON.stringify(state.choices)) throw new Error('提交对象或选项已变化，请重新核对');
    if (JSON.stringify(fields()) !== JSON.stringify(state.values)) throw new Error('表单内容已修改，请重新核对后提交');
    if (JSON.stringify(materials()) !== JSON.stringify(state.files) || JSON.stringify(mediaState()) !== JSON.stringify(state.media)) throw new Error('素材已变化，请重新核对后提交');
    button.scrollIntoView({ block: 'center', inline: 'center' });
    const bounds = button.getBoundingClientRect(), hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    if (!hit || (hit !== button && !button.contains(hit))) throw new Error('提交按钮被弹窗遮挡，请先处理官方页面提示');
    state.used = true;
    const baseline = new Set(signals());
    state.result = { status: 'unknown', message: '已点击官方提交按钮，尚未观察到明确结果。请核对页面，避免重复提交。' };
    let done = false;
    const observer = new MutationObserver(() => {
      if (done) return;
      for (const message of signals()) {
        if (baseline.has(message)) continue;
        const status = classify(state.kind, message);
        if (status) { state.result = { status, message }; done = true; observer.disconnect(); break; }
      }
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    setTimeout(() => { done = true; observer.disconnect(); }, 20000);
    button.click();
    return { clicked: true };
  }
  if (command === 'result') return state.result || { status: 'unknown', message: '尚未提交' };
  throw new Error('操作不支持');
}

function createJournal(directory) {
  const file = path.join(directory, 'page-actions.jsonl');
  return {
    write(record) { fs.mkdirSync(directory, { recursive: true }); fs.appendFileSync(file, JSON.stringify(record) + '\n', { encoding: 'utf8', mode: 0o600 }); },
    list(ownerId) {
      if (!fs.existsSync(file)) return [];
      const latest = new Map();
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        try { const r = JSON.parse(line); if (r.ownerId === ownerId && r.id) latest.set(r.id, r); } catch { /* Ignore only incomplete trailing records after an interrupted write. */ }
      }
      return [...latest.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200).map(({ ownerId: _, ...record }) => record.status === 'submitting' ? { ...record, status: 'unknown', message: '上次提交过程被中断，请到官方页面核对结果后再操作。' } : record);
    },
  };
}

function registerPageActions({ ipcMain, dialog, webContents, session, getWindow, platforms, inspectPlatformSession, authenticate, journal, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const plans = new Map(), busy = new Set();
  const script = (command, input) => `(${pageAction.toString()})(${JSON.stringify(command)},${JSON.stringify(input)})`;
  const run = (guest, command, input) => guest.executeJavaScriptInIsolatedWorld(1001, [{ code: script(command, input) }]);
  function host(event) { const win = getWindow(); if (!win || event.sender.id !== win.webContents.id) throw new Error('仅允许矩效主窗口操作'); return win; }
  async function context(event, input) {
    const win = host(event), platform = platforms[input?.platform];
    if (!platform || !/^[a-z0-9-]{16,80}$/i.test(input.sessionId || '') || !Number.isInteger(input.webContentsId)) throw new Error('账号会话参数不正确');
    const auth = await authenticate(input.accessToken, input.accountId);
    if (auth.account.platform !== input.platform || auth.account.connectorSessionId !== input.sessionId) throw new Error('该会话不属于当前登录用户的绑定账号');
    const guest = webContents.fromId(input.webContentsId);
    if (!guest || guest.isDestroyed() || guest.hostWebContents?.id !== win.webContents.id || guest.session !== session.fromPartition(`persist:matrix-${input.platform}-${input.sessionId}`)) throw new Error('账号页面已关闭或不匹配');
    const url = new URL(guest.getURL());
    if (url.protocol !== 'https:' || !(url.hostname === platform.domain || url.hostname.endsWith('.' + platform.domain)) || /login|passport|signin/.test(url.pathname + url.hostname)) throw new Error('请进入已登录账号的官方操作页');
    const login = await inspectPlatformSession(input.platform, guest.session, guest);
    if (!login.authenticated) throw new Error('账号登录已失效，请重新登录');
    return { win, guest, auth, nickname: login.profile?.nickname || auth.account.nickname || platform.label };
  }
  ipcMain.handle('matrix:inspect-page-action', async (event, input) => {
    try {
      if (!['publish', 'comments', 'messages'].includes(input?.kind)) throw new Error('请选择发布、评论或私信操作');
      const ctx = await context(event, input);
      if (busy.has(ctx.guest.id)) throw new Error('当前账号正在提交，请等待结果');
      for (const [key, plan] of plans) if (plan.expires < Date.now() || plan.guestId === ctx.guest.id) plans.delete(key);
      const nonce = randomUUID(), details = await run(ctx.guest, 'inspect', { kind: input.kind, nonce });
      if (!details.candidates.length) throw new Error('当前页面没有可用的提交按钮，请先完成上传、填写内容或选择会话');
      if (!details.fields.some(field => field.value.trim())) throw new Error('未识别到已填写的表单，请在官方页面填写内容后重试');
      const plan = { nonce, guestId: ctx.guest.id, ownerId: ctx.auth.userId, accountId: input.accountId, platform: input.platform, sessionId: input.sessionId, nickname: ctx.nickname, kind: input.kind, details, expires: Date.now() + 120000 };
      plans.set(nonce, plan);
      return { nonce, nickname: ctx.nickname, expiresAt: new Date(plan.expires).toISOString(), ...details };
    } catch (error) { return { error: error.message }; }
  });
  ipcMain.handle('matrix:submit-page-action', async (event, input) => {
    let guestId, record;
    try {
      const ctx = await context(event, input), plan = plans.get(input.nonce);
      if (!plan || plan.expires < Date.now() || plan.guestId !== ctx.guest.id || plan.ownerId !== ctx.auth.userId || plan.accountId !== input.accountId || plan.nickname !== ctx.nickname) throw new Error('核对信息已过期或账号已变化，请重新检查表单');
      if (busy.has(ctx.guest.id)) throw new Error('当前账号正在提交，请勿重复点击');
      if (!Number.isInteger(input.index) || !plan.details.candidates[input.index]) throw new Error('请选择要执行的官方按钮');
      busy.add(ctx.guest.id); guestId = ctx.guest.id;
      const selected = plan.details.candidates[input.index];
      const confirmation = await dialog.showMessageBox(ctx.win, { type: 'question', title: '确认提交官方表单', message: `${platforms[plan.platform].label} · ${ctx.nickname}：${selected.label}`, detail: `${plan.details.pageUrl}\n\n${plan.details.fields.filter(f => f.value.trim()).map(f => `${f.label}：${f.value.slice(0, 500)}`).join('\n\n')}\n\n素材：${plan.details.materials?.map(f => f.name).join('、') || '请在官方页面核对已上传的素材'}\n\n请核对官方页面中的对象、素材和可见范围。确认后将点击该提交按钮。`, buttons: ['返回核对', '确认提交'], defaultId: 0, cancelId: 0, noLink: true });
      if (confirmation.response !== 1) return { cancelled: true };
      if (plan.expires < Date.now()) throw new Error('核对信息已过期，请重新检查');
      const fresh = await context(event, input);
      if (fresh.guest.id !== ctx.guest.id || fresh.nickname !== plan.nickname) throw new Error('账号已变化，请重新核对');
      plans.delete(input.nonce);
      record = { id: randomUUID(), ownerId: ctx.auth.userId, accountId: input.accountId, platform: input.platform, nickname: ctx.nickname, kind: plan.kind, pageUrl: plan.details.pageUrl, button: selected.label, summary: plan.details.fields.filter(f => f.value.trim()).map(f => f.value).join('\n').slice(0, 1000), status: 'submitting', message: '正在提交官方表单', createdAt: new Date().toISOString() };
      // Persist before any external action. A failed write must prevent the click.
      journal.write(record);
      const result = await run(ctx.guest, 'submit', { nonce: input.nonce, index: input.index });
      if (!result?.clicked) throw new Error('官方按钮未被执行');
      record.status = 'unknown'; record.message = '已点击官方提交按钮，请核对平台结果，勿重复提交。';
      for (let attempt = 0; attempt < 20; attempt++) {
        await sleep(500);
        if (ctx.guest.isDestroyed()) break;
        try {
          const observed = await run(ctx.guest, 'result', { nonce: input.nonce });
          if (['confirmed', 'failed'].includes(observed?.status)) { record.status = observed.status; record.message = observed.message; break; }
        } catch { break; } // Navigation is not proof of a successful post.
      }
      record.completedAt = new Date().toISOString(); journal.write(record);
      const { ownerId: _, ...receipt } = record;
      return { receipt };
    } catch (error) {
      if (record) { record.status = 'unknown'; record.message = `提交状态需核对：${error.message}`; try { journal.write(record); } catch { /* Existing pre-submit record remains recoverable. */ } }
      return { error: error.message, mayHaveSubmitted: Boolean(record) };
    } finally { if (guestId !== undefined) busy.delete(guestId); }
  });
  ipcMain.handle('matrix:list-page-actions', async (event, input) => {
    try { host(event); const auth = await authenticate(input?.accessToken); return { items: journal.list(auth.userId) }; }
    catch (error) { return { error: error.message }; }
  });
}

module.exports = { registerPageActions, createJournal, pageAction };
