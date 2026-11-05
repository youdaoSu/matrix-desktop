const { createJournal } = require('./page-action-journal.cjs');
const { randomUUID } = require('node:crypto');
const { runOfficialDOM } = require('./official-dom.cjs');
const { publishVisibility } = require('./publish-visibility.cjs');
const { publishResult, publishVerification } = require('./publish-result.cjs');
const { publishValidation } = require('./publish-validation.cjs');
const { createOperationBudget } = require('./operation-budget.cjs');
const { observePublishOutcome, sanitizeOutcomeObservation } = require('./publish-outcome.cjs');
const { normalizePublishAcceptance, pendingReview } = require('./publish-acceptance.cjs');

async function settlePublishEditor(input={},componentRoots=[]){
  if(location.protocol!=='https:'||location.hostname!=='creator.xiaohongshu.com'||!/^\/publish(?:\/|$)/.test(location.pathname)||!input.expectedTitle)return{settled:false};
  const query=selector=>[...new Set([document,...componentRoots].flatMap(root=>[...root.querySelectorAll(selector)]))];
  const visible=node=>{if(!node?.isConnected)return false;const rect=node.getBoundingClientRect();if(!rect.width||!rect.height)return false;for(let el=node;el;el=el.parentElement||el.getRootNode?.().host){const style=getComputedStyle(el);if(style.display==='none'||style.visibility==='hidden'||style.opacity==='0'||el.hidden||el.getAttribute('aria-hidden')==='true')return false;}return true;};
  let active=document.activeElement;for(let i=0;i<8;i++){const root=componentRoots.find(root=>root.host===active)||active?.shadowRoot;if(!root?.activeElement)break;active=root.activeElement;}
  if(query('dialog[open],[role=dialog],[aria-modal=true]').some(visible))return{settled:false};
  const titles=query('input[placeholder="填写标题会有更多赞哦"]').filter(node=>visible(node)&&!node.disabled&&!node.readOnly&&node.type==='text');
  const editors=query('[contenteditable="true"],[contenteditable=""]').filter(visible).filter(node=>!node.parentElement?.closest('[contenteditable="true"],[contenteditable=""]'));
  if(editors.length!==1)return{settled:false};
  const editor=editors[0];
  if(active!==document.body&&active!==document.documentElement&&active!==titles[0]&&active!==editor&&!editor.contains(active))return{settled:false};
  if(titles.length!==1||titles[0].value!==input.expectedTitle)throw Error('提交前标题未匹配原任务，未改变编辑焦点');
  const title=titles[0],url=location.href,body=editor.textContent;
  const unchanged=()=>location.href===url&&editor.isConnected&&title.isConnected&&title.value===input.expectedTitle&&editor.textContent===body;
  // Hashtag suggestions may use an outside-click listener rather than blur.
  // End editing through this exact task's ordinary title control. A guest can
  // have lost focus to its document while the owner check awaited.
  title.focus({preventScroll:true});
  await new Promise(resolve=>setTimeout(resolve,0));
  if(!unchanged())throw Error('结束正文编辑时表单发生变化，未提交');
  title.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  const rect=title.getBoundingClientRect(),x=rect.x+rect.width/2,y=rect.y+rect.height/2;
  let hit=document.elementFromPoint(x,y);
  for(let i=0;hit&&i<8;i++){const root=componentRoots.find(root=>root.host===hit)||hit.shadowRoot;if(!root)break;const next=root.elementFromPoint(x,y);if(!next||next===hit)break;hit=next;}
  if(hit===title&&!query('dialog[open],[role=dialog],[aria-modal=true]').some(visible)){
    // Outside-click directives can listen to down/up rather than click. Keep
    // the entire sequence on the verified ordinary title input. These public
    // DOM events remain untrusted; never click through a new overlay or send
    // a guest/global keyboard event to dismiss a menu.
    const targetClear=()=>{
      if(!unchanged()||query('dialog[open],[role=dialog],[aria-modal=true]').some(visible))return false;
      const current=title.getBoundingClientRect();
      if(current.x!==rect.x||current.y!==rect.y||current.width!==rect.width||current.height!==rect.height)return false;
      let top=document.elementFromPoint(x,y);
      for(let i=0;top&&i<8;i++){const root=componentRoots.find(root=>root.host===top)||top.shadowRoot;if(!root)break;const next=root.elementFromPoint(x,y);if(!next||next===top)break;top=next;}
      return top===title;
    };
    for(const type of ['pointerdown','mousedown','pointerup','mouseup']){
      if(!targetClear())throw Error('结束正文编辑时控件或页面发生变化，未提交');
      const options={bubbles:true,composed:true,cancelable:true,clientX:x,clientY:y,button:0,buttons:type.endsWith('down')?1:0};
      title.dispatchEvent(type.startsWith('pointer')?new PointerEvent(type,{...options,pointerId:1,pointerType:'mouse',isPrimary:true}):new MouseEvent(type,options));
    }
    if(!targetClear())throw Error('结束正文编辑时控件或页面发生变化，未提交');
    title.click();
  }
  await new Promise(resolve=>setTimeout(resolve,0));
  if(!unchanged())throw Error('结束正文编辑时表单发生变化，未提交');
  return{settled:true};
}

// Runs in an isolated renderer world. Page scripts cannot replace the saved DOM references.
function pageAction(command, input, componentRoots = []) {
  const checkedSubmit = command === 'submit-checked';
  if (checkedSubmit) command = 'submit';
  const query = selector => [...new Set([document, ...componentRoots].flatMap(root => [...root.querySelectorAll(selector)]))];
  const visible = el => {
    if (!el?.isConnected || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    if (location.hostname === 'channels.weixin.qq.com' && el.classList.contains('weui-desktop-btn_disabled')) return false;
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    if (!(r.width > 0 && r.height > 0) || s.display === 'none' || s.visibility === 'hidden' || s.pointerEvents === 'none') return false;
    for (let parent = el; parent; parent = parent.parentElement || parent.getRootNode().host) {
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || /animate-hide/.test(parent.className || '')) return false;
    }
    return true;
  };
  const officialIcon = el => location.hostname === 'www.douyin.com' && (/^\/video\/\d+$/.test(location.pathname) && el.matches('.comment-input-inner-container .commentInput-right-ct span.wchsYBpK') ? '发送评论' : el.matches('[data-e2e="msg-input"] .e2e-send-msg-btn') ? '发送消息' : '');
  const text = el => officialIcon(el) || (el.innerText || el.getAttribute('aria-label') || el.value || '').replaceAll(String.fromCharCode(8203), '').trim();
  const fields = () => [...query('input,textarea,[contenteditable]:not([contenteditable=false])')].filter(el => {
    const label = [el.type, el.name, el.id, el.autocomplete, el.placeholder, el.getAttribute('aria-label')].join(' ');
    return visible(el) && !el.readOnly && !/password|one-time-code|username|email|tel|search|hidden|file|checkbox|radio|token|secret|密码|验证码|手机号|邮箱|搜索|身份证|密钥/i.test(label) &&
      (el.tagName === 'TEXTAREA' || el.isContentEditable || (el.tagName === 'INPUT' && ['text', ''].includes(el.type)));
  }).slice(0, 30).map(el => ({ label: (el.getAttribute('aria-label') || el.placeholder || el.getAttribute('data-placeholder') || '表单内容').slice(0, 100), value: (el.value ?? el.innerText ?? '').slice(0, 20000) }));
  const labels = { publish: /^(发布|发表|投稿|立即发布|确认发布|发布笔记|发布视频|发表视频|立即投稿)$/, comments: /^(回复|发送|发送评论|发布评论|发表评论|发送回复)$/, messages: /^(发送|发送消息)$/, withdraw: /^(下架|确认下架|取消发布|设为私密|转为私密)$/ };
  const materials = () => [...query('input[type="file"]')].flatMap(el => [...(el.files || [])].map(file => ({ name: file.name, size: file.size, modified: file.lastModified })));
  const mediaState = () => [...query('video,audio')].map(el => el.currentSrc || el.src || '');
  const contextText = el => (el.closest('[data-e2e="comment-item"],form,[role="dialog"],article')?.innerText || (officialIcon(el) === '发送消息' ? document.querySelector('.StackLayoutStackChatHeadertitle')?.innerText : '') || el.closest('.comment-input-inner-container')?.innerText || el.parentElement?.innerText || '').trim().slice(0, 2000);
  const choices = () => [...query('select,input[type="checkbox"],input[type="radio"],[role="checkbox"],[role="radio"],[aria-selected="true"],label[data-checked],.permission-card-select .d-select-description,.video-setting-card .check-radio-v2-container,h1,h2,h3')].filter(visible).map(el => ({ text: text(el).slice(0, 200), value: el.tagName === 'SELECT' ? [...el.selectedOptions].map(option => option.textContent).join(',') : el.matches('.check-radio-v2-container') ? !!el.querySelector('.check-radio-v2-box-checked') : el.checked ?? el.getAttribute('aria-checked') ?? el.getAttribute('data-checked') ?? '' }));
  const signals = () => [...query('[role="alert"],[role="status"],[class*="toast"],[class*="message-notice"],[class*="Message-notice"],[class*="message-success"],[class*="message-error"],[class*="publish-success"],[class*="publishSuccess"]')].filter(visible).map(text).filter(s => s && s.length < 400);
  const classify = (kind, message) => {
    if (kind === 'withdraw') {
      if (/下架失败|无法下架|设置失败|取消发布失败|未.*(?:下架|私密).*成功|请.*验证/.test(message)) return 'failed';
      return /下架成功|已下架|已设为私密|已转为私密|取消发布成功/.test(message) ? 'confirmed' : null;
    }
    if (kind === 'publish') {
      // A tutorial, question, conditional phrase or upload-complete hint is not
      // publication evidence. Bili "投稿成功" acknowledges submission, not review.
      const label = message.replace(/^(?:错误|提示|警告|温馨提示)[：:\s]*/, '').trim();
      const work = '(?:您(?:的)?|你(?:的)?)?(?:视频|作品|笔记|稿件|内容)?';
      if (/^(?:请|需要|请先).*(?:验证|验证码|扫码|人脸)/.test(label)) return 'user_action';
      if (new RegExp('^' + work + '(?:审核未通过|审核不通过|审核驳回|稿件退回)(?:[：:，。！!\\s]|$)').test(label)) return 'failed';
      if (new RegExp('^' + work + '(?:发布|发表|投稿|提交审核)(?:失败|未成功|不成功)(?:[：:，。！!\\s]|$)').test(label) || /^(?:未|未能)(?:发布|发表|投稿|提交审核)成功(?:[：:，。！!\s]|$)/.test(label) || /^(?:内容违规|权限不足|无发布权限|账号被封禁)(?:[：:，。！!\s]|$)/.test(label)) return /网络|超时|连接中断|断网/.test(label) ? 'uncertain_notice' : 'failed';
      if (new RegExp('^' + work + '(?:已提交审核|提交审核成功|提交成功|等待平台审核|等待审核)(?:[：:，。！!\\s]|$)').test(label)) return 'accepted';
      if (new RegExp('^' + work + '(?:发布|发表|投稿)成功(?:[：:，。！!\\s]|$)').test(label)) {
        if (/审核未通过|审核不通过|审核驳回|稿件退回/.test(label)) return 'failed';
        if (/审核|处理中|转码/.test(label) || location.hostname === 'member.bilibili.com' && /投稿成功/.test(label)) return 'accepted';
        return 'confirmed';
      }
      if (/^(?:请|请先).*(?:填写|选择|添加|上传|补全)|^[^，。]{1,30}(?:不能为空|为必填项)/.test(label)) return 'form_notice';
      if (/^(?:网络异常|网络错误|请求失败|服务繁忙|系统繁忙|操作频繁|频率限制)(?:[：:，。！!\s]|$)/.test(label)) return 'uncertain_notice';
      return null;
    }
    if (/发布失败|发表失败|投稿失败|发送失败|回复失败|提交审核失败|未(?:能)?(?:发布|发表|投稿|发送|回复|评论|提交审核)成功|操作频繁|频率限制|内容违规|无法发送|超过.*限制|请.*验证|请.*填写/.test(message)) return 'failed';
    if(kind==='publish'&&/提交审核成功|已提交审核/.test(message))return 'accepted';
    if ((kind === 'publish' ? /发布成功|发表成功|投稿成功/ : kind === 'comments' ? /回复成功|评论成功|发送成功/ : /发送成功|消息已发送/).test(message)) return 'confirmed';
    return null;
  };
  const state = window.__matrixPageAction;
  if (command === 'inspect') {
    if (!labels[input.kind]) throw new Error('不支持的操作类型');
    const biliSubmit = input.kind === 'publish' && location.hostname === 'member.bilibili.com' && /^\/platform\/upload\/video(?:\/|$)/.test(location.pathname);
    const selector = 'button,[role="button"],input[type="submit"]' + (biliSubmit ? ',.submit-container .submit-actions .submit-button-anchor > .submit-add' : '') + (input.kind === 'comments' ? ',.comment-input-inner-container .commentInput-right-ct span.wchsYBpK' : input.kind === 'messages' ? ',[data-e2e="msg-input"] .e2e-send-msg-btn' : '');
    const buttons = [...query(selector)].filter(el => visible(el) && labels[input.kind].test(text(el)) && (!officialIcon(el) || (officialIcon(el) === '发送评论' ? text(el.closest('.comment-input-inner-container')?.querySelector('[contenteditable="true"]') || document.createElement('div')) : text(document.querySelector('[data-e2e="msg-input"] .messageEditorinputArea') || document.createElement('div'))))).slice(0, 20);
    if (input.kind === 'withdraw') {
      if (!input.expectedTitle?.trim()) throw new Error('缺少作品标题，请在官方页面自行核对操作');
      if (buttons.length !== 1 || !contextText(buttons[0]).includes(input.expectedTitle.trim())) throw new Error('未唯一定位到该作品的下架控件，请打开作品详情或对应操作面板后重试；不会猜测或删除作品');
    }
    const values = fields();
    const files = materials();
    window.__matrixPageAction = { nonce: input.nonce, kind: input.kind, ownNickname: input.ownNickname, url: location.href, buttons, labels: buttons.map(text), contexts: buttons.map(contextText), choices: choices(), values, files, media: mediaState(), used: false };
    return { pageUrl: location.protocol === 'https:' ? location.origin + location.pathname : location.protocol + '//test-fixture', fields: values, materials: files, candidates: buttons.map((el, index) => ({ index, label: text(el), context: (el.closest('form,[role="dialog"],article')?.innerText || el.parentElement?.innerText || '').trim().slice(0, 200) })) };
  }
  if (!state || state.nonce !== input.nonce || (command !== 'result' ? state.url !== location.href : new URL(state.url).origin !== location.origin)) throw new Error('页面已切换，请重新检查表单');
  if (command === 'submit' || command === 'validate') {
    if (state.used) throw new Error('这次操作已提交，请先核对结果');
    // Only explicit local validation failures before any click may prove that
    // retrying is safe. Missing state, duplicate calls and transport errors do not.
    const rejectBeforeClick = message => {
      if (checkedSubmit && state.kind === 'publish') return { clicked: false, rejectedBeforeClick: true, error: message };
      throw new Error(message);
    };
    const button = state.buttons[input.index];
    if (!button || !visible(button) || !labels[state.kind].test(text(button))) return rejectBeforeClick('提交按钮已变化，请重新检查');
    if (text(button) !== state.labels[input.index] || contextText(button) !== state.contexts[input.index] || JSON.stringify(choices()) !== JSON.stringify(state.choices)) return rejectBeforeClick('提交对象或选项已变化，请重新核对');
    if (JSON.stringify(fields()) !== JSON.stringify(state.values)) return rejectBeforeClick('表单内容已修改，请重新核对后提交');
    if (JSON.stringify(materials()) !== JSON.stringify(state.files) || JSON.stringify(mediaState()) !== JSON.stringify(state.media)) return rejectBeforeClick('素材已变化，请重新核对后提交');
    // Hit-test the settled position, not the start of a CSS smooth animation.
    button.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const bounds = button.getBoundingClientRect(), x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
    let hit = document.elementFromPoint(x, y);
    for (let depth = 0; hit && depth < 8; depth++) {
      const root = componentRoots.find(root => root.host === hit) || hit.shadowRoot;
      if (!root) break;
      const deeper = root.elementFromPoint(x, y);
      if (!deeper || deeper === hit) break;
      hit = deeper;
    }
    let ownedHit = false;
    for (let node = hit, depth = 0; node && depth < 8; node = node.getRootNode?.().host, depth++) if (node === button || button.contains(node)) { ownedHit = true; break; }
    if (!ownedHit) return rejectBeforeClick('提交按钮被弹窗遮挡，请先处理官方页面提示');
    if (command === 'validate') return { ready: true, clicked: false };
    state.used = true;
    const baseline = new Set(signals());
    const icon = officialIcon(button);
    const draft = icon === '发送评论' ? text(button.closest('.comment-input-inner-container').querySelector('[contenteditable="true"]')) : icon === '发送消息' ? text(document.querySelector('.messageEditorinputArea')) : '';
    const replyRow = icon === '发送评论' ? button.closest('[data-e2e="comment-item"]') : null;
    const publishedMatches = () => icon === '发送消息' ? [...query('.MessageBoxContentisFromMe .TextMessageTextpureText')].filter(e => text(e) === draft) : [...(replyRow || document).querySelectorAll('[data-e2e="comment-item"]')].filter(e => text(e.querySelector('.FduGc_lz .Sh1Da424')) === draft && [...e.querySelectorAll('a[href*="/user/"]')].some(a => (a.innerText || '').trim().split('\n')[0] === state.ownNickname));
    const publishedBefore = icon ? publishedMatches().length : 0;
    state.result = { status: 'unknown', message: '已点击官方提交按钮，尚未观察到明确结果。请核对页面，避免重复提交。' };
    let done = false;
    const observer = new MutationObserver(() => {
      if (done) return;
      if (icon && [...query('input')].some(el => visible(el) && /验证码|one-time-code|captcha/.test([el.placeholder,el.autocomplete,el.name].join(' ')))) {
        state.result = { status: 'unknown', needsUserAction: true, message: '抖音要求本人验证。请在当前官方窗口完成，再核对原操作结果；不要重复提交。' };
      }
      if (icon && publishedMatches().length > publishedBefore) {
        const editable = icon === '发送消息' ? document.querySelector('.messageEditorinputArea') : button.closest('.comment-input-inner-container')?.querySelector('[contenteditable="true"]');
        const matches = publishedMatches(), failed = icon === '发送消息' && matches.at(-1)?.closest('.messageMessageBoxmessageBox')?.querySelector('[class*="error"],[class*="Error"],[class*="fail"],[class*="Fail"]');
        if (!text(editable || document.createElement('div')) && !failed) { state.result = { status: 'confirmed', message: icon === '发送消息' ? '官方聊天框已显示新的本人消息' : '官方评论列表已显示新的本人评论或回复' }; done = true; observer.disconnect(); return; }
      }
      for (const message of signals()) {
        if (baseline.has(message)) continue;
        const status = classify(state.kind, message);
        if (status) {
          const terminal = status === 'confirmed' || status === 'failed';
          if (state.kind === 'publish' && (terminal || status === 'accepted') && fields().some(field => field.value.trim() && !state.values.some(original => original.label === field.label && original.value.trim() === field.value.trim()))) {
            // A different nonempty editor after the click may belong to a new
            // manual action. A genuine success may reset fields to empty, but
            // cannot lend its notice to a different work. Never reconsider an
            // ignored notice merely because the old text is restored later.
            baseline.add(message);
            state.result = {status:'unknown',nonterminalNotice:true,source:'official_uncertain_notice',message:'提交后表单内容已变化，后续提示未作为原作品的成功或失败依据；请核对原记录，不会重复提交'};
            break;
          }
          state.result = {status: terminal ? status : 'unknown', accepted: status === 'accepted', needsUserAction: status === 'user_action',
            nonterminalNotice: status === 'form_notice' || status === 'uncertain_notice',
            source: status === 'accepted' ? 'official_acceptance_notice' : status === 'user_action' ? 'official_user_action' : status === 'form_notice' ? 'official_form_notice' : status === 'uncertain_notice' ? 'official_uncertain_notice' : status === 'confirmed' ? 'official_success_notice' : 'official_failure_notice', message};
          if (terminal) {done = true; observer.disconnect();} break;
        }
      }
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    for (const root of componentRoots) observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
    setTimeout(() => { done = true; observer.disconnect(); }, state.kind === 'publish' ? 65000 : 20000);
    if (typeof button.click === 'function') button.click();
    else button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return { clicked: true };
  }
  if (command === 'result') return state.result || { status: 'unknown', message: '尚未提交' };
  throw new Error('操作不支持');
}

function registerPageActions({ ipcMain, dialog, webContents, session, getWindow, platforms, inspectPlatformSession, authenticate, journal, createResultWindow, resolveEdgeContext, createEdgeResultContext, inspectNativeAccount, inspectAccountHealth, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const {findOwnedPageAction}=require('./page-action-lookup.cjs');
  const verifyInteractionOwner = require('./interaction-owner.cjs').createInteractionOwnerVerifier({ inspectAccountHealth });
  const creatorMessageOwner=require('./creator-message-owner.cjs').createCreatorMessageOwnerVerifier({inspectAccountHealth,fallbackBefore:verifyInteractionOwner});
  require('./official-data.cjs').registerOfficialData({ ipcMain, context: async (event, input) => {
    const ctx = await context(event, input);
    if (input.platform === 'douyin' && input.kind === 'messages' && ['read-interactions', 'open-message-list'].includes(input.command)) {
      const url = new URL(ctx.guest.getURL());
      const creatorFeed = url.hostname === 'creator.douyin.com' && /^\/creator-micro\/data\/following\/chat\/?$/.test(url.pathname) && input.command === 'read-interactions';
      if(creatorFeed)return creatorMessageOwner.begin(event,input,ctx);
      if (!creatorFeed && (url.hostname !== 'www.douyin.com' || !ctx.observedNativeAccountKey || ctx.observedNativeAccountKey !== ctx.auth.account.nativeAccountKey)) throw Object.assign(Error('抖音网页版本人账号ID尚未读到或不匹配，未读取私信列表；不会仅凭昵称或创作者中心的登录状态读取另一个网页账号'), { retryable: !ctx.observedNativeAccountKey && input.command === 'open-message-list' });
    }
    return ['read-interactions', 'open-message-list'].includes(input.command) ? verifyInteractionOwner(event, input, ctx) : ctx;
  }, verifyRead: async (ctx, input, event) => {
    const fresh = await authenticate(input.accessToken, input.accountId);
    if (fresh.userId !== ctx.auth.userId || fresh.account.platform !== input.platform || fresh.account.connectorSessionId !== input.sessionId || fresh.account.nativeAccountKey !== ctx.auth.account.nativeAccountKey) throw Error('读取期间用户或平台账号绑定已变化，旧结果已忽略');
    if (input.platform === 'douyin' && input.kind === 'messages') {
      const url = new URL(ctx.guest.getURL());
      if (url.hostname === 'creator.douyin.com') {
        await creatorMessageOwner.verify(event,input,ctx);
      } else {
        const observed = await createOperationBudget(8000).run(() => inspectPlatformSession('douyin', ctx.guest.session, ctx.guest), '确认消息列表仍属于本人账号ID', 8000);
        if (!observed.authenticated || observed.profile?.ownIdentity?.key !== fresh.account.nativeAccountKey) throw Error('读取期间抖音网页账号身份发生变化，私信结果已忽略');
      }
    }
    const after=await authenticate(input.accessToken,input.accountId);
    if(after.userId!==ctx.auth.userId||after.account.platform!==input.platform||after.account.connectorSessionId!==input.sessionId||after.account.nativeAccountKey!==ctx.auth.account.nativeAccountKey)throw Error('消息读取结束时用户或绑定账号已变化，结果已忽略');
  } });
  const plans = new Map(), busy = new Set();
  const openWorkContext=require('./web-followup-context.cjs').createWebFollowupContext({session,inspectPlatformSession,createWindow:createResultWindow,createEdgeResultContext,inspectNativeAccount});
  const collectPublishReference=require('./publish-reference.cjs').createPublishReferenceCollector({getWindow,authenticate,journal,openContext:openWorkContext,sleep});
  ipcMain.handle('matrix:collect-publish-reference',collectPublishReference);
  const verifyFollowup=require('./publish-followup.cjs').registerPublishFollowup({ipcMain,getWindow,authenticate,session,journal,openWebContext:openWorkContext,collectPublishReference});
  require('./douyin-interaction.cjs').registerDouyinInteraction({ ipcMain, context, journal, dialog, busy });
  const run = (guest, command, input) => runOfficialDOM(guest, pageAction, [command, input], 'matrix-page-actions');
  const originalPages=new Map();
  function rememberOriginalPage(record,guest,nonce){
    if(record.kind==='publish'||!record.clicked||record.status!=='unknown')return;
    // Keep only the original guest ID and read nonce, never a window or token.
    if(originalPages.size>=200)originalPages.delete(originalPages.keys().next().value);
    originalPages.set(record.id,{guestId:guest.id,nonce,expires:Date.now()+30*60000});
  }
  function canReviewPage(record){
    const page=originalPages.get(record.id);
    if(!page)return false;
    if(record.status!=='unknown'||page.expires<Date.now()){originalPages.delete(record.id);return false;}
    return true;
  }
  async function verifyPage(event,accessToken,record){
    if(!canReviewPage(record))return;
    const page=originalPages.get(record.id);
    const input={accessToken,accountId:record.accountId,platform:record.platform,sessionId:record.sessionId,webContentsId:page.guestId,nonce:page.nonce};
    const owner=await authenticate(accessToken,record.accountId);
    const checked=async()=>{
      const ctx=await context(event,input);
      if(ctx.auth.userId!==owner.userId||ctx.guest.id!==page.guestId||!record.nativeAccountKey||ctx.observedNativeAccountKey!==record.nativeAccountKey)throw Error('原页面或账号绑定已变化');
      return ctx;
    };
    const {guest}=await checked();
    const observed=await run(guest,'result',{nonce:page.nonce});
    if(!['confirmed','failed'].includes(observed?.status))return;
    await checked();
    const latest=journal.find(owner.userId,record.id);
    if(!latest||latest.status!=='unknown'||latest.accountId!==record.accountId||latest.sessionId!==record.sessionId||latest.nativeAccountKey!==record.nativeAccountKey)return;
    journal.write({...latest,status:observed.status,message:observed.message,checkpoint:'official_result',resultSource:observed.source||'official_notice',completedAt:new Date().toISOString()});
    originalPages.delete(record.id);
  }
  const validation = async (guest, input = {}) => {
    const value = await runOfficialDOM(guest, publishValidation, [input], 'matrix-page-actions');
    if (value?.version !== 1 || !Array.isArray(value.errors)) throw Error('官方表单校验结果未读到，尚未确认提交');
    return value;
  };
  const validateBeforePublish = async guest => {
    const checked = await validation(guest);
    if (!checked.inspected) throw Error('官方表单尚不可核验，未提交');
    if (checked.errors.length) throw Error('官方表单未通过校验：' + checked.errors.map(error => error.message).join('；').slice(0, 800));
  };
  function host(event) { const win = getWindow(); if (!win || event.sender.id !== win.webContents.id) throw new Error('仅允许远效主窗口操作'); return win; }
  async function context(event, input) {
    const win = host(event), platform = platforms[input?.platform];
    if (!platform || !/^[a-z0-9-]{16,80}$/i.test(input.sessionId || '') || !Number.isInteger(input.webContentsId)) throw new Error('账号会话参数不正确');
    if (input.edgeGuestId !== undefined) {
      if (!resolveEdgeContext || input.platform !== 'wechat') throw Error('原生平台发布连接尚未准备好');
      return resolveEdgeContext(event, input);
    }
    const auth = await authenticate(input.accessToken, input.accountId);
    if (auth.account.platform !== input.platform || auth.account.connectorSessionId !== input.sessionId) throw new Error('该会话不属于当前登录用户的绑定账号');
    const guest = webContents.fromId(input.webContentsId);
    if (!guest || guest.isDestroyed() || guest.hostWebContents?.id !== win.webContents.id || guest.session !== session.fromPartition(`persist:matrix-${input.platform}-${input.sessionId}`)) throw new Error('账号页面已关闭或不匹配');
    const url = new URL(guest.getURL());
    if (url.protocol !== 'https:' || !(url.hostname === platform.domain || url.hostname.endsWith('.' + platform.domain)) || /login|passport|signin/.test(url.pathname + url.hostname)) throw new Error('请进入已登录账号的官方操作页');
    const login = await inspectPlatformSession(input.platform, guest.session, guest);
    if (!login.authenticated) throw new Error('账号登录已失效，请重新登录');
    if(auth.account.nativeAccountKey&&login.profile?.ownIdentity?.key&&auth.account.nativeAccountKey!==login.profile.ownIdentity.key)throw Error('当前官网账号ID与绑定ID不同，未执行操作');
    let ownKey=login.profile?.ownIdentity?.key,nickname=login.profile?.nickname;
    if(inspectAccountHealth&&auth.account.nativeAccountKey&&!ownKey&&(input.kind==='publish'||input.nonce)){
      const own=await createOperationBudget(35000).run(()=>inspectAccountHealth(event,{accessToken:input.accessToken,accountId:input.accountId,purpose:'publish-identity'}),'核验本次提交账号ID',35000);
      if(own.state!=='normal'||own.accountId!==input.accountId||own.sessionId!==input.sessionId||own.nativeAccountKey!==auth.account.nativeAccountKey)throw Error('本次提交未核验到同一平台账号ID，未点击提交；'+(own.message||own.error||''));
      ownKey=own.nativeAccountKey;nickname=own.nickname;
    }
    return { win, guest, auth, nickname: nickname || auth.account.nickname || platform.label,nativeAccountKey:ownKey||auth.account.nativeAccountKey,observedNativeAccountKey:ownKey };
  }
  ipcMain.handle('matrix:inspect-page-action', async (event, input) => {
    try {
      if (!['publish', 'comments', 'messages', 'withdraw'].includes(input?.kind)) throw new Error('请选择发布、评论、私信或下架操作');
      if (input.taskId !== undefined && (typeof input.taskId !== 'string' || !/^[a-z0-9-]{16,80}$/i.test(input.taskId))) throw new Error('关联任务无效');
      if (input.attemptId !== undefined && (typeof input.attemptId !== 'string' || !/^[a-z0-9-]{16,80}$/i.test(input.attemptId))) throw new Error('发布尝试标识无效');
      const ctx = await context(event, input);
      if (busy.has(ctx.guest.id)) throw new Error('当前账号正在提交，请等待结果');
      let visibility;
      if (input.kind === 'publish' && input.expectedVisibility) {
        if (!['公开', '好友可见', '仅自己可见'].includes(input.expectedVisibility)) throw Error('请求的可见范围无效');
        visibility = (await runOfficialDOM(ctx.guest, publishVisibility, ['read', { platform: input.platform }], 'matrix-publish-visibility')).visibility;
        if (visibility !== input.expectedVisibility) throw Error('官方可见范围不是请求的 ' + input.expectedVisibility + '，未提交');
      }
      if(input.kind==='publish'&&input.platform==='xiaohongshu'&&input.expectedTitle)await runOfficialDOM(ctx.guest,settlePublishEditor,[{expectedTitle:input.expectedTitle}],'matrix-publish-editor-settle',{backgroundFocus:true});
      for (const [key, plan] of plans) if (plan.expires < Date.now() || plan.guestId === ctx.guest.id) plans.delete(key);
      const nonce = randomUUID(), details = await run(ctx.guest, 'inspect', { kind: input.kind, nonce, ownNickname: ctx.auth.account.nickname, expectedTitle: typeof input.expectedTitle === 'string' ? input.expectedTitle.slice(0, 500) : '' });
      if (!details.candidates.length) throw new Error('当前页面没有可用的提交按钮，请先完成上传、填写内容或选择会话');
      if (input.kind !== 'withdraw' && !details.fields.some(field => field.value.trim())) throw new Error('未识别到已填写的表单，请在官方页面填写内容后重试');
      const expectedTitle = input.kind === 'publish' ? (input.expectedTitle || details.fields.find(field => /标题/.test(field.label))?.value || details.fields[0]?.value || '').trim().slice(0, 500) : undefined;
      const exactTitle = expectedTitle && details.fields.some(field => field.value.trim() === expectedTitle);
      const wechatDescriptionTitle = input.platform === 'wechat' && details.fields.some(field => /短标题/.test(field.label)) && details.fields.filter(field => /描述|简介|正文/.test(field.label) && field.value.split(/\r?\n/)[0].trim() === expectedTitle).length === 1;
      if (expectedTitle && !exactTitle && !wechatDescriptionTitle) throw Error('官方标题与任务标题不一致，未提交');
      // Check hit targets before handing off a submit plan, not after
      // creating an uncertain journal entry for an obviously obstructed button.
      if (input.kind === 'publish' && details.candidates.length === 1) { await validateBeforePublish(ctx.guest); await run(ctx.guest, 'validate', { nonce, index: details.candidates[0].index }); }
      const plan = { nonce, guestId: ctx.guest.id, ownerId: ctx.auth.userId, accountId: input.accountId, platform: input.platform, sessionId: input.sessionId, nickname: ctx.nickname,nativeAccountKey:ctx.nativeAccountKey, kind: input.kind, taskId: input.taskId, attemptId: input.attemptId, expectedTitle, visibility, details, expires: Date.now() + 120000 };
      plans.set(nonce, plan);
      return { nonce, nickname: ctx.nickname, visibility, expiresAt: new Date(plan.expires).toISOString(), ...details };
    } catch (error) { return { error: error.message }; }
  });
  async function submitPage(event, input, batchApproved = false, notify = () => {}, isStopped = () => false) {
    let guestId, record, resultReader, dispatched = false;
    const saveRecord = () => {
      const latest = journal.list(record.ownerId).filter(item=>item.id===record.id).at(-1);
      // A manual refresh can finish before this observer. Never let a later
      // timeout, stale acceptance or old work-card reply undo a terminal result.
      if(latest&&['confirmed','failed'].includes(latest.status)){Object.assign(record,latest);return;}
      journal.write(record);
    };
    try {
      const ctx = await context(event, input), plan = plans.get(input.nonce);
      if (!plan || plan.expires < Date.now() || plan.guestId !== ctx.guest.id || plan.ownerId !== ctx.auth.userId || plan.accountId !== input.accountId || (plan.nativeAccountKey?plan.nativeAccountKey!==ctx.nativeAccountKey:plan.nickname!==ctx.nickname)) throw new Error('核对信息已过期或账号已变化，请重新检查表单');
      if (busy.has(ctx.guest.id)) throw new Error('当前账号正在提交，请勿重复点击');
      if (!Number.isInteger(input.index) || !plan.details.candidates[input.index]) throw new Error('请选择要执行的官方按钮');
      busy.add(ctx.guest.id); guestId = ctx.guest.id;
      const selected = plan.details.candidates[input.index];
      // Clicking Publish/Retry (or the manual publish panel's Submit button)
      // already requests publication. Do not ask again after preparation.
      // Unrelated comments, messages and withdrawal keep their own confirmation.
      const confirmation = batchApproved || plan.kind === 'publish' ? { response: 1 } : await dialog.showMessageBox(ctx.win, { type: 'question', title: '确认提交官方表单', message: `${platforms[plan.platform].label} · ${ctx.nickname}：${selected.label}`, detail: `${plan.details.pageUrl}\n\n操作对象：${selected.context || '请核对官方页面'}\n\n${plan.details.fields.filter(f => f.value.trim()).map(f => `${f.label}：${f.value.slice(0, 500)}`).join('\n\n')}\n\n素材：${plan.details.materials?.map(f => f.name).join('、') || '请在官方页面核对已上传的素材'}\n\n请核对官方页面中的对象、素材和可见范围。确认后将点击该提交按钮。`, buttons: ['返回核对', '确认提交'], defaultId: 0, cancelId: 0, noLink: true });
      if (confirmation.response !== 1) return { cancelled: true };
      if (plan.expires < Date.now()) throw new Error('核对信息已过期，请重新检查');
      const fresh = await context(event, input);
      if (fresh.guest.id !== ctx.guest.id || (plan.nativeAccountKey?fresh.nativeAccountKey!==plan.nativeAccountKey:fresh.nickname!==plan.nickname)) throw new Error('账号已变化，请重新核对');
      if (plan.visibility && (await runOfficialDOM(ctx.guest, publishVisibility, ['read', { platform: input.platform }], 'matrix-publish-visibility')).visibility !== plan.visibility) throw Error('官方可见范围已变化，未提交，请重新核对');
      if (plan.kind === 'publish') await validateBeforePublish(ctx.guest);
      await run(ctx.guest, 'validate', { nonce: input.nonce, index: input.index });
      if (isStopped()) return { cancelled: true };
      plans.delete(input.nonce);
      record = { id: randomUUID(), ownerId: ctx.auth.userId, accountId: input.accountId, platform: input.platform, nickname: ctx.nickname, kind: plan.kind, taskId: plan.taskId, attemptId: plan.attemptId, expectedTitle: plan.expectedTitle, visibility: plan.visibility, pageUrl: plan.details.pageUrl, button: selected.label, summary: (plan.kind === 'withdraw' ? selected.context : plan.details.fields.filter(f => f.value.trim()).map(f => f.value).join('\n')).slice(0, 1000), status: 'submitting', message: '正在提交官方表单', createdAt: new Date().toISOString() };
      if(plan.platform==='wechat'&&plan.kind==='publish')record.expectedContent=plan.details.fields.find(field=>field.value.split(/\r?\n/)[0].trim()===plan.expectedTitle)?.value.slice(0,20000);
      record.checkpoint='pre_click';record.sessionId=plan.sessionId;record.nativeAccountKey=ctx.nativeAccountKey;
      // Persist before any external action. A failed write must prevent the click.
      saveRecord();
      dispatched = true;
      const result = await run(ctx.guest, plan.kind === 'publish' ? 'submit-checked' : 'submit', { nonce: input.nonce, index: input.index });
      if (result?.clicked === false && result.rejectedBeforeClick === true && typeof result.error === 'string') {
        dispatched = false;
        record.status = 'failed'; record.clicked = false;
        record.message = '尚未提交，可重发：' + result.error.slice(0, 250);
        record.completedAt = new Date().toISOString(); saveRecord();
        const { ownerId: _, ...receipt } = record;
        return { receipt, mayHaveSubmitted: false };
      }
      if (!result?.clicked) throw new Error('官方按钮未被执行');
      record.clicked = true;
      record.status = 'unknown'; record.message = '已点击官方提交按钮，请核对平台结果，勿重复提交。';
      record.checkpoint='click_acknowledged';record.clickedAt=new Date().toISOString();record.resultSource='dom_click_ack';saveRecord();
      if (plan.kind === 'publish' && ['bilibili','douyin','xiaohongshu'].includes(plan.platform)) {
        resultReader = require('./official-publish-result-reader.cjs').createOfficialResultReader({record, account: ctx.auth.account,
          createWindow: () => createResultWindow ? createResultWindow(ctx.guest.session) : new (require('electron').BrowserWindow)({show:false,webPreferences:{session:ctx.guest.session,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}}),
          inspectOwner: guest => inspectPlatformSession(plan.platform,ctx.guest.session,guest),
          readCard: guest => runOfficialDOM(guest,publishResult,[record],'matrix-publish-result'),
        });
      }
      if (plan.kind === 'publish') await observePublishOutcome({record, sleep, write: saveRecord, progress: notify, isClosed: () => ctx.guest.isDestroyed(),
        readNotice: async () => {const result = await run(ctx.guest, 'result', {nonce: input.nonce}); const url = new URL(ctx.guest.getURL()); return {...result, pageUrl: url.origin + url.pathname};},
        readValidation: () => validation(ctx.guest, {phase:'after_submit',nonce:input.nonce,expectedTitle:plan.expectedTitle}),
        readWorkList: () => resultReader ? resultReader.read() : runOfficialDOM(ctx.guest, publishResult, [record], 'matrix-publish-result'),
        verifyIdentity: async () => {
          if(resultReader){
            const current=await authenticate(input.accessToken,record.accountId);
            if(current.userId!==ctx.auth.userId||current.account.platform!==record.platform||current.account.connectorSessionId!==plan.sessionId)throw Error('官方账号已变化，未采信作品卡片');
            return resultReader.verifyIdentity(current.account);
          }
          const current = await context(event,input); if(current.auth.userId!==ctx.auth.userId||(record.nativeAccountKey?current.nativeAccountKey!==record.nativeAccountKey:current.nickname!==record.nickname)) throw Error('官方账号已变化，未采信作品卡片');
        },
      });
      else for (let attempt = 0; attempt < 20; attempt++) {
        await sleep(500);
        if (ctx.guest.isDestroyed()) break;
        try {
          const observed = await run(ctx.guest, 'result', { nonce: input.nonce });
          if (observed?.needsUserAction) { record.message = observed.message; break; }
          if(observed?.accepted&&!record.acceptedAt){record.acceptedAt=new Date().toISOString();record.checkpoint='official_accepted';record.resultSource='official_acceptance_notice';record.message=observed.message;record.verification=publishVerification('processing');saveRecord();}
          if (['confirmed', 'failed'].includes(observed?.status)) { record.status = observed.status; record.message = observed.message;record.checkpoint='official_result';record.resultSource=observed.source||'official_notice';record.evidence={pageUrl:new URL(ctx.guest.getURL()).origin+new URL(ctx.guest.getURL()).pathname,notice:observed.message.slice(0,400),observedAt:new Date().toISOString()}; break; }
        } catch { /* Document changes are not proof of a sent comment/message. */ }
      }
      record.completedAt = new Date().toISOString(); saveRecord();
      rememberOriginalPage(record,ctx.guest,input.nonce);
      const { ownerId: _, ...receipt } = record;
      return { receipt };
    } catch (error) {
      if (record) { record.status = dispatched ? 'unknown' : 'failed'; if (!dispatched) record.clicked = false; record.message = dispatched ? `提交状态需核对：${error.message}` : `尚未提交：${error.message}`; try { saveRecord(); } catch { /* Existing pre-submit record remains recoverable. */ } }
      return { error: error.message, mayHaveSubmitted: dispatched };
    } finally { resultReader?.close(); if (guestId !== undefined) busy.delete(guestId); }
  }
  ipcMain.handle('matrix:submit-page-action', (event, input) => submitPage(event, input));
  const activePublishPlatforms = new Map();
  const cancelledBatches = new Set();
  ipcMain.handle('matrix:cancel-publish-batch', async (event, input) => {
    try {
      host(event); const auth = await authenticate(input?.accessToken);
      if (typeof input?.batchId !== 'string' || input.batchId.length > 100) throw new Error('任务标识无效');
      cancelledBatches.add(`${auth.userId}:${input.batchId}`);
      if (cancelledBatches.size > 200) cancelledBatches.delete(cancelledBatches.values().next().value);
      for (const batch of activePublishPlatforms.values()) if (batch.id === input.batchId && batch.owner === auth.userId) batch.stopped = true;
      return { stopped: true };
    } catch (error) { return { error: error.message }; }
  });
  ipcMain.handle('matrix:submit-publish-batch', async (event, input) => {
    let activeBatch;
    try {
      host(event);
      const entries = input?.entries;
      if (!Array.isArray(entries) || !entries.length || entries.length > 20 || new Set(entries.map(e => e.accountId)).size !== entries.length || new Set(entries.map(e => e.edgeGuestId !== undefined ? 'edge:' + e.edgeGuestId : 'electron:' + e.webContentsId)).size !== entries.length) throw new Error('请选择 1 至 20 个不同账号');
      const byPlatform = new Map();
      let owner;
      for (const entry of entries) {
        const ctx = await context(event, entry), plan = plans.get(entry.nonce);
        if (!plan || plan.kind !== 'publish' || plan.platform !== entry.platform || plan.expires < Date.now() || plan.ownerId !== ctx.auth.userId || plan.accountId !== entry.accountId || plan.guestId !== ctx.guest.id || (plan.nativeAccountKey?plan.nativeAccountKey!==ctx.nativeAccountKey:plan.nickname!==ctx.nickname) || !Number.isInteger(entry.index) || !plan.details.candidates[entry.index]) throw new Error('账号发布表单已变化，请重新检查全部所选账号');
        if (owner && owner !== ctx.auth.userId) throw new Error('不能跨远效用户批量操作');
        owner = ctx.auth.userId;
        const lane = byPlatform.get(plan.platform) || [];
        lane.push(entry);
        byPlatform.set(plan.platform, lane);
      }
      const id = typeof input.batchId === 'string' ? input.batchId.slice(0, 100) : '';
      if (cancelledBatches.has(`${owner}:${id}`)) return { cancelled: true, results: [] };
      if ([...byPlatform.keys()].some(platform => activePublishPlatforms.has(platform))) throw new Error('所选平台已有发布正在进行，请勿重复提交');
      activeBatch = { id, owner, stopped: false };
      for (const platform of byPlatform.keys()) activePublishPlatforms.set(platform, activeBatch);
      const progress = (entry, status, message) => { try { if (activeBatch.id && !event.sender.isDestroyed?.()) event.sender.send?.('matrix:publish-batch-progress', { batchId: activeBatch.id, accountId: entry.accountId, status, message }); } catch { /* Display notifications must not change submission results. */ } };
      // This endpoint is called only by an explicit Publish/Retry/Continue
      // action. Plans remain short-lived, owner/account-bound and single-use;
      // submitPage rechecks the live form, visibility and hit target per account.
      const settled = new Map();
      await Promise.all([...byPlatform.values()].map(async lane => {
        for (const entry of lane) {
          if (activeBatch.stopped) break;
          progress(entry, 'submitting', '正在向官方提交，等待官方结果');
          const result = await submitPage(event, entry, true, message => progress(entry, 'submitting', message), () => activeBatch.stopped)
            .catch(error => ({ error: error.message, mayHaveSubmitted: true }));
          if (result.cancelled) break;
          progress(entry, result.receipt?.status || (result.mayHaveSubmitted ? 'unknown' : 'attention'), result.receipt?.message || result.error || '未提交');
          settled.set(entry.accountId, { accountId: entry.accountId, ...result });
          const accepted=result.receipt?.status==='unknown'&&Number.isFinite(Date.parse(result.receipt.acceptedAt||''))&&result.receipt.verification?.state==='processing';
          if (result.receipt?.status !== 'confirmed' && !accepted && !(result.receipt?.status === 'failed' && result.receipt.clicked === false)) break;
        }
      }));
      return { results: entries.flatMap(entry => settled.get(entry.accountId) || []), remaining: entries.filter(entry => !settled.has(entry.accountId)).map(entry => entry.accountId) };
    } catch (error) { return { error: error.message }; }
    finally { if (activeBatch) for (const [platform, batch] of activePublishPlatforms) if (batch === activeBatch) activePublishPlatforms.delete(platform); }
  });
  ipcMain.handle('matrix:list-page-actions', async (event, input) => {
    try { host(event); const auth = await authenticate(input?.accessToken); return { items: journal.list(auth.userId).map(normalizePublishAcceptance) }; }
    catch (error) { return { error: error.message }; }
  });
  ipcMain.handle('matrix:read-publish-trace',async(event,input)=>{
    try{host(event);const auth=await authenticate(input?.accessToken);const found=findOwnedPageAction(journal,auth.userId,input?.receiptId),receipt=found?.kind==='publish'?found:undefined;if(!receipt)throw Error('本机未找到当前用户的发布回执');return {receiptId:receipt.id,taskId:receipt.taskId,attemptId:receipt.attemptId,status:receipt.status,resultSource:receipt.resultSource||'legacy_unclassified',items:journal.history?journal.history(auth.userId,receipt.id):[],evidence:receipt.evidence,outcomeObservation:sanitizeOutcomeObservation(receipt.outcomeObservation),scope:'本机提交与核验留档；点击回执不是平台接收，上传完成不是发布成功，历史记录未采集的证据不会补造'};}catch(error){return {error:error.message};}
  });
  const verifying = new Map();
  const verifyPublishResult=async (event, input) => {
    try {
      host(event);const totalBudget=createOperationBudget(53000); const auth = await totalBudget.run(()=>authenticate(input?.accessToken),'确认核验用户',8000);
      if (typeof input?.receiptId !== 'string') throw Error('发布回执无效');
      const found=findOwnedPageAction(journal,auth.userId,input.receiptId),record=found?.kind==='publish'?normalizePublishAcceptance(found):undefined;
      // Absence also covers an unavailable local journal, not just a foreign
      // owner. Keep the same ownership filter without accusing the user or
      // treating a missing receipt as proof that the platform rejected a post.
      if (!record) throw Error('本机未找到当前用户的这条发布回执；请核对官方作品，勿重复提交');
      if (record.status === 'confirmed' && !pendingReview(record) || record.status === 'failed') return { receipt: record };
      const owned = await totalBudget.run(()=>authenticate(input.accessToken, record.accountId),'读取原绑定账号',10000);
      if (owned.userId !== auth.userId || owned.account.platform !== record.platform || !/^[a-z0-9-]{16,80}$/i.test(owned.account.connectorSessionId || '')) throw Error('原发布账号已解绑，不能读取其他账号的结果');
      const routes = { douyin: 'https://creator.douyin.com/creator-micro/content/manage', xiaohongshu: 'https://creator.xiaohongshu.com/new/note-manager', bilibili:'https://member.bilibili.com/platform/upload-manager/article', wechat:'https://channels.weixin.qq.com/platform/post/list' };
      const key = auth.userId + ':' + record.id;
      if (verifying.has(key)) return await verifying.get(key);
      const task = (async () => {
        let resultWindow,profileWindow,nativeContext,reason='not_found',diagnostic,ended=false;
        const budget=createOperationBudget(45000);
        const unchanged=async state=>{
          const fresh=await totalBudget.run(()=>authenticate(input.accessToken,record.accountId),'保存核验前确认账号',8000);
          if(fresh.userId!==auth.userId||fresh.account.connectorSessionId!==owned.account.connectorSessionId||fresh.account.nativeAccountKey!==owned.account.nativeAccountKey||fresh.account.platform!==owned.account.platform)throw Error('读取结果时账号已变化');
          // Do not let a late negative read regress a concurrently confirmed
          // terminal receipt, or overwrite a different original attempt.
          const latest=findOwnedPageAction(journal,auth.userId,record.id);
          if(latest&&['confirmed','failed'].includes(latest.status)&&!pendingReview(latest))return {receipt:normalizePublishAcceptance(latest)};
          const base=normalizePublishAcceptance(latest||record),verification=publishVerification(state,undefined,diagnostic);
          // A missing card, timeout or lost login does not revoke an already
          // observed acceptance. Keep that fact while reporting the read issue.
          const accepted=Number.isFinite(Date.parse(base.acceptedAt||''));
          const receipt={...base,checkpoint:'verification_finished',verification:accepted?{...verification,state:'processing',message:'投稿已提交，等待平台审核。最近读取：'+verification.message}:verification};
          journal.write({...receipt,ownerId:auth.userId});return {receipt};
        };
        try {
        if(!routes[record.platform])return await unchanged('unsupported');
        let guest,checkOwner;
        if(record.platform==='wechat' && createEdgeResultContext){
          nativeContext=await budget.run(()=>createEdgeResultContext(event,{accessToken:input.accessToken,accountId:record.accountId,sessionId:owned.account.connectorSessionId}).then(context=>{if(ended){context.close();throw Error('结果核验已结束');}return context;}),'打开视频号只读结果页',35000);
          guest=nativeContext.guest;
          checkOwner=async()=>{const current=await nativeContext.verifyOwner();return {authenticated:true,profile:{nickname:current.nickname,...(current.nativeAccountKey?{ownIdentity:{key:current.nativeAccountKey}}:{})}};};
        }else{
        const accountSession = session.fromPartition(`persist:matrix-${record.platform}-${owned.account.connectorSessionId}`);
        // A separate, hidden read-only window preserves all current editors/tabs.
        resultWindow = createResultWindow ? createResultWindow(accountSession) : new (require('electron').BrowserWindow)({ show: false, webPreferences: { session: accountSession, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
        guest = resultWindow.webContents;
        guest.setWindowOpenHandler?.(() => ({ action: 'deny' }));
        guest.on?.('will-navigate', (navigation, url) => { try { const parsed = new URL(url); if (parsed.protocol !== 'https:' || parsed.hostname !== new URL(routes[record.platform]).hostname) navigation.preventDefault(); } catch { navigation.preventDefault(); } });
        await budget.run(()=>guest.loadURL(routes[record.platform]),'读取官方作品列表',15000);
        checkOwner=async()=>{
          // Douyin's manager can show only an avatar. Read the signed-in own
          // homepage in another window, never a work author or the task label.
          if(['douyin','xiaohongshu','wechat'].includes(record.platform)&&!require('./platform-session.cjs').isLoginPage(guest.getURL())){
            if(!profileWindow){
              profileWindow=createResultWindow?createResultWindow(accountSession):new(require('electron').BrowserWindow)({show:false,webPreferences:{session:accountSession,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
              profileWindow.webContents.setWindowOpenHandler?.(()=>({action:'deny'}));
              const home=record.platform==='douyin'?'https://creator.douyin.com/creator-micro/home':record.platform==='xiaohongshu'?'https://creator.xiaohongshu.com/new/home':'https://channels.weixin.qq.com/platform/home';
              profileWindow.webContents.on?.('will-navigate',(navigation,url)=>{try{const target=new URL(url);if(target.protocol!=='https:'||target.hostname!==new URL(home).hostname)navigation.preventDefault();}catch{navigation.preventDefault();}});
              await budget.run(()=>profileWindow.webContents.loadURL(home),'读取平台本人主页',12000);
            }
            return inspectPlatformSession(record.platform,accountSession,profileWindow.webContents);
          }
          return inspectPlatformSession(record.platform,accountSession,guest);
        };
        }
        let login=await budget.run(checkOwner,'核对官方账号');
        for(let attempt=0;attempt<8&&(!login.profile?.nickname?.trim()||record.nativeAccountKey&&!login.profile?.ownIdentity?.key)&&!login.profile?.loginVisible&&!login.profile?.verificationRequired;attempt++){
          await budget.run(()=>sleep(500),'等待官方本人昵称');login=await budget.run(checkOwner,'核对官方账号');
        }
        if(!login.authenticated)return await unchanged('login_required');
        if(!login.profile?.nickname?.trim())return await unchanged('identity_pending');
        if(record.nativeAccountKey&&!login.profile?.ownIdentity?.key)return await unchanged('identity_pending');
        const sameOriginalOwner=profile=>{
          if(record.sessionId&&record.sessionId!==owned.account.connectorSessionId)return false;
          const key=profile.ownIdentity?.key,bound=owned.account.nativeAccountKey;
          if(bound&&key&&bound!==key)return false;
          if(record.nativeAccountKey&&key&&record.nativeAccountKey!==key)return false;
          if(record.nativeAccountKey)return Boolean(key&&record.nativeAccountKey===key&&(!bound||bound===key));
          const reviewed=record.identityReview;
          const manualSame=reviewed?.source==='user_confirmed_rename'&&reviewed.accountId===record.accountId&&reviewed.sessionId===owned.account.connectorSessionId&&reviewed.nativeAccountKey===key&&key===bound&&reviewed.originalNickname===record.nickname;
          return manualSame||profile.nickname.trim()===record.nickname?.trim()||Boolean(bound&&key===bound&&owned.account.verifiedNicknames?.includes(record.nickname?.trim())&&profile.nickname.trim()===owned.account.nickname?.trim());
        };
        if(!sameOriginalOwner(login.profile))return await unchanged('identity_mismatch');
        for (let attempt = 0; attempt < 15; attempt++) {
          let verified = await budget.run(()=>runOfficialDOM(guest, publishResult, [record], 'matrix-publish-result'),'读取官方作品卡片');
          if(record.manualVerification&&record.expectedWorkId&&(verified?.matched||verified?.pendingReview||verified?.rejected)&&verified.evidence?.workId!==record.expectedWorkId)verified={matched:false,reason:'ambiguous'};
          reason=verified?.reason||(verified?.ambiguous?'ambiguous':'not_found');
          diagnostic=verified?.diagnostic;
          if (verified?.matched || verified?.rejected || verified?.reason==='processing' && verified.pendingReview===true && verified.evidence) {
            const fresh = await budget.run(()=>authenticate(input.accessToken, record.accountId),'核对任务所有者');
            if (fresh.userId !== auth.userId || fresh.account.connectorSessionId !== owned.account.connectorSessionId || fresh.account.nativeAccountKey!==owned.account.nativeAccountKey || fresh.account.platform!==owned.account.platform) throw Error('读取结果时账号已变化');
            const owner=await budget.run(checkOwner,'再次核对官方账号');
            if(!owner.authenticated)return await unchanged('login_required');
            if(!owner.profile?.nickname?.trim())return await unchanged('identity_pending');
            if(record.nativeAccountKey&&!owner.profile?.ownIdentity?.key)return await unchanged('identity_pending');
            if(!sameOriginalOwner(owner.profile))return await unchanged('identity_mismatch');
            const latest=findOwnedPageAction(journal,auth.userId,record.id);
            if(latest&&['confirmed','failed'].includes(latest.status)&&!pendingReview(latest))return {receipt:normalizePublishAcceptance(latest)};
            const pending=verified.pendingReview===true&&!verified.matched&&!verified.rejected;
            // An earlier observation timeout is not the completion of a later
            // successful verification. Preserve a prior acceptance, otherwise
            // stamp the result that has just been confirmed.
            const verifiedAt=new Date().toISOString();
            const completedAt=record.acceptedAt||(record.status==='confirmed'?record.completedAt:undefined)||verifiedAt;
            const receipt = { ...record, status: pending?'unknown':verified.matched?'confirmed':'failed', message: pending?'投稿成功，等待平台审核；无需重复提交':verified.matched?'发布成功':verified.message, evidence: verified.evidence, resultSource:'official_work_list',checkpoint:pending?'official_accepted':'work_list_result',...(pending?{acceptedAt:record.acceptedAt||new Date().toISOString()}:{}),verifiedAt: new Date().toISOString(),verification:{...publishVerification(pending?'processing':verified.matched?'confirmed':'rejected'),...(!pending&&!verified.matched&&typeof verified.message==='string'?{message:verified.message}:{})} };
            const publication = normalizePublishAcceptance(receipt);
            publication.completedAt=completedAt;
            journal.write({ ...publication, ownerId: auth.userId });
            return { receipt: publication };
          }
          if (['ambiguous','processing','not_published','status_unresolved','visibility_mismatch','time_mismatch','missing_time','missing_reference','login_required'].includes(reason)) break;
          await budget.run(()=>sleep(1000),'等待官方作品列表');
        }
        return await unchanged(reason);
        }catch(error){
          const message=String(error.message||'');
          const state=/超时/.test(message)?'timeout':/账号.*不一致|昵称.*不一致|账号已变化/.test(message)?'identity_mismatch':/登录/.test(message)?'login_required':/身份|昵称/.test(message)?'identity_pending':/另一项操作|被占用/.test(message)?'busy':'error';
          return await unchanged(state);
        }finally{ended=true;nativeContext?.close();if(profileWindow&&!profileWindow.isDestroyed())profileWindow.destroy();if(resultWindow&&!resultWindow.isDestroyed())resultWindow.destroy();}
      })();
      verifying.set(key, task);
      try { return await task; } finally { verifying.delete(key); }
    } catch (error) { return { error: error.message }; }
  };
  ipcMain.handle('matrix:verify-publish-result',verifyPublishResult);
  require('./publish-manual-reconcile.cjs').registerManualPublishReconciliation({ipcMain,getWindow,authenticate,journal,verifyPublishResult});
  require('./publish-resolution.cjs').registerPublishResolution({ipcMain,getWindow,authenticate,journal,dialog,verifyPublishResult,inspectAccountHealth});
  return {verifyFollowup,canReviewPage,verifyPage};
}

module.exports = { registerPageActions, createJournal, pageAction, settlePublishEditor };
