// Visible official-page controls only. No private APIs, credentials or publish clicks.
function publishForm(command, config = {}) {
  const visible = el => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.disabled && !el.readOnly;
  };
  if (command === 'topics') {
    const nodes = [...document.querySelectorAll('[class*=topic] [role=option], [class*=topic] [class*=item], [class*=suggest] [role=option], [class*=tag] [role=option]')].filter(visible);
    return { topics: [...new Set(nodes.map(el => (el.innerText || '').trim().replace(/^#/, '')).filter(text => text && text.length <= 40 && !/创建|添加|搜索|查看更多/.test(text)))].slice(0, 20) };
  }
  if (command === 'progress') {
    const bars = [...document.querySelectorAll('progress,[role=progressbar]')].filter(visible);
    const values = bars.map(el => {
      const raw = el.tagName === 'PROGRESS' ? el.getAttribute('value') : el.getAttribute('aria-valuenow');
      if (raw === null || raw === '') return NaN;
      const min = Number(el.getAttribute('aria-valuemin') || 0), max = Number(el.tagName === 'PROGRESS' ? el.getAttribute('max') || 1 : el.getAttribute('aria-valuemax') || 100);
      return max > min ? (Number(raw) - min) * 100 / (max - min) : NaN;
    }).filter(value => Number.isFinite(value) && value >= 0 && value <= 100);
    const notices = [...document.querySelectorAll('[role=alert],[role=status],[class*=upload]')].filter(visible).map(el => (el.innerText || '').trim()).filter(text => text.length < 300);
    const uploadError = notices.find(text => /上传失败|转码失败|文件格式不支持|文件过大/.test(text));
    const busy = notices.some(text => /上传中|正在上传|正在转码|转码中|处理中/.test(text)) || values.some(value => value < 100);
    const buttons = [...document.querySelectorAll('button,[role=button]')].filter(visible).filter(el => el.getAttribute('aria-disabled') !== 'true' && /^(发布|发表|投稿|立即发布|确认发布|发布笔记)$/.test((el.innerText || '').trim()));
    return { ...(values.length === 1 ? { uploadPercent: Math.round(values[0]) } : {}), ready: !uploadError && !busy && buttons.length === 1, uploadError, submitted: false };
  }
  const controls = [...document.querySelectorAll('input,textarea,[contenteditable=true],select')].filter(el => visible(el) &&
    !/password|one-time-code|username|email|tel|search|hidden|file|checkbox|radio|token|secret|密码|验证码|手机号|邮箱|搜索|身份证|密钥/i.test([el.type, el.name, el.id, el.autocomplete, el.placeholder].join(' ')));
  const label = el => [el.placeholder, el.getAttribute('aria-label'), el.getAttribute('data-placeholder'), el.name,
    ...[...(el.labels || [])].map(item => item.innerText)].filter(Boolean).join(' ');
  const expressions = { title: /标题|title/i, body: /简介|描述|正文|说点什么|分享|description|content/i, tags: /标签|话题|tag/i, category: /分区|分类|category/i, visibility: /可见|权限|visibility/i, originality: /创作类型|原创|转载|original/i };
  const read = el => el.isContentEditable ? el.innerText : el.value;
  const filled = [], unresolved = [];
  const assignments = [];
  const topics = Array.isArray(config.topics) ? config.topics : [];
  const body = [config.body, config.platform === 'bilibili' ? '' : topics.map(tag => '#' + tag).join(' ')].filter(Boolean).join('\n');
  for (const [key, value] of Object.entries({ title: config.title, body, ...(config.platform === 'bilibili' && topics.length ? { tags: topics.join(',') } : {}), ...config.options })) {
    if (!value || !expressions[key]) continue;
    let matches = controls.filter(el => expressions[key].test(label(el)) && !(key === 'body' && /标题|标签|话题/.test(label(el))));
    if (key === 'body' && !matches.length) matches = controls.filter(el => el.isContentEditable && !/标题|标签|话题|搜索/.test(label(el)));
    if (matches.length !== 1) { unresolved.push(`${key}：未唯一识别官方控件`); continue; }
    const el = matches[0];
    if (assignments.some(item => item.el === el)) { unresolved.push(`${key}：控件与其他字段冲突`); continue; }
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
    if (read(el).trim() === value.trim()) filled.push(key); else unresolved.push(`${key}：官方编辑器未接受内容`);
  }
  return { filled, unresolved, topicsAsText: config.platform !== 'bilibili' && topics.length > 0, submitted: false };
}
module.exports = { publishForm };
