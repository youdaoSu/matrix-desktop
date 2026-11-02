// Only the rendered official visibility controls. A requested private choice is
// never inferred from a preview, hidden option, checkbox value, or page text.
function publishVisibility(command, input, componentRoots = []) {
  const query = selector => [...new Set([document, ...componentRoots].flatMap(root => [...root.querySelectorAll(selector)]))];
  const visible = el => {
    if (!el?.isConnected || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    if (!(r.width > 0 && r.height > 0) || s.display === 'none' || s.visibility === 'hidden') return false;
    for (let parent = el; parent; parent = parent.parentElement || parent.getRootNode().host) {
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    }
    return true;
  };
  const expected = input.expected;
  const canonical = value => ({ '公开可见': '公开', '所有人可见': '公开', '仅我可见': '仅自己可见', '只给自己看': '仅自己可见' }[String(value || '').trim()] || String(value || '').trim());
  const controlLabel = el => [el.getAttribute('aria-label'),el.name,...[...(el.labels || [])].map(label=>label.innerText),...(el.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>query('[id]').find(node=>node.id===id)?.innerText),el.querySelector('legend')?.innerText].filter(Boolean).join(' ').trim();
  const selects = query('select').filter(el => visible(el) && /可见|权限|visibility/i.test([el.getAttribute('aria-label'), el.name, ...[...(el.labels || [])].map(label => label.innerText)].join(' ')));
  if (selects.length === 1) {
    const select = selects[0];
    if (command === 'select' && expected) {
      const options = [...select.options].filter(option => !option.disabled && option.textContent.trim() === expected);
      if (options.length !== 1) throw Error('官方可见范围选项不存在或不唯一');
      if (select.value !== options[0].value) {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, options[0].value);
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    return { visibility: select.selectedOptions[0]?.textContent.trim() };
  }
  if (selects.length > 1) throw Error('官方可见范围控件不唯一');
  if (input.platform === 'bilibili') {
    const cards = query('.video-setting-card').filter(el => visible(el) && [...el.querySelectorAll('.video-setting-title')].some(title => title.textContent.trim() === '可见范围'));
    if (cards.length > 1) throw Error('B站官方可见范围控件不唯一');
    if (cards.length === 1) {
      const radios = [...cards[0].querySelectorAll('.check-radio-v2-container')].filter(visible);
      const name = el => el.querySelector('.check-radio-v2-name')?.textContent.trim();
      if (radios.length !== 2 || new Set(radios.map(name)).size !== 2 || !radios.every(el => ['公开可见','仅自己可见'].includes(name(el)))) throw Error('B站官方可见范围选项已变化');
      if (command === 'select' && expected) {
        const target = radios.find(el => name(el) === (expected === '公开' ? '公开可见' : expected));
        if (!target || /disabled/.test(target.className) || getComputedStyle(target).pointerEvents === 'none') throw Error('B站官方可见范围选项不可用');
        if (!target.querySelector('.check-radio-v2-box-checked')) {
          target.scrollIntoView({ block: 'center', behavior: 'instant' });
          const r = target.getBoundingClientRect();
          if (!target.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))) throw Error('B站可见范围选项被遮挡');
          target.click();
        }
      }
      const checked = radios.filter(el => el.querySelector('.check-radio-v2-box-checked'));
      return { visibility: checked.length === 1 ? canonical(name(checked[0])) : undefined };
    }
    if (command === 'select' && expected) {
      const toggles = query('.form > .title > .label').filter(el => visible(el) && el.textContent.trim().startsWith('更多设置'));
      if (toggles.length > 1) throw Error('B站更多设置入口不唯一');
      if (toggles.length === 1) {
        const toggle = toggles[0]; toggle.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = toggle.getBoundingClientRect();
        if (!toggle.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))) throw Error('B站更多设置入口被遮挡');
        toggle.click(); return { opened: true };
      }
    }
  }
  const observedMarkup = input.platform === 'douyin' ? query('label[data-checked]').some(el=>visible(el)&&['公开','好友可见','仅自己可见'].includes(el.innerText.trim())) : input.platform === 'xiaohongshu' && query('.permission-card-select').some(visible);
  if (!observedMarkup) {
  // Explicit ARIA controls only. Never infer privacy from unrelated page text.
  const groups = query('[role=radiogroup],fieldset').filter(el=>visible(el)&&/可见范围|谁可以看|作品权限|visibility/i.test(controlLabel(el)));
  if (groups.length > 1) throw Error('官方可见范围单选组不唯一');
  if (groups.length === 1) {
    const group = groups[0];
    const radios = [...group.querySelectorAll('[role=radio],input[type=radio]')].filter(visible);
    const name = radio => canonical(radio.getAttribute('aria-label') || [...(radio.labels||[])].map(label=>label.innerText).join(' ') || radio.innerText);
    const checked = radio => radio.tagName==='INPUT' ? radio.checked : radio.getAttribute('aria-checked')==='true';
    if (command==='select' && expected) {
      const targets = radios.filter(radio=>name(radio)===expected);
      if(targets.length!==1) throw Error('官方可见范围选项不存在或不唯一');
      if(!checked(targets[0])) targets[0].click();
    }
    const chosen = radios.filter(checked);
    return {visibility:chosen.length===1?name(chosen[0]):undefined};
  }
  const combos = query('[role=combobox]').filter(el=>visible(el)&&/可见范围|谁可以看|作品权限|visibility/i.test(controlLabel(el)));
  if(combos.length>1) throw Error('官方可见范围选择框不唯一');
  if(combos.length===1) {
    const combo=combos[0], selected=()=>canonical(combo.getAttribute('aria-valuetext')||combo.value||combo.innerText);
    if(command==='select'&&expected&&selected()!==expected) {
      const listId=combo.getAttribute('aria-controls');
      const lists=query('[role=listbox]').filter(el=>visible(el)&&el.id&&el.id===listId);
      if(lists.length>1) throw Error('官方可见范围菜单不唯一');
      if(!lists.length) { if(combo.getAttribute('aria-expanded')==='true') return {waiting:true,visibility:selected()}; combo.click();return {opened:true,visibility:selected()}; }
      const options=[...lists[0].querySelectorAll('[role=option]')].filter(el=>visible(el)&&canonical(el.innerText)===expected);
      if(options.length!==1) throw Error('官方可见范围菜单选项不存在或不唯一');
      options[0].click();
    }
    return {visibility:selected()};
  }
  }
  if (input.platform === 'douyin') {
    const labels = query('label[data-checked]').filter(el => visible(el) && ['公开', '好友可见', '仅自己可见'].includes(el.innerText.trim()) && el.querySelector('input[type=checkbox],input[type=radio]'));
    if (labels.length !== 3 || new Set(labels.map(el => el.parentElement)).size !== 1) throw Error('未唯一识别抖音的谁可以看选项');
    if (command === 'select' && expected) {
      const target = labels.find(el => el.innerText.trim() === expected);
      if (!target) throw Error('官方可见范围选项不存在');
      if (!target.querySelector('input').checked) target.click();
    }
    const selected = labels.filter(el => el.querySelector('input').checked && el.getAttribute('data-checked') === 'true');
    return { visibility: selected.length === 1 ? selected[0].innerText.trim() : undefined };
  }
  if (input.platform === 'xiaohongshu') {
    const cards = query('.permission-card-select').filter(visible);
    if (cards.length !== 1) throw Error('未唯一识别小红书的可见范围控件');
    const card = cards[0], description = card.querySelector('.d-select-description');
    const aliases = { 公开: '公开可见', 仅自己可见: '仅自己可见', 好友可见: '仅互关好友可见' };
    const targetText = aliases[expected] || expected;
    const selectedText = description?.textContent.trim();
    if (command === 'select' && expected && selectedText !== targetText) {
      const options = query('.custom-option').filter(el => visible(el) && el.querySelector('.name')?.textContent.trim() === targetText);
      if (options.length > 1) throw Error('官方可见范围选项不唯一');
      if (options.length === 1) options[0].click();
      else {
        const trigger = card.querySelector('.d-select-main');
        if (!visible(trigger)) throw Error('官方可见范围菜单不可用');
        trigger.scrollIntoView({ block: 'center' });
        const r = trigger.getBoundingClientRect();
        return { interaction: { x: r.x + r.width / 2, y: r.y + r.height / 2 }, visibility: selectedText };
      }
    }
    const text = description?.textContent.trim();
    // Some versions retain the menu after selecting the current permission.
    // Focus the already filled title through a clear, normal mouse target.
    // Never alter styles, click through the overlay, or choose another option.
    if (command === 'settle' && text === targetText) {
      const options = query('.custom-option').filter(el => visible(el) && el.querySelector('.name')?.textContent.trim() === targetText);
      if (options.length > 1) throw Error('官方可见范围菜单不唯一');
      if (options.length === 1) {
        const titles = query('input.d-text').filter(el => visible(el) && input.expectedTitle && el.value === input.expectedTitle);
        if (titles.length !== 1) throw Error('官方可见范围菜单未收起，未找到可安全聚焦的原作品标题');
        const title = titles[0]; title.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = title.getBoundingClientRect();
        const point = [r.right - 10, r.left + 10, r.left + r.width / 2].map(x => ({ x, y: r.y + r.height / 2 })).find(p => document.elementFromPoint(p.x, p.y) === title);
        if (!point) throw Error('官方可见范围菜单未收起，原作品标题被遮挡');
        return { visibility: expected, interaction: point, interactionKind: 'dismiss-visibility' };
      }
    }
    return { visibility: text === '公开可见' ? '公开' : text === '仅互关好友可见' ? '好友可见' : text };
  }
  throw Error('未识别到可核对的官方可见范围控件');
}
module.exports = { publishVisibility };
