// Visible official-page controls only. No private APIs, credentials or publish clicks.
function publishForm(command, config = {}, componentRoots = []) {
  const query = selector => [...new Set([document, ...componentRoots].flatMap(root => [...root.querySelectorAll(selector)]))];
  const hiddenReason = el => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    if (!(r.width > 0 && r.height > 0)) return 'no_bounds';
    if (s.visibility === 'hidden' || s.display === 'none') return 'hidden_style';
    if (el.disabled || el.readOnly) return 'disabled';
    // The real Channels editor uses a CSS state rather than HTML disabled.
    if (location.hostname === 'channels.weixin.qq.com' && el.classList.contains('weui-desktop-btn_disabled')) return 'disabled';
    for (let parent = el; parent; parent = parent.parentElement || parent.getRootNode().host) {
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden') return 'hidden_ancestor';
      if (style.opacity === '0') return 'transparent_ancestor';
      if (/animate-hide/.test(parent.className || '')) return 'hidden_animation';
    }
    return undefined;
  };
  const visible = el => hiddenReason(el) === undefined;
  if (command === 'describe') {
    // Bounded rendered-control metadata for local compatibility diagnostics.
    // Never return form values, passwords, cookies, page globals or iframe DOM.
    const labels = el => [el.getAttribute('aria-label'),el.getAttribute('placeholder'),el.getAttribute('data-placeholder'),...[...(el.labels || [])].map(label => label.innerText)].filter(Boolean).join(' ').slice(0,160);
    const safe = el => !/password|one-time-code|username|email|tel|token|secret|密码|验证码|手机号|邮箱|身份证|密钥/i.test([el.type,el.name,el.id,el.autocomplete,labels(el)].join(' '));
    const summary = el => ({tag:el.tagName,role:el.getAttribute('role'),className:typeof el.className==='string'?el.className.slice(0,160):'',label:labels(el)});
    const renderedLabel = el => visible(el) && safe(el) && !el.closest('[contenteditable],textarea') && !el.querySelector('input,textarea,[contenteditable]') && (el.innerText || '').trim().length < 100;
    const labelledCovers = query('button,a,[role=button],div,span,label').filter(el => renderedLabel(el) && /^(封面预览|设置封面|上传封面|更换封面|自定义封面|编辑封面|选择封面|添加封面|裁剪封面)$/.test((el.innerText || '').trim()));
    // Some cover surfaces reveal their text only on hover. Capture their
    // bounded structural metadata too, never their aggregate text/values/URLs.
    const coverSurfaces = query('[class*=cover],[class*=Cover]').filter(el => visible(el) && safe(el) && !el.matches('input,textarea,[contenteditable]') && !el.closest('[contenteditable],textarea'));
    const coverControls = [...new Set([...labelledCovers, ...coverSurfaces])].slice(0,25).map(el => ({...summary(el),text:labelledCovers.includes(el)?el.innerText.trim():'',parents:[el.parentElement,el.parentElement?.parentElement].filter(el=>el&&safe(el)).map(summary),children:[...el.children].filter(safe).slice(0,8).map(summary)}));
    return {submitted:false,controls:query('input,textarea,select,[contenteditable],[role=combobox],[role=radiogroup]').filter(el=>visible(el)&&safe(el)).slice(0,60).map(summary),privacyControls:query('label,button,[role=button],[role=radio],[role=combobox],[class*=select],[class*=Select]').filter(el=>renderedLabel(el)&&/谁可以看|可见范围|公开|仅自己|私密/.test(el.innerText||'')).slice(0,25).map(el=>({...summary(el),text:(el.innerText||'').trim()})),settingsControls:query('button,label,summary,div,span').filter(el=>renderedLabel(el)&&/谁可以看|可见范围|公开可见|仅自己可见|私密|更多设置|添加封面|上传封面|设置封面|封面预览/.test(el.innerText||'')&&![...el.children].some(child=>(child.innerText||'').trim()===(el.innerText||'').trim())).slice(0,45).map(el=>({...summary(el),text:(el.innerText||'').trim()})),coverControls};
  }
  if (command === 'topics') {
    const nodes = [...query('[class*=topic] [role=option], [class*=topic] [class*=item], [class*=suggest] [role=option], [class*=tag] [role=option]')].filter(visible);
    return { topics: [...new Set(nodes.map(el => (el.innerText || '').trim().replace(/^#/, '')).filter(text => text && text.length <= 40 && !/创建|添加|搜索|查看更多/.test(text)))].slice(0, 20) };
  }
  if (command === 'progress') {
    const bars = [...query('progress,[role=progressbar]')].filter(visible);
    const barValues = bars.map(el => {
      const raw = el.tagName === 'PROGRESS' ? el.getAttribute('value') : el.getAttribute('aria-valuenow');
      if (raw === null || raw === '') return NaN;
      const min = Number(el.getAttribute('aria-valuemin') || 0), max = Number(el.tagName === 'PROGRESS' ? el.getAttribute('max') || 1 : el.getAttribute('aria-valuemax') || 100);
      return max > min ? (Number(raw) - min) * 100 / (max - min) : NaN;
    });
    // Some official uploaders render an ordinary percentage label rather
    // than an ARIA/native progress bar. Read only short, exact labels in
    // upload-progress surfaces or system notices, never editable text/files.
    const labelValues = query('[class*=upload] [class*=progress],[class*=upload] [class*=percent],[class*=upload] [class*=Percent],[class*=Upload] [class*=Progress],[role=status],[role=alert]').filter(el => visible(el) && !el.matches('input,textarea,[contenteditable]') && !el.closest('[contenteditable],textarea') && !el.querySelector('input,textarea,[contenteditable]')).slice(0,100).flatMap(el => {
      const text=(el.innerText||'').trim();if(text.length>60)return [];
      const match=/^(?:(?:视频|文件|素材)?(?:上传进度|上传中|正在上传|已上传|上传)\s*[:：]?\s*)?(\d{1,6}(?:\.\d{1,4})?)\s*[%％]$/.exec(text);
      if(!match)return [];const value=Number(match[1]);return [value>=0&&value<=100?value:NaN];
    });
    const samples=[...barValues,...labelValues],values=[...new Set(samples.filter(value=>Number.isFinite(value)&&value>=0&&value<=100))];
    const unresolvedProgress=samples.some(value=>!Number.isFinite(value)||value<0||value>100)||values.length>1;
    // Never round 99.9% up to a displayed/completion value of 100%.
    const uploadPercent=values.length===1&&!unresolvedProgress?(values[0]===100?100:Math.floor(values[0])):undefined;
    const notices = [...query('[role=alert],[role=status],[class*=upload]')].filter(el => visible(el) && !el.matches('input,textarea,[contenteditable]') && !el.closest('[contenteditable],textarea') && !el.querySelector('textarea,[contenteditable],input:not([type=file])')).map(el => (el.innerText || '').trim()).filter(text => text.length < 300);
    const uploadError = notices.find(text => /上传失败|转码失败|文件格式不支持|文件过大/.test(text));
    // Official video/cover processing labels can be outside the upload node.
    // Match only exact short system labels, never authored editable content.
    const preparingMedia = query(config.platform==='wechat'?'*':'[role=status],[role=alert],[class*=upload],[class*=Upload],[class*=process],[class*=transcod]').some(el => visible(el) && !el.matches('input,textarea,[contenteditable]') && !el.closest('[contenteditable],textarea') && !el.querySelector('input,textarea,[contenteditable]') && (config.platform==='wechat'?/^(正在处理文件|正在生成封面|生成中|正在转码|转码中|视频转码中|正在处理视频|视频处理中|生成封面中)[.。…\s]*$/:/^(正在生成封面|正在转码|转码中|视频转码中|正在处理视频|视频处理中|生成封面中)[.。…\s]*$/).test((el.innerText || '').trim()));
    const busySignals = [preparingMedia && 'media_notice', notices.some(text => /上传中|正在上传|正在转码|转码中|处理中/.test(text)) && 'upload_notice', (values.some(value => value < 100) || unresolvedProgress) && 'progress_bar'].filter(Boolean);
    const busy = busySignals.length > 0;
    const buttons = [...query('button,[role=button]' + (config.platform === 'bilibili' ? ',.submit-container .submit-actions .submit-button-anchor > .submit-add' : ''))].filter(visible).filter(el => el.getAttribute('aria-disabled') !== 'true' && /^(发布|发表|投稿|立即发布|确认发布|发布笔记|发布视频|发表视频|立即投稿)$/.test((el.innerText || '').trim()));
    const editorReady = query('input,textarea,[contenteditable]:not([contenteditable=false])').filter(visible).some(el => /标题|描述|简介|正文/.test([el.placeholder,el.getAttribute('data-placeholder'),el.getAttribute('aria-label')].join(' ')));
    // A missing title/cover may keep Publish disabled after upload finishes.
    // An editable, idle form alone is NOT upload-completion evidence. Channels
    // must also finish generating its observed vertical-cover preview.
    const coverCandidates = config.platform === 'wechat' ? query('.vertical-cover-wrap.img-popover-wrap') : [];
    const verticalCovers = coverCandidates.filter(visible);
    // Both observed editor layouts use this exact image class inside the
    // unique vertical cover; the extra vertical-img-wrap is not mandatory.
    const coverImages = [...new Set(verticalCovers.flatMap(el => [...el.querySelectorAll('img.vertical-img-size.cover-img-vertical')].filter(visible)))];
    const decodedCovers = coverImages.filter(el => el.complete && el.naturalWidth > 0);
    const coverPreviewReady = config.platform !== 'wechat' || verticalCovers.length === 1 && coverImages.length === 1 && decodedCovers.length === 1;
    const attachedVideoInputs = query('input[type=file]').filter(el => /video|mp4|mov|webm|mkv/i.test(el.accept || '') && el.files?.length === 1).length;
    const videoCandidates = query('video');
    const videos = videoCandidates.filter(el => visible(el) && Boolean(el.currentSrc || el.src));
    // Media preparation and cover preparation are independent gates. A real
    // decoded video in this editor's unique primary player is sufficient for
    // filling text; it is NOT permission to skip a requested cover or submit.
    // Never accept a tutorial/sidebar video as proof of the selected upload.
    const primaryPlayers = config.platform === 'wechat' ? query('.media-full-screen-wrap').filter(visible) : [];
    const inPrimaryPlayer = el => {
      for (let node = el; node; node = node.parentElement || node.getRootNode().host) if (node === primaryPlayers[0]) return true;
      return false;
    };
    const decodedPrimaryVideo = primaryPlayers.length === 1
      && videos.filter(el => inPrimaryPlayer(el) && el.readyState >= 2 && el.videoWidth > 0).length === 1;
    // A missing/changed cover layout is NOT evidence of official processing.
    // Expose only bounded facts, never file names, media URLs or input values.
    // The queue gives this unproven state its own deadline without replaying
    // the file handoff; genuine platform processing keeps its separate budget.
    const processing = busy;
    const layoutReady = config.platform !== 'wechat' || innerWidth >= 320 && innerHeight >= 240;
    const ready = layoutReady && !uploadError && !processing && buttons.length === 1 && coverPreviewReady;
    // Media readiness is separate from final submit readiness: an empty title
    // can disable Publish after upload has completed. Never fill while a live
    // upload/processing indicator is present, nor use a local preview alone as
    // proof of upload completion on other platforms.
    const completedNotice = notices.some(text => /^(?:视频|图片|素材|文件)?(?:上传成功|上传完成|已上传|转码完成|处理完成)[。.!！\s]*$/.test(text));
    const mediaReady = layoutReady && !uploadError && !processing && editorReady && (config.platform === 'wechat' ? coverPreviewReady || decodedPrimaryVideo : values.length === 1 && values[0] === 100 || completedNotice || buttons.length === 1);
    const coverReady = mediaReady && coverPreviewReady;
    const validationErrors = query('[role=alert],.ant-form-item-explain-error,.el-form-item__error,.semi-form-field-error-message,[class*=message-error]').filter(el => visible(el) && !el.matches('input,textarea,[contenteditable]') && !el.closest('[contenteditable],textarea') && !el.querySelector('input,textarea,[contenteditable]')).map(el => (el.innerText || '').trim()).filter(text => text.length > 0 && text.length <= 200 && /请(?:填写|输入|选择|添加|上传|设置|补充|完善)|不能为空|必填|不支持|失败|不符合|超过.{0,12}(?:限制|上限)/.test(text));
    const observation = {
      version: 1,
      state: uploadError ? 'upload_failed' : !layoutReady ? 'waiting_layout' : busy ? values.some(value => value < 100) ? 'uploading' : 'processing' : !editorReady ? 'waiting_editor' : !coverPreviewReady ? verticalCovers.length > 1 || coverImages.length > 1 ? 'ambiguous_cover' : 'waiting_preview' : !mediaReady ? 'waiting_media' : ready ? 'submit_ready' : coverReady ? 'cover_ready' : 'waiting_submit',
      busySignals, editorReady, attachedVideoInputs, mediaElements: videos.length,
      decodedMedia: videos.filter(el => el.readyState >= 2 && el.videoWidth > 0).length,
      coverContainers: verticalCovers.length, coverImages: coverImages.length, decodedCoverImages: decodedCovers.length,
      enabledSubmitButtons: buttons.length,
      // Numeric/enum-only diagnostics distinguish not found from filtered out.
      // They never authorize progression and contain no values, URLs or HTML.
      probe: {
        componentRoots: componentRoots.length,
        viewportWidth: Math.min(10000,Math.max(0,Math.round(innerWidth))),
        viewportHeight: Math.min(10000,Math.max(0,Math.round(innerHeight))),
        documentVisible: document.visibilityState === 'visible',
        matchedCovers: Math.min(10000,coverCandidates.length),
        matchedVideos: Math.min(10000,videoCandidates.length),
        rejectedCoverReasons: [...new Set(coverCandidates.map(hiddenReason).filter(Boolean))],
      },
      ...(uploadPercent!==undefined ? { uploadPercent } : {}),
    };
    return { ...(uploadPercent!==undefined ? { uploadPercent } : {}), ready, mediaReady, coverReady, editorReady, processing, uploadError, validationErrors: [...new Set(validationErrors)].slice(0,8), observation, submitted: false };
  }
  const controls = [...query('input,textarea,[contenteditable]:not([contenteditable=false]),select')].filter(el => visible(el) &&
    !/password|one-time-code|username|email|tel|search|hidden|file|checkbox|radio|token|secret|密码|验证码|手机号|邮箱|搜索|身份证|密钥/i.test([el.type, el.name, el.id, el.autocomplete, el.placeholder].join(' ')));
  const label = el => [el.placeholder, el.getAttribute('aria-label'), el.getAttribute('data-placeholder'), el.name,
    ...[...(el.labels || [])].map(item => item.innerText),
    ...(el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).map(id => query('[id]').find(node => node.id === id)?.innerText)].filter(Boolean).join(' ');
  const expressions = { title: /标题|title/i, shortTitle: /短标题/, body: /简介|描述|正文|说点什么|分享|description|content/i, tags: /标签|话题|tag/i, category: /分区|分类|category/i, visibility: /可见|权限|visibility/i, originality: /创作类型|原创|转载|original/i };
  const wechatShortForm = config.platform === 'wechat' && controls.some(el => /短标题/.test(label(el))) && !controls.some(el => expressions.title.test(label(el)) && !/短标题/.test(label(el)));
  // A description hint may say "可添加话题". That is still the description,
  // not a standalone topic field. Prefer its explicit semantic label.
  const bodyLabel = el => /简介|描述|正文|description|\bbody\b/i.test(label(el));
  const otherTextField = el => /标题|title|标签|话题|\btag\b|搜索|search/i.test(label(el)) && !bodyLabel(el);
  const read = el => {
    if (!el.isContentEditable) return el.value;
    // Chromium innerText inserts TWO newlines between <p> blocks. The XHS
    // ProseMirror editor represents a single user newline as two paragraphs.
    // Read this known public DOM representation, not its private editor state.
    // Keep explicit empty paragraphs/hard breaks; never collapse all whitespace.
    if (config.platform === 'xiaohongshu' && el.matches('.ProseMirror') && el.children.length &&
      [...el.childNodes].every(node => node.nodeType === 1 ? node.tagName === 'P' : node.nodeType === 3 && !node.textContent.trim()) &&
      [...el.children].every(p => !p.querySelector('p,div,li,ul,ol,pre,blockquote,table'))) {
      return [...el.children].map(p => {
        if (p.childNodes.length === 1 && p.firstElementChild?.tagName === 'BR') return '';
        const text = p.innerText;
        return p.lastElementChild?.matches('br.ProseMirror-trailingBreak') && text.endsWith('\n') ? text.slice(0, -1) : text;
      }).join('\n');
    }
    return el.innerText;
  };
  const filled = [], unresolved = [];
  const toggleAssignments = [];
  const booleanFields = ['原创声明', '允许合拍', '允许保存', '允许评论', '允许二创', '未经作者允许禁止转载', '启用充电面板', '水印', '杜比音效', 'Hi-Res 无损音质', '关闭弹幕', '关闭评论', '开启精选评论', '同步动态', '允许下载', '允许转发'];
  // Only exact, uniquely labelled visible checkboxes can be automated. Dynamic
  // collections/products/music/mentions must be selected in the official editor.
  for (const [name, value] of Object.entries(config.extras || {})) {
    if (typeof value !== 'string' || !value.trim()) continue;
    if (wechatShortForm && name === '短标题') continue;
    if (booleanFields.includes(name) && ['开启', '关闭'].includes(value)) {
      const matches = [...query('input[type=checkbox],[role=checkbox]')].filter(el => visible(el) && el.getAttribute('aria-disabled') !== 'true' && [el.getAttribute('aria-label'), ...[...(el.labels || [])].map(item => item.innerText)].some(text => text?.trim() === name));
      if (matches.length === 1 && (matches[0].tagName === 'INPUT' || ['true', 'false'].includes(matches[0].getAttribute('aria-checked')))) { toggleAssignments.push({ name, el: matches[0], checked: value === '开启' }); continue; }
    }
    unresolved.push(`${name}：${value.trim()}（请在官方表单选择并核对）`);
  }
  const assignments = [];
  const topics = Array.isArray(config.topics) ? config.topics : [];
  // This real Channels form has only an optional 16-character short title.
  // Preserve the complete requested title as the first description line;
  // never truncate it or silently put it into the unrelated short-title slot.
  // XHS users commonly put the same hashtags in both the description and
  // topic picker. Keep their original text; append only missing exact topics.
  // Duplicating the whole topic line also creates an unnecessary rich-text
  // paragraph boundary which the website can serialize differently.
  const presentTopics = config.platform === 'xiaohongshu'
    ? new Set([...String(config.body || '').matchAll(/#([^\s#]+)/gu)].map(match => match[1])) : new Set();
  const appendedTopics = config.platform === 'xiaohongshu' ? topics.filter(tag => !presentTopics.has(tag)) : topics;
  const body = [wechatShortForm ? config.title?.trim() : '', config.body, config.platform === 'bilibili' ? '' : appendedTopics.map(tag => '#' + tag).join(' ')].filter(Boolean).join('\n');
  for (const [key, value] of Object.entries({ ...(wechatShortForm ? { shortTitle: config.extras?.['短标题'] || '' } : { title: config.title }), body, ...(config.platform === 'bilibili' && topics.length ? { tags: topics.join(',') } : {}), ...config.options })) {
    if ((!value && key !== 'shortTitle') || !expressions[key]) continue;
    let matches = controls.filter(el => expressions[key].test(label(el)) && !(key === 'body' && otherTextField(el)));
    if (key === 'body' && !matches.length) matches = controls.filter(el => el.isContentEditable && !otherTextField(el));
    if (matches.length !== 1) { unresolved.push(`${key}：未唯一识别官方控件`); continue; }
    const el = matches[0];
    if (assignments.some(item => item.el === el)) { unresolved.push(`${key}：控件与其他字段冲突`); continue; }
    if (key === 'shortTitle' && value.length > 16) { unresolved.push('短标题：超过当前视频号官方控件 16 字限制（不会截断）'); continue; }
    if (wechatShortForm && key === 'body' && value.length > 2000) { unresolved.push('视频描述：标题、简介和话题合计超过 2000 字（不会截断）'); continue; }
    if (el.maxLength > 0 && value.length > el.maxLength) { unresolved.push(`${key}：超过官方控件 ${el.maxLength} 字限制`); continue; }
    if (key === 'tags') { unresolved.push('tags：请在官方标签控件逐个确认话题，不能把逗号文本当作已添加标签'); continue; }
    if (el.tagName === 'SELECT') {
      const option = [...el.options].filter(o => !o.disabled && (o.textContent.trim() === value || o.value === value));
      if (option.length !== 1) { unresolved.push(`${key}：官方选项不存在`); continue; }
      assignments.push({ key, el, value: option[0].value });
    } else assignments.push({ key, el, value });
  }
  // Resolve first, then write. Never truncate, select an arbitrary option or click submit.
  for (const { key, el, value } of assignments) {
    const normalize = text => String(text).replace(/[\u200b\ufeff]/g, '').replace(/\u00a0/g, ' ').trim();
    if (normalize(read(el)) === normalize(value)) { filled.push(key); continue; }
    el.focus();
    if (el.isContentEditable) {
      document.getSelection().selectAllChildren(el);
      document.execCommand('insertText', false, value);
    } else {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (normalize(read(el)) === normalize(value)) filled.push(key); else unresolved.push(`${key}：官方编辑器未接受内容`);
  }
  for (const { name, el, checked } of toggleAssignments) {
    const readChecked = () => el.tagName === 'INPUT' ? el.checked : el.getAttribute('aria-checked') === 'true';
    if (readChecked() !== checked) el.click();
    if (readChecked() === checked) filled.push(name); else unresolved.push(`${name}：官方开关未接受设置，请核对`);
  }
  return { filled, unresolved, topicsAsText: config.platform !== 'bilibili' && topics.length > 0, submitted: false };
}
module.exports = { publishForm };
