function uploadControl(input, componentRoots = []) {
  const query = selector => [...new Set([document, ...componentRoots].flatMap(root => [...root.querySelectorAll(selector)]))];
  const enabled = el => {
    if (!el.isConnected || el.disabled) return false;
    // File inputs themselves may be display:none; their real upload surface may not.
    let parent = el.parentElement || el.getRootNode().host;
    let laidOut = false;
    while (parent) {
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = parent.getBoundingClientRect(); laidOut ||= rect.width > 0 && rect.height > 0;
      parent = parent.parentElement || parent.getRootNode().host;
    }
    return laidOut;
  };
  const label = el => {
    const parts = [el.name, el.id, el.getAttribute('aria-label')];
    let parent = el.parentElement || el.getRootNode().host;
    for (let depth = 0; parent && depth < 4; depth++, parent = parent.parentElement || parent.getRootNode().host) {
      const text = parent.innerText?.trim(); if (text && text.length <= 300) parts.push(text);
    }
    return parts.filter(Boolean).join(' ');
  };
  let coverDialog;
  if(input.platform === 'wechat' && input.coverIndex !== undefined){
    const dialogs=query('.finder-common-dialog.edit-cover-dialog').filter(el=>{
      const r=el.getBoundingClientRect(),s=getComputedStyle(el);
      return enabled(el)&&r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0';
    });
    // A dispatched Edit click can precede the rendered official dialog. This
    // is a pending pre-handoff state, not an ambiguous target or a failed file
    // transfer. The caller retries only this lookup, never the Edit click.
    if(dialogs.length===0)throw Error('视频号封面编辑窗口尚未就绪，等待官方弹窗显示；未交付封面文件');
    if(dialogs.length!==1)throw Error('视频号封面编辑窗口不唯一，未选择其他图片上传入口');
    coverDialog=dialogs[0];
  }
  const controls = query('input[type=file]').filter(enabled).filter(el=>!coverDialog||coverDialog.contains(el)).filter(el => {
    const accept = (el.accept || '').toLowerCase();
    const typeMatches = input.mediaType === 'video' ? /video|mp4|mov|webm|mkv/.test(accept) : /image|png|jpg|jpeg|webp/.test(accept);
    return typeMatches && (input.count === 1 || el.multiple);
  });
  let candidates = controls.filter(el => input.coverIndex !== undefined
    ? /封面|裁剪|cover/i.test(label(el)) || window.__matrixCoverWork?.index === input.coverIndex
    : input.mediaType === 'video' || !/封面|裁剪|cover/i.test(label(el)));
  // Douyin's cover designer renders paired initial/replace inputs, plus hidden
  // sticker uploaders. Only the visible cover-file drag area is the target.
  if (input.coverIndex !== undefined && window.__matrixCoverWork?.index === input.coverIndex) {
    const primary = candidates.filter(el => el.classList.contains('semi-upload-hidden-input') &&
      el.closest('.semi-upload')?.querySelector('.semi-upload-drag-area-main-text')?.textContent.trim() === '点击上传文件或拖拽文件到这里');
    if (primary.length === 1) candidates = primary;
  }
  // Bilibili's normal button/file-chooser event resolves duplicate video inputs
  // in bilibili-upload.cjs. Geometry alone is not proof of the real uploader.
  if (candidates.length !== 1) throw Error('无法唯一识别官方素材上传入口，正在等待官方编辑器就绪');
  const target = candidates[0];
  if (input.describe) return { matched: true, accept: target.accept, multiple: target.multiple };
  return target;
}

function coverControl(command, input, componentRoots = []) {
  const query = selector => [...new Set([document, ...componentRoots].flatMap(root => [...root.querySelectorAll(selector)]))];
  // Querying closed creator components and hit-testing must use the same tree.
  // An outer document returns the component host, not the inner cover control.
  const hitAt = (x, y) => {
    let hit = document.elementFromPoint(x, y);
    for (let depth = 0; hit && depth < 8; depth++) {
      const root = componentRoots.find(root => root.host === hit) || hit.shadowRoot;
      if (!root) return hit;
      const deeper = root.elementFromPoint?.(x, y);
      if (!deeper || deeper === hit) return null;
      hit = deeper;
    }
    return null;
  };
  const containsHit = (entry, hit) => {
    for (let depth = 0; hit && depth < 8; depth++, hit = hit.getRootNode?.().host) if (entry === hit || entry.contains(hit)) return true;
    return false;
  };
  const visible = el => {
    if (!el?.isConnected || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const r = el.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) return false;
    for (let parent = el; parent; parent = parent.parentElement || parent.getRootNode().host) {
      const s = getComputedStyle(parent);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0' || /animate-hide/.test(parent.className || '')) return false;
    }
    return true;
  };
  const preview = () => {
    if (input.platform === 'xiaohongshu') return query('.cover-plugin-preview .default img').map(el => el.currentSrc || el.src).join('|');
    if (input.platform === 'bilibili') return query('.cover-module-main img:not(.add-icon),.cover-module-main .cover-img').map(el => el.tagName === 'IMG' ? el.currentSrc || el.src : getComputedStyle(el).backgroundImage !== 'none' ? getComputedStyle(el).backgroundImage : '').filter(Boolean).join('|');
    if (input.platform === 'douyin') {
      const tips = query('[class^=cover-tip-]').filter(el => el.textContent.trim() === (input.index === 2 ? '横封面4:3' : '竖封面3:4'));
      const scope = tips.length === 1 ? tips[0].closest('[class^=coverControl-]') || tips[0].parentElement : undefined;
      const covers = scope ? [...scope.querySelectorAll('[class^=cover-]')].filter(el => el !== tips[0] && el.querySelector('img')) : [];
      return covers.length === 1 ? [...covers[0].querySelectorAll('img')].map(el => el.currentSrc || el.src).join('|') : '';
    }
    if (input.platform === 'wechat') return query('.vertical-cover-wrap.img-popover-wrap img').filter(visible).map(el => el.currentSrc || el.src).join('|');
    return query('[class*=cover] img').map(el => el.currentSrc || el.src).join('|');
  };
  const editLabel = el => el && ((el.innerText || el.getAttribute('aria-label') || '').trim() === '编辑' || ['::before','::after'].some(pseudo => ['"编辑"', "'编辑'"].includes(getComputedStyle(el,pseudo).content)));
  if (command === 'open') {
    if (window.__matrixCoverWork?.index === input.index && window.__matrixCoverWork.url === location.href) {
      const existing=window.__matrixCoverWork;
      return {opened:true,...(input.platform==='wechat'&&existing.openPoint&&!existing.openClickSent?{interaction:existing.openPoint}:{})};
    }
    let entry, wechatSurface;
    if (input.platform === 'douyin') {
      const entries = query('[class^=title-]').filter(el => visible(el) && el.textContent.trim() === '选择封面' && el.parentElement?.parentElement?.parentElement?.innerText.includes(input.index === 2 ? '横封面' : '竖封面'));
      if (entries.length === 1) entry = entries[0];
    } else if (input.platform === 'xiaohongshu') {
      const guide = query('.pk-cover-guide-confirm').find(visible);
      if (guide && guide.innerText.trim() === '我知道了') { guide.click(); return { waiting: true }; }
      let entries = query('.cover-edit-entry').filter(visible);
      entries = [...new Set(entries)];
      if (entries.length > 1) throw Error('封面编辑入口不唯一，不会点击其他封面工具');
      if (entries.length === 1) entry = entries[0];
      else {
        const previews = query('.cover-plugin-preview .cover > .default').filter(visible);
        if (previews.length === 1) {
          previews[0].scrollIntoView({ block: 'center', behavior: 'instant' });
          const r = previews[0].getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
          if (!containsHit(previews[0], hitAt(x, y))) throw Error('封面预览被菜单或弹窗遮挡，未点击其他控件');
          return { hover: { x, y } };
        }
      }
    } else if (input.platform === 'bilibili') {
      const entries = query('.cover-module-main .cover-empty-pill').filter(el => visible(el) && el.textContent.trim() === '添加封面');
      if (entries.length > 1) throw Error('B站主封面入口不唯一，未选择推荐或AI封面');
      if (entries.length === 1) entry = entries[0];
    } else if (input.platform === 'wechat') {
      // Observed official vertical cover, not an arbitrary "Edit" anywhere.
      // The real wrapper also contains the sharing-card aspect-ratio tips.
      // Identify its observed unique image area, not equality of the wrapper's
      // aggregate/hover text (the Edit affordance may be CSS-generated).
      const vertical = query('.vertical-cover-wrap.img-popover-wrap').filter(visible);
      if (vertical.length > 1) throw Error('视频号竖封面入口不唯一，未点击其他编辑控件');
      const observed = vertical.flatMap(scope => {
        const images = [...scope.querySelectorAll('img.vertical-img-size.cover-img-vertical')].filter(visible);
        if (images.length !== 1) return [];
        const wrappers = [...scope.querySelectorAll('.vertical-img-wrap')].filter(visible);
        if (wrappers.length > 1 || wrappers.length === 1 && !wrappers[0].contains(images[0])) return [];
        const imageArea = wrappers[0] || images[0];
        wechatSurface = scope;
        const labels = [...scope.querySelectorAll('*')].filter(el => visible(el) && editLabel(el));
        const leaves = labels.filter(el => !labels.some(other => other !== el && el.contains(other)));
        if (leaves.length > 1) throw Error('视频号封面编辑控件不唯一，未点击其他编辑控件');
        // The observed Edit surface can be a sibling overlay of the image area,
        // including CSS-generated text. Click only its unique real label after
        // validating the known cover/image structure, never an unrelated Edit.
        return leaves.length === 1 ? leaves : [imageArea];
      });
      const entries = vertical.length ? observed : query('button,a,[role=button]').filter(el => visible(el) && /^(设置封面|上传封面|更换封面|自定义封面|编辑封面|选择封面)$/.test((el.innerText || el.getAttribute('aria-label') || '').trim()));
      if (entries.length === 1) entry = entries[0];
      if (entries.length > 1) throw Error('封面编辑入口不唯一，不会上传到其他控件');
    }
    if (!entry) return { waiting: true };
    // A valid viewport rectangle can still be behind the official sticky
    // navigation. Bring the exact known entry to the center before hit-testing;
    // never remove an overlay, click through it or change page styles.
    entry.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const rect = entry.getBoundingClientRect();
    const hit = hitAt(rect.x + rect.width / 2, rect.y + rect.height / 2);
    const sameCoverEditLayer = wechatSurface && wechatSurface.contains(hit) && hit?.contains(entry) && editLabel(hit);
    // The unique Edit text can be pointer-transparent over its own known cover
    // image. That is not an unrelated overlay: the event belongs to this same
    // verified surface. Accept only the exact image, never another layer/text
    // (including Delete) or an element outside the known vertical cover.
    const sameCoverImage = wechatSurface && wechatSurface.contains(entry) && wechatSurface.contains(hit)
      && editLabel(entry) && getComputedStyle(entry).pointerEvents === 'none'
      && hit?.matches('img.vertical-img-size.cover-img-vertical');
    if (!containsHit(entry, hit) && !sameCoverEditLayer && !sameCoverImage) {
      const marker = hit?.tagName ? `${hit.tagName}${hit.getAttribute('class') ? '.' + hit.getAttribute('class').replace(/[^a-zA-Z0-9_ -]/g, '').slice(0, 80) : ''}` : '未命中页面元素';
      throw Error(`封面编辑入口被菜单或弹窗遮挡，未点击其他控件（命中：${marker}）`);
    }
    window.__matrixCoverWork = { url: location.href, index: input.index, before: preview(), uploaded: false, confirmClicked: false };
    if(input.platform==='wechat'&&wechatSurface){
      const point={x:rect.x+rect.width/2,y:rect.y+rect.height/2};
      Object.assign(window.__matrixCoverWork,{openPoint:point,openSurface:wechatSurface,openClickSent:false});
      // The visible text can be pointer-transparent. The real mouse event must
      // target the actual hit element, not a synthetic click on that text node.
      return {opened:true,interaction:point};
    }
    entry.click(); return { opened: true };
  }
  const work = window.__matrixCoverWork;
  if (!work || work.index !== input.index || work.url !== location.href) throw Error('封面编辑页面已变化，请重新核对');
  if(command==='check-open'){
    if(input.platform!=='wechat'||!work.openPoint||work.openClickSent)throw Error('封面点击计划已变化，不会重复点击');
    const dialogs=query('.finder-common-dialog.edit-cover-dialog').filter(visible);
    if(dialogs.length>1)throw Error('视频号封面编辑窗口不唯一，未点击其他控件');
    if(dialogs.length===1)return {opened:true};
    const surface=work.openSurface,point=work.openPoint;
    const scopes=query('.vertical-cover-wrap.img-popover-wrap').filter(visible);
    if(!visible(surface)||scopes.length!==1||scopes[0]!==surface)throw Error('封面编辑入口已变化，未点击其他控件');
    const images=[...surface.querySelectorAll('img.vertical-img-size.cover-img-vertical')].filter(visible);
    const hit=hitAt(point.x,point.y),r=surface.getBoundingClientRect();
    if(images.length!==1||point.x<0||point.y<0||point.x>=innerWidth||point.y>=innerHeight||point.x<r.left||point.x>r.right||point.y<r.top||point.y>r.bottom||!surface.contains(hit)||!(hit===images[0]||editLabel(hit)))throw Error('封面编辑入口被菜单或弹窗遮挡，未点击其他控件');
    return {interaction:point};
  }
  if(command==='mark-open-dispatched'){
    if(input.platform!=='wechat'||!work.openPoint||work.openClickSent)throw Error('封面点击计划已变化，不会重复点击');
    work.openClickSent=true;return {marked:true};
  }
  if (command === 'uploaded') { work.uploaded = true; return { uploadStarted: true }; }
  if (command === 'finish') {
    if (!work.uploaded) throw Error('尚未交付封面文件');
    if (input.platform === 'bilibili' && work.confirmClicked) {
      // Saving the requested main cover can require one further official
      // acknowledgement to apply the same image to its 16:9 presentation.
      // Only this exact cover prompt is eligible, never a publish/AI dialog.
      const prompts = query('.videoup-confirm-modal').filter(el => visible(el) &&
        el.querySelector('.modal-header')?.textContent.trim() === '检测到个人空间封面（16:9）未修改' && /4:3封面/.test(el.innerText));
      if (prompts.length > 1) throw Error('B站封面同步确认不唯一，未执行其他操作');
      if (prompts.length === 1) {
        const choices = [...prompts[0].querySelectorAll('.modal-footer span')].filter(el => visible(el) && ['不同步，手动编辑', '确认同步'].includes(el.textContent.trim()));
        if (choices.length !== 2 || new Set(choices.map(el => el.textContent.trim())).size !== 2) throw Error('B站封面同步选项已变化');
        if (!work.dualCoverSyncClicked) {
          const target = choices.find(el => el.textContent.trim() === '确认同步');
          const r = target.getBoundingClientRect();
          if (!containsHit(target, hitAt(r.x + r.width / 2, r.y + r.height / 2))) throw Error('B站封面同步确认被遮挡');
          target.click(); work.dualCoverSyncClicked = true; work.dualCoverSyncNeedsSave = true;
        }
        return { waiting: true };
      }
    }
    if (input.platform === 'douyin' && input.index === 1 && work.confirmClicked) {
      // The role and the dual-cover class may be on different nested nodes.
      // Only skip this optional horizontal-cover prompt after saving cover 1.
      const prompts = query('[role=dialog],[class*=verticalSupoortDualCoverModal],[class*=verticalSupportDualCoverModal]').filter(el => visible(el) && /横封面/.test(el.innerText));
      const optional = [...new Set(prompts.flatMap(el => [...el.querySelectorAll('button,[role=button]')]))].filter(el => visible(el) && el.innerText.trim() === '暂不设置');
      if (optional.length === 1) { optional[0].click(); return { waiting: true }; }
      if (optional.length > 1) throw Error('横封面可选提示不唯一，未点击其他控件');
    }
    const currentPreview = preview();
    const containers = query(input.platform === 'wechat' ? '.finder-common-dialog.edit-cover-dialog' : '[role=dialog],[class*=modal],[class*=Modal],[class*=crop],[class*=Crop],[class*=dialog],[class*=Dialog]' + (input.platform === 'douyin' ? ',[class^=container-]' : '')).filter(el => visible(el) && /封面|裁剪/.test(el.innerText || ''));
    const buttons = [...new Set(containers.flatMap(el => [...el.querySelectorAll('button,[role=button]' + (input.platform === 'bilibili' ? ',.cover-editor-button > .button.submit' : ''))]))].filter(el => visible(el) && /^(确定|确认|完成|保存封面|确认封面|应用)$/.test(el.innerText.trim()));
    const errors = query('[role=alert],[class*=toast],[class*=message-error]').filter(visible).map(el => el.innerText).find(text => /上传失败|封面.*失败|裁剪失败|保存失败|图片.*(?:太小|过大|不支持)|尺寸.*(?:不符合|小于)/.test(text));
    if (errors) throw Error(errors.slice(0, 200));
    // Some Bilibili editors only synchronize the two canvases and keep the
    // designer open. Allow one normal final save after that acknowledgement.
    if (input.platform === 'bilibili' && work.dualCoverSyncNeedsSave && buttons.length === 1) { work.confirmClicked = false; work.dualCoverSyncNeedsSave = false; }
    if (buttons.length === 1 && !work.confirmClicked) { buttons[0].click(); work.confirmClicked = true; work.settledAt = undefined; return { waiting: true }; }
    // Channels' observed cover editor is a class-only panel, not necessarily
    // role=dialog. Its save button can disable before the panel actually closes.
    const editorOpen = query('[role=dialog],[class*=crop],[class*=Crop]' + (input.platform === 'bilibili' ? ',.cover-editor.bcc-dialog__wrap' : input.platform === 'wechat' ? ',.finder-common-dialog.edit-cover-dialog' : '')).some(el => visible(el) && !/animate-hide/.test(el.className || '') && /封面|裁剪/.test(el.innerText || ''));
    // Re-selecting the identical cover can return the same CDN image URL. An
    // explicit crop/save confirmation followed by editor closure is still an
    // official acknowledgement; an image URL change alone is not required.
    // A new preview is not a save acknowledgement. In particular, an entering
    // animation or temporarily disabled crop button must never mean "finished".
    if (!buttons.length && !editorOpen && currentPreview && work.confirmClicked) {
      if (work.settledPreview !== currentPreview) { work.settledPreview = currentPreview; work.settledAt = Date.now(); return { waiting: true }; }
      if (Date.now() - work.settledAt >= 600) { delete window.__matrixCoverWork; return { coverConfirmed: true }; }
    } else { work.settledAt = undefined; work.settledPreview = undefined; }
    return { waiting: true };
  }
  throw Error('封面操作不支持');
}
async function openCoverWithInput({evaluate,send},input,{wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),check=()=>{}}={}){
  let result=await evaluate(coverControl,['open',input]);
  if(result.hover){await send('Input.dispatchMouseEvent',{type:'mouseMoved',...result.hover});await wait(120);check();result=await evaluate(coverControl,['open',input]);}
  if(result.interaction){
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...result.interaction});check();
    const checked=await evaluate(coverControl,['check-open',input]);
    if(checked.interaction){
      await evaluate(coverControl,['mark-open-dispatched',input]);
      await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...checked.interaction});
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...checked.interaction});
    }
    result={opened:true};
  }
  return result;
}
module.exports = { uploadControl, coverControl, openCoverWithInput };
