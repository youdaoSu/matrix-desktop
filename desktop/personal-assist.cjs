const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { publishForm } = require('./publish-form.cjs');
const { publishValidation } = require('./publish-validation.cjs');
const { runOfficialDOM, withOfficialDOM } = require('./official-dom.cjs');
const { uploadControl, coverControl, openCoverWithInput } = require('./upload-controls.cjs');
const { createOperationBudget } = require('./operation-budget.cjs');
const { resolveBilibiliUpload } = require('./bilibili-upload.cjs');
const { resolveWechatUpload } = require('./wechat-upload.cjs');
const { validId } = require('./publish-evidence.cjs');
const publishCapabilities = require('./publish-capabilities.json');
const { readPublishCompanions } = require('./publish-extraction.cjs');

// Self-contained so the same check can run in the guest renderer and unit tests.
function isEditableTarget(el) {
  if (!el || el.disabled || el.readOnly) return false;
  const bounds = el.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return false;
  const label = [el.placeholder, el.name, el.id, el.getAttribute('aria-label'), el.autocomplete].join(' ');
  if (/password|one-time-code|username|email|tel|search|密码|验证码|手机号|邮箱|搜索|身份证/i.test(label)) return false;
  return el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text') || el.isContentEditable === true;
}

// Use the site's visible upload control; never call undocumented platform APIs.
function selectUploadInput(inputs, mediaType, count) {
  const candidates = inputs.filter(item => {
    const accept = (item.accept || '').toLowerCase();
    return item.visible && (count === 1 || item.multiple) &&
      (mediaType === 'video' ? /video|mp4|mov|webm|mkv/.test(accept) : /image|png|jpg|jpeg|webp/.test(accept));
  });
  if (candidates.length !== 1) throw new Error('无法唯一识别官方素材上传入口，请直接使用官方页面的上传按钮');
  return candidates[0].nodeId;
}

function registerPersonalAssist({ ipcMain, dialog, webContents, session, getWindow, platforms, inspectPlatformSession, authenticate, mediaStore, evidenceStore, resolveEdgeContext, statFile = fs.statSync, operationBudget = createOperationBudget }) {
  const busy = new Set();
  const selections = new Map();
  // A normal batch can include 50 works plus per-account covers. Every import
  // path uses the same bounded retention instead of evicting at 32 on choose.
  const retainSelection = (id, selection) => {
    selections.set(id, selection);
    while (selections.size > 256) selections.delete(selections.keys().next().value);
  };
  let choosing = false;
  const nativeContext = async (event, input) => {
    if (!resolveEdgeContext || input.platform !== 'wechat') throw Error('此原生账号发布连接尚未准备好');
    return resolveEdgeContext(event, input);
  };
  const extensionsFor = type => type === 'video' ? ['mp4', 'mov', 'webm', 'mkv'] : ['jpg', 'jpeg', 'png', 'webp'];
  const describeFiles = (files, type) => {
    if (!files.length || files.length > (type === 'video' ? 1 : 9)) throw new Error('请选择一个视频或最多 9 张图片');
    return files.map(file => {
      let stat;
      try { stat = statFile(file); } catch { throw Error('本地素材无法读取，可能已移动或修改；请重新选择'); }
      if (!extensionsFor(type).includes(path.extname(file).slice(1).toLowerCase()) || !stat.isFile()) throw new Error('素材格式不支持');
      if (!Number.isFinite(stat.size) || stat.size <= 0) throw Error('本地素材为空，请重新选择有效的视频或图片');
      return { name: path.basename(file), size: stat.size, modified: stat.mtimeMs };
    });
  };
  const checkedSelection = (id, owner) => {
    const saved = selections.get(id);
    if (!saved || saved.owner !== owner) throw Error('素材选择已失效，请重新选择');
    if (JSON.stringify(describeFiles(saved.paths, saved.mediaType)) !== JSON.stringify(saved.files)) throw Error('原素材已移动或修改，请重新选择');
    return { mediaType: saved.mediaType, paths: saved.paths, files: saved.files };
  };
  ipcMain.handle('matrix:extract-publish-media', async (event, input) => {
    try {
      if (event.sender.id !== getWindow()?.webContents.id || !authenticate) throw Error('仅允许已登录的远效主窗口提取已选择素材');
      const auth = await authenticate(input?.accessToken);
      if (!input?.options || ['body', 'cover'].some(key => typeof input.options[key] !== 'boolean')) throw Error('提取选项无效');
      const source = checkedSelection(input.selectionId, event.sender.id);
      const data = await readPublishCompanions(source.paths[0], input.options);
      if ((await authenticate(input.accessToken)).userId !== auth.userId) throw Error('登录用户已变化，未填入提取内容');
      checkedSelection(input.selectionId, event.sender.id);
      let cover;
      if (data.cover) { const id = randomUUID(); retainSelection(id, { ...data.cover, owner: event.sender.id }); cover = { id, name: data.cover.files[0].name, index: 1 }; }
      return { ...(data.body !== undefined ? { body: data.body } : {}), ...(cover ? { cover } : {}), notices: data.notices };
    } catch { return { error: '自动提取未完成：素材或登录状态已变化，或目录不可读取；原文案和封面已保留' }; }
  });
  ipcMain.handle('matrix:validate-publish-media', async (event, input) => {
    try {
      if (event.sender.id !== getWindow()?.webContents.id || !authenticate) throw Error('仅允许远效主窗口校验发布素材');
      await authenticate(input?.accessToken);
      checkedSelection(input?.selectionId, event.sender.id);
      if (!Array.isArray(input?.covers) || input.covers.length > 2 || new Set(input.covers.map(cover => cover.index)).size !== input.covers.length) throw Error('封面配置无效');
      for (const cover of input.covers) {
        if (![1,2].includes(cover.index)) throw Error('封面序号无效');
        let selected;
        try { selected = checkedSelection(cover.id, event.sender.id); }
        catch (error) { throw Error(`封面${cover.index}不可用：${error.message}`); }
        if (selected.mediaType !== 'image' || selected.files.length !== 1) throw Error(`封面${cover.index}必须是单张图片`);
      }
      return { valid: true };
    } catch (error) { return { error: error.message }; }
  });
  ipcMain.handle('matrix:remember-publish-media', async (event, input) => {
    try {
      if (event.sender.id !== getWindow()?.webContents.id || !mediaStore || !authenticate) throw Error('仅允许远效主窗口保存素材引用');
      const auth = await authenticate(input?.accessToken);
      if (!Array.isArray(input?.covers) || input.covers.length > 2 || input.covers.some(c => ![1, 2].includes(c.index)) || new Set(input.covers.map(c => c.index)).size !== input.covers.length) throw Error('封面配置无效');
      const media = checkedSelection(input.selectionId, event.sender.id);
      const covers = input.covers.map(c => ({ index: c.index, selection: checkedSelection(c.id, event.sender.id) }));
      if (covers.some(c => c.selection.mediaType !== 'image' || c.selection.files.length !== 1)) throw Error('封面必须是单张图片');
      const result = await mediaStore.save(auth.userId, media, covers);
      if ((await authenticate(input.accessToken)).userId !== auth.userId) throw Error('登录用户已变化');
      return result;
    } catch (error) { return { error: error.message }; }
  });
  ipcMain.handle('matrix:capture-publish-frame', async (event, input) => {
    try {
      if (event.sender.id !== getWindow()?.webContents.id || !mediaStore?.captureFrame || !authenticate) throw Error('仅允许远效主窗口保存视频截帧');
      const auth = await authenticate(input?.accessToken);
      const source = checkedSelection(input?.selectionId, event.sender.id);
      if (source.mediaType !== 'video' || source.files.length !== 1) throw Error('仅支持截取本人已选择视频的当前帧');
      if ((await authenticate(input.accessToken)).userId !== auth.userId) throw Error('登录用户已变化，未保存截帧');
      checkedSelection(input.selectionId, event.sender.id);
      const saved = mediaStore.captureFrame(auth.userId, input.dataUrl, input.at), id = randomUUID();
      retainSelection(id, { ...saved, owner: event.sender.id });
      return { selection: { id, mediaType: saved.mediaType, files: saved.files } };
    } catch (error) { return { error: error.message }; }
  });
  ipcMain.handle('matrix:restore-publish-media', async (event, input) => {
    try {
      if (event.sender.id !== getWindow()?.webContents.id || !mediaStore || !authenticate) throw Error('仅允许远效主窗口恢复素材');
      const auth = await authenticate(input?.accessToken);
      if (!/^[a-f0-9-]{36}$/i.test(input?.recoveryId || '')) throw Error('素材记录标识无效');
      if (input.skipCovers !== undefined && typeof input.skipCovers !== 'boolean') throw Error('封面恢复选项无效');
      let stored;
      try {
        stored = mediaStore.read(auth.userId, input.recoveryId);
        // Explicit automatic-cover mode drops only saved cover references.
        // Video ownership, path, size and mtime checks still apply in full.
        if (input.skipCovers === true) stored = { ...stored, covers: [] };
        for (const saved of [stored.media, ...stored.covers.map(c => c.selection)]) {
          if (!Array.isArray(saved.paths) || saved.paths.some(p => typeof p !== 'string' || !path.isAbsolute(p)) || !['image','video'].includes(saved.mediaType) || JSON.stringify(describeFiles(saved.paths, saved.mediaType)) !== JSON.stringify(saved.files)) throw Error('原素材已移动或修改，请重新选择；不会上传变化后的文件');
        }
      } catch (error) {
        if ((await authenticate(input.accessToken)).userId !== auth.userId) throw Error('登录用户已变化');
        return { error: error.message, code: 'PUBLISH_MEDIA_RESELECT_REQUIRED' };
      }
      if ((await authenticate(input.accessToken)).userId !== auth.userId) throw Error('登录用户已变化');
      const mint = saved => {
        const id = randomUUID(); retainSelection(id, { ...saved, owner: event.sender.id });
        return { id, mediaType: saved.mediaType, files: saved.files };
      };
      return { selection: mint(stored.media), covers: stored.covers.map(c => { const selection = mint(c.selection); return { id: selection.id, name: selection.files[0].name, index: c.index }; }) };
    } catch (error) { return { error: error.message }; }
  });
  ipcMain.handle('matrix:import-media', async (event, input) => {
    try {
      if (event.sender.id !== getWindow()?.webContents.id) throw new Error('仅允许远效主窗口导入素材');
      if (!['video', 'image'].includes(input?.mediaType) || !Array.isArray(input?.paths) || input.paths.some(file => typeof file !== 'string' || !path.isAbsolute(file))) throw new Error('请拖入本机的视频或图片文件');
      const paths = [...new Set(input.paths)], files = describeFiles(paths, input.mediaType), id = randomUUID();
      retainSelection(id, { owner: event.sender.id, mediaType: input.mediaType, paths, files });
      return { selection: { id, mediaType: input.mediaType, files } };
    } catch (error) { return { error: error.message }; }
  });
  ipcMain.handle('matrix:read-publish-evidence', async (event, input) => {
    try {
      if (event.sender.id !== getWindow()?.webContents.id || !evidenceStore || !authenticate) throw Error('仅允许远效主窗口读取发布观测');
      if (!validId(input?.taskId) || !validId(input?.attemptId)) throw Error('发布任务或尝试标识无效');
      const auth = await authenticate(input?.accessToken);
      const items = evidenceStore.list(auth.userId, input.taskId, input.attemptId);
      if ((await authenticate(input.accessToken)).userId !== auth.userId) throw Error('登录用户已变化');
      return { items };
    } catch { return { error: '发布观测暂不可读取；任务与发布结果未改动' }; }
  });
  ipcMain.handle('matrix:sync-publish-form', async (event, input) => {
    // Bilibili validates every tag asynchronously. Keep an overall bound, but
    // do not abort an otherwise pending final tag at the old six-second limit.
    const budget = operationBudget(input?.platform==='bilibili'&&input?.command==='fill'?90000:18000);
    let guest;
    let acquired = false;
    try {
      if (event.sender.id !== getWindow()?.webContents.id) throw new Error('仅允许远效主窗口同步');
      const config = platforms[input?.platform];
      const native = input?.edgeGuestId !== undefined;
      if ((input?.taskId !== undefined || input?.attemptId !== undefined) && (!validId(input.taskId) || !validId(input.attemptId))) throw Error('发布任务或尝试标识无效');
      const nativeOwner = native ? await nativeContext(event, input) : undefined;
      guest = native ? nativeOwner.guest : webContents.fromId(input?.webContentsId);
      if (!config || !/^[a-z0-9-]{16,80}$/i.test(input.sessionId || '') || !guest || guest.isDestroyed() || (native ? guest.engine !== 'webview2' : guest.hostWebContents?.id !== event.sender.id || guest.session !== session.fromPartition(`persist:matrix-${input.platform}-${input.sessionId}`))) throw new Error('账号会话不一致');
      // Bind durable evidence to a verified owner/account, never to an owner ID
      // supplied by the renderer. Manual form use without a task stays supported.
      const evidenceOwner = evidenceStore && input.taskId ? nativeOwner?.auth || await budget.run(() => authenticate(input.accessToken, input.accountId)) : undefined;
      if (evidenceOwner && (evidenceOwner.account?.id !== input.accountId || evidenceOwner.account.platform !== input.platform || evidenceOwner.account.connectorSessionId !== input.sessionId)) throw Error('该会话不属于当前用户的绑定账号');
      if (busy.has(guest.id)) throw new Error('当前账号正在处理操作');
      busy.add(guest.id); acquired = true;
      const url = new URL(guest.getURL());
      if (url.protocol !== 'https:' || !(url.hostname === config.domain || url.hostname.endsWith('.' + config.domain)) || !/upload|publish|post\/create|post\/video/.test(url.pathname)) throw new Error('请先在当前账号打开官方发布表单');
      if (!native) {
        const login=await budget.run(() => inspectPlatformSession(input.platform, guest.session, guest));
        if(!login.authenticated){
          // A read-only upload poll may arrive while the editor is normally
          // navigating after file handoff. Missing auth proof is NOT a proof
          // of logout, nor permission to read/fill/submit without that proof.
          if(input.command==='progress'){
            if(login.profile?.verificationRequired)throw Error('当前发布页要求本人验证，请在该账号官网页完成后继续；素材不会自动重传');
            if(login.profile?.accountIssue)throw Error('当前发布页提示账号状态异常，请先处理官方提示；素材不会自动重传');
            if(!login.profile?.loginVisible&&!require('./platform-session.cjs').isLoginPage(guest.getURL()))throw Error('官方发布页账号状态尚未就绪，尚不能确认账号会话；素材不会自动重传');
          }
          throw new Error('请先登录当前平台账号');
        }
      }
      if (!['fill', 'topics', 'progress', 'describe'].includes(input.command)) throw new Error('同步操作无效');
      if (input.command === 'fill') {
        const form = input.form;
        if (form?.extras !== undefined && (!form.extras || Array.isArray(form.extras) || typeof form.extras !== 'object' || Object.keys(form.extras).length > 40 || Object.entries(form.extras).some(([key, value]) => !key || key.length > 50 || typeof value !== 'string' || value.length > 1000))) throw new Error('平台扩展配置格式或长度不正确');
        if (!form || typeof form.title !== 'string' || typeof form.body !== 'string' || form.title.length > 500 || form.body.length > 20000 || !Array.isArray(form.topics) || form.topics.length > 15 || form.topics.some(t => typeof t !== 'string' || !t.trim() || t.length > 40) || !form.options || Object.entries(form.options).some(([key, value]) => !['category', 'visibility', 'originality'].includes(key) || typeof value !== 'string' || value.length > 100)) throw new Error('发布配置格式或长度不正确');
      }
      if (guest.getURL() !== url.href) throw new Error('官方页面已切换，请重新同步');
      const expected = input.form?.options?.visibility;
      const form = { ...input.form, options: { ...input.form?.options }, platform: input.platform };
      if (input.command === 'fill' && expected) delete form.options.visibility;
      budget.check();
      const result = await runOfficialDOM(guest, publishForm, [input.command, form], 'matrix-publish-form', { backgroundFocus: input.command === 'fill' });
      if (input.command === 'progress' && result.editorReady) {
        const validation = await runOfficialDOM(guest, publishValidation, [{}], 'matrix-publish-form');
        if (validation?.version !== 1 || !Array.isArray(validation.errors)) throw Error('官方表单必填项未完成核验');
        result.validationErrors = [...new Set([...(result.validationErrors || []), ...validation.errors.map(error => error.message)])].slice(0,12);
        if (result.validationErrors.length) result.ready = false;
      }
      if(input.command==='fill'&&input.platform==='bilibili'){
        const declaration=form.extras?.['创作声明'];
        try{
          if(!declaration)throw Error('请先按实际内容选择创作声明');
          await require('./bilibili-declaration.cjs').syncBilibiliDeclaration(guest,declaration,budget);
          result.unresolved=result.unresolved.filter(message=>!message.startsWith('创作声明：'));
          result.filled.push('创作声明');
        }catch(error){result.unresolved=result.unresolved.filter(message=>!message.startsWith('创作声明：'));result.unresolved.push('创作声明：'+error.message);}
        if(form.topics?.length){
          try{
            if(!authenticate||!input.accountId||!input.accessToken)throw Error('自动添加标签需要当前登录用户的绑定账号，未操作其他账号');
            const tagOwner=evidenceOwner||await budget.run(()=>authenticate(input.accessToken,input.accountId),'确认标签所属账号',8000);
            const assertCurrent=async()=>{
              budget.check();const fresh=await budget.run(()=>authenticate(input.accessToken,input.accountId),'确认标签填写账号未变化',8000);
              if(fresh.userId!==tagOwner.userId||fresh.account?.id!==input.accountId||fresh.account.platform!=='bilibili'||fresh.account.connectorSessionId!==input.sessionId||fresh.account.nativeAccountKey!==tagOwner.account.nativeAccountKey)throw Error('填写期间账号绑定已变化，已停止添加标签');
            };
            await require('./bilibili-tags.cjs').syncBilibiliTags(guest,form.topics,budget,{assertCurrent});
            result.unresolved=result.unresolved.filter(message=>!message.startsWith('tags：'));
            result.filled.push('tags');
          }catch(error){result.unresolved=result.unresolved.filter(message=>!message.startsWith('tags：'));result.unresolved.push('tags：'+error.message);}
        }
      }
      if (input.command === 'progress' && result.observation) {
        result.observationAt = new Date().toISOString();
        result.observationStored = false;
        if (evidenceOwner) {
          try {
            const saved = evidenceStore.record({ ownerId: evidenceOwner.userId, accountId: input.accountId, platform: input.platform, taskId: input.taskId, attemptId: input.attemptId }, result.observation);
            result.observationStored = saved.stored;
            result.observationAt = saved.at;
          } catch { result.observationWarning = '本次观测未能保存到本地，未影响官方页面；不会因此重传或重发'; }
        }
      }
      if (input.command === 'fill' && expected) {
        try {
          budget.check();
          const { publishVisibility } = require('./publish-visibility.cjs');
          const choice = await withOfficialDOM(guest, 'matrix-publish-visibility', async ({ evaluate, send }) => {
            let state = await evaluate(publishVisibility, ['select', { platform: input.platform, expected }]);
            if (state.interaction) {
              const point = state.interaction;
              const clear = await evaluate((point) => { const hit = document.elementFromPoint(point.x, point.y); return Boolean(hit?.closest('.permission-card-select')); }, [point]);
              if (!clear) throw Error('可见范围菜单被弹窗遮挡');
              await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
              await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
              await new Promise(resolve => setTimeout(resolve, 100));
              state = await evaluate(publishVisibility, ['select', { platform: input.platform, expected }]);
            }
            for (let attempt=0;attempt<10&&(state.opened||state.waiting);attempt++) {
              budget.check();
              await new Promise(resolve=>setTimeout(resolve,100));
              state=await evaluate(publishVisibility,['select',{platform:input.platform,expected}]);
            }
            if (input.platform === 'xiaohongshu') {
              const settleInput = { platform: input.platform, expected, expectedTitle: input.form.title };
              const settling = await evaluate(publishVisibility, ['settle', settleInput]);
              if (settling.interactionKind === 'dismiss-visibility') {
                const point = settling.interaction;
                const clear = await evaluate((p, title) => { const hit = document.elementFromPoint(p.x, p.y); return hit?.matches('input.d-text') && hit.value === title; }, [point, input.form.title]);
                if (!clear) throw Error('原作品标题被遮挡，未点击其他控件');
                await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
                await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
                await new Promise(resolve => setTimeout(resolve, 200));
                const closed = await evaluate(publishVisibility, ['settle', settleInput]);
                if (closed.interaction) throw Error('官方可见范围菜单未收起，已停止本次操作；未提交作品');
              }
            }
            await new Promise(resolve => setTimeout(resolve, 50));
            return evaluate(publishVisibility, ['read', { platform: input.platform }]);
          }, { backgroundFocus: true });
          if (choice.visibility === expected) result.filled.push('visibility');
          else result.unresolved.push('visibility：请在官方表单选择并确认 ' + expected);
        } catch (error) { result.unresolved.push('visibility：请在官方表单选择并确认 ' + expected + '（' + error.message + '）'); }
      }
      return result;
    } catch (error) { return { error: error.message }; }
    finally { if (guest && acquired) busy.delete(guest.id); }
  });
  ipcMain.handle('matrix:choose-media', async (event, input) => {
    let acquired = false;
    try {
      const window = getWindow();
      if (!window || event.sender.id !== window.webContents.id) throw new Error('仅允许远效主窗口选择素材');
      if (!['video', 'image'].includes(input?.mediaType)) throw new Error('请选择视频或图片类型');
      if (choosing) throw new Error('素材选择窗口已经打开');
      choosing = true; acquired = true;
      const selected = await dialog.showOpenDialog(window, { title: '选择供所选账号复用的素材（此时不会上传）', filters: [{ name: input.mediaType === 'video' ? '视频' : '图片', extensions: extensionsFor(input.mediaType) }], properties: input.mediaType === 'image' ? ['openFile', 'multiSelections'] : ['openFile'] });
      if (selected.canceled || !selected.filePaths.length) return { cancelled: true };
      const files = describeFiles(selected.filePaths, input.mediaType), id = randomUUID();
      // Only the opaque handle reaches the renderer. Paths remain in main-process memory.
      retainSelection(id, { owner: event.sender.id, mediaType: input.mediaType, paths: selected.filePaths, files });
      return { selection: { id, mediaType: input.mediaType, files } };
    } catch (error) { return { error: error.message }; }
    finally { if (acquired) choosing = false; }
  });
  ipcMain.handle('matrix:insert-draft', async (event, input) => {
    let contents;
    let acquired = false;
    try {
      const window = getWindow();
      if (!window || event.sender.id !== window.webContents.id) throw new Error('仅允许远效主窗口操作');
      const config = platforms[input?.platform];
      if (!config || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 20000) throw new Error('文案不能为空或超过 20000 字符');
      contents = webContents.fromId(input.webContentsId);
      if (!/^[a-z0-9-]{16,80}$/i.test(input.sessionId || '') || !contents || contents.isDestroyed() ||
          contents.hostWebContents?.id !== window.webContents.id || contents.session !== session.fromPartition(`persist:matrix-${input.platform}-${input.sessionId}`)) throw new Error('账号会话不一致');
      if (busy.has(contents.id)) throw new Error('当前账号正在处理操作，请稍后再试');
      busy.add(contents.id); acquired = true;
      const pageUrl = contents.getURL();
      const url = new URL(pageUrl);
      if (url.protocol !== 'https:' || !(url.hostname === config.domain || url.hostname.endsWith(`.${config.domain}`)) || /login|passport|signin/i.test(url.pathname + url.hostname)) throw new Error('请先进入已登录账号的官方操作页面');
      if (!(await inspectPlatformSession(input.platform, contents.session, contents)).authenticated) throw new Error('请先完成当前账号的官方登录');
      const editable = await contents.executeJavaScript(`(${isEditableTarget.toString()})(document.activeElement)`);
      if (!editable) throw new Error('请先在官方页面点击要填入的标题、正文或回复输入框；不处理登录框或跨域内嵌框');
      if (contents.getURL() !== pageUrl) throw new Error('页面已切换，请重新选择输入框');
      contents.focus();
      await contents.insertText(input.text);
      return { inserted: true, sent: false };
    } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
    finally { if (contents && acquired) busy.delete(contents.id); }
  });
  ipcMain.handle('matrix:upload-media', async (event, input) => {
    const budget = operationBudget(input?.coverIndex === undefined ? 35000 : 75000);
    let contents;
    let attached = false;
    let acquired = false;
    let transferred = false;
    let transferConfirmed = false;
    try {
      const window = getWindow();
      if (!window || event.sender.id !== window.webContents.id) throw new Error('仅允许远效主窗口操作');
      const config = platforms[input?.platform];
      if (!config || !['video', 'image'].includes(input.mediaType)) throw new Error('不支持的平台或素材类型');
      const native = input.edgeGuestId !== undefined;
      if (input.coverIndex === undefined && !publishCapabilities[input.platform]?.mediaTypes.includes(input.mediaType)) throw Error(`${publishCapabilities[input.platform]?.label || '该平台'}当前一键发布仅适配视频，暂不支持图文；未交付任何素材`);
      contents = native ? (await nativeContext(event, input)).guest : webContents.fromId(input.webContentsId);
      const partition = `persist:matrix-${input.platform}-${input.sessionId}`;
      if (!/^[a-z0-9-]{16,80}$/i.test(input.sessionId || '') || !contents || contents.isDestroyed() ||
          (native ? contents.engine !== 'webview2' : contents.hostWebContents?.id !== window.webContents.id || contents.session !== session.fromPartition(partition))) throw new Error('账号会话不一致');
      if (busy.has(contents.id)) throw new Error('正在处理上传，请勿重复操作');
      busy.add(contents.id);
      acquired = true;
      const validatePage = async () => {
        budget.check();
        const url = new URL(contents.getURL());
        if (url.protocol !== 'https:' || !(url.hostname === config.domain || url.hostname.endsWith(`.${config.domain}`)) ||
            !/upload|publish|post\/create|post\/video/.test(url.pathname)) throw new Error('请先进入该账号的官方内容发布页面');
        if (native) { const fresh = await budget.run(() => nativeContext(event, input)); if (fresh.guest !== contents) throw Error('当前视频号页面已关闭或变化'); }
        else if (!(await budget.run(() => inspectPlatformSession(input.platform, contents.session, contents))).authenticated) throw new Error('请先完成当前账号的官方登录');
        budget.check();
      };
      await validatePage();
      let selected;
      if (input.selectionId) {
        const saved = selections.get(input.selectionId);
        if (!saved || saved.owner !== event.sender.id || saved.mediaType !== input.mediaType) throw new Error('素材选择已失效，请返回发布编辑页重新选择');
        if (JSON.stringify(describeFiles(saved.paths, saved.mediaType)) !== JSON.stringify(saved.files)) throw new Error('本地素材已修改，请重新选择后上传');
        selected = { filePaths: saved.paths, canceled: false };
      } else selected = await dialog.showOpenDialog(window, { title: '选择上传到当前账号的素材', filters: [{ name: input.mediaType === 'video' ? '视频' : '图片', extensions: extensionsFor(input.mediaType) }], properties: input.mediaType === 'image' ? ['openFile', 'multiSelections'] : ['openFile'] });
      if (selected.canceled || !selected.filePaths.length) return { cancelled: true };
      const selectedSignature = JSON.stringify(describeFiles(selected.filePaths, input.mediaType));
      await validatePage();
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      if (input.coverIndex !== undefined && (input.mediaType !== 'image' || selected.filePaths.length !== 1 || ![1, 2].includes(input.coverIndex))) throw Error('封面必须是单张图片');
      const coverArgs = { platform: input.platform, index: input.coverIndex };
      if (input.coverIndex !== undefined) {
        let opened = false;
        for (let attempt = 0; attempt < 30; attempt++) {
          await validatePage();
          const state = await withOfficialDOM(contents, 'matrix-upload-controls', context=>openCoverWithInput(context,coverArgs,{wait,check:()=>budget.check()}), { backgroundFocus: true });
          if (state.opened) { opened = true; break; }
          await wait(200);
        }
        if (!opened) throw Error('未唯一识别对应封面编辑入口；没有上传到其他控件');
      }
      let lastError;
      for (let attempt = 0; attempt < 40; attempt++) {
        await validatePage();
        try {
          await withOfficialDOM(contents, 'matrix-upload-controls', async context => {
            const { evaluate, send } = context;
            let target;
            if (native && input.platform === 'wechat' && input.mediaType === 'video' && input.coverIndex === undefined) target = await resolveWechatUpload(contents, context);
            else if (!native && input.platform === 'bilibili' && input.mediaType === 'video' && input.coverIndex === undefined) target = await resolveBilibiliUpload(contents, context);
            else {
              const handle = await evaluate(uploadControl, [{ platform: input.platform, mediaType: input.mediaType, count: selected.filePaths.length, coverIndex: input.coverIndex }], false);
              if (!handle?.objectId) throw Error('官方上传控件尚未就绪');
              // Resolve and hand off in one DOM generation; never reuse frontend nodeId.
              const connected = await send('Runtime.callFunctionOn', { objectId: handle.objectId, functionDeclaration: 'function(){return this.isConnected&&!this.disabled}', returnByValue: true });
              if (!connected.result?.value) throw Error('官方上传控件已重建');
              target = { objectId: handle.objectId };
            }
            await validatePage();
            if (JSON.stringify(describeFiles(selected.filePaths,input.mediaType))!==selectedSignature) throw Error('本地素材已移动或修改，未交付官方上传控件；请重新选择');
            // Once dispatched, a transport timeout cannot prove that Chromium
            // did not hand off the file. Never resend it on that assumption.
            transferred = true;
            await send('DOM.setFileInputFiles', { ...target, files: selected.filePaths });
            transferConfirmed = true;
            if (input.coverIndex !== undefined) await evaluate(coverControl, ['uploaded', coverArgs]);
          }, { backgroundFocus: true });
          break;
        } catch (error) {
          lastError = error;
          // Only re-resolve before a known successful file handoff. Unknown errors
          // after the handoff must never cause another upload.
          if (transferred || !/无法唯一识别|尚未就绪|已重建|Could not find node|Cannot find context|Cannot find object|Execution context was destroyed/i.test(error.message)) throw error;
          await wait(200);
        }
      }
      if (!transferred) throw lastError || Error('等待官方上传控件超时');
      if (input.coverIndex !== undefined) {
        for (let attempt = 0; attempt < 100; attempt++) {
          await validatePage();
          const state = await runOfficialDOM(contents, coverControl, ['finish', coverArgs], 'matrix-upload-controls', { backgroundFocus: true });
          if (state.coverConfirmed) return { uploadStarted: true, coverConfirmed: true, count: 1, filenames: selected.filePaths.map(file => path.basename(file)) };
          await wait(300);
        }
        throw Error('封面已交付，等待官方裁剪确认超时；不会重复上传');
      }
      return { uploadStarted: true, count: selected.filePaths.length, filenames: selected.filePaths.map(file => path.basename(file)) };
    } catch (error) { return { error: error instanceof Error ? error.message : String(error), uploadStarted: transferred, handoffUncertain: transferred && !transferConfirmed }; }
    finally {
      if (attached && contents && !contents.isDestroyed()) { try { contents.debugger.detach(); } catch { /* Guest may be closing. */ } }
      if (contents && acquired) busy.delete(contents.id);
    }
  });
}
module.exports = { registerPersonalAssist, selectUploadInput, isEditableTarget };
